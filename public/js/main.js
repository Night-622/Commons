import * as sim from './sim.js';
import {
  T, B, PLOT, TICK_MS, MAX_OFFLINE_DAYS, HOURS_PER_DAY, SAVE_EVERY_MS, RUBBLE_CLEAR_COST, MAX_LEVEL, LEVEL, UPGRADABLE,
  REBUILD_MONEY, MOVE_KEEP, TUTORIAL_REWARD, GOALS, BRUSHES, CHUNK, CHUNKS, EDU, MOVE_FEE, isHome,
} from './constants.js';
import { Renderer, STRIDE, thumbnail, modelHeight } from './render.js';
import { loadPrefs, savePrefs, applyPrefs, resolvedTheme, palette, PALETTES } from './prefs.js';
import { play, setSound } from './sound.js';
import { firebaseConfig } from './config.js';
import { TripSim, whereabouts } from './trips.js';
import { createTutorial } from './tutorial.js';
import { ROLES, roleOf, jobText } from './people.js';
import * as panels from './panels.js';
import * as acct from './account.js';
import * as fb from './firebase.js';

const { esc, icon, money, pct, bar, avatar } = panels;
const $ = (id) => document.getElementById(id);
const hourLabel = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : `${h % 12} ${h < 12 ? 'am' : 'pm'}`);

// ---------- state ----------
let prefs = loadPrefs();
let user = null, plotId = null, me = null, state = null, mayor = '';
let world = { id: localStorage.getItem('commons-world') || 'public', name: 'Public world' }, worlds = [];
let plan = null, totalsNow = null;
let mode = 'select', brush = null, moveFrom = -1, catalog = null, catCat = 'all';
let overlay = null, hover = null, cursor = null, selected = null;
let drawer = null, personId = null, peopleFilter = 'all', peopleQuery = '', statsTab = 'overview', acctTab = 'profile';
let pops = [], undoStack = [], bridges = new Map(), neighbourInfo = [], pulseTile = null, taps = 0, followCam = false;
let saveTimer = null, lastSave = Date.now(), loopTimer = null, worldTimer = null, lastHour = -1;
let spaceHeld = false, dirty = true, lastFrame = performance.now(), warnedDay = -1;
let worldUnsub = null, movesUnsub = null, lastSaved = '', offerCache = new Map(), live = false;
let profile = null, profileDirty = false, chatUnsub = null, chatMessages = [], chatUnread = 0, chatDraft = '', lastChat = 0;
const plots = new Map();
const byXY = new Map();
const trips = new TripSim();

const canvas = $('map');
const renderer = new Renderer(canvas);

const NEEDS = [
  { k: 'jobs', icon: 'i-jobs', label: 'Jobs', fix: 'People need work. Build offices, factories or shops, and schools so they qualify for better jobs.' },
  { k: 'homes', icon: 'i-house', label: 'Room to grow', fix: 'Build homes so new families can move in.' },
  { k: 'shops', icon: 'i-bag', label: 'Food', fix: 'Some households have no grocer nearby. Build one close to homes.' },
  { k: 'school', icon: 'i-school', label: 'School', fix: 'Children need daycare, primary and high school places, and teachers with degrees.' },
  { k: 'health', icon: 'i-mood', label: 'Health', fix: 'Sick people aren’t being treated. Build a clinic, and a hospital for serious cases.' },
  { k: 'safety', icon: 'i-lock', label: 'Safety', fix: 'Crime is up. Build a police station and a courthouse, and create jobs.' },
  { k: 'commute', icon: 'i-car', label: 'Commute', fix: 'Roads are jammed. Add routes, footpaths for walkers and bikes, or move jobs closer to homes.' },
  { k: 'leisure', icon: 'i-tree', label: 'Fun', fix: 'People have nothing to do in the evenings. Build parks, sport, cafés or a cinema.' },
];
const CITY_NAMES = ['Maple Bay', 'Riverside', 'Kingsford', 'Ashgrove', 'Bellhaven', 'Coral Point', 'Elm Hollow', 'Fernvale', 'Glenmore', 'Harbourview', 'Oakridge', 'Wattle Creek'];
const SIDES = [[1, 0, 'East'], [-1, 0, 'West'], [0, 1, 'South'], [0, -1, 'North']];

// ---------- preferences ----------
function applyAll() {
  applyPrefs(prefs);
  renderer.view = prefs.view;
  setSound(prefs.sound, prefs.volume);
  $('view-3d').setAttribute('aria-pressed', prefs.view === '3d');
  $('view-2d').setAttribute('aria-pressed', prefs.view === 'flat');
  $('minibox').classList.toggle('hidden', !prefs.minimap);
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
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = sim.newCity('Demo', rnd);
  s.money = 1e7;
  s.land.fill(1);
  const put = (x, y, t) => sim.place(s, sim.idx(x, y), t);
  for (let k = 3; k <= 20; k++) { put(k, 12, T.ROAD); put(12, k, T.ROAD); }
  for (let k = 6; k <= 18; k++) { put(k, 7, T.ROAD); put(k, 17, T.ROAD); }
  for (let k = 8; k <= 11; k++) put(6, k, T.ROAD);
  for (let k = 13; k <= 16; k++) put(18, k, T.PATH);
  const mix = [T.HOUSE, T.HOUSE, T.HOUSE, T.APARTMENT, T.VILLA, T.WORK, T.SHOP, T.CAFE, T.PARK, T.SCHOOL, T.CLINIC, T.SPORTS, T.POOL, T.DOJO, T.LIBRARY, T.POLICE, T.PLAYGROUND, T.FACTORY, T.HOSPITAL, T.UNI, T.CINEMA];
  for (let y = 4; y < 21; y++) for (let x = 4; x < 21; x++) {
    const i = sim.idx(x, y);
    if (s.grid[i] !== T.EMPTY || !sim.neighbours(i).some((n) => s.grid[n] === T.ROAD)) continue;
    if (rnd() < 0.88) put(x, y, mix[Math.floor(rnd() * mix.length)]);
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
    if (r.w > 900) { const d = 250 / (2 * r.cam.z); r.cam.x += d; r.cam.y -= d; }
    const p = plotFrom('demo', 0, 0, demo, { ownerName: '' });
    r.draw({ plots: new Map([['demo', p]]), theme: resolvedTheme(prefs), palette: palette(prefs), paletteKey: prefs.colours, prefs, pops: [], nightAmt: 0, shapes: false });
  }
}
window.addEventListener('resize', () => { drawHeroes(); renderer.resize(); dirty = true; });

// ---------- sign-in screen ----------
let authMode = 'signin';
function setAuthMode(m) {
  authMode = m;
  $('tab-signin').setAttribute('aria-selected', m === 'signin');
  $('tab-create').setAttribute('aria-selected', m === 'create');
  $('auth-submit').textContent = m === 'signin' ? 'Sign in' : 'Create account';
  $('auth-pass').autocomplete = m === 'signin' ? 'current-password' : 'new-password';
  $('auth-forgot').classList.toggle('hidden', m !== 'signin');
  $('auth-msg').textContent = '';
}
$('tab-signin').onclick = () => setAuthMode('signin');
$('tab-create').onclick = () => setAuthMode('create');

async function busy(btn, fn, msgEl = $('auth-msg')) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  if (msgEl) { msgEl.textContent = ''; msgEl.classList.remove('ok'); }
  try { await fn(); } catch (e) { console.error(e); if (msgEl) msgEl.textContent = fb.authMessage(e); play('error'); }
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
function setWorld(w) {
  world = w;
  try { localStorage.setItem('commons-world', w.id); } catch { /* private mode */ }
}
$('found-form').onsubmit = (e) => {
  e.preventDefault();
  const m = $('found-mayor').value.trim(), c = $('found-city').value.trim();
  if (!m || !c) { $('found-msg').textContent = 'Give yourself and your city a name.'; return; }
  busy($('found-go'), async () => {
    const doc = await fb.claimPlot(user, m, c, world.id);
    if (!user.isAnonymous && !user.displayName) fb.setDisplayName(m).catch(() => {});
    startGame(doc);
  }, $('found-msg'));
};
$('found-out').onclick = () => fb.signOutUser();
$('found-public').onclick = () => { setWorld({ id: 'public', name: 'Public world' }); enter(user); };

async function showFound() {
  const base = user.displayName || (user.email ? user.email.split('@')[0] : '');
  $('found-mayor').value = base.slice(0, 20);
  $('found-city').value = CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)];
  $('found-msg').textContent = '';
  $('found-world').textContent = world.id === 'public' ? 'the public world' : world.name;
  $('found-public').classList.toggle('hidden', world.id === 'public');
  $('found-ruins').classList.add('hidden');
  show('found');
  (base ? $('found-city') : $('found-mayor')).focus();
  try {
    const ruins = (await fb.loadWorld(world.id)).filter((p) => p.status === 'ruins').slice(0, 4);
    if (!ruins.length) return;
    $('found-ruins').innerHTML = `<p class="or"><span>or start on ruins</span></p>${ruins.map((r) => `
      <div class="ruin-row"><span><b>Ruins of ${esc(r.name)}</b><small>Reached ${r.peakPop} people. The rubble stays.</small></span>
      <button class="btn" type="button" data-ruin="${r.id}">Rebuild here</button></div>`).join('')}`;
    $('found-ruins').classList.remove('hidden');
    $('found-ruins').querySelectorAll('[data-ruin]').forEach((b) => {
      b.onclick = () => busy(b, async () => {
        const r = ruins.find((x) => x.id === b.dataset.ruin);
        const m = $('found-mayor').value.trim(), c = $('found-city').value.trim();
        if (!m || !c) throw new Error('Give yourself and your city a name first.');
        const st = sim.migrate(JSON.parse(r.state));
        sim.rebuild(st, c, REBUILD_MONEY);
        st.lastTick = Date.now();
        startGame(await fb.takeOverRuins(user, m, r.id, st, world.id));
      }, $('found-msg'));
    });
  } catch (e) { console.error(e); }
}

// ---------- routing ----------
if (firebaseConfig.apiKey === 'REPLACE_ME') {
  show('auth');
  $('auth-msg').textContent = 'Add your Firebase web config to public/js/config.js, then reload.';
}
async function enter(u) {
  stopLoops();
  worldUnsub?.(); movesUnsub?.(); worldUnsub = movesUnsub = null;
  tut.stop();
  show('boot');
  try {
    const w = await fb.getWorld(world.id);
    setWorld(w || { id: 'public', name: 'Public world' });
    const doc = await fb.findPlot(u, world.id);
    if (doc) startGame(doc);
    else showFound();
  } catch (e) {
    console.error(e);
    show('auth');
    $('auth-msg').textContent = `Couldn't reach your city: ${fb.authMessage(e)}`;
  }
}
fb.onAuth((u) => {
  user = u;
  if (!u) { stopLoops(); chatUnsub?.(); worldUnsub?.(); movesUnsub?.(); worldUnsub = movesUnsub = null; state = null; closeModal(); tut.stop(); show('auth'); return; }
  enter(u);
});

async function startGame(doc) {
  plotId = doc.id;
  mayor = doc.ownerName || 'Mayor';
  state = sim.migrate(JSON.parse(doc.state));
  plots.clear(); byXY.clear(); trips.clear(); bridges.clear();
  selected = null; drawer = null; followCam = false; lastHour = -1; moveFrom = -1; catalog = null; brush = null;
  me = toPlot(doc);
  addPlot(me);
  refreshDerived();
  const report = advance();
  syncMine();
  show('game');
  applyAll();
  buildDock();
  setMode('select');
  fitHome();
  updateHud();
  renderDrawer();
  startLoops();
  startLive();
  startChat();
  loadProfile();
  if (innerWidth < 860) { $('pulse').classList.add('closed'); $('pulse-toggle').setAttribute('aria-expanded', 'false'); }
  canvas.focus({ preventScroll: true });
  if (state.status === 'ruins') showRuins();
  else if (report) showAway(report);
  else if (!localStorage.getItem('commons-seen-help')) showWelcome();
  else tut.resume();
}

