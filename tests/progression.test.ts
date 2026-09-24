import { describe, expect, it } from 'vitest';
import { canEquipItem, cloneItem, createInitialState, createMercenary, deserializeState, equipItem, rest, serializeState, totalAttack } from '../src/domain';
import { ITEMS, LOCATIONS } from '../src/data';
import { assignProfession, awardProfessionXp, bestProfessional, craftRecipe, craftRecipeStatus, exploreTomb, personalityFoodCost, professionWorkStatus, workProfession } from '../src/systems';
import { companyGear, FORGE_RECIPES, forgeEquipment, upgradeEquipment, upgradeStatus } from '../src/forging';
import { clearLocationGarrison, enterLocation, exploreSite, locationDefender, locationProgress, stealTownSupplies } from '../src/locations';
import { buyMaterialBundle } from '../src/resources';
import type { GameState, MercClass, Profession } from '../src/types';

function company(profession?: Profession, level = 1) {
  const state = createInitialState();
  if (profession) {
    assignProfession(state, state.mercenaries[0].id, profession);
    state.mercenaries[0].profession!.level = level;
    state.mercenaries[0].profession!.xp = [0, 0, 30, 90, 220, 500][level];
  }
  return state;
}
function visit(state: GameState, id: string) {
  const loc = LOCATIONS.find(l => l.id === id)!;
  state.worldX = loc.x; state.worldY = loc.y;
  expect(enterLocation(state, id)).toBe(true);
}
function stock(state: GameState) {
  state.crowns = 2000;
  for (const material of Object.keys(state.materials)) state.materials[material] = 100;
}

