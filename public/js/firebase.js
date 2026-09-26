const V = '12.17.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, signInAnonymously, signOut, GoogleAuthProvider, EmailAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, linkWithPopup, linkWithCredential, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, deleteUser,
  reauthenticateWithCredential, reauthenticateWithPopup,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, updateDoc, runTransaction, collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp, setDoc, onSnapshot, deleteDoc, writeBatch, deleteField, getCountFromServer, arrayUnion, arrayRemove,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
import { firebaseConfig } from './config.js';
import { WORLD_ID, OPEN_WORLDS, REBUILD_MONEY, RESET_AT } from './constants.js';
import { spiral } from './spiral.js';
import { newCity, serialize, summary, mapString, ensureTerrain } from './sim.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
try { auth.useDeviceLanguage(); } catch { /* older SDKs */ }
// A local copy of the database makes reloads quick and lets the game read while briefly offline.
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { console.warn('Offline cache unavailable', e); db = getFirestore(app); }
const google = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
const code = (e) => String(e?.code || '');
const denied = (e) => code(e).includes('permission-denied');

// ---------- auth ----------
export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signInGuest = () => signInAnonymously(auth);
// Pop-ups are blocked on some phones and in-app browsers; a full-page redirect works there instead.
export async function signInGoogle() {
  try { return await signInWithPopup(auth, google()); }
  catch (e) {
    if (/popup-blocked|operation-not-supported-in-this-environment|web-storage-unsupported/.test(code(e))) return signInWithRedirect(auth, google());
    throw e;
  }
}
// Surfaces any error from a redirect sign-in that finished while the page was away.
export const redirectResult = () => getRedirectResult(auth);
export const signInEmail = (email, pass) => signInWithEmailAndPassword(auth, email.trim(), pass);
export const createEmail = (email, pass) => createUserWithEmailAndPassword(auth, email.trim(), pass);
// The link brings the player back to the game after they choose a new password. If this domain isn't on the
// authorised list in the Firebase console, send the plain reset email rather than failing.
export async function resetPassword(email) {
  const to = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { const e = new Error('Type the email address you signed up with.'); e.code = 'auth/invalid-email'; throw e; }
  const back = /^https?:/.test(location.origin) ? { url: location.origin + '/', handleCodeInApp: false } : null;
  try { await sendPasswordResetEmail(auth, to, back || undefined); }
  catch (e) {
    if (back && /unauthorized-continue-uri|invalid-continue-uri|unauthorized-domain|missing-continue-uri/.test(code(e))) await sendPasswordResetEmail(auth, to);
    else throw e;
  }
}
export const signOutUser = () => signOut(auth);

// Turning a guest into a real account keeps the same user id, so the city comes along.
export async function upgradeWithEmail(email, pass) {
  await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, pass));
}
export async function upgradeWithGoogle() {
  await linkWithPopup(auth.currentUser, google());
}
export const setDisplayName = (name) => updateProfile(auth.currentUser, { displayName: name });

