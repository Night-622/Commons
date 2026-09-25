// Pure city simulation. No DOM, no Firebase — so it runs in the browser and in node tests.
import {
  PLOT, T, B, START_MONEY, REBUILD_MONEY, GRACE_DAYS, EDU_DAYS, VOLUNTEER_RATE, RUBBLE_CLEAR_COST,
  COLLAPSE_UNPAID_DAYS, ROAD_CAP, HALL_CAP, TAX, JOB_ODDS, HOURS_PER_DAY, LEVEL, MAX_LEVEL, UPGRADABLE,
  TAP_SHARE, TAP_CAP, GOALS, TRADE_PER_LINK, LINK_MOOD, MAX_LINKS, HISTORY_DAYS, LOG_SIZE, EVENT_CHANCE,
} from './constants.js';

const N = PLOT * PLOT;
export const idx = (x, y) => y * PLOT + x;
export const xy = (i) => ({ x: i % PLOT, y: Math.floor(i / PLOT) });
export const HALL_INDEX = idx(PLOT >> 1, PLOT >> 1);

export function neighbours(i) {
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
    v: 2, name, grid, cond, lv: new Array(N).fill(1), queue: [],
    money: START_MONEY,
    pop: { unskilled: 3, builder: 3, teacher: 0, pro: 0 },
    cohorts: [],            // students: [{ n, d }] where d = days of school left
    happiness: 0.65,
    hour: 0, day: 0, peakPop: 6, unpaidDays: 0,
    cityNo: 1, status: 'alive', lastTick: Date.now(), goalsDone: [],
    history: [], log: [], links: 0, flags: {},
    stats: { income: 0, upkeep: 0, failedTrips: 0, arrivals: 0, departures: 0, graduates: 0 },
  };
}

// News feed entries: kind is good | warn | info | event.
export function note(s, kind, text) {
  s.log.push({ d: s.day, h: s.hour, k: kind, t: text });
  if (s.log.length > LOG_SIZE) s.log.splice(0, s.log.length - LOG_SIZE);
}

