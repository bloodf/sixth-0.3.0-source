/** The arena around the battleground: stage table, five-player desks with the coach behind them, stands, crowd, beams. */
import * as THREE from 'three';
import { Kit, shade } from './kit.ts';
import { lowLit, type Engine } from './engine.ts';
import { specOf } from './look.ts';
import { Character, civHead, civPalette } from './character.ts';
import type { SimTeam } from '../sim/types.ts';
import { Rng } from '../core/rng.ts';
import { genLook } from '../game/gen.ts';
const CV = `attribute float ph; attribute vec3 tint; uniform float uT; uniform float uE; varying vec3 vC; varying float vS; void main(){ vec3 p=position; float up=step(0.55,p.y); float j=abs(sin(uT*(5.0+ph*3.0)+ph*40.0))*uE; p.y+=j*0.35; p.x+=sin(uT*1.3+ph*20.0)*0.06*up; vec4 w=instanceMatrix*vec4(p,1.0); vC=tint*(0.35+0.65*smoothstep(0.0,1.2,position.y)); float st=step(0.965,fract(ph*91.7+floor(uT*7.0+ph*10.0)*0.137)); vS=st*step(0.9,position.y); gl_Position=projectionMatrix*modelViewMatrix*w; }`;
const CF = `varying vec3 vC; varying float vS; uniform vec3 uL; void main(){ gl_FragColor=vec4(vC*uL+vec3(vS*1.6),1.0);
#include <colorspace_fragment>
}`;
const BV = `varying float vK; varying vec2 vU; void main(){ vK=uv.y; vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const BF = `varying float vK; varying vec2 vU; uniform vec3 uC; uniform float uA; void main(){ gl_FragColor=vec4(uC, pow(vK,1.6)*uA); }`;
export interface Hall {
  group: THREE.Group;
  far: THREE.Object3D[];
  update(dt: number, t: number): void;
  excite(k: number, team?: number): void;
  screens: THREE.CanvasTexture;
  drawScreen(f: (g: CanvasRenderingContext2D, w: number, h: number) => void): void;
  dispose(): void;
  people: Character[];
}
export function buildHall(e: Engine, w: number, h: number, teams: [SimTeam, SimTeam]): Hall {
  const g = new THREE.Group(),
    k = new Kit(),
    low = e.q === 'low';
  const cx = w / 2,
    cz = h / 2;
  const r = Rng.of('hall' + teams[0].tag + teams[1].tag);
  // stage
  k.rbox(cx, -2.2, cz, w + 5, 2.16, h + 5, '#1c242c', { b: 0.3 });
  k.rbox(cx, -3.4, cz, w + 13, 1.3, h + 12, '#141a20', { b: 0.3 });
  for (const [i, t] of teams.entries()) {
    const sx = i ? 1 : -1;
    const X = cx + sx * (w / 2 + 2.2);
    k.box(X, -0.1, cz, 0.22, 0.14, h + 4, t.c1, { glow: true });
    k.box(cx + sx * (w / 4 + 0.5), -0.1, cz - h / 2 - 2.2, w / 2 + 1, 0.14, 0.22, t.c1, { glow: true });
    k.box(cx + sx * (w / 4 + 0.5), -0.1, cz + h / 2 + 2.2, w / 2 + 1, 0.14, 0.22, t.c1, { glow: true });
  }
  // floor
  const fl = new THREE.Mesh(new THREE.CircleGeometry(170, 48).rotateX(-Math.PI / 2), e.mat({ color: '#16202a', rough: 0.5, metal: 0.2 }));
  fl.position.set(cx, -3.4, cz);
  g.add(fl);
  // desks: five seats in a row and one standing behind
  const people: Character[] = [];
  const S = 2.1;
  for (const [i, t] of teams.entries()) {
    const sx = i ? 1 : -1;
    const X = cx + sx * (w / 2 + 10.5);
    const face = i ? -Math.PI / 2 : Math.PI / 2;
    k.rbox(X + sx * 1.5, -3.4, cz, 9, 1.2, 25, shade(t.c1, -0.72), { b: 0.2 });
    k.box(X - sx * 2.95, -2.9, cz, 0.12, 0.5, 25, t.c1, { glow: true });
    k.rbox(X - sx * 1.2, -2.2, cz, 1.5, 1.55, 23.5, '#262f38', { b: 0.1 });
    k.box(X - sx * 2.0, -1.9, cz, 0.08, 0.9, 22.6, shade(t.c1, -0.15));
    k.rbox(X - sx * 1.1, -0.68, cz, 2.1, 0.12, 23.8, '#323d48', { b: 0.04 });
    for (let p = 0; p < 5; p++) {
      const z = cz + (p - 2) * 4.6 * (i ? -1 : 1);
      k.rbox(X - sx * 1.5, -0.56, z, 0.14, 1.0, 1.8, '#11161b', { b: 0.05 });
      k.box(X - sx * 1.41, -0.46, z, 0.02, 0.82, 1.6, shade(t.c1, 0.45), { glow: true });
      k.box(X - sx * 0.75, -0.56, z, 0.5, 0.06, 1.1, '#15191e');
      k.rbox(X + sx * 1.35, -2.2, z, 1.3, 1.0, 1.2, '#1a2026', { b: 0.15 });
      k.rbox(X + sx * 1.95, -1.3, z, 0.3, 2.0, 1.2, '#222a32', { b: 0.12 });
      k.box(X + sx * 1.78, -0.7, z, 0.04, 0.9, 0.35, t.c1, { ao: 0 });
      const L = genLook(r, r.pick(['DK', 'BR', 'KR', 'FR', 'US']), r.chance(0.15));
      const c = new Character(low, { outfit: 'civil', head: civHead(L), cape: false, headset: true }, civPalette(L, t.c1, t.c2, t.c1), {
        scale: S,
        cell: low ? 0.07 : 0.04,
        human: specOf(L, 'h' + i + p, { outfit: 'tee', age: 20 }),
        lod: low ? 2 : 1,
      });
      c.rig.act = 'type';
      c.rig.seat = 0.42;
      c.root.position.set(X + sx * 1.15, -2.2, z);
      c.root.rotation.y = face;
      g.add(c.root);
      people.push(c);
    }
    const cl = genLook(r, 'DE');
    const coach = new Character(
      low,
      { outfit: 'coat', head: civHead(cl), cape: false, headset: true },
      civPalette(cl, '#20262d', t.c2, t.c1),
      {
        scale: S,
        cell: low ? 0.07 : 0.04,
        human: specOf(cl, 'hc' + i, { outfit: 'shirt', shoes: 'smart', age: 38 }),
        lod: low ? 2 : 1,
      },
    );
    coach.rig.act = 'talk';
    coach.root.position.set(X + sx * 4.2, -2.2, cz);
    coach.root.rotation.y = face;
    g.add(coach.root);
    people.push(coach);
  }
  // stands
  const rows = low ? 5 : 9;
  const rx = w / 2 + 24,
    rz = h / 2 + 18;
  const seats: [number, number, number, number][] = [];
  const st = new Kit();
  for (let q = 0; q < rows; q++) {
    const X = rx + q * 3.2,
      Z = rz + q * 3.0,
      y = -3.2 + q * 1.5;
    const n = low ? 28 : 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283;
      const sgn = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
      const x = cx + sgn(Math.cos(a), 0.62) * X,
        z = cz + sgn(Math.sin(a), 0.62) * Z;
      const ry = Math.atan2(cx - x, cz - z);
      st.box(x, y - 1, z, 9.5 * (X / 66), 1.5, 3.2, q % 2 ? '#1a232b' : '#161e25', { ry, ao: 0.5 });
      const m = low ? 3 : 6;
      for (let j = 0; j < m; j++) {
        const o = (j - (m - 1) / 2) * (low ? 2.2 : 1.25);
        seats.push([x + Math.cos(ry) * o, y + 0.5, z - Math.sin(ry) * o, ry]);
      }
    }
  }
  const plain = low ? lowLit(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })) : e.mat({ vc: true, rough: 0.7 });
  const sm = new THREE.Mesh(k.geo(), plain);
  sm.receiveShadow = true;
  const stands = new THREE.Mesh(st.geo(), plain);
  stands.receiveShadow = true;
  g.add(sm, stands);
  g.add(
    new THREE.Mesh(
      k.glow()!,
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) }),
    ),
  );
  const ck = new Kit();
  ck.box(0, 0, 0, 0.75, 0.85, 0.5, '#fff', { ao: 0 });
  ck.box(0, 0.9, 0.02, 0.4, 0.42, 0.4, '#fff', { ao: 0 });
  if (!low) {
    ck.box(0.42, 0.4, 0.15, 0.18, 0.75, 0.18, '#fff', { ao: 0 });
    ck.box(-0.42, 0.4, 0.15, 0.18, 0.75, 0.18, '#fff', { ao: 0 });
  }
  const cg = ck.geo();
  cg.deleteAttribute('color');
  const cm = new THREE.ShaderMaterial({
    vertexShader: CV,
    fragmentShader: CF,
    uniforms: { uT: { value: 0 }, uE: { value: 0.1 }, uL: { value: new THREE.Color(0.75, 0.8, 0.88) } },
  });
  const crowd = new THREE.InstancedMesh(cg, cm, seats.length);
  const ph = new Float32Array(seats.length),
    tint = new Float32Array(seats.length * 3);
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    tc = new THREE.Color();
  seats.forEach((s, i) => {
    M.compose(new THREE.Vector3(s[0], s[1], s[2]), Q.setFromAxisAngle(up, s[3]), new THREE.Vector3(1, 0.9 + r.f() * 0.25, 1));
    crowd.setMatrixAt(i, M);
    ph[i] = r.f();
    const side = s[0] < cx ? 0 : 1;
    tc.set(r.chance(0.42) ? teams[side].c1 : r.pick(['#2b2f36', '#51463d', '#3a4653', '#6b6258', '#222'])).multiplyScalar(
      0.6 + r.f() * 0.5,
    );
    tint.set([tc.r, tc.g, tc.b], i * 3);
  });
  cg.setAttribute('ph', new THREE.InstancedBufferAttribute(ph, 1));
  cg.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  crowd.frustumCulled = false;
  g.add(crowd);
  // hanging screens
  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 256;
  const tex = new THREE.CanvasTexture(sc);
  tex.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const smat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const [x, z, ry] of [
    [cx, cz - h / 2 - 17, 0],
    [cx - w / 2 - 22, cz, Math.PI / 2],
    [cx + w / 2 + 22, cz, -Math.PI / 2],
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), smat);
    m.position.set(x, 11, z);
    m.rotation.y = ry;
    g.add(m);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(27, 14, 0.6), e.mat({ color: '#10161b' }));
    fr.position.set(x, 11, z);
    fr.rotation.y = ry;
    fr.translateZ(-0.4);
    g.add(fr);
  }
  // beams
  const beams: { m: THREE.Mesh; a: number; s: number }[] = [];
  if (!low)
    for (let i = 0; i < 10; i++) {
      const t = teams[i % 2];
      const c = new THREE.ConeGeometry(4.2, 46, 18, 1, true);
      c.translate(0, -23, 0);
      const m = new THREE.Mesh(
        c,
        new THREE.ShaderMaterial({
          vertexShader: BV,
          fragmentShader: BF,
          uniforms: { uC: { value: new THREE.Color(t.c1).lerp(new THREE.Color('#fff'), 0.3) }, uA: { value: 0.13 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const side = i % 2 ? 1 : -1;
      m.position.set(cx + side * (w / 2 + 16), 32, cz + (Math.floor(i / 2) - 2) * 16);
      g.add(m);
      beams.push({ m, a: i * 1.3, s: side });
    }
  let ex = 0.1,
    hot = 0;
  return {
    group: g,
    far: low ? [crowd, stands, ...people.map(p => p.root)] : [crowd, ...people.map(p => p.root)],
    people,
    screens: tex,
    drawScreen(f) {
      f(sc.getContext('2d')!, 512, 256);
      tex.needsUpdate = true;
    },
    excite(v) {
      ex = Math.max(ex, v);
      hot = Math.max(hot, v);
    },
    update(dt, t) {
      cm.uniforms.uT.value = t;
      ex += (0.08 - ex) * dt * 0.55;
      hot *= Math.exp(-dt * 0.8);
      cm.uniforms.uE.value = ex;
      for (const b of beams) {
        b.m.rotation.set(Math.sin(t * (0.35 + hot) + b.a) * 0.42, 0, b.s * (-0.35 + Math.sin(t * (0.28 + hot * 0.8) + b.a * 2) * 0.3));
        (b.m.material as THREE.ShaderMaterial).uniforms.uA.value = 0.1 + hot * 0.16;
      }
    },
    dispose() {
      people.forEach(p => p.dispose());
    },
  };
}
