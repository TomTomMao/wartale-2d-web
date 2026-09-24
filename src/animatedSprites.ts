import Phaser from 'phaser';
import type { MercClass } from './types';

export type ActorKind = Lowercase<MercClass> | 'bandit' | 'raider' | 'wolf';
export type ActorAction = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';

const actions: ActorAction[] = ['idle','walk','attack','hurt','death'];
const kinds: ActorKind[] = ['swordsman','warrior','ranger','spearman','rogue','bandit','raider','wolf'];
const framesPerAction = 6;
const frameSize = 48;

const palette: Record<Exclude<ActorKind,'wolf'>, string[]> = {
  swordsman:['#355f8f','#8db5d6','#1b2638','#5a3829','#d99a68','#3a241c','#d7dee3','#788690','#d6b15b'],
  warrior:['#8b3f32','#d1704c','#351f1d','#5b3527','#cc8e61','#2b1e19','#c8c1b8','#6e6a66','#c49a45'],
  ranger:['#416c43','#8dad62','#1c3020','#604226','#d4a174','#513224','#b9c1b7','#6a746b','#c59b59'],
  spearman:['#65527e','#ad8bc2','#292138','#5a3928','#d69b6c','#35241f','#d0d9df','#6f7b86','#c5a257'],
  rogue:['#3d454f','#7c8793','#1c2126','#4f372c','#c98b60','#211c1b','#c9d0d4','#6c747b','#9a7546'],
  bandit:['#713833','#a9574a','#28191b','#5a3325','#bf8058','#2a1d19','#b8bec1','#646d72','#c18e47'],
  raider:['#6e3129','#b45c42','#291816','#4e2d21','#b97854','#201615','#9fa8ad','#515b61','#d3a041']
};

