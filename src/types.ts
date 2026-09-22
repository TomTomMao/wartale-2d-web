export type MercClass = 'Swordsman' | 'Warrior' | 'Ranger' | 'Spearman' | 'Rogue';
export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type ItemSlot = 'weapon' | 'armor' | 'helmet' | 'accessory';
export type QuestState = 'available' | 'active' | 'completed';

export interface Item {
  id: string;
  name: string;
  slot?: ItemSlot;
  rarity: ItemRarity;
  value: number;
  power?: number;
  armor?: number;
  food?: number;
  durability?: number;
  maxDurability?: number;
}

export interface Equipment {
  weapon?: Item;
  armor?: Item;
  helmet?: Item;
  accessory?: Item;
}

export interface Mercenary {
  id: string;
  name: string;
  class: MercClass;
  level: number;
  xp: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  strength: number;
  dexterity: number;
  movement: number;
  crit: number;
  wage: number;
  traits: string[];
  equipment: Equipment;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  target: string;
  rewardCrowns: number;
  rewardXp: number;
  state: QuestState;
  progress: number;
  required: number;
}

export interface WorldEnemy {
  id: string;
  kind: 'bandit' | 'wolf' | 'raider';
  x: number;
  y: number;
  vx: number;
  vy: number;
  strength: number;
  alive: boolean;
}

export interface GameState {
  companyName: string;
  crowns: number;
  food: number;
  morale: number;
  day: number;
  rests: number;
  worldX: number;
  worldY: number;
  mercenaries: Mercenary[];
  inventory: Item[];
  quests: Quest[];
  discovered: string[];
  enemies: WorldEnemy[];
  currentRegion: string;
  difficulty: 'Easy' | 'Normal' | 'Hard';
}

export interface BattleUnit {
  id: string;
  name: string;
  side: 'player' | 'enemy';
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  power: number;
  movement: number;
  crit: number;
  acted: boolean;
  moved: boolean;
  mercenaryId?: string;
}
