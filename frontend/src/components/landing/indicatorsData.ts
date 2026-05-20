/**
 * Source of truth for the per-module indicator modals on the landing
 * page's pricing-comparison table. Drives `IndicatorsModal.tsx`.
 *
 * Mirror of the BBN indicators spreadsheet ("Análisis tarjetas e
 * indicadores BBN.xlsx"), with the duplicate "Tiempo de carrera" row
 * collapsed (Excel rows 4 + 23) and "Live timing" dropped from the
 * landing per product request.
 *
 * Each indicator has a `preview` that the modal renders as a small,
 * Tailwind-styled mock — copies the visual primitives of the real
 * dashboard cards/buttons/badges so it stays in sync via design
 * tokens without maintaining static PNGs.
 */

export type PlanKey = "ind_m" | "ind_a" | "end_b" | "end_pro_m" | "end_pro_a";
export type PlanInclusion = "yes" | "no" | "soon";

export type IndicatorPreview =
  | { kind: "metric"; value: string; unit?: string; tone?: "neutral" | "accent" | "green" | "orange" | "red" | "purple" | "yellow" }
  | { kind: "button"; variant: "box-call" | "driver-message" }
  | { kind: "badge"; variant: "pit-open" | "pit-closed" | "tier-fast" | "on-track" | "in-pit" }
  | { kind: "iconCount"; icon: "pit" | "karts"; value: string }
  | { kind: "list"; rows: { label: string; value: string; tone?: "neutral" | "accent" | "red" }[] }
  | { kind: "text" };

export interface IndicatorEntry {
  /** Stable id — also used as a fragment of the i18n key. */
  id: string;
  /** i18n key for the indicator label. */
  nameKey: string;
  /** Per-plan inclusion. */
  plans: Record<PlanKey, PlanInclusion>;
  /** Visual preview spec rendered in the modal. */
  preview: IndicatorPreview;
}

export interface IndicatorSection {
  /** Optional sub-section title (mobile groups its 4 sub-sections). */
  titleKey?: string;
  /** Whether the whole section is "Próximamente" — affects badge tone. */
  comingSoon?: boolean;
  indicators: IndicatorEntry[];
}

export interface IndicatorModule {
  /** Keyed by the landing row that opens this modal. */
  key: "race" | "box" | "mobile";
  titleKey: string;
  descriptionKey?: string;
  sections: IndicatorSection[];
}

// Plan helpers — keep the per-indicator declarations terse below.
const RACE_BOX_PLANS: Record<PlanKey, PlanInclusion> = {
  ind_m: "no", ind_a: "no", end_b: "yes", end_pro_m: "yes", end_pro_a: "yes",
};
const ALL_PLANS_SOON: Record<PlanKey, PlanInclusion> = {
  ind_m: "soon", ind_a: "soon", end_b: "soon", end_pro_m: "soon", end_pro_a: "soon",
};
const ENDURANCE_PLANS_SOON: Record<PlanKey, PlanInclusion> = {
  ind_m: "no", ind_a: "no", end_b: "soon", end_pro_m: "soon", end_pro_a: "soon",
};
// Sub-indicators of mobile sections are "X" for the plans where the parent
// section is "Próximamente". We render them as "yes" on those plans and "no"
// elsewhere; the section-level "comingSoon" flag drives the modal's badge.
const MOBILE_TIMING_PLANS: Record<PlanKey, PlanInclusion> = {
  ind_m: "yes", ind_a: "yes", end_b: "yes", end_pro_m: "yes", end_pro_a: "yes",
};
const MOBILE_BBN_PLANS: Record<PlanKey, PlanInclusion> = {
  ind_m: "no", ind_a: "no", end_b: "yes", end_pro_m: "yes", end_pro_a: "yes",
};
const MOBILE_BBN_PRO_ONLY_SOON: Record<PlanKey, PlanInclusion> = {
  ind_m: "no", ind_a: "no", end_b: "no", end_pro_m: "soon", end_pro_a: "soon",
};

