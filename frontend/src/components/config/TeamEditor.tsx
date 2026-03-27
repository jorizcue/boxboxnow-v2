"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDifferential } from "@/lib/formatters";

interface Driver {
  driver_name: string;
  differential_ms: number;
}

interface Team {
  position: number;
  kart: number;
  team_name: string;
  drivers: Driver[];
}

export function TeamEditor() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const data = await api.getTeams();
      setTeams(
        data.map((t: any) => ({
          position: t.position,
          kart: t.kart,
          team_name: t.team_name,
          drivers: t.drivers?.map((d: any) => ({
            driver_name: d.driver_name,
            differential_ms: d.differential_ms,
          })) || [],
        }))
      );
    } catch {}
    setLoading(false);
  };

  const saveTeams = async () => {
    setSaving(true);
    try {
      await api.replaceTeams(teams);
    } catch (e: any) {
      alert("Error guardando: " + e.message);
    }
    setSaving(false);
  };

  const importFromLiveTiming = async () => {
    setImporting(true);
    try {
      const data = await api.getLiveTeams();
      if (!data.teams || data.teams.length === 0) {
        alert("No hay equipos en el live timing. Asegurate de estar conectado a Apex.");
        setImporting(false);
        return;
      }

      // Merge: keep existing driver differentials if the team already exists
      const existingByKart = new Map(teams.map((t) => [t.kart, t]));

      const merged: Team[] = data.teams.map((liveTeam: any) => {
        const existing = existingByKart.get(liveTeam.kart);

        if (existing) {
          // Merge drivers: keep differentials, add new drivers from live
          const existingDrivers = new Map(
            existing.drivers.map((d) => [d.driver_name.toLowerCase(), d])
          );

          const mergedDrivers: Driver[] = [...existing.drivers];

          // Add any new drivers from live timing that aren't in existing
          for (const ld of liveTeam.drivers || []) {
            if (!existingDrivers.has(ld.driver_name.toLowerCase())) {
              mergedDrivers.push({ driver_name: ld.driver_name, differential_ms: 0 });
            }
          }

          return {
            position: liveTeam.position,
            kart: liveTeam.kart,
            team_name: liveTeam.team_name || existing.team_name,
            drivers: mergedDrivers,
          };
        }

        // New team from live timing
        return {
          position: liveTeam.position,
          kart: liveTeam.kart,
          team_name: liveTeam.team_name,
          drivers: (liveTeam.drivers || []).map((d: any) => ({
            driver_name: d.driver_name,
            differential_ms: 0,
          })),
        };
      });

      setTeams(merged);

      const msg = data.hasDrivers
        ? `Importados ${data.kartCount} equipos con pilotos del live timing.`
        : `Importados ${data.kartCount} equipos. No hay desglose de pilotos en esta carrera.`;
      alert(msg);
    } catch (e: any) {
      alert("Error importando: " + e.message);
    }
    setImporting(false);
  };

  const updateTeam = (idx: number, field: keyof Team, value: any) => {
    setTeams((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const addDriver = (teamIdx: number) => {
    setTeams((prev) => {
      const updated = [...prev];
      updated[teamIdx] = {
        ...updated[teamIdx],
        drivers: [...updated[teamIdx].drivers, { driver_name: "", differential_ms: 0 }],
      };
      return updated;
    });
  };

  const removeDriver = (teamIdx: number, driverIdx: number) => {
    setTeams((prev) => {
      const updated = [...prev];
      updated[teamIdx] = {
        ...updated[teamIdx],
        drivers: updated[teamIdx].drivers.filter((_, i) => i !== driverIdx),
      };
      return updated;
    });
  };

  const updateDriver = (teamIdx: number, driverIdx: number, field: keyof Driver, value: any) => {
    setTeams((prev) => {
      const updated = [...prev];
      const drivers = [...updated[teamIdx].drivers];
      drivers[driverIdx] = { ...drivers[driverIdx], [field]: value };
      updated[teamIdx] = { ...updated[teamIdx], drivers };
      return updated;
    });
  };

  const addTeam = () => {
    const nextPos = teams.length > 0 ? Math.max(...teams.map((t) => t.position)) + 1 : 1;
    setTeams((prev) => [...prev, { position: nextPos, kart: 0, team_name: "", drivers: [] }]);
  };

  const removeTeam = (idx: number) => {
    setTeams((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) return <p className="text-neutral-500 text-sm">Cargando equipos...</p>;

  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] text-neutral-500 uppercase tracking-wider">Equipos y Pilotos</h3>
        <div className="flex gap-2">
          <button
            onClick={importFromLiveTiming}
            disabled={importing}
            className="bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 text-xs font-medium px-3 py-1.5 rounded-lg border border-accent/20 transition-colors"
          >
            {importing ? "Importando..." : "Cargar del LiveTiming"}
          </button>
          <button
            onClick={addTeam}
            className="bg-black text-neutral-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-border transition-colors"
          >
            + Equipo
          </button>
          <button
            onClick={saveTeams}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="space-y-0.5">
        {teams.map((team, teamIdx) => (
          <div key={teamIdx} className="border border-border rounded-lg overflow-hidden">
            {/* Team header */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/50 transition-colors"
              onClick={() => setExpandedTeam(expandedTeam === teamIdx ? null : teamIdx)}
            >
              <span className="text-neutral-600 w-7 text-center text-xs font-mono">{team.position}</span>
              <input
                type="number"
                value={team.kart}
                onChange={(e) => updateTeam(teamIdx, "kart", Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-14 bg-black border border-border rounded-md px-2 py-1 text-sm text-center"
              />
              <input
                value={team.team_name}
                onChange={(e) => updateTeam(teamIdx, "team_name", e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-black border border-border rounded-md px-2 py-1 text-sm"
                placeholder="Nombre equipo"
              />
              <span className="text-[11px] text-neutral-600 w-20 text-center">
                {team.drivers.length === 0
                  ? "sin pilotos"
                  : `${team.drivers.length} piloto(s)`}
              </span>
              {team.drivers.some((d) => d.differential_ms !== 0) && (
                <span className="text-[10px] text-accent font-medium px-1.5 py-0.5 rounded bg-accent/10">DIFF</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeTeam(teamIdx); }}
                className="text-neutral-700 hover:text-red-400 text-xs px-2 transition-colors"
              >
                X
              </button>
            </div>

            {/* Expanded drivers */}
            {expandedTeam === teamIdx && (
              <div className="border-t border-border px-3 py-3 bg-black/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-neutral-600 uppercase tracking-wider">
                    Pilotos &mdash; El diferencial ajusta el clustering. Positivo = mas lento que la referencia.
                  </span>
                  <button
                    onClick={() => addDriver(teamIdx)}
                    className="text-[11px] text-accent hover:text-accent-hover transition-colors"
                  >
                    + Piloto
                  </button>
                </div>

                {team.drivers.length === 0 ? (
                  <p className="text-[11px] text-neutral-700 py-2">
                    Sin pilotos. Pulsa "Cargar del LiveTiming" o anade manualmente.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {team.drivers.map((driver, driverIdx) => (
                      <div key={driverIdx} className="flex items-center gap-2">
                        <input
                          value={driver.driver_name}
                          onChange={(e) => updateDriver(teamIdx, driverIdx, "driver_name", e.target.value)}
                          className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-sm"
                          placeholder="Nombre del piloto"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="100"
                            value={driver.differential_ms}
                            onChange={(e) => updateDriver(teamIdx, driverIdx, "differential_ms", Number(e.target.value))}
                            className="w-24 bg-surface border border-border rounded-md px-2 py-1 text-sm text-right font-mono"
                            placeholder="0"
                          />
                          <span className="text-[11px] text-neutral-600 w-6">ms</span>
                        </div>
                        <span
                          className={`text-xs w-14 text-center font-mono ${
                            driver.differential_ms > 0
                              ? "text-tier-1"
                              : driver.differential_ms < 0
                              ? "text-accent"
                              : "text-neutral-600"
                          }`}
                        >
                          {formatDifferential(driver.differential_ms)}
                        </span>
                        <button
                          onClick={() => removeDriver(teamIdx, driverIdx)}
                          className="text-neutral-700 hover:text-red-400 text-xs px-1 transition-colors"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {teams.length === 0 && (
        <p className="text-neutral-600 text-sm text-center py-8">
          Sin equipos. Pulsa "Cargar del LiveTiming" para importar o "+ Equipo" para crear manualmente.
        </p>
      )}
    </div>
  );
}
