// Balance check: a mayor who follows the in-game advisor builds a city for 100 days. Prints how it goes.
// Run with: node test/balance.mjs [seed] [days]
import * as sim from '../public/js/sim.js';
import { T, B, PLOT } from '../public/js/constants.js';

let seed = Number(process.argv[2] || 5);
const DAYS = Number(process.argv[3] || 100);
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const s = sim.newCity('Balance', rng);
const c = PLOT >> 1;
// Streets: a grid every 3 tiles through the whole plot, laid as land is bought.
const isStreet = (x, y) => (x - c) % 3 === 0 || (y - c) % 3 === 0;
const roads = [];
for (let y = 1; y < PLOT - 1; y++) for (let x = 1; x < PLOT - 1; x++) if (isStreet(x, y) && sim.idx(x, y) !== sim.HALL_INDEX) roads.push(sim.idx(x, y));
roads.sort((a, b) => Math.hypot(a % PLOT - c, (a / PLOT | 0) - c) - Math.hypot(b % PLOT - c, (b / PLOT | 0) - c));
const spot = () => {
  let best = -1, bd = 1e9;
  for (let i = 0; i < PLOT * PLOT; i++) {
    if (s.grid[i] !== T.EMPTY || !sim.owns(s, i) || !sim.neighbours(i).some((n) => s.grid[n] === T.ROAD || s.grid[n] === T.HALL)) continue;
    const d = Math.hypot(i % PLOT - c, (i / PLOT | 0) - c);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
const tryBuild = (t) => { const i = spot(); if (i < 0) return false; return sim.place(s, i, t).ok; };
console.log('day   pop  jobs  money   net  mood   air  tour  births deaths  loan');
let fell = false;
for (let day = 1; day <= DAYS; day++) {
  for (let h = 0; h < 24; h++) sim.tick(s, rng);
  if (s.status !== 'alive') { console.log('city fell on day', day); fell = true; break; }
  for (const i of roads) if (sim.owns(s, i) && s.grid[i] === T.EMPTY && s.money > 60) sim.place(s, i, T.ROAD);
  const p = s._plan || sim.plan(s, rng);
  const tips = sim.advice(s, p).filter((a) => a.type != null);
  // A sensible mayor saves up for the most urgent thing rather than spending on the rest.
  let saving = false;
  for (const tip of tips) {
    if (!sim.availability(s, tip.type).ok) continue;
    if (s.money < B[tip.type].cost + 150) { saving = tip.score >= 6; break; }
    if (tryBuild(tip.type)) break;
  }
  const tot = sim.totals(s);
  if (!saving && tot.homes < s.people.length + 8 && s.money > 300) tryBuild(s.people.length > 40 && sim.availability(s, T.APARTMENT).ok ? T.APARTMENT : T.HOUSE);
  if (spot() < 0 || s.money > 2500) for (let k = 0; k < 36; k++) if (sim.canBuyLand(s, k).ok && s.money > sim.landPrice(s) + 400) { sim.buyLand(s, k); break; }
  if (process.env.DEBUG && day % 10 === 0) console.log(JSON.stringify(s.stats.byClass), JSON.stringify(s.stats.upkeepBy), JSON.stringify(sim.advice(s, s._plan).map(a=>a.text.slice(0,40))));
  if (day % 10 === 0) {
    const cs = sim.census(s), st = s.stats;
    console.log(String(day).padStart(3), String(s.people.length).padStart(5), String(cs.employed).padStart(5), String(Math.round(s.money)).padStart(6),
      String((st.income || 0) - (st.upkeep || 0)).padStart(5), (Math.round(s.happiness * 100) + '%').padStart(5), String(Math.round((st.air ?? 1) * 100) + '%').padStart(5),
      String(st.tourists || 0).padStart(5), String(s.counters.births).padStart(7), String(s.counters.deaths).padStart(6), String(s.loan?.left || 0).padStart(5));
  }
}
if (!fell) console.log(`day ${DAYS}: ${s.people.length} people, peak ${s.peakPop}, credit ${sim.creditRating(s)}, badges: ${sim.summary(s).badges.join(', ') || 'none'}`);
