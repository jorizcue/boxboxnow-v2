# Admin-configurable Google auth toggle (web) — Design

**Date:** 2026-05-17 · **Status:** approved (UI + backend; via `/api/public/site-status`; default OFF). No DB migration (KV `app_settings`).

## Goal
Replace the hardcoded `GOOGLE_AUTH_ENABLED = false` consts in `login`/`register` with a platform setting `google_auth_enabled` editable from Admin → Plataforma. When OFF: the web Google button is hidden AND the web Google OAuth backend route is closed. Native iOS/iPad Google sign-in is unaffected. Default OFF (fail-safe; matches current state).

## Setting
- `app_settings` key `google_auth_enabled`, value `"true"`/`"false"` (string convention, like `site_maintenance`). Missing/unset ⇒ treated as `false`. No migration (generic KV table).

## Backend
1. **`/api/public/site-status`** (`public_routes.py:19`): extend `keys` → `("site_launch_at","site_maintenance","google_auth_enabled")`; add to the returned JSON `"google_auth_enabled": (rows.get("google_auth_enabled") or "false").lower() == "true"` (mirrors the `maintenance` line; default false).
2. **Admin batch settings** (`admin_routes.py`): add `"google_auth_enabled"` to `PLATFORM_SETTINGS_KEYS` and `PLATFORM_DEFAULTS["google_auth_enabled"] = "false"` so the existing `GET/PUT /api/admin/platform-settings` read & persist it (no new endpoint).
3. **Guard the WEB Google OAuth start route** `@router.get("/google")` `google_login` (`auth_routes.py:1134`): at the top, if the setting is not enabled, behave like the existing "not configured" guard — `raise HTTPException(403, "Google login deshabilitado")` (mirror the style of `if not settings.google_client_id: raise HTTPException(501, …)` at ~1147). Read via the existing `_get_platform_setting(db, "google_auth_enabled")` helper → `.lower() == "true"` (add `db: AsyncSession = Depends(get_db)` to `google_login` if it doesn't already have a session — it currently has none; inject `get_db`). Also defensively guard `@router.get("/google/callback")` `google_callback` (`auth_routes.py:1189`, already has `db`) the same way so a stale in-flight flow can't complete when disabled. **Do NOT touch** the native routes `/google/ios` (1436), `/google/callback/ios` (1459), `/google/ipad` (1531), `/google/callback/ipad` (1553).

## Frontend
4. `api.ts` `getSiteStatus()` (125-133): add `google_auth_enabled: boolean` to the response type.
5. `useSiteStatus.ts`: add `googleAuthEnabled: boolean` to the store state (default `false`), map it from the response in `refresh()`, set `false` in the fail-open/network-error branch, and return it from the hook.
6. `login/page.tsx` (34-35) & `register/page.tsx` (61-62): remove `const GOOGLE_AUTH_ENABLED = false;`. `register` already calls `useSiteStatus()` → destructure `googleAuthEnabled`. `login` → add `import { useSiteStatus } from "@/hooks/useSiteStatus";` + `const { googleAuthEnabled } = useSiteStatus();`. Use `googleAuthEnabled` in the existing `… && !isWebView && (…)` JSX guards (login lines ~327/351, register ~306/329) in place of the old const. Default-hidden preserved (hook defaults false, fails open to false).
7. Admin UI `PlatformSettingsManager` (`AdminPanel.tsx`, the `openSections.site` "Estado del sitio" block, after the `site_maintenance` toggle ~line 1918): add a checkbox toggle mirroring the `site_maintenance` markup exactly — label "Mostrar acceso con Google (web)", helper text ("Si está desactivado, el botón de Google se oculta en login/registro y la ruta OAuth web queda cerrada. No afecta a las apps móviles."), `checked={(settings.google_auth_enabled || "false") === "true"}`, `onChange → handleChange("google_auth_enabled", checked ? "true":"false")`. Saved by the existing `handleSave()` (sends whole dict via `updatePlatformSettings`).

## Testing
- Backend (pytest, `db_session`): `/api/public/site-status` returns `google_auth_enabled=false` when key absent; `true` when `app_settings` row = "true". `google_login` (`GET /api/auth/google`) returns 403 when disabled (absent/"false"), proceeds (redirect/501-if-no-clientid) when "true". Native `/google/ios` etc. unaffected by the flag. Admin `GET/PUT /api/admin/platform-settings` round-trips `google_auth_enabled`.
- Frontend: `tsc` + `npm run build` green. Default state (no/failed fetch) ⇒ Google hidden (regression-safe vs current). Admin toggle persists and flips the public flag.

## Scope / non-goals
KV setting + 1 line in site-status + 2 admin-list entries + route guard + hook field + 2 page edits + 1 admin toggle. No migration. Non-goals: native mobile Google, removing OAuth code, other auth providers. Default OFF so behavior is identical to today until an admin enables it.
