// Turns the simulation's head counts into named people, Sims-style.
// Everything is derived deterministically, so the same city shows the same people.
import { T, B, PLOT } from './constants.js';
import { students, neighbours } from './sim.js';

const FIRST = ['Ava', 'Noah', 'Mia', 'Leo', 'Zara', 'Kai', 'Ella', 'Omar', 'Ivy', 'Luca', 'Aisha', 'Finn', 'Maya', 'Ravi', 'Chloe', 'Jonah',
  'Sofia', 'Eli', 'Nadia', 'Theo', 'Hana', 'Mateo', 'Grace', 'Arjun', 'Lily', 'Sam', 'Yara', 'Oscar', 'Ruby', 'Tariq', 'Elena', 'Jack',
  'Amara', 'Hugo', 'Priya', 'Felix', 'Leila', 'Ben', 'Mei', 'Diego', 'Isla', 'Kofi', 'Nina', 'Max', 'Rosa', 'Yusuf', 'Clara', 'Dev',
  'Freya', 'Tom', 'Anya', 'Ezra', 'Lena', 'Ari', 'Zoe', 'Malik', 'Iris', 'Sami', 'Olive', 'Nikos'];
export const SURNAMES = ['Nguyen', 'Okafor', 'Papadopoulos', 'Smith', 'Kowalski', 'García', 'Chen', 'Haddad', 'Ivanova', 'Silva', 'Kaur',
  'Tanaka', 'Murphy', 'Rossi', 'Mensah', 'Kim', 'Novak', 'Ali', 'Jensen', 'Costa', 'Walker', 'Fernando', 'Nakamura', 'Petrov', 'Obi',
  'Laurent', 'Doyle', 'Sato', 'Horvat', 'Tran', 'Kelly', 'Moreau', 'Ahmed', 'Lindqvist', 'Reyes', 'Sharma'];

export const ROLES = {
  builder: { label: 'Builder', colour: '#e79a1f' },
  teacher: { label: 'Teacher', colour: '#8a5bd6' },
  pro: { label: 'Professional', colour: '#3b7ddd' },
  unskilled: { label: 'Worker', colour: '#2f9e5a' },
  student: { label: 'Student', colour: '#e0588e' },
};

export function h32(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x85ebca6b, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const surnameFor = (seed, i) => SURNAMES[Math.floor(h32(seed, i) * SURNAMES.length)];

function nearest(s, from, type) {
  let best = -1, bd = Infinity;
  const fx = from % PLOT, fy = (from / PLOT) | 0;
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== type || s.cond[i] <= 0 || s.queue.some((q) => q.i === i && !q.up)) continue;
    const d = Math.abs(i % PLOT - fx) + Math.abs(((i / PLOT) | 0) - fy);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// The building at the end of a trip: the path ends on a road next to it (or on the hall).
function destination(s, path, types) {
  if (!path?.length) return -1;
  const end = path[path.length - 1];
  if (s.grid[end] === T.HALL) return end;
  for (const n of neighbours(end)) if (types.includes(s.grid[n]) && s.cond[n] > 0) return n;
  return end;
}

function thought(p, home) {
  if (p.role === 'student') return p.job >= 0 ? 'Studying hard. Can’t wait to graduate.' : 'Waiting for a school seat.';
  if (p.role !== 'builder' && !p.employed) return 'Looking for work. Any jobs going?';
  if (home.workSucc < 0.5) return 'Stuck in traffic again. The roads are jammed.';
  if (home.shopSucc < 0.5) return 'The shops are too hard to get to.';
  if (!home.park && p.mood < 0.7) return 'Wish there was a park nearby.';
  if (home.cond < 40) return 'The house is falling apart.';
  if (p.role === 'builder') return 'Busy on the building sites.';
  if (p.mood >= 0.8) return 'Loves living here.';
  return 'Doing fine. Could be better.';
}

// Returns { households, people }. seed makes names differ between plots.
export function roster(s, traffic, seed) {
  if (!traffic) return { households: [], people: [] };
  const roles = [];
  const add = (r, n) => { for (let k = 0; k < n; k++) roles.push(r); };
  add('builder', s.pop.builder); add('teacher', s.pop.teacher); add('pro', s.pop.pro);
  add('student', students(s)); add('unskilled', s.pop.unskilled);
  // Spread roles through the city without changing who's who every tick.
  const order = roles.map((r, k) => ({ r, key: h32(seed + 7, k) })).sort((a, b) => a.key - b.key).map((o) => o.r);

  const homes = [...traffic.homes].sort((a, b) => a.i - b.i);
  const counts = homes.map((h) => Math.floor(h.r));
  let left = order.length - counts.reduce((a, b) => a + b, 0);
  const byFrac = homes.map((h, k) => [h.r - Math.floor(h.r), k]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; left > 0 && j < byFrac.length * 3; j++) {
    const k = byFrac[j % byFrac.length][1];
    if (counts[k] < Math.round(homes[k].cap)) { counts[k]++; left--; }
  }

  const school = (from) => nearest(s, from, T.SCHOOL);
  const households = [], people = [];
  let n = 0;
  homes.forEach((home, k) => {
    if (!counts[k]) return;
    const surname = surnameFor(seed, home.i);
    const used = new Set();
    const cond = s.grid[home.i] === T.HALL ? 100 : s.cond[home.i];
    const hh = { i: home.i, surname, members: [], happy: home.happy, workSucc: home.workSucc, shopSucc: home.shopSucc, park: home.park, cond,
      workPath: home.workPath, shopPath: home.shopPath };
    const workAt = destination(s, home.workPath, [T.WORK, T.SHOP, T.SCHOOL]);
    for (let m = 0; m < counts[k] && n < order.length; m++, n++) {
      const role = order[n];
      const r1 = h32(seed + home.i, m), r2 = h32(seed + home.i * 3 + 1, m);
      const age = role === 'student' ? 17 + Math.floor(r2 * 8) : 20 + Math.floor(r2 * 48);
      const p = {
        id: `${home.i}-${m}`, first: '', last: surname, age, role, home: home.i,
        employed: role === 'builder' || role === 'student' || h32(seed + 99, n) < traffic.employmentRate,
        mood: Math.max(0, Math.min(1, home.happy + (h32(seed + 5, n) - 0.5) * 0.14)),
      };
      let f = Math.floor(r1 * FIRST.length);
      while (used.has(f)) f = (f + 7) % FIRST.length;
      used.add(f);
      p.first = FIRST[f];
      if (role === 'teacher' || role === 'student') p.job = school(home.i);
      else if (role === 'builder') p.job = s.queue.length ? s.queue[0].i : -1;
      else p.job = p.employed ? workAt : -1;
      p.jobName = p.job >= 0 ? (s.grid[p.job] === T.ROAD ? 'Out and about' : B[s.grid[p.job]].name) : role === 'builder' ? 'Between jobs' : 'None';
      if (role === 'builder' && p.job >= 0) p.jobName = `Building a ${B[s.grid[p.job]].name.toLowerCase()}`;
      p.thought = thought(p, hh);
      hh.members.push(p);
      people.push(p);
    }
    households.push(hh);
  });
  return { households, people };
}
