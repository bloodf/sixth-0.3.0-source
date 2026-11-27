/** Turns a plan into geometry: floors as one texture, walls that step out of the camera's way, furniture merged into one mesh. */
import * as THREE from 'three';
import { Kit, mixc, shade } from './kit.ts';
import { noise2 } from './tex.ts';
import { furniture, type Built, type Screen } from './furniture3d.ts';
import { backedEdge, Draft, gate, regionOf, size, type HQ, type Item, type Regions, type RoomStatus } from '../game/build.ts';
import { FLOOR_BY, FURN, WALL_BY, type Style } from '../data/furniture.ts';
import { WALL_T } from './hqnav.ts';
import type { G, TitleId } from '../game/types.ts';
import { stationQ } from '../game/match.ts';
export interface Club {
  c1: string;
  c2: string;
  c3: string;
}
export type WallMode = 'cut' | 'up' | 'down';
export const TALL = 2.5,
  STUB = 1.1,
  LOW = 0.3;
const colour = (c: string, k: Club) => (c === '@1' ? k.c1 : c === '@2' ? k.c2 : c);
const pats = new Map<string, HTMLCanvasElement>();
/** a four by four tile swatch, repeated over the floor */
function swatch(s: Style | null, px: number, k: Club, site: number): HTMLCanvasElement {
  const a = s ? colour(s.c1, k) : ['#7b8a63', '#86a05f', '#7d9a5c', '#7d9a5c'][site],
    b = s ? colour(s.c2, k) : ['#6f7d5a', '#779354', '#6c8a4f', '#6c8a4f'][site];
  const key = [s?.kind ?? 'grass', a, b, px].join();
  let c = pats.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const n = px * 4;
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  const N = noise2(5);
  x.fillStyle = a;
  x.fillRect(0, 0, n, n);
  const kind = s?.kind ?? 'grass';
  if (kind === 'wood') {
    for (let i = 0; i < 16; i++) {
      const off = ((i * 0.73) % 2) - 2;
      for (let q = 0; q < 4; q++) {
        x.fillStyle = mixc(a, b, N((q % 2) * 3 + i * 9, i * 7)).getStyle();
        x.fillRect((off + q * 2) * px + 0.5, i * 0.25 * px + 0.5, 2 * px - 1, 0.25 * px - 1);
      }
    }
  } else if (kind === 'tile' || kind === 'marble') {
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 8; i++) {
        x.fillStyle = kind === 'marble' ? mixc(a, b, N(i * 2.3, j * 1.7)).getStyle() : (i + j) % 2 ? a : b;
        x.fillRect(i * 0.5 * px + 0.5, j * 0.5 * px + 0.5, 0.5 * px - 1, 0.5 * px - 1);
      }
  } else {
    const dens = kind === 'grass' ? 26 : 9;
    for (let i = 0; i < 16 * dens; i++) {
      x.fillStyle = mixc(a, b, Math.random()).getStyle();
      x.globalAlpha = 0.5;
      const z = px * (kind === 'grass' ? 0.08 : 0.12);
      x.fillRect(Math.random() * n, Math.random() * n, z, kind === 'grass' ? z * 2 : z);
    }
    x.globalAlpha = 1;
    if (kind === 'rubber') {
      x.strokeStyle = 'rgba(0,0,0,.25)';
      for (let i = 0; i < 4; i++) x.strokeRect(i * px, -2, px * 2, n + 4);
      for (let j = 0; j < 4; j++) x.strokeRect(-2, j * px, n + 4, px * 2);
    }
  }
  if (pats.size > 80) pats.clear();
  pats.set(key, c);
  return c;
}
export const floorStyle = (k: string) => FLOOR_BY[k] ?? null;
export function floorSwatch(s: Style, k: Club): HTMLCanvasElement {
  return swatch(s, 20, k, 1);
}
export function floorCanvas(d: Draft, cv: HTMLCanvasElement, px: number, k: Club, site: number) {
  const { w, h } = d;
  if (cv.width !== w * px || cv.height !== h * px) {
    cv.width = w * px;
    cv.height = h * px;
  }
  const x = cv.getContext('2d')!;
  const kinds = new Map<string, CanvasPattern>();
  const pat = (c: string) => {
    let p = kinds.get(c);
    if (!p) kinds.set(c, (p = x.createPattern(swatch(c === '.' ? null : FLOOR_BY[c], px, k, site), 'repeat')!));
    return p;
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      x.fillStyle = pat(d.ft(i, j));
      x.fillRect(i * px, j * px, px, px);
    }
  // the plot
  x.strokeStyle = 'rgba(255,255,255,.16)';
  x.lineWidth = px * 0.06;
  x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w * px - x.lineWidth, h * px - x.lineWidth);
  // stepping stones from front doors to the street
  for (let j = 0; j <= h; j++)
    for (let i = 0; i < w; i++)
      if (d.eh(i, j) === 'D' && d.ft(i, j) === '.' && d.ft(i, j - 1) !== '.')
        for (let q = j; q < h && d.ft(i, q) === '.'; q++) {
          for (const [ox, oy, a] of [
            [0.28, 0.25, 0.3],
            [0.7, 0.42, -0.2],
            [0.32, 0.72, 0.1],
            [0.72, 0.9, 0.4],
          ]) {
            x.fillStyle = '#b5ada0';
            x.beginPath();
            x.ellipse((i + ox) * px, (q + oy) * px, px * 0.2, px * 0.15, a, 0, 7);
            x.fill();
          }
        }
  // contact shadows along the walls
  const grad = (x0: number, y0: number, gw: number, gh: number, dx: number, dy: number, a: number) => {
    const g = x.createLinearGradient(
      dx < 0 ? x0 + gw : x0,
      dy < 0 ? y0 + gh : y0,
      dx < 0 ? x0 : dx > 0 ? x0 + gw : x0,
      dy < 0 ? y0 : dy > 0 ? y0 + gh : y0,
    );
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(x0, y0, gw, gh);
  };
  for (let j = 0; j <= h; j++)
    for (let i = 0; i < w; i++) {
      const e = d.eh(i, j);
      if (e !== '0' && e !== 'D') {
        if (j < h) grad(i * px, j * px, px, px, 0, 1, 0.36);
        if (j > 0) grad(i * px, (j - 0.4) * px, px, px * 0.4, 0, -1, 0.2);
      }
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i <= w; i++) {
      const e = d.ev(i, j);
      if (e !== '0' && e !== 'D') {
        if (i < w) grad(i * px, j * px, px * 0.7, px, 1, 0, 0.26);
        if (i > 0) grad((i - 0.6) * px, j * px, px * 0.6, px, -1, 0, 0.2);
      }
    }
}
/** How tall each edge is drawn from where the camera stands. */
export class Heights {
  constructor(
    public d: Draft,
    public cx: boolean,
    public cz: boolean,
    public mode: WallMode,
    public top: boolean,
  ) {}
  pick(behind: boolean, front: boolean) {
    if (this.mode === 'down') return 0.14;
    if (this.mode === 'up') return TALL;
    if (!behind && !front) return STUB;
    if (behind && front) return STUB;
    if (behind) return LOW;
    return this.top ? STUB : TALL;
  }
  v(x: number, y: number) {
    const w = this.d.ft(x - 1, y) !== '.',
      e = this.d.ft(x, y) !== '.';
    return this.cx ? this.pick(w, e) : this.pick(e, w);
  }
  h(x: number, y: number) {
    const n = this.d.ft(x, y - 1) !== '.',
      s = this.d.ft(x, y) !== '.';
    return this.cz ? this.pick(n, s) : this.pick(s, n);
  }
  item(it: Item) {
    const [o, x, y] = backedEdge(it);
    return o === 'v' ? this.v(x, y) : this.h(x, y);
  }
}
const FACADE = ['#a8634a', '#d9c7a6', '#b0674a', '#e6ebec'],
  CAP = ['#4a3f35', '#5b4a3a', '#3d3833', '#2a3a42'];
