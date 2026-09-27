import Phaser from 'phaser';
import type { ActorKind } from './animatedSprites';
import { tileAt, WORLD_TILE_SIZE, type WorldBuilding, type WorldDirection, type WorldMap, type WorldTile } from './worldMap';

const SIZE = 20;
const grasses = ['#81ac58', '#afa16c', '#bdcdb8'];
const shades = ['#739d4d', '#a19260', '#adbfab'];
function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) { c.fillStyle = color; c.fillRect(x,y,w,h); }
function tileKey(t: WorldTile, x: number, y: number, map: WorldMap): string {
  const waterEdges = t.ground === 'water' ? [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => { const n=tileAt(map,{col:x+dx,row:y+dy}); return n && n.ground !== 'water' && n.ground !== 'bridge' ? '1' : '0'; }).join('') : '0000';
  return `${t.region}:${t.ground}:${t.obstacle ?? ''}:${(x*7+y*11)%3}:${waterEdges}`;
}
function drawTile(c: CanvasRenderingContext2D, key: string) {
  const [regionText, ground, obstacle, variantText, edges] = key.split(':');
  const region=Number(regionText), variant=Number(variantText), grass=grasses[region], shade=shades[region];
  rect(c,0,0,20,20,grass);
  for(let i=0;i<5;i++) rect(c,(i*7+variant*3)%19,(i*11+variant*5)%19,1,1,shade);
  if(ground==='path'||ground==='square') {
    rect(c,0,0,20,20,ground==='path'?'#d7bf83':'#bfb58c');
    if(ground==='square') { rect(c,0,0,20,1,'#a49e78'); rect(c,0,10,20,1,'#a49e78'); rect(c,10,0,1,10,'#a49e78'); rect(c,3,10,1,10,'#a49e78'); }
    else { rect(c,3+variant*4,5,2,1,'#bda570');rect(c,11,14-variant*3,2,1,'#bda570');rect(c,6,17,1,1,'#e9d8a0'); }
  }
  if(ground==='tallgrass') {
    for(let y=4;y<20;y+=6) for(let x=3;x<20;x+=5) { rect(c,x,y,3,4,shade);rect(c,x-1,y-1,1,3,'#547f42');rect(c,x+2,y-2,1,4,'#abc47b'); }
  }
  if(ground==='water'||ground==='bridge') {
    rect(c,0,0,20,20,'#5999ac');rect(c,0,1,20,3,'#66a8b7');rect(c,2+variant,7,6,1,'#9accce');rect(c,11,14,7,1,'#83bdc7');rect(c,0,19,20,1,'#4b8f9f');
    if(ground==='water') {
      if(edges[0]==='1'){rect(c,0,0,20,3,grass);rect(c,0,3,20,1,'#3f7180');}
      if(edges[1]==='1'){rect(c,17,0,3,20,grass);rect(c,16,0,1,20,'#3f7180');}
      if(edges[2]==='1'){rect(c,0,17,20,3,grass);rect(c,0,16,20,1,'#3f7180');}
      if(edges[3]==='1'){rect(c,0,0,3,20,grass);rect(c,3,0,1,20,'#3f7180');}
    } else {
      rect(c,0,0,20,20,'#634e33');for(let x=0;x<20;x+=5){rect(c,x+1,1,4,18,'#b4945b');rect(c,x+1,2,3,1,'#d5b77b');rect(c,x+2,14,1,3,'#8e6c3e');}rect(c,0,0,20,2,'#d1af70');rect(c,0,18,20,2,'#8e7045');
    }
  }
  if(obstacle==='tree') {
    rect(c,7,15,7,4,'#536b3b');rect(c,9,12,3,7,'#82613c');
    const leaf=region===2?'#718f77':'#3f7643', light=region===2?'#e0e6cd':'#75a85a';
    rect(c,5,1,11,3,'#345d38');rect(c,2,4,17,8,'#345d38');rect(c,4,12,13,4,'#345d38');rect(c,5,2,10,3,leaf);rect(c,3,5,14,6,leaf);rect(c,6,12,9,3,leaf);rect(c,5,4,9,3,light);rect(c,3,7,4,3,light);rect(c,11,10,5,2,'#598b4b');
  }
  if(obstacle==='rock'||obstacle==='cliff') {
    rect(c,2,8,16,9,'#686c59');rect(c,4,4,12,12,'#8d9277');rect(c,6,2,8,3,'#b8b496');rect(c,3,8,3,5,'#b5b293');rect(c,12,8,5,6,'#777d63');rect(c,5,17,11,2,shade);
  }
  if(obstacle==='fence') {rect(c,2,4,3,15,'#8b6e42');rect(c,15,4,3,15,'#8b6e42');rect(c,0,7,20,3,'#c2a16a');rect(c,0,13,20,3,'#b08c53');}
}

