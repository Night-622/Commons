// Guided tour. Steps with a task wait until the player actually does it, then move on by themselves.
import { T, TUTORIAL_REWARD } from './constants.js';
import { HALL_INDEX, neighbours } from './sim.js';

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
const STEPS = [
  { title: 'Welcome, mayor', text: 'This is your plot: 24 by 24 tiles on a map you share with other players. You have a town hall, $2,500, three builders and three settlers. You’ll build real things as you go.' },
  { title: 'Look around', text: 'Drag the map to move. Scroll or pinch to zoom. Press H any time to jump back home.',
    task: 'Move or zoom the camera', base: (a) => a.camKey(), done: (a, b) => a.camKey() !== b },
  { title: 'Your town hall', text: 'Every road starts at the hall. It houses a few people, gives some jobs and works as a tiny shop.',
    task: 'Click the town hall', target: 'hall', done: (a) => a.selected()?.i === HALL_INDEX && a.selectedMine() },
  { title: 'Pick the road tool', text: 'The build bar holds everything you can place. Each card shows the price.',
    task: 'Choose Road, or press 2', target: '[data-tool="road"]', done: (a) => a.tool() === 'road' },
  { title: 'Lay some road', text: 'Roads cost $10 a tile. Drag to paint several at once. Everything needs a road on one side, and roads must connect back to the hall.',
    task: 'Build 4 road tiles joined to the hall', target: 'hall', base: (a) => connectedRoads(a.state()), done: (a, b) => connectedRoads(a.state()) >= b + 4 },
  { title: 'Build a house', text: 'A house holds 6 people. More homes means more people, and more people pay more tax.',
    task: 'Place a house next to a road', target: '[data-tool="house"]', base: (a) => count(a.state(), T.HOUSE), done: (a, b) => count(a.state(), T.HOUSE) > b },
  { title: 'Builders at work', text: 'New buildings take time. Builders work through the queue in order and the ring shows progress. You can lend a hand.',
    task: 'Switch to Look (press 1) and click a building site', target: '[data-tool="look"]', base: (a) => a.taps(), done: (a, b) => a.taps() > b },
  { title: 'Create jobs', text: 'A workplace adds 10 jobs. Employed people pay more tax. People without work get unhappy.',
    task: 'Place a workplace next to a road', target: '[data-tool="work"]', base: (a) => count(a.state(), T.WORK), done: (a, b) => count(a.state(), T.WORK) > b },
  { title: 'Open a shop', text: 'A shop serves 30 people. Residents drive to the nearest one, so put shops near homes.',
    task: 'Place a shop next to a road', target: '[data-tool="shop"]', base: (a) => count(a.state(), T.SHOP), done: (a, b) => count(a.state(), T.SHOP) > b },
  { title: 'Read the mood', text: 'The ring is how happy your city is. The bars are needs, and the hint names the weakest one. Low mood means less tax, then people leave.',
    target: '#pulse' },
  { title: 'Watch the traffic', text: 'Each road carries about 45 trips a day. The traffic view colours roads from green to red so you can spot jams.',
    task: 'Turn on traffic (T)', target: '#btn-traffic', done: (a) => a.overlay() === 'traffic' },
  { title: 'Meet your people', text: 'Every resident has a name, a home, a job and an opinion. Click anyone to see their home or follow their commute.',
    task: 'Open People (P)', target: '[data-panel="people"]', done: (a) => a.panel() === 'people' },
  { title: 'Check the books', text: 'Stats shows where money comes from and goes. Upkeep stays the same even when people leave, so keep an eye on the daily balance.',
    task: 'Open Stats (C)', target: '[data-panel="stats"]', done: (a) => a.panel() === 'stats' },
  { title: 'Goals pay cash', text: 'Goals are milestones with rewards. They’re a good guide to what to build next.',
    task: 'Open Goals (O)', target: '[data-panel="goals"]', done: (a) => a.panel() === 'goals' },
  { title: 'Upgrade later', text: 'Finished buildings in good repair can be upgraded twice for more homes or jobs. Upkeep rises with each level.',
    target: '[data-tool="upgrade"]' },
  { title: 'Link up with neighbours', text: 'Run a road to the edge of your plot where a neighbour has a road at the same spot. A bridge forms and both cities earn trade and a mood boost. The World panel also has ruins you can move to and private worlds for friends.',
    target: '[data-panel="world"]' },
  { title: 'You’re ready', text: `That’s everything you need. Here’s $${TUTORIAL_REWARD} to keep going. You can replay this tour from Help.` },
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
