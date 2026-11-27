/** Fighters: a human underneath, armour and cloth built over it and bound to the same skeleton. */
import * as THREE from 'three';
import { Kit, weld } from './kit.ts';
import { B, J } from './body.ts';
import { humanGeo, type Spec } from './human.ts';
import type { Look } from '../data/heroes.ts';
const zc = (z: number) => new THREE.Color().setRGB(z / 64, 0, 0, THREE.LinearSRGBColorSpace);
/** solid zones: 20 + palette slot */
const S = {
  main: 22,
  second: 23,
  pants: 24,
  shoes: 25,
  glove: 26,
  metal: 27,
  dark: 28,
  glow: 29,
  accent: 30,
  light: 31,
  hair: 21,
  skin: 20,
};
type Zn = keyof typeof S;
class Gear {
  k = new Kit();
  si: number[] = [];
  sw: number[] = [];
  zone: number[] = [];
  private done = 0;
  /** bind everything added since the last call */
  to(bone: number, w2?: (x: number, y: number, z: number) => [number, number][]) {
    const n = this.k.p.length / 3;
    for (let i = this.done; i < n; i++) {
      const r = w2?.(this.k.p[i * 3], this.k.p[i * 3 + 1], this.k.p[i * 3 + 2]) ?? [[bone, 1]];
      for (let j = 0; j < 4; j++) {
        this.si.push(r[j]?.[0] ?? 0);
        this.sw.push(r[j]?.[1] ?? 0);
      }
      this.zone.push(Math.round(this.k.c[i * 3] * 64));
    }
    this.done = n;
    return this;
  }
}
const c = (z: Zn) => zc(S[z]);
const o = { ao: 0, m: 'paint' as const };
const cache = new Map<string, THREE.BufferGeometry>();
export function heroGeo(l: Look, s: Spec, lod: 1 | 2): THREE.BufferGeometry {
  const key = JSON.stringify([l, s, lod]);
  const hit = cache.get(key);
  if (hit) return hit;
  const base = humanGeo(s, lod);
  const g = new Gear();
  const k = g.k;
  const LR: [number, number, number, number, number, number][] = [
    [1, B.uaL, B.faL, B.thL, B.shL, B.ftL],
    [-1, B.uaR, B.faR, B.thR, B.shR, B.ftR],
  ];
  const b = l.body;
  const mil = b === 'soldier' || b === 'operator';
  const cloth = b === 'mage' || b === 'priest' || b === 'robe';
  const heavy = b === 'knight' || b === 'mech' || b === 'brute';
  const along = (a: readonly number[], e: readonly number[], sx: number, t: number) =>
    [sx * (a[0] + (e[0] - a[0]) * t), a[1] + (e[1] - a[1]) * t, a[2] + (e[2] - a[2]) * t] as [number, number, number];
  /** a tapering sleeve along a limb */
  const sleeve = (a: readonly number[], e: readonly number[], sx: number, t0: number, t1: number, r0: number, r1: number, z: Zn) => {
    const p = [t0, (t0 + t1) / 2, t1].map(t => along(a, e, sx, t));
    const n = 8;
    // two cones back to back read as a fitted plate
    const q = new THREE.Quaternion();
    const dir = new THREE.Vector3(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    const len = dir.length();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const geo = new THREE.CylinderGeometry(r1, r0, len, n, 2, false).toNonIndexed();
    geo.applyQuaternion(q);
    geo.translate(p[1][0], p[1][1], p[1][2]);
    k.add(geo, 0, 0, 0, 1, 1, 1, c(z), o);
  };
  const belt = (y: number, r: number, z: Zn, h = 0.05) => {
    k.lathe(
      0,
      y,
      0.012,
      [
        [r, 0],
        [r + 0.012, h * 0.2],
        [r + 0.012, h * 0.8],
        [r, h],
      ],
      c(z),
      { ...o, seg: 20 },
    );
    const P = k.p;
    for (let i = P.length - 3; i >= 0 && P[i + 1] >= y - 0.001 && P[i + 1] <= y + h + 0.001; i -= 3)
      P[i + 2] = (P[i + 2] - 0.012) * 0.74 + 0.012;
    g.to(B.hips);
  };
  // ---------- torso
  if (mil) {
    k.rbox(0, 1.1, 0.095, 0.31, 0.33, 0.085, c('dark'), { ...o, b: 0.04 });
    k.rbox(0, 1.12, -0.115, 0.31, 0.33, 0.07, c('dark'), { ...o, b: 0.035 });
    for (const sx of [-1, 1]) {
      k.rbox(sx * 0.165, 1.14, -0.01, 0.05, 0.2, 0.2, c('dark'), { ...o, b: 0.02 });
      k.rbox(sx * 0.115, 1.4, 0.0, 0.065, 0.06, 0.24, c('dark'), { ...o, b: 0.025, rz: -sx * 0.3 });
    }
    for (let i = 0; i < 3; i++) k.rbox(-0.1 + i * 0.1, 1.09, 0.15, 0.08, 0.14, 0.045, c('second'), { ...o, b: 0.015 });
    k.rbox(0.12, 1.3, 0.145, 0.05, 0.09, 0.035, c('dark'), { ...o, b: 0.012 });
    k.rbox(0, 1.33, 0.142, 0.12, 0.04, 0.01, c('accent'), { ...o, b: 0.004 });
    k.rbox(0, 1.16, -0.17, 0.26, 0.3, 0.1, c('main'), { ...o, b: 0.04 });
    g.to(B.chest, (_x, y) =>
      y < 1.2
        ? [
            [B.chest, 0.45],
            [B.spine, 0.55],
          ]
        : [[B.chest, 1]],
    );
    belt(0.96, 0.17, 'dark', 0.06);
    for (const sx of [-1, 1]) {
      k.rbox(sx * 0.16, 0.87, 0.02, 0.05, 0.12, 0.1, c('dark'), { ...o, b: 0.016 });
      g.to(sx > 0 ? B.thL : B.thR);
    }
  }
  if (b === 'knight' || b === 'mech') {
    const z: Zn = 'metal';
    // breastplate with a keel
    k.lathe(
      0,
      1.08,
      0.01,
      [
        [0.13, 0],
        [0.165, 0.08],
        [0.185, 0.2],
        [0.17, 0.3],
        [0.1, 0.37],
      ],
      c(z),
      { ...o, seg: 20 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++)
      if (k.p[i * 3 + 2] > 0) k.p[i * 3 + 2] *= 0.8 + 0.14 * Math.max(0, 1 - Math.abs(k.p[i * 3]) / 0.1);
      else k.p[i * 3 + 2] *= 0.74;
    k.lathe(
      0,
      1.42,
      0.0,
      [
        [0.1, 0],
        [0.115, 0.02],
        [0.085, 0.08],
        [0.095, 0.1],
      ],
      c('dark'),
      { ...o, seg: 16 },
    );
    if (b === 'mech') {
      k.rbox(0, 1.18, 0.13, 0.2, 0.16, 0.07, c('main'), { ...o, b: 0.03 });
      k.cyl(0, 1.26 - 0.0, 0.165, 0.045, 0.02, c('glow'), { ...o, rx: Math.PI / 2, seg: 16 });
      k.rbox(0, 1.1, -0.19, 0.34, 0.36, 0.16, c('dark'), { ...o, b: 0.05 });
      for (const sx of [-1, 1]) k.cyl(sx * 0.12, 1.3, -0.24, 0.04, 0.3, c('metal'), { ...o, seg: 10 });
    } else k.rbox(0, 1.14, 0.155, 0.05, 0.22, 0.02, c('second'), { ...o, b: 0.008 });
    g.to(B.chest, (_x, y) =>
      y < 1.18
        ? [
            [B.chest, 0.5],
            [B.spine, 0.5],
          ]
        : [[B.chest, 1]],
    );
    belt(0.98, 0.165, 'second', 0.05);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.45;
      k.rbox(Math.sin(a) * 0.17, 0.8, Math.cos(a) * 0.125 + 0.01, 0.13, 0.2, 0.02, c(i % 2 ? 'metal' : 'main'), {
        ...o,
        ry: a,
        rx: -0.12 * Math.cos(a) * 0,
        b: 0.009,
      });
    }
    g.to(B.hips, (x, y) =>
      y < 0.9
        ? [
            [B.hips, 0.55],
            [x > 0 ? B.thL : B.thR, 0.45],
          ]
        : [[B.hips, 1]],
    );
  }
  if (b === 'rogue' || b === 'archer' || b === 'light') {
    k.lathe(
      0,
      1.02,
      0.012,
      [
        [0.145, 0],
        [0.15, 0.1],
        [0.172, 0.24],
        [0.165, 0.33],
      ],
      c('second'),
      { ...o, seg: 18 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) k.p[i * 3 + 2] *= 0.75;
    k.tube(
      [
        [-0.15, 1.42, 0.03],
        [0, 1.2, 0.155],
        [0.15, 1.02, 0.06],
      ],
      0.02,
      c('dark'),
      { ...o },
    );
    g.to(B.chest, (_x, y) =>
      y < 1.2
        ? [
            [B.spine, 0.6],
            [B.chest, 0.4],
          ]
        : [[B.chest, 1]],
    );
    belt(0.96, 0.168, 'dark');
    for (const sx of [-1, 1]) k.rbox(sx * 0.15, 0.9, 0.06, 0.06, 0.08, 0.05, c('shoes'), { ...o, b: 0.015 });
    g.to(B.hips);
    if (b === 'archer') {
      k.push(0.08, 1.1, -0.17, 0, 1);
      k.cyl(0, 0, 0, 0.06, 0.42, c('shoes'), { ...o, rz: 0.3, seg: 12 });
      for (let i = 0; i < 5; i++)
        k.tube(
          [
            [-0.06 + i * 0.02, 0.3, 0],
            [-0.12 + i * 0.025, 0.58, 0],
          ],
          0.006,
          c('light'),
          { ...o, seg: 2 },
        );
      k.pop();
      g.to(B.chest);
    }
  }
  if (b === 'brute' || b === 'beast') {
    k.tube(
      [
        [-0.17, 1.44, 0.02],
        [-0.02, 1.26, 0.16],
        [0.15, 1.04, 0.08],
        [0.14, 1.02, -0.08],
        [-0.02, 1.24, -0.16],
        [-0.17, 1.44, -0.04],
      ],
      0.028,
      c('shoes'),
      { ...o, seg: 20 },
    );
    k.bcyl(-0.02, 1.22, 0.16, 0.05, 0.03, c('metal'), { ...o, rx: Math.PI / 2 });
    g.to(B.chest);
    belt(0.95, 0.19, 'shoes', 0.09);
    k.bcyl(0, 0.97, 0.16, 0.055, 0.03, c('second'), { ...o, rx: Math.PI / 2 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      k.ext(
        Math.sin(a) * 0.18,
        0.66,
        Math.cos(a) * 0.13,
        [
          [-0.08, 0.3],
          [0.08, 0.3],
          [0.05, 0.06],
          [0, 0],
          [-0.05, 0.05],
        ],
        0.012,
        c(i % 2 ? 'pants' : 'shoes'),
        { ...o, ry: a, b: 0.004 },
      );
    }
    g.to(B.hips, (x, y) =>
      y < 0.88
        ? [
            [B.hips, 0.5],
            [x > 0 ? B.thL : B.thR, 0.5],
          ]
        : [[B.hips, 1]],
    );
    // fur over the shoulders
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      k.cone(Math.sin(a) * 0.2, 1.36, Math.cos(a) * 0.13 - 0.02, 0.06, 0.16, c(i % 3 ? 'hair' : 'second'), {
        ...o,
        seg: 5,
        rx: Math.cos(a) * 2.3,
        rz: -Math.sin(a) * 2.3,
      });
    }
    g.to(B.chest);
  }
  if (cloth) {
    // robe: a bell of cloth following hips and legs
    const n = 26;
    const prof: [number, number][] = [
      [0.26, 0.1],
      [0.235, 0.32],
      [0.2, 0.58],
      [0.175, 0.82],
      [0.16, 1.0],
    ];
    k.lathe(0, 0, 0.012, prof, c('main'), { ...o, seg: n });
    for (let i = g['done'] as number; i < k.p.length / 3; i++) {
      const x = k.p[i * 3],
        z = k.p[i * 3 + 2] - 0.012,
        y = k.p[i * 3 + 1];
      const a = Math.atan2(x, z);
      const f = 1 + Math.sin(a * 9) * 0.05 * Math.max(0, 1 - y);
      k.p[i * 3] = x * f;
      k.p[i * 3 + 2] = z * 0.82 * f + 0.012;
    }
    g.to(B.hips, (x, y) => {
      const t = Math.max(0, Math.min(1, (0.98 - y) / 0.5));
      const sd = Math.max(0, Math.min(1, 0.5 + x / 0.16));
      const low = Math.max(0, Math.min(1, (0.5 - y) / 0.4));
      return [
        [B.hips, 1 - t * 0.85],
        [B.thL, t * 0.85 * sd * (1 - low * 0.5)],
        [B.thR, t * 0.85 * (1 - sd) * (1 - low * 0.5)],
        [sd > 0.5 ? B.shL : B.shR, t * 0.85 * low * 0.5],
      ];
    });
    k.lathe(
      0,
      0.09,
      0.012,
      [
        [0.268, 0],
        [0.268, 0.06],
      ],
      c('second'),
      { ...o, seg: n },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) {
      const x = k.p[i * 3],
        z = k.p[i * 3 + 2] - 0.012;
      const f = 1 + Math.sin(Math.atan2(x, z) * 9) * 0.045;
      k.p[i * 3] = x * f;
      k.p[i * 3 + 2] = z * 0.82 * f + 0.012;
    }
    g.to(B.hips, x => [
      [B.hips, 0.15],
      [x > 0 ? B.thL : B.thR, 0.45],
      [x > 0 ? B.shL : B.shR, 0.4],
    ]);
    k.lathe(
      0,
      1.0,
      0.01,
      [
        [0.158, 0],
        [0.16, 0.12],
        [0.182, 0.28],
        [0.17, 0.4],
        [0.1, 0.48],
      ],
      c('main'),
      { ...o, seg: 20 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) k.p[i * 3 + 2] *= 0.74;
    g.to(B.chest, (_x, y) =>
      y < 1.2
        ? [
            [B.spine, 0.6],
            [B.chest, 0.4],
          ]
        : [[B.chest, 1]],
    );
    belt(0.98, 0.168, 'second', 0.06);
    k.ext(
      0,
      0.5,
      0.15,
      [
        [-0.05, 0.5],
        [0.05, 0.5],
        [0.06, 0],
        [0, -0.05],
        [-0.06, 0],
      ],
      0.012,
      c('second'),
      { ...o, b: 0.004 },
    );
    g.to(B.hips);
    // mantle
    k.lathe(
      0,
      1.32,
      -0.005,
      [
        [0.235, 0],
        [0.21, 0.07],
        [0.13, 0.14],
        [0.085, 0.17],
      ],
      c('second'),
      { ...o, seg: 22 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) k.p[i * 3 + 2] *= 0.72;
    k.ico(0, 1.42, 0.115, 0.028, c('glow'), { ...o, det: 1 });
    g.to(B.chest);
  }
  // ---------- limbs
  for (const [sx, ua, fa, th, sh, ft] of LR) {
    if (heavy || b === 'beast') {
      const big = b === 'mech' ? 1.15 : b === 'brute' ? 1.05 : 1;
      k.sph(sx * 0.205, 1.44, -0.005, 0.098 * big, c(b === 'brute' || b === 'beast' ? 'shoes' : 'metal'), { ...o, sy: 0.8, seg: 14 });
      k.sph(sx * 0.225, 1.395, -0.005, 0.1 * big, c(b === 'brute' ? 'metal' : 'main'), { ...o, sy: 0.6, seg: 14 });
      if (b === 'brute')
        for (let i = 0; i < 3; i++)
          k.cone(sx * (0.18 + i * 0.035), 1.49 - i * 0.025, -0.01, 0.02, 0.09, c('light'), { ...o, seg: 6, rz: -sx * (0.3 + i * 0.3) });
      g.to(ua);
      sleeve(J.shL, J.elL, sx, 0.42, 0.9, 0.062 * big, 0.055 * big, b === 'mech' ? 'metal' : 'dark');
      g.to(ua);
      sleeve(J.elL, J.wrL, sx, 0.08, 0.86, 0.062 * big, 0.046 * big, b === 'brute' || b === 'beast' ? 'shoes' : 'metal');
      k.sph(sx * J.elL[0], J.elL[1], J.elL[2] - 0.01, 0.052, c(b === 'mech' ? 'dark' : 'second'), { ...o, seg: 10 });
      g.to(fa);
      if (b !== 'beast') {
        sleeve(J.hpL, J.knL, sx, 0.25, 0.86, 0.102 * big, 0.075 * big, b === 'brute' ? 'pants' : 'metal');
        g.to(th);
      }
      sleeve(J.knL, J.anL, sx, 0.08, 0.9, 0.074 * big, 0.056 * big, b === 'brute' || b === 'beast' ? 'shoes' : 'metal');
      k.sph(sx * J.knL[0], J.knL[1], 0.05, 0.058, c('second'), { ...o, sz: 0.7, seg: 10 });
      g.to(sh);
    } else {
      if (mil) {
        k.rbox(sx * J.knL[0], J.knL[1] - 0.07, 0.06, 0.12, 0.15, 0.05, c('dark'), { ...o, b: 0.022 });
        g.to(sh);
        k.rbox(sx * 0.4, 1.19, -0.02, 0.07, 0.1, 0.09, c('dark'), { ...o, b: 0.025, rz: sx * 0.78 });
        g.to(fa);
        k.rbox(sx * 0.23, 1.37, 0, 0.03, 0.11, 0.1, c('accent'), { ...o, b: 0.01, rz: sx * 0.55 });
        g.to(ua);
      } else if (cloth) {
        // wide cuffs
        sleeve(J.shL, J.elL, sx, 0.1, 1.0, 0.075, 0.08, 'main');
        g.to(ua);
        sleeve(J.elL, J.wrL, sx, 0.0, 0.98, 0.075, 0.105, 'main');
        sleeve(J.elL, J.wrL, sx, 0.9, 1.0, 0.106, 0.11, 'second');
        g.to(fa);
      } else {
        sleeve(J.elL, J.wrL, sx, 0.25, 0.9, 0.05, 0.042, 'shoes');
        g.to(fa);
        k.sph(sx * 0.2, 1.43, 0, 0.075, c('second'), { ...o, sy: 0.7, seg: 12 });
        g.to(ua);
      }
      sleeve(J.knL, J.anL, sx, 0.4, 0.98, 0.064, 0.058, 'shoes');
      g.to(sh);
    }
    void ft;
  }
  // ---------- head
  const hy = 1.665,
    hz = 0.02;
  const hd = l.head;
  const dome = (r: number, z: Zn, from = 1.66, sz = 1.16) => {
    k.lathe(
      0,
      from,
      hz - 0.005,
      [
        [r, -0.02],
        [r * 1.02, 0.02],
        [r * 0.9, 0.075],
        [r * 0.55, 0.118],
        [0, 0.13],
      ],
      c(z),
      { ...o, seg: 18 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) k.p[i * 3 + 2] = (k.p[i * 3 + 2] - hz) * sz + hz;
  };
  if (hd === 'helm' || hd === 'visor') {
    dome(0.106, mil ? 'main' : b === 'mech' ? 'main' : 'metal', 1.665);
    if (mil) {
      k.rbox(0, 1.7, 0.128, 0.07, 0.05, 0.03, c('dark'), { ...o, b: 0.01 });
      for (const sx of [-1, 1]) k.rbox(sx * 0.1, 1.62, 0.0, 0.03, 0.08, 0.08, c('dark'), { ...o, b: 0.014 });
      k.tube(
        [
          [-0.095, 1.64, 0.02],
          [-0.05, 1.555, 0.085],
          [0.05, 1.555, 0.085],
          [0.095, 1.64, 0.02],
        ],
        0.008,
        c('dark'),
        { ...o },
      );
    } else {
      k.rbox(0, 1.575, 0.085, 0.13, 0.085, 0.07, c(b === 'mech' ? 'dark' : 'metal'), { ...o, b: 0.03 });
      for (const sx of [-1, 1]) k.rbox(sx * 0.085, 1.57, 0.03, 0.03, 0.13, 0.12, c('metal'), { ...o, b: 0.014 });
      if (!mil && b === 'knight')
        k.ext(
          0,
          1.76,
          -0.02,
          [
            [-0.13, 0],
            [0.12, 0],
            [0.06, 0.06],
            [-0.1, 0.09],
          ],
          0.016,
          c('second'),
          { ...o, ry: Math.PI / 2, b: 0.004 },
        );
    }
    if (hd === 'visor') k.rbox(0, 1.645, 0.108, 0.15, 0.05, 0.03, c('glow'), { ...o, b: 0.014 });
  } else if (hd === 'hood') {
    k.lathe(
      0,
      1.5,
      -0.015,
      [
        [0.115, 0],
        [0.135, 0.06],
        [0.128, 0.16],
        [0.105, 0.25],
        [0.05, 0.3],
        [0, 0.305],
      ],
      c('second'),
      { ...o, seg: 20 },
    );
    for (let i = g['done'] as number; i < k.p.length / 3; i++) {
      const y = k.p[i * 3 + 1],
        z = k.p[i * 3 + 2];
      // open at the front
      if (z > 0.06 && y < 1.745) k.p[i * 3 + 2] = 0.05 + (y - 1.5) * 0.12;
    }
    if (mil) k.rbox(0, 1.55, 0.075, 0.13, 0.09, 0.06, c('dark'), { ...o, b: 0.03 });
  } else if (hd === 'mask') {
    k.rbox(0, 1.545, 0.075, 0.125, 0.095, 0.07, c('dark'), { ...o, b: 0.032 });
    k.rbox(0, 1.575, 0.112, 0.05, 0.03, 0.01, c('glow'), { ...o, b: 0.004 });
    dome(0.103, 'dark', 1.675);
  } else if (hd === 'horns' || hd === 'antlers') {
    for (const sx of [-1, 1]) {
      if (hd === 'horns') {
        const P: [number, number, number][] = [
          [sx * 0.075, 1.73, 0.03],
          [sx * 0.16, 1.78, 0.03],
          [sx * 0.2, 1.88, 0.07],
          [sx * 0.17, 1.97, 0.12],
        ];
        k.tube(P.slice(0, 3), 0.03, c('light'), { ...o, seg: 6 });
        k.tube(P.slice(1), 0.02, c('light'), { ...o, seg: 6 });
      } else {
        k.tube(
          [
            [sx * 0.06, 1.75, 0],
            [sx * 0.12, 1.9, -0.02],
            [sx * 0.2, 2.02, 0.02],
          ],
          0.016,
          c('light'),
          { ...o, seg: 6 },
        );
        k.tube(
          [
            [sx * 0.11, 1.88, -0.01],
            [sx * 0.08, 1.98, 0.06],
          ],
          0.011,
          c('light'),
          { ...o, seg: 4 },
        );
        k.tube(
          [
            [sx * 0.15, 1.95, 0],
            [sx * 0.24, 1.96, 0.07],
          ],
          0.011,
          c('light'),
          { ...o, seg: 4 },
        );
      }
    }
    k.tor(0, 1.72, hz, 0.1, 0.014, c('shoes'), { ...o });
  } else if (hd === 'crown') {
    k.lathe(
      0,
      1.735,
      hz,
      [
        [0.098, 0],
        [0.104, 0.03],
        [0.1, 0.035],
      ],
      c('metal'),
      { ...o, seg: 20 },
    );
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      k.cone(Math.sin(a) * 0.1, 1.76, hz + Math.cos(a) * 0.1, 0.018, 0.075, c('metal'), { ...o, seg: 5 });
    }
    k.ico(0, 1.765, hz + 0.108, 0.018, c('glow'), { ...o, det: 1 });
  } else if (hd === 'hat') {
    if (mil) {
      dome(0.104, 'main', 1.69);
      k.rbox(0, 1.685, 0.14, 0.15, 0.014, 0.13, c('main'), { ...o, b: 0.006, rx: 0.12 });
    } else {
      k.lathe(
        0,
        1.7,
        hz - 0.02,
        [
          [0.25, -0.03],
          [0.24, -0.02],
          [0.13, 0.01],
          [0.11, 0.06],
          [0.07, 0.2],
          [0.03, 0.34],
          [0, 0.38],
        ],
        c('main'),
        { ...o, seg: 22 },
      );
      k.lathe(
        0,
        1.715,
        hz - 0.02,
        [
          [0.118, 0],
          [0.115, 0.035],
        ],
        c('second'),
        { ...o, seg: 22 },
      );
    }
  } else if (hd === 'mohawk') {
    for (let i = 0; i < 7; i++)
      k.cone(0, 1.72 + Math.sin((i / 6) * Math.PI) * 0.04, 0.11 - i * 0.035, 0.026, 0.13, c('accent'), { ...o, seg: 5, rx: 0.5 - i * 0.2 });
  }
  g.to(B.head);
  if (b === 'beast') {
    // a muzzle and ears
    k.rbox(0, 1.575, 0.12, 0.095, 0.085, 0.13, c('hair'), { ...o, b: 0.04 });
    k.sph(0, 1.635, 0.185, 0.022, c('dark'), { ...o, seg: 8 });
    for (const sx of [-1, 1]) {
      k.cone(sx * 0.085, 1.74, 0.0, 0.04, 0.13, c('hair'), { ...o, seg: 6, rz: -sx * 0.35 });
      k.cone(sx * 0.028, 1.545, 0.175, 0.009, 0.04, c('light'), { ...o, seg: 5, rx: Math.PI });
    }
    g.to(B.head);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.cone(Math.sin(a) * 0.1, 1.55 + Math.cos(a) * 0.11 + 0.06, -0.04, 0.045, 0.14, c('hair'), {
        ...o,
        seg: 5,
        rx: -1.2,
        rz: -Math.sin(a) * 0.9,
      });
    }
    g.to(B.head);
  }
  if (l.cape) {
    const cw = 7,
      n = 9;
    const grid: number[][] = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= cw; i++) {
        const u = i / cw - 0.5,
          t = j / n;
        grid.push([u * (0.36 + t * 0.36), 1.45 - t * 1.12, -0.135 - t * 0.12 - Math.cos(u * 3.1) * 0.03 + Math.sin(u * 16) * 0.014 * t]);
      }
    const P: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < cw; i++) {
        const a = grid[j * (cw + 1) + i],
          e = grid[j * (cw + 1) + i + 1],
          f = grid[(j + 1) * (cw + 1) + i],
          h = grid[(j + 1) * (cw + 1) + i + 1];
        for (const v of [a, f, e, e, f, h]) P.push(...v);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.computeVertexNormals();
    k.add(geo, 0, 0, 0, 1, 1, 1, c('accent'), o);
    g.to(B.chest, (_x, y) => {
      const t = (1.45 - y) / 1.12;
      const w1 = Math.min(1, Math.max(0, t * 2.2 - 0.15)),
        w2 = Math.min(1, Math.max(0, t * 2 - 0.9));
      return [
        [B.chest, 1 - w1],
        [B.c1, w1 * (1 - w2)],
        [B.c2, w1 * w2],
      ];
    });
  }
  // ---------- join
  const n0 = base.attributes.position.count;
  const w = weld({
    position: [k.p, 3],
    normal: [k.n, 3],
    zone: [g.zone, 1],
    si: [g.si, 4],
    sw: [g.sw, 4],
  });
  const wa = (n: string) => w.attributes[n].array as Float32Array;
  const n1 = w.attributes.position.count;
  const join = (name: string, size: number, extra: ArrayLike<number>, T: any) => {
    const a = base.attributes[name].array as Float32Array;
    const r = new T((n0 + n1) * size);
    r.set(a);
    for (let i = 0; i < n1 * size; i++) r[n0 * size + i] = extra[i] ?? 0;
    return new THREE.BufferAttribute(r, size);
  };
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', join('position', 3, wa('position'), Float32Array));
  out.setAttribute('normal', join('normal', 3, wa('normal'), Float32Array));
  out.setAttribute('uv', join('uv', 2, [], Float32Array));
  const z = join('zone', 1, wa('zone'), Float32Array);
  // gloves and boots are painted onto the body underneath
  const zb = z.array as Float32Array,
    pb = base.attributes.position.array as Float32Array;
  for (let i = 0; i < n0; i++) {
    if (zb[i] === 0 && Math.abs(pb[i * 3]) > 0.5 && pb[i * 3 + 1] < 1.2 && !cloth && b !== 'beast') zb[i] = S.glove;
    if (b === 'mech' && (zb[i] === 2 || zb[i] === 4)) zb[i] = S.dark;
    if (b === 'knight' && zb[i] === 2) zb[i] = S.dark;
    if (b === 'beast' && zb[i] === 0) zb[i] = S.skin;
    if ((hd === 'helm' || hd === 'hood' || hd === 'mask' || (hd === 'hat' && mil) || hd === 'visor') && zb[i] === 1) zb[i] = 99;
  }
  out.setAttribute('zone', z);
  out.setAttribute('bao', join('bao', 1, new Array(n1).fill(1), Float32Array));
  out.setAttribute('skinIndex', join('skinIndex', 4, wa('si'), Uint16Array));
  out.setAttribute('skinWeight', join('skinWeight', 4, wa('sw'), Float32Array));
  const idx: number[] = [];
  const bi = base.index!.array;
  for (let i = 0; i < bi.length; i += 3) if (zb[bi[i]] !== 99) idx.push(bi[i], bi[i + 1], bi[i + 2]);
  const wi = w.index!.array;
  for (let i = 0; i < wi.length; i++) idx.push(n0 + wi[i]);
  out.setIndex(idx);
  if (cache.size > 60) cache.clear();
  cache.set(key, out);
  return out;
}
