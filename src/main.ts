import Phaser from 'phaser';
import './style.css';
import { actorPortrait } from './animatedSprites';
import { icon, escapeHtml } from './ui';
import { LOCATIONS, WORLD_WIDTH, WORLD_HEIGHT } from './data';
import { GameScene } from './game';
import { acceptQuest, buyFood, canEquipItem, equipItem, recruit, repairAll, rest, sellItem, totalAttack, turnInQuest, useItem } from './domain';
import { getState, hasSave, loadGame, resetSave, saveGame, startNewGame } from './store';
import {
  applyOrigin, applyPoisonOil, assignProfession, availableSkills, availableSpecializations, buildCampFacility, buyPony, buyRope, buyTradeGood, captureAnimal, capturePrisoner,
  carryingCapacity, changeRelationship, commitCrime, craftRecipe, ensureCoreSystems, exploreTomb,
  cycleAppearance, healInjury, inventoryWeight, layLow, learnSkill, sellTradeGood, specializeMercenary, tradePrice, tradeSellPrice, personalityFoodCost, wageTotal,
  setValorStyle, turnInPrisoner, unlockKnowledge, workProfession
} from './systems';
import type { BattleUnit, CampFacility, GameState, MercClass, Profession, ValorStyle } from './types';

const hud = document.querySelector<HTMLDivElement>('#hud')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLDivElement>('#toast-root')!;
const gameRoot = document.querySelector<HTMLDivElement>('#game-root')!;
let game: Phaser.Game | null = null;
let scene: GameScene | null = null;
let currentTownName = 'Stonebridge';
let lastBattleHud: BattleHudDetail | null = null;
let currentVictoryKind: 'bandit' | 'wolf' | 'raider' | null = null;