export interface Seg {
  o: 'v' | 'h';
  x: number;
  y: number;
  h: number;
}
export function walls(k: Kit, d: Draft, H: Heights, club: Club, site: number, low: boolean): Seg[] {
  const t = WALL_T;
  const out: Seg[] = [];
  const cap = CAP[site],
    fac = FACADE[site];
  const tint = (p: string) => {
    const s = WALL_BY[p] ?? WALL_BY.a;
    return { s, c: colour(s.c1, club), c2: colour(s.c2, club) };
  };
  const post = new Map<number, [number, string]>();
  const jog = (x: number, y: number, h: number, c: string) => {
    const i = y * (d.w + 1) + x;
    const p = post.get(i);
    if (!p || p[0] < h) post.set(i, [h, c]);
  };
  /** a stretch of n edges along local x; sides on bare land are dressed in the facade */
  const run = (e: string, n: number, p: string, h: number, outA: boolean, outB: boolean) => {
    const { s, c, c2 } = tint(p);
    const L = n - t * 2;
    const slab = (y0: number, y1: number) => {
      if (y1 <= y0) return;
      k.box(n / 2, y0, 0, L, y1 - y0, t * 2, c, { ao: y0 === 0 ? 0.22 : 0 });
      for (const [side, isOut] of [
        [-1, outA],
        [1, outB],
      ] as [number, boolean][]) {
        if (isOut) k.box(n / 2, y0, side * (t + 0.014), n + 0.08, y1 - y0, 0.028, fac, { ao: y0 === 0 ? 0.25 : 0 });
        else if (low) continue;
        else if (s.kind === 'brick') {
          for (let r = Math.ceil(y0 / 0.16); r * 0.16 < y1 - 0.05; r++) {
            k.box(n / 2, r * 0.16, side * (t + 0.004), L, 0.012, 0.008, c2, { ao: 0 });
            for (let q = 0; q < 3 * n; q++)
              k.box(
                t + ((q + (r % 2) * 0.5 + 0.25) / (3 * n)) * L,
                r * 0.16,
                side * (t + 0.004),
                0.012,
                Math.min(0.16, y1 - r * 0.16),
                0.008,
                c2,
                { ao: 0 },
              );
          }
        } else if (s.kind === 'panel')
          for (let q = 0; q < 5 * n; q++) k.box(t + ((q + 0.5) / (5 * n)) * L, y0, side * (t + 0.004), 0.02, y1 - y0, 0.008, c2, { ao: 0 });
        if (!isOut && y0 === 0 && h > 0.2) k.box(n / 2, 0, side * (t + 0.008), L, 0.09, 0.016, shade(c, -0.28), { ao: 0 });
      }
    };
    const lid = (y: number) => k.box(n / 2, y, 0, L, 0.045, t * 2 + 0.02, cap, { ao: 0 });
    if (e === '1') {
      slab(0, h);
      lid(h);
    } else if (e === 'W') {
      if (h <= 0.9) {
        slab(0, h);
        lid(h);
        k.box(0.5, h + 0.045, 0, 0.7, 0.012, t * 2 - 0.02, '#a9d2e6', { ao: 0 });
      } else {
        const y1 = Math.min(2.1, h);
        slab(0, 0.9);
        k.box(0.5, 0.9, 0, L, 0.04, t * 2 + 0.06, '#f1ece2', { ao: 0 });
        for (const x of [t + 0.03, 1 - t - 0.03]) k.box(x, 0.9, 0, 0.06, y1 - 0.9, t * 2, '#3d4a52', { ao: 0 });
        k.box(0.5, 0.92, 0, L - 0.12, y1 - 0.92, 0.03, '#a9d2e6', { ao: 0.12 });
        k.box(0.5, 0.92, 0, 0.04, y1 - 0.92, 0.05, '#3d4a52', { ao: 0 });
        if (h > 2.1) {
          k.box(0.5, 2.06, 0, L, 0.06, t * 2 + 0.02, '#3d4a52', { ao: 0 });
          slab(2.12, h);
        }
        lid(h);
      }
    } else if (e === 'D') {
      const dh = Math.min(h, 2.05);
      for (const x of [t + 0.025, 1 - t - 0.025]) k.box(x, 0, 0, 0.05, dh, t * 2 + 0.04, '#6f4e30', { ao: 0.1 });
      k.box(0.5, 0.002, 0, L, 0.014, t * 2 + 0.04, '#8f683f', { ao: 0 });
      if (h > 2.1) {
        k.box(0.5, 2.05, 0, L, 0.07, t * 2 + 0.04, '#6f4e30', { ao: 0 });
        slab(2.12, h);
        lid(h);
      }
      for (const [side, isOut] of [
        [-1, outA],
        [1, outB],
      ] as [number, boolean][])
        if (isOut) k.box(0.5, 0.004, side * 0.42, 0.8, 0.02, 0.5, mixc(club.c1, '#222222', 0.3), { ao: 0 });
    }
  };
  const V = (x: number, y: number) => {
    const e = d.ev(x, y);
    const h = H.v(x, y),
      w = d.ft(x - 1, y) === '.',
      ee = d.ft(x, y) === '.';
    return { e, h, p: d.pv[d.iv(x, y)], a: ee && !w, b: w && !ee };
  };
  const Hh = (x: number, y: number) => {
    const e = d.eh(x, y);
    const h = H.h(x, y),
      n = d.ft(x, y - 1) === '.',
      s = d.ft(x, y) === '.';
    return { e, h, p: d.ph[d.ih(x, y)], a: n && !s, b: s && !n };
  };
  type E = ReturnType<typeof V>;
  const same = (q: E, r: E) => q.e === '1' && r.e === '1' && q.h === r.h && q.p === r.p && q.a === r.a && q.b === r.b;
  for (let x = 0; x <= d.w; x++)
    for (let y = 0; y < d.h;) {
      const q = V(x, y);
      if (q.e === '0') {
        y++;
        continue;
      }
      let n = 1;
      while (y + n < d.h && same(q, V(x, y + n)) && d.eh(x - 1, y + n) === '0' && d.eh(x, y + n) === '0') n++;
      k.push(x, 0, y, -Math.PI / 2);
      run(q.e, n, q.p, q.h, q.a, q.b);
      k.pop();
      const c = tint(q.p).c;
      jog(x, y, q.h, c);
      jog(x, y + n, q.h, c);
      for (let i = 0; i < n; i++) out.push({ o: 'v', x, y: y + i, h: q.h });
      y += n;
    }
  for (let y = 0; y <= d.h; y++)
    for (let x = 0; x < d.w;) {
      const q = Hh(x, y);
      if (q.e === '0') {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < d.w && same(q, Hh(x + n, y)) && d.ev(x + n, y - 1) === '0' && d.ev(x + n, y) === '0') n++;
      k.push(x, 0, y);
      run(q.e, n, q.p, q.h, q.a, q.b);
      k.pop();
      const c = tint(q.p).c;
      jog(x, y, q.h, c);
      jog(x + n, y, q.h, c);
      for (let i = 0; i < n; i++) out.push({ o: 'h', x: x + i, y, h: q.h });
      x += n;
    }
  for (const [i, [h, c]] of post) {
    const x = i % (d.w + 1),
      y = (i - x) / (d.w + 1);
    k.box(x, 0, y, t * 2 + 0.004, h, t * 2 + 0.004, c, { ao: 0.22 });
    k.box(x, h, y, t * 2 + 0.02, 0.046, t * 2 + 0.02, cap, { ao: 0 });
  }
  return out;
}
/** what each piece needs to know about the club to be drawn */
export function dressing(d: Draft, R: Regions, st: RoomStatus[], g: G): Map<string, { gear?: any; full?: number; lvl?: number }> {
  const out = new Map<string, any>();
  const by = new Map<number, RoomStatus>();
  for (const s of st) if (s.region && !by.has(s.region.id)) by.set(s.region.id, s);
  let cups = g.trophies.length;
  const n = new Map<number, number>();
  for (const it of [...d.items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const reg = regionOf(d, it, R);
    const s = by.get(reg);
    if (it.f === 'station') {
      const i = n.get(reg) ?? 0;
      n.set(reg, i + 1);
      const q = s?.zone.type === 'practice' && s.zone.title ? g.squads[s.zone.title as TitleId]?.stations[i] : undefined;
      out.set(it.id, {
        lvl: s?.lvl ?? 1,
        ...(q ? { gear: { mon: q.m.monitor, rig: q.m.rig, key: q.m.keyboard, chair: q.m.chair, q: stationQ(q) } } : {}),
      });
    } else if (it.f === 'plinth') {
      out.set(it.id, { full: cups > 0 ? 1 : 0 });
      cups--;
    } else if (it.f === 'tcase') {
      out.set(it.id, { full: Math.max(0, Math.min(2, cups)) });
      cups -= 2;
    }
  }
  return out;
}
export interface Merged {
  geo: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  scr: (Screen & { wx: number; wz: number; wry: number })[];
  top: Map<string, [number, number]>;
}
export function place(b: Built, it: Item, p: number[], n: number[], c: number[], gp: number[], gc: number[], mk?: number[]) {
  const [w, h] = size(it);
  const cx = (it.x + w / 2) / 2,
    cz = (it.y + h / 2) / 2;
  const co = [1, 0, -1, 0][it.r],
    si = [0, 1, 0, -1][it.r];
  for (let i = 0; i < b.p.length; i += 3) {
    const x = b.p[i],
      z = b.p[i + 2];
    p.push(cx + x * co + z * si, b.p[i + 1], cz - x * si + z * co);
    const a = b.n[i],
      e = b.n[i + 2];
    n.push(a * co + e * si, b.n[i + 1], e * co - a * si);
    c.push(b.c[i], b.c[i + 1], b.c[i + 2]);
    mk?.push(b.a[i / 3]);
  }
  for (let i = 0; i < b.gp.length; i += 3) {
    const x = b.gp[i],
      z = b.gp[i + 2];
    gp.push(cx + x * co + z * si, b.gp[i + 1], cz - x * si + z * co);
    gc.push(b.gc[i], b.gc[i + 1], b.gc[i + 2]);
  }
}
export function geoOf(p: number[], n: number[] | null, c: number[], mk?: number[]): THREE.BufferGeometry | null {
  if (!p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  if (n) g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  if (mk) g.setAttribute('mk', new THREE.Float32BufferAttribute(mk, 1));
  return g;
}
export function stuff(d: Draft, H: Heights, club: Club, dress: Map<string, any>, low: boolean, hide: Set<string> | null): Merged {
  const p: number[] = [],
    n: number[] = [],
    c: number[] = [],
    gp: number[] = [],
    gc: number[] = [],
    mk: number[] = [];
  const scr: Merged['scr'] = [];
  const top: Merged['top'] = new Map();
  for (const it of d.items) {
    const f = FURN[it.f];
    if (!f || hide?.has(it.id)) continue;
    let wall = TALL;
    if (f.wall) {
      wall = H.item(it);
      if (wall < 0.6) continue;
    }
    const b = furniture(it.f, { ...club, wall, low, ...dress.get(it.id) });
    place(b, it, p, n, c, gp, gc, mk);
    let lo = 9,
      hi = 0.1;
    for (let i = 1; i < b.p.length; i += 3) {
      if (b.p[i] > hi) hi = b.p[i];
      if (b.p[i] < lo) lo = b.p[i];
    }
    top.set(it.id, [lo, hi]);
    const [w, h] = size(it);
    const cx = (it.x + w / 2) / 2,
      cz = (it.y + h / 2) / 2;
    const co = [1, 0, -1, 0][it.r],
      si = [0, 1, 0, -1][it.r];
    for (const s of b.scr) scr.push({ ...s, wx: cx + s.x * co + s.z * si, wz: cz - s.x * si + s.z * co, wry: s.ry + (it.r * Math.PI) / 2 });
  }
  return { geo: geoOf(p, n, c, mk), glow: geoOf(gp, null, gc), scr, top };
}
export { gate };

const ROUGH: Record<string, number> = {
  wood: 0.42,
  carpet: 0.97,
  tile: 0.28,
  concrete: 0.62,
  rubber: 0.8,
  marble: 0.12,
  paint: 0.6,
  brick: 0.9,
  panel: 0.6,
};
export const floorRough = (k: string) => (k === '.' ? 1 : (ROUGH[FLOOR_BY[k]?.kind ?? 'wood'] ?? 0.7));
