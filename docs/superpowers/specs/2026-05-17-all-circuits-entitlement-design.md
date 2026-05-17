# "All circuits" entitlement + cancel-revoke fix — Design

**Date:** 2026-05-17 · **Status:** approved. Payment-critical. New table (auto-created via `create_all`, no ALTER/migration). Backend-only; iOS/Android transparently covered (verified: no client-side circuit logic).

## Problem (confirmed in code)
Subscriptions sold cross-circuit (`ProductTabConfig.per_circuit` false) currently call `_grant_all_circuits_access` (`stripe_routes.py` ~132-149) which writes **one `UserCircuitAccess` row per circuit** via `select(Circuit.id)` with **no `for_sale` filter** (grants even off-sale/beta circuits — inconsistent with `start_trial` which filters `for_sale==True`). Consequences:
1. **New circuits don't propagate.** A circuit added later is invisible to existing all-circuits subscribers (no row) until a manual script runs.
2. **Cancel of a cross-circuit sub revokes nothing.** `_handle_subscription_deleted` (`stripe_routes.py` ~957-991) revokes only circuits in Stripe metadata `circuit_ids` (empty for cross-circuit) or the singular `sub.circuit_id` (None for cross-circuit). So `revoked_circuit_ids` is empty and the revoke block is skipped — a canceled all-circuits subscription keeps full access indefinitely. Confirmed.

`UserCircuitAccess` (`schemas.py`): `id, user_id (FK users CASCADE), circuit_id (FK circuits CASCADE, NOT NULL), valid_from, valid_until`; no unique constraint, no "all" sentinel. `Circuit`: `for_sale` (Bool, default True), `is_beta` (Bool, default False). `user_has_active_circuit_access(user)` (`auth_routes.py` ~740) = admin→True else any eager-loaded `user.circuit_access` row with `valid_from<=now<valid_until` (denies if relationship not loaded — never does an async query).

## Decisions (locked)
- New dedicated table (not a `circuit_id` sentinel, not subscription-derived).
- Existing active cross-circuit subscribers: **not** backfilled; their current per-circuit rows keep working unchanged and they migrate to an all-grant naturally on their next `invoice.paid`.
- `start_trial` unchanged (keeps its own `for_sale`-only per-circuit loop; no beta).
- "All circuits" = circuits with `for_sale == True` **OR** `is_beta == True`, evaluated **at access time**.
- The cross-circuit cancel-revoke bug is fixed as part of this work.

## Model — new table `UserAllCircuitAccess`
`schemas.py`: `id` PK; `user_id` Int FK `users.id` ondelete CASCADE, not null; `valid_from` DateTime not null; `valid_until` DateTime not null; `stripe_subscription_id` String(255) nullable (links the grant to its Stripe sub for renewal-extend / cancel-expire; nullable for any non-subscription cross-circuit path). Add `User.all_circuit_access = relationship(..., back_populates="user")` mirroring `circuit_access`. New tables are auto-created by `Base.metadata.create_all` in `init_db` (established pattern — **no `ALTER`/Alembic**). No index required beyond the implicit; queries are by `user_id` (small per-user row counts).

## Resolver — the single source of truth (two shapes)
Both treat naive SQLite datetimes as UTC (existing `.replace(tzinfo=timezone.utc)` pattern).

1. **Platform gate — "any active access?"** Extend `user_has_active_circuit_access(user)` (`auth_routes.py` ~740): keep admin→True and the existing `user.circuit_access` scan; additionally return True if any `user.all_circuit_access` row has `valid_from <= now < valid_until`. Requires `all_circuit_access` to be eager-loaded wherever `circuit_access` is (see Eager-load). Powers: login `/me` `has_active_circuit_access` (`pydantic_models.UserOut`), the `require_active_circuit_access` dependency (routers: race, analytics, gps, replay), and the frontend bool. **`UserOut` shape is unchanged** (still a bool) → no frontend change.

2. **Specific-circuit — "access to circuit X now?"** New async helper `user_has_circuit_access(db, user_id, circuit_id) -> bool` = True iff EITHER a `UserCircuitAccess` row for `(user_id, circuit_id)` is currently valid, OR a `UserAllCircuitAccess` row for `user_id` is currently valid AND `Circuit.id == circuit_id` currently has `for_sale == True OR is_beta == True`. An explicit per-circuit row always stands even if that circuit later goes off-sale (existing behavior preserved). Used to update the per-circuit enforcement points below. Each call site being migrated must be confirmed (Read it) to be `async` with an `AsyncSession` in scope; the existing per-circuit checks (`config_routes._verify_circuit_access`, `analytics_routes._check_circuit_access`) already query the DB so they qualify — but the plan must verify per site rather than assume.

