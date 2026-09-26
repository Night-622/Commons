// Balance check: a mayor who follows the in-game advisor builds a city for 100 days. Prints how it goes.
// Run with: node test/balance.mjs [seed] [days]        one city, a line every 10 days
//           node test/balance.mjs 1-20 [days]          many seeds, one line each plus a tally
// Runs are reproducible: the world clock starts on launch day and moves one hour per tick, and
// Math.random (used in a few places in sim.js) is replaced by the seeded generator.
import * as sim from '../public/js/sim.js';
import { T, B, PLOT, TICK_MS, TECH } from '../public/js/constants.js';

const START = Date.UTC(2026, 8, 25);
let clock = START, seed = 1;
Date.now = () => clock;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
Math.random = rng;

const DAYS = Number(process.argv[3] || 100);
const c = PLOT >> 1;
// Streets: a grid every 3 tiles through the whole plot, laid as land is bought.
const isStreet = (x, y) => (x - c) % 3 === 0 || (y - c) % 3 === 0;
const roads = [];
for (let y = 1; y < PLOT - 1; y++) for (let x = 1; x < PLOT - 1; x++) if (isStreet(x, y) && sim.idx(x, y) !== sim.HALL_INDEX) roads.push(sim.idx(x, y));
roads.sort((a, b) => Math.hypot(a % PLOT - c, (a / PLOT | 0) - c) - Math.hypot(b % PLOT - c, (b / PLOT | 0) - c));

function run(startSeed, verbose) {
  clock = START; seed = startSeed;
  const s = sim.newCity('Balance', rng);
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
  if (verbose) console.log('day   pop  jobs  money   net  mood   air  tour  births deaths  loan');
  let fellOn = 0;
  for (let day = 1; day <= DAYS; day++) {
    for (let h = 0; h < 24; h++) { sim.tick(s, rng); clock += TICK_MS; s.lastTick = clock; }
    sim.checkHall(s, { cities: 1 });   // the game checks this all the time; the town hall grows when it can
    if (s.status !== 'alive') { fellOn = day; break; }
    for (const i of roads) if (sim.owns(s, i) && s.grid[i] === T.EMPTY && s.money > 60) sim.place(s, i, T.ROAD);
    // Like a player, research whatever it can afford (cheapest first) and collect any harvests that are ready.
    for (const t of [...TECH].sort((a, b) => a.cost - b.cost)) if (sim.canResearch(s, t.id).ok) sim.research(s, t.id);
    for (let i = 0; i < PLOT * PLOT; i++) if (sim.harvestReady(s, i)) sim.harvest(s, i);
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
    if (verbose && process.env.DEBUG && day % 10 === 0) console.log(JSON.stringify(s.stats.byClass), JSON.stringify(s.stats.upkeepBy), JSON.stringify(sim.advice(s, s._plan).map(a=>a.text.slice(0,40))));
    if (verbose && day % 10 === 0) {
      const cs = sim.census(s), st = s.stats;
      console.log(String(day).padStart(3), String(s.people.length).padStart(5), String(cs.employed).padStart(5), String(Math.round(s.money)).padStart(6),
        String((st.income || 0) - (st.upkeep || 0)).padStart(5), (Math.round(s.happiness * 100) + '%').padStart(5), String(Math.round((st.air ?? 1) * 100) + '%').padStart(5),
        String(st.tourists || 0).padStart(5), String(s.counters.births).padStart(7), String(s.counters.deaths).padStart(6), String(s.loan?.left || 0).padStart(5));
    }
  }
  sim.checkHall(s);
  return { seed: startSeed, fellOn, pop: s.people.length, peak: s.peakPop, credit: sim.creditRating(s), badges: sim.summary(s).badges, hall: sim.hallState(s).name, land: s.land.filter(Boolean).length };
}

const arg = String(process.argv[2] || 5);
const range = arg.match(/^(\d+)-(\d+)$/);
if (!range) {
  const r = run(Number(arg), true);
  console.log(r.fellOn ? `city fell on day ${r.fellOn}` : `day ${DAYS}: ${r.pop} people, peak ${r.peak}, credit ${r.credit}, badges: ${r.badges.join(', ') || 'none'}`);
} else {
  // Grown: 60+ people at the end. Stalled: alive but under 60. Fell: collapsed.
  const tally = { grown: 0, stalled: 0, fell: 0 };
  for (let k = Number(range[1]); k <= Number(range[2]); k++) {
    const r = run(k, false);
    const kind = r.fellOn ? 'fell' : r.pop >= 60 ? 'grown' : 'stalled';
    tally[kind]++;
    console.log(`seed ${String(k).padStart(3)}  ${kind.padEnd(7)}  ${r.fellOn ? `day ${r.fellOn}` : `${r.pop} people`}, peak ${r.peak}, credit ${r.credit}, hall ${r.hall}, land ${r.land}`);
  }
  console.log(`grown ${tally.grown}, stalled ${tally.stalled}, fell ${tally.fell}`);
}
