import type { CampFacility, GameState, Item, Mercenary, PathName, Profession, ValorStyle } from './types';
import { missingResources, spendResources, type ResourceCost } from './resources';

export const professionThresholds = [0, 30, 90, 220, 500];
export const PROFESSION_INFO: Record<Profession, string> = {
  Blacksmith: 'Forge weapons and armor, upgrade gear to +3, and repair the whole company with iron.',
  Cook: 'Cook grain into provisions. Your best cook reduces rest food by 1 (2 at Lv 4). A Cooking Pot improves meals.',
  Miner: 'Prospect for iron each day and extract extra ore at the Iron Mine. Higher levels yield more iron.',
  Alchemist: 'Brew medicine and poison oil from herbs. Lv 3 alchemists produce two doses per recipe.',
  Tinkerer: 'Make repair kits, extra torches and armor reinforcement at your Workshop. Salvage more wood at the Old Mill.',
  Scholar: 'Study for knowledge, gain extra knowledge in tombs and identify battlefield records. A Lectern improves research.',
  Thief: 'Open locked caches without materials and steal with less suspicion. Daily work earns crowns at a cost in suspicion.'
};

export function ensureCoreSystems(state: GameState): GameState {
  state.fatigue ??= 0;
  state.origin ??= 'Wandering Friends';
  state.explorationMode ??= 'Adaptive';
  state.permadeath ??= false;
  state.influence ??= 30;
  state.maxFatigue ??= 100;
  state.valor ??= 2;
  state.maxValor ??= 4;
  state.suspicion ??= 0;
  state.wantedLevel ??= 0;
  state.knowledge ??= 0;
  state.knowledgePoints ??= 0;
  state.unlockedKnowledge ??= [];
  state.locations ??= {};
  state.prisoners ??= [];
  if (!state.ponies || state.ponies.length === 0) state.ponies = [{ id: 'pony-1', name: 'Bracken', capacity: 30 }];
  state.campFacilities ??= ['Campfire', 'Tent', 'Workshop'];
  state.torches ??= 6;
  if (!state.tombs || state.tombs.length === 0) state.tombs = [
    { id: 'greenmarch-tomb', name: 'Mossbound Barrow', roomsExplored: 0, totalRooms: 5, codices: 0, completed: false },
    { id: 'ashen-tomb', name: 'Cinder Vault', roomsExplored: 0, totalRooms: 6, codices: 0, completed: false },
    { id: 'frost-tomb', name: 'White Crypt', roomsExplored: 0, totalRooms: 6, codices: 0, completed: false }
  ];
  state.tradeGoods ??= { wool: 0, salt: 0, spice: 0 };
  state.materials ??= {};
  state.materials.iron ??= 4;
  state.materials.leather ??= 4;
  state.materials.wood ??= 5;
  state.materials.herbs ??= 3;
  state.materials.cloth ??= 2;
  state.materials.grain ??= 4;
  state.ropes ??= 3;
  state.animals ??= [];
  state.paths ??= {
    'Power and Glory': { xp: 0, level: 1, points: 0 },
    'Trade and Craftsmanship': { xp: 0, level: 1, points: 0 },
    'Crime and Chaos': { xp: 0, level: 1, points: 0 },
    'Mysteries and Wisdom': { xp: 0, level: 1, points: 0 }
  };
  for (const m of state.mercenaries) {
    m.relations ??= {};
    m.professionHistory ??= {};
    m.learnedSkills ??= [];
    m.skillPoints ??= 0;
    m.appearanceVariant ??= 0;
    m.valorStyle ??= m.class === 'Ranger' ? 'Support' : m.class === 'Rogue' ? 'Victory' : 'Engagement';
  }
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

export function travelStep(state: GameState, distance: number, onRoad = false): void {
  ensureCoreSystems(state);
  state.fatigue = Math.min(state.maxFatigue, state.fatigue + distance * (onRoad ? 0.008 : 0.015));
  if (state.suspicion > 0) {
    state.suspicion = Math.max(0, state.suspicion - distance * 0.004);
    state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
  }
  if (state.fatigue >= state.maxFatigue) state.morale = Math.max(0, state.morale - 0.02 * distance);
}

export function assignProfession(state: GameState, mercId: string, profession: Profession): boolean {
  ensureCoreSystems(state);
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc || !Object.hasOwn(PROFESSION_INFO, profession)) return false;
  if (merc.profession?.name === profession) return true;
  if (merc.profession) merc.professionHistory![merc.profession.name] = { ...merc.profession };
  merc.profession = { ...(merc.professionHistory![profession] ?? { name: profession, level: 1, xp: 0 }) };
  return true;
}

