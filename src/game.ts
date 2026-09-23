import Phaser from 'phaser';
import { LOCATIONS, WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { applyDamage, enemyBattleUnits, generateLoot, mercToBattleUnit, recordKill } from './domain';
import { getState, saveGame } from './store';
import { inflictInjury, travelStep } from './systems';
import type { BattleUnit, MercClass, WorldEnemy } from './types';
import {
  createPixelLocation,
  drawPixelRock,
  drawPixelTerrain,
  drawPixelTree
} from './pixelArt';
import { classToKind, createActor, playActor, setWalk, type ActorKind } from './animatedSprites';

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
      travelStep(state, step);
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
        travelStep(state, step);
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
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBounds(0, 0, w, h);
    drawPixelTerrain(this, w, h, 'battle').setDepth(-20);
    drawPixelTree(this, w * 0.47, 100, 4).setDepth(-3);
    drawPixelTree(this, w * 0.78, h * 0.58, 4).setDepth(-3);
    drawPixelRock(this, w * 0.42, h - 230, 5).setDepth(-3);
    drawPixelRock(this, w * 0.64, 180, 4).setDepth(-3);

    this.battleUnits = getState().mercenaries.slice(0, 6).map((m, i) => mercToBattleUnit(m, 180 + (i % 2) * 85, 220 + Math.floor(i / 2) * 105));
    this.battleUnits.push(...enemyBattleUnits(enemy.kind, enemy.strength));
    this.round = 1;
    for (const unit of this.battleUnits) this.createBattleUnitSprite(unit);
    this.battleMessage = this.add.text(w / 2, 32, '', { fontFamily: 'Georgia', fontSize: '20px', color: '#f6e8bf', backgroundColor: '#1a1815cc', padding: { x: 12, y: 7 } }).setOrigin(0.5).setDepth(100);
    this.refreshBattleHud();
    this.showBattleMessage('Select a blue mercenary, then click inside the blue movement circle.');
    this.input.removeAllListeners('pointerdown');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      // Clicking an interactive unit is handled by that unit. Do not also treat
      // the same click as a ground-movement command.
      if (currentlyOver.length > 0) return;
      this.onBattlePointer(p);
    });
    this.emit({ type: 'battle', round: this.round });
  }

  private createBattleUnitSprite(unit: BattleUnit): void {
    let kind: ActorKind;
    if (unit.side === 'player') {
      const merc = getState().mercenaries.find(m => m.id === unit.mercenaryId);
      kind = classToKind(merc?.class ?? 'Swordsman');
    } else {
      kind = this.encounterEnemy?.kind === 'wolf' ? 'wolf' : this.encounterEnemy?.kind === 'raider' ? 'raider' : 'bandit';
    }
    const actor = createActor(this, kind, 0, 2, 1.35).setName('actor');
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
      this.drawMovementRange(unit);
      this.showBattleMessage(unit.moved
        ? `${unit.name} has already moved. Choose an enemy to attack or end the unit.`
        : `Selected ${unit.name}. Click inside the blue circle to move.`);
      this.refreshBattleHud();
      return;
    }
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.health > 0 && !u.acted);
    if (!selected) return;
    const dist = Phaser.Math.Distance.Between(selected.x, selected.y, unit.x, unit.y);
    const merc = getState().mercenaries.find(m => m.id === selected.mercenaryId);
    let attackRange = merc?.class === 'Ranger' ? 300 : merc?.class === 'Spearman' ? 175 : 135;
    if (merc?.learnedSkills.includes('Long Reach')) attackRange += 45;
    if (dist > attackRange) { this.showBattleMessage(`Target is outside attack range (${attackRange}).`); return; }
    const attacker = this.battleSprites.get(selected.id);
    const defender = this.battleSprites.get(unit.id);
    const attackerActor = attacker?.getByName('actor');
    const defenderActor = defender?.getByName('actor');
    if (attackerActor instanceof Phaser.GameObjects.Sprite) {
      attackerActor.setFlipX(unit.x < selected.x);
      playActor(attackerActor, 'attack');
    }
    const targetFacing = unit.facing ?? -1;
    const backstab = (selected.x < unit.x && targetFacing === 1) || (selected.x > unit.x && targetFacing === -1);
    let dmg = Math.max(1, selected.power + Phaser.Math.Between(-2, 3));
    if (backstab) dmg = Math.ceil(dmg * 1.3);
    if (merc?.learnedSkills.includes('Aimed Shot') && merc.class === 'Ranger') dmg += 3;
    if (merc?.learnedSkills.includes('Heavy Strike') && merc.class === 'Warrior') unit.statuses = Array.from(new Set([...(unit.statuses ?? []), 'Bleeding']));
    if (merc?.learnedSkills.includes('Poison Blade') && merc.class === 'Rogue') unit.statuses = Array.from(new Set([...(unit.statuses ?? []), 'Poison']));
    if (attackRange <= 175) {
      selected.engagedWithId = unit.id;
      unit.engagedWithId = selected.id;
    }
    this.time.delayedCall(180, () => {
      applyDamage(unit, dmg);
      if (defenderActor instanceof Phaser.GameObjects.Sprite) {
        defenderActor.setTintFill(0xffffff);
        playActor(defenderActor, unit.health <= 0 ? 'death' : 'hurt', unit.health > 0);
        this.time.delayedCall(90, () => defenderActor.clearTint());
      }
      selected.acted = true;
      this.showBattleMessage(`${selected.name} hits ${unit.name} for ${dmg}${backstab ? ' (BACKSTAB)' : ''}${unit.statuses?.length ? ` · ${unit.statuses.join(', ')}` : ''}.`);
      this.updateBattleSprite(unit);
      this.afterPlayerAction();
    });
  }

  private onBattlePointer(p: Phaser.Input.Pointer): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0 && !u.acted);
    if (!selected || selected.moved) return;
    const d = Phaser.Math.Distance.Between(selected.x, selected.y, p.worldX, p.worldY);
    if (d > selected.movement) { this.showBattleMessage('Destination is outside movement range.'); return; }
    const nx = Phaser.Math.Clamp(p.worldX, 60, this.scale.width - 60);
    const ny = Phaser.Math.Clamp(p.worldY, 90, this.scale.height - 90);
    if (selected.engagedWithId) {
      const opponent = this.battleUnits.find(u => u.id === selected.engagedWithId && u.health > 0);
      if (opponent) {
        applyDamage(selected, Math.max(1, Math.floor(opponent.power * 0.4)));
        opponent.engagedWithId = undefined;
        selected.engagedWithId = undefined;
        this.updateBattleSprite(selected);
        this.showBattleMessage(`${selected.name} disengages and suffers an opportunity attack.`);
        if (selected.health <= 0) {
          this.removeDeadUnits();
          this.checkBattleEnd();
          return;
        }
      }
    }
    const container = this.battleSprites.get(selected.id);
    const actor = container?.getByName('actor');
    if (actor instanceof Phaser.GameObjects.Sprite) {
      actor.setFlipX(nx < selected.x);
      setWalk(actor, true);
    }
    selected.facing = nx < selected.x ? -1 : 1;
    selected.x = nx; selected.y = ny; selected.moved = true;
    this.movementRange?.destroy();
    this.movementRange = undefined;
    if (container) {
      this.tweens.add({
        targets: container, x: nx, y: ny, duration: 260, ease: 'Sine.easeOut',
        onComplete: () => {
          if (actor instanceof Phaser.GameObjects.Sprite) setWalk(actor, false);
          this.showBattleMessage(`${selected.name} moved. Choose an enemy to attack, or end the unit.`);
          this.refreshBattleHud();
        }
      });
    }
  }

  private drawMovementRange(unit: BattleUnit): void {
    this.movementRange?.destroy();
    this.movementRange = undefined;
    if (unit.moved || unit.acted) return;
    this.movementRange = this.add
      .circle(unit.x, unit.y, unit.movement, 0x4aa3df, 0.12)
      .setStrokeStyle(3, 0x82cfff, 0.9)
      .setDepth(5);
  }

  endSelectedUnit(): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId && u.side === 'player' && u.health > 0);
    if (!selected) return;
    selected.acted = true;
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
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.showBattleMessage(`${selected.name} guards and gains 4 temporary armor.`);
    this.updateBattleSprite(selected);
    this.afterPlayerAction();
  }

  private afterPlayerAction(): void {
    this.movementRange?.destroy();
    this.movementRange = undefined;
    this.selectedUnitId = undefined;
    this.removeDeadUnits();
    if (this.checkBattleEnd()) return;
    const livingPlayers = this.battleUnits.filter(u => u.side === 'player' && u.health > 0);
    if (livingPlayers.every(u => u.acted)) this.enemyTurn(); else this.refreshBattleHud();
  }

  private enemyTurn(): void {
    const enemies = this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0);
    const players = this.battleUnits.filter(u => u.side === 'player' && u.health > 0);
    for (const enemy of enemies) {
      const target = players.filter(p => p.health > 0).sort((a, b) => Phaser.Math.Distance.Between(enemy.x, enemy.y, a.x, a.y) - Phaser.Math.Distance.Between(enemy.x, enemy.y, b.x, b.y))[0];
      if (!target) break;
      let dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
      if (dist > 120) {
        const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        const step = Math.min(enemy.movement, Math.max(0, dist - 95));
        enemy.facing = target.x < enemy.x ? -1 : 1;
        enemy.x += Math.cos(ang) * step; enemy.y += Math.sin(ang) * step;
        const ec = this.battleSprites.get(enemy.id);
        const ea = ec?.getByName('actor');
        if (ea instanceof Phaser.GameObjects.Sprite) {
          ea.setFlipX(target.x < enemy.x);
          setWalk(ea, true);
        }
        ec?.setPosition(enemy.x, enemy.y);
        if (ea instanceof Phaser.GameObjects.Sprite) setWalk(ea, false);
        dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
      }
      if (dist <= 125) {
        const ec = this.battleSprites.get(enemy.id);
        const tc = this.battleSprites.get(target.id);
        const ea = ec?.getByName('actor');
        const ta = tc?.getByName('actor');
        if (ea instanceof Phaser.GameObjects.Sprite) {
          ea.setFlipX(target.x < enemy.x);
          playActor(ea, 'attack');
        }
        const backstab = (enemy.x < target.x && (target.facing ?? 1) === 1) || (enemy.x > target.x && (target.facing ?? 1) === -1);
        let dmg = Math.max(1, enemy.power + Phaser.Math.Between(-2, 2));
        if (backstab) dmg = Math.ceil(dmg * 1.3);
        applyDamage(target, dmg);
        enemy.engagedWithId = target.id;
        target.engagedWithId = enemy.id;
        if (ta instanceof Phaser.GameObjects.Sprite) playActor(ta, target.health <= 0 ? 'death' : 'hurt', target.health > 0);
        this.updateBattleSprite(target);
      }
    }
    // Damage-over-time resolves between rounds.
    for (const u of this.battleUnits.filter(u => u.health > 0)) {
      let dot = 0;
      if (u.statuses?.includes('Poison')) dot += 2;
      if (u.statuses?.includes('Bleeding')) dot += 3;
      if (dot) {
        u.health = Math.max(0, u.health - dot);
        this.updateBattleSprite(u);
      }
    }
    this.removeDeadUnits();
    if (this.checkBattleEnd()) return;
    this.round += 1;
    for (const u of this.battleUnits.filter(u => u.side === 'player' && u.health > 0)) { u.acted = false; u.moved = false; }
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
        recordKill(state, e.kind);
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
    for (const bu of this.battleUnits.filter(u => u.side === 'player' && u.mercenaryId)) {
      const m = state.mercenaries.find(m => m.id === bu.mercenaryId);
      if (m) { m.health = Math.max(1, bu.health); m.armor = Math.max(0, bu.armor); }
    }
  }

  continueFromBattle(): void { this.encounterEnemy = undefined; this.renderWorld(); }

  private refreshBattleHud(): void {
    const selected = this.battleUnits.find(u => u.id === this.selectedUnitId);
    const enemies = this.battleUnits.filter(u => u.side === 'enemy' && u.health > 0).length;
    this.emit({ type: 'battleHud', round: this.round, enemies, valor: getState().valor, selected: selected ? { name: selected.name, health: selected.health, armor: selected.armor, moved: selected.moved, acted: selected.acted } : null });
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