export function authMessage(e) {
  const c = code(e);
  if (c.includes('permission-denied')) return 'The server refused that. The game’s security rules are probably out of date: run “npm run deploy:rules” in the Commons folder.';
  if (c.includes('unavailable') || c.includes('deadline-exceeded')) return 'Can’t reach the server right now. Check your connection; the game will keep trying.';
  if (c.includes('resource-exhausted') || c.includes('quota-exceeded')) return 'The server is over its daily limit. Try again later.';
  if (c.includes('failed-precondition') && /index/i.test(e?.message || '')) return 'The database needs an index. Open the browser console for the link that creates it.';
  if (c.includes('user-disabled')) return 'This account has been switched off.';
  if (c.includes('requires-recent-login')) return 'For safety, sign out and back in, then try again.';
  if (c.includes('unauthorized-domain')) return 'This web address isn’t allowed to sign in. Add it under Authentication, Settings, Authorised domains in the Firebase console.';
  if (c.includes('missing-email')) return 'Type your email address first.';
  if (c.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (c.includes('missing-password')) return 'Enter a password.';
  if (c.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (c.includes('email-already-in-use')) return 'That email already has an account. Sign in instead.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is wrong.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Wait a minute and try again.';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in window closed before finishing.';
  if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site.';
  if (c.includes('credential-already-in-use') || c.includes('provider-already-linked')) return 'That account already has its own city. Sign out, then sign in with it.';
  if (c.includes('operation-not-allowed') || c.includes('admin-restricted')) return 'This sign-in method isn’t switched on yet in the Firebase console.';
  if (c.includes('network')) return 'No connection. Check your internet and try again.';
  const m = String(e?.message || '');
  return m && !/^Firebase|\(auth\/|\(firestore\//.test(m) ? m : `Something went wrong${c ? ` (${c})` : ''}. Please try again.`;
}

// ---------- worlds ----------
// The public world keeps the original users/{uid} record. Private worlds use memberships/{uid}_{world}.
const linkRef = (uid, world) => (world === 'public' ? doc(db, 'users', uid) : doc(db, 'memberships', `${uid}_${world}`));

export async function getWorld(id) {
  if (OPEN_WORLDS[id]) return { id, name: OPEN_WORLDS[id], private: false };
  const w = await getDoc(doc(db, 'worlds', id));
  return w.exists() ? { id, ...w.data() } : null;
}

export async function myWorlds(user) {
  const snap = await getDocs(query(collection(db, 'memberships'), where('uid', '==', user.uid), limit(20)));
  const found = await Promise.all(snap.docs.map((m) => getWorld(m.data().world).catch(() => null)));
  // Private worlds from before the latest fresh start (1.18, 1.2, then 1.3) aren't listed any more.
  return [...Object.entries(OPEN_WORLDS).map(([id, name]) => ({ id, name, private: false })), ...found.filter((w) => w && !OPEN_WORLDS[w.id] && (w.createdAt?.toMillis?.() ?? 0) >= RESET_AT)];
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function createWorld(user, name) {
  const id = 'w' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  await runTransaction(db, async (tx) => {
    const taken = await tx.get(doc(db, 'worldCodes', code));
    if (taken.exists()) throw new Error('Please try again.');
    tx.set(doc(db, 'worlds', id), { name, owner: user.uid, code, private: true, nextIndex: 0, createdAt: serverTimestamp() });
    tx.set(doc(db, 'worldCodes', code), { world: id });
  });
  return { id, name, code, private: true };
}

export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export async function findWorldByCode(raw) {
  const c = cleanCode(raw);
  if (c.length !== 6) throw new Error('Invite codes are 6 letters and numbers, like K7Q2MX.');
  const snap = await getDoc(doc(db, 'worldCodes', c));
  if (!snap.exists()) throw new Error('No world has that code. Check it and try again.');
  const w = await getWorld(snap.data().world);
  if (!w) throw new Error('That world no longer exists.');
  return w;
}

// ---------- plots ----------
export async function findPlot(user, world = WORLD_ID) {
  const link = await getDoc(linkRef(user.uid, world));
  if (!link.exists()) return null;
  const p = await getDoc(doc(db, 'plots', link.data().plotId));
  if (!p.exists() || p.data().owner !== user.uid) return null;
  const data = { id: p.id, ...p.data() };
  if (!data.state) data.state = await getState(p.id);
  if (!data.state) throw new Error('Your city’s save couldn’t be read. Reload the page; if it keeps happening, deploy the latest firestore.rules.');
  return data;
}

// Claims the next frontier plot. A transaction keeps two players from getting the same slot.
// If the server still runs the older rules (before saves were split in two), claim the old way.
export async function claimPlot(user, mayor, cityName, world = WORLD_ID) {
  try { return await claimPlotTx(user, mayor, cityName, world, false); }
  catch (e) {
    if (!denied(e)) throw e;
    console.warn('Claim refused with split saves; trying a one-document save (deploy firestore.rules to fix).', e);
    try { const r = await claimPlotTx(user, mayor, cityName, world, true); legacySaves = true; return r; }
    catch { throw e; }
  }
}
async function claimPlotTx(user, mayor, cityName, world, legacy) {
  const lref = linkRef(user.uid, world);
  const worldRef = doc(db, 'worlds', world);
  return runTransaction(db, async (tx) => {
    const w = await tx.get(worldRef);
    const already = await tx.get(lref);
    if (already.exists()) throw new Error('You already have a plot in this world. Reload the page.');
    if (!w.exists() && !OPEN_WORLDS[world]) throw new Error('That world no longer exists.');
    // Someone may already hold the next slots (plots bought next to a city): take the first free one.
    let n = w.exists() ? w.data().nextIndex : 0, x, y, id;
    for (let tries = 0; ; tries++) {
      ({ x, y } = spiral(n));
      id = `${world}_${x}_${y}`;
      if (!(await tx.get(doc(db, 'plots', id))).exists()) break;
      if (tries >= 25) throw new Error('The frontier is busy. Please try again.');
      n++;
    }
    const state = newCity(cityName);
    ensureTerrain(state, x, y, world);
    const data = {
      owner: user.uid, ownerName: mayor, world, px: x, py: y, index: n,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...cleanSummary(state), map: mapString(state),
    };
    if (legacy) tx.set(doc(db, 'plots', id), { ...data, state: serialize(state) });
    else {
      tx.set(doc(db, 'plots', id), data);
      tx.set(doc(db, 'plotState', id), { state: serialize(state) });
    }
    if (world === 'public') tx.set(lref, { plotId: id, createdAt: serverTimestamp() });
    else tx.set(lref, { uid: user.uid, world, plotId: id, createdAt: serverTimestamp() });
    if (w.exists()) tx.update(worldRef, { nextIndex: n + 1 });
    else tx.set(worldRef, { nextIndex: 1 });
    return { id, ...data, state: serialize(state) };
  });
}

// Start a new city on someone else's ruins. The rubble stays; newState is prepared by the caller.
export async function takeOverRuins(user, mayor, targetId, newState, world = WORLD_ID) {
  const lref = linkRef(user.uid, world);
  const pref = doc(db, 'plots', targetId);
  return runTransaction(db, async (tx) => {
    const p = await tx.get(pref);
    const link = await tx.get(lref);
    if (!p.exists() || p.data().status !== 'ruins') throw new Error('Someone has already rebuilt there.');
    const data = { owner: user.uid, ownerName: mayor, ...cleanSummary(newState), map: mapString(newState), updatedAt: serverTimestamp(), state: deleteField() };
    tx.update(pref, data);
    tx.set(doc(db, 'plotState', targetId), { state: serialize(newState) });
    if (link.exists()) tx.update(lref, { plotId: targetId });
    else if (world === 'public') tx.set(lref, { plotId: targetId, createdAt: serverTimestamp() });
    else tx.set(lref, { uid: user.uid, world, plotId: targetId, createdAt: serverTimestamp() });
    return { id: targetId, ...p.data(), ...data, state: serialize(newState) };
  });
}

// Buy the plot next to one of your cities (`via`) and start a new city of your council there.
export async function buyPlot(user, mayor, via, px, py, cityName, world = WORLD_ID) {
  const lref = linkRef(user.uid, world), id = `${world}_${px}_${py}`;
  return runTransaction(db, async (tx) => {
    const taken = await tx.get(doc(db, 'plots', id));
    const link = await tx.get(lref);
    if (taken.exists()) throw new Error('Someone has already claimed that plot.');
    if (!link.exists()) throw new Error('Found your first city before buying more land.');
    const ids = link.data().plotIds || [link.data().plotId];
    const state = newCity(cityName);
    ensureTerrain(state, px, py, world);
    state.money = REBUILD_MONEY;
    const data = { owner: user.uid, ownerName: mayor, world, px, py, index: -1, via, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...cleanSummary(state), map: mapString(state) };
    tx.set(doc(db, 'plots', id), data);
    tx.set(doc(db, 'plotState', id), { state: serialize(state) });
    tx.update(lref, { plotIds: [...ids, id] });
    return { id, ...data, state: serialize(state) };
  });
}
// ---------- the market ----------
// worlds/{w}/offers: open offers to sell, buy or borrow. worlds/{w}/deals: money or goods on their way to a mayor.
export const newOfferId = (world) => doc(collection(db, 'worlds', world, 'offers')).id;
export function postOffer(world, id, offer) {
  return setDoc(doc(db, 'worlds', world, 'offers', id), { ...offer, status: 'open', createdAt: serverTimestamp() });
}
export const cancelOffer = (world, id) => updateDoc(doc(db, 'worlds', world, 'offers', id), { status: 'cancelled' });
export const clearOffer = (world, id) => deleteDoc(doc(db, 'worlds', world, 'offers', id));
export function listenOffers(world, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'offers'), where('status', '==', 'open'), limit(100)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Market', e));
}
export function listenMyOffers(world, uid, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'offers'), where('owner', '==', uid), limit(30)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('My offers', e));
}
// Taking an offer and sending your side of it happen together, so nobody gets one without the other.
export async function takeOffer(world, id, user, plotId, name, deal) {
  const ref = doc(db, 'worlds', world, 'offers', id);
  return runTransaction(db, async (tx) => {
    const o = await tx.get(ref);
    if (!o.exists() || o.data().status !== 'open') throw new Error('Someone got there first.');
    tx.update(ref, { status: 'taken', takenBy: user.uid, takenPlot: plotId, takenName: name, takenAt: serverTimestamp() });
    tx.set(doc(collection(db, 'worlds', world, 'deals')), { ...deal, offer: id, from: user.uid, createdAt: serverTimestamp() });
    return { id, ...o.data() };
  });
}
export const sendDeal = (world, user, deal) => addDoc(collection(db, 'worlds', world, 'deals'), { ...deal, from: user.uid, createdAt: serverTimestamp() });
export function listenDeals(world, uid, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'deals'), where('toOwner', '==', uid), limit(30)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Deals', e));
}
export const finishDeal = (world, id) => deleteDoc(doc(db, 'worlds', world, 'deals', id));

// ---------- city shares ----------
// worlds/{w}/stocks/{plotId}: a listed city: how many of its shares were put up (float) and how many are still unsold.
export const listStock = (world, plotId, user, city, float) =>
  setDoc(doc(db, 'worlds', world, 'stocks', plotId), { owner: user.uid, city, float, available: float, createdAt: serverTimestamp() });
export function listenStocks(world, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'stocks'), limit(100)), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Stocks', e));
}
// Buying takes shares off the counter (delta < 0); selling puts them back. A transaction, so two buyers can't take the same ones.
export async function tradeStock(world, plotId, delta) {
  const ref = doc(db, 'worlds', world, 'stocks', plotId);
  return runTransaction(db, async (tx) => {
    const st = await tx.get(ref);
    if (!st.exists()) throw new Error('That city isn’t listed any more.');
    const available = st.data().available + delta;
    if (available < 0) throw new Error(`Only ${st.data().available} shares are for sale.`);
    if (available > st.data().float) throw new Error('The exchange can’t take back more shares than were listed.');
    tx.update(ref, { available });
    return available;
  });
}
export const delistStock = (world, plotId) => deleteDoc(doc(db, 'worlds', world, 'stocks', plotId));

