// Pure city simulation. No DOM, no Firebase — so it runs in the browser and in node tests.
import {
  PLOT, T, B, START_MONEY, REBUILD_MONEY, GRACE_DAYS, EDU_DAYS, VOLUNTEER_RATE,
  RUBBLE_CLEAR_COST, COLLAPSE_UNPAID_DAYS, ROAD_CAP, HALL_CAP, TAX, JOB_ODDS, HOURS_PER_DAY,
} from './constants.js';

const N = PLOT * PLOT;
export const idx = (x, y) => y * PLOT + x;
export const xy = (i) => ({ x: i % PLOT, y: Math.floor(i / PLOT) });
export const HALL_INDEX = idx(PLOT >> 1, PLOT >> 1);

function neighbours(i) {
  const x = i % PLOT, y = (i / PLOT) | 0, out = [];
  if (x > 0) out.push(i - 1);
  if (x < PLOT - 1) out.push(i + 1);
  if (y > 0) out.push(i - PLOT);
  if (y < PLOT - 1) out.push(i + PLOT);
  return out;
}

// ---------- state ----------

export function newCity(name) {
  const grid = new Array(N).fill(T.EMPTY);
  const cond = new Array(N).fill(0);
  grid[HALL_INDEX] = T.HALL;
  cond[HALL_INDEX] = 100;
  return {
    v: 1, name, grid, cond, queue: [],
    money: START_MONEY,
    pop: { unskilled: 3, builder: 3, teacher: 0, pro: 0 },
    cohorts: [],            // students: [{ n, d }] where d = days of school left
    happiness: 0.65,
    hour: 0, day: 0, peakPop: 6, unpaidDays: 0,
    cityNo: 1, status: 'alive', lastTick: Date.now(),
    stats: { income: 0, upkeep: 0, failedTrips: 0, arrivals: 0, departures: 0, graduates: 0 },
  };
}

export function serialize(s) {
  return JSON.stringify(s, (k, v) => (k.startsWith('_') ? undefined : v));
}

export function students(s) { return s.cohorts.reduce((a, c) => a + c.n, 0); }
export function totalPop(s) {
  const p = s.pop;
  return p.unskilled + p.builder + p.teacher + p.pro + students(s);
}

export function summary(s) {
  return {
    name: s.name, pop: totalPop(s), peakPop: s.peakPop, happiness: Math.round(s.happiness * 100) / 100,
    money: Math.floor(s.money), day: s.day, status: s.status, cityNo: s.cityNo,
  };
}

export const underConstruction = (s) => new Set(s.queue.map((q) => q.i));

// Condition scales what a building provides: full above 40, half while decaying, nothing when abandoned.
function condFactor(s, i) {
  if (s.grid[i] === T.HALL) return 1;
  const c = s.cond[i];
  return c >= 40 ? 1 : c > 0 ? 0.5 : 0;
}

export function totals(s, uc = underConstruction(s)) {
  const t = { homes: 0, jobs: 0, serves: 0, seats: 0, schools: 0, upkeep: 0 };
  for (let i = 0; i < N; i++) {
    const type = s.grid[i];
    if (type === T.EMPTY || type === T.RUBBLE || uc.has(i)) continue;
    const def = B[type];
    if (type === T.ROAD) { t.upkeep += def.upkeep; continue; }
    const f = condFactor(s, i);
    if (f === 0) continue; // abandoned buildings cost nothing and provide nothing
    t.upkeep += def.upkeep;
    t.homes += (def.homes || 0) * f;
    t.jobs += (def.jobs || 0) * f;
    t.serves += (def.serves || 0) * f;
    t.seats += (def.seats || 0) * f;
    if (type === T.SCHOOL) t.schools++;
  }
  t.homes = Math.floor(t.homes);
  t.seats = Math.floor(t.seats);
  return t;
}

// ---------- traffic (the Junction part) ----------

