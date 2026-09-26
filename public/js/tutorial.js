// Guided tour. Steps with a task wait until the player actually does it, then move on by themselves.
import { T, TUTORIAL_REWARD } from './constants.js';
import { HALL_INDEX, neighbours, hasTech } from './sim.js';

const KEY = 'commons-tutorial';
const count = (s, t) => s.grid.filter((v) => v === t).length;
function connectedRoads(s) {
  const seen = new Set([HALL_INDEX]), stack = [HALL_INDEX];
  let n = 0;
  while (stack.length) {
    for (const nb of neighbours(stack.pop())) {
      if (seen.has(nb) || s.grid[nb] !== T.ROAD) continue;
      seen.add(nb); stack.push(nb); n++;
    }
  }
  return n;
}

// Each step: title, text (short), task (what to do), target (CSS selector or 'hall'), base (snapshot), done.
const homes = (s) => count(s, T.HOUSE) + count(s, T.APARTMENT) + count(s, T.VILLA);
const STEPS = [
  { title: 'Welcome, mayor', text: 'This is your plot on a map you share with other players. Six settlers live above the town hall. Everyone here is a real person with a family, a job and a daily routine.' },
  { title: 'Look around', text: 'Drag to move, scroll or pinch to zoom. Press H any time to come home.',
    task: 'Move or zoom the camera', base: (a) => a.camKey(), done: (a, b) => a.camKey() !== b },
  { title: 'Select things', text: 'Select mode shows you what anything is, with options: upgrade, move, demolish. It works on people driving past too.',
    task: 'Choose Select, then tap the town hall', target: 'hall', done: (a) => a.mode() === 'select' && a.selected()?.i === HALL_INDEX && a.selectedMine() },
  { title: 'Switch to Build', text: 'Build mode is for roads and new buildings.',
    task: 'Press Build (or B)', target: '[data-mode="build"]', done: (a) => a.mode() === 'build' },
  { title: 'Pick the road brush', text: 'Roads carry cars, bikes and walkers. Footpaths are cheaper and carry only walkers and bikes.',
    task: 'Choose the Road brush', target: '[data-brush="road"]', done: (a) => a.brush() === 'road' },
  { title: 'Lay some road', text: 'Drag across the grass to paint road. Everything needs a road beside it, joined back to the hall.',
    task: 'Build 4 road tiles joined to the hall', target: 'hall', base: (a) => connectedRoads(a.state()), done: (a, b) => connectedRoads(a.state()) >= b + 4 },
  { title: 'Build a home', text: 'Tap an empty tile next to your road. A menu shows everything you can build, and what you can afford right now.',
    task: 'Build a house next to a road', base: (a) => homes(a.state()), done: (a, b) => homes(a.state()) > b },
  { title: 'Builders at work', text: 'Buildings take time. Your builders work through the queue. Tap a building site in Select mode to lend a hand.',
    task: 'Tap a building site in Select mode', target: '[data-mode="select"]', base: (a) => a.taps(), done: (a, b) => a.taps() > b },
  { title: 'Create jobs', text: 'Offices need people with schooling. Factories hire anyone but are noisy. Builder’s yards hire more builders.',
    task: 'Build an office or a factory', target: '[data-mode="build"]', base: (a) => count(a.state(), T.WORK) + count(a.state(), T.FACTORY), done: (a, b) => count(a.state(), T.WORK) + count(a.state(), T.FACTORY) > b },
  { title: 'Feed the town', text: 'Every household shops at the nearest grocer. One grocer feeds 30 people.',
    task: 'Build a grocer', target: '[data-mode="build"]', base: (a) => count(a.state(), T.SHOP), done: (a, b) => count(a.state(), T.SHOP) > b },
  { title: 'Families grow', text: 'Couples have children. Toddlers need daycare or a parent stays home. Children need primary then high school, or they grow up without qualifications. Graduates can go to university.' },
  { title: 'Buy more land', text: 'Your plot starts with an 8×8 patch. In Build mode, price tags mark land you can buy next to what you own. Each parcel costs a bit more.',
    task: 'Buy a parcel of land', target: '[data-mode="build"]', base: (a) => a.state().counters.land, done: (a, b) => a.state().counters.land > b },
  { title: 'Keep people happy', text: 'The ring is the city’s mood. The eight bars are needs, and the hint names the weakest one. Unhappy families move away.', target: '#pulse' },
  { title: 'Life happens', text: 'People get ill (build a clinic), get injured (a hospital), and grow old (a cemetery). Crime rises with unemployment; police catch offenders and a courthouse hears their cases. From 25 people the town needs power and water, and the council will ask you to make decisions.' },
  { title: 'Keep it alive', text: 'Once the town is a Town, it can fall into ruins if it runs completely out of water, its traffic gridlocks, or it stays deep in debt - each for a few days running. You’ll get warnings well before it happens. Ruins can always be rebuilt.' },
  { title: 'Watch the traffic', text: 'Each road carries about 45 car trips a day. The traffic view colours roads green to red. Jammed commuters arrive late and grumpy.',
    task: 'Turn on traffic (T)', target: '#btn-traffic', done: (a) => a.overlay() === 'traffic' },
  { title: 'Buses and trains', text: 'A bus depot and two or more stops run buses; people near a stop leave the car at home. Stations beside a railway carry people on long trips. Run track or roads into a neighbour’s city and your residents can commute to jobs there.', target: '[data-mode="build"]' },
  { title: 'Meet your people', text: 'Everyone has a name, a family, a job and something on their mind. Click anyone to see their day, or follow them around town.',
    task: 'Open People (P)', target: '[data-panel="people"]', done: (a) => a.panel() === 'people' },
  { title: 'Move things around', text: 'Move mode picks up a finished building and puts it down somewhere else, residents and all, for a quarter of its price.', target: '[data-mode="move"]',
    task: 'Move a building', base: (a) => a.state().counters.moved, done: (a, b) => a.state().counters.moved > b },
  { title: 'Your resources', text: 'Water, power, wood, metal and each kind of food, always on show here. Farms, water towers, the Sawmill and Quarry make them.', target: '#resbar',
    task: 'Tap a producing building when a bubble floats over it to collect a harvest', base: (a) => a.state().counters.harvests, done: (a, b) => a.state().counters.harvests > b },
  { title: 'Your next step', text: 'This line always says what to do next, with a Show me button. Your town hall grows by itself as the city does: Goals shows what the next level needs, and each level lets you buy more land and store more.', target: '#hint' },
  { title: 'Wood and metal', text: 'A Sawmill cuts timber and a Quarry digs ore and metal. Factories turn either into a product once you’ve researched the recipe, and builders work faster with some in stock.',
    task: 'Build a sawmill or a quarry', base: (a) => count(a.state(), T.MATERIALS) + count(a.state(), T.QUARRY), done: (a, b) => count(a.state(), T.MATERIALS) + count(a.state(), T.QUARRY) > b },
  { title: 'Research', text: 'City stats, Research: spend research points on high schools, universities, the Market, city shares, farming, factory recipes and more. Your town hall earns some every day.', target: '[data-panel="stats"]',
    task: 'Research Carpentry, Toolmaking or Bakery to unlock a factory recipe', done: (a) => ['carpentry', 'toolmaking', 'bakery'].some((id) => hasTech(a.state(), id)) },
  { title: 'Turn resources into products', text: 'A factory with a researched recipe turns wood, metal, vegetables or eggs into a product. Build one if you don’t have one yet, then tap it in Select mode and choose what to make.',
    task: 'Assign a recipe to a factory', target: '[data-mode="select"]', base: (a) => Object.keys(a.state().rec || {}).length, done: (a, b) => Object.keys(a.state().rec || {}).length > b },
  { title: 'Sell what you make', text: 'A staffed Store sells your product stock straight to residents. Research Trade to open the Market, where you can trade products, or anything else, with other mayors.',
    task: 'Make a trade on the Market', target: '[data-panel="market"]', base: (a) => a.state().counters.traded, done: (a, b) => a.state().counters.traded > b },
  { title: 'Talk to your neighbours', text: 'Chat reaches everyone in this world. Link roads with a neighbour for trade and a mood boost.', target: '[data-panel="chat"]' },
  { title: 'Your account', text: 'Account has your lifetime stats and achievements to unlock.', target: '#btn-account' },
  { title: 'You’re ready', text: `Here’s $${TUTORIAL_REWARD} to keep going. You can replay this tour from Help.` },
];

