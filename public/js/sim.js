// Pure city simulation with real residents. No DOM, no Firebase, so it runs in node tests too.
// Two days are a year of life. Every car, bike and walker you see is one of these people on a real trip.
import {
  PLOT, GAP, TERRAIN, T, B, START_MONEY, REBUILD_MONEY, GRACE_DAYS, VOLUNTEER_RATE, RUBBLE_CLEAR_COST, COLLAPSE_UNPAID_DAYS,
  ROAD_CAP, HALL_CAP, HOURS_PER_DAY, LEVEL, MAX_LEVEL, UPGRADABLE, TAP_SHARE, TAP_CAP, GOALS, TRADE_PER_LINK,
  LINK_MOOD, MAX_LINKS, HISTORY_DAYS, LOG_SIZE, EVENT_CHANCE, CHUNK, CHUNKS, START_CHUNKS, LAND_PRICE, LAND_STEP,
  MOVE_FEE, ADULT, RETIRE, WAGE, isHome, walkable, BUS_SEATS, COMMUTE_JOBS, TICK_MS, isRoad, isRail, POLICY, WANT_REWARD,
  GOODS_PER_FACTORY, SEASONS, SEASON_DAYS, YEAR_DAYS, UTILITY_POP, DECISIONS, ELECTION_EVERY, ZONES, ZONE_COST,
  HALL_LEVELS, FEATURE_NEEDS, MAT_PER_COST, MAT_BUY, HARVEST, EXCHANGE, PER_CAPITA, STOCK, TRADE_RES, MARKET, RES, FOOD, USE, STORE_BASE, SURPLUS_SALE, MATERIALS_BOOST, MATERIALS_PER_WORK, PLOT_BUY_PARCELS, PLOT_BUY_STEP, PLOT_BUY_MIN, BUILD_SPEED, RECRUIT_COST, FIRED_DAYS, ADULT_STUDY_YEARS, TRAINING_YEARS, EDU, HISTORIC_DAYS, INSURANCE, BONDS, LAND_RESALE, CROWDFUND, LETTER_DAYS, PLEDGE_DAYS, TECH, ERAS, ISSUES, TRAITS, PET_SHARE, PENSION, WASTE_POP, SEWAGE_POP, PROPERTY_TAX, RENT_SQUEEZE, MILESTONES, TOURIST_SPEND, DAYTRIP_SHARE, LOANS, LOAN_DAYS, CARBON_TAX, CONGESTION_FEE, QUAKE_CHANCE, TORNADO_CHANCE, BADGES,
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
  'Freya', 'Tom', 'Anya', 'Ezra', 'Lena', 'Ari', 'Zoe', 'Malik', 'Iris', 'Sami', 'Olive', 'Nikos',
  // Added in 1.18 (new names only go on the end: residents keep theirs by position)
  'Amelia', 'Oliver', 'Harper', 'Jack', 'Charlotte', 'Henry', 'Evelyn', 'Samuel', 'Matilda', 'Arthur', 'Poppy', 'Alfie', 'Daisy', 'George', 'Elsie', 'Harry',
  'Sienna', 'Isaac', 'Willow', 'Jasper', 'Imogen', 'Rory', 'Hazel', 'Callum', 'Esme', 'Declan', 'Niamh', 'Ciaran', 'Saoirse', 'Eamon', 'Aoife', 'Lars',
  'Astrid', 'Nils', 'Ingrid', 'Soren', 'Elif', 'Emre', 'Selin', 'Deniz', 'Yuki', 'Haruto', 'Sakura', 'Ren', 'Jiwoo', 'Minjun', 'Lan', 'Wei', 'Xin',
  'Aarav', 'Diya', 'Rohan', 'Anika', 'Vikram', 'Meera', 'Chidi', 'Ngozi', 'Tunde', 'Ama', 'Kwame', 'Zawadi', 'Juma', 'Sipho', 'Thandiwe', 'Carmen',
  'Javier', 'Lucia', 'Pablo', 'Valentina', 'Andres', 'Camila', 'Rafael', 'Beatriz', 'Joao', 'Marta', 'Piotr', 'Zofia', 'Katya', 'Dmitri', 'Eleni',
  'Giorgos', 'Dimitra', 'Stavros', 'Fatima', 'Hassan', 'Layla', 'Karim', 'Noor', 'Rania', 'Aleksander', 'Milena', 'Tomas', 'Hedda', 'Ronan', 'Bea'];
export const SURNAMES = ['Nguyen', 'Okafor', 'Papadopoulos', 'Smith', 'Kowalski', 'García', 'Chen', 'Haddad', 'Ivanova', 'Silva', 'Kaur',
  'Tanaka', 'Murphy', 'Rossi', 'Mensah', 'Kim', 'Novak', 'Ali', 'Jensen', 'Costa', 'Walker', 'Fernando', 'Nakamura', 'Petrov', 'Obi',
  'Laurent', 'Doyle', 'Sato', 'Horvat', 'Tran', 'Kelly', 'Moreau', 'Ahmed', 'Lindqvist', 'Reyes', 'Sharma',
  // Added in 1.18
  'Harrington', 'Whitfield', 'Ashworth', 'Blackwood', 'Fairweather', 'Holloway', 'Pemberton', 'Thornton', 'Carrington', 'Bramley', 'Hartley', 'Lockwood',
  'O\'Brien', 'Gallagher', 'MacLeod', 'Fitzgerald', 'Byrne', 'Quinn', 'Andersson', 'Nilsson', 'Berg', 'Halvorsen', 'Virtanen', 'Korhonen', 'Schmidt',
  'Becker', 'Hoffmann', 'Keller', 'Vogel', 'Dubois', 'Lefèvre', 'Girard', 'Bonnet', 'Romano', 'Esposito', 'Conti', 'Marino', 'Ferreira', 'Almeida',
  'Carvalho', 'Moreno', 'Ortega', 'Navarro', 'Castillo', 'Vargas', 'Mendoza', 'Rojas', 'Wiśniewski', 'Lewandowski', 'Dvořák', 'Horváth', 'Popescu',
  'Petrov', 'Sokolov', 'Georgiou', 'Nikolaidis', 'Yilmaz', 'Demir', 'Kaya', 'Farouk', 'Mansour', 'Rahman', 'Hossain', 'Iyer', 'Menon', 'Reddy',
  'Gupta', 'Bose', 'Watanabe', 'Suzuki', 'Kobayashi', 'Park', 'Choi', 'Lee', 'Wang', 'Liu', 'Zhang', 'Pham', 'Le', 'Adeyemi', 'Mwangi', 'Otieno',
  'Boateng', 'Dlamini', 'Ndlovu', 'Kamara', 'Diallo', 'Traoré', 'Tupou', 'Ngata', 'Wilson', 'Clarke', 'Hughes', 'Evans', 'Bennett'];
export const personName = (p) => `${FIRST[p.f]} ${SURNAMES[p.l]}`;

// One clock for the whole world, so every city shares the same time of day, season and weather.
export const worldHour = (now = Date.now()) => Math.floor(now / TICK_MS) % HOURS_PER_DAY;
// The calendar starts on launch day (25 September 2026), lined up with whole in-game days.
const EPOCH = Math.floor(Date.UTC(2026, 8, 25) / (TICK_MS * HOURS_PER_DAY)) * TICK_MS * HOURS_PER_DAY;
export const worldDay = (now = Date.now()) => Math.max(0, Math.floor((now - EPOCH) / (TICK_MS * HOURS_PER_DAY)));
export const season = (day) => SEASONS[Math.floor(day / SEASON_DAYS) % 4];
export function weather(day) {
  const s = season(day), r = h32(day, 77);
  if (s === 'Winter') return r < 0.4 ? 'snow' : r < 0.6 ? 'rain' : 'clear';
  if (s === 'Summer') return r < 0.3 ? 'heat' : r < 0.4 ? 'rain' : 'clear';
  return r < 0.35 ? 'rain' : 'clear';
}
const cityDay = (s) => worldDay(s.lastTick);

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
    v: 4, name, grid, cond, lv: new Array(N).fill(1), land, queue: [], money: START_MONEY, people: [], nextId: 1, hall: 0, hallDone: {},
    happiness: 0.65, hour: 0, day: 0, peakPop: 6, unpaidDays: 0, cityNo: 1, status: 'alive', lastTick: Date.now(),
    goalsDone: [], history: [], log: [], links: 0, flags: {}, graves: 0, cases: 0, clock: 1, wants: [], zone: new Array(N).fill(0), bday: new Array(N).fill(-1), protect: [],
    policy: { tax: 1, funding: 1, freeTransit: false },
    counters: { births: 0, deaths: 0, graduates: 0, crimes: 0, cases: 0, treated: 0, arrivals: 0, departures: 0, built: 0, land: 0, moved: 0 },
    stats: { income: 0, upkeep: 0, failedTrips: 0, arrivals: 0, departures: 0, graduates: 0 },
  };
  s.lastTick = Math.floor(Date.now() / TICK_MS) * TICK_MS;
  s.hour = worldHour(s.lastTick);
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

// A few milestones per person: [day, what].
const remember = (s, p, what) => { (p.hi ||= []).push([s.day, what]); if (p.hi.length > 6) p.hi.shift(); };

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
  if (Array.isArray(s.people) && Array.isArray(s.people[0])) s.people = s.people.map(unpack);
  // Cities from before the path start at the chapter their size has earned, so nobody loses what they use.
  if (s.hall === undefined) {
    s.hall = s.day > 2 ? [15, 40, 80, 150, 250, 500].filter((n) => s.people.length >= n).length : 0;
    s.hallDone = {};
    // What an established city already had open stays open: the technologies that gate it now.
    const grant = [...(s.hall >= 1 ? ['highschool', 'trade', 'diplomacy'] : []), ...(s.hall >= 2 ? ['university', 'finance'] : [])];
    if (s.day > 2) s.tech = [...new Set([...(s.tech || []), ...grant])];
    s.lv[HALL_INDEX] = Math.max(s.lv[HALL_INDEX] || 1, hallSize(s.hall));
  }
  delete s.path;
  // 1.16 had made-up companies to invest in; 1.17 replaced them with city shares. Give back what was paid.
  if (s.shares) { s.money += Object.values(s.shares).reduce((a, h) => a + (h.paid || 0), 0); delete s.shares; }
  if (!s.policy) s.policy = { tax: 1, funding: 1, freeTransit: false };
  if (![0, 1, 2].includes(s.policy.property)) s.policy.property = 0;
  s.policy.insured = !!s.policy.insured;
  // Build days began in 1.7; anything older counts as built on day 0.
  if (!Array.isArray(s.bday) || s.bday.length !== N) s.bday = s.grid.map((t) => (B[t]?.cat ? 0 : -1));
  if (!Array.isArray(s.protect)) s.protect = [];
  s.policy.toll = !!s.policy.toll; s.policy.carbon = !!s.policy.carbon;
  if (s.loan && !(s.loan.left > 0)) s.loan = null;
  if (!s.zone) s.zone = new Array(N).fill(0);
  if (!s.wants) s.wants = [];
  if (!s.clock) {
    // Line this city up with the world clock, keeping any time it still has to catch up on.
    const now = Date.now(), due = Math.max(0, Math.floor((now - s.lastTick) / TICK_MS));
    s.lastTick = Math.floor(now / TICK_MS) * TICK_MS - due * TICK_MS;
    s.hour = ((worldHour(now) - due) % HOURS_PER_DAY + HOURS_PER_DAY * 100) % HOURS_PER_DAY;
    s.clock = 1;
  }
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

// People are saved as short arrays to keep saves small; this is the field order.
// New keys go at the end so older saves still unpack. lk: hired by the mayor (kept in that job); nf/nfu: let go from
// building nf until day nfu; xp: years of work, which count as training.
// oc: working in another city on a labour contract until that day.
const PKEYS = ['i', 'f', 'l', 'a', 'h', 'e', 'sp', 'us', 'j', 'jt', 'sc', 'tu', 'hp', 'ill', 'sd', 'm', 'pt', 'pa', 'cs', 'fun', 'st', 'vt', 'gr', 'jy', 'b', 'oj', 'hol', 'hto', 'hcity', 'hi', 'lk', 'nf', 'nfu', 'xp', 'oc'];
const pack = (p) => PKEYS.map((k) => (k === 'm' ? Math.round(p.m * 1000) / 1000 : k === 'sp' || k === 'us' ? Math.round((p[k] || 0) * 10) / 10 : p[k] ?? null));
const unpack = (a) => { const p = {}; PKEYS.forEach((k, n) => { p[k] = a[n]; }); for (const k of ['j', 'sc', 'tu', 'fun']) if (p[k] === null) p[k] = -1; return p; };
export function serialize(s) {
  return JSON.stringify(s, (k, v) => (k.startsWith('_') ? undefined : k === 'people' && Array.isArray(v) ? v.map(pack) : v));
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
  const out = {
    name: s.name, pop: totalPop(s), peakPop: s.peakPop, happiness: Math.round(s.happiness * 100) / 100,
    money: Math.floor(s.money), day: s.day, status: s.status, cityNo: s.cityNo, offer: offer(s),
    season: s.flags?.season?.m || '', growth: s.people.length - (s.flags?.season?.pop ?? s.people.length),
    green: Math.round(greenShare(s) * 100) / 100, air: s.stats?.air ?? 1, riders: s.stats?.riders || 0, tourists: s.stats?.tourists || 0,
    res: Object.fromEntries(TRADE_RES.map((k) => [k, Math.floor(s.res?.[k] || 0)])),
    bld: s.grid.reduce((a, t, i) => a + (B[t]?.cat && s.cond[i] > 0 ? 1 : 0), 0),
    listed: s.listed?.float || 0,
  };
  out.badges = s.status === 'alive' ? BADGES.filter((b) => b.test(out)).map((b) => b.id) : [];
  s._badges = out.badges.length;
  return out;
}

// A compact picture of the city for neighbours to draw: two characters a tile plus the land owned.
export function mapString(s) {
  const uc = underConstruction(s);
  let out = '';
  for (let i = 0; i < N; i++) {
    const t = s.grid[i], c = uc.has(i) ? 0 : t === T.HALL ? 3 : s.cond[i] <= 0 ? 1 : s.cond[i] < 40 ? 2 : 3;
    out += String.fromCharCode(48 + t) + String.fromCharCode(48 + (s.lv[i] || 1) * 4 + c);
  }
  return out + '|' + s.land.map(Number).join('') + (s.terr ? '|' + s.terr : '');
}
export function fromMap(str) {
  const [tiles, landStr = '', terr = ''] = str.split('|');
  const grid = [], cond = [], lv = [], uc = new Set();
  for (let i = 0; i < N; i++) {
    grid.push(tiles.charCodeAt(i * 2) - 48);
    const k = tiles.charCodeAt(i * 2 + 1) - 48, c = k % 4;
    lv.push(Math.max(1, Math.floor(k / 4)));
    cond.push(c === 3 ? 100 : c === 2 ? 30 : c === 1 ? 0 : 0);
    if (c === 0 && grid[i] !== T.EMPTY && grid[i] !== T.RUBBLE) uc.add(i);
  }
  return { grid, cond, lv, uc, land: landStr ? [...landStr].map(Number) : new Array(CHUNKS * CHUNKS).fill(1), terr: terr.length === N ? terr : null };
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
  const cap = HALL_LEVELS[hallLevel(s)]?.land ?? 36;
  if (s.land.filter(Boolean).length >= cap) return { ok: false, reason: `Your town hall must grow to buy more: a ${HALL_LEVELS[hallLevel(s)].name.toLowerCase()} can hold ${cap} parcels`, capped: true };
  const price = landPrice(s);
  if (s.money < price) return { ok: false, reason: `Needs $${price}.`, price };
  return { ok: true, price };
}
// What the plot next door costs, for a council that already has `owned` cities.
export function plotPrice(s, owned = 1) {
  return Math.round(Math.max(PLOT_BUY_MIN, PLOT_BUY_PARCELS * landPrice(s)) * PLOT_BUY_STEP ** Math.max(0, owned - 1));
}

