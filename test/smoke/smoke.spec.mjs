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

test('interface: sizes, menu directions, hiding and a bigger panel', async ({ page }) => {
  const errors = await newGame(page);
  const shot = (name) => process.env.SHOTS && page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
  const setting = async (pref, val) => {
    await page.locator('#btn-settings').click();
    await page.locator('#modal [data-tab="interface"]').click();
    await page.locator(`#modal [data-pref="${pref}"][data-val='"${val}"']`).click();
    await closeModal(page);
  };
  let step = 0;
  for (const [pref, val] of [['uiSize', 'large'], ['menus', 'down'], ['uiSize', 'small'], ['menus', 'across'], ['uiSize', 'normal']]) {
    await setting(pref, val);
    await expect(page.locator('html')).toHaveAttribute(`data-${pref.toLowerCase()}`, val);
    const panel = ['people', 'stats', 'goals', 'news', 'region'][step++];   // a different one each time, since clicking an open one closes it
    await page.locator(`#rail [data-panel="${panel}"]`).click();
    await expect(page.locator('#drawer')).toBeVisible();
    await shot(`${pref}-${val}`);
  }
  await page.locator('#drawer [data-max-drawer]').click();
  await expect(page.locator('#drawer')).toHaveClass(/max/);
  await shot('drawer-max');
  await page.locator('#btn-min').click();
  await expect(page.locator('#dock')).toBeHidden();
  await expect(page.locator('#ui-restore')).toBeVisible();
  await shot('ui-hidden');
  await page.locator('#ui-restore').click();
  await expect(page.locator('#dock')).toBeVisible();
  expect(clean(errors)).toEqual([]);
});

test('world: neighbours touch, with borders', async ({ browser }) => {
  // Two players in the same browser storage: the second founds next to the first.
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors = await newGame(a);
  await a.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); db.user = null; localStorage.setItem('fakefb', JSON.stringify(db)); });
  const b = await ctx.newPage();
  errors.push(...await watch(b));
  await found(b, { mayor: 'Nia', city: 'Nextdoor' });
  await closeModal(b);
  await b.locator('#btn-world').click();
  await b.waitForTimeout(800);
  if (process.env.SHOTS) await b.screenshot({ path: `${process.env.SHOTS}/world-borders.png` });
  const plots = await b.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fakefb')).docs).filter((k) => k.startsWith('plots/')));
  expect(plots).toEqual(expect.arrayContaining([expect.stringMatching(/^plots\/main_/)]));
  expect(plots.length).toBe(2);
  expect(clean(errors)).toEqual([]);
  await ctx.close();
});

test('council: buy the plot next door and switch between cities', async ({ page }) => {
  const errors = await newGame(page);
  await page.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('plotState/')) { const s = JSON.parse(v.state); s.money = 5000; v.state = JSON.stringify(s); } for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('plots/')) v.money = 5000; localStorage.setItem('fakefb', JSON.stringify(db)); });
  await page.reload();
  await expect(page.locator('#game')).toBeVisible();
  await closeModal(page);
  // Walk the keyboard cursor east off the plot onto the free land next door, and select it.
  await page.locator('#map').focus();
  await page.keyboard.press('e');
  for (let k = 0; k < 14; k++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#drawer [data-do="buyplot"]')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/buy-plot.png` });
  await page.locator('#buy-name').fill('Eastfield');
  await page.locator('#drawer [data-do="buyplot"]').click();
  await expect(page.locator('#modal[open]')).toContainText('Eastfield is founded');
  await page.locator('#open-new').click();
  await expect(page.locator('#city-name')).toContainText('Eastfield', { timeout: 20_000 });
  await closeModal(page);
  await page.locator('#btn-account').click();
  await page.locator('#modal [data-acct-tab="cities"]').click();
  await expect(page.locator('#modal [data-open-city]')).toHaveCount(1);
  await page.locator('#modal [data-open-city]').click();
  await expect(page.locator('#city-name')).toContainText('Testhaven', { timeout: 20_000 });
  expect(clean(errors)).toEqual([]);
});

