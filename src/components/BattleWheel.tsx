import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Lock, RefreshCw, Swords, Trash2, Unlock, Users } from 'lucide-react';
import { TEAM_COLOR_PALETTE } from '../data/presets';
import { SpinPairResult, Team, WheelEntry } from '../types/game';
import { soundEngine } from '../utils/audio';

type SpinnerMode = 'POP_5' | 'PAIR_2SPIN';

interface BattleWheelProps {
  teams: Team[];
  unitCounts: Record<string, number>;
  attachedEntry: WheelEntry | null;
  secondEntry: WheelEntry | null;
  popWinner: WheelEntry | null;
  spinHistory: SpinPairResult[];
  onPop5SpinLanded: (entry: WheelEntry) => void;
  onFirstSpinLanded: (entry: WheelEntry) => void;
  onSecondSpinLanded: (entry: WheelEntry) => void;
  onClearPair: () => void;
  onClashPair: (first: WheelEntry, second: WheelEntry) => void;
}

function getContrastText(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
}

export const BattleWheel: React.FC<BattleWheelProps> = ({
  teams,
  unitCounts,
  attachedEntry,
  secondEntry,
  popWinner,
  spinHistory,
  onPop5SpinLanded,
  onFirstSpinLanded,
  onSecondSpinLanded,
  onClearPair,
  onClashPair,
}) => {
  const [spinnerMode, setSpinnerMode] = useState<SpinnerMode>('POP_5');
  const [syncWithTeams, setSyncWithTeams] = useState(true);
  const [customEntries, setCustomEntries] = useState<WheelEntry[]>([
    { id: 'c-1', name: 'Arabs', color: '#EAB308', teamId: 'team-arabs' },
    { id: 'c-2', name: 'Turks', color: '#991B1B', teamId: 'team-turks' },
    { id: 'c-3', name: 'Africans', color: '#16A34A', teamId: 'team-africans' },
    { id: 'c-4', name: 'Indians', color: '#EA580C', teamId: 'team-indians' },
    { id: 'c-5', name: 'Russians', color: '#38BDF8', teamId: 'team-russians' },
  ]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TEAM_COLOR_PALETTE[0].color);
  const [keepAttachedLocked, setKeepAttachedLocked] = useState(false);
  const [excludeAttachedOnSecond, setExcludeAttachedOnSecond] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef(0);
  const pointerKickRef = useRef(0);
  const animRef = useRef<number | null>(null);

  const baseEntries: WheelEntry[] = useMemo(() => {
    if (spinnerMode === 'POP_5' || syncWithTeams) {
      const aliveTeams = teams.filter((t) => (unitCounts[t.id] ?? 0) > 0);
      const list = aliveTeams.length > 0 ? aliveTeams : teams;
      return list.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        teamId: t.id,
      }));
    }
    return customEntries;
  }, [spinnerMode, syncWithTeams, teams, unitCounts, customEntries]);

  const activeWheelEntries = useMemo(() => {
    if (
      spinnerMode === 'PAIR_2SPIN' &&
      excludeAttachedOnSecond &&
      attachedEntry &&
      !secondEntry &&
      baseEntries.length > 1
    ) {
      return baseEntries.filter((e) => e.id !== attachedEntry.id);
    }
    return baseEntries;
  }, [spinnerMode, baseEntries, excludeAttachedOnSecond, attachedEntry, secondEntry]);

  const drawWheel = (angle: number, kick: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 236;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2 + 5;
    const radius = 100;

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#E2E8F0';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0F172A';
    ctx.fill();

    const count = activeWheelEntries.length;
    if (count === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#F1F5F9';
      ctx.fill();
      ctx.fillStyle = '#64748B';
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add entries below', cx, cy);
      ctx.restore();
      return;
    }

    const sliceAngle = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const entry = activeWheelEntries[i];
      const start = angle + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = entry.color;
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = getContrastText(entry.color);
      const fontSize = count > 8 ? 9.5 : count > 5 ? 11 : 12;
      ctx.font = `700 ${fontSize}px "Outfit", sans-serif`;
      const maxChars = count > 8 ? 10 : 12;
      const label =
        entry.name.length > maxChars
          ? `${entry.name.slice(0, maxChars - 1)}…`
          : entry.name;
      ctx.fillText(label, radius - 12, 0);
      ctx.restore();
    }

    for (let i = 0; i < count; i++) {
      const pegAngle = angle + i * sliceAngle;
      const px = cx + Math.cos(pegAngle) * (radius - 1);
      const py = cy + Math.sin(pegAngle) * (radius - 1);
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0F172A';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0F172A';
    ctx.fill();

    // Pointer needle
    ctx.save();
    ctx.translate(cx, cy - radius - 2);
    ctx.rotate(kick);
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-8, -6);
    ctx.lineTo(8, -6);
    ctx.closePath();
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  };

  useEffect(() => {
    drawWheel(rotationRef.current, pointerKickRef.current);
  });

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const getIndexAtTopPointer = (angle: number, count: number): number => {
    const slice = (Math.PI * 2) / count;
    const pointerAngle = -Math.PI / 2;
    let rel = (pointerAngle - angle) % (Math.PI * 2);
    if (rel < 0) rel += Math.PI * 2;
    return Math.floor(rel / slice) % count;
  };

  const handleSpin = (mode?: 'AUTO' | 'RESPIN_SECOND') => {
    if (isSpinning || activeWheelEntries.length === 0) return;

    let spinStep: 'POP5' | 1 | 2 = 'POP5';
    let entriesForSpin = baseEntries;

    if (spinnerMode === 'POP_5') {
      spinStep = 'POP5';
      entriesForSpin = baseEntries;
    } else {
      if (mode === 'RESPIN_SECOND' && attachedEntry) {
        spinStep = 2;
        entriesForSpin =
          excludeAttachedOnSecond && baseEntries.length > 1
            ? baseEntries.filter((e) => e.id !== attachedEntry.id)
            : baseEntries;
      } else if (attachedEntry && !secondEntry) {
        spinStep = 2;
        entriesForSpin = activeWheelEntries;
      } else if (attachedEntry && secondEntry && keepAttachedLocked) {
        spinStep = 2;
        entriesForSpin =
          excludeAttachedOnSecond && baseEntries.length > 1
            ? baseEntries.filter((e) => e.id !== attachedEntry.id)
            : baseEntries;
      } else {
        if (attachedEntry && secondEntry && !keepAttachedLocked) {
          onClearPair();
        }
        spinStep = 1;
        entriesForSpin = baseEntries;
      }
    }

    if (entriesForSpin.length === 0) return;

    setIsSpinning(true);
    const startAngle = rotationRef.current;
    const extraSpins = (5 + Math.floor(Math.random() * 3)) * Math.PI * 2;
    const randomOffset = Math.random() * Math.PI * 2;
    const totalDelta = extraSpins + randomOffset;
    const duration = 2900;
    const startTime = performance.now();
    let lastIndex = getIndexAtTopPointer(startAngle, entriesForSpin.length);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 4.2);
      const currentAngle = startAngle + totalDelta * eased;
      rotationRef.current = currentAngle;

      const currentIndex = getIndexAtTopPointer(currentAngle, entriesForSpin.length);
      if (currentIndex !== lastIndex) {
        lastIndex = currentIndex;
        pointerKickRef.current = -0.32;
        soundEngine.playWheelTick();
      } else {
        pointerKickRef.current *= 0.82;
      }

      drawWheel(currentAngle, pointerKickRef.current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        pointerKickRef.current = 0;
        drawWheel(currentAngle, 0);
        setIsSpinning(false);

        const winnerIndex = getIndexAtTopPointer(currentAngle, entriesForSpin.length);
        const winner = entriesForSpin[winnerIndex];
        if (winner) {
          if (spinStep === 'POP5') {
            soundEngine.playPairCompleteChime();
            onPop5SpinLanded(winner);
          } else if (spinStep === 1) {
            soundEngine.playAttachChime();
            onFirstSpinLanded(winner);
          } else {
            soundEngine.playPairCompleteChime();
            onSecondSpinLanded(winner);
          }
        }
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  const handleAddCustomEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCustomEntries((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: trimmed,
        color: newColor,
      },
    ]);
    setNewName('');
    const nextColorIdx =
      (TEAM_COLOR_PALETTE.findIndex((c) => c.color === newColor) + 1) %
      TEAM_COLOR_PALETTE.length;
    setNewColor(TEAM_COLOR_PALETTE[nextColorIdx].color);
  };

  const nextSpinIsSecond =
    spinnerMode === 'PAIR_2SPIN' &&
    ((Boolean(attachedEntry) && !secondEntry) ||
      (Boolean(attachedEntry) && Boolean(secondEntry) && keepAttachedLocked));

  const canClashOnMap =
    Boolean(attachedEntry?.teamId) &&
    Boolean(secondEntry?.teamId) &&
    attachedEntry?.teamId !== secondEntry?.teamId;

  return (
    <section className="flex flex-col border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            disabled={isSpinning}
            onClick={() => setSpinnerMode('POP_5')}
            className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
              spinnerMode === 'POP_5'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            +5 People Wheel
          </button>
          <button
            type="button"
            disabled={isSpinning}
            onClick={() => setSpinnerMode('PAIR_2SPIN')}
            className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
              spinnerMode === 'PAIR_2SPIN'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2-Spin Attach
          </button>
        </div>

        {spinnerMode === 'PAIR_2SPIN' && (
          <button
            type="button"
            onClick={() => setKeepAttachedLocked((v) => !v)}
            title="Keep 1st spin name attached across multiple spins"
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              keepAttachedLocked
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'
            }`}
          >
            {keepAttachedLocked ? (
              <Lock className="h-3 w-3" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
            <span>{keepAttachedLocked ? 'Locked' : 'Lock 1st'}</span>
          </button>
        )}
      </div>

      {/* Wheel Canvas */}
      <div className="relative flex flex-col items-center px-4 pb-3">
        <canvas
          ref={canvasRef}
          onClick={() => handleSpin('AUTO')}
          className={`h-[236px] w-[236px] ${
            isSpinning ? 'cursor-wait' : 'cursor-pointer'
          }`}
          aria-label="Nations wheel spinner"
        />

        {/* Spin Controls */}
        <div className="mt-1.5 flex w-full items-center gap-2">
          <button
            type="button"
            disabled={isSpinning || activeWheelEntries.length === 0}
            onClick={() => handleSpin('AUTO')}
            className="flex-1 rounded-lg bg-slate-900 px-3.5 py-2 font-display text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            {isSpinning
              ? 'Spinning…'
              : spinnerMode === 'POP_5'
              ? 'Spin for +5 People'
              : nextSpinIsSecond
              ? 'Spin 2nd (With Attached)'
              : attachedEntry && secondEntry
              ? 'Spin New 1st Name'
              : 'Spin 1st Name'}
          </button>

          {spinnerMode === 'PAIR_2SPIN' && attachedEntry && secondEntry && (
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => handleSpin('RESPIN_SECOND')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Re-spin 2nd
            </button>
          )}

          {spinnerMode === 'PAIR_2SPIN' && (attachedEntry || secondEntry) && (
            <button
              type="button"
              disabled={isSpinning}
              onClick={onClearPair}
              title="Clear attached spin"
              className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              aria-label="Clear attached spin"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Result Area */}
        {spinnerMode === 'POP_5' ? (
          <div className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            {popWinner ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: popWinner.color }}
                  />
                  <span className="truncate font-display text-xs font-bold text-slate-900">
                    {popWinner.name}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-700 whitespace-nowrap">
                  +5 People Added
                </span>
              </div>
            ) : (
              <div className="text-center text-[11px] text-slate-500">
                Spin the wheel — winning nation gets +5 people
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            {!attachedEntry && !secondEntry && (
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>1st Spin: Attaches name</span>
                <span aria-hidden="true">·</span>
                <span>2nd Spin: Appears with 1st</span>
              </div>
            )}

            {attachedEntry && !secondEntry && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: attachedEntry.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-slate-500">
                      Attached from 1st spin
                    </div>
                    <div className="truncate font-display text-xs font-bold text-slate-900">
                      {attachedEntry.name}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                  Spin 2nd next
                </span>
              </div>
            )}

            {attachedEntry && secondEntry && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                      style={{ backgroundColor: attachedEntry.color }}
                    />
                    <span className="truncate font-display text-xs font-bold text-slate-900">
                      {attachedEntry.name}
                    </span>
                  </div>

                  <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />

                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                      style={{ backgroundColor: secondEntry.color }}
                    />
                    <span className="truncate font-display text-xs font-bold text-slate-900">
                      {secondEntry.name}
                    </span>
                  </div>
                </div>

                {canClashOnMap && (
                  <button
                    type="button"
                    onClick={() => onClashPair(attachedEntry, secondEntry)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700 whitespace-nowrap"
                  >
                    <Swords className="h-3.5 w-3.5" />
                    <span>March to Clash</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Wheel Mode & Editor Toggle for 2-Spin Mode */}
        {spinnerMode === 'PAIR_2SPIN' && (
          <div className="mt-2 flex w-full items-center justify-between text-xs">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setSyncWithTeams(true)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  syncWithTeams
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Nations
              </button>
              <button
                type="button"
                onClick={() => setSyncWithTeams(false)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  !syncWithTeams
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowEditor((s) => !s)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              <Users className="h-3 w-3" />
              <span>{showEditor ? 'Hide Options' : 'Options'}</span>
            </button>
          </div>
        )}

        {spinnerMode === 'PAIR_2SPIN' && showEditor && (
          <div className="mt-2 w-full space-y-2 border-t border-slate-200 pt-2">
            <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
              <span>Exclude attached name on 2nd spin</span>
              <input
                type="checkbox"
                checked={excludeAttachedOnSecond}
                onChange={(e) => setExcludeAttachedOnSecond(e.target.checked)}
                className="h-3.5 w-3.5 accent-slate-900"
              />
            </label>

            {!syncWithTeams && (
              <div className="space-y-2">
                <form onSubmit={handleAddCustomEntry} className="flex items-center gap-1.5">
                  <select
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    aria-label="Entry color"
                    className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-800"
                  >
                    {TEAM_COLOR_PALETTE.map((c) => (
                      <option key={c.color} value={c.color}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Add name…"
                    className="h-7 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-7 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Add
                  </button>
                </form>

                <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
                  {customEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="truncate font-medium text-slate-800">
                          {entry.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomEntries((prev) =>
                            prev.filter((item) => item.id !== entry.id)
                          )
                        }
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${entry.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {spinHistory.length > 0 && (
              <div className="pt-1">
                <div className="mb-1 text-[11px] font-semibold text-slate-500">
                  Recent Attached Spins
                </div>
                <div className="max-h-20 space-y-1 overflow-y-auto">
                  {spinHistory.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-1.5 text-[11px] text-slate-700"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.first.color }}
                      />
                      <span className="font-semibold truncate">{item.first.name}</span>
                      <span className="text-slate-400">+</span>
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.second.color }}
                      />
                      <span className="font-semibold truncate">{item.second.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
