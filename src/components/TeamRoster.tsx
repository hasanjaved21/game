import React, { useEffect, useState } from 'react';
import { Anchor, Check, Crosshair, Edit2, Handshake, RotateCcw } from 'lucide-react';
import { Team } from '../types/game';

interface TeamRosterProps {
  teams: Team[];
  unitCounts: Record<string, number>;
  boatStatus: Record<string, { alive: boolean; passengers: number }>;
  alliances: Record<string, string[]>;
  onSelectTeamUnits: (teamId: string) => void;
  onSelectOrBuyBoat: (teamId: string) => void;
  onToggleAlliance: (teamA: string, teamB: string) => void;
  onRenameTeam: (teamId: string, newName: string) => void;
  onResetSave: () => void;
}

export const TeamRoster: React.FC<TeamRosterProps> = ({
  teams,
  unitCounts,
  boatStatus,
  alliances,
  onSelectTeamUnits,
  onSelectOrBuyBoat,
  onToggleAlliance,
  onRenameTeam,
  onResetSave,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [allyDrawerTeamId, setAllyDrawerTeamId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  const startEditing = (team: Team) => {
    setEditingId(team.id);
    setEditValue(team.name);
  };

  const commitEdit = (teamId: string) => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onRenameTeam(teamId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <section className="flex flex-1 flex-col bg-white min-h-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
        <div>
          <h2 className="font-display text-sm font-bold text-slate-900">
            Nations, Boats & Allies
          </h2>
          <p className="text-[11px] text-slate-500">
            First boat is free · Replacement boat costs 10 people
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
            } else {
              setConfirmReset(false);
              onResetSave();
            }
          }}
          title="Clear saved progress and start a fresh map"
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
            confirmReset
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <RotateCcw className="h-3 w-3" />
          <span>{confirmReset ? 'Confirm?' : 'New Save'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-2 py-1">
        {teams.map((team) => {
          const count = unitCounts[team.id] ?? 0;
          const boat = boatStatus[team.id] ?? { alive: false, passengers: 0 };
          const landCount = Math.max(0, count - boat.passengers);
          const canBuyBoat = !boat.alive && landCount >= 10;
          const teamAllies = alliances[team.id] ?? [];
          const isAllyOpen = allyDrawerTeamId === team.id;

          return (
            <div key={team.id} className="py-1">
              <div className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-slate-50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
                    style={{ backgroundColor: team.color }}
                  />

                  <div className="min-w-0 flex-1">
                    {editingId === team.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(team.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="h-6 w-full rounded border border-slate-300 px-1.5 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => commitEdit(team.id)}
                          className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                          aria-label="Save name"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectTeamUnits(team.id)}
                          className="truncate text-left text-xs font-bold text-slate-900 hover:underline"
                        >
                          {team.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(team)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-opacity"
                          aria-label={`Rename ${team.name}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
                      <span>{count} pop</span>
                      {boat.passengers > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{boat.passengers} on boat</span>
                        </>
                      )}
                      {teamAllies.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="flex items-center gap-0.5">
                            {teamAllies.map((allyId) => {
                              const ally = teams.find((t) => t.id === allyId);
                              if (!ally) return null;
                              return (
                                <span
                                  key={allyId}
                                  title={`Allied with ${ally.name}`}
                                  className="inline-block h-2 w-2 rounded-full border border-black/20"
                                  style={{ backgroundColor: ally.color }}
                                />
                              );
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectTeamUnits(team.id)}
                    disabled={landCount === 0}
                    title={`Select all ${team.name} circles`}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35"
                    aria-label={`Select ${team.name} armies`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectOrBuyBoat(team.id)}
                    disabled={!boat.alive && !canBuyBoat}
                    title={
                      boat.alive
                        ? `Select ${team.name} boat`
                        : canBuyBoat
                        ? `Build new ${team.name} boat (costs 10 people)`
                        : `Need 10 people on land to build a boat (${landCount}/10)`
                    }
                    className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      boat.alive
                        ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        : canBuyBoat
                        ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Anchor className="h-3 w-3" />
                    <span>{boat.alive ? 'Boat' : 'Boat (10)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAllyDrawerTeamId(isAllyOpen ? null : team.id)
                    }
                    title={`Make allies for ${team.name}`}
                    className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      isAllyOpen
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Handshake className="h-3 w-3" />
                    <span>Ally</span>
                  </button>
                </div>
              </div>

              {/* Inline Ally Selector Drawer */}
              {isAllyOpen && (
                <div className="mx-2.5 mt-1 mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1.5 text-[11px] font-semibold text-slate-600">
                    Toggle allies for {team.name} (allies never attack each other):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {teams
                      .filter((other) => other.id !== team.id)
                      .map((other) => {
                        const isAllied = teamAllies.includes(other.id);
                        return (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => onToggleAlliance(team.id, other.id)}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                              isAllied
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-white/40"
                              style={{ backgroundColor: other.color }}
                            />
                            <span>{other.name}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