function rect(ctx: CanvasRenderingContext2D,x:number,y:number,w:number,h:number,c:string){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function line(ctx: CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,c:string,w=2){ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}

function drawHumanoid(ctx:CanvasRenderingContext2D, kind:Exclude<ActorKind,'wolf'>, action:ActorAction, f:number){
  const [primary,secondary,dark,leather,skin,hair,metal,metal2,accent]=palette[kind];
  ctx.clearRect(0,0,frameSize,frameSize);
  const bob=action==='idle'?[0,0,-1,-1,0,0][f]:action==='walk'?[0,-1,0,1,0,-1][f]:0;
  const leg=action==='walk'?[-2,-1,1,2,1,-1][f]:0;
  const tilt=action==='attack'?[0,0,1,2,1,0][f]:action==='hurt'?[-1,-2,-2,-1,0,0][f]:0;
  if(action==='death' && f>=2){
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(25,40,14,3,0,0,Math.PI*2);ctx.fill();
    rect(ctx,11,34,23,3,dark);rect(ctx,14,28,15,7,primary);rect(ctx,29,29,7,5,skin);rect(ctx,7,31,8,3,leather);rect(ctx,35,32,8,2,metal2);
    if(f>=4) rect(ctx,36,26,3,2,'#8f2f2f');
    return;
  }
  const cx=23+tilt;
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(cx,40,12,3,0,0,Math.PI*2);ctx.fill();
  rect(ctx,cx-8,17+bob,15,16,dark);rect(ctx,cx-9,22+bob,3,11,dark);
  const l1=cx-5+leg,l2=cx+2-leg;
  for(const lx of [l1,l2]){rect(ctx,lx,31+bob,5,8,dark);rect(ctx,lx+1,31+bob,3,5,primary);rect(ctx,lx-1,37+bob,6,3,leather);rect(ctx,lx,39+bob,6,2,dark);}
  rect(ctx,cx-8,17+bob,17,15,dark);rect(ctx,cx-6,18+bob,13,13,primary);rect(ctx,cx-5,19+bob,3,11,secondary);rect(ctx,cx+4,19+bob,2,10,dark);
  rect(ctx,cx-6,28+bob,13,3,leather);rect(ctx,cx,28+bob,2,3,accent);
  rect(ctx,cx-5,8+bob,11,10,dark);rect(ctx,cx-4,9+bob,9,8,skin);rect(ctx,cx-5,8+bob,10,4,hair);rect(ctx,cx-4,12+bob,2,2,hair);rect(ctx,cx+3,11+bob,2,3,'#eab17c');rect(ctx,cx+4,12+bob,1,1,'#171412');
  rect(ctx,cx-10,20+bob,4,11,dark);rect(ctx,cx-9,21+bob,3,8,primary);rect(ctx,cx-9,28+bob,3,3,skin);

  if(action==='attack'){
    const poses=[[[cx+7,19],[cx+12,16],[cx+15,8]],[[cx+7,19],[cx+13,15],[cx+21,10]],[[cx+7,20],[cx+14,19],[cx+25,19]],[[cx+7,21],[cx+13,24],[cx+23,30]],[[cx+7,20],[cx+12,22],[cx+18,27]],[[cx+7,19],[cx+11,20],[cx+15,20]]];
    const [hand,grip,tip]=poses[f];
    line(ctx,hand[0],hand[1],grip[0],grip[1],skin,4);
    if(kind==='ranger'){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx+17,20,10,-1.15,1.15);ctx.stroke();line(ctx,cx+12,20,cx+31,20,metal,2);}
    else if(kind==='spearman'){line(ctx,grip[0],grip[1],cx+39,19+Math.floor(f/2),leather,3);ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(cx+39,16);ctx.lineTo(cx+46,19);ctx.lineTo(cx+39,22);ctx.fill();}
    else if(kind==='warrior'||kind==='raider'){line(ctx,grip[0],grip[1],tip[0],tip[1],leather,3);rect(ctx,tip[0]-3,tip[1]-3,8,5,metal2);rect(ctx,tip[0]-1,tip[1]-4,4,2,metal);}
    else {line(ctx,grip[0],grip[1],tip[0],tip[1],metal,3);rect(ctx,tip[0]-1,tip[1]-2,4,3,metal);}
  } else {
    rect(ctx,cx+7,20+bob,4,10,dark);rect(ctx,cx+7,21+bob,3,7,primary);rect(ctx,cx+7,28+bob,3,3,skin);
    if(kind==='swordsman'){rect(ctx,cx+10,19+bob,2,15,metal2);rect(ctx,cx+11,17+bob,1,16,metal);rect(ctx,cx+8,25+bob,6,2,accent);}
    else if(kind==='warrior'||kind==='raider'){rect(ctx,cx+11,17+bob,2,17,leather);rect(ctx,cx+8,15+bob,8,5,metal2);rect(ctx,cx+10,14+bob,4,2,metal);}
    else if(kind==='ranger'){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx+14,24+bob,8,-1.2,1.2);ctx.stroke();}
    else if(kind==='spearman'){rect(ctx,cx+13,7+bob,2,30,leather);ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(cx+11,8+bob);ctx.lineTo(cx+15,2+bob);ctx.lineTo(cx+17,8+bob);ctx.fill();}
    else {rect(ctx,cx+10,22+bob,7,2,metal);rect(ctx,cx+15,21+bob,3,4,metal2);}
  }
  if(action==='hurt'){rect(ctx,cx+8,14+bob,3,2,'#c83b3b');rect(ctx,cx+11,12+bob,2,2,'#e77a5e');}
}

