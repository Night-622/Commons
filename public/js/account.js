// Lifetime stats and achievements, kept in profiles/{uid}. Pure helpers; main.js does the saving.
import { T, FLAG_UNLOCKS } from './constants.js';
import { esc, icon, money } from './panels.js';

export const COLOURS = ['#ffc933', '#f0963a', '#e0588e', '#8a5bd6', '#3b7ddd', '#2f9e5a'];
// Mayor level: everything you've done across all your cities.
export function mayorXp(profile) {
  const l = { ...emptyLife(), ...(profile?.stats || {}) };
  return (l.built || 0) + (l.goals || 0) * 20 + (l.births || 0) * 3 + (l.graduates || 0) * 10 + (l.daysPlayed || 0) * 2 + (l.rebuilt || 0) * 30 + Object.keys(profile?.achievements || {}).length * 50;
}
export const mayorLevel = (profile) => Math.floor(Math.sqrt(mayorXp(profile) / 50)) + 1;
const levelXp = (lv) => (lv - 1) ** 2 * 50;
const LIFE_KEYS = ['built', 'land', 'moved', 'births', 'deaths', 'graduates', 'crimes', 'cases', 'treated', 'arrivals'];

export function emptyLife() {
  return { citiesFounded: 1, peakPop: 0, bestDays: 0, daysPlayed: 0, messages: 0, goals: 0, rebuilt: 0, links: 0, tutorial: 0, ...Object.fromEntries(LIFE_KEYS.map((k) => [k, 0])) };
}

// Adds what happened in this city since the last sync to the lifetime totals.
export function syncLife(profile, s, plotId) {
  profile.stats = { ...emptyLife(), ...(profile.stats || {}) };
  profile.base = profile.base || {};
  const base = profile.base[plotId] || (profile.base[plotId] = { ...s.counters, day: s.day, city: s.cityNo, goals: s.goalsDone.length });
  const st = profile.stats;
  let changed = false;
  if (base.city !== s.cityNo) { Object.assign(base, { ...s.counters, day: s.day, city: s.cityNo, goals: s.goalsDone.length }); st.rebuilt++; st.citiesFounded++; changed = true; }
  for (const k of LIFE_KEYS) {
    const d = (s.counters[k] || 0) - (base[k] || 0);
    if (d > 0) { st[k] += d; base[k] = s.counters[k]; changed = true; }
  }
  if (s.day > base.day) { st.daysPlayed += s.day - base.day; base.day = s.day; changed = true; }
  if (s.goalsDone.length > base.goals) { st.goals += s.goalsDone.length - base.goals; base.goals = s.goalsDone.length; changed = true; }
  if (s.people.length > st.peakPop) { st.peakPop = s.people.length; changed = true; }
  if (s.day > st.bestDays) { st.bestDays = s.day; changed = true; }
  if ((s.links || 0) > st.links) { st.links = s.links; changed = true; }
  if (s.flags?.tutorial && !st.tutorial) { st.tutorial = 1; changed = true; }
  return changed;
}