// ---------- private messages ----------
// dms/{pair}/messages: a conversation between two players (pair = both uids, sorted, joined with _).
// inbox/{uid}/threads/{other}: one line per conversation, so you hear about new messages without listening to them all.
export const dmPair = (a, b) => [a, b].sort().join('_');
export async function sendDM(user, myName, other, otherName, text) {
  const b = writeBatch(db), last = String(text).slice(0, 80);
  b.set(doc(collection(db, 'dms', dmPair(user.uid, other), 'messages')), { uid: user.uid, name: myName, text, createdAt: serverTimestamp() });
  b.set(doc(db, 'inbox', other, 'threads', user.uid), { name: myName, last, at: serverTimestamp(), unread: true });
  b.set(doc(db, 'inbox', user.uid, 'threads', other), { name: otherName, last, at: serverTimestamp(), unread: false });
  return b.commit();
}
export function listenThreads(uid, cb) {
  return onSnapshot(query(collection(db, 'inbox', uid, 'threads'), orderBy('at', 'desc'), limit(30)),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), (e) => console.error('Inbox', e));
}
export function listenDM(me, other, cb) {
  return onSnapshot(query(collection(db, 'dms', dmPair(me, other), 'messages'), orderBy('createdAt', 'desc'), limit(50)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()), (e) => console.error('Messages', e));
}
export const markRead = (uid, other) => updateDoc(doc(db, 'inbox', uid, 'threads', other), { unread: false });

