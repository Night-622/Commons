// Pure city simulation with real residents. No DOM, no Firebase, so it runs in node tests too.
// A day is a year of life. Every car, bike and walker you see is one of these people on a real trip.
import {
  PLOT, T, B, START_MONEY, REBUILD_MONEY, GRACE_DAYS, VOLUNTEER_RATE, RUBBLE_CLEAR_COST, COLLAPSE_UNPAID_DAYS,
  ROAD_CAP, HALL_CAP, HOURS_PER_DAY, LEVEL, MAX_LEVEL, UPGRADABLE, TAP_SHARE, TAP_CAP, GOALS, TRADE_PER_LINK,
  LINK_MOOD, MAX_LINKS, HISTORY_DAYS, LOG_SIZE, EVENT_CHANCE, CHUNK, CHUNKS, START_CHUNKS, LAND_PRICE, LAND_STEP,
  MOVE_FEE, ADULT, RETIRE, WAGE, isHome, walkable, BUS_SEATS, COMMUTE_JOBS,
} from './constants.js';

const N = PLOT * PLOT;
export const idx = (x, y) => y * PLOT + x;
export const xy = (i) => ({ x: i % PLOT, y: Math.floor(i / PLOT) });
export const HALL_INDEX = idx(PLOT >> 1, PLOT >> 1);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const dist1 = (a, b) => Math.abs(a % PLOT - b % PLOT) + Math.abs(((a / PLOT) | 0) - ((b / PLOT) | 0));

export function neighbours(i) {
  const x = i % PLOT, y = (i / PLOT) | 0, out = [];
  if (x > 0) out.push(i - 1);
  if (x < PLOT - 1) out.push(i + 1);
  if (y > 0) out.push(i - PLOT);
  if (y < PLOT - 1) out.push(i + PLOT);
  return out;
}
export function h32(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x85ebca6b, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const FIRST = ['Ava', 'Noah', 'Mia', 'Leo', 'Zara', 'Kai', 'Ella', 'Omar', 'Ivy', 'Luca', 'Aisha', 'Finn', 'Maya', 'Ravi', 'Chloe', 'Jonah',
  'Sofia', 'Eli', 'Nadia', 'Theo', 'Hana', 'Mateo', 'Grace', 'Arjun', 'Lily', 'Sam', 'Yara', 'Oscar', 'Ruby', 'Tariq', 'Elena', 'Jack',
  'Amara', 'Hugo', 'Priya', 'Felix', 'Leila', 'Ben', 'Mei', 'Diego', 'Isla', 'Kofi', 'Nina', 'Max', 'Rosa', 'Yusuf', 'Clara', 'Dev',
  'Freya', 'Tom', 'Anya', 'Ezra', 'Lena', 'Ari', 'Zoe', 'Malik', 'Iris', 'Sami', 'Olive', 'Nikos'];
export const SURNAMES = ['Nguyen', 'Okafor', 'Papadopoulos', 'Smith', 'Kowalski', 'García', 'Chen', 'Haddad', 'Ivanova', 'Silva', 'Kaur',
  'Tanaka', 'Murphy', 'Rossi', 'Mensah', 'Kim', 'Novak', 'Ali', 'Jensen', 'Costa', 'Walker', 'Fernando', 'Nakamura', 'Petrov', 'Obi',
  'Laurent', 'Doyle', 'Sato', 'Horvat', 'Tran', 'Kelly', 'Moreau', 'Ahmed', 'Lindqvist', 'Reyes', 'Sharma'];
export const personName = (p) => `${FIRST[p.f]} ${SURNAMES[p.l]}`;

// ---------- state ----------

function person(s, o) {
  const p = { i: s.nextId++, f: 0, l: 0, a: 30, h: HALL_INDEX, e: 0, sp: 0, us: 0, j: -1, jt: 0, sc: -1, tu: -1, hp: 100, ill: 0, sd: 0,
    m: 0.65, pt: 0, pa: 0, cs: 0, fun: -1, st: 0, vt: 0, gr: 0, jy: 0, b: 0, oj: null, ...o };
  s.people.push(p);
  return p;
}
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// A household arriving: a single person, a couple, or a family.
function household(s, home, rng, kind) {
  const l = Math.floor(rng() * SURNAMES.length);
  const edu = () => { const r = rng(); return r < 0.2 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3; };
  const adult = (a) => person(s, { f: Math.floor(rng() * FIRST.length), l, a, h: home, e: edu(), sp: 10 });
  const k = kind || (rng() < 0.3 ? 'single' : rng() < 0.55 ? 'couple' : 'family');
  const a1 = adult(20 + Math.floor(rng() * 30));
  const out = [a1];
  if (k !== 'single') {
    const a2 = adult(Math.max(20, a1.a + Math.floor(rng() * 9) - 4));
    a1.pt = a2.i; a2.pt = a1.i; out.push(a2);
  }
  if (k === 'family') {
    const n = 1 + Math.floor(rng() * 3);
    for (let c = 0; c < n; c++) {
      const age = Math.floor(rng() * Math.min(17, a1.a - 18));
      out.push(person(s, { f: Math.floor(rng() * FIRST.length), l, a: age, h: home, pa: a1.i, sp: Math.max(0, age - 5) * 0.9 }));
    }
  }
  return out;
}

export function newCity(name, rng = Math.random) {
  const grid = new Array(N).fill(T.EMPTY);
  const cond = new Array(N).fill(0);
  grid[HALL_INDEX] = T.HALL;
  cond[HALL_INDEX] = 100;
  const land = new Array(CHUNKS * CHUNKS).fill(0);
  for (const c of START_CHUNKS) land[c] = 1;
  const s = {
    v: 4, name, grid, cond, lv: new Array(N).fill(1), land, queue: [], money: START_MONEY, people: [], nextId: 1,
    happiness: 0.65, hour: 0, day: 0, peakPop: 6, unpaidDays: 0, cityNo: 1, status: 'alive', lastTick: Date.now(),
    goalsDone: [], history: [], log: [], links: 0, flags: {}, graves: 0, cases: 0,
    counters: { births: 0, deaths: 0, graduates: 0, crimes: 0, cases: 0, treated: 0, arrivals: 0, departures: 0, built: 0, land: 0, moved: 0 },
    stats: { income: 0, upkeep: 0, failedTrips: 0, arrivals: 0, departures: 0, graduates: 0 },
  };
  settle(s, rng);
  return s;
}
// The first settlers: a family of three and three others, all living above the hall.
function settle(s, rng) {
  const l = Math.floor(rng() * SURNAMES.length);
  const a = person(s, { f: 23, l, a: 33, e: 3, sp: 10 });
  const b = person(s, { f: 2, l, a: 31, e: 2, sp: 10, pt: a.i });
  a.pt = b.i;
  person(s, { f: 3, l, a: 6, sp: 1, pa: b.i });
  const l2 = (l + 7) % SURNAMES.length;
  person(s, { f: 7, l: l2, a: 40, e: 1, sp: 10 });
  person(s, { f: 8, l: (l + 13) % SURNAMES.length, a: 26, e: 2, sp: 10 });
  person(s, { f: 37, l: l2, a: 22, e: 0, sp: 4 });
  s._plan = null;
}

export function note(s, kind, text) {
  s.log.push({ d: s.day, h: s.hour, k: kind, t: text });
  if (s.log.length > LOG_SIZE) s.log.splice(0, s.log.length - LOG_SIZE);
}

// Bring older saves up to the current shape. Head counts become real people.
export function migrate(s, rng = Math.random) {
  if (!s.lv) s.lv = new Array(N).fill(1);
  for (const k of ['goalsDone', 'history', 'log']) if (!s[k]) s[k] = [];
  if (!s.flags) s.flags = {};
  s.links = s.links || 0;
  for (const q of s.queue) if (q.tap === undefined) q.tap = 0;
  if (!s.land) s.land = new Array(CHUNKS * CHUNKS).fill(1);   // older cities keep all their land
  if (!s.counters) s.counters = { births: 0, deaths: 0, graduates: 0, crimes: 0, cases: 0, treated: 0, arrivals: 0, departures: 0, built: 0, land: 0, moved: 0 };
  s.graves = s.graves || 0;
  s.cases = s.cases || 0;
  if (!s.people) {
    s.people = []; s.nextId = 1;
    const old = s.pop || {};
    let n = (old.unskilled || 0) + (old.builder || 0) + (old.teacher || 0) + (old.pro || 0) + (s.cohorts || []).reduce((a, c) => a + c.n, 0);
    const homes = [];
    for (let i = 0; i < N; i++) if (isHome(s.grid[i]) && (s.grid[i] === T.HALL || s.cond[i] > 0)) homes.push(i);
    for (const h of homes) {
      let room = homeCap(s, h);
      while (n > 0 && room > 0) {
        const hh = household(s, h, rng, room >= 4 && n >= 4 && rng() < 0.4 ? 'family' : room >= 2 && n >= 2 ? 'couple' : 'single');
        while (hh.length > Math.min(room, n)) removePerson(s, hh.pop());
        n -= hh.length; room -= hh.length;
      }
    }
    delete s.pop; delete s.cohorts;
  }
  s.v = 4;
  return s;
}

export function serialize(s) {
  return JSON.stringify(s, (k, v) => (k.startsWith('_') ? undefined : v));
}

export const totalPop = (s) => s.people.length;
export function census(s) {
  const c = { total: 0, toddlers: 0, kids: 0, teens: 0, adults: 0, seniors: 0, employed: 0, seeking: 0, carers: 0, pupils: 0, uni: 0, sick: 0, builders: 0, edu: [0, 0, 0, 0] };
  for (const p of s.people) {
    c.total++;
    if (p.a < 5) c.toddlers++; else if (p.a < 12) c.kids++; else if (p.a < ADULT) c.teens++; else if (p.a < RETIRE) c.adults++; else c.seniors++;
    if (p.ill) c.sick++;
    if (p.a >= ADULT) c.edu[p.e]++;
    if (p.sc >= 0) { if (p.a >= ADULT) c.uni++; else c.pupils++; }
    if (p.j >= 0) { c.employed++; if (isBuilder(s, p)) c.builders++; }
    else if (p.st) c.carers++;
    else if (canWork(p)) c.seeking++;
  }
  return c;
}
export function summary(s) {
  return {
    name: s.name, pop: totalPop(s), peakPop: s.peakPop, happiness: Math.round(s.happiness * 100) / 100,
    money: Math.floor(s.money), day: s.day, status: s.status, cityNo: s.cityNo,
  };
}

// ---------- land ----------
export const chunkOf = (i) => Math.floor(((i / PLOT) | 0) / CHUNK) * CHUNKS + Math.floor((i % PLOT) / CHUNK);
export const owns = (s, i) => !!s.land[chunkOf(i)];
export const landPrice = (s) => Math.round(LAND_PRICE * Math.pow(LAND_STEP, Math.max(0, s.land.filter(Boolean).length - START_CHUNKS.length)));
export function canBuyLand(s, c) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (s.land[c]) return { ok: false, reason: 'You already own this land.' };
  const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
  const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const x = cx + dx, y = cy + dy;
    return x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && s.land[y * CHUNKS + x];
  });
  if (!next) return { ok: false, reason: 'Buy land next to what you already own.' };
  const price = landPrice(s);
  if (s.money < price) return { ok: false, reason: `Needs $${price}.`, price };
  return { ok: true, price };
}
export function buyLand(s, c) {
  const r = canBuyLand(s, c);
  if (!r.ok) return r;
  s.money -= r.price;
  s.land[c] = 1;
  s.counters.land++;
  return r;
}