export function bestProfessional(state: GameState, profession: Profession): Mercenary | undefined {
  return state.mercenaries.filter(m => m.health > 0 && m.profession?.name === profession).sort((a, b) => b.profession!.level - a.profession!.level || b.profession!.xp - a.profession!.xp)[0];
}

export function awardProfessionXp(state: GameState, merc: Mercenary, amount: number): void {
  if (!merc.profession) return;
  const p = merc.profession;
  p.xp += amount;
  while (p.level < 5 && p.xp >= professionThresholds[p.level]) p.level += 1;
  merc.professionHistory ??= {};
  merc.professionHistory[p.name] = { ...p };
  awardPathXp(state, 'Trade and Craftsmanship', 5);
}

function needsRepair(merc: Mercenary): boolean {
  return merc.armor < merc.maxArmor || Object.values(merc.equipment).some(i => i?.maxDurability && (i.durability ?? i.maxDurability) < i.maxDurability);
}

export function professionWorkStatus(state: GameState, mercId: string): { label: string; benefit: string; cost: ResourceCost; reason?: string } {
  ensureCoreSystems(state);
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc?.profession) return { label: 'Assign a profession', benefit: '', cost: {}, reason: 'Assign a profession first.' };
  const level = merc.profession.level;
  const jobs: Record<Profession, { label: string; benefit: string; cost: ResourceCost }> = {
    Cook: { label: 'Prepare meals', benefit: `+${6 + level + (state.campFacilities.includes('Cooking Pot') ? 2 : 0)} provisions · +2 morale`, cost: { materials: { grain: 2, wood: 1 } } },
    Miner: { label: 'Prospect for ore', benefit: `+${2 + level} iron`, cost: {} },
    Blacksmith: { label: 'Repair company', benefit: 'Restore all equipped armor and durability', cost: { materials: { iron: 1 } } },
    Alchemist: { label: 'Brew medicine', benefit: `+${level >= 3 ? 2 : 1} Field Medicine · treats injuries`, cost: { materials: { herbs: 2, cloth: 1 } } },
    Tinkerer: { label: 'Make repair kits', benefit: '+2 Repair Kits · restore one mercenary’s equipment each', cost: { materials: { iron: 1, wood: 1 } } },
    Scholar: { label: 'Study field notes', benefit: `+${25 + level * 5 + (state.campFacilities.includes('Lectern') ? 15 : 0)} knowledge`, cost: {} },
    Thief: { label: 'Fence a small haul', benefit: `+${20 + level * 4} crowns · +${Math.round(Math.max(6, 22 - level * 3) * (state.unlockedKnowledge.includes('nimble-fingers') ? .8 : 1))} suspicion`, cost: {} }
  };
  const job = jobs[merc.profession.name];
  const reason = merc.lastWorkedDay === state.day ? `${merc.name} has already worked today. Rest before working again.`
    : merc.health <= 0 ? 'This mercenary cannot work.'
    : merc.profession.name === 'Blacksmith' && !state.mercenaries.some(needsRepair) ? 'Company equipment is already repaired.'
    : merc.profession.name === 'Tinkerer' && !state.campFacilities.includes('Workshop') ? 'Build a Workshop first.'
    : missingResources(state, job.cost);
  return { ...job, reason };
}

export function workProfession(state: GameState, mercId: string): string {
  const job = professionWorkStatus(state, mercId);
  if (job.reason) return job.reason;
  const merc = state.mercenaries.find(m => m.id === mercId)!;
  const p = merc.profession!;
  const level = p.level;
  spendResources(state, job.cost);
  merc.lastWorkedDay = state.day;
  switch (p.name) {
    case 'Cook': state.food += 6 + level + (state.campFacilities.includes('Cooking Pot') ? 2 : 0); state.morale = Math.min(100, state.morale + 2); break;
    case 'Miner': state.materials.iron += 2 + level; break;
    case 'Scholar': gainKnowledge(state, 25 + level * 5 + (state.campFacilities.includes('Lectern') ? 15 : 0)); break;
    case 'Thief': commitCrime(state, Math.max(6, 22 - level * 3)); state.crowns += 20 + level * 4; break;
    case 'Alchemist':
      for (let i = 0; i < (level >= 3 ? 2 : 1); i++) state.inventory.push({ id: `medicine-${crypto.randomUUID()}`, name: 'Field Medicine', rarity: 'Common', value: 18, weight: 0.2 });
      break;
    case 'Blacksmith':
      for (const member of state.mercenaries) {
        member.armor = member.maxArmor;
        for (const item of Object.values(member.equipment)) if (item?.maxDurability) item.durability = item.maxDurability;
      }
      break;
    case 'Tinkerer':
      for (let i = 0; i < 2; i++) state.inventory.push({ id: `repair-kit-${crypto.randomUUID()}`, name: 'Repair Kit', rarity: 'Common', value: 14, weight: 0.5 });
      break;
  }
  awardProfessionXp(state, merc, 25);
  return `${merc.name}: ${job.label.toLowerCase()}. ${job.benefit}. +25 profession XP.`;
}