// ---------- plots ----------
function plotFrom(id, px, py, st, meta) {
  return {
    id, px, py, st, name: st.name, ownerName: meta.ownerName, status: st.status,
    pop: st.people.length, peakPop: st.peakPop, day: st.day, happiness: st.happiness, cityNo: st.cityNo,
    grid: st.grid, cond: st.cond, lv: st.lv, land: st.land, uc: sim.underConstruction(st),
    queueMap: new Map(st.queue.map((q) => [q.i, q])), version: meta.version ?? 0, mine: !!meta.mine, owner: meta.owner, out: meta.out || {},
  };
}
function toPlot(d) {
  let st;
  try { st = sim.migrate(JSON.parse(d.state)); } catch { return null; }
  return plotFrom(d.id, d.px, d.py, st, { ownerName: d.ownerName, version: d.updatedAt?.toMillis?.() ?? Date.now(), mine: d.owner === user.uid, owner: d.owner, out: d.out });
}
function addPlot(p) {
  if (!p) return;
  const old = plots.get(p.id);
  if (old && old.version !== p.version && !p.mine) trips.drop(p.id);
  plots.set(p.id, p);
  byXY.set(`${p.px},${p.py}`, p.id);
}
const plotAt = (px, py) => plots.get(byXY.get(`${px},${py}`));
function syncMine() {
  Object.assign(me, plotFrom(me.id, me.px, me.py, state, { ownerName: mayor, mine: true, version: (me.version || 0) + 1, owner: user.uid, out: plan?.out }));
  dirty = true;
}
// Live: every save by any player in this world arrives here within a second or two.
function startLive() {
  worldUnsub?.(); movesUnsub?.();
  live = false;
  worldUnsub = fb.listenWorld(world.id, (docs) => {
    live = true;
    for (const d of docs) if (d.id !== plotId) addPlot(toPlot(d));
    computeLinks();
    refreshDerived();
    drawMinimap();
    updateHud();
    if (drawer === 'world') renderDrawer();
    dirty = true;
  });
  movesUnsub = fb.listenMoves(world.id, user.uid, async (moves) => {
    for (const m of moves) {
      if (m.to !== plotId || !state) continue;
      const n = sim.welcome(state, m.people || [], m.fromName || 'a nearby city');
      if (n) { notify(`A family of ${n} moved here from ${m.fromName}.`, 'good'); play('coin'); afterChange(); }
      fb.finishMove(world.id, m.id).catch((e) => console.error(e));
    }
  });
}
function refreshWorld() { if (!worldUnsub) startLive(); }

// Roads that meet across the gap between two plots form a link (and a bridge).
const roadDone = (p, i) => p.grid[i] === T.ROAD && !p.uc.has(i);
const railDone = (p, i) => p.grid[i] === T.RAIL && !p.uc.has(i);
function computeLinks() {
  bridges = new Map();
  const linksWith = new Map();
  let rail = 0, bus = 0;
  const myStops = [];
  for (let i = 0; i < state.grid.length; i++) if (state.grid[i] === T.STOP && state.cond[i] > 0) myStops.push(i);
  const busService = myStops.length && state.grid.some((t, i) => t === T.DEPOT && state.cond[i] > 0);
  const nearStop = (i) => myStops.some((sp) => Math.abs(sp % PLOT - i % PLOT) + Math.abs(Math.floor(sp / PLOT) - Math.floor(i / PLOT)) <= B[T.STOP].catchment);
  for (const p of plots.values()) {
    for (const [dx, dy, dir] of [[1, 0, 'e'], [0, 1, 's']]) {
      const q = plotAt(p.px + dx, p.py + dy);
      if (!q) continue;
      const list = [];
      for (let k = 0; k < PLOT; k++) {
        const a = dir === 'e' ? k * PLOT + PLOT - 1 : (PLOT - 1) * PLOT + k;
        const b = dir === 'e' ? k * PLOT : k;
        if (roadDone(p, a) && roadDone(q, b)) {
          list.push({ dir, k });
          const mineEnd = p.mine ? a : q.mine ? b : -1;
          if (mineEnd >= 0 && busService && nearStop(mineEnd)) bus++;
        } else if (railDone(p, a) && railDone(q, b)) {
          list.push({ dir, k, rail: true });
          if (p.mine || q.mine) rail++;
        }
      }
      if (!list.length) continue;
      bridges.set(p.id, [...(bridges.get(p.id) || []), ...list]);
      const roads = list.filter((l) => !l.rail).length;
      if (p.mine) linksWith.set(q.id, list.length);
      if (q.mine) linksWith.set(p.id, list.length);
      if ((p.mine || q.mine) && !roads) linksWith.set(p.mine ? q.id : p.id, list.length);
    }
  }
  // Which neighbours are linked, how, and where your side of the crossing is. Their spare capacity
  // is open to your residents; what their residents use here comes from their saved 'out'.
  const abroad = [], visitorsFrom = [], incoming = { fun: 0, care: 0, shop: 0, school: 0, tourists: 0 };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = plotAt(me.px + dx, me.py + dy);
    if (!q || q.status !== 'alive') continue;
    let edge = -1, via = null;
    for (let k = 0; k < PLOT && via !== 'rail'; k++) {
      const mine = dx === 1 ? k * PLOT + PLOT - 1 : dx === -1 ? k * PLOT : dy === 1 ? (PLOT - 1) * PLOT + k : k;
      const theirs = dx === 1 ? k * PLOT : dx === -1 ? k * PLOT + PLOT - 1 : dy === 1 ? k : (PLOT - 1) * PLOT + k;
      if (railDone(me, mine) && railDone(q, theirs)) { edge = mine; via = 'rail'; }
      else if (!via && roadDone(me, mine) && roadDone(q, theirs)) { edge = mine; via = 'road'; }
    }
    if (!via) continue;
    const key = `${q.id}|${q.version}`;
    if (!offerCache.has(key)) offerCache.set(key, sim.offer(q.st));
    abroad.push({ id: q.id, name: q.name, via, edge, ...offerCache.get(key) });
    const theirUse = q.out?.[plotId];
    if (theirUse) {
      for (const k in incoming) incoming[k] += theirUse[k] || 0;
      visitorsFrom.push({ name: q.name, edge, via, ...theirUse });
    }
  }
  state._abroad = abroad;
  state._incoming = incoming;
  state._visitorsFrom = visitorsFrom;
  const before = (state.links || 0) + (state.railLinks || 0);
  const railWas = state.railLinks || 0;
  state.railLinks = rail;
  state.busLinks = bus;
  state.links = [...linksWith.values()].reduce((a, b) => a + b, 0) - rail;
  if (rail > railWas) { notify('A railway now runs to your neighbour. Commuter trains and extra trade start tomorrow.', 'good'); sim.note(state, 'good', 'A railway link to a neighbouring city opened.'); }
  neighbourInfo = SIDES.map(([dx, dy, side]) => {
    const q = plotAt(me.px + dx, me.py + dy);
    return q && { side, px: q.px, py: q.py, name: q.name, ownerName: q.ownerName, pop: q.pop, status: q.status, links: linksWith.get(q.id) || 0 };
  }).filter(Boolean);
  if (state.links + rail > before && rail === railWas) { notify('Linked with a neighbour. Trade income and mood go up.', 'good'); sim.note(state, 'good', 'A road link to a neighbouring city opened.'); play('goal'); }
  dirty = true;
}

// ---------- time ----------
function refreshDerived() {
  totalsNow = sim.totals(state);
  plan = sim.plan(state);
  trips.set(me?.id || plotId, state, plan);
}

function advance() {
  const due = Math.floor((Date.now() - state.lastTick) / TICK_MS);
  if (due <= 0) return null;
  const cap = MAX_OFFLINE_DAYS * HOURS_PER_DAY;
  const before = { day: state.day, money: state.money, pop: state.people.length, log: state.log.length };
  const n = Math.min(due, cap);
  let lastDay = null, newDay = false;
  for (let k = 0; k < n; k++) {
    const r = sim.tick(state);
    if (r.plan) { plan = r.plan; totalsNow = r.totals; }
    if (r.day) { lastDay = r.day; newDay = true; sendEmigrants(r.day.emigrants); }
    if (r.collapsed) { onCollapse(r.collapsed); break; }
  }
  state.lastTick = due > cap || state.status !== 'alive' ? Date.now() : state.lastTick + n * TICK_MS;
  if (newDay || !plan) { plan = state._plan || sim.plan(state); trips.set(plotId, state, plan); }
  if (n >= HOURS_PER_DAY) { state._finished = []; return { ...before, capped: due > cap, days: state.day - before.day }; }
  if (lastDay) onNewDay(lastDay);
  return null;
}

function sendEmigrants(list) {
  for (const e of list || []) {
    const q = plots.get(e.to);
    if (!q?.owner) continue;
    fb.sendMove(world.id, { from: plotId, fromName: state.name, fromOwner: user.uid, to: e.to, toOwner: q.owner, people: e.people.slice(0, 8) })
      .catch((err) => console.error('Move failed', err));
  }
}

function onNewDay(st) {
  const hall = sim.xy(sim.HALL_INDEX);
  if (st.income > 0) { addPop(hall.x, hall.y, 1.8, `+${money(st.income)}`, '#ffd24a'); play('coin'); }
  if (st.event) notify(st.event, 'info');
  if (st.births) notify(`${st.births} baby${st.births > 1 ? ' boom' : ''} born today.`, 'good');
  if (state.day === warnedDay) return;
  warnedDay = state.day;
  const pop = state.people.length;
  if (state.unpaidDays) notify(`Upkeep unpaid for ${state.unpaidDays} day${state.unpaidDays > 1 ? 's' : ''}. Buildings are decaying.`, 'warn');
  else if (st.departures) notify(`${st.departures} ${st.departures > 1 ? 'people' : 'person'} left. Check the needs panel.`, 'warn');
  else if (st.deaths) notify(`${st.deaths} resident${st.deaths > 1 ? 's' : ''} died. See News.`, 'info');
  else if (st.failedTrips > pop * 0.2 && pop > 10) notify(`${st.failedTrips} trips were late yesterday. Turn on traffic to find the jams.`, 'warn');
  else if (st.arrivals) notify(`${st.arrivals} new ${st.arrivals > 1 ? 'people' : 'person'} moved in.`, 'info');
  if (st.graduates) notify(`${st.graduates} graduate${st.graduates > 1 ? 's' : ''} from university.`, 'good');
}

function drainFinished() {
  const list = state._finished || [];
  state._finished = [];
  for (const f of list) {
    const { x, y } = sim.xy(f.i), t = state.grid[f.i];
    if (t === T.EMPTY || t === T.ROAD || t === T.PATH) continue;
    if (f.up) { addPop(x, y, modelHeight(t, state.lv[f.i]) + 0.4, `Level ${state.lv[f.i]}`, '#ffffff'); play('level'); announce(`${B[t].name} reached level ${state.lv[f.i]}.`); }
    else { addPop(x, y, modelHeight(t) + 0.4, 'Built', '#ffffff'); play('done'); }
  }
  if (list.length) { refreshDerived(); computeLinks(); }
}