const count = (s, ...types) => s.grid.reduce((a, t, i) => a + (types.includes(t) && s.cond[i] > 0 ? 1 : 0), 0);
export const ACHIEVEMENTS = [
  { id: 'ground', name: 'Break ground', text: 'Build anything', test: ({ life }) => life.built >= 1, goal: 1, of: ({ life }) => life.built },
  { id: 'hood', name: 'Neighbourhood', text: 'Have 10 homes in one city', test: ({ s }) => count(s, T.HOUSE, T.APARTMENT, T.VILLA) >= 10, goal: 10, of: ({ s }) => count(s, T.HOUSE, T.APARTMENT, T.VILLA) },
  { id: 'town', name: 'Town', text: 'Reach 50 residents', test: ({ life }) => life.peakPop >= 50, goal: 50, of: ({ life }) => life.peakPop },
  { id: 'city', name: 'City', text: 'Reach 150 residents', test: ({ life }) => life.peakPop >= 150, goal: 150, of: ({ life }) => life.peakPop },
  { id: 'metro', name: 'Metropolis', text: 'Reach 300 residents', test: ({ life }) => life.peakPop >= 300, goal: 300, of: ({ life }) => life.peakPop },
  { id: 'baby', name: 'First steps', text: 'A baby is born in your city', test: ({ life }) => life.births >= 1, goal: 1, of: ({ life }) => life.births },
  { id: 'boom', name: 'Baby boom', text: '20 babies born', test: ({ life }) => life.births >= 20, goal: 20, of: ({ life }) => life.births },
  { id: 'grad', name: 'Scholar', text: 'Your first university graduate', test: ({ life }) => life.graduates >= 1, goal: 1, of: ({ life }) => life.graduates },
  { id: 'brains', name: 'Brain trust', text: '10 university graduates', test: ({ life }) => life.graduates >= 10, goal: 10, of: ({ life }) => life.graduates },
  { id: 'land', name: 'Landowner', text: 'Buy a parcel of land', test: ({ life }) => life.land >= 1, goal: 1, of: ({ life }) => life.land },
  { id: 'estate', name: 'Estate', text: 'Buy 10 parcels of land', test: ({ life }) => life.land >= 10, goal: 10, of: ({ life }) => life.land },
  { id: 'lift', name: 'Heavy lifting', text: 'Move a building', test: ({ life }) => life.moved >= 1, goal: 1, of: ({ life }) => life.moved },
  { id: 'healthy', name: 'Clean bill of health', text: '50+ people and nobody sick', test: ({ s }) => s.people.length >= 50 && !s.people.some((p) => p.ill) },
  { id: 'safe', name: 'Safe streets', text: '60+ people and no crime all day', test: ({ s }) => s.people.length >= 60 && s.stats.crimes === 0 && s.day > 1 },
  { id: 'justice', name: 'Justice served', text: 'The court hears 10 cases', test: ({ life }) => life.cases >= 10, goal: 10, of: ({ life }) => life.cases },
  { id: 'care', name: 'Healer', text: 'Treat 50 patients', test: ({ life }) => life.treated >= 50, goal: 50, of: ({ life }) => life.treated },
  { id: 'link', name: 'Good neighbour', text: 'Link a road with a neighbour', test: ({ life }) => life.links >= 1 },
  { id: 'sport', name: 'Sports town', text: 'Have 3 sports venues', test: ({ s }) => count(s, T.SPORTS, T.GYM, T.DOJO, T.POOL) >= 3, goal: 3, of: ({ s }) => count(s, T.SPORTS, T.GYM, T.DOJO, T.POOL) },
  { id: 'night', name: 'Night out', text: 'A cinema, a café and a library', test: ({ s }) => count(s, T.CINEMA) && count(s, T.CAFE) && count(s, T.LIBRARY) },
  { id: 'gens', name: 'Generations', text: 'Someone born here has a child', test: ({ s }) => s.people.some((p) => p.pa && s.people.find((q) => q.i === p.pa)?.b) },
  { id: 'aboard', name: 'All aboard', text: '30 people ride a bus or train in one day', test: ({ s }) => (s.stats.riders || 0) >= 30, goal: 30, of: ({ s }) => s.stats.riders || 0 },
  { id: 'commuter', name: 'Commuter belt', text: 'A resident commutes to a neighbouring city', test: ({ s }) => (s.stats.commuters || 0) >= 1 },
  { id: 'chat', name: 'Chatterbox', text: 'Send 10 chat messages', test: ({ life }) => life.messages >= 10, goal: 10, of: ({ life }) => life.messages },
  { id: 'rich', name: 'Deep pockets', text: 'Hold $20,000', test: ({ s }) => s.money >= 20000 },
  { id: 'survivor', name: 'Survivor', text: 'Keep a city running 30 days', test: ({ life }) => life.bestDays >= 30, goal: 30, of: ({ life }) => life.bestDays },
  { id: 'phoenix', name: 'Phoenix', text: 'Rebuild on ruins', test: ({ life }) => life.rebuilt >= 1 },
  { id: 'tour', name: 'Top of the class', text: 'Finish the tour', test: ({ life }) => life.tutorial >= 1 },
  { id: 'sunny', name: 'Here comes the sun', text: 'Power a city with only clean energy', test: ({ s }) => s.people.length >= 25 && count(s, T.SOLAR, T.WIND) >= 1 && !count(s, T.POWER) },
  { id: 'fresh', name: 'Fresh air', text: '80+ people and air quality above 90%', test: ({ s }) => s.people.length >= 80 && (s.stats.air ?? 0) >= 0.9 },
  { id: 'tourists', name: 'Tourist trap', text: '40 tourists in one day', test: ({ s }) => (s.stats.tourists || 0) >= 40, goal: 40, of: ({ s }) => s.stats.tourists || 0 },
  { id: 'stadium', name: 'Match day', text: 'Open a stadium', test: ({ s }) => count(s, T.STADIUM) >= 1 },
  { id: 'debtfree', name: 'Debt free', text: 'Pay off a bank loan', test: ({ s }) => !!s.flags?.repaid },
  { id: 'storm', name: 'Weathered the storm', text: 'Keep 50+ people through an earthquake or tornado', test: ({ s }) => !!s.stats.disaster && s.people.length >= 50 },
  { id: 'farm', name: 'Grow your own', text: 'Feed a household from an urban farm', test: ({ s }) => count(s, T.FARM) >= 1 && s.people.length >= 10 },
  { id: 'badge', name: 'Decorated', text: 'Earn a city badge', test: ({ s }) => (s._badges || 0) > 0 },
  // Hidden until earned.
  { id: 'honest', name: 'Clean hands', text: 'Hold an inquiry into a scandal', hidden: true, test: ({ s }) => !!s.flags?.inquiry },
  { id: 'hoarder', name: 'Scrooge', text: 'Hold $100,000', hidden: true, test: ({ s }) => s.money >= 100000 },
];

