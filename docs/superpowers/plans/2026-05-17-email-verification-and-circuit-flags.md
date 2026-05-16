# Email Verification + Circuit Available/Beta Flags — Coordinated Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` steps. TDD for backend (pytest via `backend/.venv/bin/python -m pytest tests -q`; asyncio_mode=auto; shared async fixture `db_session` in `backend/tests/ranking/conftest.py`). Frontend gated by `npx tsc --noEmit` + `npm run build`. NO deploy from this work; commit per task, push at end.

**Specs:** `docs/superpowers/specs/2026-05-17-email-verification-design.md`, `docs/superpowers/specs/2026-05-17-circuit-availability-beta-design.md`. Read both. The two features couple at the trial/circuit-grant seam → built coordinated; order below respects dependencies.

**Migrations:** no Alembic — inline idempotent `try: await conn.execute(text("ALTER TABLE … ADD COLUMN …")) except Exception: pass` in `backend/app/models/database.py` (mirror the existing `ALTER TABLE circuits ADD COLUMN warmup_laps_to_skip` block). New tables via `Base.metadata.create_all` (already called). Grandfather via an `UPDATE` after the ALTERs.

---

## Task 1 — Circuit `for_sale`/`is_beta`: model, migration, admin API, purchase list (backend, TDD)

**Files:** `backend/app/models/schemas.py`, `backend/app/models/database.py`, `backend/app/models/pydantic_models.py`, `backend/app/api/stripe_routes.py`; tests `backend/tests/test_circuit_flags.py`.

- [ ] **Step 1 — failing tests** `backend/tests/test_circuit_flags.py` (use `db_session`): (a) `Circuit` accepts `for_sale`/`is_beta`; a circuit created without them defaults `for_sale=True`,`is_beta=False`; (b) build `list_circuits_for_checkout` result (call the endpoint function directly with the in-memory session + a stub user with no access): a `for_sale=False` circuit is absent; a `for_sale=True, is_beta=True` circuit is present with `is_beta: true` in the dict; (c) `CircuitOut.model_validate` round-trips the two fields. Run → FAIL.
- [ ] **Step 2 — model**: in `schemas.py` `Circuit`, add `for_sale = Column(Boolean, nullable=False, default=True, server_default="1")` and `is_beta = Column(Boolean, nullable=False, default=False, server_default="0")` (match the Boolean import already used in the file).
- [ ] **Step 3 — migration**: in `database.py`, in the inline-migration block alongside the other `ALTER TABLE circuits ADD COLUMN …`, add (idempotent try/except each):
  `ALTER TABLE circuits ADD COLUMN for_sale BOOLEAN NOT NULL DEFAULT 1`
  `ALTER TABLE circuits ADD COLUMN is_beta BOOLEAN NOT NULL DEFAULT 0`
  (SQLite backfills existing rows from DEFAULT → grandfather: all current circuits for_sale=1, is_beta=0. No extra UPDATE needed.)
- [ ] **Step 4 — pydantic** (`pydantic_models.py`): add `for_sale: bool = True` and `is_beta: bool = False` to `CircuitCreate`; `for_sale: Optional[bool] = None` and `is_beta: Optional[bool] = None` to `CircuitUpdate`; `for_sale: bool` and `is_beta: bool` to `CircuitOut`. (Admin POST/PATCH use `model_dump`/`model_dump(exclude_unset=True)` → no route change.)
- [ ] **Step 5 — purchase list** (`stripe_routes.py:152-182` `list_circuits_for_checkout`): change `select(Circuit).order_by(Circuit.name)` → `select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name)`; change the returned dict to `{"id": c.id, "name": c.name, "is_beta": c.is_beta}` (keep the existing already-owned exclusion).
- [ ] **Step 6** — run tests → green; full `pytest tests -q` → all green (no regression). 
- [ ] **Step 7 — commit**: `git add backend/app/models/schemas.py backend/app/models/database.py backend/app/models/pydantic_models.py backend/app/api/stripe_routes.py backend/tests/test_circuit_flags.py && git commit -m "feat(circuits): for_sale/is_beta flags + checkout list filter (grandfather all sellable)"`

## Task 2 — Email-verify DB + grandfather + `start_trial()` extraction (backend, TDD)

**Files:** `backend/app/models/schemas.py`, `backend/app/models/database.py`, `backend/app/api/auth_routes.py`; tests `backend/tests/test_start_trial_and_register_no_trial.py`.

