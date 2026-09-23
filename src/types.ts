export type MercClass = 'Swordsman' | 'Warrior' | 'Ranger' | 'Spearman' | 'Rogue';
export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type ItemSlot = 'weapon' | 'armor' | 'helmet' | 'accessory';
export type QuestState = 'available' | 'active' | 'completed';
export type Profession = 'Tinkerer' | 'Blacksmith' | 'Cook' | 'Alchemist' | 'Miner' | 'Scholar' | 'Thief';
export type CampFacility = 'Campfire' | 'Tent' | 'Workshop' | 'Cooking Pot' | 'Lectern' | 'Strategy Table' | 'Training Dummy' | 'Stocks';

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
  weight?: number;
  stolen?: boolean;
  tradeGood?: string;
}

export interface Equipment {
  weapon?: Item;
  armor?: Item;
  helmet?: Item;
  accessory?: Item;
}

export interface ProfessionProgress {
  name: Profession;
  level: number;
  xp: number;
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
  profession?: ProfessionProgress;
  specialization?: string;
  learnedSkills: string[];
  skillPoints: number;
  relations: Record<string, number>;
  injury?: string;
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

export interface Prisoner {
  id: string;
  name: string;
  bounty: number;
  escapeRisk: number;
}

export interface Pony {
  id: string;
  name: string;
  capacity: number;
}

export interface AnimalCompanion {
  id: string;
  name: string;
  species: 'Wolf';
  health: number;
  maxHealth: number;
  power: number;
  movement: number;
}

export type PathName = 'Power and Glory' | 'Trade and Craftsmanship' | 'Crime and Chaos' | 'Mysteries and Wisdom';
export interface PathProgress { xp: number; level: number; points: number; }

export interface TombProgress {
  id: string;
  name: string;
  roomsExplored: number;
  totalRooms: number;
  codices: number;
  completed: boolean;
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
  explorationMode: 'Adaptive' | 'Region Locked';
  permadeath: boolean;
  influence: number;

  fatigue: number;
  maxFatigue: number;
  valor: number;
  maxValor: number;
  suspicion: number;
  wantedLevel: number;
  knowledge: number;
  knowledgePoints: number;
  unlockedKnowledge: string[];
  prisoners: Prisoner[];
  ponies: Pony[];
  campFacilities: CampFacility[];
  torches: number;
  tombs: TombProgress[];
  tradeGoods: Record<string, number>;
  materials: Record<string, number>;
  ropes: number;
  animals: AnimalCompanion[];
  paths: Record<PathName, PathProgress>;
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
  animalId?: string;
  facing?: 1 | -1;
  engagedWithId?: string;
  statuses?: string[];
}
