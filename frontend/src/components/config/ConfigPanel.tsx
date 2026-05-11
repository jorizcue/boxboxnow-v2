"use client";

import { useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { TeamEditor } from "@/components/config/TeamEditor";
import { useT } from "@/lib/i18n";
import { StyledSelect } from "@/components/shared/StyledSelect";

interface Circuit {
  id: number;
  name: string;
  length_m: number | null;
  pit_time_s: number | null;
  ws_port: number;
}

interface RaceSession {
  id: number;
  circuit_id: number;
  circuit_name: string | null;
  name: string;
  duration_min: number;
  min_stint_min: number;
  max_stint_min: number;
  min_pits: number;
  pit_time_s: number;
  min_driver_time_min: number;
  team_drivers_count: number;
  rain: boolean;
  pit_closed_start_min: number;
  pit_closed_end_min: number;
  box_lines: number;
  box_karts: number;
  our_kart_number: number;
  refresh_interval_s: number;
  is_active: boolean;
}

export function ConfigPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RaceSessionEditor />
        <TeamEditor />
      </div>
    </div>
  );
}

// --- Race Session (circuit + params) ---

function RaceSessionEditor() {
  const t = useT();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [session, setSession] = useState<RaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [circuitId, setCircuitId] = useState<number>(0);
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(180);
  const [minStint, setMinStint] = useState(15);
  const [maxStint, setMaxStint] = useState(40);
  const [minPits, setMinPits] = useState(3);
  const [pitTime, setPitTime] = useState(120);
  const [minDriverTime, setMinDriverTime] = useState(30);
  // Number of drivers in the team. 0 = "not configured": the pit gate
  // falls back to counting Apex-observed drivers, which means the
  // driver-min-time constraint won't fire until at least one driver
  // change has happened. Setting it up-front to the real roster size
  // makes the gate enforce the constraint from lap 1.
  const [teamDriversCount, setTeamDriversCount] = useState(0);
  const [rain, setRain] = useState(false);
  const [pitClosedStart, setPitClosedStart] = useState(0);
  const [pitClosedEnd, setPitClosedEnd] = useState(0);
  const [boxLines, setBoxLines] = useState(2);
  const [boxKarts, setBoxKarts] = useState(30);
  const [ourKart, setOurKart] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [circuitsData, sessionData] = await Promise.all([
        api.getMyCircuits(),
        api.getActiveSession(),
      ]);
      setCircuits(circuitsData);
      if (sessionData) {
        setSession(sessionData);
        applySession(sessionData);
      }

      // If the user has exactly one accessible circuit, pre-select it
      // in the race-session form so the dropdown isn't blank on entry.
      // Covers two situations the user runs into in practice:
      //   1. Brand-new pilot with no saved session yet — the dropdown
      //      defaulted to "0" / placeholder and they had to pick it
      //      manually even though there was only one option.
      //   2. Existing pilot whose saved session points at a circuit
      //      that's no longer in their access list (admin revoked it,
      //      trial expired, etc.). The previous loadData kept the
      //      stale circuit_id; we now snap to the only valid choice.
      // We don't auto-PATCH the session — just pre-fill the form. The
      // pilot still hits Save to persist, which preserves the existing
      // "explicit save" flow and lets them bail with a refresh if the
      // pre-selection is wrong (e.g. multi-circuit user temporarily
      // narrowed by an outage).
      if (circuitsData.length === 1) {
        const only = circuitsData[0];
        const sessionHasIt = sessionData?.circuit_id === only.id;
        if (!sessionHasIt) {
          setCircuitId(only.id);
          if (only.pit_time_s) setPitTime(only.pit_time_s);
          setName(only.name);
        }
      }
    } catch {}
    setLoading(false);
  };

  const applySession = (s: RaceSession) => {
    setCircuitId(s.circuit_id);
    setName(s.name);
    setDurationMin(s.duration_min);
    setMinStint(s.min_stint_min);
    setMaxStint(s.max_stint_min);
    setMinPits(s.min_pits);
    setPitTime(s.pit_time_s);
    setMinDriverTime(s.min_driver_time_min);
    setTeamDriversCount(s.team_drivers_count ?? 0);
    setRain(s.rain);
    setPitClosedStart(s.pit_closed_start_min ?? 0);
    setPitClosedEnd(s.pit_closed_end_min ?? 0);
    setBoxLines(s.box_lines);
    setBoxKarts(s.box_karts);
    setOurKart(s.our_kart_number);
  };

  const handleCircuitChange = (id: number) => {
    setCircuitId(id);
    const c = circuits.find((c) => c.id === id);
    if (c) {
      if (c.pit_time_s) setPitTime(c.pit_time_s);
      setName(c.name);
    }
  };

  const saveSession = async () => {
    if (!circuitId) return;
    setSaving(true);
    try {
      // Only send `circuit_id` on PATCH when it actually changed. The
      // backend's `update_session` triggers a full stop+restart of the
      // UserSession when `data.circuit_id != user_session.circuit_id`
      // (config_routes.py:157-162), which would wipe every kart's stint
      // history, pit count and lap buffer. Omitting the field when it
      // hasn't changed keeps the guard silent and preserves live race
      // state across routine parameter saves (min_pits, duration…). See
      // pending_issues.md Issue #4.
      const circuitChanged = !session || session.circuit_id !== circuitId;
      const data: Record<string, unknown> = {
        name,
        duration_min: durationMin,
        min_stint_min: minStint,
        max_stint_min: maxStint,
        min_pits: minPits,
        pit_time_s: pitTime,
        min_driver_time_min: minDriverTime,
        team_drivers_count: teamDriversCount,
        rain,
        pit_closed_start_min: pitClosedStart,
        pit_closed_end_min: pitClosedEnd,
        box_lines: boxLines,
        box_karts: boxKarts,
        our_kart_number: ourKart,
        refresh_interval_s: 1,
      };
      if (circuitChanged) {
        data.circuit_id = circuitId;
      }

      let result;
      if (session) {
        result = await api.updateSession(data);
      } else {
        // POST always requires circuit_id for a fresh session row.
        result = await api.createSession({ ...data, circuit_id: circuitId });
      }
      setSession(result);

      // Update zustand store config immediately so UI reflects changes
      useRaceStore.setState((state) => ({
        config: {
          ...state.config,
          circuitLengthM: selectedCircuit?.length_m ?? state.config.circuitLengthM,
          pitTimeS: pitTime,
          ourKartNumber: ourKart,
          minPits,
          maxStintMin: maxStint,
          minStintMin: minStint,
          durationMin: durationMin,
          boxLines: boxLines,
          boxKarts: boxKarts,
          minDriverTimeMin: minDriverTime,
          teamDriversCount,
          pitClosedStartMin: pitClosedStart,
          pitClosedEndMin: pitClosedEnd,
          rain,
        },
      }));

      // Only force a WS reconnect when the CIRCUIT actually changed —
      // that's the only case where the backend does stop_session +
      // ensure_monitoring, which invalidates the current WS's reference
      // to the old UserSession state. For routine parameter saves
      // (min_pits, duration, pit_time…) the backend reconfigures in
      // place and broadcasts a fresh snapshot over the same WS, so
      // reconnecting would only destroy live state for no gain.
      if (circuitChanged) {
        useRaceStore.getState().requestWsReconnect();
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-xl p-6 border border-border">
        <p className="text-neutral-400 text-sm">{t("config.loading")}</p>
      </div>
    );
  }

  const selectedCircuit = circuits.find((c) => c.id === circuitId);

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 sm:p-6 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[11px] text-neutral-200 uppercase tracking-wider font-bold">{t("config.raceSession")}</h2>
        {session && (
          <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded uppercase tracking-wider font-medium">
            {t("config.active")}
          </span>
        )}
      </div>

      <div className="space-y-5">
        {/* Circuit selector */}
        <div>
          <label className="block text-[10px] text-neutral-400 mb-1.5 uppercase tracking-wider font-bold">{t("config.circuit")}</label>
          <StyledSelect
            value={circuitId}
            onChange={(v) => handleCircuitChange(Number(v))}
            options={circuits.map((c) => ({
              value: c.id,
              label: `${c.name}${c.length_m ? ` (${c.length_m}m)` : ""}`,
            }))}
            placeholder={t("config.selectCircuit")}
          />
          {selectedCircuit && (
            <p className="text-[10px] text-neutral-500 mt-1">
              {t("config.wsPort")}: {selectedCircuit.ws_port}
              {selectedCircuit.pit_time_s && ` · Pit: ${selectedCircuit.pit_time_s}s`}
              {selectedCircuit.length_m && ` · ${selectedCircuit.length_m}m`}
            </p>
          )}
        </div>

        {/* Grouped field sections — mirrors the iOS / Android layout so
            the same parameter lives under the same group across platforms
            (Carrera / Pit Stops / Stints y Pilotos). */}
        <ConfigSection title={t("config.sectionRace")}>
          <ConfigCard label={t("config.ourKart")} value={ourKart} onChange={setOurKart} highlight />
          <ConfigCard label={t("config.duration")} value={durationMin} onChange={setDurationMin} />
          <ConfigCard label={t("config.minPits")} value={minPits} onChange={setMinPits} />
        </ConfigSection>

        <ConfigSection title={t("config.sectionPitStops")}>
          <ConfigCard label={t("config.pitTime")} value={pitTime} onChange={setPitTime} />
          <ConfigCard label={t("config.pitClosedStart")} value={pitClosedStart} onChange={setPitClosedStart} />
          <ConfigCard label={t("config.pitClosedEnd")} value={pitClosedEnd} onChange={setPitClosedEnd} />
        </ConfigSection>

        <ConfigSection title={t("config.sectionStints")}>
          <ConfigCard label={t("config.minStint")} value={minStint} onChange={setMinStint} />
          <ConfigCard label={t("config.maxStint")} value={maxStint} onChange={setMaxStint} />
          <ConfigCard label={t("config.minDriverTime")} value={minDriverTime} onChange={setMinDriverTime} />
          <ConfigCard label={t("config.teamDriversCount")} value={teamDriversCount} onChange={setTeamDriversCount} />
        </ConfigSection>

        {/* Save button */}
        <button
          onClick={saveSession}
          disabled={!circuitId || saving}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-bold py-2.5 rounded-lg transition-colors text-sm uppercase tracking-wider"
        >
          {saving ? t("config.saving") : session ? t("config.updateSession") : t("config.createSession")}
        </button>
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-accent uppercase tracking-widest mb-2">
        {title}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  );
}

function ConfigCard({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl border ${highlight ? "border-accent/30" : "border-border"} p-2.5 sm:p-3 flex flex-col items-center`}>
      <label className="text-[8px] sm:text-[9px] text-neutral-400 uppercase tracking-widest font-bold mb-1.5 text-center leading-tight">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full bg-black/50 border border-border rounded-lg px-2 py-1.5 text-center text-base sm:text-lg font-mono font-bold ${highlight ? "text-accent" : "text-white"} focus:border-accent/50 focus:outline-none transition-colors`}
      />
    </div>
  );
}