function checkGoals() {
  const got = sim.checkGoals(state, totalsNow || sim.totals(state));
  if (got.length) {
    const sum = got.reduce((a, g) => a + g.reward, 0), hall = sim.xy(sim.HALL_INDEX);
    addPop(hall.x, hall.y, 2, `+${money(sum)}`, '#ffd24a');
    notify(got.length === 1 ? `Goal complete: ${got[0].text}. You earned ${money(sum)}.` : `${got.length} goals complete. You earned ${money(sum)}.`, 'good');
    play('goal');
    if (drawer === 'goals') renderDrawer();
    scheduleSave();
  }
  if (profile) {
    if (acct.syncLife(profile, state, plotId)) profileDirty = true;
    for (const a of acct.checkAchievements(profile, state)) {
      profileDirty = true;
      notify(`Achievement unlocked: ${a.name}. ${a.text}.`, 'good');
      play('level');
    }
  }
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
    updateFollowChip();
    if (drawer === 'inspect' || drawer === 'person') renderDrawer();
    else if (drawer && drawer !== 'world' && drawer !== 'chat' && state.hour !== lastHour) renderDrawer();
    lastHour = state.hour;
    if (Date.now() - lastSave > SAVE_EVERY_MS) save();
  }, 500);
}
function stopLoops() { clearInterval(loopTimer); clearInterval(worldTimer); }

document.addEventListener('visibilitychange', () => {
  if (!state) return;
  if (document.hidden) save();
  else { const r = advance(); syncMine(); updateHud(); if (r) showAway(r); }
});
window.addEventListener('pagehide', () => state && save());

// ---------- saving ----------
function scheduleSave(ms = 1500) { clearTimeout(saveTimer); saveTimer = setTimeout(save, ms); }
async function save(extra) {
  if (!state || !plotId || !user) return;
  clearTimeout(saveTimer);
  lastSave = Date.now();
  const out = plan?.out || {};
  const snap = sim.serialize(state) + JSON.stringify(out);
  if (!extra && snap === lastSaved) return;
  lastSaved = snap;
  try { await fb.savePlot(plotId, state, { ...(extra || {}), out }); } catch (e) { console.error(e); notify('Couldn’t save just now. Your city is safe here and will retry.', 'warn'); }
  if (profile && profileDirty) { profileDirty = false; fb.saveProfile(user.uid, profile).catch((e) => console.error('Profile', e)); }
}
async function loadProfile() {
  try { profile = await fb.getProfile(user.uid); } catch (e) { console.error(e); }
  // A brand-new profile counts everything this city has already done.
  profile ||= { name: mayor, colour: acct.COLOURS[0], stats: acct.emptyLife(), achievements: {}, base: { [plotId]: { day: 0, city: state.cityNo, goals: 0 } } };
  if (acct.syncLife(profile, state, plotId)) profileDirty = true;
  acct.checkAchievements(profile, state);
  profileDirty = true;
}

// ---------- chat ----------
function startChat() {
  chatUnsub?.();
  chatMessages = []; chatUnread = 0;
  let first = true;
  chatUnsub = fb.listenChat(world.id, (msgs) => {
    const fresh = first ? 0 : msgs.filter((m) => !chatMessages.some((o) => o.id === m.id) && m.uid !== user.uid).length;
    first = false;
    chatMessages = msgs;
    if (drawer === 'chat') renderDrawer();
    else if (fresh) { chatUnread += fresh; updateHud(); }
  });
}
const colourOf = (uid) => acct.COLOURS[Math.floor(sim.h32(uid.length * 31 + uid.charCodeAt(0), uid.charCodeAt(uid.length - 1)) * acct.COLOURS.length)];

// ---------- modes and actions ----------
const isMine = (h) => !!h && !!me && h.px === me.px && h.py === me.py;

function setMode(m) {
  mode = m;
  brush = null;
  if (m !== 'move') moveFrom = -1;
  closeCatalog();
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', b.dataset.mode === m);
  canvas.dataset.tool = m;
  renderModebar();
  if (cursor) hover = hoverInfo(cursor);
  dirty = true;
}
function setBrush(b) {
  brush = brush === b ? null : b;
  closeCatalog();
  renderModebar();
  dirty = true;
}
function buildDock() {
  document.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { setMode(b.dataset.mode); announce(`${b.textContent.trim()} mode`); }; });
}
function renderModebar() {
  const bar = $('modebar');
  let html = '';
  if (mode === 'build') {
    html = `${[[T.ROAD, 'road', 'i-road'], [T.PATH, 'path', 'i-path'], [T.RAIL, 'rail', 'i-rail'], ['clear', 'clear', 'i-clear']].map(([t, key, ic]) => {
      const label = t === 'clear' ? 'Clear' : B[t].name, cost = t === 'clear' ? '' : `$${B[t].cost}`;
      return `<button type="button" class="brush" data-brush="${key}" aria-pressed="${brush === key}" title="${t === 'clear' ? 'Demolish by dragging' : esc(B[t].blurb)}">${icon(ic)}<span>${label}</span><small class="num">${cost}</small></button>`;
    }).join('')}<p class="mhint">${brush ? 'Drag to paint. Tap the brush again to stop.' : `Tap empty land to choose a building. Land parcels cost <b class="num">${money(sim.landPrice(state))}</b>.`}</p>`;
  } else if (mode === 'move') {
    html = moveFrom >= 0
      ? `<p class="mhint">Moving the <b>${B[state.grid[moveFrom]].name.toLowerCase()}</b>. Tap an empty tile you own. Costs <b class="num">$${Math.round(B[state.grid[moveFrom]].cost * MOVE_FEE)}</b>.</p><button class="btn" type="button" id="move-cancel">Cancel</button>`
      : '<p class="mhint">Tap one of your buildings to pick it up. Residents, staff and pupils move with it.</p>';
  } else html = '<p class="mhint">Tap anything for details and options, including people on the move. Tap a building site to help build.</p>';
  bar.innerHTML = html;
  bar.querySelectorAll('[data-brush]').forEach((b) => { b.onclick = () => setBrush(b.dataset.brush); });
  $('move-cancel')?.addEventListener('click', () => { moveFrom = -1; renderModebar(); dirty = true; });
  $('tool-tip').textContent = '';
  tut.refresh();
}

function placeAt(i, type, quiet) {
  const { x, y } = sim.xy(i);
  const r = sim.place(state, i, type);
  if (r.ok) {
    play('place');
    undoStack.push(i);
    if (undoStack.length > 40) undoStack.shift();
    if (!BRUSHES.includes(type)) addPop(x, y, 0.8, `−$${r.cost}`, '#ffffff');
    announce(`${B[type].name} placed at ${x + 1}, ${y + 1}. ${money(state.money)} left.`);
    afterChange();
  } else if (!quiet || r.reason.startsWith('Needs')) { notify(r.reason, 'act'); play('error'); }
  return r.ok;
}
function demolish(i, quiet) {
  if (quiet && state.grid[i] === T.EMPTY) return false;
  const { x, y } = sim.xy(i);
  const r = sim.bulldoze(state, i);
  if (r.ok) { play('clear'); if (r.refund) addPop(x, y, 0.6, `${r.refund > 0 ? '+' : ''}${money(r.refund)}`, r.refund > 0 ? '#ffd24a' : '#ffffff'); afterChange(); }
  else if (!quiet) { notify(r.reason, 'act'); play('error'); }
  return r.ok;
}
function upgradeAt(i) {
  const { x, y } = sim.xy(i);
  const r = sim.upgrade(state, i);
  if (r.ok) { play('place'); addPop(x, y, 1.2, `−$${r.cost}`, '#ffffff'); announce(`Upgrading for ${money(r.cost)}.`); afterChange(); }
  else { notify(r.reason, 'act'); play('error'); }
}
function buyChunk(c) {
  const r = sim.buyLand(state, c);
  if (!r.ok) { notify(r.reason, 'act'); play('error'); return; }
  play('coin');
  const cx = (c % CHUNKS) * CHUNK + CHUNK / 2, cy = Math.floor(c / CHUNKS) * CHUNK + CHUNK / 2;
  addPop(cx - 0.5, cy - 0.5, 0.8, `−$${r.price}`, '#ffffff');
  notify(`Land bought for ${money(r.price)}. You can build there now.`, 'act');
  renderModebar();
  afterChange();
}
function askBuyLand(i) {
  const c = sim.chunkOf(i), r = sim.canBuyLand(state, c);
  openModal(`${closeX}<h2 id="modal-title">Buy this land?</h2>
    <p>A ${CHUNK}×${CHUNK} parcel: ${CHUNK * CHUNK} tiles you can build on. ${r.ok || r.price ? `It costs <b>${money(r.price ?? sim.landPrice(state))}</b>, and each parcel after costs a little more.` : ''}</p>
    ${r.ok ? '' : `<p class="warn">${esc(r.reason)}</p>`}
    <div class="mfoot"><button class="btn" data-close>Not now</button><button class="btn primary" id="buy-go" ${r.ok ? '' : 'disabled'}>Buy for ${money(r.price ?? sim.landPrice(state))}</button></div>`);
  if (r.ok) $('buy-go').onclick = () => { closeModal(); buyChunk(c); };
}
function doMove(to) {
  const r = sim.moveBuilding(state, moveFrom, to);
  if (!r.ok) { notify(r.reason, 'act'); play('error'); return; }
  const { x, y } = sim.xy(to);
  play('place');
  addPop(x, y, 1, `−$${r.fee}`, '#ffffff');
  notify('Moved. Everyone who lived or worked there came along.', 'act');
  moveFrom = -1;
  renderModebar();
  afterChange();
}

function afterChange() {
  refreshDerived();
  syncMine();
  computeLinks();
  updateHud();
  if (drawer) renderDrawer();
  if (catalog) renderCatalog();
  scheduleSave();
}

function tap(i) {
  const r = sim.tapHelp(state, i);
  const { x, y } = sim.xy(i);
  if (r.ok) {
    taps++;
    play(r.done ? 'done' : 'tap');
    addPop(x, y, 1.2, r.done ? 'Built' : pct(r.progress), '#ffffff');
    afterChange();
  } else if (r.reason) notify(r.reason, 'act');
}

