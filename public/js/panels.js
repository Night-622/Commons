// HTML for the side drawer and the build catalogue. Pure functions: main.js supplies data and wires up buttons.
import { T, B, GOALS, WAGE, TRADE_PER_LINK, MAX_LINKS, CATS, BUILDINGS, EDU, LEVEL } from './constants.js';
import { ROLES, roleOf, jobText, family, healthText, moodReasons, thought, personName } from './people.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.floor(n)).toLocaleString()}`;
export const pct = (n) => `${Math.round(n * 100)}%`;
const lvl = (v) => (v >= 0.7 ? 'ok' : v >= 0.4 ? 'mid' : 'bad');
export const bar = (label, v, cls = '') => `<span class="bar ${cls}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i data-l="${lvl(v)}" style="width:${Math.max(4, Math.min(1, v) * 100)}%"></i></span>`;
const head = (title, extra = '<span class="fill"></span>') => `<div class="phead"><h2>${title}</h2>${extra}<button class="iconbtn" type="button" data-close-drawer aria-label="Close panel">${icon('i-close')}</button></div>`;

export function avatar(p, size = '') {
  const n = personName(p).split(' ');
  return `<span class="avatar-sm ${size}" style="--role:${ROLES[roleOf(p)].colour}" aria-hidden="true">${esc(n[0][0] + n[1][0])}</span>`;
}
const personRow = (s, plan, p) => `<button type="button" class="person" data-person="${p.i}">
  ${avatar(p)}<span class="pmain"><b>${esc(personName(p))}${p.ill ? ` <span class="pill-s bad">${healthText(p)}</span>` : ''}</b>
  <small>${p.a}, ${esc(jobText(s, p))}</small><em>“${esc(thought(s, plan, p))}”</em></span>${bar(`Mood`, p.m, 'tiny')}</button>`;

// ---------- goals ----------
export function goalsPanel(state) {
  const done = state.goalsDone.length;
  return `${head('Goals', `<span class="soft num fill">${done} of ${GOALS.length}</span>`)}
    <div class="progress"><i style="width:${(done / GOALS.length) * 100}%"></i></div>
    <ul class="goal-list">${GOALS.map((g) => {
      const ok = state.goalsDone.includes(g.id);
      return `<li class="${ok ? 'done' : ''}"><span class="tick">${ok ? icon('i-check') : ''}</span><span>${g.text}${ok ? '<span class="sr-only"> (done)</span>' : ''}</span><b class="num">${money(g.reward)}</b></li>`;
    }).join('')}</ul>`;
}

// ---------- people ----------
export const PEOPLE_FILTERS = [
  ['all', 'Everyone', () => true],
  ['work', 'Working', (p) => roleOf(p) === 'worker'],
  ['seeking', 'Need work', (p) => roleOf(p) === 'seeking'],
  ['kids', 'Children', (p) => p.a < 18],
  ['study', 'Studying', (p) => p.sc >= 0],
  ['sick', 'Sick', (p) => p.ill > 0],
  ['unhappy', 'Unhappy', (p) => p.m < 0.45],
  ['old', 'Retired', (p) => roleOf(p) === 'retired'],
];
export function peoplePanel(s, plan, filter, q) {
  const f = PEOPLE_FILTERS.find((x) => x[0] === filter) || PEOPLE_FILTERS[0];
  const needle = q.trim().toLowerCase();
  const list = s.people.filter(f[2]).filter((p) => !needle || `${personName(p)} ${jobText(s, p)}`.toLowerCase().includes(needle)).sort((a, b) => a.m - b.m);
  const counts = Object.fromEntries(PEOPLE_FILTERS.map(([k, , fn]) => [k, s.people.filter(fn).length]));
  const homes = new Set(s.people.map((p) => p.h)).size;
  const shown = list.slice(0, 120);
  return `${head('People', `<span class="soft num fill">${s.people.length} residents in ${homes} homes</span>`)}
    <div class="chips" role="radiogroup" aria-label="Show">${PEOPLE_FILTERS.map(([k, label]) =>
      `<button type="button" role="radio" class="chip" aria-checked="${k === f[0]}" data-filter="${k}">${label} <b class="num">${counts[k]}</b></button>`).join('')}</div>
    <label class="search">${icon('i-search')}<input type="search" id="people-q" placeholder="Search by name or job" value="${esc(q)}" aria-label="Search people"></label>
    <p class="soft small">Least happy first. Click someone to see their life.</p>
    <ul class="people" id="people-list">${shown.map((p) => `<li>${personRow(s, plan, p)}</li>`).join('')}</ul>
    ${list.length > shown.length ? `<p class="soft small center">Showing 120 of ${list.length}. Search to narrow it down.</p>` : ''}
    ${!list.length ? `<p class="empty">${s.people.length ? 'Nobody matches.' : 'No one lives here yet. Build homes next to roads.'}</p>` : ''}`;
}

