// Tiny synthesised sound set. No audio files to host; every sound is a few oscillator notes.
let ctx = null, volume = 0.5, enabled = true;

export function setSound(on, vol) { enabled = on; volume = vol; }

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
  error: () => note(150, 0, 0.16, 'square', 0.07),
  warn: () => { note(440, 0, 0.14, 'sine', 0.18); note(349, 0.16, 0.2, 'sine', 0.18); },
};

export function play(name) {
  if (!enabled || volume <= 0) return;
  try { SOUNDS[name]?.(); } catch { /* audio blocked until first interaction */ }
}

// Background city sound: a soft traffic hum that follows how busy the streets are, and birds by day.
let amb = null;
export function ambient(on, busy = 0.5, day = true) {
  if (!on || !enabled || volume <= 0) { if (amb) { amb.gain.gain.setTargetAtTime(0.0001, amb.ctx.currentTime, 0.5); } return; }
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
  amb.gain.gain.setTargetAtTime(0.02 + 0.06 * Math.min(1, busy) * volume, a.currentTime, 1);
  if (day && a.currentTime - amb.lastBird > 4 + Math.random() * 8) {
    amb.lastBird = a.currentTime;
    const f = 2400 + Math.random() * 1400;
    note(f, 0, 0.08, 'sine', 0.03); note(f * 1.2, 0.1, 0.07, 'sine', 0.025);
  }
}
