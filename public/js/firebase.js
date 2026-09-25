const V = '12.17.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, signInAnonymously, signOut, GoogleAuthProvider, EmailAuthProvider,
  signInWithPopup, linkWithPopup, linkWithCredential, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, updateDoc, runTransaction, collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
import { firebaseConfig } from './config.js';
import { WORLD_ID } from './constants.js';
import { spiral } from './spiral.js';
import { newCity, serialize, summary } from './sim.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);
const google = () => new GoogleAuthProvider();

// ---------- auth ----------
export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signInGuest = () => signInAnonymously(auth);
export const signInGoogle = () => signInWithPopup(auth, google());
export const signInEmail = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const createEmail = (email, pass) => createUserWithEmailAndPassword(auth, email, pass);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
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
  const c = String(e?.code || '');
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
  return e?.message || 'Something went wrong.';
}

// ---------- worlds ----------
// The public world keeps the original users/{uid} record. Private worlds use memberships/{uid}_{world}.
const linkRef = (uid, world) => (world === 'public' ? doc(db, 'users', uid) : doc(db, 'memberships', `${uid}_${world}`));

export async function getWorld(id) {
  if (id === 'public') return { id, name: 'Public world', private: false };
  const w = await getDoc(doc(db, 'worlds', id));
  return w.exists() ? { id, ...w.data() } : null;
}

export async function myWorlds(user) {
  const snap = await getDocs(query(collection(db, 'memberships'), where('uid', '==', user.uid), limit(20)));
  const out = [{ id: 'public', name: 'Public world', private: false }];
  for (const m of snap.docs) {
    const w = await getWorld(m.data().world);
    if (w) out.push(w);
  }
  return out;
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

export async function findWorldByCode(code) {
  const c = await getDoc(doc(db, 'worldCodes', code.trim().toUpperCase()));
  if (!c.exists()) throw new Error('No world has that code. Check it and try again.');
  return getWorld(c.data().world);
}

// ---------- plots ----------
export async function findPlot(user, world = WORLD_ID) {
  const link = await getDoc(linkRef(user.uid, world));
  if (!link.exists()) return null;
  const p = await getDoc(doc(db, 'plots', link.data().plotId));
  return p.exists() && p.data().owner === user.uid ? { id: p.id, ...p.data() } : null;
}

// Claims the next frontier plot. A transaction keeps two players from getting the same slot.
export async function claimPlot(user, mayor, cityName, world = WORLD_ID) {
  const lref = linkRef(user.uid, world);
  const worldRef = doc(db, 'worlds', world);
  return runTransaction(db, async (tx) => {
    const w = await tx.get(worldRef);
    const already = await tx.get(lref);
    if (already.exists()) throw new Error('You already have a plot in this world. Reload the page.');
    if (!w.exists() && world !== 'public') throw new Error('That world no longer exists.');
    const n = w.exists() ? w.data().nextIndex : 0;
    const { x, y } = spiral(n);
    const id = `${world}_${x}_${y}`;
    const state = newCity(cityName);
    const data = {
      owner: user.uid, ownerName: mayor, world, px: x, py: y, index: n,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), state: serialize(state), ...summary(state),
    };
    tx.set(doc(db, 'plots', id), data);
    if (world === 'public') tx.set(lref, { plotId: id, createdAt: serverTimestamp() });
    else tx.set(lref, { uid: user.uid, world, plotId: id, createdAt: serverTimestamp() });
    if (w.exists()) tx.update(worldRef, { nextIndex: n + 1 });
    else tx.set(worldRef, { nextIndex: 1 });
    return { id, ...data };
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
    const data = { owner: user.uid, ownerName: mayor, state: serialize(newState), ...summary(newState), updatedAt: serverTimestamp() };
    tx.update(pref, data);
    if (link.exists()) tx.update(lref, { plotId: targetId });
    else if (world === 'public') tx.set(lref, { plotId: targetId, createdAt: serverTimestamp() });
    else tx.set(lref, { uid: user.uid, world, plotId: targetId, createdAt: serverTimestamp() });
    return { id: targetId, ...p.data(), ...data };
  });
}

export function savePlot(id, state, extra = {}) {
  return updateDoc(doc(db, 'plots', id), {
    state: serialize(state), ...summary(state), ...extra, updatedAt: serverTimestamp(),
  });
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
  const fallenSnap = await getDocs(query(collection(db, 'legacy'), orderBy('daysSurvived', 'desc'), limit(60)));
  const fallen = fallenSnap.docs.map((d) => d.data()).filter((r) => (r.world || 'public') === world).slice(0, 10);
  const byPeak = [...plots].sort((a, b) => (b.peakPop || 0) - (a.peakPop || 0)).slice(0, 10);
  const running = plots.filter((p) => p.status === 'alive').sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 10);
  return { peak: byPeak, running, fallen };
}