- [ ] **Step 1 — failing tests**: (a) after `register()` (call it with an in-memory session; stub `asyncio.create_task`, `link_visitor_to_user`, `record_event`, and the email send — mirror the pattern in `backend/tests/test_register_user_preferences.py`), the user has `email_verified=False`, a non-null `email_verification_token`, `email_verification_expires≈now+7d`, and **no** `Subscription` row and **no** `UserCircuitAccess` rows; (b) `start_trial(user, db)` creates exactly one `plan_type="trial"` sub + `UserCircuitAccess` only for `for_sale=True` circuits (seed 2 circuits, one `for_sale=False` → not granted); (c) `start_trial` is idempotent (second call with an existing subscription is a no-op). Run → FAIL.
- [ ] **Step 2 — model**: `User` += `email_verified = Column(Boolean, nullable=False, default=False, server_default="0")`, `email_verification_token = Column(String(255), nullable=True)`, `email_verification_expires = Column(DateTime, nullable=True)`.
- [ ] **Step 3 — migration + grandfather** (`database.py`): idempotent ALTERs adding the 3 columns to `users`; then (also idempotent/safe to re-run) `UPDATE users SET email_verified = 1 WHERE email_verified = 0 OR email_verified IS NULL` so every pre-existing user is verified. (Order: ALTERs before the create_all per the existing file rule; the UPDATE after the ALTERs.)
- [ ] **Step 4 — `start_trial()` helper** in `auth_routes.py` (module-level async): extract the trial block currently at ~821-843. Signature `async def start_trial(user, db, *, trial_days: int) -> None`. Body: if the user already has any `Subscription` → return (idempotent). Else create the `Subscription(plan_type="trial", status="trialing", current_period_start=now, current_period_end=now+trial_days)` and one `UserCircuitAccess(valid_from=now, valid_until=trial_end)` per circuit from `select(Circuit).where(Circuit.for_sale == True)` (NOT all circuits). Do NOT commit inside (caller commits).
- [ ] **Step 5 — register() change** (`auth_routes.py:770-893`): set `email_verified=False`, `email_verification_token=secrets.token_urlsafe(48)`, `email_verification_expires=datetime.now(timezone.utc)+timedelta(days=trial_days_irrelevant→7)` (7-day constant `EMAIL_VERIFICATION_TTL = timedelta(days=7)`). REMOVE the inline trial block (821-843) — do NOT call `start_trial` here. Keep the `UserPreferences` seed (804-808) and tab access. Keep `await db.commit()`. (Verification email send wired in Task 3 — for now leave a `# TODO Task 3: send_verification_email` placeholder ONLY as a code comment, not user-facing; Task 3 replaces it.)
- [ ] **Step 6 — OAuth/social register path** (`auth_routes.py:1269-1289`): set `email_verified=True` and replace its inline trial block with `await start_trial(user, db, trial_days=trial_days)` (Google verified → trial starts immediately).
- [ ] **Step 7** — tests green; full suite green (the existing `test_register_user_preferences.py` must still pass — register still seeds prefs; if a prior test asserted a trial sub at register, update it to reflect the new "no trial until verify" contract and document why).
- [ ] **Step 8 — commit**: `git add backend/app/models/schemas.py backend/app/models/database.py backend/app/api/auth_routes.py backend/tests/test_start_trial_and_register_no_trial.py && git commit -m "feat(auth): email_verified columns (+grandfather); extract start_trial() (for_sale circuits only); register no longer starts trial"`

## Task 3 — verify-email / resend endpoints + email + checkout gate (backend, TDD)

**Files:** `backend/app/api/auth_routes.py`, `backend/app/services/email_service.py`, `backend/app/api/stripe_routes.py`; tests `backend/tests/test_email_verification_flow.py`.

