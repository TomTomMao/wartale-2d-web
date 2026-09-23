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
