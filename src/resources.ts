import type { GameState } from './types';

export interface ResourceCost { crowns?: number; materials?: Record<string, number> }
export const MATERIAL_PRICES: Record<string, number> = { iron: 6, leather: 6, wood: 4, herbs: 5, cloth: 4, grain: 3 };

export function buyMaterialBundle(state: GameState, material: string): boolean {
  if (!Object.hasOwn(MATERIAL_PRICES, material)) return false;
  const cost = MATERIAL_PRICES[material] * 3;
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.materials[material] = (state.materials[material] ?? 0) + 3;
  return true;
}

export function costLabel(cost: ResourceCost): string {
  return [cost.crowns ? `${cost.crowns} crowns` : '', ...Object.entries(cost.materials ?? {}).map(([key, amount]) => `${amount} ${key}`)].filter(Boolean).join(' · ') || 'No materials needed';
}

export function missingResources(state: GameState, cost: ResourceCost): string | undefined {
  const missing = Object.entries(cost.materials ?? {}).filter(([key, amount]) => (state.materials[key] ?? 0) < amount).map(([key, amount]) => `${amount - (state.materials[key] ?? 0)} ${key}`);
  if (state.crowns < (cost.crowns ?? 0)) missing.unshift(`${cost.crowns! - state.crowns} crowns`);
  return missing.length ? `Need ${missing.join(', ')} more.` : undefined;
}

// Call only after validating the entire action, so a failed action spends nothing.
export function spendResources(state: GameState, cost: ResourceCost): void {
  state.crowns -= cost.crowns ?? 0;
  for (const [key, amount] of Object.entries(cost.materials ?? {})) state.materials[key] -= amount;
}
