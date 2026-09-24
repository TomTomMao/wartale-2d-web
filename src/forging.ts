import { LOCATIONS } from './data';
import { awardProfessionXp, bestProfessional, ensureCoreSystems, gainKnowledge } from './systems';
import { missingResources, spendResources, type ResourceCost } from './resources';
import type { GameState, Item, Mercenary } from './types';

export interface ForgeRecipe {
  id: string;
  item: Omit<Item, 'id'>;
  level: number;
  cost: ResourceCost;
  users: string;
}

export const FORGE_RECIPES: ForgeRecipe[] = [
  { id: 'forged-sword', item: { name: 'Forged Sword', slot: 'weapon', power: 6, rarity: 'Uncommon', value: 50, maxDurability: 45, weight: 2.5 }, level: 1, cost: { crowns: 12, materials: { iron: 3, wood: 1 } }, users: 'Swordsman · Warrior' },
  { id: 'forged-axe', item: { name: 'Forged Axe', slot: 'weapon', power: 7, rarity: 'Uncommon', value: 55, maxDurability: 45, weight: 3 }, level: 1, cost: { crowns: 14, materials: { iron: 3, wood: 2 } }, users: 'Warrior' },
  { id: 'long-bow', item: { name: 'Long Bow', slot: 'weapon', power: 7, rarity: 'Uncommon', value: 55, maxDurability: 45, weight: 1.5 }, level: 1, cost: { crowns: 14, materials: { wood: 3, leather: 2, iron: 1 } }, users: 'Ranger' },
  { id: 'steel-spear', item: { name: 'Steel Spear', slot: 'weapon', power: 6, rarity: 'Uncommon', value: 50, maxDurability: 45, weight: 2 }, level: 1, cost: { crowns: 12, materials: { iron: 2, wood: 2 } }, users: 'Spearman' },
  { id: 'steel-dagger', item: { name: 'Steel Dagger', slot: 'weapon', power: 6, rarity: 'Uncommon', value: 48, maxDurability: 40, weight: 1 }, level: 1, cost: { crowns: 12, materials: { iron: 2, leather: 1 } }, users: 'Rogue' },
  { id: 'crafted-leather', item: { name: 'Riveted Leather', slot: 'armor', armor: 8, rarity: 'Uncommon', value: 65, maxDurability: 50, weight: 3 }, level: 1, cost: { crowns: 16, materials: { leather: 3, iron: 1, cloth: 1 } }, users: 'All classes' },
  { id: 'crafted-mail', item: { name: 'Tempered Mail', slot: 'armor', armor: 12, rarity: 'Rare', value: 100, maxDurability: 65, weight: 5 }, level: 2, cost: { crowns: 24, materials: { iron: 5, leather: 2, cloth: 2 } }, users: 'All classes' }
];

export function forgeStation(state: GameState): string | undefined {
  const town = LOCATIONS.find(l => l.type === 'town' && Math.hypot(state.worldX - l.x, state.worldY - l.y) <= 170);
  return town ? `${town.name} forge` : state.campFacilities.includes('Workshop') ? 'Camp Workshop' : undefined;
}

function forgeRequirement(state: GameState, level: number, cost: ResourceCost): string | undefined {
  const smith = bestProfessional(state, 'Blacksmith');
  return !forgeStation(state) ? 'Visit a town forge or build a Workshop.'
    : !smith ? 'Assign a Blacksmith in Company.'
    : smith.profession!.level < level ? `Requires a Lv ${level} Blacksmith. Craft equipment to gain profession XP.`
    : missingResources(state, cost);
}

export function forgeRecipeStatus(state: GameState, recipeId: string): { recipe?: ForgeRecipe; reason?: string } {
  ensureCoreSystems(state);
  const recipe = FORGE_RECIPES.find(r => r.id === recipeId);
  return recipe ? { recipe, reason: forgeRequirement(state, recipe.level, recipe.cost) } : { reason: 'Unknown equipment recipe.' };
}

export function forgeEquipment(state: GameState, recipeId: string): { ok: boolean; message: string; item?: Item } {
  const { recipe, reason } = forgeRecipeStatus(state, recipeId);
  if (!recipe || reason) return { ok: false, message: reason ?? 'Unknown recipe.' };
  const item: Item = { ...recipe.item, id: `${recipe.id}-${crypto.randomUUID()}`, durability: recipe.item.maxDurability, upgradeLevel: 0, baseName: recipe.item.name };
  spendResources(state, recipe.cost);
  state.inventory.push(item);
  awardProfessionXp(state, bestProfessional(state, 'Blacksmith')!, 20);
  gainKnowledge(state, 8);
  return { ok: true, message: `${item.name} forged and added to the pack. Equip it in Company. +20 Blacksmith XP.`, item };
}

export function companyGear(state: GameState): { item: Item; owner?: Mercenary }[] {
  return [...state.inventory.map(item => ({ item })), ...state.mercenaries.flatMap(owner => Object.values(owner.equipment).map(item => ({ item, owner })))].filter(({ item }) => item.slot === 'weapon' || item.slot === 'armor');
}

export function upgradeStatus(state: GameState, itemId: string): { item?: Item; owner?: Mercenary; nextLevel: number; cost: ResourceCost; reason?: string } {
  ensureCoreSystems(state);
  const found = companyGear(state).find(({ item }) => item.id === itemId);
  const nextLevel = (found?.item.upgradeLevel ?? 0) + 1;
  const cost: ResourceCost = { crowns: nextLevel * 12, materials: { iron: nextLevel * 2, [found?.item.slot === 'armor' ? 'leather' : 'wood']: nextLevel } };
  const reason = !found ? 'Choose a weapon or armor owned by the company.'
    : nextLevel > 3 ? 'Maximum upgrade reached (+3).'
    : forgeRequirement(state, nextLevel, cost);
  return { ...found, nextLevel, cost, reason };
}

export function upgradeEquipment(state: GameState, itemId: string): { ok: boolean; message: string } {
  const status = upgradeStatus(state, itemId);
  if (status.reason || !status.item) return { ok: false, message: status.reason ?? 'Equipment unavailable.' };
  const { item, owner, nextLevel, cost } = status;
  spendResources(state, cost);
  item.baseName ??= item.name;
  item.upgradeLevel = nextLevel;
  item.name = `${item.baseName} +${nextLevel}`;
  if (item.slot === 'weapon') item.power = (item.power ?? 0) + 2;
  else {
    item.armor = (item.armor ?? 0) + 3;
    if (owner) {
      // Preserve armor condition and innate bonuses; upgrades are not free repairs.
      const condition = owner.maxArmor > 0 ? owner.armor / owner.maxArmor : 1;
      owner.maxArmor += 3;
      owner.armor = Math.floor(owner.maxArmor * condition);
    }
  }
  if (item.maxDurability) {
    const condition = (item.durability ?? item.maxDurability) / item.maxDurability;
    item.maxDurability += 10;
    item.durability = Math.floor(item.maxDurability * condition);
  }
  item.value += nextLevel * 20;
  awardProfessionXp(state, bestProfessional(state, 'Blacksmith')!, 25);
  return { ok: true, message: `${item.name}: +${item.slot === 'weapon' ? '2 power' : '3 armor'}. +25 Blacksmith XP.` };
}
