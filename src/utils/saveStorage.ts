import {
  ArmyUnit,
  Boat,
  SpinPairResult,
  Team,
  WheelEntry,
} from '../types/game';

export const SAVE_STORAGE_KEY = 'world_battle_save_v1';

export interface SavedCamera {
  x: number;
  y: number;
  scale: number;
}

export interface SavedGameState {
  version: 1;
  savedAt: number;
  teams: Team[];
  units: ArmyUnit[];
  boats: Boat[];
  alliances: Record<string, string[]>;
  attachedEntry: WheelEntry | null;
  secondEntry: WheelEntry | null;
  popWinner: WheelEntry | null;
  spinHistory: SpinPairResult[];
  camera?: SavedCamera;
}

export function isValidSavedGame(data: unknown): data is SavedGameState {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Partial<SavedGameState>;
  return (
    obj.version === 1 &&
    Array.isArray(obj.teams) &&
    obj.teams.length > 0 &&
    Array.isArray(obj.units) &&
    Array.isArray(obj.boats) &&
    typeof obj.alliances === 'object' &&
    obj.alliances !== null
  );
}

export function loadSavedGame(): SavedGameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSavedGame(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameToStorage(state: SavedGameState): boolean {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedGame(): void {
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage quota or privacy-mode errors
  }
}

export function parseImportedSave(rawJson: string): SavedGameState | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!isValidSavedGame(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