// ---------- buildings ----------
export const underConstruction = (s) => new Set(s.queue.filter((q) => !q.up).map((q) => q.i));
const level = (s, i) => (s.lv ? s.lv[i] || 1 : 1);
function condFactor(s, i) {
  if (s.grid[i] === T.HALL) return 1;
  const c = s.cond[i];
  return c >= 40 ? 1 : c > 0 ? 0.5 : 0;
}
function active(s, i, uc) {
  const t = s.grid[i];
  if (t === T.EMPTY || t === T.RUBBLE) return false;
  if (t === T.HALL) return true;
  return !(uc ? uc.has(i) : s.queue.some((q) => q.i === i && !q.up)) && s.cond[i] > 0;
}
const scale = (s, i, n) => Math.floor(n * condFactor(s, i) * LEVEL.capacity[level(s, i)]);
export const homeCap = (s, i) => scale(s, i, B[s.grid[i]].homes || 0);
export function jobSlots(s, i) { return (B[s.grid[i]].jobs || []).map(([, , n]) => scale(s, i, n)); }
export function capacity(s, i, field) {
  const d = B[s.grid[i]];
  if (field === 'homes') return homeCap(s, i);
  if (field === 'jobs') return jobSlots(s, i).reduce((a, b) => a + b, 0);
  if (field === 'seats') return d.school ? scale(s, i, d.school.seats) : 0;
  if (field === 'visits') return d.visits ? scale(s, i, d.visits.n) : 0;
  if (field === 'care') return d.care ? scale(s, i, d.care.n) : 0;
  if (field === 'serves') return scale(s, i, d.serves || 0);
  if (field === 'graves') return scale(s, i, d.graves || 0);
  if (field === 'cases') return scale(s, i, d.cases || 0);
  return 0;
}
// Services only work when staffed. Buildings with no staff at all do nothing.
export function staffing(s, i) {
  const d = B[s.grid[i]];
  if (!d.jobs) return 1;
  const slots = jobSlots(s, i).reduce((a, b) => a + b, 0);
  if (!slots) return 0;
  const n = s.people.filter((p) => p.j === i && !p.oj).length;
  return n ? clamp(0.4 + 0.6 * n / slots) : 0;
}
const isBuilder = (s, p) => p.j >= 0 && !p.oj && (s.grid[p.j] === T.HALL || s.grid[p.j] === T.YARD) && p.jt === 0;
const canWork = (p) => p.a >= ADULT && p.a < RETIRE && p.sc < 0 && !p.st && p.ill < 3;

export function totals(s, uc = underConstruction(s)) {
  const t = { homes: 0, jobs: 0, seats: {}, serves: 0, upkeep: 0, roads: 0, counts: {}, upkeepBy: {} };
  for (let i = 0; i < N; i++) {
    const type = s.grid[i];
    if (type === T.EMPTY || type === T.RUBBLE || uc.has(i)) continue;
    const d = B[type];
    t.counts[type] = (t.counts[type] || 0) + 1;
    if (type === T.ROAD || type === T.PATH || type === T.RAIL) { t.upkeep += d.upkeep; t.upkeepBy[type] = (t.upkeepBy[type] || 0) + d.upkeep; if (type === T.ROAD) t.roads++; continue; }
    if (condFactor(s, i) === 0) continue;
    const up = d.upkeep * LEVEL.upkeep[level(s, i)];
    t.upkeep += up;
    t.upkeepBy[type] = (t.upkeepBy[type] || 0) + up;
    t.homes += homeCap(s, i);
    t.jobs += capacity(s, i, 'jobs');
    t.serves += capacity(s, i, 'serves');
    if (d.school) t.seats[d.school.stage] = (t.seats[d.school.stage] || 0) + capacity(s, i, 'seats');
  }
  return t;
}

// ---------- the daily plan: who goes where, and how ----------

function network(s, uc, cars) {
  const ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (uc.has(i)) continue;
    if (t === T.ROAD || t === T.HALL || (!cars && t === T.PATH)) ok[i] = 1;
  }
  return ok;
}
function bfs(ok, starts) {
  const dist = new Int16Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
  const q = [];
  for (const st of starts) if (ok[st] && dist[st] < 0) { dist[st] = 0; q.push(st); }
  for (let k = 0; k < q.length; k++) {
    const u = q[k];
    for (const v of neighbours(u)) if (ok[v] && dist[v] < 0) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); }
  }
  return { dist, prev };
}
const doorsteps = (s, ok, i) => (s.grid[i] === T.HALL ? [i] : neighbours(i).filter((n) => ok[n]));
function route(map, ok, s, to) {
  let best = -1, bd = Infinity;
  for (const d of doorsteps(s, ok, to)) if (map.dist[d] >= 0 && map.dist[d] < bd) { bd = map.dist[d]; best = d; }
  if (best < 0) return null;
  const path = [];
  for (let v = best; v !== -1; v = map.prev[v]) path.push(v);
  return path.reverse();
}

