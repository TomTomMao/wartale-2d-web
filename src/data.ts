import type { Item, MercClass, Quest, WorldEnemy } from './types';

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2200;

export const LOCATIONS = [
  { id: 'stonebridge', name: 'Stonebridge', type: 'town', x: 620, y: 820, region: 'Greenmarch' },
  { id: 'old-mill', name: 'Old Mill', type: 'poi', x: 1040, y: 620, region: 'Greenmarch' },
  { id: 'iron-mine', name: 'Iron Mine', type: 'poi', x: 1250, y: 1030, region: 'Greenmarch' },
  { id: 'bandit-camp', name: 'Bandit Camp', type: 'hostile', x: 1510, y: 760, region: 'Greenmarch' },
  { id: 'emberford', name: 'Emberford', type: 'town', x: 2150, y: 1180, region: 'Ashen Hills' },
  { id: 'ruined-keep', name: 'Ruined Keep', type: 'hostile', x: 2440, y: 780, region: 'Ashen Hills' },
  { id: 'northwatch', name: 'Northwatch', type: 'town', x: 2700, y: 1720, region: 'Frostmere' },
  { id: 'old-battlefield', name: 'Old Battlefield', type: 'hostile', x: 2350, y: 1760, region: 'Frostmere' }
] as const;

export const CLASS_STATS: Record<MercClass, { hp: number; armor: number; str: number; dex: number; move: number; crit: number; wage: number }> = {
  Swordsman: { hp: 34, armor: 10, str: 7, dex: 5, move: 150, crit: 0.08, wage: 12 },
  Warrior: { hp: 40, armor: 7, str: 9, dex: 3, move: 135, crit: 0.06, wage: 13 },
  Ranger: { hp: 28, armor: 4, str: 5, dex: 9, move: 165, crit: 0.12, wage: 12 },
  Spearman: { hp: 35, armor: 8, str: 7, dex: 5, move: 150, crit: 0.07, wage: 12 },
  Rogue: { hp: 27, armor: 3, str: 5, dex: 10, move: 180, crit: 0.17, wage: 13 }
};

export const ITEMS: Record<string, Item> = {
  rustySword: { id: 'rusty-sword', name: 'Rusty Sword', slot: 'weapon', rarity: 'Common', value: 18, power: 3, durability: 30, maxDurability: 30 },
  militiaSword: { id: 'militia-sword', name: 'Militia Sword', slot: 'weapon', rarity: 'Uncommon', value: 48, power: 6, durability: 45, maxDurability: 45 },
  hunterBow: { id: 'hunter-bow', name: 'Hunter Bow', slot: 'weapon', rarity: 'Uncommon', value: 52, power: 5, durability: 40, maxDurability: 40 },
  raiderAxe: { id: 'raider-axe', name: 'Raider Axe', slot: 'weapon', rarity: 'Rare', value: 86, power: 8, durability: 50, maxDurability: 50 },
  leatherArmor: { id: 'leather-armor', name: 'Leather Armor', slot: 'armor', rarity: 'Common', value: 30, armor: 5, durability: 40, maxDurability: 40 },
  reinforcedMail: { id: 'reinforced-mail', name: 'Reinforced Mail', slot: 'armor', rarity: 'Rare', value: 105, armor: 11, durability: 65, maxDurability: 65 },
  bread: { id: 'bread', name: 'Bread', rarity: 'Common', value: 4, food: 2 },
  meat: { id: 'meat', name: 'Dried Meat', rarity: 'Common', value: 7, food: 3 }
};

export const BASE_QUEST: Quest = {
  id: 'east-road',
  name: 'Trouble on the Eastern Road',
  description: 'Stonebridge merchants are being attacked. Defeat a bandit patrol east of town.',
  target: 'bandit',
  rewardCrowns: 150,
  rewardXp: 120,
  state: 'available',
  progress: 0,
  required: 1
};

export function startingEnemies(): WorldEnemy[] {
  return [
    { id: 'bandit-1', kind: 'bandit', x: 1260, y: 790, vx: 16, vy: -12, strength: 1, alive: true },
    { id: 'bandit-2', kind: 'bandit', x: 1580, y: 1110, vx: -10, vy: 14, strength: 1, alive: true },
    { id: 'wolf-1', kind: 'wolf', x: 920, y: 1220, vx: 12, vy: 10, strength: 1, alive: true },
    { id: 'raider-1', kind: 'raider', x: 2240, y: 1280, vx: -8, vy: -13, strength: 2, alive: true },
    { id: 'raider-2', kind: 'raider', x: 2570, y: 1660, vx: 10, vy: -9, strength: 3, alive: true }
  ];
}