// ---------- co-mayors and the desk ----------
// The owner sets who else can run a city (plots/{id}.co, up to 3 uids).
export const setCoMayors = (plotId, uids) => updateDoc(doc(db, 'plots', plotId), { co: uids, updatedAt: serverTimestamp() });
// A co-mayor stepping down removes only themselves.
export const leaveCo = (plotId, uid) => updateDoc(doc(db, 'plots', plotId), { co: arrayRemove(uid), updatedAt: serverTimestamp() });
// Cities you co-run, in any world.
export async function coCities(uid) {
  const snap = await getDocs(query(collection(db, 'plots'), where('co', 'array-contains', uid), limit(20)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// desks/{plotId}: who is playing a shared city right now, stamped every ~20 seconds.
export const takeDesk = (plotId, user, name, idle = false) => setDoc(doc(db, 'desks', plotId), { uid: user.uid, name, at: serverTimestamp(), idle });
export function listenDesk(plotId, cb) {
  return onSnapshot(doc(db, 'desks', plotId), (d) => cb(d.exists() ? d.data() : null), (e) => console.error('Desk', e));
}
// Watching a shared city: its full save, as the mayor at the desk saves it.
export function listenState(plotId, cb) {
  return onSnapshot(doc(db, 'plotState', plotId), (d) => { if (d.exists()) cb(d.data().state); }, (e) => console.error('Watching', e));
}

// Which of your cities opens when you come back.
export const setHome = (user, world, plotId) => updateDoc(linkRef(user.uid, world), { plotId });
export async function getPlot(id) {
  const p = await getDoc(doc(db, 'plots', id));
  if (!p.exists()) return null;
  const data = { id: p.id, ...p.data() };
  if (!data.state) data.state = await getState(p.id);
  return data;
}

// Firestore rejects undefined anywhere in a write, which an old save missing a field would otherwise trip.
function tidy(v) {
  if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return null;
  if (Array.isArray(v)) return v.map(tidy);
  if (v && typeof v === 'object' && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && k) o[k] = tidy(x);
    return o;
  }
  return v;
}
function cleanSummary(state) {
  const s = tidy(summary(state));
  s.money = Number.isFinite(s.money) ? s.money : 0;
  s.pop = s.pop || 0; s.peakPop = s.peakPop || s.pop; s.day = s.day || 0; s.cityNo = s.cityNo || 1; s.happiness = s.happiness || 0;
  s.name = String(s.name || 'City').slice(0, 40); s.status = s.status || 'alive';
  return s;
}

// Everyone listens to the small summary; the full save sits in plotState and is fetched only up close.
// When the server still has the rules from before that split, the whole city goes into the plot document instead.
let legacySaves = false;
export const usingLegacySaves = () => legacySaves;
export async function savePlot(id, state, extra = {}) {
  const json = serialize(state);
  const top = { ...cleanSummary(state), map: mapString(state), ...tidy(extra), updatedAt: serverTimestamp() };
  if (!legacySaves) {
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'plotState', id), { state: json });
      b.update(doc(db, 'plots', id), { ...top, state: deleteField() });
      return await b.commit();
    } catch (e) {
      if (!denied(e) || json.length >= 200000) throw e;
      try { await updateDoc(doc(db, 'plots', id), { ...top, state: json }); }
      catch { throw e; }   // the one-document save failed too, so the first reason is the useful one
      legacySaves = true;
      console.warn('Saved in the older one-document format. Deploy firestore.rules (npm run deploy:rules) to switch back.', e);
      return;
    }
  }
  return updateDoc(doc(db, 'plots', id), { ...top, state: json });
}
export async function getState(id) {
  try {
    const d = await getDoc(doc(db, 'plotState', id));
    if (d.exists()) return d.data().state;
  } catch (e) { if (!denied(e)) throw e; }
  const p = await getDoc(doc(db, 'plots', id));
  return p.exists() ? p.data().state || null : null;
}

