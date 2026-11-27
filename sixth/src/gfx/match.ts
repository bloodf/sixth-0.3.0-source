/** Live 3D match view. Owns a Sim, renders it with interpolation, directs the camera, and turns sim events into effects and sound. */
import * as THREE from 'three';
import type { Engine, View } from './engine.ts';
import { disposeScene, LOWDECL, LOWLIT, LOWU, setLowLight } from './engine.ts';
import { Fx } from './fx.ts';
import { buildMoba, buildTac, PAL, type Built } from './maps3d.ts';
import { buildHall, type Hall } from './hall.ts';
import { Character, heroCharacter, resetCharMaterials } from './character.ts';
import { makeSim } from '../sim/index.ts';
import { getMap } from '../sim/maps.ts';
import { TPS, type Ev, type MatchCfg, type Sim } from '../sim/types.ts';
import type { TacSim } from '../sim/tac.ts';
import type { MobaSim, Hero, Creep } from '../sim/moba.ts';
import type { ArenaSim, Fig } from '../sim/arena.ts';
import { blobTex, softTex } from './tex.ts';
import { bakeTop } from './topbake.ts';
import { TOP } from './surface.ts';
import { Kit, mixc, shade } from './kit.ts';
import { heroLook, OW_BY } from '../data/heroes.ts';
export type CamMode = 'top' | 'action' | 'follow' | 'arena' | 'free';
export interface Sfx {
  (name: string, o?: { pan?: number; vol?: number; rate?: number }): void;
}
interface Snap {
  x: number;
  y: number;
  dir: number;
}
const lerpAng = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / 6.283185) * 6.283185;
  return a + d * k;
};
const CREEPV = (s: any) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float limb; attribute float ip; attribute float ia; uniform float uT;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
float sw=sin(uT*11.0+ip*6.28); if(limb>0.5){ float sg=(limb<1.5||limb>3.5)?1.0:-1.0; float py=(limb<2.5)?0.62:1.12; float am=(limb<2.5)?0.75:0.6; float a=sw*sg*am*(1.0-ia); if(limb>3.5&&limb<4.5) a=mix(a,-1.5+1.3*max(0.0,sin(uT*9.0+ip*6.28)),ia); float cs=cos(a),sn=sin(a); vec2 q=vec2(transformed.y-py,transformed.z); transformed.y=py+q.x*cs-q.y*sn; transformed.z=q.x*sn+q.y*cs; } transformed.y+=abs(sw)*0.05*(1.0-ia);`,
    );
};
function creepGeo(ranged: boolean) {
  const parts: [Kit, number][] = [];
  const P = (l: number, f: (k: Kit) => void) => {
    const k = new Kit();
    f(k);
    parts.push([k, l]);
  };
  P(0, k => {
    k.rbox(0, 0.62, 0, 0.56, 0.55, 0.36, '#ffffff', { b: 0.1 });
    k.sph(0, 1.38, 0.02, 0.25, '#cfc4b4', { seg: 7 });
    k.cone(0, 1.45, 0, 0.28, 0.26, '#8a8f96', { seg: 7 });
  });
  P(1, k => k.box(0.15, 0, 0, 0.2, 0.62, 0.24, '#6a6258'));
  P(2, k => k.box(-0.15, 0, 0, 0.2, 0.62, 0.24, '#6a6258'));
  P(3, k => k.box(0.38, 0.55, 0.05, 0.17, 0.6, 0.2, '#e8e2d8'));
  P(4, k => {
    k.box(-0.38, 0.55, 0.05, 0.17, 0.6, 0.2, '#e8e2d8');
    if (ranged) k.sph(-0.38, 0.5, 0.3, 0.17, '#ffffff', { seg: 6 });
    else k.box(-0.38, 0.52, 0.42, 0.07, 0.08, 0.75, '#c8ced4');
  });
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [],
    limb: number[] = [];
  for (const [k, l] of parts) {
    pos.push(...k.p);
    nor.push(...k.n);
    col.push(...k.c);
    for (let i = 0; i < k.p.length / 3; i++) limb.push(l);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 1));
  return g;
}
interface Label {
  el: HTMLDivElement;
  hp: HTMLElement;
  extra: HTMLElement;
  sh: HTMLElement;
}
export class MatchView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 420);
  sim: Sim;
  fx: Fx;
  built: Built;
  hall: Hall;
  chars: Character[] = [];
  prev: Snap[] = [];
  cur: Snap[] = [];
  acc = 0;
  speed = 1;
  paused = false;
  mode: CamMode = 'action';
  followI = 0;
  exposure = 0.8;
  bloom = 1;
  onStep: ((ev: Ev[]) => void) | null = null;
  onDone: (() => void) | null = null;
  gate: (() => boolean) | null = null;
  preStep: (() => void) | null = null;
  sfx: Sfx = () => {};
  labels: Label[] = [];
  rings: THREE.Mesh[] = [];
  blobs: THREE.InstancedMesh;
  private camT = new THREE.Vector3();
  private camD = 60;
  private camTs = new THREE.Vector3();
  private camDs = 70;
  private yaw = 0;
  private pitch = 0.95;
  private drag: { x: number; y: number; b: number } | null = null;
  private creepM: THREE.InstancedMesh[] = [];
  private creepPrev = new Map<number, [number, number]>();
  private towerM = new Map<number, { g: THREE.Group; glow: THREE.Mesh; bar: Label | null; y: number }>();
  private campM: THREE.Group[] = [];
  private bossC: Character | null = null;
  private projI: THREE.InstancedMesh | null = null;
  private barriers = new Map<number, THREE.Mesh>();
  private bombM: THREE.Group | null = null;
  private wallsM: { w: any; m: THREE.Mesh }[] = [];
  private beamsM = new Map<number, { m: THREE.Mesh; t: number }>();
  private T = 0;
  private focus = new THREE.Vector3();
  private focusHold = 0;
  private sun: THREE.DirectionalLight;
  private scoreT = 0;
  private smoked = new Set<any>();
  private zoned = new Set<any>();
  private disposed = false;
  private unhook: () => void;
  private h = 800;
  intro = 1;
  endT = 0;
  title: string;
  private hitStop = 0;
  private cinematic = 0;
  private topRt: THREE.WebGLRenderTarget | null = null;
  /** light the whole map once, in full, from above; the quick materials then show that picture */
  private photograph(map: ReturnType<typeof getMap>, W: number, H: number) {
    const fe = Object.create(this.e) as Engine;
    fe.q = 'high';
    const kq = Kit.q;
    Kit.q = this.e.software ? 0.6 : 1;
    const f = map.kind === 'moba' ? buildMoba(fe, map) : buildTac(fe, map);
    Kit.q = kq;
    const pal = f.pal;
    const s = new THREE.Scene();
    s.environment = this.e.env;
    s.environmentIntensity = 0.3;
    s.background = new THREE.Color('#101418');
    const sun = new THREE.DirectionalLight(pal.sun, pal.sunI * 1.05);
    sun.position.set(W * 0.5 - 26, 52, H * 0.5 + 18);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const R = Math.max(W, H) * 0.62;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 5, far: 150 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    s.add(f.group, sun, sun.target, new THREE.HemisphereLight(pal.sky, pal.ground, 0.75));
    this.topRt = bakeTop(this.e.r, s, W, H, 1.0, this.e.software ? 2560 : 4096);
    sun.shadow.map?.dispose();
    disposeScene(s);
    this.built.group.traverse(o => {
      const mm = (o as THREE.Mesh).material as any;
      if (mm?.map && (o as THREE.Mesh).geometry?.type === 'PlaneGeometry' && !o.userData.keep) {
        // the ground simply is the picture
        (o as THREE.Mesh).material = new THREE.ShaderMaterial({
          vertexShader:
            'varying vec2 vT; uniform vec2 uS; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vT=vec2(w.x/uS.x,1.0-w.z/uS.y); gl_Position=projectionMatrix*viewMatrix*w; }',
          fragmentShader: 'varying vec2 vT; uniform sampler2D uT; void main(){ gl_FragColor=vec4(texture2D(uT,vT).rgb,1.0); }',
          uniforms: { uT: { value: this.topRt!.texture }, uS: { value: new THREE.Vector2(W, H) } },
          toneMapped: false,
        });
      }
    });
  }
  constructor(
    public e: Engine,
    public cfg: MatchCfg,
    public overlay: HTMLElement,
  ) {
    resetCharMaterials();
    this.title = cfg.title;
    const low = e.q === 'low';
    this.sim = makeSim(cfg);
    const map = getMap(cfg.map);
    this.built = map.kind === 'moba' ? buildMoba(e, map) : buildTac(e, map);
    const pal = this.built.pal,
      W = this.built.w,
      H = this.built.h;
    if (low) this.photograph(map, W, H);
    this.scene.add(this.built.group);
    this.hall = buildHall(e, W, H, cfg.teams);
    this.scene.add(this.hall.group);
    // the arena lies behind everything: drawing it last costs only what can be seen of it
    this.hall.group.traverse(o => (o.renderOrder = 2));
    this.scene.background = new THREE.Color(pal.fog);
    this.scene.fog = new THREE.Fog(pal.fog, 95, 230);
    this.sun = new THREE.DirectionalLight(pal.sun, pal.sunI * (low ? 0.92 : 1));
    this.sun.position.set(W * 0.5 - 26, 52, H * 0.5 + 18);
    this.sun.target.position.set(W / 2, 0, H / 2);
    if (!low) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      const ms = e.rich ? 3072 : 1536;
      s.mapSize.set(ms, ms);
      const R = Math.max(W, H) * 0.62;
      s.camera.left = -R;
      s.camera.right = R;
      s.camera.top = R;
      s.camera.bottom = -R;
      s.camera.near = 5;
      s.camera.far = 150;
      s.bias = -0.0006;
      s.normalBias = 0.03;
    }
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(pal.sky, pal.ground, low ? 1.15 : 0.85));
    if (low) {
      setLowLight(
        new THREE.Vector3(-0.42, 0.84, 0.3),
        new THREE.Color(pal.sun).multiplyScalar(pal.sunI * 0.19),
        new THREE.Color(pal.sky).multiplyScalar(0.78),
        new THREE.Color(pal.ground).multiplyScalar(1.5).addScalar(0.12),
      );
    }
    const rim = new THREE.DirectionalLight(cfg.teams[1].c1, 0.35);
    rim.position.set(W + 30, 18, H / 2);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(cfg.teams[0].c1, 0.35);
    rim2.position.set(-30, 18, H / 2);
    this.scene.add(rim2);
    Kit.q = e.software ? 0.6 : 1;
    this.fx = new Fx(e.rich, low);
    this.scene.add(this.fx.g);
    const bm = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bm, 110);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.scene.add(this.blobs);
    const teamSkin = (ti: number) => cfg.teams[ti];
    this.sim.actors.forEach((a, i) => {
      const tm = teamSkin(a.team);
      let c: Character;
      const look = heroLook(a.hero);
      if (cfg.title === 'cs2') {
        const H = ['helm', 'hat', 'mask', 'helm', 'hood'] as const;
        c = heroCharacter(
          low,
          { body: 'soldier', c1: tm.c1, c2: tm.c2, glow: tm.c1, head: H[(i + a.team * 2) % 5], prop: 'rifle' },
          tm.c1,
          {
            scale: 1.4,
            lod: e.software ? 2 : 1,
            id: 'op' + i + a.nick,
            pal: {
              hair: '#2a1d14',
              main: '#' + mixc(tm.c1, '#2a2e33', 0.34).getHexString(),
              second: '#' + mixc(tm.c2, '#33383d', 0.35).getHexString(),
              pants: '#' + mixc(tm.c1, '#3a3a38', 0.74).getHexString(),
              shoes: '#2a241f',
              glove: '#22252a',
              metal: '#8a9098',
              dark: '#' + mixc('#2b3036', tm.c1, 0.14).getHexString(),
              glow: tm.c1,
            },
          },
        );
        c.rig.hold = 'rifle';
        c.setWeapon('pistol', tm.c1, tm.c2, tm.c1);
      } else {
        c = heroCharacter(low, look!, tm.c1, { scale: cfg.title === 'dota' ? 1.55 : 1.38, id: a.hero ?? 'h', lod: e.software ? 2 : 1 });
        if (cfg.title === 'val') {
          c.rig.hold = 'rifle';
          c.setWeapon('pistol', look!.c1, look!.c2, look!.glow);
        }
      }
      c.mat.uniformsX.uRim.value.set(tm.c1).multiplyScalar(low ? 0.22 : 0.34);
      this.scene.add(c.root);
      this.chars.push(c);
      this.prev.push({ x: a.x, y: a.y, dir: a.dir });
      this.cur.push({ x: a.x, y: a.y, dir: a.dir });
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.52, 0.66, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: tm.c1, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }),
      );
      r.renderOrder = 2;
      r.scale.setScalar(c.scale);
      this.scene.add(r);
      this.rings.push(r);
      this.labels.push(this.mkLabel(a.nick, tm.c1, a.num));
    });
    if (map.kind === 'moba') this.setupMoba();
    if (map.kind === 'tac') {
      this.bombM = new THREE.Group();
      const k = new Kit();
      if (cfg.title === 'val') {
        k.cone(0, 0, 0, 0.16, 0.7, '#d8dde2', { seg: 5 });
        k.cyl(0, 0.4, 0, 0.1, 0.3, '#ff5a5a', { glow: true, seg: 6 });
      } else {
        k.rbox(0, 0, 0, 0.5, 0.18, 0.34, '#3a3f36', { b: 0.04 });
        k.box(0, 0.18, 0, 0.2, 0.04, 0.12, '#ff4a3a', { glow: true });
        k.cyl(0.16, 0.18, 0, 0.04, 0.1, '#c8b46a', { seg: 6 });
      }
      this.bombM.add(new THREE.Mesh(k.geo(), e.mat({ vc: true })));
      this.bombM.add(
        new THREE.Mesh(
          k.glow()!,
          new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4) }),
        ),
      );
      this.bombM.scale.setScalar(1.3);
      this.scene.add(this.bombM);
    } else {
      this.projI = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshBasicMaterial({ toneMapped: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
        80,
      );
      this.projI.frustumCulled = false;
      this.scene.add(this.projI);
    }
    this.camT.set(W / 2, 0, H / 2);
    this.camTs.copy(this.camT);
    this.camDs = 150;
    this.focus.copy(this.camT);
    this.score();
    this.unhook = this.hook();
  }
  private mkLabel(name: string, col: string, num?: number): Label {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = `<b></b><i><u></u><s></s></i>`;
    const b = el.querySelector('b')!;
    b.textContent = name;
    el.style.setProperty('--c', col);
    this.overlay.appendChild(el);
    void num;
    return { el, hp: el.querySelector('u')!, extra: b as HTMLElement, sh: el.querySelector('s')! };
  }
  private setupMoba() {
    const e = this.e,
      s = this.sim as MobaSim;
    const mat = e.mat({ vc: true, rough: 0.7 });
    for (const q of [0, 1]) {
      const g = creepGeo(!!q);
      const U = { uT: { value: 0 } };
      const m: any =
        e.q === 'low'
          ? new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
          : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
      m.onBeforeCompile = (sh: any) => {
        sh.uniforms.uT = U.uT;
        CREEPV(sh);
        if (e.q === 'low') {
          Object.assign(sh.uniforms, LOWU);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + LOWDECL)
            .replace('#include <project_vertex>', 'vec3 nn=mat3(instanceMatrix)*normal; ' + LOWLIT + '\n#include <project_vertex>');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vLit;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=vLit;');
        }
      };
      m.userData.U = U;
      const im = new THREE.InstancedMesh(g, m, 70);
      g.setAttribute('ip', new THREE.InstancedBufferAttribute(new Float32Array(70), 1));
      g.setAttribute('ia', new THREE.InstancedBufferAttribute(new Float32Array(70), 1));
      im.frustumCulled = false;
      im.castShadow = true;
      im.setColorAt(0, new THREE.Color('#fff'));
      this.scene.add(im);
      this.creepM.push(im);
    }
    for (const t of s.towers) {
      const tm = this.cfg.teams[t.team],
        k = new Kit();
      if (t.core) {
        k.cyl(0, 0, 0, 2.4, 0.6, '#8d8574', { seg: 10 });
        k.cyl(0, 0.6, 0, 1.8, 0.5, '#a79e8a', { seg: 10 });
        for (let i = 0; i < 4; i++) {
          const a = i * 1.571 + 0.78;
          k.box(Math.cos(a) * 1.9, 0.4, Math.sin(a) * 1.9, 0.5, 3, 0.5, '#8d8574', { rz: Math.cos(a) * 0.18, rx: -Math.sin(a) * 0.18 });
        }
        k.ico(0, 3.1, 0, 1.25, tm.c1, { glow: true, sy: 1.7 });
        k.tor(0, 1.6, 0, 1.9, 0.16, tm.c2);
      } else {
        const u = 1 + t.tier * 0.12;
        k.cyl(0, 0, 0, 1.15 * u, 0.5, '#8d8574', { seg: 8 });
        k.cyl(0, 0.5, 0, 0.85 * u, 2.6, '#a0967f', { r2: 0.62 * u, seg: 8 });
        k.cyl(0, 3.1, 0, 0.95 * u, 0.35, '#877e6b', { seg: 8 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 6.283;
          k.box(Math.cos(a) * 0.82 * u, 3.45, Math.sin(a) * 0.82 * u, 0.25, 0.35, 0.25, '#877e6b', { ry: -a });
        }
        k.ico(0, 4.0, 0, 0.5, tm.c1, { glow: true, sy: 1.5 });
        k.box(0, 1.5, 0.72 * u, 0.6, 1.1, 0.06, tm.c1, { ao: 0 });
      }
      const g = new THREE.Group();
      const m = new THREE.Mesh(k.geo(), mat);
      m.castShadow = true;
      const gl = new THREE.Mesh(
        k.glow()!,
        new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }),
      );
      g.add(m, gl);
      g.position.set(t.x, 0, t.y);
      this.scene.add(g);
      const bar = this.mkLabel(t.core ? 'Core' : '', tm.c1);
      bar.el.classList.add('lbl-t');
      this.towerM.set(t.id, { g, glow: gl, bar, y: t.core ? 5.6 : 5 });
    }
    for (const c of s.camps) {
      const k = new Kit();
      for (const [x, z, sc] of [
        [0, 0, 1],
        [0.9, 0.5, 0.7],
        [-0.8, 0.6, 0.7],
      ]) {
        k.sph(x, 0.45 * sc, z, 0.5 * sc, '#6b5a4a', { sy: 0.8, sz: 1.3, seg: 8 });
        k.sph(x, 0.7 * sc, z + 0.6 * sc, 0.28 * sc, '#7d6a56', { seg: 7 });
        k.cone(x + 0.12 * sc, 0.85 * sc, z + 0.55 * sc, 0.08, 0.3 * sc, '#d8cfbf', { seg: 4 });
        k.cone(x - 0.12 * sc, 0.85 * sc, z + 0.55 * sc, 0.08, 0.3 * sc, '#d8cfbf', { seg: 4 });
        k.sph(x, 0.72 * sc, z + 0.84 * sc, 0.05, '#ff8a3a', { glow: true, seg: 5 });
      }
      const g = new THREE.Group();
      const m = new THREE.Mesh(k.geo(), mat);
      m.castShadow = true;
      g.add(m, new THREE.Mesh(k.glow()!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
      g.position.set(c.x, 0, c.y);
      this.scene.add(g);
      this.campM.push(g);
    }
    this.bossC = heroCharacter(
      e.q === 'low',
      { body: 'brute', c1: '#4a3f52', c2: '#8a7a6a', glow: '#ff5a3a', head: 'horns', prop: 'none' },
      '#a8443a',
      { scale: 3.1 },
    );
    this.scene.add(this.bossC.root);
  }
  private hook() {
    const el = this.overlay;
    const dn = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest('.hud')) return;
      this.drag = { x: ev.clientX, y: ev.clientY, b: ev.button };
    };
    const mv = (ev: PointerEvent) => {
      if (!this.drag) return;
      const dx = ev.clientX - this.drag.x,
        dy = ev.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 3 && this.mode !== 'free') return;
      this.drag.x = ev.clientX;
      this.drag.y = ev.clientY;
      if (this.drag.b === 2 || ev.shiftKey) {
        this.yaw -= dx * 0.005;
        this.pitch = Math.max(0.35, Math.min(1.45, this.pitch + dy * 0.004));
      } else {
        this.setMode('free');
        const k = this.camDs * 0.0016;
        this.camT.x -= (dx * Math.cos(this.yaw) + dy * Math.sin(this.yaw)) * k;
        this.camT.z -= (dy * Math.cos(this.yaw) - dx * Math.sin(this.yaw)) * k;
      }
    };
    const up = () => {
      this.drag = null;
    };
    const wh = (ev: WheelEvent) => {
      if ((ev.target as HTMLElement).closest('.hud-scroll')) return;
      ev.preventDefault();
      if (this.mode !== 'free' && this.mode !== 'follow') {
        this.setMode('free');
        this.camT.copy(this.camTs);
        this.camD = this.camDs;
      }
      this.camD = Math.max(9, Math.min(150, this.camD * (1 + Math.sign(ev.deltaY) * 0.11)));
    };
    const cm = (ev: Event) => ev.preventDefault();
    el.addEventListener('pointerdown', dn);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wh, { passive: false });
    el.addEventListener('contextmenu', cm);
    return () => {
      el.removeEventListener('pointerdown', dn);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wh);
      el.removeEventListener('contextmenu', cm);
    };
  }
  onMode: ((m: CamMode) => void) | null = null;
  setMode(m: CamMode) {
    if (m === this.mode) return;
    if (m === 'free') {
      this.camT.copy(this.camTs);
      this.camD = this.camDs;
    }
    this.mode = m;
    if (m !== 'free') {
      this.yaw = 0;
      this.pitch = m === 'arena' ? 0.5 : 0.95;
    }
    this.onMode?.(m);
  }
  follow(i: number) {
    this.followI = i;
    this.mode = 'action';
    this.setMode('follow');
  }
  resize(_w: number, h: number) {
    this.h = h;
  }
  private pan(x: number) {
    return Math.max(-0.8, Math.min(0.8, (x - this.camTs.x) / 30));
  }
  private vol(x: number, z: number) {
    return (1 / (1 + Math.hypot(x - this.camTs.x, z - this.camTs.z) / 26)) * Math.min(1, 34 / this.camDs + 0.25);
  }
  private snd(n: string, x: number, z: number, v = 1, rate = 1) {
    if (this.speed > 4 && Math.random() < 0.6) return;
    const vol = this.vol(x, z) * v;
    if (vol > 0.05) this.sfx(n, { pan: this.pan(x), vol, rate: rate * (0.95 + Math.random() * 0.1) });
  }
  /** run one sim tick */
  private tickOnce() {
    if (this.sim.done) return;
    this.preStep?.();
    this.sim.actors.forEach((a, i) => {
      const p = this.prev[i],
        c = this.cur[i];
      p.x = c.x;
      p.y = c.y;
      p.dir = c.dir;
      void a;
    });
    if (this.title === 'dota') {
      const s = this.sim as MobaSim;
      this.creepPrev.clear();
      for (const c of s.creeps) if (c.alive) this.creepPrev.set(c.id, [c.x, c.y]);
    }
    this.sim.step();
    this.sim.actors.forEach((a, i) => {
      const c = this.cur[i];
      if (Math.hypot(c.x - a.x, c.y - a.y) > 5) {
        this.prev[i].x = a.x;
        this.prev[i].y = a.y;
      }
      c.x = a.x;
      c.y = a.y;
      c.dir = a.dir;
    });
    for (const ev of this.sim.ev) this.effect(ev);
    this.onStep?.(this.sim.ev);
    if (this.sim.done) {
      this.endT = 0.001;
      this.hall.excite(1);
    }
  }
  private hx(i: number): [number, number, number] {
    const a = this.cur[i];
    return [a.x, 1.3 * this.chars[i].scale, a.y];
  }
  private muzzle(i: number): THREE.Vector3 {
    const c = this.chars[i];
    const p = new THREE.Vector3(0, 0.04, this.title === 'ow' ? 0.75 : 0.62);
    if (c.weapon)
      p.applyMatrix4(c.weapon.matrix)
        .multiplyScalar(c.scale)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.root.rotation.y)
        .add(c.root.position);
    else p.copy(c.root.position).setY(1.3);
    return p;
  }
  private effect(v: Ev) {
    const fx = this.fx,
      C = this.chars,
      t1 = (i: number) => this.cfg.teams[this.sim.actors[i].team].c1;
    const fast = this.speed > 4;
    switch (v.k) {
      case 'shot': {
        const p = this.muzzle(v.i);
        const ty = 1.35;
        const w = v.w;
        C[v.i].rig.act = 'shoot';
        C[v.i].rig.recoil = w === 'awp' || w === 'shotgun' ? 2.2 : 1;
        if (w === 'beam') {
          fx.tracer(p.x, p.y, p.z, v.tx, ty, v.ty, v.col, 0.05, 0.12);
          return;
        }
        fx.muzzle(p.x, p.y, p.z, w === 'awp' ? 1.7 : w === 'shotgun' ? 1.5 : this.title === 'ow' ? 0.7 : 1);
        // bullets stop at the first wall
        let dx = v.tx - p.x,
          dz = v.ty - p.z;
        const reach = v.hit ? 1 : 1.25;
        const ext = v.hit ? 1 : reach * this.sim_grid().ray(p.x, p.z, p.x + dx * reach, p.z + dz * reach);
        if (this.sim_grid().atp(p.x, p.z) === 1) {
          const me = this.cur[v.i];
          p.x = me.x;
          p.z = me.y;
          dx = v.tx - p.x;
          dz = v.ty - p.z;
        }
        fx.tracer(
          p.x,
          p.y,
          p.z,
          p.x + dx * ext,
          ty,
          p.z + dz * ext,
          v.col ?? (w === 'awp' ? '#fff0c8' : '#ffcf8a'),
          w === 'awp' ? 0.07 : 0.035,
          w === 'awp' ? 0.22 : 0.07,
        );
        if (!v.hit) fx.impact(p.x + dx * ext, 0.9 + Math.random(), p.z + dz * ext);
        this.snd(
          w === 'awp'
            ? 'awp'
            : w === 'pistol'
              ? 'pistol'
              : w === 'shotgun'
                ? 'shotgun'
                : w === 'smg'
                  ? 'smg'
                  : this.title === 'ow'
                    ? 'pulse'
                    : 'rifle',
          p.x,
          p.z,
          w === 'awp' ? 1 : 0.75,
        );
        break;
      }
      case 'hit': {
        C[v.i].flash = Math.min(0.9, 0.25 + v.d / 90);
        const a = this.cur[v.i];
        if (this.title === 'dota') {
          if (v.d > 40) fx.burst(a.x, 1.4, a.y, v.m ? '#ffd2a0' : '#ff7a5a', 4, 3, 0.35, 0.2);
        } else {
          fx.burst(a.x, v.hs ? 1.95 : 1.4, a.y, v.hs ? '#ffe08a' : '#ff5a4a', v.hs ? 10 : 5, v.hs ? 5 : 3, 0.35, 0.15);
          if (v.hs) this.snd('headshot', a.x, a.y, 0.7);
        }
        break;
      }
      case 'kill': {
        const a = this.cur[v.i];
        C[v.i].rig.dieDir = 1;
        this.fallRoom(v.i);
        fx.burst(a.x, 1.2, a.y, t1(v.i), 18, 6, 0.6, 0.25);
        fx.ring(a.x, 0.06, a.y, t1(v.i), 0.4, 2.6, 0.45);
        this.snd('down', a.x, a.y, 0.9);
        this.hall.excite(0.45, 1 - this.sim.actors[v.i].team);
        this.focus.set(a.x, 0, a.y);
        this.focusHold = 0.8;
        if (!fast) this.sfx('crowd', { vol: 0.35 });
        break;
      }
      case 'throw':
        C[v.i].rig.act = 'throw';
        C[v.i].rig.actT = 0;
        this.lob(v);
        break;
      case 'smoke':
        this.snd('hiss', v.x, v.y, 0.7);
        {
          const s: any = (this.sim as TacSim).smokes.at(-1);
          if (s) this.addSmoke(s);
        }
        break;
      case 'flash':
        fx.flare(v.x, 2.4, v.y, '#ffffff', 9, 0.35);
        fx.light(v.x, 2.4, v.y, '#fff', 160, 0.3);
        this.snd('flash', v.x, v.y, 0.9);
        break;
      case 'molly': {
        const f: any = (this.sim as TacSim).fires.at(-1);
        if (f) {
          this.fx.cloud(
            f.x,
            f.y,
            f.r,
            '#ff6a1a',
            () => (this.disposed || !(this.sim as TacSim).fires.includes(f) ? -1 : Math.min(1, (65 - f.t) / 4, f.t / 10)),
            true,
          );
          this.snd('fire', v.x, v.y, 0.8);
        }
        break;
      }
      case 'boom':
        fx.boom(v.x, 0.3, v.y, v.s ?? 0.6, v.col ?? '#ff9a3a');
        this.snd('boom', v.x, v.y, 0.5 + (v.s ?? 0.6) * 0.5);
        break;
      case 'recon':
        fx.ring(v.x, 0.1, v.y, '#8cff9a', 1, 12, 0.9);
        fx.burst(v.x, 1, v.y, '#8cff9a', 14, 5, 0.5, 0.2, { grav: 0 });
        this.snd('ping', v.x, v.y, 0.8);
        break;
      case 'trap':
        fx.ring(v.x, 0.1, v.y, '#ffe04a', 0.5, 4, 0.5);
        this.snd('ping', v.x, v.y, 0.7, 1.4);
        break;
      case 'wall': {
        const L: any = (this.sim as TacSim).walls.at(-1);
        if (L) {
          const len = Math.hypot(v.x1 - v.x0, v.y1 - v.y0);
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(len, 2.6, 0.5),
            new THREE.MeshStandardMaterial({
              color: this.cfg.teams[v.team].c1,
              emissive: new THREE.Color(this.cfg.teams[v.team].c1).multiplyScalar(0.5),
              transparent: true,
              opacity: 0.82,
              roughness: 0.2,
            }),
          );
          m.position.set((v.x0 + v.x1) / 2, 1.3, (v.y0 + v.y1) / 2);
          m.rotation.y = -Math.atan2(v.y1 - v.y0, v.x1 - v.x0);
          this.scene.add(m);
          this.wallsM.push({ w: L, m });
          this.snd('shield', v.x0, v.y0, 0.7, 0.7);
        }
        break;
      }
      case 'planting':
        this.snd('beep', this.cur[v.i].x, this.cur[v.i].y, 0.6);
        break;
      case 'planted':
        fx.ring(v.x, 0.1, v.y, '#ff4a3a', 0.4, 5, 0.7);
        this.sfx('planted', { vol: 0.8 });
        this.hall.excite(0.5);
        break;
      case 'beep':
        fx.light(v.x, 0.6, v.y, '#ff3a2a', 14, 0.12);
        fx.flare(v.x, 0.5, v.y, '#ff4a3a', 1.4, 0.12);
        this.snd('beep', v.x, v.y, 0.55);
        break;
      case 'defused':
        fx.ring(v.x, 0.1, v.y, '#6ac8ff', 0.4, 6, 0.8);
        this.sfx('defused', { vol: 0.8 });
        break;
      case 'explode':
        fx.boom(v.x, 0.3, v.y, 2.6, this.title === 'val' ? '#7ad0ff' : '#ff8a2a');
        fx.boom(v.x + 1.5, 0.3, v.y - 1, 1.4);
        fx.puff(v.x, 1, v.y, '#2e2a26', 24, 5, 3, 2, 7, 3);
        this.sfx('bigboom', { vol: 1 });
        fx.shake = 1.1;
        this.focus.set(v.x, 0, v.y);
        this.focusHold = 1.5;
        break;
      case 'round':
        this.snap();
        for (const c of C) {
          c.rig.die = 0;
        }
        this.sfx('round', { vol: 0.4 });
        this.score();
        break;
      case 'roundEnd':
        this.hall.excite(0.9, v.win);
        this.sfx('win', { vol: 0.55 });
        this.sfx('crowd', { vol: 0.8 });
        this.score();
        break;
      case 'clutch':
        this.hall.excite(1);
        this.sfx('crowd', { vol: 1 });
        break;
      case 'timeout':
        this.sfx('horn', { vol: 0.5 });
        break;
      case 'half':
        this.sfx('horn', { vol: 0.5 });
        break;
      case 'dash': {
        const a = this.cur[v.i];
        const fxx = v.fx ?? this.prev[v.i].x,
          fz = v.fy ?? this.prev[v.i].y;
        for (let q = 0; q < 6; q++)
          fx.burst(fxx + ((a.x - fxx) * q) / 5, 1, fz + ((a.y - fz) * q) / 5, v.col ?? '#bfe8ff', 3, 1.5, 0.4, 0.35, { grav: 0 });
        fx.tracer(fxx, 1, fz, a.x, 1, a.y, v.col ?? '#bfe8ff', 0.3, 0.25);
        this.snd('dash', a.x, a.y, 0.7);
        break;
      }
      case 'ult': {
        const a = this.cur[v.i];
        const look = heroLook(this.sim.actors[v.i].hero);
        const col = v.col ?? look?.glow ?? t1(v.i);
        C[v.i].rig.act = 'ult';
        C[v.i].rig.actT = 0;
        fx.ring(a.x, 0.1, a.y, col, 0.5, 6, 0.7);
        fx.burst(a.x, 1.5, a.y, col, 26, 8, 0.8, 0.35, { grav: 1 });
        fx.light(a.x, 2, a.y, col, 60, 0.6);
        this.sfx('ult', { vol: 0.7 * Math.min(1, this.vol(a.x, a.y) + 0.35), pan: this.pan(a.x) });
        this.hall.excite(0.4);
        if (v.u === 'domain') {
          const s: any = (this.sim as TacSim).smokes.at(-1);
          if (s) {
            this.addSmoke(s);
            fx.dome(col, s.r, s.t / TPS, new THREE.Vector3(s.x, 0, s.y));
          }
        }
        if (v.u === 'overdrive')
          fx.dome(col, 1.2, 1.2, new THREE.Vector3(a.x, 0.9, a.y), () => new THREE.Vector3(this.cur[v.i].x, 0.9, this.cur[v.i].y));
        if (v.u === 'barrage' || v.u === 'storm' || v.u === 'nova') {
          const z: any = (this.sim as ArenaSim).zones.at(-1);
          if (z) fx.dome(col, z.r, z.T / TPS, new THREE.Vector3(z.x, 0, z.y), undefined, 0.7);
        }
        break;
      }
      case 'revive': {
        const a = this.cur[v.i];
        fx.burst(a.x, 0.5, a.y, '#8affc0', 24, 3, 1, 0.3, { grav: 4 });
        fx.ring(a.x, 0.1, a.y, '#8affc0', 3, 0.6, 0.6);
        this.snd('heal', a.x, a.y, 0.9);
        break;
      }
      case 'shock': {
        for (let q = 1; q < 12; q++) {
          const x = v.x + Math.cos(v.dir) * q * (v.big ? 0.9 : 2),
            z = v.y + Math.sin(v.dir) * q * (v.big ? 0.9 : 2);
          fx.burst(x, 0.3, z, '#ffce7a', 5, 4, 0.5, 0.3, { grav: -8 });
          fx.puff(x, 0.2, z, '#8a7a66', 2, 1, 0.9, 0.7, 2);
        }
        if (v.big) fx.ring(v.x, 0.1, v.y, '#ffc86a', 1, 11, 0.5);
        fx.shake = Math.max(fx.shake, 0.5);
        this.snd('quake', v.x, v.y, 1);
        break;
      }
      case 'heal': {
        const a = this.cur[v.i];
        fx.burst(a.x, 0.6, a.y, v.col ?? '#7affa8', 8, 1.2, 0.8, 0.22, { grav: 3, drag: 1 });
        this.snd('heal', a.x, a.y, 0.35);
        break;
      }
      case 'healshot': {
        const p = this.muzzle(v.i),
          a = this.cur[v.t];
        fx.tracer(p.x, p.y, p.z, a.x, 1.3, a.y, v.col, 0.05, 0.16);
        fx.burst(a.x, 1, a.y, '#8affb0', 3, 1, 0.5, 0.18, { grav: 3 });
        break;
      }
      case 'shield': {
        const i = v.i;
        fx.dome(v.col ?? '#8ad0ff', 1.35 * C[i].scale, 1.5, new THREE.Vector3(), () =>
          this.sim.actors[i].alive ? new THREE.Vector3(C[i].root.position.x, 0.95 * C[i].scale, C[i].root.position.z) : null,
        );
        this.snd('shield', this.cur[i].x, this.cur[i].y, 0.5);
        break;
      }
      case 'beam': {
        let b = this.beamsM.get(v.i);
        if (!b) {
          const m = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true).rotateX(Math.PI / 2),
            new THREE.MeshBasicMaterial({
              color: '#ffe9a0',
              transparent: true,
              opacity: 0.7,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          this.scene.add(m);
          b = { m, t: 0 };
          this.beamsM.set(v.i, b);
        }
        b.t = 0.16;
        (b.m as any).to = v.t;
        (b.m.material as THREE.MeshBasicMaterial).color.set(v.heal ? '#ffe48a' : '#7ad0ff');
        break;
      }
      case 'swing':
        C[v.i].rig.act = 'attack';
        C[v.i].rig.actT = 0;
        {
          const a = this.cur[v.i];
          this.snd('swing', a.x, a.y, 0.5);
        }
        break;
      case 'pshot': {
        const p = this.muzzle(v.i);
        C[v.i].rig.recoil = 1;
        fx.flare(p.x, p.y, p.z, heroLook(this.sim.actors[v.i].hero)?.glow ?? '#fff', 0.8, 0.08);
        this.snd('pulse', p.x, p.z, 0.4, 0.8);
        break;
      }
      case 'bhit': {
        const a = this.cur[v.i];
        const b = this.sim.actors[v.i];
        fx.burst(a.x + Math.cos(b.dir) * 1.5, 1.2, a.y + Math.sin(b.dir) * 1.5, '#9adcff', 2, 2, 0.25, 0.18);
        break;
      }
      case 'bbreak': {
        const a = this.cur[v.i];
        fx.burst(a.x, 1.3, a.y, '#9adcff', 30, 7, 0.7, 0.25);
        this.snd('glass', a.x, a.y, 0.8);
        break;
      }
      case 'hook': {
        const p = this.muzzle(v.i);
        fx.tracer(p.x, p.y, p.z, v.fx, 1.2, v.fy, '#c8ced4', 0.08, 0.35);
        this.snd('hook', p.x, p.z, 0.8);
        break;
      }
      case 'cap':
      case 'checkpoint':
        fx.ring(this.objX(), 0.1, this.objZ(), this.cfg.teams[v.team].c1, 2, 14, 0.9);
        this.sfx('win', { vol: 0.5 });
        this.hall.excite(0.6, v.team);
        this.score();
        break;
      case 'spawn': {
        const a = this.cur[v.i];
        this.prev[v.i].x = a.x;
        this.prev[v.i].y = a.y;
        fx.burst(a.x, 0.6, a.y, t1(v.i), 14, 2, 0.8, 0.25, { grav: 4 });
        break;
      }
      case 'cast': {
        C[v.i].rig.act = v.u ? 'ult' : 'cast';
        C[v.i].rig.actT = 0;
        const a = this.cur[v.i];
        fx.burst(a.x, 1.7 * C[v.i].scale, a.y, v.col, v.u ? 16 : 6, 3, 0.5, 0.25, { grav: 1 });
        if (v.ak === 'aoe' || v.ak === 'stun' || v.ak === 'slow') if (v.r) fx.ring(v.x, 0.08, v.y, v.col, v.r, v.r * 0.9, 0.5);
        if (v.u && this.title === 'dota') {
          this.sfx('ult', { vol: 0.5 * this.vol(a.x, a.y) + 0.1, pan: this.pan(a.x) });
          fx.light(a.x, 2, a.y, v.col, 40, 0.5);
        } else this.snd('cast', a.x, a.y, 0.4);
        break;
      }
      case 'aoe': {
        const big = v.r > 4;
        fx.ring(v.x, 0.1, v.y, v.col, 0.4, v.r, 0.45);
        fx.burst(v.x, 0.6, v.y, v.col, big ? 44 : 18, big ? 9 : 6, 0.7, big ? 0.5 : 0.3, { grav: v.ak === 'heal' ? 3 : -5 });
        if (v.ak === 'aoe') {
          fx.light(v.x, 1.6, v.y, v.col, big ? 70 : 25, 0.35);
          fx.puff(v.x, 0.4, v.y, '#5a5048', big ? 10 : 3, 2, 1.2, 1, 2.6);
          if (big) {
            fx.shake = Math.max(fx.shake, 0.4);
            this.snd('quake', v.x, v.y, 0.8);
          } else this.snd('spell', v.x, v.y, 0.5);
        } else if (v.ak === 'stun') {
          for (let q = 0; q < 7; q++) {
            const a = q * 0.9;
            fx.burst(v.x + Math.cos(a) * v.r * 0.7, 0.2, v.y + Math.sin(a) * v.r * 0.7, v.col, 4, 5, 0.5, 0.25, { up: 2 });
          }
          this.snd('quake', v.x, v.y, 0.5, 1.3);
        }
        break;
      }
      case 'impact': {
        if (v.kind === 'spell') {
          fx.burst(v.x, 1.3, v.y, v.col ?? '#fff', 14, 5, 0.45, 0.3);
          fx.flare(v.x, 1.3, v.y, v.col ?? '#fff', 2, 0.15);
          this.snd('spell', v.x, v.y, 0.4);
        } else if (v.kind !== 'creep') fx.burst(v.x, 1.2, v.y, v.col ?? '#ffdba0', 3, 2.5, 0.25, 0.15);
        break;
      }
      case 'atk':
        C[v.i].rig.act = 'attack';
        C[v.i].rig.actT = 0.12;
        this.snd('swing', v.x, v.y, 0.28);
        break;
      case 'stun': {
        const a = this.cur[v.i];
        fx.burst(a.x, 2.4, a.y, '#ffe08a', 8, 2, 0.8, 0.2, { grav: 0 });
        break;
      }
      case 'tshot':
        fx.flare(v.x, 4.2, v.y, this.cfg.teams[v.team].c1, 1.6, 0.1);
        break;
      case 'lvl': {
        const a = this.cur[v.i];
        fx.burst(a.x, 0.4, a.y, '#ffe9a0', 10, 2, 0.8, 0.2, { grav: 5 });
        break;
      }
      case 'gold':
        fx.burst(v.x, 1.2, v.y, '#ffd24a', 3, 1.5, 0.6, 0.16, { grav: -3 });
        break;
      case 'tower': {
        const m = this.towerM.get(v.id);
        if (m) {
          m.g.visible = false;
          m.bar?.el.remove();
          m.bar = null;
        }
        fx.boom(v.x, 1, v.y, v.core ? 3 : 1.5, this.cfg.teams[v.team].c1);
        fx.puff(v.x, 1, v.y, '#7a7266', 22, 3.5, 2.6, 1.4, 5, 2);
        this.sfx(v.core ? 'bigboom' : 'boom', { vol: 0.9 });
        this.hall.excite(0.8);
        this.focus.set(v.x, 0, v.y);
        this.focusHold = 1.6;
        this.score();
        break;
      }
      case 'boss':
        fx.boom(v.x, 1, v.y, 1.6, '#ff5a3a');
        this.sfx('horn', { vol: 0.7 });
        this.hall.excite(0.8);
        break;
      case 'slam':
        fx.ring(v.x, 0.1, v.y, '#ff7a4a', 0.5, 3, 0.4);
        this.snd('quake', v.x, v.y, 0.4);
        break;
      case 'blind':
        C[v.i].flash = 1;
        break;
      case 'live':
        this.sfx('go', { vol: 0.5 });
        break;
    }
  }
  private objX() {
    const o = (this.sim as ArenaSim).objPos?.();
    return o ? o[0] : this.built.w / 2;
  }
  private objZ() {
    const o = (this.sim as ArenaSim).objPos?.();
    return o ? o[1] : this.built.h / 2;
  }
  private addSmoke(s: any) {
    if (this.smoked.has(s)) return;
    this.smoked.add(s);
    const T = this.sim as TacSim;
    const t0 = s.t;
    const col =
      s.kind === 'domain' ? this.cfg.teams[s.team].c1 : this.title === 'val' ? mixc('#cfd6dc', this.cfg.teams[s.team].c1, 0.35) : '#c9c7c0';
    let k = 0;
    this.fx.cloud(s.x, s.y, s.r, s.kind === 'domain' ? mixc('#1a1c2a', col, 0.35) : col, () => {
      if (this.disposed) return -1;
      if (!T.smokes.includes(s)) {
        k -= 0.03;
        if (k <= 0) {
          this.smoked.delete(s);
          return -1;
        }
        return k;
      }
      k = Math.min(1, (t0 - s.t) / 8, k + 0.06);
      return k;
    });
  }
  private lob(v: Ev) {
    const c = this.chars[v.i].root.position;
    const ax = c.x,
      az = c.z,
      T = v.T / TPS;
    let t = 0;
    const col =
      v.kind === 'flash'
        ? '#e8eef4'
        : v.kind === 'molly'
          ? '#ff8a3a'
          : v.kind === 'recon'
            ? '#8cff9a'
            : v.kind === 'he'
              ? '#6a7a4a'
              : '#b8bcc0';
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    this.scene.add(m);
    this.snd('throw', ax, az, 0.5);
    this.fx.persistent.push({
      k: m,
      obj: m,
      upd: dt => {
        t += dt * this.speed * (this.paused ? 0 : 1);
        const k = t / T;
        if (k >= 1 || this.disposed) {
          this.scene.remove(m);
          return false;
        }
        m.position.set(ax + (v.x - ax) * k, 1.6 * (1 - k) + Math.sin(k * Math.PI) * 4.2 + 0.15, az + (v.y - az) * k);
        return true;
      },
    });
  }
  private sim_grid() {
    return (this.sim as any).map.grid as import('../sim/grid.ts').Grid;
  }
  private fallDir: (number | null)[] = new Array(10).fill(null);
  /** Bodies fall backwards. Pick a heading with room behind, so nobody ends up lying inside a wall. */
  private fallRoom(i: number) {
    const g = this.sim_grid(),
      a = this.cur[i],
      c = this.chars[i];
    const len = 1.25 * c.scale;
    let best = -1,
      pick = c.root.rotation.y;
    for (let q = 0; q < 12; q++) {
      const yaw = c.root.rotation.y + (q % 2 ? -1 : 1) * Math.ceil(q / 2) * 0.524;
      // falling on the back: head lands at -forward, feet stay
      let free = 0;
      for (let d = 0.2; d <= len; d += 0.15) {
        const px = a.x - Math.sin(yaw) * d,
          pz = a.y - Math.cos(yaw) * d;
        if (g.depth(px, pz, 0.22) > 0.02) break;
        free = d;
      }
      let fwd = 0;
      for (let d = 0.1; d <= 0.75 * c.scale; d += 0.15) {
        if (g.depth(a.x + Math.sin(yaw) * d, a.y + Math.cos(yaw) * d, 0.2) > 0.02) break;
        fwd = d;
      }
      const s = Math.min(free, len) + Math.min(fwd, 0.7) * 0.9 - q * 0.02;
      if (s > best + 1e-6) {
        best = s;
        pick = yaw;
      }
    }
    this.fallDir[i] = pick;
  }
  private snap() {
    this.sim.actors.forEach((a, i) => {
      this.prev[i] = { x: a.x, y: a.y, dir: a.dir };
      this.cur[i] = { x: a.x, y: a.y, dir: a.dir };
    });
  }
  private score() {
    const [a, b] = this.cfg.teams;
    this.hall.drawScreen((g, w, h) => {
      g.fillStyle = '#0b141a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = a.c1;
      g.fillRect(0, 0, w / 2, 14);
      g.fillStyle = b.c1;
      g.fillRect(w / 2, 0, w / 2, 14);
      g.fillStyle = '#eaf3f2';
      g.textAlign = 'center';
      g.font = '900 120px "Anybody Variable", sans-serif';
      g.fillText(`${this.sim.score[0]}–${this.sim.score[1]}`, w / 2, 178);
      g.font = '800 38px "Anybody Variable", sans-serif';
      g.fillText(a.tag, w * 0.16, 62);
      g.fillText(b.tag, w * 0.84, 62);
      g.font = '600 22px "Sofia Sans Variable", sans-serif';
      g.fillStyle = '#a9c0c4';
      g.fillText(this.sim.phase(), w / 2, 232);
    });
  }
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private cc = new THREE.Color();
  update(dt: number, t: number) {
    this.T = t;
    const S = this.sim;
    if (!this.paused && !S.done) {
      this.acc += dt * TPS * this.speed;
      let n = 0;
      const lim = Math.ceil(this.speed) + 3;
      while (this.acc >= 1 && n < lim) {
        if (this.gate && !this.gate()) {
          this.acc = Math.min(this.acc, 1);
          break;
        }
        this.acc -= 1;
        this.tickOnce();
        n++;
        if (S.done) break;
      }
      if (this.acc > 3) this.acc = 0;
    }
    if (S.done && this.endT > 0) {
      const was = this.endT;
      this.endT += dt;
      if (was < 3.2 && this.endT >= 3.2) this.onDone?.();
    }
    const k = Math.min(1, this.acc);
    const low = this.e.q === 'low';
    const hpx = (this.h * this.e.r.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fx.update(this.paused ? 0 : dt * Math.min(2, Math.max(0.5, this.speed)), hpx);
    this.hall.update(dt, t);
    this.built.update?.(dt, t, S);
    // actors
    const ratio = Math.min(3, this.speed);
    S.actors.forEach((a, i) => {
      const p = this.prev[i],
        c = this.cur[i],
        ch = this.chars[i],
        R = ch.rig;
      const x = p.x + (c.x - p.x) * k,
        z = p.y + (c.y - p.y) * k;
      const dir = lerpAng(p.dir, c.dir, k);
      const spd = (Math.hypot(c.x - p.x, c.y - p.y) * TPS) / ch.scale;
      let face = Math.PI / 2 - dir;
      if (a.alive) this.fallDir[i] = null;
      else if (this.fallDir[i] !== null) face = this.fallDir[i]!;
      ch.root.position.set(x, 0, z);
      ch.root.rotation.y = lerpAng(ch.root.rotation.y, face, Math.min(1, dt * 18 * ratio));
      const mv = spd > 0.25 && a.alive;
      R.speed = mv && !this.paused ? Math.min(9, spd) : 0;
      if (mv) {
        const md = Math.atan2(c.y - p.y, c.x - p.x);
        let rel = -(md - dir);
        rel -= Math.round(rel / 6.283185) * 6.283185;
        R.moveAng += (rel - R.moveAng) * Math.min(1, dt * 12);
      }
      const map: Record<string, string> = {
        run: 'move',
        walk: 'move',
        idle: 'idle',
        aim: 'aim',
        shoot: 'shoot',
        dead: 'dead',
        plant: 'plant',
        stun: 'stun',
        blind: 'blind',
        attack: 'attack',
        cast: 'cast',
        ult: 'ult',
        throw: 'throw',
        shield: 'shield',
        shieldrun: 'shield',
      };
      const want = a.alive ? (map[a.anim] ?? 'idle') : 'dead';
      const hold =
        (R.act === 'attack' && R.actT < 0.5) ||
        (R.act === 'cast' && R.actT < 0.45) ||
        (R.act === 'ult' && R.actT < 0.7) ||
        (R.act === 'throw' && R.actT < 0.45);
      if (want === 'dead' || (!hold && R.act !== want && !(R.act === 'attack' && want === 'attack'))) {
        if (R.act !== want) R.actT = 0;
        R.act = want as any;
      }
      // keep the weapon out of walls: the closer the wall ahead, the more it is tucked upright
      const reach = 1.15 * ch.scale * 0.72;
      const free = a.alive ? this.sim_grid().ray(x, z, x + Math.cos(dir) * reach, z + Math.sin(dir) * reach) : 1;
      R.tuck += ((free < 1 ? 1 - free * 0.6 : 0) - R.tuck) * Math.min(1, dt * 10);
      if (want === 'attack' && R.act === 'attack' && R.actT > 0.5 && (a as any).atkT > 3) R.actT = 0;
      if (this.title === 'cs2' || this.title === 'val') {
        const w = (a as any).w as string;
        const l = heroLook(a.hero);
        const tm = this.cfg.teams[a.team];
        ch.setWeapon(w, l?.c1 ?? tm.c1, l?.c2 ?? tm.c2, l?.glow ?? tm.c1);
      }
      const near = Math.hypot(x - this.camTs.x, z - this.camTs.z) < this.camDs * 1.1;
      if (near || !low || (this.frame + i) % 3 === 0)
        ch.update(this.paused ? 0 : dt * Math.min(2.2, Math.max(0.6, this.speed * (near || !low ? 1 : 3))), t);
      const ring = this.rings[i];
      ring.position.set(x, 0.045, z);
      (ring.material as THREE.MeshBasicMaterial).opacity = a.alive ? (this.followI === i && this.mode === 'follow' ? 1 : 0.85) : 0;
      ch.mesh.visible = a.alive || this.title === 'cs2' || this.title === 'val' || R.die < 0.98 || (a as any).respawn > 40;
      ch.root.visible = ch.mesh.visible;
      const f = a as any;
      if (this.title !== 'cs2') ch.mat.uniformsX.uGlow.value = f.nano > 0 || f.od > 0 ? 4 : 1.6;
      // barrier
      if (f.barrierOn !== undefined) {
        let b = this.barriers.get(i);
        if (f.barrierOn && a.alive) {
          if (!b) {
            const g = new THREE.CylinderGeometry(2.6, 2.6, 2.7, 18, 1, true, -0.72, 1.44);
            b = new THREE.Mesh(
              g,
              new THREE.MeshBasicMaterial({
                color: '#8ad4ff',
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
              }),
            );
            this.scene.add(b);
            this.barriers.set(i, b);
          }
          b.visible = true;
          b.position.set(x - Math.sin(face) * 1.0, 1.35, z - Math.cos(face) * 1.0);
          b.rotation.y = face;
          (b.material as THREE.MeshBasicMaterial).opacity = 0.16 + (0.26 * f.barrier) / 700 + Math.sin(t * 9) * 0.02;
          (b.material as THREE.MeshBasicMaterial).color.set(f.barrier < 220 ? '#ff8a6a' : '#8ad4ff');
        } else if (b) b.visible = false;
      }
    });
    this.frame++;
    let bi = 0;
    for (let i = 0; i < 10; i++) {
      const a = S.actors[i];
      const c = this.chars[i];
      const s = a.alive ? 1.5 * c.scale : 0;
      this.m4.makeScale(s, 1, s).setPosition(c.root.position.x, 0.03, c.root.position.z);
      this.blobs.setMatrixAt(bi++, this.m4);
    }
    if (this.title === 'dota') bi = this.drawMoba(dt, t, k, bi);
    this.m4.makeScale(0, 0, 0);
    const used = bi;
    for (; bi < 110; bi++) this.blobs.setMatrixAt(bi, this.m4);
    this.blobs.count = Math.max(1, used);
    this.blobs.instanceMatrix.needsUpdate = true;
    if (this.bombM) {
      const b = (S as TacSim).bomb;
      this.bombM.visible = b.state !== 'done';
      const held = b.state === 'held';
      const c = held ? this.chars[b.by] : null;
      if (c) {
        const d = c.root.rotation.y;
        this.bombM.position.set(c.root.position.x - Math.sin(d) * 0.34, 1.55, c.root.position.z - Math.cos(d) * 0.34);
        this.bombM.rotation.set(1.5, d, 0, 'YXZ');
        this.bombM.scale.setScalar(0.8);
      } else {
        this.bombM.position.set(b.x, 0.02, b.y);
        this.bombM.rotation.set(0, 0.4, 0);
        this.bombM.scale.setScalar(1.5);
      }
    }
    if (this.projI && this.title === 'ow') {
      const L = (S as ArenaSim).projs;
      let n = 0;
      for (const p of L) {
        if (n >= 80) break;
        const s = p.kind === 'rocket' ? 1.5 : 1;
        this.m4.makeScale(s, s, s).setPosition(p.x + p.dx * p.sp * (k - 1), 1.3, p.y + p.dy * p.sp * (k - 1));
        this.projI.setMatrixAt(n, this.m4);
        this.projI.setColorAt(n, this.cc.set(p.col).multiplyScalar(1.6));
        n++;
        if (p.kind === 'rocket' && this.frame % 2 === 0) this.fx.puff(p.x, 1.3, p.y, '#9a948c', 1, 0.3, 0.7, 0.3, 1);
        else if (this.frame % 3 === 0) this.fx.burst(p.x, 1.3, p.y, p.col, 1, 0.5, 0.25, 0.2, { grav: 0 });
      }
      this.projI.count = n;
      this.projI.instanceMatrix.needsUpdate = true;
      if (this.projI.instanceColor) this.projI.instanceColor.needsUpdate = true;
    }
    for (const [i, b] of this.beamsM) {
      b.t -= dt;
      b.m.visible = b.t > 0;
      if (b.t > 0) {
        const A = this.muzzle(i),
          q = this.chars[(b.m as any).to].root.position;
        const B = this.v3.set(q.x, 1.25, q.z);
        b.m.position.copy(A).add(B).multiplyScalar(0.5);
        b.m.lookAt(B);
        b.m.scale.set(1 + Math.sin(t * 20) * 0.2, 1, A.distanceTo(B));
      }
    }
    for (let i = this.wallsM.length - 1; i >= 0; i--) {
      const w = this.wallsM[i];
      if (!(S as TacSim).walls.includes(w.w)) {
        this.scene.remove(w.m);
        w.m.geometry.dispose();
        this.wallsM.splice(i, 1);
        this.fx.burst(w.m.position.x, 1, w.m.position.z, '#cfe8ff', 14, 4, 0.6, 0.3);
      }
    }
    if (low) {
      const W = this.built.w,
        H = this.built.h,
        m = this.camDs * 0.62;
      const vis = this.camTs.x - m < 0 || this.camTs.x + m > W || this.camTs.z - m * 1.2 < 0;
      for (const o of this.hall.far)
        o.visible = this.e.software ? this.mode === 'arena' || this.endT > 0 || this.camDs > 95 : vis && this.camDs > 34;
    }
    const pf = low ? 4 : 2;
    this.hall.people.forEach((p, i) => {
      if ((this.frame + i) % pf === 0 && (this.camDs > 40 || i % 6 < 5)) {
        if (this.endT > 0) {
          const won = S.result().winner;
          p.rig.act = i < 6 === (won === 0) ? (i % 6 === 5 ? 'cheer' : 'cheer') : i % 6 === 5 ? 'idle' : 'slump';
        }
        p.update(dt * pf, t);
      }
    });
    this.director(dt);
    this.drawLabels(k);
  }
  private frame = 0;
  private drawMoba(dt: number, t: number, k: number, bi: number): number {
    const s = this.sim as MobaSim;
    const cnt = [0, 0];
    for (const c of s.creeps) {
      if (!c.alive) continue;
      const q = c.ranged ? 1 : 0,
        im = this.creepM[q];
      if (cnt[q] >= 70) continue;
      const i = cnt[q]++;
      const p = this.creepPrev.get(c.id);
      const x = p ? p[0] + (c.x - p[0]) * k : c.x,
        z = p ? p[1] + (c.y - p[1]) * k : c.y;
      const sc = c.mega ? 1.35 : 1.05;
      this.m4
        .makeRotationY(Math.PI / 2 - c.dir)
        .scale(this.v3.set(sc, sc, sc))
        .setPosition(x, 0, z);
      im.setMatrixAt(i, this.m4);
      im.setColorAt(i, this.cc.set(this.cfg.teams[c.team].c1).lerp(new THREE.Color('#ffffff'), 0.12));
      (im.geometry.attributes.ip as THREE.InstancedBufferAttribute).setX(i, (c.id * 0.37) % 1);
      (im.geometry.attributes.ia as THREE.InstancedBufferAttribute).setX(i, c.anim === 'attack' ? 1 : 0);
      if (bi < 108) {
        this.m4.makeScale(1.2, 1, 1.2).setPosition(x, 0.025, z);
        this.blobs.setMatrixAt(bi++, this.m4);
      }
    }
    this.creepM.forEach((im, q) => {
      im.count = cnt[q];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.geometry.attributes.ip.needsUpdate = true;
      im.geometry.attributes.ia.needsUpdate = true;
      (im.material as any).userData.U.uT.value += this.paused ? 0 : dt * Math.min(2, this.speed);
    });
    let n = 0;
    for (const p of s.projs) {
      if (n >= 80) break;
      const big = p.kind === 'spell' ? 1.7 : p.kind === 'tower' ? 1.6 : p.kind === 'creep' ? 0.55 : 0.9;
      const col = p.col ?? (p.kind === 'tower' ? this.cfg.teams[(p.by as any).team].c1 : '#ffe0a0');
      this.m4.makeScale(big, big, big).setPosition(p.x, p.kind === 'tower' ? 2.4 : 1.4, p.y);
      this.projI!.setMatrixAt(n, this.m4);
      this.projI!.setColorAt(n, this.cc.set(col).multiplyScalar(1.6));
      n++;
      if (p.kind === 'spell' && !this.paused) this.fx.burst(p.x, 1.4, p.y, col, 1, 0.6, 0.4, 0.4, { grav: 0 });
    }
    this.projI!.count = n;
    this.projI!.instanceMatrix.needsUpdate = true;
    if (this.projI!.instanceColor) this.projI!.instanceColor.needsUpdate = true;
    s.camps.forEach((c, i) => {
      const g = this.campM[i];
      g.visible = c.hp > 0;
      g.position.y = Math.abs(Math.sin(t * 2 + i)) * 0.04;
    });
    const b = s.boss,
      bc = this.bossC!;
    bc.root.visible = b.alive;
    if (b.alive) {
      bc.root.position.set(b.x, 0, b.y);
      bc.root.rotation.y = lerpAng(bc.root.rotation.y, Math.PI / 2 - b.dir, dt * 4);
      const hit = b.ac > 9;
      if (hit && bc.rig.act !== 'attack') {
        bc.rig.act = 'attack';
        bc.rig.actT = 0;
        bc.rig.hold = 'hammer';
      } else if (!hit) bc.rig.act = 'idle';
      bc.update(dt, t);
    }
    for (const w of s.towers) {
      const m = this.towerM.get(w.id)!;
      if (!w.alive) continue;
      m.glow.rotation.y += dt * 0.8;
      m.glow.position.y = Math.sin(t * 1.5 + w.id) * 0.08;
    }
    return bi;
  }
  private director(dt: number) {
    const S = this.sim,
      W = this.built.w,
      H = this.built.h;
    let tx = this.camTs.x,
      tz = this.camTs.z,
      d = 60;
    this.focusHold -= dt;
    const al = S.actors.filter(a => a.alive);
    if (this.mode === 'top') {
      tx = W / 2;
      tz = H / 2 + 1;
      const asp = this.camera.aspect;
      d = this.title === 'dota' ? 158 : Math.max(W / asp, H) * 1.62;
    } else if (this.mode === 'arena') {
      tx = W / 2;
      tz = H / 2;
      d = Math.max(W, H) * 1.75;
    } else if (this.mode === 'follow') {
      const p = this.chars[this.followI]?.root.position;
      if (p) {
        tx = p.x;
        tz = p.z;
      }
      d = this.camD = Math.min(this.camD, 46);
      if (this.camD > 40) this.camD = 26;
      d = this.camD;
    } else if (this.mode === 'free') {
      tx = this.camT.x;
      tz = this.camT.z;
      d = this.camD;
    } else {
      const o = (S as any).objPos?.() as [number, number] | undefined;
      const moba = this.title === 'dota';
      let top = -1,
        ti = -1;
      this.anchorT += dt;
      for (let i = 0; i < S.actors.length; i++) {
        const a = S.actors[i];
        if (!a.alive) continue;
        let w = 0.05;
        for (const b of al)
          if (b.team !== a.team) {
            const dd = Math.hypot(a.x - b.x, a.y - b.y);
            if (dd < 22) w += (22 - dd) * 0.05;
          }
        if (a.anim === 'shoot' || a.anim === 'cast' || a.anim === 'ult') w += 1.6;
        if (a.hp < a.maxHp * 0.4) w += 0.3;
        if (i === this.anchorI) w = w * 1.5 + 0.12;
        if (w > top) {
          top = w;
          ti = i;
        }
      }
      // one fight at a time: hold an anchor player, switch only when something clearly hotter happens elsewhere
      if (
        ti >= 0 &&
        (this.anchorI < 0 || !S.actors[this.anchorI]?.alive || (ti !== this.anchorI && this.anchorT > 2.2) || this.anchorT > 14)
      ) {
        if (top < 0.4 && this.anchorT > 8 && moba) ti = al[Math.floor(this.T * 7) % al.length].i;
        this.anchorI = ti;
        this.anchorT = 0;
      }
      const A = S.actors[Math.max(0, this.anchorI)];
      const calm = top < 0.4 && !moba;
      const R = calm ? 99 : moba ? 17 : 20;
      let sx = A.x * 1.5,
        sz = A.y * 1.5,
        sw = 1.5;
      const L: typeof al = [];
      for (const a of al)
        if (Math.hypot(a.x - A.x, a.y - A.y) < R) {
          sx += a.x;
          sz += a.y;
          sw++;
          L.push(a);
        }
      if (this.bombM) {
        const b = (S as TacSim).bomb;
        if (b.state === 'plant') {
          sx += b.x * 3;
          sz += b.y * 3;
          sw += 3;
        }
      }
      if (o) {
        const near = Math.hypot(A.x - o[0], A.y - o[1]) < 24;
        if (near || calm) {
          sx += o[0] * 4;
          sz += o[1] * 4;
          sw += 4;
        }
      }
      tx = sx / sw;
      tz = sz / sw;
      if (this.focusHold > 0 && Math.hypot(this.focus.x - tx, this.focus.z - tz) < 40) {
        tx = tx * 0.5 + this.focus.x * 0.5;
        tz = tz * 0.5 + this.focus.z * 0.5;
      }
      let spread = 0;
      for (const a of L) spread += Math.hypot(a.x - tx, a.y - tz);
      spread = L.length ? spread / L.length : 8;
      d = Math.min(calm ? 52 : moba ? 38 : 40, (moba ? 22 : 20) + spread * 1.2);
      const ph = (S as any).ph;
      if (ph === 'freeze' || ph === 'ready' || ph === 'break') {
        const pr = Math.min(1, this.camDs / 70);
        tx = W / 2;
        tz = H / 2;
        d = Math.max(W / this.camera.aspect, H) * 1.3 + pr;
      }
      tx = Math.max(12, Math.min(W - 12, tx));
      tz = Math.max(9, Math.min(H - 7, tz));
    }
    if (S.done) {
      d *= 0.9;
      this.yaw += dt * 0.05;
    }
    const kk = 1 - Math.exp(-dt * (this.mode === 'free' ? 14 : this.mode === 'follow' ? 6 : 1.7));
    this.camTs.x += (tx - this.camTs.x) * kk;
    this.camTs.z += (tz - this.camTs.z) * kk;
    this.camDs += (d - this.camDs) * (1 - Math.exp(-dt * (this.mode === 'free' ? 12 : 1.6)));
    const want = this.mode === 'top' ? 1.28 : this.mode === 'arena' ? 0.5 : this.mode === 'free' ? this.pitch : 0.98;
    this.pitchS += (want - this.pitchS) * (1 - Math.exp(-dt * 3));
    const sh = this.fx.shake;
    const y = this.yaw + (this.mode === 'arena' ? Math.sin(this.T * 0.08) * 0.5 : Math.sin(this.T * 0.05) * 0.03);
    const cp = Math.cos(this.pitchS),
      sp = Math.sin(this.pitchS);
    this.camera.position.set(
      this.camTs.x + Math.sin(y) * cp * this.camDs + (Math.random() - 0.5) * sh,
      sp * this.camDs + (Math.random() - 0.5) * sh,
      this.camTs.z + Math.cos(y) * cp * this.camDs,
    );
    this.camera.lookAt(this.camTs.x, 0.4, this.camTs.z);
    this.insS += (this.insetB - this.insS) * Math.min(1, dt * 5);
    this.camera.setViewOffset(this.e.w, this.e.h, 0, this.insS / 2 - 18, this.e.w, this.e.h);
  }
  private pitchS = 0.6;
  private anchorI = -1;
  private anchorT = 0;
  insetB = 0;
  private insS = 0;
  private drawLabels(k: number) {
    const w = this.overlay.clientWidth,
      h = this.overlay.clientHeight;
    const v = this.v3;
    const small = this.camDs > 78;
    S: for (let i = 0; i < this.sim.actors.length; i++) {
      const a = this.sim.actors[i],
        L = this.labels[i],
        c = this.chars[i];
      if (!a.alive) {
        L.el.style.display = 'none';
        continue S;
      }
      v.set(c.root.position.x, 2.25 * c.scale, c.root.position.z).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        L.el.style.display = 'none';
        continue;
      }
      L.el.style.display = '';
      L.el.style.transform = `translate(${(((v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - v.y) / 2) * h).toFixed(1)}px) translate(-50%,-100%)`;
      L.el.classList.toggle('sm', small);
      const f = a as any;
      const hp = Math.max(0, a.hp / a.maxHp);
      if ((L as any).p !== hp) {
        L.hp.style.width = (hp * 100).toFixed(0) + '%';
        (L as any).p = hp;
      }
      const sh = f.shield ? Math.min(1, f.shield / a.maxHp) : 0;
      if ((L as any).s !== sh) {
        L.sh.style.width = (sh * 100).toFixed(0) + '%';
        (L as any).s = sh;
      }
      if (this.title === 'dota' && (L as any).l !== f.lvl) {
        (L as any).l = f.lvl;
        L.extra.textContent = `${f.lvl} ${a.nick}`;
      }
    }
    void k;
    if (this.title === 'dota')
      for (const t of (this.sim as MobaSim).towers) {
        const m = this.towerM.get(t.id);
        if (!m?.bar) continue;
        v.set(t.x, m.y, t.y).project(this.camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
          m.bar.el.style.display = 'none';
          continue;
        }
        m.bar.el.style.display = '';
        m.bar.el.style.transform = `translate(${(((v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - v.y) / 2) * h).toFixed(1)}px) translate(-50%,-100%)`;
        m.bar.hp.style.width = ((t.hp / t.maxHp) * 100).toFixed(0) + '%';
      }
  }
  /** finish instantly */
  fastForward() {
    let n = 0;
    const onS = this.onStep;
    while (!this.sim.done && n++ < 120000) {
      if (this.gate && !this.gate()) break;
      this.preStep?.();
      this.sim.step();
      const keep = this.sim.ev.filter(e => e.k === 'kill' || e.k === 'roundEnd' || e.k === 'say');
      onS?.(keep);
    }
    this.snap();
    this.score();
    if (this.sim.done) {
      this.endT = 3.1;
    }
  }
  dispose() {
    this.disposed = true;
    this.unhook();
    this.labels.forEach(l => l.el.remove());
    this.towerM.forEach(t => t.bar?.el.remove());
    this.chars.forEach(c => c.dispose());
    this.hall.dispose();
    disposeScene(this.scene);
    this.topRt?.dispose();
    TOP.size.value.set(0, 0);
    TOP.tex.value = null;
  }
}
export { shade, softTex, OW_BY, PAL };
export type { Hero, Creep, Fig };
