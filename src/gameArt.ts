// Native pixel art: no external image requests, and no extra live game canvases.
const scenes = new Map<string, string>();

export function sceneArt(kind: string): string {
  const key = kind.includes('tomb') ? 'tomb' : kind;
  if (scenes.has(key)) return scenes.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 240;
  const c = canvas.getContext('2d')!;
  let seed = 3917;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rect = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const poly = (points: number[][], color: string) => { c.fillStyle = color; c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); };
  const pine = (x: number, y: number, h: number, color: string) => {
    rect(x-2,y-5,4,12,'#4e4434');
    for (let j=0;j<3;j++) poly([[x,y-h+j*h*.23],[x-h*(.2+j*.06),y-h*.37+j*h*.2],[x+h*(.2+j*.06),y-h*.37+j*h*.2]],color);
  };
  const tent = (x: number, y: number, size: number) => {
    rect(x-5,y+2,size+12,5,'#172021');
    poly([[x,y],[x+size*.42,y-size*.65],[x+size,y-size*.57],[x+size*1.22,y]],'#87764b');
    poly([[x,y],[x+size*.42,y-size*.65],[x+size*.8,y]],'#baa674');
    poly([[x+size*.25,y],[x+size*.43,y-size*.49],[x+size*.58,y]],'#292825');
    rect(x+size*.4,y-size*.72,2,size*.74,'#b69d69');
    rect(x-7,y-2,3,8,'#8e7044'); rect(x+size*1.23,y-2,3,8,'#8e7044');
  };
  const fire = (x: number, y: number, scale=1) => {
    for(let j=0;j<8;j++) rect(x+Math.cos(j*.8)*13*scale,y+Math.sin(j*.8)*5*scale,6*scale,4*scale,'#67675a');
    rect(x-9*scale,y-1*scale,23*scale,4*scale,'#674126');
    poly([[x-7*scale,y],[x-10*scale,y-11*scale],[x-3*scale,y-23*scale],[x,y-15*scale],[x+6*scale,y-31*scale],[x+11*scale,y-12*scale],[x+7*scale,y]],'#c76b34');
    poly([[x-4*scale,y],[x-5*scale,y-10*scale],[x+2*scale,y-21*scale],[x+5*scale,y-5*scale],[x+4*scale,y]],'#f6c668');
    rect(x,y-8*scale,3*scale,7*scale,'#fff0b0');
  };
  const anvil = (x: number, y: number) => {
    rect(x-13,y+13,27,16,'#644a32'); rect(x-10,y+14,3,14,'#977145');
    poly([[x-23,y],[x+22,y],[x+16,y+7],[x+6,y+7],[x+6,y+13],[x+14,y+16],[x-12,y+16],[x-5,y+11],[x-5,y+6],[x-17,y+5]],'#505d61');
    rect(x-23,y,45,3,'#a0a8a0');
  };
  // Layered horizon and stepped silhouettes keep the scene legible at phone size.
  rect(0,0,480,240,'#202b38');
  for(let y=0;y<125;y+=5) rect(0,y,480,5,`rgb(${35+y*.35},${43+y*.28},${56+y*.17})`);
  rect(351,28,26,30,'#c9b88a'); rect(347,34,34,18,'#c9b88a');
  for(let i=0;i<40;i++) rect(rand()*480,rand()*65,1,1,'#b4b2a0');
  poly([[0,110],[45,57],[78,89],[116,49],[172,100],[222,64],[292,115],[360,68],[409,102],[452,77],[480,100],[480,160],[0,160]],'#414b50');
  poly([[0,121],[65,94],[130,133],[215,92],[283,125],[375,109],[480,140],[480,192],[0,192]],'#303e3f');
  rect(0,146,480,94,'#2b3731');
  for(let i=0;i<32;i++) pine(i*17-9,162+rand()*12,25+rand()*34,'#233230');
  poly([[202,147],[221,147],[265,170],[241,185],[328,215],[292,240],[247,240],[278,217],[210,190],[238,171]],'#526263');
  poly([[0,212],[76,184],[154,178],[230,195],[326,175],[480,190],[480,240],[0,240]],'#343a30');
  for(let i=0;i<280;i++) rect(rand()*480,180+rand()*60,2+Math.floor(rand()*5),1,rand()>.5?'#4c5037':'#262f2a');
  if (key === 'forge') {
    rect(0,0,480,240,'#292a2b');
    for(let y=0;y<170;y+=16) for(let x=-25;x<480;x+=44) { rect(x+(y%32?20:0),y,41,14,'#353536'); rect(x+(y%32?20:0),y,41,1,'#45413c'); }
    rect(0,175,480,65,'#423d35');
    for(let y=180;y<240;y+=13) rect(0,y,480,2,'#302f2b');
    rect(320,16,74,159,'#57514a'); rect(309,97,98,80,'#6f6150');
    rect(325,109,66,58,'#231f20'); rect(330,133,55,30,'#8b422c'); fire(356,161,1.5);
    rect(319,97,78,8,'#a28762');
    rect(25,136,131,9,'#91653d'); rect(30,145,8,57,'#574332'); rect(139,145,8,57,'#574332');
    rect(34,58,123,5,'#77573b');
    for(let x=48;x<152;x+=29) { rect(x,65,3,42,'#827056'); rect(x-7,70,17,8,'#889092'); rect(x-7,70,17,2,'#bdc0aa'); }
    rect(43,118,27,17,'#5b4730'); rect(42,123,29,3,'#9d875a');
    anvil(227,173); rect(185,192,82,8,'#292a27'); anvil(227,171);
    rect(426,137,31,47,'#654e32'); rect(423,141,37,4,'#9a8b61'); rect(423,169,37,4,'#9a8b61');
    for(let i=0;i<13;i++) rect(338+rand()*38,89+rand()*70,1,2,'#f3b968');
  } else if (key === 'camp' || key === 'frontier') {
    tent(key==='camp'?51:330,195,key==='camp'?87:66);
    if(key==='camp') { tent(167,164,47); anvil(392,180); rect(371,155,57,4,'#826343'); rect(376,159,4,32,'#705437'); rect(419,159,4,32,'#705437'); }
    fire(key==='camp'?251:388,210,1.15);
    rect(37,159,3,64,'#ab8750'); rect(40,161,25,29,'#813f38'); rect(42,165,18,2,'#cbb16f');
    for(let i=0;i<5;i++) { rect(294+i*5,210+i%2*3,17,5,'#705537'); rect(295+i*5,210+i%2*3,4,5,'#a28355'); }
    pine(15,224,91,'#182924'); pine(469,218,105,'#1c2c27');
    if(key==='frontier') { rect(64,130,46,56,'#5b6054'); rect(68,126,9,9,'#686c5c'); rect(89,123,10,12,'#686c5c'); rect(82,147,10,21,'#202d2a'); }
  } else if (key === 'town' || key === 'old-mill') {
    for(let j=0;j<(key==='town'?4:1);j++) {
      const x=45+j*100, y=177-j%2*19;
      rect(x,y-48,79,57,'#a59670'); poly([[x-8,y-46],[x+37,y-84],[x+87,y-46]],'#654338');
      for(let k=0;k<3;k++) rect(x+k*36,y-47,5,57,'#4e4032');
      rect(x+7,y-5,67,4,'#514430'); rect(x+29,y-24,19,33,'#352e28'); rect(x+7,y-31,13,17,'#ddb16a');
      rect(x+7,y-25,13,2,'#504532'); rect(x+57,y-31,13,17,'#e1b36b');
    }
    if(key==='old-mill') { rect(88,105,4,62,'#cfb888'); poly([[87,111],[48,73],[55,69],[92,106]],'#d7c497'); poly([[94,106],[128,68],[134,77],[97,116]],'#b49b6c'); poly([[91,114],[124,151],[117,155],[85,119]],'#d7c497'); }
    else { rect(275,189,68,5,'#936844'); poly([[267,171],[334,171],[346,188],[276,188]],'#915148'); rect(279,188,3,26,'#baa075'); rect(339,187,3,26,'#baa075'); }
  } else if(key === 'iron-mine') {
    poly([[128,181],[170,84],[216,63],[264,75],[298,119],[325,181]],'#68685c');
    poly([[179,187],[186,126],[222,106],[253,117],[278,187]],'#1b2626');
    rect(183,120,8,68,'#8b704c'); rect(263,120,8,68,'#8b704c'); rect(181,115,93,9,'#aa8959');
    poly([[203,178],[207,178],[168,240],[160,240]],'#95948a'); poly([[248,178],[252,178],[291,240],[283,240]],'#95948a');
    for(let y=185;y<240;y+=12) rect(192-(y-185)*.48,y,72+(y-185),3,'#6b5033');
    rect(302,170,35,24,'#5e4933'); rect(301,175,36,3,'#a99c78');
    rect(158,142,3,27,'#8c7750'); fire(160,145,.45);
  } else {
    // Ruins, garrisons and tomb entrances share the frontier's stonework.
    for(let j=0;j<4;j++) { const x=124+j*59; rect(x,98+j%2*12,20,97,'#68685c'); rect(x-5,93+j%2*12,30,9,'#91907a'); rect(x-5,190,30,7,'#8c8973'); for(let y=111;y<185;y+=19) rect(x,y,20,2,'#4b554e'); }
    rect(132,84,192,12,'#797968'); rect(211,112,48,85,'#172425'); rect(200,104,71,9,'#a19a7d');
    rect(156,179,5,26,'#705539'); fire(158,179,.55); rect(303,179,5,26,'#705539'); fire(305,179,.55);
    for(let i=0;i<12;i++) rect(111+rand()*251,198+rand()*24,8+Math.floor(rand()*15),5,'#6c6e5d');
    if(key !== 'tomb') { rect(362,137,3,69,'#aa925e'); rect(365,138,26,35,'#803e35'); }
  }
  const url = canvas.toDataURL(); scenes.set(key,url); return url;
}

