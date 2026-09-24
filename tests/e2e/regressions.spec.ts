import { expect, test, type Page } from '@playwright/test';
import { cellKey, manhattan, reachableCells, worldToCell } from '../../src/battleGrid';
import type { GridLayout } from '../../src/battleGrid';

type Unit = {id:string;name:string;side:string;x:number;y:number;health:number;armor:number;moved:boolean;acted:boolean;visible:boolean};
type Snapshot = {grid:GridLayout;units:Unit[];obstacles:string[];phase:string;round:number;selectedUnitId:string;pointerListeners:number;wheelListeners:number};
const snapshot = (page:Page):Promise<Snapshot> => page.evaluate(() => (window as any).__GAME_TEST_API__.battleSnapshot());
const state = (page:Page) => page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
async function start(page:Page) {
  await page.goto('/');
  await page.getByRole('button',{name:'New Company',exact:true}).click();
  await page.getByRole('button',{name:'Begin Journey'}).click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
}
async function fight(page:Page) {
  await page.evaluate(() => (window as any).__GAME_TEST_API__.triggerEncounter('bandit-1'));
  await page.getByRole('button',{name:'Fight',exact:true}).click();
  await expect(page.getByTestId('battle-hud')).toHaveAttribute('data-phase','player');
}
async function stable(page:Page) {
  await page.waitForFunction(() => ['player','finished'].includes((window as any).__GAME_TEST_API__.battleSnapshot().phase));
}

test('menus pause the world and Escape cannot strand an encounter', async ({page}) => {
  await start(page);
  await page.getByRole('button',{name:'Company',exact:true}).click();
  const before = await state(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  const after = await state(page);
  expect(after.worldX).toBe(before.worldX);
  expect(after.enemies).toEqual(before.enemies);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inventory-panel')).toHaveCount(0);
  await page.evaluate(() => (window as any).__GAME_TEST_API__.triggerEncounter('bandit-1'));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('encounter-panel')).toBeVisible();
  await page.getByRole('button',{name:'Flee',exact:true}).click();
  await expect(page.getByTestId('world-hud')).toBeVisible();
  await expect(page.getByTestId('encounter-panel')).toHaveCount(0);
});

test('company names accept spaces and render as text', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'New Company',exact:true}).click();
  await page.locator('#company-name').fill('Iron');
  await page.locator('#company-name').press('End');
  await page.keyboard.press('Space');
  await page.keyboard.type('Wolves');
  await expect(page.locator('#company-name')).toHaveValue('Iron Wolves');
  await page.locator('#company-name').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button',{name:'Begin Journey'}).click();
  await expect(page.locator('.hud-title strong')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.hud-title img')).toHaveCount(0);
});

test('rapid movement and attack input is serialized', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await fight(page);
  const before = await snapshot(page);
  const mover = before.units.find(u=>u.name==='Alden')!;
  const startCell = worldToCell(before.grid,mover.x,mover.y)!;
  // This adjacent cell was previously covered by the oversized unit hitbox.
  const goal = {col:startCell.col+1,row:startCell.row};
  const x=before.grid.originX+(goal.col+.5)*before.grid.cellSize;
  const y=before.grid.originY+(goal.row+.5)*before.grid.cellSize;
  // Probe synchronously when the action locks. A second Playwright round trip can
  // arrive after the 95ms tween on a busy CI runner, when ending a turn is valid.
  await page.evaluate(() => {
    const probe = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type !== 'battleHud' || detail.phase !== 'resolving') return;
      window.removeEventListener('ironbound:ui', probe);
      const end = document.querySelector<HTMLButtonElement>('[data-action="end-unit"]')!;
      const disabled = end.disabled;
      end.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const battle = (window as any).__GAME_TEST_API__.battleSnapshot();
      (window as any).__ACTION_LOCK_PROBE__ = { disabled, phase: battle.phase };
    };
    window.addEventListener('ironbound:ui', probe);
  });
  await page.mouse.click(x,y);
  await stable(page);
  expect(await page.evaluate(() => (window as any).__ACTION_LOCK_PROBE__)).toEqual({ disabled: true, phase: 'resolving' });
  const moved=(await snapshot(page)).units.find(u=>u.id===mover.id)!;
  expect(worldToCell(before.grid,moved.x,moved.y)).toEqual(goal);
  expect(moved.acted).toBe(false);
  await page.getByRole('button',{name:'Select Mira'}).click();
  const enemy=(await snapshot(page)).units.find(u=>u.side==='enemy')!;
  await page.mouse.dblclick(enemy.x,enemy.y,{delay:10});
  await stable(page);
  const hit=await snapshot(page);
  expect(hit.units.find(u=>u.name==='Mira')!.acted).toBe(true);
  const victim=hit.units.find(u=>u.id===enemy.id)!;
  expect(victim.health + victim.armor).toBeLessThan(enemy.health + enemy.armor);
  expect(victim.health).toBeGreaterThan(0);
  expect(hit.units.filter(u=>u.side==='player' && u.acted)).toHaveLength(1);
  await page.getByRole('button',{name:'Select Alden'}).click();
  // A normal ranged action and a double click above must leave no dangling callbacks.
  expect(errors).toEqual([]);
});

