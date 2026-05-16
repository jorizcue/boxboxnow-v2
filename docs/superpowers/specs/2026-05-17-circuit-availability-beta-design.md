# Circuit "Available for sale" + "Beta" flags — Design

**Date:** 2026-05-17
**Status:** Design proposed — needs one confirmation (existing-circuit defaults). Concretely specified by the user otherwise.

## Requirement (user's words)

- Add to the circuit master two checks: **"Disponible para venta"** and **"Beta"**.
- In the per-circuit purchase list, show **only circuits with "Disponible para venta"**; if a shown circuit also has **"Beta"**, render a **"Sin verificar"** label next to its name.
- When a product is **not** sold per-circuit, the purchase must assign **all circuits available for sale**.

## Current state (researched)

- `Circuit` model `schemas.py:50-144`, table `circuits`. **No** sale/beta/visibility flag. No Alembic — migrations are inline `ALTER TABLE` in `database.py` (run on startup).
- Admin: `AdminPanel.tsx` → `CircuitsManager`/`CircuitForm`; backend `/api/admin/circuits` `POST`/`PATCH` use pydantic `CircuitCreate`/`CircuitUpdate` (`model_dump`), `CircuitOut` for reads.
- Purchase list: `GET /api/stripe/circuits` (`stripe_routes.py:152-182`) = ALL circuits minus ones the user already owns (active `UserCircuitAccess`). No availability filter. Frontend `checkout/CircuitSelector.tsx`.
- Non-per-circuit grant: `_grant_all_circuits_access` (`stripe_routes.py:132-149`) + the trial block (`auth_routes.py:821-843`, and OAuth `1269-1289`) iterate **`select(Circuit)`** (every circuit).

## Decision to confirm

**Defaults for the new columns on existing rows.** Recommended (and assumed below): `for_sale` default **TRUE** (NOT NULL DEFAULT 1) so every existing circuit stays purchasable exactly as today (safe grandfather); `is_beta` default **FALSE**. Admin then unchecks "disponible" / checks "Beta" per circuit as needed. (Confirm: OK to grandfather all current circuits as for-sale, not-beta?)

The other two points are fully determined by the user's description (no decision needed): Beta circuits that are for-sale remain **purchasable**, just labeled "Sin verificar" (Beta is a label, not a sale block); "all available for sale" = `for_sale=True` (Beta ones included, since they are still for sale).

## Architecture

### DB

Add to `Circuit`: `for_sale BOOLEAN NOT NULL DEFAULT 1`, `is_beta BOOLEAN NOT NULL DEFAULT 0`. Inline migration in `database.py` mirroring the existing `ALTER TABLE circuits ADD COLUMN …` entries (the `try/except: pass` idempotent pattern). SQLite `DEFAULT 1/0` backfills existing rows → grandfather.

### Admin (model + UI)

- `pydantic_models.py`: add `for_sale: bool` and `is_beta: bool` to `CircuitCreate` (default True / False), `CircuitUpdate` (Optional), `CircuitOut`. `/api/admin/circuits` POST/PATCH already `model_dump` → flows through with no route change.
- `AdminPanel.tsx` `CircuitForm`/`emptyForm`/`formToPayload`/`saveCircuit` + `api.ts` types: add two checkboxes "Disponible para venta" (default checked) and "Beta" (default unchecked) to the circuit editor, mirroring the existing boolean fields' markup.

### Purchase list (`GET /api/stripe/circuits`)

Filter to `Circuit.for_sale == True` (still excluding circuits the user already owns). Each returned item also carries `is_beta` so the client can label it. Verbatim shape change: `{"id", "name", "is_beta"}` (add `is_beta`). `CircuitSelector.tsx`: when `is_beta`, render a small **"Sin verificar"** badge next to the circuit name (reuse existing badge styling).

### Non-per-circuit / trial "grant all" → "grant all for-sale"

Every "grant every circuit" path becomes "grant every **for-sale** circuit" — change `select(Circuit)` → `select(Circuit).where(Circuit.for_sale == True)` in:
- `stripe_routes.py:_grant_all_circuits_access` (132-149) — non-per-circuit plans.
- The shared `start_trial()` helper (the trial block extracted per the email-verification spec; today `auth_routes.py:821-843` + OAuth `1269-1289`).

(Per-circuit purchases already grant only the selected `circuit_ids`; those ids now necessarily come from the for-sale-filtered list, so no extra change in the webhook grant path. Optionally also defensively validate selected `circuit_ids` are `for_sale` in `create_checkout_session`.)

## Coupling with Email-verification spec

Both specs modify the trial/all-circuits grant code. The email-verification spec extracts the trial creation into a shared idempotent `start_trial(user, db)`; THIS spec changes which circuits that helper (and `_grant_all_circuits_access`) iterate (`for_sale == True`). Implement together: one `start_trial()` that (a) is called from verify-email/OAuth (not register), and (b) grants only for-sale circuits.

## Backwards compatibility / risks

- Grandfather defaults (for_sale=1, is_beta=0) → purchase list, non-per-circuit grants, and trials behave exactly as today until an admin changes a circuit.
- If an admin marks every circuit `for_sale=False`, the purchase list/non-per-circuit grant become empty — acceptable (admin intent); the existing edge where empty per-circuit selection grants nothing is unchanged.

## Testing (pytest + web build)

- Migration adds columns with correct defaults; existing circuits → for_sale True, is_beta False.
- `GET /api/stripe/circuits`: excludes `for_sale=False`; includes for-sale (incl. owned-exclusion unchanged); each item exposes `is_beta`.
- Admin create/update round-trips both flags.
- `_grant_all_circuits_access` / `start_trial` grant only for-sale circuits (a `for_sale=False` circuit is NOT granted to a non-per-circuit purchase or a trial).
- Frontend: `CircuitSelector` shows "Sin verificar" only for `is_beta`; tsc + build green.

## Scope / non-goals

Coordinated single plan with the email-verification spec. Non-goals: hiding circuits from the live app/monitoring (this only affects the **sales/checkout/trial-grant** surface, not which circuits a user with access can view); per-region pricing; Beta meaning anything beyond the "Sin verificar" label + still-sellable.
