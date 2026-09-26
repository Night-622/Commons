// The free-camera 3D view, drawn with three.js. Loaded only when a player switches to it: the isometric and 2D
// views stay the default. It reads the same scene the canvas renderer gets, and reports clicks back as tiles.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three-0.186.1/OrbitControls.js';
import { T, B, PLOT, HARVEST } from './constants.js';
import { STRIDE, modelHeight } from './render.js';
import { h32 } from './sim.js';

const GROUND = { land: '#9fcf7a', own: '#b4dc8e', hill: '#8fbf6c', water: '#4a9fd6', road: '#5b6770', path: '#d8c7a1', rail: '#8d7b68', rubble: '#9a948a' };
const OPEN = new Set([T.PARK, T.PLAYGROUND, T.SPORTS, T.CEMETERY, T.FARM, T.SOLAR, T.ORCHARD, T.RANCH, T.POOL, T.LANDFILL]);
const FLAT = new Set([T.ROAD, T.PATH, T.RAIL, T.XING, T.LIGHTS, T.ROUNDABOUT]);
const HOMES = new Set([T.HOUSE, T.VILLA, T.APARTMENT]);
const SHIRTS = ['#e0588e', '#3b7ddd', '#f0963a', '#2f9e5a', '#8a5bd6', '#e04b3c', '#16a2b8', '#f2c744'];

