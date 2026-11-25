import {
  ArmyUnit,
  Boat,
  SpinPairResult,
  Team,
  WheelEntry,
} from '../types/game';

const SAVE_KEY = 'world-battle-sim-save-v1';

export interface SavedGameState {
  version: 1;
  savedAt: number;
  teams: Team[];
  units: ArmyUnit[];
  boats: Boat[];
  alliances: Record<string, string[]>;
  popWinner: WheelEntry | null;
  attachedEntry: WheelEntry | null;
  secondEntry: WheelEntry | null;
  spinHistory: SpinPairResult[];
}

export function loadSavedGame(): SavedGameState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGameState>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.teams) ||
      parsed.teams.length === 0 ||
      !Array.isArray(parsed.units) ||
      !Array.isArray(parsed.boats)
    ) {
      return null;
    }

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      teams: parsed.teams,
      units: parsed.units.map((u) => ({ ...u, selected: false })),
      boats: parsed.boats.map((b) => ({
        ...b,
        selected: false,
        passengers: Array.isArray(b.passengers)
          ? b.passengers.map((p) => ({ ...p, selected: false }))
          : [],
      })),
      alliances:
        parsed.alliances && typeof parsed.alliances === 'object'
          ? parsed.alliances
          : {},
      popWinner: parsed.popWinner ?? null,
      attachedEntry: parsed.attachedEntry ?? null,
      secondEntry: parsed.secondEntry ?? null,
      spinHistory: Array.isArray(parsed.spinHistory) ? parsed.spinHistory : [],
    };
  } catch {
    return null;
  }
}

export function saveGameState(state: SavedGameState): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedGame(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore storage errors
  }
}
