import Phaser from 'phaser';
import { LOCATIONS, WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { animalToBattleUnit, applyDamage, enemyBattleUnits, gainXp, generateLoot, mercToBattleUnit, recordKill } from './domain';
import { getState, saveGame } from './store';
import { awardPathXp, inflictInjury, travelStep } from './systems';
import { clearLocationGarrison, enterLocation, isNearLocation, locationDefender, nearestLocation } from './locations';
import type { BattleUnit, MercClass, WorldEnemy } from './types';
import {
  createPixelLocation,
  drawPixelRock,
  drawPixelTerrain,
  drawPixelTree
} from './pixelArt';
import { classToKind, createActor, playActor, setWalk, type ActorKind } from './animatedSprites';
import { battleSkillsFor, type BattleSkill } from './battleSkills';
import {
  cellKey, cellToWorld, createGridLayout, defaultObstacleCells, manhattan,
  neighbours, reachableCells, shortestPath, worldToCell, type GridCell, type GridLayout
} from './battleGrid';

const WORLD_EVENT = 'ironbound:ui';
type Mode = 'world' | 'battle';

export class GameScene extends Phaser.Scene {
  private mode: Mode = 'world';
  private party?: Phaser.GameObjects.Container;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private moveTarget?: Phaser.Math.Vector2;
  private destinationLocation?: string;
  private enemySprites = new Map<string, Phaser.GameObjects.Container>();
  private battleUnits: BattleUnit[] = [];
  private battleSprites = new Map<string, Phaser.GameObjects.Container>();
  private selectedUnitId?: string;
  private encounterEnemy?: WorldEnemy;
  private round = 1;
  private movementRange?: Phaser.GameObjects.Arc;
  private battleGrid?: GridLayout;
  private gridHighlights: Phaser.GameObjects.Rectangle[] = [];
  private battleObstacles = new Set<string>();
  private selectedSkillId?: string;
  private temporaryValor = 0;
  private discoveryCooldown = new Set<string>();
  private battlePhase: 'player' | 'resolving' | 'enemy' | 'finished' = 'player';
  private battleLog: string[] = [];
  private battleHint = '';
  private pendingResize = false;
  private hudElapsed = 0;
  private encounterGraceUntil = 0;

  private uiOpen(): boolean { return !!document.querySelector('#modal-root')?.childElementCount; }
  private canAct(): boolean { return this.mode === 'battle' && this.battlePhase === 'player' && !this.uiOpen(); }

  private lockAction(): void {
    this.battlePhase = 'resolving';
    this.clearGridHighlights();
    this.refreshBattleHud();
  }


  constructor() { super('game'); }

  create(): void {
    this.input.mouse?.disableContextMenu();
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));
    this.renderWorld();
  }

  private emit(detail: Record<string, unknown>): void {
    window.dispatchEvent(new CustomEvent(WORLD_EVENT, { detail }));
  }

  renderWorld(): void {
    this.mode = 'world';
    this.selectedUnitId = undefined;
    this.selectedSkillId = undefined;
    this.moveTarget = undefined;
    this.destinationLocation = undefined;
    this.input.removeAllListeners('pointerdown');
    this.input.removeAllListeners('pointermove');
    this.input.removeAllListeners('wheel');
    this.children.removeAll(true);
    this.enemySprites.clear();
    this.battleSprites.clear();
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1);

    drawPixelTerrain(this, WORLD_WIDTH, WORLD_HEIGHT, 'world').setDepth(-20);

    // Chunky pixel-road and river overlays.
    const roads = this.add.graphics().setDepth(-10);
    roads.lineStyle(22, 0xa98757, 1);
    roads.beginPath();
    roads.moveTo(380, 950); roads.lineTo(650, 820); roads.lineTo(1050, 760); roads.lineTo(1450, 900); roads.lineTo(2100, 1180); roads.lineTo(2700, 1700); roads.strokePath();
    roads.lineStyle(10, 0xc0a36e, 1);
    roads.beginPath();
    roads.moveTo(380, 950); roads.lineTo(650, 820); roads.lineTo(1050, 760); roads.lineTo(1450, 900); roads.lineTo(2100, 1180); roads.lineTo(2700, 1700); roads.strokePath();

    const river = this.add.graphics().setDepth(-9);
    river.lineStyle(18, 0x3f6f91, 1);
    river.beginPath(); river.moveTo(1100, 0); river.lineTo(980, 500); river.lineTo(1170, 900); river.lineTo(1030, 1500); river.lineTo(1220, 2200); river.strokePath();

    for (let i = 0; i < 34; i++) {
      const x = 180 + (i * 173) % (WORLD_WIDTH - 300);
      const y = 140 + (i * 277) % (WORLD_HEIGHT - 260);
      if (i % 3 === 0) drawPixelRock(this, x, y, 3).setDepth(-5);
      else drawPixelTree(this, x, y, 3).setDepth(-5);
    }

    for (const loc of LOCATIONS) this.createLocation(loc);
    const state = getState();
    this.party = this.createParty(state.worldX, state.worldY);
    this.cameras.main.startFollow(this.party, true, 0.08, 0.08);
    this.createEnemies();

    this.keys = this.input.keyboard?.addKeys('W,A,S,D,I,C,Q,R,M,ESC,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'world' || this.uiOpen() || this.encounterEnemy) return;
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.destinationLocation = undefined;
      this.moveTarget = new Phaser.Math.Vector2(world.x, world.y);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
      if (this.mode !== 'world' || this.uiOpen() || this.encounterEnemy) return;
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.65, 1.45));
    });
    this.emit({ type: 'world' });
  }

  private createParty(x: number, y: number): Phaser.GameObjects.Container {
    const root = this.add.container(x, y).setDepth(30).setSize(92, 72);
    const sword = createActor(this, 'swordsman', -28, 8, 1.0).setName('party-swordsman');
    const ranger = createActor(this, 'ranger', 6, -8, 1.0).setName('party-ranger');
    const warrior = createActor(this, 'warrior', 30, 10, 1.0).setName('party-warrior');
    const banner = this.add.graphics();
    banner.fillStyle(0x3b2a1d).fillRect(-2,-50,4,46);
    banner.fillStyle(0xc69d46).fillRect(2,-48,22,13);
    banner.fillStyle(0x8d3030).fillRect(2,-35,15,6);
    root.add([sword,ranger,warrior,banner]);
    return root;
  }

  private createLocation(loc: typeof LOCATIONS[number]): void {
    const art = createPixelLocation(this, loc.type, loc.id, 0, 0);
    art.setPosition(-24, -28);
    const label = this.add.text(0, 32, loc.name, {
      fontFamily: 'monospace', fontSize: '15px', color: '#fff0c4',
      backgroundColor: '#1d1914dd', padding: { x: 6, y: 3 }
    }).setOrigin(0.5);
    const marker = this.add.container(loc.x, loc.y, [art, label]).setDepth(10);
    marker.setSize(150, 116).setInteractive({ useHandCursor: true }).on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (this.uiOpen() || this.encounterEnemy) return;
      this.travelToLocation(loc.id);
    });
  }

  travelToLocation(id: string): void {
    if (this.mode !== 'world' || this.encounterEnemy || this.uiOpen()) return;
    const loc = LOCATIONS.find(l => l.id === id);
    if (!loc) return;
    if (isNearLocation(getState(), id)) { this.enterNearbyLocation(id); return; }
    this.destinationLocation = id;
    this.moveTarget = new Phaser.Math.Vector2(loc.x, loc.y);
    this.emit({ type: 'toast', message: `Travelling to ${loc.name}. Your company will enter on arrival.` });
  }

  enterNearbyLocation(id?: string): void {
    if (this.mode !== 'world' || this.encounterEnemy || this.uiOpen()) return;
    const loc = id ? LOCATIONS.find(l => l.id === id) : nearestLocation(getState());
    if (!loc || !enterLocation(getState(), loc.id)) return;
    this.moveTarget = undefined;
    this.destinationLocation = undefined;
    saveGame();
    if (loc.type === 'town') this.emit({ type: 'town', townId: loc.id, townName: loc.name });
    else if (loc.id.includes('tomb')) this.emit({ type: 'tomb', tombId: loc.id, tombName: loc.name });
    else this.emit({ type: 'location', locationId: loc.id });
  }

  private createEnemies(): void {
    for (const e of getState().enemies.filter(e => e.alive)) {
      const kind: ActorKind = e.kind === 'wolf' ? 'wolf' : e.kind === 'raider' ? 'raider' : 'bandit';
      const actor = createActor(this, kind, 0, 0, 1.12).setName('actor');
      const badge = e.strength > 1
        ? this.add.text(0,-34,'★'.repeat(Math.min(3,e.strength)),{fontFamily:'monospace',fontSize:'10px',color:'#f4c65d'}).setOrigin(.5)
        : undefined;
      const parts: Phaser.GameObjects.GameObject[] = [actor];
      if (badge) parts.push(badge);
      const container = this.add.container(e.x,e.y,parts).setDepth(20).setSize(58,64);
      this.enemySprites.set(e.id, container);
    }
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'world' || !this.party || !this.keys) return;
    if (this.uiOpen() || this.encounterEnemy) {
      this.moveTarget = undefined;
      this.destinationLocation = undefined;
      for (const child of this.party.list) if (child instanceof Phaser.GameObjects.Sprite) setWalk(child, false);
      return;
    }
    delta = Math.min(delta, 80); // Returning from a background tab must not teleport the company.
    this.hudElapsed += delta;
    if (this.hudElapsed >= 500) { this.hudElapsed = 0; this.emit({ type: 'worldHud' }); }
    const state = getState();
    const speed = 180;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown) dy -= 1;
    if (this.keys.S.isDown) dy += 1;
    if (this.keys.A.isDown) dx -= 1;
    if (this.keys.D.isDown) dx += 1;
    let partyMoving = false;
    if (dx || dy) {
      this.destinationLocation = undefined;
      partyMoving = true;
      const len = Math.hypot(dx, dy);
      const step = speed * delta / 1000;
      state.worldX += dx / len * step;
      state.worldY += dy / len * step;
      travelStep(state, step, this.isNearRoad(state.worldX, state.worldY));
      this.moveTarget = undefined;
    } else if (this.moveTarget) {
      partyMoving = true;
      const vx = this.moveTarget.x - state.worldX;
      const vy = this.moveTarget.y - state.worldY;
      const d = Math.hypot(vx, vy);
      if (d < 5) this.moveTarget = undefined;
      else {
        const step = Math.min(d, speed * delta / 1000);
        state.worldX += vx / d * step;
        state.worldY += vy / d * step;
        travelStep(state, step, this.isNearRoad(state.worldX, state.worldY));
      }
    }
    state.worldX = Phaser.Math.Clamp(state.worldX, 30, WORLD_WIDTH - 30);
    state.worldY = Phaser.Math.Clamp(state.worldY, 30, WORLD_HEIGHT - 30);
    state.currentRegion = state.worldX < 1700 ? 'Greenmarch' : state.worldX < 2350 ? 'Ashen Hills' : 'Frostmere';
    this.party.setPosition(state.worldX, state.worldY);
    for (const child of this.party.list) {
      if (child instanceof Phaser.GameObjects.Sprite) setWalk(child, partyMoving);
    }
    if (this.destinationLocation && isNearLocation(state, this.destinationLocation)) {
      this.enterNearbyLocation(this.destinationLocation);
      return;
    }
    this.updateEnemies(delta);
    this.checkDiscoveries();
    this.checkEncounter();
    if (this.encounterEnemy) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.I)) this.emit({ type: 'inventory' });
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.emit({ type: 'quests' });
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.emit({ type: 'camp' });
  }

  private isNearRoad(x: number, y: number): boolean {
    const points = [
      [380,950],[650,820],[1050,760],[1450,900],[2100,1180],[2700,1700]
    ] as const;
    for (let i=0;i<points.length-1;i++) {
      const [x1,y1]=points[i], [x2,y2]=points[i+1];
      const vx=x2-x1, vy=y2-y1;
      const wx=x-x1, wy=y-y1;
      const len2=vx*vx+vy*vy;
      const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/len2));
      const px=x1+t*vx, py=y1+t*vy;
      if (Math.hypot(x-px,y-py) < 55) return true;
    }
    return false;
  }

  private updateEnemies(delta: number): void {
    const state = getState();
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const sprite = this.enemySprites.get(enemy.id);
      if (!sprite) continue;
      const dToPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, state.worldX, state.worldY);
      if (dToPlayer < 300 && enemy.kind !== 'wolf') {
        const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, state.worldX, state.worldY);
        enemy.vx = Math.cos(ang) * (26 + enemy.strength * 4);
        enemy.vy = Math.sin(ang) * (26 + enemy.strength * 4);
      }
      enemy.x += enemy.vx * delta / 1000;
      enemy.y += enemy.vy * delta / 1000;
      if (enemy.x < 300 || enemy.x > WORLD_WIDTH - 200) enemy.vx *= -1;
      if (enemy.y < 250 || enemy.y > WORLD_HEIGHT - 200) enemy.vy *= -1;
      sprite.setPosition(enemy.x, enemy.y);
      const actor = sprite.getByName('actor');
      if (actor instanceof Phaser.GameObjects.Sprite) {
        setWalk(actor, Math.abs(enemy.vx) + Math.abs(enemy.vy) > 0.5);
        actor.setFlipX(enemy.vx < 0);
      }
    }
  }

  private checkDiscoveries(): void {
    const state = getState();
    for (const loc of LOCATIONS) {
      if (state.discovered.includes(loc.id)) continue;
      if (Phaser.Math.Distance.Between(state.worldX, state.worldY, loc.x, loc.y) < 230) {
        state.discovered.push(loc.id);
        if (!this.discoveryCooldown.has(loc.id)) {
          this.discoveryCooldown.add(loc.id);
          this.emit({ type: 'toast', message: `Location discovered: ${loc.name}` });
          saveGame();
        }
      }
    }
  }

  private checkEncounter(): void {
    if (this.encounterEnemy || this.time.now < this.encounterGraceUntil) return;
    const state = getState();
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (Phaser.Math.Distance.Between(state.worldX, state.worldY, e.x, e.y) < 70) {
        this.encounterEnemy = e;
        this.moveTarget = undefined;
        this.emit({ type: 'encounter', enemy: { id: e.id, kind: e.kind, strength: e.strength } });
        break;
      }
    }
  }

  fleeEncounter(): void {
    const state = getState();
    if (!this.encounterEnemy) return;
    const e = this.encounterEnemy;
    const ang = Phaser.Math.Angle.Between(e.x, e.y, state.worldX, state.worldY);
    state.worldX = Phaser.Math.Clamp(state.worldX + Math.cos(ang) * 180, 30, WORLD_WIDTH - 30);
    state.worldY = Phaser.Math.Clamp(state.worldY + Math.sin(ang) * 180, 30, WORLD_HEIGHT - 30);
    this.encounterGraceUntil = this.time.now + 5000;
    this.encounterEnemy = undefined;
    this.renderWorld();
  }

  startEncounterBattle(enemyId?: string): void {
    const e = enemyId ? getState().enemies.find(e => e.id === enemyId) : this.encounterEnemy;
    if (!e || !e.alive || this.mode !== 'world') return;
    this.encounterEnemy = e;
    this.startBattle(e);
  }

  startLocationBattle(id: string): void {
    if (this.mode !== 'world' || this.encounterEnemy) return;
    const enemy = locationDefender(getState(), id);
    if (!enemy) return;
    this.destinationLocation = undefined;
    this.encounterEnemy = enemy;
    this.startBattle(enemy);
  }

  private startBattle(enemy: WorldEnemy): void {
    this.mode = 'battle';
    this.battlePhase = 'player';
    this.battleLog = [];
    this.pendingResize = false;
    this.children.removeAll(true);
    this.enemySprites.clear();
    this.battleSprites.clear();
    this.clearGridHighlights();
    this.selectedUnitId = undefined;
    this.selectedSkillId = undefined;
    this.temporaryValor = 0;
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBounds(0, 0, w, h);
    drawPixelTerrain(this, w, h, 'battle').setDepth(-20);

    this.battleGrid = createGridLayout(w, h);
    this.drawBattleGrid();

    const state = getState();
    const grid = this.battleGrid;
    const playerCells: GridCell[] = [];
    const enemyCells: GridCell[] = [];
    // Fill the central rows first so small companies face off in the middle.
    const rows = Array.from({ length: grid.rows }, (_, row) => row)
      .sort((a, b) => Math.abs(a - (grid.rows - 1) / 2) - Math.abs(b - (grid.rows - 1) / 2));
    for (const row of rows) {
      playerCells.push({ col: 1, row });
      enemyCells.push({ col: grid.cols - 2, row });
    }
    for (const row of rows) {
      playerCells.push({ col: grid.cols > 7 ? 2 : 0, row });
      enemyCells.push({ col: grid.cols - 1, row });
    }

    const deployedMercenaries = state.mercenaries.slice(0, Math.min(6, playerCells.length));
    this.battleUnits = deployedMercenaries.map((m, i) => {
      const p = cellToWorld(grid, playerCells[i]);
      return mercToBattleUnit(m, p.x, p.y);
    });
    this.battleUnits.push(...state.animals.slice(0, Math.min(2, playerCells.length - deployedMercenaries.length)).map((a, i) => {
      const cell = playerCells[deployedMercenaries.length + i];
      const p = cellToWorld(grid, cell);
      return animalToBattleUnit(a, p.x, p.y);
    }));

    const avgLevel = state.mercenaries.length ? state.mercenaries.reduce((n,m)=>n+m.level,0) / state.mercenaries.length : 1;
    const baseStrength = state.explorationMode === 'Adaptive'
      ? Math.max(1, Math.round(avgLevel * 0.75))
      : enemy.strength;
    const difficultyOffset = state.difficulty === 'Hard' ? 1 : state.difficulty === 'Easy' ? -1 : 0;
    const scaledStrength = Math.max(1, baseStrength + difficultyOffset);
    const enemies = enemyBattleUnits(enemy.kind, scaledStrength);
    enemies.forEach((u, i) => {
      const p = cellToWorld(grid, enemyCells[Math.min(i, enemyCells.length - 1)]);
      u.x = p.x; u.y = p.y;
    });
    this.battleUnits.push(...enemies);

    this.round = 1;
    for (const unit of this.battleUnits) this.createBattleUnitSprite(unit);
    this.input.removeAllListeners('pointerdown');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (currentlyOver.length > 0 || !this.canAct()) return;
      this.onBattlePointer(p);
    });
    this.emit({ type: 'battle', round: this.round });
    this.showBattleMessage('Your turn. Blue tiles show movement; red tiles show enemies in range.');
    this.selectNextUnit();
  }

  private handleResize(): void {
    if (this.mode !== 'battle' || !this.battleGrid) return;
    if (this.battlePhase === 'resolving' || this.battlePhase === 'enemy') { this.pendingResize = true; return; }
    const cells = this.battleUnits.map(u => this.unitCell(u));
    this.clearGridHighlights();
    this.children.removeAll(true);
    this.battleSprites.clear();
    this.battleGrid = createGridLayout(this.scale.width, this.scale.height, this.battleGrid);
    this.cameras.main.setBounds(0, 0, this.scale.width, this.scale.height);
    drawPixelTerrain(this, this.scale.width, this.scale.height, 'battle').setDepth(-20);
    this.drawBattleGrid();
    this.battleUnits.forEach((unit, index) => {
      if (cells[index]) Object.assign(unit, cellToWorld(this.battleGrid!, cells[index]!));
      if (unit.health > 0) { this.createBattleUnitSprite(unit); this.updateBattleSprite(unit); }
    });
    this.pendingResize = false;
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId);
    if (selected && this.canAct()) this.drawMovementRange(selected);
    this.refreshBattleHud();
  }

  selectUnit(id: string): void { this.onUnitClicked(id); }

  selectNextUnit(): void {
    if (!this.canAct()) return;
    const units = this.battleUnits.filter(u => u.side === 'player' && u.health > 0 && !u.acted);
    const current = units.findIndex(u => u.id === this.selectedUnitId);
    if (units.length) this.onUnitClicked(units[(current + 1) % units.length].id);
  }

  cancelBattleSkill(): void {
    if (!this.canAct()) return;
    this.selectedSkillId = undefined;
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId);
    if (selected) this.drawMovementRange(selected);
    this.showBattleMessage('Basic attack selected. Tap an enemy in range.');
    this.refreshBattleHud();
  }

  private drawBattleGrid(): void {
    const grid = this.battleGrid;
    if (!grid) return;
    const g = this.add.graphics().setDepth(-8);
    g.fillStyle(0x141817, 0.18);
    g.fillRect(grid.originX, grid.originY, grid.cols * grid.cellSize, grid.rows * grid.cellSize);
    g.lineStyle(1, 0x8e9a82, 0.22);
    for (let col = 0; col <= grid.cols; col++) {
      const x = grid.originX + col * grid.cellSize;
      g.lineBetween(x, grid.originY, x, grid.originY + grid.rows * grid.cellSize);
    }
    for (let row = 0; row <= grid.rows; row++) {
      const y = grid.originY + row * grid.cellSize;
      g.lineBetween(grid.originX, y, grid.originX + grid.cols * grid.cellSize, y);
    }

    this.battleObstacles = new Set(defaultObstacleCells(grid).map(cellKey));
    for (const key of this.battleObstacles) {
      const [col,row] = key.split(',').map(Number);
      const p = cellToWorld(grid,{col,row});
      const tile = this.add.rectangle(p.x,p.y,grid.cellSize-6,grid.cellSize-6,0x3f4737,0.82)
        .setStrokeStyle(2,0x69745b,0.9).setDepth(-4);
      if ((col + row) % 2 === 0) drawPixelRock(this,p.x,p.y,Math.max(2,grid.cellSize/18)).setDepth(-3);
      else drawPixelTree(this,p.x,p.y,Math.max(2,grid.cellSize/18)).setDepth(-3);
      tile.setData('obstacle',true);
    }
  }

  private clearGridHighlights(): void {
    for (const h of this.gridHighlights) h.destroy();
    this.gridHighlights = [];
  }

  private unitCell(unit: BattleUnit): GridCell | null {
    return this.battleGrid ? worldToCell(this.battleGrid, unit.x, unit.y) : null;
  }

  private occupiedCells(ignoreId?: string): Set<string> {
    const blocked = new Set(this.battleObstacles);
    for (const u of this.battleUnits) {
      if (u.id === ignoreId || u.health <= 0) continue;
      const cell = this.unitCell(u);
      if (cell) blocked.add(cellKey(cell));
    }
    return blocked;
  }

  private movementSteps(unit: BattleUnit): number {
    const bonus = unit.statuses?.includes('Dash') ? 2 : 0;
    return Math.max(2, Math.min(6, Math.round(unit.movement / 55) + bonus));
  }

  private adjacentCells(cell: GridCell): GridCell[] {
    return this.battleGrid ? neighbours(this.battleGrid, cell) : [];
  }

  private availableValor(): number {
    return getState().valor + this.temporaryValor;
  }

  private spendValor(cost: number): boolean {
    if (cost <= 0) return true;
    if (this.availableValor() < cost) return false;
    const fromTemp = Math.min(this.temporaryValor, cost);
    this.temporaryValor -= fromTemp;
    getState().valor -= cost - fromTemp;
    return true;
  }

  private grantTemporaryValor(unit: BattleUnit, reason: 'Engagement' | 'Victory' | 'Support'): boolean {
    if (unit.side !== 'player' || !unit.mercenaryId || unit.valorTriggeredThisTurn) return false;
    const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
    if (!merc || merc.valorStyle !== reason) return false;
    this.temporaryValor = Math.min(getState().maxValor, this.temporaryValor + 1);
    unit.valorTriggeredThisTurn = true;
    this.showBattleMessage(`${unit.name} gains +1 temporary Valor (${reason}).`);
    return true;
  }

  private grantSupportValorIfEligible(unit?: BattleUnit): void {
    if (!unit || unit.side !== 'player' || unit.health <= 0 || unit.engagedWithId) return;
    const cell = this.unitCell(unit);
    if (!cell) return;
    const hasAdjacentAlly = this.battleUnits.some(other => {
      if (other.id === unit.id || other.side !== 'player' || other.health <= 0) return false;
      const otherCell = this.unitCell(other);
      return !!otherCell && manhattan(cell, otherCell) === 1;
    });
    if (hasAdjacentAlly) this.grantTemporaryValor(unit, 'Support');
  }

  private createBattleUnitSprite(unit: BattleUnit): void {
    let kind: ActorKind;
    if (unit.side === 'player') {
      if (unit.animalId) kind = 'wolf';
      else {
        const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
        kind = classToKind(merc?.class ?? 'Swordsman');
      }
    } else {
      kind = this.encounterEnemy?.kind === 'wolf' ? 'wolf' : this.encounterEnemy?.kind === 'raider' ? 'raider' : 'bandit';
    }
    const size = this.battleGrid?.cellSize ?? 64;
    const actor = createActor(this, kind, 0, size * .24, size / 54).setName('actor');
    if (unit.mercenaryId) {
      const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
      const tints = [0xffffff,0xffe0cf,0xd9f0ff,0xe9d4ff];
      actor.setTint(tints[merc?.appearanceVariant ?? 0] ?? 0xffffff);
    }
    const label = this.add.text(0, -size * .40, unit.name, {
      fontFamily: 'monospace', fontSize: `${Math.max(8, Math.min(11, size / 6))}px`, color: '#fff4d0',
      backgroundColor: '#15120fdd', padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    const hpBg = this.add.rectangle(0, size * .32, size * .75, 4, 0x24191a);
    const hp = this.add.rectangle(-size * .375, size * .32, size * .75, 4, unit.side === 'player' ? 0x86bca1 : 0xd68973).setOrigin(0, 0.5).setName('hp');
    const armor = this.add.rectangle(-size * .375, size * .42, size * .75, 3, 0x5b88ad).setOrigin(0, 0.5).setName('armor');
    const selection = this.add.rectangle(0, 0, size - 6, size - 6)
      .setStrokeStyle(2, unit.side === 'player' ? 0x86c8ff : 0xdc7169, 0.75)
      .setFillStyle(0x000000, 0)
      .setName('selection');
    const c = this.add.container(unit.x, unit.y, [selection, actor, label, hpBg, hp, armor])
      .setDepth(20).setSize(size - 4, size - 4).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.onUnitClicked(unit.id);
    });
    this.battleSprites.set(unit.id, c);
  }

  private onUnitClicked(id: string): void {
    if (!this.canAct()) return;
    const unit = this.battleUnits.find(u => u.id === id && u.health > 0);
    if (!unit) return;

    if (unit.side === 'player') {
      if (unit.acted) { this.showBattleMessage(`${unit.name} has already acted this round.`); return; }
      this.selectedUnitId = unit.id;
      this.selectedSkillId = undefined;
      this.drawMovementRange(unit);
      this.showBattleMessage(unit.moved
        ? `${unit.name} already moved. Attack, use a skill, Guard, or End Unit.`
        : `Selected ${unit.name}. Tap a highlighted grid cell to move.`);
      this.refreshBattleHud();
      return;
    }

    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected) return;
    if (this.selectedSkillId) {
      this.useSkillOnEnemy(selected, unit, this.selectedSkillId);
      return;
    }
    this.basicAttack(selected, unit);
  }

  private basicAttack(selected: BattleUnit, unit: BattleUnit): void {
    const aCell = this.unitCell(selected), tCell = this.unitCell(unit);
    if (!aCell || !tCell) return;
    const merc = getState().mercenaries.find(m => m.id === selected.mercenaryId);
    let range = merc?.class === 'Ranger' ? 5 : merc?.class === 'Spearman' ? 2 : 1;
    if (merc?.learnedSkills.includes('Long Reach')) range += 1;
    if (manhattan(aCell,tCell) > range) {
      this.showBattleMessage(`Target is outside attack range (${range} grid cells).`);
      return;
    }
    this.performAttack(selected, unit, 1, 'Attack');
  }

  private performAttack(attacker: BattleUnit, target: BattleUnit, multiplier = 1, label = 'Attack', status?: string): void {
    this.lockAction();
    attacker.acted = true;
    attacker.facing = target.x < attacker.x ? -1 : 1;
    const attackerSprite = this.battleSprites.get(attacker.id);
    const defenderSprite = this.battleSprites.get(target.id);
    const aa = attackerSprite?.getByName('actor');
    const da = defenderSprite?.getByName('actor');
    if (aa instanceof Phaser.GameObjects.Sprite) {
      aa.setFlipX(target.x < attacker.x);
      playActor(aa,'attack');
    }
    const targetFacing = target.facing ?? -1;
    const backstab = (attacker.x < target.x && targetFacing === 1) || (attacker.x > target.x && targetFacing === -1);
    let dmg = Math.max(1, Math.round((attacker.power + Phaser.Math.Between(-2,3)) * multiplier));
    if (backstab) dmg = Math.ceil(dmg * 1.3);
    const critical = Math.random() < attacker.crit;
    if (critical) dmg = Math.ceil(dmg * 1.5);
    const merc = getState().mercenaries.find(m => m.id === attacker.mercenaryId);
    if (!status && merc?.weaponOil === 'Poison') status = 'Poison';
    if (status) target.statuses = Array.from(new Set([...(target.statuses ?? []),status]));
    this.time.delayedCall(150,()=>{
      applyDamage(target,dmg);
      this.showDamage(target, dmg);
      if (da instanceof Phaser.GameObjects.Sprite) {
        da.setTintFill(0xffffff);
        playActor(da,target.health <= 0 ? 'death' : 'hurt',target.health > 0);
        this.time.delayedCall(90,()=>da.clearTint());
      }
      const aCell=this.unitCell(attacker),tCell=this.unitCell(target);
      if (target.health > 0 && aCell && tCell && manhattan(aCell,tCell) === 1) {
        const newlyEngaged = !attacker.engagedWithId;
        attacker.engagedWithId=target.id; target.engagedWithId=attacker.id;
        if (newlyEngaged) this.grantTemporaryValor(attacker, 'Engagement');
      }
      if (target.health <= 0) this.grantTemporaryValor(attacker, 'Victory');
      attacker.acted=true;
      this.updateBattleSprite(target);
      this.showBattleMessage(`${label}: ${attacker.name} hits ${target.name} for ${dmg}${critical?' · CRITICAL':''}${backstab?' · BACKSTAB':''}${status?` · ${status}`:''}.`);
      this.afterPlayerAction();
    });
  }

  selectBattleSkill(skillId: string): void {
    if (!this.canAct()) return;
    if (this.selectedSkillId === skillId) { this.cancelBattleSkill(); return; }
    const selected = this.battleUnits.find(u=>u.id===this.selectedUnitId && u.side==='player' && u.health>0 && !u.acted);
    if (!selected) return;
    const merc = getState().mercenaries.find(m=>m.id===selected.mercenaryId);
    const skill = battleSkillsFor(merc?.class).find(s=>s.id===skillId);
    if (!skill) return;
    if (this.availableValor() < skill.cost) {
      this.showBattleMessage('Not enough Valor for that skill.');
      return;
    }
    if (skill.target === 'self') {
      this.useSelfSkill(selected,skill);
      return;
    }
    this.selectedSkillId=skill.id;
    this.drawMovementRange(selected);
    this.showBattleMessage(`${skill.name}: ${skill.description} Tap an enemy.`);
    this.refreshBattleHud();
  }

  private useSelfSkill(unit: BattleUnit, skill: BattleSkill): void {
    if (!this.spendValor(skill.cost)) return;
    const adjacentEnemies=this.battleUnits.filter(e=>{
      if(e.side!=='enemy'||e.health<=0) return false;
      const a=this.unitCell(unit),b=this.unitCell(e);
      return !!a&&!!b&&manhattan(a,b)===1;
    });
    if (['whirlwind','cleave','sweep'].includes(skill.id)) {
      for(const e of adjacentEnemies){ applyDamage(e,Math.max(1,Math.round(unit.power*.8))); this.updateBattleSprite(e); if (e.health <= 0) this.grantTemporaryValor(unit, 'Victory'); }
      unit.acted=true;
    } else if (skill.id==='riposte') {
      unit.armor+=4; unit.statuses=Array.from(new Set([...(unit.statuses??[]),'Riposte'])); unit.acted=true;
    } else if (skill.id==='rage') {
      unit.power+=4; unit.statuses=Array.from(new Set([...(unit.statuses??[]),'Rage'])); unit.acted=true;
    } else if (skill.id==='quickstep'||skill.id==='dash') {
      unit.moved=false; unit.statuses=Array.from(new Set([...(unit.statuses??[]),'Dash']));
      this.drawMovementRange(unit);
    } else if (skill.id==='spear-wall') {
      unit.statuses=Array.from(new Set([...(unit.statuses??[]),'SpearWall'])); unit.armor+=2; unit.acted=true;
    } else if (skill.id==='brace') {
      unit.armor+=5; unit.acted=true;
    } else if (skill.id==='smoke-bomb') {
      const opponent = this.battleUnits.find(e => e.id === unit.engagedWithId);
      if (opponent) opponent.engagedWithId = undefined;
      unit.engagedWithId=undefined; unit.statuses=Array.from(new Set([...(unit.statuses??[]),'Dodge'])); unit.moved=false;
      this.drawMovementRange(unit);
    }
    this.updateBattleSprite(unit);
    this.showBattleMessage(`${unit.name} uses ${skill.name}.`);
    if(unit.acted) this.afterPlayerAction(); else this.refreshBattleHud();
  }

  private useSkillOnEnemy(attacker: BattleUnit, target: BattleUnit, skillId: string): void {
    const state=getState();
    const merc=state.mercenaries.find(m=>m.id===attacker.mercenaryId);
    const skill=battleSkillsFor(merc?.class).find(s=>s.id===skillId);
    if(!skill||this.availableValor()<skill.cost) return;
    const a=this.unitCell(attacker),t=this.unitCell(target);
    if(!a||!t) return;
    const d=manhattan(a,t);
    const ranges:Record<string,number>={
      'shield-bash':1,'taunt':1,'rend':1,'execute':1,'aimed-shot':6,'pinning-shot':5,
      'volley':5,'long-thrust':3,'poison-blade':1,'backstab':1
    };
    if(d>(ranges[skillId]??1)){this.showBattleMessage(`${skill.name}: target out of range.`);return;}
    if (!this.spendValor(skill.cost)) return;
    this.selectedSkillId=undefined;

    if(skillId==='taunt'){
      target.statuses=Array.from(new Set([...(target.statuses??[]),'Weakened']));
      attacker.acted=true; this.showBattleMessage(`${target.name} is Weakened.`); this.afterPlayerAction(); return;
    }
    if(skillId==='volley'){
      const victims=this.battleUnits.filter(e=>{
        if(e.side!=='enemy'||e.health<=0)return false;
        const ec=this.unitCell(e); return !!ec&&manhattan(ec,t)<=1;
      });
      for(const e of victims){applyDamage(e,Math.max(1,Math.round(attacker.power*.75)));this.updateBattleSprite(e);if(e.health<=0)this.grantTemporaryValor(attacker, 'Victory');}
      attacker.acted=true;this.showBattleMessage(`Volley hits ${victims.length} enemies.`);this.afterPlayerAction();return;
    }
    let mult=1.15; let status:string|undefined;
    if(skillId==='shield-bash'){mult=.75;status='Stunned';}
    if(skillId==='rend'){mult=1.15;status='Bleeding';}
    if(skillId==='execute')mult=target.health<=target.maxHealth*.5?1.9:1.15;
    if(skillId==='aimed-shot')mult=1.45;
    if(skillId==='pinning-shot'){mult=.9;status='Rooted';}
    if(skillId==='long-thrust')mult=1.2;
    if(skillId==='poison-blade'){mult=1.0;status='Poison';}
    if(skillId==='backstab')mult=1.55;
    this.performAttack(attacker,target,mult,skill.name,status);
  }

  private onBattlePointer(p: Phaser.Input.Pointer): void {
    if(!this.battleGrid) return;
    const cell=worldToCell(this.battleGrid,p.worldX,p.worldY);
    if(!cell)return;
    this.moveSelectedToCell(cell);
  }

  private moveSelectedToCell(cell: GridCell): void {
    if (!this.canAct()) return;
    if (this.selectedSkillId) { this.showBattleMessage('Choose Basic attack to leave skill targeting and move.'); return; }
    const selected=this.battleUnits.find(u=>u.id===this.selectedUnitId&&u.side==='player'&&u.health>0&&!u.acted);
    if(!selected||selected.moved||!this.battleGrid)return;
    const start=this.unitCell(selected); if(!start)return;
    const blocked=this.occupiedCells(selected.id);
    const reachable=reachableCells(this.battleGrid,start,this.movementSteps(selected),blocked);
    if(!reachable.has(cellKey(cell))){this.showBattleMessage('That grid cell is blocked or unreachable.');return;}

    if(selected.engagedWithId){
      const opponent=this.battleUnits.find(u=>u.id===selected.engagedWithId&&u.health>0);
      if(opponent){applyDamage(selected,Math.max(1,Math.floor(opponent.power*.4)));this.updateBattleSprite(selected);opponent.engagedWithId=undefined;}
      selected.engagedWithId=undefined;
      if(selected.health<=0){selected.acted=true;this.afterPlayerAction();return;}
    }
    const path=shortestPath(this.battleGrid,start,[cell],blocked,this.movementSteps(selected));
    const container=this.battleSprites.get(selected.id);
    const actor=container?.getByName('actor');
    if(actor instanceof Phaser.GameObjects.Sprite)setWalk(actor,true);
    this.clearGridHighlights();

    this.lockAction();
    selected.moved = true;
    let index=0;
    const step=()=>{
      if(index>=path.length){
        selected.moved=true;
        selected.statuses=selected.statuses?.filter(s=>s!=='Dash');
        if(actor instanceof Phaser.GameObjects.Sprite)setWalk(actor,false);
        this.battlePhase = 'player';
        if (this.pendingResize) this.handleResize();
        this.drawMovementRange(selected);
        this.showBattleMessage(`${selected.name} moved ${path.length} cells. Attack a red target or use a skill.`);
        this.refreshBattleHud();return;
      }
      const world=cellToWorld(this.battleGrid!,path[index++]);
      selected.facing=world.x<selected.x?-1:1; selected.x=world.x; selected.y=world.y;
      if(actor instanceof Phaser.GameObjects.Sprite)actor.setFlipX(selected.facing===-1);
      if(container)this.tweens.add({targets:container,x:world.x,y:world.y,duration:95,ease:'Linear',onComplete:step});
      else step();
    };
    step();
  }

  private drawMovementRange(unit: BattleUnit): void {
    this.clearGridHighlights();
    if(unit.acted||!this.battleGrid)return;
    const start=this.unitCell(unit); if(!start)return;
    const reachable = unit.moved || this.selectedSkillId ? new Map<string, number>() : reachableCells(this.battleGrid,start,this.movementSteps(unit),this.occupiedCells(unit.id));
    for(const key of reachable.keys()){
      const [col,row]=key.split(',').map(Number);
      const p=cellToWorld(this.battleGrid,{col,row});
      const tile=this.add.rectangle(p.x,p.y,this.battleGrid.cellSize-8,this.battleGrid.cellSize-8,0x3f91c7,.28)
        .setStrokeStyle(2,0x83cfff,.8).setDepth(4).setInteractive({useHandCursor:true});
      tile.on('pointerdown',(_p:Phaser.Input.Pointer,_x:number,_y:number,ev:Phaser.Types.Input.EventData)=>{
        ev.stopPropagation();this.moveSelectedToCell({col,row});
      });
      this.gridHighlights.push(tile);
    }

    for (const enemy of this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0)) {
      const targetCell = this.unitCell(enemy);
      if (!targetCell || manhattan(start, targetCell) > this.attackRange(unit)) continue;
      const tile = this.add.rectangle(enemy.x, enemy.y, this.battleGrid.cellSize - 4, this.battleGrid.cellSize - 4, 0xbc6659, .2)
        .setStrokeStyle(2, 0xe59d79, .9).setDepth(5);
      this.gridHighlights.push(tile);
    }
  }

  private attackRange(unit: BattleUnit): number {
    const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
    if (this.selectedSkillId) return ({'aimed-shot': 6, 'pinning-shot': 5, volley: 5, 'long-thrust': 3} as Record<string, number>)[this.selectedSkillId] ?? 1;
    return (merc?.class === 'Ranger' ? 5 : merc?.class === 'Spearman' ? 2 : 1) + (merc?.learnedSkills.includes('Long Reach') ? 1 : 0);
  }

  endSelectedUnit(): void {
    if (!this.canAct()) return;
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected) return;
    selected.acted = true;
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.afterPlayerAction();
  }

  valorSkillSelected(): void {
    if (!this.canAct()) return;
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected) return;
    if (!this.spendValor(1)) {
      this.showBattleMessage('No Valor points available.');
      return;
    }
    selected.armor = Math.min(selected.maxArmor + 6, selected.armor + 5);
    selected.power += 2;
    this.updateBattleSprite(selected);
    this.showBattleMessage(`${selected.name} spends 1 Valor: +5 armor and +2 power this battle.`);
    this.refreshBattleHud();
  }

  guardSelectedUnit(): void {
    if (!this.canAct()) return;
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected) return;
    selected.armor = Math.min(selected.maxArmor + 5, selected.armor + 4);
    selected.acted = true;
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.showBattleMessage(`${selected.name} guards and gains 4 temporary armor.`);
    this.updateBattleSprite(selected);
    this.afterPlayerAction();
  }

  private afterPlayerAction(): void {
    this.battlePhase = 'player';
    if (this.pendingResize) this.handleResize();
    const completedUnit = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player');
    this.grantSupportValorIfEligible(completedUnit);
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.selectedSkillId = undefined;
    this.selectedUnitId = undefined;
    this.removeDeadUnits();
    if (this.checkBattleEnd()) return;
    const livingPlayers = this.battleUnits.filter(u => u.side === 'player' && u.health > 0);
    if (livingPlayers.every(u => u.acted)) this.enemyTurn(); else { this.selectNextUnit(); this.refreshBattleHud(); }
  }

  private enemyTurn(): void {
    if (!this.battleGrid) return;
    this.battlePhase = 'enemy';
    this.showBattleMessage('Enemy turn. Watch their movement and prepare your next action.');
    this.refreshBattleHud();
    const enemies = this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0);
    const next = (index: number): void => {
      if (this.battlePhase === 'finished') return;
      this.removeDeadUnits();
      if (this.checkBattleEnd()) return;
      const enemy = enemies[index];
      if (!enemy) { this.finishEnemyTurn(); return; }
      if (enemy.health <= 0) { next(index + 1); return; }
      if (enemy.statuses?.includes('Stunned')) {
        enemy.statuses = enemy.statuses.filter(s => s !== 'Stunned');
        this.showBattleMessage(`${enemy.name} is stunned and misses their turn.`);
        this.time.delayedCall(240, () => next(index + 1));
        return;
      }
      const start = this.unitCell(enemy)!;
      const blocked = this.occupiedCells(enemy.id);
      const choices = this.battleUnits.filter(u => u.side === 'player' && u.health > 0).map(target => {
        const cell = this.unitCell(target)!;
        const distance = manhattan(start, cell);
        const route = distance === 1 ? [] : shortestPath(this.battleGrid!, start, this.adjacentCells(cell).filter(g => !blocked.has(cellKey(g))), blocked);
        return { target, route, score: distance === 1 ? 0 : route.length || Infinity };
      }).sort((a, b) => a.score - b.score);
      const choice = choices[0];
      if (!choice) { this.checkBattleEnd(); return; }
      const path = enemy.statuses?.includes('Rooted') ? [] : choice.route.slice(0, this.movementSteps(enemy));
      enemy.statuses = enemy.statuses?.filter(s => s !== 'Rooted');
      const sprite = this.battleSprites.get(enemy.id);
      const actor = sprite?.getByName('actor');
      let stepIndex = 0;
      const step = (): void => {
        if (stepIndex < path.length) {
          const point = cellToWorld(this.battleGrid!, path[stepIndex++]);
          enemy.facing = point.x < enemy.x ? -1 : 1;
          Object.assign(enemy, point);
          if (actor instanceof Phaser.GameObjects.Sprite) { setWalk(actor, true); actor.setFlipX(enemy.facing === -1); }
          this.tweens.add({ targets: sprite, ...point, duration: 100, onComplete: step });
          return;
        }
        if (actor instanceof Phaser.GameObjects.Sprite) setWalk(actor, false);
        const target = choice.target;
        if (target.health > 0 && manhattan(this.unitCell(enemy)!, this.unitCell(target)!) === 1) {
          if (target.statuses?.includes('SpearWall')) {
            applyDamage(enemy, Math.max(1, Math.round(target.power * .6)));
            target.statuses = target.statuses.filter(s => s !== 'SpearWall');
            this.updateBattleSprite(enemy);
          }
          // A spear wall can kill the attacker before its attack lands.
          if (enemy.health > 0) {
            let damage = Math.max(1, enemy.power + Phaser.Math.Between(-2, 2));
            if (enemy.statuses?.includes('Weakened')) damage = Math.max(1, Math.floor(damage * .7));
            if (target.statuses?.includes('Dodge')) damage = Math.max(1, Math.floor(damage * .55));
            applyDamage(target, damage);
            this.showDamage(target, damage);
            this.updateBattleSprite(target);
            if (actor instanceof Phaser.GameObjects.Sprite) { actor.setFlipX(target.x < enemy.x); playActor(actor, 'attack'); }
            enemy.facing = target.x < enemy.x ? -1 : 1;
            this.showBattleMessage(`${enemy.name} hits ${target.name} for ${damage}.`);
            if (target.health > 0 && target.statuses?.includes('Riposte')) {
              applyDamage(enemy, Math.max(1, Math.round(target.power * .5)));
              this.updateBattleSprite(enemy);
              target.statuses = target.statuses.filter(s => s !== 'Riposte');
            }
            if (target.health > 0 && enemy.health > 0) { enemy.engagedWithId = target.id; target.engagedWithId = enemy.id; }
          }
        }
        this.refreshBattleHud();
        this.time.delayedCall(260, () => next(index + 1));
      };
      step();
    };
    this.time.delayedCall(300, () => next(0));
  }

  private finishEnemyTurn(): void {
    for (const unit of this.battleUnits.filter(u => u.health > 0)) {
      const damage = (unit.statuses?.includes('Poison') ? 2 : 0) + (unit.statuses?.includes('Bleeding') ? 3 : 0);
      if (damage) { unit.health = Math.max(0, unit.health - damage); this.updateBattleSprite(unit); }
      unit.statuses = unit.statuses?.filter(s => s !== 'Dodge' && s !== 'Weakened');
    }
    this.removeDeadUnits();
    if (this.checkBattleEnd()) return;
    this.round += 1;
    for (const unit of this.battleUnits.filter(u => u.side === 'player' && u.health > 0)) {
      unit.acted = false; unit.moved = false; unit.valorTriggeredThisTurn = false;
    }
    this.battlePhase = 'player';
    if (this.pendingResize) this.handleResize();
    this.selectNextUnit();
    this.showBattleMessage(`Round ${this.round}. Your company may act.`);
    this.refreshBattleHud();
  }

  private removeDeadUnits(): void {
    const deadIds = new Set(this.battleUnits.filter(u => u.health <= 0).map(u => u.id));
    if (!deadIds.size) return;
    for (const u of this.battleUnits) {
      if (u.engagedWithId && deadIds.has(u.engagedWithId)) u.engagedWithId = undefined;
    }
    for (const id of deadIds) {
      const sprite = this.battleSprites.get(id);
      if (sprite) {
        sprite.disableInteractive();
        sprite.destroy(true);
        this.battleSprites.delete(id);
      }
      if (this.selectedUnitId === id) this.selectedUnitId = undefined;
    }
    this.clearGridHighlights();
  }

  private checkBattleEnd(): boolean {
    if (this.battlePhase === 'finished') return true;
    const playersAlive = this.battleUnits.some(u => u.side === 'player' && u.health > 0);
    const enemiesAlive = this.battleUnits.some(u => u.side === 'enemy' && u.health > 0);
    if (!enemiesAlive) {
      this.battlePhase = 'finished';
      this.clearGridHighlights();
      this.syncBattleBackToState();
      const e = this.encounterEnemy;
      if (e) {
        e.alive = false;
        const loot = generateLoot(e.kind);
        const state = getState();
        clearLocationGarrison(state, e);
        state.crowns += loot.crowns;
        state.inventory.push(...loot.items);
        if (e.kind === 'wolf') {
          state.materials.leather = (state.materials.leather ?? 0) + 2;
          state.materials.herbs = (state.materials.herbs ?? 0) + 1;
        } else {
          state.materials.iron = (state.materials.iron ?? 0) + 1;
          state.materials.cloth = (state.materials.cloth ?? 0) + 1;
        }
        recordKill(state, e.kind);
        for (const m of state.mercenaries) gainXp(m, 35);
        state.morale = Math.min(100, state.morale + 3);
        awardPathXp(state, 'Power and Glory', 8);
        saveGame();
        this.emit({ type: 'victory', crowns: loot.crowns, items: loot.items.map(i => i.name), enemyKind: e.kind });
      }
      return true;
    }
    if (!playersAlive) {
      this.battlePhase = 'finished';
      this.clearGridHighlights();
      this.syncBattleBackToState();
      const state = getState();
      for (const m of state.mercenaries) { m.health = Math.max(1, Math.floor(m.maxHealth * 0.45)); m.armor = 0; }
      if (state.mercenaries[0]) inflictInjury(state, state.mercenaries[0].id);
      state.crowns = Math.max(0, state.crowns - 30);
      saveGame();
      this.emit({ type: 'defeat' });
      return true;
    }
    return false;
  }

  private syncBattleBackToState(): void {
    const state = getState();
    for (const bu of this.battleUnits.filter(u => u.side === 'player')) {
      if (bu.mercenaryId) {
        const m = state.mercenaries.find(m => m.id === bu.mercenaryId);
        if (m) {
          if (bu.health <= 0 && state.permadeath) {
            state.mercenaries = state.mercenaries.filter(x => x.id !== m.id);
          } else {
            m.health = Math.max(1, bu.health);
            m.armor = Math.max(0, Math.min(m.maxArmor, bu.armor));
            if (bu.health <= 0) inflictInjury(state,m.id);
          }
        }
      }
      if (bu.animalId) {
        const a = state.animals.find(a => a.id === bu.animalId);
        if (a) a.health = Math.max(1, bu.health);
      }
    }
  }

  continueFromBattle(): void {
    if (this.battlePhase !== 'finished') return;
    const locationId = this.encounterEnemy?.id.startsWith('garrison:') ? this.encounterEnemy.id.slice('garrison:'.length) : undefined;
    this.encounterEnemy = undefined;
    this.encounterGraceUntil = this.time.now + 5000;
    this.temporaryValor = 0;
    this.renderWorld();
    if (locationId) this.enterNearbyLocation(locationId);
  }

  private refreshBattleHud(): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId);
    const enemies = this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0).length;
    const merc = selected?.mercenaryId ? getState().mercenaries.find(m=>m.id===selected.mercenaryId) : undefined;
    const skills = battleSkillsFor(merc?.class);
    this.emit({
      type:'battleHud',phase:this.battlePhase,hint:this.battleHint,log:this.battleLog.slice(-4),
      roster:this.battleUnits.filter(u=>u.side==='player').map(u=>({...u,className:getState().mercenaries.find(m=>m.id===u.mercenaryId)?.class ?? 'Wolf'})),
      round:this.round,enemies,valor:getState().valor,tempValor:this.temporaryValor,totalValor:this.availableValor(),
      selected:selected?{id:selected.id,name:selected.name,health:selected.health,armor:selected.armor,moved:selected.moved,acted:selected.acted,className:merc?.class,range:this.attackRange(selected),steps:this.movementSteps(selected),statuses:selected.statuses,engaged:!!selected.engagedWithId,valorStyle:merc?.valorStyle}:null,
      skills,selectedSkillId:this.selectedSkillId
    });
    for (const [id, sprite] of this.battleSprites.entries()) {
      const u = this.battleUnits.find(u => u.id === id);
      if (u?.side === 'player' && u.health > 0) {
        sprite.setAlpha(u.acted ? .55 : 1);
        const outline = sprite.getByName('selection') as Phaser.GameObjects.Rectangle;
        outline.setStrokeStyle(id === this.selectedUnitId ? 3 : 1, id === this.selectedUnitId ? 0xf1d48c : 0x86c8ff, 1);
      }
    }
  }

  private updateBattleSprite(unit: BattleUnit): void {
    const c = this.battleSprites.get(unit.id);
    if (!c) return;
    const hp = c.getByName('hp') as Phaser.GameObjects.Rectangle;
    const armor = c.getByName('armor') as Phaser.GameObjects.Rectangle;
    hp.width = (this.battleGrid!.cellSize * .75) * (Math.max(0, unit.health) / unit.maxHealth);
    armor.width = unit.maxArmor ? (this.battleGrid!.cellSize * .75) * Math.min(1, Math.max(0, unit.armor) / unit.maxArmor) : 0;
  }

  private showDamage(unit: BattleUnit, amount: number): void {
    const text = this.add.text(unit.x, unit.y - 15, `−${amount}`, {
      fontFamily: 'Georgia', fontSize: '22px', fontStyle: 'bold',
      color: unit.side === 'enemy' ? '#f2cc8a' : '#f0a28a', stroke: '#17231c', strokeThickness: 4
    }).setOrigin(.5).setDepth(90);
    this.tweens.add({ targets: text, y: unit.y - 52, alpha: 0, duration: 780, onComplete: () => text.destroy() });
  }

  private showBattleMessage(message: string): void {
    this.battleHint = message;
    this.battleLog.push(message);
    this.battleLog = this.battleLog.slice(-20);
    this.emit({ type: 'battleHint', message });
  }

  testMovePartyTo(x: number, y: number): void {
    const state = getState(); state.worldX = x; state.worldY = y; this.party?.setPosition(x, y); this.checkDiscoveries();
  }

  testTriggerEncounter(id: string): void {
    const e = getState().enemies.find(e => e.id === id && e.alive);
    if (e) { this.encounterEnemy = e; this.emit({ type: 'encounter', enemy: { id: e.id, kind: e.kind, strength: e.strength } }); }
  }

  testBattleSnapshot(): unknown {
    return {
      phase: this.battlePhase, selectedUnitId: this.selectedUnitId, round: this.round,
      pointerListeners: this.input.listenerCount('pointerdown'), wheelListeners: this.input.listenerCount('wheel'),
      grid: this.battleGrid ? { ...this.battleGrid } : null,
      obstacles: Array.from(this.battleObstacles),
      tempValor:this.temporaryValor,
      permanentValor:getState().valor,
      units: this.battleUnits.map(u => ({ id:u.id,name:u.name,side:u.side,x:u.x,y:u.y,health:u.health,armor:u.armor,statuses:u.statuses,moved:u.moved,acted:u.acted,visible:this.battleSprites.has(u.id) }))
    };
  }

  testSelectFirstPlayer(): string | null {
    const unit=this.battleUnits.find(u=>u.side==='player'&&u.health>0&&!u.acted);
    if(!unit)return null;
    this.onUnitClicked(unit.id);
    return unit.id;
  }

  testMoveSelectedTo(col:number,row:number): void {
    this.moveSelectedToCell({col,row});
  }

  testKillFirstEnemy(): void {
    const enemy=this.battleUnits.find(u=>u.side==='enemy'&&u.health>0);
    if(!enemy)return;
    enemy.health=0;
    this.removeDeadUnits();
    this.refreshBattleHud();
  }

  testGrantTempValor(amount=1): void {
    this.temporaryValor=Math.min(getState().maxValor,this.temporaryValor+amount);
    this.refreshBattleHud();
  }

  testIsCellBlocked(col:number,row:number): boolean {
    return this.occupiedCells().has(cellKey({col,row}));
  }

  getSnapshot(): unknown { return structuredClone(getState()); }
}
