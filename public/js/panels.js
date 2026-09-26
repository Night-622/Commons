// HTML for the side drawer and the build catalogue. Pure functions: main.js supplies data and wires up buttons.
import { REGIONAL, ALLIANCE_TRADE, REACTIONS, T, B, GOALS, WAGE, TRADE_PER_LINK, MAX_LINKS, CATS, BUILDINGS, EDU, LEVEL, POLICY, BONDS, INSURANCE, TECH, ERAS, TRAITS, CARBON_TAX, LOANS, LOAN_DAYS, CONGESTION_FEE, BADGES, RES, FOOD, TECH_BRANCHES, STORE_BASE } from './constants.js';
import { t as tr } from './i18n.js';
import { creditRating, greenShare, traitOf, hasTech, canResearch, eraOf, resourceStock } from './sim.js';
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
export function goalsPanel(state, daily) {
  const done = state.goalsDone.length;
  const wants = (state.wants || []).map((w) => ({ ...w, p: state.people.find((x) => x.i === w.p) })).filter((w) => w.p);
  return `${head('Goals', `<span class="soft num fill">${done} of ${GOALS.length}</span>`)}
    ${daily ? `<div class="weekly"><h3 class="sub">${icon('i-flag')}Today’s challenge</h3><p><b>${esc(daily.text)}</b></p>
      ${bar('Daily challenge', daily.got / daily.n)}<p class="soft small">${daily.got} of ${daily.n}. A new one each day.</p>
      ${daily.claimed ? '<p class="good-t small">Done for today. Come back tomorrow.</p>' : daily.done ? `<button class="btn primary" type="button" id="daily-claim">Collect ${money(200)}</button>` : ''}</div>` : ''}
    <h3 class="sub">${icon('i-people')}Requests from residents</h3>
    ${wants.length ? `<ul class="wants">${wants.map((w) => `<li>${avatar(w.p)}<span class="pmain"><b>${esc(personName(w.p))}</b>
      <small>Wants a ${B[w.t].name.toLowerCase()} within ${w.r} tiles of home. ${Math.max(0, 6 - (state.day - w.d))} days left.${w.fund >= 1 ? ` Neighbours have raised ${money(w.fund)} towards it.` : ''}</small></span>
      <b class="num reward">${money(w.reward)}</b><button class="btn" type="button" data-home="${w.p.h}">Show</button></li>`).join('')}</ul>`
      : '<p class="empty small">No requests right now. Residents ask for things as the city grows.</p>'}
    <h3 class="sub">${icon('i-flag')}Milestones</h3>
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
export function peoplePanel(s, plan, filter, q, favs = new Set()) {
  const filters = [['fav', 'Favourites', (p) => favs.has(p.i)], ...PEOPLE_FILTERS];
  const f = filters.find((x) => x[0] === filter) || filters[1];
  const needle = q.trim().toLowerCase();
  const list = s.people.filter(f[2]).filter((p) => !needle || `${personName(p)} ${jobText(s, p)}`.toLowerCase().includes(needle)).sort((a, b) => a.m - b.m);
  const counts = Object.fromEntries(filters.map(([k, , fn]) => [k, s.people.filter(fn).length]));
  const homes = new Set(s.people.map((p) => p.h)).size;
  const shown = list.slice(0, 120);
  return `${head('People', `<span class="soft num fill">${s.people.length} residents in ${homes} homes</span>`)}
    <div class="chips" role="radiogroup" aria-label="Show">${filters.filter(([k]) => k !== 'fav' || favs.size).map(([k, label]) =>
      `<button type="button" role="radio" class="chip" aria-checked="${k === f[0]}" data-filter="${k}">${label} <b class="num">${counts[k]}</b></button>`).join('')}</div>
    <label class="search">${icon('i-search')}<input type="search" id="people-q" placeholder="Search by name or job" value="${esc(q)}" aria-label="Search people"></label>
    <p class="soft small">Least happy first. Click someone to see their life.</p>
    <ul class="people" id="people-list">${shown.map((p) => `<li>${personRow(s, plan, p)}</li>`).join('')}</ul>
    ${list.length > shown.length ? `<p class="soft small center">Showing 120 of ${list.length}. Search to narrow it down.</p>` : ''}
    ${!list.length ? `<p class="empty">${s.people.length ? 'Nobody matches.' : 'No one lives here yet. Build homes next to roads.'}</p>` : ''}`;
}

export function personCard(s, plan, p, now, fav = false) {
  const fam = family(s, p);
  const rel = (label, q) => q ? `<button type="button" class="relation" data-person="${q.i}">${avatar(q)}<span class="pmain"><b>${esc(personName(q))}</b><small>${label}, ${q.a}</small></span></button>` : '';
  const reasons = moodReasons(s, plan, p);
  return `<button class="iconbtn close" type="button" data-close-drawer aria-label="Close">${icon('i-close')}</button>
    <button class="linkbtn backlink" type="button" data-panel-go="people">← All people</button>
    <div class="pcard">${avatar(p, 'lg')}<div class="fill"><h2>${esc(personName(p))}</h2><p class="soft">${p.a} years old. ${ROLES[roleOf(p)].label}.</p></div>
      <button type="button" class="iconbtn star ${fav ? 'on' : ''}" data-fav="${p.i}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favourites">${fav ? '★' : '☆'}</button></div>
    <div class="nowline">${icon('i-look')}<span>${esc(now)}</span></div>
    <p class="quote">“${esc(thought(s, plan, p))}”</p>
    <div class="kv"><span>Mood</span>${bar('Mood', p.m, 'small')}</div>
    <div class="kv"><span>Health</span><b>${healthText(p)}</b></div>
    <div class="kv"><span>Education</span><b>${EDU[p.e]}${p.sc >= 0 && p.a >= 5 ? ', studying' : ''}</b></div>
    ${(() => { const t = TRAITS.find((x) => x.id === traitOf(p)); return `<div class="kv"><span>Character${t.note ? `<small>${t.note}</small>` : ''}</span><b>${t.name}</b></div>`; })()}
    ${plan?.pets?.has(p.h) ? `<div class="kv"><span>Pet</span><b>${['A dog', 'A cat', 'A rabbit', 'A parrot', 'Two goldfish'][p.h % 5]}${plan.vetFor?.has(p.h) ? ', with a vet nearby' : ''}</b></div>` : ''}
    <div class="kv"><span>Day to day</span><b class="right">${esc(jobText(s, p))}</b></div>
    ${p.cs ? '<div class="kv"><span>Court</span><b>Waiting for a hearing</b></div>' : ''}
    ${reasons.length ? `<h3 class="sub">What’s on their mind</h3><ul class="reasons">${reasons.map(([v, t]) => `<li class="${v > 0 ? 'up' : 'down'}"><span aria-hidden="true">${v > 0 ? '+' : '−'}</span>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${fam.partner || fam.parents.length || fam.kids.length || fam.household.length ? `<h3 class="sub">Family and home</h3><div class="relations">
      ${rel('Partner', fam.partner)}${fam.parents.map((q) => rel('Parent', q)).join('')}${fam.kids.map((k) => rel('Child', k)).join('')}
      ${fam.household.filter((q) => q !== fam.partner && !fam.parents.includes(q) && !fam.kids.includes(q)).map((q) => rel('Lives with', q)).join('')}</div>` : ''}
    ${p.hi?.length ? `<h3 class="sub">Life so far</h3><ol class="lifeline">${p.hi.map(([d, what]) => `<li><span class="num soft">Day ${d}</span>${esc(what)}</li>`).join('')}</ol>` : ''}
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
  const tabs = [['overview', 'People'], ['services', 'Services'], ['resources', 'Resources'], ['budget', 'Budget'], ['policy', 'Policy', 'adv'], ['research', 'Research', 'adv'], ['history', 'History']];
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
      <h3 class="sub">Power, water and politics</h3>
      <div class="grid2"><div class="kv"><span>Powered buildings</span><b class="num">${s._util ? s._util.power.size : 0}</b></div><div class="kv"><span>With clean water</span><b class="num">${s._util ? s._util.water.size : 0}</b></div>
      <div class="kv"><span>Utilities needed</span><b>${s.flags.utilSince === undefined ? 'Not yet' : s._util?.need ? 'Yes' : 'Soon'}</b></div><div class="kv"><span>Last election</span><b class="num">${s.approval !== undefined ? s.approval + '%' : 'None yet'}</b></div></div>
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
      ['Unemployed', by.benefits, ''], ['Trade with neighbours', by.trade, `$${TRADE_PER_LINK} a road link, double for rail`],
      ['Visitors from neighbours', by.visitors, 'Evenings out, doctors, shopping, school and holidays'],
      ['Goods sold', by.exports, `${st.goods || 0} goods from factories, $2 each to linked neighbours or 50c locally`],
      ['Tourism', by.tourism, `${st.tourists || 0} tourists. Museums and stadiums draw them; hotels let them stay the night`]];
    if (by.carbon) inRows.push(['Carbon tax', by.carbon, `$${CARBON_TAX} a day from each fossil plant and factory`]);
    if (by.tolls) inRows.push(['Congestion charge', by.tolls, `${st.cars || 0} car trips`]);
    if (by.recycling) inRows.push(['Recycling sold', by.recycling, 'Sorted rubbish from recycling centres']);
    if (by.property) inRows.push(['Property tax', by.property, 'Scaled by land value where people live']);
    const outRows = Object.entries(up).sort((a, b) => b[1] - a[1]).map(([t, v]) => [{ loan: 'Loan repayment', pensions: `Pensions (${st.retirees || 0} retirees)`, insurance: 'Disaster insurance', bonds: 'City bonds' }[t] || B[t]?.name || t, v]);
    const rating = creditRating(s), terms = LOANS[rating];
    const bank = s.loan?.left > 0
      ? `<div class="kv"><span>Loan left to pay<small>${(s.loan.rate * 100).toFixed(1)}% a day. Paid back automatically.</small></span><b class="num">${money(s.loan.left)}</b></div>
        <div class="actions"><button class="btn" type="button" data-repay="${Math.min(s.loan.left, Math.floor(s.money))}" ${s.money >= 1 ? '' : 'disabled'}>Pay off ${money(Math.min(s.loan.left, Math.floor(s.money)))} now</button></div>`
      : terms.max
        ? `<p class="soft small">Borrow to build faster. You pay back in equal parts over ${LOAN_DAYS} days, plus ${(terms.rate * 100).toFixed(1)}% interest a day.</p>
          <div class="actions">${[0.25, 0.5, 1].map((f) => Math.round(terms.max * f / 100) * 100).map((a) => `<button class="btn" type="button" data-borrow="${a}">Borrow ${money(a)}</button>`).join('')}</div>`
        : '<p class="warn small">The bank won’t lend right now. Balance the budget and pay your bills to improve your rating.</p>';
    const net = (st.income || 0) - (st.upkeep || 0);
    body = `<p class="soft small">Yesterday. Tax is scaled by mood: at ${pct(s.happiness)} mood you collect ${pct(Math.min(1, Math.max(0, (s.happiness - 0.15) / 0.7)))} of full tax. Sick people don't work or pay.</p>
      <h3 class="sub">Income <b class="num good">+${money(st.income || 0)}</b></h3>
      ${inRows.map(([l, v, n]) => `<div class="kv"><span>${l}${n ? `<small>${n}</small>` : ''}</span><b class="num">${money(v || 0)}</b></div>`).join('')}
      <h3 class="sub">Upkeep <b class="num bad">−${money(st.upkeep || 0)}</b></h3>
      ${outRows.length ? outRows.map(([l, v]) => `<div class="kv"><span>${l}</span><b class="num">${money(v)}</b></div>`).join('') : '<p class="soft small">Nothing to maintain yet.</p>'}
      <div class="total ${net < 0 ? 'neg' : ''}"><span>Daily balance</span><b class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></div>
      ${(() => {
        const recent = s.history.slice(-3), avg = recent.length ? recent.reduce((a, h) => a + (h.net || 0), 0) / recent.length : net;
        const days = Array.from({ length: 7 }, (_, k) => Math.round(s.money + avg * (k + 1)));
        const low = days.findIndex((v) => v < 0);
        return `<h3 class="sub">${icon('i-chart')}Next 7 days</h3><p class="soft small">If the last three days are typical (${avg >= 0 ? '+' : '−'}${money(Math.abs(Math.round(avg)))} a day):</p>
          <div class="forecast">${days.map((v, k) => `<span class="${v < 0 ? 'neg' : ''}"><small>+${k + 1}d</small><b class="num">${money(v)}</b></span>`).join('')}</div>
          ${low >= 0 ? `<p class="warn small">You’d run out of money in ${low + 1} day${low ? 's' : ''}. Cut costs or borrow.</p>` : ''}`;
      })()}
      <div class="adv"><h3 class="sub">${icon('i-coin')}Bank <span class="tag">Credit rating ${rating}</span></h3>${bank}
      <h3 class="sub">${icon('i-people')}City bonds</h3>
      ${s.bond?.left > 0 ? `<div class="kv"><span>Owed to bondholders<small>${money(s.bond.daily)} a day until it’s paid</small></span><b class="num">${money(s.bond.left)}</b></div>`
        : s.people.length >= BONDS.minPop ? `<p class="soft small">Borrow from your own residents: up to ${money(s.people.length * BONDS.perHead)}, repaid with ${Math.round(BONDS.rate * 100)}% interest over ${BONDS.days} days. No credit check, but missing a payment angers them.</p>
          <div class="actions">${[0.5, 1].map((f) => Math.floor(s.people.length * BONDS.perHead * f / 50) * 50).filter((a) => a > 0).map((a) => `<button class="btn" type="button" data-bond="${a}">Sell ${money(a)} of bonds</button>`).join('')}</div>`
        : `<p class="soft small">Once you have ${BONDS.minPop} residents, they can buy city bonds.</p>`}</div>`;
  } else if (tab === 'research') {
    const era = eraOf(s), next = ERAS[ERAS.indexOf(era) + 1];
    body = `<div class="world-card"><span class="wbadge">${icon('i-flag')}</span><div><b>${s.name} is a ${era.name.toLowerCase()}</b>
        <small>${next ? `${next.name} at ${next.pop} people (you’ve reached ${s.peakPop}). Each era sends a grant and speeds up research.` : 'The biggest there is.'}</small></div></div>
      <div class="grid2"><div class="kv"><span>Research points</span><b class="num">${Math.floor(s.rp || 0)}</b></div><div class="kv"><span>Earned yesterday</span><b class="num">+${s.stats.rp || 0}</b></div></div>
      <p class="soft small">Graduates, libraries, universities and museums earn research points.</p>
      ${TECH_BRANCHES.map(([b, label]) => `<h3 class="sub">${label}</h3><ul class="tech tree">${TECH.filter((t) => t.branch === b).map((t) => { const done = hasTech(s, t.id), c = canResearch(s, t.id), blocked = t.needs && !hasTech(s, t.needs);
        return `<li class="${done ? 'done' : blocked ? 'blocked' : ''} ${t.needs ? 'child' : ''}"><span class="pmain"><b>${t.name}</b><small>${t.text}${blocked ? ` Needs ${TECH.find((x) => x.id === t.needs).name}.` : ''}</small></span>
          ${done ? '<span class="tag">Done</span>' : `<button class="btn ${c.ok ? 'primary' : ''}" type="button" data-tech="${t.id}" ${c.ok ? '' : 'disabled'}>${t.cost} pts</button>`}</li>`; }).join('')}</ul>`).join('')}`;
  } else if (tab === 'resources') {
    const r = s.stats.res, stock = resourceStock(s), cap = r?.cap || STORE_BASE, num = (n) => Math.round(n || 0).toLocaleString();
    const row2 = (l, v) => `<div class="kv"><span>${l}</span><b class="num">${v}</b></div>`;
    const line = (k, used, note = '') => `<tr><th scope="row">${RES[k].name}</th><td class="num">${num(stock[k])}</td><td class="num">${num(r?.prod[k])}</td><td class="num">${used}</td><td>${note}</td></tr>`;
    body = `<p class="soft small">Made and used each day. Each resource keeps up to ${num(cap)} in store; warehouses (Logistics research) add more. Extra food and materials sell for half the import price.</p>
      ${r ? `<div class="tablewrap"><table class="restable"><thead><tr><th>Resource</th><th>In store</th><th>Made</th><th>Used</th><th></th></tr></thead><tbody>
        ${line('water', num(r.need.water - r.short.water), r.short.water && r.prod.water ? `<span class="warn">${num(r.short.water)} short</span>` : '')}
        ${line('power', num(r.need.power - r.short.power), r.short.power && r.prod.power ? `<span class="warn">${num(r.short.power)} short</span>` : '')}
        ${FOOD.map((k) => line(k, '')).join('')}
        <tr><th scope="row">All food</th><td></td><td></td><td class="num">${num(r.need.food)}</td><td>${r.imported ? `${num(r.imported)} bought in` : 'Home-grown'}</td></tr>
        ${line('materials', '')}
      </tbody></table></div>
      ${r.imported ? row2('Food bought in yesterday', money(r.importCost)) : ''}${row2('Kinds of food', `${r.variety} of 4`)}${r.sold ? row2('Surplus sold yesterday', money(r.sold)) : ''}` : '<p class="soft">Figures appear after the first day.</p>'}
      <p class="soft small">Farms grow vegetables. Research Orchards, Dairy farming and Ranching for fruit, dairy and meat. Water towers make water, power stations, solar farms and wind turbines make power, and the materials works makes bricks and timber: while there are materials in store, builders work 50% faster.</p>`;
  } else if (tab === 'policy') {
    const pol = s.policy || { tax: 1, funding: 1, freeTransit: false };
    const slider = (k, label, [a, b], help) => `<div class="policy"><div class="phead2"><b>${label}</b><b class="num" id="pol-${k}-v">${pct(pol[k])}</b></div>
      <input type="range" min="${a}" max="${b}" step="0.05" value="${pol[k]}" data-policy="${k}" aria-label="${label}"><p class="soft small">${help}</p></div>`;
    body = `${slider('tax', 'Tax rate', POLICY.tax, 'Higher tax brings in more money, but every resident likes it a little less.')}
      ${slider('funding', 'Service funding', POLICY.funding, 'Scales upkeep for schools, health, safety, leisure and transport. More funding means more places and happier people; less saves money.')}
      <label class="tgl"><input type="checkbox" data-policy="freeTransit" ${pol.freeTransit ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">Free buses and trains<small>Riders are happier. Costs 50c per ride.</small></span></label>
      <label class="tgl"><input type="checkbox" data-policy="toll" ${pol.toll ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">Congestion charge<small>Drivers pay ${Math.round(CONGESTION_FEE * 100)}c a trip. Money in, but drivers grumble.</small></span></label>
      <label class="tgl"><input type="checkbox" data-policy="insured" ${pol.insured ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">Disaster insurance<small>${INSURANCE.premium * 100}c a day per building. Floods, fires, storms, quakes and tornadoes do ${Math.round(INSURANCE.damage * 100)}% of the damage.</small></span></label>
      <label class="tgl"><input type="checkbox" data-policy="carbon" ${pol.carbon ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="tl">Carbon tax<small>$${CARBON_TAX} a day from each fossil plant and factory. Cleaner air, factories make 15% less.</small></span></label>
      <div class="policy"><div class="phead2"><b>Property tax</b></div>
        <div class="seg" role="radiogroup" aria-label="Property tax">${['Off', 'Low', 'High'].map((l, k) => `<button type="button" role="radio" aria-checked="${(pol.property || 0) === k}" data-prop="${k}">${l}</button>`).join('')}</div>
        <p class="soft small">Charged on homes by land value. Good money in a desirable city, but everyone likes it a little less, and families without schooling on expensive streets may be priced out.</p></div>
      <h3 class="sub">${icon('i-tree')}Environment</h3>
      <div class="kv"><span>Air quality<small>Fossil power, factories and cars foul it. Parks, farms and clean power help.</small></span>${bar('Air quality', plan?.needs?.air ?? 1, 'small')}</div>
      <div class="kv"><span>Clean power<small>Solar farms and wind turbines</small></span><b class="num">${pct(greenShare(s))}</b></div>`;
  } else {
    const h = s.history;
    body = `<div class="actions"><button class="btn primary" type="button" id="open-timelapse">${icon('i-clock')}Watch your city grow</button></div>
      <div class="chart"><div class="chart-h"><span>${icon('i-people')}Population</span><b class="num">${s.people.length}</b></div>${spark(h.map((x) => x.pop), '#3b7ddd', (v) => v)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-coin')}Money</span><b class="num">${money(s.money)}</b></div>${spark(h.map((x) => x.money), '#c98a0e', money)}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-mood')}Mood</span><b class="num">${pct(s.happiness)}</b></div>${spark(h.map((x) => x.mood), '#2f9e5a', (v) => v + '%')}</div>
      <div class="chart"><div class="chart-h"><span>${icon('i-chart')}Daily balance</span><b class="num">${money(h.at(-1)?.net ?? 0)}</b></div>${spark(h.map((x) => x.net), '#8a5bd6', money)}</div>`;
  }
  return `${head('City stats')}
    <div class="seg tabs" role="tablist">${tabs.map(([k, l, cls]) => `<button type="button" role="tab" class="${cls || ''}" aria-selected="${tab === k}" data-stats-tab="${k}">${l}</button>`).join('')}</div>
    <div class="ppane">${body}</div>`;
}

