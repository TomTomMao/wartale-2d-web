import { LOCATIONS } from './data';
import { awardProfessionXp, bestProfessional, commitCrime, ensureCoreSystems, gainKnowledge } from './systems';
import { missingResources, spendResources, type ResourceCost } from './resources';
import type { GameState, LocationProgress, WorldEnemy } from './types';

export type MapLocation = typeof LOCATIONS[number];
export interface SiteReward { crowns?: number; food?: number; knowledge?: number; materials?: Record<string, number> }
export interface ExplorationSite {
  theme: string;
  description: string;
  search: SiteReward;
  cache: SiteReward;
  gather?: string;
  enemy?: { kind: WorldEnemy['kind']; strength: number };
}

export const EXPLORATION_SITES: Record<string, ExplorationSite> = {
  'old-mill': {
    theme: 'THE ABANDONED GRANARY',
    description: 'A weathered wheel turns above the stream. Search the storehouse, gather grain from the nearby fields and recover timber from the mill yard.',
    search: { food: 2, materials: { wood: 3, grain: 4, cloth: 2 } }, cache: { crowns: 18, materials: { cloth: 3 } }, gather: 'Gather grain & timber'
  },
  'iron-mine': {
    theme: 'BENEATH THE GREEN HILLS',
    description: 'Iron seams glint in the rock. Recover the abandoned tools, work a fresh seam each day, and open the foreman’s locked chest.',
    search: { materials: { iron: 4, wood: 1 } }, cache: { crowns: 22, materials: { iron: 4 } }, gather: 'Mine an iron seam'
  },
  'bandit-camp': {
    theme: 'OUTLAWS OF THE EASTERN ROAD',
    description: 'Stolen supplies lie behind a palisade. Defeat the camp’s defenders to search their stores and open the pay chest. The cleared camp stays accessible.',
    enemy: { kind: 'bandit', strength: 1 }, search: { crowns: 20, food: 4, materials: { wood: 3, leather: 3 } }, cache: { crowns: 45, materials: { iron: 2 } }
  },
  'ruined-keep': {
    theme: 'THE ASHEN GARRISON',
    description: 'Raiders occupy the broken battlements. Defeat the garrison to search the armory and unlock the captain’s strongbox.',
    enemy: { kind: 'raider', strength: 2 }, search: { crowns: 35, materials: { iron: 5, cloth: 4 } }, cache: { crowns: 70, materials: { iron: 3, leather: 3 } }
  },
  'old-battlefield': {
    theme: 'ECHOES OF THE LAST WAR',
    description: 'Grass has overtaken the silent field. Salvage scattered equipment and study the surviving records. A Scholar can recover more knowledge from the search.',
    search: { knowledge: 35, materials: { iron: 3, leather: 4, herbs: 2 } }, cache: { crowns: 30, materials: { leather: 2, herbs: 3 } }
  }
};

export function locationProgress(state: GameState, id: string): LocationProgress {
  ensureCoreSystems(state);
  return state.locations[id] ??= { entered: false, searched: false, cleared: false, cacheOpened: false };
}

export function isNearLocation(state: GameState, id: string): boolean {
  const loc = LOCATIONS.find(l => l.id === id);
  return !!loc && Math.hypot(state.worldX - loc.x, state.worldY - loc.y) <= 170;
}

export function nearestLocation(state: GameState): MapLocation | undefined {
  return [...LOCATIONS].filter(l => isNearLocation(state, l.id)).sort((a, b) => Math.hypot(state.worldX - a.x, state.worldY - a.y) - Math.hypot(state.worldX - b.x, state.worldY - b.y))[0];
}

export function enterLocation(state: GameState, id: string): boolean {
  const loc = LOCATIONS.find(l => l.id === id);
  if (!loc || !isNearLocation(state, id)) return false;
  const progress = locationProgress(state, id);
  progress.entered = true;
  if (!state.discovered.includes(id)) state.discovered.push(id);
  state.currentRegion = loc.region;
  return true;
}

export function rewardLabel(reward: SiteReward): string {
  return [reward.crowns ? `+${reward.crowns} crowns` : '', reward.food ? `+${reward.food} provisions` : '', reward.knowledge ? `+${reward.knowledge} knowledge` : '', ...Object.entries(reward.materials ?? {}).map(([key, amount]) => `+${amount} ${key}`)].filter(Boolean).join(' · ');
}

export function gatheringReward(state: GameState, id: string): SiteReward {
  if (id === 'iron-mine') return { materials: { iron: 2 + (bestProfessional(state, 'Miner')?.profession!.level ?? 0) * 2 } };
  if (id === 'old-mill') return { materials: { grain: 3 + (bestProfessional(state, 'Cook')?.profession!.level ?? 0), wood: 2 + (bestProfessional(state, 'Tinkerer')?.profession!.level ?? 0) } };
  return {};
}