export function checkAchievements(profile, s) {
  profile.achievements = profile.achievements || {};
  const ctx = { s, life: profile.stats }, got = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    try { if (a.test(ctx)) { profile.achievements[a.id] = Date.now(); got.push(a); } } catch { /* partial data */ }
  }
  return got;
}

const STAT_ROWS = [
  ['peakPop', 'Biggest city', 'i-people'], ['daysPlayed', 'Days played', 'i-clock'], ['citiesFounded', 'Cities founded', 'i-flag'],
  ['built', 'Things built', 'i-hammer'], ['births', 'Babies born', 'i-house'], ['graduates', 'Graduates', 'i-school'],
  ['treated', 'Patients treated', 'i-mood'], ['cases', 'Court cases', 'i-lock'], ['land', 'Land bought', 'i-map'],
  ['deaths', 'Residents lost', 'i-tree'], ['goals', 'Goals completed', 'i-check'], ['messages', 'Messages sent', 'i-bell'],
];

export function accountHtml(ctx, tab) {
  const { user, mayor, profile, s, world, colour } = ctx;
  const guest = user.isAnonymous;
  const google = user.providerData.some((p) => p.providerId === 'google.com');
  const unlocked = Object.keys(profile.achievements || {}).length;
  const tabs = [['profile', 'Profile'], ['cities', 'Cities'], ['friends', 'Friends'], ['stats', 'Stats'], ['achievements', `Achievements ${unlocked}/${ACHIEVEMENTS.length}`], ['security', 'Account']];
  const life = { ...emptyLife(), ...(profile.stats || {}) };
  let body = '';
  if (tab === 'profile') {
    body = `<div class="acct big"><span class="avatar xl" style="background:${colour}" aria-hidden="true">${esc((mayor[0] || 'M').toUpperCase())}</span>
      <div><b>Mayor ${esc(mayor)}</b><small>${guest ? 'Guest on this device' : esc(user.email || 'Signed in with Google')}</small>
      <small>${esc(s.name)}, day ${s.day}, ${s.people.length} people. ${esc(world.name)}.</small></div></div>
      <label class="field"><span>Mayor name</span><span class="inline"><input id="acct-mayor" maxlength="20" value="${esc(mayor)}"><button class="btn" id="acct-mayor-save" type="button">Save</button></span></label>
      ${(() => { const lv = mayorLevel(profile), xp = mayorXp(profile), next = levelXp(lv + 1), cur = levelXp(lv);
        return `<div class="field"><span>Mayor level ${lv}</span><span class="bar"><i data-l="ok" style="width:${Math.max(4, ((xp - cur) / (next - cur)) * 100)}%"></i></span><small class="soft">${xp - cur} of ${next - cur} to level ${lv + 1}. Build, grow, finish goals and earn achievements.</small></div>
      <div class="field"><span>Town hall flag and badge colour</span><div class="swatches" role="radiogroup" aria-label="Flag colour">${FLAG_UNLOCKS.map(([need, c]) => need <= lv
        ? `<button type="button" role="radio" aria-checked="${c === colour}" data-colour="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`
        : `<button type="button" disabled class="locked" style="background:${c}" title="Unlocks at mayor level ${need}" aria-label="Locked until level ${need}"></button>`).join('')}</div>
        <small class="soft">Your flag flies over your town hall for everyone to see.</small></div>`; })()}
      <div class="grid2 minis">
        <div class="kv"><span>This city</span><b>${esc(s.name)}</b></div><div class="kv"><span>City number</span><b class="num">${s.cityNo}</b></div>
        <div class="kv"><span>Money</span><b class="num">${money(s.money)}</b></div><div class="kv"><span>Goals</span><b class="num">${s.goalsDone.length}</b></div>
      </div>`;
  } else if (tab === 'cities') {
    const list = ctx.cities || [];
    body = `<p class="soft small">Your council's cities in ${esc(world.name)}. Buy more by selecting unclaimed land that touches one of them (up to ${ctx.maxCities}).</p>
      <ul class="picklist">${list.map((c) => `<li><span><b>${esc(c.name)}</b> <small class="soft">${c.co ? `Co-mayor with ${esc(c.owner)}; ` : ''}${c.status === 'ruins' ? 'Ruins' : `${c.pop} people`}${c.here ? ', open now' : ''}</small></span>
        <span class="inline">${c.here ? '' : `<button class="btn small" type="button" data-open-city="${c.id}">Open</button>`}${c.co ? `<button class="btn small" type="button" data-leave-co="${c.id}">Step down</button>` : ''}</span></li>`).join('')}</ul>`;
  } else if (tab === 'friends') {
    const list = ctx.friends || [];
    body = `${ctx.coLocked ? '<p class="warn small">Co-mayors open when you finish chapter 4 of your path (Goals). You can add friends and message them now.</p>' : ''}<p class="soft small">Add friends from a neighbour’s city panel. Press Co to make a friend a co-mayor of ${esc(s.name)} (up to ${ctx.maxCo}): they can run it too. One of you plays at a time; the others watch, and can take over when the one playing is idle.</p>
      ${list.length ? `<ul class="picklist">${list.map((f) => `<li><span><b>${esc(f.name)}</b>${f.co ? ' <small class="good-t">Co-mayor here</small>' : ''}</span>
        <span class="inline">${ctx.canCo ? `<button class="btn small ${f.co ? '' : 'primary'}" type="button" data-co="${f.uid}" aria-pressed="${f.co}">${f.co ? 'Remove co' : 'Co'}</button>` : ''}<button class="btn small" type="button" data-dm-friend="${f.uid}|${esc(f.name)}">Message</button><button class="btn small" type="button" data-unfriend="${f.uid}">Remove</button></span></li>`).join('')}</ul>`
        : '<p class="soft">No friends yet. Select a neighbour’s city and press “Add as a friend”.</p>'}
      <p id="acct-msg" class="formmsg" role="alert"></p>`;
  } else if (tab === 'stats') {
    body = `<p class="soft small">Across every city you've run.</p>
      <div class="stat-tiles">${STAT_ROWS.map(([k, label, ic]) => `<div class="tile">${icon(ic)}<b class="num">${(life[k] || 0).toLocaleString()}</b><small>${label}</small></div>`).join('')}</div>`;
  } else if (tab === 'achievements') {
    const ach = profile.achievements || {};
    body = `<div class="progress"><i style="width:${(unlocked / ACHIEVEMENTS.length) * 100}%"></i></div>
      <ul class="ach">${ACHIEVEMENTS.map((a) => {
        const done = !!ach[a.id];
        const prog = !done && a.goal && a.of ? Math.min(a.goal, a.of({ s, life }) || 0) : null;
        if (a.hidden && !done) return `<li><span class="medal" aria-hidden="true">${icon('i-lock')}</span><span class="pmain"><b>Secret</b><small>Keep playing to find it.</small></span></li>`;
        return `<li class="${done ? 'done' : ''}"><span class="medal" aria-hidden="true">${done ? icon('i-trophy') : icon('i-lock')}</span>
          <span class="pmain"><b>${a.name}</b><small>${a.text}${prog !== null ? ` (${prog} of ${a.goal})` : ''}</small></span>
          ${done ? `<small class="when">${new Date(ach[a.id]).toLocaleDateString()}</small>` : ''}</li>`;
      }).join('')}</ul>`;
  } else {
    body = `${guest ? `<div class="callout"><h3>Keep your city safe</h3><p>Guest cities live only in this browser. Make it an account to play anywhere. Your city comes with you.</p>
        <label class="field"><span>Email</span><input id="up-email" type="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input id="up-pass" type="password" autocomplete="new-password" minlength="6"></label>
        <button class="btn primary wide" id="up-email-go" type="button">Save as an account</button>
        <button class="btn wide gbtn" id="up-google" type="button">Save with Google</button></div>`
      : !google && user.email ? '<button class="btn" id="acct-reset" type="button">Email me a password reset link</button>' : '<p class="soft">Signed in with Google.</p>'}
      <button class="btn" id="acct-export" type="button">Download a copy of my city</button>
      <button class="btn" id="acct-out" type="button">Sign out</button>
      <div class="danger-zone"><h3>Delete account</h3><p>Deletes your sign-in, stats and achievements for good. ${esc(s.name)} falls into ruins and stays on the map, where anyone can rebuild on it.</p>
        <button class="btn danger" id="acct-delete" type="button">Delete my account</button></div>`;
  }
  return `<div class="seg tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-acct-tab="${k}">${l}</button>`).join('')}</div>
    <div class="spane" role="tabpanel">${body}</div><p id="acct-msg" class="formmsg" role="alert"></p>`;
}
