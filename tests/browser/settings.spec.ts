import { expect, test } from '@playwright/test';
import { dismissCards, openGame } from './helpers';

test('a changed setting is kept after a reload, and tap steering hides double-tap boost', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.locator('#title-settings').click();
  const touch = page.locator('[data-setting="touch"]');
  const dbl = page.locator('[data-setting="doubleTapBoost"]');
  await expect(dbl).toBeVisible();
  const was = await touch.locator('.value').textContent();
  await touch.click();
  const now = await touch.locator('.value').textContent();
  expect(now).not.toBe(was);
  await expect(dbl).toBeHidden(); // tap steering: quick taps would boost by accident

  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  await dismissCards(page);
  await page.locator('#title-settings').click();
  await expect(touch.locator('.value')).toHaveText(now ?? '');
  await expect(dbl).toBeHidden();
  expect(errors).toEqual([]);
});
