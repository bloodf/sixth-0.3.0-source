/**
 * Beauty on slow machines. The still parts of a scene are rendered once, a strip per frame, with full materials, shadows, occlusion,
 * bloom and several jittered samples, and kept with their depth. Moving people are then drawn over that picture every frame.
 */
import * as THREE from 'three';
const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
const ACC = `varying vec2 vUv; uniform sampler2D uC,uD; uniform mat4 uInv,uProj; uniform float uRot,uAo,uW; uniform vec2 uPx;
vec3 vp(vec2 u){ float d=texture2D(uD,u).r; vec4 p=uInv*vec4(u*2.0-1.0,d*2.0-1.0,1.0); return p.xyz/p.w; }
float hash(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
void main(){ vec3 c=texture2D(uC,vUv).rgb; float d=texture2D(uD,vUv).r; float ao=1.0;
 if(d<0.99999){ vec3 P=vp(vUv); vec3 a=vp(vUv+vec2(uPx.x,0.0))-P, b=P-vp(vUv-vec2(uPx.x,0.0)); vec3 e=vp(vUv+vec2(0.0,uPx.y))-P, f=P-vp(vUv-vec2(0.0,uPx.y)); vec3 N=normalize(cross(abs(a.z)<abs(b.z)?a:b,abs(e.z)<abs(f.z)?e:f));
  float rp=0.55/-P.z*uProj[1][1]*0.5; float th=hash(gl_FragCoord.xy)*6.2831+uRot; float s=0.0;
  for(int i=0;i<9;i++){ float t=(float(i)+0.5)/9.0; float r=sqrt(t)*rp; float an=th+float(i)*2.39996; vec2 o=vec2(cos(an)*uProj[0][0]/uProj[1][1],sin(an))*r; vec3 v=vp(vUv+o)-P; float l=length(v); s+=max(0.0,dot(v,N)/l-0.12)*smoothstep(1.1,0.15,l); }
  ao=clamp(1.0-s/9.0*2.1,0.0,1.0); ao=mix(1.0,ao,uAo); }
 vec3 tint=mix(vec3(0.16,0.13,0.15),vec3(1.0),ao); gl_FragColor=vec4(c*tint*uW,uW); }`;