// ─────────────────────────────────────────────────────────────────────
// Módulo Carrera — 21 indicadores
// ─────────────────────────────────────────────────────────────────────
const RACE_INDICATORS: IndicatorEntry[] = [
  { id: "race-time",                 nameKey: "landing.indicators.race.race-time",                 plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:45:32", unit: "h:mm:ss", tone: "neutral" } },
  { id: "avg-pace-20",               nameKey: "landing.indicators.race.avg-pace-20",               plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:11.842", tone: "accent" } },
  { id: "avg-pace-best3",            nameKey: "landing.indicators.race.avg-pace-best3",            plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:11.365", tone: "green" } },
  { id: "last-lap",                  nameKey: "landing.indicators.race.last-lap",                  plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:11.694", tone: "neutral" } },
  { id: "best-lap",                  nameKey: "landing.indicators.race.best-lap",                  plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:11.289", tone: "purple" } },
  { id: "total-laps",                nameKey: "landing.indicators.race.total-laps",                plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "47", tone: "neutral" } },
  { id: "stint-laps",                nameKey: "landing.indicators.race.stint-laps",                plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "12", tone: "neutral" } },
  { id: "pit-count",                 nameKey: "landing.indicators.race.pit-count",                 plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "3", tone: "neutral" } },
  { id: "kart-tier",                 nameKey: "landing.indicators.race.kart-tier",                 plans: RACE_BOX_PLANS, preview: { kind: "badge", variant: "tier-fast" } },
  { id: "stint-time",                nameKey: "landing.indicators.race.stint-time",                plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "18:24", unit: "mm:ss", tone: "neutral" } },
  { id: "pit-marker",                nameKey: "landing.indicators.race.pit-marker",                plans: RACE_BOX_PLANS, preview: { kind: "badge", variant: "on-track" } },
  { id: "pace-position",             nameKey: "landing.indicators.race.pace-position",             plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "P3", tone: "accent" } },
  { id: "time-to-max-stint",         nameKey: "landing.indicators.race.time-to-max-stint",         plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "07:13", unit: "mm:ss", tone: "orange" } },
  { id: "laps-to-max-stint",         nameKey: "landing.indicators.race.laps-to-max-stint",         plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "6", tone: "orange" } },
  { id: "avg-future-stint",          nameKey: "landing.indicators.race.avg-future-stint",          plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "1:11.612", tone: "accent" } },
  { id: "karts-near-pit",            nameKey: "landing.indicators.race.karts-near-pit",            plans: RACE_BOX_PLANS, preview: { kind: "iconCount", icon: "karts", value: "4" } },
  { id: "box-call",                  nameKey: "landing.indicators.race.box-call",                  plans: RACE_BOX_PLANS, preview: { kind: "button", variant: "box-call" } },
  { id: "driver-message",            nameKey: "landing.indicators.race.driver-message",            plans: RACE_BOX_PLANS, preview: { kind: "button", variant: "driver-message" } },
  { id: "pit-open-closed",           nameKey: "landing.indicators.race.pit-open-closed",           plans: RACE_BOX_PLANS, preview: { kind: "badge", variant: "pit-open" } },
  { id: "driver-on-track-time",      nameKey: "landing.indicators.race.driver-on-track-time",      plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "Matías",   value: "42:18", tone: "neutral" },
      { label: "Carlos",   value: "31:05", tone: "neutral" },
      { label: "Lucía",    value: "28:50", tone: "neutral" },
    ] } },
  { id: "driver-min-time-remaining", nameKey: "landing.indicators.race.driver-min-time-remaining", plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "Matías",   value: "12 min", tone: "red" },
      { label: "Carlos",   value: "—",      tone: "accent" },
      { label: "Lucía",    value: "4 min",  tone: "neutral" },
    ] } },
];

// ─────────────────────────────────────────────────────────────────────
// Módulo Box — 7 indicadores
// ─────────────────────────────────────────────────────────────────────
const BOX_INDICATORS: IndicatorEntry[] = [
  { id: "box-score",               nameKey: "landing.indicators.box.box-score",               plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "87", unit: "/100", tone: "green" } },
  { id: "karts-in-pit-list",       nameKey: "landing.indicators.box.karts-in-pit-list",       plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "K17 · CT",       value: "92", tone: "accent" },
      { label: "K22 · ZHOBOLOV", value: "78", tone: "neutral" },
    ] } },
  { id: "karts-in-pit-time",       nameKey: "landing.indicators.box.karts-in-pit-time",       plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "K17", value: "00:48" },
      { label: "K22", value: "01:12" },
    ] } },
  { id: "karts-in-pit-stint-info", nameKey: "landing.indicators.box.karts-in-pit-stint-info", plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "K17", value: "v32 · 18:04" },
      { label: "K22", value: "v29 · 22:15" },
    ] } },
  { id: "current-pit-time",        nameKey: "landing.indicators.box.current-pit-time",        plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "00:48", unit: "mm:ss", tone: "orange" } },
  { id: "pit-count-remaining",     nameKey: "landing.indicators.box.pit-count-remaining",     plans: RACE_BOX_PLANS, preview: { kind: "metric", value: "3 / 5", tone: "neutral" } },
  { id: "pit-history",             nameKey: "landing.indicators.box.pit-history",             plans: RACE_BOX_PLANS, preview: { kind: "list", rows: [
      { label: "Pit 1", value: "v12 · 00:52" },
      { label: "Pit 2", value: "v24 · 00:49" },
      { label: "Pit 3", value: "v36 · 00:50" },
    ] } },
];