/** Small deliberately chunky sprites for slots, resources and game commands. */
export function itemIcon(name: string): string {
  const n = name.toLowerCase();
  const shapes = /^(explore|eye)$/.test(n) ? '<path d="M16 2l4 9 10 5-10 4-4 10-4-10-10-4 10-5z" fill="#ac9563"/><path d="M16 5v22l-4-11z" fill="#e6d5a0"/><path d="M16 5l4 11-4 11z" fill="#b97753"/>'
    : /^(knowledge|scholar)$/.test(n) ? '<path d="M3 6h11l2 2 2-2h11v21H18l-2 2-2-2H3z" fill="#956c44"/><path d="M5 5h8l3 3 3-3h8v19h-8l-3 2-3-2H5z" fill="#d4c397"/><path d="M16 9v16M8 10h5m-5 5h5m-5 5h5m6-10h5m-5 5h5m-5 5h5" stroke="#8f7b53" stroke-width="1"/>'
    : n === 'save' ? '<path d="M5 6h22v22H5z" fill="#c0aa79"/><path d="M8 3h20v22H8z" fill="#e1cf9c"/><path d="M12 8h12v2H12zm0 5h9v2h-9z" fill="#9a8156"/><path d="M13 20h7v7h-7z" fill="#9a4e3d"/><path d="M24 2h4L18 16l-3 2 1-5z" fill="#e9e5c4"/>'
    : n === 'helmet' ? '<path d="M9 5h14v4h4v18h-8V16h-5v11H6V9h3z" fill="#7f9290"/><path d="M10 5h12v4H10zm-4 5h21v3H6z" fill="#c4c8ae"/><path d="M15 3h4v11h-4z" fill="#b29a65"/>'
    : n === 'accessory' ? '<path d="M10 7h12v4h5v13h-5v4H10v-4H5V11h5zm1 6v9h10v-9z" fill="#c7a664" fill-rule="evenodd"/><path d="M11 3h10v9H11z" fill="#81a5a2"/><path d="M13 3h5v4h-5z" fill="#c4d2b7"/>'
    : n === 'leather' ? '<path d="M8 3l6 3h5l6-3 3 7-5 4v10l4 3-7 3-5-3-8 2 2-6V13l-5-3z" fill="#a87f4c"/><path d="M13 9h7v14h-7z" fill="#c69c63"/>'
    : n === 'cloth' ? '<path d="M6 7h19v19H6z" fill="#ada98d"/><path d="M8 5h19v17H8z" fill="#ddd0a6"/><path d="M10 9h15v2H10zm0 6h15v2H10z" fill="#c0b18a"/>'
    : /bow/.test(n) ? '<path d="M11 4h5v3h4v5h3v8h-3v5h-4v3h-5v-3h4v-4h3V11h-3V7h-4z" fill="#b18b50"/><path d="M11 5v22M6 16h21" stroke="#e4d3a2" stroke-width="1"/>'
    : /axe|blacksmith|^forge$/.test(n) ? '<path d="M14 9h4v20h-4z" fill="#a07a49"/><path d="M5 4h19v4h4v8H17v-4H5z" fill="#a7b0ac"/><path d="M5 4h19v3H5z" fill="#e2dfc6"/>'
    : /armor|mail|leather|shield|guard|company/.test(n) ? '<path d="M6 6l7-3h6l7 3v8h-4v13H10V14H6z" fill="#7f9391"/><path d="M13 3h6v7h-6z" fill="#333f43"/><path d="M10 13h12v3H10zm0 9h12v3H10z" fill="#b89d66"/>'
    : /sword|dagger|spear|attack|target/.test(n) ? '<path d="M15 2h3l2 4v14h-7V6z" fill="#c4cbc2"/><path d="M15 4h2v16h-2z" fill="#f0e9ca"/><path d="M8 20h17v3H8zm7 3h4v6h-4z" fill="#b89b54"/>'
    : /coin|crown|gold/.test(n) ? '<path d="M9 5h14v3h4v16h-4v3H9v-3H5V8h4z" fill="#b98735"/><path d="M11 7h10v3h4v12h-4v3H11v-3H7V10h4z" fill="#e2b75d"/><path d="M14 11h5v3h-3v4h3v3h-5z" fill="#9a682e"/>'
    : /food|grain|cook|provision|meal|bread|meat/.test(n) ? '<path d="M7 10h5V7h12v3h4v15h-3v3H7v-3H4V13h3z" fill="#ba803f"/><path d="M8 11h16v3h3v8H7v-8h1z" fill="#e3b66b"/><path d="M12 12v7m6-9v8" stroke="#a36d3b" stroke-width="2"/>'
    : /camp|tent|rest/.test(n) ? '<path d="M16 4L2 27h28z" fill="#b4a16a"/><path d="M16 4v23h14z" fill="#7d714e"/><path d="M16 13l-6 14h12z" fill="#343b32"/><path d="M15 2h2v6h-2z" fill="#d8bc79"/>'
    : /potion|medicine|oil|herb|alchemy/.test(n) ? '<path d="M12 3h8v5h-8z" fill="#b28f62"/><path d="M11 8h10v6h4v13H7V14h4z" fill="#99b7a5"/><path d="M10 17h12v8H10z" fill="#6e9667"/><path d="M11 10h3v8h-3z" fill="#d7d9b5"/>'
    : /scroll|contract|knowledge|scholar|explor|eye|save/.test(n) ? '<path d="M7 4h21v5h-4v18H4v-5h4V9H4V4z" fill="#c3ad78"/><path d="M8 6h16v17H8z" fill="#e5d19e"/><path d="M11 10h10v2H11zm0 5h7v2h-7zm0 5h10v2H11z" fill="#8e7952"/>'
    : /iron|miner/.test(n) ? '<path d="M8 12h17l5 12H3z" fill="#819397"/><path d="M8 12h17l-6 6H5z" fill="#bac4bc"/><path d="M19 18l6-6 5 12H19z" fill="#5e7075"/>'
    : /wood|torch/.test(n) ? '<path d="M8 7h7v22H8zm10-4h7v23h-7z" fill="#9b7545"/><path d="M9 9h3v17H9zm10-3h3v17h-3z" fill="#ca9e5c"/>'
    : /heart/.test(n) ? '<path d="M4 7h8v4h7V7h9v13L16 29 4 20z" fill="#b96150"/><path d="M7 9h3v7H7z" fill="#e4a17c"/>'
    : '<path d="M10 5h13v5h4v16H6V10h4z" fill="#9f8151"/><path d="M8 13h17v8H8z" fill="#c9ad72"/><path d="M14 16h5v8h-5z" fill="#5c5541"/>';
  return `<svg class="pixel-icon" viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">${shapes}</svg>`;
}

export function sceneBanner(kind: string, caption = ''): string {
  return `<div class="scene-banner"><img class="scene-art" src="${sceneArt(kind)}" alt=""/>${caption ? `<span class="scene-caption">${caption}</span>` : ''}</div>`;
}
