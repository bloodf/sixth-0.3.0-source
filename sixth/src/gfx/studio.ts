/** Photographs of people, taken with the game's own renderer: lit, graded, on a clear background, and kept. */
import * as THREE from 'three';
import { Character, civPalette, heroCharacter } from './character.ts';
import type { Look as HeroLook } from '../data/heroes.ts';
import { ACES } from './bake.ts';
import { LIB, specKey, type Mood } from './human.ts';
import { specOf, type Wear } from './look.ts';
import type { Engine } from './engine.ts';
import type { Look } from '../game/types.ts';
export interface Shot {
  look: Look;
  id: string;
  wear: Wear;
  c1: string;
  c2: string;
  shirt?: THREE.Texture | null;
  /** changes when the shirt does */
  shirtKey?: string;
  mood?: Partial<Record<Mood, number>>;
  size: number;
  crop?: 'bust' | 'half' | 'full';
  act?: string;
  /** a fighter out of one of the games instead of a person */
  hero?: { look: HeroLook; id: string; gun?: string };
}
const urls = new Map<string, string>();
const wait = new Map<string, ((u: string) => void)[]>();
const queue: { key: string; s: Shot }[] = [];
let engine: Engine | null = null;
let sc: THREE.Scene,
  cam: THREE.PerspectiveCamera,
  hdr: THREE.WebGLRenderTarget,
  out: THREE.WebGLRenderTarget,
  rim: THREE.DirectionalLight,
  rim2: THREE.DirectionalLight,
  fin: THREE.Scene,
  fm: THREE.ShaderMaterial;
const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export function openStudio(e: Engine) {
  engine = e;
  sc = new THREE.Scene();
  sc.environment = e.env;
  sc.environmentIntensity = 0.24;
  cam = new THREE.PerspectiveCamera(17, 1, 0.1, 20);
  const key = new THREE.DirectionalLight('#ffe9d2', 1.75);
  key.position.set(1.6, 2.6, 2.4);
  const fill = new THREE.DirectionalLight('#bcd3e6', 0.7);
  fill.position.set(-2.4, 1.2, 2);
  rim = new THREE.DirectionalLight('#ffffff', 3.2);
  rim.position.set(-2.2, 2.4, -2.4);
  rim2 = new THREE.DirectionalLight('#ffffff', 1.6);
  rim2.position.set(2.6, 1.4, -2);
  sc.add(key, fill, rim, rim2, new THREE.HemisphereLight('#dfe8f0', '#4a3f38', 0.45));
  hdr = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  out = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
  fin = new THREE.Scene();
  fm = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:
      ACES +
      'varying vec2 vUv; uniform sampler2D t; uniform vec2 px; void main(){ vec4 s=vec4(0.0); for(int i=0;i<2;i++) for(int j=0;j<2;j++) s+=texture2D(t,vUv+(vec2(float(i),float(j))-0.5)*px); s*=0.25; vec3 c=s.rgb/max(s.a,1e-4); c=pow(aces(c,1.02),vec3(1.0/2.2)); float l=dot(c,vec3(0.3,0.59,0.11)); c=mix(vec3(l),c,1.08); c=mix(c,c*c*(3.0-2.0*c),0.25); gl_FragColor=vec4(c,s.a); }',
    uniforms: { t: { value: null }, px: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fm);
  q.frustumCulled = false;
  fin.add(q);
  if (queue.length) pump();
}
const keyOf = (s: Shot) =>
  s.hero
    ? ['hero', JSON.stringify(s.hero), s.c1, s.c2, s.size, s.act ?? ''].join('|')
    : [specKey(specOf(s.look, s.id, { ...s.wear, mood: s.mood }), 0), s.c1, s.c2, s.shirtKey ?? '', s.size, s.crop ?? '', s.act ?? ''].join(
        '|',
      );
export const shotNow = (s: Shot): string | undefined => (LIB ? urls.get(keyOf(s)) : undefined);
export function shoot(s: Shot, urgent = false, off?: AbortSignal): Promise<string> {
  return new Promise(res => {
    if (!LIB) return;
    const key = keyOf(s);
    const u = urls.get(key);
    if (u) return res(u);
    // nobody waits for a picture that has left the screen
    off?.addEventListener('abort', () => {
      const w = wait.get(key);
      if (!w) return;
      w.splice(w.indexOf(res), 1);
      if (w.length) return;
      const i = queue.findIndex(q => q.key === key);
      if (i >= 0) {
        queue.splice(i, 1);
        wait.delete(key);
      }
    });
    const w = wait.get(key);
    if (w) {
      w.push(res);
      return;
    }
    wait.set(key, [res]);
    if (urgent) queue.unshift({ key, s });
    else queue.push({ key, s });
    pump();
  });
}
let busy = false;
export const studioBusy = () => queue.length > 0;
/** the first picture compiles the shaders: take it while the loading screen is up */
export const warmStudio = () =>
  take('warm', {
    look: { skin: 2, hair: 1, hairC: 1, face: 0, eye: 0, brow: 1, nose: 0, mouth: 0, beard: 0, glasses: 0, fem: false, head: 0 },
    id: 'warm',
    wear: { outfit: 'tee' },
    c1: '#888888',
    c2: '#888888',
    size: 64,
  });