export function drawWorldTiles(scene: Phaser.Scene, world: WorldMap): Phaser.Tilemaps.TilemapLayer {
  const keys: string[]=[], indices=new Map<string,number>();
  const data=world.tiles.map((row,y)=>row.map((t,x)=>{const key=tileKey(t,x,y,world);if(!indices.has(key)){indices.set(key,keys.length);keys.push(key);}return indices.get(key)!;}));
  const key='frontier-tile-atlas';
  if(!scene.textures.exists(key)) {
    const canvas=document.createElement('canvas');canvas.width=16*SIZE;canvas.height=Math.ceil(keys.length/16)*SIZE;
    const c=canvas.getContext('2d')!;
    keys.forEach((tile,i)=>{c.save();c.translate(i%16*SIZE,Math.floor(i/16)*SIZE);drawTile(c,tile);c.restore();});
    scene.textures.addCanvas(key,canvas);
  }
  const map=scene.make.tilemap({data,tileWidth:SIZE,tileHeight:SIZE});
  const set=map.addTilesetImage(key,key,SIZE,SIZE,0,0)!;
  const layer=map.createLayer(0,set,0,0)!.setScale(WORLD_TILE_SIZE/SIZE).setDepth(-20);
  return layer;
}

export function createWorldBuilding(scene: Phaser.Scene, b: WorldBuilding): Phaser.GameObjects.Image {
  const key=`world-building-${b.kind}-${b.width}-${b.height}-${b.region}`;
  if(!scene.textures.exists(key)) {
    const w=b.width*SIZE,h=b.height*SIZE,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const c=canvas.getContext('2d')!;
    if(b.kind==='mine'||b.kind==='ruin') {
      rect(c,4,13,w-8,h-14,'#737d68');rect(c,8,7,w-16,7,'#8c927a');rect(c,13,2,w-26,6,'#b1b19a');
      for(let y=16;y<h;y+=8)for(let x=5;x<w-5;x+=12) {rect(c,x+(y%16?3:0),y,10,1,'#a0a68c');rect(c,x,y,1,7,'#565f54');}
      rect(c,w/2-10,h-28,20,28,'#253b39');rect(c,w/2-13,h-31,26,4,b.kind==='mine'?'#b18b52':'#d1c59c');rect(c,w/2-13,h-27,3,27,'#9c8458');rect(c,w/2+10,h-27,3,27,'#9c8458');
      if(b.kind==='mine'){rect(c,w/2-7,h-6,2,6,'#aea78a');rect(c,w/2+5,h-6,2,6,'#aea78a');}
    } else {
      const roof=b.region===2?'#87a19f':b.kind==='mill'?'#8b6950':'#ad5e48';
      rect(c,4,19,w-8,h-21,'#decba0');rect(c,4,h-9,w-8,7,'#9c8560');
      rect(c,2,11,w-4,11,roof);rect(c,6,5,w-12,7,roof);rect(c,11,1,w-22,5,roof);
      for(let y=5;y<22;y+=5){rect(c,4,y,w-8,1,'#7c4e3e');for(let x=6;x<w-5;x+=9)rect(c,x+(y%2?0:4),y,1,5,'#ca8d64');}
      rect(c,1,21,w-2,3,'#5c503a');rect(c,5,24,3,h-26,'#92744f');rect(c,w-8,24,3,h-26,'#92744f');rect(c,6,h-2,w-12,2,'#554e38');
      rect(c,w/2-6,h-20,12,20,'#6d553a');rect(c,w/2-4,h-18,8,18,'#344744');rect(c,w/2+2,h-9,1,1,'#e3c778');
      for(const x of [13,w-24]){rect(c,x,29,11,12,'#866d48');rect(c,x+1,30,9,9,'#8fc3bc');rect(c,x+5,30,1,10,'#e3d09b');rect(c,x+1,34,9,1,'#e3d09b');rect(c,x-1,41,13,2,'#f1dbaa');}
      if(b.kind==='town'){rect(c,w/2-15,26,30,9,'#e5d7aa');rect(c,w/2-13,28,26,5,'#806545');}
      if(b.kind==='mill'){rect(c,w/2-1,0,2,25,'#e9d8ae');rect(c,w/2-14,11,29,3,'#e9d8ae');rect(c,w/2-12,8,6,8,'#c1b183');rect(c,w/2+7,8,6,8,'#c1b183');}
    }
    scene.textures.addCanvas(key,canvas);
  }
  return scene.add.image(b.col*WORLD_TILE_SIZE,b.row*WORLD_TILE_SIZE,key).setOrigin(0).setScale(2).setDepth((b.row+b.height)*WORLD_TILE_SIZE-2);
}