// ─────────────────────────────────────────────────────────────────────
// App móvil — 4 sub-secciones (texto, sin visual)
// ─────────────────────────────────────────────────────────────────────
const MOBILE_TIMING: IndicatorEntry[] = [
  "race-time", "stint-time", "best-stint-lap", "last-lap", "position-timing",
  "total-laps", "stint-laps", "gap-ahead", "gap-behind",
  "sectors", "best-s1", "best-s2", "best-s3",
].map((id) => ({
  id, nameKey: `landing.indicators.mobile.timing.${id}`,
  plans: MOBILE_TIMING_PLANS, preview: { kind: "text" },
}));

const MOBILE_BBN: IndicatorEntry[] = [
  ...["pace-position", "avg-lap-20", "avg-best3", "avg-future-stint",
      "time-to-max-stint", "laps-to-max-stint", "kart-tier",
      "theoretical-best", "delta-sectors", "delta-best-s1", "delta-best-s2", "delta-best-s3",
      "delta-current-sectors", "delta-current-s1", "delta-current-s2", "delta-current-s3"].map<IndicatorEntry>((id) => ({
    id, nameKey: `landing.indicators.mobile.bbn.${id}`,
    plans: MOBILE_BBN_PLANS, preview: { kind: "text" },
  })),
  ...["real-position", "real-gap-ahead", "real-gap-behind"].map<IndicatorEntry>((id) => ({
    id, nameKey: `landing.indicators.mobile.bbn.${id}`,
    plans: MOBILE_BBN_PRO_ONLY_SOON, preview: { kind: "text" },
  })),
];

const MOBILE_BOX: IndicatorEntry[] = [
  "current-pit", "box-score", "pits-done-min", "pit-window",
].map((id) => ({
  id, nameKey: `landing.indicators.mobile.box.${id}`,
  plans: MOBILE_BBN_PLANS, preview: { kind: "text" },
}));

const MOBILE_GPS: IndicatorEntry[] = [
  "delta-best-lap", "delta-prev-lap", "gforce-dial", "gforce-numbers",
  "gps-speed", "current-lap-realtime",
].map((id) => ({
  id, nameKey: `landing.indicators.mobile.gps.${id}`,
  plans: MOBILE_TIMING_PLANS, preview: { kind: "text" },
}));

// Silence the unused-warning if a plan helper goes temporarily unused.
void ALL_PLANS_SOON;
void ENDURANCE_PLANS_SOON;

export const INDICATOR_MODULES: Record<"race" | "box" | "mobile", IndicatorModule> = {
  race: {
    key: "race",
    titleKey: "landing.indicators.race.title",
    descriptionKey: "landing.indicators.race.desc",
    sections: [{ indicators: RACE_INDICATORS }],
  },
  box: {
    key: "box",
    titleKey: "landing.indicators.box.title",
    descriptionKey: "landing.indicators.box.desc",
    sections: [{ indicators: BOX_INDICATORS }],
  },
  mobile: {
    key: "mobile",
    titleKey: "landing.indicators.mobile.title",
    descriptionKey: "landing.indicators.mobile.desc",
    sections: [
      { titleKey: "landing.indicators.mobile.timing.title", comingSoon: true, indicators: MOBILE_TIMING },
      { titleKey: "landing.indicators.mobile.bbn.title",    comingSoon: true, indicators: MOBILE_BBN    },
      { titleKey: "landing.indicators.mobile.box.title",    comingSoon: true, indicators: MOBILE_BOX    },
      { titleKey: "landing.indicators.mobile.gps.title",    comingSoon: true, indicators: MOBILE_GPS    },
    ],
  },
};

export const PLAN_COLUMNS: { key: PlanKey; labelKey: string }[] = [
  { key: "ind_m",     labelKey: "landing.indicators.plan.ind_m" },
  { key: "ind_a",     labelKey: "landing.indicators.plan.ind_a" },
  { key: "end_b",     labelKey: "landing.indicators.plan.end_b" },
  { key: "end_pro_m", labelKey: "landing.indicators.plan.end_pro_m" },
  { key: "end_pro_a", labelKey: "landing.indicators.plan.end_pro_a" },
];
