# Plan-card i18n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` steps. Backend TDD (`backend/.venv/bin/python -m pytest tests -q`, asyncio_mode=auto, fixture `db_session` in `backend/tests/ranking/conftest.py`). Frontend gated by `npx tsc --noEmit` + `npm run build`. NO deploy; commit per task; push at end.

**Spec:** `docs/superpowers/specs/2026-05-17-plan-cards-i18n-design.md`. Migrations = inline `try: ALTER TABLE … except: pass` in `backend/app/models/database.py` (mirror `for_sale`/`apex_last_position`). The authored translations below are the single source of truth — transcribe verbatim.

## Authored translation dictionary (es source → en/it/de/fr) — VERBATIM

This becomes `backend/app/services/plan_translations.py` as `PLAN_TRANSLATIONS: dict[str, dict[str,str]]` (key = exact Spanish string; value = `{"en","it","de","fr"}`).

**Display names**
- `"Endurance Básico"` → en `Endurance Basic` · it `Endurance Base` · de `Endurance Basis` · fr `Endurance Basique`
- `"Endurance Pro"` → en `Endurance Pro` · it `Endurance Pro` · de `Endurance Pro` · fr `Endurance Pro`
- `"Individual"` → en `Individual` · it `Individuale` · de `Einzel` · fr `Individuel`

**Descriptions**
- `"Acceso a más de 15 indicadores calculados para que sepas qué ocurre en cada momento. Pensado para pilotos individuales que corren resistencias y equipos que están empezando."` →
  - en `Access to 15+ calculated metrics so you always know what's happening. Built for solo endurance drivers and teams just getting started.`
  - it `Accesso a oltre 15 indicatori calcolati per sapere sempre cosa succede in ogni momento. Pensato per piloti individuali che corrono gare di durata e team che muovono i primi passi.`
  - de `Zugriff auf über 15 berechnete Kennzahlen, damit du jederzeit weißt, was passiert. Für einzelne Endurance-Fahrer und Teams, die gerade starten.`
  - fr `Accès à plus de 15 indicateurs calculés pour savoir à tout moment ce qui se passe. Pensé pour les pilotes individuels en endurance et les équipes qui débutent.`
- `"Equipos con experiencia este es vuestro plan. Toda la funcionalidad incluida."` →
  - en `For experienced teams — this is your plan. All features included.`
  - it `Per team esperti: questo è il vostro piano. Tutte le funzionalità incluse.`
  - de `Für erfahrene Teams – das ist euer Plan. Alle Funktionen inklusive.`
  - fr `Pour les équipes expérimentées, c'est votre plan. Toutes les fonctionnalités incluses.`
- `"Pensado para carreras individuales donde el estado del box no es importante"` →
  - en `Designed for solo races where the pit status doesn't matter`
  - it `Pensato per gare individuali dove lo stato del box non è importante`
  - de `Für Einzelrennen, bei denen der Box-Status keine Rolle spielt`
  - fr `Conçu pour les courses individuelles où l'état du stand n'a pas d'importance`

