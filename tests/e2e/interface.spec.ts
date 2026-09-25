import { expect, test, type Page } from '@playwright/test';
import { createInitialState, serializeState } from '../../src/domain';
import { assignProfession } from '../../src/systems';
import { forgeEquipment } from '../../src/forging';
import { LOCATIONS } from '../../src/data';

async function loadCompany(page: Page) {
  const s = createInitialState();
  s.enemies.forEach(e => e.alive = false);
  s.crowns = 600; s.food = 40;
  Object.keys(s.materials).forEach(key => s.materials[key] = 30);
  assignProfession(s, s.mercenaries[0].id, 'Blacksmith');
  forgeEquipment(s, 'forged-sword');
  await page.goto('/');
  await page.evaluate(save => localStorage.setItem('ironbound-save-v1', save), serializeState(s));
  await page.reload();
  await page.getByTestId('continue-button').click();
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST_API__));
  return s;
}
const close = (page: Page) => page.locator('#modal-root header [data-action="close"]').click();

test('character slots equip the chosen companion and keep keyboard selection usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = await loadCompany(page);
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  const panel = page.getByTestId('inventory-panel');
  await panel.getByRole('button', { name: 'View Bram', exact: true }).click();
  await expect(panel.locator('.character-title h3')).toHaveText('Bram');
  await panel.getByRole('button', { name: 'Weapons', exact: true }).click();
  const slot = panel.getByRole('button', { name: 'Inspect Forged Sword', exact: true });
  await slot.focus(); await page.keyboard.press('Enter');
  await expect(slot).toBeFocused();
  await expect(slot).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Equip → Bram', exact: true }).click();
  const state = await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState());
  expect(state.mercenaries[2].equipment.weapon.name).toBe('Forged Sword');
  expect(state.mercenaries[0].equipment.weapon.id).toBe(s.mercenaries[0].equipment.weapon!.id);
  await expect(panel.locator('.slot-weapon')).toContainText('Forged Sword');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/character-sheet.png' });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await panel.getByRole('button', { name: 'Forge & upgrade equipment', exact: true }).click();
  await page.locator('[data-action="forge-choice"][data-recipe="long-bow"]').click();
  await expect(page.getByRole('button', { name: 'Forge Long Bow', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Forge Long Bow', exact: true }).click();
  await expect(page.getByTestId('forge-panel').getByRole('status')).toContainText('Long Bow forged');
  await page.screenshot({ path: 'test-results/forge-workbench.png' });
  await page.getByRole('button', { name: 'Upgrade equipment', exact: true }).click();
  const weapon = state.mercenaries[2].equipment.weapon;
  await page.locator(`[data-action="upgrade-choice"][data-item-id="${weapon.id}"]`).click();
  await page.getByRole('button', { name: 'Upgrade to +1', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState().mercenaries[2].equipment.weapon.upgradeLevel)).toBe(1);
});

test('camp hotspots, facilities and the atlas remain usable on a narrow touch screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const s = await loadCompany(page);
  await page.getByRole('button', { name: 'Camp', exact: true }).click();
  const camp = page.getByTestId('camp-panel');
  for (const name of ['Rest until morning', 'Professions & daily work', 'Forge & upgrade equipment']) {
    const hotspot = camp.getByRole('button', { name, exact: true });
    const box = await hotspot.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(hotspot).toBeInViewport();
  }
  await page.screenshot({ path: 'test-results/mobile-camp-scene.png' });
  await camp.getByRole('button', { name: 'Rest until morning', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState().day)).toBe(s.day + 1);
  await camp.getByRole('button', { name: 'Camp facilities', exact: true }).click();
  await camp.getByRole('button', { name: 'Build Cooking Pot', exact: true }).click();
  await expect(camp.locator('.supply-recipe').filter({ hasText: 'Pot' })).toContainText('Built in your camp');
  await camp.getByRole('button', { name: 'Professions & daily work', exact: true }).click();
  await expect(page.getByLabel('Profession for Alden')).toHaveValue('Blacksmith');
  await close(page);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const atlas = page.getByTestId('explore-panel');
  for (const loc of LOCATIONS) {
    const pin = atlas.getByRole('button', { name: `Select ${loc.name}`, exact: true });
    await pin.click();
    await expect(pin).toBeFocused();
    await expect(atlas.locator('.destination-detail h3')).toHaveText(loc.name);
  }
  await atlas.getByRole('button', { name: 'Select Iron Mine', exact: true }).click();
  expect(await atlas.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-atlas.png' });
  // Selecting markers does not send the company marching until Travel is chosen.
  expect(await page.evaluate(() => (window as any).__GAME_TEST_API__.getGameState().worldX)).toBe(s.worldX);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/frontier-atlas.png' });
  await close(page);
  await page.getByRole('button', { name: 'Camp', exact: true }).click();
  await camp.getByRole('button', { name: 'Tools & medicine', exact: true }).click();
  await page.screenshot({ path: 'test-results/camp-scene.png' });
});

test('title manual returns to the game menu and compact inventory selection preserves scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Field manual', exact: true }).click();
  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-title.png' });
  await loadCompany(page);
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  const panel = page.getByTestId('inventory-panel');
  const slot = panel.getByRole('button', { name: 'Inspect Forged Sword', exact: true });
  await slot.scrollIntoViewIfNeeded();
  const before = await panel.evaluate(el => el.scrollTop);
  await slot.click();
  expect(await panel.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(before - 1);
  await expect(slot).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Equip → Alden', exact: true })).toBeVisible();
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-pack.png' });
});
