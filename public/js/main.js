import * as sim from './sim.js';
import {
  T, B, PLOT, TICK_MS, MAX_OFFLINE_DAYS, HOURS_PER_DAY, SAVE_EVERY_MS, RUBBLE_CLEAR_COST, MAX_LEVEL, LEVEL, UPGRADABLE,
  REBUILD_MONEY, MOVE_KEEP, TUTORIAL_REWARD, GOALS, BRUSHES, CHUNK, CHUNKS, EDU, MOVE_FEE, isHome, DECISIONS, ZONES, ZONE_COST,
  LOAN_DAYS, HISTORIC_DAYS, BADGES, REGIONAL, REGIONAL_SHARE, ALLIANCE_TRADE, DAILY, DAILY_REWARD, WEEKLY, WEEKLY_REWARD, GIFT_LIMITS, REACTIONS,
  RES, FOOD, TRADE_RES, PRODUCTS, PRODUCT_IDS, USE, HARVEST, MARKET, STOCK, HALL_LEVELS, TECH, STYLES, WASTE_POP, SEWAGE_POP, DAWN, DUSK, WORLD_ID, CLASSIC_WORLD, OPEN_WORLDS, MAX_CITIES, MAX_CO, DESK_IDLE_MS, DESK_STALE_MS, DESK_BEAT_MS,
} from './constants.js';
import { Renderer, STRIDE, thumbnail, modelHeight } from './render.js';
import { loadPrefs, savePrefs, applyPrefs, resolvedTheme, palette, PALETTES } from './prefs.js';
import { play, setSound, ambient, setHidden, music } from './sound.js';
import { firebaseConfig } from './config.js';
import { TripSim, whereabouts } from './trips.js';
import { createTutorial } from './tutorial.js';
import { ROLES, roleOf, jobText } from './people.js';
import * as panels from './panels.js';
import * as acct from './account.js';
import * as fb from './firebase.js';
import { setLang, languages, t } from './i18n.js';

const { esc, icon, money, pct, bar, avatar } = panels;
const $ = (id) => document.getElementById(id);
const ago = (t) => { const m = Math.round((Date.now() - (t || 0)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
// One calendar for the whole world: 10 days a season, 4 seasons a year.
function dateLabel(day = sim.worldDay()) {
  return `${sim.season(day)} ${(day % 10) + 1}, Year ${Math.floor(day / 40) + 1}`;
}
const hourLabel = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : `${h % 12} ${h < 12 ? 'am' : 'pm'}`);

// ---------- state ----------
let prefs = loadPrefs();
let user = null, plotId = null, me = null, state = null, mayor = '';
// 1.11 opened a new, joined-up main world; players who were in the classic public world start there once.
let world = { id: WORLD_ID, name: OPEN_WORLDS[WORLD_ID] }, worlds = [];
// 1.18, 1.2 and 1.3 each started every world afresh: everyone begins in the new open world once.
try {
  const saved = localStorage.getItem('commons-world');
  if (saved && localStorage.getItem('commons-world-v5')) world = { id: saved, name: OPEN_WORLDS[saved] || 'World' };
  localStorage.setItem('commons-world-v5', '1');
} catch { /* private mode */ }
let plan = null, totalsNow = null, lastStep = null;
let zoneKind = 1;
let mode = 'select', brush = null, moveFrom = -1, catalog = null, catCat = 'all', catQ = '', catAfford = false;
let overlay = null, hover = null, cursor = null, selected = null;
let newsTab = 'paper', drawer = null, personId = null, peopleFilter = 'all', peopleQuery = '', statsTab = 'overview', acctTab = 'profile';
let pops = [], undoStack = [], bridges = new Map(), neighbourInfo = [], pulseTile = null, taps = 0, followCam = false;
let saveTimer = null, lastSave = Date.now(), loopTimer = null, worldTimer = null, lastHour = -1;
let spaceHeld = false, dirty = true, lastFrame = performance.now(), warnedDay = -1;
let worldTrains = [];
let giftsUnsub = null, worldNews = [];
let worldUnsub = null, movesUnsub = null, lastSaved = '', offerCache = new Map(), live = false, liveTimer = null, fetching = new Set();
const INACTIVE_MS = 10 * 60 * 1000;   // a neighbour idle this long stops sharing facilities
let profile = null, profileDirty = false, chatUnsub = null, chatMessages = [], chatUnread = 0, chatDraft = '', lastChat = 0;
const plots = new Map();
const byXY = new Map();
const trips = new TripSim();
const favKey = () => `commons-fav-${plotId}`;
const favs = () => new Set(JSON.parse(localStorage.getItem(favKey()) || '[]'));
function toggleFav(id) { const f = favs(); f.has(id) ? f.delete(id) : f.add(id); try { localStorage.setItem(favKey(), JSON.stringify([...f])); } catch { /* ignore */ } }
const muted = () => new Set(JSON.parse(localStorage.getItem('commons-muted') || '[]'));
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'retard', 'whore', 'slut', 'rape'];
const clean = (t) => BLOCKED.reduce((a, w) => a.replace(new RegExp(w + '\\w*', 'gi'), (m) => m[0] + '•'.repeat(m.length - 1)), String(t));

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
  { k: 'waste', icon: 'i-clear', label: 'Rubbish and drains', fix: `Every resident makes rubbish and sewage. From ${WASTE_POP} people build a landfill or recycling centre; from ${SEWAGE_POP}, a sewage works.` },
  { k: 'air', icon: 'i-spark', label: 'Clean air', fix: 'Fossil power, factories and traffic foul the air. Use solar or wind, plant parks and farms, or try a carbon tax.' },
];
// City names: a start and an ending that sound like real places, sometimes with a word in front or behind.
const NAME_START = ['Ash', 'Bright', 'Brook', 'Cedar', 'Clear', 'Copper', 'Elder', 'Elm', 'Fair', 'Fern', 'Glen', 'Gold', 'Green', 'Hart', 'Haw', 'Holly',
  'Iron', 'Juniper', 'Kings', 'Lark', 'Linden', 'Maple', 'Marsh', 'Mill', 'North', 'Oak', 'Pine', 'Queens', 'Raven', 'Red', 'Rose', 'Rush', 'Salt',
  'Silver', 'Sparrow', 'Stone', 'Sun', 'Thorn', 'Water', 'West', 'White', 'Willow', 'Wolf', 'Wren', 'Yarrow', 'Amber', 'Bell', 'Harrow', 'Kestrel', 'Tide'];
const NAME_END = ['ford', 'field', 'wood', 'haven', 'stead', 'bridge', 'brook', 'dale', 'gate', 'hill', 'mere', 'mouth', 'port', 'ridge', 'ton', 'vale',
  'wick', 'worth', 'bury', 'by', 'cliff', 'combe', 'fell', 'holm', 'hurst', 'ley', 'moor', 'stow', 'thorpe', 'well', 'water', 'wold'];
function cityName() {
  const r = Math.random, base = NAME_START[Math.floor(r() * NAME_START.length)] + NAME_END[Math.floor(r() * NAME_END.length)];
  const k = r();
  return k < 0.1 ? `New ${base}` : k < 0.18 ? `Port ${base}` : k < 0.24 ? `${base} Bay` : k < 0.29 ? `Upper ${base}` : k < 0.33 ? `${base} Springs` : base;
}
const SIDES = [[1, 0, 'East'], [-1, 0, 'West'], [0, 1, 'South'], [0, -1, 'North']];

// ---------- preferences ----------
function applyAll() {
  applyPrefs(prefs);
  setLang(prefs.lang);
  renderer.view = '3d';   // the flat 2D view was retired in 1.18
  document.documentElement.dataset.style = currentStyle().id;
  setSound(prefs.sound, prefs.volume, prefs.ambientVolume, prefs.haptics);
  $('minibox').classList.toggle('hidden', !prefs.minimap);
  drawThumbs();
  drawHeroes();
  drawMinimap();
  dirty = true;
}
// Styles unlock as the town hall grows; 'auto' uses the newest one you have.
function stylesOwned() { return STYLES.filter((st) => st.hall <= (state?.hall || 0)); }
function currentStyle() {
  const owned = stylesOwned();
  return owned.find((st) => st.id === prefs.style) || owned[owned.length - 1] || STYLES[0];
}
function setPref(k, v) { prefs[k] = v; savePrefs(prefs); applyAll(); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => prefs.theme === 'auto' && applyAll()); } catch { /* old browsers */ }
applyPrefs(prefs);
setLang(prefs.lang);

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
  const msgId = msgEl?.id, el = () => (msgId && $(msgId)) || msgEl;
  if (btn?.getAttribute('aria-busy') === 'true') return;   // a double tap shouldn't run it twice
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  if (el()) { el().textContent = ''; el().classList.remove('ok'); }
  try { await fn(); } catch (e) { console.error(e); if (el()) { el().classList.remove('ok'); el().textContent = fb.authMessage(e); } play('error'); }
  finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}
function formOk(el, text) { const m = typeof el === 'string' ? $(el) : el; if (m) { m.textContent = text; m.classList.add('ok'); } }
$('email-form').onsubmit = (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value;
  busy($('auth-submit'), () => (authMode === 'signin' ? fb.signInEmail(email, pass) : fb.createEmail(email, pass)));
};
// Firebase doesn't say whether an address has an account (so nobody can fish for them), so the message can't either.
const RESET_WAIT = 60000;
let lastReset = 0;
const resetSent = (email) => `If ${email} has a Commons account, a reset link is on its way. It comes from noreply@${firebaseConfig.authDomain}. `
  + 'Give it a few minutes and check your spam or junk folder. Accounts made with Google don’t have a password: use Continue with Google instead.';
$('auth-forgot').onclick = () => busy($('auth-forgot'), async () => {
  const email = $('auth-email').value.trim();
  if (!email) { $('auth-email').focus(); throw new Error('Type your email address above first, then press this again.'); }
  if (Date.now() - lastReset < RESET_WAIT) throw new Error('A link was sent a moment ago. Check your inbox and spam folder before asking for another.');
  await fb.resetPassword(email);
  lastReset = Date.now();
  formOk('auth-msg', resetSent(email));
});
fb.redirectResult().catch((e) => { console.error(e); show('auth'); $('auth-msg').textContent = fb.authMessage(e); });
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
$('found-public').onclick = () => { setWorld({ id: WORLD_ID, name: OPEN_WORLDS[WORLD_ID] }); enter(user); };
$('found-join').onclick = () => {
  const box = $('found-joinbox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) $('found-code').focus();
};
$('found-code-go').onclick = () => busy($('found-code-go'), async () => {
  const w = await fb.findWorldByCode($('found-code').value);
  setWorld(w);
  enter(user);
}, $('found-msg'));
$('found-code').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('found-code-go').click(); } };

async function showFound() {
  const base = user.displayName || (user.email ? user.email.split('@')[0] : '');
  $('found-mayor').value = base.slice(0, 20);
  $('found-city').value = cityName();
  $('found-msg').textContent = '';
  $('found-world').textContent = world.id === WORLD_ID ? 'the world' : world.name;
  $('found-public').classList.toggle('hidden', world.id === WORLD_ID);
  $('found-joinbox').classList.add('hidden');
  $('found-join').classList.toggle('hidden', world.id !== WORLD_ID);
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
        const st = sim.migrate(JSON.parse(r.state || await fb.getState(r.id)));
        sim.ensureTerrain(st, r.px, r.py, world.id);
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
// Invite links look like https://commons-ww.web.app/?join=K7Q2MX
function takeInvite() {
  const q = new URLSearchParams(location.search), c = q.get('join');
  if (!c) return null;
  q.delete('join');
  try { history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash); } catch { /* ignore */ }
  return fb.cleanCode(c);
}
let invite = takeInvite();
const inviteLink = (code) => `${location.origin}${location.pathname}?join=${code}`;
async function enter(u, openId = null) {
  stopLoops();
  stopDesk();
  worldUnsub?.(); movesUnsub?.(); worldUnsub = movesUnsub = null;
  chatUnsub?.(); chatUnsub = null; giftsUnsub?.(); giftsUnsub = null; worldNews = [];
  projUnsub?.(); allyUnsub?.(); allyChatUnsub?.(); projUnsub = allyUnsub = allyChatUnsub = null; projects = []; alliances = []; allyChat = []; allyChatFor = null;
  marketUnsub?.(); myOffersUnsub?.(); dealsUnsub?.(); stocksUnsub?.(); marketUnsub = myOffersUnsub = dealsUnsub = stocksUnsub = null; offers = []; myOffers = []; stocks = new Map();
  threadsUnsub?.(); dmUnsub?.(); threadsUnsub = dmUnsub = null; threads = []; dmWith = null;
  clearTimeout(liveTimer); clearTimeout(saveTimer); clearTimeout(retryTimer);
  tut.stop();
  closeDrawer(); closeCatalog();
  state = null; me = null;
  show('boot');
  $('boot-msg').textContent = 'Loading your city…';
  try {
    if (invite) {
      const code = invite; invite = null;
      try { const w = await fb.findWorldByCode(code); if (w.id !== world.id) setWorld(w); }
      catch (e) { console.error(e); notifyLater = `That invite didn’t work: ${fb.authMessage(e)}`; }
    }
    let w = null;
    try { w = await fb.getWorld(world.id); } catch (e) { if (OPEN_WORLDS[world.id]) throw e; console.error(e); }
    setWorld(w || { id: WORLD_ID, name: OPEN_WORLDS[WORLD_ID] });
    const doc = openId ? await fb.getPlot(openId) : await fb.findPlot(u, world.id);
    if (doc) startGame(doc);
    else showFound();
  } catch (e) {
    console.error(e);
    showBootError(`Couldn’t load your city. ${fb.authMessage(e)}`);
  }
}
let notifyLater = '';
// Signed in but something failed on the way in: say what, and offer a way forward rather than a dead end.
function showBootError(text) {
  show('boot');
  $('boot-msg').textContent = text;
  $('boot-actions').classList.remove('hidden');
  $('boot-public').classList.toggle('hidden', world.id === WORLD_ID);
}
$('boot-retry').onclick = () => { $('boot-actions').classList.add('hidden'); $('boot-retry').textContent = 'Try again'; tabPaused = false; if (user) enter(user); else location.reload(); };
$('boot-public').onclick = () => { $('boot-actions').classList.add('hidden'); setWorld({ id: WORLD_ID, name: OPEN_WORLDS[WORLD_ID] }); if (user) enter(user); };
$('boot-out').onclick = () => { $('boot-actions').classList.add('hidden'); fb.signOutUser().catch(() => location.reload()); };
fb.onAuth((u) => {
  const same = u && user && u.uid === user.uid && state;
  user = u;
  $('boot-actions').classList.add('hidden');
  if (!u) { stopLoops(); chatUnsub?.(); worldUnsub?.(); movesUnsub?.(); giftsUnsub?.(); worldUnsub = movesUnsub = chatUnsub = giftsUnsub = null; state = null; plotId = null; closeModal(); tut.stop(); show('auth'); return; }
  if (same) return;   // linking a guest to an account keeps the same player: no need to reload the city
  enter(u);
});

async function startGame(doc) {
  plotId = doc.id;
  lastSaved = ''; saveFails = 0; saveError = null; pendingExtra = null; clearTimeout(retryTimer);
  setSaveState('ok');
  coMode = doc.owner !== user.uid;   // running a friend's city as co-mayor: keep your own name
  if (!coMode) mayor = doc.ownerName || 'Mayor';
  state = sim.migrate(JSON.parse(doc.state));
  const newTerrain = sim.ensureTerrain(state, doc.px, doc.py, world.id);
  if (typeof doc.money === 'number' && state.money > doc.money + 1) state.money = doc.money;   // the checked summary wins
  plots.clear(); byXY.clear(); trips.clear(); bridges.clear();
  selected = null; drawer = null; followCam = false; lastHour = -1; moveFrom = -1; catalog = null; brush = null;
  me = toPlot(doc);
  me.ownerName = doc.ownerName;
  addPlot(me);
  refreshDerived();
  claimTab();
  const report = await catchUp();
  if (!state || doc.id !== plotId) return;
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
  startGifts();
  startRegion();
  startMarket();
  startDMs();
  loadProfile();
  startDesk();
  // The mood panel starts folded (the ring and the next step); tap it for every need.
  $('pulse').classList.add('closed'); $('pulse-toggle').setAttribute('aria-expanded', 'false');
  canvas.focus({ preventScroll: true });
  if (notifyLater) { notify(notifyLater, 'warn'); notifyLater = ''; }
  if (newTerrain) { scheduleSave(3000); if (state.terr.includes('2') || state.terr.includes('1')) notify('Your land now has terrain: rivers and coast you can bridge, and hills with views. Nothing you built has moved.', 'act'); }
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
    grid: st.grid, cond: st.cond, lv: st.lv, land: st.land, uc: sim.underConstruction(st), terr: st.terr || (id === 'demo' ? null : sim.terrainFor(px, py, world.id)),
    queueMap: new Map(st.queue.map((q) => [q.i, q])), version: meta.version ?? 0, mine: !!meta.mine, owner: meta.owner, out: meta.out || {}, flag: meta.mine ? profile?.colour : meta.flag,
    co: meta.co || [],
  };
}
function toPlot(d) {
  const meta = { flag: d.flag, ownerName: d.ownerName, version: d.updatedAt?.toMillis?.() ?? Date.now(), mine: d.owner === user.uid, owner: d.owner, out: d.out, co: d.co };
  if (d.state) {
    try { const p = plotFrom(d.id, d.px, d.py, sim.migrate(JSON.parse(d.state)), meta); p.offer = d.offer; p.active = meta.version; p.badges = d.badges || []; p.green = d.green ?? 1; p.riders = d.riders || 0; p.tourists = d.tourists || 0; p.money = d.money || 0; return p; } catch { return null; }
  }
  if (!d.map) return null;
  // Most neighbours arrive as a small summary: enough to draw them. Their full save is fetched only if they're next door.
  const m = sim.fromMap(d.map);
  const old = plots.get(d.id);
  return {
    id: d.id, px: d.px, py: d.py, st: old?.version === meta.version ? old.st : null, name: d.name, ownerName: d.ownerName, status: d.status,
    pop: d.pop || 0, peakPop: d.peakPop || 0, day: d.day || 0, happiness: d.happiness || 0, cityNo: d.cityNo || 1,
    grid: m.grid, cond: m.cond, lv: m.lv, land: m.land, uc: m.uc, terr: m.terr || terrCache(d.id, d.px, d.py), queueMap: new Map(), version: meta.version, mine: meta.mine,
    owner: d.owner, out: d.out || {}, offer: d.offer, active: meta.version, co: d.co || [], growth: d.growth || 0, season: d.season || '',
    res: d.res || {}, bld: d.bld || 0, listed: d.listed || 0,
    flag: d.flag, badges: d.badges || [], green: d.green ?? 1, riders: d.riders || 0, tourists: d.tourists || 0, money: d.money || 0,
  };
}
// Neighbours still on an older version send no terrain; work it out from where their plot sits.
const terrMemo = new Map();
function terrCache(id, px, py) { const k = `${world.id}|${id}`; if (!terrMemo.has(k)) terrMemo.set(k, sim.terrainFor(px, py, world.id)); return terrMemo.get(k); }
function fetchState(p) {
  if (p.st || fetching.has(p.id) || p.status !== 'alive') return;
  fetching.add(p.id);
  fb.getState(p.id).then((str) => {
    fetching.delete(p.id);
    const cur = plots.get(p.id);
    if (str && cur) { cur.st = sim.migrate(JSON.parse(str)); trips.drop(cur.id); dirty = true; }
  }).catch(() => fetching.delete(p.id));
}
function addPlot(p) {
  if (!p) return;
  const old = plots.get(p.id);
  if (old && old.version !== p.version && !p.mine) trips.drop(p.id);
  p.tag = tagOf.get(p.owner) || '';
  plots.set(p.id, p);
  byXY.set(`${p.px},${p.py}`, p.id);
}
const plotAt = (px, py) => plots.get(byXY.get(`${px},${py}`));
function syncMine() {
  Object.assign(me, plotFrom(me.id, me.px, me.py, state, { ownerName: me.ownerName || mayor, mine: true, version: (me.version || 0) + 1, owner: me.owner || user.uid, out: plan?.out, co: me.co }));
  dirty = true;
}
// Live: every save by any player in this world arrives here within a second or two.
function startLive() {
  worldUnsub?.(); movesUnsub?.();
  live = false;
  worldUnsub = fb.listenWorld(world.id, (docs) => {
    const firstBatch = !live;
    live = true;
    for (const d of docs) {
      if (d.id === plotId) continue;
      const isNew = !firstBatch && !plots.has(d.id) && me && Math.abs(d.px - me.px) + Math.abs(d.py - me.py) === 1;
      if (!firstBatch) worldEvent(plots.get(d.id), d);
      addPlot(toPlot(d));
      if (isNew) notify(`${d.ownerName || 'A new mayor'} founded ${d.name || 'a city'} right next to you. Build a road to your shared edge to link up.`, 'good');
    }
    dirty = true;
    // Many players saving at once shouldn't re-plan the city each time: wait for a quiet moment.
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (!state || !me) return;
      computeLinks();
      refreshPrices();
      refreshDerived();
      drawMinimap();
      updateHud();
      if (drawer === 'world' || drawer === 'inspect') refreshDrawer();
    }, 800);
  });
  movesUnsub = fb.listenMoves(world.id, user.uid, async (moves) => {
    for (const m of moves) {
      if (m.to !== plotId || !state) continue;
      if (!firstTime(m.id)) { fb.finishMove(world.id, m.id).catch(() => {}); continue; }
      const clean = (m.people || []).slice(0, 8).map((o) => ({
        f: Math.abs(o.f | 0) % sim.FIRST.length, l: Math.abs(o.l | 0) % sim.SURNAMES.length, a: Math.max(0, Math.min(90, o.a | 0)),
        e: Math.max(0, Math.min(3, o.e | 0)), sp: Math.max(0, Math.min(12, +o.sp || 0)), hp: Math.max(1, Math.min(100, +o.hp || 100)), m: Math.max(0, Math.min(1, +o.m || 0.6)),
      }));
      const n = clean.length ? sim.welcome(state, clean, String(m.fromName || 'a nearby city').slice(0, 40)) : 0;
      if (n) { notify(`A family of ${n} moved here from ${m.fromName}.`, 'good'); play('coin'); afterChange(); }
      fb.finishMove(world.id, m.id).catch((e) => console.error(e));
    }
  });
}
// What's happening around the world this session: new cities, falls and big milestones.
function worldEvent(old, d) {
  const add = (t) => { worldNews.unshift({ t, at: Date.now() }); if (worldNews.length > 30) worldNews.pop(); };
  if (!old) add(`${d.ownerName || 'A new mayor'} founded ${d.name}.`);
  else if (old.status === 'alive' && d.status === 'ruins') add(`${old.name} fell after ${old.day} days.`);
  else if (old.status === 'ruins' && d.status === 'alive') add(`${d.ownerName} started ${d.name} on the ruins of ${old.name}.`);
  else for (const m of [100, 200, 300, 500]) if ((old.pop || 0) < m && (d.pop || 0) >= m) add(`${d.name} passed ${m} residents.`);
  for (const b of d.badges || []) if (old && !(old.badges || []).includes(b)) add(`${d.name} earned ${BADGES.find((x) => x.id === b)?.name || b}.`);
}
// Daily challenge for your own city. The baseline is taken the first time you play that day.
function daily() {
  const d = Math.floor(Date.now() / 86400000), c = DAILY[((d * 2654435761) >>> 0) % DAILY.length];
  if (state.flags.daily?.d !== d) {
    state.flags.daily = { d, claimed: false, base: { built: state.counters.built, births: state.counters.births, pop: state.people.length, treated: state.counters.treated, land: state.counters.land, graduates: state.counters.graduates, levels: state.lv.reduce((a, l) => a + (l > 1 ? l - 1 : 0), 0) } };
  }
  const got = Math.max(0, Math.min(c.n, c.of(state, state.flags.daily.base)));
  return { ...c, got, done: got >= c.n, claimed: state.flags.daily.claimed };
}
function claimDaily() {
  const c = daily();
  if (!c.done || c.claimed) return;
  state.flags.daily.claimed = true;
  state.money += DAILY_REWARD;
  play('goal'); notify(`Daily challenge done: ${c.text}. ${money(DAILY_REWARD)} earned.`, 'good');
  afterChange();
}
// Weekly challenge: one goal for the whole world, reset every Monday (UTC).
const weekNo = () => Math.floor((Date.now() / 86400000 + 3) / 7);
function weekly() {
  const w = weekNo(), c = WEEKLY[w % WEEKLY.length];
  const mine = { ...sim.summary(state), pop: state.people.length };
  const cities = [...plots.values()].map((p) => (p.mine ? { ...p, ...mine } : p)).filter((p) => p.status === 'alive' && (p.pop || 0) >= 10);
  const goal = c.goal(cities.length), value = c.value(cities);
  const ends = new Date(((w + 1) * 7 - 3) * 86400000);
  return { ...c, week: w, goal, value, done: value >= goal, helped: c.mine(mine), claimed: state.flags.weekClaim === w, ends };
}
function claimWeekly() {
  const c = weekly();
  if (!c.done || !c.helped || c.claimed) return;
  state.flags.weekClaim = c.week;
  state.money += WEEKLY_REWARD;
  sim.note(state, 'good', `The world finished this week's challenge. Your share: $${WEEKLY_REWARD}.`);
  play('goal'); notify(`Weekly challenge complete! ${money(WEEKLY_REWARD)} for your part.`, 'good');
  afterChange();
}

