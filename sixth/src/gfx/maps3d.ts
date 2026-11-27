/** Builds 3D battlegrounds from simulation grids. */
import * as THREE from 'three';
import { Kit, mixc, shade } from './kit.ts';
import { noise2 } from './tex.ts';
import { lowLit, type Engine } from './engine.ts';
import { Rng } from '../core/rng.ts';
import { FLOOR, LOW, TREE, WALL } from '../sim/grid.ts';
import { along, plen, type ArenaMap, type MobaMap, type P, type TacMap, type Theme } from '../sim/maps.ts';
export interface Pal {
  floor: string;
  floor2: string;
  wall: string[];
  top: string[];
  trim: string;
  accent: string;
  glow: string;
  sun: string;
  sky: string;
  ground: string;
  fog: string;
  sunI: number;
}
export const PAL: Record<Theme, Pal> = {
  desert: {
    floor: '#cfae7e',
    floor2: '#b98f5d',
    wall: ['#dcbf93', '#cfa878', '#e2c9a0'],
    top: ['#e6cfa6', '#d6b98a', '#c9a677'],
    trim: '#8a5a36',
    accent: '#2f7f86',
    glow: '#ffd08a',
    sun: '#ffe2b0',
    sky: '#bcd7e8',
    ground: '#8a6a45',
    fog: '#20160e',
    sunI: 3.1,
  },
  industry: {
    floor: '#7d848a',
    floor2: '#666d74',
    wall: ['#a65a41', '#8f959a', '#b06a4a'],
    top: ['#5e656c', '#6b7178', '#545b62'],
    trim: '#e3b341',
    accent: '#2d6e8e',
    glow: '#ffc35a',
    sun: '#f1f0ff',
    sky: '#b9cbe0',
    ground: '#5b5650',
    fog: '#10151a',
    sunI: 2.6,
  },
  temple: {
    floor: '#a9bdb6',
    floor2: '#8ba39c',
    wall: ['#e9e3d3', '#ddd5c1', '#f0ebde'],
    top: ['#3d7f79', '#34706b', '#478c85'],
    trim: '#d6aa52',
    accent: '#c65a6a',
    glow: '#6ff0e2',
    sun: '#fff0dc',
    sky: '#c9e2ea',
    ground: '#5c7a70',
    fog: '#0d1a1b',
    sunI: 2.8,
  },
  terrace: {
    floor: '#c8b892',
    floor2: '#b3a27c',
    wall: ['#f1e5cd', '#e8d6b6', '#f6eddc'],
    top: ['#c8673f', '#b95a37', '#d27a4e'],
    trim: '#6f8f52',
    accent: '#3f79a8',
    glow: '#ffe0a0',
    sun: '#ffe9c4',
    sky: '#c3def2',
    ground: '#86784f',
    fog: '#14160e',
    sunI: 3,
  },
  vale: {
    floor: '#6f8f4a',
    floor2: '#5a7a3d',
    wall: ['#4a6b35', '#3e5d30', '#587a3c'],
    top: ['#4f7a38'],
    trim: '#a08558',
    accent: '#d8c48a',
    glow: '#9fe05a',
    sun: '#fff0c8',
    sky: '#c8e2f0',
    ground: '#4a5a32',
    fog: '#0c150d',
    sunI: 2.7,
  },
  ashen: {
    floor: '#8a8598',
    floor2: '#6f6a82',
    wall: ['#7a4f8a', '#5f4480', '#8a5a78'],
    top: ['#6f4a84'],
    trim: '#b5a5c0',
    accent: '#d8a4c4',
    glow: '#c87aff',
    sun: '#ffd8e4',
    sky: '#b9a8d8',
    ground: '#4a4258',
    fog: '#130d1a',
    sunI: 2.5,
  },
  orbital: {
    floor: '#4a5768',
    floor2: '#3d4a5a',
    wall: ['#d4dbe3', '#c2cbd5', '#e3e8ee'],
    top: ['#8f9dad', '#7f8d9e', '#a2afbd'],
    trim: '#ff9d3a',
    accent: '#2f6fd0',
    glow: '#7fd6ff',
    sun: '#eef4ff',
    sky: '#a9c4ea',
    ground: '#3a4150',
    fog: '#0a1018',
    sunI: 2.7,
  },
  harbour: {
    floor: '#868e94',
    floor2: '#757d84',
    wall: ['#b5483a', '#2f6d92', '#d9a53c', '#4c8a63'],
    top: ['#5a666f', '#66727b', '#4f5b64'],
    trim: '#f0c14a',
    accent: '#2f6d92',
    glow: '#ffd88a',
    sun: '#ffe8cc',
    sky: '#b8d2e4',
    ground: '#515a60',
    fog: '#0d141a',
    sunI: 2.9,
  },
};
let LOWSEG = 7,
  FLAT = false;