export function plan(s, rng = Math.random) {
  const uc = underConstruction(s);
  const walkNet = network(s, uc, false), carNet = network(s, uc, true);
  const byType = new Map();
  for (let i = 0; i < N; i++) {
    if (!active(s, i, uc)) continue;
    const t = s.grid[i];
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(i);
  }
  const all = (pred) => { const out = []; for (const [t, list] of byType) if (pred(B[t], t)) out.push(...list); return out; };
  const homeMaps = new Map();
  const mapFor = (h) => {
    let m = homeMaps.get(h);
    if (!m) {
      const w = bfs(walkNet, doorsteps(s, walkNet, h)), c = bfs(carNet, doorsteps(s, carNet, h));
      const doorD = (map, ok, to) => { let bd = -1; for (const d of doorsteps(s, ok, to)) if (map.dist[d] >= 0 && (bd < 0 || map.dist[d] < bd)) bd = map.dist[d]; return bd; };
      m = { w, c, d: (to) => doorD(w, walkNet, to) };
      homeMaps.set(h, m);
    }
    return m;
  };
  const nearest = (h, list, max, has) => {
    const m = mapFor(h);
    let best = -1, bd = Infinity;
    for (const i of list) {
      if (has && !has(i)) continue;
      const d = m.d(i);
      if (d >= 0 && d <= max && d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // Homes: anyone whose home is gone is homeless until rehoused.
  const homeOk = (h) => active(s, h, uc) && isHome(s.grid[h]);
  const away = (p) => p.hol > 0;
  const abroad = s._abroad || [], incoming = s._incoming || {};
  const out = {};
  const spare = Object.fromEntries(abroad.map((a) => [a.id, { fun: a.fun, care: a.care, shop: a.shop, school: a.school }]));
  const useAbroad = (kind, n = 1) => {
    for (const a of abroad) if (spare[a.id][kind] >= n) { spare[a.id][kind] -= n; (out[a.id] ||= { fun: 0, care: 0, shop: 0, school: 0, tourists: 0 })[kind] += n; return a; }
    return null;
  };
  for (const p of s.people) { p.fa = null; p.as = null; }
  const byHome = new Map();
  for (const p of s.people) { if (!byHome.has(p.h)) byHome.set(p.h, []); byHome.get(p.h).push(p); }

  // Jobs: keep valid ones, drop the rest.
  const filled = new Map();
  const slotKey = (i, k) => i * 8 + k;
  for (const p of s.people) {
    p.st = 0;
    if (p.j < 0) continue;
    if (p.oj) continue;   // out-of-town commuters are checked once transit is known
    const t = s.grid[p.j];
    const slots = active(s, p.j, uc) && B[t].jobs ? jobSlots(s, p.j) : null;
    const key = slotKey(p.j, p.jt);
    if (!slots || !canWork(p) || !homeOk(p.h) || (filled.get(key) || 0) >= slots[p.jt] || p.e < B[t].jobs[p.jt][1]) { p.j = -1; continue; }
    filled.set(key, (filled.get(key) || 0) + 1);
  }

  // School: daycare under 5, primary 5–11, high 12–17, university for keen high school graduates.
  const stageOf = (p) => (p.a < 5 ? 'daycare' : p.a < 12 ? 'primary' : p.a < ADULT ? 'high' : p.e === 2 && p.a <= 26 && p.j < 0 && h32(p.i, 3) < 0.7 ? 'uni' : null);
  const seatsUsed = new Map();
  const seatsOf = (i) => Math.floor(capacity(s, i, 'seats') * (staffing(s, i) > 0 ? 1 : 0));
  const hasSeat = (i) => (seatsUsed.get(i) || 0) < seatsOf(i);
  for (const p of s.people) {
    const stage = stageOf(p);
    const keep = p.sc >= 0 && active(s, p.sc, uc) && B[s.grid[p.sc]].school?.stage === stage && hasSeat(p.sc);
    if (keep) { seatsUsed.set(p.sc, (seatsUsed.get(p.sc) || 0) + 1); continue; }
    p.sc = -1;
    if (!stage || !homeOk(p.h)) continue;
    const sc = nearest(p.h, all((d) => d.school?.stage === stage), 16, hasSeat);
    if (sc >= 0) { p.sc = sc; seatsUsed.set(sc, (seatsUsed.get(sc) || 0) + 1); if (stage === 'uni') p.j = -1; }
    else if ((stage === 'primary' || stage === 'high') && p.a >= 8) { const a = useAbroad('school'); if (a) p.as = a.id; }
  }
  for (const p of s.people) {
    p.tu = -1;
    if (p.sc < 0 || p.a < 7 || p.a >= ADULT) continue;
    const tu = nearest(p.h, all((d) => d.school?.stage === 'tutor'), 12, hasSeat);
    if (tu >= 0) { p.tu = tu; seatsUsed.set(tu, (seatsUsed.get(tu) || 0) + 1); }
  }

  // A parent stays home with a toddler who has no daycare place.
  for (const [h, members] of byHome) {
    if (!members.some((p) => p.a < 5 && p.sc < 0)) continue;
    const adults = members.filter((p) => p.a >= ADULT && p.a < RETIRE && p.sc < 0).sort((a, b) => a.e - b.e);
    if (adults.length) { adults[0].st = 1; adults[0].j = -1; }
  }

  // Job hunting: the best job your education allows, nearest first.
  const jobBuildings = all((d) => !!d.jobs);
  // People in jobs below their education sometimes move up, so new services can find staff.
  const reqOf = (p) => (p.j >= 0 && !p.oj ? B[s.grid[p.j]].jobs[p.jt][1] : -1);
  // A service with nobody working there can also tempt people away from shops, offices and factories.
  const isService = (d) => !!(d.school || d.care || d.radius || d.cases || d.visits || d.catchment || d.graves || d.key === 'depot');
  const staffOf = (i) => B[s.grid[i]].jobs.reduce((a, _, k) => a + (filled.get(slotKey(i, k)) || 0), 0);
  const unstaffed = new Set(jobBuildings.filter((i) => isService(B[s.grid[i]]) && staffOf(i) === 0));
  const commercial = (p) => p.j >= 0 && !p.oj && !isService(B[s.grid[p.j]]) && s.grid[p.j] !== T.HALL;
  const seekers = s.people.filter((p) => canWork(p) && homeOk(p.h) && (p.j < 0 || (!p.oj && h32(p.i, s.day + 99) < 0.3
      && (reqOf(p) < Math.min(p.e, 2) || (unstaffed.size && commercial(p))))))
    .sort((a, b) => (a.j >= 0) - (b.j >= 0) || b.e - a.e || h32(a.i, s.day) - h32(b.i, s.day));
  for (const p of seekers) {
    let best = null, bd = Infinity;
    const floor = reqOf(p);
    for (const i of jobBuildings) {
      const def = B[s.grid[i]], slots = jobSlots(s, i);
      for (let k = 0; k < slots.length; k++) {
        const rescue = unstaffed.has(i) && commercial(p) && def.jobs[k][1] >= floor;
        if (def.jobs[k][1] > p.e || (def.jobs[k][1] <= floor && !rescue) || (filled.get(slotKey(i, k)) || 0) >= slots[k]) continue;
        const d = mapFor(p.h).d(i);
        if (d < 0 || d > 26) continue;
        const score = d - def.jobs[k][1] * 6;   // prefer jobs that use your education
        if (score < bd) { bd = score; best = [i, k]; }
      }
    }
    if (best) {
      if (p.j >= 0) filled.set(slotKey(p.j, p.jt), (filled.get(slotKey(p.j, p.jt)) || 1) - 1);
      p.j = best[0]; p.jt = best[1]; filled.set(slotKey(...best), (filled.get(slotKey(...best)) || 0) + 1);
      unstaffed.delete(best[0]);
    }
  }

  // Public transport. Stations must touch the railway; buses need a staffed depot and at least two stops.
  const railNet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if ((s.grid[i] === T.RAIL && !uc.has(i)) || (s.grid[i] === T.STATION && active(s, i, uc))) railNet[i] = 1;
  const railComp = new Int16Array(N).fill(-1);
  let comps = 0;
  for (let i = 0; i < N; i++) {
    if (!railNet[i] || railComp[i] >= 0) continue;
    const q = [i]; railComp[i] = comps;
    for (let k = 0; k < q.length; k++) for (const v of neighbours(q[k])) if (railNet[v] && railComp[v] < 0) { railComp[v] = comps; q.push(v); }
    comps++;
  }
  const stations = (byType.get(T.STATION) || []).filter((i) => staffing(s, i) > 0 && neighbours(i).some((n) => s.grid[n] === T.RAIL && railNet[n]));
  const drivers = s.people.filter((p) => p.j >= 0 && s.grid[p.j] === T.DEPOT && !p.ill).length;
  const stops = drivers > 0 && (byType.get(T.STOP) || []).length >= 2 ? byType.get(T.STOP) : [];
  const busCap = drivers * BUS_SEATS;
  const within = (h, list, r) => { let best = -1, bd = r + 1; for (const i of list) { const d = mapFor(h).d(i); if (d >= 0 && d < bd) { bd = d; best = i; } } return best; };
  const fromMaps = new Map();
  const mapFrom = (i) => { let m = fromMaps.get(i); if (!m) { m = { w: bfs(walkNet, doorsteps(s, walkNet, i)), c: bfs(carNet, doorsteps(s, carNet, i)) }; fromMaps.set(i, m); } return m; };
  const distFrom = (i, to) => { const m = mapFrom(i).w; let bd = -1; for (const d of doorsteps(s, walkNet, to)) if (m.dist[d] >= 0 && (bd < 0 || m.dist[d] < bd)) bd = m.dist[d]; return bd; };

  // Out-of-town jobs over links to neighbours: rail links need a station, bus links a bus service.
  const outCap = { rail: stations.length ? (s.railLinks || 0) * COMMUTE_JOBS.rail : 0, bus: stops.length ? (s.busLinks || 0) * COMMUTE_JOBS.bus : 0 };
  const outUsed = { rail: 0, bus: 0 };
  for (const p of s.people) {
    if (!p.oj) continue;
    const list = p.oj === 'rail' ? stations : stops;
    if (!canWork(p) || !homeOk(p.h) || !list.includes(p.j) || outUsed[p.oj] >= outCap[p.oj] || (p.oj === 'rail' && p.e < 1)) { p.j = -1; p.oj = null; continue; }
    outUsed[p.oj]++;
  }
  for (const p of s.people) {
    if (p.j >= 0 || !canWork(p) || !homeOk(p.h)) continue;
    const st = p.e >= 1 && outUsed.rail < outCap.rail ? within(p.h, stations, B[T.STATION].catchment) : -1;
    if (st >= 0) { p.j = st; p.jt = 0; p.oj = 'rail'; outUsed.rail++; continue; }
    const sp = outUsed.bus < outCap.bus ? within(p.h, stops, B[T.STOP].catchment) : -1;
    if (sp >= 0) { p.j = sp; p.jt = 0; p.oj = 'bus'; outUsed.bus++; }
  }

  // Shopping: each household needs a grocer (or the hall's little shop) with room.
  const served = new Map(), shopFor = new Map();
  const shops = all((d) => !!d.serves);
  const shopTotal = shops.reduce((a, i) => a + capacity(s, i, 'serves'), 0);
  const shopScale = shopTotal ? Math.max(0, 1 - (incoming.shop || 0) / shopTotal) : 1;
  for (const [h, members] of byHome) {
    if (!homeOk(h)) continue;
    const sh = nearest(h, shops, 14, (i) => (served.get(i) || 0) + members.length <= capacity(s, i, 'serves') * (staffing(s, i) > 0 ? 1 : 0) * shopScale);
    if (sh >= 0) { served.set(sh, (served.get(sh) || 0) + members.length); shopFor.set(h, sh); }
    else { const a = useAbroad('shop', members.length); if (a) shopFor.set(h, -2); }
  }

  // Care: sick people go to a clinic, serious cases and injuries to a hospital.
  const careUsed = new Map(), careFor = new Map();
  const careTotal = all((d) => !!d.care).reduce((a, i) => a + capacity(s, i, 'care'), 0);
  const careScale = careTotal ? Math.max(0, 1 - (incoming.care || 0) / careTotal) : 1;
  const careHas = (i) => (careUsed.get(i) || 0) < Math.floor(capacity(s, i, 'care') * staffing(s, i) * careScale);
  for (const p of s.people.filter((x) => x.ill)) {
    if (!homeOk(p.h) || away(p)) continue;
    const kinds = p.ill === 1 ? ['clinic', 'hospital'] : ['hospital', 'clinic'];
    for (const kind of kinds) {
      const c = nearest(p.h, all((d) => d.care?.kind === kind), 20, careHas);
      if (c >= 0 && !(p.ill === 3 && kind === 'clinic')) { careFor.set(p.i, c); careUsed.set(c, (careUsed.get(c) || 0) + 1); break; }
    }
    if (!careFor.has(p.i) && useAbroad('care')) careFor.set(p.i, -2);
  }

  // Evenings out: everyone who's well picks somewhere with room.
  const funUsed = new Map();
  const funTotal = all((d) => !!d.visits).reduce((a, i) => a + capacity(s, i, 'visits'), 0);
  const funScale = funTotal ? Math.max(0, 1 - (incoming.fun || 0) / funTotal) : 1;
  const funHas = (i) => (funUsed.get(i) || 0) < Math.floor(capacity(s, i, 'visits') * staffing(s, i) * funScale);
  const funFor = (p) => all((d) => {
    const w = d.visits?.who;
    return w === 'all' || (w === 'kids' && p.a < 13) || (w === 'adults' && p.a >= ADULT) || (w === 'active' && p.a >= 6 && p.a < 60);
  });
  for (const p of s.people) {
    p.fun = -1;
    if (p.ill >= 2 || p.a < 3 || !homeOk(p.h) || away(p) || rng() < 0.25) continue;
    const options = funFor(p).filter(funHas).map((i) => [i, mapFor(p.h).d(i)]).filter(([, d]) => d >= 0 && d <= 12);
    if (!options.length) { const a = p.a >= 6 && useAbroad('fun'); if (a) p.fa = a.id; continue; }
    let r = rng() * options.reduce((a, [, d]) => a + 1 / (1 + d), 0);
    const [f] = options.find(([, d]) => (r -= 1 / (1 + d)) < 0) || options[0];
    p.fun = f;
    funUsed.set(f, (funUsed.get(f) || 0) + 1);
  }

  // Trips. Short ones are walked or cycled on footpaths and pavements; longer ones are driven.
  const load = new Float32Array(N), cap = new Float32Array(N);
  for (let i = 0; i < N; i++) if (carNet[i]) cap[i] = s.grid[i] === T.HALL ? HALL_CAP : ROAD_CAP;
  const trips = [];
  const time = (a, b, k) => a + h32(k, s.day) * (b - a);
  const riders = { bus: 0, train: 0 }, stopUse = new Map(), railPairs = new Map();
  const railPath = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!railPairs.has(key)) { const m = bfs(railNet, [a]); const path = []; for (let v = b; v !== -1; v = m.prev[v]) path.push(v); railPairs.set(key, m.dist[b] >= 0 ? path.reverse() : null); }
    const r = railPairs.get(key);
    return r && r[0] !== a ? [...r].reverse() : r;
  };
  const addTrip = (p, to, kind, dep, ret, withIds = []) => {
    const m = mapFor(p.h);
    const walkPath = route(m.w, walkNet, s, to);
    if (!walkPath) return null;
    const d = walkPath.length - 1;
    const young = p.a < 12;
    let mode = d <= 3 ? 'walk' : d <= (young ? 5 : 9) && h32(p.i, 7) < 0.7 ? 'bike' : 'car';
    let path = walkPath, via = null;
    if (p.oj && kind === 'work') { mode = d <= 3 ? 'walk' : 'bike'; via = p.oj; }
    else if ((mode === 'car' || (mode === 'bike' && d > 6)) && !(young && withIds.length)) {
      // Long trip: take the train if there's a station near both ends on the same line, else the bus.
      const a = within(p.h, stations, B[T.STATION].catchment);
      const b = a >= 0 ? stations.filter((x) => x !== a && railComp[x] === railComp[a]).find((x) => { const dd = distFrom(x, to); return dd >= 0 && dd <= B[T.STATION].catchment; }) : undefined;
      if (b !== undefined) {
        const rail = railPath(a, b), toA = route(m.w, walkNet, s, a), fromB = route(mapFrom(b).w, walkNet, s, to);
        if (rail && toA && fromB) { mode = 'train'; path = [...toA, ...rail.slice(1, -1), ...fromB]; via = [a, b]; riders.train++; }
      }
      if ((mode === 'car' || mode === 'bike') && stops.length && riders.bus < busCap) {
        const sa = within(p.h, stops, B[T.STOP].catchment);
        const sb = sa >= 0 ? stops.filter((x) => x !== sa).find((x) => { const dd = distFrom(x, to); return dd >= 0 && dd <= B[T.STOP].catchment; }) : undefined;
        const cp = sb !== undefined ? route(m.c, carNet, s, to) : null;
        if (cp) { mode = 'bus'; path = cp; via = [sa, sb]; riders.bus++; for (const x of via) stopUse.set(x, (stopUse.get(x) || 0) + 1); }
      }
    }
    if (mode === 'car') {
      const cp = route(m.c, carNet, s, to);
      if (cp) path = cp; else mode = 'bike';
    }
    const trip = { p: p.i, to, kind, dep, ret, path, mode, with: withIds, ok: 1, via };
    if (mode === 'car') for (const t of path) load[t] += 1;
    if (mode === 'bus') for (const t of path) load[t] += 0.08;
    trips.push(trip);
    return trip;
  };
  // Trips out of town go to the border crossing with that neighbour and over the bridge.
  const edgeMaps = new Map();
  const edgeTrip = (p, a, kind, dep, ret) => {
    if (!a?.edge && a?.edge !== 0) return;
    const m = mapFor(p.h), car = carNet[a.edge];
    const map = car ? m.c : m.w;
    if (map.dist[a.edge] < 0) return;
    const path = []; for (let v = a.edge; v !== -1; v = map.prev[v]) path.push(v);
    trips.push({ p: p.i, to: a.edge, kind, dep, ret, path: path.reverse(), mode: a.via === 'rail' ? 'train' : car ? 'car' : 'bike', with: [], ok: 1, abroad: a.id, city: a.name });
  };
  const byId = Object.fromEntries(abroad.map((a) => [a.id, a]));
  for (const [h, members] of byHome) {
    if (!homeOk(h)) continue;
    const parent = members.find((p) => p.a >= ADULT && p.ill < 2 && !away(p)) || null;
    for (const p of members) {
      if (away(p)) continue;
      if (p.fa) edgeTrip(p, byId[p.fa], 'fun', time(17.5, 19, p.i + 4), time(21, 22.5, p.i + 5));
      if (p.as) edgeTrip(p, byId[p.as], 'school', time(7, 7.8, p.i), time(15.2, 16, p.i + 1));
      if (careFor.get(p.i) === -2) edgeTrip(p, abroad.find((a) => out[a.id]?.care), 'care', time(9, 11, p.i + 6), time(13, 15, p.i + 7));
      if (p.j >= 0 && !away(p)) {
        const shift = !p.oj && ['Doctor', 'Nurse', 'Officer', 'Firefighter', 'Bus driver'].includes(B[s.grid[p.j]].jobs?.[p.jt]?.[0]);
        addTrip(p, p.j, 'work', shift ? time(5, 9, p.i) : time(6.8, 8.6, p.i), shift ? time(15, 19, p.i + 1) : time(16.6, 18.4, p.i + 1));
      }
      if (p.sc >= 0 && !away(p)) {
        const stage = B[s.grid[p.sc]].school.stage;
        const driven = p.a < 10 && parent && parent !== p;
        const t = addTrip(driven ? parent : p, p.sc, stage === 'uni' ? 'uni' : 'school', stage === 'uni' ? time(8, 9.5, p.i) : time(7.3, 8.1, p.i),
          stage === 'uni' ? time(15.5, 17, p.i + 1) : time(14.8, 15.4, p.i + 1), driven ? [p.i] : []);
        if (t && driven) { t.kind = 'drop'; t.kid = p.i; }
        if (p.tu >= 0) addTrip(p, p.tu, 'tutor', time(15.6, 16.2, p.i + 2), time(17.4, 18, p.i + 3));
      }
      if (p.fun >= 0 && !away(p)) addTrip(p, p.fun, 'fun', p.a < 13 ? time(15.8, 17, p.i + 4) : time(18, 19.6, p.i + 4), p.a < 13 ? time(18, 19, p.i + 5) : time(20.5, 22, p.i + 5));
      if (careFor.get(p.i) >= 0) addTrip(p, careFor.get(p.i), 'care', time(9, 11, p.i + 6), time(12, 13.5, p.i + 7));
    }
    if (shopFor.get(h) >= 0 && parent) addTrip(parent, shopFor.get(h), 'shop', time(10, 16, h), time(11.5, 17.5, h + 1));
    else if (shopFor.get(h) === -2 && parent) edgeTrip(parent, abroad.find((a) => out[a.id]?.shop), 'shop', time(10, 15, h), time(12.5, 17.5, h + 1));
  }
  // Visitors from linked neighbours drive in over the bridge to your venues, clinics and shops.
  for (const v of s._visitorsFrom || []) {
    const dests = { fun: all((d) => !!d.visits), care: all((d) => !!d.care), shop: shops, school: all((d) => d.school && d.school.stage !== 'uni') };
    let k = 0;
    for (const kind of ['fun', 'care', 'shop', 'school']) {
      for (let n = 0; n < Math.min(12, v[kind] || 0); n++, k++) {
        const list = dests[kind];
        if (!list.length) break;
        const to = list[Math.floor(h32(k, s.day + 3) * list.length)];
        const map = edgeMaps.get(v.edge) || bfs(carNet[v.edge] ? carNet : walkNet, [v.edge]);
        edgeMaps.set(v.edge, map);
        const path = route(map, carNet[v.edge] ? carNet : walkNet, s, to);
        if (!path) continue;
        const dep = kind === 'fun' ? time(17.5, 19.5, k + 900) : kind === 'school' ? time(7.2, 8, k + 900) : time(9.5, 15, k + 900);
        trips.push({ p: -(k + 1), visitor: v.name, to, kind, dep, ret: dep + (kind === 'school' ? 7.5 : 2.5), path, mode: v.via === 'rail' ? 'train' : 'car', with: [], ok: 1 });
      }
    }
  }

  // A trip succeeds in proportion to how jammed its worst road is. Jammed drivers can be late.
  let carTrips = 0, carOk = 0;
  for (const t of trips) {
    if (t.mode !== 'car') continue;
    let worst = 0;
    for (const i of t.path) if (cap[i]) worst = Math.max(worst, load[i] / cap[i]);
    t.ok = worst <= 1 ? 1 : 1 / worst;
    carTrips++; carOk += t.ok;
  }

  // Needs, Sims-style. Each is 0..1 and tells the player what to fix next.
  const c = census(s);
  const kids = s.people.filter((p) => p.a < ADULT);
  const pollution = new Set(), parks = new Set(), police = new Set();
  for (const [h] of byHome) {
    if (all((d) => !!d.pollution).some((f) => dist1(f, h) <= 3)) pollution.add(h);
    if ((byType.get(T.PARK) || []).some((f) => dist1(f, h) <= 3)) parks.add(h);
    if ((byType.get(T.POLICE) || []).some((f) => staffing(s, f) > 0 && dist1(f, h) <= B[T.POLICE].radius)) police.add(h);
  }
  const homes = totals(s, uc).homes, pop = s.people.length;
  const sick = s.people.filter((p) => p.ill);
  const needs = {
    jobs: c.employed + c.seeking ? c.employed / (c.employed + c.seeking) : 1,
    commute: carTrips ? carOk / carTrips : 1,
    shops: pop ? [...byHome].reduce((a, [h, m]) => a + (shopFor.has(h) ? m.length : 0), 0) / pop : 1,
    homes: clamp((homes - pop) / Math.max(3, pop * 0.15)),
    school: kids.some((p) => p.a >= 5) ? kids.filter((p) => p.a >= 5 && (p.sc >= 0 || p.as)).length / kids.filter((p) => p.a >= 5).length : 1,
    health: sick.length ? clamp(1 - (sick.filter((p) => !careFor.has(p.i)).length / Math.max(1, pop)) * 8) : 1,
    safety: clamp(1 - (s.stats.crimes || 0) / Math.max(1, pop * 0.03) * 0.5 - (s.cases > 3 ? 0.2 : 0)),
    leisure: pop ? s.people.filter((p) => p.fun >= 0 || p.fa || away(p)).length / pop : 1,
  };
  for (const p of s.people) if (away(p) && p.hto && byId[p.hto]) (out[p.hto] ||= { fun: 0, care: 0, shop: 0, school: 0, tourists: 0 }).tourists++;

  // Routes the vehicles drive: trains between stations and out to the plot edge; one bus loop through every stop.
  const railEnds = [...stations];
  for (let i = 0; i < N; i++) {
    const x = i % PLOT, y = (i / PLOT) | 0;
    if (s.grid[i] === T.RAIL && railNet[i] && (x === 0 || y === 0 || x === PLOT - 1 || y === PLOT - 1) && stations.some((st) => railComp[st] === railComp[i])) railEnds.push(i);
  }
  const trainLines = [];
  for (let a = 0; a < railEnds.length; a++) for (let b = a + 1; b < railEnds.length; b++) {
    if (railComp[railEnds[a]] !== railComp[railEnds[b]] || trainLines.length >= 3) continue;
    const r = railPath(railEnds[a], railEnds[b]);
    if (r && r.length > 2) trainLines.push(r);
  }
  let busLoop = null;
  if (stops.length >= 2) {
    const order = [...stops].sort((a, b) => Math.atan2(((a / PLOT) | 0) - 12, a % PLOT - 12) - Math.atan2(((b / PLOT) | 0) - 12, b % PLOT - 12));
    const loop = [];
    for (let k = 0; k < order.length; k++) {
      const from = order[k], to = order[(k + 1) % order.length];
      const leg = route(mapFrom(from).c, carNet, s, to);
      if (leg) loop.push(...(loop.length ? leg.slice(1) : leg));
    }
    if (loop.length > 2) busLoop = { path: loop, stops: new Set(order.flatMap((x) => doorsteps(s, carNet, x))), buses: Math.min(drivers, 4) };
  }
  const p = {
    load, cap, trips, needs, careFor, shopFor, pollution, parks, police, byHome, served,
    employmentRate: needs.jobs, failedTrips: Math.round(carTrips - carOk), day: s.day,
    riders, stopUse, stations, trainLines, busLoop, drivers, busCap, outCap, outUsed, out,
  };
  s._plan = p;
  return p;
}

// ---------- player actions ----------

export function availability(s, type) {
  const d = B[type];
  if (d.minPop && totalPop(s) < d.minPop) return { ok: false, locked: true, reason: `Needs ${d.minPop} people` };
  if (d.needs && !s.grid.some((t, i) => t === d.needs && active(s, i))) return { ok: false, locked: true, reason: `Needs a ${B[d.needs].name.toLowerCase()} first` };
  if (s.money < d.cost) return { ok: false, reason: `Needs $${d.cost}` };
  return { ok: true };
}

export function canPlace(s, i, type) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen. Rebuild to keep playing.' };
  if (i < 0 || i >= N) return { ok: false, reason: 'Outside your plot.' };
  if (!owns(s, i)) return { ok: false, reason: 'You don’t own this land yet. Buy it first.' };
  if (s.grid[i] === T.RUBBLE) return { ok: false, reason: 'Clear the rubble first.' };
  if (s.grid[i] !== T.EMPTY) return { ok: false, reason: 'That tile is taken.' };
  const a = availability(s, type);
  if (!a.ok) return { ok: false, reason: a.reason + '.' };
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
  s.counters.built++;
  s._plan = null;
  return { ok: true, cost: B[type].cost };
}