// Gifts from other mayors, with a daily cap so nobody can flood a city with money.
const today = () => Math.floor(Date.now() / 86400000);
function startGifts() {
  giftsUnsub?.();
  giftsUnsub = fb.listenGifts(world.id, user.uid, (gifts) => {
    for (const g of gifts) {
      if (g.to !== plotId || !state) continue;
      fb.finishGift(world.id, g.id).catch((e) => console.error(e));
      if (!firstTime(g.id) || muted().has(g.fromOwner) || state.status !== 'alive') continue;
      if (state.flags.giftDay !== today()) { state.flags.giftDay = today(); state.flags.giftIn = 0; }
      const amt = Math.max(0, Math.min(Math.floor(+g.amount || 0), GIFT_LIMITS.receive - state.flags.giftIn));
      if (!amt) { notify(`${g.fromName} sent a gift, but you’ve had today’s limit of ${money(GIFT_LIMITS.receive)}.`, 'info'); continue; }
      state.flags.giftIn += amt; state.money += amt;
      sim.note(state, 'good', `${String(g.fromName).slice(0, 40)} sent a gift of $${amt}${g.note ? `: “${String(g.note).slice(0, 120)}”` : '.'}`);
      notify(`${g.fromName} sent you ${money(amt)}!${g.note ? ` “${g.note}”` : ''}`, 'good'); play('coin');
      afterChange();
    }
  });
}
function giveGift(p) {
  if (state.flags.giftOutDay !== today()) { state.flags.giftOutDay = today(); state.flags.giftOut = 0; }
  const left = Math.max(0, Math.min(GIFT_LIMITS.send - state.flags.giftOut, Math.floor(state.money)));
  openModal(`${closeX}<h2 id="modal-title">Send a gift to ${esc(p.name)}</h2>
    <p>Help a neighbour out. You can give up to ${money(GIFT_LIMITS.send)} a day; you have ${money(left)} left to give today.</p>
    <label class="field"><span>Amount</span><input id="gift-amt" type="number" min="10" max="${Math.min(1000, left)}" step="10" value="${Math.min(100, left)}"></label>
    <label class="field"><span>Note (optional)</span><input id="gift-note" maxlength="120" placeholder="Good luck with the new school!"></label>
    <p id="gift-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="gift-go" ${left >= 10 ? '' : 'disabled'}>Send</button></div>`);
  $('gift-go').onclick = () => busy($('gift-go'), async () => {
    const amt = Math.floor(+$('gift-amt').value);
    if (!(amt >= 10) || amt > Math.min(1000, left)) throw new Error(`Choose between $10 and ${money(Math.min(1000, left))}.`);
    await fb.sendGift(world.id, { from: plotId, fromName: state.name.slice(0, 40), fromOwner: user.uid, to: p.id, toOwner: p.owner, amount: amt, note: $('gift-note').value.trim().slice(0, 120) });
    state.money -= amt; state.flags.giftOut += amt; state.counters.gifts = (state.counters.gifts || 0) + 1;
    sim.note(state, 'info', `Sent $${amt} to ${p.name}.`);
    closeModal(); play('coin'); notify(`Sent ${money(amt)} to ${p.name}.`, 'act'); afterChange();
  }, $('gift-msg'));
}

// Guestbook on other cities (and your own, in the World panel).
let bookFor = null, bookCache = [];
async function loadBook(id) {
  bookFor = id;
  try { bookCache = await fb.guestbook(world.id, id); } catch (e) { console.error(e); bookCache = []; }
  const box = $('guestbook');
  if (box && bookFor === id) box.innerHTML = bookHtml(id);
  wireBook();
}
function bookHtml(id) {
  const mine = id === plotId, m = muted();
  const list = bookCache.filter((n) => !m.has(n.uid));
  return `${list.length ? `<ul class="book" translate="no">${list.map((n) => `<li><b>${esc(n.name)}</b> <small class="soft">${esc(n.city || '')}${n.createdAt?.toDate ? `, ${n.createdAt.toDate().toLocaleDateString()}` : ''}</small><p>${esc(clean(n.text))}</p>
      ${mine || n.uid === user.uid ? `<button type="button" class="linkbtn" data-unnote="${esc(n.id)}">Remove</button>` : ''}</li>`).join('')}</ul>` : `<p class="soft small">${mine ? 'No visitors have signed yet.' : 'Be the first to sign.'}</p>`}
    ${mine ? '' : `<form class="miniform" id="book-form"><label class="field"><span>Leave a note</span><span class="inline"><input id="book-text" maxlength="200" placeholder="Lovely parks!" autocomplete="off"><button class="btn" type="submit">Sign</button></span></label><p id="book-msg" class="formmsg" role="alert"></p></form>`}`;
}
function wireBook() {
  const f = $('book-form');
  if (f) f.onsubmit = (e) => { e.preventDefault(); busy(f.querySelector('button'), async () => {
    const t = $('book-text').value.trim();
    if (!t) throw new Error('Write something first.');
    await fb.signGuestbook(world.id, bookFor, user, mayor.slice(0, 24), state.name.slice(0, 40), t.slice(0, 200));
    $('book-text').value = ''; play('coin'); loadBook(bookFor);
  }, $('book-msg')); };
  document.querySelectorAll('[data-unnote]').forEach((b) => { b.onclick = () => fb.deleteNote(world.id, b.dataset.unnote).then(() => loadBook(bookFor)).catch((e) => notify(fb.authMessage(e), 'act')); });
}

// ---------- the region: shared projects and alliances ----------
let tagOf = new Map(), projUnsub = null, allyUnsub = null, allyChatUnsub = null, projects = [], alliances = [], allyChat = [], allyChatFor = null, lastAllyMsg = 0;
const myAlliance = () => alliances.find((a) => a.members?.includes(user?.uid));
// Gifts, families and deals can arrive again before their removal lands, or after a reload: each city remembers
// the ones it has already applied, so they count once.
function firstTime(id) {
  if ((state.applied || []).includes(id)) return false;
  state.applied = [...(state.applied || []), id].slice(-80);
  return true;
}

// ---------- the next step ----------
// One clear thing to do: anything urgent first, then what the next town hall level still needs, then explore.
const GOAL_TYPE = { roads: T.ROAD, homes: T.HOUSE, work: T.WORK, shop: T.SHOP, school: T.SCHOOL, farm: T.FARM, utilities: T.WATER, materials: T.MATERIALS,
  clinic: T.CLINIC, highschool: T.HIGH, uni: T.UNI, monument: T.MONUMENT };
const buildGo = (t) => () => {
  if (t === T.ROAD) { setMode('build'); setBrush('road'); notify('Drag across the grass to lay road, joined back to the town hall.', 'act'); return; }
  const a = sim.availability(state, t);
  if (a.locked) { notify(`${B[t].name}: ${a.reason}.`, 'act'); if (B[t].research) { statsTab = 'research'; drawer = null; openPanel('stats'); } return; }
  setMode('build'); catQ = B[t].name; notify(`Tap an empty tile you own to build a ${B[t].name.toLowerCase()}.`, 'act');
};
const panelGo = (m, tab) => () => { if (tab) { if (m === 'stats') statsTab = tab; if (m === 'market') marketTab = tab; } drawer = null; openPanel(m); };
// 1.2: a couple of tips about the new resource loop (factories, recipes, the Store), merged with sim.js's own advice.
// Same add(score, text, type) idiom as sim.js's advice(), kept modest: at most a couple of extra candidates.
function localTips() {
  const out = [];
  const add = (score, text, type) => out.push({ score, text, type });
  if (!state) return out;
  const stock = sim.resourceStock(state);
  const hasFactory = state.grid.some((t) => t === T.FACTORY);
  const spareWood = stock.wood >= 60, spareMetal = stock.metal >= 60;
  if ((spareWood || spareMetal) && !state.grid.some((t, i) => t === T.FACTORY && sim.staffing(state, i) > 0 && state.rec?.[i])) {
    add(3, `You have plenty of ${spareWood && spareMetal ? 'wood and metal' : spareWood ? 'wood' : 'metal'} in store. Build a factory and pick a recipe to turn it into furniture, tools or baked goods.`, T.FACTORY);
  }
  if (hasFactory && state.grid.some((t, i) => t === T.STORE && sim.staffing(state, i) > 0) && !PRODUCT_IDS.some((k) => stock[k] > 0)) {
    add(2.5, 'Your Store has nothing to sell. Assign a recipe to a factory, or bring in products from the Market.', T.STORE);
  }
  const cap = state.stats?.res?.cap;
  if (cap && [...TRADE_RES, ...PRODUCT_IDS].some((k) => stock[k] >= cap * 0.9)) {
    add(3, 'Storage is nearly full. Sell the surplus on the Market or Exchange, or build a warehouse.', T.WAREHOUSE);
  }
  return out;
}
function nextStep(tips) {
  const tip = tips[0];
  if (tip && tip.score >= 6) return { urgent: true, text: tip.text, go: tip.type != null ? buildGo(tip.type) : null };
  const hs = sim.hallState(state, pathCtx());
  if (!hs.complete) {
    const to = `To grow into a ${hs.next.name.toLowerCase()}: `;
    const g = hs.goals.find((x) => !x.done);
    if (g) {
      const go = GOAL_TYPE[g.id] != null ? buildGo(GOAL_TYPE[g.id]) : g.id.startsWith('tech') ? panelGo('stats', 'research') : g.id === 'trade1' ? panelGo('market', 'exchange')
        : g.id === 'invest' ? panelGo('market', 'shares') : g.id === 'alliance' ? panelGo('region') : g.id === 'land3' ? () => { setMode('build'); notify('In Build mode, price tags mark land you can buy.', 'act'); } : null;
      return { text: to + g.text.charAt(0).toLowerCase() + g.text.slice(1) + '.', go };
    }
    if (!hs.pop.done) return { text: `${to}reach ${hs.next.pop} people (${hs.pop.have} now). Build homes, jobs and what they need.`, go: tip?.type != null ? buildGo(tip.type) : buildGo(T.HOUSE) };
    const r = hs.res.find((x) => !x.done);
    if (r) return { text: `${to}have ${r.need} ${RES[r.k].name.toLowerCase()} in store (${r.have} now). Make it, collect harvests, or buy it on the Market.`, go: panelGo('stats', 'resources') };
  }
  if (tip) return { text: tip.text, go: tip.type != null ? buildGo(tip.type) : null };
  return { text: 'Everything is covered. Explore: trade, invest, ally with neighbours, and grow.', go: null };
}

// ---------- resources in the top bar ----------
// 1.2 split "materials" into wood and metal, and "food" into five kinds. Kept calm by grouping them into one
// chip each (Materials, Food) with the breakdown in the tooltip, same idiom the old combined food chip used.
// Products only appear once the city has ever made or held one, so a town with no factories sees nothing extra.
function renderResbar() {
  const bar = $('resbar');
  if (!bar || !state) return;
  const st = sim.resourceStock(state), r = state.stats?.res, ps = state.stats?.products, n = (v) => Math.floor(v || 0).toLocaleString();
  const chip = (iconId, label, v, bad, title) => `<span class="rchip ${bad ? 'bad' : ''}" title="${esc(title)}">${icon(iconId)}<b class="num">${v}</b><span class="sr">${label}</span></span>`;
  const materials = (st.wood || 0) + (st.metal || 0);
  const materialsTitle = `Building materials: ${['wood', 'metal'].map((k) => `${n(st[k])} ${RES[k].name.toLowerCase()} (${n(r?.prod[k])} made a day)`).join(', ')}`;
  const food = FOOD.reduce((a, k) => a + st[k], 0);
  const foodTitle = `Food: ${FOOD.map((k) => `${n(st[k])} ${RES[k].name.toLowerCase()}`).join(', ')}${r?.imported ? `. ${n(r.imported)} bought in yesterday` : ''}`;
  const hasProducts = PRODUCT_IDS.some((k) => st[k] > 0 || ps?.made?.[k] > 0);
  const products = PRODUCT_IDS.reduce((a, k) => a + (st[k] || 0), 0);
  const productsTitle = `Products: ${PRODUCT_IDS.map((k) => `${n(st[k])} ${PRODUCTS[k].name.toLowerCase()}`).join(', ')}`;
  bar.innerHTML = chip('i-water', 'water', n(st.water), r?.short.water > 0 && r?.prod.water > 0, `Water: ${n(st.water)} in store, ${n(r?.prod.water)} made and ${n(r?.need.water)} used a day`)
    + chip('i-power', 'power', n(st.power), r?.short.power > 0 && r?.prod.power > 0, `Power: ${n(st.power)} in store, ${n(r?.prod.power)} made and ${n(r?.need.power)} used a day`)
    + chip('i-materials', 'materials', n(materials), false, materialsTitle)
    + chip('i-food', 'food', n(food), false, foodTitle)
    + (hasProducts ? chip('i-products', 'products', n(products), false, productsTitle) : '');
}
$('resbar').onclick = () => { statsTab = 'resources'; drawer = null; openPanel('stats'); };

// ---------- private messages ----------
let threads = [], threadsUnsub = null, dmWith = null, dmMessages = [], dmUnsub = null;
const dmUnread = () => threads.filter((t) => t.unread).length;
function startDMs() {
  threadsUnsub?.();
  let first = true;
  threadsUnsub = fb.listenThreads(user.uid, (list) => {
    const before = new Set(threads.filter((t) => t.unread).map((t) => t.uid + t.last));
    threads = list;
    for (const t of list) if (t.unread && !first && !before.has(t.uid + t.last) && !(drawer === 'dm' && dmWith?.uid === t.uid)) { notify(`${t.name}: ${t.last}`, 'info'); play('tap'); }
    first = false;
    if (dmWith && drawer === 'dm' && list.some((t) => t.uid === dmWith.uid && t.unread)) fb.markRead(user.uid, dmWith.uid).catch(() => {});
    updateHud();
    if (drawer === 'dm' || drawer === 'chat') refreshDrawer();
  });
}
function openDM(uid, name) {
  if (uid === user.uid) return;
  dmWith = { uid, name: String(name || 'A mayor').slice(0, 24) };
  dmUnsub?.();
  dmMessages = [];
  dmUnsub = fb.listenDM(user.uid, uid, (msgs) => { dmMessages = msgs; if (drawer === 'dm') { renderDrawer(); const l = $('dm-list'); if (l) l.scrollTop = l.scrollHeight; } });
  if (threads.some((t) => t.uid === uid && t.unread)) fb.markRead(user.uid, uid).catch(() => {});
  drawer = null; openPanel('dm');
}
function wireDM(box) {
  box.querySelectorAll('[data-dm]').forEach((b) => { b.onclick = () => { const [uid, ...n] = b.dataset.dm.split('|'); openDM(uid, n.join('|')); }; });
  box.querySelector('[data-dm-back]')?.addEventListener('click', () => { dmUnsub?.(); dmUnsub = null; dmWith = null; renderDrawer(); });
  const f = box.querySelector('#dm-form');
  if (f) f.onsubmit = (e) => { e.preventDefault(); const text = $('dm-text').value.trim().slice(0, 500); if (!text || !dmWith) return;
    $('dm-text').value = '';
    fb.sendDM(user, mayor.slice(0, 24), dmWith.uid, dmWith.name, text).catch((err) => { notify(fb.authMessage(err), 'warn'); $('dm-text').value = text; }); };
  const l = $('dm-list'); if (l) l.scrollTop = l.scrollHeight;
}

// ---------- the market ----------
let offers = [], myOffers = [], marketUnsub = null, myOffersUnsub = null, dealsUnsub = null, marketTab = 'exchange', marketKind = 'sell';
let stocks = new Map(), stocksUnsub = null;
// Everyone's public figures, for prices and share values (your own city from the live state).
const worldCities = () => [...plots.values()].map((p) => (p.id === plotId ? { ...sim.summary(state), id: p.id } : p));
function refreshPrices() {
  if (!state) return;
  state._prices = sim.worldPrices(worldCities(), sim.worldDay());
}
const RES_NAME = (k) => RES[k]?.name.toLowerCase() || PRODUCTS[k]?.name.toLowerCase() || k;
function startMarket() {
  stocksUnsub = fb.listenStocks(world.id, (list) => { stocks = new Map(list.map((x) => [x.id, x])); if (drawer === 'market') refreshDrawer(); });
  refreshPrices();
  marketUnsub = fb.listenOffers(world.id, (list) => { offers = list; if (drawer === 'market') refreshDrawer(); });
  // My offers: once one is taken and its deal has arrived, or cancelled and given back, tidy it off the board.
  myOffersUnsub = fb.listenMyOffers(world.id, user.uid, (list) => {
    myOffers = list;
    // (A taken loan stays until it's repaid: the repayment is checked against it.)
    for (const o of list) if (o.status !== 'open' && o.plot === plotId && !(state.escrow || []).some((e) => e.offer === o.id) && !(state.debts || []).some((d) => d.offer === o.id)) fb.clearOffer(world.id, o.id).catch(() => {});
    if (drawer === 'market') refreshDrawer();
  });
  dealsUnsub = fb.listenDeals(world.id, user.uid, (list) => {
    for (const d of list) {
      if (!state || watching || (d.toPlot && d.toPlot !== plotId)) continue;   // for another of your cities: it waits until you open that one
      // A deal can show up again before its removal lands (or after a reload): the city remembers the ones it has applied.
      if (!firstTime(d.id)) { fb.finishDeal(world.id, d.id).catch(() => {}); continue; }
      const e = sim.release(state, d.offer, true);
      if (d.kind !== 'repay') state.counters.deals = (state.counters.deals || 0) + 1;
      if (d.kind === 'sell') { sim.receive(state, { money: d.money }); notify(`${d.fromName} bought your ${RES_NAME(e?.res)} for ${money(d.money)}.`, 'good'); }
      else if (d.kind === 'buy') { sim.receive(state, { res: d.res, qty: d.qty }); notify(`${d.fromName} delivered ${d.qty} ${RES_NAME(d.res)}.`, 'good'); }
      else if (d.kind === 'loan') {
        sim.receive(state, { money: d.money });
        sim.addDebt(state, { offer: d.offer, to: d.from, toName: d.fromName, toPlot: myOffers.find((o) => o.id === d.offer)?.takenPlot || '', repay: e?.repay || d.money, due: state.day + (e?.days || 7) });
        notify(`${d.fromName} lent you ${money(d.money)}. It’s repaid automatically on day ${state.day + (e?.days || 7)}.`, 'good');
      } else if (d.kind === 'labour') {
        sim.receive(state, { money: d.money });
        const n = sim.sendCrew(state, e?.qty || 0, e?.e || 0, myOffers.find((o) => o.id === d.offer)?.days || 5);
        notify(`${d.fromName} hired ${n} of your workers for ${money(d.money)}.`, 'good');
      } else if (d.kind === 'repay') {
        sim.receive(state, { money: d.money });
        state.loansOut = (state.loansOut || []).filter((l) => l.offer !== d.offer);
        notify(`${d.fromName} repaid ${money(d.money)}.`, 'good');
      }
      play('coin');
      if (d.kind === 'sell' || d.kind === 'buy' || d.kind === 'labour') fb.clearOffer(world.id, d.offer).catch(() => {});   // done: off the board
      fb.finishDeal(world.id, d.id).catch((err) => console.error(err));
      afterChange(); save();
    }
  });
}
// Debts fall due on their day; if the money isn't there, they're paid as soon as it is.
function repayDebts() {
  if (!state || watching) return;
  for (const d of sim.dueDebts(state)) {
    sim.payDebt(state, d.offer);
    fb.sendDeal(world.id, user, { offer: d.offer, kind: 'repay', fromName: state.name.slice(0, 40), toOwner: d.to, toPlot: d.toPlot || '', money: d.repay, res: null, qty: 0 })
      .then(() => { notify(`Repaid ${money(d.repay)} to ${d.toName}.`, 'act'); save(); fb.clearOffer(world.id, d.offer).catch(() => {}); })
      .catch((e) => { console.error('Repay', e); sim.addDebt(state, d); state.money += d.repay; });
  }
}
async function acceptOffer(o) {
  const deal = { kind: o.kind, fromName: state.name.slice(0, 40), toOwner: o.owner, toPlot: o.plot, money: 0, res: null, qty: 0 };
  if (o.kind === 'sell') { if (state.money < o.total) throw new Error(`Needs ${money(o.total)}.`); deal.money = o.total; }
  if (o.kind === 'buy') { if ((state.res?.[o.res] || 0) < o.qty) throw new Error(`You have ${Math.floor(state.res?.[o.res] || 0)} ${RES_NAME(o.res)} in store.`); deal.res = o.res; deal.qty = o.qty; }
  if (o.kind === 'loan' || o.kind === 'labour') { if (state.money < o.total) throw new Error(`Needs ${money(o.total)}.`); deal.money = o.total; }
  await fb.takeOffer(world.id, o.id, user, plotId, state.name.slice(0, 40), deal);
  state.counters.traded = (state.counters.traded || 0) + 1;
  state.counters.deals = (state.counters.deals || 0) + 1;
  if (o.kind === 'sell') { state.money -= o.total; sim.receive(state, { res: o.res, qty: o.qty }); notify(`Bought ${o.qty} ${RES_NAME(o.res)} from ${o.city}.`, 'good'); }
  if (o.kind === 'buy') { state.res[o.res] -= o.qty; state.money += o.total; notify(`Sold ${o.qty} ${RES_NAME(o.res)} to ${o.city} for ${money(o.total)}.`, 'good'); }
  if (o.kind === 'labour') { state.money -= o.total; sim.hireCrew(state, { n: o.qty, e: o.edu || 0, days: o.days || 1, from: o.city }); notify(`${o.qty} workers from ${o.city} start today, for ${o.days} days.`, 'good'); }
  if (o.kind === 'loan') { state.money -= o.total; (state.loansOut ||= []).push({ offer: o.id, to: o.owner, toName: o.city, repay: o.repay, due: state.day + (o.days || 7) }); notify(`Lent ${money(o.total)} to ${o.city}. They repay ${money(o.repay)}.`, 'good'); }
  play('coin'); afterChange(); await save();
}
async function postOffer(form) {
  const kind = form.kind, id = fb.newOfferId(world.id);
  const qty = kind === 'loan' ? Math.round(+form.amount) : Math.round(+form.qty), price = kind === 'loan' ? Math.round(+form.repay) : +form.price;
  if (kind === 'labour' && !(+form.days >= 1 && +form.days <= MARKET.maxLoanDays)) throw new Error(`Between 1 and ${MARKET.maxLoanDays} days.`);
  if (kind === 'loan') {
    if (!(price >= qty && price <= qty * 2)) throw new Error('Repay between the amount and twice it.');
    if (!(+form.days >= 1 && +form.days <= MARKET.maxLoanDays)) throw new Error(`Repay within 1 to ${MARKET.maxLoanDays} days.`);
  }
  const r = sim.reserve(state, id, kind, kind === 'loan' ? null : kind === 'labour' ? +form.res : form.res, qty, price);
  if (!r.ok) throw new Error(r.reason + '.');
  if (kind === 'loan') state.escrow[state.escrow.length - 1].days = Math.round(+form.days);
  await save();
  const offer = kind === 'labour'
    ? { kind, res: null, qty, price: Math.round(price * 100) / 100, total: Math.round(qty * price * Math.round(+form.days)), days: Math.round(+form.days), edu: +form.res || 0 }
    : kind === 'loan'
    ? { kind, res: null, qty: 0, price: 0, total: qty, repay: price, days: Math.round(+form.days) }
    : { kind, res: form.res, qty, price: Math.round(price * 100) / 100, total: r.total };
  try { await fb.postOffer(world.id, id, { ...offer, owner: user.uid, ownerName: mayor.slice(0, 24), plot: plotId, city: state.name.slice(0, 40) }); }
  catch (e) { sim.release(state, id); afterChange(); throw e; }
  play('coin'); notify('Your offer is on the market.', 'act'); afterChange(); marketTab = 'yours';
}
function marketCtx() {
  refreshPrices();
  const cities = [...stocks.values()].filter((st) => st.id !== plotId && plots.get(st.id)).map((st) => { const p = plots.get(st.id);
    return { id: st.id, city: p.name, mayor: p.ownerName, pop: p.pop, growth: p.season === new Date().toISOString().slice(0, 7) ? p.growth : 0, price: sim.sharePrice(p), available: st.available, float: st.float, held: state.holdings?.[st.id] }; })
    .sort((a, b) => b.price - a.price);
  // Shares you still hold in cities that were taken off the exchange or left the world show too, so you can see them.
  return { locked: { shares: !isOpen('shares') }, day: sim.worldDay(), prices: state._prices || {}, yday: sim.worldPrices(worldCities(), sim.worldDay() - 1), cities,
    listing: state.listed ? stocks.get(plotId) || {} : null, canList: sim.canList(state, STOCK.listMin), myPrice: sim.sharePrice(sim.summary(state)), offers: offers.filter((o) => o.owner !== user.uid), mine: myOffers.filter((o) => o.status === 'open'), s: state, tab: marketTab, kind: marketKind,
    debts: state.debts || [], loansOut: state.loansOut || [], money: state.money, stock: sim.resourceStock(state) };
}
function wireMarket(box) {
  const done = (r, text) => { if (!r.ok) { notify(r.reason + '.', 'act'); play('error'); return false; } play('coin'); notify(text, 'act'); afterChange(); save(); return true; };
  box.querySelectorAll('[data-buy-res]').forEach((b) => { b.onclick = () => { const [k, n] = b.dataset.buyRes.split('|'); const r = sim.buyResource(state, k, +n); done(r, `Bought ${n} ${RES[k].name.toLowerCase()} for ${money(r.cost)}.`); }; });
  box.querySelectorAll('[data-sell-res]').forEach((b) => { b.onclick = () => { const [k, n] = b.dataset.sellRes.split('|'); const r = sim.sellResource(state, k, +n); done(r, `Sold ${n} ${RES[k].name.toLowerCase()} for ${money(r.got)}.`); }; });
  box.querySelectorAll('[data-buy-city]').forEach((b) => { b.onclick = () => busy(b, async () => {
    const [id, n] = b.dataset.buyCity.split('|'), p = plots.get(id), price = sim.sharePrice(p);
    if (state.money < price * +n * (1 + STOCK.fee)) throw new Error(`Needs ${money(price * +n * (1 + STOCK.fee))}.`);
    await fb.tradeStock(world.id, id, -n);
    done(sim.buyCityShares(state, id, p.name, +n, price), `Bought ${n} shares in ${p.name} at $${price.toFixed(2)}.`);
  }, $('mk-msg')); });
  box.querySelectorAll('[data-sell-city]').forEach((b) => { b.onclick = () => busy(b, async () => {
    const [id, n] = b.dataset.sellCity.split('|'), p = plots.get(id), price = p ? sim.sharePrice(p) : 0.5;
    await fb.tradeStock(world.id, id, +n);
    const r = sim.sellCityShares(state, id, +n, price);
    done(r, `Sold ${n} shares in ${p?.name || 'that city'} for ${money(r.got)}.`);
  }, $('mk-msg')); });
  const lf = box.querySelector('#list-form');
  if (lf) lf.onsubmit = (e) => { e.preventDefault(); busy(lf.querySelector('button'), async () => {
    const n = Math.round(+new FormData(lf).get('float')), c = sim.canList(state, n);
    if (!c.ok) throw new Error(c.reason + '.');
    await fb.listStock(world.id, plotId, user, state.name.slice(0, 40), n);
    const r = sim.listCity(state, n);
    done(r, `${state.name} is on the exchange. You raised ${money(r.got)} for ${n} shares.`);
  }, $('mk-msg')); };
  box.querySelector('[data-delist]')?.addEventListener('click', () => busy(box.querySelector('[data-delist]'), async () => {
    await fb.delistStock(world.id, plotId);
    delete state.listed;
    done({ ok: true }, `${state.name} is off the exchange.`);
  }, $('mk-msg')));
  box.querySelectorAll('[data-mtab]').forEach((b) => { b.onclick = () => { marketTab = b.dataset.mtab; renderDrawer(); }; });
  box.querySelector('#mk-kind')?.addEventListener('change', (e) => { marketKind = e.target.value; renderDrawer(); });
  box.querySelectorAll('[data-take]').forEach((b) => { b.onclick = () => busy(b, async () => { const o = offers.find((x) => x.id === b.dataset.take); if (o) await acceptOffer(o); }, $('mk-msg')); });
  box.querySelectorAll('[data-cancel-offer]').forEach((b) => { b.onclick = () => busy(b, async () => {
    const id = b.dataset.cancelOffer;
    await fb.cancelOffer(world.id, id);
    sim.release(state, id);
    fb.clearOffer(world.id, id).catch(() => {});
    notify('Offer withdrawn. What you set aside is back.', 'act'); afterChange(); save();
  }, $('mk-msg')); });
  const post = box.querySelector('#mk-post');
  if (post) post.onsubmit = (e) => { e.preventDefault(); busy(post.querySelector('button[type=submit]'), async () => {
    const f = Object.fromEntries(new FormData(post).entries());
    await postOffer({ ...f, kind: marketKind });
  }, $('mk-msg')); };
}