**Feature bullets** (es → en | it | de | fr)
1. `1 circuito incluido` → `1 circuit included` | `1 circuito incluso` | `1 Strecke inklusive` | `1 circuit inclus`
2. `App móvil · 2 usuarios` → `Mobile app · 2 users` | `App mobile · 2 utenti` | `Mobile App · 2 Nutzer` | `App mobile · 2 utilisateurs`
3. `Acceso web · 1 usuario` → `Web access · 1 user` | `Accesso web · 1 utente` | `Web-Zugang · 1 Nutzer` | `Accès web · 1 utilisateur`
4. `Módulo carrera + módulo box` → `Race module + pit module` | `Modulo gara + modulo box` | `Rennmodul + Boxmodul` | `Module course + module stand`
5. `Live Apex` → `LiveTiming` | `LiveTiming` | `LiveTiming` | `LiveTiming`  *(es DB still says "Live Apex" — flagged data fix, out of scope)*
6. `Vista de piloto y configuración de carrera` → `Driver view and race setup` | `Vista pilota e configurazione gara` | `Fahreransicht und Rennkonfiguration` | `Vue pilote et configuration de course`
7. `3 circuitos (todos los circuitos en plan anual)` → `3 circuits (all circuits on the annual plan)` | `3 circuiti (tutti i circuiti nel piano annuale)` | `3 Strecken (alle Strecken im Jahresplan)` | `3 circuits (tous les circuits dans le plan annuel)`
8. `App móvil · 6 usuarios` → `Mobile app · 6 users` | `App mobile · 6 utenti` | `Mobile App · 6 Nutzer` | `App mobile · 6 utilisateurs`
9. `Acceso web · 2 usuarios (hasta 8 dispositivos)` → `Web access · 2 users (up to 8 devices)` | `Accesso web · 2 utenti (fino a 8 dispositivi)` | `Web-Zugang · 2 Nutzer (bis zu 8 Geräte)` | `Accès web · 2 utilisateurs (jusqu'à 8 appareils)`
10. `Todo lo de Endurance Básico` → `Everything in Endurance Basic` | `Tutto di Endurance Base` | `Alles aus Endurance Basis` | `Tout Endurance Basique`
11. `Análisis de karts` → `Kart analysis` | `Analisi dei kart` | `Kart-Analyse` | `Analyse des karts`
12. `Soporte prioritario` → `Priority support` | `Supporto prioritario` | `Priorisierter Support` | `Support prioritaire`
13. `Clasificación real (próximamente)` → `Real classification (coming soon)` | `Classifica reale (prossimamente)` | `Echte Klassifizierung (demnächst)` | `Classement réel (bientôt)`
14. `App móvil · 6 usuarios · Acceso web · 2 usuarios (hasta 8 dispositivos)` → `Mobile app · 6 users · Web access · 2 users (up to 8 devices)` | `App mobile · 6 utenti · Accesso web · 2 utenti (fino a 8 dispositivi)` | `Mobile App · 6 Nutzer · Web-Zugang · 2 Nutzer (bis zu 8 Geräte)` | `App mobile · 6 utilisateurs · Accès web · 2 utilisateurs (jusqu'à 8 appareils)`
15. `1 circuito (todos los circuitos en plan anual)` → `1 circuit (all circuits on the annual plan)` | `1 circuito (tutti i circuiti nel piano annuale)` | `1 Strecke (alle Strecken im Jahresplan)` | `1 circuit (tous les circuits dans le plan annuel)`
16. `App móvil · 1 usuario` → `Mobile app · 1 user` | `App mobile · 1 utente` | `Mobile App · 1 Nutzer` | `App mobile · 1 utilisateur`
17. `Vista de piloto en carrera` → `In-race driver view` | `Vista pilota in gara` | `Fahreransicht im Rennen` | `Vue pilote en course`
18. `Configuración de carrera` → `Race setup` | `Configurazione gara` | `Rennkonfiguration` | `Configuration de course`
19. `Conexión con RaceBox / GPS` → `RaceBox / GPS connection` | `Connessione RaceBox / GPS` | `RaceBox-/GPS-Verbindung` | `Connexion RaceBox / GPS`
20. `GPS Insights (solo plan anual)` → `GPS Insights (annual plan only)` | `GPS Insights (solo piano annuale)` | `GPS Insights (nur Jahresplan)` | `GPS Insights (plan annuel uniquement)`
21. `Acceso a todos los circuito` → `Access to all circuits` | `Accesso a tutti i circuiti` | `Zugang zu allen Strecken` | `Accès à tous les circuits`
22. `GPS Insights` → `GPS Insights` | `GPS Insights` | `GPS Insights` | `GPS Insights`

---

## Task 1 — Backend: columns + migration + dict + backfill + API ?lang + pydantic (TDD)

**Files:** `backend/app/models/schemas.py`, `backend/app/models/database.py`, new `backend/app/services/plan_translations.py`, `backend/app/api/public_routes.py`, `backend/app/models/pydantic_models.py`; tests `backend/tests/test_plan_i18n.py`.