export async function loadWorld(world = WORLD_ID) {
  const snap = await getDocs(query(collection(db, 'plots'), where('world', '==', world), limit(400)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function writeLegacy(user, plotId, mayor, record, world = WORLD_ID) {
  return addDoc(collection(db, 'legacy'), {
    ...record, plotId, world, owner: user.uid, ownerName: mayor, endedAt: serverTimestamp(),
  });
}

// Leaderboards for one world. Plot boards come from the loaded world, so no extra indexes are needed.
export async function loadLeaderboards(world, plots) {
  const fallenSnap = await getDocs(query(collection(db, 'legacy'), where('world', '==', world), limit(200)));
  const fallen = fallenSnap.docs.map((d) => d.data()).sort((a, b) => (b.daysSurvived || 0) - (a.daysSurvived || 0)).slice(0, 10);
  const byPeak = [...plots].sort((a, b) => (b.peakPop || 0) - (a.peakPop || 0)).slice(0, 10);
  const running = plots.filter((p) => p.status === 'alive').sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 10);
  return { peak: byPeak, running, fallen };
}

// ---------- profile: lifetime stats and achievements ----------
export async function getProfile(uid) {
  const p = await getDoc(doc(db, 'profiles', uid));
  return p.exists() ? p.data() : null;
}
export const deleteProfile = (uid) => deleteDoc(doc(db, 'profiles', uid));
export const saveProfile = (uid, data) => setDoc(doc(db, 'profiles', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });

// Deleting an account leaves the city behind as ruins (the caller collapses and saves it first).
export async function confirmIdentity(password) {
  const u = auth.currentUser;
  if (u.isAnonymous) return;
  if (u.providerData.some((p) => p.providerId === 'google.com')) await reauthenticateWithPopup(u, google());
  else await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
}
export async function deleteAccount() {
  await deleteUser(auth.currentUser);
}

// ---------- chat ----------
export function listenChat(world, cb, onError) {
  const q = query(collection(db, 'worlds', world, 'chat'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()), (e) => { console.error('Chat', e); onError?.(e); });
}
// Each message stamps the sender's chatLimits doc in the same write; the rules refuse a second message within 3 seconds.
export async function sendChat(world, user, name, city, text) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'worlds', world, 'chat')), { uid: user.uid, name, city, text, createdAt: serverTimestamp() });
  b.set(doc(db, 'chatLimits', user.uid), { at: serverTimestamp() });
  try { await b.commit(); }
  catch (e) { if (denied(e)) { const x = new Error('Slow down: one message every few seconds.'); x.code = 'slow'; x.cause = e; throw x; } throw e; }
}
export function react(world, msgId, uid, emoji) {
  return updateDoc(doc(db, 'worlds', world, 'chat', msgId), { [`reactions.${uid}`]: emoji || deleteField() });
}

