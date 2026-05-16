"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";
import { formatDifferential } from "@/lib/formatters";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Driver {
  driver_name: string;
  differential_ms: number;
}

interface Team {
  id: string; // unique key for dnd-kit
  position: number;
  kart: number;
  team_name: string;
  drivers: Driver[];
}


let idCounter = 0;
function newId() {
  return `team-${++idCounter}-${Date.now()}`;
}

export function TeamEditor() {
  const t = useT();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  // Off-by-default: the user prefers manual control of the teams panel
  // and not have a `teams_updated` broadcast clobber their edits at
  // race-start. Backend default also changed to False; the `?? false`
  // below is a belt-and-braces fallback for legacy sessions where the
  // API returns null.
  const [autoLoad, setAutoLoad] = useState(false);
  const teamsUpdatedAt = useRaceStore((s) => s.teamsUpdatedAt);
  const initialLoadDone = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Initial load + read auto_load_teams setting
  useEffect(() => {
    (async () => {
      try {
        const session = await api.getActiveSession();
        if (session) {
          setAutoLoad(session.auto_load_teams ?? false);
        }
      } catch {}
      await loadTeams();
      initialLoadDone.current = true;
    })();
  }, []);

  // Reload when backend pushes teams_updated (race start driver auto-load)
  // Only if auto-load is enabled
  useEffect(() => {
    if (initialLoadDone.current && teamsUpdatedAt > 0 && autoLoad) {
      loadTeams();
    }
  }, [teamsUpdatedAt, autoLoad]);

  const toggleAutoLoad = async (value: boolean) => {
    setAutoLoad(value);
    try {
      await api.updateSession({ auto_load_teams: value });
    } catch {}
  };

  const loadTeams = async () => {
    try {
      const data = await api.getTeams();
      setTeams(
        data.map((t: any) => ({
          id: newId(),
          position: t.position,
          kart: t.kart,
          team_name: t.team_name,
          drivers:
            t.drivers?.map((d: any) => ({
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
      // Recalculate positions based on current order
      const toSave = teams.map((t, i) => ({
        position: i + 1,
        kart: t.kart,
        team_name: t.team_name,
        drivers: t.drivers,
      }));
      await api.replaceTeams(toSave);
    } catch (e: any) {
      alert(t("teams.errorSaving") + ": " + e.message);
    }
    setSaving(false);
  };

  const importFromLiveTiming = async () => {
    setImporting(true);
    try {
      const data = await api.getLiveTeams();
      if (!data.teams || data.teams.length === 0) {
        alert(t("teams.noLiveTeams"));
        setImporting(false);
        return;
      }

      const existingByKart = new Map(teams.map((t) => [t.kart, t]));

      const merged: Team[] = data.teams.map((lt: any) => {
        const existing = existingByKart.get(lt.kart);
        if (existing) {
          const existingDrivers = new Map(
            existing.drivers.map((d) => [d.driver_name.toLowerCase(), d])
          );
          const mergedDrivers = [...existing.drivers];
          for (const ld of lt.drivers || []) {
            if (!existingDrivers.has(ld.driver_name.toLowerCase())) {
              mergedDrivers.push({
                driver_name: ld.driver_name,
                differential_ms: 0,
              });
            }
          }
          return {
            ...existing,
            position: lt.position,
            team_name: lt.team_name || existing.team_name,
            drivers: mergedDrivers,
          };
        }
        return {
          id: newId(),
          position: lt.position,
          kart: lt.kart,
          team_name: lt.team_name,
          drivers: (lt.drivers || []).map((d: any) => ({
            driver_name: d.driver_name,
            differential_ms: 0,
          })),
        };
      });

      setTeams(merged);
      alert(
        data.hasDrivers
          ? t("teams.importedWithDrivers", { count: data.kartCount })
          : t("teams.importedNoDrivers", { count: data.kartCount })
      );
    } catch (e: any) {
      alert(t("teams.errorImporting") + ": " + e.message);
    }
    setImporting(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setTeams((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // Update position numbers
      return reordered.map((t, i) => ({ ...t, position: i + 1 }));
    });
  };

  const updateTeam = (id: string, field: keyof Team, value: any) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const addDriver = (teamId: string) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              drivers: [
                ...t.drivers,
                { driver_name: "", differential_ms: 0 },
              ],
            }
          : t
      )
    );
  };

  const removeDriver = (teamId: string, driverIdx: number) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, drivers: t.drivers.filter((_, i) => i !== driverIdx) }
          : t
      )
    );
  };

  const updateDriver = (
    teamId: string,
    driverIdx: number,
    field: keyof Driver,
    value: any
  ) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              drivers: t.drivers.map((d, i) =>
                i === driverIdx ? { ...d, [field]: value } : d
              ),
            }
          : t
      )
    );
  };

  const addTeam = () => {
    setTeams((prev) => [
      ...prev,
      {
        id: newId(),
        position: prev.length + 1,
        kart: 0,
        team_name: "",
        drivers: [],
      },
    ]);
  };

  const removeTeam = (id: string) => {
    setTeams((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return filtered.map((t, i) => ({ ...t, position: i + 1 }));
    });
    if (expandedTeam === id) setExpandedTeam(null);
  };

  if (loading)
    return (
      <p className="text-neutral-200 text-sm">{t("teams.loadingTeams")}</p>
    );

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider">
          {t("teams.title")}
          <span className="text-neutral-500 ml-2 normal-case tracking-normal hidden sm:inline">
            {t("teams.dragHint")}
          </span>
        </h3>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Auto-load toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer group" title={t("teams.autoLoadHint")}>
            <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300 transition-colors uppercase tracking-wider hidden sm:inline">
              {t("teams.autoLoad")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoLoad}
              onClick={() => toggleAutoLoad(!autoLoad)}
              className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
                autoLoad ? "bg-accent" : "bg-border/60"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  autoLoad ? "translate-x-4" : ""
                }`}
              />
            </button>
          </label>

          <div className="w-px h-5 bg-border/40 hidden sm:block" />

          <button
            onClick={importFromLiveTiming}
            disabled={importing}
            className="bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 text-xs font-medium px-3 py-2 rounded-lg border border-accent/20 transition-colors"
          >
            {importing ? t("teams.importing") : t("teams.loadLive")}
          </button>
          <button
            onClick={addTeam}
            className="bg-black text-neutral-400 hover:text-white text-xs px-3 py-2 rounded-lg border border-border transition-colors"
          >
            {t("teams.addTeam")}
          </button>
          <button
            onClick={saveTeams}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? t("teams.saving") : t("teams.save")}
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={teams.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
            {teams.map((team) => (
              <SortableTeamRow
                key={team.id}
                team={team}
                isExpanded={expandedTeam === team.id}
                onToggle={() =>
                  setExpandedTeam(
                    expandedTeam === team.id ? null : team.id
                  )
                }
                onUpdate={updateTeam}
                onRemove={removeTeam}
                onAddDriver={addDriver}
                onRemoveDriver={removeDriver}
                onUpdateDriver={updateDriver}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {teams.length === 0 && (
        <p className="text-neutral-400 text-sm text-center py-8">
          {t("teams.noTeams")}
        </p>
      )}
    </div>
  );
}

// --- Sortable Team Row ---

function SortableTeamRow({
  team,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onAddDriver,
  onRemoveDriver,
  onUpdateDriver,
}: {
  team: Team;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, field: keyof Team, value: any) => void;
  onRemove: (id: string) => void;
  onAddDriver: (id: string) => void;
  onRemoveDriver: (id: string, idx: number) => void;
  onUpdateDriver: (
    id: string,
    idx: number,
    field: keyof Driver,
    value: any
  ) => void;
}) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as any,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border rounded-lg overflow-hidden"
    >
      {/* Team header */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-2 hover:bg-black/50 transition-colors">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-700 hover:text-neutral-400 px-0.5 sm:px-1 touch-none shrink-0"
          title={t("teams.dragReorder")}
        >
          <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="9" r="1.5" />
            <circle cx="9" cy="9" r="1.5" />
            <circle cx="3" cy="15" r="1.5" />
            <circle cx="9" cy="15" r="1.5" />
          </svg>
        </button>

        <span className="text-neutral-400 w-5 sm:w-7 text-center text-xs font-mono shrink-0">
          {team.position}
        </span>

        <input
          type="number"
          value={team.kart}
          onChange={(e) =>
            onUpdate(team.id, "kart", Number(e.target.value))
          }
          className="w-12 sm:w-14 bg-black border border-border rounded-md px-1.5 sm:px-2 py-1 text-sm text-center shrink-0"
          placeholder="K"
        />

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <input
            value={team.team_name}
            onChange={(e) =>
              onUpdate(team.id, "team_name", e.target.value)
            }
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-black border border-border rounded-md px-2 py-1 text-sm"
            placeholder={t("teams.teamPlaceholder")}
          />
        </div>

        <span
          className="text-[10px] sm:text-[11px] text-neutral-400 shrink-0 cursor-pointer"
          onClick={onToggle}
        >
          <span className="hidden sm:inline">
            {team.drivers.length === 0
              ? t("teams.noPilots")
              : `${team.drivers.length} ${t("teams.pilots")}`}
          </span>
          <span className="sm:hidden">{team.drivers.length}p</span>
        </span>

        {team.drivers.some((d) => d.differential_ms !== 0) && (
          <span className="text-[10px] text-accent font-medium px-1 py-0.5 rounded bg-accent/10 shrink-0 hidden sm:inline">
            DIFF
          </span>
        )}

        <button
          onClick={() => onRemove(team.id)}
          className="text-neutral-700 hover:text-red-400 text-xs px-1.5 sm:px-2 transition-colors shrink-0"
        >
          X
        </button>
      </div>

      {/* Expanded drivers */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-3 bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
              {t("teams.driversHint")}
            </span>
            <button
              onClick={() => onAddDriver(team.id)}
              className="text-[11px] text-accent hover:text-accent-hover transition-colors"
            >
              {t("teams.addDriver")}
            </button>
          </div>

          {team.drivers.length === 0 ? (
            <p className="text-[11px] text-neutral-700 py-2">
              {t("teams.noPilotsHint")}
            </p>
          ) : (
            <div className="space-y-2">
              {team.drivers.map((driver, driverIdx) => {
                return (
                <div key={driverIdx} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
                  <input
                    value={driver.driver_name}
                    onChange={(e) =>
                      onUpdateDriver(
                        team.id,
                        driverIdx,
                        "driver_name",
                        e.target.value
                      )
                    }
                    className="flex-1 min-w-[120px] bg-surface border border-border rounded-md px-2 py-1.5 text-sm"
                    placeholder={t("teams.driverPlaceholder")}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="100"
                      value={driver.differential_ms}
                      onChange={(e) =>
                        onUpdateDriver(
                          team.id,
                          driverIdx,
                          "differential_ms",
                          Number(e.target.value)
                        )
                      }
                      className="w-20 sm:w-24 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-right font-mono"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-neutral-400">ms</span>
                  </div>
                  <span
                    className={`text-xs w-12 sm:w-14 text-center font-mono ${
                      driver.differential_ms > 0
                        ? "text-tier-1"
                        : driver.differential_ms < 0
                        ? "text-accent"
                        : "text-neutral-400"
                    }`}
                  >
                    {formatDifferential(driver.differential_ms)}
                  </span>
                  <button
                    onClick={() => onRemoveDriver(team.id, driverIdx)}
                    className="text-neutral-700 hover:text-red-400 text-sm px-1.5 py-1 transition-colors"
                  >
                    X
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