test('co-mayors: befriend a neighbour, make them co-mayor, watch and take the desk', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors = await newGame(a);   // Mona, Testhaven
  await a.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); db.user = null; localStorage.setItem('fakefb', JSON.stringify(db)); });
  const b = await ctx.newPage();
  errors.push(...await watch(b));
  await b.addInitScript(() => { try { localStorage.setItem('commons-seen-help', '1'); } catch { /* ignore */ } });
  await found(b, { mayor: 'Nia', city: 'Nextdoor' });
  await closeModal(b);
  // Mona walks the keyboard cursor over to Nia's plot and adds her as a friend.
  const [dx, dy] = await a.evaluate(() => {
    const ps = Object.entries(JSON.parse(localStorage.getItem('fakefb')).docs).filter(([k]) => k.startsWith('plots/')).map(([, v]) => v);
    const mona = ps.find((p) => p.name === 'Testhaven'), nia = ps.find((p) => p.name === 'Nextdoor');
    return [nia.px - mona.px, nia.py - mona.py];
  });
  await expect(a.locator('#game')).toBeVisible();
  await a.locator('#map').focus();
  const key = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
  for (let k = 0; k < 14; k++) await a.keyboard.press(key);
  await a.keyboard.press('Enter');
  await a.locator('#drawer [data-do="friend"]').click();
  await a.locator('#btn-account').click();
  await a.locator('#modal [data-acct-tab="friends"]').click();
  await a.locator('#modal [data-co]').click();
  await expect(a.locator('#modal')).toContainText('Co-mayor here');
  await closeModal(a);
  await expect(a.locator('#desk-bar')).toContainText('You’re at the desk');
  // Nia sees Testhaven in her cities, opens it, and watches because Mona is playing.
  await b.locator('#btn-account').click();
  await b.locator('#modal [data-acct-tab="cities"]').click();
  await expect(b.locator('#modal')).toContainText('Co-mayor with Mona');
  await b.locator('#modal [data-open-city]').click();
  await expect(b.locator('#city-name')).toContainText('Testhaven', { timeout: 20_000 });
  await closeModal(b);
  await expect(b.locator('#desk-bar')).toContainText('Watching: Mona');
  await expect(b.locator('#desk-take')).toBeDisabled();
  await b.keyboard.press('b');
  await expect(b.locator('#dock [data-mode="build"]')).toHaveAttribute('aria-checked', 'false');
  if (process.env.SHOTS) await b.screenshot({ path: `${process.env.SHOTS}/co-watching.png` });
  // Mona goes idle: Nia can take the desk, and Mona starts watching.
  await a.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('desks/')) v.idle = true; localStorage.setItem('fakefb', JSON.stringify(db)); });
  await expect(b.locator('#desk-take')).toBeEnabled({ timeout: 10_000 });
  await b.locator('#desk-take').click();
  await expect(b.locator('#desk-bar')).toContainText('You’re at the desk', { timeout: 10_000 });
  await expect(a.locator('#desk-bar')).toContainText('Watching: Nia', { timeout: 10_000 });
  expect(clean(errors)).toEqual([]);
  await ctx.close();
});

