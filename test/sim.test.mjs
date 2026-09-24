import assert from 'node:assert/strict';
import { spiral } from '../public/js/spiral.js';
import * as sim from '../public/js/sim.js';
import { T, PLOT } from '../public/js/constants.js';

// spiral: unique, and each new plot touches an earlier one
const seen = new Set();
for (let n = 0; n < 2000; n++) {
  const { x, y } = spiral(n);
  const key = `${x},${y}`;
  assert(!seen.has(key), `dup at ${n}: ${key}`);
  if (n > 0) assert([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => seen.has(`${x+dx},${y+dy}`)), `isolated ${n}`);
  seen.add(key);
}
console.log('spiral ok, first 9:', Array.from({length:9},(_, n)=>spiral(n)).map(p=>`${p.x},${p.y}`).join(' '));

let seed = 42; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runDays = (s, d) => { let r; for (let h = 0; h < d * 24; h++) { r = sim.tick(s, rng); if (r.collapsed) return r; } return r; };
const log = (label, s, r) => console.log(label, 'day', s.day, 'money', Math.round(s.money), 'pop', sim.totalPop(s), JSON.stringify(s.pop), 'students', sim.students(s), 'happy', s.happiness.toFixed(2), 'failed', s.stats.failedTrips, 'queue', s.queue.length, s.status);

// Well-planned city: ring road around hall, houses, work, shop, school, park
const s = sim.newCity('Test');
const c = PLOT >> 1;
const put = (x, y, t) => { const r = sim.place(s, sim.idx(x, y), t); assert(r.ok, r.reason + ` ${x},${y}`); };
for (let x = c - 4; x <= c + 4; x++) { put(x, c - 1, T.ROAD); put(x, c + 1, T.ROAD); }
put(c - 1, c, T.ROAD); put(c + 1, c, T.ROAD);
for (const x of [c-4, c-3, c-2, c+2, c+3]) put(x, c - 2, T.HOUSE);
for (const x of [c-4, c-3, c+2, c+3]) put(x, c + 2, T.HOUSE);
put(c - 2, c + 2, T.WORK); put(c + 4, c - 2, T.SHOP); put(c + 4, c + 2, T.SCHOOL); put(c, c + 2, T.PARK);
log('start', s);
let r = runDays(s, 5); log('d5 ', s);
r = runDays(s, 15); log('d20', s);
assert(!Number.isNaN(s.money) && !Number.isNaN(s.happiness));
assert(s.status === 'alive');
assert(sim.totalPop(s) > 20, 'city should grow');
assert(s.pop.builder + s.pop.teacher + s.pop.pro > 3, 'education should produce graduates');

// Round trip
const back = JSON.parse(sim.serialize(s));
assert.deepEqual(back.grid, s.grid);

// Neglected city: bankrupt, overbuilt, no jobs -> should collapse
const d = sim.newCity('Doomed');
d.money = 5000;
for (let x = 0; x < PLOT; x++) for (const y of [2, 4, 20]) if (sim.canPlace(d, sim.idx(x, y), T.HOUSE).ok) sim.place(d, sim.idx(x, y), T.HOUSE);
d.money = 0;
r = runDays(d, 60); log('doomed', d);
assert(d.status === 'ruins', 'neglected city should collapse');
console.log('collapse record', r.collapsed);
sim.rebuild(d);
assert(d.status === 'alive' && d.grid.includes(T.RUBBLE));
console.log('all tests passed');