export function undoPlace(s, i) {
  const k = s.queue.findIndex((q) => q.i === i && !q.up);
  const t = s.grid[i];
  if (k === -1 || s.queue[k].left < B[t].work) return { ok: false, reason: 'Builders have already started on that.' };
  s.queue.splice(k, 1);
  s.money += B[t].cost;
  s.grid[i] = T.EMPTY;
  s.cond[i] = 0;
  s.counters.built = Math.max(0, s.counters.built - 1);
  s._plan = null;
  return { ok: true, refund: B[t].cost };
}

export const upgradeCost = (s, i) => Math.round(B[s.grid[i]].cost * LEVEL.cost[level(s, i) + 1]);
export function canUpgrade(s, i) {
  const t = s.grid[i];
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (!UPGRADABLE.includes(t)) return { ok: false, reason: 'This can’t be upgraded.' };
  if (s.queue.some((q) => q.i === i)) return { ok: false, reason: 'Builders are already working here.' };
  if (level(s, i) >= MAX_LEVEL) return { ok: false, reason: 'Already at the top level.' };
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
  s._plan = null;
  return { ok: true, refund };
}

// Move a finished building to another empty tile you own. Residents and staff move with it.
export function canMove(s, from, to) {
  const t = s.grid[from];
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (!B[t]?.cat) return { ok: false, reason: t === T.HALL ? 'The town hall stays put.' : 'Only buildings can be moved.' };
  if (s.queue.some((q) => q.i === from)) return { ok: false, reason: 'Wait until the builders finish.' };
  if (to === from) return { ok: false, reason: 'Pick a different tile.' };
  if (!owns(s, to)) return { ok: false, reason: 'You don’t own that land.' };
  if (s.grid[to] !== T.EMPTY) return { ok: false, reason: 'That tile is taken.' };
  const fee = Math.round(B[t].cost * MOVE_FEE);
  if (s.money < fee) return { ok: false, reason: `Moving costs $${fee}.` };
  return { ok: true, fee };
}
export function moveBuilding(s, from, to) {
  const r = canMove(s, from, to);
  if (!r.ok) return r;
  s.money -= r.fee;
  for (const k of ['grid', 'cond', 'lv']) { s[k][to] = s[k][from]; s[k][from] = k === 'lv' ? 1 : 0; }
  s.grid[from] = T.EMPTY;
  for (const p of s.people) for (const k of ['h', 'j', 'sc', 'tu', 'fun']) if (p[k] === from) p[k] = to;
  s.counters.moved++;
  s._plan = null;
  return r;
}

