# Checkout circuit window: 3 columns + full i18n — Design

**Date:** 2026-05-17 · **Status:** approved. Frontend + one backend endpoint. No DB change, no migration. Builds on F2 (all-circuits) — must preserve F2 behaviour.

## Goal
Split the purchase circuit window into three labelled groups — **Disponibles** (`for_sale && !is_beta`), **En pruebas** (`for_sale && is_beta`), **En estudio** (`is_beta && !for_sale`, informational/non-purchasable) — and fully internationalise `CircuitSelector.tsx` (es/en/it/de/fr).

## Current state (verified post-F2)
- `GET /api/stripe/circuits` → `list_circuits_for_checkout` (`backend/app/api/stripe_routes.py`): computes `active_circuit_ids` (valid per-circuit `UserCircuitAccess`); `has_all` (active `UserAllCircuitAccess`) → **`return []`** (F2); else `select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name)` → returns `[{id, name, is_beta}]` excluding `active_circuit_ids`. It does NOT return `for_sale`, and `beta && !for_sale` circuits are excluded entirely.
- `frontend/src/components/checkout/CircuitSelector.tsx` (521 lines): `Circuit = {id, name, is_beta}`; two modes — selectable (single radio / multi checkbox, `requiredCount`, event date-picker step) and `informational` (read-only "incluidos en tu plan"); a flat list with an amber **"Provisional"** badge for `is_beta`. **Every user-facing string is hardcoded Spanish** (titles, "Plan:", counters, loading/empty, "Solo hay N…", badge, buttons, the two `info@kartingnow.com` legends, `EventDatePicker` hints, `DAY_NAMES`, `MONTH_NAMES`, `PLAN_LABELS`). It calls `api.getCheckoutCircuits()` (`frontend/src/lib/api.ts`).
- i18n: `frontend/src/lib/i18n.ts` uses `"key": { es, en, it, de, fr }` objects (e.g. existing `checkout.*` ~lines 843-846); components consume via `useT()`.

## Backend — extend `list_circuits_for_checkout` (only)
- Keep F2 byte-for-byte: the `active_circuit_ids` query and the `if has_all: return []` early-return are unchanged.
- Change the final query+projection: select circuits where `Circuit.for_sale == True OR Circuit.is_beta == True`, ordered by name; return `[{ "id", "name", "is_beta", "for_sale" }]` (add `for_sale`).
- Owned-exclusion stays scoped to purchasable circuits only: a circuit is dropped iff `c.id in active_circuit_ids` **and** `c.for_sale` is true. `is_beta && !for_sale` ("En estudio") circuits are informational/non-purchasable and are returned regardless of `active_circuit_ids` (a user cannot have "bought" a not-for-sale circuit through this flow; admin-granted edge is irrelevant to an informational row).
- No change to `create_checkout_session`, the F2 all-grant guard, the model, or any other endpoint.

## Frontend — `CircuitSelector.tsx`
- `Circuit` interface: add `for_sale?: boolean`. `frontend/src/lib/api.ts` `getCheckoutCircuits()` return type: add `for_sale` (mirror the existing `is_beta` typing).
- Derive three groups from the fetched list:
  - **Disponibles** = `for_sale && !is_beta`
  - **En pruebas** = `for_sale && is_beta`
  - **En estudio** = `is_beta && !for_sale`
- Render as **three stacked labelled sections** (the modal is `max-w-md` ≈ 448px; literal side-by-side columns are unusable at that width — sections, each with an i18n header, preserve the existing card styling). A section with zero circuits is hidden entirely (no empty header).
- **Disponibles / En pruebas**: fully selectable exactly as today (single radio / multi checkbox; `toggleCircuit`; `requiredCount` cap; `is_beta` keeps its badge — now under the "En pruebas" header). Selection state, `canContinue`, `requiredCount` math, event date-picker step: unchanged in behaviour.
- **En estudio**: informational only in BOTH modes — rendered as non-interactive rows (no radio/checkbox, visually de-emphasised, not clickable), excluded from `selectedIds`/`toggleCircuit`, and **not counted** toward `requiredCount` or the "X de Y" counter or the `circuits.length < requiredCount` guard (those continue to consider only purchasable = `for_sale` circuits). In `informational` mode the three sections render the same way (all read-only) under their headers.
- `informational` mode keeps its semantics (`onSelect([])`, always-continue); only the visual grouping/headers and i18n change.

## i18n — full migration of `CircuitSelector.tsx` (es/en/it/de/fr)
- Add new `circuitSelector.*` keys to `frontend/src/lib/i18n.ts` (same `{es,en,it,de,fr}` shape as `checkout.*`) and replace every hardcoded string via `useT()`: section headers (Disponibles / En pruebas / En estudio + an "En estudio" explanatory subtitle), window titles (circuit / event-dates / informational), "Plan:", multi-pick prompt + "X de Y seleccionado(s)", informational subtitle, loading, empty, "Solo hay N circuitos… requiere M", the badge label (currently "Provisional"), buttons ("Redirigiendo a pago…", "Seleccionar días", "Continuar al pago", "Volver", "Cancelar"), both legend paragraphs (keep the `mailto:info@kartingnow.com` links), `EventDatePicker` hints (3 states), and `PLAN_LABELS` (basic/pro monthly/annual, event).
- **Month/day names** (`MONTH_NAMES`, `DAY_NAMES` in `EventDatePicker`): use `Intl.DateTimeFormat` with the active UI locale (`{month:'long'}`, weekday short) instead of translation keys — correct tool, avoids ~60 keys. Map the app's language code to a BCP-47 tag (es/en/it/de/fr → same tags; verify the `useLangStore`/`useT` locale value in the plan and pick the exact mapping). Monday-first weekday order must be preserved.
- **Interpolation/pluralisation** ("X de Y seleccionado(s)", "Solo hay N circuito(s)… requiere M", plan name, selected-circuit line): resolved with the codebase's existing `useT()` mechanism. The plan must first read `frontend/src/lib/i18n.ts` + the `useT` hook to determine whether `t()` supports params/templating or whether values are composed in JSX, then apply that exact pattern consistently (no new i18n infrastructure — YAGNI).

## Testing
- Backend: pytest for `list_circuits_for_checkout` (mirror existing stripe test harness): returns `for_sale` on each item; includes a `beta && !for_sale` circuit; still excludes an owned `for_sale` circuit; does NOT exclude an owned-but-`!for_sale` informational circuit; `has_all` → `[]` (F2 preserved); ordering by name. Full `cd backend && .venv/bin/python -m pytest tests -q` green.
- Frontend: `cd frontend && npx tsc --noEmit` and `npm run build` green (no component-test infra; verification is type-check + build + the spec's behavioural description). Manual-review checklist in the plan: all three groups render with i18n headers, En estudio non-selectable and uncounted, empty sections hidden, language switch updates every string incl. month/day names, selectable/multi/event/informational flows unchanged for for_sale circuits.

## Scope / non-goals
- Only `backend/app/api/stripe_routes.py` (`list_circuits_for_checkout` projection/filter), `frontend/src/components/checkout/CircuitSelector.tsx`, `frontend/src/lib/api.ts` (return type), `frontend/src/lib/i18n.ts` (new keys ×5), + one backend test.
- Unchanged: F2 all-grant `return []` and owned-exclusion semantics; `create_checkout_session`/Stripe/payment flow; the `Circuit` model and DB; admin; iOS/Android (consume `/config/circuits`, a different endpoint — untouched). No new i18n library/mechanism. "En estudio" is never purchasable (consistent with `for_sale=false`). No literal side-by-side CSS columns (stacked sections by container-width constraint).
