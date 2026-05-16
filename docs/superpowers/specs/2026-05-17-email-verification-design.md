# Email Verification (gates trial start + purchase) — Design

**Date:** 2026-05-17
**Status:** Design APPROVED by Jorizcue (all decisions answered). Ready for plan→implementation.

## Decisions (confirmed by the user)

- Existing users → `email_verified = True` (grandfathered in the migration; their current trials/subscriptions untouched).
- Google SSO users → auto-verified (Google already verified the address).
- **The free trial does NOT start until the email is verified.** (Stronger than just gating purchase.)
- Verification link expiry: **7 days**, with a resend.

## Current state (researched)

- `User` (`schemas.py:7-47`) has `password_reset_token`/`password_reset_expires` but **no** `email_verified`. No verification anywhere.
- `register()` (`auth_routes.py:770-893`): creates the user, seeds `UserPreferences` (804-808, after `flush()`), tab access, then **immediately** creates the trial `Subscription` + `UserCircuitAccess` for ALL circuits (821-843), `commit()` at 843, then auto-login JWT (886). A **second parallel trial block** exists for the OAuth/social register path (`auth_routes.py:1269-1289`).
- Checkout (`stripe_routes.py:create_checkout_session`) is gated only by auth — no verification/trial check.
- Email infra: Resend via `email_service.py`; `send_welcome_email` fire-and-forget from register.

## Architecture

### DB (User model + inline migration — no Alembic, mirror `apex_last_position`)

Add to `User`: `email_verified BOOLEAN NOT NULL DEFAULT 0`, `email_verification_token String(255) nullable`, `email_verification_expires DateTime nullable` (same shape as the password-reset pair).

Migration in `backend/app/models/database.py` (the `try: ALTER TABLE ... except: pass` block): add the 3 columns, then **grandfather**: `UPDATE users SET email_verified = 1` (every pre-existing user becomes verified so nobody is locked out and existing trials/subs are unaffected). New rows default `0`.

### Registration flow change (the core of "trial doesn't start until verified")

`register()` (manual signup, `auth_routes.py:770-893`):
1. Create `User` with `email_verified=False`, `email_verification_token=secrets.token_urlsafe(48)`, `email_verification_expires=now+7d`.
2. Keep the `UserPreferences` seed (804-808) and tab access.
3. **Remove the trial `Subscription` + all-circuits `UserCircuitAccess` block (821-843) from `register()`** and extract it into a shared helper `start_trial(user, db)` (idempotent: no-op if the user already has any subscription). It is NOT called at registration anymore.
4. Send a **new** `send_verification_email(email, username, token)` (link `{frontend_url}/verify-email?token=…`, subject "Verifica tu cuenta - BoxBoxNow", button "Verificar mi cuenta", "el enlace caduca en 7 días"). Do NOT send the trial welcome email here.
5. Auto-login still issues the JWT/device session (so the user can land on a "verify your email" screen and resend), but the account has no trial/subscription yet.

OAuth/social register path (`auth_routes.py:1269-1289`): set `email_verified=True` and call `start_trial(user, db)` immediately (Google verified the email → trial starts now, no email step). This is why trial creation must be a shared helper.

### Endpoints (`auth_routes.py`)

- `POST /api/auth/verify-email` body `{token}`:
  - Look up user by `email_verification_token`. Invalid → 400 "Enlace inválido o expirado". Expired (`email_verification_expires` < now, with the **naive/aware UTC normalization** pattern from `auth_routes.py:610-611` — do NOT reintroduce the reset-password 500 bug) → 400 same message (offer resend client-side).
  - If already `email_verified` → return `{ok:True, alreadyVerified:True}` (idempotent; do NOT create a second trial).
  - Else: `email_verified=True`, clear token/expires, `start_trial(user, db)` (creates the trial sub + circuit access — see Circuit-flags spec for *which* circuits), then send the existing trial welcome email (`send_welcome_email`) since the trial now actually begins. `commit()`.
- `POST /api/auth/resend-verification`: rate-limited (reuse the `forgot_password_limiter` pattern, per-IP). Accept either the authenticated user or `{email}` (anti-enumeration: always generic success, like `forgot_password`). If an unverified user exists: regenerate token + 7d expiry, resend `send_verification_email`. Verified/unknown → generic success, no email.

### Purchase + feature gating

- Block `POST /api/stripe/create-checkout-session` when `not user.email_verified` and not (`user.is_admin or user.is_internal`) → `403` with a stable code (e.g. `{"detail":"email_not_verified"}`) the frontend maps to a "verifica tu correo para comprar" UI + resend button.
- Existing `require_active_subscription` already gates paid data routes; since an unverified user has **no trial/subscription**, paid features are naturally blocked until they verify (no extra change needed there). Admin/`is_internal` unaffected (grandfathered verified + bypass).

### Frontend

- New page `frontend/src/app/verify-email/page.tsx`: reads `?token`, calls `POST /api/auth/verify-email`, states: success ("¡Cuenta verificada! Tu prueba ha comenzado" → CTA to dashboard), invalid/expired (with a "reenviar enlace" button → `resend-verification`), loading.
- Post-register screen: instead of dropping the new (unverified) user straight into the app, show "Te hemos enviado un correo para verificar tu cuenta. Verifícala para empezar tu prueba gratuita." + resend button. (Reuse the existing auth/layout styling.)
- A lightweight "email no verificado" banner/gate for logged-in unverified users (they have a JWT but no trial): prompts verification + resend; the purchase CTA shows the verify message instead of Stripe.
- i18n: add keys for the new copy across the 5 locales (es/en/it/de/fr), mirroring existing auth strings.

### Email (`email_service.py`)

- New `send_verification_email` (Spanish, correctly accented per the recent accent pass: "Verifica tu cuenta", "Verificar mi cuenta", "El enlace caduca en 7 días").
- `send_welcome_email` is now sent on **verify success** (the trial starts there), not at registration.

## Coupling with the Circuit availability/Beta spec

`start_trial()` and the non-per-circuit "grant all circuits" path must grant only **for-sale** circuits (see `2026-05-17-circuit-availability-beta-design.md`). The two features both edit the trial/circuit-grant code (`auth_routes.py` trial block ×2 + `stripe_routes.py:_grant_all_circuits_access`); implement them in one coordinated effort (shared `start_trial` helper that already filters `Circuit.for_sale == True`).

## Backwards compatibility / risks

- Grandfather UPDATE → zero impact on the existing user base (all verified; trials/subs as-is).
- New users: must verify before trial/purchase — intended.
- Idempotent verify + `start_trial` no-op-if-subscribed → safe against double clicks / re-verify.
- Reuse the UTC-normalization expiry pattern (don't repeat the reset-password naive/aware 500).

## Testing (pytest)

- Migration grandfathers existing users (verified=True) and new users default False.
- register(): creates user `email_verified=False`, **no** trial sub / circuit access, verification email attempted, token+expiry set.
- verify-email: invalid/expired/already-verified/success (success creates exactly one trial + circuit access, sets verified, welcome email). Naive expiry datetime does not 500 (regression guard).
- resend-verification: rate-limited, anti-enumeration generic success, regenerates token.
- OAuth register: verified=True + trial started immediately (no email step).
- checkout: unverified → 403 `email_not_verified`; verified/admin/internal → proceeds.
- Frontend: tsc + build green; verify-email page states.

## Scope / non-goals

One coordinated implementation plan (with the circuit-flags spec). Non-goals: changing password-reset; SMS/2FA; verifying already-grandfathered users; blocking login (unverified users CAN log in to reach the verify/resend UI — only trial start and purchase are gated).