test('resources: the Resources tab and research tree after a day', async ({ page }) => {
  const errors = await newGame(page);
  // Pretend a day has passed with some figures, then look at the tab.
  await page.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('plotState/')) { const s = JSON.parse(v.state); s.lastTick -= 30 * 60_000; v.state = JSON.stringify(s); } localStorage.setItem('fakefb', JSON.stringify(db)); });
  await page.reload();
  await expect(page.locator('#game')).toBeVisible({ timeout: 30_000 });
  await closeModal(page);
  await page.locator('#rail [data-panel="stats"]').click();
  await page.locator('#drawer [role="tab"]', { hasText: 'Resources' }).click();
  await expect(page.locator('#drawer .restable')).toBeVisible();
  await expect(page.locator('#drawer .restable')).toContainText('Vegetables');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/resources.png` });
  expect(clean(errors)).toEqual([]);
});

test('market: one mayor sells vegetables, another buys them, and a loan request is lent to', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors = await newGame(a);   // Mona, Testhaven
  // Give Mona 120 vegetables in store (as if her farms had been busy).
  await a.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); for (const [k, v] of Object.entries(db.docs)) if (k.startsWith('plotState/')) { const s = JSON.parse(v.state); s.res = { veg: 120 }; v.state = JSON.stringify(s); } db.user = null; localStorage.setItem('fakefb', JSON.stringify(db)); });
  await a.reload();
  await expect(a.locator('#game')).toBeVisible();
  await closeModal(a);
  await a.locator('#rail [data-panel="market"]').click();
  await a.locator('#drawer [data-mtab="post"]').click();
  await a.locator('#drawer select[name="res"]').selectOption('veg');
  await a.locator('#drawer input[name="qty"]').fill('100');
  await a.locator('#drawer input[name="price"]').fill('0.5');
  await a.locator('#drawer #mk-post button[type=submit]').click();
  await expect(a.locator('#drawer')).toContainText('Selling 100 vegetables at $0.50 each');
  // Nia founds next door, buys the vegetables, and asks for a loan.
  const b = await ctx.newPage();
  errors.push(...await watch(b));
  await b.addInitScript(() => { try { localStorage.setItem('commons-seen-help', '1'); } catch { /* ignore */ } });
  await found(b, { mayor: 'Nia', city: 'Nextdoor' });
  await closeModal(b);
  await b.locator('#rail [data-panel="market"]').click();
  await expect(b.locator('#drawer')).toContainText('Testhaven');
  await b.locator('#drawer [data-take]').first().click();
  await expect(b.locator('#toasts')).toContainText('Bought 100 vegetables');
  // Mona is paid $50.
  await expect(a.locator('#toasts')).toContainText('bought your vegetables for $50', { timeout: 10_000 });
  await b.locator('#drawer [data-mtab="post"]').click();
  await b.locator('#mk-kind').selectOption('loan');
  await b.locator('#drawer input[name="amount"]').fill('500');
  await b.locator('#drawer input[name="repay"]').fill('550');
  await b.locator('#drawer #mk-post button[type=submit]').click();
  await a.locator('#drawer [data-mtab="offers"]').click();
  await a.locator('#drawer [data-take]').first().click();
  await expect(a.locator('#toasts')).toContainText('Lent $500 to Nextdoor');
  await expect(b.locator('#toasts')).toContainText('lent you $500', { timeout: 10_000 });
  await b.locator('#drawer [data-mtab="yours"]').click();
  await expect(b.locator('#drawer')).toContainText('$550 to Testhaven');
  await expect(b.locator('#drawer')).not.toContainText('$500 to Testhaven');   // the loan arrives once, not twice
  await expect(b.locator('#v-money')).toContainText('$3,450');   // 3,000 - 50 for vegetables + 500 lent
  if (process.env.SHOTS) await b.screenshot({ path: `${process.env.SHOTS}/market.png` });
  expect(clean(errors)).toEqual([]);
  await ctx.close();
});

test('private messages: message a neighbour, who sees it and replies', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors = await newGame(a);
  await a.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefb')); db.user = null; localStorage.setItem('fakefb', JSON.stringify(db)); });
  const b = await ctx.newPage();
  errors.push(...await watch(b));
  await b.addInitScript(() => { try { localStorage.setItem('commons-seen-help', '1'); } catch { /* ignore */ } });
  await found(b, { mayor: 'Nia', city: 'Nextdoor' });
  await closeModal(b);
  const [dx, dy] = await a.evaluate(() => {
    const ps = Object.entries(JSON.parse(localStorage.getItem('fakefb')).docs).filter(([k]) => k.startsWith('plots/')).map(([, v]) => v);
    const m = ps.find((p) => p.name === 'Testhaven'), n = ps.find((p) => p.name === 'Nextdoor');
    return [n.px - m.px, n.py - m.py];
  });
  await a.locator('#map').focus();
  for (let k = 0; k < 14; k++) await a.keyboard.press(dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await a.keyboard.press('Enter');
  await a.locator('#drawer [data-do="dm"]').click();
  await a.locator('#dm-text').fill('Want to trade vegetables?');
  await a.locator('#dm-text').press('Enter');
  await expect(a.locator('#dm-list')).toContainText('Want to trade vegetables?');
  // Nia gets a notice and a dot, opens her messages and replies.
  await expect(b.locator('#chat-dot')).toBeVisible({ timeout: 10_000 });
  await b.locator('#rail [data-panel="chat"]').click();
  await b.locator('#drawer [data-panel-go="dm"]').click();
  await b.locator('#drawer [data-dm]').click();
  await expect(b.locator('#dm-list')).toContainText('Want to trade vegetables?');
  await b.locator('#dm-text').fill('Yes please');
  await b.locator('#dm-text').press('Enter');
  await expect(a.locator('#dm-list')).toContainText('Yes please', { timeout: 10_000 });
  if (process.env.SHOTS) await a.screenshot({ path: `${process.env.SHOTS}/dm.png` });
  expect(clean(errors)).toEqual([]);
  await ctx.close();
});
