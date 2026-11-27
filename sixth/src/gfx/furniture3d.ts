/** Every catalogue item as geometry. Local frame: centre of the footprint at floor level, back at -z, front at +z. */
import * as THREE from 'three';
import { Kit, mixc, shade } from './kit.ts';
import { FURN } from '../data/furniture.ts';
export interface Screen {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ry: number;
  rx?: number;
}
export interface Ctx {
  c1: string;
  c2: string;
  c3: string;
  /** height of the wall behind a hanging item */
  wall: number;
  /** gaming stations: monitor tier, case tier, keyboard tier, chair tier, quality */
  gear?: { mon: number; rig: number; key: number; chair: number; q: number };
  /** plinths: holds a trophy */
  full?: number;
  lvl?: number;
  low?: boolean;
}
export interface Built {
  p: Float32Array;
  n: Float32Array;
  c: Float32Array;
  gp: Float32Array;
  gc: Float32Array;
  a: Float32Array;
  scr: Screen[];
}
const cache = new Map<string, Built>();
export const clearFurniture = () => cache.clear();
export function furniture(id: string, x: Ctx): Built {
  const g = x.gear;
  const key = [
    id,
    x.c1,
    x.c2,
    x.c3,
    x.wall,
    g ? [g.mon, g.rig, g.key, g.chair, Math.floor(g.q / 12)].join('.') : '',
    x.full ?? '',
    x.low ? 1 : 0,
    THREE.ColorManagement.enabled,
  ].join('|');
  let b = cache.get(key);
  if (b) return b;
  const k = new Kit();
  k.plain = !!x.low;
  const scr: Screen[] = [];
  draw(k, scr, id, x);
  b = {
    p: new Float32Array(k.p),
    n: new Float32Array(k.n),
    c: new Float32Array(k.c),
    gp: new Float32Array(k.gp),
    gc: new Float32Array(k.gc),
    a: new Float32Array(k.a),
    scr,
  };
  if (cache.size > 600) cache.clear();
  cache.set(key, b);
  return b;
}
const PI = Math.PI;
type C = THREE.ColorRepresentation;
const DARK = '#14181c',
  STEEL = '#a7afb5',
  WHITE = '#eef1f2',
  OAK = '#b58a58',
  WALNUT = '#6d4a30',
  BLACKWOOD = '#2b2622';