describe('professions produce real, bounded benefits', () => {
  it('a Miner produces usable iron instead of only money', () => {
    const s = company('Miner');
    const before = s.materials.iron, crowns = s.crowns;
    workProfession(s, s.mercenaries[0].id);
    expect(s.materials.iron).toBe(before + 3);
    expect(s.crowns).toBe(crowns);
    expect(s.mercenaries[0].profession!.xp).toBe(25);
  });
  it('a Cook uses grain, reduces rest food and benefits from the Cooking Pot', () => {
    const s = company();
    const normalFood = personalityFoodCost(s);
    assignProfession(s, s.mercenaries[0].id, 'Cook');
    expect(personalityFoodCost(s)).toBe(normalFood - 1);
    s.campFacilities.push('Cooking Pot');
    expect(personalityFoodCost(s)).toBe(normalFood - 3);
    const food = s.food;
    workProfession(s, s.mercenaries[0].id);
    expect(s.food).toBe(food + 9);
    expect(s.materials.grain).toBe(2);
    expect(s.materials.wood).toBe(4);
    s.mercenaries[0].profession!.level = 4;
    expect(personalityFoodCost(s)).toBe(normalFood - 4);
  });
  it('Blacksmith work repairs the whole company and never charges for a no-op', () => {
    const s = company('Blacksmith');
    const before = serializeState(s);
    expect(workProfession(s, s.mercenaries[0].id)).toContain('already repaired');
    expect(serializeState(s)).toBe(before);
    s.mercenaries[2].armor = 0;
    s.mercenaries[1].equipment.weapon!.durability = 1;
    workProfession(s, s.mercenaries[0].id);
    expect(s.mercenaries.every(m => m.armor === m.maxArmor)).toBe(true);
    expect(s.mercenaries[1].equipment.weapon!.durability).toBe(s.mercenaries[1].equipment.weapon!.maxDurability);
    expect(s.materials.iron).toBe(3);
  });
  it('Alchemy requires herbs and Lv 3 yields two separately usable doses', () => {
    const s = company('Alchemist', 3);
    workProfession(s, s.mercenaries[0].id);
    const meds = s.inventory.filter(i => i.name === 'Field Medicine');
    expect(meds).toHaveLength(2);
    expect(meds[0].id).not.toBe(meds[1].id);
    expect(s.materials.herbs).toBe(1);
    s.materials.herbs = 0;
    expect(craftRecipe(s, 'Medicine')).toBe(false);
  });
  it('Tinkerers make kits and improve torch output; reinforcement requires Lv 2', () => {
    const s = company('Tinkerer');
    workProfession(s, s.mercenaries[0].id);
    expect(s.inventory.filter(i => i.name === 'Repair Kit')).toHaveLength(2);
    const before = s.torches;
    expect(craftRecipeStatus(s, 'Armor Reinforcement').reason).toContain('Lv 2');
    expect(craftRecipe(s, 'Torch')).toBe(true);
    expect(s.torches).toBe(before + 3);
    expect(s.mercenaries[0].profession!.level).toBe(2);
    expect(craftRecipeStatus(s, 'Armor Reinforcement').reason).toBeUndefined();
  });
  it('Scholars gain research bonuses from the Lectern and tomb rooms', () => {
    const s = company('Scholar');
    s.campFacilities.push('Lectern');
    workProfession(s, s.mercenaries[0].id);
    expect(s.knowledge).toBe(45);
    exploreTomb(s, 'greenmarch-tomb');
    expect(s.knowledge).toBe(73);
    expect(s.mercenaries[0].profession!.xp).toBe(45);
  });
  it('a Thief earns money with less suspicion at higher levels', () => {
    const novice = company('Thief'), expert = company('Thief', 4);
    workProfession(novice, novice.mercenaries[0].id);
    workProfession(expert, expert.mercenaries[0].id);
    expect(expert.crowns).toBeGreaterThan(novice.crowns);
    expect(expert.suspicion).toBeLessThan(novice.suspicion);
  });
  it('failed work consumes no materials, daily slot, or XP', () => {
    const s = company('Cook'); s.materials.grain = 0;
    const before = serializeState(s);
    expect(professionWorkStatus(s, s.mercenaries[0].id).reason).toContain('grain');
    workProfession(s, s.mercenaries[0].id);
    expect(serializeState(s)).toBe(before);
  });
  it('switching professions preserves progress without resetting daily work', () => {
    const s = company('Miner'), id = s.mercenaries[0].id;
    awardProfessionXp(s, s.mercenaries[0], 95);
    workProfession(s, id);
    assignProfession(s, id, 'Cook');
    expect(workProfession(s, id)).toContain('already worked');
    assignProfession(s, id, 'Miner');
    expect(s.mercenaries[0].profession).toEqual({ name: 'Miner', level: 3, xp: 120 });
    rest(s);
    expect(professionWorkStatus(s, id).reason).toBeUndefined();
  });
  it('uses the strongest specialist, without stacking multiple passive cooks', () => {
    const s = company('Cook');
    const base = personalityFoodCost(s);
    assignProfession(s, s.mercenaries[1].id, 'Cook');
    expect(personalityFoodCost(s)).toBe(base);
    s.mercenaries[1].profession!.level = 4;
    expect(bestProfessional(s, 'Cook')!.id).toBe(s.mercenaries[1].id);
    expect(personalityFoodCost(s)).toBe(base - 1);
  });
  it('advanced recipes validate the profession before spending resources', () => {
    const s = company();
    const before = serializeState(s);
    expect(craftRecipe(s, 'Poison Oil')).toBe(false);
    expect(craftRecipe(s, 'not-a-recipe')).toBe(false);
    expect(serializeState(s)).toBe(before);
    assignProfession(s, s.mercenaries[0].id, 'Alchemist');
    expect(craftRecipe(s, 'Poison Oil')).toBe(true);
    expect(s.inventory.at(-1)!.name).toBe('Poison Oil');
  });
});