function grantReward(state: GameState, reward: SiteReward): void {
  state.crowns += reward.crowns ?? 0;
  state.food += reward.food ?? 0;
  if (reward.knowledge) gainKnowledge(state, reward.knowledge);
  for (const [key, amount] of Object.entries(reward.materials ?? {})) state.materials[key] = (state.materials[key] ?? 0) + amount;
}

export type SiteAction = 'search' | 'gather' | 'cache';
export function siteActionStatus(state: GameState, id: string, action: SiteAction): { reward: SiteReward; cost: ResourceCost; reason?: string } {
  const site = EXPLORATION_SITES[id];
  if (!site) return { reward: {}, cost: {}, reason: 'Unknown exploration site.' };
  const progress = locationProgress(state, id);
  const reward = action === 'search' ? structuredClone(site.search) : action === 'cache' ? site.cache : gatheringReward(state, id);
  if (action === 'search' && id === 'old-battlefield') reward.knowledge = (reward.knowledge ?? 0) + (bestProfessional(state, 'Scholar')?.profession!.level ?? 0) * 20;
  const cost: ResourceCost = action === 'cache' && !bestProfessional(state, 'Thief') ? { materials: { iron: 2 } } : {};
  const reason = !isNearLocation(state, id) ? 'Travel to this location first.'
    : !progress.entered ? 'Enter this location first.'
    : site.enemy && !progress.cleared ? 'Defeat the defenders first.'
    : action === 'search' && progress.searched ? 'The site has been searched. All supplies recovered.'
    : action === 'cache' && progress.cacheOpened ? 'The cache is empty. Its treasure is already in your pack.'
    : action === 'gather' && !site.gather ? 'There is nothing to gather here.'
    : action === 'gather' && progress.lastGatherDay === state.day ? 'Gathered today. Rest before returning for more.'
    : missingResources(state, cost);
  return { reward, cost, reason };
}

export function exploreSite(state: GameState, id: string, action: SiteAction): { ok: boolean; message: string } {
  if (!['search', 'gather', 'cache'].includes(action)) return { ok: false, message: 'Unknown exploration action.' };
  const status = siteActionStatus(state, id, action);
  if (status.reason) return { ok: false, message: status.reason };
  spendResources(state, status.cost);
  const progress = locationProgress(state, id);
  if (action === 'search') progress.searched = true;
  if (action === 'gather') progress.lastGatherDay = state.day;
  if (action === 'cache') progress.cacheOpened = true;
  grantReward(state, status.reward);
  const jobs = action === 'cache' ? ['Thief'] as const
    : action === 'search' && id === 'old-battlefield' ? ['Scholar'] as const
    : action === 'gather' && id === 'iron-mine' ? ['Miner'] as const
    : action === 'gather' && id === 'old-mill' ? ['Cook', 'Tinkerer'] as const : [];
  const workers = jobs.map(job => bestProfessional(state, job)).filter(m => m !== undefined);
  workers.forEach(worker => awardProfessionXp(state, worker, 25));
  return { ok: true, message: `${rewardLabel(status.reward)}.${workers.length ? ` ${workers.map(w => w.name).join(', ')}: +25 profession XP.` : ''}` };
}

// A garrison is separate from roaming patrols. It becomes cleared only after victory.
export function locationDefender(state: GameState, id: string): WorldEnemy | undefined {
  const loc = LOCATIONS.find(l => l.id === id);
  const site = EXPLORATION_SITES[id];
  if (!loc || !site?.enemy || !isNearLocation(state, id) || locationProgress(state, id).cleared) return;
  return { id: `garrison:${id}`, ...site.enemy, x: loc.x, y: loc.y, vx: 0, vy: 0, alive: true };
}

export function clearLocationGarrison(state: GameState, enemy: WorldEnemy): void {
  if (enemy.alive || !enemy.id.startsWith('garrison:')) return;
  const id = enemy.id.slice('garrison:'.length);
  if (EXPLORATION_SITES[id]?.enemy) locationProgress(state, id).cleared = true;
}

export function stealTownSupplies(state: GameState, id: string): { ok: boolean; message: string } {
  const loc = LOCATIONS.find(l => l.id === id && l.type === 'town');
  if (!loc || !isNearLocation(state, id)) return { ok: false, message: 'Visit a settlement first.' };
  const progress = locationProgress(state, id);
  if (progress.lastStealDay === state.day) return { ok: false, message: 'The market is on alert. Return after resting.' };
  const thief = bestProfessional(state, 'Thief');
  const before = state.suspicion;
  commitCrime(state, Math.max(25, 85 - (thief?.profession!.level ?? 0) * 12));
  state.food += 6;
  progress.lastStealDay = state.day;
  if (thief) awardProfessionXp(state, thief, 25);
  return { ok: true, message: `Stole 6 provisions. +${state.suspicion - before} suspicion${thief ? ` · ${thief.name} +25 Thief XP` : ''}.` };
}