function drawWolf(ctx:CanvasRenderingContext2D,action:ActorAction,f:number){
  ctx.clearRect(0,0,48,48);
  const o='#23282b',fur='#687176',li='#929b9d',dk='#454d50',eye='#e7b856';
  if(action==='death'&&f>=2){ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(24,40,14,3,0,0,Math.PI*2);ctx.fill();rect(ctx,10,34,25,5,o);rect(ctx,12,31,19,6,fur);rect(ctx,31,32,8,5,dk);return;}
  const bob=action==='idle'?[0,0,-1,-1,0,0][f]:action==='walk'?[0,-1,0,1,0,-1][f]:0;
  const leg=action==='walk'?[-2,-1,1,2,1,-1][f]:0;
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(23,39,14,3,0,0,Math.PI*2);ctx.fill();
  line(ctx,12,26+bob,4,18+bob,o,5);line(ctx,12,26+bob,4,18+bob,fur,3);
  rect(ctx,11,21+bob,22,12,o);rect(ctx,12,22+bob,20,10,fur);rect(ctx,14,23+bob,7,4,li);
  for(const lx of [13+leg,27-leg]){rect(ctx,lx,31+bob,5,8,o);rect(ctx,lx+1,31+bob,3,7,dk);}
  rect(ctx,29,18+bob,8,13,o);rect(ctx,30,19+bob,7,11,fur);rect(ctx,34,16+bob,10,9,o);rect(ctx,35,17+bob,8,7,fur);
  ctx.fillStyle=o;ctx.beginPath();ctx.moveTo(35,17+bob);ctx.lineTo(37,11+bob);ctx.lineTo(39,17+bob);ctx.fill();ctx.beginPath();ctx.moveTo(40,17+bob);ctx.lineTo(42,12+bob);ctx.lineTo(43,19+bob);ctx.fill();
  rect(ctx,42,20+bob,5,4,dk);rect(ctx,46,21+bob,2,2,o);rect(ctx,40,19+bob,1,1,eye);
  if(action==='attack') rect(ctx,42+[0,2,5,8,4,0][f],24+bob,5,2,'#e8e4d5');
  if(action==='hurt') rect(ctx,33,16+bob,3,2,'#a53633');
}

export function ensureActorAnimations(scene:Phaser.Scene){
  if(scene.textures.exists('swordsman-idle-0')) return;
  for(const kind of kinds){
    for(const action of actions){
      for(let f=0;f<framesPerAction;f++){
        const key=`${kind}-${action}-${f}`;
        const tex=scene.textures.createCanvas(key,frameSize,frameSize);
        const ctx=tex!.getContext();
        if(kind==='wolf') drawWolf(ctx,action,f); else drawHumanoid(ctx,kind as Exclude<ActorKind,'wolf'>,action,f);
        tex!.refresh();
      }
      const key=`${kind}-${action}`;
      scene.anims.create({key,frames:Array.from({length:framesPerAction},(_,i)=>({key:`${kind}-${action}-${i}`})),frameRate:action==='attack'?14:action==='walk'?10:7,repeat:action==='idle'||action==='walk'?-1:0});
    }
  }
}

export function classToKind(cls:MercClass):ActorKind{return cls.toLowerCase() as ActorKind;}

const portraits = new Map<string, string>();
export function actorPortrait(className: string): string {
  const kind = className.toLowerCase() as ActorKind;
  if (portraits.has(kind)) return portraits.get(kind)!;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = frameSize;
  const context = canvas.getContext('2d')!;
  if (kind === 'wolf') drawWolf(context, 'idle', 0);
  else drawHumanoid(context, kinds.includes(kind) ? kind as Exclude<ActorKind, 'wolf'> : 'swordsman', 'idle', 0);
  const data = canvas.toDataURL();
  portraits.set(kind, data);
  return data;
}

export function createActor(scene:Phaser.Scene,kind:ActorKind,x=0,y=0,scale=1.4){
  ensureActorAnimations(scene);
  const sprite=scene.add.sprite(x,y,`${kind}-idle-0`).setScale(scale).setOrigin(.5,.78);
  sprite.play(`${kind}-idle`);
  sprite.setData('actorKind',kind);
  return sprite;
}

export function playActor(sprite:Phaser.GameObjects.Sprite,action:ActorAction,returnToIdle=true){
  const kind=sprite.getData('actorKind') as ActorKind;
  sprite.play(`${kind}-${action}`,true);
  if(returnToIdle && action!=='death'){
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE,()=>sprite.play(`${kind}-idle`,true));
  }
}

export function setWalk(sprite:Phaser.GameObjects.Sprite,moving:boolean){
  const kind=sprite.getData('actorKind') as ActorKind;
  const desired=`${kind}-${moving?'walk':'idle'}`;
  if(sprite.anims.currentAnim?.key!==desired) sprite.play(desired,true);
}
