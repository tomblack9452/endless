import { expect, type Page, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

const state = (page: Page) => page.evaluate('window.game.state');

test('a mode chip picks what the fly button flies, and the pick is kept after a reload', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.locator('[data-mode="zen"]').click();
  await expect(page.locator('[data-mode="zen"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#title-ranked-name')).toHaveText('zen');
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  await dismissCards(page);
  await expect(page.locator('#title-ranked-name')).toHaveText('zen');
  await page.locator('#title-start').click();
  await expect.poll(() => state(page)).not.toBe('title');
  expect(await page.evaluate('window.game.zen')).toBe(true);
  expect(errors).toEqual([]);
});

test('solo picked twice opens the areas to choose from', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.locator('[data-mode="solo"]').click();
  await expect(page.locator('#title-ranked-name')).toHaveText('solo');
  await page.locator('[data-mode="solo"]').click();
  await expect.poll(() => currentScreen(page)).toBe('sectors');
  expect(errors).toEqual([]);
});

test('a run whose credits now buy an upgrade offers the hangar from the end screen', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  // 450 credits, and a thrust tier costs 500: a run that earns 50 or more puts it in reach.
  await page.evaluate('window.game.wallet.credits = 450');
  await page.locator('[data-mode="endless"]').click();
  await page.locator('#title-start').click();
  await page.evaluate('window.game.dev.invincible = true');
  await expect.poll(() => state(page), { timeout: 30_000 }).toBe('playing');
  await page.waitForTimeout(3000);
  await page.evaluate('window.game.bonusCredits = 80; window.game.revived = true; window.game.dev.invincible = false; window.game.crash()');
  await expect(page.locator('#screen-over')).toHaveClass(/\bon\b/, { timeout: 20_000 });
  await dismissCards(page);
  const next = page.locator('#over-next');
  await expect(next).toBeVisible();
  await expect(next).toContainText(/enough for .* open hangar/);
  await next.click();
  await expect.poll(() => currentScreen(page)).toBe('hangar');
  await expect(page.locator('#hangar-upgrades')).toBeVisible();
  expect(errors).toEqual([]);
});
