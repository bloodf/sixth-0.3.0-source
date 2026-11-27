/** The stage: people on a floor in front of a painted wall, with a camera that walks between shots. The career creator and the shirt room use it. */
import * as THREE from 'three';
import { Character, civPalette } from './character.ts';
import { ACES } from './bake.ts';
import { specKey, type Mood } from './human.ts';
import { specOf, type Wear } from './look.ts';
import type { Engine, View } from './engine.ts';
import type { Look } from '../game/types.ts';
export interface Actor {
  key: string;
  look: Look;
  id: string;
  wear: Wear;
  c1: string;
  c2: string;
  x: number;
  z: number;
  yaw: number;
  shirt?: boolean;
  act?: string;
  mood?: Partial<Record<Mood, number>>;
}
const PASSES = 7;
const halton = (i: number, b: number) => {
  let f = 1,
    r = 0;
  for (; i > 0; i = Math.floor(i / b)) {
    f /= b;
    r += f * (i % b);
  }
  return r;
};
export type ShotName = 'face' | 'half' | 'full' | 'shirt' | 'wide' | 'crest';
const CAMS: Record<ShotName, { p: [number, number, number]; l: [number, number, number]; f: number }> = {
  face: { p: [0, 1.64, 2.5], l: [0, 1.585, 0], f: 14 },
  half: { p: [0, 1.5, 3.5], l: [0, 1.32, 0], f: 22 },
  full: { p: [0, 1.32, 6.1], l: [0, 0.94, 0], f: 22 },
  shirt: { p: [0, 1.34, 4.6], l: [0, 1.16, 0], f: 19 },
  wide: { p: [0, 1.2, 8.2], l: [0, 1.42, 0], f: 27 },
  crest: { p: [0, 1.9, 6], l: [0, 1.85, -2.4], f: 24 },
};
export class Cast implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 60);
  own = true;
  ratio = 1;
  fps = 60;
  exposure = 1;
  yaw = 0;
  spin = 0;
  private people = new Map<string, { c: Character; a: Actor; sig: string }>();
  private wall: THREE.Mesh;
  private wallT: THREE.CanvasTexture | null = null;
  private floor: THREE.Mesh;
  private rims: THREE.DirectionalLight[] = [];
  private shirt: THREE.Texture | null = null;
  private cam = { p: new THREE.Vector3(0, 1.3, 7), l: new THREE.Vector3(0, 1, 0), f: 24 };
  private want = { p: new THREE.Vector3(), l: new THREE.Vector3(), f: 22 };
  private inset = 0;
  private hdr: THREE.WebGLRenderTarget;
  private acc: THREE.WebGLRenderTarget;
  private add: THREE.ShaderMaterial;
  /** on a slow machine: passes of the still so far, and how long things must keep moving */
  private pass = 0;
  private live = 0.6;
  private quad: THREE.Mesh;
  private qs = new THREE.Scene();
  private qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private w = 1;
  private h = 1;
  private drag: number | null = null;
  private off: () => void;
  constructor(
    private soft: boolean,
    private cv: HTMLCanvasElement,
    bare = false,
  ) {
    const key = new THREE.DirectionalLight('#ffe8cf', 2.1);
    key.position.set(1.8, 3.2, 3);
    const fill = new THREE.DirectionalLight('#bcd3e6', 0.75);
    fill.position.set(-2.6, 1.4, 2.4);
    const r1 = new THREE.DirectionalLight('#ffffff', 3.4);
    r1.position.set(-2.4, 2.6, -2.6);
    const r2 = new THREE.DirectionalLight('#ffffff', 1.9);
    r2.position.set(2.8, 1.6, -2.2);
    this.rims = [r1, r2];
    this.scene.add(key, fill, r1, r2, new THREE.HemisphereLight('#dfe8f0', '#4a3f38', 0.5));
    if (!soft) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = key.shadow.camera.bottom = -3;
      key.shadow.camera.right = key.shadow.camera.top = 3;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
    }
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6.4), new THREE.MeshBasicMaterial({ color: '#0c0f12' }));
    this.wall.position.set(0, 3.2, -2.4);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 14).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: {
          c: { value: new THREE.Color('#0c0f12') },
          t: { value: null },
          has: { value: 0 },
          ft: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(99, 99, 0)) },
        },
        vertexShader:
          'varying vec3 w; void main(){ w=position; w=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0); }',
        // the wall mirrored in a worn floor, feet in contact with it
        fragmentShader:
          'varying vec3 w; uniform vec3 c; uniform sampler2D t; uniform float has; uniform vec3 ft[4]; void main(){ vec3 dir=normalize(w-cameraPosition); vec3 r=vec3(dir.x,-dir.y,dir.z); float k=(-2.4-w.z)/min(r.z,-0.001); vec2 uv=vec2((w.x+r.x*k)/16.0+0.5,(r.y*k)/6.4); vec3 m=c; if(has>0.5&&k>0.0&&uv.y<1.0) { m=vec3(0.0); for(int i=0;i<3;i++) for(int j=0;j<3;j++) m+=texture2D(t,uv+vec2(float(i)-1.0,float(j)-1.0)*(0.004+0.006*k*0.3)).rgb; m/=9.0; } float f=pow(1.0-abs(dir.y),2.0); vec3 o=c*0.5+m*(0.05+0.34*f); float s=0.0; for(int i=0;i<4;i++){ vec2 d=(w.xz-ft[i].xy)/vec2(0.42,0.3); s+=ft[i].z*exp(-dot(d,d)*2.2); } o*=1.0-0.78*min(1.0,s); o*=smoothstep(7.0,1.0,length(w.xz-vec2(0.0,0.4)))*0.9+0.1; gl_FragColor=vec4(o,1.0); }',
      }),
    );
    this.floor.position.z = 4.6;
    if (!bare) this.scene.add(this.wall, this.floor);
    this.hdr = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: soft ? 0 : 8 });
    this.acc = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.add = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: 'varying vec2 v; uniform sampler2D t; void main(){ gl_FragColor=min(texture2D(t,v),vec4(12.0)); }',
      uniforms: { t: { value: this.hdr.texture } },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
        fragmentShader:
          ACES +
          'varying vec2 v; uniform sampler2D t; uniform float bare, k; float h(vec2 p){ return fract(sin(dot(p,vec2(12.98,78.2)))*43758.5); } void main(){ vec4 s=texture2D(t,v)*k; vec3 c=s.rgb; if(bare>0.5) c/=max(s.a,1e-4); c=pow(aces(c,1.05),vec3(1.0/2.2)); float l=dot(c,vec3(0.3,0.59,0.11)); c=mix(vec3(l),c,1.08); c=mix(c,c*c*(3.0-2.0*c),0.22); if(bare<0.5) c+=(h(v*vec2(911.0,577.0))-0.5)*0.012; gl_FragColor=bare>0.5?vec4(c*s.a,s.a):vec4(c,1.0); }',
        uniforms: { t: { value: this.hdr.texture }, bare: { value: bare ? 1 : 0 }, k: { value: 1 } },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.NoBlending,
      }),
    );
    this.quad.frustumCulled = false;
    this.qs.add(this.quad);
    const dn = (e: PointerEvent) => {
        this.drag = e.clientX;
      },
      mv = (e: PointerEvent) => {
        if (this.drag === null) return;
        this.yaw += (e.clientX - this.drag) * 0.01;
        this.drag = e.clientX;
        this.wake();
      },
      up = () => {
        this.drag = null;
      };
    cv.addEventListener('pointerdown', dn);
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
    this.off = () => {
      cv.removeEventListener('pointerdown', dn);
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
    };
    this.shot('full', true);
  }
  /** pixels on the left that belong to panels */
  setInset(px: number) {
    this.inset = px;
    this.resize(this.w, this.h);
  }
  shot(n: ShotName, now = false) {
    const c = CAMS[n];
    this.want.p.set(...c.p);
    this.want.l.set(...c.l);
    this.want.f = c.f;
    this.wake(1.1);
    if (now) {
      this.cam.p.copy(this.want.p);
      this.cam.l.copy(this.want.l);
      this.cam.f = c.f;
    }
  }
  paint(c: HTMLCanvasElement, ground: string, c1: string, c2: string) {
    const m = this.wall.material as THREE.MeshBasicMaterial;
    this.wallT?.dispose();
    const t = (this.wallT = new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    m.map = t;
    m.color.set('#ffffff');
    m.needsUpdate = true;
    const f = (this.floor.material as THREE.ShaderMaterial).uniforms;
    f.t.value = t;
    f.has.value = 1;
    f.c.value.set(ground);
    this.tint(c1, c2);
    this.wake();
  }
  tint(c1: string, c2: string) {
    this.rims[0].color.set(c1).lerp(new THREE.Color('#ffffff'), 0.35);
    this.rims[1].color.set(c2).lerp(new THREE.Color('#ffffff'), 0.45);
  }
  setShirt(c: HTMLCanvasElement) {
    this.shirt?.dispose();
    this.shirt = new THREE.CanvasTexture(c);
    this.shirt.colorSpace = THREE.SRGBColorSpace;
    this.shirt.anisotropy = 8;
    for (const p of this.people.values()) this.wear(p.c, p.a);
    this.wake();
  }
  sleeves = '#888888';
  private wear(c: Character, a: Actor) {
    const u = c.mat.uniformsX;
    if (!a.shirt || !this.shirt) {
      u.uHasShirt.value = 0;
      return;
    }
    u.uShirt.value = this.shirt;
    u.uHasShirt.value = 1;
    const s = new THREE.Color(this.sleeves);
    u.uPal.value[3].set(s.r, s.g, s.b);
  }
  /** who is on stage; only those who changed are rebuilt */
  set(list: Actor[], draft = false) {
    this.wake(draft ? 0.25 : 0.05);
    const seen = new Set(list.map(a => a.key));
    for (const [k, p] of this.people)
      if (!seen.has(k)) {
        this.scene.remove(p.c.root);
        p.c.mesh.geometry.dispose();
        p.c.dispose();
        this.people.delete(k);
      }
    list.forEach((a, i) => {
      const sp = specOf(a.look, a.id, { ...a.wear, mood: a.mood });
      const sig = specKey(sp, draft ? 1 : 0) + a.c1 + a.c2;
      let p = this.people.get(a.key);
      if (!p || p.sig !== sig) {
        const c = new Character(
          false,
          { outfit: 'civil', head: 'hair0', cape: false, headset: false } as any,
          civPalette(a.look, a.c1, a.c2, a.c1),
          {
            human: sp,
            lod: draft ? 1 : 0,
            keep: false,
            shadow: !this.soft,
          },
        );
        c.mesh.receiveShadow = !this.soft;
        const t0 = p ? p.c.rig : null;
        if (p) {
          this.scene.remove(p.c.root);
          p.c.mesh.geometry.dispose();
          p.c.dispose();
        }
        if (!t0) for (let k = 0; k < 20; k++) c.update(0.05, 1 + i * 3 + k * 0.05);
        this.scene.add(c.root);
        p = { c, a, sig };
        this.people.set(a.key, p);
      }
      p.a = a;
      p.c.rig.act = (a.act ?? 'idle') as any;
      p.c.root.position.set(a.x, 0, a.z);
      this.wear(p.c, a);
    });
    const ft = (this.floor.material as THREE.ShaderMaterial).uniforms.ft.value as THREE.Vector3[];
    ft.forEach((v, i) => (list[i] ? v.set(list[i].x, list[i].z, 1) : v.set(99, 99, 0)));
  }
  /** where the face of someone is, for framing */
  private head(): THREE.Vector3 | null {
    const p = this.people.get('me');
    const b = p?.c.rig.bones?.[3];
    return b ? b.getWorldPosition(new THREE.Vector3()) : null;
  }
  close = false;
  update(dt: number, t: number) {
    if (this.soft) {
      if (this.live <= 0 && this.drag === null) return;
      this.live -= dt;
    }
    const k = 1 - Math.exp(-dt * 4.2);
    const tl = this.want.l.clone(),
      tp = this.want.p.clone();
    if (this.close) {
      const h = this.head();
      if (h) {
        tl.y = h.y + 0.1;
        tp.y = h.y + 0.13;
        tl.x = h.x * 0.5;
      }
    }
    this.cam.p.lerp(tp, k);
    this.cam.l.lerp(tl, k);
    this.cam.f += (this.want.f - this.cam.f) * k;
    this.camera.position.copy(this.cam.p);
    this.camera.position.x += Math.sin(t * 0.22) * 0.05;
    this.camera.position.y += Math.sin(t * 0.17) * 0.015;
    if (Math.abs(this.camera.fov - this.cam.f) > 0.001) {
      this.camera.fov = this.cam.f;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.cam.l);
    if (!this.soft) this.yaw += dt * this.spin;
    let i = 0;
    for (const p of this.people.values()) {
      p.c.root.rotation.y = p.a.yaw + this.yaw;
      p.c.update(dt, t + i++ * 3.1);
    }
  }
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this.offset(0, 0);
    this.wake();
  }
  /** something changed: draw it roughly now, properly when it rests */
  wake(s = 0.25) {
    this.live = Math.max(this.live, s);
    this.pass = 0;
  }
  render(r: THREE.WebGLRenderer) {
    const pr = r.getPixelRatio();
    const W = Math.max(2, Math.round(this.w * pr)),
      H = Math.max(2, Math.round(this.h * pr));
    const q = this.quad.material as THREE.ShaderMaterial;
    const still = this.soft && this.live <= 0;
    if (still && this.pass >= PASSES) return;
    const f = this.soft && !still ? 0.62 : 1;
    const w = Math.round(W * f),
      h = Math.round(H * f);
    if (this.hdr.width !== w || this.hdr.height !== h) this.hdr.setSize(w, h);
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 0);
    if (still) this.offset((halton(this.pass + 1, 2) - 0.5) / pr, (halton(this.pass + 1, 3) - 0.5) / pr);
    r.setRenderTarget(this.hdr);
    r.render(this.scene, this.camera);
    if (still) {
      this.offset(0, 0);
      if (this.acc.width !== W || this.acc.height !== H) this.acc.setSize(W, H);
      r.setRenderTarget(this.acc);
      const ac = r.autoClear;
      r.autoClear = this.pass === 0;
      this.quad.material = this.add;
      r.render(this.qs, this.qc);
      this.quad.material = q;
      r.autoClear = ac;
      this.pass++;
    }
    q.uniforms.t.value = still ? this.acc.texture : this.hdr.texture;
    q.uniforms.k.value = still ? 1 / this.pass : 1;
    r.setRenderTarget(null);
    r.render(this.qs, this.qc);
    r.toneMapping = tm;
  }
  private offset(x: number, y: number) {
    this.camera.setViewOffset(this.w, this.h, -this.inset / 2 + x, y, this.w, this.h);
  }
  dispose() {
    this.off();
    this.set([]);
    this.wallT?.dispose();
    this.shirt?.dispose();
    this.hdr.dispose();
    this.acc.dispose();
    this.add.dispose();
    this.wall.geometry.dispose();
    (this.wall.material as any).dispose();
    this.floor.geometry.dispose();
    (this.floor.material as any).dispose();
    void this.cv;
  }
}
export const castView = (e: Engine) => new Cast(e.software, e.canvas);