export interface Built {
  group: THREE.Group;
  w: number;
  h: number;
  update?: (dt: number, t: number, sim: any) => void;
  pal: Pal;
}
function canvasTex(e: Engine, w: number, h: number, f: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  f(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = e.rich ? 8 : e.q === 'low' ? 1 : 2;
  t.generateMipmaps = true;
  return t;
}
const hx = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function groundTex(e: Engine, m: TacMap | ArenaMap, pal: Pal): THREE.Texture {
  const g0 = m.grid,
    px = e.rich ? 18 : e.q === 'medium' ? 14 : 11;
  const N = noise2(m.id.length * 7 + 3);
  const D = new Float32Array(g0.W * g0.H).fill(9);
  for (let y = 0; y < g0.H; y++)
    for (let x = 0; x < g0.W; x++) {
      if (g0.at(x, y) !== FLOOR) {
        D[y * g0.W + x] = 0;
        continue;
      }
      let b = 9;
      for (let oy = -3; oy <= 3; oy++)
        for (let ox = -3; ox <= 3; ox++) if (g0.at(x + ox, y + oy) !== FLOOR) b = Math.min(b, Math.hypot(ox, oy));
      D[y * g0.W + x] = b;
    }
  return canvasTex(e, g0.W * px, g0.H * px, g => {
    const W = g0.W * px,
      H = g0.H * px,
      im = g.createImageData(W, H),
      A = hx(pal.floor),
      C = hx(pal.floor2);
    const SHQ = 4,
      shd = e.q === 'low' ? new Float32Array(g0.W * SHQ * g0.H * SHQ).fill(1) : null;
    if (shd) {
      const bx = new Map<number, number>();
      for (const b of m.boxes)
        for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) bx.set(y * g0.W + x, b[4] === 2 ? 1.6 : 0.85);
      for (let y = 0; y < g0.H * SHQ; y++)
        for (let x = 0; x < g0.W * SHQ; x++) {
          const wx = (x + 0.5) / SHQ,
            wy = (y + 0.5) / SHQ;
          if (g0.atp(wx, wy) !== FLOOR) continue;
          for (let d = 0.2; d < 2.2; d += 0.2) {
            const X = Math.floor(wx - (0.42 * d) / 0.84),
              Y = Math.floor(wy + (0.3 * d) / 0.84);
            const c = g0.at(X, Y);
            if (c === FLOOR) continue;
            const hh = bx.get(Y * g0.W + X) ?? (c === WALL ? (g0.at(X, Y - 1) !== WALL || g0.at(X, Y - 2) !== WALL ? 1.15 : 3) : 0.85);
            if (hh > d) {
              shd[y * g0.W * SHQ + x] = 0.66;
              break;
            }
          }
        }
    }
    const tile = m.theme === 'desert' ? 0 : m.theme === 'industry' || m.theme === 'harbour' ? 4 : 2;
    const dv = (x: number, y: number) => {
      const X = Math.max(0, Math.min(g0.W - 1, x)),
        Y = Math.max(0, Math.min(g0.H - 1, y));
      return D[Y * g0.W + X];
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wx = x / px,
          wy = y / px;
        const n = N(wx * 0.35, wy * 0.35),
          n2 = N(wx * 2.2 + 40, wy * 2.2);
        let k = n * 0.75 + n2 * 0.25;
        let sh = 0.9 + n2 * 0.2;
        const fx = wx - 0.5,
          fy = wy - 0.5,
          X = Math.floor(fx),
          Y = Math.floor(fy),
          a = fx - X,
          b = fy - Y;
        const d = (dv(X, Y) * (1 - a) + dv(X + 1, Y) * a) * (1 - b) + (dv(X, Y + 1) * (1 - a) + dv(X + 1, Y + 1) * a) * b;
        sh *= 0.5 + 0.5 * Math.min(1, d / 1.9);
        if (shd) {
          const qx = Math.min(g0.W * SHQ - 2, Math.max(0, wx * SHQ - 0.5)),
            qy = Math.min(g0.H * SHQ - 2, Math.max(0, wy * SHQ - 0.5));
          const QX = Math.floor(qx),
            QY = Math.floor(qy),
            u = qx - QX,
            w = qy - QY,
            sw = g0.W * SHQ;
          sh *=
            (shd[QY * sw + QX] * (1 - u) + shd[QY * sw + QX + 1] * u) * (1 - w) +
            (shd[(QY + 1) * sw + QX] * (1 - u) + shd[(QY + 1) * sw + QX + 1] * u) * w;
        }
        if (tile) {
          const tx = (wx + (tile === 2 && Math.floor(wy / tile) % 2 ? tile / 2 : 0)) % tile,
            ty = wy % tile;
          const ed = Math.min(tx, tile - tx, ty, tile - ty);
          if (ed < 0.05) sh *= 0.78;
          const cell =
            Math.sin(Math.floor((wx + (Math.floor(wy / tile) % 2 ? tile / 2 : 0)) / tile) * 12.9 + Math.floor(wy / tile) * 78.2) * 43758.5;
          k = k * 0.6 + (cell - Math.floor(cell)) * 0.4;
        }
        const i = (y * W + x) * 4;
        for (let q = 0; q < 3; q++) im.data[i + q] = Math.min(255, (A[q] + (C[q] - A[q]) * k) * sh);
        im.data[i + 3] = 255;
      }
    g.putImageData(im, 0, 0);
    g.save();
    g.scale(px, px);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (m.kind === 'tac') {
      for (const s of ['A', 'B'] as const) {
        const S = m.sites[s];
        const [x1, y1, x2, y2] = S.rect;
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 0.16;
        g.setLineDash([1, 0.6]);
        g.strokeRect(x1 + 0.6, y1 + 0.6, x2 - x1 - 1.2, y2 - y1 - 1.2);
        g.setLineDash([]);
        g.globalAlpha = 0.5;
        g.fillStyle = pal.accent;
        g.beginPath();
        g.arc(S.plant[0], S.plant[1], 2.6, 0, 7);
        g.fill();
        g.globalAlpha = 0.95;
        g.fillStyle = '#fff';
        g.font = '900 3.6px "Anybody Variable", sans-serif';
        g.fillText(s, S.plant[0], S.plant[1] + 0.15);
        g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.font = '700 1.25px "Sofia Sans Variable", sans-serif';
      for (const [n, x, y] of m.zones) if (!/site/.test(n)) g.fillText(n.toUpperCase(), x, y + 1.4);
    } else {
      g.strokeStyle = 'rgba(255,255,255,.28)';
      g.lineWidth = 0.14;
      if (m.path) {
        g.strokeStyle = pal.trim;
        g.globalAlpha = 0.55;
        g.lineWidth = 0.28;
        for (const o of [-1.1, 1.1]) {
          g.beginPath();
          const L = plen(m.path);
          for (let d = 0; d <= L; d += 1) {
            const p = along(m.path, d),
              q = along(m.path, Math.min(L, d + 0.5)),
              an = Math.atan2(q[1] - p[1], q[0] - p[0]);
            const X = p[0] - Math.sin(an) * o,
              Y = p[1] + Math.cos(an) * o;
            d === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      } else {
        for (const r of [m.pr, m.pr + 3]) {
          g.beginPath();
          g.arc(m.point[0], m.point[1], r, 0, 7);
          g.stroke();
        }
      }
    }
    g.restore();
  });
}
function wallsKit(m: TacMap | ArenaMap, pal: Pal, k: Kit, r: Rng, low: boolean) {
  const g = m.grid,
    W = g.W,
    H = g.H;
  const isBox = new Set<number>();
  for (const b of m.boxes) for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) isBox.add(y * W + x);
  const wall = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? g.at(x, y) === WALL && !isBox.has(y * W + x) : true);
  const N = noise2(m.id.charCodeAt(0) * 3 + m.id.length);
  const cls = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      let nearF = false;
      for (let q = 1; q <= 2; q++) if (y - q >= 0 && !wall(x, y - q)) nearF = true;
      const b = Math.floor(N(Math.floor(x / 6) * 3.7, Math.floor(y / 5) * 3.1) * 2.99);
      cls[y * W + x] = nearF ? 3 : b;
    }
  const used = new Uint8Array(W * H);
  const hgt = [2.5, 3.1, 3.8, 1.15];
  k.mk = 'stone';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cls[i] < 0 || used[i]) continue;
      const c = cls[i],
        bx = Math.floor(x / 6),
        by = Math.floor(y / 5);
      const same = (X: number, Y: number) =>
        X < W && Y < H && !used[Y * W + X] && cls[Y * W + X] === c && (c === 3 || (Math.floor(X / 6) === bx && Math.floor(Y / 5) === by));
      let w = 1;
      while (same(x + w, y)) w++;
      let h = 1;
      outer: for (;;) {
        for (let q = 0; q < w; q++) if (!same(x + q, y + h)) break outer;
        h++;
      }
      for (let Y = y; Y < y + h; Y++) for (let X = x; X < x + w; X++) used[Y * W + X] = 1;
      const H0 = hgt[c];
      const wc = pal.wall[(bx * 7 + by * 3) % pal.wall.length],
        tc = pal.top[(bx * 5 + by * 11) % pal.top.length];
      k.box(x + w / 2, 0, y + h / 2, w, H0, h, wc, { ao: 0.42 });
      k.box(x + w / 2, H0, y + h / 2, w, 0.06, h, tc, { ao: 0 });
      if (c !== 3 && w >= 3 && h >= 3 && (!low || (w > 4 && h > 3))) {
        roof(k, m.theme, pal, r, x + w / 2, H0 + 0.06, y + h / 2, w, h);
      }
    }
  const runs = () => {
    const t = 0.16;
    const edge = (x: number, y: number, ox: number, oy: number) =>
      wall(x, y) && x + ox >= 0 && y + oy >= 0 && x + ox < W && y + oy < H && !wall(x + ox, y + oy);
    for (const oy of [1, -1])
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W;) {
          if (!edge(x, y, 0, oy)) {
            x++;
            continue;
          }
          const h0 = hgt[cls[y * W + x]];
          let n = 1;
          while (x + n < W && edge(x + n, y, 0, oy) && hgt[cls[y * W + x + n]] === h0) n++;
          k.box(x + n / 2, h0, oy > 0 ? y + 1 - t / 2 : y + t / 2, n, 0.16, t, pal.trim, { ao: 0 });
          x += n;
        }
    for (const ox of [1, -1])
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H;) {
          if (!edge(x, y, ox, 0)) {
            y++;
            continue;
          }
          const h0 = hgt[cls[y * W + x]];
          let n = 1;
          while (y + n < H && edge(x, y + n, ox, 0) && hgt[cls[(y + n) * W + x]] === h0) n++;
          k.box(ox > 0 ? x + 1 - t / 2 : x + t / 2, h0, y + n / 2, t, 0.16, n, pal.trim, { ao: 0 });
          y += n;
        }
  };
  // edges: parapets and facade detail facing the camera
  const doors: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      const H0 = hgt[cls[y * W + x]];
      void H0;
      if (y + 1 < H && !wall(x, y + 1)) {
        if (cls[y * W + x] !== 3) {
          const q = (x * 7 + y * 13) % 11;
          if (q === 2) {
            k.box(x + 0.5, 0.95, y + 1.01, 0.72, 0.95, 0.08, pal.accent, { ao: 0.1 });
            k.box(x + 0.5, 1.05, y + 1.05, 0.52, 0.75, 0.04, '#1d2a33', { ao: 0 });
          } else if (q === 6) {
            k.box(x + 0.5, 0, y + 1.0, 0.9, 1.9, 0.1, mixc(pal.accent, '#101418', 0.25), { ao: 0.2 });
            doors.push([x, y]);
            k.box(x + 0.5, 1.95, y + 1.18, 1.3, 0.09, 0.5, pal.trim, { ao: 0 });
          } else if (q === 9) {
            k.box(x + 0.5, 2.0, y + 1.08, 0.14, 0.14, 0.2, '#2a2520');
            k.sph(x + 0.5, 1.95, y + 1.2, 0.11, pal.glow, { glow: true, seg: 6 });
          }
        }
      }
    }
  runs();
  for (const b of m.boxes) {
    const w = b[2] - b[0],
      d = b[3] - b[1],
      cx = (b[0] + b[2]) / 2,
      cz = (b[1] + b[3]) / 2;
    if (b[4] === 2) crate(k, m.theme, pal, r, cx, cz, w, d);
    else cover(k, m.theme, pal, r, cx, cz, w, d);
  }
  // loose props are part of the map and solid
  for (const p of g.statics) small(k, m.theme, pal, p.x, p.y, p.q);
}
function roof(k: Kit, th: Theme, pal: Pal, r: Rng, x: number, y: number, z: number, w: number, d: number) {
  k.mk = th === 'orbital' ? 'paint' : 'stone';
  const q = r.f();
  const ox = (r.f() - 0.5) * (w - 2),
    oz = (r.f() - 0.5) * (d - 2);
  if (th === 'desert') {
    if (q < 0.22) {
      k.sph(x, y, z, Math.min(w, d) * 0.32, shade(pal.wall[0], 0.15), { seg: 14 });
      k.cone(x, y + Math.min(w, d) * 0.3, z, 0.08, 0.5, pal.trim);
    } else if (q < 0.5) {
      k.cyl(x + ox * 0.4, y, z + oz * 0.4, 0.5, 0.9, '#9aa0a0', { seg: 10 });
      k.cyl(x + ox * 0.4, y + 0.9, z + oz * 0.4, 0.52, 0.06, '#77706a', { seg: 10 });
    } else if (q < 0.75) {
      for (let i = 0; i < 4; i++)
        k.box(x - w * 0.3 + i * w * 0.2, y + 0.4, z, 0.5, 0.5, 0.03, ['#c65a4a', '#e6dccb', '#3f7f9a', '#e0b14a'][i], { ao: 0.1 });
      k.box(x, y + 0.9, z, w * 0.75, 0.02, 0.02, '#555');
    } else k.box(x + ox * 0.5, y, z + oz * 0.5, 1.2, 0.08, 0.9, pal.accent, { ry: 0.3 });
  } else if (th === 'industry' || th === 'harbour') {
    k.box(x + ox * 0.5, y, z + oz * 0.5, 1.1, 0.55, 0.9, '#a9b0b5');
    k.cyl(x + ox * 0.5, y + 0.55, z + oz * 0.5, 0.34, 0.06, '#3a4046', { seg: 12 });
    if (q < 0.35) {
      k.cyl(x - ox * 0.5, y, z - oz * 0.5, 0.2, 1.5, '#8b9196', { seg: 8 });
      k.cyl(x - ox * 0.5, y + 1.5, z - oz * 0.5, 0.26, 0.1, '#5a6066', { seg: 8 });
    }
    if (q > 0.7) for (let i = 0; i < 3; i++) k.box(x - 0.8 + i * 0.8, y, z, 0.5, 0.12, d * 0.7, shade(pal.top[0], 0.12));
  } else if (th === 'temple') {
    // on slow machines the photograph from above already shows the ribs
    for (let i = 0; !FLAT && i < Math.floor(d / 0.8); i++)
      k.box(x, y, z - d / 2 + 0.4 + i * 0.8, w * 0.96, 0.09, 0.16, shade(pal.top[0], i % 2 ? 0.06 : -0.12), { ao: 0 });
    if (q < 0.3) {
      k.cyl(x, y, z, 0.5, 0.3, pal.trim, { seg: 8 });
      k.cone(x, y + 0.3, z, 0.62, 0.6, pal.top[1], { seg: 8 });
      k.sph(x, y + 0.98, z, 0.1, pal.glow, { glow: true });
    }
  } else if (th === 'terrace') {
    for (let i = 0; !FLAT && i < Math.floor(w / 0.7); i++)
      k.box(x - w / 2 + 0.35 + i * 0.7, y, z, 0.28, 0.1, d * 0.98, shade(pal.top[i % 3], -0.06), { ao: 0 });
    if (q < 0.4) {
      k.box(x + ox * 0.5, y, z + oz * 0.5, 0.6, 0.9, 0.6, pal.wall[0]);
      k.box(x + ox * 0.5, y + 0.9, z + oz * 0.5, 0.75, 0.1, 0.75, pal.top[1]);
    }
  } else {
    k.box(x, y, z, w * 0.7, 0.14, d * 0.7, shade(pal.top[0], 0.1));
    k.box(x, y + 0.14, z, w * 0.3, 0.04, d * 0.3, pal.glow, { glow: true });
    if (q < 0.4) {
      k.cyl(x + ox * 0.6, y, z + oz * 0.6, 0.08, 1.2, '#c8d0d8');
      k.sph(x + ox * 0.6, y + 1.3, z + oz * 0.6, 0.3, '#e8edf2', { sy: 0.5 });
    }
  }
}
function crate(k: Kit, th: Theme, pal: Pal, r: Rng, x: number, z: number, w: number, d: number) {
  k.mk = null;
  if (th === 'harbour' || th === 'industry') {
    const c = pal.wall[r.int(0, pal.wall.length - 1)];
    k.rbox(x, 0, z, w - 0.1, 1.9, d - 0.1, c, { b: 0.06 });
    const n = Math.floor(w / 0.4);
    for (let i = 0; i < n; i++) k.box(x - w / 2 + 0.25 + i * 0.4, 0.12, z + d / 2 - 0.04, 0.1, 1.66, 0.06, shade(c, -0.2), { ao: 0 });
    k.box(x, 1.9, z, w - 0.3, 0.05, 0.12, shade(c, 0.12));
    return;
  }
  if (th === 'orbital') {
    k.rbox(x, 0, z, w - 0.1, 1.8, d - 0.1, '#dfe5eb', { b: 0.14 });
    k.box(x, 0.8, z + d / 2 - 0.03, w * 0.7, 0.14, 0.02, pal.glow, { glow: true });
    k.box(x, 1.8, z, w * 0.5, 0.04, d * 0.5, pal.trim);
    return;
  }
  if (th === 'temple') {
    k.rbox(x, 0, z, w - 0.1, 0.3, d - 0.1, pal.trim, { b: 0.05 });
    k.rbox(x, 0.3, z, w - 0.4, 1.4, d - 0.4, pal.wall[0], { b: 0.06 });
    k.rbox(x, 1.7, z, w - 0.1, 0.22, d - 0.1, pal.top[0], { b: 0.05 });
    k.sph(x, 2.15, z, 0.26, pal.glow, { glow: true });
    return;
  }
  const c = th === 'terrace' ? '#9a6b42' : '#a8763f';
  for (let i = 0; i < w; i += 1.5)
    for (let j = 0; j < d; j += 1.5) {
      const sx = Math.min(1.46, w - i - 0.04),
        sz = Math.min(1.46, d - j - 0.04);
      const X = x - w / 2 + i + 0.02 + sx / 2,
        Z = z - d / 2 + j + 0.02 + sz / 2,
        h = 1.35 + r.f() * 0.5;
      k.rbox(X, 0, Z, sx, h, sz, c, { b: 0.05, jitter: 0.2 });
      for (const e of [-1, 1]) {
        k.box(X + e * (sx / 2 - 0.08), 0.02, Z + sz / 2 + 0.005, 0.13, h - 0.04, 0.03, shade(c, -0.28), { ao: 0 });
        k.box(X, e > 0 ? h - 0.14 : 0.02, Z + sz / 2 + 0.005, sx, 0.13, 0.03, shade(c, -0.28), { ao: 0 });
      }
      k.box(X, h, Z, sx * 0.9, 0.02, 0.1, shade(c, -0.2), { ry: 0.7, ao: 0 });
    }
}
function cover(k: Kit, th: Theme, pal: Pal, r: Rng, x: number, z: number, w: number, d: number) {
  k.mk = null;
  if (th === 'desert' || th === 'terrace') {
    if (th === 'terrace') {
      k.rbox(x, 0, z, w - 0.1, 0.6, d - 0.1, pal.wall[1], { b: 0.05 });
      for (let i = 0; i < 5; i++)
        k.ico(x + (r.f() - 0.5) * (w - 0.5), 0.72, z + (r.f() - 0.5) * (d - 0.4), 0.28 + r.f() * 0.12, i % 2 ? '#7c9f4f' : '#5d8a45', {
          jitter: 0.2,
        });
      k.ico(x, 0.95, z, 0.14, '#e78aa4');
      return;
    }
    for (let l = 0; l < 3; l++)
      for (let i = 0; i < Math.ceil(w / 0.55); i++)
        for (let j = 0; j < Math.max(1, Math.floor(d / 0.9)); j++)
          k.sph(
            x - w / 2 + 0.3 + i * 0.55 - (l % 2) * 0.1,
            0.16 + l * 0.26,
            z - d / 2 + 0.5 + j * 0.9,
            0.3,
            l % 2 ? '#b79a68' : '#c4a975',
            { sy: 0.5, sz: 1.25, seg: LOWSEG, jitter: 0.15 },
          );
    return;
  }
  if (th === 'harbour' || th === 'industry') {
    for (let i = 0; i < Math.ceil(w / 0.7); i++) {
      const c = ['#c2483a', '#3f7f9a', '#d9a53c'][r.int(0, 2)];
      const X = x - w / 2 + 0.36 + i * 0.7;
      k.cyl(X, 0, z, 0.31, 0.92, c, { seg: 10 });
      k.cyl(X, 0.3, z, 0.325, 0.06, shade(c, -0.25), { seg: 10 });
      k.cyl(X, 0.62, z, 0.325, 0.06, shade(c, -0.25), { seg: 10 });
    }
    return;
  }
  k.rbox(x, 0, z, w - 0.08, 0.85, d - 0.08, th === 'temple' ? pal.wall[1] : '#b9c4cf', { b: 0.1 });
  k.box(x, 0.86, z, w * 0.8, 0.03, Math.min(0.12, d * 0.5), th === 'temple' ? pal.trim : pal.glow, { glow: th !== 'temple' });
}
function small(k: Kit, th: Theme, pal: Pal, x: number, z: number, q: number) {
  k.mk = null;
  if (th === 'desert') {
    if (q % 2) {
      k.cyl(x, 0, z, 0.2, 0.42, '#b0643c', { r2: 0.26, seg: 8 });
      k.ico(x, 0.6, z, 0.24, '#6f8a45');
    } else k.cyl(x, 0, z, 0.26, 0.7, '#7a6a58', { seg: 9 });
  } else if (th === 'temple') {
    k.cyl(x, 0, z, 0.16, 0.7, pal.wall[0], { seg: 8 });
    k.sph(x, 0.85, z, 0.14, pal.glow, { glow: true, seg: 8 });
  } else if (th === 'terrace') {
    k.cyl(x, 0, z, 0.22, 0.36, '#b5654a', { r2: 0.28, seg: 8 });
    k.ico(x, 0.58, z, 0.3, q % 2 ? '#6d9a4c' : '#d7798f');
  } else if (th === 'orbital') {
    k.rbox(x, 0, z, 0.4, 0.55, 0.4, '#aeb9c5', { b: 0.08 });
    k.box(x, 0.4, z + 0.2, 0.24, 0.06, 0.02, pal.glow, { glow: true });
  } else {
    if (q % 2) k.box(x, 0, z, 0.5, 0.45, 0.5, '#8a6a44', { ry: q });
    else k.cyl(x, 0, z, 0.1, 0.7, '#e0722f', { r2: 0.04, seg: 8 });
  }
}
export function buildTac(e: Engine, m: TacMap | ArenaMap): Built {
  FLAT = e.q === 'low';
  LOWSEG = FLAT ? 5 : 7;
  const pal = PAL[m.theme],
    g = new THREE.Group(),
    r = Rng.of('map' + m.id),
    k = new Kit();
  const W = m.grid.W,
    H = m.grid.H;
  k.plain = e.q === 'low';
  wallsKit(m, pal, k, r, false);
  const wm = new THREE.Mesh(k.geo(), e.mat({ vc: true, rough: 0.86 }));
  wm.castShadow = wm.receiveShadow = true;
  g.add(wm);
  const gl = k.glow();
  if (gl)
    g.add(
      new THREE.Mesh(gl, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8) })),
    );
  const ft = groundTex(e, m, pal);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), e.mat({ map: ft, rough: 0.92 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(W / 2, 0, H / 2);
  fl.receiveShadow = true;
  g.add(fl);
  const b: Built = { group: g, w: W, h: H, pal };
  if (m.kind === 'arena') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(m.pr - 0.5, m.pr, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }),
    );
    ring.position.set(m.point[0], 0.05, m.point[1]);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(m.pr - 0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }),
    );
    disc.position.set(m.point[0], 0.04, m.point[1]);
    g.add(ring, disc);
    let cart: THREE.Group | null = null;
    if (m.path) {
      cart = new THREE.Group();
      const c = new Kit();
      c.rbox(0, 0.35, 0, 2.2, 0.7, 3.2, '#dfe4e8', { b: 0.2 });
      c.rbox(0, 1.05, -0.6, 1.5, 0.8, 1.4, '#49555f', { b: 0.2 });
      c.box(0, 1.1, 0.7, 1.6, 0.08, 1.2, '#f0c14a');
      c.sph(0, 1.55, 0.7, 0.42, '#7fe0ff', { glow: true, seg: 12 });
      c.tor(0, 1.55, 0.7, 0.62, 0.06, '#f0c14a');
      for (const x of [-1, 1]) for (const z of [-1.1, 0, 1.1]) c.cyl(x * 1.02, 0.12, z, 0.3, 0.2, '#22272c', { rz: Math.PI / 2, seg: 12 });
      c.box(0, 0.5, 1.62, 1.7, 0.12, 0.02, '#7fe0ff', { glow: true });
      c.box(0, 0.5, -1.62, 1.7, 0.12, 0.02, '#ff8a5a', { glow: true });
      const cm = new THREE.Mesh(c.geo(), e.mat({ vc: true, rough: 0.5 }));
      cm.castShadow = true;
      cart.add(
        cm,
        new THREE.Mesh(
          c.glow()!,
          new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8) }),
        ),
      );
      g.add(cart);
    }
    b.update = (_dt, t, sim) => {
      const o = sim.objPos();
      ring.position.x = disc.position.x = o[0];
      ring.position.z = disc.position.z = o[1];
      const own = sim.escort() ? sim.atk : sim.own;
      const col = sim.contested ? '#ffe08a' : own < 0 ? '#ffffff' : sim.cfg.teams[own].c1;
      (ring.material as THREE.MeshBasicMaterial).color.set(col).lerp(new THREE.Color('#fff'), 0.25);
      (disc.material as THREE.MeshBasicMaterial).color.set(col);
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.14 + (sim.contested ? Math.abs(Math.sin(t * 6)) * 0.18 : 0.05);
      if (cart && m.path) {
        const p = along(m.path, sim.cart),
          q = along(m.path, Math.min(sim.pathLen, sim.cart + 0.6));
        cart.position.set(p[0], 0, p[1]);
        const a = Math.atan2(q[0] - p[0], q[1] - p[1]);
        let d = a - cart.rotation.y;
        d -= Math.round(d / 6.283) * 6.283;
        cart.rotation.y += d * 0.1;
      }
    };
  }
  return b;
}
export function buildMoba(e: Engine, m: MobaMap): Built {
  const pal = PAL[m.theme],
    g = new THREE.Group(),
    G = m.grid,
    S = G.w;
  const low = e.q === 'low';
  const N = noise2(m.id.length * 5),
    px = e.rich ? 14 : low ? 7 : 10,
    T = S * px;
  const distPoly = (poly: P[], x: number, y: number) => {
    let b = 1e9;
    for (let i = 0; i + 1 < poly.length; i++) {
      const [x0, y0] = poly[i],
        dx = poly[i + 1][0] - x0,
        dy = poly[i + 1][1] - y0;
      let u = ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = x0 + dx * u - x,
        ey = y0 + dy * u - y;
      const d = ex * ex + ey * ey;
      if (d < b) b = d;
    }
    return Math.sqrt(b);
  };
  const cs = 2,
    fld: Float32Array[] = [0, 1, 2, 3].map(() => new Float32Array((S / cs + 1) ** 2));
  const wd = S / cs + 1;
  for (let y = 0; y < wd; y++)
    for (let x = 0; x < wd; x++) {
      const wx = x * cs,
        wy = y * cs;
      {
        let a = 0;
        for (let oy = -2; oy <= 2; oy += 2)
          for (let ox = -2; ox <= 2; ox += 2)
            if (G.atp(Math.max(0, Math.min(S - 0.1, wx + ox)), Math.max(0, Math.min(S - 0.1, wy + oy))) === TREE) a++;
        fld[3][y * wd + x] = a / 9;
      }
      fld[0][y * wd + x] = Math.min(...m.lanes.map(l => distPoly(l, wx, wy)));
      fld[1][y * wd + x] = distPoly(m.river, wx, wy);
      fld[2][y * wd + x] = Math.min(Math.hypot(wx - m.base[0][0], wy - m.base[0][1]), Math.hypot(wx - m.base[1][0], wy - m.base[1][1]));
    }
  const smp = (f: Float32Array, x: number, y: number) => {
    const fx = x / cs,
      fy = y / cs,
      X = Math.min(wd - 2, Math.floor(fx)),
      Y = Math.min(wd - 2, Math.floor(fy)),
      a = fx - X,
      b = fy - Y;
    return (f[Y * wd + X] * (1 - a) + f[Y * wd + X + 1] * a) * (1 - b) + (f[(Y + 1) * wd + X] * (1 - a) + f[(Y + 1) * wd + X + 1] * a) * b;
  };
  const A = hx(pal.floor),
    B2 = hx(pal.floor2),
    C = hx(pal.trim),
    RV = hx(m.theme === 'ashen' ? '#4a3a5f' : '#5c7a72'),
    ST = hx(m.theme === 'ashen' ? '#837a92' : '#a8a08c');
  const tex = canvasTex(e, T, T, c => {
    const im = c.createImageData(T, T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const wx = x / px,
          wy = y / px,
          n = N(wx * 0.14, wy * 0.14),
          n2 = N(wx * 1.1 + 9, wy * 1.1);
        const ln = smp(fld[0], wx, wy) + (n2 - 0.5) * 2.4,
          rv = smp(fld[1], wx, wy) + (n - 0.5) * 2,
          bs = smp(fld[2], wx, wy);
        let col = [0, 1, 2].map(q => A[q] + (B2[q] - A[q]) * n);
        let k = Math.max(0, Math.min(1, (4.2 - ln) / 1.6));
        col = col.map((v, q) => v + (C[q] - v) * k * 0.85);
        k = Math.max(0, Math.min(1, (5.4 - rv) / 1.4));
        col = col.map((v, q) => v + (RV[q] - v) * k);
        k = Math.max(0, Math.min(1, (19 - bs) / 2));
        const sx = wx % 3,
          sy = wy % 3;
        const stone = Math.min(sx, sy, 3 - sx, 3 - sy) < 0.1 ? 0.75 : 1;
        col = col.map((v, q) => v + (ST[q] * stone - v) * k * 0.85);
        const tr = smp(fld[3], wx, wy) * 5;
        const sh = (0.86 + n2 * 0.26) * (1 - tr * 0.1);
        const i = (y * T + x) * 4;
        im.data[i] = col[0] * sh;
        im.data[i + 1] = col[1] * sh;
        im.data[i + 2] = col[2] * sh;
        im.data[i + 3] = 255;
      }
    c.putImageData(im, 0, 0);
  });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(S, S), e.mat({ map: tex, rough: 0.95 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(S / 2, 0, S / 2);
  fl.receiveShadow = true;
  g.add(fl);
  // trees
  const r = Rng.of('trees' + m.id);
  const spots: [number, number, number][] = [];
  for (let y = 0; y < G.H; y++)
    for (let x = 0; x < G.W; x++) {
      if (G.at(x, y) !== TREE) continue;
      let near = 9;
      for (let oy = -2; oy <= 2; oy++)
        for (let ox = -2; ox <= 2; ox++)
          if (G.at(x + ox, y + oy) === FLOOR && x + ox >= 0 && y + oy >= 0 && x + ox < G.W && y + oy < G.H)
            near = Math.min(near, Math.hypot(ox, oy));
      if (low && near > 2.3 && (x + y) % 2) continue;
      // canopies on the edge of a path stay inside their own cell, so heroes never walk through leaves
      if (near < 1.5) spots.push([x * 2 + 0.85 + r.f() * 0.3, y * 2 + 0.85 + r.f() * 0.3, 0.72 + r.f() * 0.1]);
      else spots.push([x * 2 + 0.4 + r.f() * 1.2, y * 2 + 0.4 + r.f() * 1.2, 1.15 * (0.8 + r.f() * 0.45)]);
      if (!low && near > 1.9 && near < 3 && r.chance(0.6)) spots.push([x * 2 + 0.5 + r.f(), y * 2 + 0.5 + r.f(), 0.6 + r.f() * 0.3]);
    }
  const kinds = [0, 1, 2].map(q => {
    const k = new Kit();
    const c = pal.wall[q % pal.wall.length];
    const bark = m.theme === 'ashen' ? '#3d3445' : '#5a4330';
    if (!low)
      k.tube(
        [
          [0, 0, 0],
          [0.05, 0.5, 0.02],
          [0, 1.2, 0],
        ],
        0.17,
        bark,
        { m: 'wood', seg: 5, rad: 6 },
      );
    if (q === 1) {
      // a fir: skirts of needles, each a little off
      for (let i = 0; i < (low ? 2 : 5); i++) {
        const t = i / (low ? 2 : 5);
        k.lathe(
          Math.sin(i * 2) * 0.04,
          0.5 + t * 2.0,
          Math.cos(i * 2) * 0.04,
          low
            ? [
                [1.08 * (1 - t * 0.7), 0],
                [0.42 * (1 - t * 0.6), 0.8],
                [0.02, 1.5],
              ]
            : [
                [1.12 * (1 - t * 0.8), 0],
                [0.8 * (1 - t * 0.8), 0.22],
                [0.34 * (1 - t * 0.7), 0.75],
                [0.02, 1.05],
              ],
          shade(c, -0.08 + t * 0.16),
          { seg: low ? 7 : 11, ao: 0.5, ry: i * 0.7, m: 'leaf' },
        );
      }
    } else if (low) {
      k.clump(0, 1.55, 0, 1.1, c, { det: 1, ao: 0.55, sy: 0.95, v: q });
    } else {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996,
          t = (i + 0.5) / n;
        const rr = 0.52 * Math.sqrt(1 - (1 - 2 * t) * (1 - 2 * t));
        k.clump(Math.cos(a) * rr, 1.6 + (1 - 2 * t) * 0.55, Math.sin(a) * rr, 0.62 + (i % 3) * 0.08, shade(c, (i % 3) * 0.05 - 0.04), {
          det: e.rich ? 2 : 1,
          ao: 0.5,
          v: i % 4,
          ry: i,
        });
      }
    }
    return k.geo();
  });
  const tm = low ? lowLit(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })) : e.mat({ vc: true, rough: 0.95 });
  // in patches, so that a camera close to a fight does not carry the whole forest
  const P = low ? 4 : 2;
  kinds.forEach((geo, q) => {
    const all = spots.filter((_, i) => i % 3 === q);
    const M = new THREE.Matrix4(),
      Q = new THREE.Quaternion(),
      c = new THREE.Color();
    for (let cell = 0; cell < P * P; cell++) {
      const L = all.filter(s => Math.min(P - 1, Math.floor((s[0] / S) * P)) + P * Math.min(P - 1, Math.floor((s[1] / S) * P)) === cell);
      if (!L.length) continue;
      const im = new THREE.InstancedMesh(geo, tm, L.length);
      L.forEach((s, i) => {
        M.compose(
          new THREE.Vector3(s[0], 0, s[1]),
          Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.f() * 6.28),
          new THREE.Vector3(s[2], s[2] * (0.9 + r.f() * 0.35), s[2]),
        );
        im.setMatrixAt(i, M);
        im.setColorAt(i, c.setHSL(0, 0, 0.78 + r.f() * 0.25));
      });
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = !low;
      g.add(im);
    }
  });
  // river surface
  const L = plen(m.river),
    rp: number[] = [],
    ri: number[] = [],
    ru: number[] = [];
  const seg = 60;
  for (let i = 0; i <= seg; i++) {
    const d = (i / seg) * L,
      p = along(m.river, d),
      p0 = along(m.river, Math.max(0, d - 1.5)),
      q = along(m.river, Math.min(L, d + 1.5)),
      a = Math.atan2(q[1] - p0[1], q[0] - p0[0]);
    const wv = 3.7 + Math.sin(i * 1.7) * 0.5;
    for (const s of [-1, 1]) {
      rp.push(p[0] - Math.sin(a) * wv * s, 0.06, p[1] + Math.cos(a) * wv * s);
      ru.push(s, d / 6);
    }
    if (i < seg) {
      const o = i * 2;
      ri.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
  rg.setIndex(ri);
  const rm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uT: { value: 0 },
      uA: { value: new THREE.Color(m.theme === 'ashen' ? '#7a4fb0' : '#3f8fb0') },
      uB: { value: new THREE.Color(m.theme === 'ashen' ? '#e0b0ff' : '#c8f0ff') },
    },
    vertexShader:
      'varying vec2 vU; varying vec3 vW; void main(){ vU=uv; vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader:
      'varying vec2 vU; varying vec3 vW; uniform float uT; uniform vec3 uA,uB; float h(vec2 p){return fract(sin(dot(p,vec2(12.9,78.2)))*43758.5);} float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);} void main(){ float a=n(vW.xz*0.55+vec2(uT*0.5,uT*0.35))*0.6+n(vW.xz*1.4-vec2(uT*0.4,uT*0.7))*0.4; float e=smoothstep(1.0,0.72,abs(vU.x)); vec3 c=mix(uA*0.92,uA*1.12,a); c=mix(c,uB,smoothstep(0.70,0.74,a)*smoothstep(0.80,0.76,a)*0.55); float fo=smoothstep(0.80,0.97,abs(vU.x)+a*0.12)*0.35; gl_FragColor=vec4(c+fo,e*(0.6+fo*0.3));\n#include <colorspace_fragment>\n}',
  });
  g.add(new THREE.Mesh(rg, rm));
  // dressing
  const k = new Kit();
  for (const [i, b] of m.base.entries()) {
    k.cyl(b[0], 0, b[1], 8, 0.18, '#b6ad98', { seg: 28 });
    k.cyl(b[0], 0.18, b[1], 5, 0.18, '#c9c0aa', { seg: 24 });
    void i;
  }
  k.tor(m.pit[0], 0.15, m.pit[1], 5, 0.5, '#6a655c');
  for (const p of G.statics) {
    if (p.q === -1) {
      k.cyl(p.x, 0, p.y, 0.42, 2.3, '#9a917d', { r2: 0.34, seg: 7 });
      k.box(p.x, 2.3, p.y, 0.9, 0.25, 0.9, '#b6ad98');
    } else k.ico(p.x, 0.3, p.y, 0.85, '#77716a', { jitter: 0.2, sy: 1.1 + (-p.q % 3) * 0.3 });
  }
  for (let i = 0; i < 120; i++) {
    const x = r.f() * S,
      y = r.f() * S;
    if (G.atp(x, y) !== FLOOR) continue;
    if (smp(fld[0], x, y) > 4 && smp(fld[2], x, y) > 20) {
      const q = r.f();
      if (q < 0.4) k.ico(x, 0.02, y, 0.12 + r.f() * 0.12, '#8a857a', { jitter: 0.3, sy: 0.5 });
      else if (q < 0.8)
        for (let j = 0; j < 3; j++)
          k.cone(x + r.f() * 0.5, 0, y + r.f() * 0.5, 0.07, 0.4 + r.f() * 0.3, shade(pal.floor, 0.12), { seg: 4 });
      else {
        k.cyl(x, 0, y, 0.05, 0.3, '#eee', { seg: 5 });
        k.sph(x, 0.34, y, 0.16, m.theme === 'ashen' ? '#b06ad8' : '#d8584a', { seg: 6, sy: 0.6 });
      }
    }
  }
  const dm = new THREE.Mesh(k.geo(), e.mat({ vc: true, rough: 0.9 }));
  dm.castShadow = dm.receiveShadow = true;
  g.add(dm);
  return {
    group: g,
    w: S,
    h: S,
    pal,
    update(dt, _t) {
      rm.uniforms.uT.value += dt;
    },
  };
}
export { LOW };
