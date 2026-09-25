import * as sim from './sim.js';
import {
  T, B, BUILDABLE, PLOT, TICK_MS, MAX_OFFLINE_DAYS, HOURS_PER_DAY, SAVE_EVERY_MS, RUBBLE_CLEAR_COST, GOALS,
  MAX_LEVEL, LEVEL, UPGRADABLE,
} from './constants.js';
import { Renderer, STRIDE, thumbnail, modelHeight } from './render.js';
import { loadPrefs, savePrefs, applyPrefs, resolvedTheme, palette, PALETTES } from './prefs.js';
import { play, setSound } from './sound.js';
import { firebaseConfig } from './config.js';
import * as fb from './firebase.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.floor(n)).toLocaleString()}`;
const pct = (n) => `${Math.round(n * 100)}%`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hourLabel = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : `${h % 12} ${h < 12 ? 'am' : 'pm'}`);
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- state ----------
let prefs = loadPrefs();
let user = null, plotId = null, me = null, state = null, mayor = '';
let traffic = null, totalsNow = null;
let tool = 'look', overlay = null, hover = null, cursor = null, selected = null;
let pops = [], cars = [], routes = [], undoStack = [];
let saveTimer = null, lastSave = Date.now(), loopTimer = null, worldTimer = null;
let spaceHeld = false, dirty = true, lastFrame = performance.now(), warnedDay = -1;
const plots = new Map();
const byXY = new Map();

const canvas = $('map');
const renderer = new Renderer(canvas);

const TOOLS = [
  { id: 'look', name: 'Look', key: '1', icon: 'i-look', desc: 'Inspect anything. Tap a building site to help your builders.' },
  ...BUILDABLE.map((t, k) => ({ id: B[t].key, type: t, name: B[t].name, cost: B[t].cost, key: String(k + 2), desc: B[t].blurb })),
  { id: 'upgrade', name: 'Upgrade', key: '8', icon: 'i-up', desc: 'Raise a building a level: more room and jobs, more upkeep.' },
  { id: 'bulldoze', name: 'Clear', key: '9', icon: 'i-clear', desc: `Remove a building or road. Rubble costs $${RUBBLE_CLEAR_COST} to clear.` },
];
const toolDef = (id) => TOOLS.find((t) => t.id === id);

const NEEDS = [
  { k: 'jobs', icon: 'i-jobs', label: 'Jobs', fix: 'Build workplaces or shops so everyone can work.' },
  { k: 'commute', icon: 'i-car', label: 'Commute', fix: 'Trips to work are failing. Connect homes to jobs by road, or add a second route.' },
  { k: 'shops', icon: 'i-bag', label: 'Shopping', fix: 'Build a shop on a road near homes.' },
  { k: 'homes', icon: 'i-house', label: 'Room to grow', fix: 'Build houses so new people can move in.' },
  { k: 'school', icon: 'i-school', label: 'Schooling', fix: 'Build or upgrade a school to train builders and professionals.' },
  { k: 'leisure', icon: 'i-tree', label: 'Leisure', fix: 'Put parks within 3 tiles of homes.' },
];
const SURNAMES = ['Nguyen', 'Okafor', 'Papadopoulos', 'Smith', 'Kowalski', 'García', 'Chen', 'Haddad', 'Ivanova', 'Silva', 'Kaur', 'Tanaka',
  'Murphy', 'Rossi', 'Mensah', 'Kim', 'Novak', 'Ali', 'Jensen', 'Costa', 'Walker', 'Fernando', 'Nakamura', 'Petrov', 'Obi', 'Laurent', 'Doyle',
  'Sato', 'Horvat', 'Tran', 'Kelly', 'Moreau', 'Ahmed', 'Lindqvist', 'Reyes', 'Sharma'];
const CITY_NAMES = ['Maple Bay', 'Riverside', 'Kingsford', 'Ashgrove', 'Bellhaven', 'Coral Point', 'Elm Hollow', 'Fernvale', 'Glenmore', 'Harbourview', 'Oakridge', 'Wattle Creek'];

// ---------- preferences ----------
function applyAll() {
  applyPrefs(prefs);
  renderer.view = prefs.view;
  setSound(prefs.sound, prefs.volume);
  $('view-3d').setAttribute('aria-pressed', prefs.view === '3d');
  $('view-2d').setAttribute('aria-pressed', prefs.view === 'flat');
  $('minibox').classList.toggle('hidden', !prefs.minimap);
  if (!prefs.cars || prefs.reducedMotion) cars = [];
  drawThumbs();
  drawHeroes();
  drawMinimap();
  dirty = true;
}
function setPref(k, v) { prefs[k] = v; savePrefs(prefs); applyAll(); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => prefs.theme === 'auto' && applyAll()); } catch { /* old browsers */ }
applyPrefs(prefs);

// ---------- screens ----------
function show(which) {
  for (const id of ['boot', 'auth', 'found', 'game']) $(id).classList.toggle('hidden', id !== which);
  if (which === 'game') { renderer.resize(); dirty = true; }
  if (which === 'auth' || which === 'found') requestAnimationFrame(drawHeroes);
}

// ---------- hero city (sign-in backdrop) ----------
function demoCity() {
  const s = sim.newCity('Demo');
  s.money = 1e7;
  const put = (x, y, t) => sim.place(s, sim.idx(x, y), t);
  for (let k = 3; k <= 20; k++) { put(k, 12, T.ROAD); put(12, k, T.ROAD); }
  for (let k = 6; k <= 18; k++) { put(k, 7, T.ROAD); put(k, 17, T.ROAD); }
  for (let k = 8; k <= 11; k++) put(6, k, T.ROAD);
  for (let k = 13; k <= 16; k++) put(18, k, T.ROAD);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 4; y < 21; y++) {
    for (let x = 4; x < 21; x++) {
      const i = sim.idx(x, y);
      if (s.grid[i] !== T.EMPTY || !sim.neighbours(i).some((n) => s.grid[n] === T.ROAD)) continue;
      const r = rnd();
      const t = r < 0.52 ? T.HOUSE : r < 0.66 ? T.WORK : r < 0.78 ? T.SHOP : r < 0.9 ? T.PARK : r < 0.95 ? T.SCHOOL : null;
      if (t) put(x, y, t);
    }
  }
  for (const q of s.queue) { s.cond[q.i] = 100; if (UPGRADABLE.includes(s.grid[q.i])) s.lv[q.i] = 1 + Math.floor(rnd() * 3); }
  s.queue = [];
  return s;
}
let demo = null;
function drawHeroes() {
  for (const id of ['hero', 'hero2']) {
    const c = $(id);
    if (!c || c.closest('.hidden')) continue;
    demo ||= demoCity();
    const r = new Renderer(c);
    r.view = '3d';
    r.cam = { x: 12.5, y: 12.5, z: Math.max(12, Math.min(34, Math.min(r.w / 44, r.h / 20))) };
    if (r.w > 900) { const d = 250 / (2 * r.cam.z); r.cam.x += d; r.cam.y -= d; }   // shift the city left of the card
    const p = plotFrom('demo', 0, 0, demo, { ownerName: '' });
    r.draw({ plots: new Map([['demo', p]]), theme: resolvedTheme(prefs), palette: palette(prefs), paletteKey: prefs.colours,
      prefs, pops: [], nightAmt: 0, shapes: false });
  }
}
window.addEventListener('resize', () => { drawHeroes(); renderer.resize(); dirty = true; });

// ---------- sign-in screen ----------
let authMode = 'signin';
function setAuthMode(mode) {
  authMode = mode;
  $('tab-signin').setAttribute('aria-selected', mode === 'signin');
  $('tab-create').setAttribute('aria-selected', mode === 'create');
  $('auth-submit').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
  $('auth-pass').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('auth-forgot').classList.toggle('hidden', mode !== 'signin');
  $('auth-msg').textContent = '';
}
$('tab-signin').onclick = () => setAuthMode('signin');
$('tab-create').onclick = () => setAuthMode('create');