const BR = `varying vec2 vUv; uniform sampler2D uC; uniform vec2 uPx; void main(){ vec3 s=vec3(0.0); for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){ vec4 t=texture2D(uC,vUv+vec2(float(x),float(y))*uPx); vec3 c=t.rgb/max(t.a,1e-4); s+=max(c-1.05,0.0)*min(1.0,4.0/(1.0+dot(c,vec3(0.33)))); } gl_FragColor=vec4(s/9.0,1.0); }`;
const BL = `varying vec2 vUv; uniform sampler2D uC; uniform vec2 uDir; void main(){ vec3 s=vec3(0.0); float w=0.0; for(int i=-6;i<=6;i++){ float k=exp(-float(i*i)/14.0); s+=texture2D(uC,vUv+uDir*float(i)).rgb*k; w+=k; } gl_FragColor=vec4(s/w,1.0); }`;
export const ACES = `vec3 rrt(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 c,float ex){ const mat3 mi=mat3(0.59719,0.07600,0.02840,0.35458,0.90834,0.13383,0.04823,0.01566,0.83777); const mat3 mo=mat3(1.60475,-0.10208,-0.00327,-0.53108,1.10813,-0.07276,-0.07367,-0.00605,1.07602); c*=ex/0.6; c=mi*c; c=rrt(c); c=mo*c; return clamp(c,0.0,1.0); }`;
const FIN =
  ACES +
  `varying vec2 vUv; uniform sampler2D uC,uB; uniform float uEx,uBloom; uniform vec2 uPx;
vec3 get(vec2 u){ vec4 t=texture2D(uC,u); return t.rgb/max(t.a,1e-4); }
void main(){ vec3 c=get(vUv); vec3 m=(get(vUv+vec2(uPx.x,0.0))+get(vUv-vec2(uPx.x,0.0))+get(vUv+vec2(0.0,uPx.y))+get(vUv-vec2(0.0,uPx.y)))*0.25; vec3 sh=c+(c-m)*0.32; c=max(min(sh,c*1.6),c*0.6)+texture2D(uB,vUv).rgb*uBloom; c=aces(c,uEx); c=pow(c,vec3(1.0/2.2)); float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.1); c=mix(c,c*c*(3.0-2.0*c),0.22); vec2 q=vUv-0.5; c*=1.0-dot(q,q)*0.42; c+=(fract(52.98*fract(dot(gl_FragCoord.xy,vec2(0.0671,0.00584))))-0.5)/255.0; gl_FragColor=vec4(c,1.0); }`;
const BLIT = `varying vec2 vUv; uniform sampler2D uC,uO,uD; uniform float uMix; void main(){ vec3 c=texture2D(uC,vUv).rgb; if(uMix<0.999) c=mix(texture2D(uO,vUv).rgb,c,uMix); gl_FragColor=vec4(c,1.0); gl_FragDepth=min(texture2D(uD,vUv).r+0.000004,1.0); }`;
const JIT = [
  [0, 0],
  [0.31, -0.22],
  [-0.27, 0.36],
  [-0.4, -0.33],
  [0.2, 0.42],
  [0.44, 0.1],
];
const quad = new THREE.PlaneGeometry(2, 2);
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const pass = (fs: string, u: Record<string, any>, extra: any = {}) => {
  const m = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: fs,
    uniforms: u,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    ...extra,
  });
  const s = new THREE.Scene();
  const q = new THREE.Mesh(quad, m);
  q.frustumCulled = false;
  s.add(q);
  return { m, s };
};
export class Baker {
  private acc: THREE.WebGLRenderTarget;
  private tmp: THREE.WebGLRenderTarget;
  private dep: THREE.WebGLRenderTarget;
  private fin: THREE.WebGLRenderTarget[];
  private b1: THREE.WebGLRenderTarget;
  private b2: THREE.WebGLRenderTarget;
  private pA = pass(
    ACC,
    {
      uC: { value: null },
      uD: { value: null },
      uInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uRot: { value: 0 },
      uAo: { value: 0.92 },
      uW: { value: 1 },
      uPx: { value: new THREE.Vector2() },
    },
    {
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      transparent: true,
    },
  );
  private pB = pass(BR, { uC: { value: null }, uPx: { value: new THREE.Vector2() } });
  private pG = pass(BL, { uC: { value: null }, uDir: { value: new THREE.Vector2() } });
  private pF = pass(FIN, {
    uC: { value: null },
    uB: { value: null },
    uEx: { value: 1 },
    uBloom: { value: 0.55 },
    uPx: { value: new THREE.Vector2() },
  });
  private pS = pass(
    BLIT,
    { uC: { value: null }, uO: { value: null }, uD: { value: null }, uMix: { value: 1 } },
    { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth },
  );
  private cam = new THREE.PerspectiveCamera();
  private sample = -1;
  private tile = 0;
  private cur = 0;
  private fade = 1;
  private hadOld = false;
  /** the picture matches what was asked for */
  ready = false;
  /** all samples are in */
  done = true;
  w = 2;
  h = 2;
  tiles = 6;
  samples = 6;
  constructor(private r: THREE.WebGLRenderer) {
    const hf = { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.acc = new THREE.WebGLRenderTarget(2, 2, hf);
    this.tmp = new THREE.WebGLRenderTarget(2, 2, { ...hf, depthBuffer: true });
    this.dep = new THREE.WebGLRenderTarget(2, 2, {
      ...hf,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(2, 2, THREE.UnsignedIntType),
    });
    this.fin = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false }));
    this.b1 = new THREE.WebGLRenderTarget(2, 2, hf);
    this.b2 = new THREE.WebGLRenderTarget(2, 2, hf);
  }
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const t of [this.acc, this.tmp, this.dep, ...this.fin]) t.setSize(w, h);
    this.b1.setSize(w >> 2, h >> 2);
    this.b2.setSize(w >> 2, h >> 2);
    this.ready = false;
  }
  /** ask for a new picture; `keep` means the camera is the same, so the old one may stay up meanwhile */
  start(cam: THREE.PerspectiveCamera, keep: boolean) {
    this.cam.copy(cam);
    if (cam.view) this.cam.view = { ...cam.view };
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    this.sample = 0;
    this.tile = 0;
    this.done = false;
    this.keep = keep && this.ready;
    if (!keep) this.ready = false;
  }
  private keep = false;
  stop() {
    this.sample = -1;
    this.done = true;
    this.ready = false;
  }
  step(scene: THREE.Scene, exposure: number) {
    if (this.sample < 0 || this.done) return;
    const r = this.r;
    const s = this.sample;
    const first = s === 0;
    const rt = first ? this.dep : this.tmp;
    const n = first ? this.tiles : this.tiles + 2;
    const v = this.cam.view!;
    if (this.tile === 0) {
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = first;
      this.cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    }
    const ox = v.offsetX,
      oy = v.offsetY;
    this.cam.view!.offsetX = ox + (JIT[s][0] * v.fullWidth) / this.w;
    this.cam.view!.offsetY = oy + (JIT[s][1] * v.fullHeight) / this.h;
    this.cam.updateProjectionMatrix();
    const y0 = Math.floor((this.h * this.tile) / n),
      y1 = Math.floor((this.h * (this.tile + 1)) / n);
    rt.scissorTest = true;
    rt.scissor.set(0, y0, this.w, y1 - y0);
    const at = r.autoClear;
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = true;
    r.setRenderTarget(rt);
    r.render(scene, this.cam);
    r.shadowMap.needsUpdate = false;
    rt.scissorTest = false;
    this.cam.view!.offsetX = ox;
    this.cam.view!.offsetY = oy;
    this.tile++;
    if (this.tile >= n) {
      this.tile = 0;
      this.cam.updateProjectionMatrix();
      // fold this sample into the sum, with its own turn of the occlusion kernel
      const u = this.pA.m.uniforms;
      u.uC.value = rt.texture;
      u.uD.value = this.dep.depthTexture;
      u.uInv.value.copy(this.cam.projectionMatrixInverse);
      u.uProj.value.copy(this.cam.projectionMatrix);
      u.uRot.value = s * 1.047;
      u.uPx.value.set(1 / this.w, 1 / this.h);
      r.setRenderTarget(this.acc);
      if (first) {
        r.setClearColor(0, 0);
        r.clear();
      }
      r.autoClear = false;
      r.render(this.pA.s, ocam);
      if (first || s === 2 || s === this.samples - 1) this.finish(exposure, first);
      this.sample++;
      if (this.sample >= this.samples) {
        this.done = true;
        this.sample = -1;
      }
    }
    r.setRenderTarget(null);
    r.autoClear = at;
    r.toneMapping = tm;
  }
  private finish(exposure: number, first: boolean) {
    const r = this.r;
    r.autoClear = false;
    this.pB.m.uniforms.uC.value = this.acc.texture;
    this.pB.m.uniforms.uPx.value.set(1.3 / this.w, 1.3 / this.h);
    r.setRenderTarget(this.b1);
    r.render(this.pB.s, ocam);
    for (const [a, b, x, y] of [
      [this.b1, this.b2, 1, 0],
      [this.b2, this.b1, 0, 1],
      [this.b1, this.b2, 2.5, 0],
      [this.b2, this.b1, 0, 2.5],
    ] as [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget, number, number][]) {
      this.pG.m.uniforms.uC.value = a.texture;
      this.pG.m.uniforms.uDir.value.set((x * 4) / this.w, (y * 4) / this.h);
      r.setRenderTarget(b);
      r.render(this.pG.s, ocam);
    }
    if (first) {
      this.cur ^= 1;
      this.hadOld = this.keep;
      this.fade = 0;
      this.ready = true;
    }
    const u = this.pF.m.uniforms;
    u.uC.value = this.acc.texture;
    u.uB.value = this.b1.texture;
    u.uEx.value = exposure;
    u.uPx.value.set(1 / this.w, 1 / this.h);
    r.setRenderTarget(this.fin[this.cur]);
    r.render(this.pF.s, ocam);
  }
  /** put the kept picture, colour and depth, on the screen */
  draw(dt: number) {
    this.fade = Math.min(1, this.fade + dt * 3);
    const u = this.pS.m.uniforms;
    u.uC.value = this.fin[this.cur].texture;
    u.uO.value = this.fin[this.cur ^ 1].texture;
    u.uMix.value = this.hadOld ? this.fade : 1;
    u.uD.value = this.dep.depthTexture;
    this.r.render(this.pS.s, ocam);
  }
  dispose() {
    for (const t of [this.acc, this.tmp, this.dep, ...this.fin, this.b1, this.b2]) t.dispose();
    for (const p of [this.pA, this.pB, this.pG, this.pF, this.pS]) p.m.dispose();
  }
}
