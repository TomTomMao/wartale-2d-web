import { describe, expect, it } from 'vitest';
import { acceptQuest, applyDamage, buyFood, createInitialState, equipItem, recruit, rest, sellItem, serializeState, deserializeState, turnInQuest } from '../src/domain';
import { ITEMS } from '../src/data';
import {
  assignProfession, buildCampFacility, buyPony, buyTradeGood, capturePrisoner,
  carryingCapacity, changeRelationship, commitCrime, ensureCoreSystems, exploreTomb,
  sellTradeGood, turnInPrisoner, unlockKnowledge, workProfession
} from '../src/systems';

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


describe('Wartales-like management systems', () => {
  it('migrates a new state with fatigue, valor, crime, ponies and tombs', () => {
    const s = ensureCoreSystems(createInitialState());
    expect(s.maxFatigue).toBe(100);
    expect(s.valor).toBeGreaterThan(0);
    expect(s.ponies.length).toBeGreaterThan(0);
    expect(s.tombs).toHaveLength(3);
  });

  it('supports professions and profession work', () => {
    const s = createInitialState();
    const id = s.mercenaries[0].id;
    expect(assignProfession(s, id, 'Cook')).toBe(true);
    const food = s.food;
    expect(workProfession(s, id)).toMatch(/meals/i);
    expect(s.food).toBeGreaterThan(food);
    expect(s.mercenaries[0].profession?.xp).toBeGreaterThan(0);
  });

  it('tracks crime and wanted level', () => {
    const s = createInitialState();
    commitCrime(s, 125);
    expect(s.wantedLevel).toBe(2);
    expect(s.suspicion).toBe(125);
  });

  it('captures and turns in prisoners for bounties', () => {
    const s = createInitialState();
    expect(capturePrisoner(s, 'bandit')).toBe(true);
    const before = s.crowns;
    const reward = turnInPrisoner(s, s.prisoners[0].id);
    expect(reward).toBeGreaterThan(0);
    expect(s.crowns).toBeGreaterThan(before);
  });

  it('pack ponies increase carrying capacity', () => {
    const s = createInitialState();
    const before = carryingCapacity(s);
    s.crowns = 500;
    expect(buyPony(s)).toBe(true);
    expect(carryingCapacity(s)).toBeGreaterThan(before);
  });

  it('regional trade goods can be bought and sold', () => {
    const s = createInitialState();
    s.crowns = 500;
    expect(buyTradeGood(s, 'wool')).toBe(true);
    expect(s.tradeGoods.wool).toBe(1);
    expect(sellTradeGood(s, 'wool')).toBeGreaterThan(0);
    expect(s.tradeGoods.wool).toBe(0);
  });

  it('camp facilities can increase company capabilities', () => {
    const s = createInitialState();
    s.crowns = 500;
    const before = s.maxValor;
    expect(buildCampFacility(s, 'Strategy Table')).toBe(true);
    expect(s.maxValor).toBe(before + 1);
  });

  it('relationships change symmetrically', () => {
    const s = createInitialState();
    const [a,b] = s.mercenaries;
    changeRelationship(s,a.id,b.id,10);
    expect(a.relations[b.id]).toBe(10);
    expect(b.relations[a.id]).toBe(10);
  });

  it('tomb exploration consumes torches and yields progress', () => {
    const s = createInitialState();
    const before = s.torches;
    const result = exploreTomb(s,'greenmarch-tomb');
    expect(result.ok).toBe(true);
    expect(s.torches).toBe(before - 1);
    expect(s.tombs[0].roomsExplored).toBe(1);
  });

  it('knowledge unlock consumes knowledge points once', () => {
    const s = createInitialState();
    s.knowledgePoints = 2;
    expect(unlockKnowledge(s,'field-rations')).toBe(true);
    expect(unlockKnowledge(s,'field-rations')).toBe(false);
    expect(s.knowledgePoints).toBe(1);
  });
});