- [ ] **Step 1 — failing tests**: `verify_email` with: invalid token → 400; expired token where `email_verification_expires` is a **naive** datetime → must NOT 500 (regression guard; use the UTC-normalize pattern from `auth_routes.py:610-611`) and returns 400; valid → `email_verified=True`, token cleared, exactly one trial sub created (via `start_trial`), `send_welcome_email` attempted; already-verified → `{ok:True}` and NO second trial. `resend_verification`: unknown/verified email → generic success no email; unverified → new token+expiry, email attempted; rate-limited. `create_checkout_session`: unverified non-admin → 403 `email_not_verified`; verified (or admin/internal) → not blocked by this check. Run → FAIL.
- [ ] **Step 2 — endpoints** (`auth_routes.py`):
  - `POST /api/auth/verify-email` `{token}`: select user by `email_verification_token`; not found → `HTTPException(400,"Enlace inválido o expirado")`; compute `exp=user.email_verification_expires`; `if exp and exp.tzinfo is None: exp=exp.replace(tzinfo=timezone.utc)`; if `exp and exp < datetime.now(timezone.utc)` → 400 same msg; if `user.email_verified` → return `{"ok":True,"alreadyVerified":True}`; else set `email_verified=True`, `email_verification_token=None`, `email_verification_expires=None`, `await start_trial(user, db, trial_days=<registration trial_days>)`, `await db.commit()`, fire-and-forget `send_welcome_email`, return `{"ok":True}`. (Read `_get_registration_config`/how `trial_days` is resolved in `register()` and reuse it.)
  - `POST /api/auth/resend-verification` `{email}`: rate-limit with the existing `forgot_password_limiter` pattern (per-IP, `record_failure` each call); look up user by lowercased email; if found AND not verified → regenerate `email_verification_token`+`expires=now+7d`, commit, fire-and-forget `send_verification_email`; ALWAYS return generic `{"ok":True}` (anti-enumeration, mirror `forgot_password`).
- [ ] **Step 3 — email** (`email_service.py`): add `async def send_verification_email(to_email, username, token)` mirroring `send_password_reset_email` structure: link `{settings.frontend_url}/verify-email?token={token}`, subject "Verifica tu cuenta - BoxBoxNow", H2 "Verifica tu cuenta", button "Verificar mi cuenta", line "El enlace caduca en 7 días.", correctly accented Spanish, same try/except + Resend send. Wire `register()` (Task 2 Step 5 placeholder) to fire-and-forget `send_verification_email(email, username, token)`.
- [ ] **Step 4 — checkout gate** (`stripe_routes.py:create_checkout_session`, ~185): immediately after the `get_current_user` dependency resolves `user`, add: `if not user.email_verified and not (user.is_admin or user.is_internal): raise HTTPException(status_code=403, detail="email_not_verified")`. (Place before any Stripe work.)
- [ ] **Step 5** — tests green; full `pytest tests -q` green.
- [ ] **Step 6 — commit**: `git add backend/app/api/auth_routes.py backend/app/services/email_service.py backend/app/api/stripe_routes.py backend/tests/test_email_verification_flow.py && git commit -m "feat(auth): verify-email + resend endpoints, verification email, checkout gate (email_not_verified)"`

## Task 4 — Admin circuit checkboxes (frontend)

**Files:** `frontend/src/components/admin/AdminPanel.tsx`, `frontend/src/lib/api.ts` (types only).

- [ ] **Step 1**: read `CircuitsManager`/`CircuitForm` (~1097-1226) + `api.ts` circuit types. Add `for_sale` (default `true`) and `is_beta` (default `false`) to the `CircuitForm` interface, `emptyForm`, `formToPayload()`, and the create/update payload types in `api.ts` (`getAllCircuits`/`createCircuit`/`updateCircuit`).
- [ ] **Step 2**: add two checkboxes to the circuit editor form ("Disponible para venta" — default checked; "Beta" — default unchecked), mirroring the markup/handlers of an existing boolean field in `CircuitForm`. Ensure edit-existing loads the values from the fetched circuit.
- [ ] **Step 3 — verify**: `cd frontend && npx tsc --noEmit` + `npm run build` green.
- [ ] **Step 4 — commit**: `git add frontend/src/components/admin/AdminPanel.tsx frontend/src/lib/api.ts && git commit -m "feat(admin): circuit Disponible-para-venta + Beta checkboxes"`

## Task 5 — CircuitSelector "Sin verificar" badge (frontend)

**Files:** `frontend/src/components/checkout/CircuitSelector.tsx`, `frontend/src/lib/api.ts` (type of `getCheckoutCircuits`).

- [ ] **Step 1**: extend the `getCheckoutCircuits` return type in `api.ts` to include `is_beta: boolean`. In `CircuitSelector.tsx`, where each circuit name renders, add — when `circuit.is_beta` — a small badge "Sin verificar" next to the name (reuse an existing badge/pill style in that component or a minimal Tailwind chip consistent with the file).
- [ ] **Step 2 — verify**: tsc + build green.
- [ ] **Step 3 — commit**: `git add frontend/src/components/checkout/CircuitSelector.tsx frontend/src/lib/api.ts && git commit -m "feat(checkout): 'Sin verificar' badge for Beta circuits"`

