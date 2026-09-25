// Each copy of firebase.js gets its own app (one per test player), on the demo project the emulators serve.
import { initializeApp as init } from 'firebase/app';
export * from 'firebase/app';
let n = 0;
export const initializeApp = (config) => init({ ...config, apiKey: 'demo-key', projectId: 'demo-commons' }, `player${n++}`);