function startRegion() {
  projUnsub = fb.listenProjects(world.id, (list) => {
    const was = new Set(projects.filter((p) => p.done).map((p) => p.id));
    projects = list.sort((a, b) => (a.done - b.done) || (b.raised / b.goal - a.raised / a.goal));
    for (const p of projects) if (p.done && !was.has(p.id) && was.size + projects.length > 0 && (p.members?.[user.uid] || 0) > 0) notify(`${p.name} is finished! Every city that paid in now benefits.`, 'good');
    applyRegion();
  });
  allyUnsub = fb.listenAlliances(world.id, (list) => { alliances = list; applyRegion(); watchAllyChat(); });
}
function applyRegion() {
  if (!state) return;
  const r = { mood: 0, draw: 0, trade: 0, health: 0 };
  for (const p of projects) {
    const t = REGIONAL[p.type];
    if (!p.done || !t || (p.members?.[user.uid] || 0) < p.goal * REGIONAL_SHARE) continue;
    r.mood += t.mood || 0; r.draw += t.draw || 0; r.trade += t.trade || 0; r.health = Math.max(r.health, t.health || 0);
  }
  state._regional = r;
  const a = myAlliance();
  state._allies = a ? Math.min(6, a.members.length - 1) : 0;
  tagOf = new Map();
  for (const x of alliances) for (const m of x.members || []) tagOf.set(m, x.tag);
  for (const p of plots.values()) p.tag = tagOf.get(p.owner) || '';
  dirty = true;
  if (drawer === 'region') refreshDrawer();
}
function watchAllyChat() {
  const a = myAlliance();
  if ((a?.id || null) === allyChatFor) return;
  allyChatUnsub?.(); allyChatUnsub = null; allyChat = []; allyChatFor = a?.id || null;
  if (a) allyChatUnsub = fb.listenAllianceChat(world.id, a.id, (msgs) => { allyChat = msgs; if (drawer === 'region') refreshDrawer(); });
}
let rankBy = 'growth';
function regionCtx() {
  const a = myAlliance(), mine = (p) => p.members?.[user.uid] || 0, month = new Date().toISOString().slice(0, 7);
  // Growth this month: each member city's people now, less at the start of the month.
  const growthOf = (uid) => [...plots.values()].filter((p) => p.owner === uid && p.status === 'alive' && (p.mine ? state.flags?.season?.m : p.season) === month)
    .reduce((s2, p) => s2 + (p.mine ? state.people.length - (state.flags?.season?.pop ?? state.people.length) : p.growth || 0), 0);
  const popOf = (uid) => [...plots.values()].filter((p) => p.owner === uid && p.status === 'alive').reduce((s2, p) => s2 + (p.mine ? state.people.length : p.pop || 0), 0);
  return {
    projects: projects.map((p) => ({ ...p, mine: mine(p), benefits: p.done && mine(p) >= p.goal * REGIONAL_SHARE, share: Math.ceil(p.goal * REGIONAL_SHARE) })),
    alliances: alliances.map((x) => ({ ...x, pop: (x.members || []).reduce((s2, m) => s2 + popOf(m), 0), growth: (x.members || []).reduce((s2, m) => s2 + growthOf(m), 0) }))
      .sort((x, y) => y[rankBy] - x[rankBy] || y.pop - x.pop),
    rankBy,
    mine: a, chat: allyChat.map((m) => ({ ...m, text: clean(m.text) })), me: user.uid, money: state.money, regional: state._regional || {},
    nameOf: (uid) => [...plots.values()].find((p) => p.owner === uid)?.ownerName || 'A mayor',
  };
}
function wireRegion(box) {
  box.querySelectorAll('[data-rank]').forEach((b) => { b.onclick = () => { rankBy = b.dataset.rank; renderDrawer(); }; });
  box.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = () => busy(b, async () => {
    const [id, amt] = b.dataset.pay.split('|'), want = Math.min(+amt, Math.floor(state.money));
    if (want < 10) throw new Error('Not enough money.');
    const r = await fb.contribute(world.id, id, user.uid, want);
    state.money -= r.add;
    sim.note(state, 'info', `Paid $${r.add} into a regional project.`);
    play('coin'); notify(r.done ? 'That finished it! The project is complete.' : `Paid ${money(r.add)} in.`, r.done ? 'good' : 'act');
    afterChange();
  }, $('region-msg')); });
  const f = box.querySelector('#project-form');
  if (f) f.onsubmit = (e) => { e.preventDefault(); busy(f.querySelector('button'), async () => {
    const type = $('project-type').value, t = REGIONAL[type];
    if (projects.some((p) => p.type === type && !p.done)) throw new Error(`There’s already a ${t.name.toLowerCase()} being funded. Pay into that one.`);
    await fb.startProject(world.id, user, mayor.slice(0, 24), type, t.name, t.goal);
    formOk('region-msg', `Started a ${t.name.toLowerCase()}. Tell your neighbours!`);
  }, $('region-msg')); };
  const af = box.querySelector('#ally-form');
  if (af) af.onsubmit = (e) => { e.preventDefault(); busy(af.querySelector('button'), async () => {
    const name = $('ally-name').value.trim().slice(0, 30), tag = $('ally-tag').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!name) throw new Error('Name your alliance.');
    if (tag.length < 2) throw new Error('A tag is 2 to 4 letters or numbers.');
    if (alliances.some((x) => x.tag === tag)) throw new Error('That tag is taken.');
    await fb.createAlliance(world.id, user, name, tag);
  }, $('region-msg')); };
  box.querySelectorAll('[data-join]').forEach((b) => { b.onclick = () => busy(b, async () => {
    if (myAlliance()) throw new Error('Leave your current alliance first.');
    const x = alliances.find((y) => y.id === b.dataset.join);
    if ((x?.members?.length || 0) >= 12) throw new Error('That alliance is full.');
    await fb.joinAlliance(world.id, b.dataset.join, user.uid); play('goal');
  }, $('region-msg')); });
  box.querySelector('#ally-leave')?.addEventListener('click', () => busy($('ally-leave'), async () => {
    const a = myAlliance();
    if (!a) return;
    if (a.members.length <= 1) await fb.deleteAlliance(world.id, a.id); else await fb.leaveAlliance(world.id, a.id, user.uid);
  }, $('region-msg')));
  const cf = box.querySelector('#ally-chat-form');
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault();
    const t = $('ally-text').value.trim(), a = myAlliance();
    if (!t || !a) return;
    if (Date.now() - lastAllyMsg < 2500) { notify('Slow down a little.', 'act'); return; }
    lastAllyMsg = Date.now(); $('ally-text').value = '';
    try { await fb.sendAllianceChat(world.id, a.id, user, mayor.slice(0, 24), t.slice(0, 280)); } catch (err) { notify(fb.authMessage(err), 'warn'); }
  };
}

function refreshWorld() { if (!worldUnsub) startLive(); }

// Roads that meet across the gap between two plots form a link (and a bridge).
const roadDone = (p, i) => (p.grid[i] === T.ROAD || p.grid[i] === T.XING) && !p.uc.has(i);
const railDone = (p, i) => (p.grid[i] === T.RAIL || p.grid[i] === T.XING) && !p.uc.has(i);
const isActive = (p) => p.mine || Date.now() - (p.active || 0) < INACTIVE_MS;
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
    if (!q || q.status !== 'alive' || !isActive(q)) continue;
    let edge = -1, via = null;
    for (let k = 0; k < PLOT && via !== 'rail'; k++) {
      const mine = dx === 1 ? k * PLOT + PLOT - 1 : dx === -1 ? k * PLOT : dy === 1 ? (PLOT - 1) * PLOT + k : k;
      const theirs = dx === 1 ? k * PLOT : dx === -1 ? k * PLOT + PLOT - 1 : dy === 1 ? k : (PLOT - 1) * PLOT + k;
      if (railDone(me, mine) && railDone(q, theirs)) { edge = mine; via = 'rail'; }
      else if (!via && roadDone(me, mine) && roadDone(q, theirs)) { edge = mine; via = 'road'; }
    }
    if (!via) continue;
    const key = `${q.id}|${q.version}`;
    if (!offerCache.has(key)) { if (offerCache.size > 200) offerCache.clear(); offerCache.set(key, q.offer || (q.st ? sim.offer(q.st) : { fun: 0, care: 0, shop: 0, school: 0, homesFree: 0, happiness: 0 })); }
    abroad.push({ id: q.id, name: q.name, via, edge, ...offerCache.get(key) });
    const theirUse = q.out?.[plotId];
    if (theirUse) {
      for (const k in incoming) incoming[k] += theirUse[k] || 0;
      visitorsFrom.push({ name: q.name, edge, via, ...theirUse });
    }
  }
  // A train for every rail link: from your station, over the bridge, to the neighbour's station.
  const railTile = (t) => t === T.RAIL || t === T.XING || t === T.STATION;
  const walkRail = (grid, from, goal) => {
    const prev = new Map([[from, -1]]), q = [from];
    for (let k = 0; k < q.length; k++) {
      const u = q[k];
      if (goal(u)) { const out = []; for (let v = u; v !== -1; v = prev.get(v)) out.push(v); return out.reverse(); }
      for (const v of sim.neighbours(u)) if (!prev.has(v) && railTile(grid[v])) { prev.set(v, u); q.push(v); }
    }
    return null;
  };
  const trains = [];
  for (const a of abroad) {
    if (a.via !== 'rail') continue;
    const q = plots.get(a.id), dx = q.px - me.px, dy = q.py - me.py;
    const k = dx ? Math.floor(a.edge / PLOT) : a.edge % PLOT;
    const theirEdge = dx === 1 ? k * PLOT : dx === -1 ? k * PLOT + PLOT - 1 : dy === 1 ? k : (PLOT - 1) * PLOT + k;
    const mine = walkRail(state.grid, a.edge, (i) => state.grid[i] === T.STATION);
    const theirs = walkRail(q.grid, theirEdge, (i) => q.grid[i] === T.STATION);
    if (!mine || !theirs) continue;
    const wpt = (p, i) => [p.px * STRIDE + (i % PLOT) + 0.5, p.py * STRIDE + Math.floor(i / PLOT) + 0.5];
    const path = [...mine.reverse().map((i) => wpt(me, i))];
    const e = path.at(-1);
    for (let g = 1; g <= 2; g++) path.push([e[0] + dx * g, e[1] + dy * g]);
    path.push(...theirs.map((i) => wpt(q, i)));
    const old = worldTrains.find((t) => t.to === q.id);
    trains.push(old && old.path.length === path.length ? old : { to: q.id, path, s: 0, dir: 1, wait: 1, mode: 'train', vehicle: true });
  }
  worldTrains = trains;
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
    return q && { side, px: q.px, py: q.py, name: q.name, ownerName: q.ownerName, pop: q.pop, status: q.status, links: linksWith.get(q.id) || 0, idle: !isActive(q), ago: ago(q.active) };
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

// Long absences run in slices with a progress message, so the page never locks up.
let catching = false;
async function catchUp() {
  let due = Math.floor((Date.now() - state.lastTick) / TICK_MS);
  const cap = MAX_OFFLINE_DAYS * HOURS_PER_DAY, capped = due > cap;
  if (capped) { state.lastTick = Math.floor(Date.now() / TICK_MS) * TICK_MS - cap * TICK_MS; due = cap; }
  if (due <= HOURS_PER_DAY * 2) { const r = advance(); return r && { ...r, capped: r.capped || capped }; }
  const st = state, wasGame = !$('game').classList.contains('hidden');
  const before = { day: st.day, money: st.money, pop: st.people.length, log: st.log.length };
  catching = true;
  show('boot');
  const total = Math.ceil(due / HOURS_PER_DAY);
  try {
    while (state === st && st.status === 'alive' && Date.now() - st.lastTick >= TICK_MS * HOURS_PER_DAY) {
      advance(HOURS_PER_DAY);
      const left = Math.ceil((Date.now() - st.lastTick) / TICK_MS / HOURS_PER_DAY);
      $('boot-msg').textContent = `${st.name} kept living while you were away. Catching up: day ${Math.max(1, total - left)} of ${total}…`;
      await new Promise((r) => setTimeout(r, 0));
    }
    if (state === st) advance();
  } finally { catching = false; }
  if (state !== st) return null;
  if (wasGame) show('game');
  st._finished = [];
  return { ...before, capped, days: st.day - before.day };
}
function advance(limit = Infinity) {
  const due = Math.floor((Date.now() - state.lastTick) / TICK_MS);
  if (due <= 0) return null;
  const cap = MAX_OFFLINE_DAYS * HOURS_PER_DAY;
  const before = { day: state.day, money: state.money, pop: state.people.length, log: state.log.length };
  const n = Math.min(due, cap, limit);
  let lastDay = null, newDay = false;
  for (let k = 0; k < n; k++) {
    const r = sim.tick(state);
    if (r.plan) { plan = r.plan; totalsNow = r.totals; }
    if (r.day) { lastDay = r.day; newDay = true; sendEmigrants(r.day.emigrants); }
    if (r.collapsed) { onCollapse(r.collapsed); break; }
  }
  state.lastTick = (due > cap && n === cap) || state.status !== 'alive' ? Date.now() : state.lastTick + n * TICK_MS;
  if (newDay || !plan) { plan = state._plan || sim.plan(state); trips.set(plotId, state, plan); }
  if (n >= HOURS_PER_DAY) { state._finished = []; return { ...before, capped: due > cap, days: state.day - before.day }; }
  if (lastDay) onNewDay(lastDay);
  return null;
}

function sendEmigrants(list) {
  for (const e of list || []) {
    const q = plots.get(e.to);
    if (!q?.owner) { sim.welcome(state, e.people, 'their trip'); continue; }
    fb.sendMove(world.id, { from: plotId, fromName: state.name, fromOwner: user.uid, to: e.to, toOwner: q.owner, people: e.people.slice(0, 8) })
      .catch((err) => { console.error('Move failed', err); sim.welcome(state, e.people, 'their trip (the move fell through)'); afterChange(); });
  }
}

// One-off tips the first time something happens.
function tipOnce(key, text) {
  const seen = new Set(JSON.parse(localStorage.getItem('commons-tips') || '[]'));
  if (seen.has(key)) return;
  seen.add(key);
  try { localStorage.setItem('commons-tips', JSON.stringify([...seen])); } catch { /* ignore */ }
  notify(text, 'act');
}
function firstTimeTips(st) {
  const c = sim.census(state);
  if (c.sick) tipOnce('sick', 'Tip: someone is ill. A clinic treats illness before it gets serious; a hospital handles the rest.');
  if (st.crimes) tipOnce('crime', 'Tip: there was a crime. Police catch offenders, a courthouse hears their cases, and jobs keep crime down.');
  if (st.deaths) tipOnce('death', 'Tip: a resident died. A cemetery helps families grieve and move on.');
  if (state.links) tipOnce('link', 'Tip: you’re linked to a neighbour. Residents can now use each other’s facilities, visit and even move.');
  if ((state.wants || []).length) tipOnce('want', 'Tip: a resident has a request. Open Goals to see it; building what they ask for pays a reward.');
  if (c.seeking > 3) tipOnce('jobs', 'Tip: people are looking for work. Check which jobs they qualify for in Stats, People.');
  if (sim.weather(sim.worldDay()) !== 'clear') tipOnce('weather', 'Tip: weather changes with the seasons. Rain and snow keep people in; snow slows traffic; heat spreads illness.');
}
// Big moments read aloud, for players who turned on speech.
function callout(text) {
  announce(text);
  if (prefs.speak && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch { /* ignore */ } }
}
function alertBrowser(text) {
  if (!prefs.alerts || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(`${state.name}: ${text}`, { icon: 'icon.svg', tag: 'commons' }); } catch { /* not supported */ }
}

// ---------- timelapse ----------
// One small map picture a day, kept on this device. 240 days fit easily; older days are thinned out.
const tlKey = () => `commons-tl-${plotId}`;
function tlLoad() { try { return JSON.parse(localStorage.getItem(tlKey()) || '[]'); } catch { return []; } }
function tlSnap() {
  if (!state || !plotId) return;
  const list = tlLoad();
  if (list.length && list.at(-1).d >= state.day) return;
  list.push({ d: state.day, m: sim.mapString(state), p: state.people.length, n: state.name });
  let out = list;
  if (out.length > 240) out = out.filter((x, k) => k % 2 === 0 || k > out.length - 60);
  try { localStorage.setItem(tlKey(), JSON.stringify(out)); } catch { try { localStorage.setItem(tlKey(), JSON.stringify(out.slice(-80))); } catch { /* full */ } }
}
function showTimelapse() {
  tlSnap();
  const frames = tlLoad();
  if (frames.length < 2) { notify('The timelapse starts today. Come back after a few city days to watch it grow.', 'act'); return; }
  openModal(`${closeX}<h2 id="modal-title">${esc(state.name)}, day by day</h2>
    <canvas id="tl-canvas" class="tl-canvas" width="720" height="440" aria-label="Timelapse of your city"></canvas>
    <div class="tl-bar"><button class="btn primary" id="tl-play" type="button">Pause</button>
      <input type="range" id="tl-seek" min="0" max="${frames.length - 1}" value="0" aria-label="Day">
      <span class="num" id="tl-day"></span>
      <div class="seg" role="radiogroup" aria-label="Speed">${[[400, 'Slow'], [160, 'Normal'], [60, 'Fast']].map(([v, l]) => `<button type="button" role="radio" data-tlspeed="${v}" aria-checked="${v === 160}">${l}</button>`).join('')}</div>
      <button class="btn" id="tl-rec" type="button">Save as video</button></div>
    <p class="soft small">Pictures are kept on this device, one a day, from when you started playing with version 1.4.</p>`, 'wide');
  const c = $('tl-canvas'), r = new Renderer(c);
  r.view = '3d';
  let k = 0, speed = 160, playing = true, last = 0, raf = 0, rec = null;
  const draw = () => {
    const f = frames[k], m = sim.fromMap(f.m);
    r.resize();
    r.cam = { x: me.px * STRIDE + PLOT / 2 + 0.5, y: me.py * STRIDE + PLOT / 2 + 0.5, z: Math.min(r.w / 52, r.h / 28) };
    const plot = { id: 'tl', px: me.px, py: me.py, st: null, name: f.n, ownerName: '', status: 'alive', pop: f.p, grid: m.grid, cond: m.cond, lv: m.lv, land: m.land, terr: m.terr || state.terr, uc: m.uc, queueMap: new Map(), mine: false, out: {} };
    r.draw({ plots: new Map([['tl', plot]]), theme: resolvedTheme(prefs), palette: palette(prefs), paletteKey: prefs.colours, prefs, pops: [], nightAmt: 0, shapes: false, bridges: new Map(), agentsByPlot: new Map(), worldTrains: [] });
    const g = c.getContext('2d');
    g.save(); g.fillStyle = 'rgba(23,49,59,0.8)'; g.fillRect(12, 12, 230, 46); g.fillStyle = '#fff'; g.font = '800 18px Overpass, system-ui'; g.fillText(`Day ${f.d}`, 24, 34); g.font = '600 13px Overpass, system-ui'; g.fillText(`${f.p} people`, 24, 51); g.restore();
    $('tl-seek').value = k; $('tl-day').textContent = `Day ${f.d}`;
  };
  const loop = (now) => {
    if (!modal.open || !$('tl-canvas')) { rec?.stop(); return; }
    if (playing && now - last > speed) { last = now; k = (k + 1) % frames.length; draw(); if (rec && k === frames.length - 1) setTimeout(() => rec.stop(), speed); }
    raf = requestAnimationFrame(loop);
  };
  draw(); raf = requestAnimationFrame(loop);
  $('tl-play').onclick = () => { playing = !playing; $('tl-play').textContent = playing ? 'Pause' : 'Play'; };
  $('tl-seek').oninput = (e) => { k = +e.target.value; playing = false; $('tl-play').textContent = 'Play'; draw(); };
  modal.querySelectorAll('[data-tlspeed]').forEach((b) => { b.onclick = () => { speed = +b.dataset.tlspeed; modal.querySelectorAll('[data-tlspeed]').forEach((x) => x.setAttribute('aria-checked', x === b)); }; });
  $('tl-rec').onclick = () => {
    if (!c.captureStream || !window.MediaRecorder) { notify('Your browser can’t record video. Try Chrome, Edge or Firefox.', 'act'); return; }
    const chunks = [], type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    rec = new MediaRecorder(c.captureStream(30), { mimeType: type });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      a.download = `${state.name.replace(/[^\w ]/g, '')} timelapse.webm`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      rec = null; $('tl-rec') && ($('tl-rec').disabled = false, $('tl-rec').textContent = 'Save as video'); notify('Timelapse saved as a video.', 'act');
    };
    k = 0; playing = true; draw(); rec.start();
    $('tl-rec').disabled = true; $('tl-rec').textContent = 'Recording…';
  };
}