class MinHeap {
  constructor() { this.a = []; }
  push(p, v) { const a = this.a; a.push([p, v]); let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() { const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top; }
  get size() { return this.a.length; }
}

// Every home sends its residents to the nearest job and the nearest shop along the road network.
// Routing is congestion-aware (busy roads cost more), so parallel routes genuinely spread load —
// but a single artery or a hall bottleneck will still jam, and jammed trips fail.
export function computeTraffic(s, uc = underConstruction(s), tot = totals(s, uc)) {
  const pop = totalPop(s);
  const load = new Float32Array(N);
  const cap = new Float32Array(N);
  const isNode = new Uint8Array(N);
  const workT = new Uint8Array(N);
  const shopT = new Uint8Array(N);
  const live = (i) => !uc.has(i) && (s.grid[i] === T.HALL || s.cond[i] > 0);

  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (t === T.HALL) { isNode[i] = 1; cap[i] = HALL_CAP; workT[i] = 1; shopT[i] = 1; }
    else if (t === T.ROAD && !uc.has(i)) { isNode[i] = 1; cap[i] = ROAD_CAP; }
  }
  for (let i = 0; i < N; i++) {
    if (!isNode[i]) continue;
    for (const nb of neighbours(i)) {
      const t = s.grid[nb];
      if (!live(nb)) continue;
      if (t === T.WORK || t === T.SHOP || t === T.SCHOOL) workT[i] = 1;
      if (t === T.SHOP) shopT[i] = 1;
    }
  }

  const parks = [];
  for (let i = 0; i < N; i++) if (s.grid[i] === T.PARK && live(i)) parks.push(xy(i));

  const homes = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if ((t === T.HOUSE && live(i)) || t === T.HALL) {
      const c = (B[t].homes || 0) * condFactor(s, i);
      if (c > 0) homes.push({ i, cap: c });
    }
  }
  const occupancy = tot.homes > 0 ? Math.min(1, pop / tot.homes) : 0;

  const route = (starts, targets) => {
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const h = new MinHeap();
    for (const st of starts) { dist[st] = 1 + load[st] / cap[st]; h.push(dist[st], st); }
    while (h.size) {
      const [d, u] = h.pop();
      if (d > dist[u]) continue;
      if (targets[u]) { const path = []; for (let v = u; v !== -1; v = prev[v]) path.push(v); return path; }
      for (const v of neighbours(u)) {
        if (!isNode[v]) continue;
        const nd = d + 1 + 2 * (load[v] / cap[v]);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; h.push(nd, v); }
      }
    }
    return null;
  };

  // Pass 1: route and accumulate load.
  for (const home of homes) {
    home.r = home.cap * occupancy;
    const starts = s.grid[home.i] === T.HALL ? [home.i] : neighbours(home.i).filter((n) => isNode[n]);
    home.workPath = starts.length ? route(starts, workT) : null;
    home.shopPath = starts.length ? route(starts, shopT) : null;
    if (home.workPath) for (const p of home.workPath) load[p] += home.r;
    if (home.shopPath) for (const p of home.shopPath) load[p] += home.r * 0.5;
  }

  // Pass 2: a trip succeeds in proportion to how jammed its worst tile is.
  const success = (path) => {
    if (!path) return 0;
    let worst = 0;
    for (const p of path) worst = Math.max(worst, load[p] / cap[p]);
    return worst <= 1 ? 1 : 1 / worst;
  };
  const serviceRatio = pop > 0 ? Math.min(1, tot.serves / pop) : 1;
  const workforce = s.pop.unskilled + s.pop.teacher + s.pop.pro;
  let wSum = 0, workSucc = 0, target = 0, failed = 0;
  for (const home of homes) {
    const ws = success(home.workPath), ss = success(home.shopPath);
    const { x, y } = xy(home.i);
    const park = parks.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 3) ? 1 : 0;
    const cond = s.grid[home.i] === T.HALL ? 1 : s.cond[home.i] / 100;
    home.happy = 0.2 + 0.35 * ws + 0.25 * ss * serviceRatio + 0.1 * park + 0.1 * cond;
    home.workSucc = ws; home.shopSucc = ss;
    target += home.happy * home.cap;
    workSucc += ws * home.cap;
    wSum += home.cap;
    failed += home.r * (1 - ws) + home.r * (1 - ss);
  }
  const avgWorkSucc = wSum ? workSucc / wSum : 0;
  const employed = Math.min(workforce, tot.jobs) * avgWorkSucc;
  const employmentRate = workforce > 0 ? employed / workforce : 1;
  target = wSum ? target / wSum : 0.5;
  target *= 0.6 + 0.4 * employmentRate;

  return { load, cap, homes, target, failedTrips: Math.round(failed), employed, employmentRate, serviceRatio };
}