// ---------- resources ----------
export function storeCap(s, uc = underConstruction(s)) {
  let cap = STORE_BASE + (HALL_LEVELS[hallLevel(s)]?.store || 0);
  for (let i = 0; i < N; i++) { const d = B[s.grid[i]]; if (d?.store && active(s, i, uc) && staffing(s, i) > 0) cap += scale(s, i, d.store); }
  return cap;
}
// Tapping a producing building collects its harvest bonus.
export const harvestReady = (s, i) => (s.ready?.[i] || 0) >= HARVEST.min && !!B[s.grid[i]]?.makes && active(s, i);
export function harvest(s, i) {
  if (!harvestReady(s, i)) return { ok: false, reason: 'Nothing to collect yet' };
  const d = B[s.grid[i]], hours = s.ready[i], k = staffing(s, i) * LEVEL.capacity[level(s, i)] * HARVEST.bonus * hours / HOURS_PER_DAY;
  const got = {};
  s.res ||= {};
  for (const [r, n] of Object.entries(d.makes)) { got[r] = Math.max(1, Math.round(n * k)); s.res[r] = (s.res[r] || 0) + got[r]; }
  s.ready[i] = 0;
  s.counters.harvests = (s.counters.harvests || 0) + 1;
  return { ok: true, got };
}

// What the city's buildings make in a day.
export function production(s, uc = underConstruction(s)) {
  const out = Object.fromEntries(Object.keys(RES).map((k) => [k, 0]));
  for (let i = 0; i < N; i++) {
    const d = B[s.grid[i]];
    if (!d?.makes || !active(s, i, uc)) continue;
    const k = staffing(s, i) * LEVEL.capacity[level(s, i)] * (s.grid[i] === T.FARM && hasTech(s, 'vertical') ? 2 : 1);
    for (const [r, n] of Object.entries(d.makes)) out[r] += Math.round(n * k);
  }
  return out;
}
// One day of resources. People eat from every kind of food in stock; what's missing is imported. Water and power
// can't be imported: a shortfall shows up as illness and unhappiness once the town is big enough to need them.
function resourcesDay(s, uc) {
  const res = (s.res ||= {}), pop = s.people.length, prod = production(s, uc), cap = storeCap(s, uc);
  let staffed = 0;
  for (let i = 0; i < N; i++) { const d = B[s.grid[i]]; if (d?.jobs && d.cat && active(s, i, uc) && staffing(s, i) > 0) staffed++; }
  const need = { water: pop * USE.water, power: pop * USE.power + staffed * USE.powerPerBuilding, food: pop * USE.food };
  const short = { water: 0, power: 0 };
  for (const k of ['water', 'power']) {
    const have = (res[k] || 0) + prod[k], used = Math.min(have, need[k]);
    short[k] = Math.round(need[k] - used);
    res[k] = Math.round(Math.min(cap, have - used));
  }
  for (const k of [...FOOD, 'materials']) res[k] = (res[k] || 0) + prod[k];
  const inStock = FOOD.reduce((a, k) => a + res[k], 0), eat = Math.min(inStock, need.food);
  for (const k of FOOD) res[k] = inStock ? res[k] - eat * (res[k] / inStock) : 0;
  const variety = FOOD.filter((k) => prod[k] > 0 || res[k] >= 1).length;
  // Imported food: the cheapest kinds first would be dull, so an even mix.
  const band = (k) => clamp(priceOf(s, k), RES[k].import * EXCHANGE.importBand[0], RES[k].import * EXCHANGE.importBand[1]);
  const imported = Math.round(need.food - eat), avg = FOOD.reduce((a, k) => a + band(k), 0) / FOOD.length;
  const importCost = Math.round(imported * avg);
  let sold = 0;
  for (const k of [...FOOD, 'materials']) {
    if (res[k] > cap) { sold += (res[k] - cap) * priceOf(s, k) * SURPLUS_SALE; res[k] = cap; }
    res[k] = Math.round(res[k] * 10) / 10;
  }
  return { prod, need, short, imported, importCost, sold: Math.round(sold), variety, cap };
}
// ---------- the town hall: how big the city is ----------
// How each objective is checked. `x` has what the city can't know by itself: its alliance and how many cities
// its council runs.
const pathCount = (s, ...types) => s.grid.reduce((a, t, i) => a + (types.includes(t) && s.cond[i] > 0 ? 1 : 0), 0);
const PATH_TESTS = {
  roads: (s) => pathCount(s, T.ROAD, T.XING) >= 10, homes: (s) => pathCount(s, T.HOUSE, T.APARTMENT, T.VILLA) >= 3,
  work: (s) => pathCount(s, T.WORK, T.FACTORY) >= 1, shop: (s) => pathCount(s, T.SHOP) >= 1,
  pop15: (s) => s.people.length >= 15, school: (s) => pathCount(s, T.SCHOOL) >= 1, farm: (s) => pathCount(s, T.FARM) >= 1,
  harvest: (s) => (s.counters.harvests || 0) >= 1,
  pop40: (s) => s.people.length >= 40, utilities: (s) => pathCount(s, T.WATER) >= 1 && pathCount(s, T.POWER, T.SOLAR, T.WIND) >= 1,
  tech1: (s) => (s.tech || []).length >= 1, tech2: (s) => (s.tech || []).length >= 2, tech6: (s) => (s.tech || []).length >= 6, materials: (s) => pathCount(s, T.MATERIALS) >= 1,
  clinic: (s) => pathCount(s, T.CLINIC) >= 1, highschool: (s) => pathCount(s, T.HIGH) >= 1, land3: (s) => (s.counters.land || 0) >= 3, happy60: (s) => s.people.length >= 20 && s.happiness >= 0.6,
  pop60: (s) => s.people.length >= 60, trade1: (s) => (s.counters.traded || 0) >= 1, land: (s) => (s.counters.land || 0) >= 1,
  pop120: (s) => s.people.length >= 120, invest: (s) => !!s.listed || Object.keys(s.holdings || {}).length > 0,
  alliance: (s, x) => !!x?.alliance, link: (s) => (s.links || 0) + (s.railLinks || 0) >= 1 || (s.counters.traded || 0) >= 5,   // no neighbour yet? trading counts
  cities2: (s, x) => (x?.cities || 1) >= 2, pop200: (s) => s.people.length >= 200, uni: (s) => pathCount(s, T.UNI) >= 1, tech4: (s) => (s.tech || []).length >= 4,
  pop500: (s) => s.people.length >= 500, monument: (s) => pathCount(s, T.MONUMENT) >= 1, happy70: (s) => s.people.length >= 100 && s.happiness >= 0.7,
};
export const hallLevel = (s) => s.hall || 0;
// The hall's size on the map follows its level (buildings have three sizes).
const hallSize = (h) => [1, 1, 2, 2, 3, 3, 3][h] || 3;
// What the next level asks for, and how far along the city is.
export function hallState(s, x = {}) {
  const h = hallLevel(s), next = HALL_LEVELS[h + 1];
  if (!next) return { level: h, name: HALL_LEVELS[h].name, next: null, complete: true };
  const done = (s.hallDone ||= {});
  const goals = next.goals.map(([id, text]) => ({ id, text, done: !!done[id] || !!PATH_TESTS[id]?.(s, x) }));
  const res = Object.entries(next.res).map(([k, n]) => ({ k, need: n, have: Math.floor(s.res?.[k] || 0), done: (s.res?.[k] || 0) >= n }));
  const pop = { need: next.pop, have: s.people.length, done: s.people.length >= next.pop };
  return { level: h, name: HALL_LEVELS[h].name, next, goals, res, pop, ready: pop.done && goals.every((g) => g.done) && res.every((r) => r.done), complete: false };
}
// Remember objectives met; when everything's there, the hall upgrades (using the resources).
export function checkHall(s, x = {}) {
  if (s.status !== 'alive') return null;
  const st = hallState(s, x);
  if (st.complete) return null;
  for (const g of st.goals) if (g.done) s.hallDone[g.id] = true;
  if (!st.ready) return null;
  for (const r of st.res) s.res[r.k] -= r.need;
  s.hall = hallLevel(s) + 1;
  s.hallDone = {};
  s.lv[HALL_INDEX] = hallSize(s.hall);
  s._plan = null;
  note(s, 'good', `The town hall has grown: ${s.name} is now a ${HALL_LEVELS[s.hall].name.toLowerCase()}.`);
  return HALL_LEVELS[s.hall];
}
// Is a feature open yet: a technology, or a big enough town hall?
export function unlocked(s, feature) {
  const n = FEATURE_NEEDS[feature];
  if (!n) return true;
  return n.tech ? hasTech(s, n.tech) : hallLevel(s) >= n.hall;
}

