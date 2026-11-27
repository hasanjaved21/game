import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BattleCanvas,
  BattleCanvasHandle,
  TopBoatAction,
} from './components/BattleCanvas';
import { BattleWheel } from './components/BattleWheel';
import { TeamRoster } from './components/TeamRoster';
import { createInitialWorld } from './data/presets';
import {
  BattleLogEntry,
  SpinPairResult,
  Team,
  WheelEntry,
} from './types/game';
import { soundEngine } from './utils/audio';
import {
  clearSavedGame,
  loadSavedGame,
  saveGameState,
} from './utils/storage';

const CUSTOM_COLOR_PRESETS = [
  '#10B981',
  '#6366F1',
  '#F43F5E',
  '#0EA5E9',
  '#A855F7',
  '#84CC16',
  '#F59E0B',
  '#1E293B',
];

function getContrastTextColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#FFFFFF';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 165 ? '#0F172A' : '#FFFFFF';
}

export default function App() {
  const initialStartup = useMemo(() => {
    const saved = loadSavedGame();
    if (saved) {
      return {
        teams: saved.teams,
        units: saved.units,
        boats: saved.boats,
        alliances: saved.alliances,
        popWinner: saved.popWinner,
        attachedEntry: saved.attachedEntry,
        secondEntry: saved.secondEntry,
        spinHistory: saved.spinHistory,
      };
    }
    const fresh = createInitialWorld();
    return {
      teams: fresh.teams,
      units: fresh.units,
      boats: fresh.boats,
      alliances: {} as Record<string, string[]>,
      popWinner: null as WheelEntry | null,
      attachedEntry: null as WheelEntry | null,
      secondEntry: null as WheelEntry | null,
      spinHistory: [] as SpinPairResult[],
    };
  }, []);

  const [teams, setTeams] = useState<Team[]>(initialStartup.teams);
  const [unitCounts, setUnitCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const u of initialStartup.units) {
      counts[u.teamId] = (counts[u.teamId] ?? 0) + 1;
    }
    for (const b of initialStartup.boats) {
      counts[b.teamId] = (counts[b.teamId] ?? 0) + b.passengers.length;
    }
    return counts;
  });
  const [boatStatus, setBoatStatus] = useState<
    Record<string, { alive: boolean; passengers: number }>
  >(() => {
    const map: Record<string, { alive: boolean; passengers: number }> = {};
    for (const b of initialStartup.boats) {
      map[b.teamId] = {
        alive: true,
        passengers: (map[b.teamId]?.passengers ?? 0) + b.passengers.length,
      };
    }
    return map;
  });

  const [selectedUnitCount, setSelectedUnitCount] = useState(0);
  const [selectedBoatCount, setSelectedBoatCount] = useState(0);
  const [topBoatAction, setTopBoatAction] = useState<TopBoatAction | null>(null);

  // Symmetric alliances map: teamId -> array of allied teamIds
  const [alliances, setAlliances] = useState<Record<string, string[]>>(
    initialStartup.alliances
  );

  // Spinner state
  const [popWinner, setPopWinner] = useState<WheelEntry | null>(
    initialStartup.popWinner
  );
  const [attachedEntry, setAttachedEntry] = useState<WheelEntry | null>(
    initialStartup.attachedEntry
  );
  const [secondEntry, setSecondEntry] = useState<WheelEntry | null>(
    initialStartup.secondEntry
  );
  const [spinHistory, setSpinHistory] = useState<SpinPairResult[]>(
    initialStartup.spinHistory
  );
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState(CUSTOM_COLOR_PRESETS[0]);

  const canvasHandleRef = useRef<BattleCanvasHandle | null>(null);
  const latestMetaRef = useRef({
    teams,
    alliances,
    popWinner,
    attachedEntry,
    secondEntry,
    spinHistory,
  });
  latestMetaRef.current = {
    teams,
    alliances,
    popWinner,
    attachedEntry,
    secondEntry,
    spinHistory,
  };

  const persistNow = useCallback(() => {
    const snap = canvasHandleRef.current?.getSnapshot();
    if (!snap) return;
    const meta = latestMetaRef.current;
    const mergedTeams = meta.teams.map((t) => {
      const live = snap.teams.find((st) => st.id === t.id);
      return live ? { ...t, kills: live.kills, losses: live.losses } : t;
    });
    saveGameState({
      version: 1,
      savedAt: Date.now(),
      teams: mergedTeams,
      units: snap.units,
      boats: snap.boats,
      alliances: meta.alliances,
      popWinner: meta.popWinner,
      attachedEntry: meta.attachedEntry,
      secondEntry: meta.secondEntry,
      spinHistory: meta.spinHistory,
    });
  }, []);

  useEffect(() => {
    persistNow();
  }, [
    teams,
    alliances,
    popWinner,
    attachedEntry,
    secondEntry,
    spinHistory,
    persistNow,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(persistNow, 1500);
    const onBeforeUnload = () => persistNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistNow();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [persistNow]);

  const handleResetSave = useCallback(() => {
    clearSavedGame();
    const fresh = createInitialWorld();
    setTeams(fresh.teams);
    setAlliances({});
    setPopWinner(null);
    setAttachedEntry(null);
    setSecondEntry(null);
    setSpinHistory([]);
    setBattleLog([]);
    canvasHandleRef.current?.resetWorld(fresh);
  }, []);

  const handleStatsSync = useCallback(
    (
      counts: Record<string, number>,
      boats: Record<string, { alive: boolean; passengers: number }>,
      selUnits: number,
      selBoats: number,
      nextTopAction: TopBoatAction | null
    ) => {
      setUnitCounts(counts);
      setBoatStatus(boats);
      setSelectedUnitCount(selUnits);
      setSelectedBoatCount(selBoats);
      setTopBoatAction((prev) => {
        if (!prev && !nextTopAction) return prev;
        if (
          prev &&
          nextTopAction &&
          prev.boatId === nextTopAction.boatId &&
          prev.teamColor === nextTopAction.teamColor &&
          prev.teamName === nextTopAction.teamName &&
          prev.canLoad === nextTopAction.canLoad &&
          prev.canUnload === nextTopAction.canUnload &&
          prev.passengers === nextTopAction.passengers
        ) {
          return prev;
        }
        return nextTopAction;
      });
    },
    []
  );

  const handleBattleLog = useCallback((entry: BattleLogEntry) => {
    setBattleLog((prev) => [entry, ...prev].slice(0, 12));
  }, []);

  const handleToggleAlliance = (teamA: string, teamB: string) => {
    setAlliances((prev) => {
      const listA = prev[teamA] ?? [];
      const listB = prev[teamB] ?? [];
      const alreadyAllied = listA.includes(teamB);

      const nextA = alreadyAllied
        ? listA.filter((id) => id !== teamB)
        : [...listA, teamB];
      const nextB = alreadyAllied
        ? listB.filter((id) => id !== teamA)
        : [...listB, teamA];

      const nameA = teams.find((t) => t.id === teamA)?.name ?? 'Nation';
      const nameB = teams.find((t) => t.id === teamB)?.name ?? 'Nation';
      const colorA = teams.find((t) => t.id === teamA)?.color ?? '#0F172A';

      handleBattleLog({
        id: `ally-${Date.now()}`,
        text: alreadyAllied
          ? `${nameA} & ${nameB} ended alliance`
          : `${nameA} & ${nameB} became allies`,
        color: colorA,
        timestamp: Date.now(),
      });

      return {
        ...prev,
        [teamA]: nextA,
        [teamB]: nextB,
      };
    });
  };

  const handlePop5SpinLanded = (entry: WheelEntry) => {
    setPopWinner(entry);
    if (entry.teamId) {
      canvasHandleRef.current?.spawnPopulation(entry.teamId, 5);
    }
  };

  const handleFirstSpinLanded = (entry: WheelEntry) => {
    setAttachedEntry(entry);
    setSecondEntry(null);
  };

  const handleSecondSpinLanded = (entry: WheelEntry) => {
    setSecondEntry(entry);
    if (attachedEntry) {
      if (
        attachedEntry.teamId &&
        entry.teamId &&
        attachedEntry.teamId !== entry.teamId
      ) {
        canvasHandleRef.current?.convertMembers(
          entry.teamId,
          attachedEntry.teamId,
          5
        );
      }
      setSpinHistory((prev) =>
        [
          {
            id: `pair-${Date.now()}`,
            first: attachedEntry,
            second: entry,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 10)
      );
    }
  };

  const handleClearPair = () => {
    setAttachedEntry(null);
    setSecondEntry(null);
  };

  const handleRenameTeam = (teamId: string, newName: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, name: newName } : t))
    );
    if (popWinner?.teamId === teamId) {
      setPopWinner((prev) => (prev ? { ...prev, name: newName } : null));
    }
    if (attachedEntry?.teamId === teamId) {
      setAttachedEntry((prev) => (prev ? { ...prev, name: newName } : null));
    }
    if (secondEntry?.teamId === teamId) {
      setSecondEntry((prev) => (prev ? { ...prev, name: newName } : null));
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  const handleAddNewTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed) return;

    const draftTeam: Team = {
      id: `team-custom-${Date.now()}`,
      name: trimmed,
      color: newTeamColor,
      kills: 0,
      losses: 0,
      homeX: 500,
      homeY: 320,
      dockX: 550,
      dockY: 380,
    };

    const placed = canvasHandleRef.current?.addTeamWithArmy(draftTeam, 8);
    const finalTeam: Team = placed ? { ...draftTeam, ...placed } : draftTeam;

    setTeams((prev) => [...prev, finalTeam]);
    setNewTeamName('');

    const currentIdx = CUSTOM_COLOR_PRESETS.indexOf(newTeamColor);
    if (currentIdx !== -1) {
      setNewTeamColor(
        CUSTOM_COLOR_PRESETS[(currentIdx + 1) % CUSTOM_COLOR_PRESETS.length]
      );
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col lg:flex-row overflow-hidden bg-slate-100 text-slate-900">
      {/* Main World Map Battlefield */}
      <main className="relative flex-1 min-w-0 min-h-0">
        <BattleCanvas
          ref={canvasHandleRef}
          teams={teams}
          initialUnits={initialStartup.units}
          initialBoats={initialStartup.boats}
          alliances={alliances}
          onStatsSync={handleStatsSync}
          onBattleLog={handleBattleLog}
        />

        {/* Top-of-map Load / Unload bar styled with selected boat or person color */}
        {topBoatAction &&
          (topBoatAction.canLoad || topBoatAction.canUnload) && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2">
              <div
                className="pointer-events-auto flex items-center gap-2 rounded-lg border-2 bg-white/95 px-2.5 py-1.5 shadow-md backdrop-blur-xs"
                style={{ borderColor: topBoatAction.teamColor }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: topBoatAction.teamColor }}
                />
                <span className="text-xs font-semibold text-slate-900 whitespace-nowrap">
                  {topBoatAction.teamName}
                </span>

                {topBoatAction.canLoad && (
                  <button
                    type="button"
                    onClick={() =>
                      canvasHandleRef.current?.loadClosestToBoat(
                        topBoatAction.boatId
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold shadow-xs transition-opacity hover:opacity-90 whitespace-nowrap"
                    style={{
                      backgroundColor: topBoatAction.teamColor,
                      color: getContrastTextColor(topBoatAction.teamColor),
                    }}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Load
                  </button>
                )}

                {topBoatAction.canUnload && (
                  <button
                    type="button"
                    onClick={() =>
                      canvasHandleRef.current?.unloadBoat(topBoatAction.boatId)
                    }
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold shadow-xs transition-opacity hover:opacity-90 whitespace-nowrap tabular-nums"
                    style={
                      topBoatAction.canLoad
                        ? {
                            borderColor: topBoatAction.teamColor,
                            color: '#0F172A',
                            backgroundColor: '#FFFFFF',
                          }
                        : {
                            borderColor: topBoatAction.teamColor,
                            backgroundColor: topBoatAction.teamColor,
                            color: getContrastTextColor(topBoatAction.teamColor),
                          }
                    }
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Unload ({topBoatAction.passengers})
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Minimal contextual selection readout + audio toggle */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur-xs">
            {selectedUnitCount > 0 || selectedBoatCount > 0 ? (
              <>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {selectedUnitCount > 0 && `${selectedUnitCount} circles`}
                  {selectedUnitCount > 0 && selectedBoatCount > 0 && ' · '}
                  {selectedBoatCount > 0 && `${selectedBoatCount} boat`}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-slate-500">
                  {selectedBoatCount > 0
                    ? 'Click water to sail or click land to unload'
                    : 'Click map to move · Bring near boat for top Load'}
                </span>
                <button
                  type="button"
                  onClick={() => canvasHandleRef.current?.clearSelection()}
                  className="font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  Clear
                </button>
              </>
            ) : (
              <span className="text-slate-500">
                Click or drag box to select · Hold right-click & move to drag map · Scroll to zoom
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-sm hover:bg-white hover:text-slate-900"
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </main>

      {/* Right Slider / Sidebar: Spinner + Nations/Boats/Allies */}
      <aside className="flex w-full lg:w-[375px] xl:w-[395px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-white min-h-0 max-h-[48vh] lg:max-h-none overflow-y-auto lg:overflow-hidden">
        <BattleWheel
          teams={teams}
          unitCounts={unitCounts}
          attachedEntry={attachedEntry}
          secondEntry={secondEntry}
          popWinner={popWinner}
          spinHistory={spinHistory}
          onPop5SpinLanded={handlePop5SpinLanded}
          onFirstSpinLanded={handleFirstSpinLanded}
          onSecondSpinLanded={handleSecondSpinLanded}
          onClearPair={handleClearPair}
        />

        <TeamRoster
          teams={teams}
          unitCounts={unitCounts}
          boatStatus={boatStatus}
          alliances={alliances}
          onSelectTeamUnits={(id) =>
            canvasHandleRef.current?.selectTeamUnits(id)
          }
          onSelectOrBuyBoat={(id) =>
            canvasHandleRef.current?.selectOrLaunchBoat(id)
          }
          onToggleAlliance={handleToggleAlliance}
          onRenameTeam={handleRenameTeam}
          onResetSave={handleResetSave}
        />

        {battleLog.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 shrink-0">
            <div className="max-h-12 space-y-0.5 overflow-y-auto">
              {battleLog.slice(0, 2).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 text-[11px] text-slate-700"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom of Right Sidebar: Add New Team */}
        <form
          onSubmit={handleAddNewTeam}
          className="border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 shrink-0 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Add New Team
            </span>
            <div className="flex items-center gap-1">
              {CUSTOM_COLOR_PRESETS.map((c) => {
                const active = newTeamColor.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTeamColor(c)}
                    title={`Select color ${c}`}
                    aria-label={`Select color ${c}`}
                    className={`h-4 w-4 rounded-full border transition-transform ${
                      active
                        ? 'scale-115 border-slate-900 ring-2 ring-slate-900/20'
                        : 'border-black/20 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
              <label
                title="Pick custom color"
                className="relative ml-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-700 hover:border-slate-500"
              >
                +
                <input
                  type="color"
                  value={newTeamColor}
                  onChange={(e) => setNewTeamColor(e.target.value)}
                  aria-label="Pick custom team color"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
              style={{ backgroundColor: newTeamColor }}
            />
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team name..."
              maxLength={24}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTeamName.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Team
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
