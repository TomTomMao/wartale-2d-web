import { describe, expect, it } from 'vitest';
import { acceptQuest, applyDamage, buyFood, createInitialState, equipItem, recruit, rest, sellItem, serializeState, deserializeState, turnInQuest } from '../src/domain';
import { ITEMS } from '../src/data';
import {
  applyOrigin, applyPoisonOil, assignProfession, availableSkills, availableSpecializations, buildCampFacility, buyPony, buyTradeGood, captureAnimal, capturePrisoner,
  carryingCapacity, changeRelationship, commitCrime, craftRecipe, ensureCoreSystems, exploreTomb,
  healInjury, inflictInjury, learnSkill, sellTradeGood, setValorStyle, specializeMercenary, turnInPrisoner, unlockKnowledge, workProfession
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


describe('specializations crafting injuries paths and animals', () => {
  it('unlocks a class specialization at level 3', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    m.level = 3;
    expect(availableSpecializations(m.class).length).toBeGreaterThan(0);
    expect(specializeMercenary(s,m.id,availableSpecializations(m.class)[0])).toBe(true);
    expect(m.specialization).toBeTruthy();
  });

  it('learns a class skill with a skill point', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    m.skillPoints = 1;
    const skill = availableSkills(m.class)[0];
    expect(learnSkill(s,m.id,skill)).toBe(true);
    expect(m.learnedSkills).toContain(skill);
    expect(m.skillPoints).toBe(0);
  });

  it('crafts recipes from materials', () => {
    const s = createInitialState();
    const before = s.torches;
    expect(craftRecipe(s,'Torch')).toBe(true);
    expect(s.torches).toBe(before + 2);
  });

  it('can inflict and heal injuries using medicine', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    expect(inflictInjury(s,m.id,'Deep Cut')).toBe(true);
    s.inventory.push({id:'medicine-test',name:'Medicine',rarity:'Common',value:1});
    expect(healInjury(s,m.id)).toBe(true);
    expect(m.injury).toBeUndefined();
  });

  it('animal capture consumes rope and creates a combat companion', () => {
    const s = createInitialState();
    const ropes = s.ropes;
    expect(captureAnimal(s,'Wolf')).toBe(true);
    expect(s.ropes).toBe(ropes - 1);
    expect(s.animals).toHaveLength(1);
  });

  it('crime progresses the crime path', () => {
    const s = createInitialState();
    const before = s.paths['Crime and Chaos'].xp;
    commitCrime(s,80);
    expect(s.paths['Crime and Chaos'].xp).toBeGreaterThan(before);
  });

  it('profession work progresses trade path', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    assignProfession(s,m.id,'Tinkerer');
    const before = s.paths['Trade and Craftsmanship'].xp;
    workProfession(s,m.id);
    expect(s.paths['Trade and Craftsmanship'].xp).toBeGreaterThan(before);
  });
});


describe('origin, influence, weapon compatibility and oils', () => {
  it('applies an original starting background', () => {
    const s = createInitialState();
    const before = s.crowns;
    applyOrigin(s, 'Road Traders');
    expect(s.origin).toBe('Road Traders');
    expect(s.crowns).toBeGreaterThan(before);
    expect(s.tradeGoods.wool).toBeGreaterThan(0);
  });

  it('recruitment consumes influence', () => {
    const s = createInitialState();
    s.crowns = 500;
    const before = s.influence;
    expect(recruit(s)).toBe(true);
    expect(s.influence).toBeLessThan(before);
  });

  it('rejects a bow on a swordsman', () => {
    const s = createInitialState();
    const m = s.mercenaries.find(m => m.class === 'Swordsman') ?? s.mercenaries[0];
    s.inventory.push(structuredClone(ITEMS.hunterBow));
    expect(equipItem(s, m.id, 'hunter-bow')).toBe(false);
  });

  it('applies crafted poison oil to an equipped weapon', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    s.inventory.push({id:'poison-oil-test',name:'Poison Oil',rarity:'Uncommon',value:1});
    expect(applyPoisonOil(s,m.id)).toBe(true);
    expect(m.weaponOil).toBe('Poison');
  });
});


describe('combat Valor style', () => {
  it('assigns a configurable Valor generation condition', () => {
    const s = createInitialState();
    const m = s.mercenaries[0];
    expect(setValorStyle(s,m.id,'Victory')).toBe(true);
    expect(m.valorStyle).toBe('Victory');
  });
});
