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

// ---------- plots ----------
export async function findPlot(user) {
  const u = await getDoc(doc(db, 'users', user.uid));
  if (!u.exists()) return null;
  const p = await getDoc(doc(db, 'plots', u.data().plotId));
  return p.exists() ? { id: p.id, ...p.data() } : null;
}

// Claims the next frontier plot. A transaction keeps two players from getting the same slot.
export async function claimPlot(user, mayor, cityName) {
  const userRef = doc(db, 'users', user.uid);
  const worldRef = doc(db, 'worlds', WORLD_ID);
  return runTransaction(db, async (tx) => {
    const world = await tx.get(worldRef);
    const already = await tx.get(userRef);
    if (already.exists()) throw new Error('You already have a plot. Reload the page.');
    const n = world.exists() ? world.data().nextIndex : 0;
    const { x, y } = spiral(n);
    const id = `${WORLD_ID}_${x}_${y}`;
    const state = newCity(cityName);
    const data = {
      owner: user.uid, ownerName: mayor, world: WORLD_ID, px: x, py: y, index: n,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), state: serialize(state), ...summary(state),
    };
    tx.set(doc(db, 'plots', id), data);
    tx.set(userRef, { plotId: id, createdAt: serverTimestamp() });
    tx.set(worldRef, { nextIndex: n + 1 });
    return { id, ...data };
  });
}

export function savePlot(id, state, extra = {}) {
  return updateDoc(doc(db, 'plots', id), {
    state: serialize(state), ...summary(state), ...extra, updatedAt: serverTimestamp(),
  });
}

export async function loadWorld() {
  const snap = await getDocs(query(collection(db, 'plots'), where('world', '==', WORLD_ID), limit(400)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function writeLegacy(user, plotId, mayor, record) {
  return addDoc(collection(db, 'legacy'), {
    ...record, plotId, owner: user.uid, ownerName: mayor, endedAt: serverTimestamp(),
  });
}

export async function loadLeaderboards() {
  const top = async (col, field) =>
    (await getDocs(query(collection(db, col), orderBy(field, 'desc'), limit(10)))).docs.map((d) => d.data());
  const [peak, running, fallen] = await Promise.all([
    top('plots', 'peakPop'), top('plots', 'day'), top('legacy', 'daysSurvived'),
  ]);
  return { peak, running: running.filter((p) => p.status === 'alive'), fallen };
}