const professions: Profession[] = ['Tinkerer','Blacksmith','Cook','Alchemist','Miner','Scholar','Thief'];
const facilities: CampFacility[] = ['Cooking Pot','Lectern','Strategy Table','Training Dummy','Stocks'];
const knowledgeNodes = [
  ['field-rations','Field Rations: rest costs 1 less food'],
  ['nimble-fingers','Nimble Fingers: 20% less suspicion from crimes'],
  ['merchant-instinct','Merchant Instinct: better trade sale prices'],
  ['old-languages','Old Languages: +12 knowledge per tomb room']
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

function portrait(className: string, extra = ''): string {
  return `<img class="portrait ${extra}" src="${actorPortrait(className)}" alt="" />`;
}

interface BattleHudDetail {
  round: number;
  phase: 'player' | 'resolving' | 'enemy' | 'finished';
  enemies: number;
  valor: number;
  tempValor: number;
  totalValor: number;
  hint: string;
  log: string[];
  roster: (BattleUnit & { className: string })[];
  selected: { id: string; name: string; health: number; armor: number; moved: boolean; acted: boolean; className?: string; range: number; steps: number; statuses: string[]; engaged: boolean; valorStyle?: string } | null;
  skills: import('./battleSkills').BattleSkill[];
  selectedSkillId?: string;
}

function button(label: string, action: string, cls = '', attrs = ''): string {
  return `<button class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

function renderWorldHud(): void {
  const s = ensureCoreSystems(getState());
  const foodCost = personalityFoodCost(s);
  const quest = s.quests.find(q => q.state === 'active') ?? s.quests.find(q => q.state === 'available');
  const objective = quest?.state === 'available' ? 'Your first contract' : quest ? (quest.progress >= quest.required ? 'Claim your reward' : 'Clear the eastern road') : 'The frontier awaits';
  const objectiveText = quest?.state === 'available' ? 'Visit the contract board to earn your company’s first bounty.' : quest ? (quest.progress >= quest.required ? 'Your contract is complete. Collect the crowns and experience.' : 'Track down a bandit patrol east of Stonebridge.') : 'Explore a tomb, build your camp, or trade between settlements.';
  const resource = (symbol: string, value: string | number, label: string, cls = '') => `<span class="resource-chip ${cls}" title="${label}">${icon(symbol)}<span><em data-resource="${label}">${value}</em><small>${label}</small></span></span>`;
  hud.innerHTML = `
    <div class="topbar world-topbar" data-testid="world-hud">
      <div class="hud-brand"><div class="company-mark">${icon('sword')}</div><div class="hud-title"><strong>${escapeHtml(s.companyName)}</strong><span>DAY ${s.day} <i>·</i> <b class="live-region">${s.currentRegion}</b></span></div></div>
      <div class="resource-strip">
        ${resource('coin', s.crowns, 'Crowns')}${resource('food', s.food, 'Provisions')}${resource('bolt', `${Math.round(s.fatigue)}%`, 'Fatigue')}
        ${resource('heart', s.morale, 'Morale', 'desktop-resource')}${resource('star', s.influence, 'Influence', 'desktop-resource')}
      </div>
      <button class="help-btn" data-action="help" aria-label="How to play">${icon('help')}</button>
    </div>
    <aside class="world-objective"><span class="eyebrow">COMPANY JOURNAL</span><h3>${objective}</h3><p>${objectiveText}</p>
      <button class="text-btn" data-action="${quest ? 'quests' : 'knowledge'}">${quest ? 'View contracts' : 'View knowledge'} ${icon('arrow')}</button>
      <div class="supply-note ${s.food < foodCost ? 'low' : ''}">${icon('camp')} ${Math.floor(s.food / foodCost)} rests of provisions · ${foodCost} food / rest</div>
    </aside>
    <div class="world-map" aria-label="Map of the frontier"><span class="eyebrow">${s.currentRegion}</span>
      <svg viewBox="0 0 160 110" role="img" aria-label="Your company and known settlements">
        <path d="M18 48 34 41 52 38 73 45 105 59 135 85" fill="none" stroke="#7f7855" stroke-width="2"/>
        <path d="M55 0 49 25 59 45 52 75 61 110" fill="none" stroke="#45666b" stroke-width="3"/>
        ${LOCATIONS.filter(l=>l.type==='town').map(l=>`<rect x="${l.x/WORLD_WIDTH*160-2}" y="${l.y/WORLD_HEIGHT*110-2}" width="4" height="4" fill="#cbb985"/>`).join('')}
        ${s.enemies.filter(e=>e.alive && Math.hypot(s.worldX-e.x,s.worldY-e.y)<550).map(e=>`<circle cx="${e.x/WORLD_WIDTH*160}" cy="${e.y/WORLD_HEIGHT*110}" r="2" fill="#da806a"/>`).join('')}
        <circle class="map-company" cx="${s.worldX/WORLD_WIDTH*160}" cy="${s.worldY/WORLD_HEIGHT*110}" r="4" fill="#f4d18b" stroke="#fff6dc"/>
      </svg><small>● Company <span>■ Settlement</span></small>
    </div>
    <div class="quickbar mobile-nav" data-testid="mobile-nav">
      ${[['shield','Company','inventory'],['scroll','Contracts','quests'],['star','Knowledge','knowledge'],['camp','Camp','camp'],['save','Save','save']].map(([symbol,label,action])=>button(`${icon(symbol)}<span class="nav-label">${label}</span>`, action, 'nav-btn')).join('')}
    </div>`;
}

function renderBattleHud(detail: BattleHudDetail): void {
  lastBattleHud = detail;
  const selected = detail.selected;
  const ready = !!selected && !selected.acted && detail.phase === 'player';
  const disabled = ready ? '' : 'disabled';
  const phase = detail.phase === 'enemy' ? 'ENEMY TURN' : detail.phase === 'resolving' ? 'ACTION IN PROGRESS' : detail.phase === 'finished' ? 'BATTLE COMPLETE' : 'YOUR TURN';
  const activeSkill = detail.skills.find(s => s.id === detail.selectedSkillId);
  hud.innerHTML = `
    <div class="topbar battlebar" data-testid="battle-hud" data-phase="${detail.phase}">
      <div class="hud-brand"><div class="company-mark battle-mark">${icon('sword')}</div><div class="hud-title"><strong>Round ${String(detail.round).padStart(2,'0')}</strong><span class="phase-label ${detail.phase}">${phase} · ${detail.enemies} enemies</span></div></div>
      <div class="valor-meter" title="Temporary Valor is spent first. Generate it through Engagement, Victory or Support."><span class="eyebrow">COMPANY VALOR</span><strong><i class="valor-permanent">${detail.valor}</i> <small>+ ${detail.tempValor} temporary</small></strong></div>
      <button class="help-btn" data-action="help" aria-label="How to play">${icon('help')}</button>
    </div>
    <div class="battle-roster" aria-label="Company turn order">${detail.roster.map(u=>`<button class="roster-unit ${u.id===selected?.id?'is-selected':''} ${u.acted?'is-spent':''}" data-action="select-unit" data-unit="${u.id}" ${u.health<=0 || u.acted || detail.phase!=='player'?'disabled':''} aria-label="Select ${escapeHtml(u.name)}" aria-pressed="${u.id===selected?.id}">
      ${portrait(u.className)}<span><strong>${escapeHtml(u.name)}</strong><small>${u.health<=0?'Fallen':u.acted?'Turn complete':`${u.health} HP · ${u.moved?'Moved':'Ready'}`}</small><i class="health-track"><i style="width:${Math.max(0,u.health/u.maxHealth)*100}%"></i></i></span>
    </button>`).join('')}</div>
    <div class="battle-command">
      <div class="command-summary"><div>${selected ? `<strong>${escapeHtml(selected.name)}</strong> <span>${selected.className ?? 'Wolf'} · ${selected.moved?'Movement used':`${selected.steps} move`} · Range ${selected.range}${selected.engaged?' · Engaged: moving provokes a hit':''}</span>` : `<strong>${phase}</strong>`}</div><span class="grid-legend"><i></i> Move <i></i> Target</span></div>
      <p class="battle-hint" role="status" data-testid="battle-hint">${escapeHtml(detail.hint || 'Select a mercenary to begin.')}</p>
      <div class="command-controls">
        <div class="battle-actions expanded-actions">
          ${button(`${icon('sword')}<span>Basic attack</span><small>No Valor cost</small>`, 'basic-attack', `action-btn ${!activeSkill?'selected-skill':''}`, disabled)}
          ${button(`${icon('star')}<span>Rally</span><small>1 Valor · buff</small>`, 'valor-skill', 'action-btn', !ready || detail.totalValor<1?'disabled':'')}
          ${detail.skills.map(skill=>button(`${icon(skill.target==='enemy'?'target':'shield')}<span>${skill.name}</span><small>${skill.cost?skill.cost+' Valor':'Free'} · ${skill.target==='self'?'Self':'Target'}</small>`, 'battle-skill', `action-btn ${activeSkill?.id===skill.id?'selected-skill':''}`, `data-skill="${skill.id}" title="${skill.description}" ${!ready||detail.totalValor<skill.cost?'disabled':''}`)).join('')}
        </div>
        <div class="turn-actions">
          ${button(`${icon('shield')}<span>Guard</span>`, 'guard', 'action-btn', disabled)}
          ${button(`${icon('check')}<span>End Unit</span>`, 'end-unit', 'action-btn primary', disabled)}
        </div>
      </div>
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
    <div class="fullscreen-menu title-menu" data-testid="main-menu">
      <div class="menu-art" aria-hidden="true"><div class="moon"></div><div class="mountains distant"></div><div class="mountains near"></div><div class="menu-party">${portrait('Ranger')}${portrait('Swordsman')}${portrait('Warrior')}</div><span>THE GREENMARCH FRONTIER</span></div>
      <div class="menu-copy"><span class="eyebrow">A COMPANY. A CONTRACT. A LEGEND.</span><h1>Ironbound<br/><em>Chronicles</em></h1><p class="subtitle">Fortune favours the prepared.</p>
      <p class="menu-description">Lead your company across an untamed frontier. Take contracts, build your camp, and make every turn count.</p>
      ${button('New Company '+icon('arrow'), 'new-game', 'primary')}
      <button class="btn continue-btn" data-action="continue" data-testid="continue-button" ${hasSave() ? '' : 'disabled'}>Continue your journey</button>
      <div class="menu-foot"><span>TACTICAL RPG</span><span>DESKTOP & MOBILE</span></div></div>
    </div>`;
}

function showHelp(): void {
  modal.innerHTML = `<div class="panel help-panel"><header><div><span class="eyebrow">FIELD MANUAL</span><h2>Make every turn count</h2></div><button class="x" data-action="close" aria-label="Close help">×</button></header>
    <div class="help-step"><b>01</b><div><h3>Explore the frontier</h3><p>Tap the ground or use WASD to travel. Tap a nearby settlement to enter. Menus pause world travel and hostile patrols.</p></div></div>
    <div class="help-step"><b>02</b><div><h3>Move, then act</h3><p>Select a mercenary from the field or roster. Blue cells are reachable; red cells contain enemies in range. Each unit gets one move and one action per round. Allies, enemies and obstacles block movement.</p></div></div>
    <div class="help-step"><b>03</b><div><h3>Spend and earn Valor</h3><p>Skills use shared Valor. Temporary points are spent first. Engagement earns a point when engaging an enemy; Victory on a kill; Support when ending beside an ally while unengaged. Each mercenary can trigger their chosen style once per round.</p></div></div>
    <div class="help-step"><b>04</b><div><h3>Keep the company ready</h3><p>Guard grants armor and ends a turn. Leaving an engagement provokes a hit. Camp restores health and Valor; it consumes food and wages every third rest. Convert food in your pack into provisions before resting.</p></div></div>
    <div class="shortcut-row"><span><kbd>I</kbd> Company</span><span><kbd>Q</kbd> Contracts</span><span><kbd>R</kbd> Camp</span><span><kbd>N</kbd> Next unit</span><span><kbd>Space</kbd> End unit</span><span><kbd>Esc</kbd> Close / cancel skill</span></div>
  </div>`;
}

function showNewGame(): void {
  modal.innerHTML = `
    <div class="fullscreen-menu parchment creation-menu" data-testid="new-game-form"><span class="eyebrow">WRITE YOUR COMPANY’S STORY</span>
      <h2>Found a Mercenary Company</h2>
      <label>Company name<input id="company-name" value="Iron Wolves" maxlength="28" /></label>
      <label>Starting leader<select id="leader-class"><option>Swordsman</option><option>Warrior</option><option>Ranger</option><option>Spearman</option><option>Rogue</option></select></label>
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
      <div class="merc-heading">${portrait(m.class)}<div><strong>${escapeHtml(m.name)}</strong><span>${m.class} <b>LV ${m.level}</b></span></div></div>
      <div class="merc-stats"><span>${icon('heart')} ${m.health}/${m.maxHealth}</span><span>${icon('shield')} ${m.armor}/${m.maxArmor}</span><span>${icon('sword')} ${totalAttack(m)}</span></div>
      <div class="xp-track"><i style="width:${Math.min(100,m.xp/(100+(m.level-1)*80)*100)}%"></i></div><span>${m.xp} / ${100+(m.level-1)*80} XP to next level</span>
      <span>Weapon: ${m.equipment.weapon?.name ?? 'None'} · Armor: ${m.equipment.armor?.name ?? 'None'}</span>
      <details class="merc-details"><summary>Training, profession & equipment care</summary>
      <span>Profession: ${m.profession ? `${m.profession.name} Lv ${m.profession.level} (${m.profession.xp} XP)` : 'Unassigned'}</span>
      <div>
        ${professions.map(p=>`<button class="mini" data-action="assign-profession" data-merc="${m.id}" data-profession="${p}">${p}</button>`).join('')}
        ${m.profession ? `<button class="mini" data-action="work-profession" data-merc="${m.id}" ${m.lastWorkedDay===s.day?'disabled':''}>${m.lastWorkedDay===s.day?'Rest to work again':'Work · once per day'}</button>` : ''}
      </div>
      <span>Specialization: ${m.specialization ?? (m.level >= 3 ? 'Choose one' : 'Unlocks at Lv 3')}</span>
      <div>${!m.specialization && m.level>=3 ? availableSpecializations(m.class).map(sp=>`<button class="mini" data-action="specialize" data-merc="${m.id}" data-specialization="${sp}">${sp}</button>`).join('') : ''}</div>
      <span>Skills: ${m.learnedSkills.join(', ') || 'None'} · Skill Points: ${m.skillPoints}</span>
      <div>${m.skillPoints>0 ? availableSkills(m.class).filter(sk=>!m.learnedSkills.includes(sk)).map(sk=>`<button class="mini" data-action="learn-skill" data-merc="${m.id}" data-skill="${sk}">${sk}</button>`).join('') : ''}</div>
      <span>Traits: ${m.traits.join(', ') || 'None'} ${m.injury ? `· Injury: ${m.injury}` : ''}</span>
      <span>Appearance Variant: ${m.appearanceVariant ?? 0} · Weapon Oil: ${m.weaponOil ?? 'None'}</span>
      <span>Combat Valor: ${m.valorStyle} — generates 1 temporary VP when the condition is met.</span>
      <div>
        ${(['Engagement','Victory','Support'] as ValorStyle[]).map(v=>`<button class="mini ${m.valorStyle===v?'selected-skill':''}" data-action="valor-style" data-merc="${m.id}" data-valor-style="${v}">${v}</button>`).join('')}
      </div>
      <div><button class="mini" data-action="cycle-appearance" data-merc="${m.id}">Change Look</button>
      ${s.inventory.some(i=>i.name==='Poison Oil') && m.equipment.weapon ? `<button class="mini" data-action="apply-oil" data-merc="${m.id}">Apply Poison Oil</button>` : ''}</div>
      ${m.injury ? `<button class="mini" data-action="heal-injury" data-merc="${m.id}">Use Medicine</button>` : ''}
      <span>Relations: ${relation || 'No bonds yet'}</span></details>
    </div>`;
  }).join('');
  const items = s.inventory.map(i => {
    const compatible = i.slot ? s.mercenaries.filter(m => canEquipItem(m, i)) : [];
    const equipButtons = i.slot
      ? (compatible.length
          ? compatible.map(m => `<button class="mini equip-person" data-action="equip" data-item-id="${i.id}" data-merc="${m.id}">Equip → ${m.name}</button>`).join('')
          : '<span class="muted">No compatible mercenary</span>')
      : '';
    return `<div class="item-row rarity-${i.rarity.toLowerCase()}">
      <div><strong>${i.name}</strong><span>${i.rarity}${i.power ? ` · +${i.power} power` : ''}${i.armor ? ` · +${i.armor} armor` : ''} · ${i.weight ?? 1} wt</span></div>
      <div class="item-actions"><div class="equip-targets">${equipButtons}${i.food?`<button class="mini" data-action="use-item" data-item-id="${i.id}">Add ${i.food} provisions</button>`:''}${['Repair Kit','Armor Reinforcement'].includes(i.name)?s.mercenaries.map(m=>`<button class="mini" data-action="use-item" data-item-id="${i.id}" data-merc="${m.id}">Use → ${escapeHtml(m.name)}</button>`).join(''):''}</div><button class="mini" data-action="sell" data-item-id="${i.id}">Sell ${Math.floor(i.value * .55)}</button></div>
    </div>`;
  }).join('') || '<p>Inventory empty.</p>';
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
  const wages = wageTotal(s);
  const build = facilities.filter(f=>!s.campFacilities.includes(f)).map(f => button(`Build ${f}`, 'build-facility', '', `data-facility="${f}"`)).join('');
  modal.innerHTML = `<div class="panel camp-panel wide" data-testid="camp-panel"><header><h2>Company Camp</h2><button class="x" data-action="close">×</button></header>
    <div class="camp-art"><div class="fire">🔥</div>${s.mercenaries.slice(0,6).map((m,i)=>`<div class="camper c${i}">◆<span>${m.name}</span></div>`).join('')}</div>
    <p>Fatigue <strong>${Math.round(s.fatigue)}/${s.maxFatigue}</strong> · Valor <strong>${s.valor}/${s.maxValor}</strong>. Rest costs <strong>${personalityFoodCost(s)} food</strong>; wages <strong>${wages}</strong> every third rest.</p>
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
  const trade = ['wool','salt','spice'].map(g=>`<div class="item-row"><div><strong>${g}</strong><span>Buy ${tradePrice(s.currentRegion,g)} · Sell ${tradeSellPrice(s.currentRegion,g,s.unlockedKnowledge.includes('merchant-instinct'))} · Held ${s.tradeGoods[g] ?? 0}</span></div><div><button class="mini" data-action="buy-trade" data-good="${g}">Buy</button><button class="mini" data-action="sell-trade" data-good="${g}">Sell</button></div></div>`).join('');
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
  modal.innerHTML = `<div class="panel victory"><h2>Defeat</h2><p>${getState().mercenaries.length ? 'Your surviving company escapes, losing up to 30 crowns.' : 'Your company has fallen. Their story ends here.'}</p>${getState().mercenaries.length ? button('Return to world', 'continue-battle', 'primary') : button('Found a new company', 'new-game', 'primary')}</div>`;
}

function exposeTestApi(): void {
  (window as any).__GAME_TEST_API__ = {
    getGameState: () => scene?.getSnapshot(),
    movePartyTo: (x: number, y: number) => scene?.testMovePartyTo(x,y),
    triggerEncounter: (id = 'bandit-1') => scene?.testTriggerEncounter(id),
    battleSnapshot: () => scene?.testBattleSnapshot(),
    selectFirstPlayer: () => scene?.testSelectFirstPlayer(),
    moveSelectedTo: (col:number,row:number) => scene?.testMoveSelectedTo(col,row),
    killFirstEnemy: () => scene?.testKillFirstEnemy(),
    grantTempValor: (amount=1) => scene?.testGrantTempValor(amount),
    isCellBlocked: (col:number,row:number) => scene?.testIsCellBlocked(col,row),
    save: () => saveGame(),
    resetSave: () => { resetSave(); location.reload(); }
  };
}

window.addEventListener('ironbound:ui', (ev: Event) => {
  const d = (ev as CustomEvent).detail;
  if (d.type === 'world') { lastBattleHud = null; closeModal(); renderWorldHud(); }
  if (d.type === 'worldHud' && !lastBattleHud) {
    const state = getState();
    const fatigue = hud.querySelector('[data-resource="Fatigue"]');
    if (fatigue) fatigue.textContent = `${Math.round(state.fatigue)}%`;
    const morale = hud.querySelector('[data-resource="Morale"]');
    if (morale) morale.textContent = String(Math.floor(state.morale));
    hud.querySelectorAll('.live-region, .world-map>.eyebrow').forEach(el => el.textContent = state.currentRegion);
    const marker = hud.querySelector('.map-company');
    marker?.setAttribute('cx', String(state.worldX/WORLD_WIDTH*160));
    marker?.setAttribute('cy', String(state.worldY/WORLD_HEIGHT*110));
  }
  if (d.type === 'battleHint') { const hint = hud.querySelector('.battle-hint'); if (hint) hint.textContent = d.message; }
  if (d.type === 'toast') showToast(d.message);
  if (d.type === 'inventory') showInventory();
  if (d.type === 'quests') showQuests();
  if (d.type === 'camp') showCamp();
  if (d.type === 'town') showTown(d.townName);
  if (d.type === 'tomb') showTomb(d.tombId,d.tombName);
  if (d.type === 'encounter') showEncounter(d.enemy);
  if (d.type === 'battle') closeModal();
  if (d.type === 'battleHud') renderBattleHud(d);
  if (d.type === 'victory') showVictory(d);
  if (d.type === 'defeat') showDefeat();
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [contenteditable]')) return;
  if (e.key === 'Escape') {
    if (modal.querySelector('.panel:not(.encounter):not(.victory)')) closeModal();
    else if (!modal.childElementCount) scene?.cancelBattleSkill();
  }
  if (e.key === 'Tab' && modal.childElementCount) {
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex="0"]')).filter(el => el.getClientRects().length);
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (index < 0 || (!e.shiftKey && index === focusable.length-1) || (e.shiftKey && index === 0)) {
      e.preventDefault(); (e.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
    }
  }
  if (modal.childElementCount || !lastBattleHud || e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); scene?.endSelectedUnit(); }
  if (e.key.toLowerCase() === 'n') scene?.selectNextUnit();
});

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
  const action = target.dataset.action!;
  const s = ensureCoreSystems(getState());

  if (action === 'new-game') showNewGame();
  else if (action === 'main-menu') showMainMenu();
  else if (action === 'continue') {
    const loaded = loadGame();
    if (!loaded) showToast('This save could not be loaded. Start a new company to play.');
    else if (!loaded.mercenaries.length) showDefeat();
    else { closeModal(); bootGame(); }
  }
  else if (action === 'start-game') {
    const company = (document.querySelector<HTMLInputElement>('#company-name')?.value || 'Iron Wolves').trim() || 'Iron Wolves';
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
  else if (action === 'help') showHelp();
  else if (action === 'save') showToast(saveGame() ? 'Journey saved.' : 'Unable to save. Browser storage may be full or disabled.');
  else if (action === 'select-unit') scene?.selectUnit(target.dataset.unit!);
  else if (action === 'basic-attack') scene?.cancelBattleSkill();
  else if (action === 'valor-skill') scene?.valorSkillSelected();
  else if (action === 'battle-skill') scene?.selectBattleSkill(target.dataset.skill!);
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
  else if (action === 'valor-style') { setValorStyle(s,target.dataset.merc!,target.dataset.valorStyle as ValorStyle); saveGame(); showInventory(); showToast('Combat Valor generation updated.'); }
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
    const item = s.inventory.find(i => i.id === target.dataset.itemId);
    const merc = s.mercenaries.find(m => m.id === target.dataset.merc);
    if (item && merc && equipItem(s, merc.id, item.id)) {
      saveGame();
      showToast(`${item.name} equipped on ${merc.name}.`);
    } else {
      showToast('That mercenary cannot equip this item.');
    }
    showInventory(); renderWorldHud();
  }
  else if (action === 'use-item') {
    showToast(useItem(s, target.dataset.itemId!, target.dataset.merc) ? 'Supplies used.' : 'This mercenary does not need repairs.');
    saveGame(); showInventory(); renderWorldHud();
  }
  else if (action === 'sell') {
    const item=s.inventory.find(i => i.id === target.dataset.itemId);
    if(item){const earned=sellItem(s,item.id);saveGame();showToast(`Sold ${item.name} for ${earned} crowns.`);}
    showInventory(); renderWorldHud();
  }
  if (game && !lastBattleHud) renderWorldHud();
});

const modalObserver = new MutationObserver(() => {
  const panel = modal.firstElementChild;
  hud.inert = !!panel;
  gameRoot.inert = !!panel;
  if (!panel) return;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const heading = panel.querySelector('h1, h2');
  if (heading) { heading.id = 'dialog-title'; panel.setAttribute('aria-labelledby', 'dialog-title'); }
});
modalObserver.observe(modal, { childList: true });

showMainMenu();
