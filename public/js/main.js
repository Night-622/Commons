import * as sim from './sim.js';
import {
  T, B, BUILDABLE, PLOT, TICK_MS, MAX_OFFLINE_DAYS, HOURS_PER_DAY, SAVE_EVERY_MS, RUBBLE_CLEAR_COST,
} from './constants.js';
import { Renderer, STRIDE } from './render.js';
import { firebaseConfig } from './config.js';
import * as fb from './firebase.js';

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Math.floor(n).toLocaleString()}`;
const pct = (n) => `${Math.round(n * 100)}%`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hourLabel = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : `${h % 12} ${h < 12 ? 'am' : 'pm'}`);

let user = null, plotId = null, me = null, state = null;
let traffic = null, totalsNow = null;
let tool = 'inspect', overlay = null, hover = null, dirty = true;
let saveTimer = null, lastSave = Date.now(), loopTimer = null, worldTimer = null, spaceHeld = false;
const plots = new Map();      // plot id -> render data
const byXY = new Map();       // "px,py" -> plot id

const canvas = $('map');
const renderer = new Renderer(canvas);

const TOOLS = [
  { id: 'inspect', name: 'Look', key: '1' },
  ...BUILDABLE.map((t, k) => ({ id: B[t].key, type: t, name: B[t].name, cost: B[t].cost, key: String(k + 2) })),
  { id: 'bulldoze', name: 'Clear', key: '8' },
];
const toolDef = (id) => TOOLS.find((t) => t.id === id);

// ---------- screens ----------

function show(which) {
  for (const id of ['login', 'loading', 'game']) $(id).classList.toggle('hidden', id !== which);
  if (which === 'game') { renderer.resize(); dirty = true; }
}

if (firebaseConfig.apiKey === 'REPLACE_ME') {
  $('login-err').textContent = 'Add your Firebase web config to public/js/config.js, then reload.';
  $('btn-signin').disabled = true;
}

$('btn-signin').onclick = async () => {
  $('login-err').textContent = '';
  try { await fb.signIn(); } catch (e) { $('login-err').textContent = e.message; }
};

fb.onAuth(async (u) => {
  if (!u) { stopLoops(); user = null; show('login'); return; }
  user = u;
  show('loading');
  try {
    const doc = await fb.ensurePlot(u);
    plotId = doc.id;
    state = JSON.parse(doc.state);
    me = toPlot(doc);
    plots.clear(); byXY.clear();
    addPlot(me);
    refreshDerived();
    const report = advance();
    syncMine();
    show('game');
    fitHome();
    buildTools();
    updateHud();
    startLoops();
    refreshWorld();
    if (state.status === 'ruins') showRuins();
    else if (report) showAway(report);
    else if (!localStorage.getItem('commons-seen-help')) showHelp();
  } catch (e) {
    console.error(e);
    show('login');
    $('login-err').textContent = `Couldn't load your plot: ${e.message}`;
  }
});

// ---------- plots ----------

function toPlot(d) {
  let st;
  try { st = JSON.parse(d.state); } catch { return null; }
  return {
    id: d.id, px: d.px, py: d.py, name: d.name, ownerName: d.ownerName, status: d.status,
    pop: d.pop, peakPop: d.peakPop, day: d.day, happiness: d.happiness, cityNo: d.cityNo,
    grid: st.grid, cond: st.cond, uc: new Set(st.queue.map((q) => q.i)),
    version: d.updatedAt?.toMillis?.() ?? 0, mine: d.owner === user.uid,
  };
}

function addPlot(p) {
  if (!p) return;
  plots.set(p.id, p);
  byXY.set(`${p.px},${p.py}`, p.id);
}

function syncMine() {
  Object.assign(me, {
    grid: state.grid, cond: state.cond, status: state.status, name: state.name,
    uc: sim.underConstruction(state), queueMap: new Map(state.queue.map((q) => [q.i, q])),
    pop: sim.totalPop(state), peakPop: state.peakPop, day: state.day, version: (me.version || 0) + 1,
  });
  dirty = true;
}

async function refreshWorld() {
  try {
    for (const d of await fb.loadWorld()) if (d.id !== plotId) addPlot(toPlot(d));
    dirty = true;
  } catch (e) { console.error('World load failed', e); }
}

// ---------- time ----------

function refreshDerived() {
  traffic = sim.computeTraffic(state);
  totalsNow = sim.totals(state);
}

