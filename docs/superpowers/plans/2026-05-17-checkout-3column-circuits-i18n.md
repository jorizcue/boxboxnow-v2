# Checkout Circuit Window: 3 Columns + Full i18n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Group the purchase circuit window into Disponibles / En pruebas / En estudio (last is informational) and fully internationalise `CircuitSelector.tsx` (es/en/it/de/fr).

**Architecture:** Backend `list_circuits_for_checkout` returns `for_sale` and includes `beta&¬for_sale` circuits (F2 `has_all→[]` + per-circuit owned-exclusion preserved, owned-exclusion scoped to for_sale only). Frontend groups by `(for_sale,is_beta)` into 3 stacked labelled sections; "En estudio" is non-interactive and excluded from selection/count. Every string moves to `circuitSelector.*` i18n keys via the existing `useT()` (`t("k",{param})`, `{param}` placeholders); month/day names via `Intl.DateTimeFormat`.

**Tech Stack:** FastAPI/SQLAlchemy/pytest (backend), Next.js/React/TS, zustand i18n (`frontend/src/lib/i18n.ts`). Backend tests: `cd backend && .venv/bin/python -m pytest`. Frontend gate: `cd frontend && npx tsc --noEmit && npm run build`.

**Verified mechanics (use exactly):**
- `frontend/src/lib/api.ts:445-446`: `getCheckoutCircuits: () => fetchApi<{ id: number; name: string; is_beta: boolean }[]>("/api/stripe/circuits")` — inline type, no named interface.
- `useT()` (`i18n.ts:1034-1050`): `const t = useT(); t("key")` or `t("key", { param: value })`; placeholders are `{param}` (single braces, **first occurrence only**, `String.replace`). `Language = "es"|"en"|"it"|"de"|"fr"`; read current via `useLangStore((s)=>s.lang)` (import from `@/lib/i18n`).
- i18n entries: flat dotted keys in `const translations: Record<string, Record<Language,string>>`; existing `checkout.*` block at `i18n.ts:842-846`; one key/line, locales in `es,en,it,de,fr` order, 2-space indent, trailing comma, preceded by a `// Section: ...` comment.
- Backend test harness: `backend/tests/test_all_grant_enforcement.py` — `resend` stub at module top before `app.api` imports; in-memory `db` fixture; call `await list_circuits_for_checkout(user=u, db=db)`; bare `async def` (project asyncio auto-mode); `_seed` helper; `Circuit(name=..., ws_port=..., for_sale=..., is_beta=...)`.
- Current `list_circuits_for_checkout` (`backend/app/api/stripe_routes.py`) ends:
```python
    result = await db.execute(select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name))
    return [
        {"id": c.id, "name": c.name, "is_beta": c.is_beta}
        for c in result.scalars().all()
        if c.id not in active_circuit_ids
    ]
```
(the `active_circuit_ids` query + `if has_all: return []` precede it — leave both unchanged).

---

### Task 1: Backend — extend `list_circuits_for_checkout`

