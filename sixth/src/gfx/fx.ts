/** Pooled effects: particles, tracers, rings, domes, smoke volumes, fire, light flashes. */
import * as THREE from 'three';
import { flareTex, puffTex, ringTex, softTex } from './tex.ts';
const PV = `attribute vec3 vel; attribute vec4 dat; attribute vec3 col; attribute vec2 sz; uniform float uT; uniform float uH; varying vec3 vC; varying float vA; varying float vR;
void main(){ float age=uT-dat.x; float k=age/dat.y; if(k<0.0||k>1.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; vA=0.0; return; } float dr=dat.w; float e=(1.0-exp(-dr*age))/max(dr,0.001); vec3 p=position+vel*e+vec3(0.0,dat.z*age*age*0.5,0.0); if(p.y<0.03&&dat.z<0.0) p.y=0.03; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; float s=mix(sz.x,sz.y,k); gl_PointSize=clamp(s*uH/max(0.1,-mv.z),0.0,400.0); vC=col; vA=(1.0-k)*min(1.0,age*30.0+0.25); vR=fract(dat.x*13.7)*6.28+k; }`;
const PF = `uniform sampler2D uM; varying vec3 vC; varying float vA; varying float vR; uniform float uK; void main(){ vec2 c=gl_PointCoord-0.5; float s=sin(vR),o=cos(vR); c=mat2(o,-s,s,o)*c+0.5; float a=texture2D(uM,c).a; gl_FragColor=vec4(vC*uK,a*vA);
#include <colorspace_fragment>
}`;
class Pool {
  i = 0;
  g = new THREE.BufferGeometry();
  pos: THREE.BufferAttribute;
  vel: THREE.BufferAttribute;
  dat: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  sz: THREE.BufferAttribute;
  m: THREE.ShaderMaterial;
  pts: THREE.Points;
  dirty = false;
  constructor(
    public n: number,
    tex: THREE.Texture,
    add: boolean,
    k = 1,
  ) {
    const A = (s: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * s), s);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = A(3);
    this.vel = A(3);
    this.dat = A(4);
    this.col = A(3);
    this.sz = A(2);
    for (let i = 0; i < n; i++) this.dat.setXYZW(i, -100, 1, 0, 1);
    this.g.setAttribute('position', this.pos);
    this.g.setAttribute('vel', this.vel);
    this.g.setAttribute('dat', this.dat);
    this.g.setAttribute('col', this.col);
    this.g.setAttribute('sz', this.sz);
    this.m = new THREE.ShaderMaterial({
      vertexShader: PV,
      fragmentShader: PF,
      uniforms: { uT: { value: 0 }, uH: { value: 800 }, uM: { value: tex }, uK: { value: k } },
      transparent: true,
      depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.pts = new THREE.Points(this.g, this.m);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = add ? 6 : 5;
  }
  add(
    t: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    grav: number,
    drag: number,
    c: THREE.Color,
    s0: number,
    s1: number,
  ) {
    const i = (this.i = (this.i + 1) % this.n);
    this.pos.setXYZ(i, x, y, z);
    this.vel.setXYZ(i, vx, vy, vz);
    this.dat.setXYZW(i, t, life, grav, drag);
    this.col.setXYZ(i, c.r, c.g, c.b);
    this.sz.setXY(i, s0, s1);
    this.dirty = true;
  }
  flush(t: number, h: number) {
    this.m.uniforms.uT.value = t;
    this.m.uniforms.uH.value = h;
    if (this.dirty) {
      this.dirty = false;
      for (const a of [this.pos, this.vel, this.dat, this.col, this.sz]) a.needsUpdate = true;
    }
  }
}
const FV = `varying vec3 vN; varying vec3 vP; varying vec3 vL; void main(){ vL=position; vN=normalize(normalMatrix*normal); vec4 m=modelViewMatrix*vec4(position,1.0); vP=m.xyz; gl_Position=projectionMatrix*m; }`;
const FF = `uniform vec3 uC; uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vP; varying vec3 vL; void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),2.2); float g=0.5+0.5*sin(vL.y*14.0-uT*4.0); float hx=smoothstep(0.86,1.0,sin(vL.x*12.0)*sin(vL.z*12.0+vL.y*7.0)); gl_FragColor=vec4(uC*(1.0+f),(f*0.75+0.07+g*0.04+hx*0.12)*uA); }`;
interface Flash {
  m: THREE.Mesh;
  t: number;
  T: number;
  s0: number;
  s1: number;
  c: THREE.Color;
  spin: number;
}
export class Fx {
  g = new THREE.Group();
  spark: Pool;
  smoke: Pool;
  t = 0;
  tr: THREE.InstancedMesh;
  trD: { t: number; T: number; c: THREE.Color }[] = [];
  trI = 0;
  rings: Flash[] = [];
  domes: { m: THREE.Mesh; t: number; T: number; follow?: () => THREE.Vector3 | null; fade: number }[] = [];
  lights: { l: THREE.PointLight; t: number; T: number; i: number }[] = [];
  flares: Flash[] = [];
  private tm = new THREE.Matrix4();
  private tc = new THREE.Color();
  private ringG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private domeG = new THREE.SphereGeometry(1, 24, 14);
  shake = 0;
  persistent: { k: any; upd: (dt: number) => boolean; obj: THREE.Object3D }[] = [];
  constructor(
    public rich: boolean,
    public low: boolean,
  ) {
    this.spark = new Pool(low ? 900 : 2600, softTex(), true, low ? 1.2 : 2.2);
    this.smoke = new Pool(low ? 300 : 900, puffTex(), false);
    this.g.add(this.smoke.pts, this.spark.pts);
    const bg = new THREE.BoxGeometry(1, 1, 1);
    this.tr = new THREE.InstancedMesh(
      bg,
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      90,
    );
    this.tr.frustumCulled = false;
    for (let i = 0; i < 90; i++) {
      this.tr.setMatrixAt(i, this.tm.makeScale(0, 0, 0));
      this.tr.setColorAt(i, this.tc.set(0));
      this.trD.push({ t: -1, T: 1, c: new THREE.Color() });
    }
    this.g.add(this.tr);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(
        this.ringG,
        new THREE.MeshBasicMaterial({
          map: ringTex(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      m.visible = false;
      m.renderOrder = 4;
      this.g.add(m);
      this.rings.push({ m, t: 1, T: 1, s0: 1, s1: 1, c: new THREE.Color(), spin: 0 });
    }
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flareTex(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ) as any;
      m.visible = false;
      this.g.add(m);
      this.flares.push({ m, t: 1, T: 1, s0: 1, s1: 1, c: new THREE.Color(), spin: 0 });
    }
    if (!low)
      for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight('#fff', 0, 12, 1.6);
        this.g.add(l);
        this.lights.push({ l, t: 1, T: 1, i: 0 });
      }
  }
  light(x: number, y: number, z: number, c: THREE.ColorRepresentation, i: number, T: number) {
    const L = this.lights.find(l => l.t >= l.T) ?? this.lights[0];
    if (!L) return;
    L.l.position.set(x, y, z);
    L.l.color.set(c);
    L.t = 0;
    L.T = T;
    L.i = i;
  }
  flare(x: number, y: number, z: number, c: THREE.ColorRepresentation, s: number, T: number) {
    const f = this.flares.find(f => f.t >= f.T) ?? this.flares[Math.floor(Math.random() * this.flares.length)];
    f.m.position.set(x, y, z);
    f.t = 0;
    f.T = T;
    f.s0 = s;
    f.s1 = s * 0.5;
    f.c.set(c);
    (f.m as any).material.rotation = Math.random() * 6;
    f.m.visible = true;
  }
  ring(x: number, y: number, z: number, c: THREE.ColorRepresentation, r0: number, r1: number, T: number) {
    const f = this.rings.find(f => f.t >= f.T) ?? this.rings[Math.floor(Math.random() * this.rings.length)];
    f.m.position.set(x, y, z);
    f.t = 0;
    f.T = T;
    f.s0 = r0 * 2;
    f.s1 = r1 * 2;
    f.c.set(c);
    f.m.visible = true;
  }
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: THREE.ColorRepresentation, w: number, T: number) {
    const i = (this.trI = (this.trI + 1) % 90);
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az),
      l = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    this.tm.compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(w, w, l));
    this.tr.setMatrixAt(i, this.tm);
    this.tr.instanceMatrix.needsUpdate = true;
    this.trD[i].t = 0;
    this.trD[i].T = T;
    this.trD[i].c.set(c);
  }
  burst(
    x: number,
    y: number,
    z: number,
    c: THREE.ColorRepresentation,
    n: number,
    sp: number,
    life: number,
    size: number,
    o: { up?: number; grav?: number; drag?: number; grow?: number } = {},
  ) {
    this.tc.set(c);
    if (this.low) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283,
        u = Math.random() * 2 - 1,
        s = Math.sqrt(1 - u * u),
        v = sp * (0.35 + Math.random() * 0.65);
      this.spark.add(
        this.t,
        x,
        y,
        z,
        Math.cos(a) * s * v,
        Math.abs(u) * v * (o.up ?? 1),
        Math.sin(a) * s * v,
        life * (0.5 + Math.random() * 0.5),
        o.grav ?? -6,
        o.drag ?? 2,
        this.tc,
        size * (0.6 + Math.random() * 0.6),
        size * (o.grow ?? 0.1),
      );
    }
  }
  puff(
    x: number,
    y: number,
    z: number,
    c: THREE.ColorRepresentation,
    n: number,
    sp: number,
    life: number,
    s0: number,
    s1: number,
    up = 0.6,
  ) {
    this.tc.set(c);
    if (this.low) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283,
        v = sp * Math.random();
      this.smoke.add(
        this.t,
        x,
        y,
        z,
        Math.cos(a) * v,
        up * (0.4 + Math.random()),
        Math.sin(a) * v,
        life * (0.6 + Math.random() * 0.4),
        0,
        2,
        this.tc,
        s0,
        s1 * (0.7 + Math.random() * 0.6),
      );
    }
  }
  muzzle(x: number, y: number, z: number, big = 1) {
    this.flare(x, y, z, '#ffd9a0', 0.9 * big, 0.06);
    this.light(x, y, z, '#ffb866', 10 * big, 0.06);
  }
  impact(x: number, y: number, z: number, c: THREE.ColorRepresentation = '#ffd9a0') {
    this.burst(x, y, z, c, 5, 4, 0.3, 0.13);
    this.puff(x, y, z, '#a89a88', 1, 0.4, 0.5, 0.3, 0.9);
  }
  boom(x: number, y: number, z: number, s = 1, c: THREE.ColorRepresentation = '#ff9a3a') {
    this.flare(x, y + 0.5, z, '#fff1d0', 5 * s, 0.16);
    this.burst(x, y + 0.4, z, c, 26 * s, 11 * s, 0.7, 0.5 * s, { grav: -9 });
    this.burst(x, y + 0.4, z, '#ffe9b0', 14 * s, 6 * s, 0.35, 0.9 * s, { grav: 0, drag: 5 });
    this.puff(x, y + 0.5, z, '#3c3632', 10 * s, 3.4 * s, 1.7, 1.2 * s, 3.2 * s, 1.5);
    this.ring(x, 0.08, z, c, 0.5 * s, 5.5 * s, 0.4);
    this.light(x, y + 1.5, z, c, 60 * s, 0.25);
    this.shake = Math.max(this.shake, 0.35 * s);
  }
  dome(c: THREE.ColorRepresentation, r: number, T: number, pos: THREE.Vector3, follow?: () => THREE.Vector3 | null, flat = 1) {
    const m = new THREE.Mesh(
      this.domeG,
      new THREE.ShaderMaterial({
        vertexShader: FV,
        fragmentShader: FF,
        uniforms: { uC: { value: new THREE.Color(c) }, uA: { value: 0 }, uT: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    m.scale.set(r, r * flat, r);
    m.position.copy(pos);
    this.g.add(m);
    const d = { m, t: 0, T, follow, fade: 0.3 };
    this.domes.push(d);
    if (this.domes.length > 14) {
      const x = this.domes.shift()!;
      this.g.remove(x.m);
      (x.m.material as any).dispose();
    }
    return d;
  }
  /** Long-lived volumetric-looking cloud or fire. `alive` returns 0..1 density each frame; <0 removes it. */
  cloud(x: number, z: number, r: number, c: THREE.ColorRepresentation, alive: () => number, fire = false) {
    const n = fire ? (this.low ? 14 : 30) : this.low ? 16 : 34;
    const g = new THREE.BufferGeometry();
    const off = new Float32Array(n * 3),
      sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = i * 2.399,
        d = Math.sqrt((i + 0.5) / n) * r * (fire ? 0.95 : 0.78);
      off[i * 3] = Math.cos(a) * d;
      off[i * 3 + 1] = fire ? 0.1 : (0.5 + (i % 4) * 0.55) * Math.min(1.3, r / 3) * (1.1 - (d / r) * 0.5);
      off[i * 3 + 2] = Math.sin(a) * d;
      sd[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(off, 3));
    g.setAttribute('sd', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uT: { value: 0 },
        uH: { value: 800 },
        uM: { value: fire ? softTex() : puffTex() },
        uA: { value: 0 },
        uC: { value: new THREE.Color(c) },
        uR: { value: r },
      },
      vertexShader: fire
        ? `attribute float sd; uniform float uT,uH,uA,uR; varying float vK; void main(){ float k=fract(uT*(0.9+sd*0.7)+sd*7.0); vec3 p=position; p.y+=k*1.5; p.xz*=1.0-k*0.25; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(1.0-k*0.75)*1.25*uA*uH/max(0.1,-mv.z); vK=k; }`
        : `attribute float sd; uniform float uT,uH,uA,uR; varying float vK; void main(){ vec3 p=position*mix(0.3,1.0,uA); p.x+=sin(uT*0.5+sd*9.0)*0.22; p.z+=cos(uT*0.4+sd*7.0)*0.22; p.y+=sin(uT*0.6+sd*5.0)*0.12; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(0.75+sd*0.35)*uR*0.92*uH/max(0.1,-mv.z); vK=p.y/3.0+sd*0.2; }`,
      fragmentShader: fire
        ? `uniform sampler2D uM; uniform vec3 uC; uniform float uA; varying float vK; void main(){ float a=texture2D(uM,gl_PointCoord).a; gl_FragColor=vec4(mix(vec3(1.0,0.85,0.45),uC,vK)*1.5,a*(1.0-vK)*uA*0.75); }`
        : `uniform sampler2D uM; uniform vec3 uC; uniform float uA; varying float vK; void main(){ float a=texture2D(uM,gl_PointCoord).a; gl_FragColor=vec4(uC*(0.62+0.5*vK),a*0.85*uA);
#include <colorspace_fragment>
}`,
    });
    const p = new THREE.Points(g, m);
    p.position.set(x, 0, z);
    p.frustumCulled = false;
    p.renderOrder = 5;
    this.g.add(p);
    let t = Math.random() * 9;
    this.persistent.push({
      k: p,
      obj: p,
      upd: dt => {
        const a = alive();
        if (a < 0) {
          g.dispose();
          m.dispose();
          return false;
        }
        t += dt;
        m.uniforms.uT.value = t;
        m.uniforms.uA.value = a;
        m.uniforms.uH.value = this.smoke.m.uniforms.uH.value;
        return true;
      },
    });
  }
  update(dt: number, hpx: number) {
    this.t += dt;
    this.spark.flush(this.t, hpx);
    this.smoke.flush(this.t, hpx);
    this.shake *= Math.exp(-dt * 6);
    let any = false;
    for (let i = 0; i < 90; i++) {
      const d = this.trD[i];
      if (d.t < 0) continue;
      d.t += dt;
      any = true;
      const k = 1 - d.t / d.T;
      if (k <= 0) {
        d.t = -1;
        this.tr.setMatrixAt(i, this.tm.makeScale(0, 0, 0));
        this.tr.instanceMatrix.needsUpdate = true;
      } else this.tr.setColorAt(i, this.tc.copy(d.c).multiplyScalar(k * (this.low ? 1.1 : 2.4)));
    }
    if (any && this.tr.instanceColor) this.tr.instanceColor.needsUpdate = true;
    for (const L of [this.rings, this.flares])
      for (const f of L) {
        if (f.t >= f.T) continue;
        f.t += dt;
        const k = f.t / f.T;
        if (k >= 1) {
          f.m.visible = false;
          continue;
        }
        const s = f.s0 + (f.s1 - f.s0) * (1 - (1 - k) * (1 - k));
        f.m.scale.set(s, s, s);
        (f.m.material as THREE.MeshBasicMaterial).color.copy(f.c).multiplyScalar((1 - k) * (this.low ? 1 : 1.8));
      }
    for (const l of this.lights) {
      if (l.t >= l.T) {
        l.l.intensity = 0;
        continue;
      }
      l.t += dt;
      l.l.intensity = l.i * Math.max(0, 1 - l.t / l.T);
    }
    for (let i = this.domes.length - 1; i >= 0; i--) {
      const d = this.domes[i];
      d.t += dt;
      const u = (d.m.material as THREE.ShaderMaterial).uniforms;
      u.uT.value = d.t;
      u.uA.value = Math.min(1, d.t * 6) * Math.min(1, (d.T - d.t) / 0.3);
      if (d.follow) {
        const p = d.follow();
        if (p) d.m.position.copy(p);
        else d.t = d.T;
      }
      if (d.t >= d.T) {
        this.g.remove(d.m);
        (d.m.material as any).dispose();
        this.domes.splice(i, 1);
      }
    }
    for (let i = this.persistent.length - 1; i >= 0; i--)
      if (!this.persistent[i].upd(dt)) {
        this.g.remove(this.persistent[i].obj);
        this.persistent.splice(i, 1);
      }
  }
}
