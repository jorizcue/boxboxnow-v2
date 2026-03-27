"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

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

  const formatDiff = (ms: number): string => {
    if (ms === 0) return "REF";
    const sign = ms > 0 ? "+" : "";
    const seconds = (ms / 1000).toFixed(1);
    return `${sign}${seconds}s`;
  };

  if (loading) return <p className="text-gray-500 text-sm">Cargando equipos...</p>;

  return (
    <div className="bg-card rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm text-gray-400">EQUIPOS Y PILOTOS</h3>
        <div className="flex gap-2">
          <button
            onClick={addTeam}
            className="bg-surface text-gray-300 text-xs px-3 py-1.5 rounded border border-gray-700"
          >
            + Equipo
          </button>
          <button
            onClick={saveTeams}
            disabled={saving}
            className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {teams.map((team, teamIdx) => (
          <div key={teamIdx} className="border border-gray-800 rounded">
            {/* Team header row */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface/50"
              onClick={() => setExpandedTeam(expandedTeam === teamIdx ? null : teamIdx)}
            >
              <span className="text-gray-500 w-8 text-center text-xs">{team.position}</span>
              <input
                type="number"
                value={team.kart}
                onChange={(e) => updateTeam(teamIdx, "kart", Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-14 bg-surface border border-gray-700 rounded px-2 py-1 text-sm text-center"
                placeholder="Kart"
              />
              <input
                value={team.team_name}
                onChange={(e) => updateTeam(teamIdx, "team_name", e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-surface border border-gray-700 rounded px-2 py-1 text-sm"
                placeholder="Nombre equipo"
              />
              <span className="text-xs text-gray-500 w-20 text-center">
                {team.drivers.length} piloto(s)
              </span>
              {team.drivers.some((d) => d.differential_ms !== 0) && (
                <span className="text-xs text-yellow-400">DIFF</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeTeam(teamIdx); }}
                className="text-red-500 hover:text-red-400 text-xs px-2"
              >
                X
              </button>
            </div>

            {/* Expanded: drivers */}
            {expandedTeam === teamIdx && (
              <div className="border-t border-gray-800 px-3 py-2 bg-surface/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">
                    PILOTOS - El diferencial ajusta el ritmo medio para el clustering.
                    Positivo = piloto mas lento que la referencia.
                  </span>
                  <button
                    onClick={() => addDriver(teamIdx)}
                    className="text-xs text-accent hover:text-accent/80"
                  >
                    + Piloto
                  </button>
                </div>

                {team.drivers.length === 0 ? (
                  <p className="text-xs text-gray-600 py-1">Sin pilotos configurados</p>
                ) : (
                  <div className="space-y-1">
                    {team.drivers.map((driver, driverIdx) => (
                      <div key={driverIdx} className="flex items-center gap-2">
                        <input
                          value={driver.driver_name}
                          onChange={(e) => updateDriver(teamIdx, driverIdx, "driver_name", e.target.value)}
                          className="flex-1 bg-bg border border-gray-700 rounded px-2 py-1 text-sm"
                          placeholder="Nombre del piloto"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="100"
                            value={driver.differential_ms}
                            onChange={(e) => updateDriver(teamIdx, driverIdx, "differential_ms", Number(e.target.value))}
                            className="w-24 bg-bg border border-gray-700 rounded px-2 py-1 text-sm text-right"
                            placeholder="ms"
                          />
                          <span className="text-xs text-gray-400 w-12">ms</span>
                        </div>
                        <span
                          className={`text-xs w-16 text-center font-mono ${
                            driver.differential_ms > 0
                              ? "text-red-400"
                              : driver.differential_ms < 0
                              ? "text-green-400"
                              : "text-gray-500"
                          }`}
                        >
                          {formatDiff(driver.differential_ms)}
                        </span>
                        <button
                          onClick={() => removeDriver(teamIdx, driverIdx)}
                          className="text-red-500 hover:text-red-400 text-xs px-1"
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
        <p className="text-gray-600 text-sm text-center py-4">
          Sin equipos. Pulsa "+ Equipo" para empezar.
        </p>
      )}
    </div>
  );
}
