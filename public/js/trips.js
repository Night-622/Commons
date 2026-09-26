// Turns each resident's daily plan into moving people on the map.
// Every car, bike and walker is a real person on a real trip, leaving at their own time.
import { T, B, PLOT, TICK_MS } from './constants.js';
import { h32, plan as makePlan, personName } from './sim.js';

const SPEED = { car: 2.4, bike: 1.3, walk: 0.75, bus: 1.8, train: 3 };   // tiles per real second
const LANE = { car: 0.2, bike: 0.3, walk: 0.4, bus: 0.2, train: 0 };     // distance from the middle of the road
const SHIRTS = ['#e0588e', '#3b7ddd', '#f0963a', '#2f9e5a', '#8a5bd6', '#e04b3c', '#16a2b8', '#f2c744', '#5b6f76'];
const HOUR_S = TICK_MS / 1000;

export const TRIP_WORDS = {
  work: 'going to work', school: 'going to school', uni: 'going to university', drop: 'taking the kids to school', tutor: 'going to tutoring',
  fun: 'going out', care: 'going to see a doctor', shop: 'doing the food shopping',
};

export class TripSim {
  constructor() { this.plots = new Map(); this.followed = null; }
  clear() { this.plots.clear(); this.followed = null; }
  has(id) { return this.plots.has(id); }
  drop(id) { this.plots.delete(id); }

  // Call when a plot's plan changes (new day, or the player built something).
  set(id, st, plan) {
    const e = this.plots.get(id) || { agents: [] };
    e.st = st;
    e.plan = plan || st._plan || makePlan(st);
    e.last = null;
    e.day = e.plan.day;
    // Vehicles: trains shuttle along each line, buses loop through every stop.
    e.agents = e.agents.filter((a) => !a.vehicle);
    for (const line of e.plan.trainLines || []) e.agents.push({ vehicle: true, mode: 'train', path: line, s: Math.random() * (line.length - 1), dir: 1, p: -1 });
    const loop = e.plan.busLoop;
    if (loop) for (let k = 0; k < loop.buses; k++) e.agents.push({ vehicle: true, mode: 'bus', path: loop.path, stops: loop.stops, s: (k / loop.buses) * (loop.path.length - 1), dir: 1, p: -1, wait: 0 });
    this.plots.set(id, e);
  }

  spawn(e, trip, back, progress = 0) {
    if (e.agents.length > 150 || trip.mode === 'bus' || trip.mode === 'train' || trip.mode === 'metro') return;   // riders are inside the vehicles, or underground
    const path = back ? [...trip.path].reverse() : trip.path;
    if (path.length < 2) return;
    const who = trip.visitor || e.st.people.find((p) => p.i === trip.p);
    if (!who) return;
    e.agents.push({
      trip, back, path, mode: trip.mode, s: progress * (path.length - 1), p: trip.p,
      shirt: SHIRTS[Math.floor(h32(trip.p, 2) * SHIRTS.length)], c: Math.floor(h32(trip.p, 5) * 6),
      follow: this.followed && this.followed.person === trip.p, visitor: trip.visitor,
    });
  }

  // Moves everyone on the listed plots. clock(id) gives the plot's time of day in hours.
  update(dt, ids, clock, density = 1) {
    const out = new Map();
    for (const id of ids) {
      const e = this.plots.get(id);
      if (!e || e.st.status !== 'alive') continue;
      const t = clock(id);
      const quiet = (trip) => density < 1 && h32(trip.p, 11) > density;
      if (e.last === null) {
        // Joining mid-day: put people already on the road where they'd be by now.
        for (const trip of e.plan.trips) {
          if (quiet(trip)) continue;
          for (const back of [false, true]) {
            const start = back ? trip.ret : trip.dep, len = trip.path.length - 1;
            const hours = len / SPEED[trip.mode] / HOUR_S;
            if (t >= start && t < start + hours) this.spawn(e, trip, back, (t - start) / hours);
          }
        }
      } else if (t >= e.last) {
        for (const trip of e.plan.trips) {
          if (quiet(trip)) continue;
          if (trip.dep > e.last && trip.dep <= t) this.spawn(e, trip, false);
          if (trip.ret > e.last && trip.ret <= t) this.spawn(e, trip, true);
        }
      }
      e.last = t;
      const byTile = new Map();
      const { load, cap } = e.plan;
      e.agents = e.agents.filter((a) => {
        const tile = a.path[Math.floor(a.s)];
        if (a.vehicle) {
          if (a.wait > 0) a.wait -= dt;
          else {
            const before = Math.floor(a.s);
            a.s += dt * SPEED[a.mode] * a.dir;
            if (a.mode === 'train') {
              if (a.s >= a.path.length - 1) { a.s = a.path.length - 1.001; a.dir = -1; a.wait = 1.2; }
              if (a.s <= 0) { a.s = 0; a.dir = 1; a.wait = 1.2; }
            } else {
              if (a.s >= a.path.length - 1) a.s = 0;
              if (Math.floor(a.s) !== before && a.stops.has(a.path[Math.floor(a.s)])) a.wait = 0.8;
            }
          }
        } else {
          const ratio = a.mode === 'car' && cap[tile] ? load[tile] / cap[tile] : 0;
          a.s += dt * SPEED[a.mode] * (ratio > 1 ? 0.35 / ratio : ratio > 0.7 ? 0.7 : 1);
          if (a.s >= a.path.length - 1) return false;
        }
        const k = Math.floor(a.s), f = a.s - k, p = a.path[k], q = a.path[k + 1];
        const ax = (p % PLOT) + 0.5, ay = ((p / PLOT) | 0) + 0.5, bx = (q % PLOT) + 0.5, by = ((q / PLOT) | 0) + 0.5;
        const dx = bx - ax, dy = by - ay;
        if (dx || dy) { a.dx = dx * (a.dir || 1); a.dy = dy * (a.dir || 1); }
        const lane = e.st.grid[f < 0.5 ? p : q] === T.PATH ? 0.15 : LANE[a.mode];
        a.lx = ax + dx * f - (a.dy || 0) * lane;
        a.ly = ay + dy * f + (a.dx || 0) * lane;
        const at = f < 0.5 ? p : q;
        if (!byTile.has(at)) byTile.set(at, []);
        byTile.get(at).push(a);
        return true;
      });
      out.set(id, byTile);
    }
    return out;
  }