test('mobile rotation preserves occupied cells and keeps controls outside the board', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await start(page); await fight(page);
  const before=await snapshot(page);
  const positions=before.units.map(u=>worldToCell(before.grid,u.x,u.y));
  await page.setViewportSize({width:844,height:390});
  await expect.poll(async()=>(await snapshot(page)).grid.cellSize).toBeLessThan(before.grid.cellSize);
  const after=await snapshot(page);
  expect(after.units.map(u=>worldToCell(after.grid,u.x,u.y))).toEqual(positions);
  const controls=await page.locator('.battle-command').boundingBox();
  expect(after.grid.originY+after.grid.rows*after.grid.cellSize).toBeLessThan(controls!.y);
  await expect(page.getByRole('button',{name:/End Unit/})).toBeInViewport();
  await page.screenshot({path:'test-results/battle-landscape.png'});
});

test('a full tactical battle awards loot and XP once, then remains playable after reload', async ({page}) => {
  test.setTimeout(90_000);
  // Deterministic damage while still playing through real movement and attack inputs.
  await page.addInitScript(()=>{let seed=42; Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await page.getByRole('button',{name:'Contracts',exact:true}).click();
  await page.getByRole('button',{name:'Accept',exact:true}).click();
  await page.getByRole('button',{name:'×'}).click();
  const before=await state(page);
  await fight(page);
  for(let action=0;action<60;action++){
    await stable(page);
    let battle=await snapshot(page);
    if(battle.phase==='finished')break;
    let unit=battle.units.find(u=>u.id===battle.selectedUnitId)!;
    const merc=before.mercenaries.find((m:any)=>m.name===unit.name);
    const range=merc.class==='Ranger'?5:merc.class==='Spearman'?2:1;
    let origin=worldToCell(battle.grid,unit.x,unit.y)!;
    const enemies=battle.units.filter(u=>u.side==='enemy'&&u.health>0);
    let target=enemies.find(e=>manhattan(origin,worldToCell(battle.grid,e.x,e.y)!)<=range);
    if(!target&&!unit.moved){
      const blocked=new Set([...battle.obstacles,...battle.units.filter(u=>u.id!==unit.id&&u.health>0).map(u=>cellKey(worldToCell(battle.grid,u.x,u.y)!))]);
      const reachable=reachableCells(battle.grid,origin,Math.max(2,Math.min(6,Math.round(merc.movement/55))),blocked);
      const choices=[...reachable.keys()].map(k=>{const [col,row]=k.split(',').map(Number);return {col,row};})
        .sort((a,b)=>Math.min(...enemies.map(e=>manhattan(a,worldToCell(battle.grid,e.x,e.y)!)))-Math.min(...enemies.map(e=>manhattan(b,worldToCell(battle.grid,e.x,e.y)!))));
      if(choices.length){
        const cell=choices[0];
        await page.mouse.click(battle.grid.originX+(cell.col+.5)*battle.grid.cellSize,battle.grid.originY+(cell.row+.5)*battle.grid.cellSize);
        await stable(page);
        battle=await snapshot(page); unit=battle.units.find(u=>u.id===unit.id)!;
        origin=worldToCell(battle.grid,unit.x,unit.y)!;
        target=battle.units.find(e=>e.side==='enemy'&&e.health>0&&manhattan(origin,worldToCell(battle.grid,e.x,e.y)!)<=range);
      }
    }
    if(target)await page.mouse.click(target.x,target.y);
    else await page.getByRole('button',{name:'Guard',exact:true}).click();
  }
  await expect(page.getByTestId('victory-panel')).toBeVisible();
  const rewarded=await state(page);
  expect(rewarded.crowns).toBe(before.crowns+24);
  expect(rewarded.mercenaries.every((m:any)=>m.xp===35)).toBe(true);
  expect(rewarded.quests[0].progress).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('victory-panel')).toBeVisible();
  await page.getByRole('button',{name:'Take all and continue'}).click();
  await expect(page.getByTestId('world-hud')).toBeVisible();
  expect((await snapshot(page)).pointerListeners).toBe(1);
  expect((await snapshot(page)).wheelListeners).toBe(1);
  await page.getByRole('button',{name:'Contracts',exact:true}).click();
  await page.getByRole('button',{name:'Turn in',exact:true}).click();
  await page.getByRole('button',{name:'×'}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.reload();
  await page.getByTestId('continue-button').click();
  await page.waitForFunction(()=>Boolean((window as any).__GAME_TEST_API__));
  const reloaded=await state(page);
  expect(reloaded.crowns).toBe(rewarded.crowns+150);
  expect(reloaded.quests[0].state).toBe('completed');
  expect(reloaded.enemies.find((e:any)=>e.id==='bandit-1').alive).toBe(false);
  expect(errors).toEqual([]);
});

test('desktop title, world and company layouts have no horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.screenshot({path:'test-results/desktop-title.png'});
  await start(page);
  await page.screenshot({path:'test-results/desktop-world.png'});
  await page.getByRole('button',{name:'Company',exact:true}).click();
  await expect(page.getByTestId('inventory-panel')).toBeVisible();
  const overflow=await page.getByTestId('inventory-panel').evaluate(el=>el.scrollWidth>el.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({path:'test-results/desktop-company.png'});
  await page.getByRole('button',{name:'×'}).click();
  await fight(page);
  await page.screenshot({path:'test-results/desktop-battle.png'});
});