**Files:** Modify `backend/app/api/stripe_routes.py`; Create `backend/tests/test_checkout_circuits_3col.py`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_checkout_circuits_3col.py`:

```python
"""TDD — /api/stripe/circuits returns for_sale + includes beta&¬for_sale;
owned-exclusion stays scoped to purchasable (for_sale) circuits;
F2 has_all→[] preserved."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.stripe_routes import list_circuits_for_checkout  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserCircuitAccess, UserAllCircuitAccess,
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_returns_for_sale_field_and_includes_study(db):
    u = User(username="c", password_hash="x", is_admin=False)
    c_av = Circuit(name="AAA", ws_port=9101, for_sale=True, is_beta=False)
    c_test = Circuit(name="BBB", ws_port=9102, for_sale=True, is_beta=True)
    c_study = Circuit(name="CCC", ws_port=9103, for_sale=False, is_beta=True)
    c_hidden = Circuit(name="DDD", ws_port=9104, for_sale=False, is_beta=False)
    db.add_all([u, c_av, c_test, c_study, c_hidden]); await db.commit()

    out = await list_circuits_for_checkout(user=u, db=db)
    by_name = {r["name"]: r for r in out}

    assert set(by_name) == {"AAA", "BBB", "CCC"}  # hidden (¬for_sale&¬beta) excluded
    assert by_name["AAA"]["for_sale"] is True and by_name["AAA"]["is_beta"] is False
    assert by_name["BBB"]["for_sale"] is True and by_name["BBB"]["is_beta"] is True
    assert by_name["CCC"]["for_sale"] is False and by_name["CCC"]["is_beta"] is True
    assert [r["name"] for r in out] == ["AAA", "BBB", "CCC"]  # ordered by name


async def test_owned_exclusion_only_for_sale(db):
    now = datetime.now(timezone.utc)
    u = User(username="o", password_hash="x", is_admin=False)
    c_av = Circuit(name="AAA", ws_port=9111, for_sale=True, is_beta=False)
    c_study = Circuit(name="CCC", ws_port=9112, for_sale=False, is_beta=True)
    db.add_all([u, c_av, c_study]); await db.flush()
    # User "owns" both via per-circuit rows
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c_av.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=10)))
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c_study.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=10)))
    await db.commit()

    out = await list_circuits_for_checkout(user=u, db=db)
    names = {r["name"] for r in out}
    # owned for_sale circuit excluded; informational study circuit still shown
    assert "AAA" not in names
    assert "CCC" in names


async def test_all_grant_returns_empty_preserved(db):
    now = datetime.now(timezone.utc)
    u = User(username="a", password_hash="x", is_admin=False)
    c = Circuit(name="AAA", ws_port=9121, for_sale=True, is_beta=False)
    db.add_all([u, c]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await list_circuits_for_checkout(user=u, db=db) == []
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_checkout_circuits_3col.py -v`
Expected: `test_returns_for_sale_field_and_includes_study` FAILS (no `for_sale` key; "CCC" missing — `where(for_sale==True)` excludes it); `test_owned_exclusion_only_for_sale` FAILS ("CCC" missing); `test_all_grant_returns_empty_preserved` PASSES (F2 unchanged).

- [ ] **Step 3: Change the endpoint tail**

In `backend/app/api/stripe_routes.py`, replace exactly:

```python
    result = await db.execute(select(Circuit).where(Circuit.for_sale == True).order_by(Circuit.name))
    return [
        {"id": c.id, "name": c.name, "is_beta": c.is_beta}
        for c in result.scalars().all()
        if c.id not in active_circuit_ids
    ]
```

with:

```python
    result = await db.execute(
        select(Circuit)
        .where((Circuit.for_sale == True) | (Circuit.is_beta == True))  # noqa: E712
        .order_by(Circuit.name)
    )
    out = []
    for c in result.scalars().all():
        # Owned-exclusion only applies to purchasable (for_sale) circuits.
        # "En estudio" rows (is_beta & ¬for_sale) are informational and
        # always shown; a not-for-sale circuit isn't purchasable so an
        # active per-circuit grant on it must not hide it from the
        # informational list.
        if c.for_sale and c.id in active_circuit_ids:
            continue
        out.append({
            "id": c.id, "name": c.name,
            "is_beta": c.is_beta, "for_sale": c.for_sale,
        })
    return out
```

(Leave the `active_circuit_ids` query and `if has_all: return []` above untouched.)

- [ ] **Step 4: Run to verify PASS + full suite**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_checkout_circuits_3col.py -v` → 3 pass.
Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q` → full suite green (the F2 `test_all_grant_enforcement.py::test_checkout_list_excludes_when_all_grant` still passes — has_all path unchanged). Report count. If a pre-existing test asserted the exact 3-key dict shape `{id,name,is_beta}` for this endpoint, update only that assertion to include `for_sale` and document; investigate any other failure.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/stripe_routes.py backend/tests/test_checkout_circuits_3col.py
git commit -m "$(cat <<'EOF'
feat(checkout): /api/stripe/circuits returns for_sale + includes beta-only

Endpoint now returns for_sale per item and includes beta&¬for_sale
("En estudio") circuits; owned-exclusion scoped to purchasable (for_sale)
circuits; F2 all-grant→[] preserved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend — `api.ts` return type

**Files:** Modify `frontend/src/lib/api.ts:445-446`.

- [ ] **Step 1: Edit the inline type**

Replace exactly:

```ts
  getCheckoutCircuits: () =>
    fetchApi<{ id: number; name: string; is_beta: boolean }[]>("/api/stripe/circuits"),
```

with:

```ts
  getCheckoutCircuits: () =>
    fetchApi<{ id: number; name: string; is_beta: boolean; for_sale: boolean }[]>("/api/stripe/circuits"),
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit`
Expected: passes (CircuitSelector still uses the old shape until Task 4; adding an extra field is type-compatible with its local `Circuit` interface which omits `for_sale` — no error).

- [ ] **Step 3: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(checkout): type for_sale on getCheckoutCircuits

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: i18n — add `circuitSelector.*` keys (×5)

**Files:** Modify `frontend/src/lib/i18n.ts`.

- [ ] **Step 1: Insert the key block**

In `frontend/src/lib/i18n.ts`, locate the existing `checkout.*` block (the 4 keys ending with `"checkout.checkoutError": {...},`). Immediately AFTER that block's last line, insert this block verbatim (one key/line, 2-space indent, trailing commas):

```ts
  // === CircuitSelector (checkout circuit window) ===
  "circuitSelector.titleCircuit": { es: "Selecciona tu circuito", en: "Select your circuit", it: "Seleziona il tuo circuito", de: "Wähle deine Strecke", fr: "Choisis ton circuit" },
  "circuitSelector.titleDates": { es: "Selecciona los días del evento", en: "Select the event days", it: "Seleziona i giorni dell'evento", de: "Wähle die Veranstaltungstage", fr: "Choisis les jours de l'événement" },
  "circuitSelector.titleIncluded": { es: "Circuitos incluidos en tu plan", en: "Circuits included in your plan", it: "Circuiti inclusi nel tuo piano", de: "In deinem Plan enthaltene Strecken", fr: "Circuits inclus dans ton forfait" },
  "circuitSelector.planLabel": { es: "Plan:", en: "Plan:", it: "Piano:", de: "Plan:", fr: "Forfait :" },
  "circuitSelector.nCircuits": { es: "{n} circuitos", en: "{n} circuits", it: "{n} circuiti", de: "{n} Strecken", fr: "{n} circuits" },
  "circuitSelector.multiPrompt": { es: "Selecciona {n} circuitos", en: "Select {n} circuits", it: "Seleziona {n} circuiti", de: "Wähle {n} Strecken", fr: "Choisis {n} circuits" },
  "circuitSelector.multiCount": { es: "{sel} de {req} seleccionados", en: "{sel} of {req} selected", it: "{sel} di {req} selezionati", de: "{sel} von {req} ausgewählt", fr: "{sel} sur {req} sélectionnés" },
  "circuitSelector.includedSubtitle": { es: "Estos son los circuitos incluidos en tu plan", en: "These are the circuits included in your plan", it: "Questi sono i circuiti inclusi nel tuo piano", de: "Dies sind die in deinem Plan enthaltenen Strecken", fr: "Voici les circuits inclus dans ton forfait" },
  "circuitSelector.loading": { es: "Cargando circuitos...", en: "Loading circuits...", it: "Caricamento circuiti...", de: "Strecken werden geladen...", fr: "Chargement des circuits..." },
  "circuitSelector.empty": { es: "No hay circuitos disponibles", en: "No circuits available", it: "Nessun circuito disponibile", de: "Keine Strecken verfügbar", fr: "Aucun circuit disponible" },
  "circuitSelector.insufficient": { es: "Solo hay {n} circuitos disponibles, este plan requiere {req}.", en: "Only {n} circuits are available, this plan requires {req}.", it: "Sono disponibili solo {n} circuiti, questo piano ne richiede {req}.", de: "Es sind nur {n} Strecken verfügbar, dieser Plan benötigt {req}.", fr: "Seuls {n} circuits sont disponibles, ce forfait en requiert {req}." },
  "circuitSelector.sectionAvailable": { es: "Disponibles", en: "Available", it: "Disponibili", de: "Verfügbar", fr: "Disponibles" },
  "circuitSelector.sectionTesting": { es: "Disponibles en pruebas", en: "Available (testing)", it: "Disponibili in prova", de: "Verfügbar (Test)", fr: "Disponibles (test)" },
  "circuitSelector.sectionStudy": { es: "En estudio", en: "Under study", it: "In studio", de: "In Prüfung", fr: "À l'étude" },
  "circuitSelector.studySubtitle": { es: "Circuitos que aún no están a la venta — próximamente.", en: "Circuits not yet for sale — coming soon.", it: "Circuiti non ancora in vendita — prossimamente.", de: "Strecken noch nicht im Verkauf — demnächst.", fr: "Circuits pas encore en vente — bientôt." },
  "circuitSelector.badgeProvisional": { es: "Provisional", en: "Provisional", it: "Provvisorio", de: "Vorläufig", fr: "Provisoire" },
  "circuitSelector.btnRedirecting": { es: "Redirigiendo a pago...", en: "Redirecting to payment...", it: "Reindirizzamento al pagamento...", de: "Weiterleitung zur Zahlung...", fr: "Redirection vers le paiement..." },
  "circuitSelector.btnSelectDays": { es: "Seleccionar días", en: "Select days", it: "Seleziona giorni", de: "Tage wählen", fr: "Choisir les jours" },
  "circuitSelector.btnContinue": { es: "Continuar al pago", en: "Continue to payment", it: "Procedi al pagamento", de: "Weiter zur Zahlung", fr: "Continuer vers le paiement" },
  "circuitSelector.btnBack": { es: "Volver", en: "Back", it: "Indietro", de: "Zurück", fr: "Retour" },
  "circuitSelector.btnCancel": { es: "Cancelar", en: "Cancel", it: "Annulla", de: "Abbrechen", fr: "Annuler" },
  "circuitSelector.legendProvisionalPre": { es: "Los circuitos marcados como Provisional aún no se han probado en real. Si detectas algún problema, escríbenos a", en: "Circuits marked Provisional have not been tested live yet. If you spot any issue, write to us at", it: "I circuiti contrassegnati come Provvisorio non sono ancora stati testati dal vivo. Se noti un problema, scrivici a", de: "Als Vorläufig markierte Strecken wurden noch nicht live getestet. Wenn du ein Problem bemerkst, schreib uns an", fr: "Les circuits marqués Provisoire n'ont pas encore été testés en réel. Si tu repères un problème, écris-nous à" },
  "circuitSelector.legendProvisionalPost": { es: ".", en: ".", it: ".", de: ".", fr: "." },
  "circuitSelector.legendMissingPre": { es: "¿No encuentras tu circuito? Escríbenos a", en: "Can't find your circuit? Write to us at", it: "Non trovi il tuo circuito? Scrivici a", de: "Findest du deine Strecke nicht? Schreib uns an", fr: "Tu ne trouves pas ton circuit ? Écris-nous à" },
  "circuitSelector.legendMissingPost": { es: "para pedir su inclusión.", en: "to request it be added.", it: "per richiederne l'aggiunta.", de: "um die Aufnahme zu beantragen.", fr: "pour demander son ajout." },
  "circuitSelector.hintPick": { es: "Selecciona 1 o 2 días consecutivos", en: "Select 1 or 2 consecutive days", it: "Seleziona 1 o 2 giorni consecutivi", de: "Wähle 1 oder 2 aufeinanderfolgende Tage", fr: "Choisis 1 ou 2 jours consécutifs" },
  "circuitSelector.hintOneMore": { es: "Puedes seleccionar un día más (consecutivo) o continuar con 1", en: "You can select one more (consecutive) day or continue with 1", it: "Puoi selezionare un altro giorno (consecutivo) o continuare con 1", de: "Du kannst einen weiteren (aufeinanderfolgenden) Tag wählen oder mit 1 fortfahren", fr: "Tu peux choisir un jour de plus (consécutif) ou continuer avec 1" },
  "circuitSelector.hintTwoSelected": { es: "2 días seleccionados", en: "2 days selected", it: "2 giorni selezionati", de: "2 Tage ausgewählt", fr: "2 jours sélectionnés" },
  "circuitSelector.planBasicMonthly": { es: "Básico Mensual", en: "Basic Monthly", it: "Base Mensile", de: "Basis Monatlich", fr: "Basique Mensuel" },
  "circuitSelector.planBasicAnnual": { es: "Básico Anual", en: "Basic Annual", it: "Base Annuale", de: "Basis Jährlich", fr: "Basique Annuel" },
  "circuitSelector.planProMonthly": { es: "Pro Mensual", en: "Pro Monthly", it: "Pro Mensile", de: "Pro Monatlich", fr: "Pro Mensuel" },
  "circuitSelector.planProAnnual": { es: "Pro Anual", en: "Pro Annual", it: "Pro Annuale", de: "Pro Jährlich", fr: "Pro Annuel" },
  "circuitSelector.planEvent": { es: "Evento", en: "Event", it: "Evento", de: "Event", fr: "Événement" },
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit`
Expected: passes (pure data addition to the `translations` object; no usages yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add frontend/src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add circuitSelector.* keys (es/en/it/de/fr)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite `CircuitSelector.tsx` (i18n + 3 sections + Intl dates)

**Files:** Replace the entire contents of `frontend/src/components/checkout/CircuitSelector.tsx`.

This is a near-total presentational rewrite (pervasive i18n + grouping). Replace the WHOLE file with exactly:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useT, useLangStore, type Language } from "@/lib/i18n";

interface Circuit {
  id: number;
  name: string;
  is_beta: boolean;
  for_sale?: boolean;
}

const LOCALE_TAG: Record<Language, string> = {
  es: "es-ES", en: "en-GB", it: "it-IT", de: "de-DE", fr: "fr-FR",
};

function planKey(plan: string): string {
  switch (plan) {
    case "basic_monthly": return "circuitSelector.planBasicMonthly";
    case "basic_annual": return "circuitSelector.planBasicAnnual";
    case "pro_monthly": return "circuitSelector.planProMonthly";
    case "pro_annual": return "circuitSelector.planProAnnual";
    case "event": return "circuitSelector.planEvent";
    default: return "";
  }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Mini calendar for picking 1-2 consecutive days */
function EventDatePicker({
  selectedDates,
  onSelect,
}: {
  selectedDates: Date[];
  onSelect: (dates: Date[]) => void;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const localeTag = LOCALE_TAG[lang];

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  // Monday-first short weekday names in the active locale.
  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(localeTag, { weekday: "short" });
    const monday = new Date(2024, 0, 1); // 2024-01-01 is a Monday
    return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(monday, i)));
  }, [localeTag]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" })
      .format(new Date(viewYear, viewMonth, 1)),
    [localeTag, viewMonth, viewYear],
  );

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    let startDay = firstOfMonth.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewMonth, viewYear]);

  const canPrev = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  const handlePrev = () => {
    if (!canPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = (day: Date) => {
    if (day < today) return;
    if (selectedDates.length === 0) { onSelect([day]); return; }
    if (selectedDates.length === 1) {
      const first = selectedDates[0];
      if (isSameDay(day, first)) { onSelect([]); return; }
      const dayBefore = addDays(first, -1);
      const dayAfter = addDays(first, 1);
      if (isSameDay(day, dayBefore) && day >= today) {
        onSelect([day, first].sort((a, b) => a.getTime() - b.getTime())); return;
      }
      if (isSameDay(day, dayAfter)) { onSelect([first, day]); return; }
      onSelect([day]); return;
    }
    if (selectedDates.some((s) => isSameDay(s, day))) {
      onSelect(selectedDates.filter((s) => !isSameDay(s, day)));
    } else {
      onSelect([day]);
    }
  };

  const isSelected = (day: Date) => selectedDates.some((s) => isSameDay(s, day));
  const isPast = (day: Date) => day < today;
  const isEligibleSecond = (day: Date) => {
    if (selectedDates.length !== 1 || isPast(day)) return false;
    const first = selectedDates[0];
    return isSameDay(day, addDays(first, -1)) || isSameDay(day, addDays(first, 1));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canPrev}
          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNext}
          className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((d, i) => (
          <div key={i} className="text-center text-[10px] uppercase tracking-wider text-neutral-500 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const past = isPast(day);
          const sel = isSelected(day);
          const eligible = isEligibleSecond(day);
          return (
            <button
              key={toDateStr(day)}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={past}
              className={`
                aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all
                ${past ? "text-neutral-700 cursor-not-allowed" : ""}
                ${sel ? "bg-accent text-black font-bold" : ""}
                ${!sel && !past && eligible ? "ring-1 ring-accent/40 text-accent hover:bg-accent/20" : ""}
                ${!sel && !past && !eligible ? "text-neutral-300 hover:bg-white/[0.06]" : ""}
              `}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-500 mt-3 text-center">
        {selectedDates.length === 0 && t("circuitSelector.hintPick")}
        {selectedDates.length === 1 && t("circuitSelector.hintOneMore")}
        {selectedDates.length === 2 && t("circuitSelector.hintTwoSelected")}
      </p>
    </div>
  );
}

export function CircuitSelector({
  plan,
  circuitsToSelect = 1,
  informational = false,
  onSelect,
  onCancel,
}: {
  plan: string;
  circuitsToSelect?: number;
  informational?: boolean;
  onSelect: (circuitIds: number[], eventDates?: string[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const requiredCount = Math.max(1, circuitsToSelect || 1);
  const isMulti = requiredCount > 1;
  const isEvent = plan === "event";
  const [step, setStep] = useState<"circuit" | "dates">("circuit");
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getCheckoutCircuits()
      .then((data) => setCircuits(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Groups (spec-locked): Available = for_sale&¬beta, Testing = for_sale&beta,
  // Study = beta&¬for_sale (informational, never selectable/counted).
  const available = useMemo(
    () => circuits.filter((c) => c.for_sale && !c.is_beta), [circuits]);
  const testing = useMemo(
    () => circuits.filter((c) => c.for_sale && c.is_beta), [circuits]);
  const study = useMemo(
    () => circuits.filter((c) => c.is_beta && !c.for_sale), [circuits]);
  const purchasable = useMemo(
    () => [...available, ...testing], [available, testing]);

  const pk = planKey(plan);
  const planText = pk ? t(pk) : plan;

  const toggleCircuit = (circuitId: number) => {
    setSelectedIds((prev) => {
      if (isMulti) {
        if (prev.includes(circuitId)) return prev.filter((id) => id !== circuitId);
        if (prev.length >= requiredCount) return prev;
        return [...prev, circuitId];
      }
      return [circuitId];
    });
  };

  const handleContinue = () => {
    if (informational) { setSubmitting(true); onSelect([]); return; }
    if (selectedIds.length === 0) return;
    if (isMulti && selectedIds.length !== requiredCount) return;
    if (isEvent && step === "circuit") { setStep("dates"); return; }
    setSubmitting(true);
    if (isEvent && eventDates.length > 0) {
      onSelect(selectedIds, eventDates.map(toDateStr));
    } else {
      onSelect(selectedIds);
    }
  };

  const canContinue = informational
    ? true
    : step === "circuit"
      ? (isMulti ? selectedIds.length === requiredCount : selectedIds.length >= 1)
      : eventDates.length >= 1;

  const selectedCircuitName =
    !isMulti && selectedIds.length === 1
      ? circuits.find((c) => c.id === selectedIds[0])?.name
      : null;

  // Selectable row (Available / Testing in non-informational mode).
  const renderSelectable = (circuit: Circuit) => {
    const checked = selectedIds.includes(circuit.id);
    const atCap = isMulti && !checked && selectedIds.length >= requiredCount;
    return (
      <button
        key={circuit.id}
        onClick={() => toggleCircuit(circuit.id)}
        disabled={atCap}
        className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
          checked
            ? "border-accent bg-accent/10 text-white"
            : atCap
              ? "border-border bg-black text-neutral-500 opacity-50 cursor-not-allowed"
              : "border-border bg-black text-neutral-300 hover:border-neutral-600"
        }`}
      >
        <div className="flex items-center gap-3">
          {isMulti ? (
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? "border-accent bg-accent" : "border-neutral-600"}`}>
              {checked && (
                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          ) : (
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${checked ? "border-accent" : "border-neutral-600"}`}>
              {checked && <div className="w-2 h-2 rounded-full bg-accent" />}
            </div>
          )}
          <span className="font-medium">{circuit.name}</span>
          {circuit.is_beta && (
            <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {t("circuitSelector.badgeProvisional")}
            </span>
          )}
        </div>
      </button>
    );
  };

  // Read-only row (informational mode, and the Study section in every mode).
  const renderReadonly = (circuit: Circuit, dim: boolean) => (
    <div
      key={circuit.id}
      className={`w-full px-4 py-3 rounded-lg border border-border bg-black ${dim ? "text-neutral-500" : "text-neutral-300"}`}
    >
      <div className="flex items-center gap-3">
        <svg className={`w-4 h-4 flex-shrink-0 ${dim ? "text-neutral-700" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">{circuit.name}</span>
        {circuit.is_beta && (
          <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {t("circuitSelector.badgeProvisional")}
          </span>
        )}
      </div>
    </div>
  );

  const sectionHeader = (label: string, subtitle?: string) => (
    <div className="mt-4 first:mt-0 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      {subtitle && <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
  );

  const renderGroups = () => {
    const readonlyAll = informational;
    return (
      <div>
        {available.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionAvailable"))}
            <div className="space-y-2">
              {available.map((c) => readonlyAll ? renderReadonly(c, false) : renderSelectable(c))}
            </div>
          </div>
        )}
        {testing.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionTesting"))}
            <div className="space-y-2">
              {testing.map((c) => readonlyAll ? renderReadonly(c, false) : renderSelectable(c))}
            </div>
          </div>
        )}
        {study.length > 0 && (
          <div>
            {sectionHeader(t("circuitSelector.sectionStudy"), t("circuitSelector.studySubtitle"))}
            <div className="space-y-2">
              {study.map((c) => renderReadonly(c, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">
            {informational
              ? t("circuitSelector.titleIncluded")
              : step === "circuit"
                ? t("circuitSelector.titleCircuit")
                : t("circuitSelector.titleDates")}
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            {t("circuitSelector.planLabel")}{" "}
            <span className="text-accent font-medium">{planText}</span>
            {step === "dates" && selectedCircuitName && (
              <> · <span className="text-white">{selectedCircuitName}</span></>
            )}
            {step === "dates" && !selectedCircuitName && selectedIds.length > 1 && (
              <> · <span className="text-white">{t("circuitSelector.nCircuits", { n: selectedIds.length })}</span></>
            )}
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          {step === "circuit" && (
            <>
              {!informational && isMulti && (
                <div className="mb-4 text-center">
                  <p className="text-sm text-neutral-300">{t("circuitSelector.multiPrompt", { n: requiredCount })}</p>
                  <p className="text-xs text-neutral-500 mt-1">{t("circuitSelector.multiCount", { sel: selectedIds.length, req: requiredCount })}</p>
                </div>
              )}
              {informational && (
                <p className="text-sm text-neutral-400 mb-4 text-center">{t("circuitSelector.includedSubtitle")}</p>
              )}
              {loading ? (
                <div className="flex justify-center py-8">
                  <span className="text-neutral-400 animate-pulse">{t("circuitSelector.loading")}</span>
                </div>
              ) : circuits.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">{t("circuitSelector.empty")}</p>
                </div>
              ) : !informational && isMulti && purchasable.length < requiredCount ? (
                <div className="text-center py-8">
                  <p className="text-neutral-400">{t("circuitSelector.insufficient", { n: purchasable.length, req: requiredCount })}</p>
                </div>
              ) : (
                renderGroups()
              )}
            </>
          )}

          {step === "dates" && (
            <EventDatePicker selectedDates={eventDates} onSelect={setEventDates} />
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleContinue}
              disabled={!canContinue || submitting}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting
                ? t("circuitSelector.btnRedirecting")
                : step === "circuit" && isEvent
                  ? t("circuitSelector.btnSelectDays")
                  : t("circuitSelector.btnContinue")}
            </button>

            <button
              onClick={() => {
                if (step === "dates") { setStep("circuit"); setEventDates([]); }
                else { onCancel(); }
              }}
              className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
            >
              {step === "dates" ? t("circuitSelector.btnBack") : t("circuitSelector.btnCancel")}
            </button>
          </div>

          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              {t("circuitSelector.legendProvisionalPre")}{" "}
              <a href="mailto:info@kartingnow.com" className="text-neutral-400 underline hover:text-neutral-300 transition-colors">
                info@kartingnow.com
              </a>
              {t("circuitSelector.legendProvisionalPost")}
            </p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              {t("circuitSelector.legendMissingPre")}{" "}
              <a href="mailto:info@kartingnow.com" className="text-neutral-400 underline hover:text-neutral-300 transition-colors">
                info@kartingnow.com
              </a>
              {" "}{t("circuitSelector.legendMissingPost")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Replace the file**

Overwrite `frontend/src/components/checkout/CircuitSelector.tsx` with the content above (verbatim).

- [ ] **Step 2: Type-check + build**

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit`
Expected: passes. (`Language` is exported from `@/lib/i18n` — verified; if `tsc` reports `Language` is not exported, change the import to `import { useT, useLangStore } from "@/lib/i18n"; import type { Language } from "@/lib/i18n";` — same module, type-only import — and re-run. Report which form was needed.)

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual review checklist (reason about the code, no runtime harness exists)**

Confirm by reading the final file: (a) every previously-hardcoded Spanish string is now a `t("circuitSelector.*")` call (no literal ES remains except the brand "BBN" and the email address); (b) three sections render with i18n headers, empty sections omitted (`length > 0` guards); (c) Study rows use `renderReadonly(c, true)` — no radio/checkbox, not in `toggleCircuit`/`selectedIds`, dimmed; (d) `selectedIds`/`canContinue`/multi-cap math only ever involve `available`/`testing` (purchasable) — Study can't be selected or counted; the multi "insufficient" guard uses `purchasable.length`; (e) `informational` mode renders all sections read-only via `renderReadonly(c,false)` (Study still dimmed) and keeps `onSelect([])`; (f) event flow (`step==="dates"`, `EventDatePicker`) unchanged behaviourally; (g) `EventDatePicker` month/weekday names come from `Intl.DateTimeFormat(LOCALE_TAG[lang], …)`, Monday-first (built from 2024-01-01, a Monday); hints i18n'd; (h) both legends keep the `mailto:info@kartingnow.com` link, text from pre/post keys.

- [ ] **Step 4: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add frontend/src/components/checkout/CircuitSelector.tsx
git commit -m "$(cat <<'EOF'
feat(checkout): 3-section circuit window + full i18n

Disponibles / En pruebas / En estudio (last informational, never
selectable or counted); empty sections hidden; every string via
circuitSelector.* useT() keys; month/day names via Intl.DateTimeFormat.
Selectable/multi/event/informational flows for purchasable circuits
unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q`
Expected: green (Task 1 added 3 tests; F2 `test_all_grant_enforcement.py` still green). Report exact count.

- [ ] **Step 2: Frontend gates**

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit && npm run build`
Expected: both succeed, no errors/warnings introduced by these files.

- [ ] **Step 3: i18n completeness scan**

Run: `cd /Users/jizcue/boxboxnow-v2 && grep -nE '"[A-Za-zÁÉÍÓÚáéíóúñ¿¡][^"]*[a-záéíóúñ]"' frontend/src/components/checkout/CircuitSelector.tsx | grep -viE 'className|mailto:|viewBox|stroke|d="M|aria-|key=|@/lib|use client|circuitSelector\.' | grep -vE 'BB|N$'`
Expected: no Spanish UI sentences remain (only structural/JSX attribute strings, the brand letters, and the email). If any user-facing ES string remains, add a `circuitSelector.*` key for it (Task 3 pattern, ×5) and replace — document the addition.

- [ ] **Step 4: Report**

Report: backend suite count, tsc/build status, the i18n-scan result, and any key added in Step 3.

---

## Notes / Out of Scope
- Unchanged: F2 `has_all → []` + the `active_circuit_ids` query; `create_checkout_session`/Stripe/payment flow; `Circuit` model & DB; admin; iOS/Android (`/config/circuits`, different endpoint).
- "En estudio" is never purchasable (consistent with `for_sale=false`); rendered informational/dimmed in all modes.
- No literal side-by-side CSS columns (stacked labelled sections — `max-w-md` container constraint).
- The inline bold on "Provisional" inside the first legend sentence is intentionally dropped (the badge already conveys it on cards; keeps the legend a single clean i18n string). If the user wants it back, that's a follow-up.
- No new i18n infrastructure; uses the existing `useT()` param mechanism (`{param}`, first-occurrence `String.replace` — every placeholder appears once per string by construction).
- Deploy is the user's call post-merge (frontend rebuild via the standard `docker compose up -d --build`).
