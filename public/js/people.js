// How residents are described in the interface: roles, jobs, family, thoughts and why they feel the way they do.
import { B, ADULT, RETIRE, EDU, isHome } from './constants.js';
import { personName, FIRST } from './sim.js';

export const ROLES = {
  baby: { label: 'Toddler', colour: '#f2a3c0' },
  kid: { label: 'Pupil', colour: '#e0588e' },
  teen: { label: 'Teenager', colour: '#c04a86' },
  uni: { label: 'University student', colour: '#8a5bd6' },
  worker: { label: 'Working', colour: '#3b7ddd' },
  seeking: { label: 'Looking for work', colour: '#e79a1f' },
  carer: { label: 'Stay-at-home parent', colour: '#16a2b8' },
  retired: { label: 'Retired', colour: '#7c8a90' },
};

export function roleOf(p) {
  if (p.a < 5) return 'baby';
  if (p.a < 12) return 'kid';
  if (p.a < ADULT) return 'teen';
  if (p.sc >= 0) return 'uni';
  if (p.j >= 0) return 'worker';
  if (p.st) return 'carer';
  if (p.a >= RETIRE) return 'retired';
  return 'seeking';
}

const place = (s, i) => (i >= 0 && B[s.grid[i]] ? B[s.grid[i]].name : null);
export function jobText(s, p) {
  const r = roleOf(p);
  if (r === 'worker' && p.oj) return `Commutes to a job in the next city by ${p.oj === 'rail' ? 'train' : 'bus'}`;
  if (r === 'worker') return `${B[s.grid[p.j]].jobs[p.jt][0]} at the ${place(s, p.j).toLowerCase()}`;
  if (r === 'baby') return p.sc >= 0 ? 'At daycare' : 'At home with family';
  if (r === 'kid' || r === 'teen') return p.sc >= 0 ? `${place(s, p.sc)}${p.tu >= 0 ? ', plus tutoring' : ''}` : 'No school place';
  if (r === 'uni') return 'Studying at university';
  if (r === 'carer') return 'Caring for a toddler';
  if (r === 'retired') return 'Enjoying retirement';
  return EDU[p.e] === 'No schooling' ? 'Looking for work, no schooling' : `Looking for work (${EDU[p.e].toLowerCase()})`;
}

export function family(s, p) {
  const byId = (i) => s.people.find((x) => x.i === i);
  const parent = p.pa ? byId(p.pa) : null;
  const other = parent?.pt ? byId(parent.pt) : null;
  return {
    partner: p.pt ? byId(p.pt) : null,
    parents: [parent, other].filter(Boolean),
    kids: s.people.filter((x) => x.pa === p.i || (p.pt && x.pa === p.pt)),
    household: s.people.filter((x) => x.h === p.h && x !== p),
  };
}

export function healthText(p) {
  return p.ill === 3 ? 'Seriously ill' : p.ill === 2 ? 'Injured' : p.ill === 1 ? 'Unwell' : p.hp >= 80 ? 'Healthy' : 'A bit run down';
}

// The biggest things lifting or dragging someone's mood, in plain words.
export function moodReasons(s, plan, p) {
  const out = [];
  const add = (v, t) => out.push([v, t]);
  if (!isHome(s.grid[p.h])) add(-2, 'Has nowhere to live');
  else if (B[s.grid[p.h]].homeMood > 0) add(1, 'Loves their garden');
  else if (B[s.grid[p.h]].homeMood < 0) add(-1, 'Flat feels cramped');
  const r = roleOf(p);
  if (r === 'worker' || r === 'uni' || r === 'retired') add(1, r === 'worker' ? 'Has a job' : r === 'uni' ? 'Enjoying university' : 'Retired');
  if (r === 'seeking') add(-2, 'Can’t find work');
  if ((r === 'kid' || r === 'teen') && p.sc < 0) add(-2, 'No school place');
  const late = plan?.trips.find((t) => t.p === p.i && t.mode === 'car' && t.ok < 1);
  if (late) add(-1, 'Stuck in traffic');
  if (plan && !plan.shopFor.has(p.h)) add(-1, 'No grocer nearby');
  if (p.fun >= 0) add(1, `Going to the ${place(s, p.fun).toLowerCase()} tonight`);
  else if (p.a >= 3) add(-1, 'Nothing to do in the evenings');
  if (plan?.parks.has(p.h)) add(1, 'Park nearby');
  if (plan?.pollution.has(p.h)) add(-1, 'Factory noise');
  if (p.ill) add(-2, healthText(p));
  if (p.vt) add(-2, 'Was a victim of crime');
  if (p.gr) add(-2, 'Grieving');
  if (p.jy) add(2, 'Great news in the family');
  if (p.cs) add(-1, 'Waiting for a court date');
  return out.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 5);
}

export function thought(s, plan, p) {
  const worst = moodReasons(s, plan, p).find(([v]) => v < 0);
  const best = moodReasons(s, plan, p).find(([v]) => v > 0);
  const lines = {
    'Has nowhere to live': 'Where am I supposed to sleep tonight?', 'Can’t find work': 'Any jobs going? I have bills to pay.',
    'No school place': 'I want to go to school like my friends.', 'Stuck in traffic': 'Stuck in traffic again.',
    'No grocer nearby': 'The nearest grocer is miles away.', 'Nothing to do in the evenings': 'There’s nothing to do round here.',
    'Factory noise': 'That factory never stops.', 'Was a victim of crime': 'I don’t feel safe any more.', Grieving: 'I miss them.',
    'Flat feels cramped': 'I need more space.', 'Waiting for a court date': 'When is my hearing?',
  };
  if (worst && (p.m < 0.6 || worst[0] <= -2)) return lines[worst[1]] || `${worst[1]}.`;
  if (p.jy) return 'Best week ever.';
  if (best) return p.m >= 0.75 ? 'Loving life here.' : `${best[1]}. Not bad.`;
  return 'Doing fine.';
}

export const firstName = (p) => FIRST[p.f];
export { personName };
