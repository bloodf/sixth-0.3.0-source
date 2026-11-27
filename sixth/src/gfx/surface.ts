/** What things are made of. One material for every merged prop: a per-vertex class picks wood, cloth, metal, leather and so on. */
import * as THREE from 'three';
export const M = {
  paint: 0,
  wood: 1,
  cloth: 2,
  metal: 3,
  leather: 4,
  glass: 5,
  leaf: 6,
  stone: 7,
  rubber: 8,
  gloss: 9,
  brick: 10,
  skin: 11,
} as const;
export type Mk = keyof typeof M;
const c = new THREE.Color(),
  h = { h: 0, s: 0, l: 0 };
/** a sensible guess from the colour alone; pieces that know better say so */
export function guess(col: THREE.ColorRepresentation): number {
  c.set(col);
  c.getHSL(h, THREE.SRGBColorSpace);
  if (h.h > 0.045 && h.h < 0.125 && h.s > 0.16 && h.s < 0.66 && h.l > 0.14 && h.l < 0.72) return M.wood;
  if (h.h > 0.2 && h.h < 0.38 && h.s > 0.18 && h.l < 0.5) return M.leaf;
  if (h.s < 0.12 && h.l > 0.36 && h.l < 0.8) return M.metal;
  if (h.l < 0.2) return M.rubber;
  return M.paint;
}
let tex: THREE.DataTexture | null = null;
/** tiling detail: R fine grain, G weave, B pores, A broad stains */
export function detailTex(): THREE.DataTexture {
  if (tex) return tex;
  const n = 256;
  const rnd = (x: number, y: number, s: number) => {
    let k = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647 - 58);
    k = Math.imul(k ^ (k >>> 13), 1274126177);
    return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
  };
  const val = (x: number, y: number, cells: number, s: number) => {
    const fx = (x / n) * cells,
      fy = (y / n) * cells;
    const ix = Math.floor(fx),
      iy = Math.floor(fy);
    const u = fx - ix,
      v = fy - iy;
    const su = u * u * (3 - 2 * u),
      sv = v * v * (3 - 2 * v);
    const g = (a: number, b: number) => rnd(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, s);
    return (g(ix, iy) * (1 - su) + g(ix + 1, iy) * su) * (1 - sv) + (g(ix, iy + 1) * (1 - su) + g(ix + 1, iy + 1) * su) * sv;
  };
  const pore = (x: number, y: number, cells: number) => {
    const fx = (x / n) * cells,
      fy = (y / n) * cells;
    let d1 = 9,
      d2 = 9;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const a = Math.floor(fx) + i,
          b = Math.floor(fy) + j;
        const wa = ((a % cells) + cells) % cells,
          wb = ((b % cells) + cells) % cells;
        const d = Math.hypot(a + rnd(wa, wb, 7) - fx, b + rnd(wa, wb, 8) - fy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    return Math.min(1, (d2 - d1) * 1.6);
  };
  const u = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      u[i] = 255 * (val(x, y, 64, 1) * 0.45 + val(x, y, 128, 2) * 0.35 + val(x, y, 32, 3) * 0.2);
      const w = Math.PI * 2 * (32 / n);
      const warp = 0.5 + 0.5 * Math.sin(x * w) * (((y * 32) / n) % 2 < 1 ? 1 : -1);
      u[i + 1] = 255 * Math.min(1, warp * 0.7 + rnd(x, y, 4) * 0.3);
      u[i + 2] = 255 * pore(x, y, 26);
      u[i + 3] = 255 * (val(x, y, 5, 5) * 0.5 + val(x, y, 11, 6) * 0.32 + val(x, y, 23, 9) * 0.18);
    }
  tex = new THREE.DataTexture(u, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
let texL: THREE.DataTexture | null = null;
/** the same picture with cheap filtering */
const detailLow = () => {
  if (!texL) {
    texL = detailTex().clone() as THREE.DataTexture;
    texL.anisotropy = 1;
    texL.minFilter = THREE.LinearMipmapNearestFilter;
    texL.needsUpdate = true;
  }
  return texL;
};
/** slow machines: everything is decided per vertex, one sample per pixel */
const LOW_V =
  'attribute float mk; varying vec3 vWp; varying float vUpK; varying vec2 vDuv; varying vec4 vDw; varying vec2 vDk; uniform vec2 uTopS;';
const LOW_VP = `vec4 wpS=vec4(transformed,1.0);
#ifdef USE_INSTANCING
wpS=instanceMatrix*wpS;
#endif
wpS=modelMatrix*wpS; vWp=wpS.xyz; vec3 wnS=normal;
#ifdef USE_INSTANCING
wnS=mat3(instanceMatrix)*wnS;
#endif
wnS=normalize(mat3(modelMatrix)*wnS); vec3 an=abs(wnS); vec2 du=an.y>0.62?vWp.xz:(an.x>an.z?vWp.zy:vWp.xy);
float mkk=floor(mk+0.5); vec2 ds=vec2(0.35); vDw=vec4(0.0,0.0,0.0,1.0); vDk=vec2(0.95,0.1);
if(mkk>0.5&&mkk<1.5){ ds=vec2(0.5,4.0); vDw=vec4(0.6,0.0,0.0,0.4); vDk=vec2(0.66,0.55); }
else if(mkk>1.5&&mkk<2.5){ ds=vec2(3.2); vDw=vec4(0.0,1.0,0.0,0.0); vDk=vec2(0.8,0.3); }
else if(mkk>2.5&&mkk<3.5){ ds=vec2(6.0,0.35); vDw=vec4(1.0,0.0,0.0,0.0); vDk=vec2(0.9,0.18); }
else if(mkk>3.5&&mkk<4.5){ ds=vec2(2.6); vDw=vec4(0.0,0.0,1.0,0.0); vDk=vec2(0.88,0.18); }
else if(mkk>5.5&&mkk<6.5){ ds=vec2(3.0); vDw=vec4(1.0,0.0,0.0,0.0); vDk=vec2(0.78,0.42); }
else if(mkk>6.5&&mkk<7.5){ ds=vec2(0.5); vDw=vec4(0.4,0.0,0.0,0.6); vDk=vec2(0.86,0.26); }
else if(mkk>4.5&&mkk<5.5||mkk>8.5&&mkk<9.5){ vDk=vec2(1.0,0.0); }
vDuv=du*ds; vUpK=uTopS.x>0.5&&abs(mkk-6.0)>0.5?smoothstep(0.5,0.7,wnS.y):0.0;`;
export const SURF_V = 'attribute float mk; varying float vMk; varying vec3 vWp; varying vec3 vWn;';
export const SURF_VB = 'vMk=mk;';
export const SURF_VP =
  'vec4 wpS=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwpS=instanceMatrix*wpS;\n#endif\nwpS=modelMatrix*wpS; vWp=wpS.xyz; vec3 wnS=normal;\n#ifdef USE_INSTANCING\nwnS=mat3(instanceMatrix)*wnS;\n#endif\nvWn=normalize(mat3(modelMatrix)*wnS);';
export const SURF_F = `
varying float vMk; varying vec3 vWp; varying vec3 vWn; uniform sampler2D uDet; float sRough; float sMetal; float sH; float sBump; float sSheen;
vec3 surface(vec3 base){
  float k=floor(vMk+0.5); vec3 an=abs(vWn); vec2 uv=an.y>0.62?vWp.xz:(an.x>an.z?vWp.zy:vWp.xy); vec2 dx=dFdx(uv), dy=dFdy(uv);
  #define DET(s) textureGrad(uDet,uv*(s),dx*(s),dy*(s))
  sRough=0.55; sMetal=0.0; sH=0.0; sBump=0.0; sSheen=0.0; vec3 c=base;
  float st=DET(vec2(0.35)).a;
  if(k<0.5){ float g=DET(vec2(1.6)).r; c*=0.95+0.1*st; sRough=0.62+g*0.12; sH=g; sBump=0.0012; }
  else if(k<1.5){ float g=DET(vec2(0.55,5.5)).r; float r=DET(vec2(0.16,1.3)).a; float m=g*0.5+r*0.7; c*=mix(vec3(0.66,0.6,0.54),vec3(1.16,1.14,1.1),m); sRough=0.42+0.2*g; sH=g; sBump=0.002; }
  else if(k<2.5){ float w=DET(vec2(3.2)).g; c*=(0.8+0.3*w)*(0.92+0.16*st); sRough=0.95; sH=w; sBump=0.004; sSheen=0.5; }
  else if(k<3.5){ float b=DET(vec2(6.0,0.35)).r; c*=0.9+0.18*b; sRough=0.26+0.18*b; sMetal=0.9; sH=b; sBump=0.0006; }
  else if(k<4.5){ float b=DET(vec2(2.6)).b; c*=0.88+0.18*b; sRough=0.4+0.15*(1.0-b); sH=b; sBump=0.004; }
  else if(k<5.5){ sRough=0.06; sMetal=0.1; }
  else if(k<6.5){ float g=DET(vec2(3.0)).r; c*=0.78+0.42*g; sRough=0.6; sSheen=0.25; sH=g; sBump=0.003; }
  else if(k<7.5){ float g=DET(vec2(1.2)).r; c*=0.86+0.18*st+0.1*g; sRough=0.75; sH=g; sBump=0.002; }
  else if(k<8.5){ float g=DET(vec2(4.0)).r; c*=0.9+0.2*g; sRough=0.7+0.1*g; sH=g; sBump=0.0016; }
  else if(k<9.5){ sRough=0.16; }
  else { sRough=0.85; c*=0.9+0.2*st; }
  return c;
}`;
export const SURF_BUMP = `if(sBump>0.0){ vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition); float hx=dFdx(sH)*sBump, hy=dFdy(sH)*sBump; vec3 R1=cross(sy,normal), R2=cross(normal,sx); float dt=dot(sx,R1); vec3 gr=sign(dt)*(hx*R1+hy*R2); normal=normalize(max(abs(dt),1e-9)*normal-clamp(length(gr),0.0,abs(dt)*0.9)*normalize(gr+1e-12)); }`;
/** a picture of the whole map from above, fully lit once; surfaces that face up show it instead of being lit again */
export const TOP = { tex: { value: null as THREE.Texture | null }, size: { value: new THREE.Vector2(0, 0) } };
/** turns a plain material into the surface material */
export function surfaced<T extends THREE.Material>(m: T, low: boolean, before?: (s: any) => void): T {
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (s: any, r: any) => {
    prev(s, r);
    before?.(s);
    if (low) {
      s.uniforms.uDet = { value: detailLow() };
      s.uniforms.uTop = TOP.tex;
      s.uniforms.uTopS = TOP.size;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\n' + LOW_V)
        .replace('#include <project_vertex>', LOW_VP + '\n#include <project_vertex>');
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uDet, uTop; uniform vec2 uTopS; varying vec3 vWp; varying float vUpK; varying vec2 vDuv; varying vec4 vDw; varying vec2 vDk;',
        )
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=vDk.x+vDk.y*dot(texture2D(uDet,vDuv),vDw);')
        // the photograph is already in screen colours: nothing else to work out
        .replace(
          'void main() {',
          'void main() {\nvec2 tu=vec2(vWp.x/uTopS.x,1.0-vWp.z/uTopS.y); bool onT=vUpK>0.01&&tu.x>0.0&&tu.x<1.0&&tu.y>0.0&&tu.y<1.0; vec3 tc=vec3(0.0); if(onT) tc=texture2D(uTop,tu).rgb; if(onT&&vUpK>0.98){ gl_FragColor=vec4(tc,1.0); return; }',
        )
        .replace(
          '#include <alphamap_fragment>',
          '#include <alphamap_fragment>\nif(onT) diffuseColor.rgb=mix(diffuseColor.rgb,pow(tc,vec3(2.2)),vUpK);',
        );
      return;
    }
    s.uniforms.uDet = { value: detailTex() };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + SURF_V)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SURF_VB)
      .replace('#include <project_vertex>', SURF_VP + '\n#include <project_vertex>');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SURF_F)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=surface(diffuseColor.rgb);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=sRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor=sMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SURF_BUMP)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nif(sSheen>0.0){ float rs=pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),3.0); totalEmissiveRadiance+=diffuseColor.rgb*rs*sSheen*0.25; }',
      );
  };
  m.customProgramCacheKey = () => 'surf' + (low ? 'L' : 'S');
  return m;
}
