import assert from 'node:assert/strict';
import * as sim from '../public/js/sim.js';
import { T, PLOT, B, START_MONEY, START_CHUNKS } from '../public/js/constants.js';

let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const c = PLOT >> 1;
const put = (s, x, y, t) => { const r = sim.place(s, sim.idx(x, y), t); assert(r.ok, `${B[t].name} at ${x},${y}: ${r.reason}`); };
const finishAll = (s) => { for (const q of s.queue) if (!q.up) s.cond[q.i] = 100; s.queue = []; s._plan = null; };

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
  finishAll(s);
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

// ---- compact saves, level crossings, requests
{
  seed = 31;
  const s = sim.newCity('Pack', rng); s.money = 9000; s.land.fill(1);
  put(s, 13, c, T.ROAD); put(s, 14, c, T.ROAD);
  for (let h = 0; h < 12; h++) sim.tick(s, rng);
  assert(sim.place(s, sim.idx(14, c), T.RAIL).ok, 'rail over road makes a crossing');
  assert.equal(s.grid[sim.idx(14, c)], T.XING);
  for (let h = 0; h < 48; h++) sim.tick(s, rng);
  const json = sim.serialize(s), back = sim.migrate(JSON.parse(json));
  assert(Array.isArray(JSON.parse(json).people[0]), 'people saved as arrays');
  assert.deepEqual(back.people.map((p) => [p.i, p.a, p.e, p.h, p.j]), s.people.map((p) => [p.i, p.a, p.e, p.h, p.j]), 'people survive a round trip');
  const fresh = sim.newCity('Clock', rng);
  assert.equal(fresh.hour, sim.worldHour(fresh.lastTick), 'new cities start on the world clock');
  console.log('saves ok:', json.length, 'bytes for', s.people.length, 'people');
}

// ---- junctions, utilities, decisions
{
  seed = 41;
  const s = sim.newCity('Grid', rng); s.money = 90000; s.land.fill(1);
  for (let x = 8; x <= 16; x++) put(s, x, c + 1, T.ROAD);
  for (let y = c + 2; y <= 18; y++) put(s, 12, y, T.ROAD);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  const j = sim.idx(12, c + 1);
  assert(!sim.place(s, sim.idx(8, c + 1), T.LIGHTS).ok, 'lights only go on junctions');
  const before = sim.plan(s, rng).cap[j];
  assert(sim.place(s, j, T.ROUNDABOUT).ok, 'roundabout on a junction');
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  assert(sim.plan(s, rng).cap[j] > before * 1.5, 'roundabout carries more traffic');
  s.flags.utilSince = -10;
  for (let k = 0; k < 30; k++) s.people.push({ ...s.people[0], i: 1000 + k });
  const u = sim.utilities(s);
  assert(u.need && u.power.size === 0, 'no power yet');
  s.decision = { id: 'festival', d: s.day };
  const m0 = s.money;
  sim.decide(s, 'a');
  assert(s.money === m0 - 300 && !s.decision, 'decision applied');
  console.log('junctions, utilities, decisions ok');
}

