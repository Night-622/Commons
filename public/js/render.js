import { PLOT, GAP, T, B, MAX_LEVEL, CHUNK, CHUNKS, ZONES } from './constants.js';

export const STRIDE = PLOT + GAP;
const ISO_DETAIL = 7;     // below this zoom, 3D plots draw from cached images
const FLAT_DETAIL = 9;
const CACHE_Z = 6;
const FLAT_K = 1.3;       // flat tiles are a little bigger than iso half-widths at the same zoom

// ---------- colour helpers ----------
const rgbCache = new Map();
function hexRgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    v = hex[0] === '#' ? [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) : hex.match(/[\d.]+/g).slice(0, 3).map(Number);
    rgbCache.set(hex, v);
  }
  return v;
}
const shadeCache = new Map();
// amt > 0 lightens, < 0 darkens; grey pulls towards a flat grey (for decay)
export function shade(hex, amt = 0, grey = 0) {
  const key = hex + amt + ',' + grey;
  let out = shadeCache.get(key);
  if (out) return out;
  let [r, g, b] = hexRgb(hex);
  if (grey) { const l = r * 0.3 + g * 0.59 + b * 0.11; r += (l - r) * grey; g += (l - g) * grey; b += (l - b) * grey; }
  const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
  r += (t - r) * k; g += (t - g) * k; b += (t - b) * k;
  out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, out);
  return out;
}
const hash = (i, k = 0) => { let h = (i * 374761393 + k * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

const THEMES = {
  light: {
    bg: '#dbe9d2', bg2: '#cfe0c4', top: '#a9d68b', top2: '#a1cf82', side: '#86b566', side2: '#74a257', soil: '#b08a60', soil2: '#977550',
    road: '#5e6873', mark: '#f5f1e4', wall: '#f8f3ea', stone: '#ebe6da', dirt: '#c9ae86', glass: '#bfe1f4',
    pave: '#d8d4ca', wild: 'rgba(60,96,40,0.22)', wildTree: '#4f8a44', ink: '#17313b', grid: 'rgba(23,49,59,0.10)', labelBg: 'rgba(255,255,255,0.92)', scaffold: '#d99a2b', ruin: '#9a8b7b',
    water: '#5aa9d6', waterHi: 'rgba(255,255,255,0.45)', shore: '#e9dcae', hill: '#97c57a', hill2: '#92c075',
  },
  dark: {
    bg: '#172327', bg2: '#131e22', top: '#4e7b44', top2: '#4a753f', side: '#3b6234', side2: '#31532b', soil: '#5f4b37', soil2: '#4e3e2e',
    road: '#3b434b', mark: '#cfcbbd', wall: '#e2dccf', stone: '#cfc9bc', dirt: '#7d6a50', glass: '#8fb3c7',
    pave: '#6f7470', wild: 'rgba(0,0,0,0.22)', wildTree: '#2f5a2b', ink: '#e8f0ef', grid: 'rgba(255,255,255,0.08)', labelBg: 'rgba(20,34,40,0.92)', scaffold: '#c98a22', ruin: '#6c6255',
    water: '#2c5f7c', waterHi: 'rgba(255,255,255,0.25)', shore: '#8a7d58', hill: '#44703b', hill2: '#416b38',
  },
};
const CAR_COLS = ['#e94f4f', '#f2f2f2', '#3a7bd5', '#f2c230', '#2f2f36', '#46b37b'];

// Model height in tile units, used for construction outlines and progress rings.
export function modelHeight(t, lv = 1) {
  switch (t) {
    case T.HOUSE: return 0.42 + 0.36 * (lv - 1) + 0.32;
    case T.WORK: return 0.8 + 0.55 * (lv - 1) + 0.1;
    case T.SHOP: return 0.44 + 0.22 * (lv - 1) + 0.16;
    case T.SCHOOL: return 0.55 + 0.25 * (lv - 1) + 0.3;
    case T.PARK: return 0.6;
    case T.HALL: return 1.2;
    default: return (MODEL_H[t] || 0.1) + ([T.APARTMENT, T.HOSPITAL, T.FACTORY].includes(t) ? 0.45 : 0.2) * (lv - 1);
  }
}

// Shapes that tell building groups apart without colour (Junction's glyph set).
const GLYPH_COL = { house: 0, work: 1, shop: 2, school: 3, park: 4, hall: 5 };
// Short labels so every building type is distinct in the 2D view.
const CODE = { [T.HOUSE]: 'H', [T.APARTMENT]: 'Ap', [T.VILLA]: 'V', [T.WORK]: 'Of', [T.SHOP]: 'G', [T.CAFE]: 'Ca', [T.FACTORY]: 'F', [T.YARD]: 'By',
  [T.DAYCARE]: 'Dc', [T.SCHOOL]: 'PS', [T.HIGH]: 'HS', [T.UNI]: 'U', [T.TUTOR]: 'Tu', [T.LIBRARY]: 'Li', [T.CLINIC]: '+', [T.HOSPITAL]: 'H+',
  [T.POLICE]: 'Po', [T.FIRE]: 'Fi', [T.COURT]: 'Ct', [T.CEMETERY]: 'Ce', [T.PARK]: 'Pk', [T.PLAYGROUND]: 'Pl', [T.SPORTS]: 'Sp', [T.GYM]: 'Gy',
  [T.DOJO]: 'Do', [T.POOL]: 'Sw', [T.CINEMA]: 'Ci', [T.STATION]: 'St', [T.STOP]: 'Bs', [T.DEPOT]: 'Bd', [T.HALL]: 'TH', [T.POWER]: 'Pw', [T.WATER]: 'Wa', [T.DRAIN]: 'Dr',
  [T.SOLAR]: 'So', [T.WIND]: 'Wi', [T.MUSEUM]: 'Mu', [T.STADIUM]: 'SD', [T.HOTEL]: 'Ht', [T.FARM]: 'Fa', [T.HARBOUR]: 'Hb', [T.AIRPORT]: 'Ai', [T.LANDFILL]: 'Lf', [T.RECYCLE]: 'Re', [T.SEWAGE]: 'Sw', [T.VET]: 'Vt', [T.METRO]: 'M', [T.MONUMENT]: 'Mo',
  [T.ORCHARD]: 'Or', [T.DAIRY]: 'Da', [T.RANCH]: 'Ra', [T.MATERIALS]: 'Mw', [T.WAREHOUSE]: 'Wh' };
export const glyphOf = (t) => GLYPH_COL[B[t]?.col];
// Ground colour for buildings that are mostly open space.
const GROUND = { [T.SPORTS]: '#6fbf5a', [T.POOL]: '#e9e2cf', [T.CEMETERY]: '#8fb77a', [T.PLAYGROUND]: '#e8d6a3', [T.YARD]: '#c9ae86', [T.VILLA]: '#b8e09a', [T.FARM]: '#9c7a52', [T.STADIUM]: '#6fbf5a', [T.SOLAR]: '#b9d69b', [T.WIND]: '#a9d68b', [T.LANDFILL]: '#a89a78',
  [T.ORCHARD]: '#8fc46f', [T.DAIRY]: '#9fcf7a', [T.RANCH]: '#b8a36a', [T.MATERIALS]: '#b0a89a' };
const MODEL_H = { [T.APARTMENT]: 1.3, [T.VILLA]: 0.8, [T.CAFE]: 0.55, [T.FACTORY]: 1.3, [T.YARD]: 1.1, [T.DAYCARE]: 0.8, [T.HIGH]: 1.1, [T.UNI]: 1.4,
  [T.TUTOR]: 0.7, [T.LIBRARY]: 1, [T.CLINIC]: 0.7, [T.HOSPITAL]: 1.3, [T.POLICE]: 0.8, [T.FIRE]: 1.1, [T.COURT]: 1.2, [T.CEMETERY]: 0.3,
  [T.PLAYGROUND]: 0.5, [T.SPORTS]: 0.3, [T.GYM]: 0.7, [T.DOJO]: 0.9, [T.POOL]: 0.3, [T.CINEMA]: 0.9, [T.PATH]: 0.05,
  [T.DRAIN]: 0.3, [T.RAIL]: 0.05, [T.STATION]: 0.9, [T.STOP]: 0.5, [T.DEPOT]: 0.8, [T.POWER]: 1.4, [T.WATER]: 1.3,
  [T.SOLAR]: 0.3, [T.WIND]: 1.8, [T.MUSEUM]: 1.1, [T.STADIUM]: 0.9, [T.HOTEL]: 1.6, [T.FARM]: 0.4, [T.HARBOUR]: 1.2, [T.AIRPORT]: 1.1, [T.LANDFILL]: 0.4, [T.RECYCLE]: 0.8, [T.SEWAGE]: 0.5, [T.VET]: 0.7, [T.METRO]: 0.6, [T.MONUMENT]: 2,
  [T.ORCHARD]: 0.6, [T.DAIRY]: 0.7, [T.RANCH]: 0.5, [T.MATERIALS]: 0.9, [T.WAREHOUSE]: 0.8 };
export function glyph(g, kind, x, y, r, col) {
  g.fillStyle = col;
  g.beginPath();
  if (kind === 0) g.arc(x, y, r, 0, Math.PI * 2);
  else if (kind === 1) g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (kind === 2) { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); }
  else if (kind === 3) { g.moveTo(x, y - r * 1.1); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.1); g.lineTo(x - r, y); g.closePath(); }
  else if (kind === 4) { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r * 1.1; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); }
  else { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
  g.fill();
}