// Bring older saves up to the current shape.
export function migrate(s) {
  if (!s.lv) s.lv = new Array(N).fill(1);
  if (!s.goalsDone) s.goalsDone = [];
  if (!s.history) s.history = [];
  if (!s.log) s.log = [];
  if (!s.flags) s.flags = {};
  s.links = s.links || 0;
  for (const q of s.queue) if (q.tap === undefined) q.tap = 0;
  s.v = 3;
  return s;
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

// New buildings are inactive until finished. Upgrades keep working while they're being built.
export const underConstruction = (s) => new Set(s.queue.filter((q) => !q.up).map((q) => q.i));

function condFactor(s, i) {
  if (s.grid[i] === T.HALL) return 1;
  const c = s.cond[i];
  return c >= 40 ? 1 : c > 0 ? 0.5 : 0;
}
const levelOf = (s, i) => (s.lv ? s.lv[i] || 1 : 1);
export function capacity(s, i, field) {
  const def = B[s.grid[i]];
  return (def[field] || 0) * condFactor(s, i) * LEVEL.capacity[levelOf(s, i)];
}

export function totals(s, uc = underConstruction(s)) {
  const t = { homes: 0, jobs: 0, serves: 0, seats: 0, schools: 0, upkeep: 0, roads: 0, counts: {}, upkeepBy: {} };
  for (let i = 0; i < N; i++) {
    const type = s.grid[i];
    if (type === T.EMPTY || type === T.RUBBLE || uc.has(i)) continue;
    const def = B[type];
    t.counts[type] = (t.counts[type] || 0) + 1;
    if (type === T.ROAD) { t.upkeep += def.upkeep; t.upkeepBy[type] = (t.upkeepBy[type] || 0) + def.upkeep; t.roads++; continue; }
    if (condFactor(s, i) === 0) continue; // abandoned buildings cost nothing and provide nothing
    const up = def.upkeep * LEVEL.upkeep[levelOf(s, i)];
    t.upkeep += up;
    t.upkeepBy[type] = (t.upkeepBy[type] || 0) + up;
    t.homes += capacity(s, i, 'homes');
    t.jobs += capacity(s, i, 'jobs');
    t.serves += capacity(s, i, 'serves');
    t.seats += capacity(s, i, 'seats');
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
// Routing is congestion-aware (busy roads cost more), so parallel routes genuinely spread load,
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
      const c = capacity(s, i, 'homes');
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
      if (targets[u]) { const path = []; for (let v = u; v !== -1; v = prev[v]) path.push(v); return path.reverse(); }
      for (const v of neighbours(u)) {
        if (!isNode[v]) continue;
        const nd = d + 1 + 2 * (load[v] / cap[v]);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; h.push(nd, v); }
      }
    }
    return null;
  };

  // Pass 1: route and accumulate load. Paths run from the home's doorstep to the destination.
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
  let wSum = 0, workSucc = 0, shopSucc = 0, parkSum = 0, target = 0, failed = 0;
  for (const home of homes) {
    const ws = success(home.workPath), ss = success(home.shopPath);
    const { x, y } = xy(home.i);
    const park = parks.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 3) ? 1 : 0;
    const cond = s.grid[home.i] === T.HALL ? 1 : s.cond[home.i] / 100;
    home.happy = 0.2 + 0.35 * ws + 0.25 * ss * serviceRatio + 0.1 * park + 0.1 * cond;
    home.workSucc = ws; home.shopSucc = ss; home.park = park;
    target += home.happy * home.cap;
    workSucc += ws * home.cap;
    shopSucc += ss * home.cap;
    parkSum += park * home.cap;
    wSum += home.cap;
    failed += home.r * (1 - ws) + home.r * (1 - ss);
  }
  const avgWorkSucc = wSum ? workSucc / wSum : 0;
  const employed = Math.min(workforce, tot.jobs) * avgWorkSucc;
  const employmentRate = workforce > 0 ? employed / workforce : 1;
  target = wSum ? target / wSum : 0.5;
  target *= 0.6 + 0.4 * employmentRate;
  target = Math.min(1, target + LINK_MOOD * Math.min(MAX_LINKS, s.links || 0));

  // Needs, Sims-style: each is 0..1 and tells the player what to fix next.
  const learners = s.pop.unskilled + students(s);
  const needs = {
    jobs: workforce > 0 ? Math.min(1, tot.jobs / workforce) : 1,
    commute: avgWorkSucc,
    shops: (wSum ? shopSucc / wSum : 0) * serviceRatio,
    homes: Math.max(0, Math.min(1, (tot.homes - pop) / Math.max(3, pop * 0.15))),
    school: learners === 0 ? 1 : Math.min(1, tot.seats / learners),
    leisure: wSum ? parkSum / wSum : 0,
  };

  return {
    load, cap, homes, target, failedTrips: Math.round(failed), employed, employmentRate, serviceRatio, needs,
  };
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
  s.lv[i] = 1;
  s.queue.push({ i, left: B[type].work, tap: 0 });
  return { ok: true, cost: B[type].cost };
}

// Undo a placement that hasn't been worked on yet, for a full refund.
export function undoPlace(s, i) {
  const k = s.queue.findIndex((q) => q.i === i && !q.up);
  if (k === -1) return { ok: false, reason: 'Builders have already started on that.' };
  const t = s.grid[i];
  if (s.queue[k].left < B[t].work) return { ok: false, reason: 'Builders have already started on that.' };
  s.queue.splice(k, 1);
  s.money += B[t].cost;
  s.grid[i] = T.EMPTY;
  s.cond[i] = 0;
  return { ok: true, refund: B[t].cost };
}