// What a tap does depends on the mode.
function click(h, sx, sy) {
  const who = sx !== undefined ? agentAt(sx, sy) : null;
  if (who && who.vehicle && mode === 'select') {
    const n = who.vehicle === 'bus' ? plan.riders.bus : plan.riders.train;
    notify(who.vehicle === 'bus' ? `A bus. ${plan.drivers} driver${plan.drivers === 1 ? '' : 's'} carry ${n} of ${plan.busCap} possible riders today.` : `A train. ${n} people ride the trains today.`, 'act');
    return;
  }
  if (who && who.visitor) { notify(`A visitor from ${who.visitor}, here for the evening.`, 'act'); return; }
  if (who && !who.vehicle && mode !== 'build' && !(mode === 'move' && moveFrom >= 0)) { showPerson(who.p, who.plot); return; }
  if (!h) { closeDrawer(); closeCatalog(); return; }
  if (!isMine(h)) {
    if (mode === 'build') notify(plotAt(h.px, h.py) ? `That plot belongs to ${plotAt(h.px, h.py).ownerName}.` : 'Nobody has claimed that land yet.', 'act');
    select(h);
    return;
  }
  const t = state.grid[h.i];
  if (mode === 'build') {
    if (!sim.owns(state, h.i)) { askBuyLand(h.i); return; }
    if (t === T.EMPTY) { openCatalog(h.i); return; }
    if (state.queue.some((q) => q.i === h.i)) tap(h.i);
    select(h);
  } else if (mode === 'move') {
    if (moveFrom < 0) {
      const c = sim.canMove(state, h.i, -1);
      if (!B[t]?.cat || state.queue.some((q) => q.i === h.i)) { notify(c.reason || 'Pick one of your finished buildings.', 'act'); play('error'); return; }
      moveFrom = h.i; renderModebar(); play('tap'); dirty = true;
    } else if (h.i === moveFrom) { moveFrom = -1; renderModebar(); dirty = true; }
    else doMove(h.i);
  } else {
    if (state.queue.some((q) => q.i === h.i)) tap(h.i);
    select(h);
  }
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
  const out = { ...h, tool: mode };
  const t = state.grid[h.i];
  if (mode === 'build') {
    if (!sim.owns(state, h.i)) { out.ok = false; out.sale = true; }
    else if (brush === 'clear') { out.ok = t !== T.EMPTY && t !== T.HALL; out.tool = 'bulldoze'; }
    else if (brush) { const type = { road: T.ROAD, path: T.PATH, rail: T.RAIL }[brush]; out.ok = sim.canPlace(state, h.i, type).ok; out.ghost = type; }
    else out.ok = t === T.EMPTY || t !== T.RUBBLE;
  } else if (mode === 'move') {
    if (moveFrom >= 0) { out.ok = sim.canMove(state, moveFrom, h.i).ok; if (out.ok) out.ghost = state.grid[moveFrom]; }
    else out.ok = !!B[t]?.cat;
  } else out.ok = true;
  return out;
}

function onCollapse(record) {
  syncMine();
  save();
  fb.writeLegacy(user, plotId, mayor, record, world.id).catch((e) => console.error('Legacy write failed', e));
  play('warn');
  showRuins(record);
}
function addPop(tx, ty, h, text, col) {
  if (!prefs.popups || !me) return;
  pops.push({ wx: me.px * STRIDE + tx + 0.5, wy: me.py * STRIDE + ty + 0.5, h, text, col, t0: performance.now(), dur: 1400 });
}
const clockNow = () => (state ? state.hour + Math.min(0.999, (Date.now() - state.lastTick) / TICK_MS) : 12);
function nightAmt() {
  if (!prefs.dayNight || !state) return 0;
  const h = clockNow();
  if (h >= 20 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 7) return 1 - (h - 5) / 2;
  return 0;
}

// ---------- build catalogue ----------
function openCatalog(i) { catalog = { tile: i }; renderCatalog(); play('tap'); }
function closeCatalog() { if (!catalog) return; catalog = null; $('catalog').classList.add('hidden'); dirty = true; }
function renderCatalog() {
  const box = $('catalog');
  if (!catalog) return;
  const scroll = box.querySelector('.cat-grid')?.scrollTop || 0;
  box.innerHTML = panels.catalogHtml({ s: state, tile: catalog.tile, cat: catCat, avail: (t) => sim.availability(state, t) });
  box.classList.remove('hidden');
  box.querySelector('.cat-grid').scrollTop = scroll;
  for (const c of box.querySelectorAll('canvas.thumb')) thumbnail(c, +c.dataset.type, palette(prefs), resolvedTheme(prefs));
  box.querySelector('[data-cat-close]').onclick = closeCatalog;
  box.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { catCat = b.dataset.cat; renderCatalog(); }; });
  box.querySelectorAll('[data-build]').forEach((b) => {
    b.onclick = () => {
      const t = +b.dataset.build, a = sim.availability(state, t);
      if (!a.ok) { notify(`${B[t].name}: ${a.reason}.`, 'act'); play('error'); return; }
      const tile = catalog.tile;
      closeCatalog();
      placeAt(tile, t);
    };
  });
  if (!box.contains(document.activeElement)) box.querySelector('[data-cat][aria-checked="true"]')?.focus({ preventScroll: true });
  dirty = true;
}

// ---------- people ----------
function agentAt(sx, sy) {
  let best = null, bd = 16;
  for (const id of visiblePlotIds()) {
    const p = plots.get(id);
    for (const a of trips.agents(id)) {
      if (a.lx === undefined) continue;
      if (a.vehicle && id !== plotId) continue;
      const [x, y] = renderer.project(p.px * STRIDE + a.lx, p.py * STRIDE + a.ly, 0.1);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = { p: a.p, plot: id, vehicle: a.vehicle && a.mode, visitor: a.visitor, abroad: a.trip?.city }; }
    }
  }
  return best;
}
function showPerson(pid, plot = plotId) {
  if (plot !== plotId) {
    const st = plots.get(plot)?.st, p = st?.people.find((x) => x.i === pid);
    if (p) notify(`${sim.personName(p)} lives in ${st.name}. ${jobText(st, p)}.`, 'act');
    return;
  }
  personId = pid;
  selected = null;
  drawer = 'person';
  closeCatalog();
  renderDrawer();
  dirty = true;
}
function follow(pid) {
  trips.follow(plotId, pid);
  followCam = true;
  updateFollowChip();
  $('follow').classList.remove('hidden');
  if (renderer.cam.z < 18) renderer.cam.z = 22;
  const p = state.people.find((x) => x.i === pid);
  if (p) announce(`Following ${sim.personName(p)}.`);
}
function stopFollow() {
  trips.unfollow();
  followCam = false;
  $('follow').classList.add('hidden');
  dirty = true;
}
function updateFollowChip() {
  if (!trips.followed) return;
  const p = state.people.find((x) => x.i === trips.followed.person);
  if (!p) { stopFollow(); return; }
  $('follow-text').textContent = `${sim.personName(p)}: ${whereabouts(state, plan, p, clockNow(), trips.followedAgent())}`;
}
$('follow-stop').onclick = stopFollow;

// ---------- input ----------
const pointers = new Map();
let drag = null, pinch = null;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  cursor = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], m = mid(a, b);
    pinch = { d: gap(a, b), z: renderer.cam.z, w: renderer.toWorld(m.x, m.y) };
    drag = null; followCam = false;
    return;
  }
  const panOnly = e.button !== 0 || spaceHeld || e.shiftKey;
  const h = renderer.hit(e.offsetX, e.offsetY);
  const paints = !panOnly && mode === 'build' && !!brush && isMine(h);
  drag = { x: e.offsetX, y: e.offsetY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false, paints, last: null, button: e.button };
  if (paints) { paint(h, false); drag.last = h.i; }
});
function paint(h, quiet) {
  if (!sim.owns(state, h.i)) { if (!quiet) notify('You don’t own this land yet. Tap it without a brush to buy it.', 'act'); return; }
  if (brush === 'clear') demolish(h.i, quiet);
  else placeAt(h.i, { road: T.ROAD, path: T.PATH, rail: T.RAIL }[brush], quiet);
}
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], m = mid(a, b);
    renderer.cam.z = Math.min(64, Math.max(1.6, pinch.z * gap(a, b) / pinch.d));
    const w = renderer.toWorld(m.x, m.y);
    renderer.cam.x += pinch.w.x - w.x; renderer.cam.y += pinch.w.y - w.y;
    dirty = true;
    return;
  }
  const h = renderer.hit(e.offsetX, e.offsetY);
  if (drag) {
    if (Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) > 5) drag.moved = true;
    if (drag.paints) { if (isMine(h) && h.i !== drag.last) { paint(h, true); drag.last = h.i; } }
    else if (drag.moved) {
      followCam = false;
      renderer.cam.x = drag.cx; renderer.cam.y = drag.cy;
      const a = renderer.toWorld(drag.x, drag.y), b = renderer.toWorld(e.offsetX, e.offsetY);
      renderer.cam.x = drag.cx - (b.x - a.x); renderer.cam.y = drag.cy - (b.y - a.y);
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
  if (drag && !drag.moved && !drag.paints && drag.button === 0) click(renderer.hit(e.offsetX, e.offsetY), e.offsetX, e.offsetY);
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { hover = null; dirty = true; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); renderer.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); dirty = true; }, { passive: false });

// Keyboard play: a tile cursor on your own plot.
function moveCursor(dx, dy) {
  if (!me) return;
  if (!cursor) { const c = sim.xy(sim.HALL_INDEX); cursor = { px: me.px, py: me.py, tx: c.x, ty: c.y }; }
  else { cursor.tx = Math.max(0, Math.min(PLOT - 1, cursor.tx + dx)); cursor.ty = Math.max(0, Math.min(PLOT - 1, cursor.ty + dy)); }
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
  if (e.key === 'Escape' && catalog) { closeCatalog(); canvas.focus(); return; }
  if (e.target.closest('input, textarea, select, dialog')) return;
  const k = e.key, lk = k.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && lk === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const onMap = document.activeElement === canvas;
  if (e.code === 'Space' && !onMap) { spaceHeld = true; return; }
  const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (onMap && arrows[k]) { e.preventDefault(); moveCursor(...arrows[k]); return; }
  if (onMap && (k === 'Enter' || k === ' ') && cursor) {
    e.preventDefault();
    if (mode === 'build' && brush) paint(cursor, false); else click(cursor);
    return;
  }
  const pan = { w: [0, -60], a: [-60, 0], s: [0, 60], d: [60, 0] }[lk];
  if (pan) { followCam = false; renderer.panBy(-pan[0], -pan[1]); dirty = true; return; }
  if (k === '+' || k === '=') { renderer.zoomAt(renderer.w / 2, renderer.h / 2, 1.2); dirty = true; return; }
  if (k === '-' || k === '_') { renderer.zoomAt(renderer.w / 2, renderer.h / 2, 1 / 1.2); dirty = true; return; }
  if (mode === 'build' && ['1', '2', '3', '4'].includes(k)) { setBrush(['road', 'path', 'rail', 'clear'][+k - 1]); return; }
  const actions = {
    b: () => setMode('build'), e: () => setMode('select'), r: () => setMode('move'),
    '0': fitWorld, t: toggleTraffic, v: toggleView, h: fitHome, g: () => setPref('grid', !prefs.grid),
    m: () => { setPref('sound', !prefs.sound); notify(prefs.sound ? 'Sound on' : 'Sound off', 'act'); },
    o: () => openPanel('goals'), p: () => openPanel('people'), c: () => openPanel('stats'), n: () => openPanel('news'),
    k: () => openPanel('chat'), j: () => openPanel('world'), l: showBoard, ',': showSettings, '?': showHelp,
    escape: () => { if (trips.followed) stopFollow(); if (brush) setBrush(brush); else if (moveFrom >= 0) { moveFrom = -1; renderModebar(); } else closeDrawer(); cursor = null; hover = null; },
  };
  if (actions[lk]) { e.preventDefault(); actions[lk](); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });

