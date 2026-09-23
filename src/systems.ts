import type { CampFacility, GameState, Item, Profession } from './types';

const professionThresholds = [0, 30, 90, 220, 500];

export function ensureCoreSystems(state: GameState): GameState {
  state.fatigue ??= 0;
  state.maxFatigue ??= 100;
  state.valor ??= 2;
  state.maxValor ??= 4;
  state.suspicion ??= 0;
  state.wantedLevel ??= 0;
  state.knowledge ??= 0;
  state.knowledgePoints ??= 0;
  state.unlockedKnowledge ??= [];
  state.prisoners ??= [];
  state.ponies ??= [{ id: 'pony-1', name: 'Bracken', capacity: 30 }];
  state.campFacilities ??= ['Campfire', 'Tent', 'Workshop'];
  state.torches ??= 6;
  state.tombs ??= [
    { id: 'greenmarch-tomb', name: 'Mossbound Barrow', roomsExplored: 0, totalRooms: 5, codices: 0, completed: false },
    { id: 'ashen-tomb', name: 'Cinder Vault', roomsExplored: 0, totalRooms: 6, codices: 0, completed: false },
    { id: 'frost-tomb', name: 'White Crypt', roomsExplored: 0, totalRooms: 6, codices: 0, completed: false }
  ];
  state.tradeGoods ??= { wool: 0, salt: 0, spice: 0 };
  for (const m of state.mercenaries) m.relations ??= {};
  return state;
}

export function gainKnowledge(state: GameState, amount: number): number {
  ensureCoreSystems(state);
  state.knowledge += amount;
  let gained = 0;
  while (state.knowledge >= 100) {
    state.knowledge -= 100;
    state.knowledgePoints += 1;
    gained += 1;
  }
  return gained;
}

export function unlockKnowledge(state: GameState, key: string, cost = 1): boolean {
  ensureCoreSystems(state);
  if (state.unlockedKnowledge.includes(key) || state.knowledgePoints < cost) return false;
  state.knowledgePoints -= cost;
  state.unlockedKnowledge.push(key);
  return true;
}

export function travelStep(state: GameState, distance: number): void {
  ensureCoreSystems(state);
  state.fatigue = Math.min(state.maxFatigue, state.fatigue + distance * 0.015);
  if (state.suspicion > 0) {
    state.suspicion = Math.max(0, state.suspicion - distance * 0.004);
    state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
  }
  if (state.fatigue >= state.maxFatigue) state.morale = Math.max(0, state.morale - 0.02 * distance);
}

export function assignProfession(state: GameState, mercId: string, profession: Profession): boolean {
  ensureCoreSystems(state);
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc) return false;
  merc.profession = { name: profession, level: 1, xp: 0 };
  return true;
}

export function workProfession(state: GameState, mercId: string): string {
  ensureCoreSystems(state);
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc?.profession) return 'Assign a profession first.';
  const p = merc.profession;
  p.xp += 25;
  if (p.level < 5 && p.xp >= professionThresholds[p.level]) p.level += 1;
  gainKnowledge(state, 12);
  switch (p.name) {
    case 'Cook': state.food += 4 + p.level; return `${merc.name} prepared preserved meals.`;
    case 'Miner': state.crowns += 8 + p.level * 3; return `${merc.name} extracted saleable ore.`;
    case 'Scholar': gainKnowledge(state, 30); return `${merc.name} studied old fragments.`;
    case 'Thief': commitCrime(state, 18); state.crowns += 20 + p.level * 4; return `${merc.name} fenced a small haul.`;
    case 'Alchemist':
      state.inventory.push({ id: `medicine-${Date.now()}`, name: 'Field Medicine', rarity: 'Common', value: 18, weight: 0.2 });
      return `${merc.name} brewed field medicine.`;
    case 'Blacksmith':
      for (const item of Object.values(merc.equipment)) if (item?.maxDurability) item.durability = item.maxDurability;
      return `${merc.name} repaired their equipment.`;
    default:
      state.inventory.push({ id: `kit-${Date.now()}`, name: 'Repair Kit', rarity: 'Common', value: 12, weight: 0.5 });
      return `${merc.name} crafted a repair kit.`;
  }
}

export function commitCrime(state: GameState, severity: number): void {
  ensureCoreSystems(state);
  state.suspicion = Math.min(500, state.suspicion + severity);
  state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
}

export function layLow(state: GameState, amount = 35): void {
  ensureCoreSystems(state);
  state.suspicion = Math.max(0, state.suspicion - amount);
  state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
}

export function capturePrisoner(state: GameState, kind: 'bandit' | 'raider'): boolean {
  ensureCoreSystems(state);
  if (state.prisoners.length >= 4) return false;
  state.prisoners.push({
    id: `prisoner-${Date.now()}-${state.prisoners.length}`,
    name: kind === 'raider' ? 'Captured Raider' : 'Captured Outlaw',
    bounty: kind === 'raider' ? 95 : 65,
    escapeRisk: 0.35
  });
  return true;
}

