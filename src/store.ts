import { createInitialState, deserializeState, serializeState } from './domain';
import type { GameState, MercClass } from './types';

const SAVE_KEY = 'ironbound-save-v1';
let state: GameState | null = null;

export function getState(): GameState {
  if (!state) state = createInitialState();
  return state;
}

export function startNewGame(company: string, cls: MercClass, difficulty: GameState['difficulty']): GameState {
  state = createInitialState(company, cls, difficulty);
  saveGame();
  return state;
}

export function saveGame(): void {
  if (state) localStorage.setItem(SAVE_KEY, serializeState(state));
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const loaded = deserializeState(raw);
  if (loaded) state = loaded;
  return loaded;
}

export function resetSave(): void {
  localStorage.removeItem(SAVE_KEY);
  state = null;
}

export function replaceState(next: GameState): void {
  state = next;
}
