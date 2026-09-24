import { PLOT, GAP, T, B } from './constants.js';

export const STRIDE = PLOT + GAP;
const DETAIL_ZOOM = 9;   // below this, plots draw from cached 1px-per-tile thumbnails
const COLORS = {
  ground: '#cfd8c9', paper: '#eef1e8', ink: '#1f2a36', line: '#b8c2b0',
  abandoned: '#aaa69c', jamLow: [111, 163, 108], jamMid: [227, 163, 75], jamHigh: [168, 50, 62],
};

const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: PLOT / 2, y: PLOT / 2, z: 26 };
    this.thumbs = new Map();
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y };
  }
  toScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.z + this.w / 2, y: (wy - this.cam.y) * this.cam.z + this.h / 2 };
  }
  centerOn(px, py) { this.cam.x = px * STRIDE + PLOT / 2; this.cam.y = py * STRIDE + PLOT / 2; }
  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.cam.z = Math.min(64, Math.max(1.5, this.cam.z * factor));
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
  }

  // Which plot and tile sits under a screen point (null if in the gap between plots).
  hit(sx, sy) {
    const { x, y } = this.toWorld(sx, sy);
    const px = Math.floor(x / STRIDE), py = Math.floor(y / STRIDE);
    const tx = Math.floor(x - px * STRIDE), ty = Math.floor(y - py * STRIDE);
    if (tx >= PLOT || ty >= PLOT) return null;
    return { px, py, tx, ty, i: ty * PLOT + tx };
  }

  thumb(plot) {
    const key = plot.id;
    const cached = this.thumbs.get(key);
    if (cached && cached.version === plot.version) return cached.canvas;
    const c = cached?.canvas || document.createElement('canvas');
    c.width = c.height = PLOT;
    const g = c.getContext('2d');
    g.fillStyle = COLORS.paper;
    g.fillRect(0, 0, PLOT, PLOT);
    for (let i = 0; i < plot.grid.length; i++) {
      const t = plot.grid[i];
      if (t === T.EMPTY) continue;
      g.fillStyle = this.tileColor(plot, i, t);
      g.fillRect(i % PLOT, Math.floor(i / PLOT), 1, 1);
    }
    this.thumbs.set(key, { version: plot.version, canvas: c });
    return c;
  }

  tileColor(plot, i, t) {
    if (t === T.ROAD || t === T.HALL || t === T.RUBBLE) return B[t].color;
    if (plot.uc?.has(i)) return COLORS.line;
    if (plot.cond[i] <= 0) return COLORS.abandoned;
    return B[t].color;
  }

  draw(scene) {
    const { ctx, cam } = this;
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.w, this.h);
    const size = PLOT * cam.z;

    for (const plot of scene.plots.values()) {
      const o = this.toScreen(plot.px * STRIDE, plot.py * STRIDE);
      if (o.x > this.w || o.y > this.h || o.x + size < 0 || o.y + size < 0) continue;
      const detailed = cam.z >= DETAIL_ZOOM;
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(o.x, o.y, size, size);
      if (detailed) this.drawDetailed(plot, o, scene);
      else {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.thumb(plot), o.x, o.y, size, size);
      }
      if (plot.status === 'ruins') {
        ctx.fillStyle = 'rgba(31,42,54,0.18)';
        ctx.fillRect(o.x, o.y, size, size);
      }
      ctx.strokeStyle = plot.mine ? COLORS.ink : COLORS.line;
      ctx.lineWidth = plot.mine ? 2 : 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, size - 1, size - 1);
      if (cam.z < 14) this.drawLabel(plot, o, size);
    }

    if (scene.hover && cam.z >= DETAIL_ZOOM) {
      const h = scene.hover;
      const p = this.toScreen(h.px * STRIDE + h.tx, h.py * STRIDE + h.ty);
      ctx.lineWidth = 2;
      ctx.strokeStyle = h.ok ? COLORS.ink : '#a8323e';
      ctx.strokeRect(p.x + 1, p.y + 1, cam.z - 2, cam.z - 2);
    }
  }

  drawLabel(plot, o, size) {
    const { ctx } = this;
    const fs = Math.max(10, Math.min(15, size / 9));
    ctx.font = `600 ${fs}px Archivo, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
    const label = plot.status === 'ruins' ? `Ruins of ${plot.name}` : plot.name;
    ctx.fillText(label, o.x + size / 2, o.y - 4, size + 40);
  }

  drawDetailed(plot, o, scene) {
    const { ctx, cam } = this;
    const z = cam.z;
    const traffic = plot.mine && scene.overlay === 'traffic' ? scene.traffic : null;

    if (plot.mine && z >= 14) {
      ctx.strokeStyle = 'rgba(31,42,54,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < PLOT; k++) {
        ctx.moveTo(o.x + k * z + 0.5, o.y); ctx.lineTo(o.x + k * z + 0.5, o.y + PLOT * z);
        ctx.moveTo(o.x, o.y + k * z + 0.5); ctx.lineTo(o.x + PLOT * z, o.y + k * z + 0.5);
      }
      ctx.stroke();
    }

    for (let i = 0; i < plot.grid.length; i++) {
      const t = plot.grid[i];
      if (t === T.EMPTY) continue;
      const x = o.x + (i % PLOT) * z, y = o.y + Math.floor(i / PLOT) * z;
      if (x > this.w || y > this.h || x + z < 0 || y + z < 0) continue;

      if (t === T.ROAD) {
        let color = B[T.ROAD].color;
        if (plot.uc?.has(i)) color = COLORS.line;
        else if (traffic && traffic.cap[i]) {
          const r = Math.min(1.5, traffic.load[i] / traffic.cap[i]) / 1.5;
          const c = r < 0.5 ? mix(COLORS.jamLow, COLORS.jamMid, r * 2) : mix(COLORS.jamMid, COLORS.jamHigh, (r - 0.5) * 2);
          color = `rgb(${c})`;
        }
        ctx.fillStyle = color;
        ctx.fillRect(x, y, z + 0.5, z + 0.5);
        continue;
      }
      if (t === T.RUBBLE) {
        ctx.fillStyle = B[T.RUBBLE].color;
        const d = z * 0.18;
        for (const [a, b] of [[0.2, 0.25], [0.55, 0.2], [0.35, 0.6], [0.65, 0.62]]) ctx.fillRect(x + a * z, y + b * z, d, d);
        continue;
      }

      const inset = Math.max(1, z * 0.08);
      const bx = x + inset, by = y + inset, bs = z - inset * 2;
      const q = plot.queueMap?.get(i);
      if (q) {
        const done = 1 - q.left / B[t].work;
        ctx.fillStyle = B[t].color + '55';
        ctx.fillRect(bx, by + bs * (1 - done), bs, bs * done);
        ctx.setLineDash([Math.max(2, z / 8), Math.max(2, z / 8)]);
        ctx.strokeStyle = B[t].color;
        ctx.lineWidth = Math.max(1, z / 14);
        ctx.strokeRect(bx, by, bs, bs);
        ctx.setLineDash([]);
        continue;
      }
      if (plot.uc?.has(i)) { ctx.fillStyle = COLORS.line; ctx.fillRect(bx, by, bs, bs); continue; }

      const cond = t === T.HALL ? 100 : plot.cond[i];
      if (cond <= 0) {
        ctx.fillStyle = COLORS.abandoned;
        ctx.fillRect(bx, by, bs, bs);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + bs * 0.25, by + bs * 0.25); ctx.lineTo(bx + bs * 0.75, by + bs * 0.75);
        ctx.moveTo(bx + bs * 0.75, by + bs * 0.25); ctx.lineTo(bx + bs * 0.25, by + bs * 0.75);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = cond >= 40 ? 1 : 0.55;
      ctx.fillStyle = B[t].color;
      ctx.fillRect(bx, by, bs, bs);
      if (z >= 16) this.glyph(t, bx, by, bs);
      ctx.globalAlpha = 1;
    }
  }

  // Small pictograms so building types read without relying on colour alone.
  glyph(t, x, y, s) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, s / 12);
    ctx.beginPath();
    switch (t) {
      case T.HOUSE:
        ctx.moveTo(x + s * 0.2, y + s * 0.55); ctx.lineTo(x + s * 0.5, y + s * 0.25); ctx.lineTo(x + s * 0.8, y + s * 0.55);
        ctx.stroke(); ctx.fillRect(x + s * 0.32, y + s * 0.55, s * 0.36, s * 0.25); return;
      case T.WORK:
        for (const k of [0.25, 0.45, 0.65]) ctx.fillRect(x + s * k, y + s * 0.3, s * 0.1, s * 0.45);
        return;
      case T.SHOP:
        ctx.fillRect(x + s * 0.2, y + s * 0.28, s * 0.6, s * 0.12);
        ctx.fillRect(x + s * 0.3, y + s * 0.5, s * 0.4, s * 0.25); return;
      case T.SCHOOL:
        ctx.fillStyle = 'rgba(31,42,54,0.7)';
        ctx.fillRect(x + s * 0.3, y + s * 0.2, s * 0.06, s * 0.6);
        ctx.fillRect(x + s * 0.36, y + s * 0.2, s * 0.32, s * 0.2); return;
      case T.PARK:
        ctx.arc(x + s * 0.5, y + s * 0.42, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x + s * 0.47, y + s * 0.55, s * 0.06, s * 0.22); return;
      case T.HALL:
        ctx.moveTo(x + s * 0.2, y + s * 0.38); ctx.lineTo(x + s * 0.5, y + s * 0.18); ctx.lineTo(x + s * 0.8, y + s * 0.38);
        ctx.closePath(); ctx.fill();
        for (const k of [0.27, 0.45, 0.63]) ctx.fillRect(x + s * k, y + s * 0.44, s * 0.1, s * 0.32);
        return;
    }
  }
}
