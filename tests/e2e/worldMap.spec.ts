import { expect, test, type Page } from '@playwright/test';
import { createInitialState, serializeState } from '../../src/domain';
import { getWorldMap, locationCell, safeWorldCell, worldPath, worldPoint } from '../../src/worldMap';
import { manhattan } from '../../src/battleGrid';
import type { GameState } from '../../src/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
const snapshot = (page: Page) => page.evaluate(() => (window as any).__GAME_TEST_API__.worldSnapshot());
async function load(page: Page, x = 540, y = 900, patrol = false) {
  const s = createInitialState(); s.worldX=x; s.worldY=y;
  s.enemies.forEach(e => e.alive=false);
  if (patrol) { s.enemies[0].alive=true; s.enemies[0].x=700; s.enemies[0].y=900; }
  await page.goto('/');
  await page.evaluate(save => localStorage.setItem('ironbound-save-v1', save), serializeState(s));
  await page.reload(); await page.getByTestId('continue-button').click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  return s;
}
async function idle(page: Page) { await page.waitForFunction(() => { const s=(window as any).__GAME_TEST_API__.worldSnapshot(); return !s.step && !s.route.length; }); }
async function clickTile(page: Page, col: number, row: number) {
  const { camera: c } = await snapshot(page), p=worldPoint({ col,row });
  await page.mouse.click((p.x-c.scrollX-c.width/2)*c.zoom+c.width/2, (p.y-c.scrollY-c.height/2)*c.zoom+c.height/2);
}

test('quick keyboard taps move one cell, walls block movement and no diagonal step is committed', async ({ page }) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900}); await load(page);
  const start=await snapshot(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async()=> (await snapshot(page)).cell).toEqual({col:start.cell.col+1,row:start.cell.row});
  await idle(page); const once=await state(page); await page.waitForTimeout(230);
  expect((await state(page)).worldX).toBe(once.worldX);
  // Face the west edge of Stonebridge's main building. It occupies row 19.
  await page.evaluate(() => (window as any).__GAME_TEST_API__.movePartyTo(540,820));
  const before=await state(page); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(450); await page.keyboard.up('ArrowUp');
  const blocked=await state(page); expect(blocked.worldX).toBe(before.worldX); expect(blocked.worldY).toBe(before.worldY); expect(blocked.fatigue).toBe(before.fatigue);
  await page.evaluate(() => (window as any).__GAME_TEST_API__.movePartyTo(540,900));
  await page.keyboard.down('d'); await page.keyboard.down('s');
  await expect.poll(async()=>Boolean((await snapshot(page)).step)).toBe(true);
  const moving=await snapshot(page); expect(manhattan(moving.step.from,moving.step.to)).toBe(1);
  await page.keyboard.up('s'); await page.keyboard.up('d'); await idle(page);
  const end=await state(page); expect(end.worldX%40).toBe(20); expect(end.worldY%40).toBe(20);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/tile-world-desktop.png'});
});

test('click routing follows terrain, walks over the bridge and enters the mine at its doorway', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900}); await load(page,920,1030);
  const start=(await snapshot(page)).cell;
  // Real canvas click at the mine's entrance, including automatic arrival.
  const goal=locationCell('iron-mine')!, expected=worldPath(getWorldMap(),start,goal);
  expect(expected.some(c=>getWorldMap().tiles[c.row][c.col].ground==='bridge')).toBe(true);
  await clickTile(page,goal.col,goal.row);
  await expect.poll(async()=> (await snapshot(page)).route.length).toBeGreaterThan(0);
  const route=await snapshot(page);
  for (const cell of route.route) { const tile=route.tiles[cell.row][cell.col];expect(tile.obstacle).toBeUndefined();expect(tile.ground).not.toBe('water'); }
  await expect(page.getByTestId('location-panel')).toHaveAttribute('data-location','iron-mine');
  expect((await snapshot(page)).cell).toEqual(goal);
  await page.locator('#modal-root header [data-action=close]').click();
  await page.keyboard.press('e');
  await expect(page.getByTestId('location-panel')).toHaveAttribute('data-location','iron-mine');
});

test('touch direction pad releases cleanly and a menu cancels travel on a complete cell', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(); await load(page);
  const right=page.getByRole('button',{name:'Move right',exact:true}), box=(await right.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);expect(box.height).toBeGreaterThanOrEqual(48);
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await expect.poll(async()=> (await snapshot(page)).cell.col).toBe(14);await idle(page);
  const stopped=await state(page);await page.waitForTimeout(250);expect((await state(page)).worldX).toBe(stopped.worldX);
  // Hold a pointer, then open a menu before releasing it outside the pad.
  const down=(await page.getByRole('button',{name:'Move down',exact:true}).boundingBox())!;
  await page.mouse.move(down.x+24,down.y+24);await page.mouse.down();
  await expect.poll(async()=> (await snapshot(page)).cell.row).toBeGreaterThan(22);
  await page.keyboard.press('i');await expect(page.getByTestId('inventory-panel')).toBeVisible();
  const paused=await state(page);await page.mouse.move(360,300);await page.mouse.up();
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  const after=await state(page);expect(after.worldX).toBe(paused.worldX);expect(after.worldY).toBe(paused.worldY);
  expect(after.worldX%40).toBe(20);expect(after.worldY%40).toBe(20);
  await page.screenshot({path:'test-results/tile-world-mobile.png'});await context.close();
});

test('old saves relocate off water, preserve the company and retain the same tile after reload', async ({ page }) => {
  const s=await load(page,1040,500), cell=safeWorldCell(getWorldMap(),1040,500), p=worldPoint(cell);
  const first=await state(page);expect(first.worldX).toBe(p.x);expect(first.worldY).toBe(p.y);expect(first.mercenaries).toEqual(s.mercenaries);expect(first.inventory).toEqual(s.inventory);
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.reload();await page.getByTestId('continue-button').click();
  await page.waitForFunction(()=>Boolean((window as any).__GAME_TEST_API__));expect((await snapshot(page)).cell).toEqual(cell);
});


test('patrols approach on walkable tiles, trigger a nearby encounter and flee to reachable land', async ({ page }) => {
  await load(page,540,900,true);
  await expect(page.getByTestId('encounter-panel')).toBeVisible();
  const before=await snapshot(page), enemy=before.enemies[0];
  expect(manhattan(before.cell,enemy)).toBeLessThanOrEqual(1);
  const t=before.tiles[enemy.row][enemy.col]; expect(t.obstacle).toBeUndefined(); expect(t.ground).not.toBe('water');
  await page.getByRole('button',{name:'Flee',exact:true}).click();
  await expect(page.getByTestId('encounter-panel')).toHaveCount(0);
  const after=await snapshot(page), route=worldPath(getWorldMap(),before.cell,after.cell);
  expect(route.length).toBeGreaterThan(0);expect(route.length).toBeLessThanOrEqual(5);
  expect(manhattan(after.cell,enemy)).toBeGreaterThan(manhattan(before.cell,enemy));
});
