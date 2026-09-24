import { BASE_QUEST, CLASS_STATS, ITEMS, startingEnemies } from './data';
import { ensureCoreSystems, personalityFoodCost, wageTotal } from './systems';
import type { AnimalCompanion, BattleUnit, GameState, Item, MercClass, Mercenary, Quest, ValorStyle } from './types';

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function cloneItem(item: Item): Item { return { ...structuredClone(item), id: uid(item.id) }; }

export function createMercenary(name: string, cls: MercClass): Mercenary {
  const s = CLASS_STATS[cls];
  const valorStyle: ValorStyle =
    cls === 'Ranger' ? 'Support' :
    cls === 'Rogue' ? 'Victory' :
    'Engagement';
  return {
    id: uid('merc'), name, class: cls, level: 1, xp: 0,
    health: s.hp, maxHealth: s.hp, armor: s.armor, maxArmor: s.armor,
    strength: s.str, dexterity: s.dex, movement: s.move, crit: s.crit,
    wage: s.wage,
    traits: cls === 'Warrior' ? ['Strong'] : cls === 'Ranger' ? ['Quick'] : cls === 'Rogue' ? ['Greedy'] : ['Tough'],
    equipment: {}, learnedSkills: [], skillPoints: 0, relations: {}, appearanceVariant: 0, valorStyle
  };
}