// ---------- frame ----------
function visiblePlotIds() {
  const detailed = prefs.view === 'flat' ? renderer.cam.z * 1.3 >= 9 : renderer.cam.z >= 7;
  if (!detailed) return [];
  const bd = renderer.bounds(), out = [];
  for (const p of plots.values()) {
    if (p.px * STRIDE < bd.x1 && (p.px + 1) * STRIDE > bd.x0 && p.py * STRIDE < bd.y1 && (p.py + 1) * STRIDE > bd.y0) {
      if (!trips.has(p.id) && p.status === 'alive') trips.set(p.id, p.st);
      out.push(p.id);
    }
  }
  return out;
}
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state && !$('game').classList.contains('hidden')) {
    pops = pops.filter((p) => now - p.t0 < p.dur);
    const t = clockNow();
    const agentsByPlot = prefs.cars ? trips.update(dt, visiblePlotIds(), () => t, prefs.density) : new Map();
    const fa = followCam && trips.followedAgent();
    if (fa) {
      renderer.cam.x += (me.px * STRIDE + fa.lx - renderer.cam.x) * Math.min(1, dt * 4);
      renderer.cam.y += (me.py * STRIDE + fa.ly - renderer.cam.y) * Math.min(1, dt * 4);
    }
    let hv = hover;
    if (mode === 'move' && moveFrom >= 0) {
      const { x, y } = sim.xy(moveFrom);
      hv = hover || null;
      pulseTileMove = { px: me.px, py: me.py, tx: x, ty: y };
    } else pulseTileMove = null;
    if (catalog) { const { x, y } = sim.xy(catalog.tile); hv = { px: me.px, py: me.py, tx: x, ty: y, i: catalog.tile, ok: true, tool: 'build' }; }
    if (dirty || agentsByPlot.size || pops.length || pulseTile || pulseTileMove) {
      renderer.draw({
        plots, hover: hv, cursor, selected, overlay, traffic: plan, agentsByPlot, pops, prefs, bridges, pulseTile: pulseTile || pulseTileMove,
        showLand: mode === 'build', landPrice: state ? sim.landPrice(state) : 0,
        theme: resolvedTheme(prefs), palette: palette(prefs), paletteKey: prefs.colours, shapes: prefs.shapes, nightAmt: nightAmt(),
      });
      dirty = false;
    }
  }
  requestAnimationFrame(frame);
}
let pulseTileMove = null;
requestAnimationFrame(frame);

// ---------- camera ----------
function fitHome() {
  if (!me) return;
  followCam = false;
  renderer.centerOnPlot(me.px, me.py);
  const w = renderer.w, h = renderer.h - 170, span = w < 600 ? 10 : 17;
  renderer.cam.z = prefs.view === 'flat'
    ? Math.max(9, Math.min(44, Math.min(w, h) * 0.92 / (span * 1.3)))
    : Math.max(9, Math.min(44, Math.min(w * 0.92 / (2 * span), h * 0.95 / (span + 2))));
  if (prefs.view === '3d') { renderer.cam.x += 0.6; renderer.cam.y += 0.6; }
  dirty = true;
}
function fitWorld() {
  const all = [...plots.values()];
  if (!all.length) return;
  followCam = false;
  const xs = all.map((p) => p.px), ys = all.map((p) => p.py);
  const minX = Math.min(...xs), maxX = Math.max(...xs) + 1, minY = Math.min(...ys), maxY = Math.max(...ys) + 1;
  renderer.centerOn(((minX + maxX) / 2) * STRIDE, ((minY + maxY) / 2) * STRIDE);
  const span = (Math.max(maxX - minX, maxY - minY) + 0.6) * STRIDE;
  renderer.cam.z = prefs.view === 'flat'
    ? Math.max(1.6, Math.min(8, Math.min(renderer.w, renderer.h) * 0.85 / (span * 1.3)))
    : Math.max(1.6, Math.min(8, Math.min(renderer.w / (2 * span), renderer.h / span) * 0.9));
  dirty = true;
}
function goTo(px, py, tx = PLOT / 2, ty = PLOT / 2, z = 12) {
  followCam = false;
  renderer.centerOn(px * STRIDE + tx + 0.5, py * STRIDE + ty + 0.5);
  if (renderer.cam.z < z) renderer.cam.z = z;
  dirty = true;
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
$('btn-board').onclick = showBoard;
$('btn-settings').onclick = showSettings;
$('btn-account').onclick = () => showAccount();
$('btn-help').onclick = showHelp;
$('btn-undo').onclick = undo;
$('city-name').onclick = showRename;
$('rail').onclick = (e) => { const b = e.target.closest('[data-panel]'); if (b) openPanel(b.dataset.panel); };
$('pulse-toggle').onclick = () => {
  const open = $('pulse-toggle').getAttribute('aria-expanded') !== 'true';
  $('pulse-toggle').setAttribute('aria-expanded', open);
  $('pulse').classList.toggle('closed', !open);
};
function drawThumbs() {
  for (const c of document.querySelectorAll('canvas.thumb')) thumbnail(c, +c.dataset.type, palette(prefs), resolvedTheme(prefs));
}

// ---------- HUD ----------
const RING_C = 2 * Math.PI * 27;
const moodColour = (h) => (h >= 0.65 ? 'var(--good)' : h >= 0.4 ? 'var(--mid)' : 'var(--bad)');
function moodWord(h) {
  if (state.status === 'ruins') return 'Fallen';
  return h >= 0.8 ? 'Thriving' : h >= 0.6 ? 'Content' : h >= 0.4 ? 'Uneasy' : 'Unhappy';
}
const newsKey = () => `commons-news-${plotId}`;
function unseenFrom() {
  const seen = localStorage.getItem(newsKey());
  if (!seen) return 0;
  const k = state.log.findIndex((e) => `${e.d}|${e.t}` === seen);
  return k === -1 ? 0 : k + 1;
}
function markNewsSeen() {
  const last = state.log.at(-1);
  if (last) try { localStorage.setItem(newsKey(), `${last.d}|${last.t}`); } catch { /* ignore */ }
}
function updateHud() {
  if (!state) return;
  const tot = totalsNow || sim.totals(state);
  const c = sim.census(state), st = state.stats, pop = c.total;
  const net = (st.income || 0) - (st.upkeep || 0);
  $('city-name').textContent = state.name;
  $('clock').textContent = state.status === 'ruins' ? `Fell on day ${state.day}` : `Day ${state.day}, ${hourLabel(state.hour)}`;
  $('dayfill').style.width = `${(clockNow() / 24) * 100}%`;
  $('live').classList.toggle('on', live);
  $('live').title = live ? 'Live: other players’ changes appear as they happen' : 'Connecting…';
  $('v-money').textContent = money(state.money);
  $('v-net').textContent = `${net >= 0 ? '+' : '−'}$${Math.abs(net)} a day`;
  $('v-net').classList.toggle('neg', net < 0);
  $('v-pop').textContent = pop;
  $('v-homes').textContent = `${tot.homes} homes`;
  $('v-build').textContent = c.builders;
  $('v-queue').textContent = state.queue.length ? `${state.queue.length} queued` : 'idle';
  const h = state.happiness;
  $('ring-fg').style.strokeDasharray = RING_C;
  $('ring-fg').style.strokeDashoffset = RING_C * (1 - h);
  $('pulse').style.setProperty('--mood', moodColour(h));
  $('v-mood').textContent = pct(h);
  $('v-mood-word').textContent = moodWord(h);
  const needs = plan?.needs || {};
  $('needs').innerHTML = NEEDS.map((n) => `<li title="${esc(n.fix)}">${icon(n.icon)}<span class="nlabel">${n.label}</span>${bar(n.label, needs[n.k] ?? 1)}</li>`).join('');
  const worst = NEEDS.map((n) => [n, needs[n.k] ?? 1]).sort((a, b) => a[1] - b[1])[0];
  $('hint').textContent = state.status === 'ruins' ? 'This city has fallen. Rebuild on the ruins to start again.'
    : worst && worst[1] < 0.7 ? worst[0].fix : 'Everything is covered. Grow, upgrade, and link roads with neighbours for trade.';
  const alert = $('alert');
  const msg = state.status === 'ruins' ? 'City fallen' : state.unpaidDays ? `Upkeep unpaid for ${state.unpaidDays}d` : c.sick > pop * 0.15 && pop > 10 ? `${c.sick} people sick` : state.cases > 3 ? `${state.cases} court cases waiting` : '';
  alert.textContent = msg;
  alert.classList.toggle('hidden', !msg);
  alert.onclick = state.status === 'ruins' ? () => showRuins() : () => { statsTab = 'services'; openPanel('stats'); };
  const left = GOALS.length - state.goalsDone.length;
  $('goals-dot').textContent = left ? String(Math.min(9, left)) : '';
  $('goals-dot').classList.toggle('hidden', !left);
  const unread = drawer === 'news' ? 0 : state.log.length - unseenFrom();
  $('news-dot').textContent = unread ? String(Math.min(9, unread)) : '';
  $('news-dot').classList.toggle('hidden', !unread);
  $('chat-dot').textContent = chatUnread ? String(Math.min(9, chatUnread)) : '';
  $('chat-dot').classList.toggle('hidden', !chatUnread);
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
    g.fillStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(23,49,59,0.4)';
    g.fillRect(x + 2, y + s - 5, Math.max(0, (s - 6) * Math.min(1, (p.pop || 0) / 120)), 2);
  }
  g.strokeStyle = '#2f9e5a'; g.lineWidth = 2;
  for (const [id, list] of bridges) {
    const p = plots.get(id);
    for (const dir of new Set(list.map((b) => b.dir))) {
      const x = ox + (p.px - minX + 0.5) * s, y = oy + (p.py - minY + 0.5) * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (dir === 'e' ? s : 0), y + (dir === 's' ? s : 0)); g.stroke();
    }
  }
  const cx = ox + (renderer.cam.x / STRIDE - minX) * s, cy = oy + (renderer.cam.y / STRIDE - minY) * s;
  g.strokeStyle = dark ? '#fff' : '#17313b'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.stroke();
  c.onclick = (e) => {
    const r = c.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (c.width / r.width), my = (e.clientY - r.top) * (c.height / r.height);
    followCam = false;
    renderer.centerOn(((mx - ox) / s + minX) * STRIDE, ((my - oy) / s + minY) * STRIDE);
    dirty = true;
    drawMinimap();
  };
}