// Runs every hour that is due. Returns a "while you were away" report for long gaps.
function advance() {
  const due = Math.floor((Date.now() - state.lastTick) / TICK_MS);
  if (due <= 0) return null;
  const cap = MAX_OFFLINE_DAYS * HOURS_PER_DAY;
  const before = { day: state.day, money: state.money, pop: sim.totalPop(state) };
  const n = Math.min(due, cap);
  for (let k = 0; k < n; k++) {
    const r = sim.tick(state);
    if (r.traffic) { traffic = r.traffic; totalsNow = r.totals; }
    if (r.collapsed) { onCollapse(r.collapsed); break; }
  }
  state.lastTick = due > cap || state.status !== 'alive' ? Date.now() : state.lastTick + n * TICK_MS;
  if (n < HOURS_PER_DAY) return null;
  return { ...before, capped: due > cap, days: state.day - before.day };
}

function startLoops() {
  stopLoops();
  loopTimer = setInterval(() => {
    if (!state) return;
    const had = state.day;
    advance();
    syncMine();
    updateHud();
    if (state.day !== had && $('inspector').dataset.i) inspectAgain();
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

function scheduleSave(ms = 2500) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, ms);
}

async function save() {
  if (!state || !plotId) return;
  clearTimeout(saveTimer);
  lastSave = Date.now();
  try {
    await fb.savePlot(plotId, state);
    $('save-state').textContent = 'Saved';
  } catch (e) {
    console.error(e);
    $('save-state').textContent = 'Not saved yet';
  }
}

// ---------- actions ----------

function afterChange() {
  refreshDerived();
  syncMine();
  updateHud();
  scheduleSave();
}

const isMine = (h) => h && me && h.px === me.px && h.py === me.py;

function act(h, quiet) {
  if (!isMine(h)) return;
  const def = toolDef(tool);
  const r = tool === 'bulldoze' ? sim.bulldoze(state, h.i) : sim.place(state, h.i, def.type);
  if (r.ok) afterChange();
  else if (!quiet || r.reason.startsWith('Needs')) toast(r.reason);
}

function click(h) {
  if (!h) return closeInspector();
  if (tool === 'inspect' || !isMine(h)) {
    if (!isMine(h) && tool !== 'inspect') {
      const p = plots.get(byXY.get(`${h.px},${h.py}`));
      toast(p ? `That plot belongs to ${p.ownerName}.` : 'Nobody has claimed that land yet.');
    }
    return inspect(h);
  }
  act(h, false);
}

function hoverOk(h) {
  if (!isMine(h) || tool === 'inspect') return true;
  if (tool === 'bulldoze') return state.grid[h.i] !== T.EMPTY && state.grid[h.i] !== T.HALL;
  return sim.canPlace(state, h.i, toolDef(tool).type).ok;
}

function onCollapse(record) {
  syncMine();
  save();
  fb.writeLegacy(user, plotId, record).catch((e) => console.error('Legacy write failed', e));
  showRuins(record);
}

// ---------- input ----------

const pointers = new Map();
let drag = null, pinch = null;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: gap(a, b), z: renderer.cam.z };
    drag = null;
    return;
  }
  const panOnly = e.button !== 0 || spaceHeld;
  const paints = !panOnly && (tool === 'road' || tool === 'bulldoze');
  const h = renderer.hit(e.offsetX, e.offsetY);
  drag = { x: e.offsetX, y: e.offsetY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false, paints: paints && isMine(h), last: null, button: e.button };
  if (drag.paints) { act(h, false); drag.last = h.i; }
});

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    renderer.zoomAt(mid.x, mid.y, (pinch.z * gap(a, b) / pinch.d) / renderer.cam.z);
    dirty = true;
    return;
  }
  const h = renderer.hit(e.offsetX, e.offsetY);
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.paints) {
      if (isMine(h) && h.i !== drag.last) { act(h, true); drag.last = h.i; }
    } else if (drag.moved) {
      renderer.cam.x = drag.cx - dx / renderer.cam.z;
      renderer.cam.y = drag.cy - dy / renderer.cam.z;
    }
  }
  const next = isMine(h) ? { ...h, ok: hoverOk(h) } : null;
  if (next?.i !== hover?.i || next?.ok !== hover?.ok || drag) { hover = next; dirty = true; }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
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

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || !state) return;
  if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); }
  const t = TOOLS.find((t) => t.key === e.key);
  if (t) selectTool(t.id);
  if (e.key === 't' || e.key === 'T') toggleTraffic();
  if (e.key === 'Escape') { selectTool('inspect'); closeInspector(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });
window.addEventListener('resize', () => { renderer.resize(); dirty = true; });

function frame() {
  if (dirty && state) {
    renderer.draw({ plots, hover, overlay, traffic });
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- camera buttons ----------

function fitHome() {
  renderer.centerOn(me.px, me.py);
  renderer.cam.z = Math.max(10, Math.min(40, (Math.min(renderer.w, renderer.h) * 0.8) / PLOT));
  dirty = true;
}
function fitWorld() {
  const all = [...plots.values()];
  const xs = all.map((p) => p.px), ys = all.map((p) => p.py);
  const minX = Math.min(...xs), maxX = Math.max(...xs) + 1, minY = Math.min(...ys), maxY = Math.max(...ys) + 1;
  renderer.cam.x = ((minX + maxX) / 2) * STRIDE;
  renderer.cam.y = ((minY + maxY) / 2) * STRIDE;
  const span = Math.max(maxX - minX, maxY - minY) * STRIDE + STRIDE;
  renderer.cam.z = Math.max(1.5, Math.min(8, Math.min(renderer.w, renderer.h) / span));
  dirty = true;
  refreshWorld();
}
function toggleTraffic() {
  overlay = overlay === 'traffic' ? null : 'traffic';
  $('btn-traffic').setAttribute('aria-pressed', overlay === 'traffic');
  dirty = true;
}

$('btn-home').onclick = fitHome;
$('btn-world').onclick = fitWorld;
$('btn-traffic').onclick = toggleTraffic;
$('btn-board').onclick = showBoard;
$('btn-help').onclick = showHelp;
$('btn-signout').onclick = async () => { await save(); fb.signOutUser(); };
$('city-name').onclick = showRename;
$('btn-rebuild').onclick = () => showRuins();

// ---------- toolbar & HUD ----------

function buildTools() {
  $('tools').innerHTML = TOOLS.map((t) => `
    <button class="tool" data-tool="${t.id}" aria-pressed="${t.id === tool}" title="${t.name} (${t.key})">
      <span class="swatch ${t.type === undefined ? 'swatch-' + t.id : ''}" style="--c:${t.type !== undefined ? B[t.type].color : 'transparent'}"></span>
      <span class="tname">${t.name}</span>
      <span class="tcost">${t.cost ? '$' + t.cost : t.id === 'bulldoze' ? 'free' : ''}</span>
    </button>`).join('');
  $('tools').onclick = (e) => { const b = e.target.closest('.tool'); if (b) selectTool(b.dataset.tool); };
}

function selectTool(id) {
  tool = id;
  for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', b.dataset.tool === id);
  canvas.dataset.tool = id;
  dirty = true;
}

function updateHud() {
  if (!state) return;
  const tot = totalsNow || sim.totals(state);
  const p = state.pop, pop = sim.totalPop(state), st = state.stats;
  const workforce = p.unskilled + p.teacher + p.pro;
  const net = st.income - st.upkeep;
  $('city-name').textContent = state.name;
  $('clock').textContent = state.status === 'ruins'
    ? `Fell on day ${state.day}`
    : `Day ${state.day}, ${hourLabel(state.hour)}${state.cityNo > 1 ? `. City ${state.cityNo} on this plot` : ''}`;
  $('btn-rebuild').classList.toggle('hidden', state.status !== 'ruins');
  $('ledger-body').innerHTML = `
    <div class="row"><dt>Money</dt><dd>${money(state.money)}<small class="${net < 0 ? 'neg' : ''}">${net >= 0 ? '+' : ''}${net} yesterday</small></dd></div>
    <div class="row"><dt>People</dt><dd>${pop}<small>peak ${state.peakPop}</small></dd></div>
    <div class="row"><dt>Happiness</dt><dd><span class="meter"><span style="width:${pct(state.happiness)}" class="${state.happiness < 0.4 ? 'low' : ''}"></span></span><small>${pct(state.happiness)}</small></dd></div>
    <div class="row"><dt>Homes</dt><dd>${pop}<small>of ${tot.homes}</small></dd></div>
    <div class="row"><dt>Jobs</dt><dd>${Math.round(tot.jobs)}<small>for ${workforce} workers</small></dd></div>
    <div class="row"><dt>Failed trips</dt><dd class="${st.failedTrips > pop * 0.2 ? 'warn' : ''}">${st.failedTrips}<small>yesterday</small></dd></div>
    <div class="row"><dt>Builders</dt><dd>${p.builder}<small>${state.queue.length ? `${state.queue.length} in the queue` : 'idle'}</small></dd></div>
    <div class="row"><dt>In school</dt><dd>${sim.students(state)}<small>${tot.seats} seats</small></dd></div>
    <div class="row"><dt>Graduates</dt><dd>${p.teacher + p.pro}<small>${p.teacher} teachers, ${p.pro} professionals</small></dd></div>
    ${state.unpaidDays ? `<p class="alert">Upkeep unpaid for ${state.unpaidDays} day${state.unpaidDays > 1 ? 's' : ''}. Buildings are decaying.</p>` : ''}`;
  for (const b of document.querySelectorAll('.tool')) {
    const t = toolDef(b.dataset.tool);
    b.classList.toggle('short', !!t.cost && state.money < t.cost);
  }
}

// ---------- inspector ----------

function closeInspector() { $('inspector').classList.add('hidden'); delete $('inspector').dataset.i; }
function inspectAgain() { const d = $('inspector').dataset; inspect({ px: +d.px, py: +d.py, i: +d.i }); }

function inspect(h) {
  const box = $('inspector');
  Object.assign(box.dataset, { px: h.px, py: h.py, i: h.i });
  let html;
  if (isMine(h)) html = inspectOwnTile(h.i);
  else {
    const p = plots.get(byXY.get(`${h.px},${h.py}`));
    html = p ? plotCard(p) : '<h3>Unclaimed land</h3><p>New players are given plots out here on the frontier.</p>';
  }
  box.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`;
  box.querySelector('.close').onclick = closeInspector;
  box.classList.remove('hidden');
}

function inspectOwnTile(i) {
  const t = state.grid[i];
  const q = state.queue.find((q) => q.i === i);
  if (t === T.EMPTY) return '<h3>Empty land</h3><p>Choose a building below, then click here to build.</p>';
  if (t === T.RUBBLE) return `<h3>Rubble</h3><p>Left over from a city that fell. Clear it for $${RUBBLE_CLEAR_COST} before building here.</p>`;
  if (q) {
    const pos = state.queue.indexOf(q);
    return `<h3>${B[t].name}</h3><p>Under construction: ${pct(1 - q.left / B[t].work)} done.</p>
      <p>${pos === 0 ? 'Builders are working on this now.' : `${pos} job${pos > 1 ? 's' : ''} ahead of it in the queue.`}
      More builders finish things faster. Graduates from school sometimes become builders.</p>`;
  }
  if (t === T.ROAD) {
    const load = traffic?.load[i] ?? 0, cap = traffic?.cap[i] || 1;
    return `<h3>Road</h3><p>Carries about ${Math.round(load)} trips a day. It jams above ${cap}.</p>
      ${load > cap ? '<p class="warn">Jammed. Add another route or move jobs and shops closer to homes.</p>' : ''}`;
  }
  const cond = t === T.HALL ? 100 : state.cond[i];
  const home = traffic?.homes.find((hm) => hm.i === i);
  let body = '';
  if (t === T.HALL) body = '<p>Your first homes, jobs and shop in one. It never decays and is where your first builders live.</p>';
  if (home) body += `<p>Getting to work: ${pct(home.workSucc)} of trips succeed.<br>Getting to shops: ${pct(home.shopSucc)} of trips succeed.</p>`;
  if (t === T.HOUSE && !home) body += '<p>Not connected. A house needs a road on one side.</p>';
  if (t === T.SHOP || t === T.WORK || t === T.SCHOOL) body += '<p>Needs a road on one side so people can reach it.</p>';
  if (t === T.PARK) body += '<p>Homes within three tiles are happier.</p>';
  const state_ = cond <= 0 ? 'Abandoned. Clear it and build again.' : cond < 40 ? `Decaying (${cond}%). Works at half capacity until upkeep is paid.` : `Condition ${Math.round(cond)}%.`;
  return `<h3>${B[t].name}</h3><p class="${cond < 40 ? 'warn' : ''}">${state_}</p>${body}`;
}

function plotCard(p) {
  if (p.status === 'ruins') {
    return `<div class="plaque"><h3>Ruins of ${esc(p.name)}</h3>
      <p>Built by ${esc(p.ownerName)}. Reached ${p.peakPop} people and lasted ${p.day} days.</p></div>`;
  }
  return `<h3>${esc(p.name)}</h3><p>${esc(p.ownerName)}'s city${p.cityNo > 1 ? `, the ${ordinal(p.cityNo)} on this plot` : ''}.</p>
    <dl class="mini"><div><dt>People</dt><dd>${p.pop}</dd></div><div><dt>Peak</dt><dd>${p.peakPop}</dd></div>
    <div><dt>Day</dt><dd>${p.day}</dd></div><div><dt>Happiness</dt><dd>${pct(p.happiness || 0)}</dd></div></dl>`;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------- modals ----------

const modal = $('modal');
function openModal(html) {
  $('modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
  for (const b of modal.querySelectorAll('[data-close]')) b.onclick = () => modal.close();
}

function showHelp() {
  localStorage.setItem('commons-seen-help', '1');
  openModal(`<h2>How Commons works</h2>
    <p>This is your plot on a shared map. Your neighbours are real players building next door.</p>
    <p>Lay roads out from the town hall, then put homes, workplaces and shops along them. People need to get to work and to the shops every day. When roads jam or places are out of reach, trips fail and people get unhappy.</p>
    <p>Unhappy people pay less tax and eventually leave. Upkeep doesn't shrink when they do, so a failing city can spiral: unpaid upkeep makes buildings decay, and a city that runs out of people and money falls into ruin.</p>
    <p>Schools turn newcomers into graduates with random jobs. Builders make construction faster, teachers speed up school, and professionals pay the most tax.</p>
    <p>A day passes every minute. When you're away, up to ${MAX_OFFLINE_DAYS} days pass.</p>
    <p class="keys">Drag or right-drag to pan. Scroll or pinch to zoom. Keys 1 to 8 pick tools, T shows traffic.</p>
    <button class="btn primary" data-close>Start building</button>`);
}

function showAway(r) {
  const pop = sim.totalPop(state);
  openModal(`<h2>${r.days} day${r.days === 1 ? '' : 's'} passed while you were away</h2>
    ${r.capped ? `<p>Time only runs for ${MAX_OFFLINE_DAYS} days without you, so your city waited for the rest.</p>` : ''}
    <p>Money went from ${money(r.money)} to ${money(state.money)}. Population went from ${r.pop} to ${pop}.</p>
    <button class="btn primary" data-close>Back to the city</button>`);
}

function showRuins(record) {
  const r = record || { name: state.name, peakPop: state.peakPop, daysSurvived: state.day };
  openModal(`<div class="plaque big"><h2>${esc(r.name)} has fallen</h2>
    <p>It reached ${r.peakPop} people and lasted ${r.daysSurvived} days. Its ruins stay on the map with this record.</p></div>
    <p>You can start again on the same land. The rubble stays and costs $${RUBBLE_CLEAR_COST} a tile to clear.</p>
    <label class="field">New city name<input id="rebuild-name" maxlength="32" value="New ${esc(r.name)}"></label>
    <div class="actions"><button class="btn" data-close>Look at the ruins</button><button class="btn primary" id="do-rebuild">Rebuild on the ruins</button></div>`);
  $('do-rebuild').onclick = () => {
    sim.rebuild(state, $('rebuild-name').value.trim() || state.name);
    state.lastTick = Date.now();
    afterChange();
    save();
    modal.close();
  };
}

function showRename() {
  openModal(`<h2>Rename your city</h2>
    <label class="field">City name<input id="rename" maxlength="32" value="${esc(state.name)}"></label>
    <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="do-rename">Save name</button></div>`);
  $('rename').select();
  $('do-rename').onclick = () => {
    const v = $('rename').value.trim();
    if (v) { state.name = v; afterChange(); save(); }
    modal.close();
  };
}

async function showBoard() {
  openModal('<h2>Leaderboards</h2><p>Loading…</p>');
  try {
    const b = await fb.loadLeaderboards();
    const list = (rows, val) => rows.length
      ? `<ol>${rows.map((r) => `<li><span>${esc(r.name)} <em>${esc(r.ownerName)}</em></span><b>${val(r)}</b></li>`).join('')}</ol>`
      : '<p class="empty">No cities yet.</p>';
    openModal(`<h2>Leaderboards</h2><div class="boards">
      <section><h3>Biggest ever</h3>${list(b.peak, (r) => `${r.peakPop} people`)}</section>
      <section><h3>Longest running</h3>${list(b.running, (r) => `${r.day} days`)}</section>
      <section><h3>Fallen cities</h3>${list(b.fallen, (r) => `${r.daysSurvived} days`)}</section>
      </div><button class="btn" data-close>Close</button>`);
  } catch (e) {
    openModal(`<h2>Leaderboards</h2><p>Couldn't load leaderboards: ${esc(e.message)}</p><button class="btn" data-close>Close</button>`);
  }
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