export function turnInPrisoner(state: GameState, prisonerId: string): number {
  ensureCoreSystems(state);
  const idx = state.prisoners.findIndex(p => p.id === prisonerId);
  if (idx < 0) return 0;
  const [p] = state.prisoners.splice(idx, 1);
  state.crowns += p.bounty;
  state.suspicion = Math.max(0, state.suspicion - 20);
  state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
  return p.bounty;
}

export function buyPony(state: GameState, cost = 90): boolean {
  ensureCoreSystems(state);
  if (state.crowns < cost || state.ponies.length >= 4) return false;
  state.crowns -= cost;
  state.ponies.push({ id: `pony-${Date.now()}`, name: `Pack Pony ${state.ponies.length + 1}`, capacity: 30 });
  return true;
}

export function carryingCapacity(state: GameState): number {
  ensureCoreSystems(state);
  return 20 + state.mercenaries.length * 8 + state.ponies.reduce((n, p) => n + p.capacity, 0);
}

export function inventoryWeight(state: GameState): number {
  return state.inventory.reduce((n, i) => n + (i.weight ?? 1), 0);
}

const regionMultipliers: Record<string, Record<string, number>> = {
  Greenmarch: { wool: 0.75, salt: 1.15, spice: 1.35 },
  'Ashen Hills': { wool: 1.2, salt: 0.75, spice: 1.2 },
  Frostmere: { wool: 1.3, salt: 1.15, spice: 0.72 }
};
const baseTradePrice: Record<string, number> = { wool: 18, salt: 22, spice: 30 };

export function tradePrice(region: string, good: string): number {
  return Math.max(1, Math.round((baseTradePrice[good] ?? 20) * (regionMultipliers[region]?.[good] ?? 1)));
}

export function buyTradeGood(state: GameState, good: string): boolean {
  ensureCoreSystems(state);
  const price = tradePrice(state.currentRegion, good);
  if (state.crowns < price) return false;
  state.crowns -= price;
  state.tradeGoods[good] = (state.tradeGoods[good] ?? 0) + 1;
  return true;
}

export function sellTradeGood(state: GameState, good: string): number {
  ensureCoreSystems(state);
  if ((state.tradeGoods[good] ?? 0) <= 0) return 0;
  const price = Math.round(tradePrice(state.currentRegion, good) * 1.12);
  state.tradeGoods[good] -= 1;
  state.crowns += price;
  return price;
}

export function buildCampFacility(state: GameState, facility: CampFacility): boolean {
  ensureCoreSystems(state);
  if (state.campFacilities.includes(facility)) return false;
  const costs: Record<CampFacility, number> = {
    Campfire: 0, Tent: 0, Workshop: 0, 'Cooking Pot': 45, Lectern: 60, 'Strategy Table': 75
  };
  const cost = costs[facility];
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.campFacilities.push(facility);
  if (facility === 'Strategy Table') state.maxValor += 1;
  return true;
}

export function changeRelationship(state: GameState, aId: string, bId: string, amount: number): void {
  ensureCoreSystems(state);
  const a = state.mercenaries.find(m => m.id === aId);
  const b = state.mercenaries.find(m => m.id === bId);
  if (!a || !b || a.id === b.id) return;
  a.relations[b.id] = Math.max(-100, Math.min(100, (a.relations[b.id] ?? 0) + amount));
  b.relations[a.id] = Math.max(-100, Math.min(100, (b.relations[a.id] ?? 0) + amount));
}

export function exploreTomb(state: GameState, tombId: string): { ok: boolean; message: string } {
  ensureCoreSystems(state);
  const tomb = state.tombs.find(t => t.id === tombId);
  if (!tomb) return { ok: false, message: 'Unknown tomb.' };
  if (tomb.completed) return { ok: false, message: 'This tomb has already been cleared.' };
  if (state.torches <= 0) return { ok: false, message: 'You need more torches.' };
  state.torches -= 1;
  tomb.roomsExplored += 1;
  gainKnowledge(state, 18);
  if (tomb.roomsExplored % 2 === 0 && tomb.codices < 3) tomb.codices += 1;
  if (tomb.roomsExplored >= tomb.totalRooms) {
    tomb.completed = true;
    gainKnowledge(state, 80);
    state.crowns += 90;
    const relic: Item = { id: `relic-${tomb.id}`, name: `${tomb.name} Relic`, rarity: 'Rare', value: 120, power: 3, weight: 1 };
    state.inventory.push(relic);
    return { ok: true, message: `Tomb cleared. Recovered a relic and ${tomb.codices} codex fragments.` };
  }
  return { ok: true, message: `Explored room ${tomb.roomsExplored}/${tomb.totalRooms}. Codices: ${tomb.codices}/3.` };
}

export const CORE_PARITY_FEATURES = [
  'open-world', 'contracts', 'recruitment', 'equipment-progression', 'tactical-combat',
  'camp-survival', 'fatigue', 'valor', 'professions', 'knowledge', 'crime-wanted',
  'prisoners', 'pack-animals', 'regional-trading', 'relationships', 'tombs',
  'camp-upgrades', 'crafting'
] as const;
