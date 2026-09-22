import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game';
import { acceptQuest, buyFood, equipItem, recruit, repairAll, rest, sellItem, totalAttack, turnInQuest } from './domain';
import { getState, hasSave, loadGame, resetSave, saveGame, startNewGame } from './store';
import type { GameState, MercClass } from './types';

const hud = document.querySelector<HTMLDivElement>('#hud')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLDivElement>('#toast-root')!;
const gameRoot = document.querySelector<HTMLDivElement>('#game-root')!;
let game: Phaser.Game | null = null;
let scene: GameScene | null = null;

function bootGame(): void {
  if (game) game.destroy(true);
  gameRoot.innerHTML = '';
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: Math.max(960, window.innerWidth),
    height: Math.max(640, window.innerHeight),
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

function button(label: string, action: string, cls = ''): string {
  return `<button class="btn ${cls}" data-action="${action}">${label}</button>`;
}

function renderWorldHud(): void {
  const s = getState();
  hud.innerHTML = `
    <div class="topbar" data-testid="world-hud">
      <div><strong>${s.companyName}</strong><span>Day ${s.day}</span><span>Region: ${s.currentRegion}</span></div>
      <div><span>👑 ${s.crowns}</span><span>🍞 ${s.food}</span><span>Morale ${s.morale}</span></div>
    </div>
    <div class="quickbar">
      ${button('Inventory [I]', 'inventory')}
      ${button('Contracts [Q]', 'quests')}
      ${button('Camp [R]', 'camp')}
      ${button('Save', 'save')}
    </div>
  `;
}

function renderBattleHud(detail: any): void {
  const selected = detail.selected;
  hud.innerHTML = `
    <div class="topbar battlebar" data-testid="battle-hud">
      <div><strong>Round ${detail.round}</strong><span>Enemies: ${detail.enemies}</span></div>
      <div>${selected ? `<strong>${selected.name}</strong><span>HP ${selected.health}</span><span>Armor ${selected.armor}</span>` : '<span>Select a mercenary</span>'}</div>
    </div>
    <div class="battle-actions">
      ${button('Guard', 'guard', !selected ? 'disabled-look' : '')}
      ${button('End Unit [Space]', 'end-unit', !selected ? 'disabled-look' : '')}
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
      <div class="small-note">Explore a living world, take contracts, fight tactical battles, loot gear and keep your company fed and paid.</div>
    </div>`;
}

function showNewGame(): void {
  modal.innerHTML = `
    <div class="fullscreen-menu parchment" data-testid="new-game-form">
      <h2>Found a Mercenary Company</h2>
      <label>Company name<input id="company-name" value="Iron Wolves" maxlength="28" /></label>
      <label>Starting leader<select id="leader-class">
        <option>Swordsman</option><option>Warrior</option><option>Ranger</option>
      </select></label>
      <label>Difficulty<select id="difficulty"><option>Easy</option><option selected>Normal</option><option>Hard</option></select></label>
      ${button('Begin Journey', 'start-game', 'primary')}
      ${button('Back', 'main-menu')}
    </div>`;
}

function showInventory(): void {
  const s = getState();
  const mercs = s.mercenaries.map(m => `<div class="merc-card"><strong>${m.name}</strong><span>${m.class} · Lv ${m.level}</span><span>HP ${m.health}/${m.maxHealth} · Armor ${m.armor}/${m.maxArmor}</span><span>Attack ${totalAttack(m)}</span><span>Weapon: ${m.equipment.weapon?.name ?? 'None'}</span><span>Armor: ${m.equipment.armor?.name ?? 'None'}</span></div>`).join('');
  const items = s.inventory.map((i, idx) => `<div class="item-row rarity-${i.rarity.toLowerCase()}"><div><strong>${i.name}</strong><span>${i.rarity}${i.power ? ` · +${i.power} power` : ''}${i.armor ? ` · +${i.armor} armor` : ''}</span></div><div>${i.slot ? `<button class="mini" data-action="equip" data-item-index="${idx}">Equip on ${s.mercenaries[0].name}</button>` : ''}<button class="mini" data-action="sell" data-item-index="${idx}">Sell ${Math.floor(i.value * .55)}</button></div></div>`).join('') || '<p>Inventory empty.</p>';
  modal.innerHTML = `<div class="panel wide" data-testid="inventory-panel"><header><h2>Company & Inventory</h2><button class="x" data-action="close">×</button></header><div class="two-col"><section><h3>Mercenaries</h3>${mercs}</section><section><h3>Pack</h3>${items}</section></div></div>`;
}

function showQuests(): void {
  const s = getState();
  const list = s.quests.map(q => `<div class="quest-card"><strong>${q.name}</strong><p>${q.description}</p><div>${q.state.toUpperCase()} · ${q.progress}/${q.required}</div>${q.state === 'available' ? `<button class="mini" data-action="accept-quest" data-quest="${q.id}">Accept</button>` : ''}${q.state === 'active' && q.progress >= q.required ? `<button class="mini" data-action="turn-in" data-quest="${q.id}">Turn in</button>` : ''}<div class="reward">Reward: ${q.rewardCrowns} crowns · ${q.rewardXp} XP</div></div>`).join('');
  modal.innerHTML = `<div class="panel" data-testid="quest-panel"><header><h2>Contracts</h2><button class="x" data-action="close">×</button></header>${list}</div>`;
}

function showCamp(): void {
  const s = getState();
  const wages = s.mercenaries.reduce((n,m)=>n+m.wage,0);
  modal.innerHTML = `<div class="panel camp-panel" data-testid="camp-panel"><header><h2>Company Camp</h2><button class="x" data-action="close">×</button></header><div class="camp-art"><div class="fire">🔥</div>${s.mercenaries.slice(0,6).map((m,i)=>`<div class="camper c${i}">●<span>${m.name}</span></div>`).join('')}</div><p>Rest costs <strong>${s.mercenaries.length * 2} food</strong>. Wages of <strong>${wages} crowns</strong> are due every third rest.</p>${button('Rest until morning', 'rest', 'primary')}</div>`;
}

function showTown(name: string): void {
  const s = getState();
  const q = s.quests[0];
  modal.innerHTML = `<div class="panel wide town-panel" data-testid="town-panel"><header><div><small>Settlement</small><h2>${name}</h2></div><button class="x" data-action="close">×</button></header><div class="town-grid"><div class="service"><h3>🍺 Tavern</h3><p>Hire a spear fighter for 85 crowns.</p>${button('Recruit Kestrel', 'recruit')}</div><div class="service"><h3>⚒ Blacksmith</h3><p>Repair worn company equipment.</p>${button('Repair all', 'repair')}</div><div class="service"><h3>🧺 Market</h3><p>6 food for 12 crowns.</p>${button('Buy provisions', 'buy-food')}</div><div class="service"><h3>📜 Contract Board</h3><p>${q.name} — ${q.state}</p>${q.state==='available' ? button('Accept contract','accept-town-quest') : q.state==='active'&&q.progress>=q.required ? button('Claim reward','turn-in-town-quest','primary') : '<span class="muted">Return after defeating the target.</span>'}</div></div><footer>👑 ${s.crowns} · 🍞 ${s.food}</footer></div>`;
}

function showEncounter(enemy: { id: string; kind: string; strength: number }): void {
  modal.innerHTML = `<div class="encounter panel" data-testid="encounter-panel"><div class="crest small">⚔</div><h2>${enemy.kind === 'wolf' ? 'Wolf Pack' : enemy.kind === 'raider' ? 'Raider Warband' : 'Bandit Patrol'}</h2><p>Threat level ${enemy.strength}. The hostile group blocks your path.</p><div class="row">${button('Fight', `fight:${enemy.id}`, 'danger')}${button('Flee', 'flee')}</div></div>`;
}

function showVictory(detail: any): void {
  modal.innerHTML = `<div class="panel victory" data-testid="victory-panel"><div class="crest">✦</div><h2>Victory</h2><p>Your company controls the field.</p><p><strong>Loot:</strong> ${detail.crowns} crowns · ${detail.items.join(', ') || 'supplies'}</p>${button('Take all and continue', 'continue-battle', 'primary')}</div>`;
}

function showDefeat(): void {
  modal.innerHTML = `<div class="panel victory"><h2>Defeat</h2><p>Your wounded company escapes, losing 30 crowns. Nobody dies in this prototype.</p>${button('Return to world', 'continue-battle', 'primary')}</div>`;
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
  if (d.type === 'encounter') showEncounter(d.enemy);
  if (d.type === 'battle') { closeModal(); renderBattleHud({round:d.round,enemies:0,selected:null}); }
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
  if (action === 'new-game') showNewGame();
  else if (action === 'main-menu') showMainMenu();
  else if (action === 'continue') { if (loadGame()) { closeModal(); bootGame(); } }
  else if (action === 'start-game') {
    const company = (document.querySelector<HTMLInputElement>('#company-name')?.value || 'Iron Wolves').trim();
    const cls = document.querySelector<HTMLSelectElement>('#leader-class')!.value as MercClass;
    const difficulty = document.querySelector<HTMLSelectElement>('#difficulty')!.value as GameState['difficulty'];
    startNewGame(company, cls, difficulty); closeModal(); bootGame();
  }
  else if (action === 'inventory') showInventory();
  else if (action === 'quests') showQuests();
  else if (action === 'camp') showCamp();
  else if (action === 'close') closeModal();
  else if (action === 'save') { saveGame(); showToast('Game saved.'); }
  else if (action === 'guard') scene?.guardSelectedUnit();
  else if (action === 'end-unit') scene?.endSelectedUnit();
  else if (action === 'flee') { closeModal(); scene?.fleeEncounter(); }
  else if (action.startsWith('fight:')) { closeModal(); scene?.startEncounterBattle(action.split(':')[1]); }
  else if (action === 'continue-battle') { closeModal(); scene?.continueFromBattle(); renderWorldHud(); }
  else if (action === 'rest') {
    const result = rest(getState());
    if (!result.ok) showToast('Not enough food to rest.');
    else { saveGame(); showCamp(); showToast(result.wagesPaid ? `Rested. Paid ${result.wagesPaid} crowns in wages.` : 'Rested until morning.'); renderWorldHud(); }
  }
  else if (action === 'accept-quest' || action === 'accept-town-quest') {
    if (acceptQuest(getState(), action === 'accept-town-quest' ? 'east-road' : target.dataset.quest!)) { saveGame(); showToast('Contract accepted.'); }
    action === 'accept-town-quest' ? showTown('Stonebridge') : showQuests();
  }
  else if (action === 'turn-in' || action === 'turn-in-town-quest') {
    if (turnInQuest(getState(), action === 'turn-in-town-quest' ? 'east-road' : target.dataset.quest!)) { saveGame(); showToast('Contract completed. Reward received.'); }
    action === 'turn-in-town-quest' ? showTown('Stonebridge') : showQuests();
  }
  else if (action === 'buy-food') { showToast(buyFood(getState()) ? 'Bought provisions.' : 'Not enough crowns.'); saveGame(); showTown('Stonebridge'); }
  else if (action === 'recruit') { showToast(recruit(getState()) ? 'Kestrel joined the company.' : 'Cannot recruit right now.'); saveGame(); showTown('Stonebridge'); }
  else if (action === 'repair') { const cost=repairAll(getState()); showToast(cost<0?'Not enough crowns.':`Equipment repaired for ${cost} crowns.`); saveGame(); showTown('Stonebridge'); }
  else if (action === 'equip') {
    const idx = Number(target.dataset.itemIndex); const item = getState().inventory[idx];
    if (item && equipItem(getState(), getState().mercenaries[0].id, item.id)) { saveGame(); showToast(`${item.name} equipped.`); }
    showInventory(); renderWorldHud();
  }
  else if (action === 'sell') {
    const idx=Number(target.dataset.itemIndex); const item=getState().inventory[idx];
    if(item){const earned=sellItem(getState(),item.id);saveGame();showToast(`Sold ${item.name} for ${earned} crowns.`);}
    showInventory(); renderWorldHud();
  }
});

showMainMenu();
