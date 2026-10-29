import { expect, type Page, test } from '@playwright/test';
import { currentScreen, dismissCards, openGame } from './helpers';

const score = async (page: Page) => Number((await page.locator('#hud-score').textContent())?.replace(/\D/g, '') || 0);
// The dev server exposes the game (window.game): the test holds the ship clear of
// rocks while it waits, then crashes it on cue, rather than waiting for a real hit.
type DevGame = { crash(): void; dev: { invincible: boolean }; world: { distance: number; laneAt(d: number): unknown } };
const dev = () => (window as unknown as { game: DevGame }).game;
const crash = (page: Page) => page.evaluate(`(${dev})().crash()`);
const holdClear = (page: Page) => page.evaluate(`(${dev})().dev.invincible = true`);
/** A revive needs a lane to put the ship back on; the first stretch has none. */
const canRevive = (page: Page) => page.evaluate(`(() => { const g = (${dev})(); return g.world.laneAt(g.world.distance) !== null; })()`);

test('an endless run: score climbs, pause and resume, a free revive, then game over and back to the menu', async ({ page }) => {
  const { errors } = await openGame(page);
  await dismissCards(page);
  await page.locator('[data-title="endless"]').click();
  await expect(page.locator('#hud')).toHaveClass(/\bon\b/);
  await holdClear(page);
  await expect.poll(() => score(page), { timeout: 30_000 }).toBeGreaterThan(20);

  await page.locator('#hud-pause').click();
  await expect(page.locator('#screen-paused')).toHaveClass(/\bon\b/);
  await page.locator('#screen-paused [data-action="resume"]').first().click();
  await expect.poll(() => currentScreen(page)).toBeNull();

  // The day's free revive: the run carries on.
  await expect.poll(() => canRevive(page), { timeout: 45_000 }).toBe(true);
  await crash(page);
  await expect(page.locator('#offer.show #offer-yes')).toHaveText(/free/);
  const before = await score(page);
  await page.locator('#offer-yes').click();
  await expect.poll(() => score(page), { timeout: 30_000 }).toBeGreaterThan(before);

  // One revive a run: the second crash ends it, with the run's score.
  await crash(page);
  await expect(page.locator('#screen-over')).toHaveClass(/\bon\b/);
  expect(Number((await page.locator('#over-score').textContent())?.replace(/\D/g, ''))).toBeGreaterThan(0);
  await dismissCards(page);
  await page.locator('#screen-over [data-action="menu"]').click();
  await expect(page.locator('#screen-title')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});
