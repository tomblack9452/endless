import { expect, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

test("the pilot's club shows in the store with its terms, and a member gets a cores card on the title", async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  // The web build has no store: stand in for the app's, with a price.
  await page.evaluate(`(() => {
    const g = window.game;
    g.store.available = true;
    g.storeProducts = [{ id: 'starter_pack', price: '£2.99' }, { id: 'premium', price: '£4.99' }];
    g.club.price = '£2.99';
    g.shop.openStore(null, 'dock');
  })()`);
  await dismissCards(page);
  await expect.poll(() => currentScreen(page)).toBe('store');
  const card = page.locator('.store-card', { has: page.locator('[data-act="club"]') });
  await expect(card).toContainText("pilot's club");
  await expect(card).toContainText('£2.99 a month, renews until you cancel');
  // A member: the title's first card is the day's cores.
  await page.evaluate(`(() => {
    const g = window.game;
    g.club.s.until = g.now() + 30 * 86400000;
    g.nav.back();
    g.title.refreshTitle();
  })()`);
  const club = page.locator('[data-card="club"]');
  await expect(club).toContainText('10 cores ready');
  expect(errors).toEqual([]);
});