const colors: Record<ActorKind,string>={swordsman:'#4c80ae',warrior:'#b25e46',ranger:'#679a4f',spearman:'#9277a7',rogue:'#69717f',bandit:'#a55547',raider:'#9f4d3e',wolf:'#829796'};
const directions:WorldDirection[]=['down','left','right','up'];
export function createWorldActor(scene: Phaser.Scene,kind: ActorKind,x: number,y: number): Phaser.GameObjects.Sprite {
  const key=`world-actor-${kind}`;
  if(!scene.textures.exists(key)) {
    const canvas=document.createElement('canvas');canvas.width=24*4;canvas.height=32*4;const c=canvas.getContext('2d')!;
    directions.forEach((dir,row)=>{for(let frame=0;frame<4;frame++){
      c.save();c.translate(frame*24,row*32);const bob=frame%2,leg=frame===1?1:frame===3?-1:0;
      rect(c,5,27,14,3,'#28473955');
      if(kind==='wolf') {rect(c,5,14+bob,14,11,'#405955');rect(c,7,14+bob,10,10,colors[kind]);rect(c,6,11+bob,4,6,'#405955');rect(c,15,11+bob,4,6,'#405955');rect(c,7,25,3,3+leg,'#405955');rect(c,14,25,3,3-leg,'#405955');if(dir!=='up'){rect(c,8,17+bob,2,2,'#edc879');rect(c,15,17+bob,2,2,'#edc879');} }
      else {
        rect(c,6,14+bob,13,10,'#354138');rect(c,7,15+bob,11,9,colors[kind]);rect(c,4,16+bob,3,8,'#c59060');rect(c,18,16+bob,3,8,'#c59060');
        rect(c,7,23,4,5+leg,'#3b4142');rect(c,14,23,4,5-leg,'#3b4142');rect(c,6,27+leg,5,2,'#59442e');rect(c,14,27-leg,5,2,'#59442e');
        rect(c,6,3+bob,13,12,'#604530');rect(c,7,6+bob,11,8,dir==='up'?'#725334':'#dfa879');rect(c,6,3+bob,13,4,'#604530');rect(c,5,6+bob,3,5,'#604530');
        if(dir==='down'){rect(c,9,9+bob,1,2,'#263b35');rect(c,15,9+bob,1,2,'#263b35');rect(c,8,15+bob,3,6,'#b2c4a2');}
        if(dir==='left'){rect(c,5,9+bob,3,4,'#dfa879');rect(c,8,8+bob,1,2,'#263b35');}
        if(dir==='right'){rect(c,18,9+bob,3,4,'#dfa879');rect(c,16,8+bob,1,2,'#263b35');}
        if(dir==='up'){rect(c,8,16+bob,9,7,'#876a44');rect(c,10,17+bob,5,3,'#b59964');}
        rect(c,7,23+bob,11,2,'#947343');
      }
      c.restore();
    }});
    const texture = scene.textures.addCanvas(key, canvas)!;
    for (let row=0; row<4; row++) for (let frame=0; frame<4; frame++) texture.add(row*4+frame, 0, frame*24, row*32, 24, 32);
  }
  return scene.add.sprite(x,y,key,0).setOrigin(.5,.875).setScale(1.35).setData('worldDirection','down');
}
export function poseWorldActor(actor: Phaser.GameObjects.Sprite,dir: WorldDirection,moving: boolean,time=0): void {
  actor.setData('worldDirection',dir).setFrame(directions.indexOf(dir)*4+(moving?Math.floor(time/90)%4:0));
}
