import { BASE_QUEST, CLASS_STATS, ITEMS, startingEnemies } from './data';
import { ensureCoreSystems } from './systems';
import type { BattleUnit, GameState, Item, MercClass, Mercenary, Quest } from './types';

let idCounter = 1;
const uid = (prefix: string) => `${prefix}-${idCounter++}`;

export function cloneItem(item: Item): Item { return structuredClone(item); }

export function createMercenary(name: string, cls: MercClass): Mercenary {
  const s = CLASS_STATS[cls];
  return {
    id: uid('merc'), name, class: cls, level: 1, xp: 0,
    health: s.hp, maxHealth: s.hp, armor: s.armor, maxArmor: s.armor,
    strength: s.str, dexterity: s.dex, movement: s.move, crit: s.crit,
    wage: s.wage,
    traits: cls === 'Warrior' ? ['Strong'] : cls === 'Ranger' ? ['Quick'] : cls === 'Rogue' ? ['Greedy'] : ['Tough'],
    equipment: {}, learnedSkills: [], skillPoints: 0, relations: {}
  };
}

export function createInitialState(companyName = 'Iron Wolves', leaderClass: MercClass = 'Swordsman', difficulty: GameState['difficulty'] = 'Normal'): GameState {
  const leader = createMercenary('Alden', leaderClass);
  const second = createMercenary('Mira', leaderClass === 'Ranger' ? 'Swordsman' : 'Ranger');
  const third = createMercenary('Bram', leaderClass === 'Warrior' ? 'Spearman' : 'Warrior');
  leader.equipment.weapon = cloneItem(ITEMS.rustySword);
  second.equipment.weapon = cloneItem(ITEMS.hunterBow);
  third.equipment.armor = cloneItem(ITEMS.leatherArmor);
  return ensureCoreSystems({
    companyName, crowns: 120, food: 12, morale: 50, day: 1, rests: 0,
    worldX: 520, worldY: 900, mercenaries: [leader, second, third],
    inventory: [cloneItem(ITEMS.bread), cloneItem(ITEMS.meat)],
    quests: [structuredClone(BASE_QUEST)], discovered: ['stonebridge'],
    enemies: startingEnemies(), currentRegion: 'Greenmarch', difficulty,
    fatigue: 0, maxFatigue: 100, valor: 2, maxValor: 4,
    suspicion: 0, wantedLevel: 0, knowledge: 0, knowledgePoints: 0,
    unlockedKnowledge: [], prisoners: [], ponies: [], campFacilities: [],
    torches: 6, tombs: [], tradeGoods: {}, materials: {}
  });
}

export function totalAttack(merc: Mercenary): number {
  const trait = merc.traits.includes('Strong') ? 2 : 0;
  const injury = merc.injury ? -1 : 0;
  return Math.max(1, merc.strength + trait + injury + (merc.equipment.weapon?.power ?? 0) + Math.floor(merc.dexterity / 4));
}

export function applyDamage(target: { health: number; armor: number }, damage: number): { armorDamage: number; healthDamage: number } {
  const armorDamage = Math.min(target.armor, Math.max(0, damage));
  target.armor -= armorDamage;
  const healthDamage = Math.min(target.health, Math.max(0, damage - armorDamage));
  target.health -= healthDamage;
  return { armorDamage, healthDamage };
}

export function equipItem(state: GameState, mercId: string, itemId: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  const index = state.inventory.findIndex(i => i.id === itemId);
  if (!merc || index < 0) return false;
  const item = state.inventory[index];
  if (!item.slot) return false;
  const old = merc.equipment[item.slot];
  merc.equipment[item.slot] = item;
  state.inventory.splice(index, 1);
  if (old) state.inventory.push(old);
  if (item.slot === 'armor') {
    merc.maxArmor = CLASS_STATS[merc.class].armor + (item.armor ?? 0);
    merc.armor = merc.maxArmor;
  }
  return true;
}

export function sellItem(state: GameState, itemId: string): number {
  const index = state.inventory.findIndex(i => i.id === itemId);
  if (index < 0) return 0;
  const [item] = state.inventory.splice(index, 1);
  const value = Math.max(1, Math.floor(item.value * 0.55));
  state.crowns += value;
  return value;
}

export function buyFood(state: GameState, amount = 6, cost = 12): boolean {
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.food += amount;
  return true;
}

export function recruit(state: GameState, name = 'Kestrel', cls: MercClass = 'Spearman', cost = 85): boolean {
  if (state.crowns < cost || state.mercenaries.length >= 10) return false;
  state.crowns -= cost;
  state.mercenaries.push(createMercenary(name, cls));
  return true;
}