function pump() {
  if (busy || !engine) return;
  busy = true;
  const f = () => {
    const j = queue.shift();
    const next = () => {
      if (queue.length) setTimeout(f, engine!.software ? 24 : 4);
      else busy = false;
    };
    if (!j) return next();
    kept(j.key)
      .then(b => (b ? give(j.key, URL.createObjectURL(b)) : take(j.key, j.s)))
      .catch(() => take(j.key, j.s))
      .finally(next);
  };
  setTimeout(f, 0);
}
/** pictures survive a restart; they are only pictures */
const VER = 'sixth-faces-2';
const addr = (key: string) => {
  let a = 5381,
    b = 52711;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = (Math.imul(a, 33) ^ c) >>> 0;
    b = (Math.imul(b, 31) + c) >>> 0;
  }
  return '/__face/' + a.toString(36) + b.toString(36) + key.length;
};
async function kept(key: string): Promise<Blob | null> {
  if (location.protocol === 'file:' || /shirt:/.test(key)) return null;
  const r = await (await caches.open(VER)).match(addr(key));
  return r ? r.blob() : null;
}
function give(key: string, u: string) {
  urls.set(key, u);
  if (urls.size > 700) {
    const k = urls.keys().next().value!;
    URL.revokeObjectURL(urls.get(k)!);
    urls.delete(k);
  }
  for (const f of wait.get(key) ?? []) f(u);
  wait.delete(key);
}
function take(key: string, s: Shot) {
  const r = engine!.r;
  const small = s.size <= 112;
  const c = s.hero
    ? heroCharacter(false, s.hero.look, s.c1, { id: s.hero.id, lod: 1 })
    : new Character(false, { outfit: 'civil', head: 'hair0', cape: false, headset: false } as any, civPalette(s.look, s.c1, s.c2, s.c1), {
        human: specOf(s.look, s.id, { ...s.wear, mood: s.mood }),
        lod: small ? 1 : 0,
        keep: false,
        shadow: false,
      });
  if (s.hero?.gun) {
    c.rig.hold = 'rifle';
    c.setWeapon(s.hero.gun, s.hero.look.c1, s.hero.look.c2, s.hero.look.glow);
  }
  if (s.shirt) {
    c.mat.uniformsX.uShirt.value = s.shirt;
    c.mat.uniformsX.uHasShirt.value = 1;
  }
  c.rig.act = (s.act ?? 'idle') as any;
  for (let i = 0; i < 24; i++) c.update(0.05, 1 + i * 0.05);
  c.root.rotation.y = s.hero ? 0.42 : s.crop === 'full' ? 0.18 : /bob/.test(c.spec?.hair ?? '') ? -0.34 : 0.3;
  sc.add(c.root);
  const hb = c.rig.bones?.[3];
  c.root.updateMatrixWorld(true);
  const hp = new THREE.Vector3(0, 1.62, 0);
  if (hb) hb.getWorldPosition(hp).add(new THREE.Vector3(0, 0.13, 0));
  const W = s.size,
    H = s.hero ? Math.round(s.size * 1.9) : s.crop === 'full' ? s.size * 2 : s.crop === 'half' ? Math.round(s.size * 1.25) : s.size;
  const ss = W > 360 ? 1.5 : 2;
  hdr.setSize(Math.round(W * ss), Math.round(H * ss));
  out.setSize(W, H);
  cam.aspect = W / H;
  if (s.hero) {
    cam.fov = 20;
    cam.position.set(0.25, 1.3 * c.scale, 4.7);
    cam.updateProjectionMatrix();
    cam.lookAt(0, 1.14 * c.scale, 0);
  } else if (s.crop === 'full') {
    cam.fov = 17;
    cam.position.set(0, 1.25, 6.7);
    cam.updateProjectionMatrix();
    cam.lookAt(0, 0.92, 0);
  } else if (s.crop === 'half') {
    cam.fov = 17;
    cam.position.set(0, hp.y + 0.02, 3.2);
    cam.updateProjectionMatrix();
    cam.lookAt(0, hp.y - 0.2, 0);
  } else {
    cam.fov = 11.2;
    cam.position.set(0, hp.y + 0.04, 2.25);
    cam.updateProjectionMatrix();
    cam.lookAt(hp.x * 0.6, hp.y - 0.035, 0);
  }
  rim.color.set(s.c1).lerp(new THREE.Color('#ffffff'), 0.25);
  rim2.color.set(s.c2).lerp(new THREE.Color('#ffffff'), 0.35);
  const old = r.getRenderTarget(),
    tm = r.toneMapping,
    ac = r.autoClear;
  const cc = new THREE.Color();
  r.getClearColor(cc);
  const ca = r.getClearAlpha();
  const su = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false;
  r.toneMapping = THREE.NoToneMapping;
  r.autoClear = true;
  r.setClearColor(0x000000, 0);
  r.setRenderTarget(hdr);
  r.render(sc, cam);
  fm.uniforms.t.value = hdr.texture;
  fm.uniforms.px.value.set(1 / (W * ss), 1 / (H * ss));
  r.setRenderTarget(out);
  r.render(fin, ocam);
  const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(out, 0, 0, W, H, px);
  r.setRenderTarget(old);
  r.toneMapping = tm;
  r.autoClear = ac;
  r.setClearColor(cc, ca);
  r.shadowMap.autoUpdate = su;
  sc.remove(c.root);
  c.mesh.geometry.dispose();
  c.dispose();
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d')!;
  const im = x.createImageData(W, H);
  for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  x.putImageData(im, 0, 0);
  cv.toBlob(b => {
    give(key, b ? URL.createObjectURL(b) : cv.toDataURL());
    if (b && location.protocol !== 'file:')
      caches
        .open(VER)
        .then(c => c.put(addr(key), new Response(b)))
        .catch(() => {});
  }, 'image/png');
}
