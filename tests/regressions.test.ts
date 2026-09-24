import { describe, expect, it, vi, afterEach } from 'vitest';
import { cellKey, createGridLayout, manhattan, shortestPath } from '../src/battleGrid';
import { canEquipItem, cloneItem, createInitialState,  deserializeState, equipItem, repairAll, rest, serializeState, useItem } from '../src/domain';
import { ITEMS } from '../src/data';
import { assignProfession, buyTradeGood, commitCrime, exploreTomb, personalityFoodCost, sellTradeGood, tradeSellPrice, workProfession } from '../src/systems';
import { escapeHtml } from '../src/ui';
import type { MercClass } from '../src/types';

 describe('movement and responsive battlefield regressions', () => {
  it('limited routes start beside the mover and never teleport to the goal', () => {
    const grid = createGridLayout(1280, 900);
    const start = { col: 0, row: 0 };
    const path = shortestPath(grid, start, [{ col: 10, row: 5 }], new Set(), 3);
    expect(path).toHaveLength(3);
    let previous = start;
    for (const cell of path) { expect(manhattan(previous, cell)).toBe(1); previous = cell; }
    expect(manhattan(start, path[2])).toBeLessThanOrEqual(3);
  });
  it('takes the beginning of a detour, without crossing the blocking wall', () => {
    const grid = createGridLayout(1280, 900);
    const start = { col: 0, row: 2 };
    const blocked = new Set(['1,0', '1,1', '1,2', '1,3']);
    const full = shortestPath(grid, start, [{ col: 5, row: 2 }], blocked);
    const limited = shortestPath(grid, start, [{ col: 5, row: 2 }], blocked, 3);
    expect(limited).toEqual(full.slice(0, 3));
    expect(limited.every(c => !blocked.has(cellKey(c)))).toBe(true);
  });
  it.each([[320,568], [390,844], [844,390], [1280,720]])('fits the board on a %sx%s viewport', (width, height) => {
    const grid = createGridLayout(width, height);
    expect(grid.originX).toBeGreaterThanOrEqual(0);
    expect(grid.originY).toBeGreaterThanOrEqual(0);
    expect(grid.originX + grid.cols * grid.cellSize).toBeLessThan(width);
    expect(grid.originY + grid.rows * grid.cellSize).toBeLessThan(height - 80);
  });
  it('preserves tactical dimensions when rotating', () => {
    const portrait = createGridLayout(390, 844);
    const landscape = createGridLayout(844, 390, portrait);
    expect([landscape.cols, landscape.rows]).toEqual([portrait.cols, portrait.rows]);
    expect(landscape.cellSize).toBeLessThan(portrait.cellSize);
  });
});