function onNewDay(st) {
  tlSnap();
  if (!tut.active()) firstTimeTips(st);   // don't pile one-off tips on top of the guided tour
  const hall = sim.xy(sim.HALL_INDEX);
  if (st.income > 0) { addPop(hall.x, hall.y, 1.8, `+${money(st.income)}`, '#ffd24a'); play('coin'); }
  // Floating feedback when mood visibly improves: only when it crosses into a better mood band (as moodWord()
  // uses), so a lucky day or two of tiny fluctuation doesn't spam the pop-up. No matching "sadder" pop: losing
  // a band is already obvious from the ring colour and word, and the needs bars show exactly what's wrong.
  const moodNow = state.history.at(-1)?.mood, moodPrev = state.history.at(-2)?.mood;
  const moodBand = (m) => (m >= 80 ? 3 : m >= 60 ? 2 : m >= 40 ? 1 : 0);
  if (moodNow != null && moodPrev != null && moodBand(moodNow) > moodBand(moodPrev)) addPop(hall.x, hall.y, 2, 'Happier!', '#ffd24a');
  if (st.event) notify(st.event, 'info');
  if (st.disaster) { notify(st.disaster, 'warn'); callout(st.disaster); }
  if (st.milestone) { const hall = sim.xy(sim.HALL_INDEX); addPop(hall.x, hall.y, 2.6, `${st.milestone} people!`, '#ffd24a'); play('goal'); notify(`${state.name} reached ${st.milestone} residents!`, 'good'); callout(`${state.name} reached ${st.milestone} residents.`); }
  if (st.bailout) notify(`You couldn’t pay your bills, so the region sent a one-off grant of ${money(st.bailout)}. Cut costs or grow tax before it happens again.`, 'warn');
  if (st.era) { const hall = sim.xy(sim.HALL_INDEX); addPop(hall.x, hall.y, 3, st.era, '#ffd24a'); play('level'); notify(`${state.name} is now a ${st.era.toLowerCase()}! A grant from the region has arrived.`, 'good'); callout(`${state.name} is now a ${st.era.toLowerCase()}.`); }
  if (state.flags.opp && state.flags.opp.day === state.day + 3) notify(`Election in 3 days: ${state.flags.opp.name} is running on ${state.flags.opp.promise}. Improve that before voting day.`, 'warn');
  if (state.pledge && state.pledge.until === state.day + 1) notify(`Tomorrow your promise to ${state.pledge.name} comes due.`, 'warn');
  if (st.priced) notify(`${st.priced} ${st.priced > 1 ? 'people were' : 'person was'} priced out by rising rents. Property tax makes it worse.`, 'warn');
  if (user?.isAnonymous && state.day >= 3 && !sessionStorage.getItem('commons-guest-nag')) {
    try { sessionStorage.setItem('commons-guest-nag', '1'); } catch { /* ignore */ }
    notify('You’re playing as a guest, so this city lives only in this browser. Open Account to save it to an email or Google account.', 'warn');
  }
  if (st.tourists >= 10 && !state.flags.touristTip) { state.flags.touristTip = 1; notify(`${st.tourists} tourists visited yesterday and spent ${money(st.byClass?.tourism || 0)}.`, 'good'); }
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

const pathCtx = () => ({ alliance: !!myAlliance(), cities: myCities().length || 1 });
const isOpen = (f) => !state || sim.unlocked(state, f);
function checkGoals() {
  state.flags.ally = !!myAlliance(); state.flags.friends = friends().length;   // for the goals you reach with neighbours
  if (!watching) { const lv = sim.checkHall(state, pathCtx()); if (lv) showHallUp(lv); }
  const got = sim.checkGoals(state, totalsNow || sim.totals(state));
  if (got.length) {
    const sum = got.reduce((a, g) => a + g.reward, 0), hall = sim.xy(sim.HALL_INDEX);
    if (got.length === 1) callout(`Goal complete: ${got[0].text}.`);
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

// Council decisions: a small card with two choices. Ignoring it for 3 days counts as the second.
// A resident's letter uses the same card when there's no council decision waiting.
const WORRY = { jobs: 'I can’t find work, and neither can my neighbours.', homes: 'My family can’t find anywhere to live.', school: 'My children have no school place.', health: 'I’ve been ill for days and can’t see a doctor.',
  safety: 'I don’t feel safe walking home any more.', commute: 'I spend half my day stuck in traffic.', leisure: 'There’s nothing to do here in the evenings.', air: 'The air makes my chest tight.', waste: 'There’s rubbish piled up in our street.' };
function renderLetter(box) {
  const l = state?.letter, p = l && state.people.find((x) => x.i === l.p);
  if (!p || document.body.classList.contains('photo')) { box.classList.add('hidden'); box.dataset.id = ''; return; }
  const id = `letter-${l.p}-${l.d}`;
  if (box.dataset.id === id) return;
  box.dataset.id = id;
  box.innerHTML = `<span class="pill">A letter to the mayor</span><h3>From ${esc(sim.personName(p))}, ${p.a}</h3><p>“Dear Mayor, ${WORRY[l.k] || 'things could be better.'} Please do something.”</p>
    <div class="dchoices"><button class="btn primary" type="button" data-reply="promise">Promise to fix it<small>Within 6 days. Keep it and people trust you; break it and they won’t.</small></button>
    <button class="btn" type="button" data-reply="thank">Thank them<small>A kind word, no promises.</small></button></div>`;
  box.classList.remove('hidden');
  box.querySelectorAll('[data-reply]').forEach((b) => { b.onclick = () => { sim.replyLetter(state, b.dataset.reply); play('coin'); box.dataset.id = ''; renderDecision(); afterChange(); }; });
  announce(`A letter from ${sim.personName(p)}: ${WORRY[l.k]}`);
}
function renderDecision() {
  const box = $('decision');
  if (watching) { box.classList.add('hidden'); return; }
  const d = state?.decision && DECISIONS.find((x) => x.id === state.decision.id);
  if (!d && !document.body.classList.contains('photo')) { renderLetter(box); return; }
  if (!d || document.body.classList.contains('photo')) { box.classList.add('hidden'); box.dataset.id = ''; return; }
  if (box.dataset.id === d.id) return;
  box.dataset.id = d.id;
  box.innerHTML = `<span class="pill">Council decision</span><h3>${d.title}</h3><p>${d.text}</p>
    <div class="dchoices"><button class="btn primary" type="button" data-choice="a">${d.a[0]}<small>${d.a[1]}</small></button>
    <button class="btn" type="button" data-choice="b">${d.b[0]}<small>${d.b[1]}</small></button></div>`;
  box.classList.remove('hidden');
  box.querySelectorAll('[data-choice]').forEach((b) => { b.onclick = () => { sim.decide(state, b.dataset.choice); play('coin'); box.dataset.id = ''; renderDecision(); afterChange(); }; });
  announce(`Council decision: ${d.title}. ${d.text}`);
  play('warn');
}

function startLoops() {
  stopLoops();
  loopTimer = setInterval(() => {
    if (!state || catching || tabPaused) return;
    if (watching) { updateHud(); drawMinimap(); renderDeskBar(); return; }
    if (Date.now() - state.lastTick > TICK_MS * HOURS_PER_DAY * 2) { catchUp().then((r) => { if (r) showAway(r); }); return; }
    advance();
    // Builders keep working between hours.
    if (sim.work(state, (Date.now() - state.lastTick) / TICK_MS)) afterChange();
    drainFinished();
    checkGoals();
    syncMine();
    updateHud();
    drawMinimap();
    updateFollowChip();
    renderDecision();
    ambient(prefs.ambient, (plan?.trips.length || 0) / 120, nightAmt() < 0.5);
    music(prefs.music, prefs.musicVolume, nightAmt() > 0.5);
    if (drawer === 'inspect' || drawer === 'person') refreshDrawer();
    else if (drawer && drawer !== 'world' && drawer !== 'chat' && state.hour !== lastHour) refreshDrawer();
    if (state.hour !== lastHour) repayDebts();
    lastHour = state.hour;
    maybeNudge();
    if (Date.now() - lastSave > SAVE_EVERY_MS && !saveFails) save();
  }, 500);
}
function stopLoops() { clearInterval(loopTimer); clearInterval(worldTimer); }

document.addEventListener('visibilitychange', () => {
  setHidden(document.hidden && prefs.muteHidden);
  if (!state) return;
  if (document.hidden) save();
  else if (!catching && !tabPaused) catchUp().then((r) => { if (!state) return; syncMine(); updateHud(); if (r) showAway(r); });
});
window.addEventListener('pagehide', () => state && save());

// ---------- one tab at a time ----------
// Two tabs saving the same city would overwrite each other. The tab opened last wins; the other pauses.
const TAB_ID = Math.random().toString(36).slice(2);
let tabPaused = false;
const tabChan = 'BroadcastChannel' in window ? new BroadcastChannel('commons-tabs') : null;
function claimTab() { tabPaused = false; tabChan?.postMessage({ t: 'claim', plot: plotId, tab: TAB_ID }); }
tabChan?.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.t !== 'claim' || m.tab === TAB_ID || !state || m.plot !== plotId || tabPaused) return;
  save().finally(() => {
    tabPaused = true;
    stopLoops();
    showBootError(`${state?.name || 'Your city'} is open in another tab or window, so it’s paused here to keep your saves safe.`);
    $('boot-retry').textContent = 'Play here instead';
  });
});

// ---------- co-mayors and the desk ----------
// In a city with co-mayors, one of them plays (sits at the desk) and the rest watch its saves live. The desk
// frees up when its holder has been idle for DESK_IDLE_MS or their game stops checking in for DESK_STALE_MS.
let coMode = false, desk = null, deskUnsub = null, deskTimer = null, watching = false, watchUnsub = null, lastInput = Date.now(), deskFirst = true;
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true });

// ---------- idle nudge ----------
// After a minute with no input, gently toast the current "next step" so nobody's stuck wondering what to do.
// Its own idle clock: DESK_IDLE_MS above is 2 minutes and hands off the desk, a different job at a different pace.
const NUDGE_IDLE_MS = 60 * 1000, NUDGE_COOLDOWN_MS = 4 * 60 * 1000;
let lastNudgeInput = Date.now(), lastNudge = 0;
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastNudgeInput = Date.now(); }, { passive: true });
function maybeNudge() {
  if (!state || state.status !== 'alive' || tut.active() || modal.open || catalog || drawer) return;
  if (Date.now() - lastNudgeInput < NUDGE_IDLE_MS || Date.now() - lastNudge < NUDGE_COOLDOWN_MS) return;
  if (!lastStep || !lastStep.text) return;
  lastNudge = Date.now();
  notify(lastStep.text, 'act');
}
const shared = () => coMode || (me?.co?.length || 0) > 0;
const deskAt = (d) => d?.at?.toMillis?.() ?? 0;
const deskFree = (d) => !d || d.uid === user?.uid || d.idle || Date.now() - deskAt(d) > DESK_STALE_MS;
const watchNote = () => `${desk?.name || 'Another mayor'} is at the desk. You can take over when they’re idle.`;
function stopDesk() {
  deskUnsub?.(); watchUnsub?.(); deskUnsub = watchUnsub = null;
  clearInterval(deskTimer); deskTimer = null;
  watching = false; desk = null; deskFirst = true;
  $('desk-bar')?.classList.add('hidden');
}
function startDesk() {
  stopDesk();
  if (!shared()) return;
  deskUnsub = fb.listenDesk(plotId, (d) => {
    desk = d;
    // Opening the city: take the desk if it's free, otherwise watch. Later: if someone else took it, watch.
    if (deskFirst) { deskFirst = false; if (deskFree(d)) takeDesk(); else startWatching(); }
    else if (d && d.uid !== user.uid && !watching) startWatching();
    renderDeskBar();
  });
  deskTimer = setInterval(() => {
    if (watching || !state) return;
    if (desk && desk.uid !== user.uid) return;
    fb.takeDesk(plotId, user, mayor.slice(0, 24), Date.now() - lastInput > DESK_IDLE_MS).catch((e) => console.error('Desk', e));
  }, DESK_BEAT_MS);
}
async function takeDesk() {
  await fb.takeDesk(plotId, user, mayor.slice(0, 24)).catch((e) => console.error('Desk', e));
  if (!watching) return;
  // Pick up exactly where the last mayor left off.
  const d = await fb.getPlot(plotId);
  watchUnsub?.(); watchUnsub = null; watching = false;
  if (d?.state) { state = sim.migrate(JSON.parse(d.state)); lastSaved = ''; }
  refreshDerived(); syncMine(); updateHud(); renderDrawer(); startLoops(); renderDeskBar();
  notify('You have the desk. Your changes are saved for everyone.', 'act');
}
function startWatching() {
  watching = true;
  setMode('select'); closeCatalog();
  watchUnsub?.();
  watchUnsub = fb.listenState(plotId, (str) => {
    if (!watching) return;
    try { state = sim.migrate(JSON.parse(str)); } catch { return; }
    refreshDerived(); syncMine(); updateHud(); refreshDrawer(); dirty = true;
  });
  renderDeskBar();
}
function renderDeskBar() {
  const bar = $('desk-bar');
  if (!bar) return;
  if (!shared() || !state) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  if (!watching) { bar.innerHTML = `<span>${icon('i-user')}You’re at the desk${coMode ? ` in ${esc(me?.ownerName || 'your friend')}’s city` : ''}. Co-mayors watch until you’ve been idle for two minutes.</span>`; return; }
  const free = deskFree(desk);
  bar.innerHTML = `<span>${icon('i-look')}Watching: ${esc(desk?.name || 'another mayor')} is at the desk${desk?.idle ? ' (idle)' : ''}.</span>
    <button class="btn small ${free ? 'primary' : ''}" type="button" id="desk-take" ${free ? '' : 'disabled'} title="${free ? 'Start playing' : 'Available once they’ve been idle for two minutes'}">Take the desk</button>`;
  $('desk-take').onclick = () => takeDesk();
}
// Friends (kept in your private profile) and making them co-mayors of the city you're in.
const friends = () => (profile?.friends || []);
function addFriend(uid, name) {
  if (!profile || uid === user.uid || friends().some((f) => f.uid === uid)) return;
  profile.friends = [...friends(), { uid, name: String(name || 'A mayor').slice(0, 24) }].slice(0, 50);
  profileDirty = true; save();
  notify(`${name} is now a friend. Make them a co-mayor in Account, Friends.`, 'good');
}
async function toggleCo(uid) {
  if (coMode) { notify('Only the city’s owner can choose co-mayors.', 'act'); return; }
  const list = me.co || [];
  const next = list.includes(uid) ? list.filter((x) => x !== uid) : [...list, uid];
  if (next.length > MAX_CO) { notify(`A city can have up to ${MAX_CO} co-mayors.`, 'act'); return; }
  await fb.setCoMayors(plotId, next);
  me.co = next;
  startDesk();
  play('goal');
}