// ---------- the exchange: resource prices and city shares ----------
// Smooth noise over the world's days, the same for every player.
const wave = (seed, x) => { const a = Math.floor(x), f = x - a, u = f * f * (3 - 2 * f); return h32(a, seed) * (1 - u) + h32(a + 1, seed) * u; };
const seedOf = (id) => [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
// Today's demand for a resource: it swings a little from day to day, for everyone at once.
export const demandOf = (k, day) => 1 + EXCHANGE.demandSwing * ((wave(seedOf(k), day / 3) * 0.7 + wave(seedOf(k) + 1, day) * 0.3) * 2 - 1);
// Prices from the world: `cities` are plot summaries ({ pop, res }). Scarce things (few days of everyone's needs
// in store) cost more, plentiful ones less; then today's demand.
export function worldPrices(cities, day) {
  const pop = cities.reduce((a, c) => a + (c.status === 'ruins' ? 0 : c.pop || 0), 0), out = {};
  for (const k of TRADE_RES) {
    const supply = cities.reduce((a, c) => a + (c.res?.[k] || 0), 0);
    const cover = supply / Math.max(1, pop * PER_CAPITA[k]);
    const scarcity = clamp(EXCHANGE.coverDays / Math.max(0.3, cover), 0.4, 3);
    out[k] = Math.round(RES[k].import * Math.sqrt(scarcity) * demandOf(k, day) * 100) / 100;
  }
  return out;
}
// The price a city uses today (the world's, once it knows it; the base import price until then).
export const priceOf = (s, k) => s._prices?.[k] ?? RES[k].import;
export function buyResource(s, k, n) {
  if (!TRADE_RES.includes(k) || !(n >= 1)) return { ok: false, reason: 'That can’t be bought' };
  const cost = Math.round(priceOf(s, k) * (1 + EXCHANGE.spread) * n * 100) / 100;
  if (s.money < cost) return { ok: false, reason: `Needs $${Math.ceil(cost)}` };
  s.money -= cost; s.res ||= {}; s.res[k] = (s.res[k] || 0) + n;
  s.counters.traded = (s.counters.traded || 0) + 1;
  return { ok: true, cost };
}
export function sellResource(s, k, n) {
  if (!TRADE_RES.includes(k) || !(n >= 1) || (s.res?.[k] || 0) < n) return { ok: false, reason: `You have ${Math.floor(s.res?.[k] || 0)} in store` };
  const got = Math.round(priceOf(s, k) * (1 - EXCHANGE.spread) * n * 100) / 100;
  s.res[k] -= n; s.money += got;
  s.counters.traded = (s.counters.traded || 0) + 1;
  return { ok: true, got };
}

// What a city is worth, from the figures everyone can see; a share is a thousandth of it.
export function cityValue(c) {
  const res = TRADE_RES.reduce((a, k) => a + (c.res?.[k] || 0) * RES[k].import, 0);
  if (c.status === 'ruins') return 0;
  return Math.max(0, (c.pop || 0) * 60 + (c.peakPop || 0) * 10 + Math.max(0, c.money || 0) * 0.6 + (c.bld || 0) * 35 + res
    + Math.max(0, c.growth || 0) * 40 + (c.happiness || 0) * (c.pop || 0) * 20);
}
export const sharePrice = (c) => Math.max(0.5, Math.round(cityValue(c) / STOCK.shares * 100) / 100);
// Listing your city: sell some of its shares now, for cash.
export function canList(s, n) {
  if (s.listed) return { ok: false, reason: 'Already listed' };
  if (s.people.length < STOCK.minPop) return { ok: false, reason: `Needs ${STOCK.minPop} people` };
  if (!(Number.isInteger(n) && n >= STOCK.listMin && n <= STOCK.listMax)) return { ok: false, reason: `List between ${STOCK.listMin} and ${STOCK.listMax} shares` };
  return { ok: true };
}
export function listCity(s, n) {
  const r = canList(s, n);
  if (!r.ok) return r;
  const price = sharePrice(summary(s)), got = Math.round(n * price * STOCK.ipoDiscount);
  s.listed = { float: n, at: s.day, price };
  s.money += got;
  return { ok: true, got, price };
}
// Shares you hold in other cities: s.holdings[plotId] = { n, paid, city }.
export function buyCityShares(s, plotId, city, n, price) {
  const cost = Math.round(n * price * (1 + STOCK.fee) * 100) / 100;
  if (!(n >= 1)) return { ok: false, reason: 'How many?' };
  if (s.money < cost) return { ok: false, reason: `Needs $${Math.ceil(cost)}` };
  s.money -= cost;
  const h = ((s.holdings ||= {})[plotId] ||= { n: 0, paid: 0, city });
  h.n += n; h.paid += cost; h.city = city;
  return { ok: true, cost };
}
export function sellCityShares(s, plotId, n, price) {
  const h = s.holdings?.[plotId];
  if (!h || h.n < n || !(n >= 1)) return { ok: false, reason: 'You don’t hold that many' };
  const got = Math.round(n * price * (1 - STOCK.fee) * 100) / 100;
  h.paid *= 1 - n / h.n; h.n -= n;
  if (!h.n) delete s.holdings[plotId];
  s.money += got;
  return { ok: true, got };
}

// ---------- the market: escrow, deliveries and debts ----------
// Posting an offer sets its goods (sell) or money (buy) aside until it's taken or cancelled.
export function reserve(s, offer, kind, res, qty, price) {
  if (!['sell', 'buy', 'loan', 'labour'].includes(kind)) return { ok: false, reason: 'Unknown offer' };
  if ((s.escrow || []).length >= MARKET.maxOpen) return { ok: false, reason: `You can have ${MARKET.maxOpen} offers open at once` };
  if (kind === 'loan') {
    if (!(qty >= 100 && qty <= MARKET.maxLoan)) return { ok: false, reason: `Ask for between $100 and $${MARKET.maxLoan.toLocaleString()}` };
    (s.escrow ||= []).push({ offer, kind, res: null, qty: 0, money: 0, amount: qty, repay: Math.round(price), days: 0 });
    return { ok: true };
  }
  if (kind === 'labour') {
    const e = Math.max(0, Math.min(3, res | 0));
    if (!(Number.isInteger(qty) && qty >= 1 && qty <= 40)) return { ok: false, reason: 'Between 1 and 40 workers' };
    if (idleWorkers(s, e).length < qty) return { ok: false, reason: `You have ${idleWorkers(s, e).length} jobless adults with that education` };
    if (!(price > 0 && price <= 30)) return { ok: false, reason: 'A daily fee between $0.01 and $30 a worker' };
    (s.escrow ||= []).push({ offer, kind, res: null, qty, money: 0, e });
    return { ok: true };
  }
  if (!TRADE_RES.includes(res)) return { ok: false, reason: 'That can’t be traded' };
  if (!(Number.isInteger(qty) && qty >= 1 && qty <= MARKET.maxQty)) return { ok: false, reason: `Between 1 and ${MARKET.maxQty}` };
  if (!(price > 0 && price <= MARKET.maxPrice)) return { ok: false, reason: `Price between $0.01 and $${MARKET.maxPrice}` };
  const total = Math.round(qty * price);
  if (kind === 'sell') {
    if ((s.res?.[res] || 0) < qty) return { ok: false, reason: `You have ${Math.floor(s.res?.[res] || 0)} in store` };
    s.res[res] -= qty;
    (s.escrow ||= []).push({ offer, kind, res, qty, money: 0 });
  } else {
    if (s.money < total) return { ok: false, reason: `Needs $${total}` };
    s.money -= total;
    (s.escrow ||= []).push({ offer, kind, res, qty, money: total });
  }
  return { ok: true, total };
}
// A cancelled offer gives back what was set aside; a completed one just clears it.
export function release(s, offer, completed = false) {
  const k = (s.escrow || []).findIndex((e) => e.offer === offer);
  if (k < 0) return null;
  const [e] = s.escrow.splice(k, 1);
  if (!completed) { if (e.res) s.res[e.res] = (s.res[e.res] || 0) + e.qty; s.money += e.money; }
  return e;
}
// Something arriving from another city: money, goods, or both.
export function receive(s, { money = 0, res = null, qty = 0 }) {
  s.counters.traded = (s.counters.traded || 0) + 1;
  if (money) s.money += money;
  if (res && TRADE_RES.includes(res) && qty > 0) { s.res ||= {}; s.res[res] = (s.res[res] || 0) + qty; }
}
// Labour contracts. Hiring: workers from another city fill your empty jobs until the contract ends.
export function hireCrew(s, { n, e, days, from }) { (s.contracts ||= []).push({ n, e, until: s.day + days, from }); s._plan = null; }
// Lending: that many of your jobless adults with the education go to work there; they come back when it ends.
export function idleWorkers(s, e = 0) { return s.people.filter((p) => canWork(p) && p.j < 0 && p.e >= e && !p.hol); }
export function sendCrew(s, n, e, days) {
  const crew = idleWorkers(s, e).slice(0, n);
  for (const p of crew) { p.oc = s.day + days; remember(s, p, 'Went to work in another city on a contract'); }
  s._plan = null;
  return crew.length;
}

// Loans between cities: the borrower's game repays on the due day (and keeps trying if it can't).
export function addDebt(s, debt) { (s.debts ||= []).push({ ...debt, late: 0 }); }
export function dueDebts(s) { return (s.debts || []).filter((d) => s.day >= d.due && s.money >= d.repay); }
export function payDebt(s, offer) {
  const k = (s.debts || []).findIndex((d) => d.offer === offer);
  if (k < 0) return null;
  const [d] = s.debts.splice(k, 1);
  s.money -= d.repay;
  return d;
}

export const resourceStock = (s) => ({ ...Object.fromEntries(Object.keys(RES).map((k) => [k, 0])), ...(s.res || {}) });

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
// Power and water. Small towns get by without; from 25 people, unpowered buildings work at 60%.
export function utilities(s) {
  const need = s.flags?.utilSince !== undefined && s.day - s.flags.utilSince >= 5;
  const power = new Set(), water = new Set();
  const src = [];
  for (let i = 0; i < N; i++) { const d = B[s.grid[i]]; if ((d?.power || d?.water) && active(s, i) && staffing(s, i) > 0) src.push(i); }
  for (let i = 0; i < N; i++) {
    if (!B[s.grid[i]]?.cat && s.grid[i] !== T.HALL) continue;
    for (const j of src) if (dist1(i, j) <= B[s.grid[j]].supply + (hasTech(s, 'smartgrid') ? 3 : 0)) (B[s.grid[j]].power ? power : water).add(i);
  }
  if (s.flags?.blackout > 0) power.clear();
  return { need, power, water };
}
const utilK = (s, i) => (s._util?.need && B[s.grid[i]]?.cat && B[s.grid[i]].cat !== 'utility' && !s._util.power.has(i) ? 0.6 : 1);

// Air quality, 0 (smog) to 1 (clean). Fossil power and factories foul it, cars add a little, trees and farms help.
export function airQuality(s, carTrips = s._plan ? s._plan.trips.filter((t) => t.mode === 'car').length : 0) {
  let dirt = 0, fresh = 0;
  for (let i = 0; i < N; i++) {
    const d = B[s.grid[i]];
    if (!d || s.cond[i] <= 0) continue;
    if (d.smog && !(d.fossil && hasTech(s, 'fusion'))) dirt += d.smog * (s.flags?.robots && s.grid[i] === T.FACTORY ? 1.2 : 1);
    if (d.fresh) fresh += d.fresh;
    if (s.grid[i] === T.PARK) fresh += 0.01;
  }
  if (s.policy?.carbon) dirt *= 0.8;
  const cars = carTrips * (s.flags?.carfree > 0 ? 0.4 : 1) * (s.flags?.fourday > 0 ? 0.8 : 1);
  return clamp(1 - dirt - cars * 0.0015 + Math.min(0.15, fresh));
}
// Share of power capacity that comes from clean sources (1 when the town needs none yet).
export function greenShare(s) {
  let clean = 0, all = 0;
  for (let i = 0; i < N; i++) { const d = B[s.grid[i]]; if (d?.power && s.cond[i] > 0) { all += d.supply; if (!d.fossil) clean += d.supply; } }
  return all ? clean / all : 1;
}

// ---------- terrain ----------
// Rivers, coast and hills come from the plot's place on the master map, so they flow on across plot edges.
// A city keeps its own copy (s.terr, one character a tile) so buildings from before terrain existed stay dry.
const hv = (x, y, seed) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hv(xi, yi, seed), b = hv(xi + 1, yi, seed), c = hv(xi, yi + 1, seed), d = hv(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, seed) => vnoise(x, y, seed) * 0.65 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.35;
const worldSeed = (world = 'public') => [...String(world)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);
export function terrainFor(px, py, world = 'public') {
  const S = PLOT + GAP, seed = worldSeed(world), out = new Array(N).fill(0), seaV = [];
  let water = 0;
  for (let i = 0; i < N; i++) {
    const wx = px * S + (i % PLOT), wy = py * S + ((i / PLOT) | 0);
    const sea = fbm(wx / 80, wy / 80, seed + 11), river = Math.abs(fbm(wx / 34, wy / 34, seed + 23) - 0.5);
    seaV.push([sea, i]);
    if (sea < TERRAIN.sea || river < TERRAIN.river) { out[i] = 2; water++; }
    else if (fbm(wx / 11, wy / 11, seed + 37) > TERRAIN.hills) out[i] = 1;
  }
  // No plot is mostly sea: give back the least-watery tiles until it's playable.
  if (water > N * TERRAIN.maxWater) for (const [, i] of seaV.sort((a, b) => b[0] - a[0])) { if (water <= N * TERRAIN.maxWater) break; if (out[i] === 2) { out[i] = 0; water--; } }
  // The starting 8×8 round the town hall is always dry and flat.
  for (const c of START_CHUNKS) for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) out[(((c / CHUNKS) | 0) * CHUNK + y) * PLOT + (c % CHUNKS) * CHUNK + x] = 0;
  return out.join('');
}
// Give a city its terrain once. Anything already built stays on dry land.
export function ensureTerrain(s, px, py, world) {
  if (typeof s.terr === 'string' && s.terr.length === N) return false;
  const t = [...terrainFor(px, py, world)];
  for (let i = 0; i < N; i++) if (s.grid[i] !== T.EMPTY && t[i] === '2') t[i] = '0';
  s.terr = t.join('');
  return true;
}
export const terrainAt = (s, i) => (s.terr ? s.terr.charCodeAt(i) - 48 : 0);
const nearWater = (s, i) => neighbours(i).some((n) => terrainAt(s, n) === 2);
// What a tile costs to build on: bridges over water, extra for hills.
export function tileCost(s, i, type) {
  const base = Math.round(B[type].cost * (hasTech(s, 'greenconcrete') ? 0.9 : 1)), ter = i >= 0 ? terrainAt(s, i) : 0;
  if (ter === 2) return Math.round(base * TERRAIN.bridge);
  if (ter === 1) return Math.round(base * TERRAIN.hill);
  return base;
}

// Materials a building needs, and what it costs: the price includes buying them in, less MAT_BUY for each load from your store.
export const matCost = (type) => (B[type]?.cost ? Math.max(1, Math.round(B[type].cost * MAT_PER_COST)) : 0);
export function buildPrice(s, i, type) {
  const mat = matCost(type), use = Math.min(Math.floor(s.res?.materials || 0), mat), bought = mat - use;
  const base = type === T.XING ? B[type].cost : tileCost(s, i, type);
  return { money: Math.max(Math.round(base / 2), base - use * MAT_BUY), mat, use, bought, base };
}

// Land value, 0..1 per tile. Parks, services, transit and clean air raise it; noise lowers it.
// byType: active buildings by type (from plan). Cheap enough to redo every plan.
export function landValue(s, byType, stops = [], air = 1) {
  const v = new Float32Array(N);
  const near = (list, r, amt, staffed) => {
    for (const f of list || []) {
      if (staffed && !(staffing(s, f) > 0)) continue;
      const fx = f % PLOT, fy = (f / PLOT) | 0;
      for (let y = Math.max(0, fy - r); y <= Math.min(PLOT - 1, fy + r); y++) for (let x = Math.max(0, fx - r); x <= Math.min(PLOT - 1, fx + r); x++) {
        const d = Math.abs(x - fx) + Math.abs(y - fy);
        if (d <= r) v[y * PLOT + x] += amt * (1 - d / (r + 1));
      }
    }
  };
  for (let i = 0; i < N; i++) v[i] = 0.25 + 0.15 * air + (terrainAt(s, i) === 1 ? 0.08 : 0);
  if (s.terr) for (let i = 0; i < N; i++) if (terrainAt(s, i) === 2) {
    const fx = i % PLOT, fy = (i / PLOT) | 0;
    for (let y = Math.max(0, fy - 2); y <= Math.min(PLOT - 1, fy + 2); y++) for (let x = Math.max(0, fx - 2); x <= Math.min(PLOT - 1, fx + 2); x++) { const j = y * PLOT + x; if (terrainAt(s, j) !== 2) v[j] = Math.max(v[j], 0.25 + 0.15 * air) + 0.05; }
  }
  near(byType.get(T.PARK), 4, 0.22);
  near(byType.get(T.PLAYGROUND), 3, 0.08);
  for (const t of [T.POLICE, T.FIRE]) near(byType.get(t), 8, 0.1, true);
  for (const t of [T.SCHOOL, T.HIGH, T.CLINIC, T.HOSPITAL, T.LIBRARY]) near(byType.get(t), 6, 0.07, true);
  for (const t of [T.SHOP, T.CAFE, T.FARM]) near(byType.get(t), 4, 0.05);
  for (const t of [T.MUSEUM, T.POOL, T.CINEMA]) near(byType.get(t), 5, 0.08, true);
  near(stops, 4, 0.12);
  const heritage = [];
  for (let i = 0; i < N; i++) if (isHistoric(s, i)) heritage.push(i);
  near(heritage, 2, 0.05);
  near(byType.get(T.MONUMENT), 5, 0.2);
  near(byType.get(T.STATION), 5, 0.12, true);
  for (const [t, list] of byType) if (B[t]?.pollution) near(list, B[t].pollution >= 2 ? 4 : 1, -0.25 * (B[t].pollution >= 2 ? 1 : 0.4));
  for (let i = 0; i < N; i++) v[i] = clamp(v[i]);
  return v;
}
// Who feels the rent: households with little schooling living on dear land.
export const squeezed = (s, plan, p) => !!plan?.value && plan.value[p.h] > RENT_SQUEEZE && p.e <= 1 && p.a >= ADULT;

// ---------- research and eras ----------
export const hasTech = (s, id) => !!s.tech?.includes(id);
export function eraOf(s) { let e = ERAS[0]; for (const x of ERAS) if ((s.peakPop || 0) >= x.pop) e = x; return e; }
export function canResearch(s, id) {
  const t = TECH.find((x) => x.id === id);
  if (!t || hasTech(s, id)) return { ok: false, reason: 'Already done.' };
  if (t.needs && !hasTech(s, t.needs)) return { ok: false, reason: `Needs ${TECH.find((x) => x.id === t.needs).name} first.` };
  if ((s.rp || 0) < t.cost) return { ok: false, reason: `Needs ${t.cost} research points.` };
  return { ok: true };
}
export function research(s, id) {
  const r = canResearch(s, id);
  if (!r.ok) return r;
  const t = TECH.find((x) => x.id === id);
  s.rp -= t.cost; (s.tech ||= []).push(id); s._plan = null;
  note(s, 'good', `Research complete: ${t.name}. ${t.text}`);
  return { ok: true };
}

// ---------- residents' character ----------
export const traitOf = (p) => TRAITS[Math.floor(h32(p.i, 77) * TRAITS.length) % TRAITS.length].id;
// A household has a pet if the eldest member's id says so. Pets arrive and leave with families.
export const hasPet = (s, members) => members.length > 0 && h32(Math.min(...members.map((p) => p.i)), 91) < PET_SHARE;

// Rubbish and sewage are capacity, not reach: every resident makes some, and the city needs enough plants.
export function wasteStatus(s, uc = underConstruction(s)) {
  const pop = s.people.length;
  let waste = 0, sewage = 0;
  for (let i = 0; i < N; i++) {
    const d = B[s.grid[i]];
    if (!d || !(d.waste || d.sewage) || !active(s, i, uc) || !(staffing(s, i) > 0)) continue;
    if (d.waste) waste += scale(s, i, d.waste);
    if (d.sewage) sewage += scale(s, i, d.sewage);
  }
  // Like power and water, a town gets 5 days' warning once it grows past each line.
  const due = (k) => s.flags?.[k] !== undefined && s.day - s.flags[k] >= 5;
  const needWaste = pop >= WASTE_POP && due('wasteSince'), needSewage = pop >= SEWAGE_POP && due('sewageSince');
  return {
    waste: needWaste ? clamp(waste / pop) : 1, sewage: needSewage ? clamp(sewage / pop) : 1,
    wasteCap: waste, sewageCap: sewage, needWaste, needSewage,
    warnWaste: pop >= WASTE_POP && !needWaste && waste < pop, warnSewage: pop >= SEWAGE_POP && !needSewage && sewage < pop,
  };
}

// ---------- heritage ----------
export const isHistoric = (s, i) => !!B[s.grid[i]]?.cat && s.cond[i] > 0 && s.bday?.[i] >= 0 && s.day - s.bday[i] >= HISTORIC_DAYS && !s.queue.some((q) => q.i === i && !q.up);
export const isProtected = (s, i) => s.protect?.includes(i) && isHistoric(s, i);
export function setProtected(s, i, on) {
  if (!isHistoric(s, i)) return { ok: false, reason: 'Only historic buildings can be protected.' };
  s.protect = (s.protect || []).filter((x) => x !== i);
  if (on) s.protect.push(i);
  s._plan = null;
  return { ok: true };
}
const hurt = (s, amt) => amt * (s.policy?.insured ? INSURANCE.damage : 1);

