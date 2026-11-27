import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BrightnessContrastEffect,
  HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { surfaced } from './surface.ts';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number, t: number): void;
  resize?(w: number, h: number): void;
  exposure?: number;
  bloom?: number;
  fps?: number;
  /** canvas pixels per CSS pixel, when the view knows better than the quality setting */
  ratio?: number;
  /** draws itself instead of being drawn; on the lowest setting only, unless it says `own` */
  own?: boolean;
  render?(r: THREE.WebGLRenderer, dt: number): void;
}
export function detectSoftware(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  const s = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  return /swiftshader|llvmpipe|software|basic render/.test(s);
}
/** Shared lighting for the vertex-lit path used on weak or software GPUs. */
export const LOWU = {
  uSunD: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
  uSunC: { value: new THREE.Color(1, 1, 1) },
  uSky: { value: new THREE.Color(0.5, 0.5, 0.55) },
  uGnd: { value: new THREE.Color(0.3, 0.28, 0.25) },
};
export const LOWLIT =
  'vec3 nl=normalize(mat3(modelMatrix)*nn); vLit=mix(uGnd,uSky,nl.y*0.5+0.5)+uSunC*max(0.0,dot(nl,uSunD)); vLit=pow(max(vLit,vec3(0.0)),vec3(2.2));';