export function commitCrime(state: GameState, severity: number): void {
  ensureCoreSystems(state);
  if (state.unlockedKnowledge.includes('nimble-fingers')) severity = Math.round(severity * 0.8);
  state.suspicion = Math.min(500, state.suspicion + severity);
  state.wantedLevel = Math.min(5, Math.ceil(state.suspicion / 100));
  awardPathXp(state, 'Crime and Chaos', Math.max(2, Math.round(severity / 10)));
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

export function tradeSellPrice(region: string, good: string, merchantInstinct = false): number {
  return Math.max(1, Math.floor(tradePrice(region, good) * (merchantInstinct ? 0.9 : 0.8)));
}

export function buyTradeGood(state: GameState, good: string): boolean {
  ensureCoreSystems(state);
  const price = tradePrice(state.currentRegion, good);
  if (state.crowns < price) return false;
  state.crowns -= price;
  state.tradeGoods[good] = (state.tradeGoods[good] ?? 0) + 1;
  awardPathXp(state, 'Trade and Craftsmanship', 3);
  return true;
}

export function sellTradeGood(state: GameState, good: string): number {
  ensureCoreSystems(state);
  if ((state.tradeGoods[good] ?? 0) <= 0) return 0;
  const price = tradeSellPrice(state.currentRegion, good, state.unlockedKnowledge.includes('merchant-instinct'));
  state.tradeGoods[good] -= 1;
  state.crowns += price;
  awardPathXp(state, 'Trade and Craftsmanship', 5);
  return price;
}

export const CAMP_FACILITY_COSTS: Record<CampFacility, number> = {
  Campfire: 0, Tent: 0, Workshop: 0, 'Cooking Pot': 45, Lectern: 60, 'Strategy Table': 75, 'Training Dummy': 70, Stocks: 65
};

export function buildCampFacility(state: GameState, facility: CampFacility): boolean {
  ensureCoreSystems(state);
  if (!Object.hasOwn(CAMP_FACILITY_COSTS, facility) || state.campFacilities.includes(facility)) return false;
  const cost = CAMP_FACILITY_COSTS[facility];
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.campFacilities.push(facility);
  if (facility === 'Strategy Table') state.maxValor += 1;
  if (facility === 'Tent') state.maxValor = Math.max(state.maxValor, 4);
  return true;
}

export function changeRelationship(state: GameState, aId: string, bId: string, amount: number): void {
  ensureCoreSystems(state);
  const a = state.mercenaries.find(m => m.id === aId);
  const b = state.mercenaries.find(m => m.id === bId);
  if (!a || !b || a.id === b.id) return;
  a.relations[b.id] = Math.max(-100, Math.min(100, (a.relations[b.id] ?? 0) + amount));
  b.relations[a.id] = Math.max(-100, Math.min(100, (b.relations[a.id] ?? 0) + amount));
  if (amount > 0) awardPathXp(state, 'Power and Glory', 2);
}

export function exploreTomb(state: GameState, tombId: string): { ok: boolean; message: string } {
  ensureCoreSystems(state);
  const tomb = state.tombs.find(t => t.id === tombId);
  if (!tomb) return { ok: false, message: 'Unknown tomb.' };
  if (tomb.completed) return { ok: false, message: 'This tomb has already been cleared.' };
  if (state.torches <= 0) return { ok: false, message: 'You need more torches.' };
  state.torches -= 1;
  tomb.roomsExplored += 1;
  awardPathXp(state, 'Mysteries and Wisdom', 6);
  const scholar = bestProfessional(state, 'Scholar');
  const knowledge = (state.unlockedKnowledge.includes('old-languages') ? 30 : 18) + (scholar?.profession!.level ?? 0) * 10;
  gainKnowledge(state, knowledge);
  if (scholar) awardProfessionXp(state, scholar, 20);
  if (tomb.roomsExplored % 2 === 0 && tomb.codices < 3) tomb.codices += 1;
  if (tomb.roomsExplored >= tomb.totalRooms) {
    tomb.completed = true;
    gainKnowledge(state, 80);
    state.crowns += 90;
    const relic: Item = { id: `relic-${tomb.id}`, name: `${tomb.name} Relic`, rarity: 'Rare', value: 120, power: 3, weight: 1 };
    state.inventory.push(relic);
    return { ok: true, message: `Tomb cleared. Recovered a relic and ${tomb.codices} codex fragments.` };
  }
  return { ok: true, message: `Explored room ${tomb.roomsExplored}/${tomb.totalRooms}. +${knowledge} knowledge${scholar ? ` · ${scholar.name} +20 Scholar XP` : ''}. Codices: ${tomb.codices}/3.` };
}

export const CORE_PARITY_FEATURES = [
  'open-world', 'contracts', 'recruitment', 'equipment-progression', 'tactical-combat',
  'camp-survival', 'fatigue', 'valor', 'professions', 'knowledge', 'crime-wanted',
  'prisoners', 'pack-animals', 'regional-trading', 'relationships', 'tombs',
  'camp-upgrades', 'crafting'
] as const;


const specializations: Record<string, string[]> = {
  Swordsman: ['Defender','Duelist'],
  Warrior: ['Berserker','Destroyer'],
  Ranger: ['Hunter','Marksman'],
  Spearman: ['Sentinel','Harpooner'],
  Rogue: ['Assassin','Trickster']
};

const classSkills: Record<string, string[]> = {
  Swordsman: ['Riposte','Taunt'],
  Warrior: ['Heavy Strike','Rage'],
  Ranger: ['Aimed Shot','Pinning Shot'],
  Spearman: ['Brace','Long Reach'],
  Rogue: ['Poison Blade','Dash']
};

export function availableSpecializations(className: string): string[] {
  return specializations[className] ?? [];
}

export function specializeMercenary(state: GameState, mercId: string, specialization: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc || merc.level < 3 || merc.specialization) return false;
  if (!(specializations[merc.class] ?? []).includes(specialization)) return false;
  merc.specialization = specialization;
  merc.maxHealth += specialization === 'Defender' || specialization === 'Sentinel' ? 5 : 0;
  merc.maxArmor += specialization === 'Defender' ? 3 : 0;
  return true;
}