## Task 6 — verify-email page + post-register screen + unverified gate + i18n (frontend)

**Files:** new `frontend/src/app/verify-email/page.tsx`; the register page/flow (`frontend/src/app/register/page.tsx`); a shared "email no verificado" prompt where the purchase CTA lives; `frontend/src/lib/i18n.ts`; `frontend/src/lib/api.ts` (verify/resend helpers).

- [ ] **Step 1**: `api.ts` add `verifyEmail(token)` → `POST /api/auth/verify-email`, `resendVerification(email)` → `POST /api/auth/resend-verification`.
- [ ] **Step 2**: `verify-email/page.tsx`: read `?token` (use the existing client-page pattern, e.g. like `reset-password/page.tsx`), call `verifyEmail`; states: loading, success ("¡Cuenta verificada! Tu prueba ha comenzado" + CTA to dashboard/login), invalid/expired (message + "Reenviar enlace" → `resendVerification`). Mirror `reset-password/page.tsx` styling.
- [ ] **Step 3**: after successful `register()`, instead of routing the (now unverified, trial-less) user into the app, show a "Verifica tu correo para empezar tu prueba" screen with a resend button (read the current post-register navigation in `register/page.tsx` and branch it). Also add a concise unverified-state message on the purchase CTA: when checkout returns 403 `email_not_verified`, show "Verifica tu correo para comprar" + resend (find where `create-checkout-session` is called in the frontend and handle that 403).
- [ ] **Step 4 — i18n**: add keys for all new copy in `i18n.ts` across `es/en/it/de/fr` (mirror existing auth keys).
- [ ] **Step 5 — verify**: tsc + build green.
- [ ] **Step 6 — commit**: `git add frontend/src/app/verify-email frontend/src/app/register/page.tsx frontend/src/lib/i18n.ts frontend/src/lib/api.ts <purchase-CTA file> && git commit -m "feat(web): verify-email page + post-register verify screen + email_not_verified handling + i18n"`

## Task 7 — Acceptance + full gates

- [ ] **Step 1 — integration test** `backend/tests/test_register_verify_trial_integration.py` (in-memory session): register (2 circuits seeded, one `for_sale=False`) → assert no sub/access + token set → call `verify_email` with the token → assert `email_verified=True`, exactly one trial sub, `UserCircuitAccess` ONLY for the `for_sale=True` circuit, idempotent on re-verify. Plus: unverified user → `create_checkout_session` 403; OAuth-register path → verified + trial immediately.
- [ ] **Step 2**: full `cd backend && .venv/bin/python -m pytest tests -q` green; `cd frontend && npx tsc --noEmit && npm run build` green.
- [ ] **Step 3 — commit**: `git add backend/tests/test_register_verify_trial_integration.py && git commit -m "test: register→verify→trial (for_sale circuits) + checkout gate acceptance"`

---

## Self-Review

- **Spec coverage:** email-verify DB+grandfather (T2), start_trial extraction + for_sale grant (T2/T1), register no-trial (T2), OAuth verified+trial (T2), verify/resend endpoints + UTC-normalized expiry (T3), verification email (T3), checkout 403 gate (T3), frontend verify page + post-register + gate + i18n (T6); circuit flags model/migration/admin/list/badge (T1/T4/T5); coupling resolved via shared `start_trial()` filtering `for_sale` (T2). Acceptance (T7).
- **Placeholders:** none — exact files, columns, endpoints, code snippets, commands. The only intentional transient is the Task 2→3 register email comment, explicitly replaced in T3.
- **Coupling/order:** T1 (for_sale exists) → T2 (`start_trial` filters for_sale; register stops trial) → T3 (verify triggers start_trial + gate) → FE T4/T5/T6 → T7. No task uses a symbol before it exists.
- **Regression safety:** grandfather (existing users verified; existing circuits for_sale) → live behavior unchanged until admin acts / new signups; reuse UTC-normalize to avoid the prior reset-password 500.

## Execution

superpowers:subagent-driven-development on `main`, TDD per backend task, spec-compliance + code-quality review for the auth-sensitive tasks (T2, T3) and circuit list (T1); frontend gated by tsc+build. Commit per task; push at end. Deploy ONLY when the user says.