// ---------- news ----------
const NEWS_ICON = { good: 'i-check', warn: 'i-alert', info: 'i-people', event: 'i-spark' };
// The Daily: yesterday's biggest story as a headline, the numbers, and the weather ahead.
function paper(s, plan, forecast) {
  const st = s.stats || {}, pop = s.people.length, net = (st.income || 0) - (st.upkeep || 0);
  const story = st.disaster ? ['Disaster strikes', st.disaster]
    : st.milestone ? [`${st.milestone} and counting`, `${s.name} passed ${st.milestone} residents yesterday.`]
    : st.priced ? ['Priced out', `${st.priced} residents left as rents climbed. Critics blame the property tax.`]
    : st.departures > 3 ? ['Residents head for the exits', `${st.departures} people left yesterday. The mayor’s office is under pressure.`]
    : st.graduates ? ['Caps in the air', `${st.graduates} graduate${st.graduates > 1 ? 's' : ''} finished university.`]
    : st.births > 1 ? ['Baby boom', `${st.births} babies were born yesterday.`]
    : (st.tourists || 0) >= 10 ? ['Tourists pour in', `${st.tourists} visitors spent ${money(st.byClass?.tourism || 0)} in town.`]
    : st.event ? ['Around town', st.event]
    : net < 0 ? ['Budget in the red', `The city lost ${money(-net)} yesterday.`]
    : ['A quiet day', `${pop} residents went about their lives.`];
  const air = st.air ?? plan?.needs?.air ?? 1;
  return `<article class="paper"><p class="masthead">The ${esc(s.name)} Daily <small>Day ${s.day}</small></p>
    <h3>${esc(story[0])}</h3><p>${esc(story[1])}</p>
    <div class="paper-cols"><span><small>Population</small><b class="num">${pop}</b></span><span><small>Mood</small><b class="num">${pct(s.happiness)}</b></span>
      <span><small>Budget</small><b class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></span><span><small>Air</small><b class="num">${pct(air)}</b></span></div>
    <p class="soft small">Weather: tomorrow ${forecast[0]}, then ${forecast[1]} and ${forecast[2]}.${forecast.includes('rain') ? ' Storm drains help if it pours.' : ''}</p></article>`;
}
export function newsPanel(state, unseenFrom, o = {}) {
  const log = state.log.map((e, k) => ({ ...e, n: k })).reverse();
  const tabs = [['paper', 'Headlines'], ['log', 'Everything'], ['inbox', `Alerts ${o.inbox?.length || ''}`]];
  const tabBar = `<div class="seg tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${o.tab === k}" data-news-tab="${k}">${l}</button>`).join('')}</div>`;
  if (o.tab === 'paper') return `${head('News')}${tabBar}${paper(state, o.plan, o.forecast || ['clear', 'clear', 'clear'])}
    <h3 class="sub">Latest</h3><ul class="news compact">${log.slice(0, 6).map((e) => `<li class="n-${e.k}"><span class="ntext">${esc(e.t)}<small>Day ${e.d}</small></span></li>`).join('')}</ul>`;
  if (o.tab === 'inbox') {
    const t = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${head('News')}${tabBar}${o.inbox?.length ? `<ul class="news">${o.inbox.map((e) => `<li class="n-${e.k === 'warn' ? 'warn' : e.k === 'good' ? 'good' : 'info'}"><span class="ntext">${esc(e.t)}<small>${t(e.at)}</small></span></li>`).join('')}</ul>`
      : '<p class="empty">No alerts this session. Pop-up messages you missed land here.</p>'}`;
  }
  return `${head('News')}${tabBar}
    ${log.length ? `<ul class="news">${log.map((e) => `<li class="n-${e.k} ${e.n >= unseenFrom ? 'new' : ''}">
      <span class="nicon">${icon(NEWS_ICON[e.k] || 'i-people')}</span><span class="ntext">${esc(e.t)}<small>Day ${e.d}, ${e.h ?? 0}:00</small></span></li>`).join('')}</ul>`
      : '<p class="empty">Nothing yet. Births, graduations, illness, crime and events will appear here.</p>'}`;
}

