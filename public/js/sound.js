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
