// Visual traffic. Cars drive real commute routes plus ambient trips, so any road network has life on it.
import { T } from './constants.js';
import { neighbours, computeTraffic, totalPop } from './sim.js';

const drivable = (grid, i) => grid[i] === T.ROAD || grid[i] === T.HALL;
const PLOT_W = 24;

function makeRoutes(st, traffic, uc) {
  const routes = [];
  if (traffic) for (const h of traffic.homes) {
    if (h.workPath?.length > 1) routes.push(h.workPath);
    if (h.shopPath?.length > 1) routes.push(h.shopPath);
  }
  const roads = [];
  for (let i = 0; i < st.grid.length; i++) if (drivable(st.grid, i) && !uc.has(i)) roads.push(i);
  if (roads.length >= 2) {
    for (let k = 0; k < 30; k++) {
      let at = roads[Math.floor(Math.random() * roads.length)], prev = -1;
      const path = [at], len = 3 + Math.floor(Math.random() * 12);
      for (let step = 0; step < len; step++) {
        const next = neighbours(at).filter((n) => n !== prev && drivable(st.grid, n) && !uc.has(n));
        if (!next.length) break;
        prev = at;
        at = next[Math.floor(Math.random() * next.length)];
        path.push(at);
      }
      if (path.length > 1) routes.push(path);
    }
  }
  return { routes, roads: roads.length };
}

export class CarSim {
  constructor() { this.plots = new Map(); this.followed = null; }

  // Call when a plot's layout or traffic changes. traffic is optional (computed if missing).
  set(id, st, traffic) {
    const e = this.plots.get(id) || { cars: [] };
    e.st = st;
    e.uc = new Set(st.queue.filter((q) => !q.up).map((q) => q.i));
    e.traffic = traffic || computeTraffic(st);
    Object.assign(e, makeRoutes(st, e.traffic, e.uc));
    if (!e.routes.length) e.cars = e.cars.filter((c) => c.follow);
    this.plots.set(id, e);
  }
  has(id) { return this.plots.has(id); }
  clear() { this.plots.clear(); this.followed = null; }

  spawn(e, car = {}) {
    const path = e.routes[Math.floor(Math.random() * e.routes.length)];
    car.path = Math.random() < 0.5 ? [...path].reverse() : path;
    car.s = car.s === undefined ? Math.random() * (car.path.length - 1) : 0;
    car.v = 1.3 + Math.random() * 1.1;
    car.c = Math.floor(Math.random() * 6);
    return car;
  }

  // Follow a resident's commute: a highlighted car shuttles along their route.
  follow(id, path) {
    this.unfollow();
    const e = this.plots.get(id);
    if (!e || !path || path.length < 2) return null;
    const car = { path, s: 0, v: 1.6, c: 2, follow: true, dir: 1, plot: id };
    e.cars.push(car);
    this.followed = car;
    return car;
  }
  unfollow() {
    if (!this.followed) return;
    const e = this.plots.get(this.followed.plot);
    if (e) e.cars = e.cars.filter((c) => c !== this.followed);
    this.followed = null;
  }

  // Moves cars on the listed plots. Returns Map(plotId -> Map(tile -> cars)).
  update(dt, ids, density = 1) {
    const out = new Map();
    for (const id of ids) {
      const e = this.plots.get(id);
      if (!e || e.st.status !== 'alive') continue;
      const want = e.routes.length ? Math.min(60, Math.round((3 + e.roads / 5 + totalPop(e.st) / 3) * density)) : 0;
      let normal = e.cars.filter((c) => !c.follow).length;
      while (normal < want) { e.cars.push(this.spawn(e)); normal++; }
      if (normal > want) { let drop = normal - want; e.cars = e.cars.filter((c) => c.follow || drop-- <= 0); }
      const byTile = new Map();
      const { load, cap } = e.traffic;
      for (const car of e.cars) {
        const tile = car.path[Math.floor(car.s)];
        if (!drivable(e.st.grid, tile)) { if (car.follow) { this.unfollow(); continue; } this.spawn(e, car); continue; }
        const ratio = cap[tile] ? load[tile] / cap[tile] : 0;
        const speed = car.v * (ratio > 1 ? 0.3 / ratio : ratio > 0.7 ? 0.7 : 1);
        if (car.follow) {
          car.s += dt * speed * car.dir;
          if (car.s >= car.path.length - 1) { car.s = car.path.length - 1.001; car.dir = -1; }
          if (car.s <= 0) { car.s = 0; car.dir = 1; }
        } else {
          car.s += dt * speed;
          if (car.s >= car.path.length - 1) this.spawn(e, car);
        }
        const a = Math.floor(car.s), f = car.s - a;
        const p = car.path[a], q = car.path[Math.min(a + 1, car.path.length - 1)];
        const ax = (p % PLOT_W) + 0.5, ay = Math.floor(p / PLOT_W) + 0.5, bx = (q % PLOT_W) + 0.5, by = Math.floor(q / PLOT_W) + 0.5;
        let dx = bx - ax, dy = by - ay;
        if (car.follow && car.dir < 0) { dx = -dx; dy = -dy; }
        if (dx || dy) { car.dx = dx; car.dy = dy; }
        const ox = -(car.dy || 0) * 0.2, oy = (car.dx || 0) * 0.2;   // keep to one side of the road
        car.lx = ax + (bx - ax) * f + ox;
        car.ly = ay + (by - ay) * f + oy;
        const t = f < 0.5 ? p : q;
        if (!byTile.has(t)) byTile.set(t, []);
        byTile.get(t).push(car);
      }
      out.set(id, byTile);
    }
    return out;
  }
}
