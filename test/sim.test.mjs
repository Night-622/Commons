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

// ---- v2: upgrades, taps, undo, goals, migration
{
  const s = sim.newCity('Up');
  const c = PLOT >> 1;
  for (let x = c + 1; x <= c + 5; x++) sim.place(s, sim.idx(x, c), T.ROAD);
  sim.place(s, sim.idx(c + 2, c - 1), T.HOUSE);
  const u = sim.undoPlace(s, sim.idx(c + 2, c - 1));
  assert(u.ok && s.grid[sim.idx(c + 2, c - 1)] === T.EMPTY, 'undo refunds untouched placement');
  sim.place(s, sim.idx(c + 2, c - 1), T.HOUSE);
  const i = sim.idx(c + 2, c - 1);
  let taps = 0; while (sim.tapHelp(s, i).ok) taps++;
  assert(taps === 5, 'tap cap is 25% at 5% a tap, got ' + taps);
  for (let h = 0; h < 48; h++) sim.tick(s, rng);
  assert.equal(s.cond[i], 100);
  const before = sim.totals(s).homes;
  assert(sim.upgrade(s, i).ok, 'upgrade should start');
  assert.equal(sim.totals(s).homes, before, 'building keeps working while upgrading');
  for (let h = 0; h < 48; h++) sim.tick(s, rng);
  assert.equal(s.lv[i], 2);
  assert(sim.totals(s).homes > before, 'level 2 adds homes');
  const got = sim.checkGoals(s).map((g) => g.id);
  assert(got.includes('upgrade1'), 'upgrade goal pays out');
  const tr = sim.computeTraffic(s);
  for (const k of ['jobs', 'commute', 'shops', 'homes', 'school', 'leisure']) assert(tr.needs[k] >= 0 && tr.needs[k] <= 1, k);
  const old = JSON.parse(sim.serialize(s)); delete old.lv; delete old.goalsDone;
  sim.migrate(old); assert(old.lv.length === PLOT * PLOT && Array.isArray(old.goalsDone));
  console.log('v2 features ok');
}
