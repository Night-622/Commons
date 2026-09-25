// Loaded with `node --import`: lets public/js/firebase.js run in node against the emulators.
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