// ---------- shared parts
function star(k: Kit, col: C) {
  if (k.plain) {
    k.cyl(0, 0, 0, 0.26, 0.05, '#1d2125', { seg: 5 });
    k.cyl(0, 0.05, 0, 0.04, 0.34, '#30363c', { seg: 6 });
    return;
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3;
    k.push(0, 0, 0, -a);
    k.tube(
      [
        [0.02, 0.09, 0],
        [0.15, 0.085, 0],
        [0.29, 0.06, 0],
      ],
      0.02,
      col,
      { m: 'metal', seg: 6 },
    );
    k.cyl(0.29, 0.0, -0.012, 0.028, 0.024, '#111417', { rx: PI / 2, seg: 10, m: 'rubber' });
    k.pop();
  }
  k.bcyl(0, 0.07, 0, 0.04, 0.07, col, { m: 'metal' });
  k.bcyl(0, 0.12, 0, 0.026, 0.26, '#8d959b', { m: 'metal' });
}
function chair(k: Kit, x: number, z: number, ry: number, col: C, kind: 0 | 1 | 2) {
  k.push(x, 0, z, ry);
  if (kind === 2) {
    star(k, '#2a2f34');
    k.rbox(0, 0.36, 0.0, 0.4, 0.05, 0.38, '#1b1f23', { b: 0.02, m: 'rubber' });
    k.pillow(0, 0.395, 0.02, 0.5, 0.13, 0.5, '#1d2126', { m: 'leather', puff: 0.35 });
    for (const s of [-1, 1]) {
      k.pillow(s * 0.225, 0.43, 0.02, 0.12, 0.13, 0.46, col, { m: 'leather', puff: 0.5 });
      // arm rests
      k.tube(
        [
          [s * 0.25, 0.4, 0.02],
          [s * 0.31, 0.46, 0.03],
          [s * 0.31, 0.62, 0.03],
        ],
        0.018,
        '#2a2f34',
        { m: 'metal', seg: 6 },
      );
      k.rbox(s * 0.31, 0.62, 0.05, 0.075, 0.035, 0.24, '#181b1f', { b: 0.016, m: 'rubber' });
    }
    // winged back, leaning
    k.push(0, 0.5, -0.22);
    k.rbox(0, 0, 0, 0.42, 0.8, 0.09, '#1d2126', { rx: -0.14, b: 0.04, m: 'leather' });
    for (const s of [-1, 1]) {
      k.pillow(s * 0.205, 0.04, 0.03, 0.13, 0.34, 0.16, col, { rx: -0.14, m: 'leather', puff: 0.5 });
      k.pillow(s * 0.22, 0.44, -0.02, 0.14, 0.3, 0.15, col, { rx: -0.14, m: 'leather', puff: 0.5 });
    }
    k.rbox(0, 0.08, 0.05, 0.2, 0.56, 0.02, col, { rx: -0.14, b: 0.008, m: 'cloth' });
    k.pillow(0, 0.56, 0.0, 0.26, 0.13, 0.09, '#15181b', { rx: -0.14, m: 'leather' });
    k.pillow(0, 0.06, 0.08, 0.3, 0.16, 0.09, '#15181b', { rx: -0.1, m: 'leather' });
    k.pop();
  } else if (kind === 1) {
    star(k, '#b9c0c5');
    k.pillow(0, 0.39, 0.01, 0.48, 0.1, 0.46, '#2b3036', { m: 'cloth', puff: 0.35 });
    k.tube(
      [
        [0, 0.4, -0.2],
        [0, 0.44, -0.27],
        [0, 0.62, -0.27],
      ],
      0.022,
      '#b9c0c5',
      { m: 'metal', seg: 6 },
    );
    k.rbox(0, 0.52, -0.25, 0.43, 0.5, 0.035, '#22272c', { rx: -0.1, b: 0.018, m: 'cloth' });
    k.tube(
      [
        [-0.21, 0.53, -0.24],
        [-0.2, 0.8, -0.27],
        [-0.15, 1.0, -0.3],
        [0.15, 1.0, -0.3],
        [0.2, 0.8, -0.27],
        [0.21, 0.53, -0.24],
      ],
      0.014,
      '#3a4046',
      { m: 'metal' },
    );
    for (const s of [-1, 1]) {
      k.tube(
        [
          [s * 0.22, 0.4, 0],
          [s * 0.29, 0.44, 0],
          [s * 0.29, 0.6, 0.0],
        ],
        0.014,
        '#b9c0c5',
        { m: 'metal', seg: 6 },
      );
      k.rbox(s * 0.29, 0.6, 0.02, 0.06, 0.028, 0.22, '#1b1f23', { b: 0.013, m: 'rubber' });
    }
    void col;
  } else {
    for (const a of [-0.18, 0.18])
      for (const b of [-0.17, 0.18])
        k.tube(
          [
            [a * 1.12, 0, b * 1.12],
            [a, 0.42, b],
          ],
          0.016,
          '#4a3a2c',
          { m: 'wood', seg: 2, rad: 6 },
        );
    k.pillow(0, 0.4, 0.01, 0.45, 0.085, 0.44, col, { m: 'cloth', puff: 0.4 });
    for (const s of [-0.18, 0.18])
      k.tube(
        [
          [s, 0.42, -0.17],
          [s * 1.02, 0.68, -0.2],
          [s, 0.88, -0.24],
        ],
        0.016,
        '#4a3a2c',
        { m: 'wood', seg: 4, rad: 6 },
      );
    k.pillow(0, 0.62, -0.215, 0.43, 0.28, 0.07, col, { rx: -0.12, m: 'cloth', puff: 0.5 });
  }
  k.pop();
}
function monitor(k: Kit, scr: Screen[], x: number, y: number, z: number, w: number, ry = 0, foot = true) {
  const h = w * 0.58;
  k.push(x, y, z, ry);
  if (foot) {
    k.rbox(0, 0, 0.02, 0.24, 0.012, 0.18, '#22272c', { b: 0.006, m: 'metal' });
    k.tube(
      [
        [0, 0.01, -0.03],
        [0, 0.12, -0.045],
        [0, 0.22, -0.03],
      ],
      0.018,
      '#30363c',
      { m: 'metal', seg: 6 },
    );
  }
  k.rbox(0, 0.11, 0, w, h, 0.024, '#0d1013', { b: 0.011, m: 'gloss' });
  k.rbox(0, 0.17, -0.025, w * 0.6, h * 0.6, 0.035, '#1a1e22', { b: 0.016, m: 'rubber' });
  k.pop();
  const c = Math.cos(ry),
    s = Math.sin(ry);
  scr.push({ x: x + 0.0135 * s, y: y + 0.11 + h / 2 + 0.006, z: z + 0.0135 * c, w: w - 0.022, h: h - 0.032, ry });
}
function keys(k: Kit, x: number, y: number, z: number, lit: C | null) {
  if (k.plain) {
    k.box(x, y, z, 0.42, 0.03, 0.145, '#1b1f23');
    return;
  }
  k.rbox(x, y, z, 0.42, 0.022, 0.145, '#16191d', { b: 0.009, m: 'rubber' });
  if (lit) k.box(x, y + 0.021, z, 0.4, 0.002, 0.126, lit, { glow: true });
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < (k.plain ? 4 : 13); i++)
      if (!(r === 3 && i > 3 && i < 9))
        k.box(x - 0.186 + i * (k.plain ? 0.1 : 0.031), y + 0.022, z - 0.048 + r * 0.032, k.plain ? 0.08 : 0.026, 0.01, 0.026, '#24292e', {
          ao: 0,
          m: 'rubber',
        });
  k.box(x - 0.01, y + 0.022, z + 0.048, 0.15, 0.01, 0.026, '#24292e', { ao: 0, m: 'rubber' });
}
function mouse(k: Kit, x: number, y: number, z: number, c: C) {
  k.sph(x, y + 0.012, z, 0.034, '#1d2226', { sy: 0.55, sz: 1.7, seg: 12, m: 'rubber' });
  k.box(x, y + 0.028, z - 0.028, 0.006, 0.006, 0.02, c, { glow: true });
}
function mug(k: Kit, x: number, y: number, z: number, c: C) {
  if (k.plain) {
    k.cyl(x, y, z, 0.04, 0.09, c, { seg: 6 });
    return;
  }
  k.lathe(
    x,
    y,
    z,
    [
      [0, 0],
      [0.036, 0],
      [0.04, 0.01],
      [0.04, 0.09],
      [0.036, 0.09],
      [0.034, 0.015],
      [0, 0.012],
    ],
    c,
    { m: 'gloss', seg: 14 },
  );
  k.tor(x + 0.045, y + 0.048, z, 0.026, 0.007, c, { rx: PI / 2, m: 'gloss' });
}
function pcCase(k: Kit, x: number, y: number, z: number, c: C, lit: number) {
  k.rbox(x, y, z, 0.21, 0.45, 0.44, '#15191d', { b: 0.012, m: 'metal' });
  k.box(x - 0.107, y + 0.03, z + 0.01, 0.004, 0.38, 0.38, '#0b1216', { m: 'glass', ao: 0 });
  for (let i = 0; i < 3; i++) {
    k.tor(x, y + 0.085 + i * 0.135, z + 0.2215, 0.052, 0.007, lit ? c : '#2b3238', { rx: PI / 2, glow: lit > 0 });
    k.cyl(x, y + 0.085 + i * 0.135, z + 0.219, 0.046, 0.003, '#0e1114', { rx: PI / 2, seg: 14, m: 'rubber' });
  }
  if (lit > 1) k.box(x - 0.1, y + 0.1, z + 0.02, 0.01, 0.012, 0.26, c, { glow: true });
  for (const a of [-0.08, 0.08]) k.box(x + a, y - 0.012, z, 0.03, 0.012, 0.4, '#0e1114');
}
function headset(k: Kit, x: number, y: number, z: number, c: C) {
  if (k.plain) return;
  k.bcyl(x, y, z, 0.05, 0.012, '#22272c', { m: 'metal' });
  k.bcyl(x, y + 0.01, z, 0.009, 0.22, '#a7afb5', { m: 'metal' });
  k.tube(
    [
      [x - 0.08, y + 0.13, z],
      [x - 0.075, y + 0.22, z],
      [x, y + 0.262, z],
      [x + 0.075, y + 0.22, z],
      [x + 0.08, y + 0.13, z],
    ],
    0.011,
    '#191d21',
    { m: 'leather', seg: 12 },
  );
  for (const s of [-1, 1]) {
    k.cyl(x + s * 0.075, y + 0.085, z - 0.0, 0.042, 0.035, '#191d21', { rz: PI / 2, seg: 14, m: 'leather' });
    k.cyl(x + s * 0.094, y + 0.098, z, 0.026, 0.006, c, { rz: PI / 2, seg: 14 });
  }
}
function desk(k: Kit, w: number, d: number, z: number, top: C, leg: C) {
  k.rbox(0, 0.715, z, w, 0.036, d, top, { b: 0.014 });
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.13);
    k.rbox(x, 0, z, 0.07, 0.025, d * 0.84, leg, { b: 0.01, m: 'metal' });
    k.rbox(x, 0.02, z - 0.05, 0.075, 0.68, 0.055, leg, { b: 0.012, m: 'metal' });
    k.rbox(x, 0.69, z, 0.06, 0.028, d * 0.8, leg, { b: 0.008, m: 'metal' });
  }
  k.rbox(0, 0.55, z - d * 0.36, w * 0.6, 0.12, 0.1, '#1a1e22', { b: 0.015, m: 'metal' });
}
function broad(k: Kit, x: number, z: number, s: number, n = 11, col = ['#3f7a3d', '#4f8d47', '#2f6535']) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996,
      t = i / n;
    k.leaf(x, 0.3 * s + t * 0.18 * s, z, (0.4 - t * 0.12) * s, 0.15 * s, a, 1.25 - t * 0.5 + (i % 3) * 0.1, 1.6, col[i % col.length]);
  }
}
function pot(k: Kit, x: number, z: number, s: number, c: C = '#e4ded2') {
  k.lathe(
    x,
    0,
    z,
    [
      [0, 0],
      [0.12, 0],
      [0.135, 0.02],
      [0.17, 0.27],
      [0.18, 0.3],
      [0.165, 0.3],
      [0.15, 0.26],
      [0, 0.26],
    ],
    c,
    { s, m: 'stone', seg: 20 },
  );
  k.cyl(x, 0.25 * s, z, 0.15 * s, 0.012, '#3b2a1e', { seg: 12, m: 'stone' });
}
function cup(k: Kit, x: number, y: number, z: number, s: number, silver = false) {
  const a = silver ? '#cfd6da' : '#e0b64f';
  k.lathe(
    x,
    y,
    z,
    [
      [0, 0],
      [0.1, 0],
      [0.1, 0.05],
      [0.06, 0.065],
    ],
    '#241e1a',
    { s, m: 'gloss', seg: 20 },
  );
  k.lathe(
    x,
    y,
    z,
    [
      [0.05, 0.06],
      [0.055, 0.075],
      [0.018, 0.11],
      [0.016, 0.16],
      [0.03, 0.185],
      [0.07, 0.22],
      [0.115, 0.3],
      [0.135, 0.4],
      [0.14, 0.42],
      [0.13, 0.42],
      [0.11, 0.31],
      [0.05, 0.23],
      [0, 0.215],
    ],
    a,
    { s, m: 'metal', seg: 24 },
  );
  for (const d of [-1, 1])
    k.tube(
      [
        [x + d * 0.125 * s, y + 0.38 * s, z],
        [x + d * 0.21 * s, y + 0.37 * s, z],
        [x + d * 0.2 * s, y + 0.28 * s, z],
        [x + d * 0.09 * s, y + 0.255 * s, z],
      ],
      0.011 * s,
      a,
      { m: 'metal', seg: 12 },
    );
}
function faucet(k: Kit, x: number, y: number, z: number) {
  k.bcyl(x, y, z, 0.024, 0.03, '#c9d0d4', { m: 'metal' });
  k.tube(
    [
      [x, y + 0.02, z],
      [x, y + 0.24, z],
      [x, y + 0.29, z + 0.07],
      [x, y + 0.24, z + 0.15],
    ],
    0.013,
    '#c9d0d4',
    { m: 'metal' },
  );
}
function dumbbell(k: Kit, x: number, y: number, z: number, r: number, c: C, along: 'x' | 'z' = 'z') {
  const o = along === 'z' ? { rx: PI / 2 } : { rz: PI / 2 };
  k.cyl(x, y - 0.09, z, 0.014, 0.18, '#b9c0c5', { ...o, seg: 8, m: 'metal' });
  for (const s of [-1, 1])
    k.cyl(along === 'z' ? x : x + s * 0.1, y - 0.035, along === 'z' ? z + s * 0.1 : z, r, 0.07, c, { ...o, seg: 6, m: 'rubber' });
}
function bowl(k: Kit, x: number, y: number, z: number) {
  if (k.plain) {
    k.sph(x, y + 0.06, z, 0.14, '#d8a02f', { sy: 0.5, seg: 6 });
    return;
  }
  k.lathe(
    x,
    y,
    z,
    [
      [0, 0],
      [0.07, 0],
      [0.13, 0.05],
      [0.16, 0.1],
      [0.15, 0.1],
      [0.12, 0.055],
      [0, 0.02],
    ],
    WHITE,
    { m: 'gloss', seg: 20 },
  );
  for (const [a, b, c] of [
    [-0.05, 0.02, '#d8a02f'],
    [0.05, 0.03, '#c5432f'],
    [0, -0.05, '#7fa63f'],
    [0.01, 0.04, '#d98a2b'],
  ] as [number, number, string][])
    k.sph(x + a, y + 0.095, z + b, 0.048, c, { seg: 10, m: 'gloss' });
}
function draw(k: Kit, scr: Screen[], id: string, X: Ctx) {
  const { c1, c2, c3 } = X;
  const f = FURN[id];
  const W = f.w / 2,
    D = f.d / 2;
  const bk = -D / 2;
  const wz = bk + 0.06;
  const H = X.wall;
  const hang = (h: number, y: number): [number, number] => {
    const hh = Math.min(h, H - 0.2);
    return [Math.max(0.1, Math.min(y, H - 0.12 - hh)), hh];
  };
  const soft = mixc(c1, '#2c3238', 0.5);
  switch (id) {
    // ---------- practice
    case 'station': {
      const g = X.gear ?? { mon: 1, rig: 0, key: 1, chair: 1, q: 45 };
      const z = -0.24,
        hi = (X.lvl ?? 1) >= 2;
      desk(k, 1.42, 0.78, z, hi ? '#23282d' : OAK, '#1b1f23');
      k.rbox(0.02, 0.752, z + 0.14, 0.86, 0.004, 0.4, mixc(c1, '#101417', 0.72), { b: 0.002, m: 'cloth' });
      monitor(k, scr, -0.1, 0.751, z - 0.2, 0.56 + g.mon * 0.05);
      if (g.mon >= 3) monitor(k, scr, -0.66, 0.751, z - 0.1, 0.42, 0.7);
      keys(k, -0.16, 0.754, z + 0.14, g.key > 1 ? c1 : null);
      mouse(k, 0.22, 0.756, z + 0.16, c1);
      headset(k, 0.52, 0.751, z + 0.2, c1);
      mug(k, -0.58, 0.751, z + 0.22, c2);
      if (g.rig === 1) {
        k.rbox(0.46, 0.751, z - 0.2, 0.3, 0.07, 0.26, '#f0f2f4', { b: 0.03, m: 'gloss' });
        k.box(0.46, 0.79, z - 0.069, 0.2, 0.01, 0.004, c1, { glow: true });
      } else pcCase(k, 0.5, 0.751, z - 0.12, g.q > 60 ? c1 : g.q > 35 ? shade(c1, -0.35) : '#2b3238', g.q > 60 ? 2 : g.q > 35 ? 1 : 0);
      k.tube(
        [
          [-0.1, 0.76, z - 0.3],
          [0.1, 0.68, z - 0.36],
          [0.36, 0.7, z - 0.34],
          [0.48, 0.8, z - 0.34],
        ],
        0.006,
        '#0e1114',
        { m: 'rubber' },
      );
      chair(k, -0.1, 0.48, PI, c1, g.chair > 2 ? 2 : g.chair > 0 ? 2 : 0);
      break;
    }
    case 'coachdesk':
    case 'officedesk': {
      const coach = id === 'coachdesk';
      const z = -0.25;
      desk(k, 1.66, 0.78, z, coach ? '#23282d' : '#c9a777', coach ? '#1b1f23' : '#d9dcde');
      if (coach) {
        monitor(k, scr, -0.34, 0.751, z - 0.2, 0.6, 0.16);
        monitor(k, scr, 0.34, 0.751, z - 0.2, 0.6, -0.16);
      } else monitor(k, scr, 0.05, 0.751, z - 0.2, 0.62);
      keys(k, 0, 0.751, z + 0.13, null);
      mouse(k, 0.3, 0.753, z + 0.14, c1);
      k.rbox(-0.56, 0.751, z + 0.08, 0.22, 0.02, 0.3, '#f4f2ec', { ry: 0.2, b: 0.004 });
      k.rbox(-0.55, 0.771, z + 0.07, 0.2, 0.015, 0.28, '#2f6d92', { ry: -0.12, b: 0.004 });
      mug(k, 0.6, 0.751, z + 0.2, coach ? c1 : WHITE);
      if (!coach) {
        k.rbox(-0.62, 0.02, z - 0.02, 0.38, 0.6, 0.52, '#e3e5e6', { b: 0.015, m: 'metal' });
        for (let i = 0; i < 3; i++) k.rbox(-0.62, 0.07 + i * 0.19, z + 0.243, 0.34, 0.16, 0.012, '#f0f2f2', { b: 0.005, m: 'metal' });
        k.bcyl(0.66, 0.751, z - 0.24, 0.06, 0.015, '#22272c', { m: 'metal' });
        k.tube(
          [
            [0.66, 0.76, z - 0.24],
            [0.72, 0.98, z - 0.24],
            [0.58, 1.15, z - 0.18],
          ],
          0.01,
          '#22272c',
          { m: 'metal' },
        );
        k.cone(0.54, 1.08, z - 0.16, 0.08, 0.1, '#22272c', { seg: 14, m: 'metal' });
      }
      chair(k, 0, 0.5, PI, coach ? c1 : '#3a4046', 1);
      break;
    }
    case 'wallscreen': {
      const [y, h] = hang(1.4, 0.72);
      k.rbox(0, y, wz + 0.035, 2.92, h, 0.05, '#0b0e11', { b: 0.014, m: 'gloss' });
      scr.push({ x: 0, y: y + h / 2, z: wz + 0.063, w: 2.86, h: h - 0.06, ry: 0 });
      break;
    }
    case 'acoustic': {
      const [y, h] = hang(1.05, 0.9);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < (h > 0.8 ? 2 : 1); j++) {
          const hh = h > 0.8 ? h / 2 - 0.02 : h;
          k.pillow(-0.72 + i * 0.48, y + j * (hh + 0.03), wz + 0.05, 0.45, hh, 0.12, (i + j) % 2 ? c1 : mixc(c1, '#12171b', 0.6), {
            m: 'cloth',
            puff: 0.55,
          });
        }
      break;
    }
    case 'ledstrip': {
      const [y] = hang(0.08, 2.1);
      k.box(0, y, wz + 0.02, 2.9, 0.03, 0.03, c1, { glow: true });
      k.rbox(0, y - 0.02, wz + 0.012, 2.94, 0.02, 0.05, '#20262b', { b: 0.006, m: 'metal' });
      break;
    }
    case 'cooler':
      k.rbox(0, 0, 0, 0.36, 0.98, 0.36, '#eceff0', { b: 0.03 });
      k.rbox(0, 0.6, 0.17, 0.24, 0.24, 0.04, '#2f3a42', { b: 0.015, m: 'rubber' });
      for (const s of [-0.05, 0.05]) k.cyl(s, 0.72, 0.2, 0.016, 0.05, s < 0 ? '#4a9fd8' : '#d85a4a', { seg: 10 });
      k.lathe(
        0,
        0.97,
        0,
        [
          [0.05, 0],
          [0.07, 0.03],
          [0.14, 0.06],
          [0.15, 0.12],
          [0.14, 0.15],
          [0.15, 0.18],
          [0.15, 0.3],
          [0.12, 0.36],
          [0, 0.37],
        ],
        '#8ecbe6',
        { m: 'glass', seg: 20 },
      );
      break;
    case 'minifridge':
    case 'vending': {
      const big = id === 'vending';
      const hh = big ? 1.85 : 1.4;
      k.rbox(0, 0, -0.06, 0.82, hh, 0.7, big ? c1 : '#1b232a', { b: 0.03, m: 'metal' });
      k.box(big ? -0.08 : 0, 0.22, 0.292, big ? 0.54 : 0.68, hh - 0.42, 0.006, '#bfe9f5', { glow: true });
      for (let j = 0; j < (big ? 6 : 4); j++)
        for (let i = 0; i < (big ? 5 : 6); i++) {
          const x = (big ? -0.3 : -0.28) + i * 0.11;
          k.cyl(x, 0.26 + j * 0.24, 0.3, 0.036, 0.15, [c1, c2, '#c5432f', '#e8c35a', '#eef1f2', '#4a7fb5'][(i * 2 + j) % 6], {
            seg: 10,
            m: 'gloss',
          });
        }
      for (let j = 0; j < (big ? 6 : 4); j++)
        k.box(big ? -0.08 : 0, 0.245 + j * 0.24, 0.31, big ? 0.54 : 0.68, 0.012, 0.04, '#d0d6d9', { m: 'metal' });
      k.box(big ? -0.08 : 0, 0.21, 0.335, big ? 0.56 : 0.7, hh - 0.4, 0.004, '#24424d', { m: 'glass', ao: 0 });
      if (big) {
        k.rbox(0.29, 1.0, 0.295, 0.15, 0.42, 0.02, '#14181c', { b: 0.008, m: 'gloss' });
        k.box(0.29, 1.3, 0.307, 0.1, 0.06, 0.004, '#7affea', { glow: true });
        k.rbox(-0.08, 0.06, 0.295, 0.5, 0.12, 0.02, '#101417', { b: 0.01 });
      } else
        k.tube(
          [
            [0.36, 0.5, 0.33],
            [0.38, 0.7, 0.36],
            [0.36, 0.95, 0.33],
          ],
          0.012,
          '#c9d0d4',
          { m: 'metal' },
        );
      break;
    }
    // ---------- work
    case 'meet6':
      k.rbox(0, 0.7, 0, 3.3, 0.045, 1.5, '#c8ab80', { b: 0.02, m: 'wood', seg: 2 });
      for (const s of [-1, 1]) {
        k.lathe(
          s * 0.95,
          0,
          0,
          [
            [0, 0],
            [0.34, 0],
            [0.34, 0.02],
            [0.1, 0.05],
            [0.07, 0.1],
            [0.07, 0.62],
            [0.16, 0.7],
          ],
          '#23282d',
          { m: 'metal', seg: 24 },
        );
      }
      k.rbox(0, 0.744, 0, 0.9, 0.006, 0.16, '#14181c', { b: 0.003, m: 'metal' });
      k.rbox(-0.6, 0.745, 0.4, 0.32, 0.014, 0.22, '#22272c', { ry: 0.2, b: 0.006, m: 'metal' });
      k.rbox(-0.64, 0.755, 0.3, 0.32, 0.2, 0.01, '#22272c', { ry: 0.2, rx: -0.25, b: 0.004, m: 'metal' });
      k.rbox(0.75, 0.745, -0.42, 0.3, 0.006, 0.22, '#f4f2ec', { ry: -0.3, b: 0.002 });
      k.rbox(0.2, 0.745, 0.45, 0.24, 0.01, 0.18, c1, { ry: 0.1, b: 0.004 });
      mug(k, 1.2, 0.745, 0.35, WHITE);
      mug(k, -1.1, 0.745, -0.3, c2);
      k.lathe(
        0,
        0.748,
        0,
        [
          [0, 0],
          [0.06, 0],
          [0.07, 0.1],
          [0.045, 0.2],
          [0.05, 0.24],
          [0, 0.24],
        ],
        '#a9d2e6',
        { m: 'glass' },
      );
      for (const i of [-1, 0, 1]) {
        chair(k, i, 1.24, PI, c1, 1);
        chair(k, i, -1.24, 0, c1, 1);
      }
      chair(k, -2.02, 0, PI / 2, c1, 1);
      chair(k, 2.02, 0, -PI / 2, c1, 1);
      break;
    case 'whiteboard': {
      const [y, h] = hang(1.0, 0.95);
      k.rbox(0, y, wz + 0.02, 1.92, h, 0.03, '#b4bcc0', { b: 0.01, m: 'metal' });
      k.box(0, y + 0.03, wz + 0.038, 1.84, h - 0.06, 0.004, '#f8fafa', { ao: 0, m: 'gloss' });
      const ink = ['#2f6d92', '#c5432f', '#23282d', '#2f8f5a'];
      for (let i = 0; i < 9; i++)
        k.box(
          -0.62 + (i % 3) * 0.62 + Math.sin(i * 3) * 0.05,
          y + h * (0.78 - Math.floor(i / 3) * 0.24),
          wz + 0.042,
          0.3 + ((i * 7) % 4) * 0.05,
          0.014,
          0.003,
          ink[i % 4],
          { ao: 0 },
        );
      k.tor(0.62, y + h * 0.34, wz + 0.042, 0.1, 0.008, '#c5432f', { rx: PI / 2 });
      k.tube(
        [
          [-0.5, y + h * 0.25, wz + 0.044],
          [-0.1, y + h * 0.42, wz + 0.044],
          [0.35, y + h * 0.3, wz + 0.044],
        ],
        0.007,
        '#2f6d92',
      );
      k.rbox(0, y - 0.02, wz + 0.06, 1.0, 0.02, 0.07, '#9aa3a6', { b: 0.006, m: 'metal' });
      for (let i = 0; i < 4; i++) k.cyl(-0.2 + i * 0.12, y, wz + 0.06, 0.009, 0.1, ink[i], { rz: PI / 2, seg: 8 });
      break;
    }
    case 'filing':
      k.rbox(0, 0, 0, 0.86, 1.15, 0.44, '#c6ccce', { b: 0.012, m: 'metal' });
      for (let j = 0; j < 3; j++) {
        k.rbox(0, 0.04 + j * 0.365, 0.218, 0.8, 0.34, 0.018, '#d4d9da', { b: 0.006, m: 'metal' });
        k.tube(
          [
            [-0.1, 0.24 + j * 0.365, 0.23],
            [-0.08, 0.24 + j * 0.365, 0.26],
            [0.08, 0.24 + j * 0.365, 0.26],
            [0.1, 0.24 + j * 0.365, 0.23],
          ],
          0.008,
          '#8d959b',
          { m: 'metal' },
        );
        k.box(0, 0.3 + j * 0.365, 0.23, 0.16, 0.05, 0.003, WHITE, { ao: 0 });
      }
      k.rbox(-0.2, 1.15, 0, 0.3, 0.06, 0.22, '#2f6d92', { b: 0.008 });
      pot(k, 0.25, 0.02, 0.5);
      break;
    case 'bookcase': {
      const fr = '#8a6340';
      for (const s of [-1, 1]) k.rbox(s * 0.93, 0, -0.02, 0.035, 1.75, 0.38, fr, { b: 0.008, m: 'wood' });
      k.box(0, 0, -0.2, 1.86, 1.74, 0.012, '#6b4a2e', { m: 'wood' });
      const cols = ['#a03a32', '#2f5f82', '#c9962f', '#3f6a44', '#74517f', '#ded4bd', '#23282d', '#b5673a'];
      for (let j = 0; j < 5; j++) {
        k.rbox(0, 0.04 + j * 0.42, -0.02, 1.86, 0.028, 0.37, fr, { b: 0.006, m: 'wood' });
        if (j === 4) break;
        let x = -0.88,
          n = j * 7;
        if (k.plain) {
          k.box(0, 0.07 + j * 0.42, -0.04, 1.7, 0.25, 0.2, cols[j % cols.length]);
          continue;
        }
        while (x < 0.86) {
          const w = 0.026 + ((n * 37) % 5) * 0.008,
            h = 0.2 + ((n * 53) % 6) * 0.022;
          if ((n * 29) % 13 === 3) {
            x += 0.16;
            n++;
            continue;
          }
          k.rbox(x + w / 2, 0.07 + j * 0.42, -0.04, w - 0.003, h, 0.22, cols[(n * 5) % cols.length], {
            b: 0.005,
            rz: (n * 29) % 17 === 5 ? 0.16 : 0,
          });
          x += w;
          n++;
        }
      }
      mug(k, 0.5, 1.75, 0, c1);
      break;
    }
    case 'workbench':
      k.rbox(0, 0.84, -0.08, 2.9, 0.055, 0.76, '#a8814f', { b: 0.012, m: 'wood' });
      for (const s of [-1, 1]) for (const q of [-0.38, 0.2]) k.rbox(s * 1.36, 0, q, 0.06, 0.84, 0.06, '#3f464c', { b: 0.01, m: 'metal' });
      k.rbox(0, 0.16, -0.1, 2.7, 0.03, 0.6, '#7d858a', { b: 0.008, m: 'metal' });
      k.rbox(-0.9, 0.19, -0.1, 0.5, 0.3, 0.4, '#b5673a', { b: 0.02 });
      k.rbox(0.5, 0.19, -0.1, 0.7, 0.22, 0.44, '#2f3a42', { b: 0.02, m: 'metal' });
      k.rbox(-0.8, 0.895, -0.08, 0.5, 0.008, 0.4, '#1f5f4a', { b: 0.003, m: 'rubber' });
      k.rbox(-0.8, 0.903, -0.08, 0.3, 0.01, 0.3, '#14563a', { b: 0.003 });
      for (let i = 0; i < 8; i++)
        k.box(-0.9 + (i % 4) * 0.07, 0.913, -0.16 + Math.floor(i / 4) * 0.14, 0.04, 0.012, 0.04, i % 3 ? '#16191d' : '#c9a24a', { ao: 0 });
      pcCase(k, 0.35, 0.895, -0.14, '#2b3238', 0);
      k.push(0.9, 0.895, -0.05);
      k.rbox(0, 0, 0, 0.2, 0.05, 0.12, '#8a2f28', { b: 0.01, m: 'metal' });
      k.tube(
        [
          [0, 0.05, 0],
          [0.02, 0.2, 0],
          [-0.14, 0.3, 0.05],
        ],
        0.012,
        STEEL,
        { m: 'metal' },
      );
      k.pop();
      k.rbox(0, 1.0, bk + 0.035, 2.7, 0.75, 0.025, '#8d6a44', { b: 0.005, m: 'wood' });
      for (let i = 0; i < 11; i++) {
        const x = -1.2 + i * 0.24;
        k.rbox(x, 1.2, bk + 0.06, 0.03, 0.16, 0.02, ['#b8392f', '#d8a02f', '#23282d'][i % 3], { b: 0.008, m: 'rubber' });
        k.rbox(x, 1.35, bk + 0.06, 0.016, 0.18, 0.012, STEEL, { b: 0.004, m: 'metal' });
        if (i % 3 === 0) k.tor(x, 1.56, bk + 0.06, 0.03, 0.009, STEEL, { rx: PI / 2, m: 'metal' });
      }
      break;
    case 'rack':
      k.rbox(0, 0, 0, 0.72, 1.92, 0.92, '#14181c', { b: 0.012, m: 'metal' });
      for (let i = 0; i < 11; i++) {
        const y = 0.12 + i * 0.155;
        k.rbox(0, y, 0.445, 0.6, 0.135, 0.025, i % 4 === 3 ? '#2c343b' : '#1e242a', { b: 0.005, m: 'metal' });
        for (let q = 0; q < 5; q++)
          k.box(-0.24 + q * 0.035, y + 0.06, 0.461, 0.016, 0.012, 0.004, (q + i) % 4 ? '#5affa0' : '#ffb23e', { glow: true });
        for (let q = 0; q < 6; q++) k.box(0.02 + q * 0.045, y + 0.03, 0.459, 0.032, 0.075, 0.003, '#0c0f12', { ao: 0 });
      }
      k.box(0, 0.06, 0.468, 0.68, 1.8, 0.004, '#1c2c33', { m: 'glass', ao: 0 });
      break;
    case 'shelves':
      for (const a of [-1, 1])
        for (const b of [-1, 1]) k.rbox(a * 0.92, 0, b * 0.19, 0.035, 1.65, 0.035, '#59636b', { b: 0.006, m: 'metal' });
      for (let j = 0; j < 4; j++) {
        k.rbox(0, 0.14 + j * 0.48, 0, 1.88, 0.025, 0.42, '#8d959b', { b: 0.006, m: 'metal' });
        for (let i = 0; i < 4; i++)
          if ((i + j * 3) % 5 !== 0) {
            const h = 0.18 + ((i + j) % 3) * 0.06;
            k.rbox(-0.66 + i * 0.44, 0.165 + j * 0.48, 0, 0.34, h, 0.3, ['#b3895a', '#a67a4c', c1, '#3a4a54'][(i + j) % 4], {
              b: 0.012,
              ry: Math.sin(i * 5 + j) * 0.08,
              m: 'paint',
            });
            k.box(-0.66 + i * 0.44, 0.165 + j * 0.48 + h * 0.4, 0.152, 0.12, 0.06, 0.003, WHITE, { ao: 0 });
          }
      }
      break;
    case 'crates':
      for (const [x, y, z, w, h, r, c] of [
        [-0.2, 0, 0.1, 0.5, 0.4, 0.15, '#b98f5c'],
        [0.25, 0, -0.2, 0.4, 0.34, -0.2, '#a97f4f'],
        [-0.12, 0.4, 0.06, 0.36, 0.28, 0.5, '#c29a68'],
      ] as [number, number, number, number, number, number, string][]) {
        k.rbox(x, y, z, w, h, w * 0.95, c, { b: 0.01, ry: r, m: 'paint' });
        k.rbox(x, y + h - 0.005, z, 0.06, 0.008, w * 0.96, '#d9c29a', { ry: r, b: 0.002 });
      }
      break;
    case 'printer':
      k.rbox(0, 0, 0, 0.6, 0.55, 0.56, '#d5dadc', { b: 0.02 });
      for (let i = 0; i < 2; i++) k.rbox(0, 0.06 + i * 0.23, 0.275, 0.54, 0.2, 0.02, '#e6eaeb', { b: 0.008 });
      k.rbox(0, 0.55, -0.02, 0.66, 0.34, 0.54, '#eef1f2', { b: 0.05 });
      k.rbox(0, 0.87, -0.04, 0.6, 0.05, 0.48, '#3a4248', { b: 0.02, m: 'gloss' });
      k.rbox(0, 0.68, 0.24, 0.44, 0.02, 0.2, '#dfe4e5', { b: 0.006 });
      k.box(0, 0.7, 0.27, 0.3, 0.006, 0.2, '#ffffff', { ao: 0, rx: 0.06 });
      k.box(0.22, 0.84, 0.255, 0.12, 0.06, 0.005, '#5ac8ff', { glow: true, rx: -0.4 });
      break;
    // ---------- kitchen
    case 'counter':
    case 'sinkc':
    case 'stove': {
      const st = id === 'stove';
      k.rbox(0, 0.08, -0.13, 0.985, 0.8, 0.68, st ? '#b4bcc1' : '#e9ebe8', { b: 0.008, m: st ? 'metal' : 'paint' });
      k.box(0, 0, -0.16, 0.95, 0.08, 0.6, '#23282d');
      k.rbox(0, 0.88, -0.11, 1.0, 0.04, 0.76, st ? '#1b1f23' : '#4a4f52', { b: 0.01, m: st ? 'gloss' : 'stone' });
      if (!st) {
        for (const s of [-1, 1]) {
          k.rbox(s * 0.245, 0.12, 0.216, 0.475, 0.72, 0.018, '#f3f4f1', { b: 0.008 });
          k.rbox(s * 0.06, 0.62, 0.236, 0.012, 0.16, 0.018, '#3a4046', { b: 0.005, m: 'metal' });
        }
        for (const y of [0.12]) void y;
      }
      if (id === 'counter') {
        k.rbox(-0.2, 0.92, -0.15, 0.34, 0.022, 0.24, '#b58a58', { b: 0.008, m: 'wood' });
        k.tube(
          [
            [-0.3, 0.95, -0.1],
            [-0.12, 0.95, -0.2],
          ],
          0.012,
          '#c9d0d4',
          { m: 'metal' },
        );
        k.lathe(
          0.28,
          0.92,
          -0.24,
          [
            [0, 0],
            [0.055, 0],
            [0.06, 0.01],
            [0.06, 0.15],
            [0.05, 0.17],
            [0, 0.17],
          ],
          '#c46a4a',
          { m: 'gloss' },
        );
        for (let i = 0; i < 4; i++)
          k.tube(
            [
              [0.28, 1.06, -0.24],
              [0.25 + i * 0.025, 1.22, -0.27 + (i % 2) * 0.05],
            ],
            0.007,
            ['#b58a58', '#c9d0d4', '#23282d', '#b58a58'][i],
          );
        k.rbox(0.1, 0.92, 0.08, 0.14, 0.07, 0.1, '#d8a05a', { b: 0.03 });
      } else if (id === 'sinkc') {
        k.rbox(0, 0.916, -0.1, 0.62, 0.01, 0.46, '#c9d0d4', { b: 0.004, m: 'metal' });
        k.rbox(0, 0.921, -0.09, 0.52, 0.004, 0.36, '#59636a', { b: 0.002, m: 'metal' });
        k.rbox(0, 0.923, -0.09, 0.46, 0.003, 0.3, '#3c444a', { b: 0.001, m: 'metal' });
        faucet(k, 0, 0.92, -0.36);
        k.lathe(
          0.38,
          0.92,
          -0.32,
          [
            [0, 0],
            [0.03, 0],
            [0.032, 0.12],
            [0.012, 0.15],
            [0.012, 0.18],
            [0, 0.18],
          ],
          '#6fb26a',
          { m: 'glass' },
        );
      } else {
        for (const x of [-0.23, 0.23])
          for (const z of [-0.3, 0.06]) {
            k.tor(x, 0.924, z, 0.11, 0.006, x > 0 ? '#ff5a32' : '#4a2a22', { glow: x > 0 });
            k.tor(x, 0.924, z, 0.06, 0.006, x > 0 ? '#ff5a32' : '#4a2a22', { glow: x > 0 });
          }
        k.lathe(
          0.23,
          0.925,
          -0.3,
          [
            [0, 0],
            [0.12, 0],
            [0.125, 0.01],
            [0.125, 0.14],
            [0.118, 0.14],
            [0.115, 0.02],
            [0, 0.015],
          ],
          '#b9c0c5',
          { m: 'metal', seg: 24 },
        );
        k.tube(
          [
            [0.35, 1.03, -0.3],
            [0.43, 1.04, -0.22],
            [0.46, 1.04, -0.14],
          ],
          0.012,
          '#14181c',
          { m: 'rubber' },
        );
        k.rbox(0, 0.16, 0.216, 0.84, 0.5, 0.024, '#14181c', { b: 0.012, m: 'gloss' });
        k.tube(
          [
            [-0.34, 0.7, 0.235],
            [-0.32, 0.7, 0.27],
            [0.32, 0.7, 0.27],
            [0.34, 0.7, 0.235],
          ],
          0.013,
          '#dfe4e7',
          { m: 'metal' },
        );
        for (let i = 0; i < 5; i++) k.cyl(-0.3 + i * 0.15, 0.77, 0.225, 0.024, 0.03, '#2a2f34', { rx: PI / 2, seg: 14, m: 'metal' });
      }
      break;
    }
    case 'prostove':
      k.rbox(0, 0.08, -0.11, 1.97, 0.8, 0.74, '#b4bcc1', { b: 0.012, m: 'metal' });
      k.box(0, 0, -0.14, 1.9, 0.08, 0.64, '#1b1f23');
      k.rbox(0, 0.88, -0.09, 1.99, 0.035, 0.8, '#8d959b', { b: 0.01, m: 'metal' });
      for (let i = 0; i < 4; i++)
        for (const z of [-0.3, 0.08]) {
          const x = -0.72 + i * 0.48;
          k.rbox(x, 0.912, z, 0.38, 0.014, 0.32, '#14181c', { b: 0.005, m: 'metal' });
          for (let q = 0; q < 4; q++)
            k.box(
              x + Math.cos((q * PI) / 2) * 0.08,
              0.925,
              z + Math.sin((q * PI) / 2) * 0.08,
              q % 2 ? 0.02 : 0.12,
              0.016,
              q % 2 ? 0.12 : 0.02,
              '#1b1f23',
              { m: 'metal' },
            );
          if ((i + (z > 0 ? 1 : 0)) % 2 === 0) k.tor(x, 0.924, z, 0.06, 0.007, '#6fb7ff', { glow: true });
        }
      k.lathe(
        -0.72,
        0.94,
        -0.3,
        [
          [0, 0],
          [0.14, 0],
          [0.145, 0.01],
          [0.145, 0.22],
          [0.138, 0.22],
          [0, 0.2],
        ],
        '#c9762f',
        { m: 'metal', seg: 24 },
      );
      k.lathe(
        0.24,
        0.94,
        0.08,
        [
          [0, 0],
          [0.14, 0],
          [0.17, 0.05],
          [0.165, 0.05],
          [0.13, 0.01],
          [0, 0.01],
        ],
        '#23282d',
        { m: 'metal', seg: 24 },
      );
      for (const x of [-0.5, 0.5]) {
        k.rbox(x, 0.14, 0.268, 0.86, 0.52, 0.024, '#9aa3a9', { b: 0.01, m: 'metal' });
        k.rbox(x, 0.26, 0.282, 0.62, 0.24, 0.008, '#2a1a10', { b: 0.004, m: 'gloss' });
        k.box(x, 0.3, 0.288, 0.5, 0.1, 0.003, '#ff8a3a', { glow: true });
        k.tube(
          [
            [x - 0.34, 0.72, 0.285],
            [x - 0.32, 0.72, 0.32],
            [x + 0.32, 0.72, 0.32],
            [x + 0.34, 0.72, 0.285],
          ],
          0.014,
          '#e6ebee',
          { m: 'metal' },
        );
      }
      for (let i = 0; i < 10; i++) k.cyl(-0.82 + i * 0.182, 0.79, 0.285, 0.026, 0.03, '#14181c', { rx: PI / 2, seg: 14, m: 'metal' });
      k.ext(
        0,
        1.55,
        -0.3,
        [
          [-0.78, 0],
          [0.78, 0],
          [0.5, 0.32],
          [-0.5, 0.32],
        ],
        0.4,
        '#b4bcc1',
        { m: 'metal', b: 0.01 },
      );
      k.rbox(0, 1.86, -0.36, 0.44, 0.5, 0.26, '#a7afb5', { b: 0.01, m: 'metal' });
      break;
    case 'fridge':
      k.rbox(0, 0.03, -0.08, 0.86, 1.86, 0.74, '#b9c0c5', { b: 0.03, m: 'metal' });
      k.rbox(0, 0.06, 0.29, 0.85, 0.68, 0.03, '#c6ccd0', { b: 0.014, m: 'metal' });
      k.rbox(0, 0.76, 0.29, 0.85, 1.1, 0.03, '#c6ccd0', { b: 0.014, m: 'metal' });
      k.tube(
        [
          [-0.36, 0.86, 0.31],
          [-0.35, 0.9, 0.36],
          [-0.35, 1.36, 0.36],
          [-0.36, 1.4, 0.31],
        ],
        0.013,
        '#7d858a',
        { m: 'metal' },
      );
      k.tube(
        [
          [-0.36, 0.3, 0.31],
          [-0.35, 0.33, 0.36],
          [-0.35, 0.64, 0.36],
          [-0.36, 0.67, 0.31],
        ],
        0.013,
        '#7d858a',
        { m: 'metal' },
      );
      k.box(0.14, 1.42, 0.308, 0.12, 0.15, 0.003, '#ffe08a', { ao: 0, rz: 0.06 });
      k.box(0.29, 1.5, 0.308, 0.1, 0.13, 0.003, '#f4f2ec', { ao: 0, rz: -0.08 });
      k.cyl(0.29, 1.6, 0.31, 0.015, 0.012, c1, { rx: PI / 2, seg: 10 });
      break;
    case 'island':
      k.rbox(0, 0.06, 0, 1.7, 0.82, 0.7, soft, { b: 0.012 });
      for (let i = 0; i < 4; i++) k.rbox(-0.63 + i * 0.42, 0.12, 0.352, 0.39, 0.68, 0.016, shade(soft, 0.05), { b: 0.006 });
      k.rbox(0, 0.88, 0, 1.98, 0.05, 0.94, '#e9e5dd', { b: 0.016, m: 'stone' });
      bowl(k, -0.45, 0.93, 0);
      k.rbox(0.35, 0.93, 0, 0.5, 0.024, 0.32, '#b58a58', { b: 0.01, m: 'wood' });
      k.sph(0.3, 0.98, 0.03, 0.05, '#c5432f', { seg: 10, m: 'gloss' });
      k.sph(0.42, 0.975, -0.04, 0.045, '#7fa63f', { seg: 10, m: 'gloss' });
      k.tube(
        [
          [0.2, 0.965, -0.08],
          [0.44, 0.965, 0.1],
        ],
        0.009,
        '#c9d0d4',
        { m: 'metal' },
      );
      break;
    case 'dining4':
    case 'dining6': {
      const six = id === 'dining6';
      const tw = six ? 2.8 : 1.9;
      k.rbox(0, 0.715, 0, tw, 0.04, 1.1, '#a8794a', { b: 0.018, m: 'wood', seg: 2 });
      for (const a of [-1, 1])
        for (const b of [-1, 1])
          k.tube(
            [
              [a * (tw / 2 - 0.1), 0, b * 0.44],
              [a * (tw / 2 - 0.18), 0.4, b * 0.4],
              [a * (tw / 2 - 0.2), 0.71, b * 0.38],
            ],
            0.032,
            '#7d5634',
            { m: 'wood', seg: 5, rad: 8 },
          );
      const xs = six ? [-0.85, 0, 0.85] : [-0.45, 0.45];
      for (const x of xs)
        for (const s of [-1, 1]) {
          chair(k, x, s * 0.99, s > 0 ? PI : 0, '#b8674a', 0);
          k.lathe(
            x,
            0.755,
            s * 0.34,
            [
              [0, 0],
              [0.07, 0],
              [0.12, 0.012],
              [0.118, 0.016],
              [0.06, 0.006],
              [0, 0.006],
            ],
            WHITE,
            { m: 'gloss', seg: 22 },
          );
          k.lathe(
            x + 0.17,
            0.755,
            s * 0.28,
            [
              [0, 0],
              [0.025, 0],
              [0.034, 0.1],
              [0.031, 0.1],
              [0.02, 0.01],
              [0, 0.01],
            ],
            '#a9d2e6',
            { m: 'glass' },
          );
          for (const q of [-0.15, 0.145]) k.box(x + q, 0.756, s * 0.34, 0.012, 0.004, 0.17, '#c9d0d4', { m: 'metal' });
        }
      bowl(k, 0, 0.755, 0);
      k.rbox(0, 0.752, 0, tw * 0.5, 0.003, 0.34, mixc(c1, '#e8e2d4', 0.6), { b: 0.001, m: 'cloth' });
      break;
    }
    case 'coffee':
      k.rbox(0, 0.05, -0.08, 1.46, 0.85, 0.72, '#3f2d22', { b: 0.012, m: 'wood' });
      for (let i = 0; i < 3; i++) k.rbox(-0.48 + i * 0.48, 0.1, 0.285, 0.45, 0.74, 0.016, '#4b372a', { b: 0.008, m: 'wood' });
      k.rbox(0, 0.9, -0.08, 1.5, 0.045, 0.8, '#2a2c2e', { b: 0.012, m: 'stone' });
      k.rbox(-0.34, 0.945, -0.15, 0.58, 0.36, 0.42, '#b8392f', { b: 0.05, m: 'gloss' });
      k.rbox(-0.34, 1.29, -0.15, 0.5, 0.03, 0.36, '#c9d0d4', { b: 0.01, m: 'metal' });
      k.rbox(-0.34, 0.96, 0.1, 0.5, 0.04, 0.16, '#c9d0d4', { b: 0.01, m: 'metal' });
      for (const x of [-0.46, -0.22]) {
        k.cyl(x, 1.12, 0.1, 0.04, 0.05, '#c9d0d4', { seg: 14, m: 'metal' });
        k.tube(
          [
            [x, 1.12, 0.12],
            [x, 1.11, 0.26],
          ],
          0.014,
          '#14181c',
          { m: 'rubber' },
        );
      }
      k.tube(
        [
          [-0.62, 1.2, 0.08],
          [-0.66, 1.05, 0.14],
          [-0.65, 1.0, 0.15],
        ],
        0.008,
        '#dfe4e7',
        { m: 'metal' },
      );
      k.lathe(
        0.2,
        0.945,
        -0.2,
        [
          [0, 0],
          [0.09, 0],
          [0.09, 0.16],
          [0.06, 0.2],
          [0.11, 0.24],
          [0.13, 0.4],
          [0.12, 0.4],
          [0, 0.4],
        ],
        '#2a2f34',
        { m: 'gloss' },
      );
      for (let i = 0; i < 5; i++) mug(k, 0.44 + (i % 2) * 0.13, 0.945, -0.26 + Math.floor(i / 2) * 0.13, i % 2 ? c1 : WHITE);
      break;
    // ---------- comfort
    case 'sofa': {
      for (const a of [-1.05, 1.05]) for (const b of [-0.36, 0.36]) k.cyl(a, 0, b, 0.022, 0.1, '#3a2c20', { seg: 8, m: 'wood' });
      k.rbox(0, 0.1, 0.0, 2.36, 0.2, 0.9, soft, { b: 0.07, m: 'cloth' });
      for (const x of [-0.53, 0.53]) {
        k.pillow(x, 0.27, 0.08, 1.06, 0.19, 0.76, shade(soft, 0.05), { m: 'cloth', puff: 0.45 });
        k.pillow(x, 0.4, -0.27, 1.06, 0.46, 0.26, shade(soft, 0.03), { rx: -0.16, m: 'cloth', puff: 0.5 });
      }
      k.rbox(0, 0.2, -0.4, 2.36, 0.56, 0.16, soft, { b: 0.07, m: 'cloth' });
      for (const x of [-1.13, 1.13]) k.rbox(x, 0.1, 0.02, 0.2, 0.46, 0.9, soft, { b: 0.09, m: 'cloth' });
      k.pillow(-0.78, 0.42, -0.1, 0.42, 0.4, 0.16, c2, { rx: -0.35, rz: 0.1, m: 'cloth', puff: 0.6 });
      k.pillow(0.82, 0.42, -0.08, 0.38, 0.36, 0.15, mixc(c1, '#ffffff', 0.35), { rx: -0.3, rz: -0.15, m: 'cloth', puff: 0.6 });
      break;
    }
    case 'armchair':
    case 'listener': {
      const c = id === 'listener' ? mixc(c1, '#c9b79a', 0.45) : '#b5673a';
      const mt = id === 'listener' ? 'cloth' : 'leather';
      for (const a of [-0.3, 0.3])
        for (const b of [-0.3, 0.32])
          k.tube(
            [
              [a * 1.1, 0, b * 1.1],
              [a, 0.16, b],
            ],
            0.018,
            '#3a2c20',
            { m: 'wood', seg: 2 },
          );
      k.rbox(0, 0.14, 0.0, 0.78, 0.16, 0.78, c, { b: 0.06, m: mt });
      k.pillow(0, 0.27, 0.06, 0.62, 0.17, 0.66, shade(c, 0.05), { m: mt, puff: 0.45 });
      k.pillow(0, 0.34, -0.3, 0.7, 0.6, 0.24, c, { rx: -0.2, m: mt, puff: 0.45 });
      for (const x of [-0.38, 0.38]) k.rbox(x, 0.14, 0.02, 0.15, 0.44, 0.78, shade(c, -0.04), { b: 0.07, m: mt });
      k.pillow(0, 0.42, -0.12, 0.36, 0.3, 0.13, id === 'listener' ? WHITE : c1, { rx: -0.3, m: 'cloth', puff: 0.6 });
      break;
    }
    case 'beanbag':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.3, 0.005],
          [0.42, 0.09],
          [0.43, 0.2],
          [0.36, 0.34],
          [0.2, 0.44],
          [0.05, 0.5],
          [0, 0.5],
        ],
        c2,
        { m: 'cloth', seg: 22 },
      );
      k.sph(0, 0.44, -0.16, 0.25, shade(c2, -0.05), { sy: 0.85, seg: 14, m: 'cloth' });
      for (let i = 0; i < 5; i++)
        k.tube(
          [
            [0, 0.5, 0],
            [Math.cos(i * 1.26) * 0.3, 0.38, Math.sin(i * 1.26) * 0.3],
            [Math.cos(i * 1.26) * 0.435, 0.14, Math.sin(i * 1.26) * 0.435],
          ],
          0.006,
          shade(c2, -0.25),
          { m: 'cloth' },
        );
      break;
    case 'ctable':
      k.rbox(0, 0.34, 0, 1.3, 0.035, 0.7, '#8a6340', { b: 0.016, m: 'wood', seg: 2 });
      k.rbox(0, 0.12, 0, 1.1, 0.02, 0.5, '#7a5534', { b: 0.008, m: 'wood' });
      for (const a of [-1, 1])
        for (const b of [-1, 1])
          k.tube(
            [
              [a * 0.58, 0, b * 0.28],
              [a * 0.55, 0.34, b * 0.26],
            ],
            0.022,
            '#5a4028',
            { m: 'wood', seg: 2, rad: 8 },
          );
      k.rbox(-0.3, 0.376, 0.08, 0.28, 0.02, 0.2, '#2f6d92', { ry: 0.3, b: 0.004 });
      k.rbox(-0.28, 0.396, 0.08, 0.25, 0.014, 0.18, '#c9962f', { ry: 0.1, b: 0.004 });
      mug(k, 0.35, 0.376, -0.05, WHITE);
      k.rbox(0.15, 0.376, 0.16, 0.15, 0.03, 0.1, '#14181c', { ry: -0.4, b: 0.012, m: 'rubber' });
      break;
    case 'tv': {
      const [y, h] = hang(1.0, 0.95);
      k.rbox(0, y, wz + 0.035, 1.86, h, 0.04, '#0b0e11', { b: 0.012, m: 'gloss' });
      scr.push({ x: 0, y: y + h / 2, z: wz + 0.058, w: 1.81, h: h - 0.05, ry: 0 });
      if (H > 1.6) k.rbox(0, y - 0.13, wz + 0.05, 0.9, 0.07, 0.07, '#1b1f23', { b: 0.03, m: 'cloth' });
      break;
    }
    case 'pingpong':
      for (const s of [-1, 1]) {
        for (const z of [-0.45, 0.45])
          k.tube(
            [
              [s * 0.85, 0.02, z],
              [s * 0.8, 0.36, z],
              [s * 0.75, 0.68, z],
            ],
            0.022,
            '#23282d',
            { m: 'metal', seg: 4 },
          );
        k.tube(
          [
            [s * 0.85, 0.02, -0.5],
            [s * 0.85, 0.02, 0.5],
          ],
          0.022,
          '#23282d',
          { m: 'metal', seg: 2 },
        );
      }
      k.rbox(0, 0.705, 0, 2.5, 0.035, 1.4, '#1f5f74', { b: 0.008, m: 'paint' });
      k.rbox(0, 0.68, 0, 2.4, 0.03, 1.3, '#23282d', { b: 0.006, m: 'metal' });
      k.box(0, 0.7405, 0, 2.5, 0.002, 0.014, '#ffffff', { ao: 0 });
      for (const s of [-1, 1]) {
        k.box(0, 0.7405, s * 0.685, 2.5, 0.002, 0.02, '#ffffff', { ao: 0 });
        k.box(s * 1.235, 0.7405, 0, 0.02, 0.002, 1.4, '#ffffff', { ao: 0 });
        k.cyl(0, 0.74, s * 0.76, 0.012, 0.16, '#23282d', { seg: 8, m: 'metal' });
        k.cyl(s * 0.7, 0.742, s * 0.3, 0.075, 0.012, s > 0 ? '#c5432f' : '#23282d', { seg: 20, m: 'rubber' });
        k.rbox(s * 0.7 + 0.1 * s, 0.742, s * 0.3, 0.1, 0.014, 0.028, '#c9a777', { b: 0.006, m: 'wood' });
      }
      k.box(0, 0.74, 0, 0.006, 0.15, 1.52, '#eef1f2', { m: 'cloth' });
      k.box(0, 0.885, 0, 0.012, 0.014, 1.52, '#ffffff', { ao: 0 });
      k.sph(-0.5, 0.762, 0.1, 0.02, '#ffffff', { seg: 10, m: 'gloss' });
      break;
    case 'arcade': {
      const side: [number, number][] = [
        [-0.36, 0],
        [0.36, 0],
        [0.36, 0.72],
        [0.42, 0.86],
        [0.3, 0.95],
        [0.16, 1.02],
        [0.06, 1.48],
        [0.16, 1.56],
        [0.16, 1.78],
        [-0.36, 1.78],
      ];
      for (const s of [-1, 1]) {
        k.push(s * 0.37, 0, 0, -PI / 2);
        k.ext(0, 0, 0, side, 0.035, '#241c34', { b: 0.006, m: 'paint' });
        k.ext(
          0,
          0,
          s * -0.022,
          side.map(([x, y]) => [x * 0.9, 0.05 + y * 0.94] as [number, number]),
          0.004,
          s > 0 ? c1 : c2,
          { b: 0.002 },
        );
        k.pop();
      }
      k.rbox(0, 0, -0.03, 0.7, 0.86, 0.66, '#1a1526', { b: 0.015 });
      k.rbox(0, 0.86, 0.2, 0.7, 0.05, 0.34, '#14181c', { rx: 0.28, b: 0.015 });
      k.rbox(0, 0.9, -0.22, 0.7, 0.85, 0.26, '#1a1526', { b: 0.015 });
      scr.push({ x: 0, y: 1.25, z: 0.075, w: 0.58, h: 0.44, ry: 0, rx: -0.2 });
      k.rbox(0, 1.57, 0.14, 0.7, 0.19, 0.03, c2, { glow: true, b: 0.01 });
      for (const s of [-0.2, 0.12]) {
        k.bcyl(s, 0.93, 0.2, 0.03, 0.01, '#0c0f12');
        k.tube(
          [
            [s, 0.935, 0.2],
            [s, 1.0, 0.2],
          ],
          0.008,
          '#c9d0d4',
          { m: 'metal', seg: 2 },
        );
        k.sph(s, 1.015, 0.2, 0.025, s < 0 ? '#c5432f' : '#2f6fd0', { seg: 10, m: 'gloss' });
        for (let i = 0; i < 4; i++)
          k.bcyl(
            s + 0.07 + (i % 2) * 0.045,
            0.925 + (i > 1 ? 0.012 : 0),
            0.24 - Math.floor(i / 2) * 0.05,
            0.016,
            0.014,
            ['#ffd24a', '#4ad28a', '#4a9fff', '#ff5a8a'][i],
            { glow: true },
          );
      }
      k.rbox(0, 0.38, 0.305, 0.3, 0.26, 0.01, '#0c0f12', { b: 0.005, m: 'metal' });
      for (const s of [-0.06, 0.06]) k.box(s, 0.5, 0.312, 0.05, 0.06, 0.004, '#ff8a3a', { glow: true });
      break;
    }
    case 'foosball':
      for (const a of [-0.46, 0.46]) for (const b of [-0.62, 0.62]) k.rbox(a, 0, b, 0.09, 0.58, 0.09, WALNUT, { b: 0.015, m: 'wood' });
      for (const s of [-1, 1]) {
        k.rbox(s * 0.56, 0.55, 0, 0.04, 0.3, 1.6, WALNUT, { b: 0.01, m: 'wood' });
        k.rbox(0, 0.55, s * 0.78, 1.12, 0.3, 0.04, WALNUT, { b: 0.01, m: 'wood' });
      }
      k.box(0, 0.58, 0, 1.1, 0.06, 1.54, '#2f7a42', { ao: 0, m: 'cloth' });
      k.box(0, 0.641, 0, 1.08, 0.002, 0.012, '#ffffff', { ao: 0 });
      k.tor(0, 0.641, 0, 0.16, 0.006, '#ffffff');
      for (let i = 0; i < 6; i++) {
        const z = -0.6 + i * 0.24;
        k.cyl(0, 0.78, z, 0.008, 1.44, '#d0d6d9', { rz: PI / 2, seg: 8, m: 'metal' });
        k.cyl((i % 2 ? 1 : -1) * 0.68, 0.788, z, 0.02, 0.1, '#14181c', { rz: PI / 2, seg: 8, m: 'rubber' });
        for (const x of [-0.28, 0, 0.28]) {
          k.rbox(x, 0.66, z, 0.045, 0.15, 0.032, i % 2 ? c1 : c2, { b: 0.014 });
          k.sph(x, 0.83, z, 0.02, '#e8b994', { seg: 8 });
        }
      }
      break;
    // ---------- fitness
    case 'treadmill':
      k.rbox(0, 0.04, 0.08, 0.82, 0.12, 1.76, '#2a2f34', { b: 0.03, m: 'rubber' });
      k.rbox(0, 0.16, 0.13, 0.54, 0.014, 1.56, '#0e1114', { b: 0.005, m: 'rubber' });
      for (const s of [-1, 1]) {
        k.rbox(s * 0.35, 0.15, 0.13, 0.12, 0.03, 1.6, '#b4bcc1', { b: 0.012, m: 'metal' });
        k.tube(
          [
            [s * 0.38, 0.12, -0.66],
            [s * 0.38, 0.8, -0.76],
            [s * 0.36, 1.12, -0.72],
          ],
          0.034,
          '#2a2f34',
          { m: 'metal' },
        );
        k.tube(
          [
            [s * 0.37, 1.02, -0.72],
            [s * 0.37, 0.98, -0.45],
            [s * 0.37, 0.96, -0.25],
          ],
          0.024,
          '#14181c',
          { m: 'rubber' },
        );
      }
      k.rbox(0, 0.1, -0.68, 0.7, 0.18, 0.3, '#1b1f23', { b: 0.06, m: 'rubber' });
      k.rbox(0, 1.05, -0.74, 0.78, 0.34, 0.07, '#1b1f23', { rx: -0.35, b: 0.03, m: 'gloss' });
      k.box(0, 1.13, -0.69, 0.42, 0.18, 0.006, c1, { glow: true, rx: -0.35 });
      k.cyl(0, 1.0, -0.66, 0.028, 0.04, '#c5432f', { seg: 12 });
      break;
    case 'bench':
      k.tube(
        [
          [0, 0.03, -0.62],
          [0, 0.34, -0.5],
          [0, 0.36, 0.5],
          [0, 0.03, 0.62],
        ],
        0.035,
        '#2a2f34',
        { m: 'metal' },
      );
      k.pillow(0, 0.38, 0.12, 0.34, 0.1, 1.2, '#1b1f23', { m: 'leather', puff: 0.3 });
      for (const z of [-0.62, 0.62]) k.rbox(0, 0, z, 0.6, 0.05, 0.07, '#2a2f34', { b: 0.015, m: 'metal' });
      for (const s of [-1, 1]) {
        k.rbox(s * 0.42, 0, -0.62, 0.07, 1.12, 0.07, '#2a2f34', { b: 0.012, m: 'metal' });
        k.tube(
          [
            [s * 0.42, 1.0, -0.6],
            [s * 0.42, 1.0, -0.52],
            [s * 0.42, 1.06, -0.5],
          ],
          0.014,
          '#c9d0d4',
          { m: 'metal' },
        );
        k.cyl(s * 0.62, 1.04 - 0.03, -0.56, 0.21, 0.05, s < 0 ? c1 : '#14181c', { rz: PI / 2, seg: 26, m: 'rubber' });
        k.cyl(s * 0.67, 1.04 - 0.02, -0.56, 0.15, 0.035, '#14181c', { rz: PI / 2, seg: 24, m: 'rubber' });
      }
      k.cyl(0, 1.04 - 0.74, -0.56, 0.014, 1.48, '#d0d6d9', { rz: PI / 2, seg: 10, m: 'metal' });
      break;
    case 'dumbbells':
      for (const s of [-1, 1])
        k.ext(
          s * 0.92,
          0,
          0,
          [
            [-0.2, 0],
            [0.2, 0],
            [0.12, 0.9],
            [-0.2, 0.9],
          ].map(([x, y]) => [x, y] as [number, number]),
          0.05,
          '#23282d',
          { ry: PI / 2, m: 'metal', b: 0.008 },
        );
      for (let j = 0; j < 3; j++) {
        k.rbox(0, 0.14 + j * 0.31, 0.03 - j * 0.04, 1.84, 0.025, 0.26, '#3a4046', { b: 0.008, rx: 0.18, m: 'metal' });
        for (let i = 0; i < 7; i++)
          dumbbell(k, -0.78 + i * 0.26, 0.23 + j * 0.31, 0.04 - j * 0.04, 0.07 - j * 0.012, i % 2 ? c1 : '#1b1f23');
      }
      break;
    case 'mat':
      k.rbox(0, 0, 0, 0.68, 0.018, 1.74, c1, { b: 0.008, m: 'rubber' });
      k.rbox(0, 0.016, 0, 0.5, 0.004, 0.02, c2, { b: 0.001 });
      break;
    case 'bag':
      k.bcyl(0, 0, 0, 0.34, 0.06, '#23282d', { m: 'rubber', b: 0.03 });
      k.tube(
        [
          [0, 0.03, -0.34],
          [0, 1.2, -0.36],
          [0, 2.08, -0.3],
          [0, 2.12, -0.06],
        ],
        0.036,
        '#30363c',
        { m: 'metal' },
      );
      k.lathe(
        0,
        0.72,
        0,
        [
          [0, 0],
          [0.17, 0.01],
          [0.19, 0.05],
          [0.195, 0.9],
          [0.18, 1.0],
          [0, 1.02],
        ],
        c1,
        { m: 'leather', seg: 22 },
      );
      for (const y of [0.86, 1.5]) k.cyl(0, y, 0, 0.198, 0.06, '#14181c', { seg: 22, m: 'leather' });
      for (let i = 0; i < 4; i++)
        k.tube(
          [
            [Math.cos(i * 1.57) * 0.15, 1.74, Math.sin(i * 1.57) * 0.15],
            [0, 2.06, -0.03],
          ],
          0.006,
          '#b9c0c5',
          { m: 'metal', seg: 2 },
        );
      break;
    case 'mirror': {
      const [y, h] = hang(1.85, 0.3);
      k.rbox(0, y, wz + 0.02, 2.94, h, 0.03, '#3a4248', { b: 0.008, m: 'metal' });
      for (let i = 0; i < 3; i++) k.box(-0.96 + i * 0.96, y + 0.03, wz + 0.037, 0.94, h - 0.06, 0.004, '#cfe0e6', { ao: 0.2, m: 'glass' });
      break;
    }
    // ---------- care
    case 'couch':
      for (const a of [-0.85, 0.8])
        for (const b of [-0.3, 0.3])
          k.tube(
            [
              [a, 0, b],
              [a * 0.97, 0.18, b * 0.95],
            ],
            0.02,
            '#5a4028',
            { m: 'wood', seg: 2 },
          );
      k.rbox(0, 0.16, 0, 1.9, 0.1, 0.8, '#5f7d70', { b: 0.04, m: 'cloth' });
      k.pillow(0.06, 0.23, 0, 1.74, 0.19, 0.78, '#7d9a8c', { m: 'cloth', puff: 0.3 });
      k.pillow(-0.72, 0.34, 0, 0.5, 0.24, 0.76, '#86a396', { rz: -0.5, m: 'cloth', puff: 0.45 });
      k.pillow(-0.62, 0.44, 0, 0.3, 0.12, 0.5, WHITE, { rz: -0.4, m: 'cloth', puff: 0.6 });
      k.rbox(0.6, 0.36, 0, 0.5, 0.04, 0.8, mixc(c1, '#e8e2d4', 0.5), { b: 0.02, m: 'cloth' });
      break;
    case 'salt':
      k.bcyl(0, 0, 0, 0.19, 0.02, WALNUT, { m: 'wood' });
      for (let i = 0; i < 3; i++)
        k.tube(
          [
            [Math.cos(i * 2.1) * 0.15, 0.01, Math.sin(i * 2.1) * 0.15],
            [Math.cos(i * 2.1) * 0.1, 0.38, Math.sin(i * 2.1) * 0.1],
          ],
          0.014,
          WALNUT,
          { m: 'wood', seg: 2 },
        );
      k.bcyl(0, 0.36, 0, 0.17, 0.025, WALNUT, { m: 'wood' });
      k.ico(0, 0.5, 0, 0.11, '#ff9a52', { glow: true, sy: 1.25 });
      break;
    case 'fountain':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.4, 0],
          [0.42, 0.04],
          [0.42, 0.3],
          [0.39, 0.34],
          [0.36, 0.3],
          [0, 0.28],
        ],
        '#6a7f86',
        { m: 'stone', seg: 30 },
      );
      k.cyl(0, 0.27, 0, 0.36, 0.02, '#7fd0ea', { seg: 30, m: 'glass' });
      k.lathe(
        0,
        0.26,
        0,
        [
          [0.09, 0],
          [0.06, 0.1],
          [0.06, 0.26],
          [0.2, 0.36],
          [0.21, 0.4],
          [0.18, 0.38],
          [0, 0.36],
        ],
        '#6a7f86',
        { m: 'stone', seg: 24 },
      );
      k.cyl(0, 0.63, 0, 0.17, 0.012, '#9fe4f4', { seg: 24, glow: true });
      k.sph(0, 0.7, 0, 0.06, '#bfeefa', { seg: 12, m: 'glass' });
      break;
    case 'bedt':
      for (const a of [-0.3, 0.3])
        for (const b of [-0.75, 0.75])
          k.tube(
            [
              [a, 0.02, b],
              [a, 0.42, b],
            ],
            0.022,
            '#c9d0d4',
            { m: 'metal', seg: 2 },
          );
      k.tube(
        [
          [-0.3, 0.15, -0.75],
          [0.3, 0.3, 0.75],
        ],
        0.014,
        '#c9d0d4',
        { m: 'metal', seg: 2 },
      );
      k.rbox(0, 0.42, 0, 0.74, 0.05, 1.86, '#3f7f86', { b: 0.02, m: 'metal' });
      k.pillow(0, 0.46, 0.1, 0.78, 0.15, 1.7, '#6fb0b5', { m: 'leather', puff: 0.2 });
      k.pillow(0, 0.54, -0.74, 0.56, 0.13, 0.34, WHITE, { m: 'cloth', puff: 0.55 });
      k.rbox(0, 0.6, 0.45, 0.74, 0.02, 0.7, '#f4f6f6', { b: 0.009, m: 'cloth' });
      break;
    case 'medcab':
      k.rbox(0, 0.04, 0, 1.44, 0.92, 0.44, '#eef2f2', { b: 0.012, m: 'metal' });
      for (const s of [-1, 0, 1]) k.rbox(s * 0.47, 0.08, 0.217, 0.45, 0.84, 0.016, '#f8fafa', { b: 0.008 });
      k.box(0, 0.42, 0.228, 0.26, 0.08, 0.003, '#d9483a', { ao: 0 });
      k.box(0, 0.33, 0.228, 0.08, 0.26, 0.003, '#d9483a', { ao: 0 });
      k.lathe(
        -0.5,
        0.96,
        0,
        [
          [0, 0],
          [0.05, 0],
          [0.05, 0.14],
          [0.025, 0.17],
          [0.025, 0.2],
          [0, 0.2],
        ],
        '#7fc4d8',
        { m: 'glass' },
      );
      k.lathe(
        -0.36,
        0.96,
        0.05,
        [
          [0, 0],
          [0.035, 0],
          [0.035, 0.1],
          [0.02, 0.12],
          [0, 0.12],
        ],
        '#d98a2b',
        { m: 'glass' },
      );
      k.rbox(0.4, 0.96, 0, 0.36, 0.16, 0.26, WHITE, { b: 0.03 });
      k.box(0.4, 1.02, 0.132, 0.1, 0.03, 0.003, '#d9483a', { ao: 0 });
      k.box(0.4, 0.985, 0.132, 0.03, 0.1, 0.003, '#d9483a', { ao: 0 });
      break;
    case 'scanner':
      k.rbox(0, 0.06, -0.12, 0.56, 0.9, 0.5, '#e6ebec', { b: 0.06 });
      for (const a of [-0.2, 0.2]) for (const b of [-0.28, 0.06]) k.cyl(a, 0, b, 0.04, 0.07, '#22272c', { seg: 10, m: 'rubber' });
      k.tube(
        [
          [0, 0.92, -0.2],
          [0, 1.3, -0.26],
          [0, 1.42, -0.2],
        ],
        0.026,
        '#c9d0d4',
        { m: 'metal' },
      );
      k.rbox(0, 1.28, -0.16, 0.66, 0.42, 0.05, '#14181c', { b: 0.02, rx: -0.15, m: 'gloss' });
      k.box(0, 1.32, -0.125, 0.58, 0.34, 0.005, '#7affea', { glow: true, rx: -0.15 });
      k.tube(
        [
          [0.2, 0.8, 0.08],
          [0.32, 0.5, 0.28],
          [0.16, 0.72, 0.4],
        ],
        0.014,
        '#3f7f8a',
        { m: 'rubber' },
      );
      k.rbox(0.14, 0.72, 0.4, 0.08, 0.2, 0.06, WHITE, { b: 0.025 });
      break;
    case 'icebath':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.6, 0],
          [0.66, 0.05],
          [0.68, 0.64],
          [0.7, 0.68],
          [0.68, 0.72],
          [0.6, 0.7],
          [0.58, 0.62],
          [0, 0.6],
        ],
        '#2a4a58',
        { m: 'rubber', seg: 36 },
      );
      k.cyl(0, 0.6, 0, 0.585, 0.02, '#a6e4f2', { seg: 36, m: 'glass' });
      for (let i = 0; i < 14; i++)
        k.rbox(Math.cos(i * 2.4) * (0.12 + (i % 4) * 0.12), 0.6, Math.sin(i * 2.4) * (0.12 + (i % 4) * 0.12), 0.12, 0.07, 0.1, '#eefaff', {
          ry: i,
          rz: 0.2,
          b: 0.02,
          m: 'glass',
        });
      k.rbox(0.52, 0, 0.5, 0.3, 0.3, 0.3, '#7d858a', { b: 0.03, m: 'metal' });
      break;
    // ---------- media
    case 'streamdesk': {
      const z = -0.5;
      desk(k, 1.7, 0.74, z, '#231c30', '#1b1f23');
      monitor(k, scr, 0, 0.751, z - 0.22, 0.72);
      monitor(k, scr, -0.62, 0.751, z - 0.1, 0.46, 0.6);
      keys(k, -0.05, 0.751, z + 0.14, c2);
      mouse(k, 0.28, 0.753, z + 0.14, c2);
      k.tube(
        [
          [0.76, 0.76, z - 0.28],
          [0.7, 1.1, z - 0.2],
          [0.42, 1.14, z + 0.02],
        ],
        0.013,
        '#23282d',
        { m: 'metal' },
      );
      k.cyl(0.36, 1.02, z + 0.06, 0.032, 0.17, '#14181c', { seg: 14, m: 'metal' });
      k.tor(0.36, 1.1, z + 0.06, 0.055, 0.006, STEEL, { m: 'metal' });
      k.rbox(0.55, 0.751, z + 0.12, 0.2, 0.05, 0.14, '#14181c', { b: 0.015 });
      for (let i = 0; i < 8; i++)
        k.box(0.49 + (i % 4) * 0.04, 0.8, z + 0.09 + Math.floor(i / 4) * 0.05, 0.028, 0.006, 0.028, [c1, c2, '#4ad28a', '#4a9fff'][i % 4], {
          glow: true,
        });
      k.tube(
        [
          [0.78, 0, -1.1],
          [0.78, 1.5, -1.05],
        ],
        0.014,
        '#14181c',
        { m: 'metal', seg: 2 },
      );
      k.tor(0.72, 1.55, -1.0, 0.21, 0.022, '#fff2dc', { rx: PI / 2, glow: true });
      chair(k, 0, 0.31, PI, c1, 2);
      break;
    }
    case 'backdrop': {
      const [y, h] = hang(2.0, 0.08);
      k.rbox(0, y, wz + 0.02, 2.96, h, 0.03, mixc(c1, '#1a1626', 0.45), { b: 0.008, m: 'cloth' });
      for (let i = 0; i < 5; i++)
        k.rbox(-1.15 + i * 0.3, y + h * 0.36, wz + 0.045, 0.16, h * 0.38, 0.02, i === 4 ? c2 : mixc(c1, '#ffffff', 0.3), { b: 0.008 });
      k.rbox(-0.55, y + h * 0.22, wz + 0.045, 1.5, h * 0.06, 0.02, c2, { b: 0.006 });
      k.tor(0.95, y + h * 0.52, wz + 0.07, Math.min(0.32, h * 0.3), 0.026, c2, { rx: PI / 2, glow: true });
      for (const x of [-1.48, 1.48]) k.box(x, y, wz + 0.04, 0.02, h, 0.02, c1, { glow: true });
      break;
    }
    case 'softbox':
      for (let i = 0; i < 3; i++)
        k.tube(
          [
            [Math.cos(i * 2.1) * 0.2, 0.01, Math.sin(i * 2.1) * 0.2],
            [0, 0.45, 0],
          ],
          0.011,
          '#23282d',
          { m: 'metal', seg: 2 },
        );
      k.cyl(0, 0.4, 0, 0.014, 1.05, '#23282d', { seg: 8, m: 'metal' });
      k.ext(
        0,
        1.3,
        -0.02,
        [
          [-0.14, 0.12],
          [0.14, 0.12],
          [0.22, 0.0],
          [0.22, 0.52],
          [-0.22, 0.52],
          [-0.22, 0.0],
        ]
          .slice(2)
          .map(p => p as [number, number]),
        0.16,
        '#14181c',
        { m: 'cloth' },
      );
      k.box(0, 1.33, 0.075, 0.4, 0.46, 0.01, '#fff2dc', { glow: true });
      break;
    case 'camera':
      for (let i = 0; i < 3; i++)
        k.tube(
          [
            [Math.cos(i * 2.1 + 0.5) * 0.34, 0.01, Math.sin(i * 2.1 + 0.5) * 0.34],
            [Math.cos(i * 2.1 + 0.5) * 0.06, 1.06, Math.sin(i * 2.1 + 0.5) * 0.06],
          ],
          0.018,
          '#23282d',
          { m: 'metal', seg: 2 },
        );
      k.bcyl(0, 1.04, 0, 0.08, 0.06, '#14181c', { m: 'metal' });
      k.rbox(0, 1.12, 0.04, 0.2, 0.22, 0.42, '#1b1f23', { b: 0.03, m: 'rubber' });
      k.cyl(0, 1.2, -0.36, 0.075, 0.22, '#0e1114', { rx: PI / 2, seg: 20, m: 'metal' });
      k.tor(0, 1.31 - 0.075, -0.37, 0.08, 0.012, c1, { rx: PI / 2 });
      k.rbox(0.14, 1.24, 0.2, 0.02, 0.14, 0.2, '#14181c', { b: 0.008, m: 'gloss' });
      k.tube(
        [
          [0, 1.2, 0.2],
          [0.05, 1.05, 0.36],
          [0.1, 0.98, 0.42],
        ],
        0.014,
        '#14181c',
        { m: 'rubber' },
      );
      k.sph(0.08, 1.36, 0.12, 0.012, '#ff4a3a', { glow: true, seg: 6 });
      break;
    // ---------- sleep
    case 'pod':
    case 'bunk': {
      const pod = id === 'pod';
      const fr = pod ? '#232d3f' : '#8a6340';
      const bed = (y: number, c: C) => {
        k.rbox(0, y, 0, 0.96, 0.14, 1.94, fr, { b: 0.03, m: pod ? 'paint' : 'wood' });
        k.pillow(0, y + 0.1, 0.02, 0.9, 0.22, 1.84, '#efebe2', { m: 'cloth', puff: 0.18 });
        k.pillow(0, y + 0.2, 0.3, 0.95, 0.2, 1.26, c, { m: 'cloth', puff: 0.45 });
        k.rbox(0, y + 0.28, -0.24, 0.93, 0.05, 0.2, shade(c, 0.4), { b: 0.024, m: 'cloth' });
        k.pillow(0, y + 0.22, -0.7, 0.6, 0.18, 0.36, '#ffffff', { m: 'cloth', puff: 0.6 });
      };
      if (pod) {
        for (const a of [-0.4, 0.4]) for (const b of [-0.85, 0.85]) k.cyl(a, 0, b, 0.03, 0.22, '#14181c', { seg: 8, m: 'metal' });
        k.rbox(0, 0.04, 0.1, 0.86, 0.16, 1.5, '#1b2333', { b: 0.02 });
        bed(0.2, c1);
        k.rbox(0, 0.3, -0.94, 0.98, 0.72, 0.06, '#2f3b52', { b: 0.028, m: 'cloth' });
        for (let i = 0; i < 3; i++) k.pillow(-0.31 + i * 0.31, 0.46, -0.9, 0.29, 0.46, 0.06, '#3a4866', { m: 'cloth', puff: 0.5 });
        k.box(0, 0.98, -0.9, 0.6, 0.018, 0.02, '#9fc8ff', { glow: true });
      } else {
        for (const a of [-0.46, 0.46])
          for (const b of [-0.93, 0.93]) k.rbox(a, 0, b, 0.065, 1.75, 0.065, '#7a5534', { b: 0.014, m: 'wood' });
        bed(0.22, mixc(c1, '#2a3448', 0.4));
        bed(1.16, c2);
        for (const z of [-0.93, 0.93]) k.rbox(0, 1.5, z, 0.9, 0.05, 0.03, '#7a5534', { b: 0.01, m: 'wood' });
        k.rbox(-0.47, 1.48, 0.1, 0.03, 0.06, 1.6, '#7a5534', { b: 0.01, m: 'wood' });
        for (let i = 0; i < 4; i++) k.rbox(0.49, 0.22 + i * 0.29, 0.7, 0.025, 0.035, 0.36, '#7a5534', { b: 0.01, m: 'wood' });
      }
      break;
    }
    case 'nightstand':
      k.rbox(0, 0.1, 0, 0.44, 0.4, 0.42, '#8a6340', { b: 0.012, m: 'wood' });
      for (const a of [-0.18, 0.18]) for (const b of [-0.17, 0.17]) k.cyl(a, 0, b, 0.016, 0.1, '#3a2c20', { seg: 8, m: 'wood' });
      k.rbox(0, 0.3, 0.206, 0.39, 0.16, 0.014, '#9a7048', { b: 0.006, m: 'wood' });
      k.sph(0, 0.38, 0.222, 0.014, '#d8b15a', { seg: 8, m: 'metal' });
      k.lathe(
        0,
        0.5,
        0,
        [
          [0, 0],
          [0.06, 0],
          [0.065, 0.015],
          [0.03, 0.05],
          [0.045, 0.1],
          [0.015, 0.14],
          [0.012, 0.18],
          [0, 0.18],
        ],
        '#e4ded2',
        { m: 'gloss' },
      );
      k.lathe(
        0,
        0.66,
        0,
        [
          [0.13, 0],
          [0.085, 0.15],
          [0.08, 0.15],
          [0.125, 0],
        ],
        '#ffe0a8',
        { glow: true, seg: 18 },
      );
      k.rbox(0.12, 0.5, 0.1, 0.08, 0.012, 0.15, '#14181c', { b: 0.005, m: 'gloss', ry: 0.3 });
      break;
    case 'wardrobe':
      k.rbox(0, 0, 0, 1.92, 1.95, 0.46, '#9a7048', { b: 0.012, m: 'wood' });
      for (let i = 0; i < 4; i++) {
        k.rbox(-0.7 + i * 0.467, 0.08, 0.228, 0.455, 1.8, 0.018, '#a87d52', { b: 0.008, m: 'wood' });
        k.rbox(-0.7 + i * 0.467 + (i % 2 ? -0.17 : 0.17), 0.9, 0.245, 0.016, 0.22, 0.02, '#23282d', { b: 0.006, m: 'metal' });
      }
      break;
    case 'blackout': {
      const [y, h] = hang(2.0, 0.25);
      k.cyl(0, y + h - 0.98, wz + 0.07, 0.014, 1.96, '#3a332c', { rz: PI / 2, seg: 10, m: 'metal' });
      for (let i = 0; i < 14; i++)
        k.lathe(
          -0.9 + i * 0.138,
          y,
          wz + 0.075,
          [
            [0.075, 0],
            [0.07, h * 0.5],
            [0.058, h - 0.02],
          ],
          i % 2 ? '#2a3448' : '#333f57',
          { m: 'cloth', seg: 8 },
        );
      break;
    }
    // ---------- trophies
    case 'plinth':
      k.rbox(0, 0, 0, 0.46, 0.05, 0.46, '#191716', { b: 0.012, m: 'gloss' });
      k.rbox(0, 0.05, 0, 0.38, 0.8, 0.38, '#221f1d', { b: 0.012, m: 'gloss' });
      k.rbox(0, 0.84, 0, 0.46, 0.035, 0.46, '#2a2622', { b: 0.012, m: 'gloss' });
      k.box(0, 0.6, 0.192, 0.2, 0.07, 0.004, '#d8b15a', { m: 'metal', ao: 0 });
      if (X.full) cup(k, 0, 0.875, 0, 1);
      else k.bcyl(0, 0.875, 0, 0.12, 0.01, '#3a3632', { m: 'metal' });
      k.tor(0, 0.878, 0, 0.19, 0.006, '#ffdf9a', { glow: true });
      break;
    case 'tcase':
      k.rbox(0, 0, 0, 1.94, 0.46, 0.46, '#2a2320', { b: 0.012, m: 'wood' });
      k.box(0, 0.46, -0.2, 1.88, 1.28, 0.02, '#3a2f28', { m: 'cloth' });
      for (const y of [0.46, 1.08, 1.72])
        k.rbox(0, y, 0, 1.9, 0.026, 0.42, y === 1.08 ? '#a9c7d2' : '#2a2320', { b: 0.008, m: y === 1.08 ? 'glass' : 'wood' });
      for (const x of [-0.94, 0.94]) k.rbox(x, 0.46, 0, 0.03, 1.28, 0.42, '#d8b15a', { b: 0.008, m: 'metal' });
      for (let i = 0; i < 6; i++) cup(k, -0.66 + (i % 3) * 0.66, i > 2 ? 0.49 : 1.11, 0, 0.78, i >= (X.full ?? 0) * 3);
      k.box(0, 1.7, 0.14, 1.7, 0.012, 0.02, '#ffdf9a', { glow: true });
      k.box(0, 1.06, 0.14, 1.7, 0.01, 0.02, '#ffdf9a', { glow: true });
      break;
    case 'banner': {
      const [y, h] = hang(1.6, 0.55);
      k.cyl(0, y + h - 0.6, wz + 0.06, 0.016, 1.2, '#d8b15a', { rz: PI / 2, seg: 10, m: 'metal' });
      k.ext(
        0,
        y,
        wz + 0.045,
        [
          [-0.53, h],
          [0.53, h],
          [0.53, h * 0.16],
          [0, 0],
          [-0.53, h * 0.16],
        ],
        0.012,
        c1,
        { m: 'cloth', b: 0.003 },
      );
      k.ext(
        0,
        y,
        wz + 0.052,
        [
          [-0.53, h * 0.26],
          [0.53, h * 0.26],
          [0.53, h * 0.2],
          [0, h * 0.04],
          [-0.53, h * 0.2],
        ],
        0.006,
        c2,
        { m: 'cloth', b: 0.002 },
      );
      for (let i = 0; i < 5; i++) k.rbox(-0.3 + i * 0.15, y + h * 0.48, wz + 0.056, 0.085, h * 0.34, 0.008, c3, { b: 0.003, m: 'cloth' });
      k.rbox(0, y + h * 0.4, wz + 0.056, 0.69, h * 0.05, 0.008, c2, { b: 0.003, m: 'cloth' });
      break;
    }
    case 'jersey': {
      const [y, h] = hang(0.95, 0.98);
      k.rbox(0, y, wz + 0.03, 0.88, h, 0.05, '#1d1815', { b: 0.012, m: 'wood' });
      k.box(0, y + 0.05, wz + 0.058, 0.78, h - 0.1, 0.004, '#efeae0', { ao: 0 });
      k.ext(
        0,
        y + h * 0.16,
        wz + 0.064,
        [
          [-0.17, 0],
          [0.17, 0],
          [0.17, h * 0.46],
          [0.3, h * 0.4],
          [0.34, h * 0.54],
          [0.14, h * 0.68],
          [0.07, h * 0.64],
          [-0.07, h * 0.64],
          [-0.14, h * 0.68],
          [-0.34, h * 0.54],
          [-0.3, h * 0.4],
          [-0.17, h * 0.46],
        ],
        0.012,
        c1,
        { m: 'cloth', b: 0.004 },
      );
      k.rbox(0, y + h * 0.36, wz + 0.078, 0.15, h * 0.22, 0.004, c3, { b: 0.001 });
      k.rbox(0, y + h * 0.72, wz + 0.078, 0.2, 0.02, 0.004, c2, { b: 0.001 });
      break;
    }
    case 'neon': {
      const [y, h] = hang(0.95, 1.05);
      k.rbox(0, y, wz + 0.02, 1.34, h, 0.02, '#14181c', { b: 0.006, m: 'gloss' });
      for (let i = 0; i < 5; i++)
        k.tube(
          [
            [-0.4 + i * 0.2, y + h * 0.36, wz + 0.05],
            [-0.4 + i * 0.2, y + h * 0.86, wz + 0.05],
          ],
          0.022,
          c1,
          { glow: true, seg: 2, rad: 8 },
        );
      k.tube(
        [
          [-0.44, y + h * 0.2, wz + 0.05],
          [0.44, y + h * 0.2, wz + 0.05],
        ],
        0.024,
        c2,
        { glow: true, seg: 2, rad: 8 },
      );
      break;
    }
    // ---------- decor
    case 'plant':
      pot(k, 0, 0, 0.95);
      broad(k, 0, 0, 1, 12);
      break;
    case 'palm':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.22, 0],
          [0.25, 0.03],
          [0.3, 0.4],
          [0.31, 0.44],
          [0.28, 0.44],
          [0.26, 0.4],
          [0, 0.4],
        ],
        '#5a5f63',
        { m: 'stone', seg: 24 },
      );
      k.cyl(0, 0.39, 0, 0.26, 0.012, '#3b2a1e', { seg: 16, m: 'stone' });
      for (let s = 0; s < 3; s++) {
        const a = s * 2.1,
          hx = Math.cos(a) * 0.08,
          hz = Math.sin(a) * 0.08,
          hh = 1.0 + s * 0.22;
        k.tube(
          [
            [hx * 0.4, 0.38, hz * 0.4],
            [hx, 0.8, hz],
            [hx * 1.4, hh, hz * 1.4],
          ],
          0.022,
          '#6d5238',
          { m: 'wood', seg: 6 },
        );
        for (let i = 0; i < 9; i++)
          k.leaf(
            hx * 1.4,
            hh - 0.02,
            hz * 1.4,
            0.55,
            0.1,
            i * 0.7 + s,
            0.95 - (i % 3) * 0.25,
            1.9,
            ['#3f7a3d', '#4f8d47', '#376c39'][i % 3],
            { tip: 0.02 },
          );
      }
      break;
    case 'rug':
      k.rbox(0, 0, 0, 2.92, 0.014, 2.42, mixc(c1, '#2a2520', 0.4), { b: 0.006, m: 'cloth' });
      k.rbox(0, 0.003, 0, 2.66, 0.014, 2.16, c2, { b: 0.006, m: 'cloth' });
      k.rbox(0, 0.005, 0, 2.58, 0.014, 2.08, mixc(c1, '#2a2520', 0.4), { b: 0.006, m: 'cloth' });
      for (let i = 0; i < 5; i++)
        k.rbox(-0.72 + i * 0.36, 0.007, 0, 0.18, 0.014, 1.1, i === 2 ? c2 : mixc(c1, '#ffffff', 0.16), { b: 0.006, m: 'cloth' });
      break;
    case 'runner':
      k.rbox(0, 0, 0, 0.88, 0.013, 2.92, mixc(c1, '#2a2520', 0.35), { b: 0.006, m: 'cloth' });
      for (const x of [-0.35, 0.35]) k.rbox(x, 0.003, 0, 0.04, 0.012, 2.9, c2, { b: 0.004, m: 'cloth' });
      break;
    case 'lamp':
      k.bcyl(0, 0, 0, 0.17, 0.025, '#23282d', { m: 'metal', seg: 24 });
      k.tube(
        [
          [0, 0.02, 0],
          [0, 0.8, 0],
          [0.0, 1.42, 0],
        ],
        0.012,
        '#23282d',
        { m: 'metal', seg: 4 },
      );
      k.lathe(
        0,
        1.3,
        0,
        [
          [0.21, 0],
          [0.14, 0.3],
          [0.135, 0.3],
          [0.205, 0],
        ],
        '#ffe0a8',
        { glow: true, seg: 24 },
      );
      break;
    case 'painting': {
      const [y, h] = hang(0.78, 1.08);
      k.rbox(0, y, wz + 0.025, 0.92, h, 0.04, '#b58a4a', { b: 0.014, m: 'metal' });
      k.box(0, y + 0.05, wz + 0.047, 0.82, h - 0.1, 0.004, '#dfe6e0', { ao: 0, m: 'cloth' });
      k.ext(
        0,
        y + 0.05,
        wz + 0.05,
        [
          [-0.41, 0],
          [0.41, 0],
          [0.41, h * 0.3],
          [0.1, h * 0.5],
          [-0.2, h * 0.26],
          [-0.41, h * 0.4],
        ],
        0.003,
        c1,
        { b: 0.001, m: 'cloth' },
      );
      k.ext(
        0,
        y + 0.05,
        wz + 0.053,
        [
          [-0.1, 0],
          [0.41, 0],
          [0.41, h * 0.16],
          [0.2, h * 0.3],
        ],
        0.003,
        c2,
        { b: 0.001, m: 'cloth' },
      );
      k.cyl(-0.16, y + h * 0.62, wz + 0.052, 0.09, 0.004, '#d9683f', { rx: PI / 2, seg: 22, ao: 0 });
      break;
    }
    case 'clock': {
      const [y, h] = hang(0.42, 1.5);
      const r = h / 2;
      k.push(0, y + r, wz + 0.03);
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [r, 0],
          [r, 0.035],
          [r - 0.02, 0.045],
          [r - 0.03, 0.03],
          [0, 0.03],
        ],
        '#23282d',
        { rx: PI / 2, m: 'metal', seg: 30 },
      );
      k.cyl(0, -0.004, 0.027, r - 0.03, 0.008, '#f6f4ee', { rx: PI / 2, seg: 30, ao: 0 });
      for (let i = 0; i < 12; i++)
        k.box(Math.sin(i * 0.5236) * (r - 0.055), Math.cos(i * 0.5236) * (r - 0.055), 0.038, 0.012, 0.012, 0.003, '#23282d', { ao: 0 });
      k.box(0, 0, 0.04, 0.012, r * 0.62, 0.004, '#23282d', { ao: 0 });
      k.box(0.045, 0, 0.042, 0.09, 0.012, 0.004, '#c5432f', { ao: 0 });
      k.pop();
      break;
    }
    case 'reception':
      k.rbox(0, 0, 0.25, 2.4, 1.02, 0.36, mixc(c1, '#20262b', 0.4), { b: 0.05, m: 'paint' });
      for (let i = 0; i < 16; i++)
        k.rbox(-1.12 + i * 0.15, 0.06, 0.432, 0.06, 0.9, 0.02, mixc(c1, '#20262b', 0.25), { b: 0.008, m: 'wood' });
      k.rbox(0, 1.02, 0.2, 2.48, 0.05, 0.52, '#e9e5dd', { b: 0.02, m: 'stone' });
      k.rbox(0, 0.7, -0.22, 2.3, 0.035, 0.55, '#c9a777', { b: 0.012, m: 'wood' });
      for (let i = 0; i < 5; i++) k.rbox(-0.4 + i * 0.2, 0.4, 0.452, 0.09, 0.32, 0.02, i === 4 ? c2 : WHITE, { glow: true, b: 0.006 });
      monitor(k, scr, 0.6, 0.736, -0.2, 0.5, PI);
      keys(k, 0.55, 0.736, -0.4, null);
      pot(k, -0.95, 0.18, 0.4);
      break;
    case 'waitbench':
      for (let i = 0; i < 4; i++) k.rbox(0, 0.4, -0.12 + i * 0.1, 1.9, 0.03, 0.085, '#a8794a', { b: 0.012, m: 'wood' });
      for (let i = 0; i < 3; i++) k.rbox(0, 0.52 + i * 0.12, -0.2 - i * 0.012, 1.9, 0.09, 0.028, '#a8794a', { b: 0.012, m: 'wood' });
      for (const x of [-0.78, 0.78]) {
        k.tube(
          [
            [x, 0, 0.2],
            [x, 0.38, 0.2],
            [x, 0.39, -0.18],
            [x, 0.85, -0.25],
          ],
          0.022,
          '#23282d',
          { m: 'metal' },
        );
        k.tube(
          [
            [x, 0, -0.2],
            [x, 0.39, -0.16],
          ],
          0.022,
          '#23282d',
          { m: 'metal', seg: 2 },
        );
      }
      break;
    // ---------- washing and order
    case 'shower':
      k.rbox(0, 0, 0, 0.98, 0.07, 0.98, WHITE, { b: 0.02, m: 'gloss' });
      k.cyl(0, 0.07, 0.1, 0.05, 0.006, '#9aa3a9', { seg: 16, m: 'metal' });
      k.box(0, 0.07, -0.475, 0.96, 1.95, 0.02, '#cfd9dc', { m: 'gloss' });
      k.box(-0.475, 0.07, 0, 0.02, 1.95, 0.96, '#cfd9dc', { m: 'gloss' });
      for (let i = 0; i < 8; i++) {
        k.box(0, 0.3 + i * 0.22, -0.463, 0.95, 0.006, 0.002, '#aab6ba', { ao: 0 });
        k.box(-0.463, 0.3 + i * 0.22, 0, 0.002, 0.006, 0.95, '#aab6ba', { ao: 0 });
      }
      k.tube(
        [
          [0.25, 0.95, -0.44],
          [0.25, 2.0, -0.44],
          [0.2, 2.08, -0.3],
          [0.12, 2.04, -0.16],
        ],
        0.016,
        '#c9d0d4',
        { m: 'metal' },
      );
      k.lathe(
        0.1,
        1.98,
        -0.12,
        [
          [0, 0],
          [0.1, 0],
          [0.11, 0.015],
          [0.03, 0.05],
          [0, 0.05],
        ],
        '#c9d0d4',
        { m: 'metal', seg: 22 },
      );
      k.rbox(0.25, 1.02, -0.43, 0.12, 0.05, 0.06, '#c9d0d4', { b: 0.02, m: 'metal' });
      k.box(0.478, 0.07, -0.1, 0.012, 1.85, 0.72, '#b7dbe4', { m: 'glass', ao: 0.1 });
      k.rbox(0.478, 1.9, 0, 0.03, 0.03, 0.96, '#c9d0d4', { b: 0.01, m: 'metal' });
      k.lathe(
        -0.38,
        0.09,
        -0.38,
        [
          [0, 0],
          [0.04, 0],
          [0.04, 0.16],
          [0.02, 0.19],
          [0, 0.19],
        ],
        c1,
        { m: 'gloss' },
      );
      break;
    case 'toilet':
      k.rbox(0, 0.4, -0.36, 0.42, 0.4, 0.2, WHITE, { b: 0.05, m: 'gloss' });
      k.rbox(0, 0.78, -0.36, 0.45, 0.04, 0.23, WHITE, { b: 0.018, m: 'gloss' });
      k.cyl(0, 0.82, -0.36, 0.028, 0.012, '#c9d0d4', { seg: 14, m: 'metal' });
      k.lathe(
        0,
        0,
        -0.04,
        [
          [0, 0],
          [0.15, 0],
          [0.16, 0.03],
          [0.12, 0.14],
          [0.16, 0.28],
          [0.2, 0.38],
          [0.2, 0.4],
          [0, 0.4],
        ],
        WHITE,
        { m: 'gloss', seg: 24 },
      );
      k.push(0, 0.4, -0.02);
      k.add(seat(), 0, 0, 0, 1, 1, 1, '#f8fafa', { m: 'gloss' });
      k.pop();
      k.rbox(0, 0.42, -0.24, 0.36, 0.4, 0.03, '#f8fafa', { b: 0.014, rx: -0.12, m: 'gloss' });
      k.cyl(0.36, 0.55, -0.42, 0.055, 0.11, '#f4f2ec', { rz: PI / 2, seg: 16 });
      k.rbox(0.36, 0.6, -0.47, 0.14, 0.02, 0.04, '#c9d0d4', { b: 0.006, m: 'metal' });
      break;
    case 'basin':
      k.rbox(0, 0.3, -0.02, 0.94, 0.45, 0.44, '#8a6340', { b: 0.012, m: 'wood' });
      for (const s of [-1, 1]) k.rbox(s * 0.235, 0.33, 0.205, 0.45, 0.39, 0.016, '#9a7048', { b: 0.008, m: 'wood' });
      k.rbox(0, 0.75, -0.01, 0.98, 0.09, 0.47, WHITE, { b: 0.03, m: 'gloss' });
      k.lathe(
        0,
        0.838,
        0.01,
        [
          [0.19, 0.006],
          [0.18, 0.006],
          [0.12, 0.002],
          [0, 0.001],
        ],
        '#cfd9dc',
        { m: 'gloss', seg: 24 },
      );
      faucet(k, 0, 0.83, -0.19);
      k.lathe(
        0.36,
        0.84,
        -0.1,
        [
          [0, 0],
          [0.03, 0],
          [0.032, 0.1],
          [0.012, 0.13],
          [0, 0.14],
        ],
        c2,
        { m: 'gloss' },
      );
      k.lathe(
        -0.36,
        0.84,
        -0.1,
        [
          [0, 0],
          [0.03, 0],
          [0.035, 0.09],
          [0.03, 0.09],
          [0, 0.02],
        ],
        '#a9d2e6',
        { m: 'glass' },
      );
      for (const s of [-0.012, 0.012])
        k.tube(
          [
            [-0.36 + s, 0.86, -0.1],
            [-0.36 + s * 3, 1.0, -0.11],
          ],
          0.006,
          s < 0 ? '#c5432f' : '#2f6fd0',
        );
      break;
    case 'bathcab': {
      const [y, h] = hang(0.9, 1.1);
      k.rbox(0, y, wz + 0.05, 0.94, h, 0.09, '#dfe4e5', { b: 0.012, m: 'metal' });
      k.box(0, y + 0.03, wz + 0.098, 0.88, h - 0.06, 0.004, '#d5e4ea', { ao: 0.1, m: 'glass' });
      k.box(0, y + h + 0.02, wz + 0.08, 0.7, 0.025, 0.05, '#fff4df', { glow: true });
      break;
    }
    case 'washer':
      for (const [x, top] of [[0, 0]] as [number, number][]) {
        k.rbox(x, 0.02, -0.1, 0.86, 0.92, 0.74, WHITE, { b: 0.03, m: 'gloss' });
        k.rbox(x, 0.78, 0.262, 0.8, 0.13, 0.02, '#dfe4e7', { b: 0.01 });
        k.cyl(x + 0.18, 0.845, 0.28, 0.04, 0.03, '#9aa3a9', { rx: PI / 2, seg: 18, m: 'metal' });
        k.box(x - 0.18, 0.825, 0.274, 0.16, 0.05, 0.004, '#7affea', { glow: true });
        k.tor(x, 0.42, 0.28, 0.23, 0.035, '#b4bcc1', { rx: PI / 2, m: 'metal' });
        k.sph(x, 0.42, 0.26, 0.21, '#22343c', { sz: 0.3, seg: 20, m: 'glass' });
        void top;
      }
      k.rbox(0, 0.94, -0.1, 0.4, 0.1, 0.3, c1, { b: 0.04, m: 'cloth' });
      break;
    case 'hamper':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.17, 0],
          [0.19, 0.02],
          [0.22, 0.5],
          [0.23, 0.52],
          [0.2, 0.52],
          [0.18, 0.1],
          [0, 0.08],
        ],
        '#b8996a',
        { m: 'cloth', seg: 20 },
      );
      k.pillow(0.02, 0.4, 0.0, 0.36, 0.2, 0.34, c1, { m: 'cloth', puff: 0.6, ry: 0.4 });
      k.pillow(-0.04, 0.48, 0.03, 0.26, 0.14, 0.24, WHITE, { m: 'cloth', puff: 0.6, ry: 1.1 });
      break;
    case 'bin':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.15, 0],
          [0.16, 0.015],
          [0.19, 0.5],
          [0.2, 0.52],
          [0.2, 0.56],
          [0.14, 0.6],
          [0, 0.61],
        ],
        '#3a4248',
        { m: 'metal', seg: 22 },
      );
      k.rbox(0, 0.5, 0.17, 0.18, 0.08, 0.04, '#14181c', { b: 0.015 });
      break;
    case 'cart':
      k.rbox(0, 0.14, 0, 0.9, 0.04, 0.42, '#d8a02f', { b: 0.015 });
      for (const a of [-0.38, 0.38])
        for (const b of [-0.16, 0.16]) k.cyl(a, 0.0, b - 0.02, 0.06, 0.04, '#14181c', { rx: PI / 2, seg: 14, m: 'rubber' });
      for (const a of [-0.42, 0.42])
        k.tube(
          [
            [a, 0.16, -0.18],
            [a, 0.95, -0.18],
            [a, 0.95, 0.18],
            [a, 0.16, 0.18],
          ],
          0.016,
          '#8d959b',
          { m: 'metal' },
        );
      k.lathe(
        -0.2,
        0.18,
        0,
        [
          [0, 0],
          [0.15, 0],
          [0.18, 0.28],
          [0.185, 0.3],
          [0.165, 0.3],
          [0, 0.24],
        ],
        '#2f6fd0',
        { m: 'paint', seg: 20 },
      );
      k.rbox(0.2, 0.18, 0, 0.36, 0.5, 0.34, '#23282d', { b: 0.03, m: 'cloth' });
      k.tube(
        [
          [-0.2, 0.3, 0.05],
          [-0.26, 1.3, 0.1],
        ],
        0.014,
        '#c9a777',
        { m: 'wood', seg: 2 },
      );
      for (let i = 0; i < 3; i++)
        k.lathe(
          0.1 + i * 0.1,
          0.68,
          -0.05,
          [
            [0, 0],
            [0.035, 0],
            [0.035, 0.14],
            [0.012, 0.18],
            [0.012, 0.22],
            [0, 0.22],
          ],
          ['#4ad28a', '#4a9fff', '#ff5a8a'][i],
          { m: 'gloss' },
        );
      break;
    case 'exting': {
      const [y] = hang(0.6, 0.5);
      k.lathe(
        0,
        y,
        wz + 0.11,
        [
          [0, 0],
          [0.075, 0],
          [0.08, 0.02],
          [0.08, 0.36],
          [0.05, 0.43],
          [0.025, 0.46],
          [0, 0.46],
        ],
        '#c5281f',
        { m: 'gloss', seg: 20 },
      );
      k.rbox(0, y + 0.45, wz + 0.11, 0.07, 0.05, 0.04, '#14181c', { b: 0.01 });
      k.tube(
        [
          [0.03, y + 0.46, wz + 0.12],
          [0.1, y + 0.4, wz + 0.14],
          [0.09, y + 0.2, wz + 0.14],
        ],
        0.012,
        '#14181c',
        { m: 'rubber' },
      );
      if (H > 1.6) k.box(0, y + 0.72, wz + 0.02, 0.2, 0.2, 0.006, '#c5281f', { ao: 0 });
      break;
    }
    case 'ups':
      k.rbox(0, 0, 0, 0.44, 0.86, 0.46, '#1b1f23', { b: 0.02, m: 'metal' });
      for (let i = 0; i < 5; i++) k.box(0, 0.14 + i * 0.07, 0.232, 0.34, 0.03, 0.004, '#0c0f12', { ao: 0 });
      k.box(0, 0.66, 0.234, 0.2, 0.1, 0.004, '#5affa0', { glow: true });
      break;
    case 'router':
      k.rbox(0, 0, 0, 0.36, 0.6, 0.34, '#2b3036', { b: 0.02, m: 'metal' });
      k.rbox(0, 0.6, 0, 0.3, 0.06, 0.22, '#14181c', { b: 0.02, m: 'gloss' });
      for (let i = 0; i < 4; i++) {
        k.tube(
          [
            [-0.12 + i * 0.08, 0.64, -0.08],
            [-0.16 + i * 0.107, 0.9, -0.1],
          ],
          0.009,
          '#14181c',
          { m: 'rubber', seg: 2 },
        );
        k.box(-0.09 + i * 0.06, 0.63, 0.112, 0.02, 0.01, 0.004, i % 2 ? '#5affa0' : '#4a9fff', { glow: true });
      }
      break;
    case 'generator':
      k.rbox(0, 0.12, 0, 1.8, 0.86, 0.9, '#d8a02f', { b: 0.03, m: 'paint' });
      k.rbox(0, 0, 0, 1.9, 0.12, 0.96, '#23282d', { b: 0.02, m: 'metal' });
      for (let i = 0; i < 9; i++) k.rbox(-0.5 + i * 0.09, 0.3, 0.452, 0.05, 0.5, 0.01, '#14181c', { b: 0.004 });
      k.rbox(0.6, 0.4, 0.452, 0.4, 0.4, 0.014, '#2b3036', { b: 0.01, m: 'metal' });
      k.box(0.6, 0.62, 0.462, 0.2, 0.08, 0.004, '#5affa0', { glow: true });
      k.tube(
        [
          [-0.7, 0.96, -0.2],
          [-0.7, 1.3, -0.2],
          [-0.62, 1.38, -0.2],
        ],
        0.05,
        '#5d666c',
        { m: 'metal' },
      );
      break;
    // ---------- garden
    case 'tree': {
      k.tube(
        [
          [0, 0, 0],
          [0.03, 0.5, 0.02],
          [-0.02, 1.15, 0],
          [0, 1.5, 0.02],
        ],
        0.09,
        '#5d4632',
        { m: 'wood', seg: 8, rad: 8 },
      );
      for (let i = 0; i < 4; i++)
        k.tube(
          [
            [0, 1.0 + i * 0.1, 0],
            [Math.cos(i * 1.7) * 0.3, 1.5, Math.sin(i * 1.7) * 0.3],
          ],
          0.035,
          '#5d4632',
          { m: 'wood', seg: 4, rad: 6 },
        );
      const n = k.plain ? 1 : 1;
      foliage(k, 0, 1.75, 0, 0.68 * n, ['#4f7d3f', '#5f9148', '#446f38', '#74a455'], 15);
      break;
    }
    case 'hedge':
      k.rbox(0, 0, 0, 1.9, 0.78, 0.38, '#3f6a36', { b: 0.1, ao: 0.4, m: 'leaf' });
      for (let i = 0; i < 26; i++)
        k.ico(
          -0.88 + (i % 13) * 0.146,
          0.3 + Math.floor(i / 13) * 0.42 + Math.sin(i * 3) * 0.05,
          Math.sin(i * 7) * 0.1,
          0.17,
          ['#4a7a3c', '#578a45', '#426f38'][i % 3],
          { sy: 0.9, det: 1, ao: 0.3, m: 'leaf', ry: i },
        );
      break;
    case 'flowers':
      for (const s of [-1, 1]) {
        k.rbox(0, 0, s * 0.44, 1.94, 0.24, 0.06, '#7c5636', { b: 0.012, m: 'wood' });
        k.rbox(s * 0.94, 0, 0, 0.06, 0.24, 0.86, '#7c5636', { b: 0.012, m: 'wood' });
      }
      k.box(0, 0.1, 0, 1.84, 0.1, 0.84, '#3b2a1e', { ao: 0, m: 'stone' });
      for (let i = 0; i < 22; i++) {
        const x = -0.82 + ((i * 0.618) % 1) * 1.64,
          z = -0.32 + ((i * 0.377) % 1) * 0.64;
        for (let q = 0; q < 3; q++) k.leaf(x, 0.2, z, 0.16, 0.05, q * 2.1 + i, 1.0, 1.2, '#4f8d47');
        k.tube(
          [
            [x, 0.2, z],
            [x + 0.01, 0.34 + (i % 3) * 0.04, z],
          ],
          0.006,
          '#4f8d47',
          { seg: 2, rad: 4 },
        );
        k.lathe(
          x + 0.01,
          0.33 + (i % 3) * 0.04,
          z,
          [
            [0, 0],
            [0.03, 0.02],
            [0.05, 0.05],
            [0.02, 0.04],
            [0, 0.04],
          ],
          ['#e8c35a', '#d8577a', '#f4f2ec', c1, '#a46ad0'][i % 5],
          { seg: 8, m: 'cloth' },
        );
      }
      break;
    case 'parasol':
      k.bcyl(0, 0.68, 0, 0.5, 0.03, '#e6e2da', { m: 'stone', seg: 30 });
      k.bcyl(0, 0, 0, 0.28, 0.06, '#59636b', { m: 'stone', seg: 24 });
      k.cyl(0, 0, 0, 0.025, 2.35, '#c9d0d4', { seg: 10, m: 'metal' });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        k.push(0, 0, 0, a);
        k.tube(
          [
            [0, 2.35, 0],
            [0.55, 2.2, 0],
            [0.98, 1.96, 0],
          ],
          0.01,
          '#c9d0d4',
          { m: 'metal' },
        );
        k.pop();
      }
      k.lathe(
        0,
        1.94,
        0,
        [
          [1.0, 0],
          [0.55, 0.25],
          [0, 0.43],
        ],
        c1,
        { m: 'cloth', seg: 8 },
      );
      k.lathe(
        0,
        1.93,
        0,
        [
          [0, 0.42],
          [0.55, 0.24],
          [1.0, -0.005],
        ],
        shade(c1, -0.2),
        { m: 'cloth', seg: 8 },
      );
      chair(k, 0, 0.74, PI, '#e6e2da', 0);
      chair(k, 0, -0.74, 0, '#e6e2da', 0);
      bowl(k, 0.15, 0.71, 0.1);
      break;
    case 'hoop':
      k.tube(
        [
          [0, 0, -0.4],
          [0, 2.3, -0.4],
          [0, 2.5, -0.28],
          [0, 2.5, -0.02],
        ],
        0.055,
        '#23282d',
        { m: 'metal' },
      );
      k.rbox(0, 2.1, 0.04, 0.98, 0.7, 0.03, '#eef2f2', { b: 0.01, m: 'glass' });
      k.rbox(0, 2.18, 0.06, 0.34, 0.02, 0.006, '#e8553a', { b: 0.002 });
      k.rbox(0, 2.4, 0.06, 0.34, 0.02, 0.006, '#e8553a', { b: 0.002 });
      k.tor(0, 2.2, 0.28, 0.2, 0.014, '#e8553a', { m: 'metal' });
      for (let i = 0; i < 10; i++)
        k.tube(
          [
            [Math.cos(i * 0.628) * 0.2, 2.19, 0.28 + Math.sin(i * 0.628) * 0.2],
            [Math.cos(i * 0.628 + 0.5) * 0.13, 1.92, 0.28 + Math.sin(i * 0.628 + 0.5) * 0.13],
          ],
          0.005,
          '#f4f2ec',
          { seg: 2, rad: 4 },
        );
      break;
    case 'lamppost':
      k.lathe(
        0,
        0,
        0,
        [
          [0, 0],
          [0.09, 0],
          [0.09, 0.04],
          [0.04, 0.12],
          [0.028, 0.2],
          [0.024, 1.6],
          [0.05, 1.64],
          [0, 1.66],
        ],
        '#23282d',
        { m: 'metal' },
      );
      k.sph(0, 1.8, 0, 0.15, '#ffe6b8', { glow: true, seg: 16 });
      k.lathe(
        0,
        1.92,
        0,
        [
          [0.12, 0],
          [0.06, 0.05],
          [0, 0.07],
        ],
        '#23282d',
        { m: 'metal' },
      );
      break;
    case 'sign':
      for (const x of [-0.78, 0.78]) k.rbox(x, 0, 0, 0.07, 1.3, 0.07, '#30363c', { b: 0.015, m: 'metal' });
      k.rbox(0, 0.55, 0, 1.9, 0.85, 0.09, mixc(c1, '#12171b', 0.3), { b: 0.03, m: 'metal' });
      for (let i = 0; i < 5; i++) k.rbox(-0.36 + i * 0.18, 0.88, 0.05, 0.085, 0.36, 0.02, '#f4efe2', { glow: true, b: 0.006 });
      k.rbox(0, 0.74, 0.05, 0.805, 0.07, 0.02, c2, { glow: true, b: 0.006 });
      break;
    case 'bikes':
      for (let i = 0; i < 4; i++) {
        const x = -0.75 + i * 0.5;
        k.tube(
          [
            [x - 0.08, 0, -0.38],
            [x - 0.08, 0.55, -0.38],
            [x + 0.08, 0.55, -0.38],
            [x + 0.08, 0, -0.38],
          ],
          0.016,
          STEEL,
          { m: 'metal' },
        );
        if (i === 2) continue;
        for (const z of [-0.3, 0.36]) {
          k.tor(x, 0.3, z, 0.28, 0.018, '#14181c', { rz: PI / 2, m: 'rubber' });
          k.cyl(x - 0.012, 0.3 - 0.012, z, 0.03, 0.024, STEEL, { rz: PI / 2, seg: 10, m: 'metal' });
        }
        const cc = [c1, c2, '', '#c5432f'][i];
        k.tube(
          [
            [x, 0.3, 0.36],
            [x, 0.62, 0.2],
            [x, 0.58, -0.16],
            [x, 0.3, 0.06],
            [x, 0.62, 0.2],
          ],
          0.014,
          cc,
          { m: 'gloss', seg: 16 },
        );
        k.tube(
          [
            [x, 0.3, -0.3],
            [x, 0.72, -0.16],
            [x, 0.74, -0.12],
          ],
          0.014,
          cc,
          { m: 'gloss' },
        );
        k.tube(
          [
            [x - 0.2, 0.76, -0.14],
            [x, 0.74, -0.12],
            [x + 0.2, 0.76, -0.14],
          ],
          0.012,
          '#14181c',
          { m: 'rubber' },
        );
        k.pillow(x, 0.64, 0.22, 0.12, 0.06, 0.24, '#14181c', { m: 'leather' });
      }
      break;
    default:
      k.rbox(0, 0, 0, W - 0.1, 0.6, D - 0.1, '#8a9298', { b: 0.03 });
  }
}
let seatG: THREE.BufferGeometry | null = null;
function seat() {
  if (!seatG) {
    const t = new THREE.TorusGeometry(0.15, 0.045, 10, 28);
    t.rotateX(PI / 2);
    t.scale(1, 0.5, 1.2);
    seatG = t.toNonIndexed();
  }
  return seatG;
}
/** a crown of leaf clumps */
export function foliage(k: Kit, x: number, y: number, z: number, r: number, cols: string[], n = 14) {
  if (k.plain) {
    k.clump(x, y, z, r * 1.1, cols[0], { det: 1, ao: 0.5 });
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996,
      t = (i + 0.5) / n;
    const rr = r * Math.sqrt(1 - (1 - 2 * t) * (1 - 2 * t)) * 0.72;
    k.clump(x + Math.cos(a) * rr, y + (1 - 2 * t) * r * 0.6, z + Math.sin(a) * rr, r * (0.46 + (i % 3) * 0.07), cols[i % cols.length], {
      det: Kit.q > 0.8 ? 2 : 1,
      ao: 0.45,
      jitter: 0.1,
      sy: 0.88,
      ry: i,
      v: i % 4,
    });
  }
}
void BLACKWOOD;
void DARK;