// ---------- time ----------

function finish(s, q) {
  s.queue.splice(s.queue.indexOf(q), 1);
  if (q.up) s.lv[q.i] = Math.min(MAX_LEVEL, level(s, q.i) + 1);
  s.cond[q.i] = 100;
  s._plan = null;
  (s._finished ||= []).push({ i: q.i, up: !!q.up });
}

function construct(s) {
  let labour = 0;
  for (const p of s.people) {
    if (p.ill) continue;
    if (isBuilder(s, p)) labour += 1;
    else if (p.j < 0 && canWork(p)) labour += VOLUNTEER_RATE;
  }
  while (labour > 0 && s.queue.length) {
    const q = s.queue[0];
    const used = Math.min(labour, q.left);
    q.left -= used;
    labour -= used;
    if (q.left <= 1e-6) finish(s, q);
  }
}

function roomIn(s, h, byHome) { return homeCap(s, h) - (byHome.get(h)?.length || 0); }
function homesWithRoom(s, byHome, need = 1) {
  const out = [];
  for (let i = 0; i < N; i++) if (isHome(s.grid[i]) && active(s, i) && roomIn(s, i, byHome) >= need) out.push(i);
  return out;
}

function removePerson(s, p) {
  s.people.splice(s.people.indexOf(p), 1);
  for (const q of s.people) { if (q.pt === p.i) q.pt = 0; if (q.pa === p.i) q.pa = 0; }
}