describe('equipment forging and upgrades', () => {
  it.each(FORGE_RECIPES.map(r => r.id))('forges %s with unique identity and correct class restrictions', id => {
    const s = company('Blacksmith', 2); stock(s);
    const first = forgeEquipment(s, id).item!, second = forgeEquipment(s, id).item!;
    expect(first.id).not.toBe(second.id);
    expect(first.durability).toBe(first.maxDurability);
    for (const cls of ['Swordsman', 'Warrior', 'Ranger', 'Spearman', 'Rogue'] as MercClass[]) {
      expect(canEquipItem(createMercenary('Tester', cls), first)).toBe(first.slot === 'armor' || FORGE_RECIPES.find(r => r.id === id)!.users.includes(cls));
    }
  });
  it('rejects missing worker, materials, station or profession level without partial spending', () => {
    const s = company(); stock(s);
    let before = serializeState(s);
    expect(forgeEquipment(s, 'forged-sword').ok).toBe(false);
    expect(serializeState(s)).toBe(before);
    assignProfession(s, s.mercenaries[0].id, 'Blacksmith');
    s.materials.iron = 0; before = serializeState(s);
    expect(forgeEquipment(s, 'forged-sword').ok).toBe(false);
    expect(serializeState(s)).toBe(before);
    s.materials.iron = 99;
    expect(forgeEquipment(s, 'crafted-mail').message).toContain('Lv 2');
    s.worldX = 100; s.worldY = 100; s.campFacilities = [];
    expect(forgeEquipment(s, 'forged-sword').message).toContain('Workshop');
    visit(s, 'stonebridge');
    expect(forgeEquipment(s, 'forged-sword').ok).toBe(true);
  });
  it('upgrades an equipped weapon in place and immediately changes combat power', () => {
    const s = company('Blacksmith'); stock(s);
    const m = s.mercenaries[0], item = m.equipment.weapon!, before = totalAttack(m);
    expect(upgradeEquipment(s, item.id).ok).toBe(true);
    expect(m.equipment.weapon).toBe(item);
    expect(item.name).toBe('Rusty Sword +1');
    expect(totalAttack(m)).toBe(before + 2);
    expect(upgradeStatus(s, item.id).reason).toContain('Lv 2');
    expect(s.materials.iron).toBe(98);
    expect(s.materials.wood).toBe(99);
    expect(s.crowns).toBe(1988);
  });
  it('preserves damaged armor and permanent bonuses through upgrades and swaps', () => {
    const s = company('Blacksmith', 3); stock(s);
    const m = s.mercenaries[2], armor = m.equipment.armor!;
    m.maxArmor += 2; m.armor = 0;
    const max = m.maxArmor;
    armor.durability = 0;
    expect(upgradeEquipment(s, armor.id).ok).toBe(true);
    expect(m.maxArmor).toBe(max + 3);
    expect(m.armor).toBe(0);
    expect(armor.durability).toBe(0);
    const replacement = cloneItem(ITEMS.leatherArmor); s.inventory.push(replacement);
    equipItem(s, m.id, replacement.id);
    expect(m.maxArmor).toBe(max);
    equipItem(s, m.id, armor.id);
    expect(m.maxArmor).toBe(max + 3);
    expect(m.armor).toBe(0);
  });
  it('allows exactly three upgrades on pack gear, surviving a save/reload', () => {
    let s = company('Blacksmith', 3); stock(s);
    const item = forgeEquipment(s, 'forged-sword').item!;
    for (let i = 0; i < 3; i++) expect(upgradeEquipment(s, item.id).ok).toBe(true);
    s = deserializeState(serializeState(s))!;
    const before = serializeState(s);
    expect(upgradeEquipment(s, item.id).message).toContain('Maximum');
    expect(serializeState(s)).toBe(before);
    const gear = companyGear(s).find(g => g.item.id === item.id)!.item;
    expect(gear.name).toBe('Forged Sword +3');
    expect(gear.power).toBe(12);
  });
  it('does not permit upgrading consumables or unknown IDs', () => {
    const s = company('Blacksmith');
    const before = serializeState(s);
    expect(upgradeEquipment(s, s.inventory[0].id).ok).toBe(false);
    expect(upgradeEquipment(s, 'missing').ok).toBe(false);
    expect(serializeState(s)).toBe(before);
  });
});

