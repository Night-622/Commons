import assert from 'node:assert/strict';
import * as sim from '../public/js/sim.js';
import { T, PLOT, B, START_MONEY } from '../public/js/constants.js';

let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const c = PLOT >> 1;
const put = (s, x, y, t) => { const r = sim.place(s, sim.idx(x, y), t); assert(r.ok, `${B[t].name} at ${x},${y}: ${r.reason}`); };
const finishAll = (s) => { for (const q of [...s.queue]) { while (s.queue.includes(q)) sim.tapHelp(s, q.i) || (q.left = 0, sim.tick(s, rng)); } };

// ---- a new city
{
  const s = sim.newCity('Test', rng);
  assert.equal(s.people.length, 6, 'six settlers');
  assert.equal(s.money, START_MONEY);
  assert(sim.owns(s, sim.HALL_INDEX), 'owns the hall');
  assert(!sim.owns(s, sim.idx(0, 0)), 'does not own the corner');
  assert(!sim.place(s, sim.idx(0, 0), T.ROAD).ok, 'cannot build on unowned land');
  const plan = sim.plan(s, rng);
  const builders = s.people.filter((p) => p.j === sim.HALL_INDEX && p.jt === 0).length;
  assert(builders >= 2, 'settlers take builder jobs at the hall');
  assert(plan.needs.jobs > 0);
  console.log('new city ok');
}

// ---- a working town over 25 days
{
  seed = 7;
  const s = sim.newCity('Grow', rng);
  s.money = 20000;
  for (let x = 8; x <= 15; x++) put(s, x, c + 1, T.ROAD);
  for (let y = 8; y <= 15; y++) if (y !== c && y !== c + 1) put(s, c + 1, y, T.ROAD);
  for (const x of [8, 9, 10, 11]) put(s, x, c + 2, T.HOUSE);
  for (const x of [14, 15]) put(s, x, c + 2, T.HOUSE);
  put(s, 8, c, T.SHOP); put(s, 9, c, T.WORK); put(s, 10, c, T.FACTORY); put(s, 11, c, T.SCHOOL);
  put(s, 14, c, T.DAYCARE); put(s, 15, c, T.PARK); put(s, c + 2, 9, T.CLINIC); put(s, c + 2, 10, T.PLAYGROUND);
  put(s, c, 9, T.PATH);
  for (let h = 0; h < 24 * 25; h++) sim.tick(s, rng);
  const cs = sim.census(s);
  assert.equal(s.queue.length, 0, 'everything got built');
  assert(s.people.length > 20, `city grew: ${s.people.length}`);
  assert(cs.employed > 5, 'people work');
  assert(s.history.length === 25);
  assert(s.log.length > 5, 'news was written');
  const plan = s._plan;
  const modes = new Set(plan.trips.map((t) => t.mode));
  assert(plan.trips.length > 10, 'people make trips');
  assert(modes.has('car') || modes.has('bike') || modes.has('walk'));
  assert(plan.trips.every((t) => t.path.length >= 1), 'every trip has a path');
  for (const k of ['jobs', 'commute', 'shops', 'homes', 'school', 'health', 'safety', 'leisure']) assert(plan.needs[k] >= 0 && plan.needs[k] <= 1, k);
  const income = Object.values(s.stats.byClass).reduce((a, b) => a + b, 0);
  assert.equal(income, s.stats.income, 'budget adds up');
  console.log('town ok:', s.people.length, 'people,', cs.employed, 'employed,', s.counters.births, 'births,', s.counters.deaths, 'deaths,', plan.trips.length, 'trips', [...modes].join('/'));

  // moving a house takes its family along
  const house = sim.idx(8, c + 2), fam = s.people.filter((p) => p.h === house).length;
  s.money += 1000;
  const r = sim.moveBuilding(s, house, sim.idx(9, c - 1));
  assert(r.ok, r.reason);
  assert.equal(s.people.filter((p) => p.h === sim.idx(9, c - 1)).length, fam, 'family moved with the house');

  // land
  const price = sim.landPrice(s);
  assert(!sim.canBuyLand(s, 0).ok, 'must be next to owned land');
  assert(sim.buyLand(s, 13).ok, 'buys adjacent land');
  assert(sim.landPrice(s) > price, 'land gets pricier');

  // upgrades
  const shop = sim.idx(8, c);
  assert(sim.upgrade(s, shop).ok);
  for (let h = 0; h < 72; h++) sim.tick(s, rng);
  assert.equal(s.lv[shop], 2);

  // collapse and rebuild
  const rec = sim.collapse(s, 'moved');
  assert.equal(rec.outcome, 'moved');
  assert.equal(s.people.length, 0);
  sim.rebuild(s, 'Again', 999);
  assert.equal(s.people.length, 6);
  assert.equal(s.money, 999);
  console.log('actions ok');
}

