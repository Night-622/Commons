// A stand-in for public/js/firebase.js with the same exports, for browser smoke tests.
// Data lives in localStorage, so tabs in one browser context share it. window.__fakeFb lets a test
// make saves fail (e.g. __fakeFb.failSaves = 'unavailable') and inspect what was written.
import { WORLD_ID, OPEN_WORLDS } from './constants.js';
import { spiral } from './spiral.js';
import { newCity, serialize, summary, mapString, ensureTerrain } from './sim.js';

const KEY = 'fakefb';
const ctl = (window.__fakeFb = window.__fakeFb || { failSaves: null, saves: 0 });
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
let db = load();
db.docs ||= {};
const persist = () => { localStorage.setItem(KEY, JSON.stringify(db)); fire(); };
const TIME_KEYS = ['createdAt', 'updatedAt', 'endedAt'];
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000) });
const out = (id, d) => { if (!d) return null; const o = { id, ...structuredClone(d) }; for (const k of TIME_KEYS) if (typeof o[k] === 'number') o[k] = ts(o[k]); return o; };
const get = (path) => db.docs[path] || null;
const set = (path, data) => { db.docs[path] = { ...data }; };
const merge = (path, data) => { db.docs[path] = { ...(db.docs[path] || {}), ...data }; };
const del = (path) => { delete db.docs[path]; };
const under = (col) => Object.entries(db.docs).filter(([k]) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/')).map(([k, v]) => out(k.slice(col.length + 1), v));
const now = () => Date.now();
const newId = () => Math.random().toString(36).slice(2, 12);
const fail = (code, message = code) => { const e = new Error(message); e.code = code; return e; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Listeners re-run their query after every write, in this tab or another.
const listeners = new Set();
function fire() { for (const l of listeners) queueMicrotask(l); }
addEventListener('storage', (e) => { if (e.key === KEY) { db = load(); db.docs ||= {}; fire(); } });
function listen(run) { const l = () => run(); listeners.add(l); queueMicrotask(l); return () => listeners.delete(l); }

// ---------- auth ----------
let user = db.user || null;
const authCbs = new Set();
const mkUser = (o) => ({ uid: o.uid, isAnonymous: !!o.isAnonymous, email: o.email || null, displayName: o.displayName || null, providerData: o.email ? [{ providerId: 'password' }] : [] });
function setUser(u) { user = u ? mkUser(u) : null; db.user = u; auth.currentUser = user; persist(); for (const cb of authCbs) setTimeout(() => cb(user), 0); }
export const auth = { currentUser: user ? mkUser(user) : null };
export const onAuth = (cb) => { authCbs.add(cb); setTimeout(() => cb(user ? mkUser(user) : null), 0); return () => authCbs.delete(cb); };
export const signInGuest = async () => { setUser({ uid: 'guest' + newId(), isAnonymous: true }); return { user }; };
export const signInGoogle = async () => { setUser({ uid: 'google' + newId(), email: 'google@example.com', displayName: 'Googler' }); return { user }; };
export const redirectResult = async () => null;
export async function signInEmail(email, pass) {
  const a = db.accounts?.[email.trim()];
  if (!a || a.pass !== pass) throw fail('auth/invalid-credential');
  setUser({ uid: a.uid, email: email.trim() }); return { user };
}
export async function createEmail(email, pass) {
  db.accounts ||= {};
  if (db.accounts[email.trim()]) throw fail('auth/email-already-in-use');
  if (String(pass).length < 6) throw fail('auth/weak-password');
  db.accounts[email.trim()] = { uid: 'mail' + newId(), pass };
  return signInEmail(email, pass);
}
export async function resetPassword(email) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())) { const e = new Error('Type the email address you signed up with.'); e.code = 'auth/invalid-email'; throw e; }
  ctl.resets = (ctl.resets || 0) + 1;
}
export const signOutUser = async () => setUser(null);
export async function upgradeWithEmail(email) { setUser({ ...db.user, isAnonymous: false, email }); }
export async function upgradeWithGoogle() { setUser({ ...db.user, isAnonymous: false, email: 'google@example.com' }); }
export const setDisplayName = async (name) => { db.user = { ...db.user, displayName: name }; persist(); };
export function authMessage(e) {
  const c = String(e?.code || '');
  if (c.includes('permission-denied')) return 'The server refused that. The game’s security rules are probably out of date: run “npm run deploy:rules” in the Commons folder.';
  if (c.includes('unavailable')) return 'Can’t reach the server right now. Check your connection; the game will keep trying.';
  const m = String(e?.message || '');
  return m && !/^Firebase|\(auth\/|\(firestore\//.test(m) ? m : `Something went wrong${c ? ` (${c})` : ''}. Please try again.`;
}

// ---------- worlds ----------
const linkPath = (uid, world) => (world === 'public' ? `users/${uid}` : `memberships/${uid}_${world}`);
export async function getWorld(id) {
  if (OPEN_WORLDS[id]) return { id, name: OPEN_WORLDS[id], private: false };
  const w = get(`worlds/${id}`);
  return w ? { id, ...w } : null;
}
export async function myWorlds(u) {
  const mine = Object.entries(db.docs).filter(([k, v]) => k.startsWith('memberships/') && v.uid === u.uid).map(([, v]) => v.world);
  return [...Object.entries(OPEN_WORLDS).map(([id, name]) => ({ id, name, private: false })), ...(await Promise.all(mine.map(getWorld))).filter((w) => w && !OPEN_WORLDS[w.id])];
}
export async function createWorld(u, name) {
  const id = 'w' + newId(), code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  set(`worlds/${id}`, { name, owner: u.uid, code, private: true, nextIndex: 0, createdAt: now() });
  set(`worldCodes/${code}`, { world: id });
  persist();
  return { id, name, code, private: true };
}
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export async function findWorldByCode(raw) {
  const c = cleanCode(raw);
  if (c.length !== 6) throw new Error('Invite codes are 6 letters and numbers, like K7Q2MX.');
  const code = get(`worldCodes/${c}`);
  if (!code) throw new Error('No world has that code. Check it and try again.');
  const w = await getWorld(code.world);
  if (!w) throw new Error('That world no longer exists.');
  return w;
}

// ---------- plots ----------
export async function findPlot(u, world = WORLD_ID) {
  await tick();
  const link = get(linkPath(u.uid, world));
  if (!link) return null;
  const p = get(`plots/${link.plotId}`);
  if (!p || p.owner !== u.uid) return null;
  return { ...out(link.plotId, p), state: get(`plotState/${link.plotId}`)?.state };
}
function cleanSummary(state) {
  const s = JSON.parse(JSON.stringify(summary(state)));
  s.money = Number.isFinite(s.money) ? s.money : 0;
  s.name = String(s.name || 'City').slice(0, 40); s.status = s.status || 'alive';
  return s;
}
export async function claimPlot(u, mayor, cityName, world = WORLD_ID) {
  await tick();
  if (get(linkPath(u.uid, world))) throw new Error('You already have a plot in this world. Reload the page.');
  const w = get(`worlds/${world}`);
  if (!w && !OPEN_WORLDS[world]) throw new Error('That world no longer exists.');
  let n = w ? w.nextIndex : 0, x, y, id;
  for (;;) { ({ x, y } = spiral(n)); id = `${world}_${x}_${y}`; if (!get(`plots/${id}`)) break; n++; }
  const state = newCity(cityName);
  ensureTerrain(state, x, y, world);
  const data = { owner: u.uid, ownerName: mayor, world, px: x, py: y, index: n, createdAt: now(), updatedAt: now(), ...cleanSummary(state), map: mapString(state) };
  set(`plots/${id}`, data);
  set(`plotState/${id}`, { state: serialize(state) });
  set(linkPath(u.uid, world), world === 'public' ? { plotId: id, createdAt: now() } : { uid: u.uid, world, plotId: id, createdAt: now() });
  merge(`worlds/${world}`, { nextIndex: n + 1 });
  persist();
  return { ...out(id, data), state: serialize(state) };
}
export async function takeOverRuins(u, mayor, targetId, newState, world = WORLD_ID) {
  const p = get(`plots/${targetId}`);
  if (!p || p.status !== 'ruins') throw new Error('Someone has already rebuilt there.');
  const data = { owner: u.uid, ownerName: mayor, ...cleanSummary(newState), map: mapString(newState), updatedAt: now() };
  merge(`plots/${targetId}`, data);
  set(`plotState/${targetId}`, { state: serialize(newState) });
  merge(linkPath(u.uid, world), { plotId: targetId, uid: u.uid, world, createdAt: now() });
  persist();
  return { ...out(targetId, get(`plots/${targetId}`)), state: serialize(newState) };
}
export async function buyPlot(u, mayor, via, px, py, cityName, world = WORLD_ID) {
  const id = `${world}_${px}_${py}`, link = get(linkPath(u.uid, world));
  if (get(`plots/${id}`)) throw new Error('Someone has already claimed that plot.');
  if (!link) throw new Error('Found your first city before buying more land.');
  const state = newCity(cityName);
  ensureTerrain(state, px, py, world);
  state.money = 1500;
  const data = { owner: u.uid, ownerName: mayor, world, px, py, index: -1, via, createdAt: now(), updatedAt: now(), ...cleanSummary(state), map: mapString(state) };
  set(`plots/${id}`, data);
  set(`plotState/${id}`, { state: serialize(state) });
  link.plotIds = [...(link.plotIds || [link.plotId]), id];
  persist();
  return { ...out(id, data), state: serialize(state) };
}
export const setHome = async (u, world, plotId) => { merge(linkPath(u.uid, world), { plotId }); persist(); };
export async function getPlot(id) { await tick(); const p = get(`plots/${id}`); return p ? { ...out(id, p), state: get(`plotState/${id}`)?.state } : null; }
export const usingLegacySaves = () => false;
export async function savePlot(id, state, extra = {}) {
  await tick();
  if (ctl.failSaves) throw fail(ctl.failSaves);
  const p = get(`plots/${id}`);
  if (!p || p.owner !== user?.uid) throw fail('permission-denied');
  set(`plotState/${id}`, { state: serialize(state) });
  merge(`plots/${id}`, { ...cleanSummary(state), map: mapString(state), ...JSON.parse(JSON.stringify(extra)), updatedAt: now() });
  ctl.saves++;
  persist();
}
export async function getState(id) { await tick(); return get(`plotState/${id}`)?.state || null; }
export async function loadWorld(world = WORLD_ID) { await tick(); return under('plots').filter((p) => p.world === world); }
export async function writeLegacy(u, plotId, mayor, record, world = WORLD_ID) { set(`legacy/${newId()}`, { ...record, plotId, world, owner: u.uid, ownerName: mayor, endedAt: now() }); persist(); }
export async function loadLeaderboards(world, plots) {
  const fallen = under('legacy').filter((d) => d.world === world).sort((a, b) => (b.daysSurvived || 0) - (a.daysSurvived || 0)).slice(0, 10);
  return { peak: [...plots].sort((a, b) => (b.peakPop || 0) - (a.peakPop || 0)).slice(0, 10), running: plots.filter((p) => p.status === 'alive').slice(0, 10), fallen };
}

// ---------- profile ----------
export async function getProfile(uid) { const p = get(`profiles/${uid}`); return p ? structuredClone(p) : null; }
export const deleteProfile = async (uid) => { del(`profiles/${uid}`); persist(); };
export const saveProfile = async (uid, data) => { merge(`profiles/${uid}`, JSON.parse(JSON.stringify(data))); persist(); };
export async function confirmIdentity() {}
export async function deleteAccount() { setUser(null); }

// ---------- chat ----------
export function listenChat(world, cb) {
  return listen(() => cb(under(`worlds/${world}/chat`).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()).slice(-60)));
}
export async function sendChat(world, u, name, city, text) {
  if (now() - (db.lastChat || 0) < 3000) { const x = new Error('Slow down: one message every few seconds.'); x.code = 'slow'; throw x; }
  db.lastChat = now();
  set(`worlds/${world}/chat/${newId()}`, { uid: u.uid, name, city, text, createdAt: now() });
  persist();
}
export async function react(world, msgId, uid, emoji) {
  const m = get(`worlds/${world}/chat/${msgId}`); if (!m) return;
  m.reactions ||= {}; if (emoji) m.reactions[uid] = emoji; else delete m.reactions[uid];
  persist();
}

// ---------- guestbooks, gifts, region ----------
export async function guestbook(world, plotId) { return under(`worlds/${world}/guestbook`).filter((d) => d.plot === plotId); }
export async function signGuestbook(world, plotId, u, name, city, text) {
  set(`worlds/${world}/guestbook/${plotId}_${u.uid}_${Math.floor(now() / 86400000)}`, { plot: plotId, uid: u.uid, name, city, text, createdAt: now() }); persist();
}
export const deleteNote = async (world, id) => { del(`worlds/${world}/guestbook/${id}`); persist(); };
export async function sendGift(world, gift) { set(`worlds/${world}/gifts/${newId()}`, { ...gift, createdAt: now() }); persist(); }
export const listenGifts = (world, uid, cb) => listen(() => cb(under(`worlds/${world}/gifts`).filter((g) => g.toOwner === uid)));
export const finishGift = async (world, id) => { del(`worlds/${world}/gifts/${id}`); persist(); };
export const renameWorld = async (id, name) => { merge(`worlds/${id}`, { name }); persist(); };
export const listenProjects = (world, cb) => listen(() => cb(under(`worlds/${world}/projects`)));
export async function startProject(world, u, byName, type, name, goal) {
  const id = newId(); set(`worlds/${world}/projects/${id}`, { type, name, goal, raised: 0, by: u.uid, byName, members: {}, done: false, createdAt: now() }); persist(); return { id };
}
export async function contribute(world, projectId, uid, amount) {
  const d = get(`worlds/${world}/projects/${projectId}`);
  if (!d) throw new Error('That project is gone.');
  if (d.done) throw new Error('That project is already finished.');
  const add = Math.min(amount, d.goal - d.raised);
  d.members[uid] = (d.members[uid] || 0) + add; d.raised += add; d.done = d.raised >= d.goal;
  persist();
  return { add, done: d.done };
}
export const listenAlliances = (world, cb) => listen(() => cb(under(`worlds/${world}/alliances`)));
export async function createAlliance(world, u, name, tag) { const id = newId(); set(`worlds/${world}/alliances/${id}`, { name, tag, owner: u.uid, members: [u.uid], createdAt: now() }); persist(); return { id }; }
export async function joinAlliance(world, id, uid) { const a = get(`worlds/${world}/alliances/${id}`); if (!a.members.includes(uid)) a.members.push(uid); persist(); }
export async function leaveAlliance(world, id, uid) { const a = get(`worlds/${world}/alliances/${id}`); a.members = a.members.filter((m) => m !== uid); persist(); }
export const deleteAlliance = async (world, id) => { del(`worlds/${world}/alliances/${id}`); persist(); };
export const listenAllianceChat = (world, id, cb) => listen(() => cb(under(`worlds/${world}/alliances/${id}/chat`).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())));
export async function sendAllianceChat(world, id, u, name, text) { set(`worlds/${world}/alliances/${id}/chat/${newId()}`, { uid: u.uid, name, text, createdAt: now() }); persist(); }