// ---------- guestbooks ----------
export async function guestbook(world, plotId) {
  const snap = await getDocs(query(collection(db, 'worlds', world, 'guestbook'), where('plot', '==', plotId), limit(40)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}
export function signGuestbook(world, plotId, user, name, city, text) {
  const day = Math.floor(Date.now() / 86400000);
  return setDoc(doc(db, 'worlds', world, 'guestbook', `${plotId}_${user.uid}_${day}`), { plot: plotId, uid: user.uid, name, city, text, createdAt: serverTimestamp() });
}
export const deleteNote = (world, id) => deleteDoc(doc(db, 'worlds', world, 'guestbook', id));

// ---------- gifts ----------
export function sendGift(world, gift) {
  return addDoc(collection(db, 'worlds', world, 'gifts'), { ...gift, createdAt: serverTimestamp() });
}
export function listenGifts(world, uid, cb) {
  const q = query(collection(db, 'worlds', world, 'gifts'), where('toOwner', '==', uid), limit(20));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Gifts listener', e));
}
export const finishGift = (world, id) => deleteDoc(doc(db, 'worlds', world, 'gifts', id));
export const renameWorld = (id, name) => updateDoc(doc(db, 'worlds', id), { name });

// ---------- regional projects ----------
export function listenProjects(world, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'projects'), limit(50)), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Projects', e));
}
export function startProject(world, user, byName, type, name, goal) {
  return addDoc(collection(db, 'worlds', world, 'projects'), { type, name, goal, raised: 0, by: user.uid, byName, members: {}, done: false, createdAt: serverTimestamp() });
}
// A transaction, so two mayors paying in at the same moment don't overwrite each other.
export function contribute(world, projectId, uid, amount) {
  const ref = doc(db, 'worlds', world, 'projects', projectId);
  return runTransaction(db, async (tx) => {
    const p = await tx.get(ref);
    if (!p.exists()) throw new Error('That project is gone.');
    const d = p.data();
    if (d.done) throw new Error('That project is already finished.');
    const add = Math.min(amount, d.goal - d.raised);
    const mine = (d.members?.[uid] || 0) + add, raised = d.raised + add;
    tx.update(ref, { [`members.${uid}`]: mine, raised, done: raised >= d.goal });
    return { add, done: raised >= d.goal };
  });
}