async function busy(btn, fn, msgEl = $('auth-msg')) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  msgEl.textContent = '';
  msgEl.classList.remove('ok');
  try { await fn(); } catch (e) { console.error(e); msgEl.textContent = fb.authMessage(e); play('error'); }
  finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}

$('email-form').onsubmit = (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value;
  busy($('auth-submit'), () => (authMode === 'signin' ? fb.signInEmail(email, pass) : fb.createEmail(email, pass)));
};
$('auth-forgot').onclick = () => busy(null, async () => {
  const email = $('auth-email').value.trim();
  if (!email) throw new Error('Type your email above first, then press this again.');
  await fb.resetPassword(email);
  $('auth-msg').textContent = `Reset link sent to ${email}.`;
  $('auth-msg').classList.add('ok');
});
$('auth-google').onclick = () => busy($('auth-google'), fb.signInGoogle);
$('auth-guest').onclick = () => busy($('auth-guest'), fb.signInGuest);

// ---------- found a city ----------
$('found-form').onsubmit = (e) => {
  e.preventDefault();
  const m = $('found-mayor').value.trim(), c = $('found-city').value.trim();
  if (!m || !c) { $('found-msg').textContent = 'Give yourself and your city a name.'; return; }
  busy($('found-go'), async () => {
    const doc = await fb.claimPlot(user, m, c);
    if (!user.isAnonymous && !user.displayName) fb.setDisplayName(m).catch(() => {});
    startGame(doc);
  }, $('found-msg'));
};
$('found-out').onclick = () => fb.signOutUser();

// ---------- routing ----------
if (firebaseConfig.apiKey === 'REPLACE_ME') {
  show('auth');
  $('auth-msg').textContent = 'Add your Firebase web config to public/js/config.js, then reload.';
}

fb.onAuth(async (u) => {
  stopLoops();
  user = u;
  if (!u) { state = null; closeModal(); show('auth'); return; }
  show('boot');
  try {
    const doc = await fb.findPlot(u);
    if (doc) { startGame(doc); return; }
    const base = u.displayName || (u.email ? u.email.split('@')[0] : '');
    $('found-mayor').value = base.slice(0, 20);
    $('found-city').value = CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)];
    $('found-msg').textContent = '';
    show('found');
    (base ? $('found-city') : $('found-mayor')).focus();
  } catch (e) {
    console.error(e);
    show('auth');
    $('auth-msg').textContent = `Couldn't reach your city: ${fb.authMessage(e)}`;
  }
});

function startGame(doc) {
  plotId = doc.id;
  mayor = doc.ownerName || 'Mayor';
  state = sim.migrate(JSON.parse(doc.state));
  plots.clear(); byXY.clear();
  me = toPlot(doc);
  addPlot(me);
  refreshDerived();
  const report = advance();
  syncMine();
  show('game');
  applyAll();
  buildTools();
  fitHome();
  updateHud();
  renderGoals();
  startLoops();
  refreshWorld();
  if (innerWidth < 860) { $('pulse').classList.add('closed'); $('pulse-toggle').setAttribute('aria-expanded', 'false'); }
  if (state.status === 'ruins') showRuins();
  else if (report) showAway(report);
  else if (!localStorage.getItem('commons-seen-help')) { showHelp(); toggleGoals(true); }
  canvas.focus({ preventScroll: true });
}

// ---------- plots ----------
function plotFrom(id, px, py, st, meta) {
  return {
    id, px, py, name: st.name, ownerName: meta.ownerName, status: st.status,
    pop: sim.totalPop(st), peakPop: st.peakPop, day: st.day, happiness: st.happiness, cityNo: st.cityNo,
    grid: st.grid, cond: st.cond, lv: st.lv, uc: sim.underConstruction(st),
    queueMap: new Map(st.queue.map((q) => [q.i, q])), version: meta.version ?? 0, mine: !!meta.mine,
  };
}
function toPlot(d) {
  let st;
  try { st = sim.migrate(JSON.parse(d.state)); } catch { return null; }
  return plotFrom(d.id, d.px, d.py, st, { ownerName: d.ownerName, version: d.updatedAt?.toMillis?.() ?? 0, mine: d.owner === user.uid });
}
function addPlot(p) {
  if (!p) return;
  plots.set(p.id, p);
  byXY.set(`${p.px},${p.py}`, p.id);
}
function syncMine() {
  Object.assign(me, plotFrom(me.id, me.px, me.py, state, { ownerName: mayor, mine: true, version: (me.version || 0) + 1 }));
  dirty = true;
}
async function refreshWorld() {
  try {
    for (const d of await fb.loadWorld()) if (d.id !== plotId) addPlot(toPlot(d));
    drawMinimap();
    dirty = true;
  } catch (e) { console.error('World load failed', e); }
}

// ---------- time ----------
function refreshDerived() {
  totalsNow = sim.totals(state);
  traffic = sim.computeTraffic(state, undefined, totalsNow);
  rebuildRoutes();
}

function advance() {
  const due = Math.floor((Date.now() - state.lastTick) / TICK_MS);
  if (due <= 0) return null;
  const cap = MAX_OFFLINE_DAYS * HOURS_PER_DAY;
  const before = { day: state.day, money: state.money, pop: sim.totalPop(state) };
  const n = Math.min(due, cap);
  let lastDay = null;
  for (let k = 0; k < n; k++) {
    const r = sim.tick(state);
    if (r.traffic) { traffic = r.traffic; totalsNow = r.totals; }
    if (r.day) lastDay = r.day;
    if (r.collapsed) { onCollapse(r.collapsed); break; }
  }
  state.lastTick = due > cap || state.status !== 'alive' ? Date.now() : state.lastTick + n * TICK_MS;
  rebuildRoutes();
  if (n >= HOURS_PER_DAY) { state._finished = []; return { ...before, capped: due > cap, days: state.day - before.day }; }
  if (lastDay) onNewDay(lastDay);
  return null;
}

function onNewDay(st) {
  const hall = sim.xy(sim.HALL_INDEX);
  if (st.income > 0) { addPop(hall.x, hall.y, 1.8, `+${money(st.income)}`, '#ffd24a'); play('coin'); }
  if (state.day === warnedDay) return;
  warnedDay = state.day;
  const pop = sim.totalPop(state);
  if (state.unpaidDays) notify(`Upkeep unpaid for ${state.unpaidDays} day${state.unpaidDays > 1 ? 's' : ''}. Buildings are decaying.`, 'warn');
  else if (st.departures) notify(`${st.departures} ${st.departures > 1 ? 'people' : 'person'} left. Check the needs panel.`, 'warn');
  else if (st.failedTrips > pop * 0.25 && pop > 10) notify(`${st.failedTrips} trips failed yesterday. Turn on traffic to find the jams.`, 'warn');
  else if (st.arrivals) notify(`${st.arrivals} new ${st.arrivals > 1 ? 'people' : 'person'} moved in.`, 'info');
  if (st.graduates) notify(`${st.graduates} graduate${st.graduates > 1 ? 's' : ''} joined the workforce.`, 'good');
}

function drainFinished() {
  const list = state._finished || [];
  state._finished = [];
  for (const f of list) {
    const { x, y } = sim.xy(f.i), t = state.grid[f.i];
    if (t === T.EMPTY || t === T.ROAD) continue;
    if (f.up) { addPop(x, y, modelHeight(t, state.lv[f.i]) + 0.4, `Level ${state.lv[f.i]}`, '#ffffff'); play('level'); announce(`${B[t].name} reached level ${state.lv[f.i]}.`); }
    else { addPop(x, y, modelHeight(t) + 0.4, 'Built', '#ffffff'); play('done'); }
  }
  if (list.length) refreshDerived();
}

