/** People. Bodies, clothes and hair from the MakeHuman library (see tools/assets), morphed per person and skinned to our own skeleton. */
import * as THREE from 'three';
import { LOWDECL, LOWLIT, LOWOUT, LOWU } from './engine.ts';
import { B, NB } from './body.ts';
import libUrl from '../assets/humans.bin?url';
const TEX = import.meta.glob('../assets/tex/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BONE = [B.hips, B.spine, B.chest, B.head, B.uaL, B.faL, B.uaR, B.faR, B.thL, B.shL, B.ftL, B.thR, B.shR, B.ftR];
interface ShapeRef {
  o: number;
  s: number;
  t: 8 | 16;
}
interface Part {
  kind: string;
  n: number;
  gens: string[];
  l0: number;
  l1: number;
  uv: number;
  i0: number;
  i1: number;
  i2: number;
  l2: number;
  weld: number;
  si: number;
  sw: number;
  zone: number;
  vm?: number;
  hide?: Record<string, number>;
  shapes: Record<string, ShapeRef>;
}
interface Lib {
  macro: string[];
  head: string[];
  ex: string[];
  parts: Record<string, Part>;
}
export let LIB: Lib | null = null;
let data: ArrayBuffer;
const texes: Record<string, THREE.Texture> = {};
export async function loadHumans(on?: (f: number) => void): Promise<void> {
  if (LIB) return;
  const r = await fetch(libUrl);
  const raw = await new Response(r.body!.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  const dv = new DataView(raw);
  const n = dv.getUint32(4, true);
  const lib = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 8, n))) as Lib;
  data = raw.slice(8 + n);
  on?.(0.3);
  const names = Object.keys(TEX);
  let done = 0;
  const L = new THREE.TextureLoader();
  await Promise.all(
    names.map(async k => {
      const id = k.slice(k.lastIndexOf('/') + 1, -5);
      const t = await L.loadAsync(TEX[k]);
      t.colorSpace = /^(skin|face)/.test(id) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      texes[id] = t;
      on?.(0.3 + (0.7 * ++done) / names.length);
    }),
  );
  LIB = lib;
}
export type Outfit = 'tee' | 'long' | 'polo' | 'shirt' | 'jacket' | 'suit' | 'work' | 'short' | 'sport';
export interface Spec {
  g: 'male' | 'female';
  /** weights of african, asian, caucasian */
  race: [number, number, number];
  old: number;
  heavy: number;
  thin: number;
  muscle: number;
  /** -1..1 per slider, same order as HEAD */
  face: number[];
  ex: Partial<Record<Mood, number>>;
  skin: string;
  hair: string;
  hairC: string;
  beard: '' | 'beard' | 'mous';
  stubble: number;
  brow: number;
  eye: number;
  glasses: boolean;
  outfit: string;
  shoes: string;
  cut?: boolean;
}
export type Mood = 'smile' | 'angry' | 'sad' | 'open' | 'blink' | 'disgust' | 'shock';
export const HEAD = [
  'headSquare',
  'headRound',
  'headFat',
  'headTall',
  'chinLong',
  'chinWide',
  'chinOut',
  'noseWide',
  'noseLong',
  'noseOut',
  'noseHump',
  'noseTip',
  'mouthWide',
  'lipsFull',
  'eyesBig',
  'eyesTilt',
  'eyesApart',
  'browHeavy',
  'cheekBones',
  'cheekFull',
  'earsBig',
  'earsOut',
] as const;
export const OUTFITS: Record<Outfit, [string, string]> = {
  tee: ['tee_m', 'tee_f'],
  long: ['long_m', 'tee_f'],
  polo: ['polo_m', 'tee_f'],
  shirt: ['shirt_m', 'suit_f'],
  jacket: ['jacket_m', 'suit_f'],
  suit: ['suit_m', 'suit_f'],
  work: ['work_m', 'tee_f'],
  short: ['tee_m', 'short_f'],
  sport: ['tee_m', 'sport_f'],
};
/** tiles of the face atlas, by zone */
const TILE: Record<string, [number, number]> = {
  brow1: [0, 0],
  brow2: [1, 0],
  brow3: [2, 0],
  brow4: [3, 0],
  beard: [0, 1],
  mous: [1, 1],
  lash: [2, 1],
};
const EYE: [number, number][] = [
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 3],
];
const shapeArr = (r: ShapeRef, n: number) => (r.t === 16 ? new Int16Array(data, r.o, n * 3) : new Int8Array(data, r.o, n * 3));
function morph(p: Part, s: Spec): Float32Array {
  const g = p.gens.includes(s.g) ? s.g : p.gens[0];
  const out = new Float32Array(p.n * 3);
  const add = (k: string, w: number) => {
    const r = p.shapes[k];
    if (!r || !w) return;
    const a = shapeArr(r, p.n),
      f = r.s * w;
    for (let i = 0; i < out.length; i++) out[i] += a[i] * f;
  };
  add(g + '/base', 1);
  const [af, as, ca] = s.race;
  add(g + '/african', af);
  add(g + '/asian', as);
  add(g + '/caucasian', ca);
  add(g + '/old', s.old);
  add(g + '/heavy', s.heavy);
  add(g + '/thin', s.thin);
  add(g + '/muscle', s.muscle);
  HEAD.forEach((k, i) => add(k, s.face[i] ?? 0));
  for (const [k, w] of Object.entries(s.ex)) add('ex_' + k, w as number);
  return out;
}
const Z_EYE = 12,
  Z_LASH = 13,
  Z_BROW = 14,
  Z_BEARD = 15;