// ---------- drawer ----------
function openPanel(m) {
  if (drawer === m) { closeDrawer(); return; }
  drawer = m;
  selected = null;
  closeCatalog();
  if (m === 'world') loadWorlds();
  if (m === 'chat') chatUnread = 0;
  renderDrawer();
  if (m === 'news') markNewsSeen();
  updateHud();
  dirty = true;
}
function closeDrawer() {
  drawer = null; selected = null; personId = null;
  renderDrawer();
  dirty = true;
  if (state) canvas.focus({ preventScroll: true });
}
function select(h) {
  if (!h) { closeDrawer(); return; }
  selected = { px: h.px, py: h.py, tx: h.tx, ty: h.ty, i: h.i };
  drawer = 'inspect';
  renderDrawer();
  dirty = true;
}
function renderDrawer() {
  const box = $('drawer');
  for (const b of document.querySelectorAll('#rail [data-panel]')) b.setAttribute('aria-pressed', b.dataset.panel === drawer);
  if (!drawer || !state) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const scroll = box.scrollTop;
  const active = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active && (active.id || active.dataset.do || active.dataset.person || active.dataset.filter);
  const caret = active?.selectionStart;
  let html = '';
  if (drawer === 'inspect') html = inspectorHtml();
  else if (drawer === 'person') {
    const p = state.people.find((x) => x.i === personId);
    if (!p) { drawer = 'people'; return renderDrawer(); }
    const agent = trips.agents(plotId).find((a) => a.p === p.i);
    html = panels.personCard(state, plan, p, whereabouts(state, plan, p, clockNow(), agent));
  } else if (drawer === 'goals') html = panels.goalsPanel(state);
  else if (drawer === 'people') html = panels.peoplePanel(state, plan, peopleFilter, peopleQuery);
  else if (drawer === 'stats') html = panels.statsPanel({ state, totals: totalsNow || sim.totals(state), plan, census: sim.census(state) }, statsTab);
  else if (drawer === 'news') html = panels.newsPanel(state, unseenFrom());
  else if (drawer === 'chat') html = panels.chatPanel({ messages: chatMessages, me: user.uid, world, colourOf });
  else if (drawer === 'world') html = panels.worldPanel(worldCtx());
  box.innerHTML = html;
  box.classList.remove('hidden');
  box.dataset.mode = drawer;
  wireDrawer(box);
  box.scrollTop = scroll;
  if (drawer === 'chat') { $('chat-text').value = chatDraft; const l = $('chat-list'); l.scrollTop = l.scrollHeight; }
  if (focusKey) {
    const el = box.querySelector(`#${CSS.escape(focusKey)}`) || box.querySelector(`[data-do="${focusKey}"],[data-person="${focusKey}"],[data-filter="${focusKey}"]`);
    if (el) { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
  }
}

function wireDrawer(box) {
  box.querySelectorAll('[data-close-drawer]').forEach((b) => { b.onclick = closeDrawer; });
  box.querySelectorAll('[data-do]').forEach((b) => { b.onclick = () => inspectorAction(b.dataset.do, b.dataset.arg); });
  box.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => { peopleFilter = b.dataset.filter; renderDrawer(); }; });
  box.querySelectorAll('[data-stats-tab]').forEach((b) => { b.onclick = () => { statsTab = b.dataset.statsTab; renderDrawer(); }; });
  box.querySelectorAll('[data-panel-go]').forEach((b) => { b.onclick = () => { drawer = null; openPanel(b.dataset.panelGo); }; });
  const q = box.querySelector('#people-q');
  if (q) q.oninput = () => { peopleQuery = q.value; renderDrawer(); };
  box.querySelectorAll('[data-person]').forEach((b) => { b.onclick = () => showPerson(+b.dataset.person); });
  box.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => { const [x, y] = b.dataset.goto.split(',').map(Number); goTo(x, y); }; });
  box.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => confirmMove(b.dataset.move); });
  box.querySelectorAll('[data-world]').forEach((b) => { b.onclick = () => switchWorld(b.dataset.world); });
  box.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); notify('Invite code copied.', 'act'); } catch { notify(`Code: ${b.dataset.copy}`, 'act'); } };
  });
  const chat = box.querySelector('#chat-form');
  if (chat) {
    $('chat-text').oninput = (e) => { chatDraft = e.target.value; };
    chat.onsubmit = async (e) => {
      e.preventDefault();
      const text = chatDraft.trim();
      if (!text) return;
      if (Date.now() - lastChat < 2500) { notify('Slow down a little.', 'act'); return; }
      lastChat = Date.now();
      chatDraft = '';
      $('chat-text').value = '';
      try {
        await fb.sendChat(world.id, user, mayor.slice(0, 24), state.name.slice(0, 40), text.slice(0, 280));
        if (profile) { profile.stats.messages = (profile.stats.messages || 0) + 1; profileDirty = true; }
      } catch (err) { console.error(err); notify('Couldn’t send that message.', 'warn'); chatDraft = text; }
    };
  }
  const create = box.querySelector('#world-create');
  if (create) create.onsubmit = (e) => {
    e.preventDefault();
    busy(create.querySelector('button'), async () => {
      const name = $('world-name').value.trim();
      if (!name) throw new Error('Give the world a name.');
      await save();
      const w = await fb.createWorld(user, name);
      notify(`Created ${w.name}. Invite code ${w.code}.`, 'act');
      setWorld(w);
      enter(user);
    }, $('world-msg'));
  };
  const join = box.querySelector('#world-join');
  if (join) join.onsubmit = (e) => {
    e.preventDefault();
    busy(join.querySelector('button'), async () => {
      const w = await fb.findWorldByCode($('world-code').value);
      if (w.id === world.id) throw new Error('You’re already playing in that world.');
      await save();
      setWorld(w);
      enter(user);
    }, $('world-msg'));
  };
}

// ---------- inspector ----------
function inspectorAction(what, arg) {
  const i = selected?.i;
  if (what === 'tap') tap(i);
  else if (what === 'upgrade') upgradeAt(i);
  else if (what === 'clear') demolish(i, false);
  else if (what === 'move') { setMode('move'); moveFrom = i; renderModebar(); notify('Now tap an empty tile you own to put it down.', 'act'); dirty = true; }
  else if (what === 'follow') { follow(+arg); return; }
  else if (what === 'home') { const { x, y } = sim.xy(+arg); select({ px: me.px, py: me.py, tx: x, ty: y, i: +arg }); goTo(me.px, me.py, x, y, 18); return; }
  else if (what === 'moveto') { confirmMove(arg); return; }
  renderDrawer();
}
const row = (label, value) => `<div class="kv"><span>${label}</span><b class="num">${value}</b></div>`;
const meter = (label, v) => `<div class="kv"><span>${label}</span>${bar(label, v, 'small')}</div>`;
const faces = (list, label) => list.length ? `<h3 class="sub">${label} <b class="num soft">${list.length}</b></h3><div class="faces">${list.slice(0, 24).map((p) =>
  `<button type="button" class="face" data-person="${p.i}" title="${esc(sim.personName(p))}, ${p.a}. ${esc(jobText(state, p))}">${avatar(p)}</button>`).join('')}${list.length > 24 ? `<span class="soft small">+${list.length - 24}</span>` : ''}</div>` : '';

function inspectorHtml() {
  const close = `<button class="iconbtn close" type="button" data-close-drawer aria-label="Close details">${icon('i-close')}</button>`;
  return `${close}${isMine(selected) ? ownTile(selected.i) : otherPlot(selected)}`;
}

function ownTile(i) {
  const t = state.grid[i], d = B[t];
  const q = state.queue.find((q) => q.i === i);
  const lv = state.lv[i] || 1;
  const { x, y } = sim.xy(i);
  const where = `<p class="where">Tile ${x + 1}, ${y + 1}</p>`;
  if (!sim.owns(state, i)) return `<h2>Land for sale</h2>${where}<p>Switch to Build and tap it to buy this parcel for ${money(sim.landPrice(state))}.</p>`;
  if (t === T.EMPTY) return `<h2>Empty land</h2>${where}<p>Switch to Build and tap here to see everything you can put on it.</p>`;
  if (t === T.RUBBLE) return `<h2>Rubble</h2>${where}<p>Left from a city that fell. Clearing it costs $${RUBBLE_CLEAR_COST}.</p>
    <div class="actions"><button class="btn" data-do="clear">${icon('i-clear')}Clear for $${RUBBLE_CLEAR_COST}</button></div>`;
  if (t === T.RAIL && !q) {
    const onLine = (plan?.trainLines || []).some((l) => l.includes(i));
    return `<h2>Railway</h2>${where}<p class="soft small">${esc(d.blurb)}</p>${row('Trains use it', onLine ? 'Yes' : 'Not yet')}
      ${onLine ? '' : '<p class="soft small">Trains run once a staffed station sits beside the track, with another station or the plot edge further along.</p>'}
      <div class="actions"><button class="btn" data-do="clear">${icon('i-clear')}Remove</button></div>`;
  }
  if ((t === T.ROAD || t === T.PATH) && !q) {
    const load = plan?.load[i] ?? 0, cap = plan?.cap[i] || 45;
    const users = new Set((plan?.trips || []).filter((tr) => tr.path.includes(i)).map((tr) => tr.mode));
    return `<h2>${d.name}</h2>${where}${t === T.ROAD ? meter('Traffic', Math.min(1, load / cap)) + row('Car trips a day', `${Math.round(load)} of ${cap}`) : ''}
      ${row('Used by', [...users].map((m) => ({ car: 'cars', bike: 'bikes', walk: 'walkers' })[m]).join(', ') || 'nobody yet')}
      ${load > cap ? '<p class="warn">Jammed. Add another route, a footpath, or move jobs closer to homes.</p>' : ''}
      <div class="actions"><button class="btn" data-do="clear">${icon('i-clear')}Remove</button></div>`;
  }
  if (q && !q.up) {
    const total = d.work, done = 1 - q.left / total, pos = state.queue.indexOf(q);
    return `<h2>${d.name}</h2>${where}<p class="soft">Under construction</p>
      <div class="progress big"><i style="width:${done * 100}%"></i></div>${row('Done', pct(done))}
      <p>${pos === 0 ? 'Builders are working on this now.' : `${pos} job${pos > 1 ? 's' : ''} ahead of it.`} More builders finish faster.</p>
      <p class="soft small">${esc(panels.gives(t))}</p>
      <div class="actions">${q.tap < total * 0.25 - 1e-6 ? `<button class="btn primary" data-do="tap">${icon('i-hammer')}Help build</button>` : ''}<button class="btn" data-do="clear">${icon('i-clear')}Cancel</button></div>`;
  }
  const cond = t === T.HALL ? 100 : state.cond[i];
  const people = state.people;
  let body = `<p class="soft small">${esc(d.blurb || '')}</p>`;
  if (d.jobs) {
    const slots = sim.jobSlots(state, i), staff = people.filter((p) => p.j === i && !p.oj);
    body += `<div class="kv"><span>Staff</span><b class="num">${staff.length} of ${slots.reduce((a, b) => a + b, 0)}</b></div>`;
    d.jobs.forEach(([title, e], k) => {
      const n = staff.filter((p) => p.jt === k).length;
      if (n < slots[k]) body += `<p class="soft small">${slots[k] - n} ${title.toLowerCase()} job${slots[k] - n > 1 ? 's' : ''} open${e ? `, needs ${EDU[e].toLowerCase()}` : ''}.</p>`;
    });
    if (!staff.length && (d.school || d.care || d.visits || d.radius || d.cases)) body += '<p class="warn">Closed: nobody works here yet. It needs staff with the right education.</p>';
    body += faces(staff, 'Staff');
  }
  if (isHome(t)) body += row('Homes', `${people.filter((p) => p.h === i).length} of ${sim.homeCap(state, i)}`) + faces(people.filter((p) => p.h === i), 'Residents');
  if (d.school) body += row(d.school.stage === 'daycare' ? 'Places' : 'Seats', `${people.filter((p) => p.sc === i || p.tu === i).length} of ${sim.capacity(state, i, 'seats')}`) + faces(people.filter((p) => p.sc === i || p.tu === i), 'Pupils');
  if (d.care) body += row('Patients today', `${[...(plan?.careFor.values() || [])].filter((c) => c === i).length} of ${Math.floor(sim.capacity(state, i, 'care') * sim.staffing(state, i))}`);
  if (d.visits) body += row('Visitors tonight', `${people.filter((p) => p.fun === i).length} of ${Math.floor(sim.capacity(state, i, 'visits') * sim.staffing(state, i))}`);
  if (d.serves) body += row('Households fed', [...(plan?.shopFor.values() || [])].filter((s) => s === i).length);
  if (d.graves) body += row('Graves used', `${state.graves} of ${sim.capacity(state, i, 'graves')}`);
  if (d.cases) body += row('Cases waiting', state.cases);
  if (d.pollution) body += '<p class="soft small">Homes within 3 tiles are unhappier from the noise.</p>';
  if (t === T.STATION) {
    const onRail = sim.neighbours(i).some((n) => state.grid[n] === T.RAIL);
    const riders = (plan?.trips || []).filter((tr) => tr.mode === 'train' && tr.via?.includes(i)).length;
    const out = people.filter((p) => p.oj === 'rail' && p.j === i);
    body += row('Train riders today', riders) + row('Commute out of town', `${out.length}`);
    if (!onRail) body += '<p class="warn">Not beside a railway. Draw track next to it with the Railway brush.</p>';
    else if (!(plan?.stations || []).includes(i)) body += '<p class="warn">Closed until someone works here.</p>';
    body += `<p class="soft small">${state.railLinks ? `${state.railLinks} railway link${state.railLinks > 1 ? 's' : ''} to neighbours: up to ${state.railLinks * 10} residents can commute to jobs there.` : 'Run the track to your plot edge where a neighbour has track too, and residents can commute to their jobs.'}</p>`;
  }
  if (t === T.STOP) {
    const riders = plan?.stopUse?.get(i) || 0;
    body += row('Riders today', riders) + row('People within 4 tiles', people.filter((p) => Math.abs(p.h % PLOT - x) + Math.abs(Math.floor(p.h / PLOT) - y) <= 4).length);
    if (!plan?.busLoop) body += `<p class="warn">${plan?.drivers ? 'Buses need at least two stops.' : 'No buses yet. A bus depot with drivers runs them.'}</p>`;
  }
  if (t === T.DEPOT) body += row('Buses running', plan?.busLoop?.buses || 0) + row('Riders today', `${plan?.riders?.bus || 0} of ${plan?.busCap || 0}`) + ((plan?.busLoop) ? '' : '<p class="soft small">Build at least two bus stops for the buses to run between.</p>');
  const linked = sim.neighbours(i).some((n) => [T.ROAD, T.PATH, T.HALL].includes(state.grid[n]));
  if (!linked && t !== T.HALL) body += '<p class="warn">Not connected. It needs a road or footpath on one side.</p>';
  const condTxt = cond <= 0 ? '<p class="warn">Abandoned. Clear it and build again.</p>' : cond < 40 ? '<p class="warn">Decaying: works at half capacity until upkeep is paid.</p>' : '';
  let actions = '';
  if (UPGRADABLE.includes(t)) {
    if (q && q.up) {
      const total = Math.round(d.work * 1.2);
      actions += `<p class="soft">Upgrading to level ${lv + 1}: ${pct(1 - q.left / total)} done.</p>${q.tap < total * 0.25 - 1e-6 ? `<button class="btn primary" data-do="tap">${icon('i-hammer')}Help build</button>` : ''}`;
    } else if (lv < MAX_LEVEL) {
      const c = sim.canUpgrade(state, i), cost = sim.upgradeCost(state, i);
      actions += `<button class="btn primary" data-do="upgrade" ${c.ok ? '' : 'disabled'}>${icon('i-up')}Upgrade for ${money(cost)}</button>
        <p class="soft small">${c.ok ? `Level ${lv + 1} adds ${Math.round((LEVEL.capacity[lv + 1] / LEVEL.capacity[lv] - 1) * 100)}% capacity.` : esc(c.reason)}</p>`;
    } else actions += '<p class="soft small">Top level reached.</p>';
  }
  if (d.cat && !q) actions += `<button class="btn" data-do="move">${icon('i-move')}Move for ${money(Math.round(d.cost * MOVE_FEE))}</button>`;
  if (t !== T.HALL) actions += `<button class="btn" data-do="clear">${icon('i-clear')}Demolish</button>`;
  const levelTag = UPGRADABLE.includes(t) ? `<span class="tag">Level ${lv}</span>` : '';
  return `<h2>${d.name} ${levelTag}</h2>${where}${t !== T.HALL ? meter('Condition', cond / 100) : ''}${condTxt}${body}<div class="actions">${actions}</div>`;
}

