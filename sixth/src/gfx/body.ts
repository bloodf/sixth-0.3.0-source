/** Procedural characters: signed-distance bodies meshed with surface nets, auto-skinned, palette-coloured per instance. */
import * as THREE from 'three';
import { LOWDECL, LOWLIT, LOWU } from './engine.ts';
import type { Look as HeroLook } from '../data/heroes.ts';
export const B = {
  hips: 0,
  spine: 1,
  chest: 2,
  head: 3,
  uaL: 4,
  faL: 5,
  uaR: 6,
  faR: 7,
  thL: 8,
  shL: 9,
  ftL: 10,
  thR: 11,
  shR: 12,
  ftR: 13,
  c1: 14,
  c2: 15,
} as const;
export const NB = 16;
export const Z = {
  skin: 0,
  hair: 1,
  main: 2,
  second: 3,
  pants: 4,
  shoes: 5,
  glove: 6,
  metal: 7,
  dark: 8,
  glow: 9,
  accent: 10,
  light: 11,
} as const;
/** rest joint positions */
export const J: Record<string, [number, number, number]> = {
  hips: [0, 0.95, 0],
  spine: [0, 1.06, 0],
  chest: [0, 1.26, 0],
  neck: [0, 1.49, 0],
  head: [0, 1.56, 0.01],
  shL: [0.185, 1.43, 0],
  elL: [0.385, 1.225, -0.01],
  wrL: [0.565, 1.04, 0.02],
  haL: [0.63, 0.975, 0.03],
  hpL: [0.098, 0.93, 0],
  knL: [0.108, 0.5, 0.012],
  anL: [0.112, 0.085, -0.02],
  toL: [0.122, 0.03, 0.13],
};
export const UA = Math.hypot(0.2, 0.205, 0.01),
  FA = Math.hypot(0.18, 0.185, 0.03),
  TH = Math.hypot(0.01, 0.43, 0.012),
  SH = Math.hypot(0.004, 0.415, 0.032);