export function createInitialState(companyName = 'Iron Wolves', leaderClass: MercClass = 'Swordsman', difficulty: GameState['difficulty'] = 'Normal'): GameState {
  const leader = createMercenary('Alden', leaderClass);
  const second = createMercenary('Mira', leaderClass === 'Ranger' ? 'Swordsman' : 'Ranger');
  const third = createMercenary('Bram', leaderClass === 'Warrior' ? 'Spearman' : 'Warrior');
  for (const merc of [leader, second, third]) {
    const weapon = merc.class === 'Ranger' ? ITEMS.hunterBow : merc.class === 'Spearman' ? ITEMS.ashSpear : merc.class === 'Rogue' ? ITEMS.ironDagger : ITEMS.rustySword;
    merc.equipment.weapon = cloneItem(weapon);
  }
  third.equipment.armor = cloneItem(ITEMS.leatherArmor);
  third.maxArmor += ITEMS.leatherArmor.armor!;
  third.armor = third.maxArmor;
  return ensureCoreSystems({
    companyName, crowns: 120, food: 12, morale: 50, day: 1, rests: 0,
    worldX: 520, worldY: 900, mercenaries: [leader, second, third],
    inventory: [cloneItem(ITEMS.bread), cloneItem(ITEMS.meat)],
    quests: [structuredClone(BASE_QUEST)], discovered: ['stonebridge'],
    enemies: startingEnemies(), currentRegion: 'Greenmarch', difficulty,
    origin: 'Wandering Friends', explorationMode: 'Adaptive', permadeath: false, influence: 30,
    fatigue: 0, maxFatigue: 100, valor: 2, maxValor: 4,
    suspicion: 0, wantedLevel: 0, knowledge: 0, knowledgePoints: 0,
    unlockedKnowledge: [], prisoners: [], ponies: [], campFacilities: ['Campfire', 'Tent', 'Workshop'],
    torches: 6, tombs: [], tradeGoods: {}, materials: {}, ropes: 3, animals: [],
    paths: {
      'Power and Glory': { xp: 0, level: 1, points: 0 },
      'Trade and Craftsmanship': { xp: 0, level: 1, points: 0 },
      'Crime and Chaos': { xp: 0, level: 1, points: 0 },
      'Mysteries and Wisdom': { xp: 0, level: 1, points: 0 }
    }
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

export function canEquipItem(merc: Mercenary, item: Item): boolean {
  if (!item.slot) return false;
  if (item.slot !== 'weapon') return true;
  const id = item.id.toLowerCase();
  return (
    (id.includes('bow') && merc.class === 'Ranger') ||
    (id.includes('axe') && merc.class === 'Warrior') ||
    (id.includes('spear') && merc.class === 'Spearman') ||
    (id.includes('dagger') && merc.class === 'Rogue') ||
    (id.includes('sword') && (merc.class === 'Swordsman' || merc.class === 'Warrior')) ||
    (!id.includes('bow') && !id.includes('axe') && !id.includes('spear') && !id.includes('dagger') && !id.includes('sword'))
  );
}

export function equipItem(state: GameState, mercId: string, itemId: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  const index = state.inventory.findIndex(i => i.id === itemId);
  if (!merc || index < 0) return false;
  const item = state.inventory[index];
  if (!item.slot || !canEquipItem(merc, item)) return false;
  const old = merc.equipment[item.slot];
  merc.equipment[item.slot] = item;
  state.inventory.splice(index, 1);
  if (old) state.inventory.push(old);
  if (item.slot === 'armor') {
    const condition = merc.maxArmor > 0 ? Math.min(1, merc.armor / merc.maxArmor) : 1;
    merc.maxArmor = Math.max(0, merc.maxArmor + (item.armor ?? 0) - (old?.armor ?? 0));
    merc.armor = Math.floor(merc.maxArmor * condition);
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

export function useItem(state: GameState, itemId: string, mercId?: string): boolean {
  const index = state.inventory.findIndex(i => i.id === itemId);
  if (index < 0) return false;
  const item = state.inventory[index];
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (item.food) state.food += item.food;
  else if (item.name === 'Repair Kit' && merc) {
    if (merc.armor >= merc.maxArmor && Object.values(merc.equipment).every(i => !i?.maxDurability || i.durability === i.maxDurability)) return false;
    merc.armor = merc.maxArmor;
    for (const gear of Object.values(merc.equipment)) if (gear?.maxDurability) gear.durability = gear.maxDurability;
  } else if (item.name === 'Armor Reinforcement' && merc) {
    merc.maxArmor += 2;
    merc.armor += 2;
  } else return false;
  state.inventory.splice(index, 1);
  return true;
}

export function buyFood(state: GameState, amount = 6, cost = 12): boolean {
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.food += amount;
  return true;
}

export function recruit(state: GameState, name = 'Kestrel', cls: MercClass = 'Spearman', cost = 85): boolean {
  ensureCoreSystems(state);
  const influenceCost = 10;
  if (state.crowns < cost || state.influence < influenceCost || state.mercenaries.length >= 10) return false;
  state.crowns -= cost;
  state.influence -= influenceCost;
  state.mercenaries.push(createMercenary(name, cls));
  return true;
}

export function repairAll(state: GameState): number {
  let missing = 0;
  for (const m of state.mercenaries) {
    missing += Math.max(0, m.maxArmor - m.armor);
    for (const item of Object.values(m.equipment)) {
      if (item?.maxDurability && item.durability !== undefined) missing += item.maxDurability - item.durability;
    }
  }
  const cost = Math.ceil(missing * 0.5);
  if (state.crowns < cost) return -1;
  state.crowns -= cost;
  for (const m of state.mercenaries) {
    m.armor = m.maxArmor;
    for (const item of Object.values(m.equipment)) if (item?.maxDurability) item.durability = item.maxDurability;
  }
  return cost;
}

export function rest(state: GameState): { ok: boolean; wagesPaid: number } {
  const neededFood = personalityFoodCost(state);
  if (state.food < neededFood) return { ok: false, wagesPaid: 0 };
  state.food -= neededFood;
  state.day += 1;
  ensureCoreSystems(state);
  state.fatigue = 0;
  state.valor = state.maxValor;
  state.rests += 1;
  for (const m of state.mercenaries) { m.health = m.maxHealth; m.armor = m.maxArmor; }
  for (const a of state.animals) a.health = a.maxHealth;
  let wagesPaid = 0;
  if (state.rests % 3 === 0) {
    const wages = wageTotal(state);
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
  state.influence += 10;
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
    power: 5 + strength * 2, movement: 145, crit: 0.06, acted: false, moved: false, facing: -1 as const, statuses: [], valorTriggeredThisTurn: false
  }));
}

export function serializeState(state: GameState): string { return JSON.stringify(state); }

export function deserializeState(raw: string): GameState | null {
  try {
    const value = JSON.parse(raw) as GameState;
    if (!value || !Array.isArray(value.mercenaries) || !Number.isFinite(value.crowns) || typeof value.companyName !== 'string') return null;
    if (![value.inventory, value.quests, value.enemies, value.discovered].every(Array.isArray)) return null;
    if (![value.worldX, value.worldY, value.food, value.day, value.morale, value.rests].every(Number.isFinite)) return null;
    if (!value.mercenaries.every(m => m && CLASS_STATS[m.class] && typeof m.id === 'string' && typeof m.name === 'string' && m.equipment && Array.isArray(m.traits) && [m.health, m.maxHealth, m.armor, m.maxArmor, m.level, m.xp, m.strength, m.dexterity, m.movement, m.crit, m.wage].every(Number.isFinite))) return null;
    // Older versions reused item template IDs for every copy in the pack.
    const ids = new Set<string>();
    for (const item of [...value.inventory, ...value.mercenaries.flatMap(m => Object.values(m.equipment))]) {
      if (!item || typeof item.id !== 'string') return null;
      if (ids.has(item.id)) item.id = uid(item.id);
      ids.add(item.id);
    }
    return ensureCoreSystems(value);
  } catch { return null; }
}


export function animalToBattleUnit(a: AnimalCompanion, x: number, y: number): BattleUnit {
  return {
    id: uid('animal-unit'), name: a.name, side: 'player', x, y,
    health: a.health, maxHealth: a.maxHealth, armor: 0, maxArmor: 0,
    power: a.power, movement: a.movement, crit: 0.1, acted: false, moved: false,
    animalId: a.id, facing: 1, statuses: [], valorTriggeredThisTurn: false
  };
}