// ---------- player actions ----------

export function canPlace(s, i, type) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen. Rebuild to keep playing.' };
  if (i < 0 || i >= N) return { ok: false, reason: 'Outside your plot.' };
  if (s.grid[i] === T.RUBBLE) return { ok: false, reason: 'Clear the rubble first.' };
  if (s.grid[i] !== T.EMPTY) return { ok: false, reason: 'That tile is taken.' };
  if (s.money < B[type].cost) return { ok: false, reason: `Needs $${B[type].cost}.` };
  return { ok: true };
}

export function place(s, i, type) {
  const check = canPlace(s, i, type);
  if (!check.ok) return check;
  s.money -= B[type].cost;
  s.grid[i] = type;
  s.cond[i] = 0;
  s.queue.push({ i, left: B[type].work });
  return { ok: true };
}

export function bulldoze(s, i) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  const t = s.grid[i];
  if (t === T.EMPTY) return { ok: false, reason: 'Nothing to clear.' };
  if (t === T.HALL) return { ok: false, reason: 'The town hall stays.' };
  if (t === T.RUBBLE) {
    if (s.money < RUBBLE_CLEAR_COST) return { ok: false, reason: `Clearing rubble needs $${RUBBLE_CLEAR_COST}.` };
    s.money -= RUBBLE_CLEAR_COST;
  } else {
    const q = s.queue.findIndex((q) => q.i === i);
    if (q !== -1) {
      if (s.queue[q].left === B[t].work) s.money += Math.floor(B[t].cost * 0.5); // unstarted: half back
      s.queue.splice(q, 1);
    }
  }
  s.grid[i] = T.EMPTY;
  s.cond[i] = 0;
  return { ok: true };
}

// ---------- time ----------

function construct(s) {
  let labour = s.pop.builder + s.pop.unskilled * VOLUNTEER_RATE;
  while (labour > 0 && s.queue.length) {
    const q = s.queue[0];
    const used = Math.min(labour, q.left);
    q.left -= used;
    labour -= used;
    if (q.left <= 1e-6) { s.queue.shift(); s.cond[q.i] = 100; }
  }
}

function pickJob(rng) {
  const r = rng();
  if (r < JOB_ODDS.builder) return 'builder';
  if (r < JOB_ODDS.builder + JOB_ODDS.teacher) return 'teacher';
  return 'pro';
}

function removePeople(s, n) {
  let removed = 0;
  while (removed < n) {
    const pools = [['unskilled', s.pop.unskilled], ['pro', s.pop.pro], ['teacher', s.pop.teacher], ['builder', s.pop.builder]];
    const biggestCohort = s.cohorts.reduce((b, c) => (!b || c.n > b.n ? c : b), null);
    pools.sort((a, b) => b[1] - a[1]);
    if (pools[0][1] > 0 && (!biggestCohort || pools[0][1] >= biggestCohort.n)) s.pop[pools[0][0]]--;
    else if (biggestCohort && biggestCohort.n > 0) biggestCohort.n--;
    else break;
    removed++;
  }
  s.cohorts = s.cohorts.filter((c) => c.n > 0);
  return removed;
}

function educate(s, tot, rng) {
  const boost = 1 + Math.min(1, s.pop.teacher / Math.max(1, tot.schools * 2));
  let graduates = 0;
  for (const c of s.cohorts) c.d -= boost;
  for (const c of s.cohorts.filter((c) => c.d <= 0)) {
    for (let k = 0; k < c.n; k++) s.pop[pickJob(rng)]++;
    graduates += c.n;
  }
  s.cohorts = s.cohorts.filter((c) => c.d > 0);
  const free = tot.seats - students(s);
  const enrol = Math.min(Math.max(0, free), s.pop.unskilled);
  if (enrol > 0) { s.pop.unskilled -= enrol; s.cohorts.push({ n: enrol, d: EDU_DAYS }); }
  return graduates;
}

