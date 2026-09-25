import { PLOT, GAP, T, B, MAX_LEVEL } from './constants.js';

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
    ink: '#17313b', grid: 'rgba(23,49,59,0.10)', labelBg: 'rgba(255,255,255,0.92)', scaffold: '#d99a2b', ruin: '#9a8b7b',
  },
  dark: {
    bg: '#172327', bg2: '#131e22', top: '#4e7b44', top2: '#4a753f', side: '#3b6234', side2: '#31532b', soil: '#5f4b37', soil2: '#4e3e2e',
    road: '#3b434b', mark: '#cfcbbd', wall: '#e2dccf', stone: '#cfc9bc', dirt: '#7d6a50', glass: '#8fb3c7',
    ink: '#e8f0ef', grid: 'rgba(255,255,255,0.08)', labelBg: 'rgba(20,34,40,0.92)', scaffold: '#c98a22', ruin: '#6c6255',
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
    default: return 0.1;
  }
}

// Shapes that tell building types apart without colour (Junction's glyph set).
export const GLYPH = { [T.HOUSE]: 0, [T.WORK]: 1, [T.SHOP]: 2, [T.SCHOOL]: 3, [T.PARK]: 4, [T.HALL]: 5 };
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
    const grd = g.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, this.th.bg);
    grd.addColorStop(1, this.th.bg2);
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);

    const bd = this.bounds();
    const plots = [...scene.plots.values()]
      .filter((p) => p.px * STRIDE < bd.x1 && (p.px + 1) * STRIDE > bd.x0 && p.py * STRIDE < bd.y1 && (p.py + 1) * STRIDE > bd.y0)
      .sort((a, b) => (a.px + a.py) - (b.px + b.py) || a.px - b.px);

    for (const plot of plots) {
      const ox = plot.px * STRIDE, oy = plot.py * STRIDE;
      if (this.view === 'flat') this.flatPlot(g, plot, ox, oy);
      else if (this.cam.z < ISO_DETAIL) this.cachedIso(g, plot, ox, oy);
      else this.isoPlot(g, plot, (tx, ty, h = 0) => this.project(ox + tx, oy + ty, h), this.cam.z, true);
    }
    this.overlays(g, scene);
    this.night(g, scene);
    if (this.cam.z < 13) for (const plot of plots) this.label(g, plot);
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
    poly(g, [P(0, 0), P(PLOT, 0), P(PLOT, PLOT), P(0, PLOT)], plot.status === 'ruins' ? shade(th.top, -0.1, 0.5) : th.top);

    if (z >= 12) {   // subtle lawn stripes
      g.globalAlpha = 0.5;
      for (let k = 0; k < PLOT; k += 2) poly(g, [P(k, 0), P(k + 1, 0), P(k + 1, PLOT), P(k, PLOT)], th.top2);
      g.globalAlpha = 1;
    }
    if (live && this.scene.prefs.grid && plot.mine) {
      g.strokeStyle = th.grid; g.lineWidth = 1; g.beginPath();
      for (let k = 1; k < PLOT; k++) {
        let a = P(k, 0), b = P(k, PLOT); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
        a = P(0, k); b = P(PLOT, k); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
    }

    const grid = plot.grid, traffic = live && plot.mine && this.scene.overlay === 'traffic' ? this.scene.traffic : null;
    // Pass 1: ground (roads, plazas, park lawns, building sites)
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t === T.EMPTY) continue;
      const tx = i % PLOT, ty = (i / PLOT) | 0;
      const dia = [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)];
      if (t === T.ROAD) {
        let col = plot.uc?.has(i) ? th.dirt : th.road;
        if (traffic && traffic.cap[i]) col = jamColour(traffic.load[i] / traffic.cap[i]);
        poly(g, dia, col);
        if (z >= 10 && !plot.uc?.has(i)) this.laneMarks(g, P, grid, i, tx, ty, z);
      } else if (t === T.PARK) poly(g, dia, plot.uc?.has(i) ? th.dirt : shade(this.pal.park, 0.55));
      else if (t === T.HALL) poly(g, dia, th.stone);
      else if (t === T.RUBBLE) poly(g, dia, shade(th.dirt, -0.15));
      else if (plot.uc?.has(i)) poly(g, dia, th.dirt);
      else if (plot.cond[i] <= 0) poly(g, dia, shade(th.dirt, 0, 0.6));
    }
    // Pass 2: objects, back to front along diagonals
    const cars = live && plot.mine ? this.scene.carsByTile : null;
    for (let s = 0; s <= 2 * (PLOT - 1); s++) {
      for (let tx = Math.max(0, s - PLOT + 1); tx <= Math.min(s, PLOT - 1); tx++) {
        const ty = s - tx, i = ty * PLOT + tx, t = grid[i];
        if (t !== T.EMPTY && t !== T.ROAD) this.object(g, P, plot, t, i, tx, ty, z, live);
        if (cars && cars.has(i)) for (const car of cars.get(i)) this.car(g, P, car);
      }
    }
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
      if (j < 0 || (grid[j] !== T.ROAD && grid[j] !== T.HALL)) continue;
      n++;
      const a = P(cx, cy), b = P(cx + dx * 0.5, cy + dy * 0.5);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    g.setLineDash([]);
    if (n === 0) { const c = P(cx, cy); g.fillStyle = this.th.mark; g.fillRect(c[0] - 1, c[1] - 1, 2, 2); }
  }

  box(g, P, x0, y0, x1, y1, z0, z1, col, grey = 0) {
    poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(col, -0.02, grey));
    poly(g, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade(col, -0.2, grey));
    poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(col, 0.16, grey));
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
  gable(g, P, x0, y0, x1, y1, h, r, col, grey) {
    const ym = (y0 + y1) / 2;
    poly(g, [P(x0, y0, h), P(x1, y0, h), P(x1, ym, h + r), P(x0, ym, h + r)], shade(col, -0.25, grey));
    poly(g, [P(x0, y1, h), P(x1, y1, h), P(x1, ym, h + r), P(x0, ym, h + r)], shade(col, 0.02, grey));
    poly(g, [P(x1, y0, h), P(x1, y1, h), P(x1, ym, h + r)], shade(this.th.wall, -0.16, grey));
  }
  hip(g, P, x0, y0, x1, y1, h, r, col, grey) {
    const a = P((x0 + x1) / 2, (y0 + y1) / 2, h + r);
    poly(g, [P(x0, y0, h), P(x1, y0, h), a], shade(col, -0.25, grey));
    poly(g, [P(x0, y0, h), P(x0, y1, h), a], shade(col, -0.3, grey));
    poly(g, [P(x0, y1, h), P(x1, y1, h), a], shade(col, 0.04, grey));
    poly(g, [P(x1, y0, h), P(x1, y1, h), a], shade(col, -0.16, grey));
  }
  tree(g, P, x, y, size, col, z) {
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
    const col = pal[B[t].key] || '#999999';
    const night = live && this.scene.nightAmt > 0.15 && cond > 0;
    const glass = night ? '#ffd57a' : th.glass;
    let top = 0.5;

    if (t === T.HOUSE) {
      const x0 = tx + 0.18, x1 = tx + 0.82, y0 = ty + 0.2, y1 = ty + 0.8, fh = 0.36, h = 0.42 + fh * (lv - 1);
      this.box(g, P, x0, y0, x1, y1, 0, h, th.wall, grey);
      this.windows(g, P, x0, y0, x1, y1, lv, fh, 0.02, shade(glass, 0, grey), 2);
      this.face(g, P, 'S', y1, x0 + 0.26, x0 + 0.38, 0, 0.24, shade(col, -0.45, grey));
      this.gable(g, P, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, 0.32, col, grey);
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
      poly(g, [[fx2, fy2], [fx2 + z * 0.4, fy2 + z * 0.1], [fx2, fy2 + z * 0.2]], col);
      top = 1.6;
    }

    if (q && q.up) this.scaffold(g, P, tx, ty, modelHeight(t, Math.min(MAX_LEVEL, lv + 1)), q, t, z);
    if (live && cond > 0 && cond < 40 && z >= 12) this.badgeText(g, P(tx + 0.5, ty + 0.5, top + 0.35), '!', '#e04b3c', z);
    if (live && this.scene.shapes && GLYPH[t] !== undefined && z >= 9) {
      const [bx, by] = P(tx + 0.5, ty + 0.5, top + 0.3);
      const r = Math.max(4, z * 0.22);
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(bx, by, r + 2, 0, Math.PI * 2); g.fill();
      glyph(g, GLYPH[t], bx, by, r * 0.62, '#17313b');
    }
  }

  site(g, P, t, tx, ty, q, z) {
    const done = q ? Math.max(0, 1 - q.left / B[t].work) : 0;
    const H = modelHeight(t, 1);
    this.box(g, P, tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.9, 0, 0.05, '#cfc9bd');
    if (done > 0.02) {
      g.globalAlpha = 0.85;
      this.box(g, P, tx + 0.2, ty + 0.2, tx + 0.8, ty + 0.8, 0.05, 0.05 + (H - 0.1) * done, shade(this.pal[B[t].key] || this.th.wall, 0.5));
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
    const s = 0.11, x = car.lx, y = car.ly;
    this.box(g, P, x - s, y - s, x + s, y + s, 0.02, 0.13, CAR_COLS[car.c % CAR_COLS.length]);
  }

  // ---------- 2D ----------
  flatPlot(g, plot, ox, oy) {
    const th = this.th, s = this.cam.z * FLAT_K, size = PLOT * s;
    const [x0, y0] = this.project(ox, oy);
    g.fillStyle = plot.status === 'ruins' ? shade(th.top, -0.1, 0.5) : th.top;
    g.fillRect(x0, y0, size, size);
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
    for (let i = 0; i < plot.grid.length; i++) {
      const t = plot.grid[i];
      if (t === T.EMPTY) continue;
      const x = x0 + (i % PLOT) * s, y = y0 + ((i / PLOT) | 0) * s;
      if (x > this.w || y > this.h || x + s < 0 || y + s < 0) continue;
      const uc = plot.uc?.has(i);
      if (t === T.ROAD) {
        let col = uc ? th.dirt : th.road;
        if (traffic && traffic.cap[i]) col = jamColour(traffic.load[i] / traffic.cap[i]);
        g.fillStyle = col; g.fillRect(x, y, s + 0.5, s + 0.5);
        continue;
      }
      if (t === T.RUBBLE) { g.fillStyle = th.ruin; g.fillRect(x + s * 0.2, y + s * 0.25, s * 0.2, s * 0.2); g.fillRect(x + s * 0.55, y + s * 0.5, s * 0.22, s * 0.2); continue; }
      const col = this.pal[B[t].key];
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
        glyph(g, GLYPH[t], bx + bs / 2, by + bs / 2, bs * 0.2, 'rgba(255,255,255,0.92)');
        const lv = plot.lv ? plot.lv[i] || 1 : 1;
        for (let k = 1; k < lv; k++) { g.fillStyle = '#fff'; g.fillRect(bx + 3 + (k - 1) * 5, by + bs - 6, 3, 3); }
        if (plot.queueMap?.get(i)?.up) { g.strokeStyle = th.scaffold; g.lineWidth = 2; g.strokeRect(bx + 1, by + 1, bs - 2, bs - 2); }
      }
    }
    g.strokeStyle = plot.mine ? th.ink : 'rgba(0,0,0,0.12)';
    g.lineWidth = plot.mine ? 2 : 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    if (detailed && plot.mine) for (const car of this.scene.cars || []) {
      const [cx, cy] = this.project(ox + car.lx, oy + car.ly);
      g.fillStyle = CAR_COLS[car.c % CAR_COLS.length];
      g.fillRect(cx - s * 0.12, cy - s * 0.12, s * 0.24, s * 0.24);
    }
  }

  // ---------- overlays ----------
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
    if (selected) this.tileOutline(g, selected.px, selected.py, selected.tx, selected.ty, '#ffc933', 'rgba(255,201,51,0.18)');
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
  }

  label(g, plot) {
    const ox = plot.px * STRIDE, oy = plot.py * STRIDE;
    const [x, y] = this.view === 'flat' ? this.project(ox + PLOT / 2, oy) : this.project(ox, oy, 0.6);
    const text = plot.status === 'ruins' ? `Ruins of ${plot.name}` : plot.name;
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
  poly(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], type === T.ROAD ? r.th.road : type === T.PARK ? shade(pal.park, 0.55) : r.th.top);
  if (type === T.ROAD) {
    g.strokeStyle = r.th.mark; g.setLineDash([3, 3]); g.lineWidth = 1.5;
    const a = P(0, 0.5), b = P(1, 0.5); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
  } else {
    r.object(g, P, { grid: [], cond: { 0: 100 }, lv: null, uc: null, queueMap: null }, type, 0, 0, 0, r.cam.z, false);
  }
}
