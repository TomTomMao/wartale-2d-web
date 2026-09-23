import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 }
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('mobile new game uses compact HUD and bottom navigation', async ({ page }) => {
  await page.getByRole('button', { name: 'New Company' }).tap();
  await expect(page.getByTestId('new-game-form')).toBeVisible();
  await page.locator('#company-name').fill('Pocket Wolves');
  await page.getByRole('button', { name: 'Begin Journey' }).tap();

  await expect(page.getByTestId('world-hud')).toBeVisible();
  const nav = page.getByTestId('mobile-nav');
  await expect(nav).toBeVisible();

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(box!.height).toBeGreaterThanOrEqual(50);

  await page.getByRole('button', { name: /Company/ }).tap();
  await expect(page.getByTestId('inventory-panel')).toBeVisible();

  const panelBox = await page.getByTestId('inventory-panel').boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(-1);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(391);

  await page.screenshot({ path: 'test-results/mobile-company.png', fullPage: true });
});

test('mobile camp and knowledge are usable without keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'New Company' }).tap();
  await page.getByRole('button', { name: 'Begin Journey' }).tap();

  await page.getByRole('button', { name: /Camp/ }).tap();
  await expect(page.getByTestId('camp-panel')).toBeVisible();
  await page.getByRole('button', { name: '×' }).tap();

  await page.getByRole('button', { name: /Knowledge/ }).tap();
  await expect(page.getByTestId('knowledge-panel')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-knowledge.png', fullPage: true });
});

test('mobile can enter a battle and sees touch-sized battle actions', async ({ page }) => {
  await page.getByRole('button', { name: 'New Company' }).tap();
  await page.getByRole('button', { name: 'Begin Journey' }).tap();

  await page.evaluate(() => (window as any).__GAME_TEST_API__.triggerEncounter('bandit-1'));
  await expect(page.getByTestId('encounter-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Fight' }).tap();
  await expect(page.getByTestId('battle-hud')).toBeVisible();

  const endUnit = page.getByRole('button', { name: /End Unit/ });
  await expect(endUnit).toBeVisible();
  const actionBox = await endUnit.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.height).toBeGreaterThanOrEqual(48);

  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeLessThanOrEqual(390);
  expect(canvasBox!.height).toBeLessThanOrEqual(844);

  await page.screenshot({ path: 'test-results/mobile-battle.png', fullPage: true });
});
