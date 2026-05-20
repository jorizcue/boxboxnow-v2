/**
 * Source of truth for the per-module indicator breakdowns shown inline
 * inside the landing page's pricing-comparison table. Each row of the
 * comparison table tagged with `inlineKey` ("race" | "box" | "mobile")
 * expands to show the indicators of that module here.
 *
 * Mirror of the BBN indicators spreadsheet ("Análisis tarjetas e
 * indicadores BBN.xlsx"), with the duplicate "Tiempo de carrera" row
 * collapsed (Excel rows 4 + 23) and "Live timing" dropped per product
 * request.
 */

export type PlanKey = "ind_m" | "ind_a" | "end_b" | "end_pro_m" | "end_pro_a";
export type PlanInclusion = "yes" | "no" | "soon";

export interface IndicatorEntry {
  /** Stable id — also used as a fragment of the i18n key. */
  id: string;
  /** i18n key for the indicator label. */
  nameKey: string;
  /** Per-plan inclusion. */
  plans: Record<PlanKey, PlanInclusion>;
}

export interface IndicatorSection {
  /** Optional sub-section title (mobile groups its 4 sub-sections). */
  titleKey?: string;
  /** Whether the whole section is "Próximamente" — affects badge tone. */
  comingSoon?: boolean;
  indicators: IndicatorEntry[];
}

export interface IndicatorModule {
  /** Keyed by the landing row that expands inline. */
  key: "race" | "box" | "mobile";
  titleKey: string;
  sections: IndicatorSection[];
}

// Plan helpers — keep the per-indicator declarations terse below.
const RACE_BOX_PLANS: Record<PlanKey, PlanInclusion> = {
  ind_m: "no", ind_a: "no", end_b: "yes", end_pro_m: "yes", end_pro_a: "yes",
};
// Sub-indicators of mobile sections show the per-plan inclusion that will
// apply once the mobile app launches. The section-level "comingSoon" flag
// drives the badge inside the inline expansion.
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
  "race-time", "avg-pace-20", "avg-pace-best3", "last-lap", "best-lap",
  "total-laps", "stint-laps", "pit-count", "kart-tier", "stint-time",
  "pit-marker", "pace-position", "time-to-max-stint", "laps-to-max-stint",
  "avg-future-stint", "karts-near-pit", "box-call", "driver-message",
  "pit-open-closed", "driver-on-track-time", "driver-min-time-remaining",
].map((id) => ({
  id,
  nameKey: `landing.indicators.race.${id}`,
  plans: RACE_BOX_PLANS,
}));

// ─────────────────────────────────────────────────────────────────────
// Módulo Box — 7 indicadores
// ─────────────────────────────────────────────────────────────────────
const BOX_INDICATORS: IndicatorEntry[] = [
  "box-score", "karts-in-pit-list", "karts-in-pit-time",
  "karts-in-pit-stint-info", "current-pit-time", "pit-count-remaining",
  "pit-history",
].map((id) => ({
  id,
  nameKey: `landing.indicators.box.${id}`,
  plans: RACE_BOX_PLANS,
}));

// ─────────────────────────────────────────────────────────────────────
// App móvil — 4 sub-secciones
// ─────────────────────────────────────────────────────────────────────
const MOBILE_TIMING: IndicatorEntry[] = [
  "race-time", "stint-time", "best-stint-lap", "last-lap", "position-timing",
  "total-laps", "stint-laps", "gap-ahead", "gap-behind",
  "sectors", "best-s1", "best-s2", "best-s3",
].map((id) => ({
  id,
  nameKey: `landing.indicators.mobile.timing.${id}`,
  plans: MOBILE_TIMING_PLANS,
}));

const MOBILE_BBN: IndicatorEntry[] = [
  ...["pace-position", "avg-lap-20", "avg-best3", "avg-future-stint",
      "time-to-max-stint", "laps-to-max-stint", "kart-tier",
      "theoretical-best", "delta-sectors", "delta-best-s1", "delta-best-s2", "delta-best-s3",
      "delta-current-sectors", "delta-current-s1", "delta-current-s2", "delta-current-s3"].map<IndicatorEntry>((id) => ({
    id,
    nameKey: `landing.indicators.mobile.bbn.${id}`,
    plans: MOBILE_BBN_PLANS,
  })),
  ...["real-position", "real-gap-ahead", "real-gap-behind"].map<IndicatorEntry>((id) => ({
    id,
    nameKey: `landing.indicators.mobile.bbn.${id}`,
    plans: MOBILE_BBN_PRO_ONLY_SOON,
  })),
];

const MOBILE_BOX: IndicatorEntry[] = [
  "current-pit", "box-score", "pits-done-min", "pit-window",
].map((id) => ({
  id,
  nameKey: `landing.indicators.mobile.box.${id}`,
  plans: MOBILE_BBN_PLANS,
}));

const MOBILE_GPS: IndicatorEntry[] = [
  "delta-best-lap", "delta-prev-lap", "gforce-dial", "gforce-numbers",
  "gps-speed", "current-lap-realtime",
].map((id) => ({
  id,
  nameKey: `landing.indicators.mobile.gps.${id}`,
  plans: MOBILE_TIMING_PLANS,
}));

export const INDICATOR_MODULES: Record<"race" | "box" | "mobile", IndicatorModule> = {
  race: {
    key: "race",
    titleKey: "landing.indicators.race.title",
    sections: [{ indicators: RACE_INDICATORS }],
  },
  box: {
    key: "box",
    titleKey: "landing.indicators.box.title",
    sections: [{ indicators: BOX_INDICATORS }],
  },
  mobile: {
    key: "mobile",
    titleKey: "landing.indicators.mobile.title",
    sections: [
      { titleKey: "landing.indicators.mobile.timing.title", comingSoon: true, indicators: MOBILE_TIMING },
      { titleKey: "landing.indicators.mobile.bbn.title",    comingSoon: true, indicators: MOBILE_BBN    },
      { titleKey: "landing.indicators.mobile.box.title",    comingSoon: true, indicators: MOBILE_BOX    },
      { titleKey: "landing.indicators.mobile.gps.title",    comingSoon: true, indicators: MOBILE_GPS    },
    ],
  },
};
