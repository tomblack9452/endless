import { expect, type Page, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

/** The web build has no store: stand in for the app's, with prices. */
async function withStore(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const g = window.game;
    g.store.available = true;
    g.storeProducts = ['starter_pack', 'credits_1000', 'credits_10000', 'cores_100', 'cores_2500'].map((id) => ({ id, price: '£0.99' }));
    g.progress.stats.validRuns = 5;
    g.title.refreshTitle();
  })()`);
}

test('the starter offer shows on the title after a few runs, counts down, and opens the store', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await withStore(page);
  const card = page.locator('[data-card="store-card"]');
  await expect(card).toContainText("pilot's starter pack");
  await expect(card).toContainText(/4[78]h left/);
  await card.click();
  await expect.poll(() => currentScreen(page)).toBe('store');
  expect(errors).toEqual([]);
});

test('packs say "first purchase ×2" until a pack is bought', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await withStore(page);
  await page.evaluate("window.game.shop.openStore(null, 'dock')");
  await dismissCards(page);
  await expect(page.locator('#store-credits .store-tag').first()).toHaveText('first purchase ×2');
  await page.evaluate('window.game.offers.markPackBought(); window.game.shop.openStore()');
  await expect(page.locator('#store-credits')).not.toContainText('first purchase');
  expect(errors).toEqual([]);
});