export function personCard(s, plan, p, now) {
  const fam = family(s, p);
  const rel = (label, q) => q ? `<button type="button" class="relation" data-person="${q.i}">${avatar(q)}<span class="pmain"><b>${esc(personName(q))}</b><small>${label}, ${q.a}</small></span></button>` : '';
  const reasons = moodReasons(s, plan, p);
  return `<button class="iconbtn close" type="button" data-close-drawer aria-label="Close">${icon('i-close')}</button>
    <button class="linkbtn backlink" type="button" data-panel-go="people">← All people</button>
    <div class="pcard">${avatar(p, 'lg')}<div><h2>${esc(personName(p))}</h2><p class="soft">${p.a} years old. ${ROLES[roleOf(p)].label}.</p></div></div>
    <div class="nowline">${icon('i-look')}<span>${esc(now)}</span></div>
    <p class="quote">“${esc(thought(s, plan, p))}”</p>
    <div class="kv"><span>Mood</span>${bar('Mood', p.m, 'small')}</div>
    <div class="kv"><span>Health</span><b>${healthText(p)}</b></div>
    <div class="kv"><span>Education</span><b>${EDU[p.e]}${p.sc >= 0 && p.a >= 5 ? ', studying' : ''}</b></div>
    <div class="kv"><span>Day to day</span><b class="right">${esc(jobText(s, p))}</b></div>
    ${p.cs ? '<div class="kv"><span>Court</span><b>Waiting for a hearing</b></div>' : ''}
    ${reasons.length ? `<h3 class="sub">What’s on their mind</h3><ul class="reasons">${reasons.map(([v, t]) => `<li class="${v > 0 ? 'up' : 'down'}"><span aria-hidden="true">${v > 0 ? '+' : '−'}</span>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${fam.partner || fam.parents.length || fam.kids.length || fam.household.length ? `<h3 class="sub">Family and home</h3><div class="relations">
      ${rel('Partner', fam.partner)}${fam.parents.map((q) => rel('Parent', q)).join('')}${fam.kids.map((k) => rel('Child', k)).join('')}
      ${fam.household.filter((q) => q !== fam.partner && !fam.parents.includes(q) && !fam.kids.includes(q)).map((q) => rel('Lives with', q)).join('')}</div>` : ''}
    <div class="actions">
      <button class="btn primary" type="button" data-do="follow" data-arg="${p.i}">${icon('i-car')}Follow ${esc(personName(p).split(' ')[0])}</button>
      <button class="btn" type="button" data-do="home" data-arg="${p.h}">${icon('i-house')}Show their home</button>
    </div>`;
}

// ---------- stats ----------
function spark(values, colour, fmt) {
  if (values.length < 2) return '<p class="soft small">A chart appears after two days.</p>';
  const w = 240, h = 48, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, k) => `${(k / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="From ${fmt(values[0])} to ${fmt(values.at(-1))} over ${values.length} days">
    <polyline points="0,${h} ${pts} ${w},${h}" fill="${colour}" fill-opacity=".12" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    <div class="spark-axis"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>`;
}
export function statsPanel(ctx, tab) {
  const { state: s, totals, plan, census: c } = ctx;
  const tabs = [['overview', 'People'], ['services', 'Services'], ['budget', 'Budget'], ['history', 'History']];
  let body = '';
  if (tab === 'overview') {
    const ages = [['Under 5', c.toddlers, '#f2a3c0'], ['5 to 11', c.kids, '#e0588e'], ['12 to 17', c.teens, '#c04a86'], ['18 to 64', c.adults, '#3b7ddd'], ['65 and over', c.seniors, '#7c8a90']];
    const max = Math.max(1, ...ages.map((a) => a[1]));
    body = `<h3 class="sub">Ages</h3>${ages.map(([l, n, col]) => `<div class="hbar"><span>${l}</span><i style="width:${(n / max) * 100}%;background:${col}"></i><b class="num">${n}</b></div>`).join('')}
      <h3 class="sub">Adults' education</h3>${EDU.map((l, k) => `<div class="hbar"><span>${l}</span><i style="width:${(c.edu[k] / Math.max(1, ...c.edu)) * 100}%;background:#8a5bd6"></i><b class="num">${c.edu[k]}</b></div>`).join('')}
      <h3 class="sub">Work</h3>
      <div class="grid2"><div class="kv"><span>Working</span><b class="num">${c.employed}</b></div><div class="kv"><span>Need work</span><b class="num">${c.seeking}</b></div>
      <div class="kv"><span>Builders</span><b class="num">${c.builders}</b></div><div class="kv"><span>At home with kids</span><b class="num">${c.carers}</b></div>
      <div class="kv"><span>At university</span><b class="num">${c.uni}</b></div><div class="kv"><span>Jobs in town</span><b class="num">${totals.jobs}</b></div></div>`;
  } else if (tab === 'services') {
    const seats = (st) => totals.seats[st] || 0;
    const row = (l, used, cap, a, b) => `<div class="cap"><span>${l}</span><span class="num soft">${used} ${a}, ${cap} ${b}</span>${bar(l, cap ? Math.min(1, cap / Math.max(1, used)) : 0)}</div>`;
    body = `<h3 class="sub">Schools</h3>
      ${row('Daycare', c.toddlers, seats('daycare'), 'under 5', 'places')}${row('Primary', c.kids, seats('primary'), 'children', 'seats')}
      ${row('High school', c.teens, seats('high'), 'teens', 'seats')}${row('Homes', c.total, totals.homes, 'people', 'homes')}
      <h3 class="sub">Health and safety</h3>
      <div class="grid2"><div class="kv"><span>Sick now</span><b class="num">${c.sick}</b></div><div class="kv"><span>Treated yesterday</span><b class="num">${s.stats.treated || 0}</b></div>
      <div class="kv"><span>Crimes yesterday</span><b class="num">${s.stats.crimes || 0}</b></div><div class="kv"><span>Court cases waiting</span><b class="num">${s.cases}</b></div>
      <div class="kv"><span>Births, all time</span><b class="num">${s.counters.births}</b></div><div class="kv"><span>Deaths, all time</span><b class="num">${s.counters.deaths}</b></div></div>
      <h3 class="sub">Getting around</h3>
      ${(() => { const by = { car: 0, bike: 0, walk: 0, bus: 0, train: 0 }; for (const t of plan?.trips || []) by[t.mode]++; const n = Math.max(1, Object.values(by).reduce((a, b) => a + b, 0));
        const modes = [['car', 'Car', '#3b7ddd'], ['bus', 'Bus', '#f2b233'], ['train', 'Train', '#d8463a'], ['bike', 'Bike', '#2f9e5a'], ['walk', 'Walk', '#e79a1f']];
        return `<div class="stack-bar">${modes.map(([k, , col]) => by[k] ? `<i style="flex:${by[k]};background:${col}"></i>` : '').join('')}</div>
        <ul class="legend">${modes.map(([k, l, col]) => `<li><i style="background:${col}"></i>${l}<b class="num">${pct(by[k] / n)}</b></li>`).join('')}<li><i style="background:#8a5bd6"></i>Late trips<b class="num">${plan?.failedTrips || 0}</b></li></ul>
        <div class="grid2"><div class="kv"><span>Buses running</span><b class="num">${plan?.busLoop?.buses || 0}</b></div><div class="kv"><span>Train lines</span><b class="num">${plan?.trainLines?.length || 0}</b></div>
        <div class="kv"><span>Out-of-town commuters</span><b class="num">${s.people.filter((p) => p.oj).length}</b></div><div class="kv"><span>Rail links</span><b class="num">${s.railLinks || 0}</b></div></div>`; })()}`;
  } else if (tab === 'budget') {
    const st = s.stats, by = st.byClass || {}, up = st.upkeepBy || {};
    const inRows = [['Basic jobs', by.basic, `$${WAGE[0]} a worker`], ['Skilled jobs', by.skilled, `$${WAGE[1]} a worker`], ['Degree jobs', by.degree, `$${WAGE[2]} a worker`],
      ['Unemployed', by.benefits, ''], ['Trade with neighbours', by.trade, `$${TRADE_PER_LINK} a link, up to ${MAX_LINKS}`]];
    const outRows = Object.entries(up).sort((a, b) => b[1] - a[1]).map(([t, v]) => [B[t].name, v]);
    const net = (st.income || 0) - (st.upkeep || 0);
    body = `<p class="soft small">Yesterday. Tax is scaled by mood: at ${pct(s.happiness)} mood you collect ${pct(Math.min(1, Math.max(0, (s.happiness - 0.15) / 0.7)))} of full tax. Sick people don't work or pay.</p>
      <h3 class="sub">Income <b class="num good">+${money(st.income || 0)}</b></h3>
      ${inRows.map(([l, v, n]) => `<div class="kv"><span>${l}${n ? `<small>${n}</small>` : ''}</span><b class="num">${money(v || 0)}</b></div>`).join('')}
      <h3 class="sub">Upkeep <b class="num bad">−${money(st.upkeep || 0)}</b></h3>
      ${outRows.length ? outRows.map(([l, v]) => `<div class="kv"><span>${l}</span><b class="num">${money(v)}</b></div>`).join('') : '<p class="soft small">Nothing to maintain yet.</p>'}
      <div class="total ${net < 0 ? 'neg' : ''}"><span>Daily balance</span><b class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></div>`;
  } else {
    const h = s.history;
    body = `<div class="chart"><div class="chart-h"><span>${icon('i-people')}Population</span><b class="num">${s.people.length}</b></div>${spark(h.map((x) => x.pop), '#3b7ddd', (v) => v)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-coin')}Money</span><b class="num">${money(s.money)}</b></div>${spark(h.map((x) => x.money), '#c98a0e', money)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-mood')}Mood</span><b class="num">${pct(s.happiness)}</b></div>${spark(h.map((x) => x.mood), '#2f9e5a', (v) => v + '%')}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-chart')}Daily balance</span><b class="num">${money(h.at(-1)?.net ?? 0)}</b></div>${spark(h.map((x) => x.net), '#8a5bd6', money)}</div>`;
  }
  return `${head('City stats')}
    <div class="seg tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-stats-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ppane">${body}</div>`;
}

// ---------- news ----------
const NEWS_ICON = { good: 'i-check', warn: 'i-alert', info: 'i-people', event: 'i-spark' };
export function newsPanel(state, unseenFrom) {
  const log = state.log.map((e, k) => ({ ...e, n: k })).reverse();
  return `${head('News')}
    ${log.length ? `<ul class="news">${log.map((e) => `<li class="n-${e.k} ${e.n >= unseenFrom ? 'new' : ''}">
      <span class="nicon">${icon(NEWS_ICON[e.k] || 'i-people')}</span><span class="ntext">${esc(e.t)}<small>Day ${e.d}, ${e.h ?? 0}:00</small></span></li>`).join('')}</ul>`
      : '<p class="empty">Nothing yet. Births, graduations, illness, crime and events will appear here.</p>'}`;
}

// ---------- chat ----------
export function chatPanel(ctx) {
  const { messages, me, world, colourOf } = ctx;
  const time = (m) => (m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now');
  return `${head('Chat', `<span class="soft small fill">${esc(world.name)}</span>`)}
    <ul class="chat" id="chat-list" aria-live="polite">${messages.length ? messages.map((m) => `
      <li class="${m.uid === me ? 'mine' : ''}"><span class="avatar-sm" style="--role:${colourOf(m.uid)}" aria-hidden="true">${esc((m.name || '?')[0].toUpperCase())}</span>
        <div><span class="who"><b>${esc(m.name)}</b> <small>${esc(m.city || '')}, ${time(m)}</small></span><p>${esc(m.text)}</p></div></li>`).join('')
      : '<li class="empty">No messages yet. Say hello to your neighbours.</li>'}</ul>
    <form id="chat-form" class="chat-form"><input id="chat-text" maxlength="280" autocomplete="off" placeholder="Message everyone in ${esc(world.name)}" aria-label="Message">
      <button class="btn primary" type="submit">Send</button></form>
    <p class="soft small">Everyone in this world can read these. Be kind.</p>`;
}

// ---------- world ----------
export function worldPanel(ctx) {
  const { world, worlds, neighbours, ruins, state, isOwnerOfWorld } = ctx;
  return `${head('World')}
    <div class="world-card"><span class="wbadge">${icon(world.private ? 'i-lock' : 'i-globe')}</span>
      <div><b>${esc(world.name)}</b><small>${world.private ? 'Private world' : 'Everyone plays here'}${ctx.plotCount ? `, ${ctx.plotCount} cities` : ''}</small></div></div>
    ${world.private && world.code ? `<div class="codebox"><span>Invite code</span><b class="num">${world.code}</b><button class="btn" type="button" data-copy="${world.code}">Copy</button></div>
      <p class="soft small">${isOwnerOfWorld ? 'You made this world. ' : ''}Anyone with the code can join and get a plot here.</p>` : ''}
    <h3 class="sub">${icon('i-link')}Neighbours</h3>
    <p class="soft small">Put a road on your plot's edge where a neighbour has a road at the same spot. Each link earns trade and lifts mood, for both of you.</p>
    ${neighbours.length ? `<ul class="nlist">${neighbours.map((n) => `<li><button type="button" class="nrow" data-goto="${n.px},${n.py}">
      <span class="dir">${n.side}</span><span class="pmain"><b>${esc(n.name)}</b><small>${n.status === 'ruins' ? 'Ruins' : `Mayor ${esc(n.ownerName)}, ${n.pop} people`}</small></span>
      <span class="links ${n.links ? 'on' : ''}">${n.links ? `${n.links} link${n.links > 1 ? 's' : ''}` : 'Not linked'}</span></button></li>`).join('')}</ul>`
      : '<p class="empty small">No neighbours yet. New players will settle next to you.</p>'}
    <h3 class="sub">${icon('i-flag')}Ruins you could move to</h3>
    <p class="soft small">Start again on a fallen city's land. Your current city becomes ruins and you take half your money.</p>
    ${ruins.length ? `<ul class="nlist">${ruins.map((r) => `<li class="ruin"><span class="pmain"><b>Ruins of ${esc(r.name)}</b><small>Reached ${r.peakPop} people, lasted ${r.day} days</small></span>
      <button class="btn" type="button" data-goto="${r.px},${r.py}">View</button><button class="btn" type="button" data-move="${r.id}">Move here</button></li>`).join('')}</ul>`
      : '<p class="empty small">No ruins in this world right now.</p>'}
    <h3 class="sub">${icon('i-map')}Your worlds</h3>
    <ul class="nlist">${worlds.map((w) => `<li><span class="pmain"><b>${esc(w.name)}</b><small>${w.private ? 'Private' : 'Public'}</small></span>
      ${w.id === world.id ? '<span class="tag">Playing</span>' : `<button class="btn" type="button" data-world="${w.id}">Switch</button>`}</li>`).join('')}</ul>
    <div class="twoforms">
      <form id="world-create" class="miniform"><label class="field"><span>Start a private world</span>
        <span class="inline"><input id="world-name" maxlength="40" placeholder="World name" required><button class="btn primary" type="submit">Create</button></span></label></form>
      <form id="world-join" class="miniform"><label class="field"><span>Join with a code</span>
        <span class="inline"><input id="world-code" maxlength="6" placeholder="ABC123" autocomplete="off" required><button class="btn" type="submit">Join</button></span></label></form>
      <p id="world-msg" class="formmsg" role="alert"></p>
    </div>`;
}

// ---------- build catalogue ----------
export function gives(t) {
  const d = B[t];
  const bits = [];
  if (d.homes) bits.push(`${d.homes} homes`);
  if (d.jobs) bits.push(d.jobs.map(([title, e, n]) => `${n} ${title.toLowerCase()}${n > 1 ? 's' : ''}${e ? ` (${EDU[e].toLowerCase()})` : ''}`).join(', '));
  if (d.school) bits.push(`${d.school.seats} ${d.school.stage === 'daycare' ? 'places' : 'seats'}`);
  if (d.care) bits.push(`${d.care.n} patients a day`);
  if (d.visits) bits.push(`${d.visits.n} visitors a day`);
  if (d.serves) bits.push(`feeds ${d.serves}`);
  if (d.radius) bits.push(`${d.radius}-tile reach`);
  if (d.cases) bits.push(`${d.cases} cases a day`);
  if (d.catchment) bits.push(`serves homes within ${d.catchment} tiles`);
  if (d.graves) bits.push(`${d.graves} graves`);
  return bits.join('. ');
}
export function catalogHtml(ctx) {
  const { s, tile, cat, avail } = ctx;
  const list = BUILDINGS.filter((t) => cat === 'all' || B[t].cat === cat);
  const x = tile % 24 + 1, y = Math.floor(tile / 24) + 1;
  return `<div class="cat-head"><div><h2 id="catalog-title">Build on tile ${x}, ${y}</h2><small class="soft">You have <b>${money(s.money)}</b>. Staffed buildings need people with the right education.</small></div>
      <button class="iconbtn" type="button" data-cat-close aria-label="Close">${icon('i-close')}</button></div>
    <div class="chips cat-tabs" role="tablist">${[['all', 'All'], ...CATS].map(([k, l]) => `<button type="button" role="tab" class="chip" aria-checked="${k === cat}" data-cat="${k}">${l}</button>`).join('')}</div>
    <div class="cat-grid">${list.map((t) => {
      const a = avail(t);
      return `<button type="button" class="card ${a.ok ? '' : a.locked ? 'locked' : 'short'}" data-build="${t}" ${a.locked ? 'aria-disabled="true"' : ''}
        aria-label="${B[t].name}, $${B[t].cost}. ${esc(B[t].blurb)} ${a.ok ? '' : esc(a.reason)}">
        <canvas class="thumb" data-type="${t}" aria-hidden="true"></canvas>
        <span class="cname">${B[t].name}</span><span class="ccost num">$${B[t].cost}</span>
        <span class="cgives">${esc(gives(t))}</span>
        ${a.ok ? '' : `<span class="cwhy">${a.locked ? icon('i-lock') : ''}${esc(a.reason)}</span>`}
      </button>`;
    }).join('')}</div>`;
}