// ---------- live world, moves, likes, reports, feedback ----------
export function listenWorld(world, cb) {
  let seen = {};
  return listen(() => {
    const changed = under('plots').filter((p) => p.world === world && seen[p.id] !== p.updatedAt?.toMillis());
    for (const p of changed) seen[p.id] = p.updatedAt?.toMillis();
    if (changed.length || !Object.keys(seen).length) cb(changed);
  });
}
export async function sendMove(world, move) { set(`worlds/${world}/moves/${newId()}`, { ...move, createdAt: now() }); persist(); }
export const listenMoves = (world, uid, cb) => listen(() => cb(under(`worlds/${world}/moves`).filter((m) => m.toOwner === uid)));
export const finishMove = async (world, id) => { del(`worlds/${world}/moves/${id}`); persist(); };
export async function likes(world, plotId, uid) {
  const all = under(`worlds/${world}/likes`).filter((l) => l.plot === plotId);
  return { count: all.length, mine: all.some((l) => l.uid === uid) };
}
export async function setLike(world, plotId, uid, on) { if (on) set(`worlds/${world}/likes/${plotId}_${uid}`, { plot: plotId, uid, createdAt: now() }); else del(`worlds/${world}/likes/${plotId}_${uid}`); persist(); }
export async function report(world, uid, what) { set(`reports/${newId()}`, { world, uid, ...what, createdAt: now() }); persist(); }
export async function sendFeedback(data) { set(`feedback/${newId()}`, { ...data, createdAt: now() }); persist(); }
