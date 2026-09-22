import { describe, expect, it } from 'vitest';
import { acceptQuest, applyDamage, buyFood, createInitialState, equipItem, recruit, rest, sellItem, serializeState, deserializeState, turnInQuest } from '../src/domain';
import { ITEMS } from '../src/data';

describe('combat rules', () => {
  it('damage removes armor before health', () => {
    const target = { health: 30, armor: 10 };
    expect(applyDamage(target, 15)).toEqual({ armorDamage: 10, healthDamage: 5 });
    expect(target).toEqual({ health: 25, armor: 0 });
  });
  it('does not make health negative', () => {
    const target = { health: 4, armor: 0 };
    applyDamage(target, 99);
    expect(target.health).toBe(0);
  });
});

describe('company systems', () => {
  it('equips an item and returns old equipment to inventory', () => {
    const s = createInitialState();
    s.inventory.push(structuredClone(ITEMS.militiaSword));
    const m = s.mercenaries[0];
    expect(equipItem(s, m.id, 'militia-sword')).toBe(true);
    expect(m.equipment.weapon?.name).toBe('Militia Sword');
    expect(s.inventory.some(i => i.id === 'rusty-sword')).toBe(true);
  });
  it('prevents purchases with insufficient money', () => {
    const s = createInitialState(); s.crowns = 5;
    expect(buyFood(s)).toBe(false); expect(s.crowns).toBe(5);
  });
  it('recruits and increases party size', () => {
    const s = createInitialState(); s.crowns = 100;
    expect(recruit(s)).toBe(true); expect(s.mercenaries).toHaveLength(4); expect(s.crowns).toBe(15);
  });
  it('rest consumes food and pays wages every third rest', () => {
    const s = createInitialState(); s.food = 100; s.crowns = 200;
    rest(s); rest(s); const before = s.crowns; const result = rest(s);
    expect(result.ok).toBe(true); expect(result.wagesPaid).toBeGreaterThan(0); expect(s.crowns).toBeLessThan(before);
  });
  it('does not rest without enough food', () => {
    const s = createInitialState(); s.food = 0; const day = s.day;
    expect(rest(s).ok).toBe(false); expect(s.day).toBe(day);
  });
  it('can sell an inventory item for crowns', () => {
    const s = createInitialState(); const before = s.crowns; const id = s.inventory[0].id;
    expect(sellItem(s, id)).toBeGreaterThan(0); expect(s.crowns).toBeGreaterThan(before);
  });
});

describe('quest state', () => {
  it('accepts and turns in a completed quest exactly once', () => {
    const s = createInitialState(); expect(acceptQuest(s, 'east-road')).toBe(true);
    s.quests[0].progress = 1; const before = s.crowns;
    expect(turnInQuest(s, 'east-road')).toBe(true); expect(s.crowns).toBe(before + 150); expect(turnInQuest(s, 'east-road')).toBe(false);
  });
});

describe('save format', () => {
  it('round trips game state', () => {
    const loaded = deserializeState(serializeState(createInitialState('Test Company')));
    expect(loaded?.companyName).toBe('Test Company'); expect(loaded?.mercenaries).toHaveLength(3);
  });
  it('rejects corrupted saves', () => expect(deserializeState('{bad')).toBeNull());
});
