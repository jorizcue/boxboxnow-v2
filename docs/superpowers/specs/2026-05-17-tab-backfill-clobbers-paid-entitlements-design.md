# Startup tab-backfill clobbers paid-plan entitlements — Design

**Date:** 2026-05-17 · **Status:** approved. Payment-critical. No DB migration. No prod data correction.

## Bug (confirmed in code + prod data)
`init_db()` (`backend/app/models/database.py:242-268`) runs on **every backend startup** (every deploy/restart). It contains two legacy "grandfather" backfills that re-grant tabs to **every** user, unconditionally, forever:

1. `basic_tabs = ["race","pit","live","adjusted","driver","config","replay","analytics"]` — for each tab, `INSERT OR IGNORE INTO user_tab_access SELECT id,:tab FROM users WHERE id NOT IN (SELECT user_id FROM user_tab_access WHERE tab=:tab)`. Re-adds any of those 8 tabs a user is currently missing.
2. `tab_migrations = [("driver","driver-config"),("analytics","insights")]` — same `INSERT OR IGNORE` pattern; gives `driver-config` to anyone with `driver`, `insights` to anyone with `analytics`.

`_apply_config_to_user` (`stripe_routes.py:994-1141`) is the source of truth for paid entitlements: on purchase it `DELETE`s all `user_tab_access` rows for the user and re-inserts exactly the plan's tabs. That works correctly. But the **next deploy** runs the backfill above and silently re-injects `adjusted`/`replay`/`analytics` (+ `insights` via the migration) onto every paid user whose plan legitimately excludes them.

**Systemic, not isolated.** All 5 active paid users in prod are affected, and the arithmetic matches the mechanism exactly:

| user | plan | leaked tabs (not in plan) |
|---|---|---|
| 1 (admin) | endurance_pro_monthly | adjusted, insights, replay |
| 73 sernandez | endurance_basic_monthly | adjusted, analytics, driver, insights, replay |
| 79 admin@kartingnow | endurance_basic_monthly | adjusted, analytics, driver, insights, replay |
| 80 casaloga18 | endurance_pro_annual | adjusted |
| 83 izcue | endurance_pro_monthly | adjusted, insights, replay |

Each row = `basic_tabs ∪ {driver→driver-config, analytics→insights}` minus what the plan already granted. user 80 (annual) leaks only `adjusted` because its plan already includes replay/insights/analytics — confirms the mechanism at 100%.

## Fix — remove both backfill blocks
Delete lines **242-268** of `backend/app/models/database.py` (the two backfill blocks plus their comments and the blank line between them). Concretely, remove:
- The `# Seed default tab access for all users (basic tabs)` comment, `basic_tabs = [...]`, and its `for tab in basic_tabs:` loop (~242-251).
- The `# Migrate granular tab permissions:` comment, `tab_migrations = [...]`, and its `for parent_tab, new_tab in tab_migrations:` loop (~253-268).

Keep everything else byte-for-byte: the `email_verified` grandfather `UPDATE` (236-240) and the `product_tab_config` schema-column migrations (270+, `ALTER TABLE product_tab_config ADD COLUMN ...`). After the deletion, the `email_verified` `UPDATE` block is followed by exactly one blank line and then the `# Migrate product_tab_config:` comment — no other code moves.

## Why this is safe (verified empirically, not assumed)
- **New users** get tabs from `register()` (`auth_routes.py:901-902`, trial set), Google register (`auth_routes.py:1335-1336`), or admin create (`admin_routes.py:148`, `ALL_TABS`).
- **Paid users** get tabs from `_apply_config_to_user` (delete+rebuild from plan config — the source of truth).
- **Legacy users** were already grandfathered on the first startup after this code originally shipped; those `user_tab_access` rows persist. Prod check: **0 of 8 users have zero tab rows** — nobody depends on the backfill to have any tabs, so removing it locks nobody out.
- The `driver→driver-config` / `analytics→insights` migrations already did their one-time job; the resulting rows persist. Re-running them every startup added nothing for already-migrated users and actively clobbered paid plans.
- Admins are unaffected regardless: `_user_out` resolves admin `tab_access` to `ALL_TABS` independent of `user_tab_access` rows.

Net effect of the fix: the only behavior removed is the per-startup re-grant. No user's legitimate, persisted entitlements change.

## Testing (backend pytest, TDD; mirror existing `init_db`/entitlement tests)
- **Regression test (write first, must fail before the fix):** seed a user whose `user_tab_access` is exactly a paid plan's tab set that **excludes** `adjusted`/`replay`/`insights` (e.g. mirror `endurance_pro_monthly`: `["race","pit","live","config","driver-config","analytics","app-config-carrera","app-config-box","app-config-visualizacion","app-config-plantillas","app-config-gps-racebox","driver","chat"]`). Run `init_db()` against that DB. Assert the user's `user_tab_access` set is **unchanged** — specifically that `adjusted`, `replay`, `insights` are NOT present. Pre-fix this fails (backfill + analytics→insights migration re-add them); post-fix it passes.
- **No-lockout test:** a user already holding a curated set still holds exactly that set after `init_db()` (no rows added, none removed by `init_db`).
- Full `cd backend && .venv/bin/python -m pytest tests -q` green — no regression to email-verification / stripe / auth suites. Adjust only assertions in existing tests that explicitly depended on the removed backfill granting tabs (document any such change in the implementation report).

## Scope / non-goals
- **Only** `backend/app/models/database.py` (delete 242-268) + one new backend regression test (+ minimal edits to any existing test that asserted the old backfill behavior).
- **No prod data correction** of the 5 already-affected users (explicit user decision: code-only fix). They will re-sync naturally the next time `_apply_config_to_user` runs for them (renewal / plan change), or via a separate future one-off if requested.
- No DB migration, no Alembic, no schema change.
- Do **not** modify `_apply_config_to_user`, `register`, `verify_email`, the Stripe webhooks, `_get_registration_config`, or the `product_tab_config` schema migrations.
- **Flagged, out of scope:** the `UPDATE users SET email_verified=1 WHERE email_verified=0 OR email_verified IS NULL` (database.py:236-240) also runs on every startup and would auto-verify any user with a pending email verification on the next deploy — a distinct latent bug. Not addressed here; surfaced for a separate task.