function checkGoals() {
  const got = sim.checkGoals(state, totalsNow || sim.totals(state));
  if (!got.length) return;
  const sum = got.reduce((a, g) => a + g.reward, 0), hall = sim.xy(sim.HALL_INDEX);
  addPop(hall.x, hall.y, 2, `+${money(sum)}`, '#ffd24a');
  notify(got.length === 1 ? `Goal complete: ${got[0].text}. You earned ${money(sum)}.` : `${got.length} goals complete. You earned ${money(sum)}.`, 'good');
  play('goal');
  renderGoals();
  scheduleSave();
}

function startLoops() {
  stopLoops();
  loopTimer = setInterval(() => {
    if (!state) return;
    advance();
    drainFinished();
    checkGoals();
    syncMine();
    updateHud();
    drawMinimap();
    if (selected) refreshInspector();
    if (Date.now() - lastSave > SAVE_EVERY_MS) save();
  }, 500);
  worldTimer = setInterval(refreshWorld, 5 * 60 * 1000);
}
function stopLoops() { clearInterval(loopTimer); clearInterval(worldTimer); }

document.addEventListener('visibilitychange', () => {
  if (!state) return;
  if (document.hidden) save();
  else { const r = advance(); syncMine(); updateHud(); if (r) showAway(r); }
});
window.addEventListener('pagehide', () => state && save());

// ---------- saving ----------
function scheduleSave(ms = 2500) { clearTimeout(saveTimer); saveTimer = setTimeout(save, ms); }
async function save(extra) {
  if (!state || !plotId || !user) return;
  clearTimeout(saveTimer);
  lastSave = Date.now();
  try { await fb.savePlot(plotId, state, extra); } catch (e) { console.error(e); notify('Couldn’t save just now. Your city is safe here and will retry.', 'warn'); }
}

// ---------- actions ----------
function afterChange() {
  refreshDerived();
  syncMine();
  updateHud();
  if (selected) refreshInspector();
  scheduleSave();
}
const isMine = (h) => !!h && !!me && h.px === me.px && h.py === me.py;

function act(h, quiet) {
  if (!isMine(h)) return;
  const { x, y } = sim.xy(h.i);
  let r;
  if (tool === 'bulldoze') {
    r = sim.bulldoze(state, h.i);
    if (r.ok) { play('clear'); if (r.refund) addPop(x, y, 0.6, `${r.refund > 0 ? '+' : ''}${money(r.refund)}`, r.refund > 0 ? '#ffd24a' : '#ffffff'); }
  } else if (tool === 'upgrade') {
    r = sim.upgrade(state, h.i);
    if (r.ok) { play('place'); addPop(x, y, 1.2, `−$${r.cost}`, '#ffffff'); announce(`Upgrading ${B[state.grid[h.i]].name} for ${money(r.cost)}.`); }
  } else {
    const def = toolDef(tool);
    r = sim.place(state, h.i, def.type);
    if (r.ok) {
      play('place');
      undoStack.push(h.i);
      if (undoStack.length > 30) undoStack.shift();
      if (def.type !== T.ROAD) addPop(x, y, 0.8, `−$${r.cost}`, '#ffffff');
      announce(`${def.name} placed at ${x + 1}, ${y + 1}. ${money(state.money)} left.`);
    }
  }
  if (r.ok) afterChange();
  else if (!quiet || r.reason.startsWith('Needs')) { notify(r.reason, 'act'); play('error'); }
}

function tap(i) {
  const r = sim.tapHelp(state, i);
  const { x, y } = sim.xy(i);
  if (r.ok) {
    play(r.done ? 'done' : 'tap');
    addPop(x, y, 1.2, r.done ? 'Built' : pct(r.progress), '#ffffff');
    afterChange();
  } else if (r.reason) notify(r.reason, 'act');
}

function click(h) {
  if (!h) { select(null); return; }
  if (tool === 'look' || !isMine(h)) {
    if (!isMine(h) && tool !== 'look') {
      const p = plots.get(byXY.get(`${h.px},${h.py}`));
      notify(p ? `That plot belongs to ${p.ownerName}.` : 'Nobody has claimed that land yet.', 'act');
    }
    if (isMine(h) && state.queue.some((q) => q.i === h.i)) tap(h.i);
    select(h);
    return;
  }
  act(h, false);
}

function undo() {
  while (undoStack.length) {
    const i = undoStack.pop();
    const r = sim.undoPlace(state, i);
    if (r.ok) { play('clear'); notify(`Undone. ${money(r.refund)} back.`, 'act'); afterChange(); return; }
  }
  notify('Nothing to undo. Builders keep what they’ve started.', 'act');
}

function hoverInfo(h) {
  if (!isMine(h)) return null;
  const out = { ...h, tool };
  if (tool === 'look') out.ok = true;
  else if (tool === 'bulldoze') out.ok = state.grid[h.i] !== T.EMPTY && state.grid[h.i] !== T.HALL;
  else if (tool === 'upgrade') out.ok = sim.canUpgrade(state, h.i).ok;
  else { const d = toolDef(tool); out.ok = sim.canPlace(state, h.i, d.type).ok; out.ghost = d.type; }
  return out;
}

function onCollapse(record) {
  syncMine();
  save();
  fb.writeLegacy(user, plotId, mayor, record).catch((e) => console.error('Legacy write failed', e));
  play('warn');
  showRuins(record);
}

// ---------- cars and floating numbers ----------
function rebuildRoutes() {
  routes = [];
  if (traffic) for (const h of traffic.homes) {
    if (h.workPath?.length > 1) routes.push(h.workPath);
    if (h.shopPath?.length > 1) routes.push(h.shopPath);
  }
}
function spawnCar(car = {}) {
  const path = routes[Math.floor(Math.random() * routes.length)];
  car.path = Math.random() < 0.5 ? [...path].reverse() : path;
  car.s = car.s === undefined ? Math.random() * (path.length - 1) : 0;
  car.v = 1.1 + Math.random() * 0.8;
  car.c = Math.floor(Math.random() * 6);
  return car;
}
const drivable = (i) => state.grid[i] === T.ROAD || state.grid[i] === T.HALL;
function updateCars(dt) {
  const want = state && prefs.cars && !prefs.reducedMotion && state.status === 'alive' && routes.length
    ? Math.min(42, Math.round(sim.totalPop(state) / 4)) : 0;
  while (cars.length < want) cars.push(spawnCar());
  if (cars.length > want) cars.length = want;
  const byTile = new Map();
  for (const car of cars) {
    const tile = car.path[Math.floor(car.s)];
    if (!drivable(tile)) { spawnCar(car); continue; }
    const ratio = traffic && traffic.cap[tile] ? traffic.load[tile] / traffic.cap[tile] : 0;
    car.s += dt * car.v * (ratio > 1 ? 0.35 / ratio : 1);
    if (car.s >= car.path.length - 1) spawnCar(car);
    const a = Math.floor(car.s), f = car.s - a;
    const p = car.path[a], q = car.path[Math.min(a + 1, car.path.length - 1)];
    const ax = (p % PLOT) + 0.5, ay = Math.floor(p / PLOT) + 0.5, bx = (q % PLOT) + 0.5, by = Math.floor(q / PLOT) + 0.5;
    const dx = bx - ax, dy = by - ay;
    car.lx = ax + dx * f - dy * 0.2;
    car.ly = ay + dy * f + dx * 0.2;
    const t = f < 0.5 ? p : q;
    if (!byTile.has(t)) byTile.set(t, []);
    byTile.get(t).push(car);
  }
  return byTile;
}
function addPop(tx, ty, h, text, col) {
  if (!prefs.popups || !me) return;
  pops.push({ wx: me.px * STRIDE + tx + 0.5, wy: me.py * STRIDE + ty + 0.5, h, text, col, t0: performance.now(), dur: 1400 });
}

