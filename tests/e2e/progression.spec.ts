import { expect, test, type Page } from '@playwright/test';
import { createInitialState, serializeState } from '../../src/domain';
import { assignProfession } from '../../src/systems';
import { LOCATIONS } from '../../src/data';
import { cellKey, manhattan, reachableCells, worldToCell, type GridLayout } from '../../src/battleGrid';
import type { GameState } from '../../src/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
const close = (page: Page) => page.locator('#modal-root header [data-action="close"]').click();
function fixture() {
  const s = createInitialState();
  s.enemies.forEach(e => e.alive = false);
  return s;
}
async function load(page: Page, s: GameState) {
  await page.goto('/');
  await page.evaluate(save => localStorage.setItem('ironbound-save-v1', save), serializeState(s));
  await resume(page);
}
async function resume(page: Page) {
  await page.reload();
  await page.getByTestId('continue-button').click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
}
async function enter(page: Page, id: string) {
  const loc = LOCATIONS.find(l => l.id === id)!;
  await page.evaluate(({ x, y }) => (window as any).__GAME_TEST_API__.movePartyTo(x, y), loc);
  const button = page.locator('#nearby-location [data-action="enter-location"]');
  await expect(button).toHaveAttribute('data-location', id);
  await button.click();
}

test('mobile: assign trades, mine, forge, upgrade, equip and resume the same company', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const s = fixture(); s.worldX = 920; s.worldY = 1030;
  await load(page, s);
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('button', { name: 'Professions & daily work' }).click();
  await page.getByLabel('Profession for Alden').selectOption('Blacksmith');
  await page.getByLabel('Profession for Mira').selectOption('Cook');
  await page.getByLabel('Profession for Bram').selectOption('Miner');
  await page.getByRole('button', { name: 'Prepare meals', exact: true }).click();
  expect((await state(page)).food).toBe(s.food + 7);
  await expect(page.getByRole('button', { name: 'Prepare meals', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/mobile-professions.png' });
  await close(page);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('button', { name: 'Travel to Iron Mine', exact: true }).click();
  await expect(page.getByTestId('location-panel')).toHaveAttribute('data-location', 'iron-mine');
  const iron = (await state(page)).materials.iron;
  await page.getByRole('button', { name: 'Mine an iron seam', exact: true }).click();
  expect((await state(page)).materials.iron).toBe(iron + 4);
  await expect(page.getByRole('button', { name: 'Mine an iron seam', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open equipment forge', exact: true }).click();
  await page.getByRole('button', { name: 'Forge Forged Sword', exact: true }).click();
  const sword = (await state(page)).inventory.find(i => i.name === 'Forged Sword')!;
  await page.getByRole('button', { name: 'Upgrade equipment', exact: true }).click();
  const gearCard = page.locator(`.recipe-card[data-item-id="${sword.id}"]`);
  await gearCard.getByRole('button', { name: 'Upgrade to +1', exact: true }).click();
  await expect(gearCard).toContainText('Forged Sword +1');
  expect(await page.getByTestId('forge-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-forge.png' });
  await page.getByRole('button', { name: 'Company equipment', exact: true }).click();
  await page.locator(`[data-action="equip"][data-item-id="${sword.id}"][data-merc="${s.mercenaries[0].id}"]`).click();
  const equipped = (await state(page)).mercenaries[0].equipment.weapon!;
  expect(equipped.power).toBe(8);
  expect(equipped.upgradeLevel).toBe(1);
  await close(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await resume(page);
  const loaded = await state(page);
  expect(loaded.mercenaries[0].equipment.weapon).toEqual(equipped);
  expect(loaded.locations['iron-mine'].lastGatherDay).toBe(loaded.day);
  expect(loaded.mercenaries[0].profession!.level).toBe(2);
});

test('all map locations open and previously discovered sites stay explorable', async ({ page }) => {
  // Eleven visits plus a save/reload exceed one interaction's budget on CI.
  // Individual location assertions keep the normal 7-second responsiveness limit.
  test.setTimeout(60_000);
  const s = fixture();
  s.discovered = LOCATIONS.map(l => l.id);
  // Simulate an existing save from before location progress and profession history.
  delete (s as Partial<GameState>).locations;
  await load(page, s);
  for (const loc of LOCATIONS) {
    await enter(page, loc.id);
    await expect(page.locator('#modal-root h2')).toContainText(loc.name);
    if (loc.id === 'iron-mine') await page.screenshot({ path: 'test-results/iron-mine.png' });
    await close(page);
  }
  await enter(page, 'old-mill');
  await page.getByRole('button', { name: 'Search the site', exact: true }).click();
  const searched = await state(page);
  await expect(page.getByRole('button', { name: 'Site searched', exact: true })).toBeDisabled();
  await close(page);
  await resume(page);
  await enter(page, 'old-mill');
  await expect(page.getByRole('button', { name: 'Site searched', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gather grain & timber', exact: true })).toBeEnabled();
  expect((await state(page)).materials).toEqual(searched.materials);
});

test('daily gathering resets after rest; thieves open each cache once', async ({ page }) => {
  const s = fixture(); assignProfession(s, s.mercenaries[0].id, 'Thief');
  await load(page, s); await enter(page, 'old-mill');
  await page.getByRole('button', { name: 'Pick the lock', exact: true }).click();
  expect((await state(page)).materials.iron).toBe(s.materials.iron);
  expect((await state(page)).crowns).toBe(s.crowns + 18);
  await expect(page.getByRole('button', { name: 'Cache emptied', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Gather grain & timber', exact: true }).click();
  await close(page);
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Gather grain & timber', exact: true })).toBeDisabled();
  await close(page);
  await page.getByRole('button', { name: 'Camp', exact: true }).click();
  await page.getByRole('button', { name: 'Rest until morning', exact: true }).click();
  await close(page);
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Gather grain & timber', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cache emptied', exact: true })).toBeDisabled();
});

test('scholar tomb research and completed tomb revisits survive reload', async ({ page }) => {
  const s = fixture(); assignProfession(s, s.mercenaries[0].id, 'Scholar');
  s.tombs[0].roomsExplored = 4; s.tombs[0].codices = 2;
  await load(page, s); await enter(page, 'greenmarch-tomb');
  await page.getByRole('button', { name: 'Explore next room · 1 torch', exact: true }).click();
  const completed = await state(page);
  expect(completed.tombs[0].completed).toBe(true);
  expect(completed.knowledgePoints).toBe(1);
  expect(completed.knowledge).toBe(8);
  expect(completed.mercenaries[0].profession!.xp).toBe(20);
  await expect(page.getByRole('button', { name: 'Tomb cleared', exact: true })).toBeDisabled();
  await close(page); await resume(page); await enter(page, 'greenmarch-tomb');
  await expect(page.getByRole('button', { name: 'Tomb cleared', exact: true })).toBeDisabled();
  expect((await state(page)).inventory.filter(i => i.name.endsWith('Relic'))).toHaveLength(1);
});

test('forge explains locked recipes and town material purchases unblock them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = fixture(); s.crowns = 400; s.materials.iron = 0;
  await load(page, s); await enter(page, 'stonebridge');
  await page.getByRole('button', { name: 'Forge & upgrade equipment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Forge Forged Sword', exact: true })).toBeDisabled();
  await expect(page.getByTestId('forge-panel')).toContainText('Assign a Blacksmith in Company.');
  await page.getByRole('button', { name: 'Assign professions', exact: true }).click();
  await page.getByLabel('Profession for Alden').selectOption('Blacksmith');
  await page.getByRole('button', { name: 'Open equipment forge', exact: true }).click();
  await expect(page.locator('.recipe-card[data-recipe="forged-sword"]')).toContainText('Need 3 iron more.');
  await close(page); await enter(page, 'stonebridge');
  const supplier = page.locator('.service').filter({ has: page.getByRole('heading', { name: 'Workshop supplies' }) });
  await supplier.locator('[data-action="buy-material"][data-material="iron"]').click();
  expect((await state(page)).materials.iron).toBe(3);
  expect((await state(page)).crowns).toBe(382);
  await page.getByRole('button', { name: 'Forge & upgrade equipment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Forge Forged Sword', exact: true })).toBeEnabled();
  expect(await page.getByTestId('forge-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/desktop-forge.png' });
});

type Unit = { id: string; name: string; side: string; x: number; y: number; health: number; moved: boolean; acted: boolean };
type Battle = { grid: GridLayout; units: Unit[]; obstacles: string[]; phase: string; selectedUnitId: string };
const battle = (page: Page): Promise<Battle> => page.evaluate(() => (window as any).__GAME_TEST_API__.battleSnapshot());
async function stable(page: Page) { await page.waitForFunction(() => ['player', 'finished'].includes((window as any).__GAME_TEST_API__.battleSnapshot().phase)); }

test('a garrison fight unlocks the site and returns to exploration without duplicate loot', async ({ page }) => {
  test.setTimeout(60_000);
  const s = fixture(); s.quests[0].state = 'active';
  // A strong test company makes the integration check fast; every action still uses the real grid and UI.
  s.mercenaries.forEach(m => { m.class = 'Ranger'; m.strength = 80; m.movement = 330; m.health = m.maxHealth = 500; });
  await load(page, s); await enter(page, 'bandit-camp');
  await expect(page.getByRole('button', { name: 'Search the site', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fight the defenders', exact: true }).click();
  await expect(page.getByTestId('battle-hud')).toBeVisible();
  for (let action = 0; action < 15; action++) {
    await stable(page);
    let b = await battle(page); if (b.phase === 'finished') break;
    let unit = b.units.find(u => u.id === b.selectedUnitId)!;
    let origin = worldToCell(b.grid, unit.x, unit.y)!;
    const enemies = b.units.filter(u => u.side === 'enemy' && u.health > 0);
    let target = enemies.find(e => manhattan(origin, worldToCell(b.grid, e.x, e.y)!) <= 5);
    if (!target && !unit.moved) {
      const blocked = new Set([...b.obstacles, ...b.units.filter(u => u.id !== unit.id && u.health > 0).map(u => cellKey(worldToCell(b.grid, u.x, u.y)!))]);
      const choices = [...reachableCells(b.grid, origin, 6, blocked).keys()].map(k => { const [col, row] = k.split(',').map(Number); return { col, row }; });
      choices.sort((a, c) => Math.min(...enemies.map(e => manhattan(a, worldToCell(b.grid, e.x, e.y)!))) - Math.min(...enemies.map(e => manhattan(c, worldToCell(b.grid, e.x, e.y)!))));
      if (choices[0]) {
        await page.mouse.click(b.grid.originX + (choices[0].col + .5) * b.grid.cellSize, b.grid.originY + (choices[0].row + .5) * b.grid.cellSize);
        await stable(page); b = await battle(page); unit = b.units.find(u => u.id === unit.id)!;
        origin = worldToCell(b.grid, unit.x, unit.y)!;
        target = b.units.find(e => e.side === 'enemy' && e.health > 0 && manhattan(origin, worldToCell(b.grid, e.x, e.y)!) <= 5);
      }
    }
    if (target) await page.mouse.click(target.x, target.y);
    else await page.getByRole('button', { name: 'Guard', exact: true }).click();
  }
  await expect(page.getByTestId('victory-panel')).toBeVisible();
  const won = await state(page);
  expect(won.locations['bandit-camp'].cleared).toBe(true);
  expect(won.crowns).toBe(s.crowns + 24);
  expect(won.quests[0].progress).toBe(1);
  await page.getByRole('button', { name: 'Take all and continue' }).click();
  await expect(page.getByTestId('location-panel')).toHaveAttribute('data-location', 'bandit-camp');
  await expect(page.getByRole('button', { name: 'Fight the defenders', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Search the site', exact: true }).click();
  expect((await state(page)).crowns).toBe(won.crowns + 20);
  await close(page); await resume(page); await enter(page, 'bandit-camp');
  await expect(page.getByRole('button', { name: 'Site searched', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Fight the defenders', exact: true })).toHaveCount(0);
  expect((await state(page)).crowns).toBe(won.crowns + 20);
});
