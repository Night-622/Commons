import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, updateDoc, runTransaction, collection, query, where, orderBy, limit,
  getDocs, addDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { WORLD_ID } from './constants.js';
import { spiral } from './spiral.js';
import { newCity, serialize, summary } from './sim.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);
export const onAuth = (cb) => onAuthStateChanged(auth, cb);

const firstName = (user) => (user.displayName || 'New').split(' ')[0];

// Returns the player's plot, claiming the next frontier plot on first sign-in.
export async function ensurePlot(user) {
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) {
    const snap = await getDoc(doc(db, 'plots', existing.data().plotId));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  }
  const worldRef = doc(db, 'worlds', WORLD_ID);
  return runTransaction(db, async (tx) => {
    const world = await tx.get(worldRef);
    const again = await tx.get(userRef);
    if (again.exists()) throw new Error('Plot already claimed in another tab. Reload the page.');
    const n = world.exists() ? world.data().nextIndex : 0;
    const { x, y } = spiral(n);
    const id = `${WORLD_ID}_${x}_${y}`;
    const state = newCity(`${firstName(user)}'s Town`);
    const data = {
      owner: user.uid, ownerName: firstName(user), world: WORLD_ID, px: x, py: y, index: n,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), state: serialize(state), ...summary(state),
    };
    tx.set(doc(db, 'plots', id), data);
    tx.set(userRef, { plotId: id, createdAt: serverTimestamp() });
    tx.set(worldRef, { nextIndex: n + 1 });
    return { id, ...data };
  });
}

export function savePlot(id, state) {
  return updateDoc(doc(db, 'plots', id), {
    state: serialize(state), ...summary(state), updatedAt: serverTimestamp(),
  });
}

export async function loadWorld() {
  const snap = await getDocs(query(collection(db, 'plots'), where('world', '==', WORLD_ID), limit(400)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function writeLegacy(user, plotId, record) {
  return addDoc(collection(db, 'legacy'), {
    ...record, plotId, owner: user.uid, ownerName: firstName(user), endedAt: serverTimestamp(),
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
