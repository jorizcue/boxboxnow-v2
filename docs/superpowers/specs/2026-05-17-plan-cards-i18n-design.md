# Plan-card i18n (multilingual pricing cards) — Design

**Date:** 2026-05-17
**Status:** Design APPROVED by Jorizcue — Approach A; translations authored by us; missing-locale fallback → Spanish.

## Problem

The landing pricing cards (`PricingToggle`) render `display_name` / `description` / `features` straight from `/api/plans` → `ProductTabConfig` (DB), stored only in Spanish. The landing header/toggle are i18n-wired (fixed earlier) but the **plan cards stay Spanish** when the language changes. Confirmed root cause; frontend-only fixes are impossible because the copy is admin-authored business data, not i18n keys.

## Current production data (read from prod DB, source of truth for seeding)

`product_tab_config` has 5 rows (`display_name`, `description`, `features` JSON). Distinct Spanish strings: 3 display names, 3 non-empty descriptions, ~22 distinct feature bullets (full verbatim list + our authored EN/IT/DE/FR translations live in the implementation plan's translation table). Note: id=4/id=6 have empty `description` (no translation needed). One bullet is `"Live Apes"`→ historically "Live Apex"; per the earlier APEX→LiveTiming directive we translate it as **"LiveTiming"** in all locales and flag that the **es DB value still says "Live Apex"** (admin/data fix, out of this i18n scope — recommend updating the row).

## Decisions (confirmed)

- **Approach A**: per-locale data on the plan row + `?lang=` API + admin per-language fields + frontend passes the active language.
- **We author** the EN/IT/DE/FR translations (in the plan); seeded idempotently.
- **Fallback**: any missing locale OR field OR unknown string → the existing Spanish value.

## Architecture

### DB (`ProductTabConfig`, inline migration — no Alembic)

Add 3 nullable `Text` columns: `display_name_i18n`, `description_i18n`, `features_i18n`. Each holds JSON:
- `display_name_i18n`, `description_i18n`: `{"en": "...", "it": "...", "de": "...", "fr": "..."}` (Spanish stays in the existing `display_name`/`description` columns = source + fallback).
- `features_i18n`: `{"en": ["...", ...], "it": [...], "de": [...], "fr": [...]}` — a per-locale full list, **same length/order** as the es `features`; each bullet translated, untranslated bullets fall back to the es bullet text.
Inline `try: ALTER TABLE product_tab_config ADD COLUMN … except: pass` (mirror the `for_sale`/`apex_last_position` migrations).

### Translation dictionary + idempotent backfill (we generate translations)

A backend module `app/services/plan_translations.py` holds an authored dictionary keyed by the **exact Spanish source string** → `{en,it,de,fr}`, covering every distinct current display_name/description/feature bullet (verbatim from the plan's translation table).

Startup backfill (runs in `init_db` after the ALTERs, idempotent): for each `ProductTabConfig` row, **only if** its `*_i18n` column is NULL/empty, populate from the dictionary by exact-matching the row's current Spanish text:
- `display_name_i18n` = `{lang: DICT.get(display_name, {}).get(lang)}` for langs where a translation exists (omit a lang only if unknown → API falls back to es for that lang).
- `description_i18n` likewise (empty description → leave NULL).
- `features_i18n` = `{lang: [DICT.get(bullet,{}).get(lang) or bullet for bullet in es_features]}` for the 4 langs.
"Only if empty" ⇒ admin edits via the UI (below) are never clobbered by a redeploy; re-running is a no-op. Strings the admin later changes to something not in the dictionary simply fall back to es until translated in the admin UI.

### API (`/api/plans`)

Add optional query param `?lang=` (one of `es|en|it|de|fr`, default `es`). For each plan, resolve each field:
- `display_name` = `display_name_i18n.get(lang)` if non-empty else es `display_name`.
- `description` = `description_i18n.get(lang)` if non-empty else es `description`.
- `features` = `features_i18n.get(lang)` if a non-empty list else es `features`.
Response shape is **unchanged** (same keys) — only values are localized. `lang="es"` (or unknown) → exactly today's behavior (regression-safe). One shared resolver helper; reused anywhere plans are serialized (checkout/account if they read the same endpoint).

### Frontend (`PricingToggle` + `api.ts`)

- `api.getPlans(lang?)` → `GET /api/plans?lang=${lang}`.
- `PricingToggle` reads `useLangStore((s)=>s.lang)`, passes it to `getPlans`, and **refetches when `lang` changes** (effect dependency on `lang`, or include `lang` in the query key) so cards re-render in the new language. No structural change to the card markup. Backend-empty fallback to `FALLBACK_PLANS` behavior preserved (those remain Spanish — acceptable; only used when API returns nothing).

### Admin UI (`AdminPanel` Plataforma → plan editor) + pydantic

- `ProductConfigCreate`/`Update`/`Out` (pydantic): add optional `display_name_i18n`, `description_i18n`, `features_i18n` (dict/None). Admin POST/PATCH already `model_dump` → flows through.
- Plan editor form: under the existing es `display_name`/`description`/`features` fields, add collapsible per-language groups (en/it/de/fr) with the same input shapes (text, text, list editor) bound to the `*_i18n` JSON. Mirrors existing form patterns; saving persists the JSON. Lets the team correct/extend our seeded translations and translate any future plan/edit.

## Backwards compatibility / risks

- New nullable columns; `lang=es`/unknown ⇒ identical current output (regression-safe).
- Backfill only fills empty ⇒ idempotent, never overwrites admin edits.
- Exact-string keying: if prod copy is edited away from the dictionary key, that string falls back to es until re-translated in admin (graceful, not broken).
- Fallback is per-field and per-bullet ⇒ partial translations still render mostly localized.

## Testing

- Backend (pytest): migration adds columns; backfill fills i18n from the dictionary for the known rows and is idempotent (2nd run no-op, admin-set values preserved); `/api/plans?lang=en|it|de|fr` returns translated fields; `?lang=es`/missing/unknown lang and unknown strings fall back to es; empty description stays es.
- Frontend: `tsc` + `npm run build` green; switching language refetches and re-renders cards (lang in query/effect dep).
- Admin: create/update round-trips the `*_i18n` JSON.

## Scope / non-goals

One coordinated plan. Non-goals: translating `FALLBACK_PLANS` (dev-only), machine-translation at request time, changing the es DB content (the "Live Apex"→"LiveTiming" es data fix is flagged but separate), translating other admin/business surfaces.