type V3 = [number, number, number];
const mir = (v: V3): V3 => [-v[0], v[1], v[2]];
interface Prim {
  t: 'cap' | 'ell' | 'box';
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  bone: number;
  z: number;
  k: number;
}
const cap = (a: V3, b: V3, r1: number, r2: number, bone: number, z: number, k = 0.035): Prim => ({ t: 'cap', a, b, r1, r2, bone, z, k });
const ell = (c: V3, r: V3, bone: number, z: number, k = 0.03): Prim => ({ t: 'ell', a: c, b: r, r1: 0, r2: 0, bone, z, k });
const box = (c: V3, h: V3, r: number, bone: number, z: number, k = 0.015): Prim => ({ t: 'box', a: c, b: h, r1: r, r2: 0, bone, z, k });
function dist(p: Prim, x: number, y: number, z: number): number {
  if (p.t === 'cap') {
    const bx = p.b[0] - p.a[0],
      by = p.b[1] - p.a[1],
      bz = p.b[2] - p.a[2],
      px = x - p.a[0],
      py = y - p.a[1],
      pz = z - p.a[2];
    const l2 = bx * bx + by * by + bz * bz;
    let h = l2 > 0 ? (px * bx + py * by + pz * bz) / l2 : 0;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = px - bx * h,
      dy = py - by * h,
      dz = pz - bz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.r1 + (p.r2 - p.r1) * h);
  }
  if (p.t === 'ell') {
    const dx = (x - p.a[0]) / p.b[0],
      dy = (y - p.a[1]) / p.b[1],
      dz = (z - p.a[2]) / p.b[2];
    const k = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return (k - 1) * Math.min(p.b[0], p.b[1], p.b[2]);
  }
  const qx = Math.abs(x - p.a[0]) - p.b[0] + p.r1,
    qy = Math.abs(y - p.a[1]) - p.b[1] + p.r1,
    qz = Math.abs(z - p.a[2]) - p.b[2] + p.r1;
  const ox = Math.max(qx, 0),
    oy = Math.max(qy, 0),
    oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.r1;
}
export type Outfit = 'civil' | 'hoodie' | 'chef' | 'coat' | HeroLook['body'];
export interface BodyDef {
  outfit: Outfit;
  head: HeroLook['head'] | 'hair0' | 'hair1' | 'hair2' | 'hair3' | 'hair4' | 'hair5' | 'bald';
  cape: boolean;
  headset?: boolean;
  backpack?: boolean;
}
function prims(d: BodyDef): Prim[] {
  const P: Prim[] = [];
  const o = d.outfit;
  const lr = (f: (m: (v: V3) => V3, s: 0 | 1) => void) => {
    f(v => v, 0);
    f(mir, 1);
  };
  const bL = (l: number, r: number, s: number) => (s ? r : l);
  const big =
    o === 'brute'
      ? 1.32
      : o === 'mech'
        ? 1.2
        : o === 'beast'
          ? 1.25
          : o === 'knight'
            ? 1.12
            : o === 'light' || o === 'rogue'
              ? 0.9
              : o === 'mage' || o === 'priest' || o === 'robe'
                ? 0.92
                : 1;
  const w = big;
  const robe = o === 'mage' || o === 'priest' || o === 'robe';
  const civ = o === 'civil' || o === 'hoodie' || o === 'chef' || o === 'coat';
  const mil = o === 'soldier' || o === 'operator';
  const torso = Z.main,
    arm = o === 'brute' || o === 'beast' ? Z.skin : o === 'civil' ? Z.main : robe ? Z.main : Z.main,
    leg = o === 'knight' || o === 'mech' ? Z.metal : robe ? Z.main : Z.pants;
  // torso
  P.push(
    ell([0, 0.98, -0.005], [0.155 * w, 0.125, 0.112 * w], B.hips, leg, 0.05),
    cap([0, 1.04, 0], [0, 1.18, 0], 0.122 * w, 0.132 * w, B.spine, torso, 0.06),
    ell([0, 1.315, -0.005], [0.188 * w, 0.165, 0.122 * w], B.chest, torso, 0.06),
    cap([-0.13 * w, 1.42, 0], [0.13 * w, 1.42, 0], 0.072 * w, 0.072 * w, B.chest, torso, 0.05),
    cap([0, 1.45, 0], [0, 1.55, 0.005], 0.056 * (w > 1.2 ? 1.4 : 1), 0.052, B.head, Z.skin, 0.02),
  );
  lr((m, s) => {
    const aR = o === 'brute' || o === 'beast' ? 1.5 : o === 'mech' ? 1.3 : o === 'knight' ? 1.15 : o === 'light' ? 0.92 : 1;
    P.push(cap(m(J.shL), m(J.elL), 0.062 * aR, 0.049 * aR, bL(B.uaL, B.uaR, s), arm, 0.035));
    const fore = civ
      ? o === 'civil'
        ? Z.skin
        : Z.main
      : o === 'soldier'
        ? Z.main
        : o === 'brute' || o === 'beast'
          ? Z.skin
          : o === 'mech' || o === 'knight'
            ? Z.metal
            : Z.main;
    P.push(cap(m(J.elL), m(J.wrL), 0.047 * aR, 0.037 * aR * (robe ? 1.7 : 1), bL(B.faL, B.faR, s), fore, 0.025));
    P.push(
      ell(
        m(J.haL),
        [0.042 * aR, 0.048 * aR, 0.034 * aR],
        bL(B.faL, B.faR, s),
        civ ? Z.skin : o === 'brute' || o === 'beast' ? Z.skin : Z.glove,
        0.02,
      ),
    );
    const lg = o === 'brute' || o === 'mech' || o === 'beast' ? 1.25 : o === 'light' ? 0.92 : 1;
    P.push(
      cap(m(J.hpL), m(J.knL), 0.088 * lg, 0.062 * lg, bL(B.thL, B.thR, s), leg, 0.04),
      cap(m(J.knL), m(J.anL), 0.06 * lg, 0.042 * lg, bL(B.shL, B.shR, s), o === 'civil' || civ || mil ? Z.pants : leg, 0.03),
    );
    P.push(cap(m([0.112, 0.05, -0.045]), m([0.12, 0.042, 0.11]), 0.05 * lg, 0.042 * lg, bL(B.ftL, B.ftR, s), Z.shoes, 0.02));
  });
  // head
  const hs = o === 'brute' ? 0.88 : 1;
  P.push(
    ell([0, 1.665, 0.008], [0.083 * hs, 0.108 * hs, 0.097 * hs], B.head, Z.skin, 0.02),
    ell([0, 1.615, 0.05], [0.056 * hs, 0.052 * hs, 0.05 * hs], B.head, Z.skin, 0.03),
    ell([0, 1.648, 0.105], [0.014, 0.022, 0.016], B.head, Z.skin, 0.02),
  );
  lr(m => P.push(ell(m([0.083, 1.655, 0.0]), [0.014, 0.028, 0.018], B.head, Z.skin, 0.01)));
  // outfits
  if (civ) {
    if (o === 'hoodie')
      P.push(
        cap([-0.07, 1.47, -0.075], [0.07, 1.47, -0.075], 0.062, 0.062, B.chest, Z.main, 0.03),
        box([0, 1.12, 0.118], [0.09, 0.05, 0.02], 0.015, B.spine, Z.second, 0.01),
      );
    if (o === 'coat') lr((m, s) => P.push(cap(m([0.09, 1.0, 0]), m([0.12, 0.62, 0]), 0.105, 0.125, bL(B.thL, B.thR, s), Z.main, 0.04)));
    if (o === 'chef')
      P.push(
        box([0, 0.98, 0.105], [0.13, 0.24, 0.02], 0.015, B.hips, Z.light, 0.02),
        box([0, 1.26, 0.125], [0.1, 0.12, 0.012], 0.01, B.chest, Z.light, 0.01),
      );
  }
  if (o === 'civil')
    lr((m, s) => P.push(cap(m([0.2, 1.415, 0]), m([0.29, 1.32, -0.005]), 0.071, 0.066, bL(B.uaL, B.uaR, s), Z.second, 0.015)));
  if (mil) {
    P.push(box([0, 1.27, 0.0], [0.175, 0.17, 0.135], 0.05, B.chest, o === 'soldier' ? Z.dark : Z.second, 0.02));
    P.push(box([0, 1.02, 0], [0.165, 0.035, 0.125], 0.02, B.hips, Z.dark, 0.01));
    for (const x of [-0.1, 0, 0.1]) P.push(box([x, 1.16, 0.15], [0.04, 0.055, 0.028], 0.012, B.spine, Z.dark, 0.008));
    lr((m, s) => {
      P.push(
        ell(m([0.108, 0.5, 0.06]), [0.05, 0.06, 0.03], bL(B.shL, B.shR, s), Z.dark, 0.008),
        cap(m([0.112, 0.2, -0.01]), m([0.112, 0.07, -0.015]), 0.055, 0.05, bL(B.shL, B.shR, s), Z.shoes, 0.02),
      );
      P.push(box(m([0.19, 0.9, 0]), [0.03, 0.08, 0.05], 0.012, bL(B.thL, B.thR, s), Z.dark, 0.008));
      P.push(ell(m([0.2, 1.42, 0]), [0.075, 0.062, 0.075], bL(B.uaL, B.uaR, s), o === 'soldier' ? Z.second : Z.accent, 0.012));
    });
    if (d.backpack || o === 'soldier')
      P.push(box([0, 1.3, -0.17], [0.12, 0.15, 0.06], 0.035, B.chest, o === 'soldier' ? Z.second : Z.dark, 0.012));
  }
  if (o === 'knight') {
    P.push(
      ell([0, 1.31, 0.03], [0.2, 0.17, 0.125], B.chest, Z.metal, 0.02),
      box([0, 1.02, 0], [0.17, 0.05, 0.13], 0.03, B.hips, Z.accent, 0.01),
    );
    lr((m, s) => {
      P.push(
        ell(m([0.225, 1.46, 0]), [0.115, 0.085, 0.11], bL(B.uaL, B.uaR, s), Z.metal, 0.01),
        ell(m([0.108, 0.5, 0.045]), [0.06, 0.07, 0.045], bL(B.shL, B.shR, s), Z.metal, 0.01),
        box(m([0.1, 0.83, 0.05]), [0.075, 0.1, 0.06], 0.03, bL(B.thL, B.thR, s), Z.second, 0.02),
      );
    });
  }
  if (o === 'brute' || o === 'beast') {
    P.push(
      ell([0, 1.36, -0.02], [0.26, 0.19, 0.16], B.chest, o === 'beast' ? Z.main : Z.skin, 0.06),
      box([0, 1.0, 0], [0.19, 0.07, 0.15], 0.04, B.hips, Z.accent, 0.02),
    );
    lr((m, s) => {
      P.push(
        ell(m([0.25, 1.46, 0]), [0.12, 0.1, 0.12], bL(B.uaL, B.uaR, s), o === 'beast' ? Z.main : Z.metal, 0.02),
        ell(m([0.5, 1.1, 0]), [0.08, 0.08, 0.075], bL(B.faL, B.faR, s), o === 'beast' ? Z.main : Z.metal, 0.02),
      );
    });
    if (o === 'beast') {
      P.push(
        ell([0, 1.64, 0.12], [0.055, 0.05, 0.075], B.head, Z.second, 0.03),
        ell([0, 1.5, -0.06], [0.2, 0.16, 0.12], B.chest, Z.second, 0.04),
      );
      lr(m => P.push(cap(m([0.06, 1.75, -0.01]), m([0.085, 1.83, -0.02]), 0.035, 0.014, B.head, Z.main, 0.015)));
    }
  }
  if (robe) {
    P.push(cap([0, 0.98, 0], [0, 0.62, 0], 0.165, 0.2, B.hips, Z.main, 0.05));
    lr((m, s) => {
      P.push(cap(m([0.07, 0.7, 0]), m([0.11, 0.16, 0]), 0.16, 0.19, bL(B.thL, B.thR, s), Z.main, 0.07));
      P.push(ell(m([0.205, 1.45, 0]), [0.085, 0.05, 0.085], bL(B.uaL, B.uaR, s), Z.second, 0.012));
    });
    P.push(
      box([0, 1.1, 0.13], [0.045, 0.3, 0.02], 0.012, B.spine, Z.second, 0.012),
      box([0, 1.03, 0], [0.16, 0.03, 0.13], 0.02, B.hips, Z.accent, 0.01),
    );
    if (o === 'priest') P.push(ell([0, 1.5, 0], [0.17, 0.06, 0.13], B.chest, Z.accent, 0.02));
  }
  if (o === 'rogue' || o === 'archer') {
    P.push(
      box([0, 1.2, 0], [0.15, 0.1, 0.12], 0.05, B.spine, Z.second, 0.015),
      box([0, 1.02, 0], [0.16, 0.03, 0.12], 0.02, B.hips, Z.accent, 0.01),
      cap([-0.14, 1.44, 0.09], [0.13, 1.1, 0.11], 0.022, 0.022, B.chest, Z.accent, 0.008),
    );
    lr((m, s) =>
      P.push(
        ell(m([0.195, 1.44, 0]), [0.075, 0.06, 0.07], bL(B.uaL, B.uaR, s), Z.second, 0.012),
        cap(m([0.112, 0.34, 0]), m([0.112, 0.08, -0.01]), 0.06, 0.05, bL(B.shL, B.shR, s), Z.shoes, 0.02),
      ),
    );
    if (o === 'archer') P.push(cap([-0.1, 1.5, -0.15], [0.08, 1.16, -0.15], 0.05, 0.045, B.chest, Z.accent, 0.01));
  }
  if (o === 'mech') {
    P.push(
      box([0, 1.3, 0.03], [0.23, 0.17, 0.17], 0.07, B.chest, Z.main, 0.015),
      ell([0, 1.3, 0.2], [0.06, 0.06, 0.03], B.chest, Z.glow, 0.005),
      box([0, 1.34, -0.2], [0.16, 0.16, 0.08], 0.04, B.chest, Z.dark, 0.01),
      box([0, 1.0, 0], [0.18, 0.08, 0.14], 0.04, B.hips, Z.dark, 0.02),
    );
    lr((m, s) => {
      P.push(
        box(m([0.285, 1.47, 0]), [0.12, 0.1, 0.13], 0.05, bL(B.uaL, B.uaR, s), Z.main, 0.01),
        box(m([0.5, 1.1, 0]), [0.075, 0.085, 0.08], 0.03, bL(B.faL, B.faR, s), Z.second, 0.01),
        box(m([0.11, 0.32, 0.01]), [0.085, 0.16, 0.09], 0.04, bL(B.shL, B.shR, s), Z.main, 0.012),
        box(m([0.118, 0.06, 0.03]), [0.075, 0.06, 0.13], 0.03, bL(B.ftL, B.ftR, s), Z.second, 0.01),
        cap(m([0.1, 1.26, -0.28]), m([0.1, 1.14, -0.28]), 0.045, 0.055, B.chest, Z.glow, 0.005),
      );
    });
  }
  if (o === 'light') {
    P.push(
      box([0, 1.3, 0.06], [0.12, 0.1, 0.08], 0.04, B.chest, Z.second, 0.02),
      ell([0, 1.31, 0.14], [0.035, 0.035, 0.02], B.chest, Z.glow, 0.005),
    );
    lr((m, s) =>
      P.push(
        ell(m([0.108, 0.5, 0.04]), [0.055, 0.07, 0.04], bL(B.shL, B.shR, s), Z.second, 0.01),
        ell(m([0.2, 1.43, 0]), [0.07, 0.055, 0.07], bL(B.uaL, B.uaR, s), Z.second, 0.01),
      ),
    );
  }
  // head gear and hair
  const H = (c: V3, r: V3, z: number = Z.hair, k = 0.012) => P.push(ell(c, r, B.head, z, k));
  const h = d.head;
  if (h === 'hair0' || h === 'bare') H([0, 1.7, -0.022], [0.092, 0.09, 0.1]);
  if (h === 'hair1') {
    H([0, 1.71, -0.02], [0.094, 0.085, 0.104]);
    H([0.02, 1.765, 0.05], [0.075, 0.04, 0.055]);
  }
  if (h === 'hair2') {
    H([0, 1.7, -0.03], [0.096, 0.094, 0.1]);
    H([0, 1.58, -0.08], [0.085, 0.12, 0.05]);
  }
  if (h === 'hair3') {
    H([0, 1.7, -0.025], [0.093, 0.088, 0.1]);
    H([0, 1.74, -0.13], [0.045, 0.05, 0.045]);
    H([0, 1.66, -0.16], [0.035, 0.1, 0.03]);
  }
  if (h === 'hair4') {
    for (const [x, y, z] of [
      [0, 1.77, 0.02],
      [0.06, 1.74, -0.03],
      [-0.06, 1.74, -0.03],
      [0, 1.75, -0.08],
      [0.05, 1.77, 0.03],
      [-0.05, 1.77, 0.03],
    ] as V3[])
      H([x, y, z], [0.058, 0.05, 0.058], Z.hair, 0.02);
    H([0, 1.69, -0.035], [0.094, 0.08, 0.092]);
  }
  if (h === 'hair5') H([0, 1.715, -0.012], [0.089, 0.076, 0.1]);
  if (h === 'mohawk') {
    for (let i = 0; i < 5; i++) H([0, 1.77 - Math.abs(i - 1.5) * 0.012, 0.07 - i * 0.045], [0.02, 0.06, 0.035]);
  }
  if (h === 'hood') {
    P.push(
      ell([0, 1.69, -0.03], [0.118, 0.125, 0.122], B.head, Z.second, 0.015),
      cap([0, 1.6, -0.1], [0, 1.5, -0.12], 0.075, 0.06, B.chest, Z.second, 0.03),
    );
  }
  if (h === 'helm') {
    if (mil) {
      P.push(
        ell([0, 1.712, -0.008], [0.116, 0.1, 0.13], B.head, Z.second, 0.01),
        box([0, 1.7, 0.125], [0.06, 0.02, 0.015], 0.01, B.head, Z.dark, 0.005),
      );
      lr(m => P.push(ell(m([0.108, 1.65, 0]), [0.03, 0.045, 0.04], B.head, Z.dark, 0.008)));
    } else {
      P.push(
        ell([0, 1.69, 0], [0.11, 0.122, 0.12], B.head, Z.metal, 0.01),
        box([0, 1.665, 0.112], [0.06, 0.012, 0.02], 0.006, B.head, Z.glow, 0.002),
        box([0, 1.8, -0.02], [0.015, 0.05, 0.1], 0.012, B.head, Z.accent, 0.01),
      );
    }
  }
  if (h === 'visor') {
    H([0, 1.7, -0.025], [0.096, 0.094, 0.1], o === 'mech' ? Z.main : Z.hair);
    P.push(box([0, 1.672, 0.088], [0.078, 0.026, 0.028], 0.02, B.head, Z.glow, 0.004));
  }
  if (h === 'mask') {
    P.push(ell([0, 1.64, 0.052], [0.07, 0.085, 0.062], B.head, Z.light, 0.006));
    H([0, 1.71, -0.03], [0.1, 0.1, 0.1], Z.second);
  }
  if (h === 'horns') {
    H([0, 1.7, -0.02], [0.096, 0.095, 0.102], Z.hair);
    lr(m =>
      P.push(
        cap(m([0.08, 1.73, 0]), m([0.16, 1.78, 0.02]), 0.034, 0.026, B.head, Z.light, 0.01),
        cap(m([0.16, 1.78, 0.02]), m([0.18, 1.9, 0.05]), 0.026, 0.008, B.head, Z.light, 0.01),
      ),
    );
  }
  if (h === 'antlers') {
    H([0, 1.7, -0.02], [0.094, 0.094, 0.1], Z.hair);
    lr(m =>
      P.push(
        cap(m([0.05, 1.76, 0]), m([0.13, 1.92, -0.02]), 0.018, 0.012, B.head, Z.accent, 0.008),
        cap(m([0.1, 1.85, -0.01]), m([0.19, 1.88, 0.03]), 0.012, 0.007, B.head, Z.accent, 0.006),
        cap(m([0.13, 1.92, -0.02]), m([0.11, 2.0, 0]), 0.012, 0.006, B.head, Z.accent, 0.006),
      ),
    );
  }
  if (h === 'crown') {
    H([0, 1.7, -0.025], [0.095, 0.09, 0.1], Z.hair);
    H([0, 1.58, -0.08], [0.08, 0.12, 0.045], Z.hair);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283;
      P.push(
        cap(
          [Math.sin(a) * 0.098, 1.74, Math.cos(a) * 0.104],
          [Math.sin(a) * 0.108, 1.8 + (i === 0 ? 0.035 : 0), Math.cos(a) * 0.114],
          0.017,
          0.007,
          B.head,
          Z.accent,
          0.006,
        ),
      );
    }
  }
  if (h === 'hat') {
    P.push(
      ell([0, 1.735, 0], [0.185, 0.02, 0.185], B.head, Z.second, 0.008),
      ell([0, 1.775, -0.005], [0.095, 0.08, 0.1], B.head, Z.second, 0.012),
    );
    H([0, 1.67, -0.035], [0.09, 0.09, 0.088], Z.hair);
  }
  if (d.headset) {
    lr(m => P.push(ell(m([0.1, 1.655, 0.0]), [0.026, 0.048, 0.042], B.head, Z.dark, 0.004)));
    for (let i = 0; i <= 6; i++) {
      const a = -1.45 + (i / 6) * 2.9;
      P.push(ell([Math.sin(a) * 0.108, 1.69 + Math.cos(a) * 0.125, -0.005], [0.018, 0.016, 0.018], B.head, Z.dark, 0.02));
    }
  }
  if (o === 'chef') {
    H([0, 1.79, -0.01], [0.105, 0.055, 0.105], Z.light);
    H([0, 1.84, -0.01], [0.12, 0.05, 0.12], Z.light, 0.02);
  }
  return P;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
