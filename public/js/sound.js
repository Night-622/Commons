// Tiny synthesised sound set. No audio files to host; every sound is a few oscillator notes.
let ctx = null, volume = 0.5, enabled = true, ambVolume = 0.5, hidden = false, buzz = true, lastErr = 0, errRun = 0;

export function setSound(on, vol, amb = vol, haptics = true) { enabled = on; volume = vol; ambVolume = amb; buzz = haptics; }
// Quiet everything while the game is in a background tab (if the player asked for that).
export function setHidden(h) { hidden = h; if (h && amb) amb.gain.gain.setTargetAtTime(0.0001, amb.ctx.currentTime, 0.2); }
const HAPTIC = { place: 12, error: [20, 40, 20], goal: [15, 30, 15, 30, 40], level: 25, warn: [30, 60, 30] };

function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(freq, start, dur, type = 'sine', gain = 0.2) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  place: () => { note(520, 0, 0.08, 'triangle', 0.25); note(780, 0.04, 0.08, 'triangle', 0.18); },
  tap: () => note(880 + Math.random() * 120, 0, 0.06, 'triangle', 0.18),
  clear: () => { note(220, 0, 0.1, 'sawtooth', 0.08); note(160, 0.05, 0.12, 'sawtooth', 0.06); },
  done: () => { note(660, 0, 0.12); note(990, 0.08, 0.18); },
  coin: () => { note(1320, 0, 0.07, 'square', 0.06); note(1760, 0.06, 0.12, 'square', 0.06); },
  level: () => { [523, 659, 784, 1046].forEach((f, k) => note(f, k * 0.07, 0.16, 'triangle', 0.2)); },
  goal: () => { [784, 988, 1175].forEach((f, k) => note(f, k * 0.09, 0.2, 'sine', 0.22)); },
  error: () => note(150, 0, 0.16, 'square', 0.07 / Math.min(4, errRun)),
  // One tone per info view, so they can be told apart without looking.
  'view-traffic': () => note(392, 0, 0.12, 'triangle', 0.14), 'view-mood': () => note(494, 0, 0.12, 'triangle', 0.14),
  'view-services': () => note(587, 0, 0.12, 'triangle', 0.14), 'view-noise': () => note(330, 0, 0.12, 'triangle', 0.14),
  'view-value': () => note(659, 0, 0.12, 'triangle', 0.14), 'view-off': () => note(262, 0, 0.1, 'sine', 0.1),
  warn: () => { note(440, 0, 0.14, 'sine', 0.18); note(349, 0.16, 0.2, 'sine', 0.18); },
};

export function play(name) {
  if (name === 'error') { const now = Date.now(); errRun = now - lastErr < 900 ? errRun + 1 : 1; lastErr = now; }   // repeated errors get quieter
  if (buzz && HAPTIC[name] && navigator.vibrate && matchMedia('(pointer: coarse)').matches) { try { navigator.vibrate(HAPTIC[name]); } catch { /* ignore */ } }
  if (!enabled || volume <= 0 || hidden) return;
  try { SOUNDS[name]?.(); } catch { /* audio blocked until first interaction */ }
}

// Music: a slow, generated soundtrack. Four chords a loop, soft pads and a few notes on top; minor at night.
let mus = null;
const DAY_CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
const NIGHT_CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 233.1, 293.7], [164.8, 196, 246.9]];
function pad(a, freq, t, dur, gain, dest) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.1);
}
export function music(on, vol = 0.4, night = false) {
  if (!on || !enabled || vol <= 0 || hidden) { if (mus) { mus.out.gain.setTargetAtTime(0.0001, mus.a.currentTime, 0.8); mus.playing = false; } return; }
  const a = audio();
  if (!a) return;
  if (!mus) { const out = a.createGain(); out.gain.value = 0.0001; out.connect(a.destination); mus = { a, out, next: a.currentTime + 0.2, bar: 0, playing: false }; }
  mus.out.gain.setTargetAtTime(0.16 * vol, a.currentTime, 0.8);
  if (!mus.playing) { mus.next = Math.max(mus.next, a.currentTime + 0.2); mus.playing = true; }
  const BAR = 4.2;
  while (mus.next < a.currentTime + BAR * 1.5) {
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS, c = chords[mus.bar % 4], t = mus.next;
    for (const f of c) pad(a, f / 2, t, BAR + 0.8, 0.12, mus.out);
    for (let k = 0; k < 4; k++) if (Math.random() < (night ? 0.4 : 0.6)) pad(a, c[Math.floor(Math.random() * 3)] * (Math.random() < 0.5 ? 2 : 1), t + k * BAR / 4 + Math.random() * 0.2, 1.4, 0.05, mus.out);
    mus.bar++; mus.next += BAR;
  }
}

// Background city sound: a soft traffic hum that follows how busy the streets are, and birds by day.
let amb = null;
export function ambient(on, busy = 0.5, day = true) {
  if (!on || !enabled || ambVolume <= 0 || hidden) { if (amb) { amb.gain.gain.setTargetAtTime(0.0001, amb.ctx.currentTime, 0.5); } return; }
  const a = audio();
  if (!a) return;
  if (!amb) {
    const len = a.sampleRate * 2, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let k = 0; k < len; k++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[k] = last * 3.5; }
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = a.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
    const gain = a.createGain(); gain.gain.value = 0.0001;
    src.connect(filter).connect(gain).connect(a.destination); src.start();
    amb = { ctx: a, gain, filter, lastBird: 0 };
  }
  amb.gain.gain.setTargetAtTime((0.02 + 0.06 * Math.min(1, busy)) * ambVolume, a.currentTime, 1);
  if (day && a.currentTime - amb.lastBird > 4 + Math.random() * 8) {
    amb.lastBird = a.currentTime;
    const f = 2400 + Math.random() * 1400;
    note(f, 0, 0.08, 'sine', 0.03); note(f * 1.2, 0.1, 0.07, 'sine', 0.025);
  }
}