/** close enough to the screen's curve, without three powers per pixel */
export const LOWOUT = 'gl_FragColor.rgb=sqrt(max(gl_FragColor.rgb*1.1,vec3(0.0)));';
export const LOWDECL = 'varying vec3 vLit; uniform vec3 uSunD,uSunC,uSky,uGnd;';
export function lowLit(m: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  m.onBeforeCompile = (s: any) => {
    Object.assign(s.uniforms, LOWU);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + LOWDECL)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec3 nn=normal;\n#ifdef USE_INSTANCING\nnn=mat3(instanceMatrix)*nn;\n#endif\n' + LOWLIT,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLit;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=vLit;')
      .replace('#include <colorspace_fragment>', LOWOUT);
  };
  m.customProgramCacheKey = () => 'lowlit';
  return m;
}
export function setLowLight(dir: THREE.Vector3, sun: THREE.Color, sky: THREE.Color, gnd: THREE.Color) {
  LOWU.uSunD.value.copy(dir).normalize();
  LOWU.uSunC.value.copy(sun);
  LOWU.uSky.value.copy(sky);
  LOWU.uGnd.value.copy(gnd);
}
/** One renderer for the whole game. Views (HQ, match) are swapped in; quality adapts to the machine. */
export class Engine {
  r: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  view: View | null = null;
  q: Quality;
  auto = true;
  software = false;
  composer: EffectComposer | null = null;
  env: THREE.Texture | null = null;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private ft = 0;
  fps = 0;
  scale = 1;
  w = 1;
  h = 1;
  t = 0;
  paused = false;
  private skip = 0;
  private bloomFx: BloomEffect | null = null;
  onQuality: ((q: Quality) => void) | null = null;
  private warm = 0;
  constructor(canvas: HTMLCanvasElement, q?: Quality) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.software = detectSoftware(this.r.getContext());
    this.q = q ?? (this.software ? 'low' : 'high');
    this.auto = !q;
    this.r.shadowMap.type = THREE.PCFShadowMap;
    this.setup();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  get shadows() {
    return this.q !== 'low';
  }
  get rich() {
    return this.q === 'high' || this.q === 'ultra';
  }
  setQuality(q: Quality, auto = false) {
    this.q = q;
    this.auto = auto;
    this.scale = 1;
    this.setup();
    this.onQuality?.(q);
    if (this.view) this.applyView();
  }
  private setup() {
    THREE.ColorManagement.enabled = true;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.shadowMap.enabled = true;
    if (!this.env) {
      const pm = new THREE.PMREMGenerator(this.r);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.resize(this.w, this.h);
  }
  resize(w: number, h: number) {
    this.w = Math.max(2, w);
    this.h = Math.max(2, h);
    const base = {
      low: this.software ? 0.66 : 0.85,
      medium: 1,
      high: Math.min(1.5, devicePixelRatio),
      ultra: Math.min(2, devicePixelRatio),
    }[this.q];
    this.r.setPixelRatio(
      this.view?.own
        ? this.software
          ? 0.9
          : Math.min(this.rich ? 2 : 1.25, devicePixelRatio)
        : this.view?.ratio && this.q === 'low'
          ? this.view.ratio
          : base * this.scale,
    );
    this.r.setSize(this.w, this.h, false);
    this.composer?.setSize(this.w, this.h, false);
    if (this.view) {
      this.view.camera.aspect = this.w / this.h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(this.w, this.h);
    }
  }
  setView(v: View | null) {
    this.view = v;
    if (v) this.applyView();
    this.warm = 0;
  }
  private wasOwn = false;
  private applyView() {
    const v = this.view!;
    v.camera.aspect = this.w / this.h;
    v.camera.updateProjectionMatrix();
    v.scene.environment = this.env;
    (v.scene as any).environmentIntensity = v.own ? 0.26 : 0.35;
    this.composer?.dispose();
    this.composer = null;
    this.bloomFx = null;
    this.r.shadowMap.autoUpdate = true;
    if (v.own || this.wasOwn) {
      this.wasOwn = !!v.own;
      this.resize(this.w, this.h);
      if (v.own) return;
    }
    const base = this.q === 'low';
    if (base) {
      const pr = v.ratio ?? (this.software ? 0.66 : 0.85) * this.scale;
      if (Math.abs(this.r.getPixelRatio() - pr) > 0.01) {
        this.r.setPixelRatio(pr);
        this.r.setSize(this.w, this.h, false);
      }
    }
    if (this.q === 'low') {
      this.r.toneMapping = THREE.NoToneMapping;
      v.resize?.(this.w, this.h);
      return;
    }
    this.r.toneMapping = THREE.NoToneMapping;
    const c = new EffectComposer(this.r, { frameBufferType: THREE.HalfFloatType, multisampling: this.q === 'medium' ? 2 : 0 });
    c.addPass(new RenderPass(v.scene, v.camera));
    if (this.rich) {
      const ao: any = new (N8AOPostPass as any)(v.scene, v.camera, this.w, this.h);
      ao.configuration.aoRadius = 1.6;
      ao.configuration.distanceFalloff = 1;
      ao.configuration.intensity = 2.6;
      ao.configuration.halfRes = this.q !== 'ultra';
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode(this.q === 'ultra' ? 'Medium' : 'Performance');
      c.addPass(ao);
    }
    this.bloomFx = new BloomEffect({
      intensity: v.bloom ?? 0.9,
      luminanceThreshold: 0.92,
      luminanceSmoothing: 0.2,
      mipmapBlur: true,
      radius: 0.7,
    });
    const fx: any[] = [this.bloomFx];
    if (this.rich) fx.push(new SMAAEffect());
    const tm = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    fx.push(
      new HueSaturationEffect({ saturation: 0.08 }),
      new BrightnessContrastEffect({ brightness: (v.exposure ?? 1) > 1 ? 0.03 : 0, contrast: 0.06 }),
      tm,
      new VignetteEffect({ darkness: 0.42, offset: 0.28 }),
    );
    c.addPass(new EffectPass(v.camera, ...fx));
    this.r.toneMappingExposure = v.exposure ?? 1;
    c.setSize(this.w, this.h, false);
    this.composer = c;
    v.resize?.(this.w, this.h);
  }
  private loop(ts: number) {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    if (this.paused || !this.view || document.hidden) return;
    const cap = this.view.fps ?? 0;
    this.skip += dt;
    if (cap && this.skip < 1 / cap - 0.004) return;
    dt = Math.min(0.12, this.skip);
    this.skip = 0;
    this.t += dt;
    this.view.update(dt, this.t);
    if (this.view.render && (this.view.own || this.q === 'low')) this.view.render(this.r, dt);
    else if (this.composer) this.composer.render(dt);
    else this.r.render(this.view.scene, this.view.camera);
    this.frames++;
    this.ft += dt;
    if (this.ft > 1) {
      this.fps = this.frames / this.ft;
      this.frames = 0;
      this.ft = 0;
      if (++this.warm > 3 && this.auto) this.govern(cap || 60);
    }
  }
  private govern(target: number) {
    const f = this.fps;
    if (f < Math.min(target, 60) * 0.45 && f < 22) {
      const floor = this.q === 'low' ? 0.84 : 0.6;
      if (this.scale > floor + 0.02) {
        this.scale = Math.max(floor, this.scale - 0.12);
        this.resize(this.w, this.h);
      } else if (this.q === 'ultra' || this.q === 'high') {
        const n = ({ ultra: 'high', high: 'medium' } as const)[this.q];
        this.q = n as Quality;
        this.scale = 1;
        this.setup();
        this.applyView();
        this.onQuality?.(this.q);
      }
      this.warm = 0;
    } else if (f > Math.min(target, 58) * 0.93 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.06);
      this.resize(this.w, this.h);
      this.warm = 1;
    }
  }
  mat(
    o: {
      rough?: number;
      metal?: number;
      vc?: boolean;
      color?: THREE.ColorRepresentation;
      map?: THREE.Texture;
      side?: THREE.Side;
      transparent?: boolean;
      opacity?: number;
      emissive?: THREE.ColorRepresentation;
      flat?: boolean;
      normalMap?: THREE.Texture;
      roughMap?: THREE.Texture;
      /** full material even on the lowest setting */
      std?: boolean;
    } = {},
  ): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
    const base: any = {
      color: o.color ?? '#ffffff',
      vertexColors: o.vc ?? false,
      map: o.map ?? null,
      side: o.side ?? THREE.FrontSide,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
    };
    if (o.emissive) base.emissive = new THREE.Color(o.emissive);
    if (this.q === 'low' && !o.std) {
      delete base.emissive;
      const lm = lowLit(new THREE.MeshBasicMaterial({ ...base, fog: false }));
      return o.vc ? surfaced(lm, true) : lm;
    }
    const sm = new THREE.MeshStandardMaterial({
      ...base,
      roughness: o.rough ?? 0.8,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? false,
      normalMap: o.normalMap ?? null,
      roughnessMap: o.roughMap ?? null,
    });
    return o.vc ? surfaced(sm, false) : sm;
  }
}
export function disposeScene(s: THREE.Object3D) {
  s.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mt = m.material as any;
    if (mt)
      for (const x of Array.isArray(mt) ? mt : [mt]) {
        for (const k of ['map', 'normalMap', 'emissiveMap']) x[k]?.dispose?.();
        x.dispose?.();
      }
    (o as any).dispose?.();
  });
}