// ---------- chat ----------
export function chatPanel(ctx) {
  const { messages, me, world, colourOf } = ctx;
  const time = (m) => (m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now');
  return `${head('Chat', `<span class="soft small fill">${esc(world.name)}</span>`)}
    ${ctx.error ? `<p class="warn small">Chat isn’t available: ${esc(ctx.error)}</p>` : ''}
    <ul class="chat" id="chat-list" aria-live="polite">${messages.length ? messages.map((m) => `
      <li class="${m.uid === me ? 'mine' : ''}"><span class="avatar-sm" style="--role:${colourOf(m.uid)}" aria-hidden="true">${esc((m.name || '?')[0].toUpperCase())}</span>
        <div><span class="who" translate="no"><b>${esc(m.name)}</b> <small>${esc(m.city || '')}, ${time(m)}</small></span><p translate="no">${esc(m.text)}</p>
        <span class="reacts">${REACTIONS.map((e) => { const n = Object.values(m.reactions || {}).filter((x) => x === e).length, on = m.reactions?.[me] === e;
          return n || on ? `<button type="button" class="react ${on ? 'on' : ''}" data-react="${esc(m.id)}|${e}" aria-pressed="${on}" aria-label="${e} ${n}">${e} <b>${n}</b></button>` : ''; }).join('')}
          <span class="react-add">${REACTIONS.map((e) => `<button type="button" class="react ghost" data-react="${esc(m.id)}|${e}" aria-label="React ${e}">${e}</button>`).join('')}</span></span>
        ${m.uid !== me ? `<span class="msg-tools"><button type="button" class="linkbtn" data-mute="${esc(m.uid)}">Block</button><button type="button" class="linkbtn" data-report="${esc(m.id)}">Report</button></span>` : ''}</div></li>`).join('')
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
    ${ctx.plotCount >= 350 ? `<p class="warn small">This world has ${ctx.plotCount} cities. Only the first 400 are shown live; a private world will feel quicker.</p>` : ''}
    ${world.private && world.code ? `<div class="codebox"><span>Invite code</span><b class="num">${world.code}</b><button class="btn" type="button" data-copy="${world.code}">Copy code</button><button class="btn primary" type="button" data-copylink="${world.code}">Share link</button></div>
      <p class="soft small">${isOwnerOfWorld ? 'You made this world. ' : ''}Anyone with the code can join and get a plot here.</p>` : ''}
    ${ctx.weekly ? (() => {
      const w = ctx.weekly, show = (v) => (w.pct ? pct(v) : w.fmt(v));
      return `<div class="weekly"><h3 class="sub">${icon('i-trophy')}This week’s world challenge</h3>
        <p><b>${esc(w.text.replace('{goal}', show(w.goal)))}</b></p>
        ${bar('Challenge progress', Math.min(1, w.value / w.goal))}<p class="soft small">${show(w.value)} of ${show(w.goal)}. Ends ${w.ends.toLocaleDateString([], { weekday: 'long' })}. Every city that helps gets ${money(600)}.</p>
        ${w.claimed ? '<p class="good-t small">You’ve collected your reward this week.</p>'
          : w.done && w.helped ? '<button class="btn primary" type="button" id="weekly-claim">Collect your reward</button>'
          : w.done ? '<p class="soft small">The world did it! Your city didn’t qualify this time.</p>'
          : `<p class="soft small">${w.helped ? 'Your city is helping.' : 'Your city isn’t helping yet.'}</p>`}</div>`;
    })() : ''}
    ${ctx.isOwnerOfWorld ? `<form id="world-rename" class="miniform"><label class="field"><span>Rename this world</span><span class="inline"><input id="world-newname" maxlength="40" value="${esc(world.name)}"><button class="btn" type="submit">Rename</button></span></label></form>` : ''}
    ${ctx.news?.length ? `<h3 class="sub">${icon('i-bell')}Around the world</h3><ul class="news compact">${ctx.news.slice(0, 8).map((e) => `<li class="n-info"><span class="ntext">${esc(e.t)}<small>${new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></span></li>`).join('')}</ul>` : ''}
    <h3 class="sub">${icon('i-book')}Your guestbook</h3><div id="guestbook" data-book="${ctx.myPlot}">${ctx.bookMine || '<p class="soft small">Loading…</p>'}</div>
    <h3 class="sub">${icon('i-link')}Neighbours</h3>
    <p class="soft small">Put a road on your plot's edge where a neighbour has a road at the same spot. Each link earns trade and lifts mood, for both of you.</p>
    ${neighbours.length ? `<ul class="nlist">${neighbours.map((n) => `<li><button type="button" class="nrow" data-goto="${n.px},${n.py}">
      <span class="dir">${n.side}</span><span class="pmain"><b>${esc(n.name)}</b><small>${n.status === 'ruins' ? 'Ruins' : `Mayor ${esc(n.ownerName)}, ${n.pop} people${n.idle ? `. Paused, last active ${n.ago}` : ''}`}</small></span>
      <span class="links ${n.links ? 'on' : ''}">${n.links ? `${n.links} link${n.links > 1 ? 's' : ''}` : 'Not linked'}</span></button></li>`).join('')}</ul>`
      : '<p class="empty small">No neighbours yet. New players will settle next to you.</p>'}
    <h3 class="sub">${icon('i-people')}Between cities</h3>
    ${ctx.abroad.length ? `<p class="soft small">Linked cities share spare places: your residents can go out, shop, see a doctor or go to school there, and theirs come here. Families take holidays in each other's cities, and unhappy ones may move.</p>
      <ul class="nlist">${ctx.abroad.map((a) => { const o = ctx.plan?.out?.[a.id] || {};
        return `<li><span class="pmain"><b>${esc(a.name)}</b><small>Linked by ${a.via}. Room for ${a.fun} evenings out, ${a.care} patients, ${a.school} pupils, ${a.homesFree} newcomers.</small>
        <small>Your residents there today: ${o.fun || 0} out, ${o.care || 0} at the doctor, ${o.shop || 0} shopping, ${o.school || 0} at school, ${o.tourists || 0} on holiday.</small></span></li>`; }).join('')}</ul>
      <div class="grid2"><div class="kv"><span>Visitors here today</span><b class="num">${(ctx.incoming.fun || 0) + (ctx.incoming.care || 0) + (ctx.incoming.shop || 0) + (ctx.incoming.school || 0) + (ctx.incoming.tourists || 0)}</b></div>
        <div class="kv"><span>Moved away, all time</span><b class="num">${state.counters.emigrated || 0}</b></div>
        <div class="kv"><span>Moved in from neighbours</span><b class="num">${state.counters.immigrated || 0}</b></div>
        <div class="kv"><span>Holidays taken</span><b class="num">${state.counters.holidays || 0}</b></div></div>`
      : '<p class="empty small">Link a road or railway with a neighbour to share facilities, visitors and residents.</p>'}

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
        <span class="inline"><input id="world-code" maxlength="8" placeholder="K7Q2MX" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button class="btn" type="submit">Join</button></span></label></form>
      <p id="world-msg" class="formmsg" role="alert"></p>
    </div>`;
}

// ---------- region: shared projects and alliances ----------
export function regionPanel(ctx) {
  const { projects, alliances, mine, chat, me } = ctx;
  const proj = (p) => {
    const t = REGIONAL[p.type] || {}, frac = Math.min(1, p.raised / p.goal);
    return `<li class="proj ${p.done ? 'done' : ''}"><div class="pmain"><b>${esc(p.name)}</b><small>${esc(t.text || '')} Started by ${esc(p.byName || 'a mayor')}.</small>
      ${bar(`${p.name} funding`, frac)}<small class="num">${money(p.raised)} of ${money(p.goal)}. ${Object.keys(p.members || {}).length} cities paid in.${p.mine ? ` You: ${money(p.mine)}${p.mine < p.share ? ` (pay ${money(p.share)} in total to share the benefit)` : ''}.` : ` Pay ${money(p.share)} or more to share the benefit.`}</small></div>
      ${p.done ? `<span class="tag">${p.benefits ? 'Finished: you benefit' : 'Finished'}</span>`
        : `<div class="actions">${[100, 500, 2000].map((a) => `<button class="btn" type="button" data-pay="${p.id}|${a}">${money(a)}</button>`).join('')}</div>`}</li>`;
  };
  const r = ctx.regional;
  const perks = [r.mood ? `+${Math.round(r.mood * 100)}% mood` : '', r.draw ? `+${r.draw} tourists a day` : '', r.trade ? `+${money(r.trade)} trade a day` : '', r.health ? 'less illness' : ''].filter(Boolean);
  return `${head('Region')}
    <p class="soft small">Work with other mayors in this world: pay into shared projects, and team up in alliances.</p>
    <h3 class="sub">${icon('i-flag')}Regional projects</h3>
    ${perks.length ? `<p class="good-t small">Your city gets: ${perks.join(', ')}.</p>` : ''}
    ${projects.length ? `<ul class="nlist projs">${projects.map(proj).join('')}</ul>` : '<p class="empty small">No projects yet. Start one below and invite your neighbours to chip in.</p>'}
    <form id="project-form" class="miniform"><label class="field"><span>Start a project</span><span class="inline">
      <select id="project-type">${Object.entries(REGIONAL).map(([k, t]) => `<option value="${k}">${t.name} (${money(t.goal)})</option>`).join('')}</select>
      <button class="btn" type="submit">Start</button></span></label></form>
    <p id="region-msg" class="formmsg" role="alert"></p>
    <h3 class="sub">${icon('i-people')}Alliances</h3>
    ${mine ? `<div class="world-card"><span class="wbadge">[${esc(mine.tag)}]</span><div><b>${esc(mine.name)}</b><small>${mine.members.length} of 12 members. Each other member adds ${money(ALLIANCE_TRADE)} of trade a day, up to six.</small></div></div>
      <ul class="nlist">${mine.members.map((m) => `<li><span class="pmain"><b>${esc(ctx.nameOf(m))}</b>${m === mine.owner ? '<small>Founder</small>' : ''}</span></li>`).join('')}</ul>
      <h3 class="sub">${icon('i-chat')}Alliance chat</h3>
      <ul class="chat" id="ally-list">${chat.length ? chat.map((m) => `<li class="${m.uid === me ? 'mine' : ''}"><div translate="no"><span class="who"><b>${esc(m.name)}</b></span><p>${esc(m.text)}</p></div></li>`).join('') : '<li class="empty">Only members can read this. Say hello.</li>'}</ul>
      <form id="ally-chat-form" class="chat-form"><input id="ally-text" maxlength="280" autocomplete="off" placeholder="Message your alliance" aria-label="Alliance message"><button class="btn primary" type="submit">Send</button></form>
      <div class="actions"><button class="btn danger" type="button" id="ally-leave">${mine.members.length <= 1 ? 'Close the alliance' : 'Leave the alliance'}</button></div>`
    : `<form id="ally-form" class="miniform"><label class="field"><span>Found an alliance</span><span class="inline"><input id="ally-name" maxlength="30" placeholder="Northern Towns"><input id="ally-tag" maxlength="4" placeholder="TAG" style="max-width:6em" autocapitalize="characters"><button class="btn" type="submit">Found</button></span></label></form>`}
    ${alliances.length ? `<h3 class="sub">${icon('i-trophy')}Alliances by population</h3><ol class="nlist">${alliances.map((x) => `<li><span class="pmain"><b>[${esc(x.tag)}] ${esc(x.name)}</b><small>${x.members.length} member${x.members.length === 1 ? '' : 's'}, ${x.pop.toLocaleString()} people</small></span>
      ${!mine && x.members.length < 12 ? `<button class="btn" type="button" data-join="${x.id}">Join</button>` : ''}</li>`).join('')}</ol>` : ''}`;
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
  const { s, tile, cat, avail, q = '', afford = false } = ctx;
  const needle = q.trim().toLowerCase();
  const list = BUILDINGS.filter((t) => (cat === 'all' || B[t].cat === cat) && (!needle || `${B[t].name} ${tr(B[t].name)} ${B[t].blurb} ${gives(t)}`.toLowerCase().includes(needle)) && (!afford || avail(t).ok));
  const x = tile % 24 + 1, y = Math.floor(tile / 24) + 1;
  return `<div class="cat-head"><div><h2 id="catalog-title">Build on tile ${x}, ${y}</h2><small class="soft">You have <b>${money(s.money)}</b>. Staffed buildings need people with the right education.</small></div>
      <button class="iconbtn" type="button" data-cat-close aria-label="Close">${icon('i-close')}</button></div>
    <div class="cat-tools"><label class="search">${icon('i-search')}<input type="search" id="cat-q" placeholder="Search buildings" value="${esc(q)}" aria-label="Search buildings"></label>
      <label class="tgl compact"><input type="checkbox" id="cat-afford" ${afford ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span>Only what I can build now</span></label></div>
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
    }).join('') || '<p class="empty">Nothing matches. Try another search or category.</p>'}</div>`;
}
