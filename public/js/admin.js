// A moderation and operations page: feedback, chat reports, chat moderation, and a full city dashboard -
// see who's live right now, inspect a city's resources/policy/research/military/recent news, add/remove
// money, fill resources, boost morale, trigger a disaster, rename, ban/unban, send a password reset.
// Access comes from an admins/{uid} document: create it with "npm run make-admin -- <email>" (once they've
// signed in at least once, below or in the game) or by hand in the Firebase console.
import * as fb from './firebase.js';
import * as sim from './sim.js';
import { RES, HALL_LEVELS } from './constants.js';

const { auth } = fb;
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = (t) => (t?.toDate ? t.toDate().toLocaleString() : '');
let tab = 'feedback', items = [], cities = [];
let cityFilter = 'all', citySearch = '', citySort = 'active', expanded = new Set(), details = new Map();
const ACTIVE_MS = 5 * 60 * 1000;   // a save within this long ago counts as "live"
const DISASTERS = [['storm', 'Storm'], ['fire', 'Fire'], ['earthquake', 'Earthquake'], ['flu', 'Flu outbreak'], ['blackout', 'Blackout'], ['unrest', 'Civil unrest']];

$('signin').onclick = () => fb.signInGoogle().catch((e) => { $('msg').textContent = fb.authMessage(e); });
$('emailform').onsubmit = (e) => {
  e.preventDefault();
  fb.signInEmail($('ad-email').value, $('ad-pass').value).catch((er) => { $('msg').textContent = fb.authMessage(er); });
};
$('ad-signup').onclick = () => {
  if (!$('ad-email').value || !$('ad-pass').value) { $('msg').textContent = 'Type an email and password first.'; return; }
  fb.createEmail($('ad-email').value, $('ad-pass').value).catch((e) => { $('msg').textContent = fb.authMessage(e); });
};
$('ad-signout').onclick = () => fb.signOutUser();
$('sendreset').onclick = async () => {
  const email = $('resetemail').value.trim();
  if (!email) { $('msg').textContent = 'Type the player’s email address first.'; return; }
  try { await fb.resetPassword(email); $('msg').textContent = `If ${email} has an account, a reset link is on its way.`; }
  catch (e) { $('msg').textContent = fb.authMessage(e); }
};

document.querySelectorAll('[data-tab]').forEach((b) => {
  b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    $('chatrow').hidden = tab !== 'chat' && tab !== 'cities';
    $('showdone').closest('label').hidden = tab === 'cities';
    load();
  };
});
$('showdone').onchange = draw;
$('loadchat').onclick = load;

fb.onAuth(async (u) => {
  if (!u) {
    $('who').textContent = 'Sign in with the account you made an admin.';
    $('signin').hidden = false; $('emailform').hidden = false;
    $('toolbar').hidden = true; $('resetrow').hidden = true; $('chatrow').hidden = true;
    $('list').innerHTML = ''; items = []; cities = [];
    return;
  }
  const ok = await fb.checkAdmin(u.uid);
  $('signin').hidden = true; $('emailform').hidden = true;
  $('who').innerHTML = ok ? `Signed in as ${esc(u.email || u.uid)}.`
    : `Signed in as ${esc(u.email || u.uid)}, but this account isn’t an admin yet. Ask whoever runs the project to add you - <code>npm run make-admin -- ${esc(u.email || '(your email)')}</code> - then reload.`;
  $('toolbar').hidden = !ok;
  $('resetrow').hidden = !ok;
  if (ok) load();
});

async function load() {
  $('msg').textContent = '';
  if (tab === 'cities') return loadCities();
  try {
    items = await fb.loadModeration(tab, $('world').value.trim() || 'main');
    draw();
  } catch (e) { $('msg').textContent = `Couldn’t load: ${e.message}. Are the latest firestore.rules deployed?`; }
}