export function learnSkill(state: GameState, mercId: string, skill: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc || merc.skillPoints < 1 || merc.learnedSkills.includes(skill)) return false;
  if (!(classSkills[merc.class] ?? []).includes(skill)) return false;
  merc.skillPoints -= 1;
  merc.learnedSkills.push(skill);
  return true;
}

export function availableSkills(className: string): string[] {
  return classSkills[className] ?? [];
}

export const recipeCosts: Record<string, Record<string, number>> = {
  'Repair Kit': { iron: 1, wood: 1 },
  'Medicine': { herbs: 2, cloth: 1 },
  'Torch': { wood: 1, cloth: 1 },
  'Armor Reinforcement': { iron: 2, leather: 1 },
  'Poison Oil': { herbs: 2, iron: 1 }
};

export function craftRecipeStatus(state: GameState, recipe: string): { cost: ResourceCost; quantity: number; reason?: string; worker?: Mercenary } {
  ensureCoreSystems(state);
  if (!Object.hasOwn(recipeCosts, recipe)) return { cost: {}, quantity: 0, reason: 'Unknown recipe.' };
  const materials = recipeCosts[recipe];
  const profession = ['Medicine', 'Poison Oil'].includes(recipe) ? 'Alchemist' : 'Tinkerer';
  const worker = bestProfessional(state, profession);
  const level = worker?.profession!.level ?? 0;
  const cost = { materials };
  const reason = recipe !== 'Torch' && !worker ? `Assign a ${profession} in Company.`
    : recipe === 'Armor Reinforcement' && level < 2 ? 'Requires a Lv 2 Tinkerer.'
    : profession === 'Tinkerer' && !state.campFacilities.includes('Workshop') ? 'Build a Workshop first.'
    : missingResources(state, cost);
  const quantity = recipe === 'Torch' ? 2 + level : profession === 'Alchemist' && level >= 3 ? 2 : 1;
  return { cost, quantity, worker, reason };
}

export function craftRecipe(state: GameState, recipe: string): boolean {
  const status = craftRecipeStatus(state, recipe);
  if (status.reason) return false;
  spendResources(state, status.cost);
  if (recipe === 'Torch') state.torches += status.quantity;
  else for (let i = 0; i < status.quantity; i++) {
    const id = `${recipe.toLowerCase().replaceAll(' ', '-')}-${crypto.randomUUID()}`;
    if (recipe === 'Medicine') state.inventory.push({ id, name: 'Medicine', rarity: 'Common', value: 18, weight: 0.2 });
    else if (recipe === 'Armor Reinforcement') state.inventory.push({ id, name: recipe, rarity: 'Uncommon', value: 35, armor: 2, weight: 0.5 });
    else if (recipe === 'Poison Oil') state.inventory.push({ id, name: recipe, rarity: 'Uncommon', value: 28, weight: 0.2 });
    else state.inventory.push({ id, name: 'Repair Kit', rarity: 'Common', value: 14, weight: 0.5 });
  }
  if (status.worker) awardProfessionXp(state, status.worker, 15);
  gainKnowledge(state, 8);
  return true;
}