function nightAmt() {
  if (!prefs.dayNight || !state) return 0;
  const h = state.hour + Math.min(1, (Date.now() - state.lastTick) / TICK_MS);
  if (h >= 20 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 7) return 1 - (h - 5) / 2;
  return 0;
}

// ---------- input ----------
const pointers = new Map();
let drag = null, pinch = null;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  cursor = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: gap(a, b), z: renderer.cam.z };
    drag = null;
    return;
  }
  const panOnly = e.button !== 0 || spaceHeld || e.shiftKey;
  const h = renderer.hit(e.offsetX, e.offsetY);
  const paints = !panOnly && (tool === 'road' || tool === 'bulldoze') && isMine(h);
  drag = { x: e.offsetX, y: e.offsetY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false, paints, last: null, button: e.button };
  if (paints) { act(h, false); drag.last = h.i; }
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.z * gap(a, b) / pinch.d) / renderer.cam.z);
    dirty = true;
    return;
  }
  const h = renderer.hit(e.offsetX, e.offsetY);
  if (drag) {
    if (Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) > 5) drag.moved = true;
    if (drag.paints) {
      if (isMine(h) && h.i !== drag.last) { act(h, true); drag.last = h.i; }
    } else if (drag.moved) {
      renderer.cam.x = drag.cx; renderer.cam.y = drag.cy;
      const a = renderer.toWorld(drag.x, drag.y), b = renderer.toWorld(e.offsetX, e.offsetY);
      renderer.cam.x = drag.cx - (b.x - a.x);
      renderer.cam.y = drag.cy - (b.y - a.y);
      canvas.classList.add('panning');
    }
  }
  hover = e.pointerType === 'touch' ? null : hoverInfo(h);
  dirty = true;
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  canvas.classList.remove('panning');
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  if (drag && !drag.moved && !drag.paints && drag.button === 0) click(renderer.hit(e.offsetX, e.offsetY));
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { hover = null; dirty = true; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  dirty = true;
}, { passive: false });

// Keyboard play: a tile cursor on your own plot.
function moveCursor(dx, dy) {
  if (!me) return;
  if (!cursor) { const c = sim.xy(sim.HALL_INDEX); cursor = { px: me.px, py: me.py, tx: c.x, ty: c.y }; }
  else {
    cursor.tx = Math.max(0, Math.min(PLOT - 1, cursor.tx + dx));
    cursor.ty = Math.max(0, Math.min(PLOT - 1, cursor.ty + dy));
  }
  cursor.i = cursor.ty * PLOT + cursor.tx;
  const wx = me.px * STRIDE + cursor.tx + 0.5, wy = me.py * STRIDE + cursor.ty + 0.5;
  const [sx, sy] = renderer.project(wx, wy);
  if (sx < renderer.w * 0.2 || sx > renderer.w * 0.8 || sy < renderer.h * 0.2 || sy > renderer.h * 0.72) renderer.centerOn(wx, wy);
  hover = hoverInfo(cursor);
  announce(describeTile(cursor.i));
  dirty = true;
}

