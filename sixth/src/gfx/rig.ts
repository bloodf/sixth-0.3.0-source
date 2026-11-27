/** Skeleton + procedural animation. Gait is driven by distance travelled, limbs by two-bone IK, so feet do not slide and hands stay on weapons. */
import * as THREE from 'three';
import { B, J, NB, REST, UA, FA, TH, SH } from './body.ts';
type V = THREE.Vector3;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tA = new THREE.Vector3();
export type Act =
  | 'idle'
  | 'move'
  | 'aim'
  | 'shoot'
  | 'throw'
  | 'plant'
  | 'dead'
  | 'stun'
  | 'blind'
  | 'attack'
  | 'cast'
  | 'ult'
  | 'shield'
  | 'sit'
  | 'type'
  | 'lift'
  | 'run'
  | 'yoga'
  | 'cook'
  | 'lie'
  | 'talk'
  | 'cheer'
  | 'slump'
  | 'bench'
  | 'pingpong';
export type Hold = 'none' | 'rifle' | 'pistols' | 'sword' | 'staff' | 'bow' | 'hammer' | 'daggers' | 'orb' | 'cannon' | 'spear' | 'shield';
const restB: THREE.Matrix4[] = REST.map(r => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2]));
const X = v(1, 0, 0),
  Y = v(0, 1, 0),
  ZA = v(0, 0, 1);
const q0 = new THREE.Quaternion(),
  q1 = new THREE.Quaternion(),
  q2 = new THREE.Quaternion(),
  m0 = new THREE.Matrix4(),
  t0 = v(),
  t1 = v(),
  t2 = v(),
  t3 = v(),
  t4 = v();