// ---------- saving ----------
// One save at a time. A failed save isn't marked as done, so the next attempt sends it again, with a growing
// pause between tries. The player sees a small status next to the clock rather than a stream of warnings.
let saving = null, saveFails = 0, saveError = null, retryTimer = null, pendingExtra = null;
function scheduleSave(ms = 1500) { clearTimeout(saveTimer); saveTimer = setTimeout(save, ms); }
function setSaveState(kind, title) {
  const el = $('savestate');
  if (!el) return;
  el.className = `savestate ${kind}`;
  el.textContent = kind === 'saving' ? 'Saving' : kind === 'fail' ? 'Not saved' : 'Saved';
  el.title = title || (kind === 'fail' ? 'Couldn’t save. Tap to try again.' : 'Your city saves automatically');
}
async function save(extra) {
  if (!state || !plotId || !user || tabPaused || watching) return;
  clearTimeout(saveTimer);
  if (extra) pendingExtra = { ...(pendingExtra || {}), ...extra };
  if (saving) { await saving.catch(() => {}); if (!state || !plotId) return; return save(); }
  lastSave = Date.now();
  const out = plan?.out || {};
  const id = plotId, st = state, ex = pendingExtra;
  const snap = sim.serialize(st) + JSON.stringify(out) + (ex ? JSON.stringify(ex) : '');
  if (!ex && snap === lastSaved) return;
  pendingExtra = null;
  setSaveState('saving');
  saving = (async () => {
    try {
      await fb.savePlot(id, st, { ...(ex || {}), out, ...(profile?.colour && !coMode ? { flag: profile.colour } : {}) });
      if (id === plotId) lastSaved = snap;
      if (saveFails) notify('Saved again. Everything is up to date.', 'act');
      saveFails = 0; saveError = null; clearTimeout(retryTimer);
      setSaveState('ok', fb.usingLegacySaves() ? 'Saved in the older format. Deploy firestore.rules to switch to split saves.' : `Saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch (e) {
      console.error('Save failed', e);
      if (ex) pendingExtra = { ...ex, ...(pendingExtra || {}) };
      saveFails++; saveError = e;
      const why = !navigator.onLine ? 'You’re offline. Your city is safe on this device and saves when you’re back.' : fb.authMessage(e);
      setSaveState('fail', `Not saved: ${why} Tap to try again.`);
      if (saveFails === 1 || saveFails % 10 === 0) notify(`Couldn’t save. ${why}`, 'warn');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => save(), Math.min(120000, 5000 * 2 ** Math.min(5, saveFails - 1)));
    } finally { saving = null; }
    if (profile && profileDirty) { profileDirty = false; fb.saveProfile(user.uid, profile).catch((e) => { console.error('Profile', e); profileDirty = true; }); }
  })();
  return saving;
}
$('savestate').onclick = () => { if (saveError) notify(`Last save failed: ${fb.authMessage(saveError)}`, 'act'); lastSaved = ''; save(); };
window.addEventListener('online', () => { if (state && saveFails) save(); });
window.addEventListener('offline', () => { if (state) setSaveState('fail', 'You’re offline. Your city keeps running here and saves when you reconnect.'); });
// Closing the tab while the last save failed would lose recent building.
window.addEventListener('beforeunload', (e) => { if (state && saveFails) { e.preventDefault(); e.returnValue = ''; } });
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
  chatError = null;
  chatUnsub = fb.listenChat(world.id, (msgs) => {
    const fresh = first ? 0 : msgs.filter((m) => !chatMessages.some((o) => o.id === m.id) && m.uid !== user.uid).length;
    first = false;
    chatMessages = msgs; chatError = null;
    if (drawer === 'chat') refreshDrawer();
    else if (fresh) { chatUnread += fresh; updateHud(); }
  }, (e) => { chatError = e; if (drawer === 'chat') renderDrawer(); });
}
let chatError = null;
const colourOf = (uid) => acct.COLOURS[Math.floor(sim.h32(uid.length * 31 + uid.charCodeAt(0), uid.charCodeAt(uid.length - 1)) * acct.COLOURS.length)];

// ---------- modes and actions ----------
const isMine = (h) => !!h && !!me && h.px === me.px && h.py === me.py;

function setMode(m) {
  if (watching && m !== 'select') { notify(watchNote(), 'act'); return; }
  mode = m;
  brush = null; quickType = null;
  if (m !== 'move') moveFrom = -1;
  closeCatalog();
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', b.dataset.mode === m);
  canvas.dataset.tool = m;
  renderModebar();
  if (cursor) hover = hoverInfo(cursor);
  dirty = true;
}
function setBrush(b) {
  if (b === 'zone' && brush === 'zone') { zoneKind = (zoneKind + 1) % 4; renderModebar(); announce(zoneKind ? ZONES[zoneKind].name : 'Unzone'); return; }
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
    html = `${[[T.ROAD, 'road', 'i-road'], [T.PATH, 'path', 'i-path'], [T.RAIL, 'rail', 'i-rail'], [T.LIGHTS, 'lights', 'i-lights'], [T.ROUNDABOUT, 'roundabout', 'i-round'], ['zone', 'zone', 'i-grid'], ['clear', 'clear', 'i-clear']].map(([t, key, ic]) => {
      const label = t === 'clear' ? 'Clear' : t === 'zone' ? (zoneKind ? ['', 'Homes', 'Shops', 'Industry'][zoneKind] : 'Unzone') : t === T.LIGHTS ? 'Lights' : B[t].name;
      const cost = t === 'clear' ? '' : t === 'zone' ? (zoneKind ? `$${ZONE_COST} a tile` : 'free') : `$${B[t].cost}`;
      return `<button type="button" class="brush ${key === 'zone' ? `zone-${zoneKind}` : ''}" data-brush="${key}" aria-pressed="${brush === key}" title="${t === 'clear' ? 'Demolish by dragging' : t === 'zone' ? 'Paint zones: developers build when there’s demand. Tap again to switch between homes, shops, industry and unzone.' : esc(B[t].blurb)}">${icon(ic)}<span>${label}</span><small class="num">${cost}</small></button>`;
    }).join('')}${recent().length ? `<span class="hotbar" aria-label="Recent buildings">${recent().map((t) => `<button type="button" class="brush quick" data-quick="${t}" aria-pressed="${quickType === t}" title="${esc(B[t].name)}: tap, then tap empty land"><canvas class="thumb" data-type="${t}" width="44" height="36" aria-hidden="true"></canvas><small class="num">$${B[t].cost}</small></button>`).join('')}</span>` : ''}<p class="mhint">${quickType != null ? `Tap empty land to build a ${esc(B[quickType].name.toLowerCase())}. Tap it again to stop.` : brush ? 'Drag to paint. Tap the brush again to stop.' : `Tap empty land to choose a building. Land parcels cost <b class="num">${money(sim.landPrice(state))}</b>.`}</p>`;
  } else if (mode === 'move') {
    html = moveFrom >= 0
      ? `<p class="mhint">Moving the <b>${B[state.grid[moveFrom]].name.toLowerCase()}</b>. Tap an empty tile you own. Costs <b class="num">$${Math.round(B[state.grid[moveFrom]].cost * MOVE_FEE)}</b>.</p><button class="btn" type="button" id="move-cancel">Cancel</button>`
      : '<p class="mhint">Tap one of your buildings to pick it up. Residents, staff and pupils move with it.</p>';
  } else html = '<p class="mhint">Tap anything to see it.</p>';
  bar.innerHTML = html;
  bar.querySelectorAll('[data-brush]').forEach((b) => { b.onclick = () => { quickType = null; setBrush(b.dataset.brush); }; });
  bar.querySelectorAll('[data-quick]').forEach((b) => { b.onclick = () => { const t = +b.dataset.quick; quickType = quickType === t ? null : t; brush = null; renderModebar(); }; });
  for (const c of bar.querySelectorAll('canvas.thumb')) thumbnail(c, +c.dataset.type, palette(prefs), resolvedTheme(prefs));
  $('move-cancel')?.addEventListener('click', () => { moveFrom = -1; renderModebar(); dirty = true; });
  $('tool-tip').textContent = '';
  tut.refresh();
}

// Undo: a snapshot before each change. Restoring keeps the clock, news and history moving forward.
const UNDO_MS = 5 * 60000, UNDO_STEPS = 40;
function checkpoint(label) {
  undoStack.push({ label, at: Date.now(), snap: sim.serialize(state) });
  if (undoStack.length > UNDO_STEPS) undoStack.shift();
}
const BRUSH_TYPE = { road: T.ROAD, path: T.PATH, rail: T.RAIL, lights: T.LIGHTS, roundabout: T.ROUNDABOUT };
function placeAt(i, type, quiet) {
  const { x, y } = sim.xy(i);
  const snap = sim.serialize(state);
  const r = sim.place(state, i, type);
  if (r.ok) {
    play('place');
    if (!quiet || !undoStack.length || Date.now() - undoStack.at(-1).at > 1500) undoStack.push({ label: B[type].name, at: Date.now(), snap });
    if (undoStack.length > UNDO_STEPS) undoStack.shift();
    if (!BRUSHES.includes(type)) addPop(x, y, 0.8, `−$${r.cost}`, '#ffffff');
    announce(`${B[type].name} placed at ${x + 1}, ${y + 1}. ${money(state.money)} left.`);
    afterChange();
  } else if (!quiet || r.reason.startsWith('Needs')) { notify(r.reason, 'act'); play('error'); }
  return r.ok;
}
function demolish(i, quiet) {
  if (quiet && state.grid[i] === T.EMPTY) return false;
  const { x, y } = sim.xy(i);
  const snap = sim.serialize(state);
  const r = sim.bulldoze(state, i);
  if (r.ok && (!quiet || !undoStack.length || Date.now() - undoStack.at(-1).at > 1500)) { undoStack.push({ label: 'demolition', at: Date.now(), snap }); if (undoStack.length > UNDO_STEPS) undoStack.shift(); }
  if (r.ok) { play('clear'); if (r.refund) addPop(x, y, 0.6, `${r.refund > 0 ? '+' : ''}${money(r.refund)}`, r.refund > 0 ? '#ffd24a' : '#ffffff'); afterChange(); }
  else if (!quiet) { notify(r.reason, 'act'); play('error'); }
  return r.ok;
}
function upgradeAt(i) {
  const { x, y } = sim.xy(i);
  if (sim.canUpgrade(state, i).ok) checkpoint('upgrade');
  const r = sim.upgrade(state, i);
  if (r.ok) { play('place'); addPop(x, y, 1.2, `−$${r.cost}`, '#ffffff'); announce(`Upgrading for ${money(r.cost)}.`); afterChange(); }
  else { notify(r.reason, 'act'); play('error'); }
}
function buyChunk(c) {
  if (sim.canBuyLand(state, c).ok) checkpoint('land purchase');
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
  if (sim.canMove(state, moveFrom, to).ok) checkpoint('move');
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

// Anything costing over half your money (and at least $500) asks first.
function confirmCost(t, go) {
  const cost = sim.buildPrice(state, catalog?.tile ?? -1, t).money;
  if (cost < 500 || cost < state.money * 0.5) { go(); return; }
  openModal(`${closeX}<h2 id="modal-title">Spend ${money(cost)} on a ${esc(B[t].name.toLowerCase())}?</h2>
    <p>That’s ${pct(cost / Math.max(1, state.money))} of your money. Upkeep is ${money(Math.ceil(B[t].upkeep))} a day once it opens.</p>
    <div class="mfoot"><button class="btn" data-close>Not now</button><button class="btn primary" id="cost-go">Build it</button></div>`);
  $('cost-go').onclick = () => { closeModal(); go(); };
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
    if (t === T.EMPTY && quickType != null) { confirmCost(quickType, () => { if (placeAt(h.i, quickType)) remember(quickType); }); return; }
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
    else if (sim.harvestReady(state, h.i)) collect(h.i);
    select(h);
  }
}
// Collect a building's harvest: a bonus on top of what it makes anyway.
function collect(i) {
  const r = sim.harvest(state, i);
  if (!r.ok) return;
  const { x, y } = sim.xy(i);
  const text = Object.entries(r.got).map(([k, n]) => `+${n} ${RES[k].name.toLowerCase()}`).join(', ');
  addPop(x, y, 1.2, text, '#2f9e5a');
  play('coin');
  announce(`Collected ${text}.`);
  afterChange();
}

function undo() {
  if (watching) { notify(watchNote(), 'act'); return; }
  const last = undoStack.pop();
  if (!last || Date.now() - last.at > UNDO_MS) { undoStack.length = 0; notify('Nothing to undo. You can undo changes from the last five minutes.', 'act'); return; }
  const keep = { hour: state.hour, day: state.day, lastTick: state.lastTick, log: state.log, history: state.history, stats: state.stats, links: state.links, railLinks: state.railLinks, busLinks: state.busLinks };
  const back = sim.migrate(JSON.parse(last.snap));
  for (const k of Object.keys(state)) if (!k.startsWith('_')) delete state[k];
  Object.assign(state, back, keep);
  state._plan = null;
  play('clear');
  notify(`Undid the ${last.label.toLowerCase()}.`, 'act');
  afterChange();
}

function hoverInfo(h) {
  if (!isMine(h)) return null;
  const out = { ...h, tool: mode };
  const t = state.grid[h.i];
  if (mode === 'build') {
    if (!sim.owns(state, h.i)) { out.ok = false; out.sale = true; }
    else if (brush === 'clear') { out.ok = t !== T.EMPTY && t !== T.HALL; out.tool = 'bulldoze'; }
    else if (brush === 'zone') out.ok = sim.canZone(state, h.i, zoneKind).ok;
    else if (brush) { const type = BRUSH_TYPE[brush]; out.ok = sim.canPlace(state, h.i, type).ok; out.ghost = type < T.LIGHTS ? type : undefined; }
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
  // Dusk and dawn each take an hour either side of DUSK and DAWN, so it's properly dark for 8 of the 24 hours.
  if (h >= DUSK + 0.5 || h < DAWN - 0.5) return 1;
  if (h >= DUSK - 0.5) return h - (DUSK - 0.5);
  if (h < DAWN + 0.5) return 1 - (h - (DAWN - 0.5));
  return 0;
}

// ---------- build catalogue ----------
let quickType = null;
const recent = () => { try { return JSON.parse(localStorage.getItem('commons-recent') || '[]').filter((t) => B[t]?.cat); } catch { return []; } };
function remember(t) { const r = [t, ...recent().filter((x) => x !== t)].slice(0, 6); try { localStorage.setItem('commons-recent', JSON.stringify(r)); } catch { /* ignore */ } }
function openCatalog(i) { catalog = { tile: i }; renderCatalog(); play('tap'); }
function closeCatalog() { if (!catalog) return; catalog = null; previewType = null; $('catalog').classList.add('hidden'); dirty = true; }
function renderCatalog() {
  const box = $('catalog');
  if (!catalog) return;
  const scroll = box.querySelector('.cat-grid')?.scrollTop || 0;
  const focused = document.activeElement?.id, caret = document.activeElement?.selectionStart;
  box.innerHTML = panels.catalogHtml({ s: state, tile: catalog.tile, cat: catCat, q: catQ, afford: catAfford, avail: (t) => sim.availability(state, t) });
  $('cat-q').oninput = (e) => { catQ = e.target.value; renderCatalog(); };
  $('cat-afford').onchange = (e) => { catAfford = e.target.checked; renderCatalog(); };
  if (focused === 'cat-q') { $('cat-q').focus(); $('cat-q').setSelectionRange(caret, caret); }
  box.classList.remove('hidden');
  if (box.querySelector('.cat-grid')) box.querySelector('.cat-grid').scrollTop = scroll;
  for (const c of box.querySelectorAll('canvas.thumb')) thumbnail(c, +c.dataset.type, palette(prefs), resolvedTheme(prefs));
  box.querySelector('[data-cat-close]').onclick = closeCatalog;
  box.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { catCat = b.dataset.cat; renderCatalog(); }; });
  box.querySelectorAll('[data-build]').forEach((b) => {
    b.onmouseenter = b.onfocus = () => { previewType = +b.dataset.build; dirty = true; };
    b.onmouseleave = () => { previewType = null; dirty = true; };
    b.onclick = () => {
      const t = +b.dataset.build, a = sim.availability(state, t);
      if (!a.ok) { notify(`${B[t].name}: ${a.reason}.`, 'act'); play('error'); return; }
      const tile = catalog.tile;
      closeCatalog();
      confirmCost(t, () => { if (placeAt(tile, t)) remember(t); });
    };
  });
  if (!box.contains(document.activeElement)) $('cat-q').focus({ preventScroll: true });
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
  else if (brush === 'zone') {
    const r = sim.zone(state, h.i, zoneKind);
    if (r.ok) { dirty = true; scheduleSave(); if (!quiet) play('tap'); }
    else if (!quiet) notify(r.reason, 'act');
  }
  else placeAt(h.i, BRUSH_TYPE[brush], quiet);
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
  // The ground tile under the pointer, the same one the hover outline shows (not a tall building drawn over it).
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
  else {
    // Arrow keys can step over the border onto a plot next to yours (a neighbour, or land you could buy), but no further.
    let { px, py, tx, ty } = cursor;
    tx += dx; ty += dy;
    if (tx < 0) { px--; tx = PLOT - 1; } else if (tx >= PLOT) { px++; tx = 0; }
    if (ty < 0) { py--; ty = PLOT - 1; } else if (ty >= PLOT) { py++; ty = 0; }
    if (Math.abs(px - me.px) + Math.abs(py - me.py) > 1) return;
    Object.assign(cursor, { px, py, tx, ty });
  }
  cursor.i = cursor.ty * PLOT + cursor.tx;
  const wx = cursor.px * STRIDE + cursor.tx + 0.5, wy = cursor.py * STRIDE + cursor.ty + 0.5;
  const [sx, sy] = renderer.project(wx, wy);
  if (sx < renderer.w * 0.2 || sx > renderer.w * 0.8 || sy < renderer.h * 0.2 || sy > renderer.h * 0.72) renderer.centerOn(wx, wy);
  hover = hoverInfo(cursor);
  const there = plotAt(cursor.px, cursor.py);
  announce(isMine(cursor) ? describeTile(cursor.i) : there ? `${there.name}, ${there.ownerName}'s city` : 'Unclaimed land. Press Enter for details.');
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
  if (mode === 'build' && ['1', '2', '3', '4', '5', '6', '7'].includes(k)) { setBrush(['road', 'path', 'rail', 'lights', 'roundabout', 'zone', 'clear'][+k - 1]); return; }
  const bound = Object.entries(KEY_ACTIONS).find(([id]) => keyFor(id) === lk);
  if (bound) { e.preventDefault(); bound[1].run(); return; }
  const actions = {
    escape: () => { if (document.body.classList.contains('photo')) { togglePhoto(); return; } if (trips.followed) stopFollow(); if (brush) setBrush(brush); else if (moveFrom >= 0) { moveFrom = -1; renderModebar(); } else closeDrawer(); cursor = null; hover = null; },
  };
  if (actions[lk]) { e.preventDefault(); actions[lk](); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });

// Keys players can change in Settings. Movement (arrows, WASD), zoom, brushes 1–7 and Escape stay fixed.
const KEY_ACTIONS = {
  build: { key: 'b', label: 'Build mode', run: () => setMode('build') },
  select: { key: 'e', label: 'Select mode', run: () => setMode('select') },
  move: { key: 'r', label: 'Move mode', run: () => setMode('move') },
  goals: { key: 'o', label: 'Goals', run: () => openPanel('goals') },
  people: { key: 'p', label: 'People', run: () => openPanel('people') },
  stats: { key: 'c', label: 'City stats', run: () => openPanel('stats') },
  news: { key: 'n', label: 'News', run: () => openPanel('news') },
  chat: { key: 'k', label: 'Chat', run: () => openPanel('chat') },
  world: { key: 'j', label: 'World', run: () => openPanel('world') },
  region: { key: 'y', label: 'Region', run: () => openPanel('region') },
  market: { key: 'x', label: 'Market', run: () => openPanel('market') },
  views: { key: 't', label: 'Info views', run: () => toggleTraffic() },
  home: { key: 'h', label: 'Go home', run: () => fitHome() },
  whole: { key: '0', label: 'Whole map', run: () => fitWorld() },
  grid: { key: 'g', label: 'Tile grid', run: () => setPref('grid', !prefs.grid) },
  sound: { key: 'm', label: 'Sound on or off', run: () => { setPref('sound', !prefs.sound); notify(prefs.sound ? 'Sound on' : 'Sound off', 'act'); } },
  photo: { key: 'f', label: 'Photo mode', run: () => togglePhoto() },
  board: { key: 'l', label: 'Leaderboards', run: () => showBoard() },
  settings: { key: ',', label: 'Settings', run: () => showSettings() },
  help: { key: '?', label: 'Help', run: () => showHelp() },
  hideui: { key: 'u', label: 'Hide or show the interface', run: () => toggleUi() },
};
const FIXED_KEYS = new Set(['w', 'a', 's', 'd', '1', '2', '3', '4', '5', '6', '7', '+', '=', '-', '_', ' ', 'escape', 'enter', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const keyFor = (id) => (prefs.keys?.[id] ?? KEY_ACTIONS[id].key);
const keyName = (k) => ({ ',': 'Comma', ' ': 'Space', '?': '?' }[k] || k.toUpperCase());

// ---------- frame ----------
function visiblePlotIds() {
  const detailed = renderer.cam.z >= 7;
  if (!detailed) return [];
  const bd = renderer.bounds(), out = [];
  for (const p of plots.values()) {
    if (p.px * STRIDE < bd.x1 && (p.px + 1) * STRIDE > bd.x0 && p.py * STRIDE < bd.y1 && (p.py + 1) * STRIDE > bd.y0) {
      if (!p.st && !p.mine && Math.abs(p.px - me.px) + Math.abs(p.py - me.py) === 1) fetchState(p);
      if (p.st && !trips.has(p.id) && p.status === 'alive') trips.set(p.id, p.st);
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
    for (const tr of worldTrains) {
      if (tr.wait > 0) tr.wait -= dt;
      else {
        tr.s += dt * 3 * tr.dir;
        if (tr.s >= tr.path.length - 1) { tr.s = tr.path.length - 1.001; tr.dir = -1; tr.wait = 1.5; }
        if (tr.s <= 0) { tr.s = 0; tr.dir = 1; tr.wait = 1.5; }
      }
      const k = Math.floor(tr.s), f = tr.s - k, a = tr.path[k], b = tr.path[Math.min(k + 1, tr.path.length - 1)];
      tr.lx = a[0] + (b[0] - a[0]) * f; tr.ly = a[1] + (b[1] - a[1]) * f;
      if (b[0] !== a[0] || b[1] !== a[1]) { tr.dx = (b[0] - a[0]) * tr.dir; tr.dy = (b[1] - a[1]) * tr.dir; }
    }
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
    const wx = sim.weather(sim.worldDay());
    if (dirty || worldTrains.length || agentsByPlot.size || pops.length || pulseTile || pulseTileMove || wx === 'rain' || wx === 'snow') {
      renderer.draw({
        plots, wild: wildPlots(), free: freePlots(), ready: readyTiles(), hover: hv, cursor, selected, overlay, traffic: plan, worldTrains, info: infoTiles(), agentsByPlot, pops, prefs, bridges, pulseTile: pulseTile || pulseTileMove,
        showLand: mode === 'build', landPrice: state ? sim.landPrice(state) : 0, season: sim.season(sim.worldDay()), weather: sim.weather(sim.worldDay()),
        ...styleScene(), shapes: prefs.shapes, nightAmt: nightAmt(),
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
  renderer.cam.z = Math.max(9, Math.min(44, Math.min(w * 0.92 / (2 * span), h * 0.95 / (span + 2))));
  renderer.cam.x += 0.6; renderer.cam.y += 0.6;
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
  renderer.cam.z = Math.max(1.6, Math.min(8, Math.min(renderer.w / (2 * span), renderer.h / span) * 0.9));
  dirty = true;
}
function goTo(px, py, tx = PLOT / 2, ty = PLOT / 2, z = 12) {
  followCam = false;
  renderer.centerOn(px * STRIDE + tx + 0.5, py * STRIDE + ty + 0.5);
  if (renderer.cam.z < z) renderer.cam.z = z;
  dirty = true;
}
// Info views, like Cities: Skylines: colour the map by traffic, mood, service coverage or noise.
const VIEWS = [['traffic', 'Traffic', 'Green roads flow, red roads are jammed.'], ['mood', 'Mood', 'Homes coloured by how happy their residents are.'],
  ['services', 'Services', 'Brighter green means more services reach that spot: police, fire, health, schools and transport.'],
  ['noise', 'Noise', 'Purple tiles are within earshot of a factory. Homes there are less happy.'],
  ['value', 'Land value', 'Gold is sought-after land: parks, services and transit raise it, noise lowers it. Families without schooling struggle with the rent there.']];
let infoCache = null, infoKey = '';
// While placing something with a reach (police, fire, power, water, stops), show the tiles it would cover.
let previewType = null;
function coverage() {
  const t = mode === 'build' ? (catalog && previewType != null ? previewType : quickType) : null;
  const at = catalog ? catalog.tile : hover && isMine(hover) ? hover.i : -1;
  const d = t != null && B[t];
  const r = d && (d.radius || d.supply || d.catchment || (d.pollution ? (d.pollution >= 2 ? 3 : 1) : 0));
  if (!r || at < 0) return null;
  const out = new Map(), ax = at % PLOT, ay = (at / PLOT) | 0;
  const col = d.pollution && !d.radius && !d.supply ? 'rgba(138,91,214,0.35)' : 'rgba(59,125,221,0.28)';
  for (let y = Math.max(0, ay - r); y <= Math.min(PLOT - 1, ay + r); y++) for (let x = Math.max(0, ax - r); x <= Math.min(PLOT - 1, ax + r); x++) if (Math.abs(x - ax) + Math.abs(y - ay) <= r) out.set(y * PLOT + x, col);
  return out;
}
function infoTiles() {
  const cov = coverage();
  if (cov) return cov;
  if (!state || !overlay || overlay === 'traffic') return null;
  const key = `${overlay}|${state.day}|${state.hour}|${me.version}`;
  if (key === infoKey) return infoCache;
  const out = new Map(), N = PLOT * PLOT, d1 = (a, b) => Math.abs(a % PLOT - b % PLOT) + Math.abs(Math.floor(a / PLOT) - Math.floor(b / PLOT));
  if (overlay === 'value') {
    const v = plan?.value;
    if (v) for (let i = 0; i < N; i++) if (sim.owns(state, i)) out.set(i, `rgba(${Math.round(120 + v[i] * 120)},${Math.round(90 + v[i] * 90)},${Math.round(160 - v[i] * 130)},${0.18 + v[i] * 0.4})`);
  } else if (overlay === 'mood') {
    const by = new Map();
    for (const p of state.people) { const a = by.get(p.h) || [0, 0]; a[0] += p.m; a[1]++; by.set(p.h, a); }
    for (const [h, [sum, n]] of by) { const m = sum / n; out.set(h, `rgba(${Math.round(230 - m * 190)},${Math.round(70 + m * 150)},70,0.55)`); }
  } else {
    const src = [];
    for (let i = 0; i < N; i++) {
      const t = state.grid[i], d = B[t];
      if (!d || state.cond[i] <= 0) continue;
      if (overlay === 'noise' && d.pollution) src.push([i, d.pollution]);
      if (overlay === 'services') {
        if (d.radius) src.push([i, d.radius]);
        else if (d.care || d.school) src.push([i, 8]);
        else if (d.catchment) src.push([i, d.catchment]);
      }
    }
    for (let i = 0; i < N; i++) {
      if (!sim.owns(state, i)) continue;
      const n = src.filter(([j, r]) => d1(i, j) <= r).length;
      if (!n) continue;
      out.set(i, overlay === 'noise' ? `rgba(138,91,214,${Math.min(0.5, 0.25 * n)})` : `rgba(47,158,90,${Math.min(0.55, 0.1 * n)})`);
    }
  }
  infoKey = key; infoCache = out;
  return out;
}
function setView(v) {
  overlay = overlay === v ? null : v;
  play(overlay ? `view-${overlay}` : 'view-off');
  $('btn-traffic').setAttribute('aria-pressed', !!overlay);
  const info = VIEWS.find((x) => x[0] === overlay);
  announce(info ? `${info[1]} view. ${info[2]}` : 'Info view off.');
  if (info) notify(`${info[1]}: ${info[2]}`, 'act');
  $('views')?.remove();
  dirty = true;
}
function showViews() {
  if ($('views')) { $('views').remove(); return; }
  const m = document.createElement('div');
  m.id = 'views'; m.className = 'views plate'; m.setAttribute('role', 'menu');
  m.innerHTML = VIEWS.map(([k, l]) => `<button type="button" role="menuitemradio" aria-checked="${overlay === k}" data-view="${k}">${l}</button>`).join('') + (overlay ? '<button type="button" role="menuitem" data-view="">Turn off</button>' : '');
  document.body.appendChild(m);
  const r = $('btn-traffic').getBoundingClientRect();
  m.style.top = `${r.bottom + 8}px`; m.style.right = `${innerWidth - r.right}px`;
  m.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => (b.dataset.view ? setView(b.dataset.view) : setView(overlay)); });
  m.querySelector('button').focus();
}
function toggleTraffic() { setView(overlay ? overlay : 'traffic'); }
$('btn-traffic').onclick = showViews;
$('btn-home').onclick = fitHome;
$('btn-world').onclick = fitWorld;
$('btn-board').onclick = showBoard;
$('btn-settings').onclick = showSettings;
$('btn-account').onclick = () => showAccount();
$('btn-help').onclick = showHelp;
// Hide everything but the map (and a button to bring it back).
function toggleUi() { setPref('uiMin', !prefs.uiMin); if (prefs.uiMin) closeDrawer(); announce(prefs.uiMin ? 'Interface hidden. Press U to show it.' : 'Interface shown.'); }
$('btn-min').onclick = toggleUi;
$('ui-restore').onclick = toggleUi;
$('btn-undo').onclick = undo;
// Right-click or long-press the undo button for the list of recent changes.
$('btn-undo').oncontextmenu = (e) => { e.preventDefault(); showUndoList(); };
function showUndoList() {
  const list = undoStack.filter((u) => Date.now() - u.at <= UNDO_MS).map((u, k) => ({ ...u, k })).reverse();
  openModal(`${closeX}<h2 id="modal-title">Undo history</h2>
    ${list.length ? `<p class="soft small">Pick a change to go back to just before it. Everything after it is undone too.</p><ul class="undo-list">${list.map((u) => `<li><span>${esc(u.label)} <small class="soft">${Math.max(1, Math.round((Date.now() - u.at) / 1000))}s ago</small></span><button class="btn" type="button" data-undo-to="${u.k}">Undo to here</button></li>`).join('')}</ul>`
      : '<p>Nothing to undo from the last five minutes.</p>'}`);
  modal.querySelectorAll('[data-undo-to]').forEach((b) => { b.onclick = () => { const k = +b.dataset.undoTo; while (undoStack.length > k + 1) undoStack.pop(); closeModal(); undo(); }; });
}
$('city-name').onclick = showRename;
$('rail').onclick = (e) => { const b = e.target.closest('[data-panel]'); if (b) openPanel(b.dataset.panel); };
function citySummary() {
  const c = sim.census(state), needs = plan?.needs || {};
  const worst = NEEDS.map((n) => [n, needs[n.k] ?? 1]).sort((a, b) => a[1] - b[1])[0];
  const net = (state.stats.income || 0) - (state.stats.upkeep || 0);
  return `${state.name}, day ${state.day}, ${hourLabel(state.hour)}. ${c.total} people, ${c.employed} working, ${c.seeking} looking for work. Mood ${pct(state.happiness)}. ${money(state.money)}, ${net >= 0 ? 'earning' : 'losing'} ${money(Math.abs(net))} a day. ${worst && worst[1] < 0.7 ? `Biggest need: ${worst[0].label.toLowerCase()}.` : 'No urgent needs.'} ${sim.season(sim.worldDay())}, ${sim.weather(sim.worldDay())}.`;
}
$('btn-summary').onclick = () => { const t = citySummary(); announce(t); notify(t, 'act'); if (prefs.speak && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(t)); };
$('pulse-toggle').onclick = () => {
  const open = $('pulse-toggle').getAttribute('aria-expanded') !== 'true';
  $('pulse-toggle').setAttribute('aria-expanded', open);
  $('pulse').classList.toggle('closed', !open);
};
function togglePhoto() {
  const on = document.body.classList.toggle('photo');
  $('photo-bar').classList.toggle('hidden', !on);
  if (on) { closeDrawer(); closeCatalog(); announce('Photo mode. Press F or Escape to leave.'); }
  renderer.resize(); dirty = true;
}
$('photo-save').onclick = async () => {
  const name = `${state.name.replace(/[^\w ]/g, '')} day ${state.day}.png`;
  if (navigator.canShare && matchMedia('(pointer: coarse)').matches) {
    try {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: state.name, text: `${state.name} on Commons, day ${state.day}` }); play('coin'); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.download = `${state.name.replace(/[^\w ]/g, '')} day ${state.day}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  play('coin');
};
$('photo-exit').onclick = togglePhoto;
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
  $('city-name').dataset.era = t(HALL_LEVELS[sim.hallLevel(state)].name);   // the city's size is its town hall's level
  $('clock').textContent = `${hourLabel(state.hour)}, ${dateLabel()}`;
  $('clock').title = `Forecast: ${[1, 2, 3].map((k) => `${k === 1 ? 'tomorrow' : `in ${k} days`} ${sim.weather(sim.worldDay() + k)}`).join(', ')}`;
  $('city-name').title = state.status === 'ruins' ? `Fell after ${state.day} days` : `${state.name} has been running for ${state.day} day${state.day === 1 ? '' : 's'}. Click to rename.`;
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
  const rows = [...NEEDS];
  if (state.flags.utilSince !== undefined) {
    const u = state._util || sim.utilities(state), all = state.grid.filter((t) => B[t]?.cat).length || 1;
    needs.utilities = Math.min(u.power.size, u.water.size) / all;
    rows.push({ k: 'utilities', icon: 'i-spark', label: 'Power and water', fix: 'Build power stations and water towers so every building is covered.' });
  }
  $('needs').innerHTML = rows.map((n) => `<li title="${esc(n.fix)}">${icon(n.icon)}<span class="nlabel">${n.label}</span>${bar(n.label, needs[n.k] ?? 1)}</li>`).join('');
  const worst = NEEDS.map((n) => [n, needs[n.k] ?? 1]).sort((a, b) => a[1] - b[1])[0];
  const dem = sim.demand(state, plan);
  $('demand').innerHTML = [['homes', 'Homes'], ['jobs', 'Jobs'], ['shops', 'Shops'], ['services', 'Services']].map(([k, l]) =>
    `<div class="dcol" title="${l}: ${dem[k] > 0.2 ? 'needed' : dem[k] < -0.2 ? 'more than enough' : 'about right'}"><span class="dbar"><i style="${dem[k] >= 0 ? `bottom:50%;height:${dem[k] * 50}%` : `top:50%;height:${-dem[k] * 50}%`}" class="${dem[k] >= 0 ? 'up' : 'down'}"></i></span><small>${l}</small></div>`).join('');
  const tips = state.status === 'ruins' ? [] : [...sim.advice(state, plan), ...localTips()].sort((a, b) => b.score - a.score).slice(0, 3);
  const tip = tips[0];
  const step = state.status === 'ruins' ? null : nextStep(tips);
  lastStep = step;   // cached so the idle nudge (below) can reuse it rather than recomputing advice
  $('hint').innerHTML = state.status === 'ruins' ? 'This city has fallen. Rebuild on the ruins to start again.'
    : `<span class="step-label">${step.urgent ? 'Needs attention' : 'Next step'}</span>${esc(step.text)}${step.go ? ` <button type="button" class="linkbtn" id="tip-go">Show me</button>` : ''}`;
  $('tip-go')?.addEventListener('click', () => step.go());
  // Same step/tips values as above, echoed in a banner at the top of the screen so the objective is always visible.
  const obj = $('objective');
  obj.classList.toggle('urgent', state.status === 'ruins' || !!step?.urgent);
  obj.title = state.status === 'ruins' ? '' : step.text;
  obj.innerHTML = state.status === 'ruins' ? `<span class="obj-icon">${icon('i-alert')}</span><span class="obj-body"><b class="obj-text">This city has fallen. Rebuild on the ruins to start again.</b></span>`
    : `<span class="obj-icon">${icon(step.urgent ? 'i-alert' : 'i-flag')}</span><span class="obj-body"><small class="obj-label">${step.urgent ? 'Needs attention' : 'Next step'}</small><b class="obj-text">${esc(step.text)}</b></span>${step.go ? `<button type="button" class="btn small" id="obj-go">Show me</button>` : ''}`;
  $('obj-go')?.addEventListener('click', () => step.go());
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
  renderResbar();
  for (const f of ['market', 'region']) document.querySelector(`#rail [data-panel="${f}"]`)?.classList.toggle('locked', !isOpen(f));
  const unreadAll = chatUnread + dmUnread();
  $('chat-dot').textContent = unreadAll ? String(Math.min(9, unreadAll)) : '';
  $('chat-dot').classList.toggle('hidden', !unreadAll);
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
  if ((m === 'market' || m === 'region') && !isOpen(m)) { showLocked(m); return; }
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
  lastLikes = null; likeCache = '';
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
// Timed refreshes (a new hour, a neighbour saving) wait while the player is typing in, or dragging on, the drawer.
let drawerPress = false;
$('drawer').addEventListener('pointerdown', () => { drawerPress = true; });
window.addEventListener('pointerup', () => { drawerPress = false; });
window.addEventListener('pointercancel', () => { drawerPress = false; });
function drawerBusy() {
  const a = document.activeElement, box = $('drawer');
  return drawerPress || (!!a && box.contains(a) && a.matches('input:not([type=checkbox]):not([type=button]), textarea, select') && a.id !== 'people-q' && a.id !== 'chat-text');
}
function refreshDrawer() { if (!drawerBusy()) renderDrawer(); }
function renderDrawer() {
  const box = $('drawer');
  for (const b of document.querySelectorAll('#rail [data-panel]')) b.setAttribute('aria-pressed', b.dataset.panel === drawer);
  if (!drawer || !state) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const scroll = box.scrollTop;
  // Keep what the player typed and any form message across the redraw (the chat draft has its own store).
  const kept = [...box.querySelectorAll('input[id]:not([type=checkbox]):not([type=range]), textarea[id]')].map((el) => [el.id, el.value]);
  const msgs = [...box.querySelectorAll('.formmsg[id]')].map((el) => [el.id, el.textContent, el.classList.contains('ok')]);
  const active = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active && (active.id || active.dataset.do || active.dataset.person || active.dataset.filter);
  const caret = active?.selectionStart;
  let html = '';
  if (drawer === 'inspect') html = inspectorHtml();
  else if (drawer === 'person') {
    const p = state.people.find((x) => x.i === personId);
    if (!p) { drawer = 'people'; return renderDrawer(); }
    const agent = trips.agents(plotId).find((a) => a.p === p.i);
    html = panels.personCard(state, plan, p, whereabouts(state, plan, p, clockNow(), agent), favs().has(p.i));
  } else if (drawer === 'goals') html = panels.goalsPanel(state, state.status === 'alive' ? daily() : null, sim.hallState(state, pathCtx()), state.status === 'alive' ? sim.advice(state, plan).slice(0, 4) : []);
  else if (drawer === 'people') html = panels.peoplePanel(state, plan, peopleFilter, peopleQuery, favs());
  else if (drawer === 'stats') html = panels.statsPanel({ state, totals: totalsNow || sim.totals(state), plan, census: sim.census(state) }, statsTab);
  else if (drawer === 'news') html = panels.newsPanel(state, unseenFrom(), { tab: newsTab, inbox: [...inbox].reverse(), plan, forecast: [1, 2, 3].map((k) => sim.weather(sim.worldDay() + k)) });
  else if (drawer === 'chat') { const m = muted(); html = panels.chatPanel({ messages: chatMessages.filter((x) => !m.has(x.uid)).map((x) => ({ ...x, text: clean(x.text) })), me: user.uid, world, colourOf, error: chatError && fb.authMessage(chatError), dmUnread: dmUnread() }); }
  else if (drawer === 'world') html = panels.worldPanel(worldCtx());
  else if (drawer === 'region') html = panels.regionPanel(regionCtx());
  else if (drawer === 'market') html = panels.marketPanel(marketCtx());
  else if (drawer === 'dm') html = panels.dmPanel({ threads, withWho: dmWith, messages: dmMessages.map((m) => ({ ...m, text: clean(m.text) })), me: user.uid });
  box.innerHTML = html;
  box.classList.remove('hidden');
  box.dataset.mode = drawer;
  box.classList.toggle('max', drawerMax);
  const maxLabel = drawerMax ? 'Make the panel smaller' : 'Make the panel bigger';
  const maxBtn = `<button class="iconbtn maxbtn" type="button" data-max-drawer aria-pressed="${drawerMax}" title="${maxLabel}" aria-label="${maxLabel}">${icon('i-full')}</button>`;
  // Beside the close button: inside the panel's header when it has one, otherwise in the corner.
  const headClose = box.querySelector('.phead [data-close-drawer]');
  if (headClose) headClose.insertAdjacentHTML('beforebegin', maxBtn.replace('maxbtn', 'maxbtn inline'));
  else box.insertAdjacentHTML('afterbegin', maxBtn);
  box.querySelector('[data-max-drawer]').onclick = () => { drawerMax = !drawerMax; renderDrawer(); };
  for (const [id, v] of kept) { const el = box.querySelector(`#${CSS.escape(id)}`); if (el && id !== 'chat-text' && id !== 'people-q' && v) el.value = v; }
  for (const [id, t, ok] of msgs) { const el = box.querySelector(`#${CSS.escape(id)}`); if (el && t) { el.textContent = t; el.classList.toggle('ok', ok); } }
  wireDrawer(box);
  box.scrollTop = scroll;
  if (drawer === 'chat') { $('chat-text').value = chatDraft; const l = $('chat-list'); l.scrollTop = l.scrollHeight; }
  const lk = $('likes');
  if (lk && lk.dataset.plot !== lastLikes) { lastLikes = lk.dataset.plot; loadLikes(lk.dataset.plot); } else if (lk && likeCache) lk.innerHTML = likeCache;
  if (focusKey) {
    const el = box.querySelector(`#${CSS.escape(focusKey)}`) || box.querySelector(`[data-do="${focusKey}"],[data-person="${focusKey}"],[data-filter="${focusKey}"]`);
    if (el) { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
  }
}

let drawerMax = false, lastLikes = null, likeCache = '';
async function loadLikes(id) {
  try {
    const { count, mine } = await fb.likes(world.id, id, user.uid);
    likeCache = `<button class="btn ${mine ? 'primary' : ''}" type="button" id="like-btn" aria-pressed="${mine}">${mine ? '♥ Liked' : '♡ Like this city'}</button><span class="soft small">${count} like${count === 1 ? '' : 's'}</span>`;
    const lk = $('likes');
    if (!lk) return;
    lk.innerHTML = likeCache;
    $('like-btn').onclick = async () => { await fb.setLike(world.id, id, user.uid, !mine).catch(() => {}); lastLikes = null; loadLikes(id); play('coin'); };
  } catch (e) { console.error(e); }
}
function wireDrawer(box) {
  box.querySelectorAll('[data-close-drawer]').forEach((b) => { b.onclick = closeDrawer; });
  box.querySelectorAll('[data-do]').forEach((b) => { b.onclick = () => inspectorAction(b.dataset.do, b.dataset.arg); });
  box.querySelectorAll('[data-build-type]').forEach((b) => { b.onclick = () => buildGo(+b.dataset.buildType)(); });
  box.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => { peopleFilter = b.dataset.filter; renderDrawer(); }; });
  box.querySelectorAll('[data-stats-tab]').forEach((b) => { b.onclick = () => { statsTab = b.dataset.statsTab; renderDrawer(); }; });
  if (drawer === 'region') wireRegion(box);
  if (drawer === 'market') wireMarket(box);
  if (drawer === 'dm') wireDM(box);
  box.querySelectorAll('[data-gift]').forEach((b) => { b.onclick = () => { const p = plots.get(b.dataset.gift); if (p) giveGift(p); }; });
  const gb = box.querySelector('[data-book]');
  if (gb && gb.dataset.book !== bookFor) loadBook(gb.dataset.book); else if (gb) wireBook();
  box.querySelector('#weekly-claim')?.addEventListener('click', claimWeekly);
  box.querySelector('#daily-claim')?.addEventListener('click', claimDaily);
  box.querySelector('#open-timelapse')?.addEventListener('click', showTimelapse);
  box.querySelectorAll('[data-tech]').forEach((b) => { b.onclick = () => { const r = sim.research(state, b.dataset.tech); if (r.ok) { play('level'); notify(`Research complete: ${b.closest('li').querySelector('b').textContent}.`, 'good'); afterChange(); } else notify(r.reason, 'act'); }; });
  box.querySelectorAll('[data-react]').forEach((b) => { b.onclick = () => {
    const [id, emo] = b.dataset.react.split('|'), msg = chatMessages.find((x) => x.id === id);
    const cur = msg?.reactions?.[user.uid];
    fb.react(world.id, id, user.uid, cur === emo ? null : emo).catch((e) => notify(fb.authMessage(e), 'act'));
  }; });
  const rn = box.querySelector('#world-rename');
  if (rn) rn.onsubmit = (e) => { e.preventDefault(); busy(rn.querySelector('button'), async () => {
    const v = $('world-newname').value.trim().slice(0, 40);
    if (!v) throw new Error('Type a name.');
    await fb.renameWorld(world.id, v); world = { ...world, name: v }; setWorld(world); formOk('world-msg', 'Renamed.'); loadWorlds();
  }, $('world-msg')); };
  box.querySelectorAll('[data-news-tab]').forEach((b) => { b.onclick = () => { newsTab = b.dataset.newsTab; renderDrawer(); }; });
  box.querySelectorAll('[data-prop]').forEach((b) => { b.onclick = () => { state.policy.property = +b.dataset.prop; afterChange(); announce(`Property tax ${['off', 'low', 'high'][+b.dataset.prop]}.`); }; });
  box.querySelectorAll('[data-panel-go]').forEach((b) => { b.onclick = () => { drawer = null; openPanel(b.dataset.panelGo); }; });
  const q = box.querySelector('#people-q');
  if (q) q.oninput = () => { peopleQuery = q.value; renderDrawer(); };
  box.querySelectorAll('[data-person]').forEach((b) => { b.onclick = () => showPerson(+b.dataset.person); });
  box.querySelectorAll('[data-fav]').forEach((b) => { b.onclick = () => { toggleFav(+b.dataset.fav); renderDrawer(); }; });
  box.querySelectorAll('[data-home]').forEach((b) => { b.onclick = () => { const i = +b.dataset.home, { x, y } = sim.xy(i); select({ px: me.px, py: me.py, tx: x, ty: y, i }); goTo(me.px, me.py, x, y, 18); }; });
  box.querySelectorAll('input[type=range][data-policy]').forEach((r) => {
    r.oninput = () => { state.policy[r.dataset.policy] = +r.value; $(`pol-${r.dataset.policy}-v`).textContent = pct(+r.value); };
    r.onchange = () => { state.policy[r.dataset.policy] = +r.value; afterChange(); announce(`${r.getAttribute('aria-label')} set to ${pct(+r.value)}.`); };
  });
  box.querySelectorAll('input[type=checkbox][data-policy]').forEach((c) => { c.onchange = () => { state.policy[c.dataset.policy] = c.checked; afterChange(); }; });
  box.querySelectorAll('[data-borrow]').forEach((b) => {
    b.onclick = () => {
      const amt = +b.dataset.borrow, c = sim.canBorrow(state, amt);
      if (!c.ok) { notify(c.reason, 'act'); play('error'); return; }
      openModal(`${closeX}<h2 id="modal-title">Borrow ${money(amt)}?</h2>
        <p>With a ${c.rating} credit rating the bank charges ${(c.rate * 100).toFixed(1)}% a day on what’s left. You repay ${money(Math.ceil(amt / LOAN_DAYS))} a day plus interest for ${LOAN_DAYS} days, taken automatically with upkeep.</p>
        <p class="soft small">Missing a payment adds the interest to the debt and lowers your rating.</p>
        <div class="mfoot"><button class="btn" data-close>Not now</button><button class="btn primary" id="loan-go">Take the loan</button></div>`);
      $('loan-go').onclick = () => { const r = sim.borrow(state, amt); closeModal(); if (r.ok) { play('coin'); notify(`${money(amt)} borrowed.`, 'act'); afterChange(); } else notify(r.reason, 'act'); };
    };
  });
  box.querySelectorAll('[data-bond]').forEach((b) => { b.onclick = () => { const r = sim.issueBonds(state, +b.dataset.bond); if (r.ok) { play('coin'); notify(`Residents bought ${money(+b.dataset.bond)} of bonds. You’ll repay ${money(r.owe)}.`, 'act'); afterChange(); } else notify(r.reason, 'act'); }; });
  box.querySelectorAll('[data-repay]').forEach((b) => { b.onclick = () => { const r = sim.repay(state, +b.dataset.repay); if (r.ok) { play('coin'); notify(`Paid ${money(r.paid)} off the loan.`, 'act'); afterChange(); } else notify(r.reason, 'act'); }; });
  box.querySelectorAll('[data-mute]').forEach((b) => { b.onclick = () => { const m = muted(); m.add(b.dataset.mute); localStorage.setItem('commons-muted', JSON.stringify([...m])); notify('Blocked. You won’t see their messages or notes, or get their gifts. Unblock in Settings, Interface.', 'act'); renderDrawer(); }; });
  box.querySelectorAll('[data-report]').forEach((b) => {
    b.onclick = () => { const msg = chatMessages.find((x) => x.id === b.dataset.report); if (!msg) return; fb.report(world.id, user.uid, { kind: 'chat', message: msg.id, author: msg.uid, text: String(msg.text).slice(0, 280) }).then(() => notify('Reported. Thanks for keeping chat friendly.', 'act')).catch(() => notify('Couldn’t send the report.', 'warn')); };
  });
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
      const w = await fb.createWorld(user, name.slice(0, 40));
      notifyLater = `Created ${w.name}. Share the invite code ${w.code} from the World panel.`;
      stopFollow();
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
      formOk('world-msg', `Found ${w.name}. Taking you there…`);
      await save();
      stopFollow();
      setWorld(w);
      enter(user);
    }, $('world-msg'));
  };
  box.querySelectorAll('[data-copylink]').forEach((b) => {
    b.onclick = async () => {
      const link = inviteLink(b.dataset.copylink);
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `Join ${world.name} on Commons`, text: `Build next to me in ${world.name}.`, url: link });
        else { await navigator.clipboard.writeText(link); notify('Invite link copied. Anyone who opens it can join.', 'act'); }
      } catch (err) { if (err?.name !== 'AbortError') notify(`Invite link: ${link}`, 'act'); }
    };
  });
}

// ---------- inspector ----------
function inspectorAction(what, arg) {
  const i = selected?.i;
  if (watching && !['follow', 'home', 'friend', 'dm'].includes(what)) { notify(watchNote(), 'act'); return; }
  if (what === 'tap') tap(i);
  else if (what === 'upgrade') upgradeAt(i);
  else if (what === 'protect') { const r = sim.setProtected(state, i, !sim.isProtected(state, i)); if (r.ok) { play('level'); notify(sim.isProtected(state, i) ? 'Protected. It will stand for good.' : 'Protection lifted.', 'act'); afterChange(); } else notify(r.reason, 'act'); }
  else if (what === 'sell-land') {
    const c = sim.chunkOf(i), r = sim.canSellLand(state, c);
    if (!r.ok) { notify(r.reason, 'act'); return; }
    openModal(`${closeX}<h2 id="modal-title">Sell this parcel for ${money(r.price)}?</h2><p>You’d have to buy it back at the full price later.</p>
      <div class="mfoot"><button class="btn" data-close>Keep it</button><button class="btn primary" id="sell-go">Sell</button></div>`);
    $('sell-go').onclick = () => { checkpoint('land sale'); sim.sellLand(state, c); closeModal(); play('coin'); notify(`Sold for ${money(r.price)}.`, 'act'); closeDrawer(); afterChange(); };
    return;
  }
  else if (what === 'upgrade-all') {
    const t = state.grid[i];
    const list = state.grid.map((g, j) => (g === t ? j : -1)).filter((j) => j >= 0 && sim.canUpgrade(state, j).ok).sort((a, b) => state.lv[a] - state.lv[b]);
    checkpoint(`${B[t].name} upgrades`);
    let n = 0, spent = 0;
    for (const j of list) { if (!sim.canUpgrade(state, j).ok) continue; const r = sim.upgrade(state, j); if (r.ok) { n++; spent += r.cost; } }
    if (n) { play('level'); notify(`Upgrading ${n} ${B[t].name.toLowerCase()}${n > 1 ? 's' : ''} for ${money(spent)}.`, 'act'); afterChange(); }
    else notify('Not enough money to upgrade any.', 'act');
  }
  else if (what === 'clear') {
    const t = state.grid[i];
    if (!B[t]?.cat) { demolish(i, false); }
    else {
      const n = state.people.filter((p) => p.h === i || p.j === i || p.sc === i).length;
      openModal(`<h2 id="modal-title">Demolish this ${B[t].name.toLowerCase()}?</h2>${sim.isHistoric(state, i) ? '<p class="warn">It’s a historic building. Residents will be sad to see it go.</p>' : ''}<p>${n ? `${n} ${n === 1 ? 'person lives, works or studies' : 'people live, work or study'} here and will need somewhere else. ` : ''}You can undo it for five minutes afterwards.</p>
        <div class="mfoot"><button class="btn primary" data-close autofocus>Keep it</button><button class="btn danger" id="demo-go">Demolish</button></div>`);
      $('demo-go').onclick = () => { closeModal(); demolish(i, false); };
    }
    return;
  }
  else if (what === 'cancel-build') {
    openModal(`<h2 id="modal-title">Cancel this ${B[state.grid[i]].name.toLowerCase()}?</h2><p>Builders stop and the site is cleared. You get half the price back if work hadn’t started.</p>
      <div class="mfoot"><button class="btn primary" data-close autofocus>Keep building</button><button class="btn danger" id="cancel-go">Cancel construction</button></div>`);
    $('cancel-go').onclick = () => { closeModal(); demolish(i, false); };
    return;
  }
  else if (what === 'dm') { const p = plots.get(arg); if (p) openDM(p.owner, p.ownerName); return; }
  else if (what === 'friend') { const p = plots.get(arg); if (p) { addFriend(p.owner, p.ownerName); refreshDrawer(); } return; }
  else if (what === 'buyplot') {
    const h = selected, price = sim.plotPrice(state, myCities().length), name = ($('buy-name')?.value || '').trim().slice(0, 40) || 'New city';
    if (state.money < price) { notify(`Needs ${money(price)}.`, 'act'); play('error'); return; }
    busy(document.querySelector('[data-do="buyplot"]'), async () => {
      const d = await fb.buyPlot(user, mayor, arg, h.px, h.py, name, world.id);
      state.money -= price;
      sim.note(state, 'info', `Bought the plot next door and founded ${name}.`);
      addPlot(toPlot(d)); computeLinks(); afterChange(); await save();
      play('level');
      openModal(`${closeX}<h2 id="modal-title">${esc(name)} is founded</h2><p>It has a town hall, three builders, three settlers and ${money(REBUILD_MONEY)}. Switch between your cities in Account, Cities.</p>
        <div class="mfoot"><button class="btn" data-close>Stay in ${esc(state.name)}</button><button class="btn primary" id="open-new">Open ${esc(name)}</button></div>`);
      $('open-new').onclick = () => { closeModal(); switchCity(d.id); };
    }, $('buy-msg'));
    return;
  }
  else if (what === 'set-recipe') {
    const id = arg === 'none' ? null : arg;
    checkpoint('picking a recipe');
    const r = sim.setRecipe(state, i, id);
    if (!r.ok) { notify(r.reason + '.', 'act'); play('error'); return; }
    play('level'); notify(id ? `Now making ${PRODUCTS[id].name.toLowerCase()}.` : 'Recipe cleared.', 'act'); afterChange();
  }
  else if (what === 'harvest') { collect(i); refreshDrawer(); return; }
  else if (what === 'recruit') {
    const r = sim.recruit(state, i, +arg);
    if (!r.ok) { notify(r.reason + '.', 'act'); play('error'); return; }
    checkpoint('recruitment'); play('coin'); notify(`${sim.personName(state.people.find((p) => p.i === r.pid))} is moving here for the job.`, 'good'); afterChange();
  }
  else if (what === 'fire') {
    const p = state.people.find((x) => x.i === +arg);
    checkpoint('letting someone go');
    const r = sim.fire(state, +arg);
    if (!r.ok) { notify(r.reason + '.', 'act'); play('error'); return; }
    notify(`${sim.personName(p)} was let go. They’ll look for work elsewhere.`, 'act'); afterChange();
  }
  else if (what === 'hire') {
    const k = +arg, d = B[state.grid[i]], list = sim.candidates(state, i, k).slice(0, 30);
    openModal(`${closeX}<h2 id="modal-title">Hire a ${esc(d.jobs[k][0].toLowerCase())}</h2>
      <p>${d.jobs[k][1] ? `Needs ${EDU[d.jobs[k][1]].toLowerCase()}. ` : ''}People you hire stay in the job until you let them go.</p>
      ${list.length ? `<ul class="picklist">${list.map((p) => `<li><span>${esc(sim.personName(p))}, ${p.a} <small class="soft">${EDU[p.e].toLowerCase()}; ${p.j >= 0 ? esc(jobText(state, p).toLowerCase()) : 'looking for work'}</small></span><button class="btn small" type="button" data-hire="${p.i}">Hire</button></li>`).join('')}</ul>`
        : `<p class="warn">Nobody in town has the education. Recruit from outside, or let adults study at a library’s evening classes.</p>`}
      <div class="mfoot"><button class="btn" data-close>Close</button></div>`);
    modal.querySelectorAll('[data-hire]').forEach((b) => { b.onclick = () => {
      checkpoint('hiring');
      const r = sim.hire(state, +b.dataset.hire, i, k);
      if (!r.ok) { notify(r.reason + '.', 'act'); play('error'); return; }
      closeModal(); play('coin'); notify(`Hired. ${sim.personName(state.people.find((p) => p.i === +b.dataset.hire))} starts today.`, 'good'); afterChange();
    }; });
    return;
  }
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
  if (t === T.EMPTY) {
    const ter = sim.terrainAt(state, i), sell = sim.canSellLand(state, sim.chunkOf(i));
    return `<h2>${ter === 2 ? 'Water' : state.zone[i] ? ZONES[state.zone[i]].name : ter === 1 ? 'Hillside' : 'Empty land'}</h2>${where}<p>${ter === 2 ? 'Roads, footpaths and railways can bridge it, at four times the price.' : state.zone[i] ? 'Developers will build here when the city needs it. It needs a road beside it.' : `Switch to Build and tap here to see everything you can put on it.${ter === 1 ? ' Building on a hill costs 40% more, but the views raise land value.' : ''}`}</p>
      ${sell.ok ? `<div class="actions"><button class="btn" type="button" data-do="sell-land">Sell this ${CHUNK}×${CHUNK} parcel for ${money(sell.price)}</button></div>` : ''}`;
  }
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
      <div class="actions">${q.tap < total * 0.25 - 1e-6 ? `<button class="btn primary" data-do="tap">${icon('i-hammer')}Help build</button>` : `<button class="btn" disabled>${icon('i-check')}Your builders have it from here</button>`}</div>
      <div class="danger-row"><button class="linkbtn danger-link" data-do="cancel-build">Cancel construction</button></div>`;
  }
  const cond = t === T.HALL ? 100 : state.cond[i];
  const people = state.people;
  let body = `<p class="soft small">${esc(d.blurb || '')}</p>${state.zone[i] ? '<p class="good-t small">Built by developers in a zone: you pay no upkeep.</p>' : ''}`;
  if (d.jobs) {
    const slots = sim.jobSlots(state, i), staff = people.filter((p) => p.j === i && !p.oj);
    body += `<div class="kv"><span>Staff</span><b class="num">${staff.length} of ${slots.reduce((a, b) => a + b, 0)}</b></div>`;
    d.jobs.forEach(([title, e], k) => {
      const n = staff.filter((p) => p.jt === k).length;
      if (n < slots[k]) body += `<div class="vacancy"><p class="soft small">${slots[k] - n} ${title.toLowerCase()} job${slots[k] - n > 1 ? 's' : ''} open${e ? `, needs ${EDU[e].toLowerCase()}` : ''}.</p>
        <div class="actions"><button class="btn" type="button" data-do="hire" data-arg="${k}">Hire someone</button><button class="btn" type="button" data-do="recruit" data-arg="${k}">Recruit from outside, ${money(sim.recruitCost(state, i, k))}</button></div></div>`;
    });
    if (staff.length && t !== T.HALL) body += `<details class="staff"><summary>Manage staff</summary><ul>${staff.map((p) => `<li><span>${esc(sim.personName(p))} <small class="soft">${esc(d.jobs[p.jt][0].toLowerCase())}, ${EDU[p.e].toLowerCase()}</small></span><button class="btn small" type="button" data-do="fire" data-arg="${p.i}">Let go</button></li>`).join('')}</ul></details>`;
    if (!staff.length && (d.school || d.care || d.visits || d.radius || d.cases)) body += '<p class="warn">Closed: nobody works here yet. It needs staff with the right education.</p>';
    body += faces(staff, 'Staff');
  }
  if (isHome(t)) body += row('Homes', `${people.filter((p) => p.h === i).length} of ${sim.homeCap(state, i)}`) + faces(people.filter((p) => p.h === i), 'Residents');
  if (d.school) body += row(d.school.stage === 'daycare' ? 'Places' : 'Seats', `${people.filter((p) => p.sc === i || p.tu === i).length} of ${sim.capacity(state, i, 'seats')}`) + faces(people.filter((p) => p.sc === i || p.tu === i), 'Pupils');
  if (d.care) body += row('Patients today', `${[...(plan?.careFor.values() || [])].filter((c) => c === i).length} of ${Math.floor(sim.capacity(state, i, 'care') * sim.staffing(state, i))}`);
  if (d.visits) body += row('Visitors tonight', `${people.filter((p) => p.fun === i).length} of ${Math.floor(sim.capacity(state, i, 'visits') * sim.staffing(state, i))}`);
  if (d.serves) body += row('Households fed', [...(plan?.shopFor.values() || [])].filter((s) => s === i).length);
  if (d.makes) {
    const k = sim.staffing(state, i) * LEVEL.capacity[lv];
    body += row('Makes a day', Object.entries(d.makes).map(([r, n]) => `${Math.round(n * k)} ${RES[r].name.toLowerCase()}`).join(', ') || 'Nothing until it has staff');
    const hrs = state.ready?.[i] || 0;
    body += `<div class="kv"><span>Harvest</span>${bar('Harvest', hrs / HARVEST.max, 'small')}</div>`;
    body += sim.harvestReady(state, i) ? `<div class="actions"><button class="btn primary" type="button" data-do="harvest">Collect the harvest</button></div>`
      : `<p class="soft small">${hrs ? `Ready to collect in ${HARVEST.min - hrs} hour${HARVEST.min - hrs === 1 ? '' : 's'}.` : 'Builds up a harvest while it works. Tap it to collect.'}</p>`;
  }
  if (d.makesProducts) {
    const recId = state.rec?.[i] || null, rec = recId && PRODUCTS[recId];
    body += rec
      ? row('Recipe', rec.name) + row('Made yesterday', `${state.stats?.products?.made?.[recId] || 0} ${rec.name.toLowerCase()}`)
        + row('Uses a day', Object.entries(rec.recipe).map(([r, rn]) => `${rn} ${RES[r].name.toLowerCase()}`).join(', '))
      : '<p class="soft small">Pick a recipe to turn resources into a product to sell.</p>';
    body += `<ul class="tech">${PRODUCT_IDS.map((id) => {
      const p = PRODUCTS[id], has = sim.hasTech(state, p.tech), picked = recId === id;
      return `<li class="${picked ? 'done' : has ? '' : 'blocked'}"><span class="pmain"><b>${p.name}</b>
        <small>${Object.entries(p.recipe).map(([r, rn]) => `${rn} ${RES[r].name.toLowerCase()}`).join(' and ')} makes ${p.makes}. ${p.benefit}${has ? '' : ` Needs the ${TECH.find((x) => x.id === p.tech).name} research.`}</small></span>
        ${picked ? '<span class="tag">Picked</span>' : `<button class="btn ${has ? 'primary' : ''}" type="button" data-do="set-recipe" data-arg="${id}" ${has ? '' : 'disabled'}>Pick</button>`}</li>`;
    }).join('')}${recId ? `<li><span class="pmain"><b>None</b><small>Leave the factory idle.</small></span><button class="btn" type="button" data-do="set-recipe" data-arg="none">Stop</button></li>` : ''}</ul>`;
  }
  if (d.sellsProducts) {
    const held = PRODUCT_IDS.filter((k) => (state.res?.[k] || 0) > 0);
    body += row('Selling', held.length ? held.map((k) => `${Math.floor(state.res[k])} ${PRODUCTS[k].name.toLowerCase()}`).join(', ') : 'Nothing in stock yet');
  }
  if (d.store) body += row('Stores', `${d.store} more of each resource and product`);
  if (d.jobs && d.cat && sim.staffing(state, i) > 0) body += row('Uses a day', `${USE.powerPerBuilding} power`);
  if (d.waste || d.sewage) { const w = plan?.waste; body += row(d.waste ? 'Rubbish handled, whole city' : 'Sewage handled, whole city', `${d.waste ? w?.wasteCap ?? 0 : w?.sewageCap ?? 0} of ${state.people.length} people`); }
  if (t === T.VET) body += row('Pets looked after', plan?.vetFor?.size || 0);
  if (t === T.METRO) { body += row('Metro riders today', `${plan?.riders?.metro || 0} of ${plan?.metroCap || 0}`); if ((plan?.metros?.length || 0) < 2) body += '<p class="warn">Trains run once two metro stations have staff.</p>'; }
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
  const same = UPGRADABLE.includes(t) ? state.grid.reduce((a, g, j) => a + (g === t && j !== i && sim.canUpgrade(state, j).ok ? 1 : 0), 0) : 0;
  if (same) actions += `<button class="btn" data-do="upgrade-all">${icon('i-up')}Upgrade all ${B[t].name.toLowerCase()}s you can afford (${same + (sim.canUpgrade(state, i).ok ? 1 : 0)})</button>`;
  if (d.cat && !q) actions += `<button class="btn" data-do="move">${icon('i-move')}Move for ${money(Math.round(d.cost * MOVE_FEE))}</button>`;
  if (t !== T.HALL) actions += `<button class="btn" data-do="clear">${icon('i-clear')}Demolish</button>`;
  const levelTag = UPGRADABLE.includes(t) ? `<span class="tag">Level ${lv}</span>` : '';
  let heritage = '';
  if (sim.isHistoric(state, i)) {
    const prot = sim.isProtected(state, i);
    heritage = `<div class="heritage"><span class="tag">Historic${prot ? ', protected' : ''}</span><p class="soft small">Built on day ${state.bday[i]}. Historic buildings draw tourists and raise nearby land value. ${prot ? 'Protected: it can’t be pulled down or moved, and draws twice the visitors.' : 'Protect it to keep it for good and draw more visitors.'}</p>
      <button class="btn" type="button" data-do="protect">${prot ? 'Lift protection' : 'Protect it'}</button></div>`;
  } else if (d.cat && state.bday?.[i] >= 0) heritage = `<p class="soft small">Becomes historic on day ${state.bday[i] + HISTORIC_DAYS}.</p>`;
  return `<h2>${d.name} ${levelTag}</h2>${heritage}${where}${t !== T.HALL ? meter('Condition', cond / 100) : ''}${condTxt}${body}<div class="actions">${actions}</div>`;
}

// Your council's cities in this world.
const myCities = () => [...plots.values()].filter((p) => p.owner === user?.uid);
// Unclaimed plots touching one of your cities: drawn with a dashed border so you can see what you could buy.
// Unclaimed plots around the cities, drawn as the land they are (terrain and trees), so the world has no gaps.
const wildCache = new Map();
function wildPlots() {
  if (!plots.size) return [];
  const bd = renderer.bounds(), all = [...plots.values()];
  const minX = Math.min(...all.map((p) => p.px)) - 2, maxX = Math.max(...all.map((p) => p.px)) + 2, minY = Math.min(...all.map((p) => p.py)) - 2, maxY = Math.max(...all.map((p) => p.py)) + 2;
  const out = [];
  for (let py = Math.max(minY, Math.floor(bd.y0 / STRIDE)); py <= Math.min(maxY, Math.floor(bd.y1 / STRIDE)); py++) {
    for (let px = Math.max(minX, Math.floor(bd.x0 / STRIDE)); px <= Math.min(maxX, Math.floor(bd.x1 / STRIDE)); px++) {
      if (plotAt(px, py) || out.length >= 80) continue;
      const key = `${world.id}|${px}|${py}`;
      if (!wildCache.has(key)) wildCache.set(key, { id: `wild_${px}_${py}`, px, py, wild: true, status: 'wild', version: 'wild', name: '', grid: new Array(PLOT * PLOT).fill(T.EMPTY), cond: [], lv: null,
        land: new Array(CHUNKS * CHUNKS).fill(0), uc: new Set(), queueMap: new Map(), terr: sim.terrainFor(px, py, world.id), mine: false, out: {}, co: [] });
      out.push(wildCache.get(key));
    }
  }
  return out;
}
// What the renderer needs from the style: its colours (unless a colour-blind palette is on) and its ground.
function styleScene() {
  const st = currentStyle(), theme = st.dark ? 'dark' : resolvedTheme(prefs);
  return { theme, styleId: st.id, palette: prefs.colours === 'standard' ? st.cols : palette(prefs), paletteKey: prefs.colours, mapStyle: theme === 'dark' && !st.dark ? null : st.map };
}
function readyTiles() {
  if (!state?.ready || !me) return [];
  return Object.entries(state.ready).filter(([i, h]) => h >= HARVEST.min && state.grid[i]).map(([i, h]) => ({ px: me.px, py: me.py, ...sim.xy(+i), full: h >= HARVEST.max }));
}
function freePlots() {
  if (!state || state.status !== 'alive') return [];
  const out = new Map();
  for (const c of myCities()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const px = c.px + dx, py = c.py + dy;
    if (!plotAt(px, py)) out.set(`${px},${py}`, { px, py, free: true });
  }
  return [...out.values()];
}
function otherPlot(h) {
  const p = plotAt(h.px, h.py);
  if (!p) {
    const via = myCities().find((c) => c.status === 'alive' && Math.abs(c.px - h.px) + Math.abs(c.py - h.py) === 1);
    if (!via || state.status !== 'alive') return '<h2>Unclaimed land</h2><p>New players get plots out here on the frontier. You can buy plots that touch one of your cities.</p>';
    if (!isOpen('council')) return `<h2>Unclaimed land</h2>${panels.lockHtml('council', state)}`;
    const price = sim.plotPrice(state, myCities().length), full = myCities().length >= MAX_CITIES;
    return `<h2>Unclaimed land</h2><p>This plot touches ${esc(via.name)}. Buy it to start another city of your council here, with its own town hall, settlers and ${money(REBUILD_MONEY)}.</p>
      ${row('Price', money(price))}${row('Your cities here', myCities().length)}
      ${full ? `<p class="warn">A council can run up to ${MAX_CITIES} cities.</p>` : `<label class="field"><span>New city's name</span><input id="buy-name" maxlength="40" value="New ${esc(via.name).slice(0, 30)}"></label>
      <div class="actions"><button class="btn primary" type="button" data-do="buyplot" data-arg="${via.id}" ${state.money < price ? 'disabled' : ''}>${icon('i-flag')}Buy for ${money(price)}</button></div>
      ${state.money < price ? `<p class="soft small">${esc(state.name)} needs ${money(price - state.money)} more.</p>` : ''}<p id="buy-msg" class="formmsg" role="alert"></p>`}`;
  }
  if (p.status === 'ruins') {
    return `<div class="plaque"><h2>Ruins of ${esc(p.name)}</h2><p>Built by ${esc(p.ownerName)}. It reached ${p.peakPop} people and lasted ${p.day} days.</p></div>
      <p class="soft small">You can start a new city here. Your current city would become ruins, and you'd bring half your money.</p>
      <div class="actions"><button class="btn primary" data-do="moveto" data-arg="${p.id}">${icon('i-flag')}Move here and rebuild</button></div>`;
  }
  const n = neighbourInfo.find((x) => x.px === p.px && x.py === p.py);
  const t = p.grid[h.i];
  const idle = !isActive(p);
  const badges = (p.badges || []).map((id) => BADGES.find((b) => b.id === id)).filter(Boolean);
  return `<h2>${esc(p.name)}</h2>${badges.length ? `<p class="badges">${badges.map((b) => `<span class="badge b-${b.id}">${b.name}</span>`).join('')}</p>` : ''}<p class="soft">Mayor ${esc(p.ownerName)}. Running for ${p.day} day${p.day === 1 ? '' : 's'}${p.cityNo > 1 ? `, city number ${p.cityNo} on this plot` : ''}.</p>
    <p class="${idle ? 'warn' : 'good-t'} small">${idle ? `Last active ${ago(p.active)}. Paused until the mayor returns, so it isn't sharing facilities.` : 'Active now'}</p>
    <div class="likes" id="likes" data-plot="${p.id}"></div>
    ${p.owner && p.owner !== user.uid && state.status === 'alive' ? `<div class="actions"><button class="btn" type="button" data-gift="${p.id}">${icon('i-coin')}Send a gift</button>${friends().some((f) => f.uid === p.owner) ? '' : `<button class="btn" type="button" data-do="friend" data-arg="${p.id}">${icon('i-people')}Add ${esc(p.ownerName)} as a friend</button>`}<button class="btn" type="button" data-do="dm" data-arg="${p.id}">${icon('i-chat')}Message ${esc(p.ownerName)}</button></div>` : ''}
    ${t && B[t] ? `<p class="soft small">You tapped their ${B[t].name.toLowerCase()}.</p>` : ''}
    ${row('People', p.pop)}${row('Peak', p.peakPop)}${row('Days running', p.day)}${meter('Mood', p.happiness || 0)}
    ${n ? row('Road links with you', n.links || 'None yet') : ''}
    ${n && !n.links ? '<p class="soft small">Build a road on your shared edge where theirs meets it to link your cities.</p>' : ''}
    <h3 class="sub">${icon('i-book')}Guestbook</h3><div id="guestbook" data-book="${p.id}">${bookFor === p.id ? bookHtml(p.id) : '<p class="soft small">Loading…</p>'}</div>`;
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
    myPlot: plotId, isOwnerOfWorld: world.owner === user.uid, weekly: state.status === 'alive' ? weekly() : null, news: worldNews, bookMine: bookFor === plotId ? bookHtml(plotId) : null,
    ruins: all.filter((p) => p.status === 'ruins' && !p.mine).sort((a, b) => b.peakPop - a.peakPop).slice(0, 6),
  };
}
async function loadWorlds() {
  try { worlds = await fb.myWorlds(user); if (drawer === 'world') refreshDrawer(); } catch (e) { console.error(e); }
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
    const fresh = sim.migrate(JSON.parse(p.st ? sim.serialize(p.st) : await fb.getState(p.id)));
    sim.ensureTerrain(fresh, p.px, p.py, world.id);
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
    <div class="help-actions"><button class="btn" type="button" id="h-news">${icon('i-spark')}What’s new</button><button class="btn" type="button" id="h-support">${icon('i-help')}Questions and support</button><button class="btn" type="button" id="h-feedback">${icon('i-chat')}Send feedback</button></div>
    <button class="choice wide-choice" type="button" id="h-tour">${icon('i-book')}<b>${tut.active() ? 'Restart the tour' : 'Take the interactive tour'}</b><small>Learn by building, step by step.</small></button>
    <div class="help">
      <section><h3>${icon('i-hammer')}Build, Select, Move</h3><p>Build: tap empty land for a menu of everything you can afford, or pick a road brush and drag. Select: tap anything for details and options. Move: pick up a building and put it elsewhere.</p></section>
      <section><h3>${icon('i-grid')}Zones</h3><p>Paint homes, shops or industry zones. When the demand bars say so, developers build there for free and you pay no upkeep.</p></section>
      <section><h3>${icon('i-map')}Land</h3><p>You start with an 8×8 patch. In Build mode, price tags show land next to yours that you can buy.</p></section>
      <section><h3>${icon('i-people')}Real people</h3><p>Every resident has a name, family, age, education, job and routine. Every car, bike and walker is one of them. Tap them.</p></section>
      <section><h3>${icon('i-school')}Growing up</h3><p>Two days are a year. Toddlers need daycare or a parent stays home. Children need primary and high school; graduates can go to university for the best jobs.</p></section>
      <section><h3>${icon('i-jobs')}Staffing</h3><p>Schools, clinics, police and venues only open when people with the right education work there.</p></section>
      <section><h3>${icon('i-mood')}Life happens</h3><p>Illness (clinics), injuries (hospitals), old age (cemeteries), crime (police and courts). Families celebrate births and grieve losses.</p></section>
      <section><h3>${icon('i-coin')}Money</h3><p>Working people pay tax, more for skilled jobs. Upkeep is fixed. Unpaid upkeep decays buildings; a city with no people and no money falls.</p></section>
      <section><h3>${icon('i-rail')}Buses and trains</h3><p>A bus depot plus two or more stops runs buses; people near a stop ride instead of driving. Stations beside a railway carry people on long trips.</p></section>
      <section><h3>${icon('i-link')}Neighbours</h3><p>Roads or railways that meet across a plot edge link two cities: trade, mood, and out-of-town jobs by train or bus. Chat with everyone in your world.</p></section>
    </div>
    <h3 class="keys-h">Keys</h3>
    <p class="keys"><kbd>B</kbd> build, <kbd>E</kbd> select, <kbd>R</kbd> move, <kbd>1</kbd>–<kbd>7</kbd> road, footpath, railway, traffic lights, roundabout, zones (press again to switch type), clear (in Build), <kbd>Ctrl</kbd> <kbd>Z</kbd> undo, <kbd>V</kbd> 3D or 2D, <kbd>H</kbd> home, <kbd>0</kbd> whole map, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pan, <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>O</kbd> goals, <kbd>P</kbd> people, <kbd>C</kbd> stats, <kbd>N</kbd> news, <kbd>K</kbd> chat, <kbd>J</kbd> world, <kbd>Y</kbd> region, <kbd>F</kbd> photo mode, <kbd>T</kbd> info views, <kbd>Esc</kbd> cancel. Click the map, then use the arrow keys and <kbd>Enter</kbd> to play without a mouse.</p>`, 'wide');
  $('h-tour').onclick = () => { closeModal(); tut.start(0); };
  $('h-support').onclick = showSupport;
  $('h-news').onclick = showChangelog;
  $('h-feedback').onclick = () => showFeedback();
}

const VERSION = 'Commons 1.3';
const CHANGELOG = [
  ['1.3', [
    'A clear objective, always on screen: a banner at the top now shows your next step at a glance, with a Show me button, so a new mayor always knows what to do.',
    'No more emoji: the resource bar and every other icon are now the same line-icon style as the rest of the interface.',
    'Buildings finally cast a shadow and read with more depth; jammed roads now glow to make traffic problems obvious, and flowing roads look a little brighter.',
    'Floating feedback when your mood visibly improves, and a gentle toast suggestion if you go a minute without doing anything.',
    'A fresh start: every world begins again, same as before.',
  ]],
  ['1.2', [
    'A real economy: the single "materials" resource splits into wood and metal, and "food" is no longer its own resource — vegetables, fruit, dairy, meat and the new eggs are each their own stock and trade good. A Quarry mines metal and a Poultry farm keeps eggs; the old Materials works is now the Sawmill (wood).',
    'Factories now do something: research a recipe (Furniture, Tools or Baked goods), assign it, and the factory turns real resources into a real product, limited by what you actually have in store. A new Store sells your products to your own residents; you can also trade them with other mayors on the Market.',
    'Buildings have more depth: quarries, poultry farms, stores and the storage yard (formerly the warehouse) get new looks, and houses, offices, shops and the town hall are a little more detailed.',
    'The tutorial now walks through the new economy, and a few more of its steps are real tasks instead of just narration.',
    'A fresh start: every world begins again, same as 1.18 — old worlds are hidden, not deleted.',
  ]],
  ['1.18', [
    'A fresh start: every world begins again, with room for everyone to build from the first settlers.',
    'Styles that grow with your town hall: start as Frontier (parchment, timber and clay roofs), then unlock Township, Modern and Skyline. Switch between the ones you’ve unlocked in Settings, Interface.',
    'Each style changes the city too: its buildings, roads, walls and ground.',
    'A calmer screen: frosted-glass panels in the modern styles, the mood panel folded to the ring and your next step, and shorter hints.',
    'Better names: many more first names and surnames, and city names that sound like real places.',
    'The 2D view has been retired: the city is always shown in 3D.',
  ]],
  ['1.17', [
    'Your town hall is your city’s size: Settlement, Village, Town, Large town, City, Large city, Metropolis. It grows by itself once you have the people, the objectives and the resources, and each level lets you buy more land, store more and research faster.',
    'A Next step line under your mood always says what to do, with a Show me button. Goals shows what the next level needs and what your city needs right now.',
    'The technology tree now opens the game: high schools and universities, the Market, city shares, the Region and the internet. Your town hall earns research every day. Locked things say exactly what opens them.',
    'Real trading: the Exchange buys and sells resources at prices set by the whole world, higher when something is scarce, swinging with demand. City shares replace the made-up companies (refunded): list your city to raise money, or invest in others.',
    'Neighbours: new goals and achievements for making friends, sending gifts, linking roads, trading and allying.',
    'The map: the land between cities is real countryside now, and each city’s border follows the land it owns. Grass has texture.',
    'Tapping the map now always acts on the ground tile you tap, not a tall building drawn over it. The free 3D view has been removed.',
  ]],
  ['1.16', [
    'The stock exchange: Market, Shares. Five companies whose prices move every day, the same for every player. Buy low, sell high, and collect a dividend every day from most of them.',
    'Alliance rankings in the Region panel: see which alliance is growing fastest this month (it wears the crown), or which is biggest.',
  ]],
  ['1.15', [
    'Your resources are always on show in the city card at the top left: water, power, food and building materials. Tap them for the full picture.',
    'Harvests: farms, orchards, power stations and every other producer build up a harvest while they work. Tap a building with a bubble over it to collect it.',
    'Building takes materials: every building lists its materials alongside its price. Materials of your own take $2 a load off.',
    'The build catalogue and building panels now say what each building makes and uses a day, and residents show what they need each day.',
    'A free 3D camera: press Free by the 3D and 2D buttons (or 3) to see your city in real 3D. Drag to turn, right-drag to move, scroll or pinch to zoom.',
    'Everything works in the free view: tap a building to select it (it glows), tap land to build, collect harvests, and watch cars and walkers go by. The sun follows the clock, and windows light up at night.',
    'Selecting a building in the normal view now outlines the building itself, not just its tile.',
  ]],
  ['1.13', [
    'The Market (X): sell food and materials to other cities, ask to buy what you need, or ask for a loan. Offers are open to every mayor in the world.',
    'What you offer is set aside until someone takes it or you withdraw it. Loans are repaid automatically on the day they’re due.',
    'Labour contracts: offer your jobless residents to another city for a daily fee. They fill its empty jobs, count as employed at home, and come back when the contract ends.',
    'Private messages: message a neighbour from their city panel, or a friend from Account, Friends. Only the two of you can read them.',
    'Fixed: a gift, a family moving in or a trade could occasionally be counted twice.',
  ]],
  ['1.12', [
    'Resources: water, power, four kinds of food (vegetables, fruit, dairy and meat) and building materials are now made, stored and used every day. See City stats, Resources.',
    'Food your farms don’t grow is bought in for a small price. The more kinds of food your city has, the happier people are.',
    'A water tower serves about 80 people and a power station 120: bigger cities need more than one, and the advisor will say when you’re running short.',
    'New buildings: orchard, dairy farm and ranch (research them), materials works (builders work 50% faster with materials in store) and warehouse (store more).',
    'The research list is now a technology tree with four branches: Farming, Industry, Energy and transport, and Society.',
    'Surplus food and materials sell automatically. Next update: trade them with other cities.',
  ]],
  ['1.11', [
    'A new world: plots now touch, rivers and coast run across them, and a thin yellow line marks each border. Your old city is still in the Classic world (World panel).',
    'Councils: buy the plot next to one of your cities (the dashed yellow outline) to found another city of your council. Switch between them in Account, Cities.',
    'Friends and co-mayors: add a neighbour as a friend from their city’s panel, then press Co in Account, Friends to let them help run your city.',
    'The desk: in a shared city one mayor plays at a time and the others watch it live. When the one playing is idle for two minutes, someone else can take over.',
    'Arrow keys can now step onto the plots next to yours.',
  ]],
  ['1.10', [
    'Slower days: a day now lasts 30 minutes, with 20 minutes of daylight and 10 of night. Builders still work fast, so a house goes up in about half a minute.',
    'Your city keeps living for up to 48 days (24 hours) while you’re away.',
    'Hire and fire: open a building to hire a resident into an open job, let staff go, or recruit a qualified worker from outside.',
    'Learning without school: adults can move up a level at a time in a library’s evening classes, and years on the job count as training. Now any town can staff its first high school and university.',
    'Interface size (small, normal or large) and menu layout (across, or down the sides) in Settings, Interface.',
    'Hide the whole interface with U or the new top-bar button, and make any panel bigger with its new button.',
  ]],
  ['1.9', [
    'Young towns get room to breathe: rubbish now needs handling from 45 people (was 25) and sewage from 70 (was 40), so the utility bills don’t all arrive at once.',
    'The advisor ranks leisure higher when many people have nothing to do in the evenings. A park is cheap and lifts everyone’s mood.',
    'A town that has emptied out but still has homes and money now attracts new people instead of sitting empty.',
    'Fairer leaderboards: the server now refuses impossible jumps in money, population and city age.',
  ]],
  ['1.8', [
    'Ελληνικά: the game now speaks Greek. Menus, buttons, panels, settings, buildings and the sign-in screens are translated; news items and tips follow in later updates.',
    'Language setting in Settings, Interface: Automatic (follows your device), English or Ελληνικά.',
    'City names, chat messages and guestbook notes are never translated.',
    'Building search understands both languages.',
  ]],
  ['1.7', [
    'Heritage: after 30 days a building becomes historic, drawing tourists and raising land value nearby. Protect one to keep it for good (and double its visitors); pulling down an unprotected one saddens residents.',
    'Monument: a grand landmark for big cities that draws crowds and lifts the whole street.',
    'Disaster insurance (Stats, Policy): a small daily premium, and disasters do 40% of the damage.',
    'City bonds (Stats, Budget): borrow from your own residents, no credit check, repaid with 12% interest over 30 days.',
    'Sell land back: tap an empty parcel you own to sell it for half of today’s price.',
    'Crowdfunding: while a resident’s request is open, the neighbours raise money towards it, paid to you when you build it.',
    'Leaderboards: fastest growing this month, and a hall of fame for the biggest and longest-lived cities ever.',
    'Music: a gentle generated soundtrack that turns wistful at night (Settings, Sound).',
    'Change any shortcut key in Settings, Keys.',
    'Thumb-friendly phone layouts for left or right hands (Settings, Interface).',
    'Hills now turn wintry with the rest of the land.',
    'Rubbish and sewage now give 5 days’ warning when your town grows past each line, like power and water do.',
    'A one-off emergency grant the first time a small town can’t pay its bills, so one bad week doesn’t end a young city.',
    'Fixed: an earthquake could stop the game with an error.',
  ]],
  ['1.6', [
    'Region panel (Y): regional projects and alliances.',
    'Regional projects: start a regional park, stadium, hospital or rail hub, and mayors across the world pay in. When it’s funded, every city that paid at least 5% gets the benefit.',
    'Alliances: found one with a 2–4 letter tag, invite up to 12 mayors, and chat privately. Tags show on the map, and each ally adds $15 of trade a day.',
    'Simple mode (Settings, Interface) hides research, policy, the bank and zoning for a calmer game.',
    'Stripes on info views, as well as colour, for players who find colours hard to tell apart.',
    'Each info view has its own sound. Repeated error sounds get quieter.',
    'Separate volume for city sounds, quiet while in a background tab, and vibration on phones.',
  ]],
  ['1.5', [
    'Research: graduates, libraries, universities and museums earn research points. Spend them in Stats, Research on eight projects, from green concrete to clean reactors.',
    'The metro: research it, then build stations. Underground trains carry people within 6 tiles of any two stations, with no track and no traffic.',
    'Eras: village, town (50 people), city (200) and metropolis (500). Each sends a grant and speeds research; your era shows beside the city name.',
    'Letters: unhappy residents write to you about the town’s weakest spot. Promise to fix it within 6 days, and keep your word.',
    'Elections have challengers now, running on whatever you’re worst at. You get three days’ warning.',
    'Some council decisions have follow-ups days later: the firm comes back, the festival wants to go yearly, the robots’ workers protest.',
    'Houses vary more (hipped roofs, chimneys), roofs are snowy in winter, and run-down buildings show cracks and smoke.',
    'Fixed: in winter the lawn stripes stayed bright green on the snow.',
  ]],
  ['1.4', [
    'Every resident has a character: sporty, bookish, night owl, homebody, nature lover or easy-going. It changes what makes them happy.',
    'Many households have a pet. Owners are happier, but worry once the town is big and has no vet. New: the Vet.',
    'Pensions: retirees draw $1 a day, so an ageing city costs more to run.',
    'School quality: schools short of teachers teach more slowly. Bookish children learn a little faster.',
    `Rubbish and sewage: from ${WASTE_POP} people build a landfill or recycling centre (which sells what it sorts); from ${SEWAGE_POP}, a sewage works. Without them, streets get dirty and illness spreads.`,
    'Timelapse: Stats, History, Watch your city grow. Scrub through every day and save it as a video.',
    'The Build bar hint no longer gets squashed on narrower screens.',
  ]],
  ['1.3', [
    'Terrain: rivers, coastline and hills that flow on across plot edges. Existing buildings all stay on dry land.',
    'Roads, footpaths and railways can bridge water (four times the price). Hills cost 40% more to build on, but their views raise land value; so does the waterfront.',
    'Floods now start along riverbanks.',
    'Harbour: build it by the water and ships pay full price for your goods; cruise visitors come ashore.',
    'Airport: crowds of tourists and extra trade for big cities. Loud, and it needs flat land.',
    'Daily challenges in Goals, worth $200 each.',
    'Mayor levels across all your cities, unlocking six more town hall flag colours. Your flag flies over your town hall for everyone to see.',
    'Undo history: right-click (or long-press) the undo button to go back several steps at once.',
    'While placing police, fire, power, water, stops or anything noisy, the map shows what it would cover.',
  ]],
  ['1.2', [
    'Weekly world challenges: one goal for everyone in a world, a new one each Monday. Every city that helped earns $600.',
    'Guestbooks: sign other cities’ guestbooks and read yours in the World panel.',
    'Gifts: send another mayor up to $1,000 a day, with a note.',
    'Chat reactions, and a slow mode (one message every 3 seconds) enforced by the server.',
    'Block players: hides their chat and guestbook notes and refuses their gifts. Unblock in Settings, Interface.',
    'Around the world: a live feed of new cities, falls, milestones and badges in the World panel.',
    'World creators can rename their private world.',
    'On phones, Save picture in photo mode opens the share sheet.',
  ]],
  ['1.1', [
    'Land value: parks, services, transit and clean air make streets sought-after; noise drags them down. New Land value info view.',
    'Rent: families without schooling on expensive streets feel the squeeze. An optional property tax brings money in, but can price people out.',
    'The city Daily: a front page with yesterday’s top story, the numbers and a three-day weather forecast. Hover the clock for the forecast too.',
    'An alerts inbox in News, so messages you missed aren’t lost.',
    'A 7-day money forecast in Stats, Budget, with a warning before you run out.',
    'Your city now keeps living for up to 20 days while you’re away (was 3), with a progress screen while it catches up.',
    'Open the same city in two tabs and the older one pauses instead of overwriting your saves.',
    'Quick-build bar with your last six buildings, and Upgrade all for a building type.',
    'Big purchases ask first. Population milestones are celebrated. New neighbours are announced.',
    'Download a copy of your city from Account. Guests get a reminder to save their city.',
    'Faster loading with a local copy of the database. An admin page for feedback, chat reports and chat moderation.',
  ]],
  ['1.0', [
    'Clean energy: solar farms and wind turbines, alongside the fossil power station.',
    'Air quality: fossil power, factories and traffic foul the air, making people ill and unhappy. Parks, urban farms and clean power help.',
    'Tourism: museums and stadiums draw visitors; hotels turn day trips into paying overnight stays.',
    'The bank: borrow against your credit rating and repay over 40 days.',
    'New policies: a congestion charge and a carbon tax.',
    'Earthquakes and tornadoes. Fire stations and hospitals limit the harm.',
    'New council votes: car-free Sundays, a four-day week, an expenses scandal and factory robots.',
    'City badges (Green City, Happy City, Transit City, Tourist Magnet, Metropolis) and five new leaderboards.',
    'Undo now reaches back five minutes. Easy-to-read font, a larger interface size, and spoken disaster alerts.',
    'Invite links for private worlds, and joining a friend’s world before founding a city.',
    'Saving: automatic retries with a saved/not saved indicator, and a clear reason when something goes wrong.',
    'Fixed: chat, families moving between cities and lifetime stats never saving; the join box being wiped; password reset messages.',
    'Balance: wages up, the mood penalty on tax is gentler, roads cost less to keep, and the advisor no longer suggests buildings nobody can staff.',
  ]],
];
function showChangelog() {
  openModal(`${closeX}<h2 id="modal-title">What’s new</h2><div class="changelog">${CHANGELOG.map(([v, list]) => `<h3>Version ${v}</h3><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`, 'wide');
}
const FAQ = [
  ['Why won’t my school or clinic open?', 'Services need staff with the right education. Tap the building to see which jobs are open. Build schools so residents qualify, or wait for qualified people to arrive.'],
  ['Why are people leaving?', 'Unhappy families move away. Open People and filter by Unhappy to see what’s on their minds, then fix the weakest need in the mood panel.'],
  ['My money keeps going down.', 'Upkeep is fixed even when people leave. In Stats, Budget shows where money goes. Lower service funding in Stats, Policy, or get more people into work.'],
  ['How do I connect to a neighbour?', 'Run a road or railway to your plot edge where the neighbour has one at the same spot. A bridge appears and the cities are linked.'],
  ['Why is time different when I come back?', 'Every city shares one world clock: a day lasts 30 minutes (20 of daylight, 10 of night). While you’re away your city keeps living for up to 48 days (24 hours), then waits for you.'],
  ['Can I get my guest city on another device?', 'Only if you save it as an account first: Account, then Account again, then Save as an account.'],
];
function showSupport() {
  openModal(`${closeX}<h2 id="modal-title">Help and support</h2>
    <div class="faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <div class="mfoot"><button class="btn" id="sup-tour">${icon('i-book')}Take the tour</button><button class="btn primary" id="sup-contact">Still stuck? Contact us</button></div>`, 'wide');
  $('sup-tour').onclick = () => { closeModal(); tut.start(0); };
  $('sup-contact').onclick = () => showFeedback('Question');
}
function showFeedback(kind = 'Bug') {
  openModal(`${closeX}<h2 id="modal-title">Send feedback</h2>
    <p class="soft">Found a bug, have an idea, or need help? It goes straight to the developer.</p>
    <div class="seg" role="radiogroup" aria-label="Type">${['Bug', 'Idea', 'Question', 'Other'].map((k) => `<button type="button" role="radio" aria-checked="${k === kind}" data-kind="${k}">${k}</button>`).join('')}</div>
    <label class="field"><span>${kind === 'Bug' ? 'What happened, and what did you expect?' : kind === 'Question' ? 'What do you need help with?' : 'Tell us more'}</span><textarea id="fb-text" rows="5" maxlength="2000"></textarea></label>
    <label class="field"><span>Email for a reply (optional)</span><input id="fb-email" type="email" autocomplete="email" value="${esc(user.email || '')}"></label>
    <label class="tgl"><input type="checkbox" id="fb-info" checked><span class="sw" aria-hidden="true"></span><span class="tl">Include game details<small>Your city, world, day, browser and screen size. Helps with bugs.</small></span></label>
    <p id="fb-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="fb-send">Send</button></div>`);
  modal.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { const t = $('fb-text').value; showFeedback(b.dataset.kind); $('fb-text').value = t; }; });
  $('fb-text').focus();
  $('fb-send').onclick = () => busy($('fb-send'), async () => {
    const text = $('fb-text').value.trim();
    if (text.length < 5) throw new Error('Write a little more so we can help.');
    const info = $('fb-info').checked ? { city: state?.name || '', world: world.id, plot: plotId || '', day: state?.day || 0, pop: state?.people.length || 0,
      browser: navigator.userAgent.slice(0, 200), screen: `${innerWidth}x${innerHeight}`, version: VERSION } : {};
    await fb.sendFeedback({ uid: user.uid, kind: modal.querySelector('[data-kind][aria-checked="true"]').dataset.kind, text: text.slice(0, 2000), email: $('fb-email').value.trim().slice(0, 120), ...info });
    closeModal();
    notify('Thanks! Your feedback was sent.', 'act');
    play('goal');
  }, $('fb-msg'));
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
    // Your own entry uses live numbers rather than the last save.
    const mine = sim.summary(state);
    const rows = [...plots.values()].map((p) => (p.mine ? { ...p, ...mine, ownerName: mayor } : p));
    const b = await fb.loadLeaderboards(world.id, rows);
    const alive = rows.filter((p) => p.status === 'alive' && (p.pop || 0) >= 10);
    const top = (key, f = (p) => p[key] || 0) => [...alive].sort((x, y) => f(y) - f(x)).slice(0, 10);
    const list = (rows, val) => rows.length
      ? `<ol>${rows.map((r) => `<li class="${r.mine || r.plotId === plotId ? 'me' : ''}"><span><b>${esc(r.name)}</b><small>${esc(r.ownerName)}</small></span><em class="num">${val(r)}</em></li>`).join('')}</ol>`
      : '<p class="soft">No cities yet.</p>';
    if (!modal.open) return;
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p class="soft small">${esc(world.name)}</p><div class="boards">
      <section><h3>${icon('i-people')}Biggest ever</h3>${list(b.peak, (r) => `${r.peakPop}`)}</section>
      <section><h3>${icon('i-clock')}Longest running</h3>${list(b.running, (r) => `${r.day} days`)}</section>
      <section><h3>${icon('i-flag')}Fallen cities</h3>${list(b.fallen, (r) => `${r.daysSurvived} days`)}</section>
      <section><h3>${icon('i-mood')}Happiest</h3>${list(top('happiness'), (r) => pct(r.happiness || 0))}</section>
      <section><h3>${icon('i-tree')}Greenest</h3>${list(top('green', (p) => (p.green ?? 1) * 100 + (p.pop || 0) / 1000), (r) => `${pct(r.green ?? 1)} clean`)}</section>
      <section><h3>${icon('i-bus')}Best transit</h3>${list(top('riders', (p) => (p.riders || 0) / Math.max(1, p.pop)), (r) => `${pct((r.riders || 0) / Math.max(1, r.pop))} ride`)}</section>
      <section><h3>${icon('i-coin')}Richest</h3>${list(top('money'), (r) => money(r.money || 0))}</section>
      <section><h3>${icon('i-look')}Tourist magnets</h3>${list(top('tourists'), (r) => `${r.tourists || 0} a day`)}</section>
      <section><h3>${icon('i-chart')}Fastest growing this month</h3>${list(rows.filter((p) => p.status === 'alive' && p.season === new Date().toISOString().slice(0, 7) && (p.growth || 0) > 0).sort((x, y) => y.growth - x.growth).slice(0, 10), (r) => `+${r.growth}`)}</section>
      <section><h3>${icon('i-trophy')}Hall of fame</h3>${(() => {
        const fallen = b.fallen || [], all = [...rows.map((p) => ({ name: p.name, ownerName: p.ownerName, peakPop: p.peakPop || 0, days: p.day || 0 })), ...fallen.map((f) => ({ name: f.name, ownerName: f.ownerName, peakPop: f.peakPop || 0, days: f.daysSurvived || 0 }))];
        const big = [...all].sort((x, y) => y.peakPop - x.peakPop)[0], old = [...all].sort((x, y) => y.days - x.days)[0];
        return big ? `<ol><li><span><b>${esc(big.name)}</b><small>Biggest city ever, ${esc(big.ownerName || '')}</small></span><em class="num">${big.peakPop}</em></li>
          ${old ? `<li><span><b>${esc(old.name)}</b><small>Longest-lived city, ${esc(old.ownerName || '')}</small></span><em class="num">${old.days} days</em></li>` : ''}</ol>` : '<p class="soft">No records yet.</p>';
      })()}</section></div>
      <p class="soft small">Happiest, greenest, transit, richest and tourism boards count cities with at least 10 people.</p>`, 'wide');
  } catch (e) {
    openModal(`${closeX}<h2 id="modal-title">Leaderboards</h2><p>Couldn't load leaderboards: ${esc(e.message)}</p>`);
  }
}