// ---------- selling land back ----------
export function canSellLand(s, c) {
  if (!s.land[c]) return { ok: false, reason: 'You don’t own that parcel.' };
  if (START_CHUNKS.includes(c)) return { ok: false, reason: 'The land around the town hall can’t be sold.' };
  const x0 = (c % CHUNKS) * CHUNK, y0 = ((c / CHUNKS) | 0) * CHUNK;
  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) if (s.grid[idx(x, y)] !== T.EMPTY) return { ok: false, reason: 'Clear everything off the parcel first.' };
  return { ok: true, price: Math.round(landPrice(s) / LAND_STEP * LAND_RESALE) };
}
export function sellLand(s, c) {
  const r = canSellLand(s, c);
  if (!r.ok) return r;
  s.land[c] = 0; s.money += r.price;
  const x0 = (c % CHUNKS) * CHUNK, y0 = ((c / CHUNKS) | 0) * CHUNK;
  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) if (s.zone) s.zone[idx(x, y)] = 0;
  note(s, 'info', `Sold a parcel of land back to the region for $${r.price}.`);
  return r;
}

// ---------- city bonds ----------
export function canIssueBonds(s, amount) {
  if (s.bond?.left > 0) return { ok: false, reason: 'Pay off the current bonds first.' };
  if (s.people.length < BONDS.minPop) return { ok: false, reason: `Bonds need at least ${BONDS.minPop} residents to buy them.` };
  const max = s.people.length * BONDS.perHead;
  if (!(amount > 0) || amount > max) return { ok: false, reason: `Your residents can lend up to $${max}.` };
  return { ok: true, max };
}
export function issueBonds(s, amount) {
  const r = canIssueBonds(s, amount);
  if (!r.ok) return r;
  const owe = Math.round(amount * (1 + BONDS.rate));
  s.bond = { left: owe, daily: Math.ceil(owe / BONDS.days), missed: 0 };
  s.money += amount;
  note(s, 'info', `Residents bought $${amount} of city bonds. $${owe} is paid back over ${BONDS.days} days.`);
  return { ok: true, owe };
}

// ---------- the bank ----------
// Rating from how the city has been run: money coming in, bills paid, and any loan already owed.
export function creditRating(s) {
  const hist = s.history.slice(-7);
  const net = hist.length ? hist.reduce((a, h) => a + (h.net || 0), 0) / hist.length : 0;
  let score = 2;
  if (net > 20) score++;
  if (net < 0) score--;
  if (s.unpaidDays) score -= 2;
  if ((s.loan?.missed || 0) > 0) score -= s.loan.missed > 2 ? 2 : 1;
  if (s.people.length < 10) score--;
  return score >= 3 ? 'A' : score === 2 ? 'B' : score === 1 ? 'C' : 'D';
}
export function canBorrow(s, amount) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (s.loan?.left > 0) return { ok: false, reason: 'Pay off your current loan first.' };
  const r = creditRating(s), terms = LOANS[r];
  if (!terms.max) return { ok: false, reason: `The bank won’t lend with a ${r} rating. Balance the budget and pay your bills first.` };
  if (!(amount > 0) || amount > terms.max) return { ok: false, reason: `With a ${r} rating you can borrow up to $${terms.max}.` };
  return { ok: true, rating: r, rate: terms.rate };
}
export function borrow(s, amount) {
  const r = canBorrow(s, amount);
  if (!r.ok) return r;
  s.loan = { left: amount, taken: amount, rate: r.rate, day: s.day, missed: 0 };
  s.money += amount;
  note(s, 'info', `Borrowed $${amount} at ${(r.rate * 100).toFixed(1)}% a day. It’s paid back over ${LOAN_DAYS} days.`);
  return { ok: true, ...r };
}
export function repay(s, amount = s.loan?.left || 0) {
  if (!(s.loan?.left > 0)) return { ok: false, reason: 'You don’t owe anything.' };
  const pay = Math.min(Math.floor(amount), s.loan.left, Math.floor(s.money));
  if (pay <= 0) return { ok: false, reason: 'Not enough money to pay anything off.' };
  s.money -= pay; s.loan.left -= pay;
  if (s.loan.left <= 0) { s.loan = null; s.flags.repaid = 1; note(s, 'good', 'The loan is paid off.'); }
  return { ok: true, paid: pay };
}
const scale = (s, i, n) => Math.floor(n * condFactor(s, i) * LEVEL.capacity[level(s, i)] * utilK(s, i));
export const homeCap = (s, i) => scale(s, i, B[s.grid[i]].homes || 0);
export function jobSlots(s, i) { return (B[s.grid[i]].jobs || []).map(([, , n]) => scale(s, i, n)); }
export function capacity(s, i, field) {
  const d = B[s.grid[i]];
  if (field === 'homes') return homeCap(s, i);
  if (field === 'jobs') return jobSlots(s, i).reduce((a, b) => a + b, 0);
  if (field === 'seats') return d.school ? scale(s, i, d.school.seats) : 0;
  if (field === 'visits') return d.visits ? scale(s, i, d.visits.n) : 0;
  if (field === 'care') return d.care ? scale(s, i, d.care.n * (hasTech(s, 'telemed') ? 1.3 : 1)) : 0;
  if (field === 'serves') return scale(s, i, (d.serves || 0) * (s.grid[i] === T.FARM && hasTech(s, 'vertical') ? 2 : 1));
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
  const n = s.people.filter((p) => p.j === i && !p.oj).length + (s._cfill?.get(i) || 0);
  return n ? clamp(0.4 + 0.6 * n / slots) : 0;
}
const isBuilder = (s, p) => p.j >= 0 && !p.oj && (s.grid[p.j] === T.HALL || s.grid[p.j] === T.YARD) && p.jt === 0;
const canWork = (p) => p.a >= ADULT && p.a < RETIRE && p.sc < 0 && !p.st && p.ill < 3 && !p.oc;

// ---------- hiring and firing ----------
const openSlot = (s, i, k) => jobSlots(s, i)[k] - s.people.filter((p) => p.j === i && p.jt === k && !p.oj).length;
// Put a resident in a job at building i (job k). They stay there until let go.
export function hire(s, pid, i, k) {
  const p = s.people.find((x) => x.i === pid), d = B[s.grid[i]];
  if (!p || !d?.jobs?.[k] || !active(s, i)) return { ok: false, reason: 'No such job' };
  if (!canWork(p)) return { ok: false, reason: `${personName(p)} can’t work right now` };
  if (p.e < d.jobs[k][1]) return { ok: false, reason: `Needs ${EDU[d.jobs[k][1]].toLowerCase()}` };
  if (p.j === i && p.jt === k && !p.oj) return { ok: false, reason: 'Already works there' };
  if (openSlot(s, i, k) <= 0) return { ok: false, reason: 'No open job there' };
  if (p.j >= 0 && !p.oj) remember(s, p, `Left a job as ${B[s.grid[p.j]].jobs[p.jt][0].toLowerCase()}`);
  Object.assign(p, { j: i, jt: k, oj: null, lk: 1, nf: null, nfu: null });
  remember(s, p, `Hired as ${d.jobs[k][0].toLowerCase()}`);
  s._plan = null;
  return { ok: true };
}
// Who could take job k at building i: working-age residents with the education, not already doing it. Jobless first.
export function candidates(s, i, k) {
  const need = B[s.grid[i]]?.jobs?.[k]?.[1] ?? 9;
  return s.people.filter((p) => canWork(p) && p.e >= need && !(p.j === i && p.jt === k && !p.oj))
    .sort((a, b) => (a.j >= 0) - (b.j >= 0) || a.e - b.e);
}
// Let someone go. They look for other work, but not back at the same place for a few days.
export function fire(s, pid) {
  const p = s.people.find((x) => x.i === pid);
  if (!p || p.j < 0 || p.oj) return { ok: false, reason: 'They don’t work in this city' };
  if (isBuilder(s, p) && s.people.filter((x) => isBuilder(s, x)).length <= 1) return { ok: false, reason: 'The town needs at least one builder' };
  remember(s, p, `Let go as ${B[s.grid[p.j]].jobs[p.jt][0].toLowerCase()}`);
  Object.assign(p, { nf: p.j, nfu: s.day + FIRED_DAYS, j: -1, lk: 0, m: clamp(p.m - 0.1) });
  s._plan = null;
  return { ok: true };
}
// Bring in a qualified worker from outside for an open job. They need a home with room.
export function recruitCost(s, i, k) { return RECRUIT_COST[B[s.grid[i]]?.jobs?.[k]?.[1] ?? 0]; }
export function recruit(s, i, k, rng = Math.random) {
  const d = B[s.grid[i]];
  if (!d?.jobs?.[k] || !active(s, i)) return { ok: false, reason: 'No such job' };
  if (openSlot(s, i, k) <= 0) return { ok: false, reason: 'No open job there' };
  const cost = recruitCost(s, i, k);
  if (s.money < cost) return { ok: false, reason: `Needs $${cost}` };
  const byHome = new Map();
  for (const p of s.people) byHome.set(p.h, (byHome.get(p.h) || 0) + 1);
  let home = -1;
  for (let h = 0; h < N; h++) if (isHome(s.grid[h]) && active(s, h) && homeCap(s, h) - (byHome.get(h) || 0) >= 1) { home = h; break; }
  if (home < 0) return { ok: false, reason: 'No home with room for them' };
  s.money -= cost;
  const p = person(s, { f: Math.floor(rng() * FIRST.length), l: Math.floor(rng() * SURNAMES.length), a: 24 + Math.floor(rng() * 20), h: home, e: d.jobs[k][1], sp: 10, j: i, jt: k, lk: 1 });
  remember(s, p, `Moved here to work as ${d.jobs[k][0].toLowerCase()}`);
  note(s, 'good', `${personName(p)} moved here to work as ${d.jobs[k][0].toLowerCase()}.`);
  s.counters.arrivals = (s.counters.arrivals || 0) + 1;
  s._plan = null;
  return { ok: true, cost, pid: p.i };
}

export function totals(s, uc = underConstruction(s)) {
  const t = { homes: 0, jobs: 0, seats: {}, serves: 0, upkeep: 0, roads: 0, counts: {}, upkeepBy: {} };
  for (let i = 0; i < N; i++) {
    const type = s.grid[i];
    if (type === T.EMPTY || type === T.RUBBLE || uc.has(i)) continue;
    const d = B[type];
    t.counts[type] = (t.counts[type] || 0) + 1;
    if (!d.cat && type !== T.HALL) { t.upkeep += d.upkeep; t.upkeepBy[type] = (t.upkeepBy[type] || 0) + d.upkeep; if (type === T.ROAD) t.roads++; continue; }
    if (condFactor(s, i) === 0) continue;
    const up = s.zone?.[i] ? 0 : d.upkeep * LEVEL.upkeep[level(s, i)];
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
    if (isRoad(t) || t === T.HALL || (!cars && t === T.PATH)) ok[i] = 1;
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
  s._util = null;
  s._util = utilities(s);
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
    if (!slots || !canWork(p) || !homeOk(p.h) || (filled.get(key) || 0) >= slots[p.jt] || p.e < B[t].jobs[p.jt][1]) { p.j = -1; p.lk = 0; continue; }
    filled.set(key, (filled.get(key) || 0) + 1);
  }

  // School: daycare under 5, primary 5–11, high 12–17, university for keen high school graduates.
  const stageOf = (p) => (p.a < 5 ? 'daycare' : p.a < 12 ? 'primary' : p.a < ADULT ? 'high' : p.e === 2 && p.a <= 26 && p.j < 0 && h32(p.i, 3) < 0.7 ? 'uni' : null);
  const seatsUsed = new Map();
  const seatsOf = (i) => Math.floor(capacity(s, i, 'seats') * (staffing(s, i) > 0 ? 1 : 0) * Math.min(1, s.policy?.funding || 1));
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
  const seekers = s.people.filter((p) => canWork(p) && homeOk(p.h) && (p.j < 0 || (!p.oj && !p.lk && h32(p.i, s.day + 99) < 0.3
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
        if (p.nf === i && s.day < (p.nfu || 0)) continue;   // let go from here recently
        const d = mapFor(p.h).d(i);
        if (d < 0 || d > 26) continue;
        const score = d - def.jobs[k][1] * 6;   // prefer jobs that use your education
        if (score < bd) { bd = score; best = [i, k]; }
      }
    }
    if (best && p.j < 0 && !(p.hi || []).some((h) => h[1].startsWith('First job'))) remember(s, p, `First job: ${B[s.grid[best[0]]].jobs[best[1]][0].toLowerCase()}`);
    if (best) {
      if (p.j >= 0) filled.set(slotKey(p.j, p.jt), (filled.get(slotKey(p.j, p.jt)) || 1) - 1);
      p.j = best[0]; p.jt = best[1]; filled.set(slotKey(...best), (filled.get(slotKey(...best)) || 0) + 1);
      unstaffed.delete(best[0]);
    }
  }
  // Workers on contract from other cities fill jobs nobody here has taken, if they have the education.
  s._cfill = new Map();
  const crews = (s.contracts || []).filter((k) => k.until > s.day).map((k) => ({ n: k.n, e: k.e }));
  for (const i of jobBuildings) {
    const slots = jobSlots(s, i), def = B[s.grid[i]];
    for (let k = 0; k < slots.length; k++) {
      let open = slots[k] - (filled.get(slotKey(i, k)) || 0);
      for (const c of crews) {
        if (open <= 0) break;
        if (c.n <= 0 || c.e < def.jobs[k][1]) continue;
        const take = Math.min(open, c.n);
        c.n -= take; open -= take;
        s._cfill.set(i, (s._cfill.get(i) || 0) + take);
      }
    }
  }

  // Public transport. Stations must touch the railway; buses need a staffed depot and at least two stops.
  const railNet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if ((isRail(s.grid[i]) && !uc.has(i)) || (s.grid[i] === T.STATION && active(s, i, uc))) railNet[i] = 1;
  const railComp = new Int16Array(N).fill(-1);
  let comps = 0;
  for (let i = 0; i < N; i++) {
    if (!railNet[i] || railComp[i] >= 0) continue;
    const q = [i]; railComp[i] = comps;
    for (let k = 0; k < q.length; k++) for (const v of neighbours(q[k])) if (railNet[v] && railComp[v] < 0) { railComp[v] = comps; q.push(v); }
    comps++;
  }
  const stations = (byType.get(T.STATION) || []).filter((i) => staffing(s, i) > 0 && neighbours(i).some((n) => isRail(s.grid[n]) && railNet[n]));
  const drivers = s.people.filter((p) => p.j >= 0 && s.grid[p.j] === T.DEPOT && !p.ill).length;
  const stops = drivers > 0 && (byType.get(T.STOP) || []).length >= 2 ? byType.get(T.STOP) : [];
  const busCap = drivers * BUS_SEATS;
  const metros = (byType.get(T.METRO) || []).filter((i) => staffing(s, i) > 0);
  const metroCap = metros.length >= 2 ? metros.reduce((a, i) => a + scale(s, i, B[T.METRO].seats), 0) : 0;
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
  const careScale = (careTotal ? Math.max(0, 1 - (incoming.care || 0) / careTotal) : 1) * (s.policy?.funding || 1);
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
  const wx = weather(cityDay(s));
  const funScale = (funTotal ? Math.max(0, 1 - (incoming.fun || 0) / funTotal) : 1) * (wx === 'snow' ? 0.6 : wx === 'rain' ? 0.75 : 1) * (s.policy?.funding || 1);
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
  const snowK = weather(cityDay(s)) === 'snow' ? 0.75 : 1;
  // Busy junctions are bottlenecks unless they have lights or a roundabout.
  for (let i = 0; i < N; i++) {
    if (!carNet[i]) continue;
    const t = s.grid[i], ways = neighbours(i).filter((n) => carNet[n]).length;
    const k = t === T.HALL ? HALL_CAP / ROAD_CAP : t === T.XING ? 0.8 : t === T.LIGHTS ? 1.2 : t === T.ROUNDABOUT ? 1.45 : ways >= 3 ? 0.8 : 1;
    cap[i] = ROAD_CAP * k * snowK * (hasTech(s, 'trafficai') ? 1.2 : 1);
  }
  const trips = [];
  const time = (a, b, k) => a + h32(k, s.day) * (b - a);
  // Drivers avoid busy roads: each car route is found with the traffic already on the roads.
  const carRoute = (h, to) => {
    const goal = new Set(doorsteps(s, carNet, to));
    if (!goal.size) return null;
    const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
    const push = (d, v) => { heap.push([d, v]); let k = heap.length - 1; while (k > 0) { const j = (k - 1) >> 1; if (heap[j][0] <= heap[k][0]) break; [heap[j], heap[k]] = [heap[k], heap[j]]; k = j; } };
    const popMin = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    for (const st of doorsteps(s, carNet, h)) { dist[st] = 1; push(1, st); }
    while (heap.length) {
      const [d, u] = popMin();
      if (d > dist[u]) continue;
      if (goal.has(u)) { const path = []; for (let v = u; v !== -1; v = prev[v]) path.push(v); return path.reverse(); }
      for (const v of neighbours(u)) {
        if (!carNet[v]) continue;
        const nd = d + 1 + 2 * (cap[v] ? load[v] / cap[v] : 0);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); }
      }
    }
    return null;
  };
  const riders = { bus: 0, train: 0, metro: 0 }, stopUse = new Map(), railPairs = new Map();
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
      if ((mode === 'car' || mode === 'bike') && riders.metro < metroCap) {
        // The metro: walk to the nearest station, ride underground, walk out at the other end.
        const ma = within(p.h, metros, B[T.METRO].catchment);
        const mb = ma >= 0 ? metros.filter((x) => x !== ma).find((x) => { const dd = distFrom(x, to); return dd >= 0 && dd <= B[T.METRO].catchment; }) : undefined;
        if (mb !== undefined) {
          const toA = route(m.w, walkNet, s, ma), fromB = route(mapFrom(mb).w, walkNet, s, to);
          if (toA && fromB) { mode = 'metro'; path = [...toA, ...fromB]; via = [ma, mb]; riders.metro++; }
        }
      }
      if ((mode === 'car' || mode === 'bike') && stops.length && riders.bus < busCap) {
        const sa = within(p.h, stops, B[T.STOP].catchment);
        const sb = sa >= 0 ? stops.filter((x) => x !== sa).find((x) => { const dd = distFrom(x, to); return dd >= 0 && dd <= B[T.STOP].catchment; }) : undefined;
        const cp = sb !== undefined ? route(m.c, carNet, s, to) : null;
        if (cp) { mode = 'bus'; path = cp; via = [sa, sb]; riders.bus++; for (const x of via) stopUse.set(x, (stopUse.get(x) || 0) + 1); }
      }
    }
    if (mode === 'car') {
      const cp = carRoute(p.h, to);
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
    if (all((d) => !!d.pollution).some((f) => dist1(f, h) <= (B[s.grid[f]].pollution >= 2 ? 3 : 1))) pollution.add(h);
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
    air: airQuality(s, carTrips),
  };
  const ws = wasteStatus(s, uc);
  needs.waste = Math.min(ws.waste, ws.sewage);
  for (const p of s.people) if (away(p) && p.hto && byId[p.hto]) (out[p.hto] ||= { fun: 0, care: 0, shop: 0, school: 0, tourists: 0 }).tourists++;

  // Routes the vehicles drive: trains between stations and out to the plot edge; one bus loop through every stop.
  const railEnds = [...stations];
  for (let i = 0; i < N; i++) {
    const x = i % PLOT, y = (i / PLOT) | 0;
    if (isRail(s.grid[i]) && railNet[i] && (x === 0 || y === 0 || x === PLOT - 1 || y === PLOT - 1) && stations.length === 1 && !(s.railLinks > 0) && stations.some((st) => railComp[st] === railComp[i])) railEnds.push(i);
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
  const value = landValue(s, byType, stops, needs.air);
  const pets = new Set();
  for (const [h, m] of byHome) if (hasPet(s, m)) pets.add(h);
  const vets = byType.get(T.VET) || [];
  const vetFor = new Set([...pets].filter((h) => vets.some((v) => staffing(s, v) > 0 && dist1(v, h) <= B[T.VET].radius)));
  const p = {
    value, pets, vetFor, waste: ws,
    load, cap, trips, needs, careFor, shopFor, pollution, parks, police, byHome, served,
    employmentRate: needs.jobs, failedTrips: Math.round(carTrips - carOk), day: s.day,
    riders, stopUse, stations, trainLines, busLoop, drivers, busCap, metros, metroCap, outCap, outUsed, out,
  };
  s._plan = p;
  return p;
}

