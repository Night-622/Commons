// Browser smoke tests: the real game in Chromium, with js/firebase.js replaced by an in-memory fake.
// Run with: npm run test:smoke
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Any uncaught error or console error fails the test. Requests off this server are blocked so runs are offline.
async function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.route((url) => !/^http:\/\/127\.0\.0\.1:4173\//.test(url.href), (r) => r.abort());
  return errors;
}
const clean = (errors) => errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/.test(e));

async function found(page, { mayor = 'Mona', city = 'Testhaven' } = {}) {
  await page.goto('/');
  await page.locator('#auth-guest').click();
  await expect(page.locator('#found')).toBeVisible();
  await page.locator('#found-mayor').fill(mayor);
  await page.locator('#found-city').fill(city);
  await page.locator('#found-go').click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#city-name')).toContainText(city);
}
const closeModal = async (page) => { if (await page.locator('#modal[open]').count()) { await page.keyboard.press('Escape'); await expect(page.locator('#modal[open]')).toHaveCount(0); } };

test('the fake has the same exports as the real firebase.js', () => {
  const names = (f) => [...readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map((m) => m[1]).sort();
  expect(names('./fake-firebase.js')).toEqual(names('../../public/js/firebase.js'));
});

test('sign in as a guest and found a city', async ({ page }) => {
  const errors = await watch(page);
  await found(page);
  await expect(page.locator('#modal[open]')).toBeVisible();   // the welcome
  await closeModal(page);
  await expect.poll(() => page.evaluate(() => window.__fakeFb.saves), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('#savestate')).toHaveText('Saved');
  expect(clean(errors)).toEqual([]);
});

// Clicks every tab inside a container, waiting a moment for each to draw.
async function everyTab(page, container) {
  const n = await page.locator(`${container} [role="tab"]`).count();
  for (let k = 0; k < n; k++) {
    const tab = page.locator(`${container} [role="tab"]`).nth(k);
    if (await tab.isVisible()) { await tab.click(); await page.waitForTimeout(150); }
  }
}
async function newGame(page) {
  const errors = await watch(page);
  await page.addInitScript(() => { try { localStorage.setItem('commons-seen-help', '1'); } catch { /* ignore */ } });
  await found(page);
  await closeModal(page);
  return errors;
}

test('every panel opens, with every tab', async ({ page }) => {
  const errors = await newGame(page);
  for (const name of ['goals', 'people', 'stats', 'news', 'chat', 'world', 'region']) {
    await page.locator(`#rail [data-panel="${name}"]`).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await expect(page.locator(`#rail [data-panel="${name}"]`)).toHaveAttribute('aria-pressed', 'true');
    await everyTab(page, '#drawer');
  }
  expect(clean(errors)).toEqual([]);
});

test('every top-bar modal opens, with every tab', async ({ page }) => {
  const errors = await newGame(page);
  for (const id of ['btn-board', 'btn-settings', 'btn-account', 'btn-help', 'city-name']) {
    await page.locator(`#${id}`).click();
    await expect(page.locator('#modal[open]'), id).toBeVisible();
    await everyTab(page, '#modal');
    await closeModal(page);
  }
  // Help leads to support, the changelog and feedback.
  for (const id of ['h-support', 'h-news', 'h-feedback']) {
    await page.locator('#btn-help').click();
    await page.locator(`#${id}`).click();
    await expect(page.locator('#modal[open]'), id).toBeVisible();
    await closeModal(page);
  }
  // Info views are a small menu rather than a modal.
  await page.locator('#btn-traffic').click();
  const views = await page.locator('#views [data-view]').count();
  for (let k = 0; k < views; k++) {
    if (!(await page.locator('#views').count())) await page.locator('#btn-traffic').click();
    await page.locator('#views [data-view]').nth(k).click();
    await page.waitForTimeout(150);
  }
  await page.locator('#btn-summary').click();
  await page.locator('#btn-undo').click({ button: 'right' });
  await closeModal(page);
  expect(clean(errors)).toEqual([]);
});

test('chat: send a message', async ({ page }) => {
  const errors = await newGame(page);
  await page.locator('#rail [data-panel="chat"]').click();
  const box = page.locator('#chat-text');
  await box.fill('Hello from the smoke test');
  await box.press('Enter');
  await expect(page.locator('#drawer')).toContainText('Hello from the smoke test');
  expect(clean(errors)).toEqual([]);
});

test('a failed save shows Not saved, then recovers by itself', async ({ page }) => {
  const errors = await newGame(page);
  await page.evaluate(() => { window.__fakeFb.failSaves = 'unavailable'; });
  await page.locator('#rail [data-panel="goals"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#savestate')).toHaveText('Not saved', { timeout: 30_000 });
  const before = await page.evaluate(() => window.__fakeFb.saves);
  await page.evaluate(() => { window.__fakeFb.failSaves = null; });
  await expect(page.locator('#savestate')).toHaveText('Saved', { timeout: 60_000 });
  expect(await page.evaluate(() => window.__fakeFb.saves)).toBeGreaterThan(before);
  // The game logs failed saves with console.error on purpose.
  expect(clean(errors).filter((e) => !/Save failed/.test(e))).toEqual([]);
});

