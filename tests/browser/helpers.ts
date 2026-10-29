import { expect, type Page } from '@playwright/test';

/** What a player's saved state can start as. */
export type Save = 'fresh' | 'returning';

/** Opens the game with a save, collecting page errors; `errors` must stay empty. */
export async function openGame(page: Page, save: Save = 'returning'): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('seeded')) return; // keep what the test changed across reloads
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (save === 'returning') {
      localStorage.setItem('endless.onboarding', 'done');
      localStorage.setItem('endless.reveal', '2');
      localStorage.setItem('endless.progress', JSON.stringify({ stats: { runs: 40 }, furthest: 9 }));
      localStorage.setItem('endless.wallet', JSON.stringify({ credits: 5000, earned: 20000, cores: 120, coresEarned: 200 }));
    }
  }, save);
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0);
  return { errors };
}

/** Taps through the cards a launch can open with (the day's login reward and the like), one tap each. */
export async function dismissCards(page: Page): Promise<void> {
  for (let i = 0; i < 6 && (await page.locator('#promo.show').count()) > 0; i++) {
    await page.locator('#promo').click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#promo.show')).toHaveCount(0);
}

/** The screen showing now (its id without "screen-"), or null in a run. */
export async function currentScreen(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector('.screen.on')?.id.replace('screen-', '') ?? null);
}