// ---------- player actions ----------

export function availability(s, type) {
  const d = B[type];
  if (d.research && !hasTech(s, d.research)) return { ok: false, locked: true, reason: `Needs the ${TECH.find((x) => x.id === d.research).name} research` };
  if (d.minPop && totalPop(s) < d.minPop) return { ok: false, locked: true, reason: `Needs ${d.minPop} people` };
  if (d.needs && !s.grid.some((t, i) => t === d.needs && active(s, i))) return { ok: false, locked: true, reason: `Needs a ${B[d.needs].name.toLowerCase()} first` };
  const cost = Math.round(d.cost * (hasTech(s, 'greenconcrete') ? 0.9 : 1));
  if (s.money < cost) return { ok: false, reason: `Needs $${cost}` };
  return { ok: true };
}

const crossing = (s, i, type) => (type === T.RAIL && s.grid[i] === T.ROAD) || (type === T.ROAD && s.grid[i] === T.RAIL);
export function canPlace(s, i, type) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen. Rebuild to keep playing.' };
  if (i < 0 || i >= N) return { ok: false, reason: 'Outside your plot.' };
  if (!owns(s, i)) return { ok: false, reason: 'You don’t own this land yet. Buy it first.' };
  if (type === T.LIGHTS || type === T.ROUNDABOUT) {
    if (s.grid[i] !== T.ROAD || s.queue.some((q) => q.i === i)) return { ok: false, reason: 'Put it on a finished road junction.' };
    if (neighbours(i).filter((n) => isRoad(s.grid[n]) || s.grid[n] === T.HALL).length < 3) return { ok: false, reason: 'Only junctions (three or four roads meeting) need this.' };
    return s.money >= B[type].cost ? { ok: true } : { ok: false, reason: `Needs $${B[type].cost}.` };
  }
  if (crossing(s, i, type)) {
    if (s.queue.some((q) => q.i === i)) return { ok: false, reason: 'Wait for the builders to finish here.' };
    return s.money >= B[T.XING].cost ? { ok: true } : { ok: false, reason: `A level crossing needs $${B[T.XING].cost}.` };
  }
  if (s.grid[i] === T.RUBBLE) return { ok: false, reason: 'Clear the rubble first.' };
  if (s.grid[i] !== T.EMPTY) return { ok: false, reason: 'That tile is taken.' };
  const ter = terrainAt(s, i);
  if (ter === 2 && ![T.ROAD, T.PATH, T.RAIL].includes(type)) return { ok: false, reason: 'That’s water. Only roads, footpaths and railways can bridge it.' };
  if (B[type].shore && !nearWater(s, i)) return { ok: false, reason: 'A harbour goes on the water’s edge.' };
  if (B[type].flat && ter === 1) return { ok: false, reason: `A ${B[type].name.toLowerCase()} needs flat land, not a hill.` };
  const a = availability(s, type);
  if (!a.ok) return { ok: false, reason: a.reason + '.' };
  const cost = buildPrice(s, i, type).money;
  if (s.money < cost) return { ok: false, reason: `${ter === 2 ? 'A bridge here' : ter === 1 ? 'Building on a hill' : 'It'} costs $${cost}.` };
  return { ok: true };
}

export function place(s, i, type) {
  const check = canPlace(s, i, type);
  if (!check.ok) return check;
  if (crossing(s, i, type)) type = T.XING;
  const price = buildPrice(s, i, type), cost = price.money;
  s.money -= cost;
  if (price.use) s.res.materials -= price.use;
  if (s.zone) s.zone[i] = 0;   // your own buildings are public: you pay their upkeep
  s.grid[i] = type;
  s.cond[i] = 0;
  s.lv[i] = 1;
  s.queue.push({ i, left: B[type].work, tap: 0, paid: cost, mat: price.use });
  s.counters.built++;
  s._plan = null;
  return { ok: true, cost, mat: price.mat };
}

export function undoPlace(s, i) {
  const k = s.queue.findIndex((q) => q.i === i && !q.up);
  const t = s.grid[i];
  if (k === -1 || s.queue[k].left < B[t].work) return { ok: false, reason: 'Builders have already started on that.' };
  const [q] = s.queue.splice(k, 1);
  const back = q.paid ?? (t === T.XING ? B[t].cost : tileCost(s, i, t));
  s.money += back;
  if (q.mat) { s.res ||= {}; s.res.materials = (s.res.materials || 0) + q.mat; }
  s.grid[i] = T.EMPTY;
  s.cond[i] = 0;
  s.counters.built = Math.max(0, s.counters.built - 1);
  s._plan = null;
  return { ok: true, refund: back };
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
  if (isProtected(s, i)) return { ok: false, reason: 'This historic building is protected. Lift the protection first.' };
  const wasHistoric = isHistoric(s, i);
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
  if (s.zone) s.zone[i] = 0;
  if (s.bday) s.bday[i] = -1;
  s._plan = null;
  if (wasHistoric) { for (const p of s.people) p.m = clamp(p.m - 0.03); note(s, 'warn', `The old ${B[t].name.toLowerCase()} was pulled down. Some residents mourn a piece of the town’s history.`); }
  return { ok: true, refund, historic: wasHistoric };
}

// Move a finished building to another empty tile you own. Residents and staff move with it.
export function canMove(s, from, to) {
  const t = s.grid[from];
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (!B[t]?.cat) return { ok: false, reason: t === T.HALL ? 'The town hall stays put.' : 'Only buildings can be moved.' };
  if (isProtected(s, from)) return { ok: false, reason: 'Protected historic buildings stay where they are.' };
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
  if (s.bday) { s.bday[to] = s.day; s.bday[from] = -1; }   // a moved building starts its history again
  for (const p of s.people) for (const k of ['h', 'j', 'sc', 'tu', 'fun']) if (p[k] === from) p[k] = to;
  s.counters.moved++;
  s._plan = null;
  return r;
}

// ---------- time ----------

function finish(s, q) {
  s.queue.splice(s.queue.indexOf(q), 1);
  if (q.up) s.lv[q.i] = Math.min(MAX_LEVEL, level(s, q.i) + 1);
  else if (s.bday) s.bday[q.i] = s.day;
  s.cond[q.i] = 100;
  s._plan = null;
  (s._finished ||= []).push({ i: q.i, up: !!q.up });
}

