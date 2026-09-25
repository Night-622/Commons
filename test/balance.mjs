// Balance check: a scripted mayor builds a sensible city for 100 days. Prints how it goes.
// Run with: node test/balance.mjs
import * as sim from '../public/js/sim.js';
import { T, B, PLOT } from '../public/js/constants.js';

let seed = Number(process.argv[2] || 5);
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const s = sim.newCity('Balance', rng);
const c = PLOT >> 1;
const order = [];
// A grid of streets every 3 tiles, with plots between them.
for (let k = 2; k <= 21; k++) { order.push([k, c + 1, T.ROAD]); }
for (const x of [3, 7, 11, 15, 19]) for (let y = 3; y <= 21; y++) if (y !== c + 1) order.push([x, y, T.ROAD]);
const plan = [T.HOUSE, T.HOUSE, T.SHOP, T.HOUSE, T.FACTORY, T.HOUSE, T.PARK, T.SCHOOL, T.HOUSE, T.CLINIC, T.WORK, T.HOUSE, T.DAYCARE, T.PLAYGROUND,
  T.HOUSE, T.YARD, T.CAFE, T.HOUSE, T.POLICE, T.HIGH, T.HOUSE, T.APARTMENT, T.CEMETERY, T.GYM, T.HOUSE, T.WORK, T.HOSPITAL, T.COURT, T.LIBRARY,
  T.APARTMENT, T.POOL, T.FIRE, T.UNI, T.CINEMA, T.VILLA, T.HOUSE, T.SPORTS, T.APARTMENT, T.WORK, T.SHOP];
const spots = [];
for (const x of [4, 6, 8, 10, 12, 14, 16, 18]) for (let y = 3; y <= 21; y++) if (y !== c + 1 && !(x === c && y === c)) spots.push(sim.idx(x, y));
let bi = 0, pi = 0;
console.log('day  pop  kids  jobs  money  mood  births deaths  riders  sick');
for (let day = 1; day <= 100; day++) {
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  if (s.status !== 'alive') { console.log('city fell on day', day); break; }
  // Buy land as the city grows, then build the next thing on the list if affordable.
  for (let k = 0; k < 36 && s.money > sim.landPrice(s) + 800; k++) if (sim.canBuyLand(s, k).ok) { sim.buyLand(s, k); break; }
  while (bi < order.length && sim.place(s, sim.idx(order[bi][0], order[bi][1]), order[bi][2]).ok) bi++;
  if (bi < order.length && !sim.owns(s, sim.idx(order[bi][0], order[bi][1]))) bi++;
  for (let tries = 0; tries < 3 && pi < plan.length && s.money > B[plan[pi]].cost + 300; tries++) {
    const i = spots.find((i) => s.grid[i] === T.EMPTY && sim.owns(s, i) && sim.neighbours(i).some((n) => s.grid[n] === T.ROAD));
    if (i === undefined) break;
    const r = sim.place(s, i, plan[pi]);
    if (r.ok || /Needs \\d+ people|first/.test(r.reason || '')) pi++;
    else break;
  }
  if (day % 10 === 0) {
    const cs = sim.census(s);
    console.log(String(day).padStart(3), String(s.people.length).padStart(5), String(cs.toddlers + cs.kids + cs.teens).padStart(5), String(cs.employed).padStart(5),
      String(Math.round(s.money)).padStart(7), String(Math.round(s.happiness * 100) + '%').padStart(5), String(s.counters.births).padStart(6), String(s.counters.deaths).padStart(6),
      String(s.stats.riders || 0).padStart(7), String(cs.sick).padStart(5));
  }
}
