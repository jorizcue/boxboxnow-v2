# Register creates no session + Verify-email auto-login (A+B) — Design

**Date:** 2026-05-17 · **Status:** approved (A+B). Auth-sensitive. No DB migration.

## Bug (confirmed in code)
After the email-verification rework the **frontend** register page stopped calling `setAuth`, but **`register()` (auth_routes.py ~876-886) still creates a `DeviceSession` + token** ("Auto-login: create device session") and returns `LoginResponse`. That session is now a **phantom**: never used client-side, but it occupies the user's single device slot (`max_devices`=1 on trial). `verify_email` does NOT create a session. So the user's first real `/login` (any browser) hits **409 "Límite de dispositivos (1/1)"** against the phantom. Reproduces single-browser too; cross-browser just makes it obvious.

## Fix
- **A — `register()` creates NO session/token.** Remove the DeviceSession + `session_token` + JWT block; stop returning `LoginResponse`. Registration authenticates nobody (consistent with the verify-first model: trial/login happen after verification).
- **B — `verify_email()` logs the user in (in the verifying browser).** On the fresh-verify success path, mint a DeviceSession + JWT for *this request*, return the auth payload so `/verify-email` can `setAuth` + redirect to `/dashboard`. The user ends with exactly **one** session (the one created at verify).

## Backend (`backend/app/api/auth_routes.py`)

### A. `register()` (`@router.post("/register", response_model=LoginResponse)`, ~809)
- Delete the block: `_extract_device_info` / `_extract_app_version_info` / `session_token = secrets.token_hex(32)` / `DeviceSession(...)` / `db.add(device_session)` (~876-886) and the final `return LoginResponse(...)` (~930).
- **Keep**: user creation (email_verified=False + token + 7d expires), `UserPreferences` seed, tab access, `user.max_devices` set, the analytics `link_visitor_to_user` + `record_event("register.completed")` (still valid — keep `app_platform`/version extraction only if those calls need it; they do — keep `_extract_app_version_info` call but not the DeviceSession), `await db.commit()`, and the fire-and-forget `send_verification_email` (Task 3).
- **Change the response**: remove `response_model=LoginResponse` from the decorator (or set a tiny `{"ok": true}`); return `{"ok": True}` with 200. (FastAPI would 500 trying to coerce `{ok:true}` into `LoginResponse` if the decorator keeps it — must change/remove it.) The web register page already does `if(!res.ok){…} else { await res.json().catch(()=>null); setRegisteredEmail(email) }` → unaffected by the new shape.
- **Verify (flag, not assume):** grep for callers of `POST /api/auth/register`. The web is verify-first (handled). If any **native** client (iOS `BoxBoxNow/`, Android `android/`) calls `/api/auth/register` and relies on the `LoginResponse` token to auto-login, that assumption was *already* broken by the verify-first rework (unverified, no trial) — note it in the report; do NOT expand scope to fix native here, just surface it.

### B. `verify_email()` (~1890-1945)
- Unchanged: invalid/expired (UTC-normalized) → 400; `alreadyVerified` → return `{ok:True, alreadyVerified:True}` (NO session — replayed link; user logs in normally, which is now clean since no phantom).
- Fresh-verify success path (after `email_verified=True`, clear token/expires, `await start_trial(...)`, `await db.commit()`, fire `send_welcome_email`): **mint the session** mirroring the exact mechanism the old `register()` block / `login()` use — `device_name, ip_address = _extract_device_info(request)`, `app_platform, app_version = _extract_app_version_info(request)`, `session_token = secrets.token_hex(32)`, `DeviceSession(session_token=…, user_id=user.id, device_name=…, ip_address=…, app_platform=…, app_version=…)`, `db.add(...)`, mint the JWT the same way `login` does (same `create_access_token`/token-embedding call — read `login`'s return path and replicate exactly; **do not refactor `login`**), `await db.commit()`. Create the session **unconditionally** — by construction this is the user's first session (A guarantees `register()` made none), so no `max_devices`/409 check is needed or wanted here.
- Return `{"ok": True, "access_token": <jwt>, "session_token": <session_token>, "user": <same UserOut shape login returns>}`. (If `login` returns `LoginResponse`, return that shape from verify on the fresh path; keep the `alreadyVerified` branch as the plain `{ok, alreadyVerified}` dict — endpoint return type stays a plain dict / `response_model=None`.)
- DRY note: prefer extracting a small private helper `async def _issue_device_session(user, request, db) -> tuple[str,str]` (returns access_token, session_token) used by `verify_email`; **only** reuse it in `register`-removed/`login` if it's a zero-risk drop-in — otherwise leave `login` untouched and just mirror the pattern. Minimizing blast radius on the working `login` path takes priority over DRY.

## Frontend
- `frontend/src/lib/api.ts` `verifyEmail`: extend return type to `{ ok: boolean; alreadyVerified?: boolean; access_token?: string; session_token?: string; user?: any }`.
- `frontend/src/app/verify-email/page.tsx`: on success, if `access_token` present → `setAuth(access_token, session_token, user)` (via `useAuth`) then `router.push("/dashboard")` (mirror how `login/page.tsx` oauth-exchange does setAuth+redirect). If `alreadyVerified` (no token) → current behavior (success message + "Ir al login"). Loading/invalid/expired states unchanged.
- `register/page.tsx`: no change (already ignores the response body and shows the verify screen). Confirm a 200 `{ok:true}` still hits its success branch (it checks `res.ok`).

## Testing (backend pytest, `db_session`; mirror existing email-verification tests)
- `register()`: user created `email_verified=False`; **zero `DeviceSession` rows** for the user; response 200 with **no** `access_token`/`session_token`; analytics calls don't error; verification email attempted; no trial/subscription yet.
- `verify_email` fresh: sets verified, clears token, exactly **one** trial sub + for_sale circuit access (unchanged from prior tests), **exactly one `DeviceSession`** created, response includes valid `access_token` + `session_token` + `user`.
- `verify_email` alreadyVerified: `{ok, alreadyVerified}`, **no** new DeviceSession, no 2nd trial.
- Regression: full backend suite green; the prior register→verify→trial integration test updated to the new contract (register returns no token; verify returns a session) — adjust only assertions tied to the OLD register-returns-LoginResponse behavior, and document.
- Frontend: `tsc` + `npm run build` green.

## Scope / non-goals
auth_routes.py (`register`, `verify_email`) + `api.ts` + `verify-email/page.tsx` + tests. No migration. **Do not modify `login`** (or its device-limit logic) or the Google/native register/callback paths. Not addressing native email-registration (flag only). Default behavior otherwise unchanged.
