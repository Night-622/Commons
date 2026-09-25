// Player preferences, stored per device. Colour modes follow Junction's: same slots, different looks.
const KEY = 'commons-prefs-v2';
const OLD_KEY = 'commons-prefs-v1';
const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };
export const SYSTEM_REDUCED_MOTION = mq('(prefers-reduced-motion: reduce)');

export const PALETTES = {
  standard: { label: 'Standard', note: 'The original city colours',
    cols: { house: '#f0963a', work: '#3b7ddd', shop: '#e0588e', school: '#f2c744', park: '#3fa767', hall: '#6b56c9' } },
  redgreen: { label: 'Red–green safe', note: 'For protanopia and deuteranopia',
    cols: { house: '#e69f00', work: '#0072b2', shop: '#cc79a7', school: '#f0e442', park: '#009e73', hall: '#56b4e9' } },
  bluey: { label: 'Blue–yellow safe', note: 'For tritanopia',
    cols: { house: '#f08a24', work: '#2563eb', shop: '#ef7fb0', school: '#d7263d', park: '#5f8f3a', hall: '#8e44ad' } },
  contrast: { label: 'High contrast', note: 'Bold, saturated and far apart',
    cols: { house: '#ff8c00', work: '#0047ff', shop: '#d000a0', school: '#f5c400', park: '#00a651', hall: '#7a4510' } },
};

export const DEFAULTS = {
  theme: 'auto',          // auto | light | dark
  view: '3d',             // 3d | flat
  dayNight: true,
  grid: false,
  cars: true,
  density: 1,             // traffic: 0.5 quiet | 1 normal | 1.6 busy
  popups: true,
  reducedMotion: SYSTEM_REDUCED_MOTION,
  colours: 'standard',
  shapes: false,
  textSize: 1,            // 1 | 1.15 | 1.3
  compact: false,
  minimap: true,
  notes: 'all',           // all | warn | off
  sound: true,
  volume: 0.5,
  tips: true,
};

export function loadPrefs() {
  try {
    let saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) {   // v1 turned cars off whenever the system asked for less motion; start them fresh
      saved = JSON.parse(localStorage.getItem(OLD_KEY) || '{}');
      delete saved.cars;
    }
    const p = { ...DEFAULTS };
    for (const k in DEFAULTS) if (typeof saved[k] === typeof DEFAULTS[k]) p[k] = saved[k];
    if (!PALETTES[p.colours]) p.colours = 'standard';
    return p;
  } catch { return { ...DEFAULTS }; }
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: keep in memory */ }
}

export function resolvedTheme(p) {
  if (p.theme !== 'auto') return p.theme;
  return mq('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

export function applyPrefs(p) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(p);
  root.dataset.motion = p.reducedMotion ? 'reduced' : 'full';
  root.dataset.compact = p.compact ? '1' : '0';
  root.style.setProperty('--ui-scale', String(p.textSize));
}

export const palette = (p) => PALETTES[p.colours].cols;