window.addEventListener('keydown', (e) => {
  if (!state || $('game').classList.contains('hidden')) return;
  if (e.target.closest('input, textarea, select, dialog')) return;
  const k = e.key, lk = k.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && lk === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const onMap = document.activeElement === canvas;
  if (e.code === 'Space' && !onMap) { spaceHeld = true; return; }
  const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (onMap && arrows[k]) { e.preventDefault(); moveCursor(...arrows[k]); return; }
  if (onMap && (k === 'Enter' || k === ' ') && cursor) { e.preventDefault(); click(cursor); return; }
  const pan = { w: [0, -60], a: [-60, 0], s: [0, 60], d: [60, 0] }[lk];
  if (pan) { renderer.panBy(-pan[0], -pan[1]); dirty = true; return; }
  if (k === '+' || k === '=') { renderer.zoomAt(renderer.w / 2, renderer.h / 2, 1.2); dirty = true; return; }
  if (k === '-' || k === '_') { renderer.zoomAt(renderer.w / 2, renderer.h / 2, 1 / 1.2); dirty = true; return; }
  const t = TOOLS.find((t) => t.key === k);
  if (t) { selectTool(t.id); announce(`${t.name} selected`); return; }
  const actions = {
    '0': fitWorld, t: toggleTraffic, v: toggleView, h: fitHome, g: () => setPref('grid', !prefs.grid),
    m: () => { setPref('sound', !prefs.sound); notify(prefs.sound ? 'Sound on' : 'Sound off', 'act'); },
    o: () => toggleGoals(), l: showBoard, ',': showSettings, '?': showHelp,
    escape: () => { selectTool('look'); select(null); cursor = null; hover = null; toggleGoals(false); },
  };
  if (actions[lk]) { e.preventDefault(); actions[lk](); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });

// ---------- frame ----------
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state && !$('game').classList.contains('hidden')) {
    pops = pops.filter((p) => now - p.t0 < p.dur);
    const carsByTile = updateCars(dt);
    if (dirty || cars.length || pops.length) {
      renderer.draw({
        plots, hover, cursor, selected, overlay, traffic, cars, carsByTile, pops, prefs,
        theme: resolvedTheme(prefs), palette: palette(prefs), paletteKey: prefs.colours, shapes: prefs.shapes, nightAmt: nightAmt(),
      });
      dirty = false;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- camera ----------
function fitHome() {
  if (!me) return;
  renderer.centerOnPlot(me.px, me.py);
  const w = renderer.w, h = renderer.h - 170, span = w < 600 ? 10 : 17;   // frame the middle of the plot, where cities start
  renderer.cam.z = prefs.view === 'flat'
    ? Math.max(9, Math.min(44, Math.min(w, h) * 0.92 / (span * 1.3)))
    : Math.max(9, Math.min(44, Math.min(w * 0.92 / (2 * span), h * 0.95 / (span + 2))));
  if (prefs.view === '3d') { renderer.cam.x += 0.6; renderer.cam.y += 0.6; }
  dirty = true;
}
function fitWorld() {
  const all = [...plots.values()];
  if (!all.length) return;
  const xs = all.map((p) => p.px), ys = all.map((p) => p.py);
  const minX = Math.min(...xs), maxX = Math.max(...xs) + 1, minY = Math.min(...ys), maxY = Math.max(...ys) + 1;
  renderer.centerOn(((minX + maxX) / 2) * STRIDE, ((minY + maxY) / 2) * STRIDE);
  const span = (Math.max(maxX - minX, maxY - minY) + 0.6) * STRIDE;
  renderer.cam.z = prefs.view === 'flat'
    ? Math.max(1.6, Math.min(8, Math.min(renderer.w, renderer.h) * 0.85 / (span * 1.3)))
    : Math.max(1.6, Math.min(8, Math.min(renderer.w / (2 * span), renderer.h / span) * 0.9));
  dirty = true;
  refreshWorld();
}
function toggleTraffic() {
  overlay = overlay === 'traffic' ? null : 'traffic';
  $('btn-traffic').setAttribute('aria-pressed', overlay === 'traffic');
  announce(overlay ? 'Traffic shown. Green roads flow, red roads are jammed.' : 'Traffic hidden.');
  dirty = true;
}
function toggleView() {
  const c = { x: renderer.cam.x, y: renderer.cam.y };
  setPref('view', prefs.view === '3d' ? 'flat' : '3d');
  renderer.centerOn(c.x, c.y);
  announce(prefs.view === '3d' ? '3D view' : '2D view');
}
$('view-3d').onclick = () => prefs.view !== '3d' && toggleView();
$('view-2d').onclick = () => prefs.view !== 'flat' && toggleView();
$('btn-traffic').onclick = toggleTraffic;
$('btn-home').onclick = fitHome;
$('btn-world').onclick = fitWorld;
$('btn-goals').onclick = () => toggleGoals();
$('btn-board').onclick = showBoard;
$('btn-settings').onclick = showSettings;
$('btn-account').onclick = showAccount;
$('btn-help').onclick = showHelp;
$('btn-undo').onclick = undo;
$('city-name').onclick = showRename;
$('pulse-toggle').onclick = () => {
  const open = $('pulse-toggle').getAttribute('aria-expanded') !== 'true';
  $('pulse-toggle').setAttribute('aria-expanded', open);
  $('pulse').classList.toggle('closed', !open);
};

// ---------- tools ----------
function buildTools() {
  $('tools').innerHTML = TOOLS.map((t) => `
    <button class="tool" type="button" data-tool="${t.id}" aria-pressed="${t.id === tool}" aria-keyshortcuts="${t.key}"
      aria-label="${t.name}${t.cost ? `, $${t.cost}` : ''}. ${esc(t.desc)}" title="${esc(t.desc)}">
      ${t.type !== undefined ? `<canvas class="thumb" data-type="${t.type}" aria-hidden="true"></canvas>` : `<span class="thumb tool-ic">${icon(t.icon)}</span>`}
      <span class="tname">${t.name}</span>
      <span class="tcost num">${t.cost ? '$' + t.cost : 'Free'}</span>
      <kbd aria-hidden="true">${t.key}</kbd>
    </button>`).join('');
  $('tools').onclick = (e) => { const b = e.target.closest('.tool'); if (b) selectTool(b.dataset.tool); };
  drawThumbs();
  selectTool(tool);
}
function drawThumbs() {
  for (const c of document.querySelectorAll('canvas.thumb')) thumbnail(c, +c.dataset.type, palette(prefs), resolvedTheme(prefs));
}
function selectTool(id) {
  tool = id;
  for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', b.dataset.tool === id);
  canvas.dataset.tool = id;
  const t = toolDef(id);
  $('tool-tip').textContent = prefs.tips ? t.desc : '';
  $('tool-tip').classList.toggle('hidden', !prefs.tips);
  if (cursor) hover = hoverInfo(cursor);
  dirty = true;
}

// ---------- HUD ----------
const RING_C = 2 * Math.PI * 27;
const moodColour = (h) => (h >= 0.65 ? 'var(--good)' : h >= 0.4 ? 'var(--mid)' : 'var(--bad)');
function moodWord(h) {
  if (state.status === 'ruins') return 'Fallen';
  return h >= 0.8 ? 'Thriving' : h >= 0.6 ? 'Content' : h >= 0.4 ? 'Uneasy' : 'Unhappy';
}

function updateHud() {
  if (!state) return;
  const tot = totalsNow || sim.totals(state);
  const p = state.pop, pop = sim.totalPop(state), st = state.stats;
  const net = st.income - st.upkeep;
  $('city-name').textContent = state.name;
  $('clock').textContent = state.status === 'ruins' ? `Fell on day ${state.day}` : `Day ${state.day}, ${hourLabel(state.hour)}`;
  $('v-money').textContent = money(state.money);
  $('v-net').textContent = `${net >= 0 ? '+' : '−'}$${Math.abs(net)} a day`;
  $('v-net').classList.toggle('neg', net < 0);
  $('v-pop').textContent = pop;
  $('v-homes').textContent = `${tot.homes} homes`;
  $('v-build').textContent = p.builder;
  $('v-queue').textContent = state.queue.length ? `${state.queue.length} queued` : 'idle';

  const h = state.happiness;
  $('ring-fg').style.strokeDasharray = RING_C;
  $('ring-fg').style.strokeDashoffset = RING_C * (1 - h);
  $('pulse').style.setProperty('--mood', moodColour(h));
  $('v-mood').textContent = pct(h);
  $('v-mood-word').textContent = moodWord(h);

  const needs = traffic?.needs || {};
  $('needs').innerHTML = NEEDS.map((n) => {
    const v = needs[n.k] ?? 1, lvl = v >= 0.7 ? 'ok' : v >= 0.4 ? 'mid' : 'bad';
    return `<li title="${esc(n.fix)}">${icon(n.icon)}<span class="nlabel">${n.label}</span>
      <span class="bar" role="meter" aria-label="${n.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i data-l="${lvl}" style="width:${Math.max(4, v * 100)}%"></i></span></li>`;
  }).join('');
  const worst = NEEDS.map((n) => [n, needs[n.k] ?? 1]).sort((a, b) => a[1] - b[1])[0];
  $('hint').textContent = state.status === 'ruins' ? 'This city has fallen. Rebuild on the ruins to start again.'
    : worst && worst[1] < 0.7 ? worst[0].fix : 'Everything is covered. Grow the city and upgrade buildings.';

  const alert = $('alert');
  const jam = st.failedTrips > pop * 0.25 && pop > 10;
  const msg = state.status === 'ruins' ? 'City fallen' : state.unpaidDays ? `Upkeep unpaid for ${state.unpaidDays}d` : jam ? 'Traffic jams' : '';
  alert.textContent = msg;
  alert.classList.toggle('hidden', !msg);
  alert.onclick = state.status === 'ruins' ? () => showRuins() : jam ? () => { if (!overlay) toggleTraffic(); } : null;

  for (const b of document.querySelectorAll('.tool')) {
    const t = toolDef(b.dataset.tool);
    b.classList.toggle('short', !!t.cost && state.money < t.cost);
  }
  const left = GOALS.length - state.goalsDone.length;
  $('goals-dot').textContent = left ? String(Math.min(9, left)) : '';
  $('goals-dot').classList.toggle('hidden', !left);
}

function toggleGoals(force) {
  const panel = $('goals');
  const open = force ?? panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  $('btn-goals').setAttribute('aria-expanded', open);
  if (open) { renderGoals(); if (selected) select(null); }
}
function renderGoals() {
  if (!state) return;
  const done = state.goalsDone.length;
  $('goals').innerHTML = `<div class="phead"><h2>Goals</h2><span class="soft num">${done} of ${GOALS.length}</span>
    <button class="iconbtn" type="button" data-close-goals aria-label="Close goals">${icon('i-close')}</button></div>
    <div class="progress"><i style="width:${(done / GOALS.length) * 100}%"></i></div>
    <ul class="goal-list">${GOALS.map((g) => {
      const ok = state.goalsDone.includes(g.id);
      return `<li class="${ok ? 'done' : ''}"><span class="tick">${ok ? icon('i-check') : ''}</span><span>${g.text}${ok ? '<span class="sr-only"> (done)</span>' : ''}</span><b class="num">${money(g.reward)}</b></li>`;
    }).join('')}</ul>`;
  $('goals').querySelector('[data-close-goals]').onclick = () => toggleGoals(false);
}

// ---------- minimap ----------
function drawMinimap() {
  const c = $('minimap');
  if (!prefs.minimap || !c || !me) return;
  const g = c.getContext('2d'), all = [...plots.values()];
  const xs = all.map((p) => p.px), ys = all.map((p) => p.py);
  const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 2, minY = Math.min(...ys) - 1, maxY = Math.max(...ys) + 2;
  const s = Math.min(c.width / (maxX - minX), c.height / (maxY - minY));
  const ox = (c.width - s * (maxX - minX)) / 2, oy = (c.height - s * (maxY - minY)) / 2;
  const dark = resolvedTheme(prefs) === 'dark';
  g.fillStyle = dark ? '#132126' : '#e4eee0';
  g.fillRect(0, 0, c.width, c.height);
  for (const p of all) {
    const x = ox + (p.px - minX) * s + 1, y = oy + (p.py - minY) * s + 1;
    g.fillStyle = p.status === 'ruins' ? '#9a8b7b' : p.mine ? '#ffc933' : (dark ? '#4e7b44' : '#a9d68b');
    g.fillRect(x, y, s - 2, s - 2);
    const fill = Math.min(1, (p.pop || 0) / 120);
    g.fillStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(23,49,59,0.4)';
    g.fillRect(x + 2, y + s - 5, Math.max(0, (s - 6) * fill), 2);
  }
  const cx = ox + (renderer.cam.x / STRIDE - minX) * s, cy = oy + (renderer.cam.y / STRIDE - minY) * s;
  g.strokeStyle = dark ? '#fff' : '#17313b'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.stroke();
  c.onclick = (e) => {
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (c.width / r.width), my = (e.clientY - r.top) * (c.height / r.height);
    renderer.centerOn(((mx - ox) / s + minX) * STRIDE, ((my - oy) / s + minY) * STRIDE);
    dirty = true;
    drawMinimap();
  };
}

// ---------- inspector ----------
function select(h) {
  selected = h ? { px: h.px, py: h.py, tx: h.tx, ty: h.ty, i: h.i } : null;
  if (!selected) { $('inspector').classList.add('hidden'); dirty = true; return; }
  refreshInspector();
  toggleGoals(false);
  $('inspector').classList.remove('hidden');
  dirty = true;
}
function refreshInspector() {
  if (!selected || !state) return;
  const box = $('inspector');
  const had = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.do : null;
  const body = isMine(selected) ? ownTile(selected.i) : otherPlot(selected);
  box.innerHTML = `<button class="iconbtn close" type="button" aria-label="Close details">${icon('i-close')}</button>${body}`;
  box.querySelector('.close').onclick = () => select(null);
  box.querySelectorAll('[data-do]').forEach((b) => { b.onclick = () => inspectorAction(b.dataset.do); });
  if (had) box.querySelector(`[data-do="${had}"]`)?.focus();
}
function inspectorAction(what) {
  const i = selected.i, was = tool;
  if (what === 'tap') tap(i);
  if (what === 'upgrade') { tool = 'upgrade'; act(selected, false); tool = was; }
  if (what === 'clear') { tool = 'bulldoze'; act(selected, false); tool = was; }
  refreshInspector();
}
const household = (i) => SURNAMES[((i * 2654435761) >>> 0) % SURNAMES.length];
const row = (label, value) => `<div class="kv"><span>${label}</span><b class="num">${value}</b></div>`;
function meter(label, v) {
  const lvl = v >= 0.7 ? 'ok' : v >= 0.4 ? 'mid' : 'bad';
  return `<div class="kv"><span>${label}</span><span class="bar small" role="meter" aria-label="${label}" aria-valuenow="${Math.round(v * 100)}" aria-valuemin="0" aria-valuemax="100"><i data-l="${lvl}" style="width:${Math.max(4, v * 100)}%"></i></span></div>`;
}

function ownTile(i) {
  const t = state.grid[i];
  const q = state.queue.find((q) => q.i === i);
  const lv = state.lv[i] || 1;
  const { x, y } = sim.xy(i);
  const where = `<p class="where">Tile ${x + 1}, ${y + 1}</p>`;
  if (t === T.EMPTY) return `<h2>Empty land</h2>${where}<p>Pick something from the build bar, then click here.</p>`;
  if (t === T.RUBBLE) return `<h2>Rubble</h2>${where}<p>Left from a city that fell. Clearing it costs $${RUBBLE_CLEAR_COST}.</p>
    <div class="actions"><button class="btn" data-do="clear">${icon('i-clear')}Clear for $${RUBBLE_CLEAR_COST}</button></div>`;
  if (t === T.ROAD && !q) {
    const load = traffic?.load[i] ?? 0, cap = traffic?.cap[i] || 45;
    return `<h2>Road</h2>${where}${meter('Traffic', Math.min(1, load / cap))}${row('Trips a day', `${Math.round(load)} of ${cap}`)}
      ${load > cap ? '<p class="warn">Jammed. Add another route, or move jobs and shops closer to homes.</p>' : ''}
      <div class="actions"><button class="btn" data-do="clear">${icon('i-clear')}Remove</button></div>`;
  }
  if (q && !q.up) {
    const total = B[t].work, done = 1 - q.left / total, pos = state.queue.indexOf(q);
    const canTap = q.tap < total * 0.25 - 1e-6;
    return `<h2>${B[t].name}</h2>${where}<p class="soft">Under construction</p>
      <div class="progress big"><i style="width:${done * 100}%"></i></div>${row('Done', pct(done))}
      <p>${pos === 0 ? 'Builders are working on this now.' : `${pos} job${pos > 1 ? 's' : ''} ahead of it.`} More builders finish faster.</p>
      <div class="actions">${canTap ? `<button class="btn primary" data-do="tap">${icon('i-hammer')}Help build</button>` : ''}<button class="btn" data-do="clear">${icon('i-clear')}Cancel</button></div>`;
  }
  const cond = t === T.HALL ? 100 : state.cond[i];
  const home = traffic?.homes.find((hm) => hm.i === i);
  let body = '';
  if (t === T.HOUSE) body += row('Homes', Math.round(sim.capacity(state, i, 'homes')));
  if (t === T.HOUSE || t === T.HALL) {
    const residents = home ? Math.round(home.r) : 0;
    body += `<p class="family">${t === T.HALL ? 'Living above the hall' : `The ${household(i + me.px * 31 + me.py * 17)} household`}: ${residents} ${residents === 1 ? 'person' : 'people'}</p>`;
    if (home && (home.workPath || t === T.HALL)) body += meter('Getting to work', home.workSucc) + meter('Getting to shops', home.shopSucc) + row('Park nearby', home.park ? 'Yes' : 'No');
    else body += '<p class="warn">Not connected. A house needs a road on one side.</p>';
  }
  if (t === T.WORK || t === T.SHOP || t === T.SCHOOL) {
    body += row('Jobs', Math.round(sim.capacity(state, i, 'jobs')));
    if (t === T.SHOP) body += row('Serves', `${Math.round(sim.capacity(state, i, 'serves'))} people`);
    if (t === T.SCHOOL) body += row('Seats', Math.round(sim.capacity(state, i, 'seats')));
    const linked = sim.neighbours(i).some((n) => state.grid[n] === T.ROAD || state.grid[n] === T.HALL);
    if (!linked) body += '<p class="warn">Not connected. It needs a road on one side.</p>';
  }
  if (t === T.PARK) body += '<p>Homes within 3 tiles are happier.</p>';
  if (t === T.HALL) body += '<p>Homes, jobs and a small shop in one. It never decays.</p>';
  const condTxt = cond <= 0 ? '<p class="warn">Abandoned. Clear it and build again.</p>'
    : cond < 40 ? '<p class="warn">Decaying: works at half capacity until upkeep is paid.</p>' : '';
  let actions = '';
  if (UPGRADABLE.includes(t)) {
    if (q && q.up) {
      const total = Math.round(B[t].work * 1.2);
      actions += `<p class="soft">Upgrading to level ${lv + 1}: ${pct(1 - q.left / total)} done.</p>${q.tap < total * 0.25 - 1e-6 ? `<button class="btn primary" data-do="tap">${icon('i-hammer')}Help build</button>` : ''}`;
    } else if (lv < MAX_LEVEL) {
      const c = sim.canUpgrade(state, i), cost = sim.upgradeCost(state, i);
      const gain = Math.round((LEVEL.capacity[lv + 1] / LEVEL.capacity[lv] - 1) * 100);
      actions += `<button class="btn primary" data-do="upgrade" ${c.ok ? '' : 'disabled'}>${icon('i-up')}Upgrade for ${money(cost)}</button>
        <p class="soft small">${c.ok ? `Level ${lv + 1} adds ${gain}% capacity.` : esc(c.reason)}</p>`;
    } else actions += '<p class="soft small">Top level reached.</p>';
  }
  if (t !== T.HALL) actions += `<button class="btn" data-do="clear">${icon('i-clear')}Clear</button>`;
  const levelTag = UPGRADABLE.includes(t) ? `<span class="tag">Level ${lv}</span>` : '';
  return `<h2>${B[t].name} ${levelTag}</h2>${where}${t !== T.HALL ? meter('Condition', cond / 100) : ''}${condTxt}${body}<div class="actions">${actions}</div>`;
}

function otherPlot(h) {
  const p = plots.get(byXY.get(`${h.px},${h.py}`));
  if (!p) return '<h2>Unclaimed land</h2><p>New players get plots out here on the frontier.</p>';
  if (p.status === 'ruins') {
    return `<div class="plaque"><h2>Ruins of ${esc(p.name)}</h2><p>Built by ${esc(p.ownerName)}. It reached ${p.peakPop} people and lasted ${p.day} days.</p></div>`;
  }
  return `<h2>${esc(p.name)}</h2><p class="soft">Mayor ${esc(p.ownerName)}${p.cityNo > 1 ? `, city number ${p.cityNo} on this plot` : ''}</p>
    ${row('People', p.pop)}${row('Peak', p.peakPop)}${row('Days running', p.day)}${meter('Mood', p.happiness || 0)}`;
}

function describeTile(i) {
  const t = state.grid[i], { x, y } = sim.xy(i);
  const q = state.queue.find((q) => q.i === i);
  let d = t === T.EMPTY ? 'empty' : B[t].name;
  if (q && !q.up) d += `, under construction ${pct(1 - q.left / B[t].work)}`;
  else if (UPGRADABLE.includes(t)) d += `, level ${state.lv[i]}`;
  if (t === T.ROAD && traffic && traffic.load[i] > traffic.cap[i]) d += ', jammed';
  const h = hoverInfo({ px: me.px, py: me.py, tx: x, ty: y, i });
  const verb = tool === 'look' ? '' : h.ok ? `. ${toolDef(tool).name} can go here` : `. Can't use ${toolDef(tool).name} here`;
  return `Tile ${x + 1}, ${y + 1}: ${d}${verb}.`;
}

// ---------- modals ----------
const modal = $('modal');
function openModal(html, cls = '') {
  $('modal-body').innerHTML = html;
  modal.className = cls;
  if (!modal.open) modal.showModal();
  modal.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  (modal.querySelector('[autofocus]') || modal.querySelector('input, .mfoot button, button'))?.focus();
}
function closeModal() { if (modal.open) modal.close(); }
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
modal.addEventListener('close', () => { if (state) canvas.focus({ preventScroll: true }); });
const closeX = `<button class="iconbtn mclose" type="button" data-close aria-label="Close">${icon('i-close')}</button>`;

function showHelp() {
  try { localStorage.setItem('commons-seen-help', '1'); } catch { /* private mode */ }
  openModal(`${closeX}<h2 id="modal-title">How Commons works</h2>
    <div class="help">
      <section><h3>${icon('i-map')}Your plot</h3><p>You own a plot on a shared map. The plots around you belong to real players. Your city keeps running when you leave, for up to ${MAX_OFFLINE_DAYS} days.</p></section>
      <section><h3>${icon('i-hammer')}Build</h3><p>Lay roads out from the town hall. Homes, workplaces, shops and schools need a road on one side. Building takes time: more builders finish faster, and you can tap a building site to lend a hand.</p></section>
      <section><h3>${icon('i-mood')}Keep people happy</h3><p>The mood ring shows how people feel. The needs under it tell you what's missing. People who can't get to work or the shops get unhappy, pay less tax and eventually leave.</p></section>
      <section><h3>${icon('i-lights')}Traffic</h3><p>Every home sends people to the nearest job and shop. One road carries about 45 trips a day before it jams. Turn on traffic to see where, then give busy areas a second route.</p></section>
      <section><h3>${icon('i-coin')}Money</h3><p>Tax comes in every day and upkeep goes out. Upkeep doesn't shrink when people leave, so a struggling city can spiral. Unpaid upkeep makes buildings decay, and a city with no people and no money falls into ruin.</p></section>
      <section><h3>${icon('i-up')}Grow</h3><p>Schools turn newcomers into builders, teachers and professionals. Upgrade buildings for more room and jobs. Goals pay out cash as you go.</p></section>
    </div>
    <h3 class="keys-h">Keys</h3>
    <p class="keys"><kbd>1</kbd>–<kbd>9</kbd> tools, <kbd>Ctrl</kbd> <kbd>Z</kbd> undo, <kbd>T</kbd> traffic, <kbd>V</kbd> 3D or 2D, <kbd>H</kbd> my plot, <kbd>0</kbd> whole map, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pan, <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>O</kbd> goals, <kbd>G</kbd> grid, <kbd>M</kbd> sound, <kbd>Esc</kbd> cancel. Click the map, then use the arrow keys and <kbd>Enter</kbd> to build without a mouse.</p>
    <div class="mfoot"><button class="btn primary" data-close autofocus>Start building</button></div>`, 'wide');
}

function showAway(r) {
  const pop = sim.totalPop(state);
  openModal(`<h2 id="modal-title">${r.days} day${r.days === 1 ? '' : 's'} passed while you were away</h2>
    ${r.capped ? `<p>Time only runs for ${MAX_OFFLINE_DAYS} days without you, so your city waited for the rest.</p>` : ''}
    <div class="compare"><div><small>Money</small><b class="num">${money(r.money)} → ${money(state.money)}</b></div>
    <div><small>People</small><b class="num">${r.pop} → ${pop}</b></div></div>
    <div class="mfoot"><button class="btn primary" data-close autofocus>Back to the city</button></div>`);
}

function showRuins(record) {
  const r = record || { name: state.name, peakPop: state.peakPop, daysSurvived: state.day };
  openModal(`<div class="plaque big"><h2 id="modal-title">${esc(r.name)} has fallen</h2>
    <p>It reached ${r.peakPop} people and lasted ${r.daysSurvived} days. Its ruins stay on the map with this record.</p></div>
    <p>You can start again on the same land. The rubble stays, and each tile costs $${RUBBLE_CLEAR_COST} to clear.</p>
    <label class="field"><span>New city name</span><input id="rebuild-name" maxlength="28" value="New ${esc(r.name)}"></label>
    <div class="mfoot"><button class="btn" data-close>Look at the ruins</button><button class="btn primary" id="do-rebuild">Rebuild on the ruins</button></div>`);
  $('do-rebuild').onclick = () => {
    sim.rebuild(state, $('rebuild-name').value.trim() || state.name);
    state.lastTick = Date.now();
    afterChange();
    renderGoals();
    save();
    closeModal();
    play('level');
  };
}

function showRename() {
  openModal(`${closeX}<h2 id="modal-title">Rename your city</h2>
    <label class="field"><span>City name</span><input id="rename" maxlength="28" value="${esc(state.name)}" autofocus></label>
    <div class="mfoot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="do-rename">Save name</button></div>`);
  $('rename').select();
  const go = () => { const v = $('rename').value.trim(); if (v) { state.name = v; afterChange(); save(); } closeModal(); };
  $('do-rename').onclick = go;
  $('rename').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

async function showBoard() {
  openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p class="soft">Loading…</p>`, 'wide');
  try {
    const b = await fb.loadLeaderboards();
    const list = (rows, val) => rows.length
      ? `<ol>${rows.map((r) => `<li class="${r.plotId === plotId || (r.name === state.name && r.ownerName === mayor) ? 'me' : ''}"><span><b>${esc(r.name)}</b><small>${esc(r.ownerName)}</small></span><em class="num">${val(r)}</em></li>`).join('')}</ol>`
      : '<p class="soft">No cities yet.</p>';
    if (!modal.open) return;
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><div class="boards">
      <section><h3>${icon('i-people')}Biggest ever</h3>${list(b.peak, (r) => `${r.peakPop}`)}</section>
      <section><h3>${icon('i-clock')}Longest running</h3>${list(b.running, (r) => `${r.day} days`)}</section>
      <section><h3>${icon('i-flag')}Fallen cities</h3>${list(b.fallen, (r) => `${r.daysSurvived} days`)}</section>
      </div>`, 'wide');
  } catch (e) {
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p>Couldn't load leaderboards: ${esc(e.message)}</p>`);
  }
}

// Settings: Junction's accessibility options, adapted for a city builder.
let settingsTab = 'display';
function showSettings() {
  const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
    `<button type="button" role="radio" aria-checked="${prefs[key] === v}" data-pref="${key}" data-val='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`;
  const tgl = (key, label, note = '') => `<label class="tgl"><input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">${label}${note ? `<small>${note}</small>` : ''}</span></label>`;
  const tabs = [['display', 'Display'], ['colours', 'Colours'], ['interface', 'Interface'], ['sound', 'Sound']];
  const panes = {
    display: `<div class="srow"><span>Theme</span>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="srow"><span>View</span>${seg('view', [['3d', '3D'], ['flat', '2D']])}</div>
      ${tgl('dayNight', 'Day and night', 'The map dims in the evening and windows light up')}
      ${tgl('grid', 'Tile grid', 'Shortcut: G')}
      ${tgl('cars', 'Moving cars')}
      ${tgl('popups', 'Floating numbers', 'Money and progress rising from buildings')}
      ${tgl('reducedMotion', 'Reduce motion', 'Stops moving cars and rising numbers')}`,
    colours: `<p class="soft">Each building type has its own colour. Pick the set that's easiest for you to tell apart. Buildings also have different shapes, so colour is never the only clue.</p>
      <div class="palettes" role="radiogroup" aria-label="Colour mode">${Object.entries(PALETTES).map(([k, p]) => `
        <button type="button" role="radio" aria-checked="${prefs.colours === k}" data-pref="colours" data-val='"${k}"' class="palcard">
          <span class="sw6" aria-hidden="true">${Object.values(p.cols).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <b>${p.label}</b><small>${p.note}</small></button>`).join('')}</div>
      ${tgl('shapes', 'Shape badges on buildings', 'Circle homes, square work, triangle shops, diamond schools, star parks')}`,
    interface: `<div class="srow"><span>Text size</span>${seg('textSize', [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger']])}</div>
      <div class="srow"><span>Notifications</span>${seg('notes', [['all', 'All'], ['warn', 'Warnings'], ['off', 'Off']])}</div>
      ${tgl('compact', 'Compact layout', 'Smaller panels and a tighter build bar')}
      ${tgl('minimap', 'Minimap')}
      ${tgl('tips', 'Tool hints', 'A line above the build bar explaining the selected tool')}`,
    sound: `${tgl('sound', 'Sound effects', 'Shortcut: M')}
      <div class="srow"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${prefs.volume}" data-pref="volume" aria-label="Volume"></div>`,
  };
  openModal(`${closeX}<h2 id="modal-title">Settings</h2>
    <div class="seg tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${settingsTab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="spane" role="tabpanel">${panes[settingsTab]}</div>
    <p class="soft small">Settings are saved on this device.</p>`, 'wide');
  modal.querySelector(`[data-tab="${settingsTab}"]`).focus();
  modal.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { settingsTab = b.dataset.tab; showSettings(); }; });
  modal.querySelectorAll('button[data-pref]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.pref, v = JSON.parse(b.dataset.val);
      if (k === 'view') { if (prefs.view !== v) toggleView(); } else setPref(k, v);
      showSettings();
      modal.querySelector(`[data-pref="${k}"][aria-checked="true"]`)?.focus();
    };
  });
  modal.querySelectorAll('input[type=checkbox][data-pref]').forEach((c) => {
    c.onchange = () => { setPref(c.dataset.pref, c.checked); if (c.dataset.pref === 'tips') selectTool(tool); };
  });
  modal.querySelectorAll('input[type=range][data-pref]').forEach((r) => {
    r.oninput = () => { prefs.volume = +r.value; savePrefs(prefs); setSound(prefs.sound, prefs.volume); };
    r.onchange = () => play('coin');
  });
}