export function upgradeCost(s, i) {
  const t = s.grid[i];
  const next = levelOf(s, i) + 1;
  return Math.round(B[t].cost * LEVEL.cost[next]);
}

export function canUpgrade(s, i) {
  const t = s.grid[i];
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (!UPGRADABLE.includes(t)) return { ok: false, reason: 'This can’t be upgraded.' };
  if (s.queue.some((q) => q.i === i)) return { ok: false, reason: 'Builders are already working here.' };
  if (levelOf(s, i) >= MAX_LEVEL) return { ok: false, reason: 'Already at the top level.' };
  if (s.cond[i] < 60) return { ok: false, reason: 'Repair it first: condition must be 60% or more.' };
  const cost = upgradeCost(s, i);
  if (s.money < cost) return { ok: false, reason: `Needs $${cost}.` };
  return { ok: true, cost };
}

export function upgrade(s, i) {
  const check = canUpgrade(s, i);
  if (!check.ok) return check;
  s.money -= check.cost;
  s.queue.push({ i, left: Math.round(B[s.grid[i]].work * 1.2), up: true, tap: 0 });
  return { ok: true, cost: check.cost };
}

// Tap Tap-style helping hand: tapping a building site speeds it up a little, up to a cap.
export function tapHelp(s, i) {
  const q = s.queue.find((q) => q.i === i);
  if (!q) return { ok: false };
  const total = q.up ? Math.round(B[s.grid[i]].work * 1.2) : B[s.grid[i]].work;
  if (q.tap >= total * TAP_CAP - 1e-6) return { ok: false, reason: 'Your builders have this one from here.' };
  const step = Math.min(total * TAP_SHARE, total * TAP_CAP - q.tap, q.left);
  q.tap += step;
  q.left -= step;
  const done = q.left <= 1e-6;
  if (done) finish(s, q);
  return { ok: true, done, progress: 1 - q.left / total };
}

export function bulldoze(s, i) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  const t = s.grid[i];
  if (t === T.EMPTY) return { ok: false, reason: 'Nothing to clear.' };
  if (t === T.HALL) return { ok: false, reason: 'The town hall stays.' };
  let refund = 0;
  if (t === T.RUBBLE) {
    if (s.money < RUBBLE_CLEAR_COST) return { ok: false, reason: `Clearing rubble needs $${RUBBLE_CLEAR_COST}.` };
    s.money -= RUBBLE_CLEAR_COST;
    refund = -RUBBLE_CLEAR_COST;
  } else {
    const k = s.queue.findIndex((q) => q.i === i);
    if (k !== -1) {
      const q = s.queue[k];
      if (!q.up && q.left === B[t].work) { refund = Math.floor(B[t].cost * 0.5); s.money += refund; }
      s.queue.splice(k, 1);
    }
  }
  s.grid[i] = T.EMPTY;
  s.cond[i] = 0;
  s.lv[i] = 1;
  return { ok: true, refund };
}

// ---------- time ----------

function finish(s, q) {
  s.queue.splice(s.queue.indexOf(q), 1);
  if (q.up) { s.lv[q.i] = Math.min(MAX_LEVEL, levelOf(s, q.i) + 1); s.cond[q.i] = 100; }
  else s.cond[q.i] = 100;
  (s._finished ||= []).push({ i: q.i, up: !!q.up });
}

