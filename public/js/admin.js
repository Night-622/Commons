// A moderation and operations page: feedback, chat reports, chat moderation, and basic city admin -
// add/remove money, fill resources, rename a city or mayor, ban/unban, send a password reset.
// Access comes from an admins/{uid} document: create it with "npm run make-admin -- <email>" (once they've
// signed in at least once, below or in the game) or by hand in the Firebase console.
import * as fb from './firebase.js';
import * as sim from './sim.js';
import { RES } from './constants.js';

const V = '12.17.1';
const { collection, query, orderBy, limit, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

const { auth, db } = fb;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = (t) => (t?.toDate ? t.toDate().toLocaleString() : '');
let tab = 'feedback', items = [], cities = [];

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
  const ok = (await getDoc(doc(db, 'admins', u.uid)).catch(() => null))?.exists();
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
    const col = tab === 'chat' ? collection(db, 'worlds', $('world').value.trim() || 'main', 'chat') : collection(db, tab);
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(200)));
    items = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
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
  $('list').querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { const x = items.find((i) => i.id === b.dataset.done); await updateDoc(x.ref, { status: 'done' }); x.status = 'done'; draw(); }; });
  $('list').querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this for good?')) return; const x = items.find((i) => i.id === b.dataset.del); await deleteDoc(x.ref); items = items.filter((i) => i !== x); draw(); }; });
}

// ---------- cities: money, resources, renames, bans ----------
async function loadCities() {
  try { cities = await fb.loadWorld($('world').value.trim() || 'main'); drawCities(); }
  catch (e) { $('msg').textContent = `Couldn’t load: ${e.message}.`; }
}

function drawCities() {
  $('list').innerHTML = cities.length ? cities.map((c) => `
    <div class="item">
      <div class="meta">${esc(c.id)} · day ${esc(c.day ?? 0)} · pop ${esc(c.pop ?? 0)} · $${esc(Math.floor(c.money ?? 0))} ${c.status && c.status !== 'alive' ? `· ${esc(c.status)}` : ''}</div>
      <div class="row">
        <label class="field"><span>City name</span><input type="text" value="${esc(c.name || '')}" data-cityname="${c.id}"></label>
        <label class="field"><span>Mayor name</span><input type="text" value="${esc(c.ownerName || '')}" data-mayor="${c.id}"></label>
        <button class="btn" data-rename="${c.id}">Rename</button>
        <span class="meta">owner <code>${esc(c.owner || '')}</code></span>
      </div>
      <div class="row">
        <input type="number" placeholder="Amount" data-amt="${c.id}">
        <button class="btn" data-addmoney="${c.id}">Add money</button>
        <button class="btn" data-removemoney="${c.id}">Remove money</button>
        <button class="btn" data-fillres="${c.id}">Fill resources</button>
      </div>
      <div class="row">
        <button class="btn danger" data-ban="${c.owner}">Ban this mayor</button>
        <button class="btn" data-unban="${c.owner}">Unban</button>
      </div>
    </div>`).join('') : '<p class="soft">No cities in that world.</p>';
  $('list').querySelectorAll('[data-rename]').forEach((b) => { b.onclick = () => renameCity(b.dataset.rename); });
  $('list').querySelectorAll('[data-addmoney]').forEach((b) => { b.onclick = () => adjustMoney(b.dataset.addmoney, 1); });
  $('list').querySelectorAll('[data-removemoney]').forEach((b) => { b.onclick = () => adjustMoney(b.dataset.removemoney, -1); });
  $('list').querySelectorAll('[data-fillres]').forEach((b) => { b.onclick = () => fillResources(b.dataset.fillres); });
  $('list').querySelectorAll('[data-ban]').forEach((b) => { b.onclick = () => setBanned(b.dataset.ban, true); });
  $('list').querySelectorAll('[data-unban]').forEach((b) => { b.onclick = () => setBanned(b.dataset.unban, false); });
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
    await loadCities();
  } catch (e) { $('msg').textContent = `Couldn’t save: ${e.message}.`; }
}

function adjustMoney(plotId, sign) {
  const amt = Number($(`[data-amt="${plotId}"]`).value);
  if (!Number.isFinite(amt) || amt <= 0) { $('msg').textContent = 'Enter a positive amount first.'; return; }
  editState(plotId, (s) => { s.money = Math.max(0, s.money + sign * amt); });
}
function fillResources(plotId) {
  editState(plotId, (s) => { const cap = sim.storeCap(s); for (const k of Object.keys(RES)) s.res[k] = cap; });
}
function renameCity(plotId) {
  const name = $(`[data-cityname="${plotId}"]`).value.trim();
  const mayor = $(`[data-mayor="${plotId}"]`).value.trim();
  editState(plotId, (s) => { if (name) s.name = name; }, mayor ? { ownerName: mayor } : {});
}
async function setBanned(uid, on) {
  if (!uid) return;
  $('msg').textContent = '';
  try {
    if (on) await setDoc(doc(db, 'banned', uid), { at: new Date(), by: auth.currentUser?.email || auth.currentUser?.uid || '' });
    else await deleteDoc(doc(db, 'banned', uid));
    $('msg').textContent = on ? 'Banned - they can no longer save, chat, trade, gift or DM.' : 'Unbanned.';
  } catch (e) { $('msg').textContent = `Couldn’t ${on ? 'ban' : 'unban'}: ${e.message}.`; }
}