- [ ] **Step 1 — failing tests** `test_plan_i18n.py` (use `db_session`): (a) `PLAN_TRANSLATIONS["Endurance Básico"]["fr"] == "Endurance Basique"` and a couple more spot-checks; (b) pure resolver `localize_plan(row_or_dict, lang)` returns translated `display_name`/`description`/`features` for `en`, and falls back to es for `lang="es"`, unknown lang, and a string absent from the dict; empty description stays `""`; (c) backfill: given a `ProductTabConfig` row with the known prod Spanish content and NULL `*_i18n`, the backfill populates `display_name_i18n`/`description_i18n`/`features_i18n` from `PLAN_TRANSLATIONS`; running it twice is a no-op; a row whose `*_i18n` is already set is NOT overwritten. Run → FAIL.
- [ ] **Step 2 — model** (`schemas.py` `ProductTabConfig`): add `display_name_i18n = Column(Text, nullable=True)`, `description_i18n = Column(Text, nullable=True)`, `features_i18n = Column(Text, nullable=True)` (JSON-encoded strings; mirror how `features` Text/JSON is handled).
- [ ] **Step 3 — migration** (`database.py`, by the other `ALTER TABLE product_tab_config ADD COLUMN …`): 3 idempotent `try/except` ALTERs (`display_name_i18n TEXT`, `description_i18n TEXT`, `features_i18n TEXT`).
- [ ] **Step 4 — dict module** `backend/app/services/plan_translations.py`: `PLAN_TRANSLATIONS: dict[str, dict[str, str]]` transcribed VERBATIM from the table above (display names, descriptions, all 22 bullets). Plus pure helper `localize_plan(*, display_name, description, features, dn_i18n, desc_i18n, feat_i18n, lang)` returning the localized triple with the fallback rules (spec §API): `lang in (es|None|unknown)` → es values; else use the row's stored `*_i18n[lang]` if present, else fall back to es per field; `features` per-locale list must match es length (per-bullet fallback to es bullet).
- [ ] **Step 5 — backfill** in `database.py` `init_db` AFTER the ALTERs (idempotent): for each `ProductTabConfig`, if `display_name_i18n` IS NULL/empty → set `json.dumps({lang: PLAN_TRANSLATIONS[dn][lang] for lang in (en,it,de,fr) if dn in PLAN_TRANSLATIONS})`; same for description (skip empty/`""`); `features_i18n` → `json.dumps({lang: [PLAN_TRANSLATIONS.get(b,{}).get(lang, b) for b in es_features] for lang in (en,it,de,fr)})`. Only write when the column is NULL/empty (never clobber admin edits). Wrap in try/except like the other init backfills; commit within the existing init transaction.
- [ ] **Step 6 — API** (`public_routes.py` `/plans`): add `lang: str = "es"` query param; for each row call `localize_plan(...)` and return the localized `display_name`/`description`/`features` (response shape unchanged). `lang="es"`/unknown ⇒ byte-identical to today.
- [ ] **Step 7 — pydantic** (`pydantic_models.py`): add optional `display_name_i18n`/`description_i18n`/`features_i18n` (dict|None or str|None matching storage) to the ProductConfig Create/Update/Out models so admin POST/PATCH/GET round-trip them.
- [ ] **Step 8** — tests green; full `pytest tests -q` green (no regression; `?lang=es` identical).
- [ ] **Step 9 — commit**: `git add backend/app/models/schemas.py backend/app/models/database.py backend/app/services/plan_translations.py backend/app/api/public_routes.py backend/app/models/pydantic_models.py backend/tests/test_plan_i18n.py && git commit -m "feat(plans): per-locale plan content (?lang= + idempotent translation backfill, es fallback)"`

## Task 2 — Frontend: pass language to /api/plans + refetch on change

**Files:** `frontend/src/lib/api.ts`, `frontend/src/components/landing/PricingToggle.tsx`.