// ---------- alliances ----------
export function listenAlliances(world, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'alliances'), limit(60)), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Alliances', e));
}
export const createAlliance = (world, user, name, tag) => addDoc(collection(db, 'worlds', world, 'alliances'), { name, tag, owner: user.uid, members: [user.uid], createdAt: serverTimestamp() });
export const joinAlliance = (world, id, uid) => updateDoc(doc(db, 'worlds', world, 'alliances', id), { members: arrayUnion(uid) });
export const leaveAlliance = (world, id, uid) => updateDoc(doc(db, 'worlds', world, 'alliances', id), { members: arrayRemove(uid) });
export const deleteAlliance = (world, id) => deleteDoc(doc(db, 'worlds', world, 'alliances', id));
export function listenAllianceChat(world, id, cb) {
  return onSnapshot(query(collection(db, 'worlds', world, 'alliances', id, 'chat'), orderBy('createdAt', 'desc'), limit(40)), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()), (e) => console.error('Alliance chat', e));
}
export const sendAllianceChat = (world, id, user, name, text) => addDoc(collection(db, 'worlds', world, 'alliances', id, 'chat'), { uid: user.uid, name, text, createdAt: serverTimestamp() });

// ---------- live world ----------
// Every plot in the world, pushed the moment anyone saves. cb gets changed plot docs.
export function listenWorld(world, cb, onError) {
  const q = query(collection(db, 'plots'), where('world', '==', world), limit(400));
  return onSnapshot(q, (snap) => cb(snap.docChanges().filter((c) => c.type !== 'removed').map((c) => ({ id: c.doc.id, ...c.doc.data() }))),
    (e) => { console.error('World listener', e); onError?.(e); });
}

// Families moving between linked cities. The sender writes; the receiving mayor's game takes them in.
export function sendMove(world, move) {
  return addDoc(collection(db, 'worlds', world, 'moves'), { ...move, createdAt: serverTimestamp() });
}
export function listenMoves(world, uid, cb) {
  const q = query(collection(db, 'worlds', world, 'moves'), where('toOwner', '==', uid), limit(20));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error('Moves listener', e));
}
export const finishMove = (world, id) => deleteDoc(doc(db, 'worlds', world, 'moves', id));

// ---------- likes and reports ----------
export async function likes(world, plotId, uid) {
  const col = collection(db, 'worlds', world, 'likes');
  const [count, mine] = await Promise.all([
    getCountFromServer(query(col, where('plot', '==', plotId))),
    getDoc(doc(col, `${plotId}_${uid}`)),
  ]);
  return { count: count.data().count, mine: mine.exists() };
}
export function setLike(world, plotId, uid, on) {
  const ref = doc(db, 'worlds', world, 'likes', `${plotId}_${uid}`);
  return on ? setDoc(ref, { plot: plotId, uid, createdAt: serverTimestamp() }) : deleteDoc(ref);
}
export function report(world, uid, what) {
  return addDoc(collection(db, 'reports'), { world, uid, ...what, createdAt: serverTimestamp() });
}

// ---------- feedback ----------
export function sendFeedback(data) {
  return addDoc(collection(db, 'feedback'), { ...data, createdAt: serverTimestamp() });
}
