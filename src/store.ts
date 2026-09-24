import { createInitialState, deserializeState, serializeState } from './domain';
import type { GameState, MercClass } from './types';
import { ensureCoreSystems } from './systems';

const SAVE_KEY = 'ironbound-save-v1';
let state: GameState | null = null;

export function getState(): GameState {
  if (!state) state = ensureCoreSystems(createInitialState());
  return state;
}

export function startNewGame(company: string, cls: MercClass, difficulty: GameState['difficulty']): GameState {
  state = createInitialState(company, cls, difficulty);
  saveGame();
  return state;
}

export function saveGame(): boolean {
  try {
    if (state) localStorage.setItem(SAVE_KEY, serializeState(state));
    return !!state;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

export function loadGame(): GameState | null {
  let raw: string | null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  const loaded = deserializeState(raw);
  if (loaded) state = ensureCoreSystems(loaded);
  return loaded;
}

export function resetSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* In-memory reset still works. */ }
  state = null;
}

export function replaceState(next: GameState): void {
  state = next;
}
