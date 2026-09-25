// The browser's offline cache isn't available in node, so every copy uses a plain in-memory Firestore on the emulator.
import { getFirestore as get, connectFirestoreEmulator } from 'firebase/firestore';
export * from 'firebase/firestore';
const done = new WeakSet();
export function getFirestore(app) {
  const db = get(app);
  if (!done.has(db)) { connectFirestoreEmulator(db, '127.0.0.1', 8080); done.add(db); }
  return db;
}
export const initializeFirestore = (app) => getFirestore(app);