export function createTutorial(api) {
  const box = document.getElementById('coach');
  let step = -1, base = null, timer = null, doneAt = 0;

  const clearGlow = () => document.querySelectorAll('.tut-glow').forEach((el) => el.classList.remove('tut-glow'));

  function render() {
    const s = STEPS[step];
    const done = !!(s.done && s.done(api, base));
    box.innerHTML = `
      <div class="coach-top"><span class="pill num">${step + 1} of ${STEPS.length}</span>
        <button class="linkbtn" type="button" data-t="end">${step === STEPS.length - 1 ? 'Close' : 'End tour'}</button></div>
      <h3>${s.title}</h3><p>${s.text}</p>
      ${s.task ? `<div class="task ${done ? 'done' : ''}"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${s.task}</span></div>` : ''}
      <div class="coach-nav">
        ${step > 0 ? '<button class="btn" type="button" data-t="back">Back</button>' : '<span></span>'}
        ${s.task && !done ? '<button class="linkbtn" type="button" data-t="skip">Skip this step</button>'
          : `<button class="btn primary" type="button" data-t="next">${step === STEPS.length - 1 ? 'Finish' : 'Next'}</button>`}
      </div>`;
    box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => act(b.dataset.t); });
  }

  function go(n) {
    clearGlow();
    api.setPulseTile(null);
    step = n;
    try { localStorage.setItem(KEY, String(step)); } catch { /* private mode */ }
    const s = STEPS[step];
    base = s.base ? s.base(api) : null;
    doneAt = 0;
    // Already done (e.g. traffic is already on)? Skip ahead rather than asking again.
    if (s.task && s.done && !s.base && s.done(api, base) && n < STEPS.length - 1) { go(n + 1); return; }
    if (s.target === 'hall') api.setPulseTile(api.hallTile());
    else if (s.target) document.querySelector(s.target)?.classList.add('tut-glow');
    box.classList.remove('hidden');
    render();
    api.announce(`Tutorial step ${step + 1}: ${s.title}. ${s.text} ${s.task ? 'To do: ' + s.task : ''}`);
  }

  function act(what) {
    if (what === 'end') { finish(step === STEPS.length - 1); return; }
    if (what === 'back') go(Math.max(0, step - 1));
    if (what === 'next' || what === 'skip') {
      if (step === STEPS.length - 1) finish(true);
      else go(step + 1);
    }
  }

  function tick() {
    if (step < 0) return;
    const s = STEPS[step];
    if (!s.done) return;
    if (s.done(api, base)) {
      if (!doneAt) { doneAt = performance.now(); render(); api.play('done'); }
      else if (performance.now() - doneAt > 900) go(step + 1);
    }
  }

  function finish(completed) {
    clearGlow();
    api.setPulseTile(null);
    clearInterval(timer);
    step = -1;
    box.classList.add('hidden');
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    if (completed) api.reward();
  }

  return {
    start(from = 0) { clearInterval(timer); timer = setInterval(tick, 250); go(from); },
    resume() { const saved = +localStorage.getItem(KEY); if (localStorage.getItem(KEY) !== null && saved >= 0 && saved < STEPS.length) this.start(saved); },
    stop() { finish(false); },
    active: () => step >= 0,
    refresh() { if (step >= 0) { const s = STEPS[step]; if (s.target && s.target !== 'hall') document.querySelector(s.target)?.classList.add('tut-glow'); } },
  };
}