## Enforcement points to update (blast radius — each becomes a plan task; line refs are approximate, match on symbol)
- `auth_routes.user_has_active_circuit_access` (~740) — add the all-grant OR (point 1 above).
- `ws/server.py` WS race handshake (~228-244) and `apex_replay_routes.py` apex WS handshake (~167-178): currently a direct DB query for "any active `UserCircuitAccess`". Add "OR any active `UserAllCircuitAccess`" (platform-level parity with today's "any active row" semantics — an active all-grant passes the handshake).
- `config_routes._verify_circuit_access` (~380-390; callers ~94, ~177) — replace its per-circuit check with `user_has_circuit_access`.
- `analytics_routes._check_circuit_access` (~35-45; callers ~106,190,255,323) — replace with `user_has_circuit_access`.
- `analytics_routes` circuit-list query (~65-69, the `UserCircuitAccess` JOIN building the visible-circuits list) — union with all-grant: if an active all-grant exists, the visible set is every `for_sale OR is_beta` circuit (plus any explicit per-circuit rows).
- `replay_routes` allowed-circuit set (~206-213, filter ~219) — same union.
- `stripe_routes` `/circuits` checkout list (`list_circuits_for_checkout`, ~152-182, excludes already-owned at ~181) and `checkout_create` "already-owned" block (~278-292) — treat circuits covered by an active all-grant as owned (don't offer/allow re-purchase).
- **`/config/circuits`** (consumed by iOS/Android; locate in `config_routes`): the resolved circuit list it returns must include the all-grant set (`for_sale ∪ beta`) when the user has an active all-grant, in addition to explicit per-circuit rows. Backend change only; apps consume the resolved list unchanged.
- **Eager-load:** every `selectinload(User.circuit_access)` site must also `selectinload(User.all_circuit_access)` (`get_current_user`, `login`, `_user_out`, `verify_email` reload, admin `list_users`/`create_user` reloads, OAuth callback reloads). The sync gate must never trigger a lazy async load — same discipline already applied to `circuit_access`.

## Grant lifecycle
- New helper `_grant_all_circuits(db, user_id, *, stripe_subscription_id, period_end=None, event_start=None, event_end=None)` in `stripe_routes.py`: compute `[valid_from, valid_until]` exactly like `_grant_circuit_access` (event window; or `period_end + 3 days` grace; or `_calc_valid_until(config, now)`), then **upsert by `(user_id, stripe_subscription_id)`**: extend existing grant's `valid_until = max(existing, new)` (UTC-normalized) and lower `valid_from` if earlier, else insert a new row.
- Replace the **four** `_grant_all_circuits_access(...)` call sites (checkout subscription-mode ~676, checkout payment-mode ~768, `_handle_invoice_paid` ~897, `_handle_subscription_updated` ~948 — all in `not _config_is_per_circuit(config)` branches) with `_grant_all_circuits(...)` passing the Stripe subscription id. Per-circuit path (`_grant_circuit_access`) is untouched. Existing cross-circuit subs thus migrate to an all-grant on their next renewal; their stale per-circuit rows simply lapse.
- After replacement, `_grant_all_circuits_access` (~132-149) has zero callers (trial uses its own loop) → **delete it** (also removes the no-`for_sale`-filter bug).
- **Cancel-revoke fix:** in `_handle_subscription_deleted` (~957-991), after the existing per-circuit revoke, also `valid_until = now` every `UserAllCircuitAccess` row with `stripe_subscription_id == sub_id`. This closes the confirmed bug.

## Testing (backend pytest; mirror existing stripe/auth test harnesses)
- Model: table created by `create_all`; relationship eager-loads.
- Resolver `user_has_circuit_access`: per-circuit-only; all-grant-only (circuit `for_sale`); all-grant + beta circuit (covered); all-grant + off-sale non-beta circuit (NOT covered); expired all-grant (not covered) but explicit per-circuit row still covers an off-sale circuit; admin.
- `user_has_active_circuit_access`: True via active all-grant alone; False when all-grant expired and no per-circuit rows; admin True.
- Checkout: cross-circuit subscription → exactly one `UserAllCircuitAccess`, **zero** new per-circuit rows; per-circuit plan → per-circuit rows as before, **no** all-grant (unchanged).
- Renewal (`invoice.paid`) for a cross-circuit sub → all-grant `valid_until` extended (+grace).
- **Cancel regression (the bug):** `customer.subscription.deleted` for a cross-circuit sub → its `UserAllCircuitAccess` `valid_until` set to ~now (access revoked). Per-circuit sub cancel → unchanged behavior.
- Propagation: with an active all-grant, a circuit inserted *after* the grant is immediately covered by `user_has_circuit_access` (the core value); a circuit flipped `for_sale=False` (and not beta) becomes uncovered for all-grant holders but still covered for a user holding an explicit per-circuit row.
- Enforcement smoke: `/config/circuits`, an analytics per-circuit check, and the WS handshake path each honor an active all-grant.
- `_grant_all_circuits_access` removed: grep shows no remaining references; full `cd backend && .venv/bin/python -m pytest tests -q` green (adjust only assertions genuinely tied to the deleted N-row behavior, and document). No frontend build needed (no FE change).

## Scope / non-goals
- In scope: new table + `User` relationship; `user_has_circuit_access` resolver; extend `user_has_active_circuit_access`; update the enumerated enforcement points incl. `/config/circuits`; eager-load siblings; `_grant_all_circuits` helper; replace the 4 `_grant_all_circuits_access` calls and delete that function; cancel-revoke fix; tests.
- Out of scope / unchanged: per-circuit `UserCircuitAccess` rows & flows; `start_trial`; admin per-circuit grant/revoke endpoints; `_apply_config_to_user` (tabs only — independent); the checkout 3-column UI (separate feature F3); frontend (UserOut bool shape unchanged); iOS/Android (transparent — consume resolved `/config/circuits` + WS, both backend-gated). No data migration/backfill of existing cross-circuit subscribers. No Alembic/ALTER.
- Accepted limitation (flagged): an existing cross-circuit subscriber does not auto-receive newly-added circuits until their next `invoice.paid` renewal (then they migrate to an all-grant).