const cache = new Map<string, THREE.BufferGeometry>();
export const specKey = (s: Spec, lod: number) => lod + JSON.stringify(s);
/** One mesh with everything on. lod 0 for close-ups, 1 for the field. */
export function humanGeo(s: Spec, lod: 0 | 1 | 2, keep = true): THREE.BufferGeometry {
  const key = specKey(s, lod);
  const hit = keep ? cache.get(key) : undefined;
  if (hit) return hit;
  const L = LIB!;
  const list: [string, Part][] = [['body', L.parts.body]];
  const add = (id: string) => {
    const p = L.parts[id];
    if (p) list.push([id, p]);
  };
  add(s.outfit);
  if (s.shoes) add(s.shoes);
  if (s.hair) add(s.hair);
  add('eyes');
  if (lod === 0) add('lash');
  add('brow' + (1 + (s.brow % 4)));
  if (s.beard) add(s.beard);
  if (s.glasses) add('glasses');
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    si: number[] = [],
    sw: number[] = [],
    zone: number[] = [],
    ao: number[] = [],
    idx: number[] = [];
  let top = 0;
  for (const [id, p] of list) {
    const P = morph(p, s);
    const n = p.n;
    const all = new Uint16Array(data, p.i0, p.l0);
    const use = lod === 0 ? all : lod === 1 ? new Uint16Array(data, p.i1, p.l1) : new Uint16Array(data, p.i2, p.l2);
    const weld = new Uint16Array(data, p.weld, n);
    const N = normals(P, all, weld);
    // beards, brows and hair sit a hair's breadth off the skin
    const base = pos.length / 3;
    const U = new Uint16Array(data, p.uv, n * 2),
      SI = new Uint8Array(data, p.si, n * 4),
      SW = new Uint8Array(data, p.sw, n * 4),
      Z = new Uint8Array(data, p.zone, n);
    const remap = new Int32Array(n).fill(-1);
    let cnt = 0;
    const hb = p.hide ? [s.outfit, s.shoes].filter(Boolean).map(k => new Uint8Array(data, p.hide![k], Math.ceil(n / 8))) : null;
    const near = (b: Uint8Array, v: number) => (b[v >> 3] & (1 << (v & 7))) !== 0 || (P[v * 3 + 1] > 1.2 && Math.abs(P[v * 3]) > 0.07);
    const hid = (v: number) => hb!.some(b => b[v >> 3] & (1 << (v & 7)));
    const shoeless = !s.shoes;
    // socks show only above bare legs
    const trousers = s.outfit !== 'suit_f' && s.outfit !== 'short_f';
    const tile = TILE[id] ?? (id === 'eyes' ? EYE[s.eye % 8] : null);
    const zz = p.kind === 'brow' ? Z_BROW : p.kind === 'beard' ? Z_BEARD : p.kind === 'lash' ? Z_LASH : p.kind === 'eyes' ? Z_EYE : -1;
    for (let i = 0; i < use.length; i += 3) {
      const t = [use[i], use[i + 1], use[i + 2]];
      if (hb && t.every(hid)) continue;
      if (Z[t[0]] === 99 || (p.kind === 'shoes' && Z[t[0]] === 11 && trousers)) continue;
      if (p.kind === 'body' && !shoeless && t.every(v => P[v * 3 + 1] < 0.1)) continue;
      for (const v of t) {
        if (remap[v] < 0) {
          remap[v] = base + cnt++;
          // skin under cloth is drawn in a little, so that it never shows through
          const inn =
            p.kind === 'body' && P[v * 3 + 1] > 0.2 && P[v * 3 + 1] < 1.492 && Math.abs(P[v * 3]) < 0.3 && hb && hb.some(b => near(b, v))
              ? 0.006
              : 0;
          pos.push(P[v * 3] - N[v * 3] * inn, P[v * 3 + 1] - N[v * 3 + 1] * inn, P[v * 3 + 2] - N[v * 3 + 2] * inn);
          nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          let u = U[v * 2] / 65535,
            w = U[v * 2 + 1] / 65535;
          if (tile) {
            u = (tile[0] + 0.004 + u * 0.992) / 4;
            w = 1 - (tile[1] + 0.004 + (1 - w) * 0.992) / 4;
          }
          uv.push(u, w);
          for (let k = 0; k < 4; k++) {
            si.push(BONE[SI[v * 4 + k]]);
            sw.push(SW[v * 4 + k] / 255);
          }
          zone.push(zz >= 0 ? zz : Z[v]);
          // cheap occlusion: under the chin, between the legs
          const y = P[v * 3 + 1],
            z = P[v * 3 + 2];
          let a = 1;
          if (y < 0.9) a *= 0.8 + 0.2 * Math.min(1, Math.abs(P[v * 3]) / 0.12);
          if (p.kind === 'body' && y < 1.57 && y > 1.44) a *= 0.72 + 0.28 * Math.min(1, Math.max(0, (z - 0.02) / 0.06));
          ao.push(a);
        }
        idx.push(remap[v]);
      }
    }
    top = Math.max(top, base + cnt);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('zone', new THREE.Float32BufferAttribute(zone, 1));
  g.setAttribute('bao', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  if (keep) {
    if (cache.size > 120) cache.clear();
    cache.set(key, g);
  }
  return g;
}
function normals(p: Float32Array, ix: Uint16Array, w: Uint16Array): Float32Array {
  let m = 0;
  for (let i = 0; i < w.length; i++) if (w[i] > m) m = w[i];
  const N = new Float32Array((m + 1) * 3);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3,
      b = ix[i + 1] * 3,
      c = ix[i + 2] * 3;
    const ex = p[b] - p[a],
      ey = p[b + 1] - p[a + 1],
      ez = p[b + 2] - p[a + 2],
      fx = p[c] - p[a],
      fy = p[c + 1] - p[a + 1],
      fz = p[c + 2] - p[a + 2];
    const x = ey * fz - ez * fy,
      y = ez * fx - ex * fz,
      z = ex * fy - ey * fx;
    for (const v of [ix[i], ix[i + 1], ix[i + 2]]) {
      const q = w[v] * 3;
      N[q] += x;
      N[q + 1] += y;
      N[q + 2] += z;
    }
  }
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length / 3; i++) {
    const q = w[i] * 3;
    const l = Math.hypot(N[q], N[q + 1], N[q + 2]) || 1;
    o[i * 3] = N[q] / l;
    o[i * 3 + 1] = N[q + 1] / l;
    o[i * 3 + 2] = N[q + 2] / l;
  }
  return o;
}
// ---------- material: one shader for the whole person, zones decide what is sampled
const COMMON = `
varying vec2 vHuv; varying vec3 vRest; varying float vZone; varying float vBao; varying vec3 vPal; varying float vGl;
uniform sampler2D uSkinT, uHairT, uFaceT, uClothN, uClothD, uShoeD, uShirt; uniform vec3 uPal[12]; uniform vec3 uSkin; uniform float uHasShirt, uStub, uFade; uniform float uFlash; uniform vec3 uFlashC; uniform float uGlow; uniform vec3 uRim; uniform vec3 uDirt;
vec3 humanN; float humanCloth; float humanRough; float humanMetal;
vec4 human(){
  vec2 dx=dFdx(vHuv), dy=dFdy(vHuv); float z=floor(vZone+0.5); vec3 c=vPal; float a=1.0; humanN=vec3(0.0,0.0,1.0); humanCloth=0.0; humanRough=0.8; humanMetal=0.0;
  if(z<0.5){ c=textureGrad(uSkinT,vHuv,dx,dy).rgb*uSkin; humanRough=0.52; if(uStub>0.01 && vRest.y>1.55 && vRest.y<1.652 && vRest.z>-0.02){ float s=smoothstep(1.655,1.63,vRest.y)*smoothstep(1.545,1.575,vRest.y)*smoothstep(-0.01,0.06,vRest.z); float lip=1.0-smoothstep(0.006,0.014,abs(vRest.y-1.622))*1.0; lip*=1.0-smoothstep(0.02,0.03,abs(vRest.x)); c=mix(c,c*mix(vec3(0.62),uPal[1]*1.4+0.12,0.5),s*uStub*(1.0-lip)); } c=mix(c,c*uDirt,step(vRest.y,9.0)); }
  else if(z>19.5){ float q=z-20.0; humanRough=q>6.5&&q<7.5?0.3:q<8.5&&q>7.5?0.55:0.7; humanMetal=q>6.5&&q<7.5?0.85:0.0; }
  else if(z<1.5){ vec4 h=textureGrad(uHairT,vHuv,dx,dy); a=h.a; c=uPal[1]*(0.25+h.r*1.35); humanRough=0.42; }
  else if(z<4.5 || (z>10.5 && z<11.5)){ vec3 n=textureGrad(uClothN,vHuv,dx,dy).rgb; float d=textureGrad(uClothD,vHuv,dx,dy).r*2.0; humanN=vec3(n.rg*2.0-1.0,0.0); humanCloth=1.0; humanRough=0.86;
    if(z<2.5 && uHasShirt>0.5){ if(abs(vRest.x)>0.2) c=uPal[3]; else { vec2 su=vec2((vRest.x*(vRest.z>0.0?1.0:-1.0))/0.54+0.5,(vRest.y-0.955)/0.565); su.x=su.x*0.5+(vRest.z>0.0?0.0:0.5); c=texture2D(uShirt,su).rgb; } d=1.0; humanRough=0.66; }
    c*=mix(1.0,n.b,0.85)*mix(1.0,d,z>3.5&&z<4.5?0.9:0.55); c*=mix(vec3(1.0),uDirt,0.8); }
  else if(z<5.5){ float d=textureGrad(uShoeD,vHuv,dx,dy).r*2.0; c*=d; humanRough=0.6; }
  else if(z>6.5&&z<7.5){ humanRough=0.32; humanMetal=0.85; }
  else if(z>11.5){ vec4 f=textureGrad(uFaceT,vHuv,dx,dy); if(z<12.5){ c=f.rgb; humanRough=0.12; } else { a=f.a; c=z<13.5?vec3(0.03,0.025,0.02):uPal[1]*(0.25+f.r*1.0); if(z>13.5&&z<14.5) c*=0.7; } }
  return vec4(c*vBao,a);
}`;
const VERT = `attribute float zone; attribute float bao; uniform vec3 uPal[12]; varying vec2 vHuv; varying vec3 vRest; varying float vZone; varying float vBao; varying vec3 vPal; varying float vGl;`;
const VBEG = `vHuv=uv; vRest=position; vZone=zone; vBao=bao; int zi=int(zone+0.5); if(zi>=20) zi-=20; vPal=uPal[min(zi,11)]; vGl=(zi==9)?1.0:0.0;`;
const white = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
const grey = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
export function humanMaterial(low: boolean, pal: THREE.Vector3[], s: Spec | null): THREE.Material & { uniformsX: any } {
  const m: any = low ? new THREE.MeshBasicMaterial({ fog: false }) : new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const out = s?.outfit ?? '';
  const U: any = {
    uPal: { value: pal },
    uSkinT: { value: s ? skinTex(s) : white },
    uHairT: { value: (s && texes[s.hair]) || white },
    uFaceT: { value: texes.face ?? white },
    uClothN: { value: texes['n_' + out] ?? grey },
    uClothD: { value: texes['d_' + out] ?? grey },
    uShoeD: { value: (s && texes['d_' + s.shoes]) || grey },
    uShirt: { value: white as any },
    uHasShirt: { value: 0 },
    uSkin: { value: s ? tintFor(s) : new THREE.Color(1, 1, 1) },
    uStub: { value: s?.stubble ?? 0 },
    uFlash: { value: 0 },
    uFlashC: { value: new THREE.Color('#ffffff') },
    uGlow: { value: 1.6 },
    uRim: { value: new THREE.Color('#000000') },
    uFade: { value: 1 },
    uDirt: { value: new THREE.Color(1, 1, 1) },
    uBones: { value: null as Float32Array | null },
  };
  m.uniformsX = U;
  m.side = THREE.DoubleSide;
  m.shadowSide = THREE.FrontSide;
  m.onBeforeCompile = (q: any) => {
    Object.assign(q.uniforms, U, low ? LOWU : {});
    q.vertexShader = q.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT + (low ? LOWDECL + ' varying float vRimL;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VBEG);
    // a slow machine reads sixteen matrices faster than sixteen texels per vertex
    if (low)
      q.vertexShader = q.vertexShader.replace(
        '#include <skinning_pars_vertex>',
        `uniform mat4 bindMatrix, bindMatrixInverse; uniform mat4 uBones[${NB}]; mat4 getBoneMatrix(const in float i){ return uBones[int(i)]; }`,
      );
    if (low)
      q.vertexShader = q.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvec3 nn=objectNormal; ' +
          LOWLIT +
          ' vec3 vn=normalize(normalMatrix*objectNormal); vRimL=pow(1.0-abs(dot(vn,normalize(-mvPosition.xyz))),3.0);',
      );
    q.fragmentShader = q.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + (low ? 'varying vec3 vLit; varying float vRimL;' : '') + COMMON,
    );
    const col = 'vec4 hc=human(); if(hc.a<0.38) discard; diffuseColor=vec4(hc.rgb,uFade);';
    if (low)
      q.fragmentShader = q.fragmentShader
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n' +
            col +
            ' diffuseColor.rgb*=vLit*(1.0+vRimL*0.35); diffuseColor.rgb+=vPal*vGl*uGlow*0.6+uFlashC*uFlash+uRim*vRimL;',
        )
        .replace('#include <colorspace_fragment>', LOWOUT);
    else
      q.fragmentShader = q.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + col)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=humanRough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor=humanMetal;')
        .replace(
          '#include <normal_fragment_maps>',
          `if(humanCloth>0.5){ vec3 q0=dFdx(-vViewPosition), q1=dFdy(-vViewPosition); vec2 s0=dFdx(vHuv), s1=dFdy(vHuv); vec3 N=normal; vec3 q1p=cross(q1,N), q0p=cross(N,q0); vec3 T=q1p*s0.x+q0p*s1.x, Bt=q1p*s0.y+q0p*s1.y; float det=max(dot(T,T),dot(Bt,Bt)); float sc=det==0.0?0.0:inversesqrt(det); vec2 nxy=humanN.xy*1.25; normal=normalize(T*sc*nxy.x+Bt*sc*nxy.y+N*sqrt(max(0.1,1.0-dot(nxy,nxy)))); }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nfloat rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.0); totalEmissiveRadiance+=vPal*vGl*uGlow+uFlashC*uFlash+uRim*rim; if(vZone<0.5) totalEmissiveRadiance+=hc.rgb*vec3(0.10,0.035,0.025)*(0.35+rim);',
        );
  };
  m.customProgramCacheKey = () => 'human' + (low ? 'L' : 'S');
  return m;
}
const skinTex = (s: Spec) => {
  const k = s.g === 'male' ? 'm' : 'f';
  const d = s.race[0] > 0.55 ? 'skin_a' : s.old > 0.5 ? 'skin_o' : s.race[1] > 0.55 ? 'skin_s' : 'skin_c';
  return texes[d + k] ?? texes.skin_cm ?? white;
};
/** average colour of each skin picture, so that any tone can be reached by tinting */
const AVG: Record<string, string> = { skin_a: '#7a5440', skin_c: '#e3b491', skin_s: '#dcb08c', skin_o: '#d8ab8c' };
function tintFor(s: Spec): THREE.Color {
  const d = s.race[0] > 0.55 ? 'skin_a' : s.old > 0.5 ? 'skin_o' : s.race[1] > 0.55 ? 'skin_s' : 'skin_c';
  const a = new THREE.Color(AVG[d]),
    b = new THREE.Color(s.skin);
  return new THREE.Color(Math.min(1.5, b.r / a.r), Math.min(1.5, b.g / a.g), Math.min(1.5, b.b / a.b)).lerp(new THREE.Color(1, 1, 1), 0.25);
}
void NB;