function draw() {
  const all = $('showdone').checked;
  const list = items.filter((x) => all || x.status !== 'done');
  $('list').innerHTML = list.length ? list.map((x) => `
    <div class="item ${x.status === 'done' ? 'done' : ''}">
      <div class="meta">${esc(when(x.createdAt))} · ${esc(x.kind || tab)} · ${esc(x.name || x.email || x.uid || '')} ${x.city ? `· ${esc(x.city)}` : ''} ${x.world ? `· ${esc(x.world)}` : ''}</div>
      <pre>${esc(x.text || '')}</pre>
      ${x.author ? `<div class="meta">Reported author: ${esc(x.author)}</div>` : ''}
      ${x.browser ? `<div class="meta">${esc(x.browser)} · ${esc(x.screen || '')} · day ${esc(x.day)} · ${esc(x.version || '')}</div>` : ''}
      <div class="row">
        ${tab !== 'chat' && x.status !== 'done' ? `<button class="btn" data-done="${x.id}">Mark handled</button>` : ''}
        <button class="btn danger" data-del="${x.id}">Delete</button>
      </div>
    </div>`).join('') : '<p class="soft">Nothing here.</p>';
  $('list').querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { const x = items.find((i) => i.id === b.dataset.done); await fb.markHandled(x.path); x.status = 'done'; draw(); }; });
  $('list').querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this for good?')) return; const x = items.find((i) => i.id === b.dataset.del); await fb.adminDelete(x.path); items = items.filter((i) => i !== x); draw(); }; });
}

// ---------- cities: who's live, inspecting a save, and everything an admin can change about one ----------
async function loadCities() {
  try { cities = await fb.loadWorld($('world').value.trim() || 'main'); drawCities(); }
  catch (e) { $('msg').textContent = `Couldn’t load: ${e.message}.`; }
}