let settingsTab = 'display';
function showSettings() {
  const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
    `<button type="button" role="radio" aria-checked="${prefs[key] === v}" data-pref="${key}" data-val='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`;
  const tgl = (key, label, note = '') => `<label class="tgl"><input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">${label}${note ? `<small>${note}</small>` : ''}</span></label>`;
  const tabs = [['display', 'Display'], ['colours', 'Colours'], ['interface', 'Interface'], ['sound', 'Sound'], ['keys', 'Keys']];
  const panes = {
    display: `<div class="srow"><span>Theme</span>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
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
      ${tgl('mapContrast', 'High-contrast map', 'Dark outlines on every building so shapes stand out')}
      ${tgl('patterns', 'Stripes on info views', 'Traffic, mood, services, noise and land value show stripes as well as colour: more stripes, stronger')}
      ${tgl('shapes', 'Shape badges on buildings', 'Circle homes, square work, triangle shops, diamond education, star leisure, hexagon services')}`,
    interface: `<div class="srow"><span>Style</span><div class="styles" role="radiogroup" aria-label="Style">${[['auto', 'Newest', 'The newest style you’ve unlocked', null], ...STYLES.map((st) => [st.id, st.name, st.note, st])].map(([id, name, note, st]) => {
        const owned = !st || st.hall <= (state?.hall || 0), on = prefs.style === id || (id === 'auto' && !stylesOwned().some((x) => x.id === prefs.style));
        return `<button type="button" role="radio" class="stylecard ${owned ? '' : 'locked'}" data-pref="style" data-val='${JSON.stringify(id)}' aria-checked="${on}" ${owned ? '' : 'disabled'}>
          ${st ? `<span class="swatches">${Object.values(st.cols).slice(0, 5).map((c) => `<i style="background:${c}"></i>`).join('')}</span>` : ''}<b>${name}</b><small>${owned ? note : `Unlocks when your town hall is a ${HALL_LEVELS[st.hall].name.toLowerCase()}`}</small></button>`; }).join('')}</div></div>
      <div class="srow"><span>Language</span>${seg('lang', languages)}</div>
      <div class="srow"><span>Interface size</span>${seg('uiSize', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']])}</div>
      <div class="srow"><span>Menus</span>${seg('menus', [['across', 'Across'], ['down', 'Down the sides']])}</div>
      <p class="soft small">Menus, buttons and panels are translated; news items and tips are still in English for now.</p>
      <div class="srow"><span>Text and interface size</span>${seg('textSize', [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Larger'], [1.5, 'Largest']])}</div>
      <div class="srow"><span>Font</span>${seg('font', [['standard', 'Standard'], ['readable', 'Easy to read']])}</div>
      <p class="soft small">Easy to read uses Atkinson Hyperlegible with wider spacing, which many people with dyslexia find easier.</p>
      <div class="srow"><span>Notifications</span>${seg('notes', [['all', 'All'], ['warn', 'Warnings'], ['off', 'Off']])}</div>
      ${tgl('compact', 'Compact layout', 'Smaller panels and a tighter dock')}
      <div class="srow"><span>On phones</span>${seg('hand', [['off', 'Standard'], ['right', 'Right thumb'], ['left', 'Left thumb']])}</div>
      <p class="soft small">Thumb layouts put the panel buttons down the side you hold your phone with, with bigger buttons.</p>
      ${tgl('simple', 'Simple mode', 'Hides research, policy, the bank and zoning, for a calmer game. Everything still runs.')}
      ${tgl('minimap', 'Minimap')}
      ${tgl('alerts', 'Alerts when the game is in the background', 'Browser notifications for warnings like unpaid upkeep')}
      ${tgl('speak', 'Speak big moments aloud', 'The city summary, disasters and completed goals are read out')}
      <div class="srow"><span>Feedback</span><button class="btn" type="button" id="set-feedback">Send feedback</button></div>
      <div class="srow"><span>Blocked players</span><button class="btn" type="button" id="set-unblock" ${muted().size ? '' : 'disabled'}>Unblock all (${muted().size})</button></div>
      <div class="srow"><span>Photo mode</span><button class="btn" type="button" id="set-photo">Hide the interface (F)</button></div>`,
    keys: `<p class="soft small">Choose Change, then press the key you want. Arrows and W A S D move the map, + and − zoom, 1 to 7 pick road brushes and Escape cancels; those can’t be changed.</p>
      <ul class="keymap">${Object.entries(KEY_ACTIONS).map(([id, a]) => `<li><span>${a.label}</span><kbd>${esc(keyName(keyFor(id)))}</kbd><button class="btn" type="button" data-rekey="${id}">Change</button></li>`).join('')}</ul>
      <div class="mfoot"><button class="btn" type="button" id="keys-reset">Back to the usual keys</button></div>`,
    sound: `${tgl('music', 'Music', 'A gentle soundtrack that changes with the time of day')}
      <div class="srow"><span>Music volume</span><input type="range" min="0" max="1" step="0.05" value="${prefs.musicVolume}" data-pref="musicVolume" aria-label="Music volume"></div>
      ${tgl('sound', 'Sound effects', 'Shortcut: M')}
      ${tgl('ambient', 'City sounds', 'A soft traffic hum that follows how busy it is, and birds by day')}
      <div class="srow"><span>Effects volume</span><input type="range" min="0" max="1" step="0.05" value="${prefs.volume}" data-pref="volume" aria-label="Effects volume"></div>
      <div class="srow"><span>City sounds volume</span><input type="range" min="0" max="1" step="0.05" value="${prefs.ambientVolume}" data-pref="ambientVolume" aria-label="City sounds volume"></div>
      ${tgl('muteHidden', 'Quiet in the background', 'No sound while the game is in another tab')}
      ${tgl('haptics', 'Vibrate on phones', 'A small buzz when you build, finish a goal or hit an error')}`,
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
      setPref(k, v);
      showSettings();
      modal.querySelector(`[data-pref="${k}"][aria-checked="true"]`)?.focus();
    };
  });
  modal.querySelectorAll('input[type=checkbox][data-pref]').forEach((c) => {
    c.onchange = async () => {
      if (c.dataset.pref === 'alerts' && c.checked && 'Notification' in window && Notification.permission !== 'granted') {
        const r = await Notification.requestPermission();
        if (r !== 'granted') { c.checked = false; notify('Your browser blocked notifications for this site.', 'act'); return; }
      }
      setPref(c.dataset.pref, c.checked);
    };
  });
  $('set-photo')?.addEventListener('click', () => { closeModal(); togglePhoto(); });
  $('set-feedback')?.addEventListener('click', () => showFeedback());
  $('keys-reset')?.addEventListener('click', () => { prefs.keys = {}; savePrefs(prefs); showSettings(); notify('Keys are back to normal.', 'act'); });
  modal.querySelectorAll('[data-rekey]').forEach((b) => { b.onclick = () => {
    b.textContent = 'Press a key…';
    const grab = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      window.removeEventListener('keydown', grab, true);
      const k = ev.key.toLowerCase();
      if (k === 'escape') { showSettings(); return; }
      if (FIXED_KEYS.has(k) || k.length > 1) { notify(`${keyName(k)} can’t be used. Try a letter, number or symbol.`, 'act'); showSettings(); return; }
      const id = b.dataset.rekey, old = keyFor(id), clash = Object.keys(KEY_ACTIONS).find((x) => x !== id && keyFor(x) === k);
      prefs.keys = { ...(prefs.keys || {}), [id]: k };
      if (clash) prefs.keys[clash] = old;   // the two actions swap keys
      savePrefs(prefs); showSettings();
      if (clash) notify(`${KEY_ACTIONS[clash].label} moved to ${keyName(keyFor(clash))}.`, 'act');
    };
    window.addEventListener('keydown', grab, true);
  }; });
  $('set-unblock')?.addEventListener('click', () => { try { localStorage.removeItem('commons-muted'); } catch { /* ignore */ } notify('Everyone is unblocked.', 'act'); showSettings(); });
  modal.querySelectorAll('input[type=range][data-pref]').forEach((r) => {
    r.oninput = () => { prefs[r.dataset.pref] = +r.value; savePrefs(prefs); setSound(prefs.sound, prefs.volume, prefs.ambientVolume, prefs.haptics); };
    r.onchange = () => play('coin');
  });
}