export function inflictInjury(state: GameState, mercId: string, injury?: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc || merc.injury) return false;
  merc.injury = injury ?? ['Sprained Ankle','Broken Rib','Deep Cut','Head Wound'][Math.floor(Math.random()*4)];
  merc.movement = Math.max(90, merc.movement - 15);
  return true;
}

export function healInjury(state: GameState, mercId: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc?.injury) return false;
  const medicineIndex = state.inventory.findIndex(i => i.name === 'Medicine' || i.name === 'Field Medicine');
  if (medicineIndex < 0) return false;
  state.inventory.splice(medicineIndex,1);
  merc.injury = undefined;
  merc.movement += 15;
  return true;
}

export function personalityFoodCost(state: GameState): number {
  ensureCoreSystems(state);
  const base = state.mercenaries.reduce((n,m)=>n + 2 + (m.traits.includes('Glutton') ? 1 : 0),0) + state.animals.length * 4;
  const cookingDiscount = state.campFacilities.includes('Cooking Pot') ? 2 : 0;
  const cookLevel = bestProfessional(state, 'Cook')?.profession!.level ?? 0;
  const cookDiscount = cookLevel >= 4 ? 2 : cookLevel > 0 ? 1 : 0;
  return Math.max(1, base - cookingDiscount - cookDiscount - (state.unlockedKnowledge.includes('field-rations') ? 1 : 0));
}

export function wageTotal(state: GameState): number {
  return state.mercenaries.reduce((n,m)=>n + Math.round(m.wage * (m.traits.includes('Greedy') ? 1.15 : 1)),0);
}


export function awardPathXp(state: GameState, path: PathName, amount: number): void {
  ensureCoreSystems(state);
  const p = state.paths[path];
  p.xp += amount;
  while (p.level < 12 && p.xp >= p.level * 60) {
    p.xp -= p.level * 60;
    p.level += 1;
    p.points += 1;
  }
}

export function captureAnimal(state: GameState, species: 'Wolf' = 'Wolf'): boolean {
  ensureCoreSystems(state);
  if (state.ropes < 1 || state.animals.length >= 3) return false;
  state.ropes -= 1;
  state.animals.push({
    id: `animal-${Date.now()}-${state.animals.length}`,
    name: `${species} Companion ${state.animals.length + 1}`,
    species,
    health: 24,
    maxHealth: 24,
    power: 7,
    movement: 170
  });
  awardPathXp(state, 'Mysteries and Wisdom', 8);
  return true;
}

export function buyRope(state: GameState, cost = 8): boolean {
  if (state.crowns < cost) return false;
  state.crowns -= cost;
  state.ropes += 1;
  return true;
}


export function applyOrigin(state: GameState, origin: GameState['origin']): void {
  ensureCoreSystems(state);
  state.origin = origin;
  if (origin === 'Disgraced Guards') {
    state.influence += 12;
    state.crowns = Math.max(0, state.crowns - 20);
    state.mercenaries.forEach(m => { m.maxArmor += 2; m.armor += 2; });
  } else if (origin === 'Road Traders') {
    state.crowns += 60;
    state.tradeGoods.wool = (state.tradeGoods.wool ?? 0) + 2;
    state.influence = Math.max(0, state.influence - 5);
  } else {
    state.food += 4;
    state.morale = Math.min(100, state.morale + 8);
  }
}

export function applyPoisonOil(state: GameState, mercId: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  const idx = state.inventory.findIndex(i => i.name === 'Poison Oil');
  if (!merc || idx < 0 || !merc.equipment.weapon) return false;
  state.inventory.splice(idx,1);
  merc.weaponOil = 'Poison';
  return true;
}

export function cycleAppearance(state: GameState, mercId: string): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc) return false;
  merc.appearanceVariant = ((merc.appearanceVariant ?? 0) + 1) % 4;
  return true;
}


export function setValorStyle(state: GameState, mercId: string, style: ValorStyle): boolean {
  const merc = state.mercenaries.find(m => m.id === mercId);
  if (!merc) return false;
  merc.valorStyle = style;
  return true;
}