export class View3D {
  constructor(host, { onPick }) {
    this.host = host;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'map3d';
    this.canvas.setAttribute('aria-label', 'City in 3D. Drag to turn, right-drag or two fingers to move, scroll or pinch to zoom.');
    host.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, maxPolarAngle: Math.PI * 0.46, minDistance: 4, maxDistance: 220, screenSpacePanning: false });
    this.hemi = new THREE.HemisphereLight('#dff1ff', '#6b8f4e', 1.1);
    this.sun = new THREE.DirectionalLight('#fff4dc', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog('#cfe8f5', 120, 420);

    this.plots = new Map();      // plot id -> { group, version, pick: [] }
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.box.translate(0, 0.5, 0);    // boxes stand on the ground
    this.roof = new THREE.ConeGeometry(0.62, 0.5, 4, 1);
    this.roof.rotateY(Math.PI / 4);
    this.trunk = new THREE.CylinderGeometry(0.03, 0.04, 0.25, 5);
    this.crown = new THREE.ConeGeometry(0.18, 0.45, 7);
    this.mats = new Map();
    this.glass = new THREE.MeshLambertMaterial({ color: '#9fc6dd', emissive: '#ffd57a', emissiveIntensity: 0 });
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ffc933' }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 4, 1), new THREE.MeshBasicMaterial({ color: '#ffc933', side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.rotation.z = Math.PI / 4;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.agents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), new THREE.MeshLambertMaterial(), 1500);
    this.agents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.agents.count = 0;
    this.scene.add(this.agents);
    this.bubbles = new THREE.Group();
    this.scene.add(this.bubbles);

    this.raycaster = new THREE.Raycaster();
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }   // a drag turns the camera; a tap picks
      down = null;
      const h = this.pick(e.clientX, e.clientY);
      this.onPick?.(h);
    });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.focused = false;
  }

  mat(col) {
    if (!this.mats.has(col)) this.mats.set(col, new THREE.MeshLambertMaterial({ color: col }));
    return this.mats.get(col);
  }
  resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
  // Look at a plot from the south-east, at a comfortable height.
  focus(px, py, tx = PLOT / 2, ty = PLOT / 2, dist = 19) {
    const x = px * STRIDE + tx, z = py * STRIDE + ty;
    this.controls.target.set(x, 0, z);
    this.camera.position.set(x + dist * 0.7, dist * 0.8, z + dist * 0.7);
    this.controls.update();
    this.focused = true;
  }

  // Everything but the moving parts is rebuilt only when a plot changes.
  sync(scene) {
    const pal = scene.palette || {}, seen = new Set();
    for (const p of scene.plots.values()) {
      seen.add(p.id);
      const cur = this.plots.get(p.id), version = `${p.version}|${p.grid ? p.grid.length : 0}|${scene.paletteKey}|${p.uc?.size || 0}`;
      if (cur && cur.version === version) continue;
      if (cur) this.drop(p.id);
      this.plots.set(p.id, this.buildPlot(p, pal, version));
      this.selKey = null;   // rebuilt meshes need the highlight again
    }
    for (const id of [...this.plots.keys()]) if (!seen.has(id)) this.drop(id);
    this.light(scene.nightAmt || 0, scene.theme);
    this.select(scene.selected, scene.plots);
    this.moving(scene);
    this.markReady(scene.ready || []);
  }
  drop(id) {
    const e = this.plots.get(id);
    if (!e) return;
    this.spinners = (this.spinners || []).filter((h) => h.parent !== e.group);
    this.scene.remove(e.group);
    e.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.plots.delete(id);
  }

  buildPlot(p, pal, version) {
    const group = new THREE.Group(), ox = p.px * STRIDE, oz = p.py * STRIDE, pick = [];
    group.userData = { px: p.px, py: p.py };
    // Ground: one instanced box per tile, coloured by terrain and what's on it.
    const tiles = new THREE.InstancedMesh(this.box, new THREE.MeshLambertMaterial(), PLOT * PLOT);
    tiles.receiveShadow = true;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < PLOT * PLOT; i++) {
      const tx = i % PLOT, ty = (i / PLOT) | 0, t = p.grid?.[i] ?? 0, ter = p.terr ? p.terr.charCodeAt(i) - 48 : 0;
      let col = GROUND.land, h = 0.2, y = -0.2;
      if (ter === 2 && !FLAT.has(t)) { col = GROUND.water; y = -0.32; }
      else if (ter === 1) { col = GROUND.hill; h = 0.45; }
      if (p.mine && p.land && p.land[((ty / 4) | 0) * (PLOT / 4) + ((tx / 4) | 0)] && ter !== 2 && col === GROUND.land) col = GROUND.own;
      if (t === T.ROAD || t === T.XING || t === T.LIGHTS || t === T.ROUNDABOUT) col = GROUND.road;
      else if (t === T.PATH) col = GROUND.path;
      else if (t === T.RAIL) col = GROUND.rail;
      else if (t === T.RUBBLE) col = GROUND.rubble;
      else if (OPEN.has(t)) col = pal[B[t]?.col] ? shadeHex(pal[B[t].col], 0.35) : '#7fbf5a';
      m.makeScale(1, h, 1).setPosition(ox + tx + 0.5, y, oz + ty + 0.5);
      tiles.setMatrixAt(i, m);
      tiles.setColorAt(i, c.set(col));
    }
    tiles.userData = { ground: true, px: p.px, py: p.py };
    group.add(tiles);
    pick.push(tiles);
    // Buildings, trees and rubble.
    for (let i = 0; i < PLOT * PLOT; i++) {
      const t = p.grid?.[i] ?? 0, tx = i % PLOT, ty = (i / PLOT) | 0, x = ox + tx + 0.5, z = oz + ty + 0.5;
      const ter = p.terr ? p.terr.charCodeAt(i) - 48 : 0, base = ter === 1 ? 0.25 : 0;
      if (t === T.EMPTY) {
        if (ter !== 2 && h32(i + p.px * 977, p.py * 131 + 7) < (p.mine ? 0.08 : 0.2)) this.tree(group, x + (h32(i, 3) - 0.5) * 0.4, base, z + (h32(i, 5) - 0.5) * 0.4, h32(i, 9));
        continue;
      }
      if (FLAT.has(t) || t === T.RUBBLE) continue;
      const d = B[t];
      if (!d) continue;
      const lv = p.lv?.[i] || 1, uc = p.uc?.has(i), col = pal[d.col] || pal[d.key] || '#9aa4a8';
      if (uc) {   // scaffolding while it's being built
        const s = new THREE.Mesh(this.box, new THREE.MeshLambertMaterial({ color: '#d9b36c', wireframe: true }));
        s.scale.set(0.7, Math.max(0.3, modelHeight(t, 1) * 0.6), 0.7); s.position.set(x, base, z);
        s.userData = { px: p.px, py: p.py, tx, ty, i };
        group.add(s); pick.push(s);
        continue;
      }
      if (OPEN.has(t)) {
        if (t === T.PARK || t === T.ORCHARD || t === T.CEMETERY) for (let k = 0; k < (t === T.ORCHARD ? 4 : 2); k++) this.tree(group, x + (k % 2 - 0.5) * 0.45, base, z + ((k >> 1) - 0.5) * 0.45 + 0.1, h32(i, k));
        const low = new THREE.Mesh(this.box, this.mat(shadeHex(col, -0.1)));
        low.scale.set(0.3, 0.12, 0.3); low.position.set(x + 0.25, base, z - 0.25);
        low.userData = { px: p.px, py: p.py, tx, ty, i };
        group.add(low); pick.push(low);
        continue;
      }
      if (this.special(group, pick, t, x, base, z, lv, col, { px: p.px, py: p.py, tx, ty, i })) continue;
      const H = Math.max(0.25, modelHeight(t, lv)), w = HOMES.has(t) ? 0.62 : t === T.HALL ? 0.8 : 0.74;
      const body = new THREE.Mesh(this.box, this.mat(HOMES.has(t) ? '#f3efe6' : col));
      body.scale.set(w, H, w); body.position.set(x, base, z);
      body.castShadow = true; body.receiveShadow = true;
      body.userData = { px: p.px, py: p.py, tx, ty, i };
      group.add(body); pick.push(body);
      // Windows: rows of glass on the two sides you see, lit at night.
      if (!HOMES.has(t) && H > 0.5) for (let f = 0.18; f < H - 0.12; f += 0.26) {
        const win = new THREE.Mesh(this.box, this.glass);
        win.scale.set(w + 0.01, 0.09, w + 0.01); win.position.set(x, base + f, z);
        group.add(win);
      }
      if (t === T.SHOP || t === T.CAFE) {   // a striped awning over the door
        const aw = new THREE.Mesh(this.box, this.mat('#e04b3c'));
        aw.scale.set(w, 0.05, 0.22); aw.position.set(x, base + 0.34, z + w / 2 + 0.08); aw.rotation.x = 0.35;
        group.add(aw);
      }
      if (t === T.SCHOOL || t === T.HIGH || t === T.UNI || t === T.HALL) this.flag(group, x + w / 2 - 0.05, base + H + (t === T.HALL ? 0.5 : 0), z - w / 2 + 0.05);
      if (HOMES.has(t) || t === T.HALL || t === T.DAIRY || t === T.RANCH) {
        const r = new THREE.Mesh(this.roof, this.mat(HOMES.has(t) ? shadeHex(col, -0.05) : t === T.HALL ? '#6b56c9' : '#b03a2e'));
        r.scale.set(w * 1.15, 1, w * 1.15); r.position.set(x, base + H + 0.25, z); r.castShadow = true;
        r.userData = body.userData;
        group.add(r); pick.push(r);
      } else {
        const cap = new THREE.Mesh(this.box, this.mat(shadeHex(col, -0.25)));
        cap.scale.set(w + 0.06, 0.06, w + 0.06); cap.position.set(x, base + H, z);
        group.add(cap);
      }
    }
    // A thin yellow border round the plot.
    const y = 0.02, pts = [[0, 0], [PLOT, 0], [PLOT, PLOT], [0, PLOT], [0, 0]].map(([a, b]) => new THREE.Vector3(ox + a, y, oz + b));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffc933', transparent: true, opacity: p.mine ? 1 : 0.6 })));
    this.scene.add(group);
    return { group, version, pick };
  }
  // Buildings with a shape of their own. Returns true if it drew one.
  special(group, pick, t, x, y, z, lv, col, ud) {
    const add = (geo, mat, sx, sy, sz, px, py, pz, pickable = true) => {
      const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = true; m.userData = ud;
      group.add(m); if (pickable) pick.push(m); return m;
    };
    const cyl = this.cyl ||= (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.translate(0, 0.5, 0); return g; })();
    if (t === T.WATER) {   // a tank on four legs
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(this.box, this.mat('#8d99a0'), 0.05, 0.9, 0.05, x + a * 0.2, y, z + b * 0.2, false);
      add(cyl, this.mat('#9fc6dd'), 0.6, 0.45, 0.6, x, y + 0.9, z);
      return true;
    }
    if (t === T.WIND) {   // a tall pole and three blades
      add(cyl, this.mat('#f1f4f5'), 0.08, 1.9, 0.08, x, y, z);
      const hub = new THREE.Group(); hub.position.set(x, y + 1.9, z + 0.06); hub.userData.spin = true;
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(this.box, this.mat('#ffffff')); b.scale.set(0.06, 0.7, 0.02); b.position.set(0, 0.35, 0); const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI * 2) / 3; arm.add(b); hub.add(arm); }
      group.add(hub); (this.spinners ||= []).push(hub);
      return true;
    }
    if (t === T.FACTORY || t === T.POWER) {   // a shed with chimneys
      const H = modelHeight(t, lv) * 0.7;
      add(this.box, this.mat(col), 0.8, H, 0.74, x, y, z);
      for (const k of t === T.POWER ? [-0.2, 0.2] : [0.25]) add(cyl, this.mat('#b0413e'), 0.14, H + 0.9, 0.14, x + k, y, z - 0.22, false);
      return true;
    }
    if (t === T.APARTMENT || t === T.WORK) {   // a glass tower
      const H = modelHeight(t, lv);
      add(this.box, this.mat(t === T.APARTMENT ? '#e8e2d6' : '#7fa7c9'), 0.7, H, 0.7, x, y, z);
      for (let f = 0.2; f < H - 0.1; f += 0.24) { const w = new THREE.Mesh(this.box, this.glass); w.scale.set(0.71, 0.1, 0.71); w.position.set(x, y + f, z); group.add(w); }
      add(this.box, this.mat('#5b6770'), 0.74, 0.06, 0.74, x, y + H, z, false);
      return true;
    }
    return false;
  }
  flag(group, x, y, z) {
    const pole = new THREE.Mesh(this.box, this.mat('#6b6f73')); pole.scale.set(0.03, 0.55, 0.03); pole.position.set(x, y, z);
    const cloth = new THREE.Mesh(this.box, this.mat('#e04b3c')); cloth.scale.set(0.2, 0.12, 0.02); cloth.position.set(x + 0.1, y + 0.42, z);
    group.add(pole, cloth);
  }
  tree(group, x, y, z, r) {
    const trunk = new THREE.Mesh(this.trunk, this.mat('#7a5a3a'));
    trunk.position.set(x, y + 0.12, z);
    const crown = new THREE.Mesh(this.crown, this.mat(r < 0.5 ? '#3f8f45' : '#4fa152'));
    crown.position.set(x, y + 0.45, z); crown.castShadow = true;
    group.add(trunk, crown);
  }

  // Day and night follow the city clock.
  light(night, theme) {
    const day = 1 - night;
    this.glass.emissiveIntensity = night * 0.9;   // lit windows after dark
    this.sun.intensity = 0.25 + 2 * day;
    this.hemi.intensity = 0.35 + 0.8 * day;
    const sky = new THREE.Color(theme === 'dark' ? '#16262d' : '#cfe8f5').lerp(new THREE.Color('#0c1a2b'), night);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    const t = this.controls.target;
    this.sun.position.set(t.x + 30, 45, t.z + 18);
    this.sun.target.position.copy(t);
  }
  // The selected building glows; a selected tile gets a yellow square.
  select(sel) {
    const key = sel ? `${sel.px},${sel.py},${sel.tx},${sel.ty},${this.plots.size}` : '';
    if (key === this.selKey) return;   // only when the selection (or the city) changes
    this.selKey = key;
    for (const o of this.glowing || []) o.material = o.userData.baseMat;
    this.glowing = [];
    this.highlight.visible = false; this.ring.visible = false;
    if (!sel) return;
    const e = [...this.plots.values()].find((x) => x.group.userData.px === sel.px && x.group.userData.py === sel.py);
    const hit = e?.pick.filter((o) => !o.userData.ground && o.userData.tx === sel.tx && o.userData.ty === sel.ty) || [];
    const x = sel.px * STRIDE + sel.tx + 0.5, z = sel.py * STRIDE + sel.ty + 0.5;
    if (hit.length) {
      const box = new THREE.Box3();
      for (const o of hit) {
        box.expandByObject(o);
        o.userData.baseMat = o.material;
        o.material = o.material.clone(); o.material.emissive = new THREE.Color('#ffc933'); o.material.emissiveIntensity = 0.35;
        this.glowing.push(o);
      }
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      this.highlight.scale.set(size.x + 0.08, size.y + 0.08, size.z + 0.08);
      this.highlight.position.copy(mid);
      this.highlight.visible = true;
    }
    this.ring.position.set(x, 0.03, z);
    this.ring.visible = true;
  }
  // Cars, bikes and walkers from the trip simulation, as small blocks.
  moving(scene) {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    for (const [id, byTile] of scene.agentsByPlot || []) {
      const p = scene.plots.get(id);
      if (!p) continue;
      for (const list of byTile.values()) for (const a of list) {
        if (n >= 1500) break;
        const car = a.mode === 'car' || a.vehicle;
        m.makeScale(car ? 1.4 : 0.6, car ? 1 : 1.6, car ? 1 : 0.6).setPosition(p.px * STRIDE + a.lx, 0.07, p.py * STRIDE + a.ly);
        this.agents.setMatrixAt(n, m);
        this.agents.setColorAt(n, c.set(a.vehicle === 'bus' ? '#f2c744' : a.vehicle ? '#e04b3c' : SHIRTS[(a.p || 0) % SHIRTS.length]));
        n++;
      }
    }
    this.agents.count = n;
    this.agents.instanceMatrix.needsUpdate = true;
    if (this.agents.instanceColor) this.agents.instanceColor.needsUpdate = true;
  }
  // Harvests waiting to be collected: a floating yellow marker.
  markReady(list) {
    const key = list.map((r) => `${r.x},${r.y}`).join('|');
    if (key === this.readyKey) { for (const b of this.bubbles.children) b.position.y = b.userData.y + Math.sin(performance.now() / 400 + b.userData.k) * 0.08; return; }
    this.readyKey = key;
    this.bubbles.clear();
    for (const [k, r] of list.entries()) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: r.full ? '#ffc933' : '#ffffff' }));
      s.userData = { y: 1.9, k };
      s.position.set(r.px * STRIDE + r.x + 0.5, 1.9, r.py * STRIDE + r.y + 0.5);
      this.bubbles.add(s);
    }
  }

  // Which tile (and building) is under a screen point.
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const all = [...this.plots.values()].flatMap((e) => e.pick);
    const hit = this.raycaster.intersectObjects(all, false)[0];
    let tx, ty, px, py;
    if (hit?.object.userData.ground) { const u = hit.object.userData; px = u.px; py = u.py; tx = hit.instanceId % PLOT; ty = (hit.instanceId / PLOT) | 0; }
    else if (hit) ({ px, py, tx, ty } = hit.object.userData);
    else {   // off the edge of every plot: where the ray meets the ground
      const g = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), g)) return null;
      px = Math.floor(g.x / STRIDE); py = Math.floor(g.z / STRIDE); tx = Math.floor(g.x - px * STRIDE); ty = Math.floor(g.z - py * STRIDE);
    }
    return { px, py, tx, ty, i: ty * PLOT + tx };
  }
  render() {
    this.controls.update();
    const a = performance.now() / 700;
    for (const h of this.spinners || []) h.rotation.z = a;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resizeObs.disconnect();
    for (const id of [...this.plots.keys()]) this.drop(id);
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

function shadeHex(hex, amt) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt * (amt > 0 ? 1 - hsl.l : hsl.l)))).getStyle();
}