- [ ] **Step 1**: `api.ts` — `getPlans(lang?: string)` → `GET /api/plans${lang ? "?lang="+lang : ""}` (keep return type; tolerate the same shape).
- [ ] **Step 2**: `PricingToggle.tsx` — read `const lang = useLangStore((s) => s.lang)` (import from `@/lib/i18n`); pass `lang` to `getPlans(lang)`; add `lang` to the effect deps / query so plans **refetch and re-render** when the language changes. Preserve the `FALLBACK_PLANS`/loading behavior.
- [ ] **Step 3 — verify**: `cd frontend && npx tsc --noEmit && npm run build` (both green).
- [ ] **Step 4 — commit**: `git add frontend/src/lib/api.ts frontend/src/components/landing/PricingToggle.tsx && git commit -m "feat(landing): pricing cards refetch /api/plans by language"`

## Task 3 — Admin: per-language plan fields

> **Task 1 review follow-up (MUST do here):** the admin product CRUD does NOT use the pydantic ProductTabConfig models — `backend/app/api/admin_routes.py` `create_product_config` (~926-947), `update_product_config` (~981-1007) and `_serialize_config` (~875-897) hand-roll raw `request.json()` / dicts and currently IGNORE the new `*_i18n` columns. Task 3 MUST also wire `display_name_i18n`/`description_i18n`/`features_i18n` into those three backend functions (JSON-encode on write exactly like `features`; include in `_serialize_config` output) or the admin editor will silently no-op. Add a small backend test that POST/PATCH then GET round-trips the `*_i18n` JSON through `admin_routes`.

**Files:** `backend/app/api/admin_routes.py`, `frontend/src/components/admin/AdminPanel.tsx` (+ `frontend/src/lib/api.ts` types if needed); test `backend/tests/test_admin_plan_i18n.py`.

- [ ] **Step 1**: read the product/plan editor in `AdminPanel.tsx` (the form binding `display_name`/`description`/`features`). Add collapsible per-language sections **en/it/de/fr** with the same input shapes (display name = text, description = textarea, features = the existing list editor) bound to `display_name_i18n`/`description_i18n`/`features_i18n` (objects keyed by lang). Load existing values on edit; default empty. Mirror existing form/markup patterns; no new design system.
- [ ] **Step 2 — verify**: `cd frontend && npx tsc --noEmit && npm run build` green.
- [ ] **Step 3 — commit**: `git add frontend/src/components/admin/AdminPanel.tsx frontend/src/lib/api.ts && git commit -m "feat(admin): per-language plan name/description/features editor"`

## Task 4 — Acceptance + full gates

- [ ] **Step 1**: `backend/tests/test_plan_i18n_integration.py` — seed the 5 known prod rows (verbatim Spanish), run the backfill, then assert `/api/plans?lang=fr` returns `display_name="Endurance Basique"` for the basic row and a translated features list of the SAME length as es, while `?lang=es` is unchanged; an unknown bullet falls back to its es text.
- [ ] **Step 2**: full `cd backend && .venv/bin/python -m pytest tests -q` green; `cd frontend && npx tsc --noEmit && npm run build` green.
- [ ] **Step 3 — commit**: `git add backend/tests/test_plan_i18n_integration.py && git commit -m "test(plans): i18n backfill + ?lang acceptance on prod plan content"`

---

## Self-Review
- Spec coverage: schema+migration (T1.2-3), authored dict (T1.4), idempotent es-fallback backfill (T1.5), `?lang=` resolver (T1.6), pydantic (T1.7), frontend refetch-on-lang (T2), admin per-language editor (T3), acceptance (T4). ✔
- Placeholders: none — full translation table is verbatim; exact files/commands.
- Regression: `?lang=es`/unknown ⇒ identical; backfill only fills empty (admin-safe, idempotent); new nullable columns.
- Coupling: T1 must land before T2/T4 (API param), T3 reuses T1 pydantic.

## Execution
subagent-driven-development on `main`; backend TDD + code-quality review for T1 (data/API); frontend tsc+build gate. Commit per task; push at end. **No deploy** until the user says.