describe('equipment, economy, supplies and saved games', () => {
  it.each<MercClass>(['Swordsman','Warrior','Ranger','Spearman','Rogue'])('starts %s companies with compatible weapons and correct armor', cls => {
    const state = createInitialState('Test', cls);
    for (const merc of state.mercenaries) expect(canEquipItem(merc, merc.equipment.weapon!)).toBe(true);
    const armored = state.mercenaries[2];
    expect(armored.maxArmor).toBe((armored.class === 'Warrior' ? 7 : 8) + 5);
    expect(armored.armor).toBe(armored.maxArmor);
  });
  it('gives identical loot distinct identities and equips the selected copy', () => {
    const state = createInitialState();
    const first = cloneItem(ITEMS.militiaSword), second = cloneItem(ITEMS.militiaSword);
    expect(first.id).not.toBe(second.id);
    state.inventory.push(first, second);
    equipItem(state, state.mercenaries[0].id, second.id);
    expect(state.mercenaries[0].equipment.weapon).toBe(second);
    expect(state.inventory).toContain(first);
  });
  it('does not reuse mercenary IDs after a module reload and save load', async () => {
    const state = createInitialState();
    const originalIds = state.mercenaries.map(m => m.id);
    vi.resetModules();
    const reloaded = await import('../src/domain');
    const loaded = reloaded.deserializeState(serializeState(state))!;
    loaded.mercenaries.push(reloaded.createMercenary('New recruit','Spearman'));
    expect(originalIds).not.toContain(loaded.mercenaries.at(-1)!.id);
  });
  it('migrates duplicate item IDs from existing saves', () => {
    const state = createInitialState();
    state.inventory = [structuredClone(ITEMS.militiaSword), structuredClone(ITEMS.militiaSword)];
    const loaded = deserializeState(serializeState(state))!;
    expect(new Set(loaded.inventory.map(i=>i.id)).size).toBe(2);
  });
  it('rejects structurally incomplete save data', () => {
    expect(deserializeState('{"companyName":"Broken","crowns":10,"mercenaries":[]}')).toBeNull();
    const state = createInitialState();
    state.mercenaries[0].health = Number.NaN;
    expect(deserializeState(serializeState(state))).toBeNull();
  });
  it('does not repair damaged armor or erase permanent bonuses when swapping gear', () => {
    const state = createInitialState();
    const merc = state.mercenaries[0];
    merc.maxArmor += 3; // earned permanent bonus
    merc.armor = 0;
    const armor = cloneItem(ITEMS.leatherArmor);
    state.inventory.push(armor);
    expect(equipItem(state, merc.id, armor.id)).toBe(true);
    expect(merc.maxArmor).toBe(18);
    expect(merc.armor).toBe(0);
  });
  it('blacksmith repair charges for lost armor and restores it', () => {
    const state = createInitialState();
    state.mercenaries[0].armor = 0;
    const crowns = state.crowns;
    const cost = repairAll(state);
    expect(cost).toBe(5);
    expect(state.crowns).toBe(crowns - cost);
    expect(state.mercenaries[0].armor).toBe(state.mercenaries[0].maxArmor);
  });
  it('a same-town trade loses money while a regional route can earn a profit', () => {
    const state = createInitialState();
    const initial = state.crowns;
    buyTradeGood(state, 'wool');
    sellTradeGood(state, 'wool');
    expect(state.crowns).toBeLessThan(initial);
    const beforeTrip = state.crowns;
    buyTradeGood(state, 'wool');
    state.currentRegion = 'Frostmere';
    sellTradeGood(state, 'wool');
    expect(state.crowns).toBeGreaterThan(beforeTrip);
  });
  it('converts pack food to provisions once, and rests animal companions', () => {
    const state = createInitialState();
    const bread = state.inventory.find(i => i.food === 2)!;
    const before = state.food;
    expect(useItem(state, bread.id)).toBe(true);
    expect(state.food).toBe(before + 2);
    expect(useItem(state, bread.id)).toBe(false);
    state.animals.push({ id:'wolf-test', name:'Wolf', species:'Wolf', health:2, maxHealth:24, power:7, movement:150 });
    expect(rest(state).ok).toBe(true);
    expect(state.animals[0].health).toBe(24);
  });
  it('uses repair supplies only on a mercenary who needs repairs', () => {
    const state = createInitialState();
    state.inventory.push({ id:'kit', name:'Repair Kit', rarity:'Common', value:10 });
    expect(useItem(state,'kit',state.mercenaries[0].id)).toBe(false);
    state.mercenaries[0].armor = 0;
    expect(useItem(state,'kit',state.mercenaries[0].id)).toBe(true);
    expect(state.inventory.some(i=>i.id==='kit')).toBe(false);
  });
  it('escapes a company name rendered into interface HTML', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});

describe('storage availability', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps a company playable when the browser denies storage', async () => {
    vi.stubGlobal('localStorage', { getItem:()=>{throw new Error('Denied');}, setItem:()=>{throw new Error('Quota');} });
    const store = await import('../src/store');
    expect(store.hasSave()).toBe(false);
    expect(store.startNewGame('Private company','Ranger','Normal').companyName).toBe('Private company');
    expect(store.saveGame()).toBe(false);
    expect(store.loadGame()).toBeNull();
  });
});


describe('meaningful progression', () => {
  it('profession work is limited per mercenary per day, including after changing jobs', () => {
    const state = createInitialState();
    const merc = state.mercenaries[0];
    assignProfession(state, merc.id, 'Miner');
    workProfession(state, merc.id);
    const crowns = state.crowns;
    expect(workProfession(state, merc.id)).toContain('already worked');
    expect(state.crowns).toBe(crowns);
    assignProfession(state, merc.id, 'Miner');
    expect(merc.profession?.xp).toBe(25);
    assignProfession(state, merc.id, 'Cook');
    expect(workProfession(state, merc.id)).toContain('already worked');
    rest(state);
    expect(workProfession(state, merc.id)).toContain('meals');
  });
  it('each knowledge perk has the advertised gameplay effect', () => {
    const state = createInitialState();
    const baseFood = personalityFoodCost(state);
    state.unlockedKnowledge.push('field-rations','nimble-fingers','merchant-instinct','old-languages');
    expect(personalityFoodCost(state)).toBe(baseFood - 1);
    commitCrime(state, 100);
    expect(state.suspicion).toBe(80);
    expect(tradeSellPrice(state.currentRegion,'wool',true)).toBeGreaterThan(tradeSellPrice(state.currentRegion,'wool'));
    exploreTomb(state,'greenmarch-tomb');
    expect(state.knowledge).toBe(30);
  });
});