function otherPlot(h) {
  const p = plotAt(h.px, h.py);
  if (!p) return '<h2>Unclaimed land</h2><p>New players get plots out here on the frontier.</p>';
  if (p.status === 'ruins') {
    return `<div class="plaque"><h2>Ruins of ${esc(p.name)}</h2><p>Built by ${esc(p.ownerName)}. It reached ${p.peakPop} people and lasted ${p.day} days.</p></div>
      <p class="soft small">You can start a new city here. Your current city would become ruins, and you'd bring half your money.</p>
      <div class="actions"><button class="btn primary" data-do="moveto" data-arg="${p.id}">${icon('i-flag')}Move here and rebuild</button></div>`;
  }
  const n = neighbourInfo.find((x) => x.px === p.px && x.py === p.py);
  const t = p.grid[h.i];
  return `<h2>${esc(p.name)}</h2><p class="soft">Mayor ${esc(p.ownerName)}${p.cityNo > 1 ? `, city number ${p.cityNo} on this plot` : ''}</p>
    ${t && B[t] ? `<p class="soft small">You tapped their ${B[t].name.toLowerCase()}.</p>` : ''}
    ${row('People', p.pop)}${row('Peak', p.peakPop)}${row('Days running', p.day)}${meter('Mood', p.happiness || 0)}
    ${n ? row('Road links with you', n.links || 'None yet') : ''}
    ${n && !n.links ? '<p class="soft small">Build a road on your shared edge where theirs meets it to link your cities.</p>' : ''}`;
}

function describeTile(i) {
  const t = state.grid[i], { x, y } = sim.xy(i);
  const q = state.queue.find((q) => q.i === i);
  let d = !sim.owns(state, i) ? 'land for sale' : t === T.EMPTY ? 'empty' : B[t].name;
  if (q && !q.up) d += `, under construction ${pct(1 - q.left / B[t].work)}`;
  else if (UPGRADABLE.includes(t)) d += `, level ${state.lv[i]}`;
  return `Tile ${x + 1}, ${y + 1}: ${d}. ${mode === 'build' ? 'Enter to build here.' : mode === 'move' ? 'Enter to move.' : 'Enter for details.'}`;
}

// ---------- worlds ----------
function worldCtx() {
  const all = [...plots.values()];
  return {
    world, worlds: worlds.length ? worlds : [world], neighbours: neighbourInfo, state, plotCount: all.length, plan, abroad: state._abroad || [], incoming: state._incoming || {},
    isOwnerOfWorld: world.owner === user.uid,
    ruins: all.filter((p) => p.status === 'ruins' && !p.mine).sort((a, b) => b.peakPop - a.peakPop).slice(0, 6),
  };
}
async function loadWorlds() {
  try { worlds = await fb.myWorlds(user); if (drawer === 'world') renderDrawer(); } catch (e) { console.error(e); }
}
async function switchWorld(id) {
  const w = worlds.find((x) => x.id === id);
  if (!w) return;
  await save();
  stopFollow();
  setWorld(w);
  enter(user);
}
function confirmMove(targetId) {
  const p = plots.get(targetId);
  if (!p || p.status !== 'ruins') return;
  const keep = Math.floor(Math.max(0, state.money) * MOVE_KEEP);
  openModal(`${closeX}<h2 id="modal-title">Move to the ruins of ${esc(p.name)}?</h2>
    <p>${esc(state.name)} will be abandoned and fall into ruins, with its record kept on the map. You start fresh there with ${money(REBUILD_MONEY + keep)}: the usual $${REBUILD_MONEY} plus half your money.</p>
    <label class="field"><span>New city name</span><input id="move-name" maxlength="28" value="New ${esc(p.name)}"></label>
    <p id="move-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn" data-close>Stay here</button><button class="btn danger" id="do-move">Abandon ${esc(state.name)} and move</button></div>`);
  $('do-move').onclick = () => busy($('do-move'), async () => {
    const name = $('move-name').value.trim() || `New ${p.name}`;
    const fresh = sim.migrate(JSON.parse(sim.serialize(p.st)));
    sim.rebuild(fresh, name, REBUILD_MONEY + keep);
    fresh.lastTick = Date.now();
    const doc = await fb.takeOverRuins(user, mayor, p.id, fresh, world.id);
    const oldId = plotId, record = sim.collapse(state, 'moved');
    await fb.savePlot(oldId, state).catch((e) => console.error(e));
    fb.writeLegacy(user, oldId, mayor, record, world.id).catch((e) => console.error(e));
    closeModal();
    stopLoops();
    startGame(doc);
    notify(`Welcome to ${name}.`, 'act');
  }, $('move-msg'));
}

// ---------- tutorial ----------
const tut = createTutorial({
  state: () => state, mode: () => mode, brush: () => brush, panel: () => drawer, overlay: () => overlay,
  tool: () => mode, selected: () => selected, selectedMine: () => isMine(selected), taps: () => taps,
  camKey: () => `${renderer.cam.x.toFixed(1)},${renderer.cam.y.toFixed(1)},${renderer.cam.z.toFixed(1)}`,
  hallTile: () => ({ px: me.px, py: me.py, tx: PLOT >> 1, ty: PLOT >> 1 }),
  setPulseTile: (t) => { pulseTile = t; dirty = true; },
  play, announce,
  reward: () => {
    if (state.flags.tutorial) { notify('Tour finished. You can replay it any time from Help.', 'act'); return; }
    state.flags.tutorial = true;
    state.money += TUTORIAL_REWARD;
    const hall = sim.xy(sim.HALL_INDEX);
    addPop(hall.x, hall.y, 2, `+${money(TUTORIAL_REWARD)}`, '#ffd24a');
    play('goal');
    notify(`Tour complete. ${money(TUTORIAL_REWARD)} added to your city.`, 'good');
    afterChange();
  },
});

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
modal.addEventListener('close', () => { if (state && !$('game').classList.contains('hidden')) canvas.focus({ preventScroll: true }); });
const closeX = `<button class="iconbtn mclose" type="button" data-close aria-label="Close">${icon('i-close')}</button>`;

function showWelcome() {
  try { localStorage.setItem('commons-seen-help', '1'); } catch { /* private mode */ }
  openModal(`<h2 id="modal-title">Welcome to ${esc(state.name)}</h2>
    <p>You're the mayor. Six settlers live above the town hall. Give them homes, jobs, schools and somewhere to go at night, and your city grows up around them. It keeps living when you close the game.</p>
    <div class="welcome-choices">
      <button class="choice" type="button" id="w-tour">${icon('i-book')}<b>Take the tour</b><small>About 4 minutes. You build as you learn, and earn $${TUTORIAL_REWARD}.</small></button>
      <button class="choice" type="button" id="w-skip">${icon('i-look')}<b>I'll explore</b><small>You can start the tour any time from Help.</small></button>
    </div>`);
  $('w-tour').onclick = () => { closeModal(); tut.start(0); };
  $('w-skip').onclick = () => { closeModal(); openPanel('goals'); };
  $('w-tour').focus();
}

function showHelp() {
  openModal(`${closeX}<h2 id="modal-title">How Commons works</h2>
    <button class="choice wide-choice" type="button" id="h-tour">${icon('i-book')}<b>${tut.active() ? 'Restart the tour' : 'Take the interactive tour'}</b><small>Learn by building, step by step.</small></button>
    <div class="help">
      <section><h3>${icon('i-hammer')}Build, Select, Move</h3><p>Build: tap empty land for a menu of everything you can afford, or pick a road brush and drag. Select: tap anything for details and options. Move: pick up a building and put it elsewhere.</p></section>
      <section><h3>${icon('i-map')}Land</h3><p>You start with an 8×8 patch. In Build mode, price tags show land next to yours that you can buy.</p></section>
      <section><h3>${icon('i-people')}Real people</h3><p>Every resident has a name, family, age, education, job and routine. Every car, bike and walker is one of them. Tap them.</p></section>
      <section><h3>${icon('i-school')}Growing up</h3><p>A day is a year. Toddlers need daycare or a parent stays home. Children need primary and high school; graduates can go to university for the best jobs.</p></section>
      <section><h3>${icon('i-jobs')}Staffing</h3><p>Schools, clinics, police and venues only open when people with the right education work there.</p></section>
      <section><h3>${icon('i-mood')}Life happens</h3><p>Illness (clinics), injuries (hospitals), old age (cemeteries), crime (police and courts). Families celebrate births and grieve losses.</p></section>
      <section><h3>${icon('i-coin')}Money</h3><p>Working people pay tax, more for skilled jobs. Upkeep is fixed. Unpaid upkeep decays buildings; a city with no people and no money falls.</p></section>
      <section><h3>${icon('i-rail')}Buses and trains</h3><p>A bus depot plus two or more stops runs buses; people near a stop ride instead of driving. Stations beside a railway carry people on long trips.</p></section>
      <section><h3>${icon('i-link')}Neighbours</h3><p>Roads or railways that meet across a plot edge link two cities: trade, mood, and out-of-town jobs by train or bus. Chat with everyone in your world.</p></section>
    </div>
    <h3 class="keys-h">Keys</h3>
    <p class="keys"><kbd>B</kbd> build, <kbd>E</kbd> select, <kbd>R</kbd> move, <kbd>1</kbd>–<kbd>4</kbd> road, footpath, railway, clear (in Build), <kbd>Ctrl</kbd> <kbd>Z</kbd> undo, <kbd>T</kbd> traffic, <kbd>V</kbd> 3D or 2D, <kbd>H</kbd> home, <kbd>0</kbd> whole map, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pan, <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>O</kbd> goals, <kbd>P</kbd> people, <kbd>C</kbd> stats, <kbd>N</kbd> news, <kbd>K</kbd> chat, <kbd>J</kbd> world, <kbd>Esc</kbd> cancel. Click the map, then use the arrow keys and <kbd>Enter</kbd> to play without a mouse.</p>`, 'wide');
  $('h-tour').onclick = () => { closeModal(); tut.start(0); };
}

