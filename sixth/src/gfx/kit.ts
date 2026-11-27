import * as THREE from 'three';
import { guess, M as MK, type Mk } from './surface.ts';
/** Accumulates transformed, vertex-coloured primitives into one draw call. Every static prop in the game is built with this. */
const tc = new THREE.Color(),
  tv = new THREE.Vector3(),
  tn = new THREE.Vector3(),
  tm = new THREE.Matrix4(),
  nm = new THREE.Matrix3(),
  te = new THREE.Euler(),
  tq = new THREE.Quaternion(),
  ts = new THREE.Vector3();
const cache = new Map<string, THREE.BufferGeometry>();
const prim = (k: string, f: () => THREE.BufferGeometry) => {
  let g = cache.get(k);
  if (!g) {
    g = f();
    if (g.index) g = g.toNonIndexed();
    cache.set(k, g);
  }
  return g;
};
function bevelBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const P = g.attributes.position.array as Float32Array,
    N = g.attributes.normal.array as Float32Array;
  const p: number[] = [],
    n: number[] = [];
  for (let i = 0; i < P.length; i += 9) {
    if (N[i + 1] < -0.9) continue;
    for (let j = 0; j < 9; j++) {
      p.push(P[i + j]);
      n.push(N[i + j]);
    }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return o;
} // undersides are never seen from above
export interface O {
  ry?: number;
  rx?: number;
  rz?: number;
  glow?: boolean;
  ao?: number;
  jitter?: number;
  /** what it is made of; guessed from the colour when left out */
  m?: Mk;
}
export class Kit {
  /** plain boxes instead of chamfered ones, for the lowest detail */
  plain = false;
  /** how finely curves are cut; software rendering gets by with less */
  static q = 1;
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  gp: number[] = [];
  gc: number[] = [];
  /** material class per vertex */
  a: number[] = [];
  /** default class for the next pieces */
  mk: Mk | null = null;
  m = new THREE.Matrix4();
  stack: THREE.Matrix4[] = [];
  push(x: number, y: number, z: number, ry = 0, s = 1) {
    this.stack.push(this.m.clone());
    tm.compose(tv.set(x, y, z), tq.setFromEuler(te.set(0, ry, 0)), ts.set(s, s, s));
    this.m.multiply(tm);
    return this;
  }
  pop() {
    this.m = this.stack.pop()!;
    return this;
  }
  add(
    g: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    col: THREE.ColorRepresentation,
    o: O = {},
  ) {
    tm.compose(tv.set(x, y, z), tq.setFromEuler(te.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ')), ts.set(sx, sy, sz));
    const M = this.m.clone().multiply(tm);
    nm.getNormalMatrix(M);
    tc.set(col);
    const P = g.attributes.position as THREE.BufferAttribute,
      N = g.attributes.normal as THREE.BufferAttribute;
    const ao = o.ao ?? 0.22;
    const mk = o.m ? MK[o.m] : this.mk ? MK[this.mk] : guess(col);
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!,
      h = bb.max.y - bb.min.y || 1;
    const j = o.jitter ? 1 + (Math.random() - 0.5) * o.jitter : 1;
    for (let i = 0; i < P.count; i++) {
      const t = (P.getY(i) - bb.min.y) / h;
      tv.fromBufferAttribute(P, i).applyMatrix4(M);
      if (o.glow) {
        this.gp.push(tv.x, tv.y, tv.z);
        this.gc.push(tc.r, tc.g, tc.b);
      } else {
        tn.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        this.p.push(tv.x, tv.y, tv.z);
        this.n.push(tn.x, tn.y, tn.z);
        const k = (1 - ao + ao * t) * j;
        this.c.push(tc.r * k, tc.g * k, tc.b * k);
        this.a.push(mk);
      }
    }
    return this;
  }
  /** box standing on y */
  box(x: number, y: number, z: number, w: number, h: number, d: number, col: THREE.ColorRepresentation, o?: O) {
    return this.add(prim('box', bevelBox), x, y + h / 2, z, w, h, d, col, o);
  }
  /** box with chamfered vertical and top edges, for anything seen close up */
  rbox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    col: THREE.ColorRepresentation,
    o?: O & { b?: number; seg?: number },
  ) {
    if (this.plain) return this.box(x, y, z, w, h, d, col, o);
    const b = Math.min(o?.b ?? 0.05, w * 0.45, h * 0.45, d * 0.45);
    return this.add(rounded(w, h, d, b, o?.seg ?? (b > 0.035 && Kit.q > 0.8 ? 2 : 1)), x, y + h / 2, z, 1, 1, 1, col, o);
  }
  /** a stuffed cushion: bulging faces, pinched edges */
  pillow(x: number, y: number, z: number, w: number, h: number, d: number, col: THREE.ColorRepresentation, o: O & { puff?: number } = {}) {
    if (this.plain) return this.box(x, y, z, w, h, d, col, o);
    return this.add(
      prim('pil' + Kit.q + (o.puff ?? 0.4).toFixed(2), () => cushion(o.puff ?? 0.4, Kit.q > 0.8 ? 7 : 5)),
      x,
      y + h / 2,
      z,
      w,
      h,
      d,
      col,
      o,
    );
  }
  /** turned on a lathe: [radius, height] from bottom to top */
  lathe(
    x: number,
    y: number,
    z: number,
    prof: [number, number][],
    col: THREE.ColorRepresentation,
    o: O & { seg?: number; s?: number } = {},
  ) {
    const seg = this.plain ? 8 : Math.max(8, Math.round((o.seg ?? 18) * Kit.q));
    const g = prim(
      'la' + seg + (this.plain ? 'p' : '') + prof.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(';'),
      () =>
        new THREE.LatheGeometry(
          (this.plain && prof.length > 5 ? prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1) : prof).map(
            p => new THREE.Vector2(Math.max(0.0001, p[0]), p[1]),
          ),
          seg,
        ),
    );
    const k = o.s ?? 1;
    return this.add(g, x, y, z, k, k, k, col, o);
  }
  /** cylinder with softened rims */
  bcyl(x: number, y: number, z: number, r: number, h: number, col: THREE.ColorRepresentation, o: O & { seg?: number; b?: number } = {}) {
    if (this.plain) return this.cyl(x, y, z, r, h, col, { ...o, seg: Math.min(10, o.seg ?? 10) });
    const b = Math.min(o.b ?? 0.012, r * 0.4, h * 0.4);
    return this.lathe(
      x,
      y,
      z,
      [
        [0, 0],
        [r - b, 0],
        [r - b * 0.3, b * 0.3],
        [r, b],
        [r, h - b],
        [r - b * 0.3, h - b * 0.3],
        [r - b, h],
        [0, h],
      ],
      col,
      { seg: 20, ...o },
    );
  }
  /** bent pipe through points */
  tube(
    pts: [number, number, number][],
    r: number,
    col: THREE.ColorRepresentation,
    o: O & { seg?: number; rad?: number; closed?: boolean } = {},
  ) {
    const g = prim(
      'tu' +
        r +
        (o.seg ?? 14) +
        (o.rad ?? 7) +
        (o.closed ? 'c' : '') +
        (this.plain ? 'p' : 'q' + Kit.q) +
        pts
          .flat()
          .map(v => v.toFixed(3))
          .join(),
      () =>
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            pts.map(p => new THREE.Vector3(...p)),
            o.closed ?? false,
            'catmullrom',
            0.5,
          ),
          this.plain ? Math.min(4, o.seg ?? 14) : Math.max(2, Math.round((o.seg ?? 14) * (o.seg && o.seg < 4 ? 1 : Kit.q))),
          r,
          this.plain ? 3 : Kit.q < 0.8 ? Math.min(5, o.rad ?? 5) : (o.rad ?? 7),
          o.closed ?? false,
        ),
    );
    return this.add(g, 0, 0, 0, 1, 1, 1, col, { ao: 0.1, ...o });
  }
  /** flat outline pushed along z, with a bevelled rim */
  ext(
    x: number,
    y: number,
    z: number,
    pts: [number, number][],
    d: number,
    col: THREE.ColorRepresentation,
    o: O & { b?: number; round?: number } = {},
  ) {
    const g = prim(
      'ex' +
        d +
        (o.b ?? 0.008) +
        (this.plain ? 'p' : '') +
        pts
          .flat()
          .map(v => v.toFixed(3))
          .join(),
      () => {
        const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
        const q = new THREE.ExtrudeGeometry(sh, {
          depth: d,
          bevelEnabled: !this.plain,
          bevelSize: o.b ?? 0.008,
          bevelThickness: o.b ?? 0.008,
          bevelSegments: Kit.q < 0.8 ? 1 : 2,
          curveSegments: 8,
        });
        q.translate(0, 0, -d / 2);
        return q;
      },
    );
    return this.add(g, x, y, z, 1, 1, 1, col, o);
  }
  /** a single blade: len long, bending down under its own weight */
  leaf(
    x: number,
    y: number,
    z: number,
    len: number,
    w: number,
    yaw: number,
    pitch: number,
    bend: number,
    col: THREE.ColorRepresentation,
    o: O & { tip?: number } = {},
  ) {
    const n = this.plain ? 2 : Kit.q < 0.8 ? 3 : 5;
    const g = prim('lf' + n + [len, w, pitch, bend, o.tip ?? 0.1].map(v => v.toFixed(2)).join(), () => {
      const P: number[] = [];
      const rows: [number, number, number, number][] = [];
      let px = 0,
        py = 0,
        a = pitch;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const ww = w * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88 * 0.98)) * (1 - t * 0.15) + (t > 0.98 ? 0 : 0);
        rows.push([px, py, Math.max(0.002, i === n ? w * (o.tip ?? 0.1) : ww), a]);
        px += (Math.cos(a) * len) / n;
        py += (Math.sin(a) * len) / n;
        a -= bend / n;
      }
      for (let i = 0; i < n; i++) {
        const [x0, y0, w0, a0] = rows[i],
          [x1, y1, w1, a1] = rows[i + 1];
        for (const s of [-1, 1]) {
          const e0: number[] = [x0 + Math.sin(a0) * 0.15 * w0 * -1, y0 + Math.cos(a0) * 0.18 * w0, s * w0 * 0.5],
            e1: number[] = [x1 + Math.sin(a1) * 0.15 * w1 * -1, y1 + Math.cos(a1) * 0.18 * w1, s * w1 * 0.5];
          const c0 = [x0, y0, 0],
            c1 = [x1, y1, 0];
          const tri = s > 0 ? [c0, e0, e1, c0, e1, c1] : [c0, e1, e0, c0, c1, e1];
          for (const v of tri) P.push(...v);
          for (const v of [...tri].reverse()) P.push(v[0], v[1] - 0.002, v[2]);
        }
      }
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      q.computeVertexNormals();
      return q;
    });
    return this.add(g, x, y, z, 1, 1, 1, col, { ry: yaw, ao: 0.35, m: 'leaf', ...o });
  }
  cyl(x: number, y: number, z: number, r: number, h: number, col: THREE.ColorRepresentation, o: O & { r2?: number; seg?: number } = {}) {
    const r2 = o.r2 ?? r,
      seg = o.seg ?? 12;
    return this.add(
      prim(`cyl${(r2 / Math.max(r, 1e-4)).toFixed(2)}_${seg}`, () => new THREE.CylinderGeometry(r2 / Math.max(r, 1e-4), 1, 1, seg)),
      x,
      y + h / 2,
      z,
      r,
      h,
      r,
      col,
      o,
    );
  }
  cone(x: number, y: number, z: number, r: number, h: number, col: THREE.ColorRepresentation, o: O & { seg?: number } = {}) {
    return this.add(
      prim('cone' + (o.seg ?? 8), () => new THREE.ConeGeometry(1, 1, o.seg ?? 8)),
      x,
      y + h / 2,
      z,
      r,
      h,
      r,
      col,
      o,
    );
  }
  sph(x: number, y: number, z: number, r: number, col: THREE.ColorRepresentation, o: O & { sy?: number; sz?: number; seg?: number } = {}) {
    const s = o.seg ?? 10;
    return this.add(
      prim('sph' + s, () => new THREE.SphereGeometry(1, s, Math.ceil(s * 0.7))),
      x,
      y,
      z,
      r,
      r * (o.sy ?? 1),
      r * (o.sz ?? 1),
      col,
      o,
    );
  }
  ico(x: number, y: number, z: number, r: number, col: THREE.ColorRepresentation, o: O & { sy?: number; det?: number } = {}) {
    return this.add(
      prim('ico' + (o.det ?? 0), () => new THREE.IcosahedronGeometry(1, o.det ?? 0)),
      x,
      y,
      z,
      r,
      r * (o.sy ?? 1),
      r,
      col,
      o,
    );
  }
  /** an uneven, leafy lump */
  clump(x: number, y: number, z: number, r: number, col: THREE.ColorRepresentation, o: O & { sy?: number; det?: number; v?: number } = {}) {
    const d = o.det ?? 2;
    return this.add(
      prim('clu' + d + (o.v ?? 0), () => {
        const g = new THREE.IcosahedronGeometry(1, d);
        const P = g.attributes.position.array as Float32Array;
        const sd = (o.v ?? 0) * 3.7;
        for (let i = 0; i < P.length; i += 3) {
          const a = P[i],
            b = P[i + 1],
            c = P[i + 2];
          const n =
            Math.sin(a * 4.1 + sd) * Math.cos(b * 3.7 - sd) * 0.5 +
            Math.sin(c * 5.3 + a * 3.1 + sd) * 0.3 +
            Math.sin(a * 9 + b * 8 + c * 7 + sd) * 0.22;
          const k = 1 + n * 0.2 - (b < -0.3 ? 0.1 : 0);
          P[i] = a * k;
          P[i + 1] = b * k;
          P[i + 2] = c * k;
        }
        return smooth(g.index ? g.toNonIndexed() : g);
      }),
      x,
      y,
      z,
      r,
      r * (o.sy ?? 1),
      r,
      col,
      { m: 'leaf', ...o },
    );
  }
  plane(x: number, y: number, z: number, w: number, d: number, col: THREE.ColorRepresentation, o: O = {}) {
    return this.add(
      prim('pl', () => {
        const g = new THREE.PlaneGeometry(1, 1);
        g.rotateX(-Math.PI / 2);
        return g;
      }),
      x,
      y,
      z,
      w,
      1,
      d,
      col,
      { ao: 0, ...o },
    );
  }
  tor(x: number, y: number, z: number, r: number, t: number, col: THREE.ColorRepresentation, o: O = {}) {
    return this.add(
      prim('tor' + (t / r).toFixed(2), () => {
        const g = new THREE.TorusGeometry(1, t / r, 6, 20);
        g.rotateX(Math.PI / 2);
        return g;
      }),
      x,
      y,
      z,
      r,
      r,
      r,
      col,
      o,
    );
  }
  geo(): THREE.BufferGeometry {
    return weld({ position: [this.p, 3], normal: [this.n, 3], color: [this.c, 3], mk: [this.a, 1] });
  }
  glow(): THREE.BufferGeometry | null {
    if (!this.gp.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.gp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.gc, 3));
    return g;
  }
}
/** triangles into indexed triangles: every vertex that is the same is worked out once */
export function weld(at: Record<string, [ArrayLike<number>, number]>): THREE.BufferGeometry {
  const L = Object.entries(at);
  const [p0, s0] = L[0][1];
  const n = p0.length / s0;
  const width = L.reduce((s, [, [, k]]) => s + k, 0);
  // quantised copy to compare, open addressing to find
  const q = new Int32Array(n * width);
  let o = 0;
  for (const [, [a, k]] of L) {
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) q[i * width + o + j] = Math.round(a[i * k + j] * 4096);
    o += k;
  }
  let cap = 16;
  while (cap < n * 2) cap *= 2;
  const tab = new Int32Array(cap).fill(-1);
  const idx = new Uint32Array(n);
  const keep: number[] = [];
  for (let i = 0; i < n; i++) {
    let h = 2166136261;
    for (let j = 0; j < width; j++) h = Math.imul(h ^ q[i * width + j], 16777619);
    h ^= h >>> 15;
    let s = h & (cap - 1);
    for (;;) {
      const e = tab[s];
      if (e < 0) {
        tab[s] = keep.length;
        idx[i] = keep.length;
        keep.push(i);
        break;
      }
      const f = keep[e] * width;
      let same = true;
      for (let j = 0; j < width && same; j++) same = q[f + j] === q[i * width + j];
      if (same) {
        idx[i] = e;
        break;
      }
      s = (s + 1) & (cap - 1);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, [a, k]] of L) {
    const r = new Float32Array(keep.length * k);
    for (let i = 0; i < keep.length; i++) for (let j = 0; j < k; j++) r[i * k + j] = a[keep[i] * k + j];
    g.setAttribute(name, new THREE.BufferAttribute(r, k));
  }
  g.setIndex(new THREE.BufferAttribute(keep.length < 65536 ? new Uint16Array(idx) : idx, 1));
  return g;
}
const ch = new Map<string, THREE.BufferGeometry>();
/** box with round edges and smooth normals */
function rounded(w: number, h: number, d: number, b: number, seg: number): THREE.BufferGeometry {
  const k = [w, h, d, b].map(v => v.toFixed(3)).join() + seg;
  let g = ch.get(k);
  if (g) return g;
  if (ch.size > 1600) ch.clear();
  const n = seg * 2 + 1;
  const box = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const P = box.attributes.position.array as Float32Array;
  const N = new Float32Array(P.length);
  const half = [w / 2, h / 2, d / 2];
  const v = [0, 0, 0],
    q = [0, 0, 0];
  for (let i = 0; i < P.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      // grid lines: seg rows for each rounded edge, one long span between them
      const t = Math.round((P[i + a] + 0.5) * n);
      const inner = half[a] - b;
      if (t <= seg) {
        v[a] = -inner;
        q[a] = -(1 - t / seg);
      } else {
        v[a] = inner;
        q[a] = (t - seg - 1) / seg;
      }
    }
    // a cube corner pushed onto a sphere octant
    const m = Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])) || 1;
    const tx = Math.tan((q[0] / m) * m * (Math.PI / 4)),
      ty = Math.tan(q[1] * (Math.PI / 4)),
      tz = Math.tan(q[2] * (Math.PI / 4));
    const l = Math.hypot(tx, ty, tz) || 1;
    P[i] = v[0] + (tx / l) * b;
    P[i + 1] = v[1] + (ty / l) * b;
    P[i + 2] = v[2] + (tz / l) * b;
    N[i] = tx / l;
    N[i + 1] = ty / l;
    N[i + 2] = tz / l;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  ch.set(k, g);
  return g;
}
function cushion(puff: number, n: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, n, n > 5 ? 3 : 2, n).toNonIndexed();
  const P = g.attributes.position.array as Float32Array;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i] * 2,
      y = P[i + 1] * 2,
      z = P[i + 2] * 2;
    const ex = 1 - Math.pow(Math.abs(x), 4),
      ez = 1 - Math.pow(Math.abs(z), 4);
    const t = Math.max(0, ex * ez);
    const thick = 1 - puff + puff * Math.sqrt(t);
    // round the outline a little
    const r = Math.hypot(x, z) > 1.15 ? 1 - (Math.hypot(x, z) - 1.15) * 0.22 : 1;
    P[i] = (x / 2) * r;
    P[i + 1] = (y / 2) * thick;
    P[i + 2] = (z / 2) * r;
  }
  return smooth(g);
}
/** smooth normals for anything whose corners coincide */
export function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = g.attributes.position.array as Float32Array;
  const map = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(P[i] * 2000)},${Math.round(P[i + 1] * 2000)},${Math.round(P[i + 2] * 2000)}`;
  for (let i = 0; i < P.length; i += 9) {
    const ax = P[i + 3] - P[i],
      ay = P[i + 4] - P[i + 1],
      az = P[i + 5] - P[i + 2],
      bx = P[i + 6] - P[i],
      by = P[i + 7] - P[i + 1],
      bz = P[i + 8] - P[i + 2];
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    for (const j of [i, i + 3, i + 6]) {
      const k = key(j);
      const v = map.get(k);
      if (v) {
        v[0] += nx;
        v[1] += ny;
        v[2] += nz;
      } else map.set(k, [nx, ny, nz]);
    }
  }
  const N = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    const v = map.get(key(i))!;
    const l = Math.hypot(...v) || 1;
    N[i] = v[0] / l;
    N[i + 1] = v[1] / l;
    N[i + 2] = v[2] / l;
  }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
export const shade = (c: THREE.ColorRepresentation, k: number) => {
  const q = new THREE.Color(c);
  return k > 0 ? q.lerp(new THREE.Color('#ffffff'), k) : q.lerp(new THREE.Color('#000000'), -k);
};
export const mixc = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t);