export function bodyGeo(d: BodyDef, cell = 0.032): THREE.BufferGeometry {
  const key = JSON.stringify(d) + cell;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const P = prims(d);
  const mn: V3 = [-0.78, -0.06, -0.36],
    mx: V3 = [0.78, 2.08, 0.36];
  const nx = Math.ceil((mx[0] - mn[0]) / cell) + 1,
    ny = Math.ceil((mx[1] - mn[1]) / cell) + 1,
    nz = Math.ceil((mx[2] - mn[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz).fill(0.2);
  const id = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  for (const p of P) {
    const rx = p.t === 'cap' ? Math.max(p.r1, p.r2) : 0;
    const lo = [0, 1, 2].map(i => (p.t === 'cap' ? Math.min(p.a[i], p.b[i]) - rx : p.a[i] - p.b[i]) - 0.13),
      hi = [0, 1, 2].map(i => (p.t === 'cap' ? Math.max(p.a[i], p.b[i]) + rx : p.a[i] + p.b[i]) + 0.13);
    const x0 = Math.max(0, Math.floor((lo[0] - mn[0]) / cell)),
      x1 = Math.min(nx - 1, Math.ceil((hi[0] - mn[0]) / cell)),
      y0 = Math.max(0, Math.floor((lo[1] - mn[1]) / cell)),
      y1 = Math.min(ny - 1, Math.ceil((hi[1] - mn[1]) / cell)),
      z0 = Math.max(0, Math.floor((lo[2] - mn[2]) / cell)),
      z1 = Math.min(nz - 1, Math.ceil((hi[2] - mn[2]) / cell));
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d2 = dist(p, mn[0] + x * cell, mn[1] + y * cell, mn[2] + z * cell);
          const i = id(x, y, z),
            a = F[i],
            k = p.k;
          const h = Math.max(k - Math.abs(a - d2), 0) / k;
          F[i] = Math.min(a, d2) - h * h * k * 0.25;
        }
  }
  const pos: number[] = [],
    nor: number[] = [],
    zone: number[] = [],
    si: number[] = [],
    sw: number[] = [],
    ao: number[] = [],
    idx: number[] = [];
  const vi = new Int32Array(nx * ny * nz).fill(-1);
  const samp = (x: number, y: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - mn[0]) / cell)),
      fy = Math.min(ny - 1.001, Math.max(0, (y - mn[1]) / cell)),
      fz = Math.min(nz - 1.001, Math.max(0, (z - mn[2]) / cell));
    const X = Math.floor(fx),
      Y = Math.floor(fy),
      Q = Math.floor(fz),
      a = fx - X,
      b = fy - Y,
      c = fz - Q;
    const l = (p: number, q: number, t: number) => p + (q - p) * t;
    return l(
      l(l(F[id(X, Y, Q)], F[id(X + 1, Y, Q)], a), l(F[id(X, Y + 1, Q)], F[id(X + 1, Y + 1, Q)], a), b),
      l(l(F[id(X, Y, Q + 1)], F[id(X + 1, Y, Q + 1)], a), l(F[id(X, Y + 1, Q + 1)], F[id(X + 1, Y + 1, Q + 1)], a), b),
      c,
    );
  };
  const E = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ];
  const v = new Float32Array(8);
  const wb = new Float32Array(NB);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let mask = 0;
        for (let i = 0; i < 8; i++) {
          v[i] = F[id(x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1))];
          if (v[i] < 0) mask |= 1 << i;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          n = 0;
        for (const [a, b] of E) {
          const A = (mask >> a) & 1,
            C = (mask >> b) & 1;
          if (A === C) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        const px = mn[0] + (x + sx / n) * cell,
          py = mn[1] + (y + sy / n) * cell,
          pz = mn[2] + (z + sz / n) * cell;
        vi[id(x, y, z)] = pos.length / 3;
        pos.push(px, py, pz);
        const e = cell * 0.6;
        let gx = samp(px + e, py, pz) - samp(px - e, py, pz),
          gy = samp(px, py + e, pz) - samp(px, py - e, pz),
          gz = samp(px, py, pz + e) - samp(px, py, pz - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        gx /= gl;
        gy /= gl;
        gz /= gl;
        nor.push(gx, gy, gz);
        wb.fill(0);
        let bd = 1e9,
          bz = 0;
        for (const p of P) {
          const dd = dist(p, px, py, pz);
          const ww = 1 / Math.pow(0.012 + Math.max(0, dd + 0.004), 3);
          wb[p.bone] += ww;
          const dz = dd - (p.k < 0.02 ? 0.006 : 0);
          if (dz < bd) {
            bd = dz;
            bz = p.z;
          }
        }
        // sides never mix
        if (px > 0.03) {
          wb[B.uaR] = wb[B.faR] = wb[B.thR] = wb[B.shR] = wb[B.ftR] = 0;
        } else if (px < -0.03) {
          wb[B.uaL] = wb[B.faL] = wb[B.thL] = wb[B.shL] = wb[B.ftL] = 0;
        }
        const ord = [...wb.keys()].sort((a, b) => wb[b] - wb[a]).slice(0, 4);
        let s = 0;
        for (const o of ord) s += wb[o];
        si.push(...ord);
        sw.push(...ord.map(o => wb[o] / s));
        zone.push(bz);
        const occ = Math.min(1, Math.max(0, samp(px + gx * 0.09, py + gy * 0.09, pz + gz * 0.09) / 0.085));
        ao.push(0.62 + 0.38 * occ);
      }
  const q = (a: number, b: number, c: number, d2: number, f: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d2 < 0) return;
    if (f) idx.push(a, b, c, a, c, d2);
    else idx.push(a, c, b, a, d2, c);
  };
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const s0 = F[id(x, y, z)] < 0;
        if (s0 !== F[id(x + 1, y, z)] < 0) q(vi[id(x, y - 1, z - 1)], vi[id(x, y, z - 1)], vi[id(x, y, z)], vi[id(x, y - 1, z)], s0);
        if (s0 !== F[id(x, y + 1, z)] < 0) q(vi[id(x - 1, y, z - 1)], vi[id(x - 1, y, z)], vi[id(x, y, z)], vi[id(x, y, z - 1)], s0);
        if (s0 !== F[id(x, y, z + 1)] < 0) q(vi[id(x - 1, y - 1, z)], vi[id(x, y - 1, z)], vi[id(x, y, z)], vi[id(x - 1, y, z)], s0);
      }
  if (d.cape) {
    const b0 = pos.length / 3,
      cw = 6,
      chh = 8;
    for (let j = 0; j <= chh; j++)
      for (let i = 0; i <= cw; i++) {
        const u = i / cw - 0.5,
          t = j / chh;
        pos.push(u * (0.34 + t * 0.3), 1.44 - t * 1.08, -0.13 - t * 0.1 - Math.cos(u * 3.1) * 0.03);
        nor.push(u * 0.4, 0.1, -1);
        zone.push(Z.accent);
        ao.push(0.8 + 0.2 * (1 - t));
        const w1 = Math.min(1, Math.max(0, t * 2.2 - 0.15)),
          w2 = Math.min(1, Math.max(0, t * 2 - 0.9));
        si.push(B.chest, B.c1, B.c2, 0);
        const a = 1 - w1,
          c = w1 * (1 - w2),
          e = w1 * w2;
        sw.push(a, c, e, 0);
      }
    for (let j = 0; j < chh; j++)
      for (let i = 0; i < cw; i++) {
        const a = b0 + j * (cw + 1) + i,
          b = a + 1,
          c = a + cw + 1,
          e = c + 1;
        idx.push(a, b, c, b, e, c, a, c, b, b, c, e);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('zone', new THREE.Float32BufferAttribute(zone, 1));
  g.setAttribute('bao', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  geoCache.set(key, g);
  return g;
}
/** rest bone heads, identity rotation */
export const REST: V3[] = (() => {
  const r: V3[] = [];
  r[B.hips] = J.hips;
  r[B.spine] = J.spine;
  r[B.chest] = J.chest;
  r[B.head] = J.neck;
  r[B.uaL] = J.shL;
  r[B.faL] = J.elL;
  r[B.uaR] = mir(J.shL);
  r[B.faR] = mir(J.elL);
  r[B.thL] = J.hpL;
  r[B.shL] = J.knL;
  r[B.ftL] = J.anL;
  r[B.thR] = mir(J.hpL);
  r[B.shR] = mir(J.knL);
  r[B.ftR] = mir(J.anL);
  r[B.c1] = [0, 1.36, -0.14];
  r[B.c2] = [0, 0.95, -0.18];
  return r;
})();
export interface Palette {
  skin: string;
  hair: string;
  main: string;
  second: string;
  pants: string;
  shoes: string;
  glove: string;
  metal: string;
  dark: string;
  glow: string;
  accent: string;
  light: string;
}
export const palArr = (p: Palette) =>
  [p.skin, p.hair, p.main, p.second, p.pants, p.shoes, p.glove, p.metal, p.dark, p.glow, p.accent, p.light].map(c => {
    const q = new THREE.Color(c);
    return new THREE.Vector3(q.r, q.g, q.b);
  });
const FACE = `vec3 pc=vPal; if(uHasShirt>0.5 && vZone>1.5 && vZone<4.5 && abs(vRest.x)<0.27 && vRest.y<=0.985 && vRest.y>0.8 && vZone<3.5) pc=uPants; else if(uHasShirt>0.5 && vZone>1.5 && vZone<4.5 && vRest.y>0.985 && vRest.y<1.52 && abs(vRest.x)<0.27){ vec2 su=vec2((vRest.x*(vRest.z>0.0?1.0:-1.0))/0.54+0.5, (vRest.y-0.97)/0.55); su.x=su.x*0.5+(vRest.z>0.0?0.0:0.5); pc=texture2D(uShirt,su).rgb*(vPal.r+vPal.g+vPal.b<0.0001?1.0:1.0)*0.97; } if(uHasShirt>0.5 && abs(vRest.x)>0.205 && vRest.y>1.0){ float at=((abs(vRest.x)-0.185)*0.2+(1.43-vRest.y)*0.205)/0.082; if(at<0.64 && (vZone<0.5||(vZone>1.5&&vZone<3.5))) pc=uPal[3]*mix(0.86,1.0,smoothstep(0.64,0.5,at)); else if(vZone>1.5&&vZone<3.5) pc=uPal[0]; } if(uFace>0.5 && vZone<0.5 && vRest.y>1.58 && vRest.z>0.045){ vec2 f=vec2(abs(vRest.x),vRest.y); float ey=el(f,vec2(0.034,1.674),vec2(0.0155,0.0125)); float pu=el(f,vec2(0.0335,1.673),vec2(0.0085,0.0105)); float bw=el(f,vec2(0.035,1.698+0.06*(0.035-f.x)),vec2(0.02,0.0048)); float mo=el(f,vec2(0.0,1.607),vec2(0.026,0.0055)); pc=mix(pc,vec3(0.9),ey*0.9); pc=mix(pc,vec3(0.05,0.035,0.03),pu); pc=mix(pc,pc*0.25,bw*0.85); pc=mix(pc,pc*vec3(0.62,0.4,0.38),mo*0.9); } `;
export function charMaterial(low: boolean, pal: THREE.Vector3[], glowK = 1.6): THREE.Material & { uniformsX: any } {
  const m: any = low ? new THREE.MeshBasicMaterial({ fog: false }) : new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  const U = {
    uPal: { value: pal },
    uFlash: { value: 0 },
    uFlashC: { value: new THREE.Color('#ffffff') },
    uGlow: { value: glowK },
    uRim: { value: new THREE.Color('#000000') },
    uFade: { value: 1 },
    uShirt: { value: null as any },
    uHasShirt: { value: 0 },
    uFace: { value: 1 },
    uPants: { value: pal[4] },
  };
  m.uniformsX = U;
  if (low)
    m.onBeforeCompile = (s: any) => {
      Object.assign(s.uniforms, U, LOWU);
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\n' +
            LOWDECL +
            '\nattribute float zone; attribute float bao; uniform vec3 uPal[12]; varying vec3 vPal; varying float vGl; varying vec3 vRest; varying float vZone; varying float vRim;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvRest=position; vZone=zone; int zi=int(zone+0.5); vPal=uPal[zi]*bao; vGl=(zi==9)?1.0:0.0;',
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvec3 nn=objectNormal; ' +
            LOWLIT +
            ' vec3 vn=normalize(normalMatrix*objectNormal); vRim=pow(1.0-abs(dot(vn,normalize(-mvPosition.xyz))),2.5);',
        );
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vLit; varying vec3 vPal; varying float vGl; varying float vRim; uniform float uFlash; uniform vec3 uFlashC; uniform float uGlow; uniform vec3 uRim; varying vec3 vRest; varying float vZone; uniform sampler2D uShirt; uniform float uHasShirt; uniform float uFace; uniform vec3 uPants; uniform vec3 uPal[12];\nfloat el(vec2 p, vec2 c, vec2 r){ return smoothstep(1.15,0.85,length((p-c)/r)); }',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n' +
            FACE +
            'diffuseColor.rgb*=pc*vLit; diffuseColor.rgb+=vPal*vGl*uGlow*0.6+uFlashC*uFlash+uRim*vRim;',
        );
    };
  else
    m.onBeforeCompile = (s: any) => {
      Object.assign(s.uniforms, U);
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float zone; attribute float bao; uniform vec3 uPal[12]; varying vec3 vPal; varying float vGl; varying float vMet; varying vec3 vVN; varying vec3 vVP; varying vec3 vRest; varying float vZone;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvRest=position; vZone=zone; int zi=int(zone+0.5); vPal=uPal[zi]*bao; vGl=(zi==9)?1.0:0.0; vMet=(zi==7)?1.0:0.0;',
        )
        .replace('#include <project_vertex>', '#include <project_vertex>\nvVN=normalize(normalMatrix*objectNormal); vVP=mvPosition.xyz;');
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vPal; varying float vGl; varying float vMet; varying vec3 vVN; varying vec3 vVP; uniform float uFlash; uniform vec3 uFlashC; uniform float uGlow; uniform vec3 uRim; uniform float uFade; varying vec3 vRest; varying float vZone; uniform sampler2D uShirt; uniform float uHasShirt; uniform float uFace; uniform vec3 uPants; uniform vec3 uPal[12];\nfloat el(vec2 p, vec2 c, vec2 r){ return smoothstep(1.15,0.85,length((p-c)/r)); }',
        )
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FACE + 'diffuseColor.rgb*=pc; diffuseColor.a*=uFade;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.34,vMet);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.75,vMet);')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nfloat rim=pow(1.0-abs(dot(normalize(vVN),normalize(-vVP))),2.5); totalEmissiveRadiance+=vPal*vGl*uGlow+uFlashC*uFlash+uRim*rim;',
        );
    };
  m.customProgramCacheKey = () => 'char' + (low ? 'L' : 'S');
  return m;
}