function daily(s, plan, rng) {
  const st = { income: 0, upkeep: 0, failedTrips: plan.failedTrips, arrivals: 0, departures: 0, graduates: 0, births: 0, deaths: 0, crimes: 0, treated: 0, cases: 0 };
  const uc = underConstruction(s);
  const tot = totals(s, uc);
  const name = (p) => personName(p);
  const byHome = () => { const m = new Map(); for (const p of s.people) { if (!m.has(p.h)) m.set(p.h, []); m.get(p.h).push(p); } return m; };
  const hasType = (t) => s.grid.some((g, i) => g === t && active(s, i, uc) && staffing(s, i) > 0);
  const lateTrips = new Set(plan.trips.filter((t) => t.kind === 'work' && t.ok < 1 && rng() < 1 - t.ok).map((t) => t.p));

  // Health: activity, accidents, illness and treatment.
  for (const p of s.people) {
    const fun = p.fun >= 0 ? B[s.grid[p.fun]]?.visits : null;
    if (fun?.health) p.hp = Math.min(100, p.hp + fun.health);
    if (!p.ill) {
      const risk = (fun?.injury || 0) + (p.j >= 0 ? B[s.grid[p.j]]?.injury || 0 : 0) + (lateTrips.has(p.i) ? 0.003 : 0);
      if (rng() < risk) { p.ill = 2; p.sd = 0; note(s, 'warn', `${name(p)} was injured${fun?.injury ? ' playing sport' : ''}.`); }
      else if (rng() < 0.012 * (p.m < 0.4 ? 1.6 : 1) * (p.a > 60 ? 1.8 : 1) * (p.fun >= 0 ? 0.8 : 1) * (p.hp < 60 ? 1.5 : 1)) { p.ill = 1; p.sd = 0; }
      else p.hp = Math.min(100, p.hp + 3);
    } else if (plan.careFor.has(p.i)) {
      p.ill = 0; p.sd = 0; p.hp = Math.min(100, p.hp + 25); st.treated++;
    } else {
      p.sd++;
      p.hp -= p.ill === 3 ? 12 : p.ill === 1 ? 4 : 3;
      if (p.ill === 1 && p.sd >= 3 && rng() < (p.a > 60 ? 0.2 : 0.08)) { p.ill = 3; note(s, 'warn', `${name(p)} is seriously ill and needs a hospital.`); }
      else if (p.ill === 2 && p.sd >= 5) p.ill = 0;
      else if (p.ill === 1 && p.sd >= 4 && rng() < 0.6) p.ill = 0;
      else if (p.ill === 3 && p.sd >= 8 && rng() < 0.3) p.ill = 1;
    }
  }

  // Deaths, from old age or untreated illness. Families grieve; a cemetery helps them move on.
  const graves = s.grid.reduce((a, t, i) => a + (t === T.CEMETERY && active(s, i, uc) ? capacity(s, i, 'graves') : 0), 0);
  for (const p of [...s.people]) {
    const old = p.a >= 70 ? (p.a - 68) * 0.012 : 0;
    const why = p.hp <= 0 ? 'illness' : p.ill === 3 && rng() < 0.06 ? 'illness' : rng() < old ? 'old age' : null;
    if (!why) continue;
    const buried = s.graves < graves;
    if (buried) s.graves++;
    for (const q of s.people) if (q.h === p.h || q.pt === p.i || q.pa === p.i) q.gr = buried ? 4 : 8;
    note(s, 'warn', `${name(p)} died${why === 'old age' ? ` peacefully at ${p.a}` : ` of illness at ${p.a}`}.${buried ? '' : ' With no cemetery, the family is struggling.'}`);
    removePerson(s, p);
    st.deaths++;
  }

  // Growing up and learning. Tutors and libraries speed it up.
  for (const p of s.people) {
    p.a++;
    if (p.sc >= 0 && B[s.grid[p.sc]]) {
      const stage = B[s.grid[p.sc]].school.stage;
      const boost = (p.tu >= 0 ? 1.5 : 1) + (p.fun >= 0 && B[s.grid[p.fun]]?.visits?.study ? 0.2 : 0);
      if (stage === 'uni') {
        p.us += boost;
        if (p.us >= 3) { p.e = 3; p.sc = -1; p.us = 0; p.jy = 3; st.graduates++; note(s, 'good', `${name(p)} graduated from university.`); }
      } else if (stage !== 'daycare') p.sp += boost;
    }
    if (p.as) p.sp += 1;
    if (p.a === ADULT) {
      p.e = Math.max(p.e, p.sp >= 10 ? 2 : p.sp >= 5 ? 1 : 0);
      if (p.sp < 5) note(s, 'warn', `${name(p)} turned 18 without finishing school.`);
    }
    if (p.a === RETIRE && p.j >= 0) { p.j = -1; note(s, 'info', `${name(p)} retired.`); }
  }

  // Crime, policing and the courts.
  const pop = s.people.length;
  const seeking = s.people.filter((p) => p.j < 0 && canWork(p)).length;
  const policed = plan.police;
  const rate = 0.015 * (seeking / Math.max(1, pop) * 3 + (1 - s.happiness)) * (policed.size ? 0.45 : 1);
  const crimes = Math.floor(pop * rate + rng());
  for (let k = 0; k < crimes && pop > 4; k++) {
    const victim = s.people[Math.floor(rng() * pop)];
    const pool = s.people.filter((p) => p.a >= 16 && p !== victim && !(p.fun >= 0 && B[s.grid[p.fun]]?.visits?.discipline));
    if (!pool.length) break;
    const offender = pool.find((p) => p.j < 0 && rng() < 0.5) || pool[Math.floor(rng() * pool.length)];
    victim.vt = 3;
    st.crimes++;
    if (rng() < (policed.has(offender.h) ? 0.8 : 0.25)) { offender.cs = 1; s.cases++; }
    if (k === 0) note(s, 'warn', `${name(victim)} was robbed${offender.cs ? `. Police caught ${name(offender)}` : ''}.`);
  }
  const courts = s.grid.reduce((a, t, i) => a + (t === T.COURT && active(s, i, uc) ? Math.floor(capacity(s, i, 'cases') * staffing(s, i)) : 0), 0);
  const heard = Math.min(s.cases, courts);
  if (heard) {
    s.cases -= heard;
    let n = heard;
    for (const p of s.people) if (p.cs && n-- > 0) p.cs = 0;
    s.money += heard * 40;
    st.cases = heard;
    note(s, 'info', `The court heard ${heard} case${heard > 1 ? 's' : ''} and collected $${heard * 40} in fines.`);
  }

  // Families: couples have children, singles pair up, grown children move out.
  let homes = byHome();
  const hospital = hasType(T.HOSPITAL);
  for (const p of [...s.people]) {
    const q = p.pt && s.people.find((x) => x.i === p.pt);
    if (!q || p.i > q.i || p.h !== q.h || p.a < 20 || p.a > 45 || q.a < 20 || q.a > 45) continue;
    if (roomIn(s, p.h, homes) < 1 || rng() > 0.08 * (hospital ? 1.4 : 1) * ((p.m + q.m) / 2 < 0.5 ? 0.5 : 1)) continue;
    const baby = person(s, { f: Math.floor(rng() * FIRST.length), l: p.l, a: 0, h: p.h, pa: p.i, b: 1, sp: 0 });
    p.jy = q.jy = 3;
    st.births++;
    homes = byHome();
    note(s, 'good', `Baby ${FIRST[baby.f]} was born to ${FIRST[p.f]} and ${FIRST[q.f]} ${SURNAMES[p.l]}${hospital ? ' at the hospital' : ''}.`);
  }
  const singles = s.people.filter((p) => !p.pt && p.a >= 20 && p.a <= 50);
  for (const p of singles) {
    if (p.pt || rng() > 0.02) continue;
    const q = singles.find((x) => x !== p && !x.pt && x.h !== p.h);
    if (!q) continue;
    p.pt = q.i; q.pt = p.i;
    if (roomIn(s, p.h, homes) >= 1) { q.h = p.h; homes = byHome(); }
    note(s, 'good', `${name(p)} and ${name(q)} became a couple.`);
  }
  for (const p of s.people) {
    if (p.a < 20 || p.a > 32 || !p.pa || rng() > 0.08) continue;
    const parent = s.people.find((x) => x.i === p.pa);
    if (!parent || parent.h !== p.h) continue;
    const free = homesWithRoom(s, homes).filter((h) => h !== p.h);
    if (!free.length) continue;
    p.h = free[Math.floor(rng() * free.length)];
    homes = byHome();
    note(s, 'info', `${name(p)} moved out into a place of their own.`);
  }

  // Money: tax from working people, scaled by mood, against upkeep that doesn't shrink.
  const moodK = clamp((s.happiness - 0.15) / 0.7);
  const by = { basic: 0, skilled: 0, degree: 0, benefits: 0, trade: 0 };
  for (const p of s.people) {
    if (p.j >= 0 && !p.ill && p.oj) by[p.oj === 'rail' ? 'skilled' : 'basic'] += WAGE[p.oj === 'rail' ? 1 : 0] * moodK;
    else if (p.j >= 0 && !p.ill && B[s.grid[p.j]]?.jobs) {
      const req = B[s.grid[p.j]].jobs[p.jt][1];
      by[req >= 3 ? 'degree' : req >= 1 ? 'skilled' : 'basic'] += (req >= 3 ? WAGE[2] : req >= 1 ? WAGE[1] : WAGE[0]) * moodK;
    } else if (p.j < 0 && canWork(p)) by.benefits += 0.5 * moodK;
  }
  by.trade = TRADE_PER_LINK * Math.min(MAX_LINKS * 2, (s.links || 0) + 2 * (s.railLinks || 0)) * Math.min(1, pop / 30);
  const inc = s._incoming || {};
  by.visitors = (inc.fun || 0) * 2 + (inc.care || 0) * 4 + (inc.shop || 0) * 1 + (inc.school || 0) * 2 + (inc.tourists || 0) * 8;
  for (const k in by) by[k] = Math.round(by[k]);
  st.byClass = by;
  st.upkeepBy = Object.fromEntries(Object.entries(tot.upkeepBy).map(([k, v]) => [k, Math.round(v)]));
  st.income = Object.values(by).reduce((a, b) => a + b, 0);
  st.upkeep = Math.round(tot.upkeep);
  s.money += st.income - st.upkeep;

  // Maintenance.
  const buildings = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (t !== T.EMPTY && t !== T.ROAD && t !== T.PATH && t !== T.RAIL && t !== T.HALL && t !== T.RUBBLE && !uc.has(i) && s.cond[i] > 0) buildings.push(i);
  }
  if (s.money < 0) {
    const debt = Math.min(1, -s.money / Math.max(1, st.upkeep));
    for (const i of buildings) s.cond[i] = Math.max(0, s.cond[i] - (10 + 15 * debt));
    s.money = 0;
    s.unpaidDays++;
    note(s, 'warn', `Couldn’t pay upkeep. Buildings are decaying (day ${s.unpaidDays} unpaid).`);
  } else {
    s.unpaidDays = 0;
    for (const i of buildings) s.cond[i] = Math.min(100, s.cond[i] + 5);
  }

  // Mood, person by person. Everything they experienced today counts.
  const fireCover = s.grid.some((t, i) => t === T.FIRE && active(s, i, uc) && staffing(s, i) > 0);
  const kidsNoSchool = new Set(s.people.filter((p) => p.a >= 5 && p.a < ADULT && p.sc < 0 && !p.as).map((p) => p.h));
  const courtBacklog = s.cases > 3 ? 0.04 : 0;
  const tripsBy = new Map();
  for (const t of plan.trips) { if (!tripsBy.has(t.p)) tripsBy.set(t.p, []); tripsBy.get(t.p).push(t); }
  for (const p of s.people) {
    const t = s.grid[p.h];
    let m = 0.36;
    if (isHome(t) && active(s, p.h, uc)) m += 0.1 + (B[t].homeMood || 0) + (s.cond[p.h] < 40 && t !== T.HALL ? -0.08 : 0); else m -= 0.2;
    if (p.a >= ADULT) m += p.j >= 0 ? 0.12 : p.sc >= 0 ? 0.1 : p.a >= RETIRE ? 0.1 : p.st ? 0.03 : -0.1;
    else m += p.sc >= 0 || p.a < 5 ? 0.1 : -0.08;
    const mine = tripsBy.get(p.i) || [];
    const car = mine.filter((x) => x.mode === 'car');
    m += car.length ? 0.08 * car.reduce((a, x) => a + x.ok, 0) / car.length : 0.07;
    if (mine.some((x) => x.mode === 'train' || x.mode === 'bus')) m += 0.02;
    if (lateTrips.has(p.i)) m -= 0.05;
    m += plan.shopFor.has(p.h) ? 0.06 : -0.05;
    m += p.fun >= 0 || p.fa ? 0.1 : p.hol ? 0.15 : 0;
    m += plan.parks.has(p.h) ? 0.04 : 0;
    m -= plan.pollution.has(p.h) ? 0.08 : 0;
    m -= p.ill === 3 ? 0.25 : p.ill ? 0.12 : 0;
    m -= p.vt ? 0.15 : 0;
    m -= p.gr ? 0.18 : 0;
    m += p.jy ? 0.12 : 0;
    m -= kidsNoSchool.has(p.h) ? 0.05 : 0;
    m -= courtBacklog;
    m += LINK_MOOD * Math.min(MAX_LINKS, (s.links || 0) + (s.railLinks || 0));
    p.m += (clamp(m) - p.m) * 0.4;
    for (const k of ['vt', 'gr', 'jy']) if (p[k]) p[k]--;
  }

  // Holidays in linked cities, and families moving to a happier one.
  const abroad = s._abroad || [];
  st.emigrants = [];
  st.holidays = 0;
  homes = byHome();
  for (const [, members] of homes) {
    const back = members.filter((p) => p.hol > 0 && --p.hol === 0);
    if (back.length) { for (const p of back) p.jy = 2; note(s, 'good', `The ${SURNAMES[back[0].l]} family came home from a holiday in ${back[0].hcity || 'the next city'}.`); }
  }
  if (abroad.length && s.day >= 2) {
    for (const [, members] of homes) {
      if (members.some((p) => p.hol > 0 || p.ill)) continue;
      const avg = members.reduce((a, p) => a + p.m, 0) / members.length;
      const dest = abroad[Math.floor(rng() * abroad.length)];
      if (avg >= 0.55 && rng() < 0.03) {
        const days = 1 + Math.floor(rng() * 3);
        for (const p of members) { p.hol = days; p.hto = dest.id; p.hcity = dest.name; }
        st.holidays += members.length;
        note(s, 'info', `The ${SURNAMES[members[0].l]} family went on holiday to ${dest.name} for ${days} day${days > 1 ? 's' : ''}.`);
      } else if (s.day >= GRACE_DAYS && avg < 0.45 && dest.homesFree >= members.length && dest.happiness > s.happiness + 0.05 && rng() < 0.25) {
        st.emigrants.push({ to: dest.id, name: dest.name, people: members.map((p) => ({ f: p.f, l: p.l, a: p.a, e: p.e, sp: p.sp, hp: p.hp, m: p.m })) });
        for (const p of members) removePerson(s, p);
        note(s, 'warn', `The ${SURNAMES[members[0].l]} family moved to ${dest.name}, where life looked better.`);
      }
    }
    homes = byHome();
  }

  // Moving in and out.
  homes = byHome();
  for (const [h, members] of homes) {
    if (isHome(s.grid[h]) && active(s, h, uc)) continue;
    const free = homesWithRoom(s, homes, members.length)[0];
    if (free !== undefined) { for (const p of members) p.h = free; homes = byHome(); continue; }
    for (const p of members) removePerson(s, p);
    st.departures += members.length;
    homes = byHome();
  }
  if (s.day >= GRACE_DAYS) {
    for (const [, members] of homes) {
      const avg = members.reduce((a, p) => a + p.m, 0) / members.length;
      if (avg < 0.32 && rng() < 0.35) { for (const p of members) removePerson(s, p); st.departures += members.length; }
    }
  }
  homes = byHome();
  if (st.departures) note(s, 'warn', `${st.departures} ${st.departures > 1 ? 'people' : 'person'} left the city.`);
  if (s.happiness >= 0.55 && !st.departures) {
    let budget = Math.max(1, Math.round(homesWithRoom(s, homes).reduce((a, h) => a + roomIn(s, h, homes), 0) * 0.25 * s.happiness));
    for (const h of homesWithRoom(s, homes, 2)) {
      if (budget <= 0) break;
      const room = roomIn(s, h, homes);
      const kind = room >= 4 && rng() < 0.45 ? 'family' : rng() < 0.6 ? 'couple' : 'single';
      const arrived = household(s, h, rng, kind);
      while (roomIn(s, h, byHome()) < 0 && arrived.length) removePerson(s, arrived.pop());
      st.arrivals += arrived.length;
      budget -= arrived.length;
      homes = byHome();
    }
    if (st.arrivals) note(s, 'good', `${st.arrivals} ${st.arrivals > 1 ? 'people' : 'person'} moved in.`);
  }

  st.riders = (plan.riders?.bus || 0) + (plan.riders?.train || 0);
  st.commuters = s.people.filter((p) => p.oj).length;
  st.event = s.day >= 2 && rng() < EVENT_CHANCE ? randomEvent(s, rng, fireCover) : null;
  s.day++;
  s.peakPop = Math.max(s.peakPop, s.people.length);
  st.emigrated = st.emigrants.reduce((a, e) => a + e.people.length, 0);
  for (const k of ['births', 'deaths', 'graduates', 'crimes', 'cases', 'treated', 'arrivals', 'departures', 'emigrated', 'holidays']) s.counters[k] = (s.counters[k] || 0) + (st[k] || 0);
  s.stats = st;
  s.history.push({ d: s.day, pop: s.people.length, money: Math.floor(s.money), mood: Math.round(s.happiness * 100), net: st.income - st.upkeep });
  if (s.history.length > HISTORY_DAYS) s.history.splice(0, s.history.length - HISTORY_DAYS);

  const broke = s.money < B[T.HOUSE].cost;
  if ((s.people.length === 0 && broke && s.day > GRACE_DAYS) || s.unpaidDays >= COLLAPSE_UNPAID_DAYS) return collapse(s);
  return null;
}