function poly(g, pts, fill, stroke) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.stroke(); }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: PLOT / 2, y: PLOT / 2, z: 22 };
    this.view = '3d';
    this.cache = new Map();
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- camera ----------
  project(wx, wy, h = 0) {
    const { x, y, z } = this.cam, dx = wx - x, dy = wy - y;
    if (this.view === 'flat') { const s = z * FLAT_K; return [dx * s + this.w / 2, dy * s + this.h / 2]; }
    return [(dx - dy) * z + this.w / 2, (dx + dy) * z * 0.5 - h * z + this.h / 2];
  }
  toWorld(sx, sy) {
    const { x, y, z } = this.cam;
    if (this.view === 'flat') { const s = z * FLAT_K; return { x: (sx - this.w / 2) / s + x, y: (sy - this.h / 2) / s + y }; }
    const X = (sx - this.w / 2) / z, Y = (sy - this.h / 2) / (z * 0.5);
    return { x: x + (X + Y) / 2, y: y + (Y - X) / 2 };
  }
  centerOn(wx, wy) { this.cam.x = wx; this.cam.y = wy; }
  centerOnPlot(px, py) { this.centerOn(px * STRIDE + PLOT / 2, py * STRIDE + PLOT / 2); }
  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.cam.z = Math.min(64, Math.max(1.6, this.cam.z * factor));
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
  }
  panBy(dx, dy) {
    const a = this.toWorld(0, 0), b = this.toWorld(dx, dy);
    this.cam.x -= b.x - a.x;
    this.cam.y -= b.y - a.y;
  }
  hit(sx, sy) {
    const { x, y } = this.toWorld(sx, sy);
    return this.tileAt(x, y);
  }
  tileAt(x, y) {
    const px = Math.floor(x / STRIDE), py = Math.floor(y / STRIDE);
    const tx = Math.floor(x - px * STRIDE), ty = Math.floor(y - py * STRIDE);
    if (tx >= PLOT || ty >= PLOT) return null;
    return { px, py, tx, ty, i: ty * PLOT + tx };
  }
  bounds() {
    const pts = [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h]].map(([a, b]) => this.toWorld(a, b));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 4;
    return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad + 3 };
  }

  // ---------- frame ----------
  draw(scene) {
    const g = this.ctx;
    this.th = THEMES[scene.theme] || THEMES.light;
    this.pal = scene.palette;
    this.scene = scene;
    this._lights = [];
    const season = scene.season, dark = scene.theme === 'dark';
    this.snowy = season === 'Winter' && scene.weather !== 'heat';
    this.seasonTop = season === 'Winter' ? (dark ? '#5b6b66' : '#e6eee9') : season === 'Autumn' ? (dark ? '#5d6b3d' : '#c2cf86') : null;
    this.seasonTree = season === 'Autumn' ? '#d9822b' : season === 'Winter' ? (dark ? '#8a9a95' : '#f3f7f5') : null;
    const grd = g.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, this.th.bg);
    grd.addColorStop(1, this.th.bg2);
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);

    const bd = this.bounds();
    const plots = [...scene.plots.values(), ...(scene.wild || [])]
      .filter((p) => p.px * STRIDE < bd.x1 && (p.px + 1) * STRIDE > bd.x0 && p.py * STRIDE < bd.y1 && (p.py + 1) * STRIDE > bd.y0)
      .sort((a, b) => (a.px + a.py) - (b.px + b.py) || a.px - b.px);

    for (const plot of plots) {
      const ox = plot.px * STRIDE, oy = plot.py * STRIDE;
      if (this.view === 'flat') this.flatPlot(g, plot, ox, oy);
      else if (this.cam.z < ISO_DETAIL) this.cachedIso(g, plot, ox, oy);
      else this.isoPlot(g, plot, (tx, ty, h = 0) => this.project(ox + tx, oy + ty, h), this.cam.z, true);
      for (const b of scene.bridges?.get(plot.id) || []) {
        if (this.view === 'flat') {
          const s = this.cam.z * FLAT_K, [bx, by] = this.project(ox + (b.dir === 'e' ? PLOT : b.k + 0.15), oy + (b.dir === 'e' ? b.k + 0.15 : PLOT));
          g.fillStyle = this.th.road;
          g.fillRect(bx, by, b.dir === 'e' ? GAP * s : 0.7 * s, b.dir === 'e' ? 0.7 * s : GAP * s);
        } else this.bridge(g, (tx, ty, h = 0) => this.project(ox + tx, oy + ty, h), b.dir, b.k, this.cam.z, b.rail);
      }
    }
    // Plots touch, so each gets a thin yellow border; your own cities' borders are a little stronger.
    // Unclaimed plots you could buy get a faint fill and a dashed border.
    for (const f of scene.free || []) {
      const ox = f.px * STRIDE, oy = f.py * STRIDE;
      poly(g, [[0, 0], [PLOT, 0], [PLOT, PLOT], [0, PLOT]].map(([x, y]) => this.project(ox + x, oy + y)), 'rgba(255,201,51,0.08)', null);
      this.plotBorder(g, f);
    }
    for (const plot of plots) this.plotBorder(g, plot);
    // Trains between cities travel in world coordinates, across the bridges.
    if (this.view === '3d' && this.cam.z >= 7) for (const tr of scene.worldTrains || []) if (tr.lx !== undefined) this.vehicle(g, (x, y, h = 0) => this.project(x, y, h), tr);
    this.overlays(g, scene);
    if (scene.pulseTile) {
      const t = scene.pulseTile, a = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      g.lineWidth = 3;
      this.tileOutline(g, t.px, t.py, t.tx, t.ty, `rgba(255,201,51,${0.5 + a * 0.5})`, `rgba(255,201,51,${0.15 + a * 0.2})`);
    }
    this.night(g, scene);
    this.lights(g, scene);
    this.weatherFx(g, scene);
    if (this.cam.z < 13) for (const plot of plots) if (!plot.wild) this.label(g, plot);
    this.pops(g, scene);
  }

  // ---------- 3D ----------
  cachedIso(g, plot, ox, oy) {
    const key = `${plot.version}|${this.scene.theme}|${this.scene.paletteKey}`;
    let c = this.cache.get(plot.id);
    if (!c || c.key !== key) {
      const m = 4, cw = 2 * PLOT * CACHE_Z + 2 * m, ch = PLOT * CACHE_Z + 4 * CACHE_Z + 2 * m;
      const canvas = c?.canvas || document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const cg = canvas.getContext('2d');
      cg.clearRect(0, 0, cw, ch);
      const x0 = PLOT * CACHE_Z + m, y0 = 3 * CACHE_Z + m;
      this.isoPlot(cg, plot, (tx, ty, h = 0) => [(tx - ty) * CACHE_Z + x0, (tx + ty) * CACHE_Z * 0.5 - h * CACHE_Z + y0], CACHE_Z, false);
      c = { key, canvas, x0, y0 };
      this.cache.set(plot.id, c);
    }
    const k = this.cam.z / CACHE_Z;
    const [sx, sy] = this.project(ox, oy, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(c.canvas, sx - c.x0 * k, sy - c.y0 * k, c.canvas.width * k, c.canvas.height * k);
  }

  isoPlot(g, plot, P, z, live) {
    const th = this.th;
    // The plot is a raised slab of land, like a board piece.
    const d = -0.45;
    poly(g, [P(0, PLOT, 0), P(PLOT, PLOT, 0), P(PLOT, PLOT, d), P(0, PLOT, d)], th.side);
    poly(g, [P(PLOT, 0, 0), P(PLOT, PLOT, 0), P(PLOT, PLOT, d), P(PLOT, 0, d)], th.side2);
    poly(g, [P(0, PLOT, d * 0.45), P(PLOT, PLOT, d * 0.45), P(PLOT, PLOT, d), P(0, PLOT, d)], th.soil);
    poly(g, [P(PLOT, 0, d * 0.45), P(PLOT, PLOT, d * 0.45), P(PLOT, PLOT, d), P(PLOT, 0, d)], th.soil2);
    const top = this.seasonTop || th.top;
    poly(g, [P(0, 0), P(PLOT, 0), P(PLOT, PLOT), P(0, PLOT)], plot.status === 'ruins' ? shade(th.top, -0.1, 0.5) : top);

    if (z >= 12) {   // subtle lawn stripes
      g.globalAlpha = 0.5;
      for (let k = 0; k < PLOT; k += 2) poly(g, [P(k, 0), P(k + 1, 0), P(k + 1, PLOT), P(k, PLOT)], this.seasonTop ? shade(this.seasonTop, -0.03) : th.top2);
      g.globalAlpha = 1;
    }
    // Ground texture: patches of lighter and darker grass, so land isn't one flat colour.
    if (z >= 5) {
      const ps = (((plot.px * 73856093) ^ (plot.py * 19349663)) & 0xffff) * 577, base = this.seasonTop || th.top;
      for (let i = 0; i < PLOT * PLOT; i++) {
        const r = hash(i + ps, 41);
        if (r > 0.4 || (plot.terr && plot.terr.charCodeAt(i) !== 48)) continue;
        const tx = i % PLOT, ty = (i / PLOT) | 0;
        poly(g, [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)], shade(base, r < 0.2 ? -0.035 : 0.03));
      }
    }
    if (live && this.scene.prefs.grid && plot.mine) {
      g.strokeStyle = th.grid; g.lineWidth = 1; g.beginPath();
      for (let k = 1; k < PLOT; k++) {
        let a = P(k, 0), b = P(k, PLOT); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
        a = P(0, k); b = P(PLOT, k); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
    }

    // Terrain: water under everything, hills as darker, raised-looking ground.
    const terr = plot.terr;
    if (terr) {
      const wave = live && !this.scene.prefs?.reducedMotion ? performance.now() / 1400 : 0;
      for (let i = 0; i < terr.length; i++) {
        const k = terr.charCodeAt(i) - 48;
        if (!k) continue;
        const tx = i % PLOT, ty = (i / PLOT) | 0;
        if (k === 2) {
          poly(g, [P(tx, ty, -0.06), P(tx + 1, ty, -0.06), P(tx + 1, ty + 1, -0.06), P(tx, ty + 1, -0.06)], th.water);
          if (z >= 9 && hash(i, 31) < 0.5) { const o = (Math.sin(wave + hash(i, 32) * 6) + 1) * 0.3; poly(g, [P(tx + 0.2 + o * 0.5, ty + 0.35), P(tx + 0.45 + o * 0.5, ty + 0.35), P(tx + 0.45 + o * 0.5, ty + 0.42), P(tx + 0.2 + o * 0.5, ty + 0.42)], th.waterHi); }
          const dry = (dx, dy) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < PLOT && y < PLOT && terr.charCodeAt(y * PLOT + x) !== 50; };
          if (z >= 6) { g.strokeStyle = th.shore; g.lineWidth = Math.max(1, z / 10); g.beginPath();
            for (const [dx, dy, a, b] of [[0, -1, [tx, ty], [tx + 1, ty]], [1, 0, [tx + 1, ty], [tx + 1, ty + 1]], [0, 1, [tx, ty + 1], [tx + 1, ty + 1]], [-1, 0, [tx, ty], [tx, ty + 1]]]) {
              if (!dry(dx, dy)) continue; const p1 = P(a[0], a[1], -0.03), p2 = P(b[0], b[1], -0.03); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); }
            g.stroke(); }
        } else poly(g, [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)], this.seasonTop ? shade(this.seasonTop, hash(i, 33) < 0.5 ? -0.07 : -0.09) : hash(i, 33) < 0.5 ? th.hill : th.hill2);
      }
    }
    const grid = plot.grid, traffic = live && plot.mine && this.scene.overlay === 'traffic' ? this.scene.traffic : null;
    // Pass 1: ground (roads, plazas, park lawns, building sites)
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t === T.EMPTY) continue;
      const tx = i % PLOT, ty = (i / PLOT) | 0;
      const dia = [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)];
      if (t === T.ROAD || t === T.XING || t === T.LIGHTS || t === T.ROUNDABOUT) {
        let col = plot.uc?.has(i) ? th.dirt : th.road;
        if (traffic && traffic.cap[i]) col = jamColour(traffic.load[i] / traffic.cap[i]);
        if (z >= 9 && !plot.uc?.has(i)) {
          // Pavement on the sides that don't continue into more road.
          poly(g, dia, th.pave);
          const road = (dx, dy) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < PLOT && y < PLOT && [T.ROAD, T.HALL, T.XING, T.LIGHTS, T.ROUNDABOUT].includes(grid[y * PLOT + x]); };
          const e = 0.16, x0 = road(-1, 0) ? 0 : e, x1 = road(1, 0) ? 1 : 1 - e, y0 = road(0, -1) ? 0 : e, y1 = road(0, 1) ? 1 : 1 - e;
          poly(g, [P(tx + x0, ty + y0), P(tx + x1, ty + y0), P(tx + x1, ty + y1), P(tx + x0, ty + y1)], col);
        } else poly(g, dia, col);
        if (z >= 10 && !plot.uc?.has(i) && (t === T.ROAD || t === T.LIGHTS)) this.laneMarks(g, P, grid, i, tx, ty, z);
        if (terr && terr.charCodeAt(i) === 50 && z >= 8) this.railings(g, P, grid, tx, ty, z);
        if (t === T.XING && !plot.uc?.has(i)) this.rail(g, P, grid, i, tx, ty, z, false, true);
        if (t === T.ROUNDABOUT && !plot.uc?.has(i)) {
          const [cx, cy] = P(tx + 0.5, ty + 0.5), r = z * 0.28;
          g.fillStyle = shade(this.pal.park, 0.35); g.strokeStyle = th.mark; g.lineWidth = Math.max(1.5, z / 12);
          g.beginPath(); g.ellipse(cx, cy, r, r / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        }
        if (t === T.LIGHTS && !plot.uc?.has(i) && z >= 8) {
          const green = Math.floor(performance.now() / 3000) % 2;
          for (const [a, b, k] of [[0.12, 0.12, 0], [0.88, 0.88, 0], [0.88, 0.12, 1], [0.12, 0.88, 1]]) {
            const [x0, y0] = P(tx + a, ty + b, 0), [x1, y1] = P(tx + a, ty + b, 0.35);
            g.strokeStyle = '#3b444c'; g.lineWidth = Math.max(1, z / 18); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
            g.fillStyle = (k ^ green) ? '#3ecf6a' : '#e04b3c'; g.beginPath(); g.arc(x1, y1, Math.max(1.5, z * 0.05), 0, Math.PI * 2); g.fill();
          }
        }
        if (live && t === T.ROAD && this.scene.nightAmt > 0.3 && hash(i, 21) < 0.35) this._lights.push([plot, tx + 0.12, ty + 0.12]);
      } else if (t === T.RAIL) {
        this.rail(g, P, grid, i, tx, ty, z, plot.uc?.has(i));
      } else if (t === T.PATH) {
        poly(g, dia, plot.uc?.has(i) ? th.dirt : th.pave);
        if (z >= 10 && !plot.uc?.has(i)) poly(g, [P(tx + 0.3, ty + 0.3), P(tx + 0.7, ty + 0.3), P(tx + 0.7, ty + 0.7), P(tx + 0.3, ty + 0.7)], shade(th.pave, -0.06));
      } else if (GROUND[t] && !plot.uc?.has(i)) poly(g, dia, plot.cond[i] <= 0 ? shade(GROUND[t], 0, 0.6) : GROUND[t]);
      else if (t === T.PARK) poly(g, dia, plot.uc?.has(i) ? th.dirt : shade(this.pal.park, 0.55));
      else if (t === T.HALL) poly(g, dia, th.stone);
      else if (t === T.RUBBLE) poly(g, dia, shade(th.dirt, -0.15));
      else if (plot.uc?.has(i)) poly(g, dia, th.dirt);
      else if (plot.cond[i] <= 0) poly(g, dia, shade(th.dirt, 0, 0.6));
    }
    // Land nobody has bought yet looks wild.
    const land = plot.land;
    if (land) for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (land[c]) continue;
      const cx = (c % CHUNKS) * CHUNK, cy = ((c / CHUNKS) | 0) * CHUNK;
      poly(g, [P(cx, cy), P(cx + CHUNK, cy), P(cx + CHUNK, cy + CHUNK), P(cx, cy + CHUNK)], th.wild);
    }
    if (live && plot.mine && this.scene.showLand && land) this.landEdges(g, P, land);
    const zones = live && plot.mine ? plot.st?.zone : null;
    if (zones) for (let i = 0; i < zones.length; i++) {
      if (!zones[i] || grid[i] !== T.EMPTY) continue;
      const x = i % PLOT, y = (i / PLOT) | 0;
      poly(g, [P(x + 0.06, y + 0.06), P(x + 0.94, y + 0.06), P(x + 0.94, y + 0.94), P(x + 0.06, y + 0.94)], ZONES[zones[i]].col, z >= 10 ? ZONES[zones[i]].col.replace(/[\d.]+\)$/, '0.9)') : null);
    }
    if (live && plot.mine && this.scene.info) for (const [i, col] of this.scene.info) {
      const x = i % PLOT, y = (i / PLOT) | 0;
      poly(g, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], col);
      // Patterns as well as colour: more stripes means a stronger value.
      if (this.scene.prefs?.patterns && z >= 8) {
        const a = +(col.match(/,\s*([\d.]+)\)$/)?.[1] || 0.3), n = Math.max(1, Math.min(5, Math.round(a * 9)));
        g.strokeStyle = 'rgba(23,49,59,0.55)'; g.lineWidth = Math.max(1, z / 20); g.beginPath();
        for (let k = 1; k <= n; k++) { const f = k / (n + 1), p1 = P(x + f, y), p2 = P(x, y + f), p3 = P(x + 1, y + f), p4 = P(x + f, y + 1); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.moveTo(p3[0], p3[1]); g.lineTo(p4[0], p4[1]); }
        g.stroke();
      }
    }
    // Pass 2: objects, back to front along diagonals
    const agents = live ? this.scene.agentsByPlot?.get(plot.id) : null;
    const ps = (((plot.px * 73856093) ^ (plot.py * 19349663)) & 0xffff) * 577;   // so neighbouring plots don't repeat the same trees
    for (let s = 0; s <= 2 * (PLOT - 1); s++) {
      for (let tx = Math.max(0, s - PLOT + 1); tx <= Math.min(s, PLOT - 1); tx++) {
        const ty = s - tx, i = ty * PLOT + tx, t = grid[i];
        if (B[t]?.cat || t === T.HALL || t === T.RUBBLE) this.object(g, P, plot, t, i, tx, ty, z, live);
        else if (t === T.EMPTY && terr && terr.charCodeAt(i) === 49 && hash(i + ps, 34) < 0.22 && z >= 6) this.tree(g, P, tx + 0.35 + hash(i + ps, 35) * 0.3, ty + 0.35 + hash(i + ps, 36) * 0.3, 0.3 + hash(i + ps, 37) * 0.2, th.wildTree, z);
        else if (t === T.EMPTY && (!terr || terr.charCodeAt(i) !== 50) && land && !land[Math.floor(ty / CHUNK) * CHUNKS + Math.floor(tx / CHUNK)] && hash(i + ps, 9) < 0.28 && z >= 6) {
          this.tree(g, P, tx + 0.3 + hash(i + ps, 3) * 0.4, ty + 0.3 + hash(i + ps, 4) * 0.4, 0.34 + hash(i + ps, 5) * 0.22, th.wildTree, z);
        }
        if (agents && agents.has(i)) for (const a of agents.get(i)) this.agent(g, P, a);
      }
    }
    if (live && plot.mine && this.scene.showLand && land) this.landTags(g, P, land);
  }

  // Low walls along a bridge's sides where it doesn't continue.
  railings(g, P, grid, tx, ty, z) {
    const go = (dx, dy) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < PLOT && y < PLOT && grid[y * PLOT + x] !== T.EMPTY; };
    g.strokeStyle = '#c9ced3'; g.lineWidth = Math.max(1.5, z / 10); g.beginPath();
    const seg = (a, b) => { const p1 = P(a[0], a[1], 0.12), p2 = P(b[0], b[1], 0.12); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); };
    if (!go(0, -1) && (go(-1, 0) || go(1, 0))) seg([tx, ty + 0.06], [tx + 1, ty + 0.06]);
    if (!go(0, 1) && (go(-1, 0) || go(1, 0))) seg([tx, ty + 0.94], [tx + 1, ty + 0.94]);
    if (!go(-1, 0) && (go(0, -1) || go(0, 1))) seg([tx + 0.06, ty], [tx + 0.06, ty + 1]);
    if (!go(1, 0) && (go(0, -1) || go(0, 1))) seg([tx + 0.94, ty], [tx + 0.94, ty + 1]);
    g.stroke();
  }
  laneMarks(g, P, grid, i, tx, ty, z) {
    const cx = tx + 0.5, cy = ty + 0.5;
    const dirs = [[1, 0, tx < PLOT - 1 ? i + 1 : -1], [-1, 0, tx > 0 ? i - 1 : -1], [0, 1, ty < PLOT - 1 ? i + PLOT : -1], [0, -1, ty > 0 ? i - PLOT : -1]];
    g.strokeStyle = this.th.mark;
    g.lineWidth = Math.max(1, z / 16);
    g.setLineDash([z * 0.18, z * 0.16]);
    g.beginPath();
    let n = 0;
    for (const [dx, dy, j] of dirs) {
      if (j < 0 || ![T.ROAD, T.HALL, T.XING, T.LIGHTS, T.ROUNDABOUT].includes(grid[j])) continue;
      n++;
      const a = P(cx, cy), b = P(cx + dx * 0.5, cy + dy * 0.5);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    g.setLineDash([]);
    if (n === 0) { const c = P(cx, cy); g.fillStyle = this.th.mark; g.fillRect(c[0] - 1, c[1] - 1, 2, 2); }
  }

  box(g, P, x0, y0, x1, y1, z0, z1, col, grey = 0) {
    const edge = this.scene?.prefs?.mapContrast ? 'rgba(0,0,0,0.6)' : null;
    if (edge) g.lineWidth = 1;
    poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(col, -0.02, grey), edge);
    poly(g, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade(col, -0.2, grey), edge);
    poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(col, 0.16, grey), edge);
  }
  // A rectangle painted on the south (S) or east (E) face.
  face(g, P, side, fixed, u0, u1, h0, h1, col) {
    if (side === 'S') poly(g, [P(u0, fixed, h0), P(u1, fixed, h0), P(u1, fixed, h1), P(u0, fixed, h1)], col);
    else poly(g, [P(fixed, u0, h0), P(fixed, u1, h0), P(fixed, u1, h1), P(fixed, u0, h1)], col);
  }
  windows(g, P, x0, y0, x1, y1, floors, fh, base, col, perSide = 2) {
    for (let f = 0; f < floors; f++) {
      const h0 = base + f * fh + fh * 0.3, h1 = h0 + fh * 0.4;
      for (let k = 0; k < perSide; k++) {
        const a = x0 + (x1 - x0) * ((k + 0.25) / perSide), b = a + (x1 - x0) * (0.5 / perSide);
        this.face(g, P, 'S', y1, a, b, h0, h1, col);
        const c = y0 + (y1 - y0) * ((k + 0.25) / perSide), e = c + (y1 - y0) * (0.5 / perSide);
        this.face(g, P, 'E', x1, c, e, h0, h1, col);
      }
    }
  }
  roofCol(col) { return this.snowy ? (this.scene?.theme === 'dark' ? '#aab8bf' : '#f1f5f7') : col; }
  gable(g, P, x0, y0, x1, y1, h, r, col, grey) {
    col = this.roofCol(col);
    const ym = (y0 + y1) / 2;
    poly(g, [P(x0, y0, h), P(x1, y0, h), P(x1, ym, h + r), P(x0, ym, h + r)], shade(col, -0.25, grey));
    poly(g, [P(x0, y1, h), P(x1, y1, h), P(x1, ym, h + r), P(x0, ym, h + r)], shade(col, 0.02, grey));
    poly(g, [P(x1, y0, h), P(x1, y1, h), P(x1, ym, h + r)], shade(this.th.wall, -0.16, grey));
  }
  hip(g, P, x0, y0, x1, y1, h, r, col, grey) {
    col = this.roofCol(col);
    const a = P((x0 + x1) / 2, (y0 + y1) / 2, h + r);
    poly(g, [P(x0, y0, h), P(x1, y0, h), a], shade(col, -0.25, grey));
    poly(g, [P(x0, y0, h), P(x0, y1, h), a], shade(col, -0.3, grey));
    poly(g, [P(x0, y1, h), P(x1, y1, h), a], shade(col, 0.04, grey));
    poly(g, [P(x1, y0, h), P(x1, y1, h), a], shade(col, -0.16, grey));
  }
  tree(g, P, x, y, size, col, z) {
    if (this.seasonTree) col = this.seasonTree;
    const [bx, by] = P(x, y, 0), [tx2, ty2] = P(x, y, size * 0.9);
    g.strokeStyle = '#7a5a3a'; g.lineWidth = Math.max(1, z / 12);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(tx2, ty2); g.stroke();
    const r = size * z * 0.42;
    g.fillStyle = shade(col, -0.12); g.beginPath(); g.arc(tx2, ty2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(col, 0.12); g.beginPath(); g.arc(tx2 - r * 0.25, ty2 - r * 0.3, r * 0.62, 0, Math.PI * 2); g.fill();
  }

  object(g, P, plot, t, i, tx, ty, z, live) {
    const th = this.th, pal = this.pal;
    const lv = plot.lv ? plot.lv[i] || 1 : 1;
    const q = plot.queueMap?.get(i);
    if (t === T.RUBBLE) {
      for (let k = 0; k < 3; k++) {
        const a = tx + 0.2 + hash(i, k) * 0.5, b = ty + 0.2 + hash(i, k + 7) * 0.5, s = 0.14 + hash(i, k + 3) * 0.1;
        this.box(g, P, a, b, a + s, b + s, 0, s * 0.8, th.ruin);
      }
      return;
    }
    if (plot.uc?.has(i)) { this.site(g, P, t, tx, ty, q, z); return; }
    const cond = t === T.HALL ? 100 : plot.cond[i] ?? 100;
    const grey = cond <= 0 ? 0.9 : cond < 40 ? 0.5 : 0;
    const base = pal[B[t].col || B[t].key] || '#999999';
    const col = [T.HOUSE, T.VILLA, T.APARTMENT].includes(t) ? shade(base, (hash(i, 31) - 0.5) * 0.35) : base;
    if (live && z >= 9 && this.view === '3d' && !this.scene.pulseOnly) poly(g, [P(tx + 0.2, ty + 0.25), P(tx + 1.05, ty + 0.25), P(tx + 1.05, ty + 1.05), P(tx + 0.2, ty + 1.05)], 'rgba(20,30,20,0.10)');
    const night = live && this.scene.nightAmt > 0.15 && cond > 0;
    const glass = night ? '#ffd57a' : th.glass;
    let top = 0.5;

    if (t === T.HOUSE) {
      const x0 = tx + 0.18, x1 = tx + 0.82, y0 = ty + 0.2, y1 = ty + 0.8, fh = 0.36, h = 0.42 + fh * (lv - 1);
      this.box(g, P, x0, y0, x1, y1, 0, h, th.wall, grey);
      this.windows(g, P, x0, y0, x1, y1, lv, fh, 0.02, shade(glass, 0, grey), 2);
      this.face(g, P, 'S', y1, x0 + 0.26, x0 + 0.38, 0, 0.24, shade(col, -0.45, grey));
      if (hash(i, 41) < 0.33) this.hip(g, P, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, 0.3, col, grey);
      else this.gable(g, P, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, 0.32, col, grey);
      if (hash(i, 42) < 0.4 && lv < 3) this.box(g, P, x1 - 0.2, y0 + 0.1, x1 - 0.1, y0 + 0.2, h, h + 0.34, shade('#9a6b52', 0, grey), grey);
      if (lv === 3) this.box(g, P, x0 + 0.08, y0 + 0.08, x0 + 0.18, y0 + 0.18, h, h + 0.42, shade(col, -0.3), grey);
      top = h + 0.32;
    } else if (t === T.WORK) {
      const x0 = tx + 0.14, x1 = tx + 0.86, y0 = ty + 0.14, y1 = ty + 0.86, h = 0.8 + 0.55 * (lv - 1);
      this.box(g, P, x0, y0, x1, y1, 0, h, col, grey);
      for (let h0 = 0.12; h0 + 0.1 < h - 0.04; h0 += 0.22) {
        this.face(g, P, 'S', y1, x0 + 0.05, x1 - 0.05, h0, h0 + 0.1, shade(glass, 0, grey));
        this.face(g, P, 'E', x1, y0 + 0.05, y1 - 0.05, h0, h0 + 0.1, shade(glass, -0.18, grey));
      }
      this.box(g, P, x0 + 0.15, y0 + 0.15, x0 + 0.35, y0 + 0.35, h, h + 0.1, '#c9ced3', grey);
      top = h + 0.1;
    } else if (t === T.SHOP) {
      const x0 = tx + 0.12, x1 = tx + 0.88, y0 = ty + 0.16, y1 = ty + 0.84, h = 0.44 + 0.22 * (lv - 1);
      this.box(g, P, x0, y0, x1, y1, 0, h, shade(col, 0.72), grey);
      this.face(g, P, 'S', y1, x0 + 0.08, x1 - 0.08, 0.04, h * 0.55, shade(glass, 0, grey));
      this.face(g, P, 'E', x1, y0 + 0.08, y1 - 0.08, 0.04, h * 0.55, shade(glass, -0.18, grey));
      const hA = h * 0.72, out = 0.13, seg = 4;
      for (let k = 0; k < seg; k++) {
        const c = k % 2 ? '#ffffff' : col;
        const a = x0 + (x1 - x0) * k / seg, b = x0 + (x1 - x0) * (k + 1) / seg;
        poly(g, [P(a, y1, hA), P(b, y1, hA), P(b, y1 + out, hA - 0.12), P(a, y1 + out, hA - 0.12)], shade(c, 0, grey));
        const e = y0 + (y1 - y0) * k / seg, f = y0 + (y1 - y0) * (k + 1) / seg;
        poly(g, [P(x1, e, hA), P(x1, f, hA), P(x1 + out, f, hA - 0.12), P(x1 + out, e, hA - 0.12)], shade(c, -0.15, grey));
      }
      this.box(g, P, x0 + 0.2, y0 + 0.28, x1 - 0.2, y0 + 0.36, h, h + 0.16, col, grey);
      top = h + 0.16;
    } else if (t === T.SCHOOL) {
      const x0 = tx + 0.1, x1 = tx + 0.9, y0 = ty + 0.14, y1 = ty + 0.86, h = 0.55 + 0.25 * (lv - 1);
      this.box(g, P, x0, y0, x1, y1, 0, h, shade(col, 0.55), grey);
      this.windows(g, P, x0, y0, x1, y1, lv + 1, h / (lv + 1), 0, shade(glass, 0, grey), 3);
      this.hip(g, P, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h, 0.3, col, grey);
      const [fx, fy] = P(x0 + 0.06, y0 + 0.06, h), [fx2, fy2] = P(x0 + 0.06, y0 + 0.06, h + 0.75);
      g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16);
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx2, fy2); g.stroke();
      poly(g, [[fx2, fy2], [fx2 + z * 0.35, fy2 + z * 0.08], [fx2, fy2 + z * 0.18]], pal.shop);
      top = h + 0.75;
    } else if (t === T.PARK) {
      for (let k = 0; k < 3; k++) {
        const a = tx + 0.22 + hash(i, k) * 0.56, b = ty + 0.22 + hash(i, k + 11) * 0.56;
        this.tree(g, P, a, b, 0.38 + hash(i, k + 5) * 0.2, shade(col, 0, grey), z);
      }
      top = 0.6;
    } else if (t === T.HALL) {
      this.box(g, P, tx + 0.08, ty + 0.08, tx + 0.92, ty + 0.92, 0, 0.12, th.stone);
      const a0 = tx + 0.2, a1 = tx + 0.8, b0 = ty + 0.2, b1 = ty + 0.8;
      this.box(g, P, a0, b0, a1, b1, 0.12, 0.78, th.wall);
      for (let k = 0; k < 4; k++) {
        const u = a0 + 0.06 + k * 0.15;
        this.face(g, P, 'S', b1, u, u + 0.05, 0.14, 0.72, shade(th.stone, -0.18));
        this.face(g, P, 'E', a1, b0 + 0.06 + k * 0.15, b0 + 0.11 + k * 0.15, 0.14, 0.72, shade(th.stone, -0.3));
      }
      this.hip(g, P, a0 - 0.04, b0 - 0.04, a1 + 0.04, b1 + 0.04, 0.78, 0.34, col, 0);
      const [fx, fy] = P(tx + 0.5, ty + 0.5, 1.12), [fx2, fy2] = P(tx + 0.5, ty + 0.5, 1.6);
      g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16);
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx2, fy2); g.stroke();
      poly(g, [[fx2, fy2], [fx2 + z * 0.4, fy2 + z * 0.1], [fx2, fy2 + z * 0.2]], /^#[0-9a-f]{6}$/i.test(plot.flag || '') ? plot.flag : col, 'rgba(0,0,0,0.25)');
      top = 1.6;
    } else top = this.more(g, P, t, i, tx, ty, z, lv, col, grey, glass, live, cond);

    // Damage shows: cracks on run-down buildings, and a wisp of smoke when they're nearly gone.
    if (cond > 0 && cond < 40 && t !== T.HALL && z >= 9 && B[t]?.cat) {
      g.strokeStyle = 'rgba(40,30,25,0.65)'; g.lineWidth = Math.max(1, z / 18); g.beginPath();
      const [a, b] = P(tx + 0.35 + hash(i, 43) * 0.3, ty + 0.86, Math.min(top, 0.7) * 0.8), [c2, d2] = P(tx + 0.42 + hash(i, 44) * 0.2, ty + 0.86, Math.min(top, 0.7) * 0.45), [e, f] = P(tx + 0.36 + hash(i, 45) * 0.2, ty + 0.86, 0.08);
      g.moveTo(a, b); g.lineTo(c2, d2); g.lineTo(e, f); g.stroke();
      if (cond < 20 && live) { const [sx, sy] = P(tx + 0.5, ty + 0.5, top + 0.2 + (performance.now() / 1500) % 0.4); g.fillStyle = 'rgba(90,90,90,0.35)'; g.beginPath(); g.arc(sx, sy, z * 0.12, 0, Math.PI * 2); g.fill(); }
    }
    if (q && q.up) this.scaffold(g, P, tx, ty, modelHeight(t, Math.min(MAX_LEVEL, lv + 1)), q, t, z);
    if (live && cond > 0 && cond < 40 && z >= 12) this.badgeText(g, P(tx + 0.5, ty + 0.5, top + 0.35), '!', '#e04b3c', z);
    if (live && this.scene.shapes && glyphOf(t) !== undefined && z >= 9) {
      const [bx, by] = P(tx + 0.5, ty + 0.5, top + 0.3);
      const r = Math.max(4, z * 0.22);
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(bx, by, r + 2, 0, Math.PI * 2); g.fill();
      glyph(g, glyphOf(t), bx, by, r * 0.62, '#17313b');
    }
  }

  site(g, P, t, tx, ty, q, z) {
    const done = q ? Math.max(0, 1 - q.left / B[t].work) : 0;
    const H = modelHeight(t, 1);
    this.box(g, P, tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.9, 0, 0.05, '#cfc9bd');
    if (done > 0.02) {
      g.globalAlpha = 0.85;
      this.box(g, P, tx + 0.2, ty + 0.2, tx + 0.8, ty + 0.8, 0.05, 0.05 + (H - 0.1) * done, shade(this.pal[B[t].col || B[t].key] || this.th.wall, 0.5));
      g.globalAlpha = 1;
    }
    this.scaffold(g, P, tx, ty, H, q, t, z);
  }

  scaffold(g, P, tx, ty, H, q, t, z) {
    const x0 = tx + 0.14, x1 = tx + 0.86, y0 = ty + 0.14, y1 = ty + 0.86;
    g.strokeStyle = this.th.scaffold;
    g.lineWidth = Math.max(1, z / 18);
    g.beginPath();
    for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0]]) { const a = P(x, y, 0), b = P(x, y, H); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    for (let h = 0.3; h <= H + 0.01; h += 0.3) {
      const a = P(x0, y1, h), b = P(x1, y1, h), c = P(x1, y0, h);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]);
    }
    g.stroke();
    if (q && z >= 9) {
      const total = q.up ? Math.round(B[t].work * 1.2) : B[t].work;
      const done = Math.max(0, 1 - q.left / total);
      const [cx, cy] = P(tx + 0.5, ty + 0.5, H + 0.45);
      const r = Math.max(7, z * 0.3);
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(cx, cy, r + 2, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(2.5, r * 0.32); g.strokeStyle = 'rgba(23,49,59,0.15)';
      g.beginPath(); g.arc(cx, cy, r - 1, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#2f9e5a';
      g.beginPath(); g.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2); g.stroke();
      if (q.up) { g.fillStyle = '#17313b'; g.font = `800 ${Math.round(r)}px Overpass, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('↑', cx, cy + 1); }
    }
  }

  badgeText(g, [x, y], text, col, z) {
    const r = Math.max(6, z * 0.24);
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.3)}px Overpass, system-ui`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
  }

  car(g, P, car) {
    const along = Math.abs(car.dx || 1) >= Math.abs(car.dy || 0);
    const L = 0.17, W = 0.1, x = car.lx, y = car.ly;
    const hx = along ? L : W, hy = along ? W : L;
    const col = car.follow ? '#ffc933' : CAR_COLS[car.c % CAR_COLS.length];
    this.box(g, P, x - hx, y - hy, x + hx, y + hy, 0.02, 0.1, col);
    const cx = along ? hx * 0.55 : hx * 0.8, cy = along ? hy * 0.8 : hy * 0.55;
    this.box(g, P, x - cx, y - cy, x + cx, y + cy, 0.1, 0.17, '#cfe3ee');
    if (this.scene.nightAmt > 0.3) {
      const fx = x + (car.dx || 0) * hx * 1.05, fy = y + (car.dy || 0) * hy * 1.05;
      const [lx, ly] = P(fx, fy, 0.07);
      g.fillStyle = 'rgba(255,226,140,0.9)';
      g.beginPath(); g.arc(lx, ly, Math.max(1.5, this.cam.z * 0.05), 0, Math.PI * 2); g.fill();
    }
    if (car.follow) {
      const [mx, my] = P(x, y, 0.55);
      const r = Math.max(5, this.cam.z * 0.16);
      g.fillStyle = '#ffc933'; g.strokeStyle = '#17313b'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx, my + r); g.lineTo(mx - r * 0.8, my - r * 0.3); g.lineTo(mx + r * 0.8, my - r * 0.3); g.closePath(); g.fill(); g.stroke();
    }
  }



  rail(g, P, grid, i, tx, ty, z, building, overRoad) {
    if (!overRoad) poly(g, [P(tx + 0.08, ty + 0.08), P(tx + 0.92, ty + 0.08), P(tx + 0.92, ty + 0.92), P(tx + 0.08, ty + 0.92)], building ? this.th.dirt : '#b3a58f');
    if (building || z < 6) return;
    const is = (dx, dy) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < PLOT && y < PLOT && [T.RAIL, T.STATION, T.XING].includes(grid[y * PLOT + x]); };
    const railish = (dx, dy) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < PLOT && y < PLOT && [T.RAIL, T.XING].includes(grid[y * PLOT + x]); };
    const ew = overRoad ? railish(1, 0) || railish(-1, 0) : is(1, 0) || is(-1, 0) || tx === 0 || tx === PLOT - 1;
    const ns = overRoad ? railish(0, 1) || railish(0, -1) : is(0, 1) || is(0, -1) || ty === 0 || ty === PLOT - 1;
    const dirs = ew || !ns ? [['x']] : [];
    if (ns) dirs.push(['y']);
    for (const [d] of dirs) {
      if (overRoad) { g.strokeStyle = '#f2f2f2'; g.lineWidth = Math.max(2, z / 8); g.setLineDash([z * 0.1, z * 0.1]); const a = d === 'x' ? P(tx + 0.02, ty + 0.1) : P(tx + 0.1, ty + 0.02), b = d === 'x' ? P(tx + 0.02, ty + 0.9) : P(tx + 0.9, ty + 0.02); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); }
      g.strokeStyle = '#7a5b3e'; g.lineWidth = Math.max(1.5, z / 10);
      g.beginPath();
      for (let k = 0.1; k < 1; k += 0.2) {
        const a = d === 'x' ? P(tx + k, ty + 0.25) : P(tx + 0.25, ty + k), b = d === 'x' ? P(tx + k, ty + 0.75) : P(tx + 0.75, ty + k);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
      g.strokeStyle = '#5d646b'; g.lineWidth = Math.max(1, z / 16);
      g.beginPath();
      for (const o of [0.36, 0.64]) {
        const a = d === 'x' ? P(tx, ty + o) : P(tx + o, ty), b = d === 'x' ? P(tx + 1, ty + o) : P(tx + o, ty + 1);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
    }
  }

  vehicle(g, P, a) {
    const along = Math.abs(a.dx || 1) >= Math.abs(a.dy || 0), x = a.lx, y = a.ly;
    if (a.mode === 'bus') {
      const L = 0.34, W = 0.13, hx = along ? L : W, hy = along ? W : L;
      this.box(g, P, x - hx, y - hy, x + hx, y + hy, 0.03, 0.22, '#f2b233');
      if (along) this.face(g, P, 'S', y + hy, x - hx + 0.04, x + hx - 0.04, 0.12, 0.19, '#cfe3ee');
      else this.face(g, P, 'E', x + hx, y - hy + 0.04, y + hy - 0.04, 0.12, 0.19, '#cfe3ee');
      return;
    }
    const L = 0.4, W = 0.15, hx = along ? L : W, hy = along ? W : L;
    this.box(g, P, x - hx, y - hy, x + hx, y + hy, 0.04, 0.27, '#eef2f5');
    if (along) { this.face(g, P, 'S', y + hy, x - hx, x + hx, 0.06, 0.1, '#d8463a'); this.face(g, P, 'S', y + hy, x - hx + 0.05, x + hx - 0.05, 0.15, 0.22, '#3d5a73'); }
    else { this.face(g, P, 'E', x + hx, y - hy, y + hy, 0.06, 0.1, '#d8463a'); this.face(g, P, 'E', x + hx, y - hy + 0.05, y + hy - 0.05, 0.15, 0.22, '#3d5a73'); }
  }

  // People on the move: cars on the road, bikes near the kerb, walkers on the pavement.
  agent(g, P, a) {
    if (a.mode === 'car') { this.car(g, P, a); return; }
    if (a.mode === 'bus' || a.mode === 'train') { this.vehicle(g, P, a); return; }
    const [x, y] = P(a.lx, a.ly, 0);
    const z = this.cam.z, u = Math.max(1.5, z * 0.05);
    if (a.mode === 'bike') {
      g.strokeStyle = '#2f3a40'; g.lineWidth = Math.max(1, u * 0.5);
      const along = Math.abs(a.dx || 1) >= Math.abs(a.dy || 0), sx = along ? u * 1.6 : -u * 1.6, sy = u * 0.8;
      g.beginPath(); g.arc(x - sx, y - sy * (along ? 1 : -1) * 0.5, u * 0.9, 0, Math.PI * 2); g.arc(x + sx, y + sy * (along ? 1 : -1) * 0.5, u * 0.9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = a.shirt; g.fillRect(x - u * 0.7, y - u * 4.2, u * 1.4, u * 2.6);
      g.fillStyle = '#e8c4a0'; g.beginPath(); g.arc(x, y - u * 4.9, u * 0.9, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = a.shirt; g.fillRect(x - u * 0.8, y - u * 3.4, u * 1.6, u * 2.4);
      g.fillStyle = '#3b4650'; g.fillRect(x - u * 0.7, y - u * 1.1, u * 0.6, u * 1.2); g.fillRect(x + u * 0.1, y - u * 1.1, u * 0.6, u * 1.2);
      g.fillStyle = '#e8c4a0'; g.beginPath(); g.arc(x, y - u * 4.2, u * 0.95, 0, Math.PI * 2); g.fill();
    }
    if (a.follow) { g.strokeStyle = '#ffc933'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y - u * 2.5, u * 4, 0, Math.PI * 2); g.stroke(); }
  }

  landEdges(g, P, land) {
    g.strokeStyle = 'rgba(255,201,51,0.9)'; g.lineWidth = 2; g.setLineDash([6, 5]);
    g.beginPath();
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (!land[c]) continue;
      const cx = (c % CHUNKS) * CHUNK, cy = ((c / CHUNKS) | 0) * CHUNK, x = c % CHUNKS, y = (c / CHUNKS) | 0;
      const own = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < CHUNKS && Y < CHUNKS && land[Y * CHUNKS + X]; };
      const seg = (a, b) => { const p = P(...a), q = P(...b); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); };
      if (!own(0, -1)) seg([cx, cy], [cx + CHUNK, cy]);
      if (!own(0, 1)) seg([cx, cy + CHUNK], [cx + CHUNK, cy + CHUNK]);
      if (!own(-1, 0)) seg([cx, cy], [cx, cy + CHUNK]);
      if (!own(1, 0)) seg([cx + CHUNK, cy], [cx + CHUNK, cy + CHUNK]);
    }
    g.stroke(); g.setLineDash([]);
  }
  landTags(g, P, land) {
    const price = this.scene.landPrice;
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (land[c]) continue;
      const x = c % CHUNKS, y = (c / CHUNKS) | 0;
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < CHUNKS && Y < CHUNKS && land[Y * CHUNKS + X]; });
      if (!next) continue;
      const [px, py] = P(x * CHUNK + CHUNK / 2, y * CHUNK + CHUNK / 2, 0.6);
      const text = `$${price.toLocaleString()}`;
      g.font = '800 12px Overpass, system-ui, sans-serif';
      const w = g.measureText(text).width + 14;
      g.fillStyle = '#ffc933'; roundRect(g, px - w / 2, py - 11, w, 22, 11); g.fill();
      g.strokeStyle = '#17313b'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#17313b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, px, py + 1);
    }
  }

  // Models for the wider catalogue. Returns the height of the top, for badges.
  more(g, P, t, i, tx, ty, z, lv, col, grey, glass, live, cond) {
    const th = this.th, L = lv - 1, sh = (c, a = 0) => shade(c, a, grey);
    const night = live && this.scene.nightAmt > 0.3 && cond > 0;
    const flag = (x, y, h, c) => {
      const [a, b] = P(x, y, h), [a2, b2] = P(x, y, h + 0.6);
      g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16); g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
      poly(g, [[a2, b2], [a2 + z * 0.32, b2 + z * 0.08], [a2, b2 + z * 0.16]], c);
    };
    const cross = (x, y, h, c = '#e04b3c') => { const [a, b] = P(x, y, h); const r = Math.max(3, z * 0.12); g.fillStyle = '#fff'; g.fillRect(a - r * 1.4, b - r * 1.4, r * 2.8, r * 2.8); g.fillStyle = c; g.fillRect(a - r, b - r * 0.35, r * 2, r * 0.7); g.fillRect(a - r * 0.35, b - r, r * 0.7, r * 2); };
    switch (t) {
      case T.APARTMENT: {
        const h = 1.3 + 0.45 * L, x0 = tx + 0.12, x1 = tx + 0.88, y0 = ty + 0.12, y1 = ty + 0.88;
        this.box(g, P, x0, y0, x1, y1, 0, h, sh(col, 0.55), grey);
        this.windows(g, P, x0, y0, x1, y1, Math.round(h / 0.28), 0.28, 0.04, sh(glass), 3);
        this.box(g, P, x0 + 0.1, y0 + 0.1, x0 + 0.3, y0 + 0.3, h, h + 0.12, sh(col, -0.2), grey);
        return h + 0.12;
      }
      case T.VILLA: {
        const h = 0.45 + 0.18 * L;
        poly(g, [P(tx + 0.62, ty + 0.58), P(tx + 0.92, ty + 0.58), P(tx + 0.92, ty + 0.9), P(tx + 0.62, ty + 0.9)], '#5ab8e0');
        this.box(g, P, tx + 0.12, ty + 0.12, tx + 0.6, ty + 0.62, 0, h, th.wall, grey);
        this.windows(g, P, tx + 0.12, ty + 0.12, tx + 0.6, ty + 0.62, 1, h, 0.04, sh(glass), 2);
        this.hip(g, P, tx + 0.08, ty + 0.08, tx + 0.64, ty + 0.66, h, 0.28, col, grey);
        this.tree(g, P, tx + 0.8, ty + 0.25, 0.4, sh(this.pal.park), z);
        return h + 0.28;
      }
      case T.CAFE: {
        const h = 0.4 + 0.15 * L;
        this.box(g, P, tx + 0.15, ty + 0.12, tx + 0.8, ty + 0.62, 0, h, sh(col, 0.7), grey);
        this.face(g, P, 'S', ty + 0.62, tx + 0.2, tx + 0.75, 0.04, h * 0.6, sh(night ? '#ffd57a' : glass));
        for (let k = 0; k < 4; k++) poly(g, [P(tx + 0.15 + k * 0.16, ty + 0.62, h * 0.8), P(tx + 0.31 + k * 0.16, ty + 0.62, h * 0.8), P(tx + 0.31 + k * 0.16, ty + 0.74, h * 0.65), P(tx + 0.15 + k * 0.16, ty + 0.74, h * 0.65)], sh(k % 2 ? '#ffffff' : col));
        for (const [a, b] of [[0.3, 0.85], [0.62, 0.85]]) { this.box(g, P, tx + a - 0.05, ty + b - 0.05, tx + a + 0.05, ty + b + 0.05, 0, 0.12, '#f4f1e8'); }
        return h;
      }
      case T.FACTORY: {
        const h = 0.7 + 0.3 * L;
        this.box(g, P, tx + 0.1, ty + 0.15, tx + 0.9, ty + 0.88, 0, h, sh(shade(col, -0.25, 0.4)), grey);
        for (let k = 0; k < 3; k++) this.gable(g, P, tx + 0.1 + k * 0.27, ty + 0.15, tx + 0.37 + k * 0.27, ty + 0.88, h, 0.16, sh('#9aa3ab'), grey);
        this.box(g, P, tx + 0.72, ty + 0.18, tx + 0.84, ty + 0.3, h, h + 0.55, sh('#8a6f5a'), grey);
        if (cond > 0 && live) { const [a, b] = P(tx + 0.78, ty + 0.24, h + 0.7 + (performance.now() / 2000) % 0.3); g.fillStyle = 'rgba(200,200,200,0.6)'; g.beginPath(); g.arc(a, b, z * 0.12, 0, Math.PI * 2); g.arc(a + z * 0.12, b - z * 0.12, z * 0.09, 0, Math.PI * 2); g.fill(); }
        return h + 0.55;
      }
      case T.YARD: {
        for (let k = 0; k < 3; k++) this.box(g, P, tx + 0.15 + k * 0.18, ty + 0.62, tx + 0.29 + k * 0.18, ty + 0.78, 0, 0.14 + k * 0.03, '#b98a52');
        this.box(g, P, tx + 0.55, ty + 0.15, tx + 0.88, ty + 0.45, 0, 0.35, sh(col, 0.3), grey);
        const [a, b] = P(tx + 0.25, ty + 0.25, 0), [a2, b2] = P(tx + 0.25, ty + 0.25, 1.05), [a3, b3] = P(tx + 0.85, ty + 0.25, 1.05);
        g.strokeStyle = '#e0a52e'; g.lineWidth = Math.max(1.5, z / 12);
        g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.lineTo(a3, b3); g.stroke();
        return 1.05;
      }
      case T.DAYCARE: case T.TUTOR: {
        const h = 0.42 + 0.18 * L, x0 = tx + 0.18, x1 = tx + 0.82, y0 = ty + 0.18, y1 = ty + 0.72;
        this.box(g, P, x0, y0, x1, y1, 0, h, sh(col, 0.62), grey);
        this.windows(g, P, x0, y0, x1, y1, 1 + L, h / (1 + L), 0, sh(glass), 2);
        if (t === T.DAYCARE) {
          this.gable(g, P, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, 0.26, col, grey);
          for (let k = 0; k < 5; k++) this.box(g, P, tx + 0.12 + k * 0.17, ty + 0.86, tx + 0.15 + k * 0.17, ty + 0.89, 0, 0.12, '#fff');
          const [a, b] = P(tx + 0.85, ty + 0.3, 0.85); g.fillStyle = this.pal.shop; g.beginPath(); g.arc(a, b, z * 0.1, 0, Math.PI * 2); g.fill();
          return h + 0.26;
        }
        this.box(g, P, x0 + 0.1, y1 - 0.02, x1 - 0.1, y1 + 0.02, h * 0.7, h * 0.95, col);
        return h;
      }
      case T.HIGH: case T.UNI: case T.LIBRARY: case T.COURT: {
        const uni = t === T.UNI, h = (uni ? 0.75 : t === T.HIGH ? 0.65 : 0.55) + 0.22 * L;
        const stone = t !== T.HIGH;
        this.box(g, P, tx + 0.06, ty + 0.06, tx + 0.94, ty + 0.94, 0, 0.08, th.stone);
        this.box(g, P, tx + 0.14, ty + 0.14, tx + 0.86, ty + 0.86, 0.08, h, stone ? th.wall : sh(col, 0.55), grey);
        if (stone) for (let k = 0; k < 5; k++) {
          const u = tx + 0.18 + k * 0.14;
          this.face(g, P, 'S', ty + 0.86, u, u + 0.04, 0.1, h - 0.04, sh(th.stone, -0.2));
          this.face(g, P, 'E', tx + 0.86, ty + 0.18 + k * 0.14, ty + 0.22 + k * 0.14, 0.1, h - 0.04, sh(th.stone, -0.3));
        } else this.windows(g, P, tx + 0.14, ty + 0.14, tx + 0.86, ty + 0.86, 2 + L, (h - 0.08) / (2 + L), 0.08, sh(glass), 3);
        if (uni) {
          this.hip(g, P, tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.9, h, 0.18, sh(col, -0.1), grey);
          const [a, b] = P(tx + 0.5, ty + 0.5, h + 0.22), r = z * 0.32;
          g.fillStyle = sh(col); g.beginPath(); g.arc(a, b, r, Math.PI, 0); g.fill();
          g.fillStyle = sh(col, 0.25); g.beginPath(); g.arc(a - r * 0.25, b - r * 0.2, r * 0.45, Math.PI, 0); g.fill();
          flag(tx + 0.5, ty + 0.5, h + 0.5, this.pal.shop);
          return h + 1.1;
        }
        this.hip(g, P, tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.9, h, t === T.COURT ? 0.32 : 0.26, t === T.COURT ? sh('#8a7c66') : col, grey);
        if (t === T.HIGH) flag(tx + 0.18, ty + 0.18, h, this.pal.shop);
        if (t === T.COURT) { const [a, b] = P(tx + 0.5, ty + 0.86, h - 0.12); g.fillStyle = '#c9a227'; g.beginPath(); g.arc(a, b, z * 0.08, 0, Math.PI * 2); g.fill(); }
        return h + 0.3;
      }
      case T.CLINIC: case T.HOSPITAL: {
        const hosp = t === T.HOSPITAL, h = (hosp ? 1.05 : 0.5) + (hosp ? 0.4 : 0.18) * L;
        this.box(g, P, tx + 0.12, ty + 0.12, tx + 0.88, ty + 0.88, 0, h, '#f6f8fa', grey);
        for (let h0 = 0.12; h0 + 0.1 < h - 0.05; h0 += 0.24) {
          this.face(g, P, 'S', ty + 0.88, tx + 0.16, tx + 0.84, h0, h0 + 0.1, sh(night ? '#ffe9a8' : glass));
          this.face(g, P, 'E', tx + 0.88, ty + 0.16, ty + 0.84, h0, h0 + 0.1, sh(shade(glass, -0.15)));
        }
        this.box(g, P, tx + 0.12, ty + 0.12, tx + 0.88, ty + 0.88, h, h + 0.04, sh(col, 0.2), grey);
        if (hosp) { const [a, b] = P(tx + 0.5, ty + 0.5, h + 0.05); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.ellipse(a, b, z * 0.3, z * 0.15, 0, 0, Math.PI * 2); g.stroke(); }
        cross(tx + 0.5, ty + 0.88, h * 0.75);
        return h + 0.1;
      }
      case T.POLICE: case T.FIRE: {
        const fire = t === T.FIRE, h = 0.52 + 0.18 * L;
        this.box(g, P, tx + 0.12, ty + 0.14, tx + 0.88, ty + 0.86, 0, h, fire ? sh('#d8463a') : sh('#e9eef4'), grey);
        this.face(g, P, 'S', ty + 0.86, tx + 0.18, tx + 0.82, h * 0.65, h * 0.8, fire ? '#f4f1e8' : sh(this.pal.work));
        if (fire) { this.face(g, P, 'S', ty + 0.86, tx + 0.22, tx + 0.48, 0, h * 0.55, '#5b3a32'); this.face(g, P, 'S', ty + 0.86, tx + 0.52, tx + 0.78, 0, h * 0.55, '#5b3a32'); this.box(g, P, tx + 0.14, ty + 0.16, tx + 0.34, ty + 0.36, h, h + 0.45, sh('#b8372d'), grey); }
        else {
          this.windows(g, P, tx + 0.12, ty + 0.14, tx + 0.88, ty + 0.86, 1, h * 0.6, 0, sh(glass), 2);
          const blink = live && Math.floor(performance.now() / 400) % 2;
          this.box(g, P, tx + 0.4, ty + 0.45, tx + 0.5, ty + 0.55, h, h + 0.07, blink ? '#e04b3c' : '#7a2a24');
          this.box(g, P, tx + 0.5, ty + 0.45, tx + 0.6, ty + 0.55, h, h + 0.07, blink ? '#2a3f7a' : '#3b7ddd');
        }
        return h + (fire ? 0.45 : 0.1);
      }
      case T.CEMETERY: {
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) this.box(g, P, tx + 0.2 + k * 0.22, ty + 0.2 + r * 0.22, tx + 0.28 + k * 0.22, ty + 0.24 + r * 0.22, 0, 0.12, '#b9bdc1');
        this.tree(g, P, tx + 0.82, ty + 0.82, 0.45, '#3f6b3a', z);
        return 0.4;
      }
      case T.PLAYGROUND: {
        this.box(g, P, tx + 0.2, ty + 0.2, tx + 0.4, ty + 0.4, 0, 0.35, sh(this.pal.shop), grey);
        poly(g, [P(tx + 0.4, ty + 0.2, 0.35), P(tx + 0.4, ty + 0.4, 0.35), P(tx + 0.75, ty + 0.4, 0), P(tx + 0.75, ty + 0.2, 0)], sh(this.pal.school));
        const post = (x, y) => { const [a, b] = P(x, y, 0), [c2, d] = P(x, y, 0.4); g.moveTo(a, b); g.lineTo(c2, d); };
        g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16); g.beginPath();
        post(tx + 0.3, ty + 0.7); post(tx + 0.3, ty + 0.9); post(tx + 0.75, ty + 0.7); post(tx + 0.75, ty + 0.9);
        const [a, b] = P(tx + 0.3, ty + 0.8, 0.4), [c2, d] = P(tx + 0.75, ty + 0.8, 0.4); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
        return 0.5;
      }
      case T.SPORTS: {
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(1, z / 18);
        poly(g, [P(tx + 0.1, ty + 0.1), P(tx + 0.9, ty + 0.1), P(tx + 0.9, ty + 0.9), P(tx + 0.1, ty + 0.9)], null, 'rgba(255,255,255,0.85)');
        g.beginPath(); const [a, b] = P(tx + 0.5, ty + 0.1), [c2, d] = P(tx + 0.5, ty + 0.9); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
        for (const y of [0.1, 0.9]) this.box(g, P, tx + 0.4, ty + y - 0.02, tx + 0.6, ty + y + 0.02, 0, 0.18, '#ffffff');
        return 0.3;
      }
      case T.GYM: case T.CINEMA: {
        const cin = t === T.CINEMA, h = (cin ? 0.72 : 0.5) + 0.2 * L;
        this.box(g, P, tx + 0.12, ty + 0.12, tx + 0.88, ty + 0.88, 0, h, cin ? sh('#3a3350') : sh(col, 0.2), grey);
        if (cin) {
          this.face(g, P, 'S', ty + 0.88, tx + 0.14, tx + 0.86, h * 0.55, h * 0.85, sh(col));
          if (night || live) for (let k = 0; k < 6; k++) { const [a, b] = P(tx + 0.2 + k * 0.12, ty + 0.88, h * 0.52); g.fillStyle = night ? '#ffe28a' : '#e8d9a0'; g.fillRect(a - 1.5, b - 1.5, 3, 3); }
        } else this.face(g, P, 'S', ty + 0.88, tx + 0.16, tx + 0.84, 0.08, h * 0.8, sh(night ? '#ffe9a8' : glass));
        return h;
      }
      case T.DOJO: {
        const h = 0.42 + 0.16 * L;
        this.box(g, P, tx + 0.2, ty + 0.2, tx + 0.8, ty + 0.8, 0, h, sh('#efe6d2'), grey);
        this.face(g, P, 'S', ty + 0.8, tx + 0.4, tx + 0.6, 0, h * 0.7, sh('#5b3a32'));
        this.hip(g, P, tx + 0.08, ty + 0.08, tx + 0.92, ty + 0.92, h, 0.16, sh(col, -0.3), grey);
        this.hip(g, P, tx + 0.24, ty + 0.24, tx + 0.76, ty + 0.76, h + 0.2, 0.22, sh(col, -0.3), grey);
        this.box(g, P, tx + 0.3, ty + 0.3, tx + 0.7, ty + 0.7, h + 0.1, h + 0.2, sh('#efe6d2'), grey);
        return h + 0.42;
      }

      case T.STATION: {
        const h = 0.55 + 0.2 * L;
        this.box(g, P, tx + 0.05, ty + 0.05, tx + 0.95, ty + 0.95, 0, 0.1, '#cfc9bc');
        this.box(g, P, tx + 0.18, ty + 0.3, tx + 0.82, ty + 0.85, 0.1, h, sh('#efe6d2'), grey);
        this.windows(g, P, tx + 0.18, ty + 0.3, tx + 0.82, ty + 0.85, 1, h - 0.1, 0.1, sh(glass), 3);
        this.gable(g, P, tx + 0.12, ty + 0.25, tx + 0.88, ty + 0.9, h, 0.24, sh(col, -0.1), grey);
        for (const k of [0.15, 0.85]) { const [a, b] = P(tx + k, ty + 0.12, 0.1), [c2, d] = P(tx + k, ty + 0.12, 0.55); g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
        poly(g, [P(tx + 0.08, ty + 0.05, 0.55), P(tx + 0.92, ty + 0.05, 0.55), P(tx + 0.92, ty + 0.25, 0.5), P(tx + 0.08, ty + 0.25, 0.5)], sh(col));
        const [ca, cb] = P(tx + 0.5, ty + 0.85, h - 0.08); g.fillStyle = '#fff'; g.beginPath(); g.arc(ca, cb, z * 0.08, 0, Math.PI * 2); g.fill();
        return h + 0.24;
      }
      case T.STOP: {
        this.box(g, P, tx + 0.25, ty + 0.35, tx + 0.75, ty + 0.55, 0, 0.04, '#cfc9bc');
        poly(g, [P(tx + 0.25, ty + 0.4, 0.04), P(tx + 0.75, ty + 0.4, 0.04), P(tx + 0.75, ty + 0.4, 0.34), P(tx + 0.25, ty + 0.4, 0.34)], 'rgba(191,225,244,0.7)');
        this.box(g, P, tx + 0.22, ty + 0.33, tx + 0.78, ty + 0.58, 0.34, 0.38, sh(col), grey);
        const [a, b] = P(tx + 0.82, ty + 0.62, 0), [c2, d] = P(tx + 0.82, ty + 0.62, 0.5);
        g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
        g.fillStyle = '#f2b233'; g.beginPath(); g.arc(c2, d, Math.max(3, z * 0.09), 0, Math.PI * 2); g.fill();
        return 0.55;
      }
      case T.DEPOT: {
        const h = 0.55 + 0.18 * L;
        this.box(g, P, tx + 0.08, ty + 0.1, tx + 0.92, ty + 0.9, 0, h, sh('#dfe3e6'), grey);
        for (const k of [0.15, 0.55]) this.face(g, P, 'S', ty + 0.9, tx + k, tx + k + 0.3, 0, h * 0.7, '#4a545c');
        this.box(g, P, tx + 0.08, ty + 0.1, tx + 0.92, ty + 0.9, h, h + 0.05, sh(col), grey);
        return h + 0.05;
      }
      case T.POWER: {
        const h = 0.6 + 0.2 * L;
        this.box(g, P, tx + 0.08, ty + 0.4, tx + 0.6, ty + 0.92, 0, h, sh('#c9ced3'), grey);
        this.face(g, P, 'S', ty + 0.92, tx + 0.12, tx + 0.56, h * 0.5, h * 0.75, sh(col));
        for (const [x, y] of [[0.3, 0.2], [0.75, 0.55]]) {
          const [a, b] = P(tx + x, ty + y, 0), [a2, b2] = P(tx + x, ty + y, 1.1), r = z * 0.17;
          g.fillStyle = sh('#dfe3e6'); g.beginPath(); g.moveTo(a - r, b); g.lineTo(a2 - r * 0.7, b2); g.lineTo(a2 + r * 0.7, b2); g.lineTo(a + r, b); g.closePath(); g.fill();
          g.fillStyle = sh('#b9bfc4'); g.beginPath(); g.ellipse(a2, b2, r * 0.7, r * 0.3, 0, 0, Math.PI * 2); g.fill();
          if (live && cond > 0) { g.fillStyle = 'rgba(235,238,240,0.7)'; g.beginPath(); g.arc(a2, b2 - z * 0.2 - (performance.now() / 60 % 8), z * 0.14, 0, Math.PI * 2); g.fill(); }
        }
        return 1.3;
      }
      case T.WATER: {
        for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) this.box(g, P, tx + x - 0.03, ty + y - 0.03, tx + x + 0.03, ty + y + 0.03, 0, 0.75, '#8a9299', grey);
        this.box(g, P, tx + 0.2, ty + 0.2, tx + 0.8, ty + 0.8, 0.75, 1.15, sh('#7fb6d9'), grey);
        this.hip(g, P, tx + 0.18, ty + 0.18, tx + 0.82, ty + 0.82, 1.15, 0.15, sh(col), grey);
        return 1.3;
      }
      case T.DRAIN: {
        this.box(g, P, tx + 0.15, ty + 0.15, tx + 0.85, ty + 0.85, 0, 0.12, sh('#9aa3ab'), grey);
        for (let k = 0; k < 4; k++) this.face(g, P, 'S', ty + 0.85, tx + 0.2 + k * 0.16, tx + 0.28 + k * 0.16, 0.02, 0.1, '#4a545c');
        this.box(g, P, tx + 0.6, ty + 0.2, tx + 0.8, ty + 0.4, 0.12, 0.3, sh(col), grey);
        return 0.35;
      }
      case T.HARBOUR: {
        this.box(g, P, tx + 0.05, ty + 0.05, tx + 0.95, ty + 0.95, 0, 0.1, sh('#b9ab8e'), grey);
        this.box(g, P, tx + 0.15, ty + 0.15, tx + 0.55, ty + 0.5, 0.1, 0.5, sh(col, 0.4), grey);
        for (const [x, y, c] of [[0.62, 0.55, '#e04b3c'], [0.62, 0.72, '#3b7ddd'], [0.8, 0.55, '#f2b233']]) this.box(g, P, tx + x, ty + y, tx + x + 0.14, ty + y + 0.12, 0.1, 0.24, sh(c), grey);
        const [a, b] = P(tx + 0.3, ty + 0.75, 0.1), [a2, b2] = P(tx + 0.3, ty + 0.75, 1.2), [a3, b3] = P(tx + 0.7, ty + 0.75, 1.2);
        g.strokeStyle = sh('#e6a23c'); g.lineWidth = Math.max(1.5, z / 12); g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.lineTo(a3, b3); g.stroke();
        return 1.2;
      }
      case T.AIRPORT: {
        poly(g, [P(tx + 0.05, ty + 0.35), P(tx + 0.95, ty + 0.35), P(tx + 0.95, ty + 0.62), P(tx + 0.05, ty + 0.62)], '#4a545c');
        for (let k = 0; k < 4; k++) poly(g, [P(tx + 0.12 + k * 0.2, ty + 0.47), P(tx + 0.22 + k * 0.2, ty + 0.47), P(tx + 0.22 + k * 0.2, ty + 0.5), P(tx + 0.12 + k * 0.2, ty + 0.5)], '#ffffff');
        this.box(g, P, tx + 0.1, ty + 0.68, tx + 0.7, ty + 0.92, 0, 0.35, sh('#dfe3e6'), grey);
        this.face(g, P, 'S', ty + 0.92, tx + 0.12, tx + 0.68, 0.08, 0.3, sh(glass));
        this.box(g, P, tx + 0.78, ty + 0.72, tx + 0.9, ty + 0.84, 0, 0.9, sh(col, 0.3), grey);
        this.box(g, P, tx + 0.74, ty + 0.68, tx + 0.94, ty + 0.88, 0.9, 1.05, sh(glass), grey);
        return 1.05;
      }
      case T.MONUMENT: {
        this.box(g, P, tx + 0.08, ty + 0.08, tx + 0.92, ty + 0.92, 0, 0.1, th.stone);
        this.box(g, P, tx + 0.28, ty + 0.28, tx + 0.72, ty + 0.72, 0.1, 0.35, sh('#d9d2c2'), grey);
        const [a, b] = P(tx + 0.5, ty + 0.5, 0.35), [a2, b2] = P(tx + 0.5, ty + 0.5, 2.1), w2 = z * 0.12;
        g.fillStyle = sh('#efe9dc'); g.beginPath(); g.moveTo(a - w2, b); g.lineTo(a2 - w2 * 0.35, b2 + z * 0.1); g.lineTo(a2, b2); g.lineTo(a2 + w2 * 0.35, b2 + z * 0.1); g.lineTo(a + w2, b); g.closePath(); g.fill();
        g.fillStyle = sh('#c9c1ae'); g.beginPath(); g.moveTo(a, b + z * 0.02); g.lineTo(a2, b2); g.lineTo(a2 + w2 * 0.35, b2 + z * 0.1); g.lineTo(a + w2, b); g.closePath(); g.fill();
        if (night) { g.fillStyle = 'rgba(255,230,160,0.35)'; g.beginPath(); g.arc(a, b - z * 0.4, z * 0.5, 0, Math.PI * 2); g.fill(); }
        return 2.1;
      }
      case T.METRO: {
        this.box(g, P, tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.9, 0, 0.06, th.stone);
        this.box(g, P, tx + 0.28, ty + 0.3, tx + 0.72, ty + 0.62, 0.06, 0.34, sh('#dfe3e6'), grey);
        poly(g, [P(tx + 0.22, ty + 0.25, 0.4), P(tx + 0.78, ty + 0.25, 0.4), P(tx + 0.78, ty + 0.68, 0.34), P(tx + 0.22, ty + 0.68, 0.34)], sh('rgba(191,225,244,0.85)'));
        const [a, b] = P(tx + 0.84, ty + 0.84, 0), [a2, b2] = P(tx + 0.84, ty + 0.84, 0.75), r = Math.max(4, z * 0.14);
        g.strokeStyle = '#6b6f73'; g.lineWidth = Math.max(1, z / 16); g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
        g.fillStyle = sh(col); g.beginPath(); g.arc(a2, b2, r, 0, Math.PI * 2); g.fill();
        if (z >= 10) { g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.3)}px Overpass, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', a2, b2 + 1); }
        return 0.75;
      }
      case T.LANDFILL: {
        for (const [x, y, r, c] of [[0.35, 0.4, 0.22, '#8d7f62'], [0.62, 0.6, 0.25, '#7f7258'], [0.3, 0.7, 0.14, '#9b8d6c']]) { const [a, b] = P(tx + x, ty + y, 0.12); g.fillStyle = sh(c); g.beginPath(); g.ellipse(a, b, z * r * 1.2, z * r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
        this.box(g, P, tx + 0.72, ty + 0.15, tx + 0.9, ty + 0.3, 0, 0.22, sh('#e6a23c'), grey);
        return 0.35;
      }
      case T.RECYCLE: {
        const h = 0.55 + 0.2 * L;
        this.box(g, P, tx + 0.1, ty + 0.15, tx + 0.7, ty + 0.85, 0, h, sh('#dfe3e6'), grey);
        this.gable(g, P, tx + 0.08, ty + 0.13, tx + 0.72, ty + 0.87, h, 0.15, sh(col, -0.1), grey);
        for (const [y, c] of [[0.2, '#2f9e5a'], [0.45, '#3b7ddd'], [0.7, '#f2b233']]) this.box(g, P, tx + 0.76, ty + y, tx + 0.92, ty + y + 0.16, 0, 0.2, sh(c), grey);
        return h + 0.15;
      }
      case T.SEWAGE: {
        for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.72]]) {
          const [a, b] = P(tx + x, ty + y, 0.18), r = z * 0.2;
          g.fillStyle = sh('#b9bfc4'); g.beginPath(); g.ellipse(a, b + r * 0.25, r, r * 0.5, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = sh('#6f8f6a'); g.beginPath(); g.ellipse(a, b, r * 0.82, r * 0.4, 0, 0, Math.PI * 2); g.fill();
        }
        return 0.4;
      }
      case T.VET: {
        const h = 0.4 + 0.15 * L;
        this.box(g, P, tx + 0.18, ty + 0.2, tx + 0.82, ty + 0.8, 0, h, th.wall, grey);
        this.face(g, P, 'S', ty + 0.8, tx + 0.25, tx + 0.75, 0.04, h * 0.6, sh(glass));
        this.hip(g, P, tx + 0.14, ty + 0.16, tx + 0.86, ty + 0.84, h, 0.18, sh(col), grey);
        const [a, b] = P(tx + 0.5, ty + 0.8, h * 0.85), r = Math.max(2, z * 0.07);
        g.fillStyle = '#e04b3c'; g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); for (const [dx, dy] of [[-1.3, -1.2], [0, -1.7], [1.3, -1.2]]) g.arc(a + dx * r, b + dy * r, r * 0.5, 0, Math.PI * 2); g.fill();
        return h + 0.18;
      }
      case T.SOLAR: {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
          const x0 = tx + 0.12 + c * 0.4, y0 = ty + 0.12 + r * 0.26;
          poly(g, [P(x0, y0, 0.18), P(x0 + 0.34, y0, 0.18), P(x0 + 0.34, y0 + 0.18, 0.06), P(x0, y0 + 0.18, 0.06)], sh(night ? '#1d2a4a' : '#2d4f8a'), 'rgba(255,255,255,0.35)');
        }
        return 0.3;
      }
      case T.WIND: {
        const [a, b] = P(tx + 0.5, ty + 0.5, 0), [a2, b2] = P(tx + 0.5, ty + 0.5, 1.6);
        g.strokeStyle = sh('#eef1f3'); g.lineWidth = Math.max(2, z / 8); g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
        const spin = live && cond > 0 && !this.scene.prefs?.reducedMotion ? performance.now() / 700 : 0.4, r = z * 0.75;
        g.strokeStyle = sh('#ffffff'); g.lineWidth = Math.max(1.5, z / 12); g.beginPath();
        for (let k = 0; k < 3; k++) { const ang = spin + k * 2.094; g.moveTo(a2, b2); g.lineTo(a2 + Math.cos(ang) * r, b2 + Math.sin(ang) * r); }
        g.stroke();
        g.fillStyle = sh(col); g.beginPath(); g.arc(a2, b2, Math.max(2, z * 0.07), 0, Math.PI * 2); g.fill();
        return 1.8;
      }
      case T.MUSEUM: {
        const h = 0.55 + 0.2 * L;
        this.box(g, P, tx + 0.08, ty + 0.1, tx + 0.92, ty + 0.9, 0, 0.08, sh('#e8e2d4'));
        this.box(g, P, tx + 0.15, ty + 0.15, tx + 0.85, ty + 0.72, 0.08, h, sh('#f4efe3'), grey);
        for (let k = 0; k < 5; k++) this.box(g, P, tx + 0.18 + k * 0.15, ty + 0.74, tx + 0.23 + k * 0.15, ty + 0.79, 0.08, h, sh('#ffffff'), grey);
        this.gable(g, P, tx + 0.12, ty + 0.12, tx + 0.88, ty + 0.82, h, 0.22, sh(col, 0.3), grey);
        return h + 0.22;
      }
      case T.STADIUM: {
        const h = 0.45 + 0.15 * L;
        poly(g, [P(tx + 0.25, ty + 0.25, 0.02), P(tx + 0.75, ty + 0.25, 0.02), P(tx + 0.75, ty + 0.75, 0.02), P(tx + 0.25, ty + 0.75, 0.02)], sh('#58b04a'), 'rgba(255,255,255,0.8)');
        for (const [x0, y0, x1, y1] of [[0.05, 0.05, 0.95, 0.22], [0.05, 0.78, 0.95, 0.95], [0.05, 0.22, 0.22, 0.78], [0.78, 0.22, 0.95, 0.78]]) this.box(g, P, tx + x0, ty + y0, tx + x1, ty + y1, 0, h, sh(col, 0.2), grey);
        if (night) for (const [x, y] of [[0.08, 0.08], [0.92, 0.92]]) { const [a, b] = P(tx + x, ty + y, h + 0.4); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(a, b, z * 0.08, 0, Math.PI * 2); g.fill(); }
        return h;
      }
      case T.HOTEL: {
        const h = 1.2 + 0.4 * L, x0 = tx + 0.18, x1 = tx + 0.82, y0 = ty + 0.18, y1 = ty + 0.82;
        this.box(g, P, x0, y0, x1, y1, 0, h, sh(col, 0.5), grey);
        this.windows(g, P, x0, y0, x1, y1, Math.round(h / 0.24), 0.24, 0.1, sh(night ? '#ffe39a' : glass), 3);
        this.box(g, P, x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, h, h + 0.08, sh(col, -0.2), grey);
        flag(tx + 0.5, ty + 0.5, h + 0.08, '#e04b3c');
        return h + 0.7;
      }
      case T.ORCHARD: {
        // Three rows of fruit trees, with a dab of fruit on each.
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const x = tx + 0.2 + a * 0.3, y = ty + 0.2 + b * 0.3;
          this.tree(g, P, x, y, 0.13, sh('#3f8f45'), z);
          const [fx, fy] = P(x + 0.04, y + 0.02, 0.3);
          g.fillStyle = sh(['#e74c3c', '#f39c12', '#e67e22'][(a + b + i) % 3]); g.fillRect(fx - z * 0.02, fy - z * 0.02, z * 0.04, z * 0.04);
        }
        return 0.6;
      }
      case T.DAIRY: {
        // A white barn with a red roof, and a silo.
        this.box(g, P, tx + 0.15, ty + 0.3, tx + 0.7, ty + 0.85, 0, 0.4, sh('#f4f1ea'), grey);
        this.gable(g, P, tx + 0.13, ty + 0.28, tx + 0.72, ty + 0.87, 0.4, 0.22, sh('#b03a2e'), grey);
        this.box(g, P, tx + 0.74, ty + 0.2, tx + 0.9, ty + 0.36, 0, 0.75, sh('#c9ced3'), grey);
        return 0.8;
      }
      case T.RANCH: {
        // A fenced paddock and a small stable.
        const fence = [P(tx + 0.08, ty + 0.08, 0.12), P(tx + 0.92, ty + 0.08, 0.12), P(tx + 0.92, ty + 0.92, 0.12), P(tx + 0.08, ty + 0.92, 0.12)];
        g.strokeStyle = sh('#7a5a3a'); g.lineWidth = Math.max(1, z / 18); g.beginPath();
        fence.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
        this.box(g, P, tx + 0.6, ty + 0.12, tx + 0.88, ty + 0.4, 0, 0.3, sh('#9a6b52'), grey);
        this.gable(g, P, tx + 0.58, ty + 0.1, tx + 0.9, ty + 0.42, 0.3, 0.14, sh('#5d4037'), grey);
        for (let k = 0; k < 3; k++) this.box(g, P, tx + 0.2 + k * 0.14, ty + 0.55 + (k % 2) * 0.12, tx + 0.3 + k * 0.14, ty + 0.62 + (k % 2) * 0.12, 0, 0.08, sh(k === 1 ? '#3b2f2f' : '#f4f1ea'), grey);
        return 0.45;
      }
      case T.MATERIALS: {
        // A quarry pit, a stack of timber and a shed.
        poly(g, [P(tx + 0.1, ty + 0.12), P(tx + 0.5, ty + 0.12), P(tx + 0.5, ty + 0.52), P(tx + 0.1, ty + 0.52)], sh('#8d8579'));
        for (let k = 0; k < 3; k++) this.box(g, P, tx + 0.58, ty + 0.15 + k * 0.1, tx + 0.9, ty + 0.22 + k * 0.1, 0, 0.1 + k * 0.05, sh('#b07a45'), grey);
        this.box(g, P, tx + 0.15, ty + 0.6, tx + 0.6, ty + 0.9, 0, 0.5, sh('#7f8c8d'), grey);
        this.box(g, P, tx + 0.15, ty + 0.6, tx + 0.6, ty + 0.9, 0.5, 0.56, sh('#5f6b6d'), grey);
        return 0.9;
      }
      case T.WAREHOUSE: {
        // A long shed with a roller door.
        this.box(g, P, tx + 0.1, ty + 0.2, tx + 0.9, ty + 0.8, 0, 0.5, sh('#a3b1b8'), grey);
        this.gable(g, P, tx + 0.08, ty + 0.18, tx + 0.92, ty + 0.82, 0.5, 0.16, sh('#6f7f86'), grey);
        this.face(g, P, 'S', ty + 0.8, tx + 0.35, tx + 0.65, 0, 0.32, sh('#5b6a70'));
        return 0.7;
      }
      case T.FARM: {
        for (let k = 0; k < 4; k++) poly(g, [P(tx + 0.1, ty + 0.12 + k * 0.2), P(tx + 0.62, ty + 0.12 + k * 0.2), P(tx + 0.62, ty + 0.24 + k * 0.2), P(tx + 0.1, ty + 0.24 + k * 0.2)], sh(k % 2 ? '#6cbf4c' : '#8fd05f'));
        this.box(g, P, tx + 0.68, ty + 0.2, tx + 0.92, ty + 0.55, 0, 0.35, sh('#c0392b'), grey);
        this.gable(g, P, tx + 0.66, ty + 0.18, tx + 0.94, ty + 0.57, 0.35, 0.12, sh('#7a3b2e'), grey);
        return 0.47;
      }
      case T.POOL: {
        poly(g, [P(tx + 0.15, ty + 0.2), P(tx + 0.85, ty + 0.2), P(tx + 0.85, ty + 0.8), P(tx + 0.15, ty + 0.8)], sh('#3fa9dc'));
        poly(g, [P(tx + 0.2, ty + 0.25), P(tx + 0.8, ty + 0.25), P(tx + 0.8, ty + 0.4), P(tx + 0.2, ty + 0.4)], 'rgba(255,255,255,0.25)');
        this.box(g, P, tx + 0.86, ty + 0.45, tx + 0.94, ty + 0.53, 0, 0.35, '#ffffff');
        return 0.4;
      }
    }
    return 0.5;
  }

  // A road bridge across the gap between two linked plots. dir 'e' or 's', k = tile along the edge.
  bridge(g, P, dir, k, z, rail) {
    const [x0, y0, x1, y1] = dir === 'e' ? [PLOT, k + 0.12, PLOT + GAP, k + 0.88] : [k + 0.12, PLOT, k + 0.88, PLOT + GAP];
    const leg = (x, y) => this.box(g, P, x - 0.06, y - 0.06, x + 0.06, y + 0.06, -0.45, -0.08, '#9aa3ab');
    if (dir === 'e') { leg(PLOT + 1, k + 0.3); leg(PLOT + 1, k + 0.7); } else { leg(k + 0.3, PLOT + 1); leg(k + 0.7, PLOT + 1); }
    this.box(g, P, x0, y0, x1, y1, -0.08, 0, rail ? '#9c8f7b' : this.th.road);
    if (rail) {
      g.strokeStyle = '#5d646b'; g.lineWidth = Math.max(1, z / 16); g.beginPath();
      for (const o of [0.36, 0.64]) { const a = dir === 'e' ? P(x0, k + o) : P(k + o, y0), b = dir === 'e' ? P(x1, k + o) : P(k + o, y1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke();
    } else if (z >= 10) {
      g.strokeStyle = this.th.mark; g.lineWidth = Math.max(1, z / 16); g.setLineDash([z * 0.18, z * 0.16]);
      const a = dir === 'e' ? P(x0, k + 0.5) : P(k + 0.5, y0), b = dir === 'e' ? P(x1, k + 0.5) : P(k + 0.5, y1);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
    }
  }

  // ---------- 2D ----------
  flatPlot(g, plot, ox, oy) {
    const th = this.th, s = this.cam.z * FLAT_K, size = PLOT * s;
    const [x0, y0] = this.project(ox, oy);
    g.fillStyle = plot.status === 'ruins' ? shade(th.top, -0.1, 0.5) : th.top;
    g.fillRect(x0, y0, size, size);
    if (plot.land) for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (plot.land[c]) continue;
      g.fillStyle = th.wild;
      g.fillRect(x0 + (c % CHUNKS) * CHUNK * s, y0 + ((c / CHUNKS) | 0) * CHUNK * s, CHUNK * s, CHUNK * s);
    }
    if (plot.terr) for (let i = 0; i < plot.terr.length; i++) {
      const k = plot.terr.charCodeAt(i) - 48;
      if (!k || plot.grid[i] !== T.EMPTY && k === 1) continue;
      g.fillStyle = k === 2 ? th.water : th.hill;
      g.fillRect(x0 + (i % PLOT) * s, y0 + ((i / PLOT) | 0) * s, s + 0.5, s + 0.5);
    }
    const detailed = s >= FLAT_DETAIL;
    const traffic = plot.mine && this.scene.overlay === 'traffic' ? this.scene.traffic : null;
    if (detailed && plot.mine && this.scene.prefs.grid) {
      g.strokeStyle = th.grid; g.lineWidth = 1; g.beginPath();
      for (let k = 1; k < PLOT; k++) {
        g.moveTo(x0 + k * s, y0); g.lineTo(x0 + k * s, y0 + size);
        g.moveTo(x0, y0 + k * s); g.lineTo(x0 + size, y0 + k * s);
      }
      g.stroke();
    }
    if (plot.mine && this.scene.info) for (const [i, col] of this.scene.info) { g.fillStyle = col; g.fillRect(x0 + (i % PLOT) * s, y0 + ((i / PLOT) | 0) * s, s, s); }
    for (let i = 0; i < plot.grid.length; i++) {
      const t = plot.grid[i];
      if (t === T.EMPTY) continue;
      const x = x0 + (i % PLOT) * s, y = y0 + ((i / PLOT) | 0) * s;
      if (x > this.w || y > this.h || x + s < 0 || y + s < 0) continue;
      const uc = plot.uc?.has(i);
      if (!B[t]?.cat && t !== T.HALL && t !== T.RUBBLE) {
        let col = uc ? th.dirt : t === T.PATH ? th.pave : t === T.RAIL ? '#8f826d' : th.road;
        if (traffic && traffic.cap[i]) col = jamColour(traffic.load[i] / traffic.cap[i]);
        g.fillStyle = col; g.fillRect(x, y, s + 0.5, s + 0.5);
        continue;
      }
      if (t === T.RUBBLE) { g.fillStyle = th.ruin; g.fillRect(x + s * 0.2, y + s * 0.25, s * 0.2, s * 0.2); g.fillRect(x + s * 0.55, y + s * 0.5, s * 0.22, s * 0.2); continue; }
      const col = this.pal[B[t].col || B[t].key] || '#999999';
      const inset = Math.max(1, s * 0.08), bx = x + inset, by = y + inset, bs = s - inset * 2;
      if (uc) {
        const q = plot.queueMap?.get(i), done = q ? 1 - q.left / B[t].work : 0;
        g.fillStyle = th.dirt; g.fillRect(bx, by, bs, bs);
        g.fillStyle = shade(col, 0.3); g.fillRect(bx, by + bs * (1 - done), bs, bs * done);
        g.setLineDash([Math.max(2, s / 8), Math.max(2, s / 8)]);
        g.strokeStyle = th.scaffold; g.lineWidth = Math.max(1, s / 14); g.strokeRect(bx, by, bs, bs); g.setLineDash([]);
        continue;
      }
      const cond = t === T.HALL ? 100 : plot.cond[i];
      const grey = cond <= 0 ? 0.9 : cond < 40 ? 0.5 : 0;
      g.fillStyle = shade(col, 0, grey);
      g.fillRect(bx, by, bs, bs);
      if (detailed) {
        if (CODE[t] && bs >= 16) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.font = `800 ${Math.round(bs * 0.34)}px Overpass, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(CODE[t], bx + bs / 2, by + bs / 2 + 1); }
        else glyph(g, glyphOf(t), bx + bs / 2, by + bs / 2, bs * 0.2, 'rgba(255,255,255,0.92)');
        const lv = plot.lv ? plot.lv[i] || 1 : 1;
        for (let k = 1; k < lv; k++) { g.fillStyle = '#fff'; g.fillRect(bx + 3 + (k - 1) * 5, by + bs - 6, 3, 3); }
        if (plot.queueMap?.get(i)?.up) { g.strokeStyle = th.scaffold; g.lineWidth = 2; g.strokeRect(bx + 1, by + 1, bs - 2, bs - 2); }
      }
    }
    g.strokeStyle = plot.mine ? th.ink : 'rgba(0,0,0,0.12)';
    g.lineWidth = plot.mine ? 2 : 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    const byTile = detailed ? this.scene.agentsByPlot?.get(plot.id) : null;
    if (byTile) for (const list of byTile.values()) for (const car of list) {
      const [cx, cy] = this.project(ox + car.lx, oy + car.ly);
      const along = Math.abs(car.dx || 1) >= Math.abs(car.dy || 0);
      const k = car.mode === 'car' ? 1 : car.mode === 'bike' ? 0.55 : 0.4;
      g.fillStyle = car.follow ? '#ffc933' : car.mode === 'car' ? CAR_COLS[car.c % CAR_COLS.length] : car.shirt;
      g.fillRect(cx - s * (along ? 0.17 : 0.1) * k, cy - s * (along ? 0.1 : 0.17) * k, s * (along ? 0.34 : 0.2) * k, s * (along ? 0.2 : 0.34) * k);
      if (car.follow) { g.strokeStyle = '#17313b'; g.lineWidth = 2; g.strokeRect(cx - s * 0.2, cy - s * 0.2, s * 0.4, s * 0.4); }
    }
  }

  // ---------- overlays ----------
  // A yellow line round the land a city owns: parcel by parcel, so it needn't be a square.
  plotBorder(g, plot) {
    if (plot.wild) return;
    const ox = plot.px * STRIDE, oy = plot.py * STRIDE;
    if (plot.land && !plot.free) {
      const own = (x, y) => x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && plot.land[y * CHUNKS + x];
      g.strokeStyle = plot.mine ? 'rgba(255,201,51,0.95)' : 'rgba(255,201,51,0.65)';
      g.lineWidth = Math.max(1, Math.min(3, this.cam.z / (plot.mine ? 8 : 12)));
      g.beginPath();
      const seg = (a, b, c, d) => { const p = this.project(ox + a, oy + b), q = this.project(ox + c, oy + d); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); };
      for (let y = 0; y < CHUNKS; y++) for (let x = 0; x < CHUNKS; x++) {
        if (!own(x, y)) continue;
        const X = x * CHUNK, Y = y * CHUNK;
        if (!own(x, y - 1)) seg(X, Y, X + CHUNK, Y);
        if (!own(x, y + 1)) seg(X, Y + CHUNK, X + CHUNK, Y + CHUNK);
        if (!own(x - 1, y)) seg(X, Y, X, Y + CHUNK);
        if (!own(x + 1, y)) seg(X + CHUNK, Y, X + CHUNK, Y + CHUNK);
      }
      g.stroke();
      return;
    }
    const pts = [[0, 0], [PLOT, 0], [PLOT, PLOT], [0, PLOT]].map(([x, y]) => this.project(ox + x, oy + y));
    g.strokeStyle = plot.mine ? 'rgba(255,201,51,0.95)' : 'rgba(255,201,51,0.6)';
    g.lineWidth = Math.max(1, Math.min(3, this.cam.z / (plot.mine ? 8 : 12)));
    if (plot.free) g.setLineDash([6, 5]);
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
  }
  tileOutline(g, px, py, tx, ty, stroke, fill, dash) {
    const ox = px * STRIDE + tx, oy = py * STRIDE + ty;
    const pts = [this.project(ox, oy), this.project(ox + 1, oy), this.project(ox + 1, oy + 1), this.project(ox, oy + 1)];
    g.lineWidth = 2;
    if (dash) g.setLineDash([5, 4]);
    poly(g, pts, fill, stroke);
    g.setLineDash([]);
  }

  overlays(g, scene) {
    const { hover, cursor, selected } = scene;
    if (selected) {
      this.tileOutline(g, selected.px, selected.py, selected.tx, selected.ty, '#ffc933', 'rgba(255,201,51,0.18)');
      // Outline the building itself, not just its tile.
      const plot = [...scene.plots.values()].find((p) => p.px === selected.px && p.py === selected.py), t = plot?.grid?.[selected.i];
      if (this.view === '3d' && t && (B[t]?.cat || t === T.HALL)) {
        const H = modelHeight(t, plot.lv?.[selected.i] || 1), ox = selected.px * STRIDE + selected.tx, oy = selected.py * STRIDE + selected.ty;
        const c = [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]];
        const lo = c.map(([a, b]) => this.project(ox + a, oy + b, 0)), hi = c.map(([a, b]) => this.project(ox + a, oy + b, H));
        g.strokeStyle = '#ffc933'; g.lineWidth = Math.max(2, this.cam.z / 10); g.shadowColor = 'rgba(255,201,51,0.8)'; g.shadowBlur = 8;
        g.beginPath();
        hi.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        for (const k of [0, 1, 2, 3]) { g.moveTo(lo[k][0], lo[k][1]); g.lineTo(hi[k][0], hi[k][1]); }
        g.stroke(); g.shadowBlur = 0;
      }
    }
    if (hover && this.cam.z >= 5) {
      const bad = 'rgba(224,75,60,0.35)', good = 'rgba(47,158,90,0.28)';
      if (hover.ghost !== undefined && hover.ok && this.view === '3d' && this.cam.z >= ISO_DETAIL) {
        const ox = hover.px * STRIDE, oy = hover.py * STRIDE;
        const P = (tx, ty, h = 0) => this.project(ox + tx, oy + ty, h);
        this.tileOutline(g, hover.px, hover.py, hover.tx, hover.ty, null, good);
        g.globalAlpha = 0.6;
        if (hover.ghost === T.ROAD) this.tileOutline(g, hover.px, hover.py, hover.tx, hover.ty, null, this.th.road);
        else this.object(g, P, { grid: [], cond: { [hover.i]: 100 }, lv: null, uc: null, queueMap: null }, hover.ghost, hover.i, hover.tx, hover.ty, this.cam.z, false);
        g.globalAlpha = 1;
      } else if (hover.ghost !== undefined && hover.ok) {
        this.tileOutline(g, hover.px, hover.py, hover.tx, hover.ty, this.th.ink, good);
      } else {
        this.tileOutline(g, hover.px, hover.py, hover.tx, hover.ty, hover.ok ? this.th.ink : '#e04b3c', hover.ok ? (hover.tool === 'bulldoze' ? bad : null) : bad);
      }
    }
    if (cursor) this.tileOutline(g, cursor.px, cursor.py, cursor.tx, cursor.ty, '#ffc933', null, true);
    // Harvest bubbles over producing buildings that are ready to collect.
    if (this.cam.z >= 6) for (const r of scene.ready || []) {
      const [x, y] = this.project(r.px * STRIDE + r.x + 0.5, r.py * STRIDE + r.y + 0.5, 1.6);
      const rad = Math.max(5, this.cam.z * 0.2), bob = Math.sin(performance.now() / 400 + r.x) * rad * 0.15;
      g.beginPath(); g.arc(x, y + bob, rad, 0, Math.PI * 2);
      g.fillStyle = r.full ? '#ffc933' : 'rgba(255,255,255,0.92)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#2f9e5a'; g.stroke();
      g.fillStyle = '#2f9e5a'; g.beginPath(); g.moveTo(x - rad * 0.4, y + bob); g.lineTo(x - rad * 0.1, y + bob + rad * 0.35); g.lineTo(x + rad * 0.45, y + bob - rad * 0.35);
      g.lineWidth = Math.max(1.5, rad * 0.22); g.strokeStyle = '#2f9e5a'; g.stroke();
    }
  }

  label(g, plot) {
    const ox = plot.px * STRIDE, oy = plot.py * STRIDE;
    const [x, y] = this.view === 'flat' ? this.project(ox + PLOT / 2, oy) : this.project(ox, oy, 0.6);
    const text = plot.status === 'ruins' ? `Ruins of ${plot.name}` : `${plot.tag ? `[${plot.tag}] ` : ''}${plot.name}`;
    g.font = '700 12px Overpass, system-ui, sans-serif';
    const w = g.measureText(text).width + 16;
    const ly = y - 16;
    g.fillStyle = plot.mine ? '#ffc933' : this.th.labelBg;
    roundRect(g, x - w / 2, ly - 11, w, 22, 11);
    g.fill();
    g.fillStyle = plot.mine ? '#17313b' : this.th.ink;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x, ly + 1);
  }

  night(g, scene) {
    const a = scene.nightAmt || 0;
    if (a <= 0) return;
    g.fillStyle = `rgba(14,22,58,${a * 0.3})`;
    g.fillRect(0, 0, this.w, this.h);
  }

  lights(g, scene) {
    if (!this._lights.length) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [plot, x, y] of this._lights) {
      const [sx, sy] = this.project(plot.px * STRIDE + x, plot.py * STRIDE + y, 0.3);
      const r = this.cam.z * 0.5;
      const grd = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grd.addColorStop(0, 'rgba(255,214,140,0.45)'); grd.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  weatherFx(g, scene) {
    const w = scene.weather;
    if (w !== 'rain' && w !== 'snow') return;
    const t = scene.prefs.reducedMotion ? 0 : performance.now() / 1000;
    g.save();
    if (w === 'rain') { g.strokeStyle = 'rgba(160,190,220,0.45)'; g.lineWidth = 1; g.beginPath(); }
    else g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 140; k++) {
      const x = (hash(k, 1) * this.w + t * (w === 'rain' ? -60 : 12 + hash(k, 3) * 10)) % this.w;
      const y = (hash(k, 2) * this.h + t * (w === 'rain' ? 520 : 40 + hash(k, 4) * 30)) % this.h;
      const X = x < 0 ? x + this.w : x;
      if (w === 'rain') { g.moveTo(X, y); g.lineTo(X - 3, y + 12); }
      else { g.beginPath(); g.arc(X, y, 1.5 + hash(k, 5) * 1.5, 0, Math.PI * 2); g.fill(); }
    }
    if (w === 'rain') g.stroke();
    g.restore();
  }

  // Clicks in 3D: test buildings front to back so the top of a tall building selects that building.
  pick(sx, sy) {
    const ground = this.hit(sx, sy);
    if (this.view !== '3d' || !this.scene?.plots) return ground;
    const w = this.toWorld(sx, sy);
    const bx = Math.floor(w.x), by = Math.floor(w.y);
    for (let d = 4; d >= 0; d--) for (let k = 0; k <= d; k++) {
      const wx = bx + k, wy = by + (d - k);
      const h = this.tileAt(wx, wy);
      if (!h) continue;
      const plot = [...this.scene.plots.values()].find((p) => p.px === h.px && p.py === h.py);
      const t = plot?.grid[h.i];
      if (!t || !B[t]?.cat && t !== T.HALL) continue;
      const H = modelHeight(t, plot.lv?.[h.i] || 1);
      const ox = h.px * STRIDE + h.tx, oy = h.py * STRIDE + h.ty;
      const left = this.project(ox, oy + 1)[0], right = this.project(ox + 1, oy)[0];
      const topY = this.project(ox, oy, H)[1], bottom = this.project(ox + 1, oy + 1)[1];
      if (sx >= left && sx <= right && sy >= topY && sy <= bottom) return h;
    }
    return ground;
  }

  pops(g, scene) {
    const now = performance.now();
    for (const p of scene.pops) {
      const t = (now - p.t0) / p.dur;
      if (t < 0 || t > 1) continue;
      const [x, y] = this.project(p.wx, p.wy, p.h);
      const rise = scene.prefs.reducedMotion ? 0 : t * 36;
      g.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
      g.font = '800 15px Overpass, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4; g.strokeStyle = 'rgba(23,49,59,0.85)';
      g.strokeText(p.text, x, y - rise);
      g.fillStyle = p.col;
      g.fillText(p.text, x, y - rise);
    }
    g.globalAlpha = 1;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function jamColour(r) {
  const t = Math.min(1.5, r) / 1.5;
  const a = [67, 170, 110], m = [240, 176, 46], b = [224, 75, 60];
  const mix = (p, q, k) => p.map((v, j) => Math.round(v + (q[j] - v) * k));
  const c = t < 0.5 ? mix(a, m, t * 2) : mix(m, b, (t - 0.5) * 2);
  return `rgb(${c})`;
}

// Draws a single building model into a small canvas, for the build catalogue.
export function thumbnail(canvas, type, pal, theme) {
  const r = new Renderer(canvas);
  r.cam = { x: 0.5, y: 0.5, z: (canvas.clientWidth || 48) / 2.7 };
  r.th = THEMES[theme] || THEMES.light;
  r.pal = pal;
  r.scene = { shapes: false, prefs: {}, nightAmt: 0 };
  const g = r.ctx;
  g.clearRect(0, 0, r.w, r.h);
  const P = (tx, ty, h = 0) => { const [x, y] = r.project(tx, ty, h); return [x, y + r.h * 0.2]; };
  poly(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], type === T.ROAD ? r.th.road : type === T.PATH ? r.th.pave : type === T.PARK ? shade(pal.park, 0.55) : GROUND[type] || r.th.top);
  if (type === T.PATH) return;
  if (type === T.RAIL) { r.rail(g, P, [], 0, 0, 0, r.cam.z, false); return; }
  if (type === T.ROAD) {
    g.strokeStyle = r.th.mark; g.setLineDash([3, 3]); g.lineWidth = 1.5;
    const a = P(0, 0.5), b = P(1, 0.5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
  } else {
    r.object(g, P, { grid: [], cond: { 0: 100 }, lv: null, uc: null, queueMap: null }, type, 0, 0, 0, r.cam.z, false);
  }
}
