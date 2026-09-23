import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game';
import { acceptQuest, buyFood, equipItem, recruit, repairAll, rest, sellItem, totalAttack, turnInQuest } from './domain';
import { getState, hasSave, loadGame, resetSave, saveGame, startNewGame } from './store';
import {
  applyOrigin, applyPoisonOil, assignProfession, availableSkills, availableSpecializations, buildCampFacility, buyPony, buyRope, buyTradeGood, captureAnimal, capturePrisoner,
  carryingCapacity, changeRelationship, commitCrime, craftRecipe, ensureCoreSystems, exploreTomb,
  cycleAppearance, healInjury, inventoryWeight, layLow, learnSkill, sellTradeGood, specializeMercenary, tradePrice,
  turnInPrisoner, unlockKnowledge, workProfession
} from './systems';
import type { CampFacility, GameState, MercClass, Profession } from './types';

const hud = document.querySelector<HTMLDivElement>('#hud')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLDivElement>('#toast-root')!;
const gameRoot = document.querySelector<HTMLDivElement>('#game-root')!;
let game: Phaser.Game | null = null;
let scene: GameScene | null = null;
let currentTownName = 'Stonebridge';
let currentVictoryKind: 'bandit' | 'wolf' | 'raider' | null = null;

const professions: Profession[] = ['Tinkerer','Blacksmith','Cook','Alchemist','Miner','Scholar','Thief'];
const facilities: CampFacility[] = ['Cooking Pot','Lectern','Strategy Table','Training Dummy','Stocks'];
const knowledgeNodes = [
  ['field-rations','Field Rations: +camp efficiency'],
  ['nimble-fingers','Nimble Fingers: crime path perk'],
  ['merchant-instinct','Merchant Instinct: trade path perk'],
  ['old-languages','Old Languages: tomb research perk']
] as const;

function bootGame(): void {
  if (game) game.destroy(true);
  gameRoot.innerHTML = '';
  ensureCoreSystems(getState());
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#29251d',
    scene: [GameScene],
    physics: { default: 'arcade' },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { pixelArt: true, antialias: false, roundPixels: true }
  });
  const timer = window.setInterval(() => {
    const s = game?.scene.getScene('game');
    if (s) {
      scene = s as GameScene;
      window.clearInterval(timer);
      exposeTestApi();
    }
  }, 30);
  hud.classList.remove('hidden');
  renderWorldHud();
}