const lastActiveMs = (c) => c.updatedAt?.toMillis?.() ?? 0;
const isLive = (c) => c.status === 'alive' && Date.now() - lastActiveMs(c) < ACTIVE_MS;
function ago(ms) {
  if (!ms) return 'never saved';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function visibleCities() {
  const q = citySearch.trim().toLowerCase();
  let list = cities.filter((c) => {
    if (cityFilter === 'live' && !isLive(c)) return false;
    if (cityFilter === 'inactive' && (isLive(c) || c.status !== 'alive')) return false;
    if (cityFilter === 'fallen' && c.status === 'alive') return false;
    if (q && !`${c.name} ${c.ownerName} ${c.owner}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const by = { active: (a, b) => lastActiveMs(b) - lastActiveMs(a), money: (a, b) => (b.money || 0) - (a.money || 0), pop: (a, b) => (b.pop || 0) - (a.pop || 0), name: (a, b) => (a.name || '').localeCompare(b.name || '') };
  return list.sort(by[citySort] || by.active);
}

function drawCities() {
  const list = visibleCities();
  const live = cities.filter(isLive).length, fallen = cities.filter((c) => c.status !== 'alive').length;
  $('list').innerHTML = `
    <div class="citytools">
      <div class="meta">${cities.length} cities · ${live} live now · ${cities.length - live - fallen} inactive · ${fallen} fallen</div>
      <div class="row">
        <input type="text" id="citysearch" placeholder="Search name, mayor or uid…" value="${esc(citySearch)}">
        <div class="seg" role="radiogroup">${['all', 'live', 'inactive', 'fallen'].map((f) => `<button type="button" role="radio" aria-checked="${cityFilter === f}" data-cityfilter="${f}">${f[0].toUpperCase()}${f.slice(1)}</button>`).join('')}</div>
        <select id="citysort">
          <option value="active" ${citySort === 'active' ? 'selected' : ''}>Most recently active</option>
          <option value="money" ${citySort === 'money' ? 'selected' : ''}>Most money</option>
          <option value="pop" ${citySort === 'pop' ? 'selected' : ''}>Biggest population</option>
          <option value="name" ${citySort === 'name' ? 'selected' : ''}>Name</option>
        </select>
      </div>
    </div>
    ${list.length ? list.map(cityCard).join('') : '<p class="soft">No cities match.</p>'}`;
  wireCityControls();
}

function cityCard(c) {
  const fallen = c.status !== 'alive', badge = fallen ? '<span class="tag bad">Fallen</span>' : isLive(c) ? '<span class="tag good">Live</span>' : '<span class="tag">Inactive</span>';
  const open = expanded.has(c.id);
  return `<div class="item">
    <div class="meta">${esc(c.id)} · ${ago(lastActiveMs(c))} ${badge}</div>
    <div><b>${esc(c.name || 'City')}</b> — mayor ${esc(c.ownerName || '')} (<code>${esc(c.owner || '')}</code>) · day ${esc(c.day ?? 0)} · pop ${esc(c.pop ?? 0)} · $${esc(Math.floor(c.money ?? 0))}</div>
    <div class="row">
      <button class="btn" data-inspect="${c.id}">${open ? 'Hide details' : 'Inspect'}</button>
      <button class="btn danger" data-ban="${c.owner}">Ban mayor</button>
      <button class="btn" data-unban="${c.owner}">Unban</button>
    </div>
    ${open ? cityDetail(c) : ''}
  </div>`;
}

function cityDetail(c) {
  const s = details.get(c.id);
  if (s === undefined) return '<p class="soft">Loading…</p>';
  if (!s) return '<p class="soft">Couldn’t load this city’s save.</p>';
  const news = (s.log || []).slice(-8).reverse().map((n) => `<div class="meta">Day ${esc(n.d)}: ${esc(n.t)}</div>`).join('') || '<p class="soft">No recent news.</p>';
  return `<div class="detail">
    <div class="row"><b>${esc(HALL_LEVELS[sim.hallLevel(s)]?.name || 'City')}</b> · ${sim.troopCount(s)} troops, defence ${Math.round(sim.defenseRating(s))}</div>
    <div class="row">
      <b>Research</b>
      <span class="meta">${(s.tech || []).length} technologies unlocked</span>
      <label>Points <input type="number" min="0" value="${Math.floor(s.rp || 0)}" data-rp="${c.id}"></label>
      <button class="btn" data-setrp="${c.id}">Set points</button>
    </div>
    <div class="row">
      <b>Resources</b>
      <button class="btn" data-fillres="${c.id}">Fill all to capacity</button>
      <button class="btn" data-saveres="${c.id}">Save these amounts</button>
    </div>
    <div class="row">${Object.keys(RES).map((k) => `<label>${esc(RES[k].name)} <input type="number" min="0" value="${Math.floor(s.res?.[k] || 0)}" data-res="${c.id}" data-reskey="${k}"></label>`).join('')}</div>
    <div class="row">
      <b>Mood</b>
      <label>Set to <input type="number" min="0" max="100" value="${Math.round((s.happiness || 0) * 100)}" data-mood="${c.id}">%</label>
      <button class="btn" data-setmood="${c.id}">Set mood</button>
      <button class="btn" data-boostmood="${c.id}">+20% boost</button>
    </div>
    <div class="row">
      <b>Policy</b>
      <label>Tax <input type="number" step="0.05" min="0.8" max="1.3" value="${s.policy?.tax ?? 1}" data-tax="${c.id}"></label>
      <label>Funding <input type="number" step="0.05" min="0.7" max="1.2" value="${s.policy?.funding ?? 1}" data-funding="${c.id}"></label>
      <label><input type="checkbox" data-transit="${c.id}" ${s.policy?.freeTransit ? 'checked' : ''}> Free transit</label>
      <button class="btn" data-savepolicy="${c.id}">Save policy</button>
    </div>
    <div class="row">
      <b>Money</b>
      <input type="number" placeholder="Amount" data-amt="${c.id}">
      <button class="btn" data-addmoney="${c.id}">Add money</button>
      <button class="btn" data-removemoney="${c.id}">Remove money</button>
    </div>
    <div class="row">
      <b>Rename</b>
      <input type="text" value="${esc(c.name || '')}" data-cityname="${c.id}" placeholder="City name">
      <input type="text" value="${esc(c.ownerName || '')}" data-mayor="${c.id}" placeholder="Mayor name">
      <button class="btn" data-rename="${c.id}">Rename</button>
    </div>
    <div class="row"><b>Disasters</b> ${DISASTERS.map(([k, l]) => `<button class="btn danger" data-disaster="${c.id}" data-kind="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="row"><b>Recent news</b></div>
    ${news}
  </div>`;
}

function wireCityControls() {
  $('citysearch')?.addEventListener('input', (e) => {
    citySearch = e.target.value; drawCities();
    // drawCities() just replaced this input with a new node - put the caret back where it was.
    const el = $('citysearch'); el.focus(); el.setSelectionRange(citySearch.length, citySearch.length);
  });
  $('citysort')?.addEventListener('change', (e) => { citySort = e.target.value; drawCities(); });
  $('list').querySelectorAll('[data-cityfilter]').forEach((b) => { b.onclick = () => { cityFilter = b.dataset.cityfilter; drawCities(); }; });
  $('list').querySelectorAll('[data-inspect]').forEach((b) => { b.onclick = () => toggleInspect(b.dataset.inspect); });
  $('list').querySelectorAll('[data-ban]').forEach((b) => { b.onclick = () => banPlayer(b.dataset.ban, true); });
  $('list').querySelectorAll('[data-unban]').forEach((b) => { b.onclick = () => banPlayer(b.dataset.unban, false); });
  $('list').querySelectorAll('[data-rename]').forEach((b) => { b.onclick = () => renameCity(b.dataset.rename); });
  $('list').querySelectorAll('[data-addmoney]').forEach((b) => { b.onclick = () => adjustMoney(b.dataset.addmoney, 1); });
  $('list').querySelectorAll('[data-removemoney]').forEach((b) => { b.onclick = () => adjustMoney(b.dataset.removemoney, -1); });
  $('list').querySelectorAll('[data-setrp]').forEach((b) => { b.onclick = () => setResearch(b.dataset.setrp); });
  $('list').querySelectorAll('[data-fillres]').forEach((b) => { b.onclick = () => fillResources(b.dataset.fillres); });
  $('list').querySelectorAll('[data-saveres]').forEach((b) => { b.onclick = () => saveResources(b.dataset.saveres); });
  $('list').querySelectorAll('[data-boostmood]').forEach((b) => { b.onclick = () => boostMood(b.dataset.boostmood); });
  $('list').querySelectorAll('[data-setmood]').forEach((b) => { b.onclick = () => setMood(b.dataset.setmood); });
  $('list').querySelectorAll('[data-savepolicy]').forEach((b) => { b.onclick = () => savePolicy(b.dataset.savepolicy); });
  $('list').querySelectorAll('[data-disaster]').forEach((b) => { b.onclick = () => triggerDisaster(b.dataset.disaster, b.dataset.kind); });
}

async function toggleInspect(plotId) {
  if (expanded.has(plotId)) { expanded.delete(plotId); drawCities(); return; }
  expanded.add(plotId); drawCities();
  try {
    const json = await fb.getState(plotId);
    details.set(plotId, json ? sim.migrate(JSON.parse(json)) : null);
  } catch (e) { details.set(plotId, null); $('msg').textContent = `Couldn’t load city detail: ${e.message}.`; }
  drawCities();
}

// Reads a city's full save, lets the caller mutate the live sim state, then writes it back exactly like
// the game's own save() does - same function, same rules path, just signed in as an admin instead of the owner.
async function editState(plotId, mutate, extra = {}) {
  $('msg').textContent = '';
  try {
    const json = await fb.getState(plotId);
    if (!json) throw new Error('No save found for that city.');
    const s = sim.migrate(JSON.parse(json));
    mutate(s);
    await fb.savePlot(plotId, s, extra);
    if (expanded.has(plotId)) details.set(plotId, s);
    await loadCities();
  } catch (e) { $('msg').textContent = `Couldn’t save: ${e.message}.`; }
}

function adjustMoney(plotId, sign) {
  const amt = Number(qs(`[data-amt="${plotId}"]`).value);
  if (!Number.isFinite(amt) || amt <= 0) { $('msg').textContent = 'Enter a positive amount first.'; return; }
  editState(plotId, (s) => { s.money = Math.max(0, s.money + sign * amt); });
}
function setResearch(plotId) {
  const v = Number(qs(`[data-rp="${plotId}"]`).value);
  if (!Number.isFinite(v) || v < 0) { $('msg').textContent = 'Enter a research point total of 0 or more first.'; return; }
  editState(plotId, (s) => { s.rp = v; });
}
function fillResources(plotId) {
  editState(plotId, (s) => { const cap = sim.storeCap(s); for (const k of Object.keys(RES)) s.res[k] = cap; });
}
// Each resource's own input, exactly as typed - unlike fillResources, this can also set a resource to
// anything, including below what's there now, not just top it up to capacity.
function saveResources(plotId) {
  const values = {};
  for (const el of document.querySelectorAll(`[data-res="${plotId}"]`)) {
    const v = Number(el.value);
    if (Number.isFinite(v) && v >= 0) values[el.dataset.reskey] = v;
  }
  editState(plotId, (s) => { s.res = { ...s.res, ...values }; });
}
function boostMood(plotId) {
  editState(plotId, (s) => { for (const p of s.people) p.m = Math.min(1, p.m + 0.2); });
}
// Unlike boostMood, this sets an exact level and sticks: daily() only ever nudges s.happiness a quarter
// of the way toward the population's average mood each day, so without also setting every resident's own
// mood, a direct s.happiness assignment would just drift back to wherever it already was.
function setMood(plotId) {
  const pct = Number(qs(`[data-mood="${plotId}"]`).value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) { $('msg').textContent = 'Enter a mood between 0 and 100 first.'; return; }
  const v = pct / 100;
  editState(plotId, (s) => { s.happiness = v; for (const p of s.people) p.m = v; });
}
function savePolicy(plotId) {
  const tax = Number(qs(`[data-tax="${plotId}"]`).value), funding = Number(qs(`[data-funding="${plotId}"]`).value), transit = qs(`[data-transit="${plotId}"]`).checked;
  editState(plotId, (s) => {
    s.policy = s.policy || {};
    if (Number.isFinite(tax)) s.policy.tax = Math.min(1.3, Math.max(0.8, tax));
    if (Number.isFinite(funding)) s.policy.funding = Math.min(1.2, Math.max(0.7, funding));
    s.policy.freeTransit = transit;
  });
}
function triggerDisaster(plotId, kind) {
  editState(plotId, (s) => sim.adminDisaster(s, kind));
}
function renameCity(plotId) {
  const name = qs(`[data-cityname="${plotId}"]`).value.trim();
  const mayor = qs(`[data-mayor="${plotId}"]`).value.trim();
  editState(plotId, (s) => { if (name) s.name = name; }, mayor ? { ownerName: mayor } : {});
}
async function banPlayer(uid, on) {
  if (!uid) return;
  $('msg').textContent = '';
  try {
    await fb.setBanned(uid, on, auth.currentUser?.email || auth.currentUser?.uid || '');
    $('msg').textContent = on ? 'Banned - they can no longer save, chat, trade, gift or DM.' : 'Unbanned.';
  } catch (e) { $('msg').textContent = `Couldn’t ${on ? 'ban' : 'unban'}: ${e.message}.`; }
}
