/**
 * Walking about the headquarters. No rendering here, so it can be tested headless.
 * Walls and furniture are solid rectangles; a person is a circle that may not enter them. Seats are reached from a free
 * point next to the furniture they belong to.
 */
import { Draft, roomsOf, size, toWorld, regionOf, gate, type HQ, type Item, type Regions, type Room } from '../game/build.ts';
import { FURN } from '../data/furniture.ts';
import type { RoomType, TitleId } from '../game/types.ts';
export const BODY = 0.18;
export const WALL_T = 0.06;
const CELL = 0.25,
  M = 4;
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  item?: string;
}
export interface Spot {
  x: number;
  z: number;
  ry: number;
  act: string;
  kind: string;
  seat?: number;
  y?: number;
  title?: TitleId;
  slot?: number;
  /** where a person stands before taking the seat */
  ax: number;
  az: number;
  item?: string;
  used?: string;
}
const gap = (r: Rect, x: number, z: number) => {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0,
    dz = z < r.z0 ? r.z0 - z : z > r.z1 ? z - r.z1 : 0;
  return Math.hypot(dx, dz);
};
export class Nav {
  W: number;
  H: number;
  solids: Rect[] = [];
  private bucket = new Map<number, Rect[]>();
  /** distance to the nearest solid at every lattice point, up to 1 m */
  clear: Float32Array;
  /** lattice points that can be walked to from the street */
  reach: Uint8Array;
  d: Draft;
  constructor(q: HQ) {
    const d = (this.d = new Draft(q));
    this.W = (d.w + M * 2) / CELL + 1;
    this.H = (d.h + M * 2) / CELL + 1;
    const t = WALL_T;
    const wall = (x0: number, z0: number, x1: number, z1: number) => this.add({ x0, z0, x1, z1 });
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x <= d.w; x++) {
        const e = d.ev(x, y);
        if (e === '1' || e === 'W') wall(x - t, y - t, x + t, y + 1 + t);
        else if (e === 'D') {
          wall(x - t, y - t, x + t, y + t);
          wall(x - t, y + 1 - t, x + t, y + 1 + t);
        }
      }
    for (let y = 0; y <= d.h; y++)
      for (let x = 0; x < d.w; x++) {
        const e = d.eh(x, y);
        if (e === '1' || e === 'W') wall(x - t, y - t, x + 1 + t, y + t);
        else if (e === 'D') {
          wall(x - t, y - t, x + t, y + t);
          wall(x + 1 - t, y - t, x + 1 + t, y + t);
        }
      }
    for (const it of d.items) {
      const f = FURN[it.f];
      if (!f || f.wall || f.flat) continue;
      const [w, h] = size(it);
      this.add({ x0: it.x / 2, z0: it.y / 2, x1: (it.x + w) / 2, z1: (it.y + h) / 2, item: it.id });
    }
    this.clear = new Float32Array(this.W * this.H).fill(1);
    for (const r of this.solids) {
      const i0 = Math.max(0, Math.floor((r.x0 - 1 + M) / CELL)),
        i1 = Math.min(this.W - 1, Math.ceil((r.x1 + 1 + M) / CELL)),
        j0 = Math.max(0, Math.floor((r.z0 - 1 + M) / CELL)),
        j1 = Math.min(this.H - 1, Math.ceil((r.z1 + 1 + M) / CELL));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const g = gap(r, i * CELL - M, j * CELL - M);
          const k = j * this.W + i;
          if (g < this.clear[k]) this.clear[k] = g;
        }
    }
    this.reach = new Uint8Array(this.W * this.H);
    const [gx] = gate(q);
    const s = this.node(gx + 0.5, d.h + 1.5);
    const st = [s];
    this.reach[s] = 1;
    while (st.length) {
      const k = st.pop()!;
      this.near(k, n => {
        if (!this.reach[n]) {
          this.reach[n] = 1;
          st.push(n);
        }
      });
    }
  }
  private add(r: Rect) {
    this.solids.push(r);
    for (let z = Math.floor(r.z0 - 0.5); z <= Math.floor(r.z1 + 0.5); z++)
      for (let x = Math.floor(r.x0 - 0.5); x <= Math.floor(r.x1 + 0.5); x++) {
        const k = (z + 64) * 256 + x + 64;
        (this.bucket.get(k) ?? this.bucket.set(k, []).get(k)!).push(r);
      }
  }
  around(x: number, z: number): Rect[] {
    return this.bucket.get((Math.floor(z) + 64) * 256 + Math.floor(x) + 64) ?? [];
  }
  node(x: number, z: number) {
    const i = Math.max(0, Math.min(this.W - 1, Math.round((x + M) / CELL))),
      j = Math.max(0, Math.min(this.H - 1, Math.round((z + M) / CELL)));
    return j * this.W + i;
  }
  at(k: number): [number, number] {
    const i = k % this.W;
    return [i * CELL - M, ((k - i) / this.W) * CELL - M];
  }
  private near(k: number, f: (n: number, cost: number) => void) {
    const W = this.W,
      i = k % W,
      j = (k - i) / W;
    const ok = (a: number, b: number) => a >= 0 && b >= 0 && a < W && b < this.H && this.clear[b * W + a] >= BODY;
    const e = ok(i + 1, j),
      w = ok(i - 1, j),
      n = ok(i, j - 1),
      s = ok(i, j + 1);
    if (e) f(k + 1, CELL);
    if (w) f(k - 1, CELL);
    if (n) f(k - W, CELL);
    if (s) f(k + W, CELL);
    const D = CELL * 1.4142;
    if (e && n && ok(i + 1, j - 1)) f(k - W + 1, D);
    if (w && n && ok(i - 1, j - 1)) f(k - W - 1, D);
    if (e && s && ok(i + 1, j + 1)) f(k + W + 1, D);
    if (w && s && ok(i - 1, j + 1)) f(k + W - 1, D);
  }
  /** may a person of this size be here? */
  ok(x: number, z: number, r = BODY - 0.012, but?: string) {
    for (const q of this.around(x, z)) if (!(but && q.item === but) && gap(q, x, z) < r) return false;
    return true;
  }
  line(x0: number, z0: number, x1: number, z1: number, r = BODY, but?: string) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.06));
    for (let i = 0; i <= n; i++) if (!this.ok(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, r, but)) return false;
    return true;
  }
  /** the nearest place one can walk to */
  nearest(x: number, z: number, far = 6): [number, number] | null {
    const c = this.node(x, z),
      ci = c % this.W,
      cj = (c - ci) / this.W;
    let best = far * far,
      b = -1;
    const R = Math.ceil(far / CELL);
    for (let r = 0; r <= R; r++) {
      if (b >= 0 && (r * CELL) ** 2 > best * 1.5) break;
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
          const k = j * this.W + i;
          if (!this.reach[k]) continue;
          const [px, pz] = this.at(k);
          const d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < best) {
            best = d;
            b = k;
          }
        }
    }
    return b < 0 ? null : this.at(b);
  }
  private g = new Float32Array(0);
  private from = new Int32Array(0);
  /** Route between two free points, keeping off the walls where there is room. */
  path(x0: number, z0: number, x1: number, z1: number): [number, number][] | null {
    const a = this.snap(x0, z0),
      b = this.snap(x1, z1);
    if (a < 0 || b < 0) return null;
    const n = this.W * this.H;
    if (this.g.length !== n) {
      this.g = new Float32Array(n);
      this.from = new Int32Array(n);
    }
    this.g.fill(Infinity);
    const [bx, bz] = this.at(b);
    const hq: number[] = [],
      hk: number[] = [];
    const push = (k: number, f: number) => {
      let i = hq.length;
      hq.push(f);
      hk.push(k);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hq[p] <= f) break;
        hq[i] = hq[p];
        hk[i] = hk[p];
        i = p;
      }
      hq[i] = f;
      hk[i] = k;
    };
    const pop = () => {
      const k = hk[0];
      const f = hq.pop()!,
        q = hk.pop()!;
      const L = hq.length;
      if (L) {
        let i = 0;
        for (;;) {
          let c = i * 2 + 1;
          if (c >= L) break;
          if (c + 1 < L && hq[c + 1] < hq[c]) c++;
          if (hq[c] >= f) break;
          hq[i] = hq[c];
          hk[i] = hk[c];
          i = c;
        }
        hq[i] = f;
        hk[i] = q;
      }
      return k;
    };
    const est = (k: number) => {
      const [x, z] = this.at(k);
      return Math.hypot(x - bx, z - bz);
    };
    this.g[a] = 0;
    this.from[a] = -1;
    push(a, est(a));
    const done = new Uint8Array(n);
    while (hq.length) {
      const k = pop();
      if (k === b) break;
      if (done[k]) continue;
      done[k] = 1;
      this.near(k, (m, c) => {
        if (done[m]) return;
        const cl = this.clear[m];
        const q = this.g[k] + c * (cl < 0.3 ? 2.2 : cl < 0.5 ? 1.3 : 1);
        if (q < this.g[m]) {
          this.g[m] = q;
          this.from[m] = k;
          push(m, q + est(m));
        }
      });
    }
    if (this.g[b] === Infinity) return null;
    const raw: [number, number][] = [];
    for (let k = b; k >= 0; k = this.from[k]) raw.push(this.at(k));
    raw.reverse();
    raw[0] = [x0, z0];
    if (this.ok(x1, z1)) raw.push([x1, z1]);
    // straighten, as long as the straight line keeps its distance
    const out: [number, number][] = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 28);
      while (
        j > i + 1 &&
        !this.line(raw[i][0], raw[i][1], raw[j][0], raw[j][1], 0.24) &&
        !(j <= i + 2 && this.line(raw[i][0], raw[i][1], raw[j][0], raw[j][1]))
      )
        j--;
      out.push(raw[j]);
      i = j;
    }
    return out;
  }
  /** a walkable lattice point that can be seen from here */
  private snap(x: number, z: number): number {
    const c = this.node(x, z),
      ci = c % this.W,
      cj = (c - ci) / this.W;
    let best = Infinity,
      b = -1;
    for (let j = cj - 3; j <= cj + 3; j++)
      for (let i = ci - 3; i <= ci + 3; i++) {
        if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
        const k = j * this.W + i;
        if (this.clear[k] < BODY) continue;
        const [px, pz] = this.at(k);
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < best && this.line(x, z, px, pz, BODY - 0.012)) {
          best = d;
          b = k;
        }
      }
    return b;
  }
}
const FRONT = new Set(['sofa', 'armchair', 'listener', 'beanbag', 'waitbench', 'mat']);
/** Where people sit, stand and sleep, from the furniture in the rooms that work. */
export function spotsOf(q: HQ, nav: Nav, rooms: Room[] = roomsOf(q)): Spot[] {
  const d = nav.d;
  const R = d.regions();
  const out: Spot[] = [];
  const zone = new Map(q.zones.map(z => [z.id, z]));
  const byRegion = new Map<number, Room>();
  for (const r of rooms) {
    const z = zone.get(r.id);
    if (z) byRegion.set(R.map[z.y * d.w + z.x], r);
  }
  const items = [...d.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const count = new Map<string, number>();
  for (const it of items) {
    const f = FURN[it.f];
    if (!f.spots) continue;
    const reg = regionOf(d, it, R);
    const room = byRegion.get(reg);
    for (const s of f.spots) {
      const [x, z] = toWorld(it, s.x, s.z);
      const ry = s.ry + (it.r * Math.PI) / 2;
      let role: string = s.role;
      const type: RoomType | 'yard' = room ? room.type : 'yard';
      if (!room && !(role === 'guest' || f.out)) continue;
      let slot: number | undefined;
      if (type === 'practice' && it.f === 'station') {
        const n = (count.get(room!.id) ?? 0) as number;
        count.set(room!.id, n + 1);
        slot = n;
      }
      if (type === 'office' && role === 'desk' && !count.get('me')) {
        count.set('me', 1);
        role = 'me';
      }
      const o: Spot = {
        x,
        z,
        ry,
        act: s.act,
        kind: `${type}:${role}`,
        ax: x,
        az: z,
        item: it.id,
        ...(s.seat !== undefined ? { seat: s.seat } : {}),
        ...(s.y !== undefined ? { y: s.y } : {}),
        ...(slot !== undefined ? { slot } : {}),
        ...(room?.title ? { title: room.title } : {}),
      };
      if (place(nav, o, it)) out.push(o);
    }
  }
  for (const r of rooms) {
    const z = zone.get(r.id)!;
    const id = R.map[z.y * d.w + z.x];
    stand(nav, R, id, r, out);
  }
  // somewhere to go when everything is taken: halls first, the front garden after that
  const free: [number, number, number][] = [];
  for (let y = 0; y < d.h; y++)
    for (let x = 0; x < d.w; x++) {
      const id = R.map[y * d.w + x];
      if (id >= 0 && byRegion.has(id)) continue;
      if (id < 0 && y < d.h - 3) continue;
      const k = nav.node(x + 0.5, y + 0.5);
      if (nav.reach[k] && nav.clear[k] >= 0.4) free.push([x + 0.5, y + 0.5, (id < 0 ? 1000 : 0) + ((x * 7919 + y * 104729) % 97)]);
    }
  free.sort((a, b) => a[2] - b[2]);
  for (const [x, z, n] of free.slice(0, 60))
    out.push({ x, z, ax: x, az: z, ry: (n % 8) * 0.8, act: n % 5 === 0 ? 'talk' : 'idle', kind: 'wander' });
  return out;
}
function place(nav: Nav, o: Spot, it: Item): boolean {
  const f = FURN[it.f];
  const solid = !f.flat && !f.wall;
  const fx = Math.sin(o.ry),
    fz = Math.cos(o.ry);
  const inside = solid && !nav.ok(o.x, o.z, 0.02);
  if (!inside && nav.ok(o.x, o.z)) {
    const k = nav.nearest(o.x, o.z, 0.4);
    return !!k && nav.line(o.x, o.z, k[0], k[1], BODY - 0.012);
  }
  let best = Infinity,
    bx = 0,
    bz = 0;
  for (let dz = -2.25; dz <= 2.25; dz += CELL)
    for (let dx = -2.25; dx <= 2.25; dx += CELL) {
      const k = nav.node(o.x + dx, o.z + dz);
      if (!nav.reach[k]) continue;
      const [x, z] = nav.at(k);
      const L = Math.hypot(x - o.x, z - o.z);
      if (!inside && L > 0.8) continue;
      const dot = L > 0.01 ? ((x - o.x) * fx + (z - o.z) * fz) / L : 0;
      const want = FRONT.has(it.f) ? dot : o.act === 'lie' || o.act === 'bench' ? -Math.abs(dot) : -dot;
      const c = L - 0.5 * want + (want < -0.35 ? 1.4 : 0);
      if (c >= best) continue;
      if (!nav.line(x, z, o.x, o.z, inside ? 0.04 : BODY - 0.012, it.id)) continue;
      best = c;
      bx = x;
      bz = z;
    }
  if (best === Infinity) return false;
  o.ax = bx;
  o.az = bz;
  if (!inside) {
    // a standing place with too little room: stand where there is some
    o.x = bx;
    o.z = bz;
  }
  return true;
}
const STAND: Partial<Record<RoomType, [string, string, number][]>> = {
  practice: [
    ['coach', 'talk', 1],
    ['watch', 'idle', 2],
  ],
  strategy: [['coach', 'talk', 1]],
  gym: [['coach', 'talk', 1]],
  stream: [['coach', 'talk', 1]],
  workshop: [['coach', 'cook', 1]],
  medical: [['coach', 'talk', 1]],
  lounge: [['play', 'talk', 2]],
  trophy: [
    ['seat', 'idle', 2],
    ['guest', 'talk', 1],
  ],
  office: [['guest', 'talk', 1]],
};
function stand(nav: Nav, R: Regions, id: number, r: Room, out: Spot[]) {
  const want = STAND[r.type];
  if (!want) return;
  const seats = out.filter(s => s.kind === r.type + ':seat' && s.x >= r.x && s.x < r.x + r.w && s.z >= r.y && s.z < r.y + r.h);
  const cx = seats.length ? seats.reduce((a, s) => a + s.x, 0) / seats.length : r.x + r.w / 2,
    cz = seats.length ? seats.reduce((a, s) => a + s.z, 0) / seats.length : r.y + r.h / 2;
  const cand: [number, number, number][] = [];
  for (let z = r.y + 0.25; z < r.y + r.h; z += CELL)
    for (let x = r.x + 0.25; x < r.x + r.w; x += CELL) {
      if (R.map[Math.floor(z) * nav.d.w + Math.floor(x)] !== id) continue;
      const k = nav.node(x, z);
      if (!nav.reach[k] || nav.clear[k] < 0.24) continue;
      const L = Math.hypot(x - cx, z - cz);
      cand.push([x, z, Math.abs(L - 1.9) - nav.clear[k] * 1.2]);
    }
  cand.sort((a, b) => a[2] - b[2]);
  for (const [role, act, n] of want) {
    if (
      role === 'coach' &&
      out.some(
        s =>
          s.kind === r.type + ':coach' &&
          s.x >= r.x &&
          s.x < r.x + r.w &&
          s.z >= r.y &&
          s.z < r.y + r.h &&
          (!r.title || s.title === r.title),
      )
    )
      continue;
    for (let i = 0; i < n; i++) {
      const c = cand.find(q => out.every(s => Math.hypot(s.ax - q[0], s.az - q[1]) > 0.55 && Math.hypot(s.x - q[0], s.z - q[1]) > 0.65));
      if (!c) break;
      out.push({
        x: c[0],
        z: c[1],
        ax: c[0],
        az: c[1],
        ry: Math.atan2(cx - c[0], cz - c[1]),
        act,
        kind: `${r.type}:${role}`,
        ...(r.title ? { title: r.title } : {}),
      });
    }
  }
}
/** One person on the move. */
export class Walker {
  x = 0;
  z = 0;
  ry = 0;
  spot: Spot | null = null;
  path: [number, number][] = [];
  arrived = false;
  /** 'in': in or on furniture, 'free': on the floor, 'sit': stepping from the floor into the seat, 'rise': the other way */
  state: 'in' | 'free' | 'sit' | 'rise' = 'free';
  private seat: Spot | null = null;
  need = false;
  private stuck = 0;
  private best = Infinity;
  private pass = 0;
  constructor(public id: string) {}
  go(s: Spot) {
    const same = this.spot && this.spot.x === s.x && this.spot.z === s.z;
    if (same) {
      this.spot = s;
      if (this.seat) this.seat = s;
      return;
    }
    this.spot = s;
    this.arrived = false;
    this.path = [];
    this.need = true;
    if (this.state === 'in' || this.state === 'sit') this.state = this.seat ? 'rise' : 'free';
  }
  warp(s: Spot) {
    this.spot = s;
    this.x = s.x;
    this.z = s.z;
    this.ry = s.ry;
    this.path = [];
    this.need = false;
    this.arrived = true;
    const seat = s.ax !== s.x || s.az !== s.z;
    this.state = seat ? 'in' : 'free';
    this.seat = seat ? s : null;
  }
  /** the building changed under our feet */
  displaced(nav: Nav) {
    this.spot = null;
    this.seat = null;
    this.path = [];
    this.state = 'free';
    this.arrived = false;
    if (!nav.ok(this.x, this.z) || !nav.reach[nav.node(this.x, this.z)]) {
      const p = nav.nearest(this.x, this.z, 80);
      if (p) [this.x, this.z] = p;
    }
  }
  plan(nav: Nav) {
    this.need = false;
    this.best = Infinity;
    this.stuck = 0;
    const s = this.spot;
    if (!s) return;
    const p = nav.path(this.x, this.z, s.ax, s.az);
    if (p) this.path = p;
    else {
      const q = nav.nearest(this.x, this.z, 80);
      if (q) [this.x, this.z] = q;
      this.path = nav.path(this.x, this.z, s.ax, s.az) ?? [];
      if (!this.path.length) {
        this.spot = null;
      }
    }
  }
  private turn(want: number, k: number) {
    let df = want - this.ry;
    df -= Math.round(df / 6.283185307) * 6.283185307;
    this.ry += df * Math.min(1, k);
  }
  /** returns true while walking */
  step(nav: Nav, dt: number, speed: number, others: Walker[]): boolean {
    let left = speed * dt;
    const seatTo = (x: number, z: number, next: 'free' | 'in') => {
      const dx = x - this.x,
        dz = z - this.z,
        L = Math.hypot(dx, dz);
      const k = Math.min(L, left * 0.8);
      left = 0;
      if (L > 0.05 && next === 'free') this.turn(Math.atan2(dx, dz), dt * 8);
      if (L <= k + 1e-6) {
        this.x = x;
        this.z = z;
        this.state = next;
        if (next === 'in') this.arrived = true;
        else this.seat = null;
      } else {
        this.x += (dx / L) * k;
        this.z += (dz / L) * k;
      }
    };
    if (this.state === 'rise') {
      seatTo(this.seat!.ax, this.seat!.az, 'free');
      return true;
    }
    if (this.state === 'sit') {
      seatTo(this.spot!.x, this.spot!.z, 'in');
      this.turn(this.spot!.ry, dt * 7);
      return this.state !== ('in' as string);
    }
    if (this.state === 'in') {
      this.turn(this.spot?.ry ?? this.ry, dt * 7);
      return false;
    }
    if (!this.spot || this.need) return false;
    if (!this.path.length) {
      this.turn(this.spot.ry, dt * 7);
      return false;
    }
    this.pass = Math.max(0, this.pass - dt);
    // no headway for a while (someone in a narrow gap): squeeze past people, never past walls
    let togo = Math.hypot(this.path[0][0] - this.x, this.path[0][1] - this.z);
    for (let i = 1; i < this.path.length; i++)
      togo += Math.hypot(this.path[i][0] - this.path[i - 1][0], this.path[i][1] - this.path[i - 1][1]);
    if (togo < this.best - 0.15) {
      this.best = togo;
      this.stuck = 0;
    } else if ((this.stuck += dt) > 1) {
      this.stuck = 0;
      this.best = Infinity;
      this.pass = 1.8;
      this.path = nav.path(this.x, this.z, this.spot.ax, this.spot.az) ?? this.path;
    }
    let guard = 0;
    while (left > 1e-4 && this.path.length && guard++ < 60) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.x,
        dz = tz - this.z,
        L = Math.hypot(dx, dz);
      const k = Math.min(0.08, left, L);
      if (L < 0.02) {
        this.path.shift();
        continue;
      }
      let vx = dx / L,
        vz = dz / L;
      const hx = vx,
        hz = vz;
      if (this.pass <= 0)
        for (const o of others) {
          if (o === this || o.state === 'in' || o.state === 'sit' || o.state === 'rise') continue;
          const ex = this.x - o.x,
            ez = this.z - o.z,
            q = Math.hypot(ex, ez);
          if (q > 0.52 || q < 1e-4) continue;
          if (ex * hx + ez * hz > 0.05) continue; // behind us
          const w = (0.52 - q) / 0.52;
          // step to the right of whoever is ahead
          vx += (ex / q) * w * 1.1 - hz * w * 0.9;
          vz += (ez / q) * w * 1.1 + hx * w * 0.9;
        }
      const n = Math.hypot(vx, vz) || 1;
      vx /= n;
      vz /= n;
      const px = this.x,
        pz = this.z;
      this.move(nav, vx * k, vz * k);
      left -= k;
      const mx = this.x - px,
        mz = this.z - pz;
      if (mx * mx + mz * mz > 1e-8) this.turn(Math.atan2(mx, mz), k * 6);
      if (Math.hypot(tx - this.x, tz - this.z) < 0.03) {
        this.x = nav.ok(tx, tz) ? tx : this.x;
        this.z = nav.ok(tx, tz) ? tz : this.z;
        this.path.shift();
      }
    }
    if (!this.path.length) {
      const s = this.spot;
      if (s.ax !== s.x || s.az !== s.z) {
        this.state = 'sit';
        this.seat = s;
        return true;
      }
      this.arrived = true;
      return false;
    }
    return true;
  }
  private move(nav: Nav, dx: number, dz: number) {
    if (nav.ok(this.x + dx, this.z + dz)) {
      this.x += dx;
      this.z += dz;
    } else if (nav.ok(this.x + dx, this.z)) this.x += dx;
    else if (nav.ok(this.x, this.z + dz)) this.z += dz;
  }
}