// ---- old saves become people
{
  const old = JSON.parse(sim.serialize(sim.newCity('Old', rng)));
  delete old.people; delete old.land;
  old.pop = { unskilled: 3, builder: 3, teacher: 0, pro: 0 }; old.cohorts = [];
  sim.migrate(old, rng);
  assert(old.people.length >= 5 && old.people.length <= 6, 'head counts became people');
  assert(old.land.every(Boolean), 'old cities keep all their land');
  console.log('migration ok');
}

// ---- buses and trains
{
  seed = 11;
  const s = sim.newCity('Transit', rng);
  s.money = 50000; s.land.fill(1);
  for (let x = 2; x <= 21; x++) put(s, x, c + 1, T.ROAD);
  for (let x = 2; x <= 21; x++) put(s, x, 3, T.RAIL);
  for (let y = 4; y <= c; y++) { put(s, 2, y, T.ROAD); put(s, 21, y, T.ROAD); }
  for (const x of [3, 4, 5, 6, 7, 8]) put(s, x, c + 2, T.HOUSE);
  for (const x of [17, 18, 19, 20]) put(s, x, c + 2, T.WORK);
  put(s, 10, c + 2, T.DEPOT); put(s, 11, c + 2, T.SHOP);
  for (let h = 0; h < 24 * 8; h++) sim.tick(s, rng);
  put(s, 3, 4, T.STATION); put(s, 20, 4, T.STATION); put(s, 5, c, T.STOP); put(s, 18, c, T.STOP);
  for (let h = 0; h < 24 * 8; h++) sim.tick(s, rng);
  const plan = s._plan, modes = {};
  for (const t of plan.trips) modes[t.mode] = (modes[t.mode] || 0) + 1;
  assert(plan.stations.length === 2, 'both stations run: ' + plan.stations.length);
  assert(plan.trainLines.length >= 1, 'a train line exists');
  assert(plan.busLoop, 'a bus loop exists');
  assert((modes.train || 0) + (modes.bus || 0) > 0, 'people ride transit: ' + JSON.stringify(modes));
  s.railLinks = 1;
  sim.plan(s, rng);
  console.log('transit ok:', JSON.stringify(modes), 'commuters', s.people.filter((p) => p.oj).length);
}

// ---- linked cities share facilities, holidays and migration
{
  seed = 21;
  const mk = (name, fun) => {
    const s = sim.newCity(name, rng); s.money = 50000; s.land.fill(1);
    for (let x = 6; x <= 23; x++) put(s, x, c + 1, T.ROAD);
    for (const x of [6, 7, 8, 9, 10, 11]) put(s, x, c + 2, T.HOUSE);
    put(s, 14, c + 2, T.SHOP); put(s, 15, c + 2, T.FACTORY);
    if (fun) { put(s, 16, c + 2, T.PARK); put(s, 17, c + 2, T.PARK); put(s, 18, c + 2, T.CLINIC); put(s, 19, c + 2, T.PLAYGROUND); }
    for (let h = 0; h < 24 * 10; h++) sim.tick(s, rng);
    return s;
  };
  const A = mk('Aville', false), Bt = mk('Btown', true);
  const edge = sim.idx(23, c + 1);
  A._abroad = [{ id: 'B', name: 'Btown', via: 'road', edge, ...sim.offer(Bt) }];
  const plan = sim.plan(A, rng);
  assert(sim.offer(Bt).fun > 0, 'Btown has spare leisure');
  assert(plan.out.B && plan.out.B.fun > 0, 'Aville residents go out in Btown: ' + JSON.stringify(plan.out));
  assert(plan.trips.some((t) => t.abroad === 'B' && t.path.at(-1) === edge), 'trips head to the border');
  Bt._incoming = plan.out.B;
  Bt._visitorsFrom = [{ name: 'Aville', edge: sim.idx(23, c + 1), via: 'road', ...plan.out.B }];
  const bp = sim.plan(Bt, rng);
  assert(bp.trips.some((t) => t.visitor === 'Aville'), 'visitors arrive in Btown');
  for (let h = 0; h < 24; h++) sim.tick(Bt, rng);
  assert(Bt.stats.byClass.visitors > 0, 'Btown earns from visitors');
  put(Bt, 12, c + 2, T.HOUSE); for (const q of [...Bt.queue]) { Bt.cond[q.i] = 100; } Bt.queue = [];
  const before = Bt.people.length;
  const got = sim.welcome(Bt, [{ f: 1, l: 2, a: 30, e: 2, sp: 10 }, { f: 3, l: 2, a: 29, e: 1, sp: 10 }, { f: 4, l: 2, a: 5, e: 0, sp: 1 }], 'Aville');
  assert(got === 3 && Bt.people.length === before + 3, 'a migrating family is welcomed');
  console.log('linked cities ok:', JSON.stringify(plan.out.B), 'visitor income', Bt.stats.byClass.visitors);
}
console.log('all tests passed');
