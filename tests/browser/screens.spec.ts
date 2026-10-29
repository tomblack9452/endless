import { expect, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

test('a first launch opens the tutorial, and skipping it reaches the title', async ({ page }) => {
  const { errors } = await openGame(page, 'fresh');
  await expect(page.locator('#screen-welcome')).toHaveClass(/\bon\b/);
  await page.locator('#welcome-skip').click();
  await dismissCards(page);
  // Skipping still asks to dress the ship; ready moves on to the title.
  for (let i = 0; i < 3 && (await currentScreen(page)) !== 'title'; i++) {
    const ready = page.locator('#screen-welcome.on button.primary:visible').first();
    if (await ready.isVisible().catch(() => false)) await ready.click();
    await dismissCards(page);
  }
  await expect(page.locator('#screen-title')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

const MENUS = ['hangar', 'shop', 'goals', 'boards', 'record'] as const;

test('every menu on the title bar opens, and back returns to the title', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  for (const menu of MENUS) {
    await page.locator(`.title-bar [data-title="${menu}"]`).click();
    await expect.poll(() => currentScreen(page), { message: menu }).toBe(menu);
    // Escape is the web's Android back: it closes a first-visit card, then the screen.
    for (let i = 0; i < 3 && (await currentScreen(page)) !== 'title'; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    await expect.poll(() => currentScreen(page), { message: `${menu} back` }).toBe('title');
  }
  expect(errors).toEqual([]);
});

test('settings open from the title and close again', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.locator('#title-settings').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/\bon\b/);
  await page.locator('#screen-settings [data-action="back"]').first().click();
  await expect(page.locator('#screen-title')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test('a first launch starts the practice run with its first lesson, and skip leaves it', async ({ page }) => {
  const { errors } = await openGame(page, 'fresh');
  await page.locator('#welcome-practice').click();
  await expect(page.locator('#hud')).toHaveClass(/\bon\b/);
  await expect(page.locator('#tutorial-text')).toContainText(/steer|drag|tap|tilt|lean/i, { timeout: 20_000 });
  await page.waitForTimeout(3000); // a few seconds of the practice run's loop
  await page.locator('#tutorial-skip').click();
  await expect.poll(() => currentScreen(page), { timeout: 20_000 }).not.toBeNull();
  expect(errors).toEqual([]);
});