describe('location exploration, revisits and old saves', () => {
  it.each(LOCATIONS.map(l => l.id))('allows entering and re-entering %s even when discovered', id => {
    const s = company(); if (!s.discovered.includes(id)) s.discovered.push(id);
    visit(s, id); visit(s, id);
    expect(locationProgress(s, id).entered).toBe(true);
    expect(s.discovered.filter(value => value === id)).toHaveLength(1);
  });
  it('cannot enter or loot a remote site, or search it twice', () => {
    const s = company();
    expect(enterLocation(s, 'iron-mine')).toBe(false);
    expect(exploreSite(s, 'iron-mine', 'search').ok).toBe(false);
    visit(s, 'iron-mine');
    expect(exploreSite(s, 'iron-mine', 'search').ok).toBe(true);
    const iron = s.materials.iron;
    expect(exploreSite(s, 'iron-mine', 'search').ok).toBe(false);
    expect(s.materials.iron).toBe(iron);
    expect(enterLocation(s, 'iron-mine')).toBe(true);
  });
  it('gathering has a saved daily cooldown and rewards the specialist', () => {
    let s = company('Miner'); visit(s, 'iron-mine');
    const before = s.materials.iron;
    expect(exploreSite(s, 'iron-mine', 'gather').ok).toBe(true);
    expect(s.materials.iron).toBe(before + 4);
    expect(s.mercenaries[0].profession!.xp).toBe(25);
    s = deserializeState(serializeState(s))!;
    expect(exploreSite(s, 'iron-mine', 'gather').message).toContain('Gathered today');
    rest(s);
    expect(exploreSite(s, 'iron-mine', 'gather').ok).toBe(true);
  });
  it('Old Mill gathering rewards cooks and tinkerers together', () => {
    const s = company('Cook'); assignProfession(s, s.mercenaries[1].id, 'Tinkerer'); visit(s, 'old-mill');
    const before = { ...s.materials };
    exploreSite(s, 'old-mill', 'gather');
    expect(s.materials.grain).toBe(before.grain + 4);
    expect(s.materials.wood).toBe(before.wood + 3);
    expect(s.mercenaries[0].profession!.xp).toBe(25);
    expect(s.mercenaries[1].profession!.xp).toBe(25);
  });
  it('garrisons unlock searches only on victory and stay cleared after reload', () => {
    let s = company(); visit(s, 'bandit-camp');
    const enemy = locationDefender(s, 'bandit-camp')!;
    expect(exploreSite(s, 'bandit-camp', 'search').message).toContain('defenders');
    clearLocationGarrison(s, enemy);
    expect(locationProgress(s, 'bandit-camp').cleared).toBe(false);
    enemy.alive = false; clearLocationGarrison(s, enemy);
    expect(exploreSite(s, 'bandit-camp', 'search').ok).toBe(true);
    s = deserializeState(serializeState(s))!;
    expect(locationDefender(s, 'bandit-camp')).toBeUndefined();
    expect(enterLocation(s, 'bandit-camp')).toBe(true);
    expect(exploreSite(s, 'bandit-camp', 'search').ok).toBe(false);
  });
  it('a Thief opens a cache free once; other companies can spend iron', () => {
    const s = company('Thief'); visit(s, 'old-mill');
    const before = s.materials.iron;
    expect(exploreSite(s, 'old-mill', 'cache').ok).toBe(true);
    expect(s.materials.iron).toBe(before);
    expect(s.mercenaries[0].profession!.xp).toBe(25);
    const snapshot = serializeState(s);
    expect(exploreSite(s, 'old-mill', 'cache').ok).toBe(false);
    expect(serializeState(s)).toBe(snapshot);
    const other = company(); visit(other, 'old-mill');
    expect(exploreSite(other, 'old-mill', 'cache').ok).toBe(true);
    expect(other.materials.iron).toBe(2);
  });
  it('Scholars recover extra battlefield knowledge once', () => {
    const s = company('Scholar', 2); visit(s, 'old-battlefield');
    expect(exploreSite(s, 'old-battlefield', 'search').ok).toBe(true);
    expect(s.knowledge).toBe(75);
    expect(s.mercenaries[0].profession!.xp).toBe(55);
    expect(exploreSite(s, 'old-battlefield', 'search').ok).toBe(false);
  });
  it('town theft respects a daily limit and Thief expertise', () => {
    const s = company('Thief', 3); visit(s, 'stonebridge');
    expect(stealTownSupplies(s, 'stonebridge').ok).toBe(true);
    expect(s.suspicion).toBe(49);
    const before = serializeState(s);
    expect(stealTownSupplies(s, 'stonebridge').ok).toBe(false);
    expect(serializeState(s)).toBe(before);
  });
  it('migrates old saves with discovered sites, professions and existing equipment', () => {
    const s = company('Blacksmith', 3);
    const legacy = JSON.parse(serializeState(s));
    delete legacy.locations; delete legacy.materials.grain;
    legacy.discovered = LOCATIONS.map(l => l.id);
    delete legacy.mercenaries[0].professionHistory;
    const loaded = deserializeState(JSON.stringify(legacy))!;
    expect(loaded.locations).toEqual({});
    expect(loaded.materials.grain).toBe(4);
    assignProfession(loaded, loaded.mercenaries[0].id, 'Cook');
    assignProfession(loaded, loaded.mercenaries[0].id, 'Blacksmith');
    expect(loaded.mercenaries[0].profession!.level).toBe(3);
    visit(loaded, 'old-mill');
    expect(exploreSite(loaded, 'old-mill', 'search').ok).toBe(true);
    expect(upgradeEquipment(loaded, loaded.mercenaries[0].equipment.weapon!.id).ok).toBe(true);
  });
  it('town materials can replenish exhausted supplies without money underflow', () => {
    const s = company(); s.materials.herbs = 0;
    expect(buyMaterialBundle(s, 'herbs')).toBe(true);
    expect(s.materials.herbs).toBe(3);
    expect(s.crowns).toBe(105);
    s.crowns = 0;
    expect(buyMaterialBundle(s, 'iron')).toBe(false);
    expect(buyMaterialBundle(s, 'unknown')).toBe(false);
    expect(s.materials.iron).toBe(4);
  });
});
