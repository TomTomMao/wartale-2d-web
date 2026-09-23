import Phaser from 'phaser';
import { LOCATIONS, WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { animalToBattleUnit, applyDamage, enemyBattleUnits, generateLoot, mercToBattleUnit, recordKill } from './domain';
import { getState, saveGame } from './store';
import { awardPathXp, inflictInjury, travelStep } from './systems';
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
  private enemySprites = new Map<string, Phaser.GameObjects.Container>();
  private battleUnits: BattleUnit[] = [];
  private battleSprites = new Map<string, Phaser.GameObjects.Container>();
  private selectedUnitId?: string;
  private encounterEnemy?: WorldEnemy;
  private round = 1;
  private battleMessage?: Phaser.GameObjects.Text;
  private movementRange?: Phaser.GameObjects.Arc;
  private battleGrid?: GridLayout;
  private gridHighlights: Phaser.GameObjects.Rectangle[] = [];
  private battleObstacles = new Set<string>();
  private selectedSkillId?: string;
  private discoveryCooldown = new Set<string>();

  constructor() { super('game'); }

  create(): void {
    this.input.mouse?.disableContextMenu();
    this.renderWorld();
  }

  private emit(detail: Record<string, unknown>): void {
    window.dispatchEvent(new CustomEvent(WORLD_EVENT, { detail }));
  }

  renderWorld(): void {
    this.mode = 'world';
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
      if (this.mode !== 'world') return;
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.moveTarget = new Phaser.Math.Vector2(world.x, world.y);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
      if (this.mode !== 'world') return;
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
    const town = loc.type === 'town';
    const art = createPixelLocation(this, loc.type, loc.id, 0, 0);
    art.setPosition(-24, -28);
    const label = this.add.text(0, 32, loc.name, {
      fontFamily: 'monospace', fontSize: '15px', color: '#fff0c4',
      backgroundColor: '#1d1914dd', padding: { x: 6, y: 3 }
    }).setOrigin(0.5);
    const marker = this.add.container(loc.x, loc.y, [art, label]).setDepth(10);
    marker.setSize(92, 82).setInteractive({ useHandCursor: true }).on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      const state = getState();
      const dist = Phaser.Math.Distance.Between(state.worldX, state.worldY, loc.x, loc.y);
      if (town && dist < 150) this.emit({ type: 'town', townId: loc.id, townName: loc.name });
      else if (loc.id.includes('tomb') && dist < 170) this.emit({ type: 'tomb', tombId: loc.id, tombName: loc.name });
      else this.emit({ type: 'toast', message: dist < 180 ? `${loc.name} explored.` : `Move closer to ${loc.name}.` });
    });
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
    const state = getState();
    const speed = 180;
    let dx = 0, dy = 0;
    if (this.keys.W.isDown) dy -= 1;
    if (this.keys.S.isDown) dy += 1;
    if (this.keys.A.isDown) dx -= 1;
    if (this.keys.D.isDown) dx += 1;
    let partyMoving = false;
    if (dx || dy) {
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
    this.updateEnemies(delta);
    this.checkDiscoveries();
    this.checkEncounter();
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
    if (this.encounterEnemy) return;
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
    state.worldX += Math.cos(ang) * 120;
    state.worldY += Math.sin(ang) * 120;
    this.encounterEnemy = undefined;
    this.renderWorld();
  }

  startEncounterBattle(enemyId?: string): void {
    const e = enemyId ? getState().enemies.find(e => e.id === enemyId) : this.encounterEnemy;
    if (!e) return;
    this.encounterEnemy = e;
    this.startBattle(e);
  }

  private startBattle(enemy: WorldEnemy): void {
    this.mode = 'battle';
    this.children.removeAll(true);
    this.enemySprites.clear();
    this.battleSprites.clear();
    this.clearGridHighlights();
    this.selectedUnitId = undefined;
    this.selectedSkillId = undefined;
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
    for (let row = 0; row < grid.rows; row++) {
      playerCells.push({ col: 1, row });
      if (grid.cols > 7) playerCells.push({ col: 2, row });
      enemyCells.push({ col: grid.cols - 2, row });
      if (grid.cols > 7) enemyCells.push({ col: grid.cols - 3, row });
    }

    this.battleUnits = state.mercenaries.slice(0, Math.min(6, playerCells.length)).map((m, i) => {
      const p = cellToWorld(grid, playerCells[i]);
      return mercToBattleUnit(m, p.x, p.y);
    });
    this.battleUnits.push(...state.animals.slice(0, 2).map((a, i) => {
      const cell = playerCells[Math.min(playerCells.length - 1, state.mercenaries.length + i)];
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
    this.battleMessage = this.add.text(w / 2, Math.max(28, grid.originY - 30), '', {
      fontFamily: 'Georgia', fontSize: w < 700 ? '13px' : '18px', color: '#f6e8bf',
      backgroundColor: '#1a1815dd', padding: { x: 10, y: 6 },
      wordWrap: { width: Math.max(250, w - 40) }
    }).setOrigin(0.5).setDepth(100);

    this.refreshBattleHud();
    this.showBattleMessage('Select a blue unit. Reachable grid cells will light up.');
    this.input.removeAllListeners('pointerdown');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (currentlyOver.length > 0) return;
      this.onBattlePointer(p);
    });
    this.emit({ type: 'battle', round: this.round });
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
    const actor = createActor(this, kind, 0, 2, 1.35).setName('actor');
    if (unit.mercenaryId) {
      const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
      const tints = [0xffffff,0xffe0cf,0xd9f0ff,0xe9d4ff];
      actor.setTint(tints[merc?.appearanceVariant ?? 0] ?? 0xffffff);
    }
    const label = this.add.text(0, -45, unit.name, {
      fontFamily: 'monospace', fontSize: '13px', color: '#fff4d0',
      backgroundColor: '#15120fdd', padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    const hpBg = this.add.rectangle(0, 42, 60, 8, 0x24191a);
    const hp = this.add.rectangle(-30, 42, 60, 8, 0xb4473f).setOrigin(0, 0.5).setName('hp');
    const armor = this.add.rectangle(-30, 53, 60, 5, 0x5b88ad).setOrigin(0, 0.5).setName('armor');
    const selection = this.add.rectangle(0, 5, 56, 65)
      .setStrokeStyle(2, unit.side === 'player' ? 0x86c8ff : 0xdc7169, 0.75)
      .setFillStyle(0x000000, 0)
      .setName('selection');
    const c = this.add.container(unit.x, unit.y, [selection, actor, label, hpBg, hp, armor])
      .setDepth(20).setSize(76, 108).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.onUnitClicked(unit.id);
    });
    this.battleSprites.set(unit.id, c);
  }

  private onUnitClicked(id: string): void {
    const unit = this.battleUnits.find(u => u.id === id && u.health > 0);
    if (!unit) return;

    if (unit.side === 'player') {
      if (unit.acted) return;
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
    if (status) target.statuses = Array.from(new Set([...(target.statuses ?? []),status]));
    this.time.delayedCall(150,()=>{
      const wasDying = target.statuses?.includes('Dying') ?? false;
      applyDamage(target,dmg);
      if (target.health <= 0 && !wasDying) {
        target.health = 1;
        target.statuses = Array.from(new Set([...(target.statuses ?? []),'Dying']));
      } else if (wasDying && target.health <= 0) target.health = 0;
      if (da instanceof Phaser.GameObjects.Sprite) {
        da.setTintFill(0xffffff);
        playActor(da,target.health <= 0 ? 'death' : 'hurt',target.health > 0);
        this.time.delayedCall(90,()=>da.clearTint());
      }
      const aCell=this.unitCell(attacker),tCell=this.unitCell(target);
      if (aCell && tCell && manhattan(aCell,tCell) === 1) {
        attacker.engagedWithId=target.id; target.engagedWithId=attacker.id;
      }
      attacker.acted=true;
      this.updateBattleSprite(target);
      this.showBattleMessage(`${label}: ${attacker.name} hits ${target.name} for ${dmg}${backstab?' · BACKSTAB':''}${status?` · ${status}`:''}.`);
      this.afterPlayerAction();
    });
  }

  selectBattleSkill(skillId: string): void {
    const selected = this.battleUnits.find(u=>u.id===this.selectedUnitId && u.side==='player' && u.health>0 && !u.acted);
    if (!selected) return;
    const merc = getState().mercenaries.find(m=>m.id===selected.mercenaryId);
    const skill = battleSkillsFor(merc?.class).find(s=>s.id===skillId);
    if (!skill) return;
    if (getState().valor < skill.cost) {
      this.showBattleMessage('Not enough Valor for that skill.');
      return;
    }
    if (skill.target === 'self') {
      this.useSelfSkill(selected,skill);
      return;
    }
    this.selectedSkillId=skill.id;
    this.clearGridHighlights();
    this.showBattleMessage(`${skill.name}: tap an enemy in range.`);
    this.refreshBattleHud();
  }

  private useSelfSkill(unit: BattleUnit, skill: BattleSkill): void {
    const state=getState();
    if (state.valor < skill.cost) return;
    state.valor -= skill.cost;
    const adjacentEnemies=this.battleUnits.filter(e=>{
      if(e.side!=='enemy'||e.health<=0) return false;
      const a=this.unitCell(unit),b=this.unitCell(e);
      return !!a&&!!b&&manhattan(a,b)===1;
    });
    if (['whirlwind','cleave','sweep'].includes(skill.id)) {
      for(const e of adjacentEnemies){ applyDamage(e,Math.max(1,Math.round(unit.power*.8))); this.updateBattleSprite(e); }
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
    if(!skill||state.valor<skill.cost) return;
    const a=this.unitCell(attacker),t=this.unitCell(target);
    if(!a||!t) return;
    const d=manhattan(a,t);
    const ranges:Record<string,number>={
      'shield-bash':1,'taunt':1,'rend':1,'execute':1,'aimed-shot':6,'pinning-shot':5,
      'volley':5,'long-thrust':3,'poison-blade':1,'backstab':1
    };
    if(d>(ranges[skillId]??1)){this.showBattleMessage(`${skill.name}: target out of range.`);return;}
    state.valor-=skill.cost;
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
      for(const e of victims){applyDamage(e,Math.max(1,Math.round(attacker.power*.75)));this.updateBattleSprite(e);}
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
      if(selected.health<=0){this.removeDeadUnits();this.checkBattleEnd();return;}
    }
    const path=shortestPath(this.battleGrid,start,[cell],blocked,this.movementSteps(selected));
    const container=this.battleSprites.get(selected.id);
    const actor=container?.getByName('actor');
    if(actor instanceof Phaser.GameObjects.Sprite)setWalk(actor,true);
    this.clearGridHighlights();

    let index=0;
    const step=()=>{
      if(index>=path.length){
        selected.moved=true;
        selected.statuses=selected.statuses?.filter(s=>s!=='Dash');
        if(actor instanceof Phaser.GameObjects.Sprite)setWalk(actor,false);
        this.showBattleMessage(`${selected.name} moved ${path.length} grid cells.`);
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
    if(unit.moved||unit.acted||!this.battleGrid)return;
    const start=this.unitCell(unit); if(!start)return;
    const reachable=reachableCells(this.battleGrid,start,this.movementSteps(unit),this.occupiedCells(unit.id));
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
  }

  endSelectedUnit(): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0);
    if (!selected) return;
    selected.acted = true;
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.afterPlayerAction();
  }

  valorSkillSelected(): void {
    const state = getState();
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected) return;
    if (state.valor <= 0) {
      this.showBattleMessage('No Valor points available.');
      return;
    }
    state.valor -= 1;
    selected.armor = Math.min(selected.maxArmor + 6, selected.armor + 5);
    selected.power += 2;
    this.updateBattleSprite(selected);
    this.showBattleMessage(`${selected.name} spends 1 Valor: +5 armor and +2 power this battle.`);
    this.refreshBattleHud();
  }

  guardSelectedUnit(): void {
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
    this.clearGridHighlights();
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.selectedSkillId = undefined;
    this.selectedUnitId = undefined;
    this.removeDeadUnits();
    if (this.checkBattleEnd()) return;
    const livingPlayers = this.battleUnits.filter(u => u.side === 'player' && u.health > 0);
    if (livingPlayers.every(u => u.acted)) this.enemyTurn(); else this.refreshBattleHud();
  }

  private enemyTurn(): void {
    if(!this.battleGrid)return;
    const enemies=this.battleUnits.filter(u=>u.side==='enemy'&&u.health>0);
    const players=this.battleUnits.filter(u=>u.side==='player'&&u.health>0);
    for(const enemy of enemies){
      if(enemy.statuses?.includes('Stunned')){
        enemy.statuses=enemy.statuses.filter(s=>s!=='Stunned');
        continue;
      }
      const target=players.filter(p=>p.health>0).sort((a,b)=>{
        const ac=this.unitCell(a),bc=this.unitCell(b),ec=this.unitCell(enemy);
        return (!ac||!ec?99:manhattan(ec,ac))-(!bc||!ec?99:manhattan(ec,bc));
      })[0];
      if(!target)break;
      const ec=this.unitCell(enemy),tc=this.unitCell(target);
      if(!ec||!tc)continue;

      let dist=manhattan(ec,tc);
      if(dist>1 && !enemy.statuses?.includes('Rooted')){
        const goals=this.adjacentCells(tc).filter(g=>!this.occupiedCells(enemy.id).has(cellKey(g)));
        const blocked=this.occupiedCells(enemy.id);
        const path=shortestPath(this.battleGrid,ec,goals,blocked,this.movementSteps(enemy));
        const destination=path[Math.min(path.length,this.movementSteps(enemy))-1];
        if(destination){
          const world=cellToWorld(this.battleGrid,destination);
          enemy.facing=world.x<enemy.x?-1:1;enemy.x=world.x;enemy.y=world.y;
          this.battleSprites.get(enemy.id)?.setPosition(world.x,world.y);
        }
      }
      enemy.statuses=enemy.statuses?.filter(s=>s!=='Rooted');
      const ec2=this.unitCell(enemy),tc2=this.unitCell(target);
      dist=ec2&&tc2?manhattan(ec2,tc2):99;
      if(dist===1){
        let dmg=Math.max(1,enemy.power+Phaser.Math.Between(-2,2));
        if(enemy.statuses?.includes('Weakened'))dmg=Math.max(1,Math.floor(dmg*.7));
        if(target.statuses?.includes('Dodge'))dmg=Math.max(1,Math.floor(dmg*.55));
        if(target.statuses?.includes('SpearWall')){
          applyDamage(enemy,Math.max(1,Math.round(target.power*.6)));this.updateBattleSprite(enemy);
          target.statuses=target.statuses.filter(s=>s!=='SpearWall');
        }
        applyDamage(target,dmg);this.updateBattleSprite(target);
        if(target.statuses?.includes('Riposte')){
          applyDamage(enemy,Math.max(1,Math.round(target.power*.5)));this.updateBattleSprite(enemy);
          target.statuses=target.statuses.filter(s=>s!=='Riposte');
        }
        enemy.engagedWithId=target.id;target.engagedWithId=enemy.id;
      }
    }
    for(const u of this.battleUnits.filter(u=>u.health>0)){
      let dot=0;if(u.statuses?.includes('Poison'))dot+=2;if(u.statuses?.includes('Bleeding'))dot+=3;
      if(dot){u.health=Math.max(0,u.health-dot);this.updateBattleSprite(u);}
      u.statuses=u.statuses?.filter(s=>s!=='Dodge');
    }
    this.removeDeadUnits();
    if(this.checkBattleEnd())return;
    this.round+=1;
    for(const u of this.battleUnits.filter(u=>u.side==='player'&&u.health>0)){u.acted=false;u.moved=false;}
    this.showBattleMessage(`Round ${this.round}. Your company may act.`);
    this.refreshBattleHud();
  }

  private removeDeadUnits(): void {
    for (const u of this.battleUnits.filter(u => u.health <= 0)) {
      const s = this.battleSprites.get(u.id);
      if (s?.active) {
        const actor = s.getByName('actor');
        if (actor instanceof Phaser.GameObjects.Sprite) playActor(actor, 'death', false);
        s.disableInteractive();
      }
    }
  }

  private checkBattleEnd(): boolean {
    const playersAlive = this.battleUnits.some(u => u.side === 'player' && u.health > 0);
    const enemiesAlive = this.battleUnits.some(u => u.side === 'enemy' && u.health > 0);
    if (!enemiesAlive) {
      this.syncBattleBackToState();
      const e = this.encounterEnemy;
      if (e) {
        e.alive = false;
        const loot = generateLoot(e.kind);
        const state = getState();
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
        awardPathXp(state, 'Power and Glory', 8);
        saveGame();
        this.emit({ type: 'victory', crowns: loot.crowns, items: loot.items.map(i => i.name), enemyKind: e.kind });
      }
      return true;
    }
    if (!playersAlive) {
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
            m.armor = Math.max(0, bu.armor);
            if (bu.statuses?.includes('Dying')) inflictInjury(state,m.id);
          }
        }
      }
      if (bu.animalId) {
        const a = state.animals.find(a => a.id === bu.animalId);
        if (a) a.health = Math.max(1, bu.health);
      }
    }
  }

  continueFromBattle(): void { this.encounterEnemy = undefined; this.renderWorld(); }

  private refreshBattleHud(): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId);
    const enemies = this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0).length;
    const merc = selected?.mercenaryId ? getState().mercenaries.find(m=>m.id===selected.mercenaryId) : undefined;
    const skills = battleSkillsFor(merc?.class);
    this.emit({
      type:'battleHud',round:this.round,enemies,valor:getState().valor,
      selected:selected?{name:selected.name,health:selected.health,armor:selected.armor,moved:selected.moved,acted:selected.acted,className:merc?.class}:null,
      skills,selectedSkillId:this.selectedSkillId
    });
    for (const [id, sprite] of this.battleSprites.entries()) {
      const u = this.battleUnits.find(u => u.id === id);
      if (u?.side === 'player' && u.health > 0) sprite.setScale(id === this.selectedUnitId ? 1.15 : 1);
    }
  }

  private updateBattleSprite(unit: BattleUnit): void {
    const c = this.battleSprites.get(unit.id);
    if (!c) return;
    const hp = c.getByName('hp') as Phaser.GameObjects.Rectangle;
    const armor = c.getByName('armor') as Phaser.GameObjects.Rectangle;
    hp.width = 56 * (Math.max(0, unit.health) / unit.maxHealth);
    armor.width = unit.maxArmor ? 56 * (Math.max(0, unit.armor) / unit.maxArmor) : 0;
  }

  private showBattleMessage(message: string): void { this.battleMessage?.setText(message); }

  testMovePartyTo(x: number, y: number): void {
    const state = getState(); state.worldX = x; state.worldY = y; this.party?.setPosition(x, y); this.checkDiscoveries();
  }

  testTriggerEncounter(id: string): void {
    const e = getState().enemies.find(e => e.id === id && e.alive);
    if (e) { this.encounterEnemy = e; this.emit({ type: 'encounter', enemy: { id: e.id, kind: e.kind, strength: e.strength } }); }
  }

  getSnapshot(): unknown { return structuredClone(getState()); }
}