const rj = (k: string, s: number) => v(J[k][0] * s, J[k][1], J[k][2]);
function basis(dir: V, pole: V, out: THREE.Quaternion) {
  t1.copy(dir).normalize();
  t2.copy(pole).addScaledVector(t1, -pole.dot(t1));
  if (t2.lengthSq() < 1e-8) t2.set(0.01, 0, 1);
  t2.normalize();
  t3.crossVectors(t1, t2);
  m0.makeBasis(t1, t2, t3);
  return out.setFromRotationMatrix(m0);
}
interface Limb {
  a: V;
  b: V;
  c: V;
  ra: THREE.Quaternion;
  rb: THREE.Quaternion;
}
const restLimb = (s: number, arm: boolean): Limb => {
  const a = rj(arm ? 'shL' : 'hpL', s),
    b = rj(arm ? 'elL' : 'knL', s),
    c = rj(arm ? 'wrL' : 'anL', s);
  const pole = arm ? v(0, 0, -1) : v(0, 0, 1);
  return {
    a,
    b,
    c,
    ra: basis(b.clone().sub(a), pole, new THREE.Quaternion()).clone().invert(),
    rb: basis(c.clone().sub(b), pole, new THREE.Quaternion()).clone().invert(),
  };
};
const RL = { aL: restLimb(1, true), aR: restLimb(-1, true), lL: restLimb(1, false), lR: restLimb(-1, false) };
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const key = (t: number, ks: [number, V][], out: V) => {
  for (let i = 0; i + 1 < ks.length; i++)
    if (t <= ks[i + 1][0]) {
      const u = smooth(clamp01((t - ks[i][0]) / (ks[i + 1][0] - ks[i][0])));
      return out.lerpVectors(ks[i][1], ks[i + 1][1], u);
    }
  return out.copy(ks[ks.length - 1][1]);
};
export class Rig {
  bones: THREE.Bone[] = [];
  skeleton: THREE.Skeleton;
  phase = Math.random();
  speed = 0;
  moveAng = 0;
  act: Act = 'idle';
  actT = 0;
  hold: Hold = 'none';
  lean = 0;
  crouch = 0;
  recoil = 0;
  aimK = 0;
  seed = Math.random() * 100;
  die = 0;
  dieDir = 1;
  hips = v();
  handL = v();
  handR = v();
  weapon = new THREE.Matrix4();
  weaponL = new THREE.Matrix4();
  twist = 0;
  stride = 1;
  hunch = 0;
  /** 0 free, 1 weapon held upright against the chest */
  tuck = 0;
  capeA = 0;
  capeV = 0;
  lastYaw = 0;
  seat = 0.46;
  sitK = 0;
  look = 0;
  /** arm gesture laid over whatever the body is doing */
  over: '' | 'talk' | 'argue' | 'rage' | 'eat' | 'phone' | 'wash' | 'laugh' | 'face' | 'scratch' = '';
  nod = 0;
  private p: V[] = REST.map(() => v());
  private r: THREE.Quaternion[] = REST.map(() => new THREE.Quaternion());
  private aS = 0;
  blend: { hipY: number; tilt: number; spine: number } = { hipY: 0.95, tilt: 0, spine: 0 };
  headP = v();
  headQ = new THREE.Quaternion();
  private hl = v(0.3, 1, 0.2);
  private hr = v(-0.3, 1, 0.2);
  fist = 0;
  constructor() {
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      this.bones.push(b);
    }
    this.skeleton = new THREE.Skeleton(this.bones, restB);
  }
  attach(mesh: THREE.SkinnedMesh) {
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(this.skeleton, new THREE.Matrix4());
    mesh.bindMatrixInverse.identity();
    mesh.frustumCulled = false;
  }
  private limb(rest: Limb, a: V, target: V, pole: V, l1: number, l2: number, iu: number, il: number, endOut: V) {
    t0.subVectors(target, a);
    let d = t0.length();
    const mx = (l1 + l2) * 0.9985;
    if (d > mx) {
      t0.multiplyScalar(mx / d);
      d = mx;
    }
    if (d < 0.05) d = 0.05;
    const dir = t4.copy(t0).normalize();
    const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    const pl = t2.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (pl.lengthSq() < 1e-6) pl.set(0, 0, 1);
    pl.normalize();
    const bx = a.x + (dir.x * ca + pl.x * sa) * l1,
      by = a.y + (dir.y * ca + pl.y * sa) * l1,
      bz = a.z + (dir.z * ca + pl.z * sa) * l1;
    const ex = a.x + dir.x * d,
      ey = a.y + dir.y * d,
      ez = a.z + dir.z * d;
    const P = pole.clone();
    this.p[iu].copy(a);
    this.p[il].set(bx, by, bz);
    endOut.set(ex, ey, ez);
    const up = new THREE.Vector3(bx - a.x, by - a.y, bz - a.z),
      lo = new THREE.Vector3(ex - bx, ey - by, ez - bz);
    this.r[iu].copy(basis(up, P, q0)).multiply(rest.ra);
    this.r[il].copy(basis(lo, P, q1)).multiply(rest.rb);
  }
  /** dt seconds, speed m/s, moveAng = movement direction relative to facing */
  update(dt: number, t: number) {
    const S = this;
    const sp = S.speed;
    S.aS += (sp - S.aS) * Math.min(1, dt * 9);
    const spd = S.aS;
    const run = clamp01((spd - 1.9) / 1.6);
    const strideLen = (0.62 + spd * 0.36) * S.stride;
    const back = Math.abs(S.moveAng) > 1.75;
    S.phase = (S.phase + ((dt * spd) / Math.max(0.3, strideLen)) * (back ? -1 : 1) * 0.5 + 1) % 1;
    S.actT += dt;
    S.recoil *= Math.exp(-dt * 16);
    const a = S.act;
    const dead = a === 'dead';
    S.die += ((dead ? 1 : 0) - S.die) * Math.min(1, dt * (dead ? 5.5 : 12));
    const seated = a === 'sit' || a === 'type' || a === 'slump';
    S.sitK += ((seated ? 1 : 0) - S.sitK) * Math.min(1, dt * 5);
    const aiming = a === 'aim' || a === 'shoot' || a === 'attack' || a === 'cast' ? 1 : 0;
    S.aimK += (aiming - S.aimK) * Math.min(1, dt * 11);
    const cr = a === 'plant' ? 1 : a === 'stun' ? 0.35 : a === 'blind' ? 0.25 : a === 'shield' ? 0.3 : 0;
    S.crouch += (cr - S.crouch) * Math.min(1, dt * 8);
    const mv = clamp01(spd / 1.2);
    const ph = S.phase * Math.PI * 2;
    const br = Math.sin(t * 1.7 + S.seed) * 0.006;
    // hips
    const legYaw = back ? S.moveAng - Math.PI * Math.sign(S.moveAng) : S.moveAng;
    const hipYaw = legYaw * 0.55 * mv + Math.sin(ph) * 0.12 * mv;
    let hy = 0.95 - 0.012 - run * 0.05 + Math.cos(ph * 2) * (0.016 + run * 0.028) * mv + br - S.crouch * 0.42 - S.hunch * 0.05;
    let hx = Math.cos(ph) * 0.018 * mv * (1 - run),
      hz = 0;
    let pitch = (run * 0.2 + mv * 0.05) * (back ? -0.5 : 1) + S.hunch * 0.25 + S.crouch * 0.3;
    if (a === 'idle' && S.hold === 'none' && mv < 0.1) {
      hx += Math.sin(t * 0.5 + S.seed) * 0.02;
    }
    hy += (S.seat + 0.1 - hy) * S.sitK;
    if (a === 'bench') {
      hy = 0.5;
    }
    if (a === 'lie') hy = 0.62;
    if (a === 'yoga') hy = 0.2 + Math.sin(t * 0.8 + S.seed) * 0.01;
    const D = S.die;
    hy += (0.16 - hy) * D;
    hz += -0.32 * D * S.dieDir;
    S.hips.set(hx, hy, hz);
    const HQ = S.r[B.hips];
    q0.setFromAxisAngle(Y, hipYaw);
    q1.setFromAxisAngle(X, pitch * 0.35 + -1.45 * S.dieDir * D + (a === 'lie' || a === 'bench' ? -1.5 : 0));
    q2.setFromAxisAngle(ZA, Math.cos(ph) * 0.03 * mv + D * 0.15);
    HQ.copy(q0).multiply(q1).multiply(q2);
    S.p[B.hips].copy(S.hips);
    // spine
    let tw = -hipYaw * 0.9 + -Math.sin(ph) * 0.16 * mv * (1 - S.aimK * 0.7);
    let bend = pitch * 0.4,
      side = 0;
    if (S.sitK > 0.01) bend += S.sitK * (a === 'type' ? 0.1 + Math.sin(t * 0.23 + S.seed) * 0.04 : a === 'slump' ? 0.45 : -0.05);
    if (a === 'attack') {
      const u = clamp01(S.actT / 0.5);
      tw +=
        S.hold === 'bow'
          ? 0.5
          : u < 0.35
            ? -0.7 * smooth(u / 0.35)
            : u < 0.6
              ? -0.7 + 1.4 * smooth((u - 0.35) / 0.25)
              : 0.7 * (1 - smooth((u - 0.6) / 0.4));
      bend += u > 0.35 && u < 0.7 ? 0.22 : 0;
    }
    if (a === 'cast' || a === 'ult') bend += -0.15 + 0.3 * smooth(clamp01(S.actT * 4));
    if (a === 'ult') side = Math.sin(t * 9) * 0.03;
    if (a === 'stun') {
      side = Math.sin(t * 3 + S.seed) * 0.22;
      bend += 0.3;
    }
    if (a === 'blind') bend += 0.25;
    if (a === 'throw') {
      const u = clamp01(S.actT / 0.45);
      tw += u < 0.4 ? 0.7 * smooth(u / 0.4) : 0.7 - 1.1 * smooth((u - 0.4) / 0.6);
    }
    if (a === 'cook') bend += 0.18;
    if (a === 'cheer') bend -= 0.12;
    if (a === 'lift') bend += 0.06;
    if (a === 'pingpong') {
      tw += Math.sin(t * 4 + S.seed) * 0.5;
      bend += 0.2;
    }
    bend += S.recoil * -0.06;
    bend *= 1 - D;
    tw *= 1 - D;
    const chain = (i: number, from: number, off: [number, number, number], ax: number, ay: number, az: number) => {
      t0.set(off[0], off[1], off[2]).applyQuaternion(S.r[from]);
      S.p[i].copy(S.p[from]).add(t0);
      q0.setFromEuler(new THREE.Euler(ax, ay, az, 'YXZ'));
      S.r[i].copy(S.r[from]).multiply(q0);
    };
    chain(B.spine, B.hips, [0, 0.11, 0], bend * 0.5, tw * 0.5, side * 0.5 - Math.cos(ph) * 0.02 * mv);
    chain(B.chest, B.spine, [0, 0.2, 0], bend * 0.5 + br * 2, tw * 0.5 + S.twist, side * 0.5);
    const nk =
      -bend * 0.8 -
      pitch * 0.4 +
      (seated ? 0.1 : 0) +
      S.nod +
      (a === 'slump' ? 0.3 : 0) +
      (S.over === 'phone'
        ? 0.35
        : S.over === 'face'
          ? 0.45
          : S.over === 'laugh'
            ? Math.sin(t * 9) * 0.08 - 0.1
            : S.over === 'argue'
              ? Math.sin(t * 7) * 0.06
              : S.over === 'talk'
                ? Math.sin(t * 3.1 + S.seed) * 0.06
                : S.over === 'eat'
                  ? 0.12
                  : 0);
    chain(
      B.head,
      B.chest,
      [0, 0.23, 0],
      nk * (1 - D) + D * 0.2,
      -tw * 0.35 + S.look + (mv < 0.1 && a === 'idle' ? Math.sin(t * 0.4 + S.seed * 3) * 0.25 : 0),
      0,
    );
    S.headP.copy(S.p[B.head]);
    S.headQ.copy(S.r[B.head]);
    // legs
    for (const s of [1, -1]) {
      const L = s > 0;
      const hipJ = t0
        .set(0.098 * s, -0.02, 0)
        .applyQuaternion(HQ)
        .add(S.hips)
        .clone();
      const f = (S.phase + (L ? 0 : 0.5)) % 1;
      const st = 0.6 - run * 0.24;
      let fx = 0.1 * s,
        fz = 0,
        fy = 0.085,
        foot = 0;
      const half = strideLen * 0.5 * (0.9 + run * 0.25);
      if (mv > 0.02) {
        let along: number;
        if (f < st) {
          const u = f / st;
          along = half * (1 - 2 * u);
          foot = u > 0.7 ? ((u - 0.7) / 0.3) * 0.6 : -0.25 * (1 - u) * (u < 0.2 ? 1 : 0);
          fy += u > 0.75 ? (u - 0.75) * 0.16 : 0;
        } else {
          const u = (f - st) / (1 - st);
          along = -half + 2 * half * smooth(u);
          fy += Math.sin(u * Math.PI) * (0.09 + run * 0.2) + (1 - u) * 0.04 * run;
          foot = u < 0.5 ? 0.7 * (1 - u) * (0.6 + run) : -0.3 * u;
        }
        fx = 0.1 * s + Math.sin(legYaw) * along * mv;
        fz = Math.cos(legYaw) * along * mv - run * 0.04;
      }
      if (mv < 0.3) {
        const k = 1 - mv / 0.3;
        const wide = (S.hold === 'none' ? 0.11 : 0.16) * s,
          stg = S.hold === 'none' || seated ? 0.02 * s : 0.12 * s;
        fx += (wide - fx) * k;
        fz += (stg - fz) * k;
        fy += (0.085 - fy) * k;
        foot *= 1 - k;
      }
      if (S.crouch > 0.05) {
        if (a === 'plant') {
          fx = 0.13 * s;
          fz = L ? 0.24 : -0.26;
          fy = L ? 0.085 : 0.14;
          foot = L ? 0 : 0.8;
        } else fx *= 1 + S.crouch * 0.6;
      }
      if (S.sitK > 0.01) {
        fx += (0.12 * s - fx) * S.sitK;
        fz += (0.42 - fz) * S.sitK;
        fy += (0.085 - fy) * S.sitK;
        foot *= 1 - S.sitK;
      }
      if (a === 'lie' || a === 'bench') {
        fx = 0.1 * s;
        fy = a === 'bench' ? 0.085 : 0.6;
        fz = a === 'bench' ? 0.62 : 0.85;
      }
      if (a === 'yoga') {
        fx = 0.06 * s;
        fy = 0.08;
        fz = 0.32;
      }
      if (a === 'lift') {
        fx = 0.2 * s;
      }
      if (D > 0.01) {
        const dz = S.hips.z + 0.75 * S.dieDir;
        fx += (0.16 * s - fx) * D;
        fz += (dz + (L ? 0.08 : -0.05) - fz) * D;
        fy += ((L ? 0.1 : 0.2) - fy) * D;
        foot += (-0.9 - foot) * D * (S.dieDir > 0 ? 1 : -1) * 0.7;
      }
      const pole = a === 'yoga' ? v(0.9 * s, 0.4, 0.5) : v(0.16 * s + Math.sin(legYaw) * 0.3 * mv, D * 0.8 + (seated ? 0.3 : 0), 1);
      const end = v();
      S.limb(L ? RL.lL : RL.lR, hipJ, v(fx, fy, fz), pole, TH, SH, L ? B.thL : B.thR, L ? B.shL : B.shR, end);
      const fi = L ? B.ftL : B.ftR;
      S.p[fi].copy(end);
      q0.setFromAxisAngle(Y, legYaw * 0.6 * mv + 0.12 * s);
      q1.setFromAxisAngle(X, foot);
      S.r[fi].copy(q0).multiply(q1);
    }
    // arms: targets in chest space, then IK
    const C = S.p[B.chest],
      CQ = S.r[B.chest];
    const tl = v(),
      tr = v();
    let poleL = v(0.6, -0.8, -0.5),
      poleR = v(-0.6, -0.8, -0.5);
    const sw = Math.sin(ph) * mv;
    const h = S.hold;
    const k = S.aimK;
    if (h === 'rifle' || h === 'cannon') {
      const low = mv * run * (1 - k);
      tr.set(-0.11, 0.02 + k * 0.13 - low * 0.08 + sw * 0.012, 0.2 - S.recoil * 0.05 + k * 0.02);
      tl.set(0.07 + low * 0.1, 0.03 + k * 0.135 + low * 0.02 + sw * 0.014, 0.44 - S.recoil * 0.05 - low * 0.08);
      if (h === 'cannon') {
        tr.y -= 0.18;
        tl.y -= 0.18;
      }
      if (S.tuck > 0.01) {
        tr.lerp(tA.set(-0.16, -0.08, 0.16), S.tuck);
        tl.lerp(tA.set(-0.02, 0.24, 0.2), S.tuck);
      }
    } else if (h === 'pistols') {
      tr.set(-0.13, k * 0.14 - 0.08 + sw * 0.08 * (1 - k), 0.3 + k * 0.2 - sw * 0.12 * (1 - k));
      tl.set(0.13, k * 0.14 - 0.08 - sw * 0.08 * (1 - k), 0.3 + k * 0.2 + sw * 0.12 * (1 - k));
    } else if (h === 'bow') {
      const u = a === 'attack' ? clamp01(S.actT / 0.5) : 0;
      const draw = a === 'attack' ? (u < 0.55 ? smooth(u / 0.55) : 0) : 0;
      tl.set(0.08 + (1 - k) * 0.12, -0.02 + k * 0.18, 0.3 + k * 0.24);
      tr.set(-0.1 - draw * 0.06, -0.08 + k * 0.24, 0.22 + k * 0.28 - draw * 0.38);
      poleR = v(-1, 0.2, -0.4);
    } else if (h === 'staff' || h === 'spear') {
      tr.set(-0.26, -0.08 + sw * 0.03, 0.22 + sw * 0.08);
      tl.set(0.24, -0.36, 0.06 - sw * 0.2);
    } else if (h === 'hammer') {
      tr.set(-0.2, -0.14 + sw * 0.03, 0.2);
      tl.set(0.06, -0.04 + sw * 0.03, 0.28);
    } else if (h === 'orb') {
      tr.set(-0.2, 0.02 + Math.sin(t * 2 + S.seed) * 0.02, 0.3);
      tl.set(0.24, -0.3, 0.08 - sw * 0.2);
    } else if (h === 'sword' || h === 'daggers' || h === 'shield') {
      tr.set(-0.3, -0.28 + sw * 0.05, 0.16 + sw * 0.2);
      tl.set(0.3, -0.26 - sw * 0.05, 0.14 - sw * 0.2);
      if (h === 'shield') tl.set(0.12, 0, 0.36);
    } else {
      const b = 0.06 + run * 0.2;
      tr.set(-0.27 + run * 0.05, -0.42 + run * 0.22 + Math.max(0, sw) * 0.12, 0.06 + run * 0.1 + sw * (0.2 + b));
      tl.set(0.27 - run * 0.05, -0.42 + run * 0.22 + Math.max(0, -sw) * 0.12, 0.06 + run * 0.1 - sw * (0.2 + b));
    }
    if (a === 'attack' && h !== 'bow' && h !== 'rifle' && h !== 'cannon' && h !== 'pistols') {
      const u = clamp01(S.actT / 0.5);
      if (h === 'staff' || h === 'orb') {
        key(
          u,
          [
            [0, tr.clone()],
            [0.35, v(-0.28, 0.2, 0.05)],
            [0.55, v(-0.06, 0.16, 0.52)],
            [1, tr.clone()],
          ],
          tr,
        );
      } else if (h === 'daggers') {
        key(
          u,
          [
            [0, tr.clone()],
            [0.25, v(-0.4, 0.1, 0)],
            [0.45, v(0.1, -0.05, 0.5)],
            [1, tr.clone()],
          ],
          tr,
        );
        key(
          u,
          [
            [0, tl.clone()],
            [0.45, v(0.42, 0.15, 0)],
            [0.7, v(-0.05, -0.02, 0.5)],
            [1, tl.clone()],
          ],
          tl,
        );
      } else {
        key(
          u,
          [
            [0, tr.clone()],
            [0.35, v(-0.34, 0.42, -0.1)],
            [0.58, v(0.12, -0.16, 0.5)],
            [1, tr.clone()],
          ],
          tr,
        );
        if (h === 'hammer') {
          key(
            u,
            [
              [0, tl.clone()],
              [0.35, v(-0.12, 0.46, 0)],
              [0.58, v(0.22, -0.06, 0.46)],
              [1, tl.clone()],
            ],
            tl,
          );
        }
      }
    }
    if (a === 'cast') {
      const u = smooth(clamp01(S.actT / 0.25));
      tl.lerp(v(0.16, 0.2, 0.46), u);
      if (h !== 'staff') tr.lerp(v(-0.16, 0.2, 0.46), u);
      else tr.lerp(v(-0.2, 0.34, 0.3), u);
    }
    if (a === 'ult') {
      const u = smooth(clamp01(S.actT / 0.25));
      tl.lerp(v(0.34, 0.52, 0.12), u);
      tr.lerp(v(-0.34, 0.52, 0.12), u);
      poleL = v(1, -0.2, -0.3);
      poleR = v(-1, -0.2, -0.3);
    }
    if (a === 'throw') {
      const u = clamp01(S.actT / 0.45);
      key(
        u,
        [
          [0, tr.clone()],
          [0.4, v(-0.32, 0.3, -0.3)],
          [0.65, v(-0.14, 0.3, 0.42)],
          [1, tr.clone()],
        ],
        tr,
      );
      tl.lerp(v(0.26, 0.1, 0.3), 0.6);
    }
    if (a === 'plant') {
      tr.set(-0.08 + Math.sin(t * 14) * 0.012, -0.5, 0.4);
      tl.set(0.08 + Math.sin(t * 11) * 0.012, -0.5, 0.42);
    }
    if (a === 'blind') {
      tl.set(0.1, 0.28, 0.16);
      poleL = v(1, -0.4, 0.3);
    }
    if (a === 'stun') {
      tl.set(0.3, -0.4, 0.1);
      tr.set(-0.3, -0.4, 0.1);
    }
    if (a === 'shield') {
      tl.set(0.16, 0.06, 0.42);
      tr.set(-0.2, 0, 0.34);
    }
    if (a === 'type') {
      const j = (n: number) => Math.sin(t * (9 + n * 2.3) + S.seed * n) * 0.008;
      tl.set(0.17 + j(1), -0.2 + j(2) * 0.4, 0.36 + j(1.4));
      const ms = Math.sin(t * 3.1 + S.seed) * Math.sin(t * 1.3) * 0.035;
      tr.set(-0.25 + ms, -0.2, 0.37 + Math.sin(t * 2.3 + S.seed) * 0.02);
    } else if (a === 'sit') {
      tl.set(0.2, -0.3, 0.24);
      tr.set(-0.2, -0.3, 0.24);
    } else if (a === 'slump') {
      tl.set(0.06, 0.06, 0.26);
      tr.set(-0.06, 0.06, 0.26);
    } else if (a === 'lift') {
      const u = 0.5 + 0.5 * Math.sin(t * 2.2 + S.seed);
      tl.set(0.3, -0.2 + u * 0.6, 0.12);
      tr.set(-0.3, -0.2 + u * 0.6, 0.12);
      poleL = v(1, -0.6, -0.2);
      poleR = v(-1, -0.6, -0.2);
    } else if (a === 'bench') {
      const u = 0.5 + 0.5 * Math.sin(t * 2 + S.seed);
      tl.set(0.26, 0.1, 0.2 + u * 0.28);
      tr.set(-0.26, 0.1, 0.2 + u * 0.28);
      poleL = v(1, -0.4, -0.6);
      poleR = v(-1, -0.4, -0.6);
    } else if (a === 'yoga') {
      tl.set(0.32, -0.34, 0.24);
      tr.set(-0.32, -0.34, 0.24);
    } else if (a === 'cook') {
      tl.set(0.15, -0.25, 0.34);
      tr.set(-0.16 + Math.sin(t * 6) * 0.06, -0.23 + Math.abs(Math.sin(t * 6)) * 0.04, 0.38 + Math.cos(t * 6) * 0.05);
    } else if (a === 'lie') {
      tl.set(0.18, -0.28, 0.1);
      tr.set(-0.18, -0.28, 0.1);
    } else if (a === 'talk') {
      tr.set(-0.24, -0.16 + Math.sin(t * 2.6 + S.seed) * 0.1, 0.3 + Math.sin(t * 1.9) * 0.06);
      tl.set(0.25, -0.3 + Math.sin(t * 2.1 + S.seed * 2) * 0.06, 0.22);
    } else if (a === 'cheer') {
      const u = Math.abs(Math.sin(t * 6 + S.seed));
      tl.set(0.26, 0.42 + u * 0.14, 0.08);
      tr.set(-0.26, 0.42 + u * 0.14, 0.08);
      poleL = v(1, 0, 0);
      poleR = v(-1, 0, 0);
    } else if (a === 'pingpong') {
      tr.set(-0.3 + Math.sin(t * 4 + S.seed) * 0.25, -0.12, 0.35);
    }
    // what the arms do on top of the pose: people talk, eat and lose their temper sitting down as well
    if (S.over) {
      const k = t * 1 + S.seed * 3;
      if (S.over === 'talk') {
        tr.set(-0.24, -0.1 + Math.sin(k * 2.9) * 0.1, 0.32 + Math.sin(k * 2.1) * 0.07);
        tl.set(0.26, -0.16 + Math.sin(k * 2.3 + 1) * 0.08, 0.28);
      } else if (S.over === 'argue') {
        const j = Math.sin(k * 7) > 0.2 ? 0.16 : 0;
        tr.set(-0.18 + Math.sin(k * 5) * 0.1, 0.08 + j, 0.46);
        tl.set(0.34, 0.04 + Math.sin(k * 6 + 2) * 0.14, 0.24);
      } else if (S.over === 'rage') {
        const u = Math.pow(Math.abs(Math.sin(k * 5.2)), 0.6);
        tr.set(-0.2, -0.28 + u * 0.62, 0.36);
        tl.set(0.2, -0.28 + u * 0.62, 0.36);
      } else if (S.over === 'eat') {
        const u = smooth(clamp01(Math.sin(k * 1.6) * 1.6));
        tr.set(-0.2 + u * 0.14, -0.26 + u * 0.42, 0.34 - u * 0.14);
        tl.set(0.18, -0.28, 0.34);
      } else if (S.over === 'phone') {
        tr.set(-0.1, 0.02, 0.27);
        tl.set(0.22, -0.34, 0.18);
      } else if (S.over === 'wash') {
        tr.set(-0.13 + Math.sin(k * 6) * 0.05, 0.42 + Math.cos(k * 5) * 0.05, 0.06);
        tl.set(0.13 + Math.cos(k * 6) * 0.05, 0.4 + Math.sin(k * 5) * 0.05, 0.04);
        poleL = v(1, 0, -0.2);
        poleR = v(-1, 0, -0.2);
      } else if (S.over === 'laugh') {
        tr.set(-0.08, -0.22 + Math.sin(k * 11) * 0.02, 0.2);
        tl.set(0.1, -0.26 + Math.sin(k * 11) * 0.02, 0.2);
      } else if (S.over === 'face') {
        tr.set(-0.05, 0.2, 0.17);
        tl.set(0.05, 0.2, 0.17);
      } else if (S.over === 'scratch') {
        tr.set(-0.12, 0.34 + Math.sin(k * 8) * 0.02, 0.02);
      }
    }
    if (D > 0.01) {
      tl.lerp(v(0.42, 0.12, -0.05), D);
      tr.lerp(v(-0.36, -0.2, 0.02), D);
    }
    // ease hand targets so state changes never pop
    const ease = Math.min(1, dt * (a === 'attack' || a === 'throw' ? 26 : a === 'type' ? 14 : 16));
    S.hl.lerp(tl, ease);
    S.hr.lerp(tr, ease);
    const W = (p: V) => p.clone().applyQuaternion(CQ).add(C);
    for (const s of [1, -1]) {
      const L = s > 0;
      const sh = t0
        .set(0.185 * s, 0.17, 0)
        .applyQuaternion(CQ)
        .add(C)
        .clone();
      const tgt = W(L ? S.hl : S.hr);
      const pole = (L ? poleL : poleR).clone().applyQuaternion(CQ);
      const end = v();
      S.limb(L ? RL.aL : RL.aR, sh, tgt, pole, UA, FA, L ? B.uaL : B.uaR, L ? B.faL : B.faR, end);
      const d = t1.subVectors(end, S.p[L ? B.faL : B.faR]).normalize();
      (L ? S.handL : S.handR).copy(end).addScaledVector(d, 0.07);
    }
    // weapon frame: +Z forward along barrel/blade
    const fwd = t0;
    if (h === 'rifle' || h === 'cannon') fwd.subVectors(S.handL, S.handR).normalize();
    else if (h === 'pistols') fwd.set(0, -0.1 + k * 0.1, 1).applyQuaternion(CQ);
    else if (h === 'bow') fwd.set(0, 0, 1).applyQuaternion(CQ);
    else if (h === 'staff' || h === 'spear')
      fwd
        .set(0.06, 1, a === 'attack' || a === 'cast' ? 0.5 : 0.12)
        .applyQuaternion(CQ)
        .normalize();
    else if (h === 'hammer') {
      if (a === 'attack' || (mv < 0.05 && k > 0.5))
        fwd
          .subVectors(S.handR, S.p[B.faR])
          .normalize()
          .add(t1.set(0, 0.5, 0.2).applyQuaternion(CQ))
          .normalize();
      else fwd.set(0.25, 1, -0.1).applyQuaternion(CQ).normalize();
    } else {
      fwd.subVectors(S.handR, S.p[B.faR]).normalize();
      if (a === 'attack') fwd.add(t1.set(0, 0.3, 0.5).applyQuaternion(CQ)).normalize();
      else fwd.lerp(t1.set(-0.05, 0.35, 0.9).applyQuaternion(CQ), 0.65).normalize();
    }
    const upv = Math.abs(fwd.y) > 0.95 ? v(0, 0, -1) : v(0, 1, 0);
    const rt = upv.clone().cross(fwd).normalize();
    const up = fwd.clone().cross(rt);
    S.weapon.makeBasis(rt, up, fwd).setPosition(h === 'bow' ? S.handL : S.handR);
    const fl =
      h === 'pistols'
        ? fwd
        : t2
            .subVectors(S.handL, S.p[B.faL])
            .normalize()
            .lerp(t1.set(0.05, 0.35, 0.9).applyQuaternion(CQ), 0.6)
            .normalize();
    const rl = v(0, 1, 0).cross(fl).normalize();
    S.weaponL.makeBasis(rl, fl.clone().cross(rl), fl).setPosition(S.handL);
    // cape: damped spring pushed by speed
    const want = Math.min(1.15, spd * 0.2) * (back ? -0.1 : 1) + Math.sin(t * 2.3 + S.seed) * 0.04 + D * 0.1;
    for (let n = Math.min(6, Math.max(1, Math.ceil(dt / 0.02))), q = Math.min(dt, 0.12) / n; n > 0; n--) {
      S.capeV += ((want - S.capeA) * 46 - S.capeV * 7) * q;
      S.capeA += S.capeV * q;
    }
    S.capeA = Math.max(-0.4, Math.min(1.4, S.capeA));
    S.p[B.c1].set(0, 0.1, -0.14).applyQuaternion(CQ).add(C);
    q0.setFromAxisAngle(X, S.capeA * 0.75 - (bend + pitch) * 0.6);
    S.r[B.c1].copy(CQ).multiply(q0);
    t0.set(0, -0.41, -0.04).applyQuaternion(S.r[B.c1]);
    S.p[B.c2].copy(S.p[B.c1]).add(t0);
    q0.setFromAxisAngle(X, S.capeA * 0.45 + Math.sin(t * 5 + S.seed) * 0.05 * mv);
    S.r[B.c2].copy(S.r[B.c1]).multiply(q0);
    for (let i = 0; i < NB; i++) {
      const b = S.bones[i];
      b.matrixWorld.makeRotationFromQuaternion(S.r[i]).setPosition(S.p[i]);
    }
  }
}
