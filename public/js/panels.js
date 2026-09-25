// HTML for the side drawer. Pure functions: main.js supplies the data and wires up the buttons.
import { T, B, GOALS, TAX, TRADE_PER_LINK, MAX_LINKS } from './constants.js';
import { ROLES } from './people.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.floor(n)).toLocaleString()}`;
export const pct = (n) => `${Math.round(n * 100)}%`;
const lvl = (v) => (v >= 0.7 ? 'ok' : v >= 0.4 ? 'mid' : 'bad');
export const bar = (label, v, cls = '') => `<span class="bar ${cls}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i data-l="${lvl(v)}" style="width:${Math.max(4, Math.min(1, v) * 100)}%"></i></span>`;
const head = (title, extra = '<span class="fill"></span>') => `<div class="phead"><h2>${title}</h2>${extra}<button class="iconbtn" type="button" data-close-drawer aria-label="Close panel">${icon('i-close')}</button></div>`;

export const initials = (p) => (p.first[0] + p.last[0]).toUpperCase();
export function avatar(p, size = '') {
  return `<span class="avatar-sm ${size}" style="--role:${ROLES[p.role].colour}" aria-hidden="true">${esc(initials(p))}</span>`;
}

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
  ['work', 'Working', (p) => p.role !== 'student' && p.employed],
  ['seeking', 'Need work', (p) => p.role !== 'student' && p.role !== 'builder' && !p.employed],
  ['students', 'Students', (p) => p.role === 'student'],
  ['unhappy', 'Unhappy', (p) => p.mood < 0.45],
];

