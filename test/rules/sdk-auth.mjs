import { getAuth as get, connectAuthEmulator } from 'firebase/auth';
export * from 'firebase/auth';
const done = new WeakSet();
export function getAuth(app) {
  const a = get(app);
  if (!done.has(a)) { connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); done.add(a); }
  return a;
}