function daily(s, tot, traffic, rng) {
  const st = { income: 0, upkeep: 0, failedTrips: traffic.failedTrips, arrivals: 0, departures: 0, graduates: 0 };

  // Money: happiness-weighted tax against upkeep that doesn't shrink with population.
  const p = s.pop;
  const workforce = p.unskilled + p.teacher + p.pro;
  const e = traffic.employmentRate;
  const gross = e * (p.unskilled * TAX.unskilled + p.teacher * TAX.teacher + p.pro * TAX.pro)
    + p.builder * TAX.builder + (1 - e) * workforce * TAX.unemployed;
  const mood = Math.min(1, Math.max(0, (s.happiness - 0.15) / 0.7));
  st.income = Math.round(gross * mood);
  st.upkeep = Math.round(tot.upkeep);
  s.money += st.income - st.upkeep;

  // Maintenance: when upkeep can't be paid, buildings decay; paid upkeep repairs slowly.
  const uc = underConstruction(s);
  const buildings = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (t !== T.EMPTY && t !== T.ROAD && t !== T.HALL && t !== T.RUBBLE && !uc.has(i) && s.cond[i] > 0) buildings.push(i);
  }
  if (s.money < 0) {
    const debt = Math.min(1, -s.money / Math.max(1, st.upkeep));
    const decay = 10 + 15 * debt;
    for (const i of buildings) s.cond[i] = Math.max(0, s.cond[i] - decay);
    s.money = 0;
    s.unpaidDays++;
  } else {
    s.unpaidDays = 0;
    for (const i of buildings) s.cond[i] = Math.min(100, s.cond[i] + 5);
  }

  st.graduates = educate(s, tot, rng);

  // Migration: homeless leave, unhappy leave, happy cities attract newcomers.
  const after = totals(s);
  const pop = totalPop(s);
  let leave = 0;
  if (pop > after.homes) leave = pop - after.homes;
  else if (s.day >= GRACE_DAYS && s.happiness < 0.4) leave = Math.ceil(pop * (0.4 - s.happiness) * 0.6);
  st.departures = removePeople(s, leave);
  const room = after.homes - totalPop(s);
  if (leave === 0 && room > 0 && s.happiness >= 0.55) {
    st.arrivals = Math.min(room, Math.max(1, Math.round(room * 0.3 * s.happiness)));
    s.pop.unskilled += st.arrivals;
  }

  s.day++;
  s.peakPop = Math.max(s.peakPop, totalPop(s));
  s.stats = st;

  const broke = s.money < B[T.HOUSE].cost;
  if ((totalPop(s) === 0 && broke && s.day > GRACE_DAYS) || s.unpaidDays >= COLLAPSE_UNPAID_DAYS) {
    return collapse(s);
  }
  return null;
}

export function collapse(s) {
  const record = {
    name: s.name, cityNo: s.cityNo, peakPop: s.peakPop, daysSurvived: s.day, outcome: 'collapsed',
  };
  for (let i = 0; i < N; i++) {
    if (s.grid[i] !== T.EMPTY) { s.grid[i] = T.RUBBLE; s.cond[i] = 0; }
  }
  s.queue = [];
  s.cohorts = [];
  s.pop = { unskilled: 0, builder: 0, teacher: 0, pro: 0 };
  s.status = 'ruins';
  s.happiness = 0;
  return record;
}

// Start a new city on the ruins: rubble stays and costs money to clear.
export function rebuild(s, name) {
  s.grid[HALL_INDEX] = T.HALL;
  s.cond[HALL_INDEX] = 100;
  Object.assign(s, {
    name: name || s.name, queue: [], money: REBUILD_MONEY,
    pop: { unskilled: 3, builder: 3, teacher: 0, pro: 0 }, cohorts: [],
    happiness: 0.65, hour: 0, day: 0, peakPop: 6, unpaidDays: 0,
    cityNo: s.cityNo + 1, status: 'alive',
  });
}

// One in-game hour. Returns the latest traffic picture and a collapse record if the city fell.
export function tick(s, rng = Math.random) {
  if (s.status !== 'alive') return { traffic: null, collapsed: null };
  construct(s);
  const uc = underConstruction(s);
  const tot = totals(s, uc);
  const traffic = computeTraffic(s, uc, tot);
  s.happiness += (traffic.target - s.happiness) * 0.12;
  s.hour++;
  let collapsed = null;
  if (s.hour >= HOURS_PER_DAY) { s.hour = 0; collapsed = daily(s, tot, traffic, rng); }
  return { traffic, collapsed, totals: tot };
}