export function collapse(s, outcome = 'collapsed') {
  const record = { name: s.name, cityNo: s.cityNo, peakPop: s.peakPop, daysSurvived: s.day, outcome };
  for (let i = 0; i < N; i++) {
    if (s.grid[i] !== T.EMPTY) { s.grid[i] = T.RUBBLE; s.cond[i] = 0; }
    s.lv[i] = 1;
  }
  Object.assign(s, { queue: [], people: [], status: 'ruins', happiness: 0, cases: 0, _plan: null });
  return record;
}

export function rebuild(s, name, money = REBUILD_MONEY) {
  s.grid[HALL_INDEX] = T.HALL;
  s.cond[HALL_INDEX] = 100;
  Object.assign(s, {
    name: name || s.name, queue: [], money, history: [], log: [], flags: {}, people: [], nextId: 1, graves: 0, cases: 0,
    happiness: 0.65, hour: 0, day: 0, peakPop: 6, unpaidDays: 0, cityNo: s.cityNo + 1, status: 'alive', goalsDone: [],
  });
  settle(s, Math.random);
}

// ---------- random events ----------
const EVENTS = [
  { w: 3, ok: (s) => s.people.length >= 15, run: (s) => { for (const p of s.people) p.m = Math.min(1, p.m + 0.06); return 'A street festival lifted everyone’s mood.'; } },
  { w: 3, ok: (s) => (s.links || 0) > 0 || s.people.length >= 30, run: (s) => {
    const g = 20 + Math.round(s.people.length * 0.6) + 15 * Math.min(MAX_LINKS, s.links || 0);
    s.money += g; return `Visitors came through town and spent $${g}.`; } },
  { w: 2, ok: () => true, run: (s) => { s.money += 100; return 'A former resident sent a $100 donation.'; } },
  { w: 1, ok: (s) => s.happiness >= 0.7 && s.people.length >= 20, run: (s) => { s.money += 250; return 'The regional council sent a $250 grant for running a happy city.'; } },
  { w: 2, ok: (s) => built(s).length >= 4, run: (s, rng, fire) => {
    const list = built(s), n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) { const i = list[Math.floor(rng() * list.length)]; s.cond[i] = Math.max(1, s.cond[i] - 20); }
    return `A storm damaged ${n} building${n > 1 ? 's' : ''}. They repair as upkeep is paid.`; } },
  { w: 1, ok: (s) => s.people.length >= 30 && built(s).length >= 6, run: (s, rng, fire) => {
    const list = built(s), i = list[Math.floor(rng() * list.length)];
    s.cond[i] = Math.max(1, s.cond[i] - (fire ? 15 : 55));
    return fire ? `Firefighters put out a fire at a ${B[s.grid[i]].name.toLowerCase()} before it spread.` : `A fire badly damaged a ${B[s.grid[i]].name.toLowerCase()}. A fire station would have helped.`; } },
  { w: 2, ok: (s) => s.people.length >= 10, run: (s, rng) => {
    const n = 1 + Math.floor(rng() * 3), pool = s.people.filter((p) => !p.ill);
    for (let k = 0; k < n && pool.length; k++) { const p = pool.splice(Math.floor(rng() * pool.length), 1)[0]; p.ill = 1; p.sd = 0; }
    return `A flu is going around: ${n} ${n > 1 ? 'people are' : 'person is'} sick.`; } },
];
function built(s) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (B[t]?.cat && s.cond[i] > 0 && !s.queue.some((q) => q.i === i && !q.up)) out.push(i);
  }
  return out;
}
function randomEvent(s, rng, fire) {
  const ok = EVENTS.filter((e) => e.ok(s));
  if (!ok.length) return null;
  let r = rng() * ok.reduce((a, e) => a + e.w, 0);
  const ev = ok.find((e) => (r -= e.w) < 0) || ok[0];
  const text = ev.run(s, rng, fire);
  note(s, 'event', text);
  return text;
}