function showAccount() {
  const guest = user.isAnonymous;
  const google = user.providerData.some((p) => p.providerId === 'google.com');
  const head = `${closeX}<h2 id="modal-title">Account</h2>
    <div class="acct"><span class="avatar" aria-hidden="true">${esc((mayor[0] || 'M').toUpperCase())}</span>
    <div><b>Mayor ${esc(mayor)}</b><small>${guest ? 'Guest on this device' : esc(user.email || 'Signed in with Google')}</small></div></div>
    <label class="field"><span>Mayor name</span><span class="inline"><input id="acct-mayor" maxlength="20" value="${esc(mayor)}"><button class="btn" id="acct-mayor-save" type="button">Save</button></span></label>`;
  const body = guest ? `
    <div class="callout"><h3>Keep your city safe</h3><p>Guest cities live only in this browser. Make it an account to play on any device. Your city comes with you.</p>
      <label class="field"><span>Email</span><input id="up-email" type="email" autocomplete="email"></label>
      <label class="field"><span>Password</span><input id="up-pass" type="password" autocomplete="new-password" minlength="6"></label>
      <button class="btn primary wide" id="up-email-go" type="button">Save as an account</button>
      <button class="btn wide gbtn" id="up-google" type="button">Save with Google</button></div>`
    : (!google && user.email ? '<button class="btn" id="acct-reset" type="button">Email me a password reset link</button>' : '');
  openModal(`${head}${body}<p id="acct-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn danger" id="acct-out" type="button">Sign out</button></div>`);
  const msg = $('acct-msg');
  $('acct-mayor-save').onclick = () => busy($('acct-mayor-save'), async () => {
    const v = $('acct-mayor').value.trim();
    if (!v) throw new Error('Type a name first.');
    mayor = v;
    await save({ ownerName: v });
    msg.textContent = 'Saved.'; msg.classList.add('ok');
  }, msg);
  if (guest) {
    $('up-email-go').onclick = () => busy($('up-email-go'), async () => {
      await fb.upgradeWithEmail($('up-email').value.trim(), $('up-pass').value);
      notify('Your city is now saved to your account.', 'act'); play('goal'); showAccount();
    }, msg);
    $('up-google').onclick = () => busy($('up-google'), async () => {
      await fb.upgradeWithGoogle();
      notify('Your city is now saved to your Google account.', 'act'); play('goal'); showAccount();
    }, msg);
  } else if ($('acct-reset')) {
    $('acct-reset').onclick = () => busy($('acct-reset'), async () => {
      await fb.resetPassword(user.email);
      msg.textContent = `Reset link sent to ${user.email}.`; msg.classList.add('ok');
    }, msg);
  }
  $('acct-out').onclick = () => {
    if (!guest) { save().finally(() => fb.signOutUser()); return; }
    openModal(`<h2 id="modal-title">Sign out of a guest city?</h2>
      <p>Guest cities can't be signed back into. If you sign out now, ${esc(state.name)} stays on the map but you won't be able to play it again.</p>
      <div class="mfoot"><button class="btn danger" id="lose" type="button">Sign out anyway</button><button class="btn primary" id="keep" type="button" autofocus>Save it as an account first</button></div>`);
    $('keep').onclick = showAccount;
    $('lose').onclick = () => save().finally(() => fb.signOutUser());
  };
}

// ---------- notifications ----------
// 'act' is direct feedback on something the player just did, so it always shows.
function notify(msg, kind = 'info') {
  if (kind !== 'act') {
    if (prefs.notes === 'off') return;
    if (prefs.notes === 'warn' && kind !== 'warn') return;
  }
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  const life = kind === 'warn' ? 5200 : 3200;
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 400);
  if (kind === 'warn') play('warn');
}
function announce(msg) {
  const el = $('sr');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}
