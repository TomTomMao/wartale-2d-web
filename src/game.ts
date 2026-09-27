import Phaser from 'phaser';
import { LOCATIONS, WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { animalToBattleUnit, applyDamage, enemyBattleUnits, gainXp, generateLoot, mercToBattleUnit, recordKill } from './domain';
import { getState, saveGame } from './store';
import { awardPathXp, inflictInjury, travelStep } from './systems';
import { clearLocationGarrison, enterLocation, isNearLocation, locationDefender, nearestLocation } from './locations';
import type { BattleUnit, MercClass, WorldEnemy } from './types';
import {
  drawPixelRock, drawPixelTree, drawPixelTerrain,
} from './pixelArt';
import { classToKind, createActor, playActor, setWalk, type ActorKind } from './animatedSprites';
import { battleSkillsFor, type BattleSkill } from './battleSkills';
import {
  cellKey, cellToWorld, createGridLayout, defaultObstacleCells, manhattan,
  neighbours, reachableCells, shortestPath, worldToCell, type GridCell, type GridLayout
} from './battleGrid';

import { getWorldMap, WORLD_REGIONS, WORLD_TILE_SIZE, directedCell, directionBetween, fleeCell, locationCell, roadTile, safeWorldCell, tileAt, walkable, worldCell, worldPath, worldPoint, type WorldDirection } from './worldMap';
import { createWorldActor, createWorldBuilding, drawWorldTiles, poseWorldActor } from './worldArt';

const WORLD_EVENT = 'ironbound:ui';
type Mode = 'world' | 'battle';
type WorldStep = { from: GridCell; to: GridCell; elapsed: number; duration: number };


export class GameScene extends Phaser.Scene {
  private mode: Mode = 'world';
  private party?: Phaser.GameObjects.Container;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private world = getWorldMap();
  private worldLayer?: Phaser.Tilemaps.TilemapLayer;
  private worldGrid?: Phaser.GameObjects.Graphics;
  private routeArt?: Phaser.GameObjects.Graphics;
  private showWorldGrid = true;
  private worldRoute: GridCell[] = [];
  private worldStep?: WorldStep;
  private heldDirection?: WorldDirection;
  private queuedDirection?: WorldDirection;
  private facing: WorldDirection = 'down';
  private trail: GridCell[] = [];
  private followers: Phaser.GameObjects.Sprite[] = [];
  private enemySteps = new Map<string, WorldStep>();
  private patrolTurn = 0;
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
    this.worldRoute = [];
    this.worldStep = undefined;
    this.heldDirection = this.queuedDirection = undefined;
    this.destinationLocation = undefined;
    this.input.removeAllListeners('pointerdown');
    this.input.removeAllListeners('pointermove');
    this.input.removeAllListeners('wheel');
    this.worldLayer?.tilemap.destroy();
    this.worldLayer = undefined;
    this.children.removeAll(true);
    this.enemySprites.clear();
    this.enemySteps.clear();
    this.battleSprites.clear();
    this.clearGridHighlights();
    this.movementRange = undefined;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setZoom(this.defaultWorldZoom());
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.worldLayer = drawWorldTiles(this, this.world);
    this.worldGrid = this.add.graphics().setDepth(-19).setVisible(this.showWorldGrid);
    this.worldGrid.lineStyle(1, 0x264933, .12);
    for (let x = 0; x <= WORLD_WIDTH; x += WORLD_TILE_SIZE) this.worldGrid.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += WORLD_TILE_SIZE) this.worldGrid.lineBetween(0, y, WORLD_WIDTH, y);
    this.routeArt = this.add.graphics().setDepth(-5);
    for (const building of this.world.buildings) createWorldBuilding(this, building);
    for (const loc of LOCATIONS) this.createLocation(loc);
    const state = getState(), start = safeWorldCell(this.world, state.worldX, state.worldY), point = worldPoint(start);
    state.worldX = point.x; state.worldY = point.y;
    state.currentRegion = WORLD_REGIONS[tileAt(this.world, start)!.region];
    this.trail = [start, start, start];
    this.followers = state.mercenaries.slice(1, 3).map(m => createWorldActor(this, classToKind(m.class), point.x, point.y).setVisible(false));
    this.party = this.add.container(point.x, point.y, [createWorldActor(this, classToKind(state.mercenaries[0]?.class ?? 'Swordsman'), 0, 0)]).setDepth(point.y);
    this.cameras.main.startFollow(this.party, true, .2, .2);
    this.cameras.main.centerOn(point.x, point.y);
    this.createEnemies();
    this.checkDiscoveries();
    this.keys = this.input.keyboard?.addKeys('I,Q,R') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'world' || this.uiOpen() || this.encounterEnemy) return;
      const pos = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.routeTo(worldCell(pos.x, pos.y));
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
      if (this.mode !== 'world' || this.uiOpen() || this.encounterEnemy) return;
      this.zoomWorld(-dy * .001);
    });
    this.emit({ type: 'world' });
  }

  private defaultWorldZoom(): number { return this.scale.width < 700 ? 1.25 : this.scale.height < 520 ? 1.2 : 1.6; }
  zoomWorld(amount: number): void {
    if (this.mode === 'world') this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + amount, .9, 2));
  }
  toggleWorldGrid(): void { this.showWorldGrid = !this.showWorldGrid; this.worldGrid?.setVisible(this.showWorldGrid); }
  worldGridVisible(): boolean { return this.showWorldGrid; }

  private createLocation(loc: typeof LOCATIONS[number]): void {
    const cell = locationCell(loc.id)!, point = worldPoint(cell);
    const door = this.add.graphics().setDepth(-4);
    door.lineStyle(2, 0xffecad, .9).strokeRect(point.x - 15, point.y - 15, 30, 30);
    door.fillStyle(0xffecad, .9).fillTriangle(point.x - 5, point.y + 4, point.x + 5, point.y + 4, point.x, point.y - 2);
    const label = this.add.text(point.x, point.y - 132, loc.name, {
      fontFamily: 'monospace', fontSize: '10px', color: '#fff0c4',
      backgroundColor: '#223d30dd', padding: { x: 5, y: 3 }
    }).setOrigin(.5).setDepth(5000);
    const building = this.world.buildings.find(b => b.id === loc.id)!;
    const zone = this.add.zone(building.col * WORLD_TILE_SIZE, building.row * WORLD_TILE_SIZE, building.width * WORLD_TILE_SIZE, (building.height + 1) * WORLD_TILE_SIZE).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); this.travelToLocation(loc.id);
    });
    label.setInteractive({ useHandCursor: true }).on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); this.travelToLocation(loc.id);
    });
  }

  private routeTo(goal: GridCell, location?: string): boolean {
    const state = getState(), start = this.worldStep?.to ?? worldCell(state.worldX, state.worldY);
    if (!walkable(this.world, goal)) {
      this.emit({ type: 'toast', message: 'That tile is blocked. Follow the paths and bridges.' }); return false;
    }
    const route = worldPath(this.world, start, goal);
    if (!route.length && manhattan(start, goal)) {
      this.emit({ type: 'toast', message: 'No clear path to that tile.' }); return false;
    }
    this.heldDirection = this.queuedDirection = undefined;
    this.destinationLocation = location;
    this.worldRoute = route;
    this.drawWorldRoute();
    if (!route.length && !this.worldStep) {
      const entrance = tileAt(this.world, goal)?.entrance;
      if (entrance) this.enterNearbyLocation(entrance);
    }
    return true;
  }

  private drawWorldRoute(): void {
    this.routeArt?.clear();
    this.routeArt?.fillStyle(0xfff0b7, .65);
    for (const cell of this.worldRoute) { const p = worldPoint(cell); this.routeArt?.fillCircle(p.x, p.y, 3); }
    const goal = this.worldRoute.at(-1);
    if (goal) { const p = worldPoint(goal); this.routeArt?.lineStyle(2, 0xfff0b7, .9).strokeRect(p.x - 17, p.y - 17, 34, 34); }
  }

  travelToLocation(id: string): void {
    if (this.mode !== 'world' || this.encounterEnemy || this.uiOpen()) return;
    const loc = LOCATIONS.find(l => l.id === id);
    if (!loc) return;
    if (isNearLocation(getState(), id)) { this.enterNearbyLocation(id); return; }
    if (this.routeTo(locationCell(id)!, id)) this.emit({ type: 'toast', message: `Following the path to ${loc.name}. Entering on arrival.` });
  }

  enterNearbyLocation(id?: string): void {
    if (this.mode !== 'world' || this.encounterEnemy || this.uiOpen()) return;
    const loc = id ? LOCATIONS.find(l => l.id === id) : nearestLocation(getState());
    if (!loc || !enterLocation(getState(), loc.id)) return;
    this.pauseWorldTravel();
    saveGame();
    if (loc.type === 'town') this.emit({ type: 'town', townId: loc.id, townName: loc.name });
    else if (loc.id.includes('tomb')) this.emit({ type: 'tomb', tombId: loc.id, tombName: loc.name });
    else this.emit({ type: 'location', locationId: loc.id });
  }

  // Keyboard and touch events queue even a very short tap between render frames.
  setWorldDirection(direction: WorldDirection | null): void {
    if (this.mode !== 'world' || this.uiOpen() || this.encounterEnemy) return;
    this.heldDirection = direction ?? undefined;
    if (direction) {
      this.queuedDirection = direction;
      this.worldRoute = []; this.destinationLocation = undefined; this.drawWorldRoute();
    }
  }

  pauseWorldTravel(): void {
    if (this.mode !== 'world') return;
    this.worldRoute = []; this.worldStep = undefined; this.destinationLocation = undefined;
    this.heldDirection = this.queuedDirection = undefined;
    this.drawWorldRoute();
    const state = getState(), cell = worldCell(state.worldX, state.worldY);
    this.paintParty(cell, cell, 0, false);
    this.enemySteps.clear();
    for (const e of state.enemies) {
      const root = this.enemySprites.get(e.id); root?.setPosition(e.x, e.y).setDepth(e.y);
      const actor = root?.getByName('actor');
      if (actor instanceof Phaser.GameObjects.Sprite) poseWorldActor(actor, actor.getData('worldDirection'), false);
    }
  }

  private paintParty(from: GridCell, to: GridCell, progress: number, moving: boolean): void {
    const a = worldPoint(from), b = worldPoint(to), x = Phaser.Math.Linear(a.x, b.x, progress), y = Phaser.Math.Linear(a.y, b.y, progress);
    this.party?.setPosition(x, y).setDepth(y);
    const actor = this.party?.list[0];
    if (actor instanceof Phaser.GameObjects.Sprite) poseWorldActor(actor, this.facing, moving, this.time.now);
    this.followers.forEach((sprite, i) => {
      const start = this.trail[i + 1] ?? from, end = moving ? this.trail[i] ?? from : start;
      const p = worldPoint(start), q = worldPoint(end);
      const sx = Phaser.Math.Linear(p.x, q.x, progress), sy = Phaser.Math.Linear(p.y, q.y, progress);
      sprite.setPosition(sx, sy).setDepth(sy - .1).setVisible(manhattan(start, from) > 0 || manhattan(end, to) > 0);
      poseWorldActor(sprite, moving ? directionBetween(start, end) : sprite.getData('worldDirection'), moving && manhattan(start, end) > 0, this.time.now);
    });
  }

  private createEnemies(): void {
    for (const e of getState().enemies.filter(e => e.alive)) {
      Object.assign(e, worldPoint(safeWorldCell(this.world, e.x, e.y)));
      const kind: ActorKind = e.kind === 'wolf' ? 'wolf' : e.kind === 'raider' ? 'raider' : 'bandit';
      const actor = createWorldActor(this, kind, 0, 0).setName('actor');
      const badge = this.add.text(0, -41, e.strength > 1 ? '★'.repeat(Math.min(3,e.strength)) : '!', { fontFamily:'monospace', fontSize:'10px', color:'#ffe2a1', backgroundColor:'#713e36', padding:{x:3,y:1} }).setOrigin(.5);
      this.enemySprites.set(e.id, this.add.container(e.x, e.y, [actor, badge]).setDepth(e.y));
    }
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'world' || !this.party || !this.keys) return;
    if (this.uiOpen() || this.encounterEnemy) { this.pauseWorldTravel(); return; }
    // Phaser smooths/caps early frames to 60 Hz, which slows travel on low-FPS devices.
    // Use elapsed frame time for the world, while bounding any background-tab gap.
    delta = Math.min(this.game.loop.rawDelta || delta, 80);
    this.hudElapsed += delta;
    if (this.hudElapsed >= 500) { this.hudElapsed = 0; this.emit({ type: 'worldHud' }); }
    const state = getState();
    if (!this.worldStep) {
      const from = worldCell(state.worldX, state.worldY), direction = this.queuedDirection ?? this.heldDirection;
      this.queuedDirection = undefined;
      const to = direction ? directedCell(from, direction) : this.worldRoute.shift();
      if (to) {
        this.facing = directionBetween(from, to);
        if (walkable(this.world, to) && manhattan(from, to) === 1) this.worldStep = { from, to, elapsed: 0, duration: 180 };
        this.drawWorldRoute();
      }
    }
    const step = this.worldStep;
    if (step) {
      step.elapsed += delta;
      const t = Math.min(1, step.elapsed / step.duration);
      this.paintParty(step.from, step.to, t, true);
      if (t === 1) {
        const p = worldPoint(step.to); state.worldX = p.x; state.worldY = p.y;
        travelStep(state, WORLD_TILE_SIZE, roadTile(this.world, step.to));
        state.currentRegion = WORLD_REGIONS[tileAt(this.world, step.to)!.region];
        this.trail.unshift(step.to); this.trail.length = 3; this.worldStep = undefined;
        const entrance = tileAt(this.world, step.to)?.entrance;
        if (entrance && !this.worldRoute.length && (!this.destinationLocation || this.destinationLocation === entrance)) {
          this.enterNearbyLocation(entrance); return;
        }
        if (!this.worldRoute.length) this.destinationLocation = undefined;
      }
    } else { const cell = worldCell(state.worldX, state.worldY); this.paintParty(cell, cell, 0, false); }
    this.updateEnemies(delta);
    this.checkDiscoveries();
    this.checkEncounter();
    if (this.encounterEnemy) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.I)) this.emit({ type: 'inventory' });
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.emit({ type: 'quests' });
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.emit({ type: 'camp' });
  }

  private updateEnemies(delta: number): void {
    const state = getState(), player = worldCell(state.worldX, state.worldY);
    for (const enemy of state.enemies) {
      const sprite = this.enemySprites.get(enemy.id);
      if (!enemy.alive || !sprite) continue;
      let step = this.enemySteps.get(enemy.id);
      if (!step) {
        const from = worldCell(enemy.x, enemy.y);
        const chase = manhattan(from, player) < 8 && enemy.kind !== 'wolf';
        const options = neighbours(this.world, from).filter(c => walkable(this.world, c));
        const to = chase ? worldPath(this.world, from, player)[0] : options[(this.patrolTurn++ + enemy.id.length) % options.length];
        if (!to) continue;
        step = { from, to, elapsed: 0, duration: 1000 - Math.min(enemy.strength, 3) * 80 };
        this.enemySteps.set(enemy.id, step);
      }
      step.elapsed += delta;
      const t = Math.min(1, step.elapsed / step.duration), a = worldPoint(step.from), b = worldPoint(step.to);
      sprite.setPosition(Phaser.Math.Linear(a.x, b.x, t), Phaser.Math.Linear(a.y, b.y, t)).setDepth(sprite.y);
      const actor = sprite.getByName('actor');
      if (actor instanceof Phaser.GameObjects.Sprite) poseWorldActor(actor, directionBetween(step.from, step.to), true, this.time.now);
      if (t === 1) { Object.assign(enemy, b); this.enemySteps.delete(enemy.id); }
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
      if (manhattan(worldCell(state.worldX, state.worldY), worldCell(e.x, e.y)) <= 1) {
        this.encounterEnemy = e;
        this.pauseWorldTravel();
        this.emit({ type: 'encounter', enemy: { id: e.id, kind: e.kind, strength: e.strength } });
        break;
      }
    }
  }

  fleeEncounter(): void {
    const state = getState();
    if (!this.encounterEnemy) return;
    const e = this.encounterEnemy;
    const point = worldPoint(fleeCell(this.world, worldCell(state.worldX, state.worldY), worldCell(e.x, e.y)));
    state.worldX = point.x; state.worldY = point.y;
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
    this.pauseWorldTravel();
    this.worldLayer?.tilemap.destroy();
    this.worldLayer = undefined;
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
    if (this.mode === 'world') { this.cameras.main.setZoom(this.defaultWorldZoom()); return; }
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
    this.pauseWorldTravel();
    const cell = safeWorldCell(this.world, x, y), point = worldPoint(cell), state = getState();
    state.worldX = point.x; state.worldY = point.y; this.trail = [cell, cell, cell];
    this.paintParty(cell, cell, 0, false); this.cameras.main.centerOn(point.x, point.y); this.checkDiscoveries();
  }

  testWorldSnapshot(includeTerrain = false): unknown {
    const state = getState(), camera = this.cameras.main;
    return { cell: worldCell(state.worldX, state.worldY), tileSize: WORLD_TILE_SIZE,
      step: this.worldStep, route: this.worldRoute, facing: this.facing, gridVisible: this.showWorldGrid,
      camera: { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom, width: camera.width, height: camera.height },
      tiles: includeTerrain ? this.world.tiles.map(row => row.map(t => ({ ...t }))) : undefined,
      entrances: LOCATIONS.map(l => ({ id: l.id, ...locationCell(l.id) })),
      enemies: state.enemies.filter(e => e.alive).map(e => ({ id: e.id, ...worldCell(e.x, e.y) })) };
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
