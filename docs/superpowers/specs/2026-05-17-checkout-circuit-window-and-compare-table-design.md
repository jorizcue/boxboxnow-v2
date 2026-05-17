# Checkout circuit window (non-per-circuit + Provisional legend) & compare-table tweaks — Design

**Date:** 2026-05-17 · **Status:** decisions locked (frontend-only; no backend change).

## Part A — Checkout circuit window

### Current (researched)
- `dashboard/page.tsx` gate: `if (!pendingPlanPerCircuit) → <EmbeddedCheckout circuitIds={[]}/>` (skips the window). Per-circuit → `<CircuitSelector>` then `<EmbeddedCheckout>`.
- `CircuitSelector.tsx`: lists `GET /api/stripe/circuits` (already `for_sale`-filtered, returns `{id,name,is_beta}`); selectable; hardcoded-Spanish (not i18n); Beta badge text literal **"Sin verificar"** (lines ~404-408); no help/legend; no `info@kartingnow.com` anywhere.
- `/api/plans` exposes `per_circuit` + `circuits_to_select`. Backend non-per-circuit grant (`_grant_all_circuits_access`) grants ALL circuits — unchanged (matches "se le dan permisos sobre todos los circuitos").

### Changes (frontend only)
1. **Show the window for non-per-circuit plans too** (informational): in `dashboard/page.tsx`, replace the `if (!pendingPlanPerCircuit) return <EmbeddedCheckout circuitIds={[]}/>` shortcut with rendering `<CircuitSelector informational … />`; its continue proceeds to `<EmbeddedCheckout circuitIds={[]} …>` exactly as before (backend still grants all). Per-circuit path unchanged.
2. **`CircuitSelector` gains `informational?: boolean`** (default false). When `informational`:
   - render the for_sale circuit list **read-only** (no checkbox/radio, no selection cap; show each name + Provisional badge if `is_beta`; a subtle "incluido"/check is fine);
   - header copy reflects "incluidos en tu plan" instead of "selecciona N";
   - "Continuar al pago" always enabled → `onSelect([])` (no selection needed).
   Per-circuit (`informational=false`) behavior is byte-identical to today.
3. **Rename badge** "Sin verificar" → **"Provisional"** (same amber chip styling).
4. **Two legends, shown in BOTH modes** (per user's explicit ask to reuse the same window incl. the legend), placed at the bottom of the card (muted small text, consistent with existing hint styling):
   - Provisional: «Los circuitos marcados como **Provisional** aún no se han probado en real. Si detectas algún problema, escríbenos a info@kartingnow.com.»
   - Not found: «¿No encuentras tu circuito? Escríbenos a info@kartingnow.com para pedir su inclusión.»
   `info@kartingnow.com` rendered as a `mailto:` link. Spanish, hardcoded (matches the component's current non-i18n convention).
5. No backend change. No change to per-circuit selection logic, Stripe flow, or the grant.

### Edge cases
- Non-per-circuit + empty list → still show the window with the legends (and the existing "No hay circuitos disponibles" message); continue still enabled (they get all on the backend regardless).
- Beta circuit in per-circuit mode: still selectable, now badged "Provisional" + legend explains it.

## Part B — Comparison table (`FeatureComparisonTable.tsx` + `i18n.ts`)

1. **Endurance Pro mensual circuits**: line ~181 `end_pro_m: text("3")` → `end_pro_m: text(t("landing.compare.cell.todos"))` (reuses existing key `landing.compare.cell.todos`, es "Todos" — same as `end_pro_a`/`ind_a`). No new key.
2. **"Vista piloto" row**:
   - Rename label: `i18n.ts` key `landing.compare.row.vistaPiloto` → es **"Vista Piloto App"**, en "Driver View App", it "Vista pilota App", de "Fahreransicht App", fr "Vue pilote App". (Component already uses the key; no component label change.)
   - All five plan cells → `SOON`: line ~209 `values: { ind_m: SOON, ind_a: SOON, end_b: SOON, end_pro_m: SOON, end_pro_a: SOON }` (reuses existing `SOON` primitive + `landing.compare.soon` "Próximamente"). No new key.

## Verification / scope
Frontend only. `npx tsc --noEmit` + `npm run build` green. Manual: per-circuit window unchanged + new legends; non-per-circuit now shows informational window + legends + Provisional badge; compare table shows Pro-mensual "Todos" and "Vista Piloto App" = Próximamente across all plans. No deploy (commit+push; deploy when the user says). Non-goals: i18n-ing the checkout window; touching backend/Stripe/grant logic; changing per-circuit selection.