function button(label: string, action: string, cls = '', attrs = ''): string {
  return `<button class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

function renderWorldHud(): void {
  const s = ensureCoreSystems(getState());
  const weight = inventoryWeight(s);
  const cap = carryingCapacity(s);
  hud.innerHTML = `
    <div class="topbar world-topbar" data-testid="world-hud">
      <div class="hud-brand">
        <div class="company-mark">⚔</div>
        <div class="hud-title"><strong>${s.companyName}</strong><span>Day ${s.day} · ${s.currentRegion}</span></div>
      </div>
      <div class="resource-strip">
        <span class="resource-chip"><b>👑</b><em>${s.crowns}</em></span>
        <span class="resource-chip desktop-resource"><b>✦</b><em>${s.influence}</em></span>
        <span class="resource-chip"><b>🍞</b><em>${s.food}</em></span>
        <span class="resource-chip"><b>⚡</b><em>${Math.round(s.fatigue)}</em></span>
        <span class="resource-chip desktop-resource"><b>⚔</b><em>${s.valor}/${s.maxValor}</em></span>
        <span class="resource-chip wanted-chip"><b>⚖</b><em>${s.wantedLevel}</em></span>
        <span class="resource-chip desktop-resource"><b>🎒</b><em>${weight.toFixed(1)}/${cap}</em></span>
      </div>
    </div>
    <div class="quickbar mobile-nav" data-testid="mobile-nav">
      ${button('<span class="nav-icon">🛡</span><span class="nav-label">Company</span>', 'inventory', 'nav-btn')}
      ${button('<span class="nav-icon">📜</span><span class="nav-label">Contracts</span>', 'quests', 'nav-btn')}
      ${button('<span class="nav-icon">✦</span><span class="nav-label">Knowledge</span>', 'knowledge', 'nav-btn')}
      ${button('<span class="nav-icon">🔥</span><span class="nav-label">Camp</span>', 'camp', 'nav-btn')}
      ${button('<span class="nav-icon">💾</span><span class="nav-label">Save</span>', 'save', 'nav-btn')}
    </div>
  `;
}

function renderBattleHud(detail: any): void {
  const selected = detail.selected;
  hud.innerHTML = `
    <div class="topbar battlebar" data-testid="battle-hud">
      <div class="hud-brand"><div class="company-mark battle-mark">⚔</div><div class="hud-title"><strong>Round ${detail.round}</strong><span>${detail.enemies} enemies · Valor ${detail.valor ?? getState().valor}/${getState().maxValor}</span></div></div>
      <div class="selected-unit-card">${selected ? `<strong>${selected.name}</strong><span>❤ ${selected.health} &nbsp; ◆ ${selected.armor}</span>` : '<strong>Select a mercenary</strong><span>Tap a blue unit to begin</span>'}</div>
    </div>
    <div class="battle-actions">
      ${button('<span class="action-icon">✦</span><span>Rally</span><small>1 Valor</small>', 'valor-skill', !selected ? 'disabled-look action-btn' : 'action-btn')}
      ${button('<span class="action-icon">🛡</span><span>Guard</span>', 'guard', !selected ? 'disabled-look action-btn' : 'action-btn')}
      ${button('<span class="action-icon">✓</span><span>End Unit</span>', 'end-unit', !selected ? 'disabled-look action-btn' : 'action-btn')}
    </div>`;
}

function showToast(message: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRoot.append(el);
  setTimeout(() => el.remove(), 2600);
}

function closeModal(): void { modal.innerHTML = ''; }

function showMainMenu(): void {
  hud.classList.add('hidden');
  modal.innerHTML = `
    <div class="fullscreen-menu parchment" data-testid="main-menu">
      <div class="crest">⚔</div>
      <h1>Ironbound Chronicles</h1>
      <p class="subtitle">A mercenary company tactical RPG</p>
      ${button('New Company', 'new-game', 'primary')}
      <button class="btn" data-action="continue" data-testid="continue-button" ${hasSave() ? '' : 'disabled'}>Continue</button>
      <div class="small-note">Explore, take contracts, manage professions, trade, evade the law, raid tombs and survive as a mercenary company.</div>
    </div>`;
}

function showNewGame(): void {
  modal.innerHTML = `
    <div class="fullscreen-menu parchment" data-testid="new-game-form">
      <h2>Found a Mercenary Company</h2>
      <label>Company name<input id="company-name" value="Iron Wolves" maxlength="28" /></label>
      <label>Starting leader<select id="leader-class"><option>Swordsman</option><option>Warrior</option><option>Ranger</option></select></label>
      <label>Background<select id="origin"><option selected>Wandering Friends</option><option>Disgraced Guards</option><option>Road Traders</option></select></label>
      <label>Difficulty<select id="difficulty"><option>Easy</option><option selected>Normal</option><option>Hard</option></select></label>
      <label>Exploration<select id="exploration-mode"><option selected>Adaptive</option><option>Region Locked</option></select></label>
      <label>Permadeath<select id="permadeath"><option value="off" selected>Off</option><option value="on">On</option></select></label>
      ${button('Begin Journey', 'start-game', 'primary')}
      ${button('Back', 'main-menu')}
    </div>`;
}

function showInventory(): void {
  const s = ensureCoreSystems(getState());
  const mercs = s.mercenaries.map(m => {
    const relation = s.mercenaries.filter(o=>o.id!==m.id).map(o => `${o.name}: ${m.relations[o.id] ?? 0}`).join(' · ');
    return `<div class="merc-card">
      <strong>${m.name}</strong><span>${m.class} · Lv ${m.level}</span>
      <span>HP ${m.health}/${m.maxHealth} · Armor ${m.armor}/${m.maxArmor} · Attack ${totalAttack(m)}</span>
      <span>Weapon: ${m.equipment.weapon?.name ?? 'None'} · Armor: ${m.equipment.armor?.name ?? 'None'}</span>
      <span>Profession: ${m.profession ? `${m.profession.name} Lv ${m.profession.level} (${m.profession.xp} XP)` : 'Unassigned'}</span>
      <div>
        ${professions.map(p=>`<button class="mini" data-action="assign-profession" data-merc="${m.id}" data-profession="${p}">${p}</button>`).join('')}
        ${m.profession ? `<button class="mini" data-action="work-profession" data-merc="${m.id}">Work</button>` : ''}
      </div>
      <span>Specialization: ${m.specialization ?? (m.level >= 3 ? 'Choose one' : 'Unlocks at Lv 3')}</span>
      <div>${!m.specialization && m.level>=3 ? availableSpecializations(m.class).map(sp=>`<button class="mini" data-action="specialize" data-merc="${m.id}" data-specialization="${sp}">${sp}</button>`).join('') : ''}</div>
      <span>Skills: ${m.learnedSkills.join(', ') || 'None'} · Skill Points: ${m.skillPoints}</span>
      <div>${m.skillPoints>0 ? availableSkills(m.class).filter(sk=>!m.learnedSkills.includes(sk)).map(sk=>`<button class="mini" data-action="learn-skill" data-merc="${m.id}" data-skill="${sk}">${sk}</button>`).join('') : ''}</div>
      <span>Traits: ${m.traits.join(', ') || 'None'} ${m.injury ? `· Injury: ${m.injury}` : ''}</span>
      <span>Appearance Variant: ${m.appearanceVariant ?? 0} · Weapon Oil: ${m.weaponOil ?? 'None'}</span>
      <div><button class="mini" data-action="cycle-appearance" data-merc="${m.id}">Change Look</button>
      ${s.inventory.some(i=>i.name==='Poison Oil') && m.equipment.weapon ? `<button class="mini" data-action="apply-oil" data-merc="${m.id}">Apply Poison Oil</button>` : ''}</div>
      ${m.injury ? `<button class="mini" data-action="heal-injury" data-merc="${m.id}">Use Medicine</button>` : ''}
      <span>Relations: ${relation || 'No bonds yet'}</span>
    </div>`;
  }).join('');
  const items = s.inventory.map((i, idx) => `<div class="item-row rarity-${i.rarity.toLowerCase()}"><div><strong>${i.name}</strong><span>${i.rarity}${i.power ? ` · +${i.power} power` : ''}${i.armor ? ` · +${i.armor} armor` : ''} · ${i.weight ?? 1} wt</span></div><div>${i.slot ? `<button class="mini" data-action="equip" data-item-index="${idx}">Equip on ${s.mercenaries[0].name}</button>` : ''}<button class="mini" data-action="sell" data-item-index="${idx}">Sell ${Math.floor(i.value * .55)}</button></div></div>`).join('') || '<p>Inventory empty.</p>';
  modal.innerHTML = `<div class="panel wide" data-testid="inventory-panel"><header><h2>Company · ${inventoryWeight(s).toFixed(1)}/${carryingCapacity(s)} weight</h2><button class="x" data-action="close">×</button></header><div class="two-col"><section><h3>Mercenaries & Professions</h3>${mercs}</section><section><h3>Pack</h3>${items}</section></div></div>`;
}

function showKnowledge(): void {
  const s = ensureCoreSystems(getState());
  modal.innerHTML = `<div class="panel wide" data-testid="knowledge-panel"><header><h2>Knowledge & Paths</h2><button class="x" data-action="close">×</button></header>
    <p>Compendium: ${s.knowledge}/100 · Knowledge Points: <strong>${s.knowledgePoints}</strong></p>
    <div class="town-grid">
      ${Object.entries(s.paths).map(([name,p])=>`<div class="service"><h3>${name}</h3><p>Level ${p.level} · ${p.xp}/${p.level*60} XP · Path Points ${p.points}</p></div>`).join('')}
    </div>
    ${knowledgeNodes.map(([key,label])=>`<div class="quest-card"><strong>${label}</strong><div>${s.unlockedKnowledge.includes(key) ? 'UNLOCKED' : button('Unlock (1 KP)', 'unlock-knowledge', '', `data-key="${key}"`)}</div></div>`).join('')}
  </div>`;
}

function showQuests(): void {
  const s = getState();
  const list = s.quests.map(q => `<div class="quest-card"><strong>${q.name}</strong><p>${q.description}</p><div>${q.state.toUpperCase()} · ${q.progress}/${q.required}</div>${q.state === 'available' ? `<button class="mini" data-action="accept-quest" data-quest="${q.id}">Accept</button>` : ''}${q.state === 'active' && q.progress >= q.required ? `<button class="mini" data-action="turn-in" data-quest="${q.id}">Turn in</button>` : ''}<div class="reward">Reward: ${q.rewardCrowns} crowns · ${q.rewardXp} XP</div></div>`).join('');
  modal.innerHTML = `<div class="panel" data-testid="quest-panel"><header><h2>Contracts</h2><button class="x" data-action="close">×</button></header>${list}</div>`;
}

function showCamp(): void {
  const s = ensureCoreSystems(getState());
  const wages = s.mercenaries.reduce((n,m)=>n+m.wage,0);
  const build = facilities.filter(f=>!s.campFacilities.includes(f)).map(f => button(`Build ${f}`, 'build-facility', '', `data-facility="${f}"`)).join('');
  modal.innerHTML = `<div class="panel camp-panel wide" data-testid="camp-panel"><header><h2>Company Camp</h2><button class="x" data-action="close">×</button></header>
    <div class="camp-art"><div class="fire">🔥</div>${s.mercenaries.slice(0,6).map((m,i)=>`<div class="camper c${i}">◆<span>${m.name}</span></div>`).join('')}</div>
    <p>Fatigue <strong>${Math.round(s.fatigue)}/${s.maxFatigue}</strong> · Valor <strong>${s.valor}/${s.maxValor}</strong>. Rest costs <strong>${s.mercenaries.length * 2 + s.animals.length * 4} food</strong>; wages <strong>${wages}</strong> every third rest.</p>
    <p>Animals: ${s.animals.map(a=>`${a.name} HP ${a.health}/${a.maxHealth}`).join(', ') || 'None'} · Ropes: ${s.ropes}</p>
    <p>Facilities: ${s.campFacilities.join(', ')}</p>
    <p>Materials: Iron ${s.materials.iron ?? 0} · Leather ${s.materials.leather ?? 0} · Wood ${s.materials.wood ?? 0} · Herbs ${s.materials.herbs ?? 0} · Cloth ${s.materials.cloth ?? 0} · Torches ${s.torches}</p>
    <div class="row">${button('Rest until morning', 'rest', 'primary')}${build}${s.mercenaries.length>1?button('Share a meal / Socialise','socialise'):''}${s.wantedLevel?button('Lay Low','lay-low'):''}</div>
    <h3>Crafting</h3>
    <div class="row">${['Repair Kit','Medicine','Torch','Armor Reinforcement','Poison Oil'].map(r=>button(`Craft ${r}`,'craft','',`data-recipe="${r}"`)).join('')}</div>
  </div>`;
}

function showTown(name: string): void {
  currentTownName = name;
  const s = ensureCoreSystems(getState());
  const q = s.quests[0];
  const trade = ['wool','salt','spice'].map(g=>`<div class="item-row"><div><strong>${g}</strong><span>Price ${tradePrice(s.currentRegion,g)} · Held ${s.tradeGoods[g] ?? 0}</span></div><div><button class="mini" data-action="buy-trade" data-good="${g}">Buy</button><button class="mini" data-action="sell-trade" data-good="${g}">Sell</button></div></div>`).join('');
  const prisoners = s.prisoners.map(p=>`<button class="mini" data-action="turn-prisoner" data-prisoner="${p.id}">Turn in ${p.name} (+${p.bounty})</button>`).join('') || '<span class="muted">No prisoners.</span>';
  modal.innerHTML = `<div class="panel wide town-panel" data-testid="town-panel"><header><div><small>Settlement · ${s.currentRegion}</small><h2>${name}</h2></div><button class="x" data-action="close">×</button></header>
    <div class="town-grid">
      <div class="service"><h3>🍺 Tavern & Stable</h3><p>Recruit mercenaries with crowns + Influence, buy pack animals and rope.</p>${button('Recruit Kestrel', 'recruit')}${button('Buy Pack Pony (90)', 'buy-pony')}${button('Buy Rope (8)', 'buy-rope')}</div>
      <div class="service"><h3>⚒ Blacksmith</h3><p>Repair company equipment.</p>${button('Repair all', 'repair')}</div>
      <div class="service"><h3>🧺 Market & Trade</h3><p>6 food for 12 crowns. Regional prices create caravan opportunities.</p>${button('Buy provisions', 'buy-food')}${trade}${button('Steal supplies', 'steal', 'danger')}</div>
      <div class="service"><h3>📜 Contract Board</h3><p>${q.name} — ${q.state}</p>${q.state==='available' ? button('Accept contract','accept-town-quest') : q.state==='active'&&q.progress>=q.required ? button('Claim reward','turn-in-town-quest','primary') : '<span class="muted">Return after defeating the target.</span>'}</div>
      <div class="service"><h3>⚖ Watch House</h3><p>Suspicion ${Math.round(s.suspicion)} · Wanted level ${s.wantedLevel}</p>${prisoners}</div>
    </div><footer>👑 ${s.crowns} · ✦ ${s.influence} Influence · 🍞 ${s.food} · 🐴 ${s.ponies.length}</footer></div>`;
}

function showTomb(id: string, name: string): void {
  const s = ensureCoreSystems(getState());
  const t = s.tombs.find(t=>t.id===id);
  modal.innerHTML = `<div class="panel" data-testid="tomb-panel"><header><h2>🗿 ${name}</h2><button class="x" data-action="close">×</button></header>
    <p>Dark ruins require torches. Search rooms for codices, knowledge and relics.</p>
    <p>Rooms: ${t?.roomsExplored ?? 0}/${t?.totalRooms ?? '?'} · Codices: ${t?.codices ?? 0}/3 · Torches: ${s.torches}</p>
    ${button(t?.completed?'Cleared':'Explore next room','explore-tomb',t?.completed?'disabled-look':'',`data-tomb="${id}"`)}
  </div>`;
}

function showEncounter(enemy: { id: string; kind: string; strength: number }): void {
  modal.innerHTML = `<div class="encounter panel" data-testid="encounter-panel"><div class="crest small">⚔</div><h2>${enemy.kind === 'wolf' ? 'Wolf Pack' : enemy.kind === 'raider' ? 'Raider Warband' : 'Bandit Patrol'}</h2><p>Threat level ${enemy.strength}. The hostile group blocks your path.</p><div class="row">${button('Fight', `fight:${enemy.id}`, 'danger')}${button('Flee', 'flee')}</div></div>`;
}

function showVictory(detail: any): void {
  currentVictoryKind = detail.enemyKind ?? null;
  const capture = currentVictoryKind === 'wolf'
    ? button('Capture Wolf (1 rope)', 'capture-animal')
    : currentVictoryKind ? button('Capture a survivor', 'capture-prisoner') : '';
  modal.innerHTML = `<div class="panel victory" data-testid="victory-panel"><div class="crest">✦</div><h2>Victory</h2><p>Your company controls the field.</p><p><strong>Loot:</strong> ${detail.crowns} crowns · ${detail.items.join(', ') || 'supplies'}</p><div class="row">${capture}${button('Take all and continue', 'continue-battle', 'primary')}</div></div>`;
}

function showDefeat(): void {
  modal.innerHTML = `<div class="panel victory"><h2>Defeat</h2><p>Your wounded company escapes, losing 30 crowns.</p>${button('Return to world', 'continue-battle', 'primary')}</div>`;
}

function exposeTestApi(): void {
  (window as any).__GAME_TEST_API__ = {
    getGameState: () => scene?.getSnapshot(),
    movePartyTo: (x: number, y: number) => scene?.testMovePartyTo(x,y),
    triggerEncounter: (id = 'bandit-1') => scene?.testTriggerEncounter(id),
    save: () => saveGame(),
    resetSave: () => { resetSave(); location.reload(); }
  };
}

window.addEventListener('ironbound:ui', (ev: Event) => {
  const d = (ev as CustomEvent).detail;
  if (d.type === 'world') { closeModal(); renderWorldHud(); }
  if (d.type === 'toast') showToast(d.message);
  if (d.type === 'inventory') showInventory();
  if (d.type === 'quests') showQuests();
  if (d.type === 'camp') showCamp();
  if (d.type === 'town') showTown(d.townName);
  if (d.type === 'tomb') showTomb(d.tombId,d.tombName);
  if (d.type === 'encounter') showEncounter(d.enemy);
  if (d.type === 'battle') { closeModal(); renderBattleHud({round:d.round,enemies:0,valor:getState().valor,selected:null}); }
  if (d.type === 'battleHud') renderBattleHud(d);
  if (d.type === 'victory') showVictory(d);
  if (d.type === 'defeat') showDefeat();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && scene) { e.preventDefault(); scene.endSelectedUnit(); }
  if (e.key === 'Escape' && modal.innerHTML) closeModal();
});

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action!;
  const s = ensureCoreSystems(getState());

  if (action === 'new-game') showNewGame();
  else if (action === 'main-menu') showMainMenu();
  else if (action === 'continue') { if (loadGame()) { closeModal(); bootGame(); } }
  else if (action === 'start-game') {
    const company = (document.querySelector<HTMLInputElement>('#company-name')?.value || 'Iron Wolves').trim();
    const cls = document.querySelector<HTMLSelectElement>('#leader-class')!.value as MercClass;
    const origin = document.querySelector<HTMLSelectElement>('#origin')!.value as GameState['origin'];
    const difficulty = document.querySelector<HTMLSelectElement>('#difficulty')!.value as GameState['difficulty'];
    const explorationMode = document.querySelector<HTMLSelectElement>('#exploration-mode')!.value as GameState['explorationMode'];
    const permadeath = document.querySelector<HTMLSelectElement>('#permadeath')!.value === 'on';
    const state = startNewGame(company, cls, difficulty);
    applyOrigin(state, origin);
    state.explorationMode = explorationMode;
    state.permadeath = permadeath;
    saveGame();
    closeModal(); bootGame();
  }
  else if (action === 'inventory') showInventory();
  else if (action === 'quests') showQuests();
  else if (action === 'knowledge') showKnowledge();
  else if (action === 'camp') showCamp();
  else if (action === 'close') closeModal();
  else if (action === 'save') { saveGame(); showToast('Game saved.'); }
  else if (action === 'valor-skill') scene?.valorSkillSelected();
  else if (action === 'guard') scene?.guardSelectedUnit();
  else if (action === 'end-unit') scene?.endSelectedUnit();
  else if (action === 'flee') { closeModal(); scene?.fleeEncounter(); }
  else if (action.startsWith('fight:')) { closeModal(); scene?.startEncounterBattle(action.split(':')[1]); }
  else if (action === 'continue-battle') { currentVictoryKind=null; closeModal(); scene?.continueFromBattle(); renderWorldHud(); }
  else if (action === 'capture-prisoner') {
    if (currentVictoryKind && currentVictoryKind !== 'wolf') showToast(capturePrisoner(s,currentVictoryKind) ? 'Prisoner captured. Turn them in at a watch house.' : 'No room for another prisoner.');
    saveGame(); showVictory({crowns:0,items:['already collected'],enemyKind:null});
  }
  else if (action === 'capture-animal') {
    showToast(captureAnimal(s,'Wolf') ? 'Wolf captured. It will fight with the company in future battles.' : 'You need rope or have too many animals.');
    saveGame(); showVictory({crowns:0,items:['already collected'],enemyKind:null});
  }
  else if (action === 'rest') {
    const result = rest(s);
    if (!result.ok) showToast('Not enough food to rest.');
    else { saveGame(); showCamp(); showToast(result.wagesPaid ? `Rested. Paid ${result.wagesPaid} crowns in wages.` : 'Rested; fatigue cleared and Valor restored.'); renderWorldHud(); }
  }
  else if (action === 'lay-low') { layLow(s); saveGame(); showCamp(); showToast('Suspicion reduced.'); }
  else if (action === 'socialise') {
    if (s.mercenaries.length > 1) changeRelationship(s,s.mercenaries[0].id,s.mercenaries[1].id,10);
    saveGame(); showCamp(); showToast('The company shared stories around the fire. A bond improved.');
  }
  else if (action === 'build-facility') {
    const facility=target.dataset.facility as CampFacility;
    showToast(buildCampFacility(s,facility) ? `${facility} built.` : 'Cannot build that facility.');
    saveGame(); showCamp();
  }
  else if (action === 'assign-profession') {
    assignProfession(s,target.dataset.merc!,target.dataset.profession as Profession); saveGame(); showInventory();
  }
  else if (action === 'work-profession') { showToast(workProfession(s,target.dataset.merc!)); saveGame(); showInventory(); renderWorldHud(); }
  else if (action === 'specialize') { showToast(specializeMercenary(s,target.dataset.merc!,target.dataset.specialization!) ? 'Specialization chosen.' : 'Cannot specialize yet.'); saveGame(); showInventory(); }
  else if (action === 'learn-skill') { showToast(learnSkill(s,target.dataset.merc!,target.dataset.skill!) ? 'Skill learned.' : 'Cannot learn this skill.'); saveGame(); showInventory(); }
  else if (action === 'heal-injury') { showToast(healInjury(s,target.dataset.merc!) ? 'Injury treated.' : 'Medicine required.'); saveGame(); showInventory(); }
  else if (action === 'cycle-appearance') { cycleAppearance(s,target.dataset.merc!); saveGame(); showInventory(); showToast('Appearance changed.'); }
  else if (action === 'apply-oil') { showToast(applyPoisonOil(s,target.dataset.merc!) ? 'Weapon coated with Poison Oil.' : 'Requires a weapon and Poison Oil.'); saveGame(); showInventory(); }
  else if (action === 'craft') { showToast(craftRecipe(s,target.dataset.recipe!) ? `${target.dataset.recipe} crafted.` : 'Missing materials.'); saveGame(); showCamp(); renderWorldHud(); }
  else if (action === 'unlock-knowledge') {
    showToast(unlockKnowledge(s,target.dataset.key!) ? 'Knowledge unlocked.' : 'Not enough Knowledge Points.');
    saveGame(); showKnowledge();
  }
  else if (action === 'explore-tomb') {
    const result=exploreTomb(s,target.dataset.tomb!); showToast(result.message); saveGame(); showTomb(target.dataset.tomb!,s.tombs.find(t=>t.id===target.dataset.tomb)?.name ?? 'Tomb'); renderWorldHud();
  }
  else if (action === 'accept-quest' || action === 'accept-town-quest') {
    if (acceptQuest(s, action === 'accept-town-quest' ? 'east-road' : target.dataset.quest!)) { saveGame(); showToast('Contract accepted.'); }
    action === 'accept-town-quest' ? showTown(currentTownName) : showQuests();
  }
  else if (action === 'turn-in' || action === 'turn-in-town-quest') {
    if (turnInQuest(s, action === 'turn-in-town-quest' ? 'east-road' : target.dataset.quest!)) { saveGame(); showToast('Contract completed. Reward received.'); }
    action === 'turn-in-town-quest' ? showTown(currentTownName) : showQuests();
  }
  else if (action === 'buy-food') { showToast(buyFood(s) ? 'Bought provisions.' : 'Not enough crowns.'); saveGame(); showTown(currentTownName); }
  else if (action === 'recruit') { showToast(recruit(s) ? 'Kestrel joined the company.' : 'Cannot recruit right now.'); saveGame(); showTown(currentTownName); }
  else if (action === 'buy-pony') { showToast(buyPony(s) ? 'A pack pony joined the caravan.' : 'Cannot buy a pony.'); saveGame(); showTown(currentTownName); }
  else if (action === 'buy-rope') { showToast(buyRope(s) ? 'Bought rope.' : 'Not enough crowns.'); saveGame(); showTown(currentTownName); }
  else if (action === 'repair') { const cost=repairAll(s); showToast(cost<0?'Not enough crowns.':`Equipment repaired for ${cost} crowns.`); saveGame(); showTown(currentTownName); }
  else if (action === 'buy-trade') { showToast(buyTradeGood(s,target.dataset.good!) ? 'Trade good purchased.' : 'Not enough crowns.'); saveGame(); showTown(currentTownName); }
  else if (action === 'sell-trade') { const earned=sellTradeGood(s,target.dataset.good!); showToast(earned?`Sold for ${earned} crowns.`:'Nothing to sell.'); saveGame(); showTown(currentTownName); }
  else if (action === 'steal') { commitCrime(s,85); s.food+=6; saveGame(); showToast('You stole provisions. Suspicion increased sharply.'); showTown(currentTownName); }
  else if (action === 'turn-prisoner') { const reward=turnInPrisoner(s,target.dataset.prisoner!); saveGame(); showToast(reward?`Bounty paid: ${reward} crowns.`:'Prisoner unavailable.'); showTown(currentTownName); }
  else if (action === 'equip') {
    const idx = Number(target.dataset.itemIndex); const item = s.inventory[idx];
    if (item && equipItem(s, s.mercenaries[0].id, item.id)) { saveGame(); showToast(`${item.name} equipped.`); }
    showInventory(); renderWorldHud();
  }
  else if (action === 'sell') {
    const idx=Number(target.dataset.itemIndex); const item=s.inventory[idx];
    if(item){const earned=sellItem(s,item.id);saveGame();showToast(`Sold ${item.name} for ${earned} crowns.`);}
    showInventory(); renderWorldHud();
  }
});

showMainMenu();