  agents(id) { return this.plots.get(id)?.agents || []; }

  follow(id, person) {
    this.followed = { plot: id, person };
    for (const e of this.plots.values()) for (const a of e.agents) a.follow = a.p === person;
  }
  unfollow() {
    this.followed = null;
    for (const e of this.plots.values()) for (const a of e.agents) a.follow = false;
  }
  followedAgent() {
    if (!this.followed) return null;
    return this.agents(this.followed.plot).find((a) => a.p === this.followed.person) || null;
  }
}

// Where someone is right now, in words: "At work (Office)", "Driving to Primary school".
export function whereabouts(st, plan, person, t, agent) {
  if (agent) {
    if (agent.trip.abroad) return `${agent.mode === 'train' ? 'On the train' : 'Heading'} ${agent.back ? 'home' : `to ${agent.trip.city}`}`;
    const dest = agent.back ? 'home' : B[st.grid[agent.trip.to]]?.name || 'town';
    const how = agent.mode === 'car' ? 'Driving' : agent.mode === 'bike' ? 'Cycling' : 'Walking';
    const kid = agent.trip.kid && st.people.find((p) => p.i === agent.trip.kid);
    return `${how} ${agent.back ? 'home' : `to the ${dest.toLowerCase()}`}${kid && !agent.back ? ` with ${personName(kid).split(' ')[0]}` : ''}`;
  }
  if (person.hol > 0) return `On holiday in ${person.hcity || 'the next city'}`;
  const mine = plan.trips.filter((x) => x.p === person.i || x.with?.includes(person.i));
  const out = mine.find((x) => x.abroad && x.dep <= t && t < x.ret);
  if (out) return { fun: `Out for the evening in ${out.city}`, school: `At school in ${out.city}`, care: `Seeing a doctor in ${out.city}`, shop: `Shopping in ${out.city}` }[out.kind] || `In ${out.city}`;
  for (const x of mine) {
    if (x.mode !== 'bus' && x.mode !== 'train' && x.mode !== 'metro') continue;
    const hours = x.path.length / (SPEED[x.mode] || SPEED.train) / HOUR_S + 0.3;
    for (const back of [false, true]) {
      const start = back ? x.ret : x.dep;
      if (t >= start && t < start + hours) return `On the ${x.mode} ${back ? 'home' : `to the ${(B[st.grid[x.to]]?.name || 'town').toLowerCase()}`}`;
    }
  }
  const now = mine.filter((x) => x.dep <= t && t < x.ret).sort((a, b) => b.dep - a.dep)[0];
  if (now) {
    const name = B[st.grid[now.to]]?.name || 'town';
    if (now.kind === 'work' && person.oj) return `At work in the next city (went by ${person.oj === 'rail' ? 'train' : 'bus'})`;
    return { work: `At work (${name})`, school: `At school (${name})`, drop: `At school (${name})`, uni: 'At university', tutor: 'At tutoring',
      fun: `Out at the ${name.toLowerCase()}`, care: `At the ${name.toLowerCase()}`, shop: `Shopping at the ${name.toLowerCase()}` }[now.kind] || 'Out';
  }
  if (person.ill) return 'At home, unwell';
  return t < 6 || t >= 22 ? 'At home, asleep' : 'At home';
}