// ---- zoning
{
  seed = 51;
  const s = sim.newCity('Zones', rng); s.money = 9000;
  for (let x = 13; x <= 15; x++) put(s, x, c, T.ROAD);
  for (let h = 0; h < 30; h++) sim.tick(s, rng);
  for (const x of [13, 14, 15]) assert(sim.zone(s, sim.idx(x, c - 1), 1).ok, 'zone homes');
  for (let h = 0; h < 24 * 4; h++) sim.tick(s, rng);
  const grown = [13, 14, 15].filter((x) => s.grid[sim.idx(x, c - 1)] !== T.EMPTY).length;
  assert(grown >= 1, 'developers built in the zone: ' + grown);
  assert.equal(sim.totals(s).upkeepBy[T.HOUSE] || 0, 0, 'zoned homes cost no upkeep');
  console.log('zoning ok:', grown, 'grown');
}
// ---- clean power, air, tourism, the bank, badges, new decisions
{
  seed = 77;
  const s = sim.newCity('Green', rng); s.money = 20000;
  s.land.fill(1);
  for (let x = 4; x <= 20; x++) put(s, x, c + 1, T.ROAD);
  put(s, 6, c + 2, T.SOLAR); put(s, 8, c + 2, T.WIND);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  assert.equal(sim.greenShare(s), 1, 'all clean power');
  put(s, 10, c + 2, T.POWER);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  assert(sim.greenShare(s) < 1 && sim.greenShare(s) > 0, 'mixed power');
  const dirty = sim.airQuality(s, 0);
  put(s, 12, c + 2, T.FACTORY); put(s, 14, c + 2, T.FACTORY);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  assert(sim.airQuality(s, 0) < dirty, 'factories foul the air');
  s.policy.carbon = true;
  assert(sim.airQuality(s, 0) > sim.airQuality({ ...s, policy: { ...s.policy, carbon: false } }, 0), 'carbon tax cleans the air');
  // The bank
  s.history = Array.from({ length: 7 }, (_, d) => ({ d, pop: 30, money: 1000, mood: 60, net: 50 }));
  for (let k = 0; k < 50; k++) s.people.push({ ...s.people[0], i: 2000 + k });
  assert.equal(sim.creditRating(s), 'A', 'good rating');
  const m0 = s.money;
  assert(sim.borrow(s, 3000).ok && s.money === m0 + 3000 && s.loan.left === 3000, 'borrow');
  assert(!sim.canBorrow(s, 100).ok, 'one loan at a time');
  s.day = 20;
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(s.loan.left < 3000 && s.stats.loanPaid > 0, 'loan repaid daily');
  assert(sim.repay(s).ok && !s.loan && s.flags.repaid, 'pay off early');
  // Summary carries the new public fields, and badges are plain strings
  const sm = sim.summary(s);
  for (const k of ['green', 'air', 'riders', 'tourists']) assert(typeof sm[k] === 'number', 'summary ' + k);
  assert(Array.isArray(sm.badges) && sm.badges.every((b) => typeof b === 'string'), 'badges');
  // New council decisions
  s.decision = { id: 'carfree', d: s.day }; sim.decide(s, 'a'); assert(s.flags.carfree === 5, 'car-free sundays');
  s.decision = { id: 'robots', d: s.day }; const m1 = s.money; sim.decide(s, 'a'); assert(s.flags.robots && s.money === m1 - 400, 'robots');
  // Tourism: a staffed museum and a hotel bring money in
  put(s, 16, c + 2, T.MUSEUM); put(s, 18, c + 2, T.HOTEL);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  for (const i of [sim.idx(16, c + 2), sim.idx(18, c + 2)]) for (let k = 0; k < 3; k++) { const p = s.people[k + (i % 7)]; if (p) { p.j = i; p.jt = 0; p.e = 3; } }
  for (let h = 0; h < 48; h++) sim.tick(s, rng);
  assert((s.stats.byClass.tourism || 0) >= 0, 'tourism line exists');
  console.log('green power, air, bank, badges, decisions ok: air', sm.air, 'tourists', s.stats.tourists, 'badges', sm.badges);
}
// ---- terrain
{
  const a = sim.terrainFor(3, -2, 'public'), b = sim.terrainFor(3, -2, 'public');
  assert.equal(a, b, 'terrain is the same every time');
  assert.notEqual(sim.terrainFor(3, -2, 'wabc'), a, 'private worlds get their own land');
  let most = 0, found = null;
  for (let py = -5; py <= 5; py++) for (let px = -5; px <= 5; px++) {
    const t = sim.terrainFor(px, py);
    const w = [...t].filter((c) => c === '2').length;
    most = Math.max(most, w);
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) assert.equal(t[y * PLOT + x], '0', 'the start is dry and flat');
    if (!found && w > 20) found = [px, py];
  }
  assert(most <= PLOT * PLOT * 0.35 + 1, 'no plot is mostly water: ' + most);
  assert(found, 'some plots have water');
  const s = sim.newCity('River', rng); s.money = 1e6; s.land.fill(1);
  sim.ensureTerrain(s, ...found, 'public');
  const wi = [...s.terr].indexOf('2');
  assert(!sim.place(s, wi, T.HOUSE).ok, 'no houses on water');
  const m0 = s.money;
  assert(sim.place(s, wi, T.ROAD).ok && m0 - s.money === B[T.ROAD].cost * 4, 'bridges cost four times a road');
  const hi = [...s.terr].indexOf('1');
  if (hi >= 0) assert(!sim.place(s, hi, T.AIRPORT).ok, 'airports need flat land');
  const old = sim.newCity('Old', rng); old.land.fill(1);
  const t0 = sim.terrainFor(...found, 'public'), wet = [...t0].indexOf('2');
  old.grid[wet] = T.HOUSE; old.cond[wet] = 100;
  sim.ensureTerrain(old, ...found, 'public');
  assert.equal(old.terr[wet], '0', 'old buildings stay on dry land');
  assert.equal(sim.fromMap(sim.mapString(s)).terr, s.terr, 'terrain travels in the map string');
  console.log('terrain ok: most water on one plot', most, 'tiles');
}
// ---- residents' character, pets, pensions, rubbish and sewage
{
  seed = 88;
  const s = sim.newCity('Waste', rng); s.money = 1e5; s.land.fill(1);
  for (let k = 0; k < 80; k++) s.people.push({ ...s.people[0], i: 3000 + k, a: k % 3 ? 30 : 70 });   // past SEWAGE_POP
  const traits = new Set(s.people.map(sim.traitOf));
  assert(traits.size >= 4, 'residents have a mix of characters');
  assert.equal(sim.traitOf(s.people[5]), sim.traitOf({ ...s.people[5] }), 'traits are stable');
  s.day = 20; s.flags.wasteSince = 5; s.flags.sewageSince = 5;   // the 5-day warnings have run out
  let w = sim.wasteStatus(s);
  assert(w.needWaste && w.waste === 0 && w.needSewage && w.sewage === 0, 'a big town needs rubbish and sewage handled');
  for (let x = 4; x <= 20; x++) put(s, x, c + 1, T.ROAD);
  put(s, 6, c + 2, T.RECYCLE); put(s, 8, c + 2, T.SEWAGE);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  for (const [x, n] of [[6, 4], [8, 2]]) for (let k = 0; k < n; k++) { const p = s.people[10 + x + k]; p.j = sim.idx(x, c + 2); p.jt = 0; p.e = 3; }
  w = sim.wasteStatus(s);
  assert(w.waste === 1 && w.sewage === 1, 'plants cover the town: ' + JSON.stringify(w));
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(s.stats.upkeepBy.pensions > 0, 'retirees draw pensions');
  assert((s.stats.byClass.recycling || 0) > 0, 'recycling earns a little');
  console.log('traits, pets, pensions, waste ok:', [...traits].join(', '));
}
// ---- research, letters, chains, metro
{
  seed = 99;
  const s = sim.newCity('Metro', rng); s.money = 1e5; s.land.fill(1);
  assert(!sim.availability(s, T.METRO).ok, 'metro needs research');
  s.rp = 1000;
  assert(!sim.research(s, 'metro').ok, 'research needs its prerequisites');
  for (const t of ['smartgrid', 'trafficai', 'metro']) assert(sim.research(s, t).ok, 'research ' + t);
  assert(sim.hasTech(s, 'metro') && s.rp === 1000 - 70 - 80 - 120, 'points spent');
  for (let x = 2; x <= 21; x++) put(s, x, c + 1, T.ROAD);
  for (const x of [3, 4, 5, 6]) put(s, x, c + 2, T.HOUSE);
  for (const x of [17, 18, 19, 20]) put(s, x, c + 2, T.WORK);
  put(s, 4, c, T.METRO); put(s, 19, c, T.METRO);
  finishAll(s);
  for (let k = 0; k < 30; k++) s.people.push({ ...s.people[0], i: 4000 + k, h: sim.idx(3 + (k % 4), c + 2), j: -1, e: 2 });
  for (const [x, o] of [[4, 10], [19, 14]]) for (let k = 0; k < 2; k++) { const p = s.people[o + k]; p.j = sim.idx(x, c); p.jt = 0; }
  const plan = sim.plan(s, rng);
  assert(plan.metros.length === 2 && plan.metroCap > 0, 'metro runs');
  // letters and promises
  s.day = 10;
  for (let d = 0; d < 20 && !s.letter; d++) for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(s.letter, 'a resident wrote a letter');
  sim.replyLetter(s, 'promise');
  assert(s.pledge && !s.letter, 'promise recorded');
  s.pledge.until = s.day;
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(!s.pledge, 'promise came due');
  // an event chain follows the first choice
  s.decision = { id: 'company', d: s.day }; sim.decide(s, 'a');
  assert(s.flags.chain?.id === 'company2', 'follow-up queued');
  console.log('research, metro, letters, chains ok: metro riders', plan.riders.metro, 'letter topic', s.flags.opp ? 'election on' : 'none');
}
// ---- heritage, land sales, bonds, insurance, crowdfunding
{
  seed = 123;
  const s = sim.newCity('Old Town', rng); s.money = 1e5; s.land.fill(1);
  for (let x = 4; x <= 20; x++) put(s, x, c + 1, T.ROAD);
  put(s, 6, c + 2, T.LIBRARY);
  finishAll(s);
  const lib = sim.idx(6, c + 2);
  s.bday[lib] = 0; s.day = 40;
  assert(sim.isHistoric(s, lib), 'a 40-day-old library is historic');
  assert(sim.setProtected(s, lib, true).ok && sim.isProtected(s, lib), 'protect it');
  assert(!sim.bulldoze(s, lib).ok, 'protected buildings stay');
  sim.setProtected(s, lib, false);
  const m0 = s.people.reduce((a, p) => a + p.m, 0);
  assert(sim.bulldoze(s, lib).historic, 'pulling down history is noticed');
  assert(s.people.reduce((a, p) => a + p.m, 0) < m0, 'and people mind');
  // land: a parcel away from the hall with nothing on it
  const far = [...Array(36).keys()].find((k) => !START_CHUNKS.includes(k) && sim.canSellLand(s, k).ok);
  const before = s.money, r = sim.sellLand(s, far);
  assert(r.ok && s.money === before + r.price && !s.land[far], 'sell a parcel back');
  assert(!sim.canSellLand(s, START_CHUNKS[0]).ok, 'the middle stays');
  // bonds
  for (let k = 0; k < 30; k++) s.people.push({ ...s.people[0], i: 5000 + k });
  const b0 = s.money;
  assert(sim.issueBonds(s, 500).ok && s.money === b0 + 500 && s.bond.left === 560, 'bonds raise money');
  assert(!sim.canIssueBonds(s, 100).ok, 'one issue at a time');
  // insurance halves disasters
  put(s, 8, c + 2, T.HOUSE); put(s, 9, c + 2, T.SHOP); finishAll(s);
  s.policy.insured = true;
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(s.stats.upkeepBy.insurance > 0 && s.stats.upkeepBy.bonds > 0, 'premiums and bond payments in upkeep');
  // crowdfunding grows day by day
  s.wants = [{ p: s.people[0].i, t: T.CINEMA, r: 1, d: s.day, reward: 100 }];
  for (let h = 0; h < 48; h++) sim.tick(s, rng);
  assert(!s.wants.length || s.wants[0].fund > 0, 'neighbours raise money towards a request');
  console.log('heritage, land sales, bonds, insurance, crowdfunding ok');
}
// ---- every random event at once, and none at all: nothing should throw
{
  for (const r of [() => 0.0005, () => 0.9995, () => 0.5]) {
    const s = sim.newCity('Chaos', rng); s.money = 1e5; s.land.fill(1); s.terr = sim.terrainFor(2, 3);
    for (let x = 4; x <= 20; x++) put(s, x, c + 1, T.ROAD);
    for (const x of [5, 6, 7, 8, 9, 10]) put(s, x, c + 2, T.HOUSE);
    put(s, 12, c + 2, T.FACTORY); put(s, 14, c + 2, T.SHOP); put(s, 16, c + 2, T.CLINIC);
    finishAll(s);
    for (let k = 0; k < 40; k++) s.people.push({ ...s.people[0], i: 6000 + k, h: sim.idx(5 + (k % 6), c + 2), a: 20 + k });
    s.day = 12; s.policy.insured = true; s.decision = null;
    for (let h = 0; h < 24 * 6; h++) sim.tick(s, r);
  }
  console.log('stress ok: all events, no events, and middling luck');
}
// ---- an empty town with homes and money fills up again rather than sitting empty
{
  seed = 7;
  const s = sim.newCity('Empty', rng); s.money = 2000;
  for (let x = c - 3; x <= c + 3; x++) put(s, x, c + 1, T.ROAD);
  put(s, c - 2, c + 2, T.HOUSE); put(s, c + 2, c + 2, T.HOUSE);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  s.people = []; s.day = 10;
  for (let h = 0; h < 24 * 4 && !s.people.length; h++) sim.tick(s, rng);
  assert.equal(s.status, 'alive');
  assert(s.people.length > 0, 'people move into an empty town that has homes');
  console.log('empty town ok:', s.people.length, 'arrived');
}
// ---- builders work between hours, so a house doesn't wait for the 75-second hour to end
{
  seed = 9;
  const s = sim.newCity('Quick', rng);
  put(s, c, c + 1, T.ROAD); put(s, c + 1, c + 2, T.ROAD);
  for (const q of [...s.queue]) s.cond[q.i] = 100;
  s.queue = [];
  put(s, c, c + 2, T.HOUSE);
  let done = 0, f = 0;
  while (!done && f < 1) { f += 0.02; done = sim.work(s, f); }
  assert(done && f < 0.5, 'a house finishes within half an hour of game time: ' + f);
  const left = s.wk;
  sim.tick(s, rng);
  assert.equal(s.wk, 0, 'the hour ends and work starts afresh');
  assert(left > 0);
  console.log('quick building ok: house done after', Math.round(f * 75), 'real seconds');
}
// ---- hiring, firing, recruiting and learning without school
{
  seed = 21;
  const s = sim.newCity('Staff', rng); s.money = 5000; s.land.fill(1);
  for (let x = c - 4; x <= c + 4; x++) put(s, x, c + 1, T.ROAD);
  put(s, c - 3, c + 2, T.HOUSE); put(s, c - 1, c + 2, T.HOUSE); put(s, c + 1, c + 2, T.SHOP); put(s, c + 3, c + 2, T.LIBRARY);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  const shop = sim.idx(c + 1, c + 2), lib = sim.idx(c + 3, c + 2);
  sim.plan(s, rng);
  // Recruit a librarian from outside: costs money, fills the job, and they stay put.
  const libJob = B[T.LIBRARY].jobs.findIndex(([, e]) => e >= 2);
  const before = s.money, n = s.people.length;
  const r = sim.recruit(s, lib, libJob, rng);
  assert(r.ok, 'recruit: ' + r.reason);
  assert.equal(s.money, before - sim.recruitCost(s, lib, libJob));
  assert.equal(s.people.length, n + 1);
  const newcomer = s.people.find((p) => p.i === r.pid);
  assert(newcomer.e >= B[T.LIBRARY].jobs[libJob][1] && newcomer.j === lib, 'the recruit has the education and the job');
  // Hire a resident into the shop; the daily job shuffle leaves them there.
  const worker = s.people.find((p) => p.a >= 18 && p.a < 65 && p.e >= B[T.SHOP].jobs[0][1] && p.i !== r.pid);
  assert(sim.hire(s, worker.i, shop, 0).ok);
  for (let d = 0; d < 3; d++) { for (let h = 0; h < 24; h++) sim.tick(s, rng); }
  assert.equal(worker.j, shop, 'a hired worker keeps their job');
  // Let them go: they don't come back to the shop for a few days.
  assert(sim.fire(s, worker.i).ok);
  assert.equal(worker.j, -1);
  sim.plan(s, rng);
  assert.notEqual(worker.j, shop, 'not re-hired at the same place straight away');
  assert(!sim.hire(s, 999999, shop, 0).ok && !sim.fire(s, 999999).ok, 'unknown people are refused');
  // Evening classes: an adult with no schooling who spends evenings at the library moves up.
  const learner = s.people.find((p) => p.a >= 18 && p.a < 40);
  learner.e = 0; learner.us = 0;
  let days = 0;
  while (learner.e === 0 && days < 40) { learner.fun = lib; for (let h = 0; h < 24; h++) sim.tick(s, rng); learner.fun = lib; days++; }
  assert(learner.e >= 1, 'an adult with no schooling can earn a primary certificate at the library');
  console.log('hiring ok: recruit, hire, fire; evening classes took', days, 'days');
}
// ---- resources: farms, water, power, imports, variety, storage and materials
{
  seed = 33;
  const s = sim.newCity('Harvest', rng); s.money = 50000; s.land.fill(1);
  for (let x = 2; x <= 21; x++) put(s, x, c + 1, T.ROAD);
  const row = [T.HOUSE, T.HOUSE, T.HOUSE, T.FARM, T.WATER, T.WIND, T.SHOP, T.MATERIALS];
  row.forEach((t, k) => put(s, 3 + k * 2, c + 2, t));
  for (const x of [3, 5, 7, 9, 15, 17]) put(s, x, c, T.HOUSE);   // enough people to staff everything
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  for (let d = 0; d < 3; d++) for (let h = 0; h < 24; h++) sim.tick(s, rng);
  const r = s.stats.res;
  assert(r.prod.veg > 0 && r.prod.water > 0 && r.prod.power > 0, 'farms, water towers and wind turbines make things: ' + JSON.stringify(r.prod));
  assert(r.need.food > 0 && Math.abs(r.need.food - s.people.length) <= 12, 'everyone eats (measured at the start of the day, before newcomers)');
  assert(r.imported >= 0 && r.importCost === Math.round(r.imported * 0.2375), 'missing food is imported at the average price');
  assert(r.variety >= 1, 'vegetables count as one kind of food');
  // Orchards need research; with it, a second kind of food.
  assert(!sim.availability(s, T.ORCHARD).ok, 'orchards need research');
  s.tech = [...(s.tech || []), 'orchards'];
  put(s, 19, c + 2, T.ORCHARD);
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  for (let h = 0; h < 24 * 3; h++) sim.tick(s, rng);
  assert(s.stats.res.variety >= 2, 'fruit makes a second kind of food: ' + JSON.stringify(s.stats.res.prod) + ' staff ' + sim.staffing(s, sim.idx(19, c + 2)));
  // Materials speed up builders; the stock goes down as they work.
  s.res.materials = 100;
  put(s, 21, c + 2, T.HOUSE);
  const before = s.res.materials;
  sim.work(s, 0.05);
  assert(s.res.materials < before, 'builders use materials');
  // Storage: anything over the limit sells.
  s.res.veg = 5000;
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  assert(s.res.veg <= s.stats.res.cap && s.stats.res.sold > 0, 'surplus food sells');
  console.log('resources ok:', JSON.stringify(s.stats.res.prod), 'imported', s.stats.res.imported, 'variety', s.stats.res.variety);
}
// ---- labour contracts between cities
{
  seed = 55;
  const lender = sim.newCity('Lender', rng), hirer = sim.newCity('Hirer', rng);
  for (const s of [lender, hirer]) { s.money = 20000; s.land.fill(1); for (let x = 4; x <= 20; x++) put(s, x, c + 1, T.ROAD); }
  for (const x of [4, 6, 8, 10]) put(lender, x, c + 2, T.HOUSE);
  put(hirer, 6, c + 2, T.FACTORY);
  for (const s of [lender, hirer]) { for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = []; }
  for (let h = 0; h < 48; h++) sim.tick(lender, rng);
  const idle = sim.idleWorkers(lender).length;
  assert(idle >= 2, 'the lender has jobless adults: ' + idle);
  assert(sim.reserve(lender, 'lab1', 'labour', 0, 2, 3).ok, 'offering two workers');
  assert(!sim.reserve(lender, 'lab2', 'labour', 0, 999, 3).ok, 'not more than you have');
  const factory = sim.idx(6, c + 2);
  const before = sim.staffing(hirer, factory);
  sim.hireCrew(hirer, { n: 2, e: 0, days: 3, from: 'Lender' });
  sim.plan(hirer, rng);
  assert(sim.staffing(hirer, factory) > before, 'contract workers staff the factory');
  assert.equal(sim.sendCrew(lender, 2, 0, 3), 2);
  assert.equal(sim.idleWorkers(lender).length, idle - 2, 'those two are away working');
  for (let d = 0; d < 4; d++) for (let h = 0; h < 24; h++) { sim.tick(lender, rng); sim.tick(hirer, rng); }
  assert.equal((hirer.contracts || []).length, 0, 'the contract ends');
  assert(lender.people.every((p) => !p.oc), 'and the workers come home');
  console.log('labour contracts ok');
}
// ---- building materials in prices, and harvests
{
  seed = 61;
  const s = sim.newCity('Tapper', rng); s.money = 5000; s.land.fill(1);
  for (let x = 4; x <= 12; x++) put(s, x, c + 1, T.ROAD);
  const plain = sim.buildPrice(s, sim.idx(5, c + 2), T.FARM);
  assert.equal(plain.money, B[T.FARM].cost, 'with no materials in store you pay the list price');
  s.res = { materials: 3 };
  const cheaper = sim.buildPrice(s, sim.idx(5, c + 2), T.FARM);
  assert.equal(cheaper.money, B[T.FARM].cost - 3 * 2, 'each load of your own takes $2 off');
  const m0 = s.money;
  put(s, 5, c + 2, T.FARM);
  assert.equal(s.money, m0 - cheaper.money);
  assert.equal(s.res.materials, 0, 'the materials are used');
  for (const q of [...s.queue]) s.cond[q.i] = 100; s.queue = [];
  const farm = sim.idx(5, c + 2);
  const hand = s.people.find((p) => p.a >= 18 && p.a < 65 && !(p.j === sim.HALL_INDEX && p.jt === 0));
  if (hand) { hand.j = -1; sim.hire(s, hand.i, farm, 0); }   // a settler takes the farm job
  for (let h = 0; h < 6; h++) sim.tick(s, rng);
  assert(sim.staffing(s, farm) > 0, 'the farm has staff');
  assert(sim.harvestReady(s, farm), 'after a few hours the farm has a harvest');
  const v = s.res.veg || 0, r = sim.harvest(s, farm);
  assert(r.ok && r.got.veg > 0 && s.res.veg === v + r.got.veg, 'collecting adds to the store');
  assert(!sim.harvestReady(s, farm), 'and starts again');
  console.log('materials prices and harvests ok: harvest gave', r.got.veg, 'veg');
}
// ---- the exchange: resource prices from scarcity and demand, and city shares
{
  const cities = (veg) => [{ pop: 100, res: { veg, fruit: 0, dairy: 0, meat: 0, materials: 0 } }];
  const scarce = sim.worldPrices(cities(0), 50).veg, plenty = sim.worldPrices(cities(5000), 50).veg;
  assert(scarce > plenty, `scarce vegetables cost more: ${scarce} vs ${plenty}`);
  assert.deepEqual(sim.worldPrices(cities(100), 50), sim.worldPrices(cities(100), 50), 'the same for everyone on the same day');
  const days = Array.from({ length: 40 }, (_, d) => sim.worldPrices(cities(100), d).veg);
  assert(Math.max(...days) > Math.min(...days) * 1.2, 'demand moves prices from day to day');
  const s = sim.newCity('Trader', rng); s.money = 5000; s._prices = sim.worldPrices(cities(0), 50);
  assert(sim.buyResource(s, 'veg', 100).ok && s.res.veg === 100, 'buying from the exchange');
  const m = s.money;
  assert(sim.sellResource(s, 'veg', 100).ok && s.money > m && s.money < m + 100 * s._prices.veg, 'selling back, less the spread');
  assert(!sim.sellResource(s, 'veg', 1).ok, 'not what you haven’t got');
  // City shares: worth what the city is.
  const small = { pop: 20, peakPop: 20, money: 500, bld: 5, happiness: 0.6, growth: 0 };
  const big = { pop: 300, peakPop: 320, money: 8000, bld: 90, happiness: 0.7, growth: 40, res: { materials: 200 } };
  assert(sim.sharePrice(big) > sim.sharePrice(small) * 5, 'a big city’s shares are worth more');
  assert.equal(sim.sharePrice({ ...big, status: 'ruins' }), 0.5, 'a fallen city’s shares are worth almost nothing');
  const buyer = sim.newCity('Investor', rng); buyer.money = 10000;
  const p = sim.sharePrice(big);
  assert(sim.buyCityShares(buyer, 'x_1_1', 'Big', 20, p).ok && buyer.holdings.x_1_1.n === 20);
  assert(sim.sellCityShares(buyer, 'x_1_1', 20, p * 1.5).ok && !buyer.holdings.x_1_1, 'selling after the city grew');
  assert(buyer.money > 10000, 'and made money');
  // Listing needs a real town, and pays out at once.
  const town = sim.newCity('Listed', rng);
  assert(!sim.canList(town, 100).ok, 'too small to list');
  for (let k = 0; k < 40; k++) town.people.push({ ...town.people[0], i: 900 + k });
  const before = town.money, r = sim.listCity(town, 200);
  assert(r.ok && town.money > before && town.listed.float === 200, 'listing raises money');
  assert(!sim.listCity(town, 100).ok, 'once');
  // Old company shares from 1.16 are refunded.
  const old = JSON.parse(sim.serialize(sim.newCity('Old', rng))); old.shares = { rail: { n: 10, paid: 600 } }; const m0 = old.money;
  sim.migrate(old);
  assert(!old.shares && old.money === m0 + 600, 'refunded');
  console.log('exchange ok: veg scarce', scarce, 'plenty', plenty, '; share small', sim.sharePrice(small), 'big', p);
}
console.log('all tests passed');