export function repairAll(state: GameState): number {
  let missing = 0;
  for (const m of state.mercenaries) {
    for (const item of Object.values(m.equipment)) {
      if (item?.maxDurability && item.durability !== undefined) missing += item.maxDurability - item.durability;
    }
  }
  const cost = Math.ceil(missing * 0.5);
  if (state.crowns < cost) return -1;
  state.crowns -= cost;
  for (const m of state.mercenaries) {
    for (const item of Object.values(m.equipment)) if (item?.maxDurability) item.durability = item.maxDurability;
  }
  return cost;
}

export function rest(state: GameState): { ok: boolean; wagesPaid: number } {
  const neededFood = state.mercenaries.length * 2;
  if (state.food < neededFood) return { ok: false, wagesPaid: 0 };
  state.food -= neededFood;
  state.day += 1;
  ensureCoreSystems(state);
  state.fatigue = 0;
  state.valor = state.maxValor;
  state.rests += 1;
  for (const m of state.mercenaries) { m.health = m.maxHealth; m.armor = m.maxArmor; }
  let wagesPaid = 0;
  if (state.rests % 3 === 0) {
    const wages = state.mercenaries.reduce((n, m) => n + m.wage, 0);
    if (state.crowns >= wages) {
      state.crowns -= wages; wagesPaid = wages; state.morale = Math.min(100, state.morale + 8);
    } else state.morale = Math.max(0, state.morale - 20);
  } else state.morale = Math.min(100, state.morale + 3);
  return { ok: true, wagesPaid };
}

export function acceptQuest(state: GameState, questId: string): boolean {
  const q = state.quests.find(q => q.id === questId);
  if (!q || q.state !== 'available') return false;
  q.state = 'active';
  return true;
}

export function recordKill(state: GameState, kind: string): Quest[] {
  const completed: Quest[] = [];
  for (const q of state.quests) {
    if (q.state === 'active' && q.target === kind) {
      q.progress = Math.min(q.required, q.progress + 1);
      if (q.progress >= q.required) completed.push(q);
    }
  }
  return completed;
}

export function turnInQuest(state: GameState, questId: string): boolean {
  const q = state.quests.find(q => q.id === questId);
  if (!q || q.state !== 'active' || q.progress < q.required) return false;
  q.state = 'completed';
  state.crowns += q.rewardCrowns;
  for (const m of state.mercenaries) gainXp(m, q.rewardXp);
  return true;
}

export function gainXp(m: Mercenary, amount: number): void {
  m.xp += amount;
  while (m.level < 10) {
    const needed = 100 + (m.level - 1) * 80;
    if (m.xp < needed) break;
    m.xp -= needed; m.level += 1; m.maxHealth += 4; m.health = m.maxHealth; m.strength += 1;
    if (m.level === 3 || m.level === 5 || m.level === 8) m.skillPoints += 1;
  }
}

export function generateLoot(kind: 'bandit' | 'wolf' | 'raider'): { crowns: number; items: Item[] } {
  if (kind === 'raider') return { crowns: 38, items: [cloneItem(ITEMS.raiderAxe), cloneItem(ITEMS.meat)] };
  if (kind === 'wolf') return { crowns: 12, items: [cloneItem(ITEMS.meat)] };
  return { crowns: 24, items: [cloneItem(ITEMS.militiaSword)] };
}

export function mercToBattleUnit(m: Mercenary, x: number, y: number): BattleUnit {
  return { id: uid('bu'), name: m.name, side: 'player', x, y, health: m.health, maxHealth: m.maxHealth, armor: m.armor, maxArmor: m.maxArmor, power: totalAttack(m), movement: m.movement, crit: m.crit, acted: false, moved: false, mercenaryId: m.id, facing: 1, statuses: [] };
}

export function enemyBattleUnits(kind: 'bandit' | 'wolf' | 'raider', strength = 1): BattleUnit[] {
  const count = kind === 'raider' ? 4 : 3;
  return Array.from({ length: count }, (_, i) => ({
    id: uid('enemy'), name: kind === 'wolf' ? `Wolf ${i + 1}` : `${kind === 'raider' ? 'Raider' : 'Bandit'} ${i + 1}`,
    side: 'enemy' as const, x: 650 + (i % 2) * 90, y: 250 + i * 85,
    health: 16 + strength * 6, maxHealth: 16 + strength * 6,
    armor: kind === 'wolf' ? 0 : 3 + strength * 2, maxArmor: kind === 'wolf' ? 0 : 3 + strength * 2,
    power: 5 + strength * 2, movement: 145, crit: 0.06, acted: false, moved: false, facing: -1 as const, statuses: []
  }));
}

export function serializeState(state: GameState): string { return JSON.stringify(state); }

export function deserializeState(raw: string): GameState | null {
  try {
    const value = JSON.parse(raw) as GameState;
    if (!value || !Array.isArray(value.mercenaries) || typeof value.crowns !== 'number') return null;
    return ensureCoreSystems(value);
  } catch { return null; }
}