// ---------- goals ----------
const count = (tot, ...types) => types.reduce((a, t) => a + (tot.counts[t] || 0), 0);
const GOAL_TESTS = {
  roads10: (s, t) => count(t, T.ROAD) >= 10,
  houses3: (s, t) => count(t, T.HOUSE, T.APARTMENT, T.VILLA) >= 3,
  work1: (s, t) => count(t, T.WORK, T.FACTORY) >= 1,
  shop1: (s, t) => count(t, T.SHOP) >= 1,
  school1: (s, t) => count(t, T.SCHOOL) >= 1,
  pop25: (s) => s.people.length >= 25,
  clinic1: (s, t) => count(t, T.CLINIC, T.HOSPITAL) >= 1,
  land1: (s) => s.counters.land >= 1,
  baby1: (s) => s.counters.births >= 1,
  upgrade1: (s) => s.lv.some((l) => l > 1),
  fun3: (s, t) => count(t, T.PARK, T.PLAYGROUND, T.SPORTS, T.GYM, T.DOJO, T.POOL, T.CINEMA, T.CAFE, T.LIBRARY) >= 3,
  police1: (s, t) => count(t, T.POLICE) >= 1,
  transit1: (s) => (s.stats.riders || 0) > 0,
  happy75: (s) => s.people.length >= 30 && s.happiness >= 0.75,
  grad1: (s) => s.counters.graduates >= 1,
  days10: (s) => s.day >= 10,
  pop100: (s) => s.people.length >= 100,
  days30: (s) => s.day >= 30,
};
export function checkGoals(s, tot = totals(s)) {
  if (s.status !== 'alive') return [];
  const done = [];
  for (const g of GOALS) {
    if (s.goalsDone.includes(g.id) || !GOAL_TESTS[g.id]) continue;
    if (GOAL_TESTS[g.id](s, tot)) { s.goalsDone.push(g.id); s.money += g.reward; done.push(g); note(s, 'good', `Goal complete: ${g.text}. +$${g.reward}.`); }
  }
  return done;
}

// One in-game hour.
export function tick(s, rng = Math.random) {
  if (s.status !== 'alive') return { plan: null, collapsed: null };
  construct(s);
  const p = s._plan && s._plan.day === s.day ? s._plan : plan(s, rng);
  const avg = s.people.length ? s.people.reduce((a, x) => a + x.m, 0) / s.people.length : 0.5;
  s.happiness += (avg - s.happiness) * 0.25;
  s.hour++;
  let collapsed = null, day = null;
  if (s.hour >= HOURS_PER_DAY) {
    s.hour = 0;
    collapsed = daily(s, p, rng);
    day = { ...s.stats };
    if (!collapsed) plan(s, rng);
  }
  return { plan: s._plan, totals: totals(s), collapsed, day };
}

// What a city can spare for visitors from linked neighbours (half its free capacity).
export function offer(st) {
  if (st.status !== 'alive') return { fun: 0, care: 0, shop: 0, school: 0, homesFree: 0, happiness: 0 };
  const uc = underConstruction(st);
  let fun = 0, care = 0, shop = 0, school = 0;
  for (let i = 0; i < N; i++) {
    if (!active(st, i, uc)) continue;
    const d = B[st.grid[i]], k = staffing(st, i);
    if (d.visits) fun += capacity(st, i, 'visits') * k;
    if (d.care) care += capacity(st, i, 'care') * k;
    if (d.serves) shop += capacity(st, i, 'serves') * (k > 0 ? 1 : 0);
    if (d.school && (d.school.stage === 'primary' || d.school.stage === 'high')) school += capacity(st, i, 'seats') * (k > 0 ? 1 : 0);
  }
  const pop = st.people.length;
  fun -= st.people.filter((p) => p.fun >= 0).length;
  care -= st.people.filter((p) => p.ill).length;
  shop -= pop;
  school -= st.people.filter((p) => p.sc >= 0 && p.a >= 5 && p.a < ADULT).length;
  const half = (v) => Math.max(0, Math.floor(v / 2));
  return { fun: half(fun), care: half(care), shop: half(shop), school: half(school), homesFree: Math.max(0, totals(st, uc).homes - pop), happiness: st.happiness };
}

// A family arriving from a linked city. Returns how many found a home.
export function welcome(s, people, from) {
  const homes = new Map();
  for (const p of s.people) homes.set(p.h, (homes.get(p.h) || 0) + 1);
  let home = -1;
  for (let i = 0; i < N; i++) if (isHome(s.grid[i]) && active(s, i) && homeCap(s, i) - (homes.get(i) || 0) >= people.length) { home = i; break; }
  if (home < 0 || s.status !== 'alive') return 0;
  const made = people.map((o) => person(s, { f: o.f, l: o.l, a: o.a, e: o.e, sp: o.sp, hp: o.hp ?? 100, m: Math.max(0.55, o.m ?? 0.6), h: home }));
  const adults = made.filter((p) => p.a >= ADULT);
  if (adults.length >= 2) { adults[0].pt = adults[1].i; adults[1].pt = adults[0].i; }
  for (const k of made.filter((p) => p.a < ADULT)) k.pa = adults[0]?.i || 0;
  s.counters.immigrated = (s.counters.immigrated || 0) + made.length;
  note(s, 'good', `The ${SURNAMES[made[0].l]} family moved here from ${from}.`);
  s._plan = null;
  return made.length;
}