function construct(s) {
  let labour = s.pop.builder + s.pop.unskilled * VOLUNTEER_RATE;
  while (labour > 0 && s.queue.length) {
    const q = s.queue[0];
    const used = Math.min(labour, q.left);
    q.left -= used;
    labour -= used;
    if (q.left <= 1e-6) finish(s, q);
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
  const mood = Math.min(1, Math.max(0, (s.happiness - 0.15) / 0.7));
  const by = {
    unskilled: e * p.unskilled * TAX.unskilled * mood, teacher: e * p.teacher * TAX.teacher * mood,
    pro: e * p.pro * TAX.pro * mood, builder: p.builder * TAX.builder * mood, unemployed: (1 - e) * workforce * TAX.unemployed * mood,
  };
  for (const k in by) by[k] = Math.round(by[k]);
  by.trade = Math.round(TRADE_PER_LINK * Math.min(MAX_LINKS, s.links || 0) * Math.min(1, totalPop(s) / 30));
  st.byClass = by;
  st.upkeepBy = Object.fromEntries(Object.entries(tot.upkeepBy).map(([k, v]) => [k, Math.round(v)]));
  st.income = Object.values(by).reduce((a, b) => a + b, 0);
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
    note(s, 'warn', `Couldn’t pay upkeep. Buildings are decaying (day ${s.unpaidDays} unpaid).`);
  } else {
    s.unpaidDays = 0;
    for (const i of buildings) s.cond[i] = Math.min(100, s.cond[i] + 5);
  }

  st.graduates = educate(s, tot, rng);
  if (st.graduates) note(s, 'good', `${st.graduates} graduate${st.graduates > 1 ? 's' : ''} joined the workforce.`);
  st.event = s.day >= 2 && rng() < EVENT_CHANCE ? randomEvent(s, rng) : null;

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
  if (st.departures) note(s, 'warn', `${st.departures} ${st.departures > 1 ? 'people' : 'person'} left ${pop > after.homes ? 'because there weren’t enough homes' : 'because they were unhappy'}.`);
  if (st.arrivals) note(s, 'good', `${st.arrivals} ${st.arrivals > 1 ? 'people' : 'person'} moved in.`);

  s.day++;
  s.peakPop = Math.max(s.peakPop, totalPop(s));
  s.stats = st;
  s.history.push({ d: s.day, pop: totalPop(s), money: Math.floor(s.money), mood: Math.round(s.happiness * 100), net: st.income - st.upkeep });
  if (s.history.length > HISTORY_DAYS) s.history.splice(0, s.history.length - HISTORY_DAYS);

  const broke = s.money < B[T.HOUSE].cost;
  if ((totalPop(s) === 0 && broke && s.day > GRACE_DAYS) || s.unpaidDays >= COLLAPSE_UNPAID_DAYS) {
    return collapse(s);
  }
  return null;
}

export function collapse(s, outcome = 'collapsed') {
  const record = {
    name: s.name, cityNo: s.cityNo, peakPop: s.peakPop, daysSurvived: s.day, outcome,
  };
  for (let i = 0; i < N; i++) {
    if (s.grid[i] !== T.EMPTY) { s.grid[i] = T.RUBBLE; s.cond[i] = 0; }
    s.lv[i] = 1;
  }
  s.queue = [];
  s.cohorts = [];
  s.pop = { unskilled: 0, builder: 0, teacher: 0, pro: 0 };
  s.status = 'ruins';
  s.happiness = 0;
  return record;
}

// Start a new city on the ruins: rubble stays and costs money to clear.
export function rebuild(s, name, money = REBUILD_MONEY) {
  s.grid[HALL_INDEX] = T.HALL;
  s.cond[HALL_INDEX] = 100;
  Object.assign(s, {
    name: name || s.name, queue: [], money, history: [], log: [], flags: {},
    pop: { unskilled: 3, builder: 3, teacher: 0, pro: 0 }, cohorts: [],
    happiness: 0.65, hour: 0, day: 0, peakPop: 6, unpaidDays: 0,
    cityNo: s.cityNo + 1, status: 'alive', goalsDone: [],
  });
}

// ---------- random events ----------