export function peoplePanel(r, filter, q) {
  const f = PEOPLE_FILTERS.find((x) => x[0] === filter) || PEOPLE_FILTERS[0];
  const needle = q.trim().toLowerCase();
  const list = r.people.filter(f[2]).filter((p) => !needle || `${p.first} ${p.last} ${ROLES[p.role].label} ${p.jobName}`.toLowerCase().includes(needle));
  const counts = Object.fromEntries(PEOPLE_FILTERS.map(([k, , fn]) => [k, r.people.filter(fn).length]));
  const shown = list.slice(0, 150);
  return `${head('People', `<span class="soft num fill">${r.people.length} residents, ${r.households.length} homes</span>`)}
    <div class="chips" role="radiogroup" aria-label="Show">${PEOPLE_FILTERS.map(([k, label]) =>
      `<button type="button" role="radio" class="chip" aria-checked="${k === f[0]}" data-filter="${k}">${label} <b class="num">${counts[k]}</b></button>`).join('')}</div>
    <label class="search">${icon('i-search')}<input type="search" id="people-q" placeholder="Search by name or job" value="${esc(q)}" aria-label="Search people"></label>
    <ul class="people" id="people-list">${shown.map((p) => `
      <li><button type="button" class="person" data-person="${p.id}">
        ${avatar(p)}
        <span class="pmain"><b>${esc(p.first)} ${esc(p.last)}</b><small>${ROLES[p.role].label}, ${p.age}. ${esc(p.jobName)}</small><em>“${esc(p.thought)}”</em></span>
        ${bar(`${p.first}'s mood`, p.mood, 'tiny')}
      </button></li>`).join('')}</ul>
    ${list.length > shown.length ? `<p class="soft small center">Showing 150 of ${list.length}. Search to narrow it down.</p>` : ''}
    ${!list.length ? `<p class="empty">${r.people.length ? 'Nobody matches.' : 'No one lives here yet. Build houses next to roads.'}</p>` : ''}`;
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
  const { state, totals, traffic, pop } = ctx;
  const tabs = [['overview', 'Overview'], ['budget', 'Budget'], ['history', 'History']];
  let body = '';
  if (tab === 'overview') {
    const p = state.pop, groups = [['builder', p.builder], ['teacher', p.teacher], ['pro', p.pro], ['unskilled', p.unskilled], ['student', ctx.students]];
    const workforce = p.unskilled + p.teacher + p.pro;
    body = `<h3 class="sub">Who lives here</h3>
      <div class="stack-bar" role="img" aria-label="${groups.map(([k, n]) => `${n} ${ROLES[k].label.toLowerCase()}s`).join(', ')}">${groups.map(([k, n]) => n ? `<i style="flex:${n};background:${ROLES[k].colour}"></i>` : '').join('')}</div>
      <ul class="legend">${groups.map(([k, n]) => `<li><i style="background:${ROLES[k].colour}"></i>${ROLES[k].label}s<b class="num">${n}</b></li>`).join('')}</ul>
      <h3 class="sub">Capacity</h3>
      ${[['Homes', pop, totals.homes, 'people', 'homes'], ['Jobs', workforce, totals.jobs, 'workers', 'jobs'], ['School seats', ctx.students + p.unskilled, totals.seats, 'learners', 'seats'],
        ['Shop service', pop, totals.serves, 'people', 'served']].map(([l, used, cap, a, b]) =>
        `<div class="cap"><span>${l}</span><span class="num soft">${used} ${a}, ${cap} ${b}</span>${bar(l, cap ? Math.min(1, cap / Math.max(1, used)) : 0)}</div>`).join('')}
      <h3 class="sub">City</h3>
      <div class="grid2">
        <div class="kv"><span>Employment</span><b class="num">${pct(traffic?.employmentRate ?? 1)}</b></div>
        <div class="kv"><span>Neighbour links</span><b class="num">${state.links || 0}</b></div>
        <div class="kv"><span>Road tiles</span><b class="num">${totals.roads}</b></div>
        <div class="kv"><span>Buildings</span><b class="num">${Object.entries(totals.counts).filter(([k]) => +k !== T.ROAD).reduce((a, [, n]) => a + n, 0)}</b></div>
        <div class="kv"><span>Peak population</span><b class="num">${state.peakPop}</b></div>
        <div class="kv"><span>City number</span><b class="num">${state.cityNo}</b></div>
      </div>`;
  } else if (tab === 'budget') {
    const st = state.stats, by = st.byClass || {}, up = st.upkeepBy || {};
    const inRows = [['Workers', by.unskilled, `$${TAX.unskilled} each when employed`], ['Teachers', by.teacher, `$${TAX.teacher} each`], ['Professionals', by.pro, `$${TAX.pro} each`],
      ['Builders', by.builder, `$${TAX.builder} each`], ['Benefits from the unemployed', by.unemployed, ''], ['Trade with neighbours', by.trade, `$${TRADE_PER_LINK} a link, up to ${MAX_LINKS}`]];
    const outRows = Object.entries(up).sort((a, b) => b[1] - a[1]).map(([t, v]) => [`${B[t].name}s`, v]);
    const net = (st.income || 0) - (st.upkeep || 0);
    body = `<p class="soft small">Yesterday's money. Tax is scaled by mood: a ${pct(state.happiness)} mood city collects ${pct(Math.min(1, Math.max(0, (state.happiness - 0.15) / 0.7)))} of full tax.</p>
      <h3 class="sub">Income <b class="num good">+${money(st.income || 0)}</b></h3>
      ${inRows.map(([l, v, n]) => `<div class="kv"><span>${l}${n ? `<small>${n}</small>` : ''}</span><b class="num">${money(v || 0)}</b></div>`).join('')}
      <h3 class="sub">Upkeep <b class="num bad">−${money(st.upkeep || 0)}</b></h3>
      ${outRows.length ? outRows.map(([l, v]) => `<div class="kv"><span>${l}</span><b class="num">${money(v)}</b></div>`).join('') : '<p class="soft small">Nothing to maintain yet.</p>'}
      <div class="total ${net < 0 ? 'neg' : ''}"><span>Daily balance</span><b class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></div>`;
  } else {
    const h = state.history;
    body = `<div class="chart"><div class="chart-h"><span>${icon('i-people')}Population</span><b class="num">${ctx.pop}</b></div>${spark(h.map((x) => x.pop), '#3b7ddd', (v) => v)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-coin')}Money</span><b class="num">${money(state.money)}</b></div>${spark(h.map((x) => x.money), '#c98a0e', money)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-mood')}Mood</span><b class="num">${pct(state.happiness)}</b></div>${spark(h.map((x) => x.mood), '#2f9e5a', (v) => v + '%')}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-chart')}Daily balance</span><b class="num">${money(h.at(-1)?.net ?? 0)}</b></div>${spark(h.map((x) => x.net), '#8a5bd6', money)}</div>
      <p class="soft small">Last ${h.length} day${h.length === 1 ? '' : 's'}.</p>`;
  }
  return `${head('City stats')}
    <div class="seg tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-stats-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ppane">${body}</div>`;
}

// ---------- news ----------
const NEWS_ICON = { good: 'i-check', warn: 'i-alert', info: 'i-people', event: 'i-spark' };
export function newsPanel(state, unseenFrom) {
  const log = state.log.map((e, k) => ({ ...e, k })).reverse();
  return `${head('News')}
    ${log.length ? `<ul class="news">${log.map((e) => `<li class="n-${e.k} ${e.k >= unseenFrom ? 'new' : ''}">
      <span class="nicon">${icon(NEWS_ICON[e.k] || 'i-people')}</span><span class="ntext">${esc(e.t)}<small>Day ${e.d}</small></span></li>`).join('')}</ul>`
      : '<p class="empty">Nothing yet. News about your city will appear here: arrivals, graduates, events and warnings.</p>'}`;
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
    ${state.links ? `<p class="small good-t">You earn up to ${money(TRADE_PER_LINK * Math.min(MAX_LINKS, state.links))} a day from ${state.links} link${state.links > 1 ? 's' : ''}.</p>` : ''}

    <h3 class="sub">${icon('i-flag')}Ruins you could move to</h3>
    <p class="soft small">Start again on a fallen city's land. Your current city becomes ruins and you take half your money. The rubble stays.</p>
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