// Builders' work for part of an hour (1 = a whole hour).
function construct(s, hours = 1) {
  let labour = 0;
  for (const p of s.people) {
    if (p.ill) continue;
    if (isBuilder(s, p)) labour += 1;
    else if (p.j < 0 && canWork(p)) labour += VOLUNTEER_RATE;
  }
  labour *= BUILD_SPEED * hours;
  // Materials in stock: builders work faster, using some as they go.
  const mat = s.res?.materials || 0;
  if (mat > 0 && s.queue.some((q) => !q.priv)) {
    const boosted = labour * MATERIALS_BOOST, use = Math.min(mat, boosted * MATERIALS_PER_WORK / BUILD_SPEED);
    labour = labour + (boosted - labour) * (use / Math.max(1e-9, boosted * MATERIALS_PER_WORK / BUILD_SPEED));
    s.res.materials = Math.round((mat - use) * 100) / 100;
  }
  for (const q of s.queue.filter((x) => x.priv)) { q.left -= 3 * BUILD_SPEED * hours; if (q.left <= 1e-6) finish(s, q); }
  const pub = () => s.queue.find((x) => !x.priv);
  while (labour > 0 && pub()) {
    const q = pub();
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
  const air = plan.needs?.air ?? 1;
  const carTrips = plan.trips.filter((t) => t.mode === 'car').length;

  // Health: activity, accidents, illness and treatment.
  for (const p of s.people) {
    const fun = p.fun >= 0 ? B[s.grid[p.fun]]?.visits : null;
    if (fun?.health) p.hp = Math.min(100, p.hp + fun.health);
    if (!p.ill) {
      const risk = (fun?.injury || 0) + (p.j >= 0 ? B[s.grid[p.j]]?.injury || 0 : 0) + (lateTrips.has(p.i) ? 0.003 : 0);
      if (rng() < risk) { p.ill = 2; p.sd = 0; note(s, 'warn', `${name(p)} was injured${fun?.injury ? ' playing sport' : ''}.`); }
      else if (rng() < (weather(cityDay(s)) === 'heat' ? 0.018 : 0.012) * (1 + (1 - air) * 1.2) * (1 + (1 - (plan.waste?.sewage ?? 1)) * 0.8 + (1 - (plan.waste?.waste ?? 1)) * 0.3) * (1 - (s._regional?.health || 0)) * (s._util?.need && !s._util.water.has(p.h) ? 1.5 : 1) * (p.m < 0.4 ? 1.6 : 1) * (p.a > 60 ? 1.8 : 1) * (p.fun >= 0 ? 0.8 : 1) * (p.hp < 60 ? 1.5 : 1)) { p.ill = 1; p.sd = 0; }
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
    const old = p.a >= 70 ? (p.a - 68) * 0.012 / YEAR_DAYS : 0;
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
  const birthday = s.day % YEAR_DAYS === YEAR_DAYS - 1;
  const libraries = s.grid.map((t, i) => (t === T.LIBRARY && active(s, i, uc) && staffing(s, i) > 0 ? i : -1)).filter((i) => i >= 0);
  const libraryNear = (h) => libraries.some((l) => dist1(l, h) <= 8);
  for (const p of s.people) {
    if (birthday) p.a++;
    // Children without a school place learn at home: slower and less certain, better with a library nearby.
    if (p.a >= 5 && p.a < ADULT && p.sc < 0 && !p.as && !p.hol && rng() < (libraryNear(p.h) ? 0.55 : 0.3)) p.sp += 1 / YEAR_DAYS;
    // Adults who go to evening classes at the library move up a level at a time, all the way to a degree.
    if (p.a >= ADULT && p.a < 50 && p.e < 3 && p.sc < 0 && p.fun >= 0 && s.grid[p.fun] === T.LIBRARY && rng() < 0.35) {
      p.us += 1 / YEAR_DAYS;
      if (p.us >= ADULT_STUDY_YEARS[p.e]) {
        p.e++; p.us = 0; p.jy = 3; st.graduates++;
        const what = p.e === 3 ? 'a degree' : p.e === 2 ? 'a high school diploma' : 'a primary certificate';
        remember(s, p, `Earned ${what} at evening classes`); note(s, 'good', `${personName(p)} earned ${what} at evening classes in the library.`);
      }
    }
    // Years on the job count as training, up to high school level.
    if (birthday && p.j >= 0 && !p.oj && p.e < 2 && p.a < 50) {
      p.xp = (p.xp || 0) + 1;
      if (p.xp >= TRAINING_YEARS) { p.e++; p.xp = 0; remember(s, p, `Qualified on the job (${EDU[p.e].toLowerCase()})`); note(s, 'good', `${personName(p)} qualified on the job.`); }
    }
    if (p.sc >= 0 && B[s.grid[p.sc]]) {
      const stage = B[s.grid[p.sc]].school.stage;
      const quality = (0.6 + 0.4 * staffing(s, p.sc)) * (hasTech(s, 'edtech') ? 1.25 : 1);   // a school short of teachers teaches slower
      const boost = ((p.tu >= 0 ? 1.5 : 1) + (s.flags.books > 0 ? 0.3 : 0) + (p.fun >= 0 && B[s.grid[p.fun]]?.visits?.study ? 0.2 : 0) + (traitOf(p) === 'bookish' ? 0.15 : 0)) * quality;
      if (stage === 'uni') {
        if (rng() < 0.92) p.us += boost / YEAR_DAYS;
        if (p.us >= 3) { p.e = 3; p.sc = -1; p.us = 0; p.jy = 3; st.graduates++; remember(s, p, 'Graduated from university'); note(s, 'good', `${name(p)} graduated from university.`); }
      } else if (stage !== 'daycare' && rng() < 0.92) p.sp += boost / YEAR_DAYS;
    }
    if (p.as) p.sp += 1 / YEAR_DAYS;
    if (birthday && p.a === ADULT) {
      p.e = Math.max(p.e, p.sp >= 10 ? 2 : p.sp >= 5 ? 1 : 0);
      remember(s, p, p.e >= 2 ? 'Finished high school' : p.e === 1 ? 'Finished primary school' : 'Left school early');
      if (p.sp < 5) note(s, 'warn', `${name(p)} turned 18 without finishing school.`);
    }
    if (birthday && p.a === RETIRE && p.j >= 0) { p.j = -1; note(s, 'info', `${name(p)} retired.`); }
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
    if (roomIn(s, p.h, homes) < 1 || rng() > 0.1 * (hospital ? 1.4 : 1) * ((p.m + q.m) / 2 < 0.5 ? 0.5 : 1)) continue;
    const baby = person(s, { f: Math.floor(rng() * FIRST.length), l: p.l, a: 0, h: p.h, pa: p.i, b: 1, sp: 0 });
    remember(s, baby, 'Born here'); remember(s, p, `Had baby ${FIRST[baby.f]}`); remember(s, q, `Had baby ${FIRST[baby.f]}`);
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
    remember(s, p, `Got together with ${FIRST[q.f]}`); remember(s, q, `Got together with ${FIRST[p.f]}`);
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
    remember(s, p, 'Moved into their own place');
    homes = byHome();
    note(s, 'info', `${name(p)} moved out into a place of their own.`);
  }

  // Money: tax from working people, scaled by mood, against upkeep that doesn't shrink.
  const moodK = clamp((s.happiness - 0.1) / 0.6) * (s.policy?.tax || 1);
  const by = { basic: 0, skilled: 0, degree: 0, benefits: 0, trade: 0 };
  for (const p of s.people) {
    if (p.j >= 0 && !p.ill && p.oj) by[p.oj === 'rail' ? 'skilled' : 'basic'] += WAGE[p.oj === 'rail' ? 1 : 0] * moodK;
    else if (p.j >= 0 && !p.ill && B[s.grid[p.j]]?.jobs) {
      const req = B[s.grid[p.j]].jobs[p.jt][1];
      by[req >= 3 ? 'degree' : req >= 1 ? 'skilled' : 'basic'] += (req >= 3 ? WAGE[2] : req >= 1 ? WAGE[1] : WAGE[0]) * moodK;
    } else if (p.j < 0 && canWork(p)) by.benefits += 0.5 * moodK;
  }
  by.trade = TRADE_PER_LINK * Math.min(MAX_LINKS * 2, (s.links || 0) + 2 * (s.railLinks || 0)) * Math.min(1, pop / 30)
    + (s._regional?.trade || 0) + (s._allies || 0) * 15;
  const inc = s._incoming || {};
  // Factories make goods: sold to linked neighbours for $2 each, or locally for $0.50.
  const factoryK = (s.flags.robots ? 1.3 : 1) * (s.policy?.carbon ? 0.85 : 1);
  const goods = s.grid.reduce((a, t, i) => a + (t === T.FACTORY && active(s, i, uc) ? Math.round(GOODS_PER_FACTORY * staffing(s, i) * LEVEL.capacity[level(s, i)] * factoryK) : 0), 0);
  const linked = (s.links || 0) + (s.railLinks || 0);
  const harbour = s.grid.some((t, i) => t === T.HARBOUR && active(s, i, uc) && staffing(s, i) > 0);
  by.exports = Math.round(goods * (linked || harbour ? 2 : 0.5));
  if (s.grid.some((t, i) => t === T.AIRPORT && active(s, i, uc) && staffing(s, i) > 0)) by.trade = Math.round(by.trade + 40 + pop * 0.2);
  st.goods = goods;
  by.visitors = (inc.fun || 0) * 2 + (inc.care || 0) * 4 + (inc.shop || 0) * 1 + (inc.school || 0) * 2 + (inc.tourists || 0) * 8;
  // Tourism: attractions draw visitors, more when the city is pleasant and linked. Hotels turn day trips into stays.
  let draw = 0, rooms = 0;
  for (let i = 0; i < N; i++) {
    const d = B[s.grid[i]];
    if (!d || !active(s, i, uc) || !(staffing(s, i) > 0)) continue;
    if (d.draw) draw += d.draw * LEVEL.capacity[level(s, i)];
    if (d.rooms) rooms += scale(s, i, d.rooms);
  }
  draw = Math.round(draw * (0.5 + s.happiness) * (1 + 0.15 * Math.min(MAX_LINKS, (s.links || 0) + (s.railLinks || 0))) * (air < 0.5 ? 0.6 : 1) * (weather(cityDay(s)) === 'clear' ? 1 : 0.7));
  if (s.flags.festival > 0) { draw += 15; s.flags.festival--; }
  draw += s._regional?.draw || 0;
  let hist = 0;
  for (let i = 0; i < N; i++) if (isHistoric(s, i)) hist += isProtected(s, i) ? 2 : 1;
  st.historic = hist;
  draw += Math.min(30, hist);
  const stays = Math.min(draw, rooms), trips = Math.round((draw - stays) * DAYTRIP_SHARE);
  st.tourists = stays + trips;
  by.tourism = stays * TOURIST_SPEND.night + trips * TOURIST_SPEND.day;
  const dirty = s.grid.reduce((a, t, i) => a + (B[t]?.smog && s.cond[i] > 0 ? 1 : 0), 0);
  by.carbon = s.policy?.carbon ? dirty * CARBON_TAX : 0;
  const propRate = PROPERTY_TAX[s.policy?.property || 0] || 0;
  by.property = propRate && plan.value ? s.people.reduce((a, p) => a + (isHome(s.grid[p.h]) ? plan.value[p.h] * propRate : 0), 0) * Math.min(1, moodK + 0.3) : 0;
  by.tolls = s.policy?.toll ? carTrips * CONGESTION_FEE : 0;
  st.air = Math.round(air * 100) / 100;
  for (const k in by) by[k] = Math.round(by[k]);
  st.byClass = by;
  st.upkeepBy = Object.fromEntries(Object.entries(tot.upkeepBy).map(([k, v]) => [k, Math.round(v)]));
  if (s.flags.strike > 0) { for (const k of ['basic', 'skilled', 'degree']) by[k] = Math.round(by[k] * 0.7); s.flags.strike--; }
  if (s.flags.fourday > 0) for (const k of ['basic', 'skilled', 'degree']) by[k] = Math.round(by[k] * 0.9);
  st.income = Object.values(by).reduce((a, b) => a + b, 0);
  const riders = (plan.riders?.bus || 0) + (plan.riders?.train || 0) + (plan.riders?.metro || 0);
  const service = Object.entries(tot.upkeepBy).reduce((a, [t, v]) => a + (B[t]?.cat && B[t].cat !== 'homes' && B[t].cat !== 'work' ? v : 0), 0);
  st.upkeep = Math.round(tot.upkeep + service * ((s.policy?.funding || 1) - 1) + (s.policy?.freeTransit ? riders * 0.5 : 0));
  if (s.policy?.insured) {
    const n = s.grid.reduce((a, t, i) => a + (B[t]?.cat && s.cond[i] > 0 ? 1 : 0), 0), prem = Math.round(n * INSURANCE.premium);
    st.upkeepBy = { ...st.upkeepBy, insurance: prem }; st.upkeep += prem;
  }
  if (s.bond?.left > 0) {
    const pay = Math.min(s.bond.left, s.bond.daily);
    if (s.money + st.income - st.upkeep - pay < 0) { s.bond.missed++; for (const p of s.people) p.m = clamp(p.m - 0.04); note(s, 'warn', 'The city couldn’t pay its bondholders today. Residents are not pleased.'); }
    else { st.upkeepBy = { ...st.upkeepBy, bonds: pay }; st.upkeep += pay; s.bond.left -= pay; if (s.bond.left <= 0) { s.bond = null; note(s, 'good', 'The city bonds are paid off. Residents got their money back with interest.'); for (const p of s.people) p.m = clamp(p.m + 0.02); } }
  }
  // Pensions: every retiree draws a little each day. A city that ages costs more.
  const retirees = s.people.filter((p) => p.a >= RETIRE).length;
  if (retirees) { st.upkeepBy = { ...st.upkeepBy, pensions: retirees * PENSION }; st.upkeep += retirees * PENSION; }
  st.retirees = retirees;
  const recycled = s.grid.reduce((a, t, i) => a + (t === T.RECYCLE && active(s, i, uc) && staffing(s, i) > 0 ? 1 : 0), 0);
  if (recycled) { const r = Math.round(Math.min(pop, recycled * B[T.RECYCLE].waste) * B[T.RECYCLE].sells); st.income += r; by.recycling = r; }
  // Loan repayments come out before anything else. Missing one hurts the credit rating.
  if (s.loan?.left > 0) {
    const due = Math.min(s.loan.left, Math.ceil(s.loan.taken / LOAN_DAYS)), interest = Math.ceil(s.loan.left * s.loan.rate);
    st.loanPaid = due + interest;
    st.upkeepBy = { ...st.upkeepBy, loan: st.loanPaid };
    st.upkeep += st.loanPaid;
    if (s.money + st.income - st.upkeep < 0) { s.loan.missed = (s.loan.missed || 0) + 1; s.loan.left += interest; st.upkeep -= st.loanPaid; st.loanPaid = 0; note(s, 'warn', 'Missed a loan payment. The interest was added to the debt and the bank noticed.'); }
    else { s.loan.left -= due; if (s.loan.left <= 0) { s.loan = null; s.flags.repaid = 1; note(s, 'good', 'The loan is paid off.'); } }
  }
  s.money += st.income - st.upkeep;

  // Maintenance.
  const buildings = [];
  for (let i = 0; i < N; i++) {
    const t = s.grid[i];
    if (B[t]?.cat && t !== T.HALL && !uc.has(i) && s.cond[i] > 0) buildings.push(i);
  }
  // A one-time lifeline: the first time a small town can't pay its bills, the region helps out.
  if (s.money < 0 && !s.flags.bailout && s.people.length < 80 && s.day >= GRACE_DAYS) {
    s.flags.bailout = s.day;
    const grant = Math.max(500, Math.round(-s.money + st.upkeep * 5));
    s.money += grant;
    st.bailout = grant;
    note(s, 'warn', `The region sent a one-off emergency grant of $${grant} so the town could pay its bills. It won’t happen again: check Stats, Budget.`);
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

  // Resources: what was made, what people and buildings used, what had to be imported, and what was left over.
  for (const d of s.debts || []) if (s.day > d.due) d.late = (d.late || 0) + 1;
  for (const p of s.people) if (p.oc && s.day >= p.oc) { p.oc = 0; remember(s, p, 'Came back from a job in another city'); }
  if (s.contracts) s.contracts = s.contracts.filter((k) => k.until > s.day);
  const rs = resourcesDay(s, uc);
  st.res = rs;
  if (rs.importCost) { st.upkeep += rs.importCost; st.upkeepBy = { ...st.upkeepBy, imports: rs.importCost }; }
  if (rs.sold) { st.income += rs.sold; st.byClass = { ...st.byClass, produce: rs.sold }; }
  // Having none at all is already covered by power and water coverage; this is for having some, but not enough.
  const shortOf = (k) => (pop >= UTILITY_POP && rs.prod[k] > 0 ? rs.short[k] / Math.max(1, rs.need[k]) : 0);
  const shortK = { water: shortOf('water'), power: shortOf('power') };

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
    if (p.a >= ADULT) m += p.j >= 0 || p.oc ? 0.12 : p.sc >= 0 ? 0.1 : p.a >= RETIRE ? 0.1 : p.st ? 0.03 : -0.1;
    else m += p.sc >= 0 || p.a < 5 ? 0.1 : -0.08;
    const mine = tripsBy.get(p.i) || [];
    const car = mine.filter((x) => x.mode === 'car');
    m += car.length ? 0.08 * car.reduce((a, x) => a + x.ok, 0) / car.length : 0.07;
    if (mine.some((x) => x.mode === 'train' || x.mode === 'bus' || x.mode === 'metro')) m += s.policy?.freeTransit ? 0.05 : 0.02;
    m -= ((s.policy?.tax || 1) - 1) * 0.35;
    m += ((s.policy?.funding || 1) - 1) * 0.15;
    if (lateTrips.has(p.i)) m -= 0.05;
    m += plan.shopFor.has(p.h) ? 0.06 : -0.05;
    m += p.fun >= 0 || p.fa ? 0.1 : p.hol ? 0.15 : 0;
    m += plan.parks.has(p.h) ? 0.04 : 0;
    m -= plan.pollution.has(p.h) ? 0.08 : 0;
    const trait = traitOf(p), funB = p.fun >= 0 ? B[s.grid[p.fun]]?.visits : null;
    m -= (1 - air) * (trait === 'green' ? 0.2 : 0.1);
    if (trait === 'green' && plan.parks.has(p.h)) m += 0.03;
    if (trait === 'sporty' && funB?.health) m += 0.04;
    if (trait === 'bookish' && funB?.study) m += 0.04;
    if (trait === 'owl') m += p.fun >= 0 ? 0.03 : -0.05;
    if (trait === 'homebody' && p.fun < 0) m += 0.06;
    if (plan.pets?.has(p.h)) m += plan.vetFor?.has(p.h) || s.people.length < 20 ? 0.03 : 0;
    if (plan.pets?.has(p.h) && !plan.vetFor?.has(p.h) && s.people.length >= 20) m -= 0.02;
    m -= (1 - (plan.waste?.waste ?? 1)) * 0.06;
    if (p.a >= RETIRE) m += 0.02;
    if (car.length && s.policy?.toll) m -= 0.02;
    if (s.flags.carfree > 0) m += car.length ? -0.02 : 0.03;
    if (s.flags.fourday > 0 && p.j >= 0) m += 0.04;
    if (s.flags.scandal > 0) m -= 0.04;
    if (s.flags.robotsUneasy > 0 && p.j >= 0 && s.grid[p.j] === T.FACTORY) m -= 0.05;
    if (s.policy?.carbon) m += 0.01;
    m -= (s.policy?.property || 0) * 0.02;
    if (squeezed(s, plan, p)) m -= 0.05 + (s.policy?.property || 0) * 0.03;
    if (plan.value && isHome(t)) m += (plan.value[p.h] - 0.5) * 0.06;
    if (s._util?.need) m -= (s._util.power.has(p.h) ? 0 : 0.06) + (s._util.water.has(p.h) ? 0 : 0.06);
    m -= p.ill === 3 ? 0.25 : p.ill ? 0.12 : 0;
    m -= p.vt ? 0.15 : 0;
    m -= p.gr ? 0.18 : 0;
    m += p.jy ? 0.12 : 0;
    m -= kidsNoSchool.has(p.h) ? 0.05 : 0;
    m -= courtBacklog;
    m += LINK_MOOD * Math.min(MAX_LINKS, (s.links || 0) + (s.railLinks || 0));
    m += s._regional?.mood || 0;
    m -= shortK.water * 0.06 + shortK.power * 0.05;          // taps and lights that don't always work
    m += 0.015 * Math.max(0, rs.variety - 1);                // a varied diet: fruit, vegetables, dairy and meat
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
  if ((s.policy?.property || 0) > 0 && plan.value) {
    for (const [h, members] of byHome()) {
      if (!(plan.value[h] > RENT_SQUEEZE) || members.some((p) => p.e >= 2) || rng() > 0.02 * s.policy.property) continue;
      for (const p of members) removePerson(s, p);
      st.priced = (st.priced || 0) + members.length; st.departures += members.length;
      note(s, 'warn', `The ${SURNAMES[members[0].l]} family was priced out of their neighbourhood and left.`);
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

  st.riders = (plan.riders?.bus || 0) + (plan.riders?.train || 0) + (plan.riders?.metro || 0);
  // Research: degrees and libraries make progress, faster in bigger eras.
  const libs = s.grid.reduce((a, t, i) => a + (t === T.LIBRARY && active(s, i, uc) && staffing(s, i) > 0 ? 1 : 0) + (t === T.UNI && active(s, i, uc) && staffing(s, i) > 0 ? 2 : 0) + (t === T.MUSEUM && active(s, i, uc) ? 1 : 0), 0);
  const degrees = s.people.filter((p) => p.e >= 3 && p.a >= ADULT).length;
  st.rp = Math.round(((degrees * 0.15 + libs * 0.8) * (1 + ERAS.indexOf(eraOf(s)) * 0.1) + (HALL_LEVELS[hallLevel(s)]?.rp || 1)) * (hasTech(s, 'edtech') ? 1.2 : 1) * 10) / 10;   // the town hall's clerks research too
  s.rp = Math.round(((s.rp || 0) + st.rp) * 10) / 10;
  st.cars = carTrips;
  st.commuters = s.people.filter((p) => p.oj).length;
  // Residents ask for things. Build what they ask for near their home in time and they'll thank you.
  const near = (h, t, r) => s.grid.some((g, i) => g === t && active(s, i, uc) && dist1(i, h) <= r);
  s.wants = (s.wants || []).filter((w) => {
    const p = s.people.find((x) => x.i === w.p);
    if (!p) return false;
    if (near(p.h, w.t, w.r)) {
      const fund = Math.floor(w.fund || 0);
      s.money += w.reward + fund; p.jy = 3; st.wants = (st.wants || 0) + 1;
      note(s, 'good', `${personName(p)} is delighted with the new ${B[w.t].name.toLowerCase()}. +$${w.reward}${fund ? `, plus $${fund} the neighbours raised towards it` : ''}.`);
      return false;
    }
    w.fund = Math.min(B[w.t].cost * CROWDFUND.max, (w.fund || 0) + B[w.t].cost * CROWDFUND.daily);
    return s.day - w.d < 6;
  });
  const WISH = [[T.PARK, 3], [T.PLAYGROUND, 4], [T.CAFE, 6], [T.GYM, 6], [T.POOL, 7], [T.CINEMA, 8], [T.LIBRARY, 7], [T.SHOP, 5], [T.CLINIC, 8], [T.STOP, 4], [T.SPORTS, 6], [T.DOJO, 6], [T.FARM, 6], [T.MUSEUM, 10]];
  if (s.people.length >= 10 && s.wants.length < 4 && rng() < 0.45) {
    const p = s.people[Math.floor(rng() * s.people.length)];
    const options = WISH.filter(([t, r]) => !near(p.h, t, r) && !(B[t].minPop > s.people.length) && !s.wants.some((w) => w.p === p.i));
    if (options.length && p.a >= 6) {
      const [t, r] = options[Math.floor(rng() * options.length)];
      s.wants.push({ p: p.i, t, r, d: s.day, reward: WANT_REWARD + B[t].cost * 0.3 | 0 });
    }
  }
  if (s.flags.books > 0) s.flags.books--;
  if (s.flags.blackout > 0) s.flags.blackout--;
  for (const k of ['carfree', 'fourday', 'robotsUneasy']) if (s.flags[k] > 0) s.flags[k]--;
  if (s.flags.scandalLeak > 0 && --s.flags.scandalLeak === 0) { s.flags.scandal = 4; note(s, 'warn', 'The expenses scandal leaked to the papers. Trust in the council has fallen.'); }
  else if (s.flags.scandal > 0) s.flags.scandal--;

  // Zones grow: developers build where there's demand, a road beside the tile, and you own the land.
  const dem = demand(s, plan);
  const pickType = (z) => {
    if (z === 1) return s.people.length >= 30 && rng() < 0.3 ? T.APARTMENT : plan.parks.size && rng() < 0.2 ? T.VILLA : T.HOUSE;
    if (z === 2) return rng() < 0.65 ? T.SHOP : T.CAFE;
    return census(s).edu[2] + census(s).edu[3] > census(s).edu[0] + census(s).edu[1] && rng() < 0.5 ? T.WORK : T.FACTORY;
  };
  const want = { 1: dem.homes, 2: dem.shops, 3: dem.jobs };
  for (const z of [1, 2, 3]) {
    if (want[z] <= 0.1) continue;
    const spots = [];
    for (let i = 0; i < N; i++) if (s.zone[i] === z && s.grid[i] === T.EMPTY && terrainAt(s, i) !== 2 && owns(s, i) && neighbours(i).some((n) => isRoad(s.grid[n]) || s.grid[n] === T.HALL)) spots.push(i);
    for (let k = 0; k < Math.min(spots.length, want[z] > 0.5 ? 2 : 1); k++) {
      const i = spots.splice(Math.floor(rng() * spots.length), 1)[0], t = pickType(z);
      if (B[t].minPop && s.people.length < B[t].minPop) continue;
      s.grid[i] = t; s.cond[i] = 0; s.lv[i] = 1;
      s.queue.push({ i, left: B[t].work, tap: 0, priv: true });
      st.grown = (st.grown || 0) + 1;
    }
  }
  if (st.grown) note(s, 'info', `Developers started ${st.grown} new building${st.grown > 1 ? 's' : ''} in your zones.`);

  // Disasters, and the things that defend against them.
  const covered = (t, i) => s.grid.some((g, j) => g === t && active(s, j, uc) && dist1(i, j) <= B[t].supply);
  const wx = weather(cityDay(s));
  if (wx === 'rain' && s.day > 5 && rng() < (s.terr?.includes('2') ? 0.09 : 0.07)) {
    // Rivers burst their banks: floods start by the water when there is any.
    const shore = [];
    if (s.terr) for (let i = 0; i < N; i++) if (terrainAt(s, i) !== 2 && nearWater(s, i)) shore.push(i);
    const start = shore.length && rng() < 0.7 ? shore[Math.floor(rng() * shore.length)] : -1;
    const cx = start >= 0 ? Math.min(PLOT - 3, Math.max(2, start % PLOT)) : 2 + Math.floor(rng() * (PLOT - 4)), cy = start >= 0 ? Math.min(PLOT - 3, Math.max(2, (start / PLOT) | 0)) : 2 + Math.floor(rng() * (PLOT - 4));
    let hit = 0, saved = 0;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      const i = idx(x, y);
      if (!B[s.grid[i]]?.cat || s.cond[i] <= 0) continue;
      if (covered(T.DRAIN, i)) { saved++; continue; }
      s.cond[i] = Math.max(1, s.cond[i] - hurt(s, 35)); hit++;
    }
    if (hit) note(s, 'warn', `Flash flooding damaged ${hit} building${hit > 1 ? 's' : ''}.${saved ? ` Storm drains protected ${saved}.` : ' Storm drains would have helped.'}`);
    else if (saved) note(s, 'good', `Heavy rain flooded the streets, but storm drains kept ${saved} building${saved > 1 ? 's' : ''} safe.`);
  }
  // Earthquakes shake the whole plot; hospitals and fire stations limit the harm. Tornadoes cut a line through town.
  const hospital2 = hasType(T.HOSPITAL);
  if (s.day > 8 && s.people.length >= 20 && rng() < QUAKE_CHANCE) {
    const list = built(s), hit = Math.max(1, Math.round(list.length * (fireCover ? 0.12 : 0.22)));
    for (let k = 0; k < hit && list.length; k++) { const i = list.splice(Math.floor(rng() * list.length), 1)[0]; s.cond[i] = Math.max(1, s.cond[i] - hurt(s, fireCover ? 30 : 50)); }
    let injured = 0;
    for (const p of s.people) if (!p.ill && rng() < (hospital2 ? 0.03 : 0.07)) { p.ill = 2; p.sd = 0; injured++; }
    st.disaster = `An earthquake damaged ${hit} building${hit > 1 ? 's' : ''}${injured ? ` and injured ${injured}` : ''}.${fireCover ? ' Firefighters kept it from getting worse.' : ' A fire station would have limited the damage.'}`;
    note(s, 'warn', st.disaster);
    for (const p of s.people) p.m = Math.max(0, p.m - 0.05);
  } else if (s.day > 8 && (wx === 'rain' || wx === 'heat') && ['Spring', 'Summer'].includes(season(cityDay(s))) && rng() < TORNADO_CHANCE) {
    const horiz = rng() < 0.5, line = 3 + Math.floor(rng() * (PLOT - 6));
    let hit = 0;
    for (let k = 0; k < PLOT; k++) for (const w of [0, 1]) {
      const i = horiz ? idx(k, Math.min(PLOT - 1, line + w)) : idx(Math.min(PLOT - 1, line + w), k);
      if (!B[s.grid[i]]?.cat || s.grid[i] === T.HALL || s.cond[i] <= 0 || rng() < 0.4) continue;
      s.cond[i] = Math.max(1, s.cond[i] - hurt(s, 45)); hit++;
    }
    if (hit) { st.disaster = `A tornado tore through town and damaged ${hit} building${hit > 1 ? 's' : ''}. They repair as upkeep is paid.`; note(s, 'warn', st.disaster); }
  }
  const plants = s.grid.filter((t, i) => B[t]?.power && active(s, i, uc)).length;
  if (plants && s.day > 5 && rng() < 0.05) {
    if (plants >= 2) note(s, 'good', 'A power station tripped, but the backup kept the lights on.');
    else { s.flags.blackout = 1; note(s, 'warn', 'Blackout! The power station failed. A second one would act as a backup.'); }
  }
  if (s.flags.wasteSince === undefined && s.people.length >= WASTE_POP) { s.flags.wasteSince = s.day; note(s, 'warn', 'The town is making more rubbish than the council can cart away. Build a landfill or recycling centre within 5 days.'); }
  if (s.flags.sewageSince === undefined && s.people.length >= SEWAGE_POP) { s.flags.sewageSince = s.day; note(s, 'warn', 'The old drains can’t cope with this many people. Build a sewage works within 5 days.'); }
  if (s.flags.utilSince === undefined && s.people.length >= UTILITY_POP) {
    s.flags.utilSince = s.day;
    note(s, 'warn', 'The town has outgrown its wells and generators. Build a power station and a water tower within 5 days, or buildings will struggle.');
  }
  // Now and then the council asks the mayor to decide something.
  const pool = DECISIONS.filter((d) => !d.chain);
  if (!s.decision && s.flags.chain && s.day >= s.flags.chain.day) { s.decision = { id: s.flags.chain.id, d: s.day }; s.flags.chain = null; }
  if (!s.decision && s.people.length >= 15 && s.day >= 4 && rng() < 0.16) s.decision = { id: pool[Math.floor(rng() * pool.length)].id, d: s.day };
  // Letters: now and then an unhappy resident writes to the mayor about the town's weakest spot.
  if (s.letter && s.day - s.letter.d > LETTER_DAYS) s.letter = null;
  if (!s.letter && s.people.length >= 12 && s.day >= 3 && rng() < 0.3) {
    const weak = ISSUES.map((x) => [x, plan.needs?.[x.k] ?? 1]).filter(([, v]) => v < 0.85).sort((a, b) => a[1] - b[1])[0];
    const writer = [...s.people].filter((p) => p.a >= 16).sort((a, b) => a.m - b.m)[0];
    if (weak && writer) s.letter = { p: writer.i, k: weak[0].k, d: s.day, v: weak[1] };
  }
  // Promises made in reply to letters come due.
  if (s.pledge && s.day >= s.pledge.until) {
    const now = plan.needs?.[s.pledge.k] ?? 1, kept = now >= Math.min(0.85, s.pledge.v + 0.15);
    for (const p of s.people) p.m = clamp(p.m + (kept ? 0.04 : -0.05));
    note(s, kept ? 'good' : 'warn', kept ? `You kept your promise to ${s.pledge.name}. Word got round, and people trust the council more.` : `You promised ${s.pledge.name} you’d fix it, and didn’t. People noticed.`);
    s.pledge = null;
  }
  if (s.decision && s.day - s.decision.d > 3) { note(s, 'warn', 'The council took your silence as a no.'); decide(s, 'b'); }
  // Elections: a good mood keeps the mayor popular.
  // Three days before each election a challenger picks your weakest issue.
  if (s.people.length >= 10 && s.day % ELECTION_EVERY === ELECTION_EVERY - 3) {
    const weak = ISSUES.map((x) => [x, plan.needs?.[x.k] ?? 1]).sort((a, b) => a[1] - b[1])[0][0];
    const rival = s.people.filter((p) => p.a >= 25 && p.a < 70)[Math.floor(rng() * s.people.length) % Math.max(1, s.people.filter((p) => p.a >= 25 && p.a < 70).length)];
    s.flags.opp = { k: weak.k, name: rival ? personName(rival) : 'A local businessperson', promise: weak.promise, day: s.day + 3 };
    note(s, 'warn', `${s.flags.opp.name} is standing against you at the election in 3 days, promising ${weak.promise}.`);
  }
  if (s.day > 0 && s.day % ELECTION_EVERY === 0 && s.people.length >= 10) {
    const opp = s.flags.opp, weakness = opp ? 1 - (plan.needs?.[opp.k] ?? 1) : 0;
    const approval = Math.round(clamp(s.happiness * 1.1 - (s.unpaidDays ? 0.15 : 0) - weakness * 0.25) * 100);
    s.approval = approval;
    if (opp) note(s, 'info', `On ${opp.promise}, voters gave you ${Math.round((1 - weakness) * 100)}%.`);
    if (approval < 50 && opp) note(s, 'warn', `${opp.name} won a council seat promising ${opp.promise}.`);
    s.flags.opp = null;
    if (approval >= 50) { s.money += 200; note(s, 'good', `Re-elected with ${approval}% of the vote. The region sends a $200 grant.`); }
    else { s.money = Math.max(0, s.money - 300); for (const p of s.people) p.m = Math.max(0, p.m - 0.03); note(s, 'warn', `Only ${approval}% backed you. You keep the job, but a council audit costs $300.`); }
  }
  st.event = s.day >= 2 && rng() < EVENT_CHANCE ? randomEvent(s, rng, fireCover) : null;
  s.day++;
  s.peakPop = Math.max(s.peakPop, s.people.length);
  const month = new Date(s.lastTick || Date.now()).toISOString().slice(0, 7);
  if (s.flags.season?.m !== month) s.flags.season = { m: month, pop: s.people.length };
  const era = eraOf(s);
  if (era.pop && !(s.flags.era >= ERAS.indexOf(era))) { s.flags.era = ERAS.indexOf(era); s.money += era.grant; st.era = era.name; note(s, 'good', `${s.name} is now a ${era.name.toLowerCase()}! The region sends a $${era.grant} grant.`); }
  for (const m of MILESTONES) if (s.people.length >= m && !(s.flags.milestone >= m)) { s.flags.milestone = m; st.milestone = m; note(s, 'good', `${s.name} reached ${m} residents!`); }
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
    for (let k = 0; k < n; k++) { const i = list[Math.floor(rng() * list.length)]; s.cond[i] = Math.max(1, s.cond[i] - hurt(s, 20)); }
    return `A storm damaged ${n} building${n > 1 ? 's' : ''}. They repair as upkeep is paid.`; } },
  { w: 1, ok: (s) => s.people.length >= 30 && built(s).length >= 6, run: (s, rng, fire) => {
    const list = built(s), i = list[Math.floor(rng() * list.length)];
    s.cond[i] = Math.max(1, s.cond[i] - hurt(s, fire ? 15 : 55));
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
  friend1: (s) => (s.flags.friends || 0) >= 1, gift1: (s) => (s.counters.gifts || 0) >= 1, link1: (s) => (s.links || 0) + (s.railLinks || 0) >= 1,
  deal1: (s) => (s.counters.deals || 0) >= 1, ally1: (s) => !!s.flags.ally,
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
// Construction between hours: the game calls this with how much of the current hour has passed, and tick() does the rest.
export function work(s, upTo) {
  const d = Math.min(1, upTo) - (s.wk || 0);
  if (s.status !== 'alive' || d <= 0.001) return 0;
  const before = s.queue.length;
  s.wk = Math.min(1, upTo);
  construct(s, d);
  return before - s.queue.length;
}

export function tick(s, rng = Math.random) {
  if (s.status !== 'alive') return { plan: null, collapsed: null };
  construct(s, Math.max(0, 1 - (s.wk || 0)));
  s.wk = 0;
  // Producing buildings build up a harvest to collect by tapping.
  const ready = (s.ready ||= {});
  for (let i = 0; i < N; i++) {
    if (!B[s.grid[i]]?.makes || !active(s, i) || !(staffing(s, i) > 0)) { if (ready[i]) delete ready[i]; continue; }
    ready[i] = Math.min(HARVEST.max, (ready[i] || 0) + 1);
  }
  const p = s._plan && s._plan.day === s.day ? s._plan : plan(s, rng);
  // An empty town counts as hopeful as a new one, so it can fill up again if it still has homes and money.
  const avg = s.people.length ? s.people.reduce((a, x) => a + x.m, 0) / s.people.length : 0.65;
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

// Demand, SimCity-style: what the city is short of right now, from -1 (too much) to 1 (build more).
export function demand(s, plan) {
  const c = census(s), tot = totals(s);
  const pop = Math.max(1, c.total);
  const homes = clamp((pop + 4 - tot.homes) / Math.max(6, pop * 0.2) + (s.happiness > 0.6 ? 0.3 : -0.2), -1, 1);
  const jobs = clamp((c.seeking - (tot.jobs - c.employed) * 0.5) / Math.max(4, pop * 0.1), -1, 1);
  const shops = clamp(1 - (plan?.needs?.shops ?? 1) * 1.3 + 0.2, -1, 1);
  const services = clamp(1.4 - ((plan?.needs?.school ?? 1) + (plan?.needs?.health ?? 1) + (plan?.needs?.safety ?? 1) + (plan?.needs?.leisure ?? 1)) / 4 * 1.6, -1, 1);
  return { homes, jobs, shops, services };
}

// The advisor: the three most useful things to do next, with what to build.
export function advice(s, plan) {
  const c = census(s), tot = totals(s), n = plan?.needs || {}, out = [];
  const add = (score, text, type) => out.push({ score, text, type });
  if (s.unpaidDays) add(10, 'You can’t pay upkeep. Raise tax a little, cut service funding, or demolish what nobody uses.', null);
  // Buildings with no staff still cost upkeep; that's the usual reason a young town slides into debt.
  let idle = 0;
  for (let i = 0; i < N; i++) { const d = B[s.grid[i]]; if (d?.jobs && d.cat && s.grid[i] !== T.HALL && active(s, i) && staffing(s, i) === 0) idle++; }
  if ((s.stats.income || 0) < (s.stats.upkeep || 0)) {
    if (idle) add(6.5, `You’re losing money, and ${idle} building${idle > 1 ? 's have' : ' has'} no staff but still cost upkeep. Grow the town before building more, or demolish what nobody works at.`, T.HOUSE);
    else if (c.seeking > 4) add(6, 'You’re losing money. People want work: a factory hires anyone and sells goods.', T.FACTORY);
    else add(6, 'You’re losing money. More homes bring more taxpayers; lower service funding in Stats, Policy if you need to.', T.HOUSE);
  }
  if (n.homes < 0.4) add(5, 'No room for newcomers. Build homes.', T.HOUSE);
  if (c.seeking > 3) add(4 + c.seeking / 5, `${c.seeking} people need work. Build jobs they qualify for.`, c.edu[0] + c.edu[1] > c.edu[2] + c.edu[3] ? T.FACTORY : T.WORK);
  if (n.shops < 0.8) add(4, 'Some families have no grocer nearby.', T.SHOP);
  if (c.toddlers && !(tot.seats.daycare > 0)) add(3, 'Parents are staying home with toddlers. A daycare lets them work.', T.DAYCARE);
  if (n.school < 0.8) add(4, 'Children are missing school. Build schools, and make sure you have teachers with degrees.', c.teens > c.kids ? T.HIGH : T.SCHOOL);
  if (n.health < 0.8 || c.sick > c.total * 0.1) add(4, 'Sick people aren’t being treated.', tot.counts[T.CLINIC] ? T.HOSPITAL : T.CLINIC);
  if (n.safety < 0.7) add(3.5, 'Crime is rising.', tot.counts[T.POLICE] ? T.COURT : T.POLICE);
  // Leisure is worth nearly as much mood as a job, so the more people lack it the higher it ranks.
  const rsd = s.stats?.res;
  if (rsd && s.people.length >= UTILITY_POP) {
    if (rsd.short.water > 0 && rsd.prod.water > 0) add(6.5, `Water is running short: ${rsd.short.water} kilolitres a day. Build another water tower.`, T.WATER);
    if (rsd.short.power > 0 && rsd.prod.power > 0) add(6, `Power is running short: ${rsd.short.power} megawatt-hours a day. Build a power station, solar farm or wind turbine.`, s.money >= B[T.POWER].cost ? T.POWER : T.WIND);
  }
  if (s.people.length >= 15 && !tot.counts[T.MATERIALS] && s.queue.length) add(3.5, 'Buying building materials costs extra. A materials works makes them, and builders work faster with materials in store.', T.MATERIALS);
  if (rsd?.importCost >= 8 && s.people.length >= 30) add(2.5, `Imported food costs ${'$'}${rsd.importCost} a day. Farms grow it here, and more kinds of food make people happier.`, T.FARM);
  if (n.leisure < 0.6) add(3 + 3 * (0.6 - n.leisure), 'People have nothing to do in the evenings.', T.PARK);
  if (n.commute < 0.8) add(3.5, 'Roads are jammed. Add routes or footpaths, or a bus service.', tot.counts[T.DEPOT] ? T.STOP : T.DEPOT);
  if (s.flags.utilSince !== undefined) {
    const u = s._util || utilities(s), all = s.grid.filter((t) => B[t]?.cat).length || 1;
    const days = Math.max(0, 5 - (s.day - s.flags.utilSince));
    if (u.power.size < all * 0.9) add(days ? 7 : 8, days ? `Power is needed within ${days} day${days > 1 ? 's' : ''}. Build a power station, solar farm or wind turbine.` : 'Buildings without power work at 60%. Place power sources to cover them.', s.money >= B[T.POWER].cost ? T.POWER : T.SOLAR);
    if (u.water.size < all * 0.9) add(days ? 6 : 7, 'Homes without clean water get ill more often. Build a water tower.', T.WATER);
  }
  const ws = plan?.waste || wasteStatus(s);
  if (ws.warnWaste) add(5.5, `Rubbish needs handling within ${Math.max(1, 5 - (s.day - s.flags.wasteSince))} day(s). Build a landfill or recycling centre.`, s.money >= B[T.RECYCLE].cost ? T.RECYCLE : T.LANDFILL);
  if (ws.warnSewage) add(5.5, `Sewage needs handling within ${Math.max(1, 5 - (s.day - s.flags.sewageSince))} day(s). Build a sewage works.`, T.SEWAGE);
  if (ws.needWaste && ws.waste < 0.9) add(4.5 + (1 - ws.waste) * 3, 'Rubbish is piling up in the streets. Build a landfill or a recycling centre.', s.money >= B[T.RECYCLE].cost ? T.RECYCLE : T.LANDFILL);
  if (ws.needSewage && ws.sewage < 0.9) add(4.5 + (1 - ws.sewage) * 3, 'There’s nowhere for the sewage to go, and people are falling ill. Build a sewage works.', T.SEWAGE);
  const air = plan?.needs?.air ?? 1;
  if (air < 0.6) add(3 + (0.6 - air) * 8, 'The air is getting dirty and people are falling ill. Swap to solar or wind power, plant parks, or try a carbon tax.', greenShare(s) < 0.5 ? T.SOLAR : T.PARK);
  if (s.people.length >= 60 && !tot.counts[T.MUSEUM] && !tot.counts[T.STADIUM]) add(1.8, 'Your city is big enough for attractions. A museum brings tourists and their money.', T.MUSEUM);
  if (season(cityDay(s)) !== 'Summer' && s.people.length >= 20 && !tot.counts[T.DRAIN]) add(2.8, 'Heavy rain can flood the streets. Storm drains protect buildings nearby.', T.DRAIN);
  if (!s.zone?.some(Boolean) && s.people.length >= 12) add(2.6, 'Paint zones and developers will build homes, shops and industry for you, with no upkeep.', null);
  if (s.counters.deaths > 2 && !tot.counts[T.CEMETERY]) add(3, 'Families have nowhere to lay loved ones to rest.', T.CEMETERY);
  if (c.edu[2] > 4 && !tot.counts[T.UNI] && !tot.counts[T.LIBRARY]) add(2.5, 'High school graduates want to learn more. A library or university helps.', T.LIBRARY);
  if (!(s.links || s.railLinks)) add(1.5, 'Link a road or railway with a neighbour for trade, visitors and shared facilities.', null);
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// Apply the mayor's answer to a council decision: 'a' or 'b'.
export function decide(s, choice) {
  const d = s.decision && DECISIONS.find((x) => x.id === s.decision.id);
  if (!d) return null;
  s.decision = null;
  const all = (v) => { for (const p of s.people) p.m = clamp(p.m + v); };
  const yes = choice === 'a';
  if (d.id === 'festival') { if (yes && s.money >= 300) { s.money -= 300; all(0.08); } else all(-0.03); }
  if (d.id === 'taxcut') { if (yes) { s.policy.tax = Math.max(0.8, Math.round((s.policy.tax - 0.1) * 100) / 100); all(0.05); } else all(-0.04); }
  if (d.id === 'company' && yes) { s.money += 500; all(-0.03); }
  if (d.id === 'strike') { if (yes && s.money >= 250) s.money -= 250; else s.flags.strike = 2; }
  if (d.id === 'books' && yes && s.money >= 120) { s.money -= 120; s.flags.books = 5; }
  if (d.id === 'clinic' && yes && s.money >= 150) { s.money -= 150; for (const p of s.people) if (p.ill === 1) p.ill = 0; }
  if (d.id === 'company' && yes) s.flags.chain = { id: 'company2', day: s.day + 5 };
  if (d.id === 'festival' && yes) s.flags.chain = { id: 'festival2', day: s.day + 10 };
  if (d.id === 'robots' && yes) s.flags.chain = { id: 'robots2', day: s.day + 7 };
  if (d.id === 'company2') { if (yes) { s.money += 800; all(-0.05); } else all(0.02); }
  if (d.id === 'festival2') { if (yes && s.money >= 500) { s.money -= 500; all(0.1); s.flags.carfree = Math.max(s.flags.carfree || 0, 2); s.flags.festival = 5; } else all(-0.02); }
  if (d.id === 'robots2') { if (yes && s.money >= 300) { s.money -= 300; for (const p of s.people) if (p.j >= 0 && s.grid[p.j] === T.FACTORY && p.e < 2 && Math.random() < 0.5) p.e++; } else { all(-0.05); s.flags.strike = 2; } }
  if (d.id === 'carfree') { if (yes) s.flags.carfree = 5; else all(-0.02); }
  if (d.id === 'fourday' && yes) s.flags.fourday = 5;
  if (d.id === 'scandal') { if (yes && s.money >= 200) { s.money -= 200; s.flags.inquiry = 1; all(0.02); } else s.flags.scandalLeak = 2 + Math.floor(Math.random() * 3); }
  if (d.id === 'robots') { if (yes && s.money >= 400) { s.money -= 400; s.flags.robots = 1; s.flags.robotsUneasy = 6; } else if (!yes) all(0.02); }
  note(s, 'info', `Council: ${d.title} You chose “${(yes ? d.a : d.b)[0]}”.`);
  return d;
}

// Reply to a resident's letter: 'promise' to fix their worry within a few days, or just 'thank' them.
export function replyLetter(s, how) {
  const l = s.letter;
  if (!l) return null;
  const p = s.people.find((x) => x.i === l.p);
  s.letter = null;
  if (!p) return null;
  if (how === 'promise') {
    s.pledge = { k: l.k, v: l.v, until: s.day + PLEDGE_DAYS, name: personName(p) };
    p.m = clamp(p.m + 0.08); p.jy = 2;
    note(s, 'info', `You promised ${personName(p)} to deal with ${ISSUES.find((x) => x.k === l.k).promise.replace(/^an? |^more |^shorter |^safer |^clean /, (m) => m)} within ${PLEDGE_DAYS} days.`);
  } else { p.m = clamp(p.m + 0.02); note(s, 'info', `You thanked ${personName(p)} for their letter.`); }
  return p;
}

// Paint or clear a zone on an empty tile you own. kind: 1 homes, 2 shops, 3 industry, 0 to clear.
export function canZone(s, i, kind) {
  if (s.status !== 'alive') return { ok: false, reason: 'This city has fallen.' };
  if (!owns(s, i)) return { ok: false, reason: 'You don’t own this land yet.' };
  if (kind && s.grid[i] !== T.EMPTY) return { ok: false, reason: 'Zones go on empty land.' };
  if (kind && terrainAt(s, i) === 2) return { ok: false, reason: 'You can’t zone water.' };
  if (s.zone[i] === kind) return { ok: false, reason: 'Already zoned that way.' };
  if (kind && s.money < ZONE_COST) return { ok: false, reason: `Needs $${ZONE_COST}.` };
  return { ok: true };
}
export function zone(s, i, kind) {
  const r = canZone(s, i, kind);
  if (!r.ok) return r;
  if (kind) s.money -= ZONE_COST;
  s.zone[i] = kind;
  return { ok: true, cost: kind ? ZONE_COST : 0 };
}