function showAway(r) {
  const news = state.log.slice(r.log).slice(-6);
  openModal(`<h2 id="modal-title">${r.days} day${r.days === 1 ? '' : 's'} passed while you were away</h2>
    ${r.capped ? `<p>Time only runs for ${MAX_OFFLINE_DAYS} days without you, so your city waited for the rest.</p>` : ''}
    <div class="compare"><div><small>Money</small><b class="num">${money(r.money)} → ${money(state.money)}</b></div>
    <div><small>People</small><b class="num">${r.pop} → ${state.people.length}</b></div></div>
    ${news.length ? `<h3 class="sub">What happened</h3><ul class="news compact">${news.map((e) => `<li class="n-${e.k}"><span class="ntext">${esc(e.t)}<small>Day ${e.d}</small></span></li>`).join('')}</ul>` : ''}
    <div class="mfoot"><button class="btn primary" data-close autofocus>Back to the city</button></div>`);
}

function showRuins(record) {
  const r = record || { name: state.name, peakPop: state.peakPop, daysSurvived: state.day };
  openModal(`<div class="plaque big"><h2 id="modal-title">${esc(r.name)} has fallen</h2>
    <p>It reached ${r.peakPop} people and lasted ${r.daysSurvived} days. Its ruins stay on the map with this record.</p></div>
    <p>Start again on the same land (the rubble stays, and each tile costs $${RUBBLE_CLEAR_COST} to clear), or move to other ruins from the World panel.</p>
    <label class="field"><span>New city name</span><input id="rebuild-name" maxlength="28" value="New ${esc(r.name)}"></label>
    <div class="mfoot"><button class="btn" id="ruins-world">See other ruins</button><button class="btn primary" id="do-rebuild">Rebuild here</button></div>`);
  $('ruins-world').onclick = () => { closeModal(); openPanel('world'); };
  $('do-rebuild').onclick = () => {
    sim.rebuild(state, $('rebuild-name').value.trim() || state.name);
    state.lastTick = Date.now();
    afterChange(); save(); closeModal(); play('level');
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
    const b = await fb.loadLeaderboards(world.id, [...plots.values()]);
    const list = (rows, val) => rows.length
      ? `<ol>${rows.map((r) => `<li class="${r.mine || r.plotId === plotId ? 'me' : ''}"><span><b>${esc(r.name)}</b><small>${esc(r.ownerName)}</small></span><em class="num">${val(r)}</em></li>`).join('')}</ol>`
      : '<p class="soft">No cities yet.</p>';
    if (!modal.open) return;
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p class="soft small">${esc(world.name)}</p><div class="boards">
      <section><h3>${icon('i-people')}Biggest ever</h3>${list(b.peak, (r) => `${r.peakPop}`)}</section>
      <section><h3>${icon('i-clock')}Longest running</h3>${list(b.running, (r) => `${r.day} days`)}</section>
      <section><h3>${icon('i-flag')}Fallen cities</h3>${list(b.fallen, (r) => `${r.daysSurvived} days`)}</section></div>`, 'wide');
  } catch (e) {
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p>Couldn't load leaderboards: ${esc(e.message)}</p>`);
  }
}

let settingsTab = 'display';
function showSettings() {
  const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
    `<button type="button" role="radio" aria-checked="${prefs[key] === v}" data-pref="${key}" data-val='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`;
  const tgl = (key, label, note = '') => `<label class="tgl"><input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">${label}${note ? `<small>${note}</small>` : ''}</span></label>`;
  const tabs = [['display', 'Display'], ['colours', 'Colours'], ['interface', 'Interface'], ['sound', 'Sound']];
  const panes = {
    display: `<div class="srow"><span>Theme</span>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="srow"><span>View</span>${seg('view', [['3d', '3D'], ['flat', '2D']])}</div>
      <div class="srow"><span>People on screen</span>${seg('density', [[0.5, 'Fewer'], [1, 'Everyone']])}</div>
      ${tgl('cars', 'Show people moving around', 'Cars, bikes and walkers. Turn off to save battery.')}
      ${tgl('dayNight', 'Day and night', 'The map dims in the evening; windows and headlights come on')}
      ${tgl('grid', 'Tile grid', 'Shortcut: G')}
      ${tgl('popups', 'Floating numbers', 'Money and progress rising from buildings')}
      ${tgl('reducedMotion', 'Reduce motion', 'Numbers stay still and panels stop animating')}`,
    colours: `<p class="soft">Each group of buildings has its own colour. Pick the set that's easiest for you to tell apart. Buildings also have different shapes, so colour is never the only clue.</p>
      <div class="palettes" role="radiogroup" aria-label="Colour mode">${Object.entries(PALETTES).map(([k, p]) => `
        <button type="button" role="radio" aria-checked="${prefs.colours === k}" data-pref="colours" data-val='"${k}"' class="palcard">
          <span class="sw6" aria-hidden="true">${Object.values(p.cols).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <b>${p.label}</b><small>${p.note}</small></button>`).join('')}</div>
      ${tgl('shapes', 'Shape badges on buildings', 'Circle homes, square work, triangle shops, diamond education, star leisure, hexagon services')}`,
    interface: `<div class="srow"><span>Text size</span>${seg('textSize', [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger']])}</div>
      <div class="srow"><span>Notifications</span>${seg('notes', [['all', 'All'], ['warn', 'Warnings'], ['off', 'Off']])}</div>
      ${tgl('compact', 'Compact layout', 'Smaller panels and a tighter dock')}
      ${tgl('minimap', 'Minimap')}`,
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
  modal.querySelectorAll('input[type=checkbox][data-pref]').forEach((c) => { c.onchange = () => setPref(c.dataset.pref, c.checked); });
  modal.querySelectorAll('input[type=range][data-pref]').forEach((r) => {
    r.oninput = () => { prefs.volume = +r.value; savePrefs(prefs); setSound(prefs.sound, prefs.volume); };
    r.onchange = () => play('coin');
  });
}

function showAccount(tab = acctTab) {
  acctTab = tab;
  profile ||= { name: mayor, colour: acct.COLOURS[0], stats: acct.emptyLife(), achievements: {}, base: {} };
  openModal(`${closeX}<h2 id="modal-title">Account</h2>${acct.accountHtml({ user, mayor, profile, s: state, world, colour: profile.colour || acct.COLOURS[0] }, tab)}`, 'wide');
  const msg = $('acct-msg');
  modal.querySelectorAll('[data-acct-tab]').forEach((b) => { b.onclick = () => showAccount(b.dataset.acctTab); });
  modal.querySelector(`[data-acct-tab="${tab}"]`)?.focus();
  $('acct-mayor-save')?.addEventListener('click', () => busy($('acct-mayor-save'), async () => {
    const v = $('acct-mayor').value.trim();
    if (!v) throw new Error('Type a name first.');
    mayor = v; profile.name = v; profileDirty = true;
    await save({ ownerName: v });
    msg.textContent = 'Saved.'; msg.classList.add('ok');
  }, msg));
  modal.querySelectorAll('[data-colour]').forEach((b) => { b.onclick = () => { profile.colour = b.dataset.colour; profileDirty = true; save(); showAccount('profile'); }; });
  $('up-email-go')?.addEventListener('click', () => busy($('up-email-go'), async () => {
    await fb.upgradeWithEmail($('up-email').value.trim(), $('up-pass').value);
    notify('Your city is now saved to your account.', 'act'); play('goal'); showAccount('security');
  }, msg));
  $('up-google')?.addEventListener('click', () => busy($('up-google'), async () => {
    await fb.upgradeWithGoogle();
    notify('Your city is now saved to your Google account.', 'act'); play('goal'); showAccount('security');
  }, msg));
  $('acct-reset')?.addEventListener('click', () => busy($('acct-reset'), async () => {
    await fb.resetPassword(user.email);
    msg.textContent = `Reset link sent to ${user.email}.`; msg.classList.add('ok');
  }, msg));
  $('acct-out')?.addEventListener('click', () => {
    if (!user.isAnonymous) { save().finally(() => fb.signOutUser()); return; }
    openModal(`<h2 id="modal-title">Sign out of a guest city?</h2>
      <p>Guest cities can't be signed back into. If you sign out now, ${esc(state.name)} stays on the map but you won't be able to play it again.</p>
      <div class="mfoot"><button class="btn danger" id="lose" type="button">Sign out anyway</button><button class="btn primary" id="keep" type="button" autofocus>Save it as an account first</button></div>`);
    $('keep').onclick = () => showAccount('security');
    $('lose').onclick = () => save().finally(() => fb.signOutUser());
  });
  $('acct-delete')?.addEventListener('click', confirmDelete);
}
function confirmDelete() {
  openModal(`${closeX}<h2 id="modal-title">Delete your account?</h2>
    <p>This can't be undone. Your sign-in, lifetime stats and achievements are deleted. ${esc(state.name)} falls into ruins and stays on the map with its record, where anyone can rebuild on it.</p>
    <label class="field"><span>Type DELETE to confirm</span><input id="del-confirm" autocomplete="off"></label>
    <p id="del-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn" data-close>Keep my account</button><button class="btn danger" id="del-go" disabled>Delete my account</button></div>`);
  $('del-confirm').oninput = (e) => { $('del-go').disabled = e.target.value.trim().toUpperCase() !== 'DELETE'; };
  $('del-go').onclick = () => busy($('del-go'), async () => {
    if (state.status === 'alive') {
      const record = sim.collapse(state, 'deleted');
      await fb.savePlot(plotId, state);
      await fb.writeLegacy(user, plotId, mayor, record, world.id).catch(() => {});
    }
    await fb.deleteProfile(user.uid).catch(() => {});
    stopLoops();
    chatUnsub?.();
    try { await fb.deleteAccount(); }
    catch (e) {
      if (String(e.code).includes('requires-recent-login')) throw new Error('For security, sign out, sign back in, then delete again. Your city is already in ruins.');
      throw e;
    }
    closeModal();
  }, $('del-msg'));
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
  const life = kind === 'warn' ? 5200 : 3400;
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 400);
  if (kind === 'warn') play('warn');
}
function announce(msg) {
  const el = $('sr');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}