function showAccount(tab = acctTab) {
  acctTab = tab;
  profile ||= { name: mayor, colour: acct.COLOURS[0], stats: acct.emptyLife(), achievements: {}, base: {} };
  const cities = [...myCities(), ...[...plots.values()].filter((p) => p.owner !== user.uid && (p.co || []).includes(user.uid))]
    .map((p) => ({ id: p.id, name: p.id === plotId ? state.name : p.name, pop: p.id === plotId ? state.people.length : p.pop, status: p.status, here: p.id === plotId, co: p.owner !== user.uid, owner: p.ownerName }));
  const friendList = friends().map((f) => ({ ...f, co: (me?.co || []).includes(f.uid) }));
  openModal(`${closeX}<h2 id="modal-title">Account</h2>${acct.accountHtml({ user, mayor, profile, s: state, world, colour: profile.colour || acct.COLOURS[0], cities, maxCities: MAX_CITIES, friends: friendList, canCo: !coMode && isOpen('co'), coLocked: !isOpen('co'), maxCo: MAX_CO }, tab)}`, 'wide');
  modal.querySelectorAll('[data-open-city]').forEach((b) => { b.onclick = () => { closeModal(); switchCity(b.dataset.openCity); }; });
  modal.querySelectorAll('[data-co]').forEach((b) => { b.onclick = () => busy(b, async () => { await toggleCo(b.dataset.co); showAccount('friends'); }, $('acct-msg')); });
  modal.querySelectorAll('[data-dm-friend]').forEach((b) => { b.onclick = () => { const [uid, ...n] = b.dataset.dmFriend.split('|'); closeModal(); openDM(uid, n.join('|')); }; });
  modal.querySelectorAll('[data-unfriend]').forEach((b) => { b.onclick = () => { profile.friends = friends().filter((f) => f.uid !== b.dataset.unfriend); profileDirty = true; save(); showAccount('friends'); }; });
  modal.querySelectorAll('[data-leave-co]').forEach((b) => { b.onclick = () => busy(b, async () => { await fb.leaveCo(b.dataset.leaveCo, user.uid); notify('You’re no longer a co-mayor there.', 'act'); if (b.dataset.leaveCo === plotId) enter(user); else showAccount('cities'); }, $('acct-msg')); });
  const msg = $('acct-msg');
  modal.querySelectorAll('[data-acct-tab]').forEach((b) => { b.onclick = () => showAccount(b.dataset.acctTab); });
  modal.querySelector(`[data-acct-tab="${tab}"]`)?.focus();
  $('acct-mayor-save')?.addEventListener('click', () => busy($('acct-mayor-save'), async () => {
    const v = $('acct-mayor').value.trim().slice(0, 24);
    if (!v) throw new Error('Type a name first.');
    mayor = v; profile.name = v; profileDirty = true;
    await save(coMode ? undefined : { ownerName: v });
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
    if (Date.now() - lastReset < RESET_WAIT) throw new Error('A link was sent a moment ago. Check your inbox and spam folder before asking for another.');
    await fb.resetPassword(user.email);
    lastReset = Date.now();
    formOk(msg, resetSent(user.email));
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
  $('acct-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'commons', version: VERSION, exported: new Date().toISOString(), world: world.id, plot: plotId, mayor, city: JSON.parse(sim.serialize(state)) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${state.name.replace(/[^\w ]/g, '')} day ${state.day}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    notify('Downloaded a copy of your city.', 'act');
  });
}
// Open another of your cities: it becomes your home in this world, so it's the one that loads next time.
async function switchCity(id) {
  if (id === plotId) return;
  await save();
  const p = plots.get(id);
  if (p && p.owner !== user.uid) { enter(user, id); return; }   // a friend's city you co-run: your home stays yours
  await fb.setHome(user, world.id, id);
  enter(user);
}
// The town hall grew: what the city can do now, and what's next.
function showHallUp(lv) {
  const i = HALL_LEVELS.indexOf(lv), next = HALL_LEVELS[i + 1], prev = HALL_LEVELS[i - 1];
  play('level'); afterChange(); save(); applyAll();
  const opens = [['co', 'Co-mayors: in Account, Friends, press Co to let a friend help run your city.'], ['council', 'More cities: select free land next to your city to buy it and found another.']]
    .filter(([f]) => sim.unlocked(state, f) && !sim.unlocked({ ...state, hall: i - 1 }, f)).map(([, t]) => `<li>${esc(t)}</li>`).join('');
  openModal(`${closeX}<h2 id="modal-title">${esc(state.name)} is now a ${esc(lv.name.toLowerCase())}</h2>
    <p>The town hall has grown. Your city can now:</p>
    ${STYLES.filter((st) => st.hall === i).map((st) => `<p class="good-t">New style unlocked: <b>${esc(st.name)}</b>. ${esc(st.note)} Switch in Settings, Interface.</p>`).join('')}
    <ul><li>buy up to ${lv.land} parcels of land (was ${prev.land})</li><li>store ${lv.store - prev.store} more of every resource</li><li>earn ${lv.rp} research points a day</li><li>employ more builders and clerks at the hall</li>${opens}</ul>
    ${next ? `<p class="soft">Next: a <b>${esc(next.name.toLowerCase())}</b> at ${next.pop} people. Goals shows what it needs.</p>` : '<p>It’s a metropolis: the biggest there is.</p>'}
    <div class="mfoot"><button class="btn" data-close>Keep playing</button><button class="btn primary" id="see-path">See what’s next</button></div>`);
  $('see-path').onclick = () => { closeModal(); drawer = null; openPanel('goals'); };
}
// A locked feature: what it is, which chapter opens it, and why it's worth getting to.
const FEATURE_NEEDS_TECH = (f) => ['market', 'shares', 'region'].includes(f);
function showLocked(feature) {
  openModal(`${closeX}<h2 id="modal-title">Not yet</h2>${panels.lockHtml(feature, state)}
    <div class="mfoot"><button class="btn" data-close>OK</button><button class="btn primary" id="see-path">${FEATURE_NEEDS_TECH(feature) ? 'Open Research' : 'See the town hall'}</button></div>`);
  $('see-path').onclick = () => { closeModal(); drawer = null; if (FEATURE_NEEDS_TECH(feature)) { statsTab = 'research'; openPanel('stats'); } else openPanel('goals'); };
}
function confirmDelete() {
  openModal(`${closeX}<h2 id="modal-title">Delete your account?</h2>
    <p>This can't be undone. Your sign-in, lifetime stats and achievements are deleted. ${esc(state.name)} falls into ruins and stays on the map with its record, where anyone can rebuild on it.</p>
    <label class="field"><span>Type DELETE to confirm</span><input id="del-confirm" autocomplete="off"></label>
    ${!user.isAnonymous && !user.providerData.some((p) => p.providerId === 'google.com') ? '<label class="field"><span>Your password</span><input id="del-pass" type="password" autocomplete="current-password"></label>' : ''}
    ${user.providerData.some((p) => p.providerId === 'google.com') ? '<p class="soft small">Google will ask you to confirm it’s you.</p>' : ''}
    <p id="del-msg" class="formmsg" role="alert"></p>
    <div class="mfoot"><button class="btn" data-close>Keep my account</button><button class="btn danger" id="del-go" disabled>Delete my account</button></div>`);
  $('del-confirm').oninput = (e) => { $('del-go').disabled = e.target.value.trim().toUpperCase() !== 'DELETE'; };
  $('del-go').onclick = () => busy($('del-go'), async () => {
    await fb.confirmIdentity($('del-pass')?.value || '');   // before anything is changed, so nothing half-happens
    if (state.status === 'alive') {
      const record = sim.collapse(state, 'deleted');
      await fb.savePlot(plotId, state);
      await fb.writeLegacy(user, plotId, mayor, record, world.id).catch(() => {});
    }
    await fb.deleteProfile(user.uid).catch(() => {});
    stopLoops();
    chatUnsub?.();
    await fb.deleteAccount();
    closeModal();
  }, $('del-msg'));
}

// ---------- notifications ----------
// 'act' is direct feedback on something the player just did, so it always shows.
const inbox = [];
function notify(msg, kind = 'info') {
  if (kind !== 'act' || /Couldn|failed|Saved again/.test(msg)) { inbox.push({ t: msg, k: kind, at: Date.now() }); if (inbox.length > 80) inbox.shift(); }
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
  if (kind === 'warn') { play('warn'); alertBrowser(msg); }
}
function announce(msg) {
  const el = $('sr');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

// Installable app: cache the game shell so it opens instantly and survives a flaky connection.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

window.__commonsReady = true;
