import { expect, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

test('an upgrade the wallet is short for says how short, and swapping cores buys it', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  // A first tier costs 500: 300 credits are 200 short, which 8 cores cover at 25 credits each.
  await page.evaluate('window.game.wallet.credits = 300; window.game.wallet.cores = 20');
  await page.evaluate("window.game.nav.onTitleLink('hangar'); window.game.hangarScreen.onHangarTab('upgrades')");
  await expect.poll(() => currentScreen(page)).toBe('hangar');
  const first = page.locator('[data-upgrade]').first();
  const id = await first.getAttribute('data-upgrade');
  await first.click();
  await expect(page.locator('#offer-name')).toHaveText('200 credits short');
  await expect(page.locator('#offer-alt')).toHaveText('swap 8 cores');
  await expect(page.locator('#offer-no')).toHaveText('not now');
  await page.locator('#offer-alt').click();
  expect(await page.evaluate(`window.game.upgrades.tier('${id}')`)).toBe(1);
  expect(await page.evaluate('window.game.wallet.cores')).toBe(12);
  expect(await page.evaluate('window.game.wallet.credits')).toBe(0);
  expect(errors).toEqual([]);
});

test('"not now" leaves the wallet as it was', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.evaluate('window.game.wallet.credits = 100; window.game.wallet.cores = 0');
  await page.evaluate("window.game.nav.onTitleLink('hangar'); window.game.hangarScreen.onHangarTab('upgrades')");
  await page.locator('[data-upgrade]').first().click();
  await expect(page.locator('#offer-name')).toHaveText('400 credits short');
  await expect(page.locator('#offer-alt')).toBeHidden(); // no cores to swap
  await page.locator('#offer-no').click();
  expect(await page.evaluate('window.game.wallet.credits')).toBe(100);
  expect(errors).toEqual([]);
});
