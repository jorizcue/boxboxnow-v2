"use client";

import { useState, useEffect } from "react";
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
  const [rain, setRain] = useState(false);
  const [pitClosedStart, setPitClosedStart] = useState(0);
  const [pitClosedEnd, setPitClosedEnd] = useState(0);
  const [boxLines, setBoxLines] = useState(2);
  const [boxKarts, setBoxKarts] = useState(30);
  const [ourKart, setOurKart] = useState(0);
  const [refreshInterval, setRefreshInterval] = useState(30);

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
    setRain(s.rain);
    setPitClosedStart(s.pit_closed_start_min ?? 0);
    setPitClosedEnd(s.pit_closed_end_min ?? 0);
    setBoxLines(s.box_lines);
    setBoxKarts(s.box_karts);
    setOurKart(s.our_kart_number);
    setRefreshInterval(s.refresh_interval_s);
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
      const data = {
        circuit_id: circuitId,
        name,
        duration_min: durationMin,
        min_stint_min: minStint,
        max_stint_min: maxStint,
        min_pits: minPits,
        pit_time_s: pitTime,
        min_driver_time_min: minDriverTime,
        rain,
        pit_closed_start_min: pitClosedStart,
        pit_closed_end_min: pitClosedEnd,
        box_lines: boxLines,
        box_karts: boxKarts,
        our_kart_number: ourKart,
        refresh_interval_s: refreshInterval,
      };

      let result;
      if (session) {
        result = await api.updateSession(data);
      } else {
        result = await api.createSession(data);
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
          pitClosedStartMin: pitClosedStart,
          pitClosedEndMin: pitClosedEnd,
        },
      }));

      // Session saved -> monitoring auto-starts, reconnect WS to pick up new state
      useRaceStore.getState().requestWsReconnect();
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
    <div className="bg-white/[0.03] rounded-xl p-6 border border-border">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[11px] text-neutral-200 uppercase tracking-wider">{t("config.raceSession")}</h2>
        {session && (
          <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded uppercase tracking-wider font-medium">
            {t("config.active")}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Circuit selector */}
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1.5 uppercase tracking-wider">{t("config.circuit")}</label>
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
            <p className="text-[10px] text-neutral-400 mt-1">
              {t("config.wsPort")}: {selectedCircuit.ws_port}
              {selectedCircuit.pit_time_s && ` · Pit: ${selectedCircuit.pit_time_s}s`}
              {selectedCircuit.length_m && ` · ${selectedCircuit.length_m}m`}
            </p>
          )}
        </div>

        {/* Two column grid for params */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("config.duration")} value={durationMin} onChange={setDurationMin} />
          <Field label={t("config.ourKart")} value={ourKart} onChange={setOurKart} />
          <Field label={t("config.minStint")} value={minStint} onChange={setMinStint} />
          <Field label={t("config.maxStint")} value={maxStint} onChange={setMaxStint} />
          <Field label={t("config.minPits")} value={minPits} onChange={setMinPits} />
          <Field label={t("config.pitTime")} value={pitTime} onChange={setPitTime} />
          <Field label={t("config.minDriverTime")} value={minDriverTime} onChange={setMinDriverTime} />
          <Field label={t("config.refresh")} value={refreshInterval} onChange={setRefreshInterval} />
          <Field label={t("config.pitClosedStart")} value={pitClosedStart} onChange={setPitClosedStart} />
          <Field label={t("config.pitClosedEnd")} value={pitClosedEnd} onChange={setPitClosedEnd} />
          <Field label={t("config.boxLines")} value={boxLines} onChange={setBoxLines} />
          <Field label={t("config.boxKarts")} value={boxKarts} onChange={setBoxKarts} />
        </div>

        {/* Rain toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rain}
            onChange={(e) => setRain(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-neutral-300">{t("config.rainMode")}</span>
          <span className="text-[10px] text-neutral-400">{t("config.rainHint")}</span>
        </label>

        {/* Save button */}
        <button
          onClick={saveSession}
          disabled={!circuitId || saving}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2.5 rounded-lg"
        >
          {saving ? t("config.saving") : session ? t("config.updateSession") : t("config.createSession")}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono"
      />
    </div>
  );
}

