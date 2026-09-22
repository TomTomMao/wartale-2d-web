import Phaser from 'phaser';
import type { MercClass } from './types';

type Pixel = [number, number, number, number?, number?];

function paint(g: Phaser.GameObjects.Graphics, pixels: Pixel[], size: number): void {
  for (const [x, y, color, w = 1, h = 1] of pixels) {
    g.fillStyle(color, 1);
    g.fillRect(x * size, y * size, w * size, h * size);
  }
}

const SKIN = 0xd7a06b;
const DARK = 0x241f22;
const BOOT = 0x3a2b24;
const STEEL = 0xc7d0d4;
const STEEL_DARK = 0x69757d;
const GOLD = 0xc79b43;

const classPalette: Record<MercClass, { tunic: number; trim: number }> = {
  Swordsman: { tunic: 0x3f6590, trim: 0x9fbad0 },
  Warrior: { tunic: 0x8b4638, trim: 0xd17a58 },
  Ranger: { tunic: 0x466d43, trim: 0x8eaa60 },
  Spearman: { tunic: 0x6a567f, trim: 0xab8dc0 },
  Rogue: { tunic: 0x3e4146, trim: 0x7c838a }
};

function humanoidPixels(cls: MercClass, enemy = false): Pixel[] {
  const p = enemy ? { tunic: 0x713a39, trim: 0xa75d4d } : classPalette[cls];
  const base: Pixel[] = [
    [3,0,DARK,3,1],[2,1,DARK,5,1],
    [3,1,SKIN,3,2],[2,2,SKIN,1,1],[6,2,SKIN,1,1],
    [3,3,DARK,3,1],
    [2,4,p.tunic,5,3],[1,5,p.tunic,1,2],[7,5,p.tunic,1,2],
    [3,4,p.trim,1,3],[5,4,p.trim,1,3],
    [2,7,DARK,2,2],[5,7,DARK,2,2],
    [2,9,BOOT,2,1],[5,9,BOOT,2,1],
  ];

  if (cls === 'Swordsman') {
    base.push([8,4,STEEL,1,4],[8,3,GOLD,1,1],[7,7,GOLD,2,1]);
  } else if (cls === 'Warrior') {
    base.push([8,4,0x75432e,1,4],[7,3,STEEL_DARK,3,2],[8,2,STEEL,1,1]);
  } else if (cls === 'Ranger') {
    base.push([0,3,0x8f653c,1,6],[1,3,0xc08f55,1,1],[1,8,0xc08f55,1,1],[8,4,0xd1b56e,1,1]);
  } else if (cls === 'Spearman') {
    base.push([8,0,0x8f653c,1,10],[8,0,STEEL,1,2]);
  } else {
    base.push([8,4,STEEL,1,3],[7,6,STEEL,2,1],[1,4,0x2f3236,1,3]);
  }
  return base;
}

export function createPixelHumanoid(
  scene: Phaser.Scene,
  cls: MercClass,
  x: number,
  y: number,
  opts: { enemy?: boolean; scale?: number } = {}
): Phaser.GameObjects.Container {
  const px = opts.scale ?? 4;
  const shadow = scene.add.ellipse(18, 39, 34, 11, 0x11110f, 0.35);
  const g = scene.add.graphics();
  paint(g, humanoidPixels(cls, opts.enemy), px);
  const c = scene.add.container(x, y, [shadow, g]);
  c.setSize(9 * px, 10 * px);
  return c;
}

export function createPixelWolf(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 4
): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(20, 31, 40, 10, 0x11110f, 0.3);
  const g = scene.add.graphics();
  paint(g, [
    [1,3,0x5f6567,6,3],[0,4,0x4b5052,2,2],[6,2,0x6c7375,3,3],
    [7,1,0x44494b,1,1],[9,2,0x272b2d,1,1],[7,4,0xd2d0c5,1,1],
    [2,6,0x3c4143,1,2],[5,6,0x3c4143,1,2],[7,6,0x3c4143,1,2],
    [0,2,0x44494b,1,2]
  ], scale);
  return scene.add.container(x, y, [shadow, g]).setSize(10 * scale, 8 * scale);
}

export function createPixelParty(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y);
  const a = createPixelHumanoid(scene, 'Swordsman', -28, 2, { scale: 3 });
  const b = createPixelHumanoid(scene, 'Ranger', 8, -10, { scale: 3 });
  const c = createPixelHumanoid(scene, 'Warrior', 28, 6, { scale: 3 });
  const bannerG = scene.add.graphics();
  bannerG.fillStyle(0x513a25).fillRect(-2, -54, 4, 50);
  bannerG.fillStyle(0xc59b42).fillRect(2, -52, 22, 14);
  bannerG.fillStyle(0x8d3030).fillRect(2, -38, 16, 6);
  root.add([a, b, c, bannerG]);
  return root.setSize(80, 70);
}