test('two tabs on one city: the newer plays, the older pauses', async ({ context }) => {
  const a = await context.newPage();
  const errors = await newGame(a);
  const b = await context.newPage();
  errors.push(...await watch(b));
  await b.goto('/');
  await expect(b.locator('#game')).toBeVisible();
  await expect(a.locator('#boot-msg')).toContainText('open in another tab');
  await expect(a.locator('#boot-retry')).toHaveText('Play here instead');
  await a.locator('#boot-retry').click();
  await expect(a.locator('#game')).toBeVisible();
  await expect(b.locator('#boot-msg')).toContainText('open in another tab');
  expect(clean(errors)).toEqual([]);
});

test('catch-up after three days away', async ({ page }) => {
  const errors = await newGame(page);
  await page.waitForFunction(() => window.__fakeFb.saves > 0, null, { timeout: 30_000 });
  // Wind the saved clock back three in-game days (a day is 30 minutes), then reload.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('fakefb'));
    for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('plotState/')) { const s = JSON.parse(v.state); s.lastTick -= 3 * 30 * 60_000; v.state = JSON.stringify(s); }
    localStorage.setItem('fakefb', JSON.stringify(db));
  });
  await page.reload();
  await expect(page.locator('#game')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#modal[open]')).toContainText(/away|while you/i);
  expect(clean(errors)).toEqual([]);
});

test('Greek: the interface switches language', async ({ page }) => {
  const errors = await newGame(page);
  await page.locator('#btn-settings').click();
  await page.locator('#modal [data-tab="interface"]').click();
  await page.locator(`#modal [data-pref="lang"][data-val='"el"']`).click();
  await closeModal(page);
  await expect(page.locator('#rail [data-panel="people"]')).toContainText('Κάτοικοι');
  await page.locator('#rail [data-panel="stats"]').click();
  await everyTab(page, '#drawer');
  expect(clean(errors)).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('found a city and open panels on a phone', async ({ page }) => {
    const errors = await newGame(page);
    for (const name of ['goals', 'people', 'chat']) {
      await page.locator(`#rail [data-panel="${name}"]`).click();
      await expect(page.locator('#drawer')).toBeVisible();
      // On a phone the drawer covers the rail, so it's closed before opening the next.
      await page.locator('#drawer [data-close-drawer]').first().click();
      await expect(page.locator('#drawer')).toBeHidden();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(clean(errors)).toEqual([]);
  });
});

test('build: keyboard to an empty tile, pick from the catalogue, money goes down', async ({ page }) => {
  const errors = await newGame(page);
  const money = async () => Number((await page.locator('#v-money').innerText()).replace(/[^0-9-]/g, ''));
  const before = await money();
  await page.locator('#map').focus();
  await page.keyboard.press('b');
  await page.keyboard.press('ArrowDown');   // the first press puts the cursor on the town hall
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#catalog')).toBeVisible();
  await page.locator('#cat-q').fill('house');
  await page.locator('#catalog [data-build]').first().click();
  if (await page.locator('#modal[open]').count()) await page.locator('#modal .primary').click();   // a confirmation for big spends
  await expect.poll(money).toBeLessThan(before);
  expect(clean(errors)).toEqual([]);
});

test('staff: recruit and hire from a building’s panel', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await newGame(page);
  await page.locator('#map').focus();
  await page.keyboard.press('b');
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) await page.keyboard.press(k);
  await page.locator('#cat-q').fill('grocer');
  await page.locator('#catalog [data-build]').first().click();
  if (await page.locator('#modal[open]').count()) await page.locator('#modal .primary').click();
  // Select the same tile and wait for the builders to finish.
  await page.locator('#map').focus();
  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  await expect(page.locator('#drawer [data-do="recruit"]').first()).toBeVisible({ timeout: 90_000 });
  // Either someone moves in, or the game says why not (no home with room, not enough money).
  await page.locator('#drawer [data-do="recruit"]').first().click();
  await expect(page.locator('#toasts')).toContainText(/moving here|No home|Needs \$/);
  if (await page.locator('#drawer [data-do="hire"]').count()) {
    await page.locator('#drawer [data-do="hire"]').first().click();
    await expect(page.locator('#modal[open]')).toContainText('Hire a');
    await closeModal(page);
  }
  expect(clean(errors)).toEqual([]);
});
