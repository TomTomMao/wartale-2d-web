import { test, expect } from '@playwright/test';

test('new game creates a playable world and persists the company', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByRole('button', { name: 'New Company' }).click();
  await page.locator('#company-name').fill('Iron Wolves');
  await page.getByRole('button', { name: 'Begin Journey' }).click();
  await expect(page.getByTestId('world-hud')).toBeVisible();
  await expect(page.getByText('Iron Wolves')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  const state = await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
  expect(state.mercenaries).toHaveLength(3);
  expect(state.food).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.reload();
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('world-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  const loaded = await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
  expect(loaded.companyName).toBe('Iron Wolves');
});

test('contract and encounter enter tactical battle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Company' }).click();
  await page.getByRole('button', { name: 'Begin Journey' }).click();
  await page.getByRole('button', { name: /Contracts/ }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: '×' }).click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  await page.evaluate(() => (window as any).__GAME_TEST_API__.triggerEncounter('bandit-1'));
  await expect(page.getByTestId('encounter-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.getByTestId('battle-hud')).toBeVisible();
  const state = await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
  expect(state.quests[0].state).toBe('active');
});


test('grid battle exposes blocking cells and moves only to reachable tiles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Company' }).click();
  await page.getByRole('button', { name: 'Begin Journey' }).click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  await page.evaluate(() => (window as any).__GAME_TEST_API__.triggerEncounter('bandit-1'));
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.getByTestId('battle-hud')).toBeVisible();

  const before:any = await page.evaluate(() => (window as any).__GAME_TEST_API__.battleSnapshot());
  expect(before.grid).toBeTruthy();
  expect(before.obstacles.length).toBeGreaterThan(0);

  await page.evaluate(() => (window as any).__GAME_TEST_API__.selectFirstPlayer());
  const selected:any = await page.evaluate(() => (window as any).__GAME_TEST_API__.battleSnapshot());
  const player = selected.units.find((u:any) => u.side === 'player');
  const grid = selected.grid;
  const col = Math.floor((player.x - grid.originX) / grid.cellSize);
  const row = Math.floor((player.y - grid.originY) / grid.cellSize);

  const candidates = [
    {col: col + 1, row}, {col, row: row + 1}, {col, row: row - 1}
  ].filter(c => c.col >= 0 && c.row >= 0 && c.col < grid.cols && c.row < grid.rows &&
    !selected.obstacles.includes(`${c.col},${c.row}`) &&
    !selected.units.some((u:any) => Math.floor((u.x-grid.originX)/grid.cellSize)===c.col && Math.floor((u.y-grid.originY)/grid.cellSize)===c.row));

  expect(candidates.length).toBeGreaterThan(0);
  await page.evaluate(({col,row}) => (window as any).__GAME_TEST_API__.moveSelectedTo(col,row), candidates[0]);
  await page.waitForTimeout(500);

  const after:any = await page.evaluate(() => (window as any).__GAME_TEST_API__.battleSnapshot());
  const moved = after.units.find((u:any) => u.id === player.id);
  expect(moved.moved).toBe(true);
  expect(Math.floor((moved.x-grid.originX)/grid.cellSize)).toBe(candidates[0].col);
  expect(Math.floor((moved.y-grid.originY)/grid.cellSize)).toBe(candidates[0].row);
});