const EVENTS = [
  { w: 3, ok: (s) => totalPop(s) >= 15, run: (s) => { s.happiness = Math.min(1, s.happiness + 0.06); return 'A street festival lifted everyone’s mood.'; } },
  { w: 3, ok: (s) => (s.links || 0) > 0 || totalPop(s) >= 30, run: (s) => {
    const g = 20 + Math.round(totalPop(s) * 0.6) + 15 * Math.min(MAX_LINKS, s.links || 0);
    s.money += g; return `Visitors came through town and spent $${g}.`; } },
  { w: 2, ok: () => true, run: (s) => { s.money += 100; return 'A former resident sent a $100 donation.'; } },
  { w: 1, ok: (s) => s.happiness >= 0.7 && totalPop(s) >= 20, run: (s) => { s.money += 250; return 'The regional council sent a $250 grant for running a happy city.'; } },
  { w: 2, ok: (s) => builtBuildings(s).length >= 4, run: (s, rng) => {
    const list = builtBuildings(s), n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) { const i = list[Math.floor(rng() * list.length)]; s.cond[i] = Math.max(1, s.cond[i] - 20); }
    return `A storm damaged ${n} building${n > 1 ? 's' : ''}. They repair as upkeep is paid.`; } },
  { w: 1, ok: (s) => totalPop(s) >= 40 && builtBuildings(s).length >= 6, run: (s, rng) => {
    const list = builtBuildings(s), i = list[Math.floor(rng() * list.length)];
    s.cond[i] = Math.max(1, s.cond[i] - 50); return `A fire damaged a ${B[s.grid[i]].name.toLowerCase()}. It needs time and paid upkeep to recover.`; } },
  { w: 2, ok: (s) => s.happiness >= 0.6 && totals(s).homes > totalPop(s) + 1, run: (s) => { s.pop.unskilled += 2; return 'Two relatives of residents moved in.'; } },
];
function builtBuildings(s) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (t !== T.EMPTY && t !== T.ROAD && t !== T.HALL && t !== T.RUBBLE && s.cond[i] > 0 && !s.queue.some((q) => q.i === i && !q.up)) out.push(i);
  }
  return out;
}
function randomEvent(s, rng) {
  const ok = EVENTS.filter((e) => e.ok(s));
  if (!ok.length) return null;
  let r = rng() * ok.reduce((a, e) => a + e.w, 0);
  const ev = ok.find((e) => (r -= e.w) < 0) || ok[0];
  const text = ev.run(s, rng);
  note(s, 'event', text);
  return text;
}

// ---------- goals ----------

const GOAL_TESTS = {
  roads10: (s, t) => (t.counts[T.ROAD] || 0) >= 10,
  houses3: (s, t) => (t.counts[T.HOUSE] || 0) >= 3,
  work1: (s, t) => (t.counts[T.WORK] || 0) >= 1,
  shop1: (s, t) => (t.counts[T.SHOP] || 0) >= 1,
  pop25: (s) => totalPop(s) >= 25,
  school1: (s, t) => (t.counts[T.SCHOOL] || 0) >= 1,
  upgrade1: (s) => s.lv.some((l) => l > 1),
  build6: (s) => s.pop.builder >= 6,
  happy75: (s) => totalPop(s) >= 30 && s.happiness >= 0.75,
  days10: (s) => s.day >= 10,
  pop100: (s) => totalPop(s) >= 100,
  days30: (s) => s.day >= 30,
};

// Pays out any newly met goals and returns them.
export function checkGoals(s, tot = totals(s)) {
  if (s.status !== 'alive') return [];
  const done = [];
  for (const g of GOALS) {
    if (s.goalsDone.includes(g.id)) continue;
    if (GOAL_TESTS[g.id](s, tot)) { s.goalsDone.push(g.id); s.money += g.reward; done.push(g); note(s, 'good', `Goal complete: ${g.text}. +$${g.reward}.`); }
  }
  return done;
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
  let collapsed = null, day = null;
  if (s.hour >= HOURS_PER_DAY) {
    s.hour = 0;
    collapsed = daily(s, tot, traffic, rng);
    day = { ...s.stats };
  }
  return { traffic, collapsed, totals: tot, day };
}