export function createPixelEnemy(
  scene: Phaser.Scene,
  kind: 'bandit' | 'wolf' | 'raider',
  x: number,
  y: number,
  strength = 1
): Phaser.GameObjects.Container {
  if (kind === 'wolf') return createPixelWolf(scene, x, y, 4);
  const cls: MercClass = kind === 'raider' ? 'Warrior' : 'Rogue';
  const c = createPixelHumanoid(scene, cls, x, y, { enemy: true, scale: 4 });
  if (strength > 1) {
    const badge = scene.add.text(18, -15, '★'.repeat(Math.min(3, strength)), {
      fontFamily: 'monospace', fontSize: '10px', color: '#f4c65d'
    }).setOrigin(0.5);
    c.add(badge);
  }
  return c;
}

export function createPixelLocation(
  scene: Phaser.Scene,
  type: 'town' | 'poi' | 'hostile',
  id: string,
  x: number,
  y: number
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const s = 4;
  const P = (pixels: Pixel[]) => paint(g, pixels, s);

  if (type === 'town') {
    P([
      [1,4,0x72513a,10,5],[0,3,0x8a392f,6,2],[6,2,0x9d4438,6,3],
      [2,1,0xc17a44,3,2],[8,0,0xc17a44,3,3],
      [2,6,0xd0a35f,2,2],[7,5,0x5c3526,2,4],[10,6,0xd0a35f,1,2],
      [0,9,0x3e3428,12,1]
    ]);
  } else if (id.includes('mine')) {
    P([
      [0,6,0x52483e,12,3],[1,4,0x6b5b49,10,2],[3,2,0x776652,6,2],
      [4,5,0x17191a,4,4],[3,4,0x9a805f,1,5],[8,4,0x9a805f,1,5],
      [2,3,0x9a805f,8,1]
    ]);
  } else if (id.includes('mill')) {
    P([
      [3,4,0xb38a59,6,6],[4,2,0x7b4735,4,2],[5,6,0x5b382c,2,4],
      [6,-1,0xd8c08c,1,6],[3,1,0xd8c08c,7,1],[4,0,0xd8c08c,1,2],[8,0,0xd8c08c,1,2]
    ]);
  } else if (type === 'hostile') {
    P([
      [1,7,0x3a2a21,10,2],[2,4,0x6e3b2f,8,3],[0,3,0x4b3328,2,5],[10,3,0x4b3328,2,5],
      [4,2,0x8f4336,4,2],[5,0,0x8f4336,2,2],[5,5,0x1f1d1b,2,4],
      [0,2,0xc3a05a,1,2],[11,2,0xc3a05a,1,2]
    ]);
  } else {
    P([
      [2,7,0x5a5d55,8,2],[3,5,0x70746a,6,2],[4,3,0x85897b,4,2],
      [5,1,0xa6aa99,2,2],[1,8,0x3d4633,10,1]
    ]);
  }

  return scene.add.container(x, y, [g]).setSize(48, 44);
}

export function drawPixelTerrain(scene: Phaser.Scene, width: number, height: number, mode: 'world' | 'battle'): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const tile = mode === 'world' ? 32 : 24;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      let color = 0x4e673d;
      if (mode === 'world') {
        if (x > 2350) color = ((x + y) / tile) % 2 === 0 ? 0x71808a : 0x687681;
        else if (x > 1700) color = ((x + y) / tile) % 2 === 0 ? 0x766746 : 0x6d5f41;
        else color = ((x + y) / tile) % 2 === 0 ? 0x526c40 : 0x4b653b;
      } else {
        color = ((x / tile + y / tile) % 2 === 0) ? 0x485839 : 0x435334;
      }
      g.fillStyle(color).fillRect(x, y, tile, tile);
      if (((x / tile) * 7 + (y / tile) * 11) % 13 === 0) {
        g.fillStyle(mode === 'world' ? 0x3f5634 : 0x35452c).fillRect(x + 6, y + 9, 4, 6);
        g.fillRect(x + 12, y + 7, 3, 7);
      }
    }
  }
  return g;
}

export function drawPixelTree(scene: Phaser.Scene, x: number, y: number, scale = 4): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  paint(g, [
    [3,0,0x31502e,3,2],[2,2,0x31502e,5,2],[1,4,0x3a6135,7,2],
    [0,6,0x31502e,9,2],[3,8,0x65462d,2,3],[2,11,0x4b3929,4,1]
  ], scale);
  return scene.add.container(x, y, [g]);
}

export function drawPixelRock(scene: Phaser.Scene, x: number, y: number, scale = 4): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  paint(g, [
    [2,1,0x73756f,4,1],[1,2,0x777a73,6,2],[0,4,0x62655f,8,2],
    [1,6,0x50534e,6,1],[5,2,0x8c8e86,1,2]
  ], scale);
  return scene.add.container(x, y, [g]);
}
