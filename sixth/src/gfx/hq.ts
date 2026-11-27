/** The headquarters: a living dollhouse drawn from the plan. People follow the weekly schedule on foot, around walls and furniture. */
import * as THREE from 'three';
import { disposeScene, LOWU, type Engine, type View } from './engine.ts';
import { Kit, mixc, shade } from './kit.ts';
import { Character, civHead, CLOTH, civPalette, resetCharMaterials } from './character.ts';
import { noise2, blobTex } from './tex.ts';
import type { Block } from '../data/club.ts';
import type { G, Room, Squad, Staff } from '../game/types.ts';
import { Draft, gate, roomsOf, size, status, type HQ, type Item, type Regions, type RoomStatus } from '../game/build.ts';
import { FURN } from '../data/furniture.ts';
import { mine } from '../game/events.ts';
import { dow } from '../game/day.ts';
import { Rng } from '../core/rng.ts';
import type { TitleId } from '../data/titles.ts';
import { Nav, spotsOf, Walker, type Spot } from './hqnav.ts';
import { HouseLife } from './hqlife.ts';
import { away } from '../game/life.ts';
import { seatsOf } from '../game/seats.ts';
import { clearFurniture, foliage, furniture } from './furniture3d.ts';
import { Baker } from './bake.ts';
import { specOf, type Wear } from './look.ts';
import { detailTex } from './surface.ts';
import { dressing, floorCanvas, floorRough, geoOf, Heights, place, stuff, TALL, walls, type Seg, type WallMode } from './house.ts';
export interface Person {
  id: string;
  c: Character;
  w: Walker;
  staff?: Staff;
  title?: TitleId;
  slot: number;
  nick: string;
  /** walked out: heads for the street and is gone for the day */
  gone?: boolean;
}
/** What the editor wants drawn on top of the plan. */
export type Ghost =
  | { k: 'rect'; x: number; y: number; w: number; h: number; col: string; op?: number; tall?: number }
  | { k: 'tiles'; map: Int16Array; id: number; mw: number; col: string; op?: number }
  | { k: 'edges'; list: ['v' | 'h', number, number][]; col: string; tall?: number }
  | { k: 'items'; list: Item[]; ok: boolean }
  | { k: 'box'; it: Item; col: string };
export interface Tool {
  /** return false to let the camera have the drag */
  down(p: Pt, ev: PointerEvent): boolean;
  move(p: Pt, dragging: boolean): void;
  up(p: Pt, ev: PointerEvent): void;
  cancel(): void;
}
export interface Pt {
  x: number;
  z: number;
  sx: number;
  sy: number;
}
const SV = `attribute vec2 uv2x; varying vec2 vU; varying float vS; void main(){ vU=uv; vS=uv2x.x; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const SF = `varying vec2 vU; varying float vS; uniform float uT; uniform vec3 uC; uniform float uOn; float h(vec2 p){return fract(sin(dot(p,vec2(12.9,78.2)))*43758.5);} void main(){ vec2 u=vU; float t=uT*0.6+vS*17.0; vec2 cam=vec2(sin(t*0.7)*2.0+t*0.4,cos(t*0.5)); vec2 g=floor(u*vec2(9.0,5.0)+cam); float n=h(g); vec3 base=mix(vec3(0.10,0.16,0.20),vec3(0.42,0.36,0.27),n); base=mix(base,vec3(0.25,0.42,0.5),step(0.62,u.y)*0.8); vec2 e=abs(u-vec2(0.5+sin(t*1.9)*0.18,0.5+cos(t*2.3)*0.1)); base=mix(base,uC,step(e.x,0.035)*step(e.y,0.09)); float cr=step(abs(u.x-0.5),0.006)*step(abs(u.y-0.5),0.05)+step(abs(u.y-0.5),0.01)*step(abs(u.x-0.5),0.03); base+=cr; base=mix(base,vec3(0.9),step(u.y,0.09)*step(0.06,u.y)*step(u.x,0.22)); base=mix(base,vec3(0.03,0.06,0.08),step(0.76,u.x)*step(0.72,u.y)); base=mix(base,uC,step(length(u-vec2(0.88+sin(t)*0.05,0.86+cos(t*1.3)*0.06)),0.018)); float fl=step(0.97,h(vec2(floor(t*6.0),vS))); if(uOn>1.5){ float st=h(floor(u*vec2(90.0,50.0))+floor(uT*14.0)); base=vec3(0.03,0.05,0.07)+st*0.05; vec2 q=abs(u-0.5); base=mix(base,vec3(0.85,0.35,0.25),step(q.x,0.16)*step(q.y,0.02)+step(abs(u.y-0.5),0.0)); } float onk=uOn>1.5?1.0:uOn; gl_FragColor=vec4((base*1.15+fl*0.3)*onk,1.0);
#include <colorspace_fragment>
}`;
export class HQView implements View {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.5, 260);
  exposure = 0.86;
  bloom = 0.55;
  fps = 0;
  private gGround = new THREE.Group();
  private gFloor = new THREE.Group();
  private gWalls = new THREE.Group();
  private gItems = new THREE.Group();
  private gOver = new THREE.Group();
  /** moving pictures on screens, the crest: drawn live */
  private gOver2 = new THREE.Group();
  private gCars = new THREE.Group();
  /** on the lowest setting the still parts live twice: plain in the scene, in full in here, and the full ones are baked into a picture */
  readonly soft: boolean;
  ratio = 1;
  private beauty = new THREE.Scene();
  private bGround = new THREE.Group();
  private bFloor = new THREE.Group();
  private bWalls = new THREE.Group();
  private bItems = new THREE.Group();
  private bSun = new THREE.DirectionalLight('#fff', 2.4);
  private bHemi = new THREE.HemisphereLight('#dfe9f2', '#8a7a66', 1);
  private bLamps: THREE.PointLight[] = [];
  private baker: Baker | null = null;
  private lowRt: THREE.WebGLRenderTarget | null = null;
  private dirty = true;
  private bakedTod = -1;
  private lastCam = new THREE.Matrix4();
  private still = 0;
  private floorCv = document.createElement('canvas');
  private floorMesh: THREE.Mesh | null = null;
  spots: Spot[] = [];
  people = new Map<string, Person>();
  private walkers: Walker[] = [];
  private W = 16;
  private H = 12;
  plan: HQ | null = null;
  private d!: Draft;
  private R!: Regions;
  private st: RoomStatus[] = [];
  private rooms: Room[] = [];
  private segs: Seg[] = [];
  private tops = new Map<string, [number, number]>();
  private heights!: Heights;
  nav!: Nav;
  private gate: [number, number] = [0, 0];
  private box: [number, number, number, number] = [0, 0, 16, 12];
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lamps: THREE.PointLight[] = [];
  private tod = 0.3;
  todTarget = 0.35;
  private scrU = { uT: { value: 0 }, uC: { value: new THREE.Color('#f55') }, uOn: { value: 1 } };
  private hl: THREE.Mesh;
  private hlId = -2;
  private g!: G;
  private sig = '';
  private psig = '';
  private dsig = '';
  private camTs = new THREE.Vector3();
  private camDs = 60;
  yaw = 0.62;
  private yawS = 0.62;
  private pitch = 0.86;
  private pitchS = 0.86;
  top = false;
  wallMode: WallMode = 'cut';
  private quad = -1;
  focus: string | null = null;
  private insetR = 0;
  private insetB = 0;
  private w = 1;
  private h = 1;
  private drag: { x: number; y: number; b: number; moved: boolean; tool: boolean } | null = null;
  onPick: ((r: Room | null) => void) | null = null;
  onPerson: ((id: string) => void) | null = null;
  onHover: ((r: Room | null, x: number, y: number) => void) | null = null;
  /** set while the editor is open */
  tool: Tool | null = null;
  editing = false;
  private ptr = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  block = 0;
  private cycle = 0;
  auto = true;
  timeScale = 1;
  shirts: Record<string, THREE.Texture> = {};
  shirtOf: ((pid: string) => THREE.Texture | null) | null = null;
  private cars: { m: THREE.Group; x: number; v: number; z: number }[] = [];
  private blobs: THREE.InstancedMesh;
  private frame = 0;
  private unhook: (() => void) | null = null;
  crestTex: THREE.Texture | null = null;
  private userZoom = 1;
  private panX = 0;
  private panZ = 0;
  private keys = new Set<string>();
  private lampAt: THREE.Vector3[] = [];
  life!: HouseLife;
  /** a power cut: 1 is total */
  dark = 0;
  private darkS = 0;
  icon: (name: string) => string = () => '';
  get stillScene() {
    return this.soft ? this.beauty : null;
  }
  get gameState() {
    return this.g;
  }
  get zoom() {
    return this.camDs;
  }
  get planBox() {
    return this.box;
  }
  get planKey() {
    return this.sig.length + ':' + (this.plan?.items.length ?? 0) + ':' + this.W;
  }
  touch() {
    this.dirty = true;
  }
  plainMat() {
    return this.vc();
  }
  fineMat() {
    return this.vcFine();
  }
  scrMode(m: number) {
    this.scrU.uOn.value = m;
  }
  /** bounds of the first room of a kind */
  boxOf(type: string): [number, number, number, number] | null {
    const r = this.rooms.find(x => x.type === type) ?? this.rooms.find(x => x.type === 'practice');
    return r ? [r.x, r.y, r.w, r.h] : null;
  }
  /** points on the floor of a room where something may lie, the same every time */
  freeSpots(r: Room, n: number): [number, number][] {
    const out: [number, number][] = [];
    const z = this.plan!.zones.find(q => q.id === r.id);
    if (!z || !this.nav) return out;
    const id = this.R.map[z.y * this.W + z.x];
    const R = Rng.of('mess' + r.id);
    for (let i = 0; i < n * 8 && out.length < n; i++) {
      const x = r.x + 0.25 + R.f() * (r.w - 0.5),
        y = r.y + 0.25 + R.f() * (r.h - 0.5);
      if (this.R.map[Math.floor(y) * this.W + Math.floor(x)] === id && this.nav.ok(x, y, 0.16)) out.push([x, y]);
    }
    return out;
  }
  headOf(p: Person): [number, number, boolean] {
    const y = p.w.state === 'in' ? (p.w.spot?.act === 'lie' ? 0.95 : 1.5) : 1.92;
    const v = new THREE.Vector3(p.w.x, y, p.w.z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h, v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1];
  }
  constructor(public e: Engine) {
    resetCharMaterials();
    clearFurniture();
    this.soft = e.q === 'low';
    Kit.q = e.software ? 0.6 : 1;
    const low = this.soft;
    if (this.soft) {
      this.baker = new Baker(e.r);
      this.beauty.environment = e.env;
      this.beauty.environmentIntensity = 0.4;
      this.beauty.add(this.bGround, this.bFloor, this.bWalls, this.bItems, this.bSun, this.bSun.target, this.bHemi);
      this.bSun.castShadow = true;
      const q = this.bSun.shadow;
      q.mapSize.set(2048, 2048);
      q.bias = -0.0005;
      q.normalBias = 0.02;
      for (let i = 0; i < 5; i++) {
        const l = new THREE.PointLight('#ffcf8f', 0, 10, 1.6);
        this.bLamps.push(l);
        this.beauty.add(l);
      }
    }
    this.scene.add(this.gGround, this.gFloor, this.gWalls, this.gItems, this.gOver, this.gOver2, this.gCars);
    this.sun = new THREE.DirectionalLight('#fff', 2.4);
    if (!low) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(e.rich ? 2048 : 1280, e.rich ? 2048 : 1280);
      s.bias = -0.0005;
      s.normalBias = 0.02;
    }
    this.hemi = new THREE.HemisphereLight('#dfe9f2', '#8a7a66', 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    if (!low)
      for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight('#ffcf8f', 0, 11, 1.5);
        this.lamps.push(l);
        this.scene.add(l);
      }
    this.hl = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: '#ffb23e', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
    );
    this.hl.visible = false;
    this.hl.renderOrder = 3;
    this.scene.add(this.hl);
    this.blobs = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.8 }),
      80,
    );
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.scene.add(this.blobs);
    this.fps = e.software ? 20 : 0;
    this.ratio = e.software ? 1 : Math.min(1.25, devicePixelRatio);
    this.life = new HouseLife(this);
  }
  /** materials live as long as the view, so that editing never recompiles a shader */
  private mats = new Map<string, THREE.Material>();
  private mat<T extends THREE.Material>(k: string, f: () => T): T {
    let m = this.mats.get(k) as T | undefined;
    if (!m) this.mats.set(k, (m = f()));
    return m;
  }
  private vc() {
    return this.mat('vc', () => this.e.mat({ vc: true, rough: 0.78 }) as THREE.Material);
  }
  private vcFine() {
    return this.mat('vcf', () => this.e.mat({ vc: true, std: true }) as THREE.Material);
  }
  private glowMat(v: number) {
    return this.mat(
      'glow' + v,
      () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(v, v, v) }),
    );
  }
  private wipe(g: THREE.Group) {
    g.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    g.clear();
  }
  // ---------- building
  sync(g: G) {
    this.g = g;
    const c = g.club;
    const q = g.hq;
    const sig = [
      g.site,
      c.c1,
      c.c2,
      c.c3,
      g.trophies.length,
      q.w,
      q.floor,
      q.wv,
      q.wh,
      q.pv,
      q.ph,
      q.items.map(i => i.id + i.f + i.x + ',' + i.y + i.r).join('|'),
      q.zones.map(z => z.type + z.x + ',' + z.y + (z.title ?? '')).join('|'),
      Object.values(g.squads)
        .map(s => s!.stations.map(x => Object.values(x.m).join('')).join())
        .join(),
    ].join('#');
    if (!this.editing && (sig !== this.sig || this.plan !== q)) {
      const first = !this.sig;
      if (sig !== this.sig || !this.plan) {
        this.sig = sig;
        this.show(q, g.rooms);
        this.settle();
        if (first) {
          this.camDs = this.fit() * 1.5;
          this.camTs.set((this.box[0] + this.box[2]) / 2, 0, (this.box[1] + this.box[3]) / 2);
        }
      } else this.plan = q;
    }
    const ps = [
      ...mine(g).map(p => p.id + p.num + g.squads[p.title]!.lineup.indexOf(p.id)),
      ...g.staff.map(s => s.id + s.title),
      c.c1,
      c.c2,
    ].join();
    if (ps !== this.psig) {
      this.psig = ps;
      this.populate();
    }
    this.scrU.uC.value.set(c.c1);
    if (!this.editing) {
      this.seat();
      this.assign();
      if (g.life) this.life.clutter(g);
    }
  }
  /** new walls and furniture: work out again where people can walk and sit */
  private settle() {
    this.nav = new Nav(this.plan!);
    this.spots = spotsOf(this.plan!, this.nav, this.rooms);
    this.seat();
    this.gate = gate(this.plan!);
    for (const p of this.people.values()) p.w.displaced(this.nav);
  }
  /** draw a plan; the career's own, or the one in the editor */
  show(q: HQ, rooms?: Room[], hide: Set<string> | null = null) {
    const old = this.plan;
    this.plan = q;
    this.d = new Draft(q);
    this.R = this.d.regions();
    this.st = status(this.d, this.R);
    this.rooms = rooms ?? roomsOf(q);
    this.W = q.w;
    this.H = q.h;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < q.h; y++)
      for (let x = 0; x < q.w; x++)
        if (this.d.ft(x, y) !== '.') {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
    this.box = x1 < 0 ? [0, 0, q.w, q.h] : [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
    if (!old || old.w !== q.w || old.h !== q.h || !this.gGround.children.length || this.dsig !== this.g.site + this.g.club.c1) {
      this.dsig = this.g.site + this.g.club.c1;
      this.ground();
    }
    this.floors();
    this.wallsAndThings(hide);
    const sh = this.sun.shadow.camera;
    const Rr = Math.max(this.W, this.H) * 0.8 + 3;
    sh.left = -Rr;
    sh.right = Rr;
    sh.top = Rr;
    sh.bottom = -Rr;
    sh.near = 1;
    sh.far = 120;
    sh.updateProjectionMatrix();
    const big = [...this.rooms].sort((a, b) => b.area - a.area);
    this.lampAt = big.slice(0, 5).map(r => new THREE.Vector3(r.x + r.w / 2, 2.3, r.y + r.h / 2));
    this.lamps.forEach((l, i) => {
      const r = big[i];
      if (r) l.position.set(r.x + r.w / 2, 2.4, r.y + r.h / 2);
      else l.position.set(this.W * (0.25 + 0.5 * (i % 2)), 2.4, this.H * (0.28 + 0.45 * Math.floor(i / 2)));
    });
    this.hlId = -2;
    this.hl.visible = false;
  }
  private floors() {
    const e = this.e;
    this.dirty = true;
    const cap = Math.floor(4000 / Math.max(this.W, this.H));
    const px = this.editing ? 24 : Math.min(cap, e.q === 'medium' ? 40 : 56);
    const cv = this.floorCv;
    const same = cv.width === this.W * px && cv.height === this.H * px;
    floorCanvas(this.d, cv, px, this.g.club, this.g.site);
    // how shiny each tile is
    const rc = this.roughCv;
    rc.width = this.W * 4;
    rc.height = this.H * 4;
    const x = rc.getContext('2d')!;
    for (let j = 0; j < this.H; j++)
      for (let i = 0; i < this.W; i++) {
        const v = Math.round(255 * floorRough(this.d.ft(i, j)));
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(i * 4, j * 4, 4, 4);
      }
    if (same && this.floorMesh) {
      this.floorTex!.needsUpdate = true;
      this.roughTex!.needsUpdate = true;
      return;
    }
    disposeScene(this.gFloor);
    disposeScene(this.bFloor);
    this.gFloor.clear();
    this.bFloor.clear();
    const ft = (this.floorTex = new THREE.CanvasTexture(cv));
    ft.colorSpace = THREE.SRGBColorSpace;
    ft.anisotropy = 8;
    const rt = (this.roughTex = new THREE.CanvasTexture(rc));
    rt.magFilter = THREE.NearestFilter;
    const put = (m: THREE.Material, g: THREE.Group) => {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(this.W, this.H).rotateX(-Math.PI / 2), m);
      fl.position.set(this.W / 2, 0.005, this.H / 2);
      fl.receiveShadow = true;
      g.add(fl);
      return fl;
    };
    const fine = e.mat({ map: ft, roughMap: rt, rough: 1, std: true }) as THREE.MeshStandardMaterial;
    fine.envMapIntensity = 1.2;
    this.floorMesh = put(this.soft ? e.mat({ map: ft }) : fine, this.gFloor);
    if (this.soft) put(fine, this.bFloor);
  }
  private roughCv = document.createElement('canvas');
  private floorTex: THREE.CanvasTexture | null = null;
  private roughTex: THREE.CanvasTexture | null = null;
  private quadrant() {
    return (Math.sin(this.yawS) > 0 ? 1 : 0) + (Math.cos(this.yawS) > 0 ? 2 : 0) + (this.top ? 4 : 0);
  }
  private wallsAndThings(hide: Set<string> | null = null) {
    this.quad = this.quadrant();
    this.heights = new Heights(this.d, !!(this.quad & 1), !!(this.quad & 2), this.wallMode, this.top);
    this.dirty = true;
    this.wipe(this.gWalls);
    this.wipe(this.bWalls);
    const lay = (low: boolean, g: THREE.Group, mat: THREE.Material) => {
      const k = new Kit();
      k.plain = low;
      k.mk = 'paint';
      this.segs = walls(k, this.d, this.heights, this.g.club, this.g.site, low);
      if (k.p.length) {
        const m = new THREE.Mesh(k.geo(), mat);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
    };
    if (this.soft) {
      lay(true, this.gWalls, this.vc());
      lay(false, this.bWalls, this.vcFine());
    } else lay(false, this.gWalls, this.vcFine());
    this.wipe(this.gOver2);
    this.crest();
    this.things(hide);
  }
  things(hide: Set<string> | null = null) {
    this.dirty = true;
    this.wipe(this.gItems);
    this.wipe(this.bItems);
    this.screens?.geometry.dispose();
    this.screens?.removeFromParent();
    const dress = dressing(this.d, this.R, this.st, this.g);
    const lay = (low: boolean, g: THREE.Group, mat: THREE.Material, gk: number) => {
      const q = stuff(this.d, this.heights, this.g.club, dress, low, hide);
      if (q.geo) {
        const m = new THREE.Mesh(q.geo, mat);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
      if (q.glow) g.add(new THREE.Mesh(q.glow, this.glowMat(gk)));
      return q;
    };
    const s = this.soft ? lay(true, this.gItems, this.vc(), 1) : lay(false, this.gItems, this.vcFine(), 1.6);
    if (this.soft) lay(false, this.bItems, this.vcFine(), 1.9);
    this.tops = s.top;
    // all screens in one draw call
    const P: number[] = [],
      U: number[] = [],
      X: number[] = [];
    const M = new THREE.Matrix4(),
      vv = new THREE.Vector3();
    s.scr.forEach((q, i) => {
      M.makeRotationFromEuler(new THREE.Euler(q.rx ?? 0, q.wry, 0, 'YXZ')).setPosition(q.wx, q.y, q.wz);
      for (const [a, b] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ]) {
        vv.set((a - 0.5) * q.w, (b - 0.5) * q.h, 0).applyMatrix4(M);
        P.push(vv.x, vv.y, vv.z);
        U.push(a, b);
        X.push(i * 0.137, 0);
      }
    });
    if (P.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      sg.setAttribute('uv2x', new THREE.Float32BufferAttribute(X, 2));
      this.screens = new THREE.Mesh(
        sg,
        this.mat(
          'scr',
          () =>
            new THREE.ShaderMaterial({
              vertexShader: SV,
              fragmentShader: SF,
              uniforms: this.scrU,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
        ),
      );
      this.gOver2.add(this.screens);
    }
  }
  private screens: THREE.Mesh | null = null;
  /** the club crest hangs on the first free stretch of tall outside wall */
  private crest() {
    if (!this.crestTex || this.wallMode === 'down' || this.top) return;
    const d = this.d;
    const busy = (x: number, y: number) =>
      d.items.some(i => FURN[i.f].wall && i.x < (x + 2) * 2 && i.x + size(i)[0] > x * 2 && i.y < y * 2 + 2 && i.y + size(i)[1] > y * 2);
    for (const s of this.segs) {
      if (s.h < TALL || s.o !== 'h' || d.eh(s.x, s.y) !== '1' || d.eh(s.x + 1, s.y) !== '1') continue;
      const z = Math.cos(this.yawS) > 0 ? 1 : -1;
      const row = z > 0 ? s.y : s.y - 1;
      if (d.ft(s.x, row) === '.' || d.ft(s.x + 1, row) === '.' || busy(s.x, row)) continue;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        this.mat(
          'crest' + this.crestTex.uuid,
          () => new THREE.MeshBasicMaterial({ map: this.crestTex!, transparent: true, toneMapped: false }),
        ),
      );
      m.position.set(s.x + 1, 1.6, s.y + z * 0.1);
      if (z < 0) m.rotation.y = Math.PI;
      this.gOver2.add(m);
      return;
    }
  }
  private ground() {
    this.dirty = true;
    for (const g of [this.gGround, this.bGround, this.gCars]) {
      disposeScene(g);
      g.clear();
    }
    const lay = (low: boolean, g: THREE.Group, live: boolean) => {
      const k = new Kit();
      k.plain = low;
      this.outside(k, low, g, live);
      const m = new THREE.Mesh(k.geo(), this.e.mat({ vc: true, std: !low }));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      const gl = k.glow();
      if (gl) g.add(new THREE.Mesh(gl, this.glowMat(low ? 1 : 1.6).clone()));
    };
    lay(this.soft, this.gGround, true);
    if (this.soft) lay(false, this.bGround, false);
  }
  private fit() {
    const [x0, z0, x1, z1] = this.editing ? [0, 0, this.W, this.H] : this.box;
    return Math.max((x1 - x0) * 1.18, (z1 - z0) * 1.7) * 1.52 + (this.editing ? 4 : 5);
  }
  private outside(k: Kit, low: boolean, into: THREE.Group, live: boolean) {
    const W = this.W,
      H = this.H,
      g = this.g;
    if (live) this.cars = [];
    const lift = -0.02;
    const R = Rng.of('out' + g.site);
    const e = this.e;
    const N = noise2(9);
    const S = 150,
      px = 5;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S * px;
    const c = cv.getContext('2d')!;
    const ox = Math.round(W / 2 - S / 2),
      oz = Math.round(H / 2 - S / 2);
    const town = g.site === 0;
    // a small noise tile, repeated
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tc = tile.getContext('2d')!;
    const a = town ? '#8b8f88' : '#7d9a5c',
      b = town ? '#80857f' : '#6c8a4f';
    for (let y = 0; y < 128; y += 2)
      for (let x = 0; x < 128; x += 2) {
        const n = N(x * 0.05, y * 0.05) * 0.6 + N(x * 0.21, y * 0.21) * 0.4;
        tc.fillStyle = mixc(a, b, Math.max(0, Math.min(1, (n - 0.3) * 2.2))).getStyle();
        tc.fillRect(x, y, 2, 2);
      }
    c.fillStyle = c.createPattern(tile, 'repeat')!;
    c.fillRect(0, 0, S * px, S * px);
    const rect = (x: number, z: number, w: number, d: number, col: string) => {
      c.fillStyle = col;
      c.fillRect((x - ox) * px, (z - oz) * px, w * px, d * px);
    };
    const rz = H + 3.2;
    rect(ox, rz - 2.6, S, 2.4, '#a9aaa4');
    for (let i = 0; i < S; i += 2) rect(ox + i, rz - 2.6, 0.08, 2.4, '#9c9d97');
    rect(ox, rz, S, 7, '#4d5359');
    for (let i = 0; i < S; i += 4) rect(ox + i, rz + 3.42, 2, 0.16, '#d9d6c8');
    rect(ox, rz + 7, S, 2, '#a9aaa4');
    const rx = Math.max(W + 8, W / 2 + 20);
    rect(rx - 1.6, oz, 1.6, S, '#a9aaa4');
    rect(rx, oz, 6, S, '#4d5359');
    rect(rx + 6, oz, 1.6, S, '#a9aaa4');
    if (!town) {
      rect(-2, -2, W + 4, 2, '#8aa56a');
      rect(-2, -2, 2, H + 2.4, '#8aa56a');
      rect(W, -2, 2, H + 2.4, '#8aa56a');
    }
    rect(gate(this.plan!)[0] - 0.5, H, 2, 0.8, '#b5ada0');
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const gm = e.mat({ map: t, rough: 1, std: !low });
    if (!low) grain(gm as THREE.MeshStandardMaterial);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), gm);
    m.position.set(ox + S / 2, lift, oz + S / 2);
    m.receiveShadow = true;
    into.add(m);
    const tree = (x: number, z: number, s: number) => {
      const tone = R.pick([
        ['#4f7d3f', '#5f9148', '#446f38', '#74a455'],
        ['#5d8a3f', '#72a04c', '#4c7836', '#86ad58'],
        ['#3f6f45', '#528555', '#376240', '#67986a'],
      ]);
      const lean = R.f() * 0.2 - 0.1;
      k.tube(
        [
          [x, lift, z],
          [x + lean, lift + 0.8 * s, z],
          [x + lean * 0.5, lift + 1.5 * s, z + 0.05],
        ],
        0.11 * s,
        '#5d4632',
        { m: 'wood', seg: 6, rad: 7 },
      );
      foliage(k, x + lean, lift + 1.95 * s, z, 0.95 * s, tone, 13);
      foliage(k, x + 0.4 * s, lift + 1.6 * s, z + 0.2 * s, 0.5 * s, tone, 6);
    };
    for (let i = 0; i < 44; i++) {
      const x = R.range(ox + 30, ox + S - 30),
        z = R.range(oz + 30, oz + S - 30);
      if (x > -5 && x < W + 5 && z > -5 && z < H + 3) continue;
      if (Math.abs(z - rz - 3.5) < 5.5 || Math.abs(x - rx - 3) < 5) continue;
      if (town && R.chance(0.6)) continue;
      tree(x, z, 0.8 + R.f() * 0.6);
    }
    for (let i = 0; i < 16; i++) {
      const north = i < 8;
      const x = north ? W / 2 - 36 + i * 9.5 : rx + 14 + R.f() * 6,
        z = north ? -14 - R.f() * 4 : -18 + (i - 8) * 9;
      const w = 6 + R.f() * 3,
        d = 6 + R.f() * 3,
        h = 3 + R.f() * (town ? 6 : 3.5);
      const col = R.pick(['#b7a48c', '#a8634a', '#8f989b', '#c8bda8', '#7a8790']);
      if (!north && Math.abs(z - rz - 3.5) < 8) continue;
      k.mk = 'stone';
      k.box(x, lift, z, w, h, d, col, { ao: 0.45 });
      k.mk = null;
      k.box(x, lift + h, z, w + 0.2, 0.15, d + 0.2, shade(col, -0.2));
      for (let q = 0; q < 3; q++)
        for (let f = 0; f < Math.floor(h / 1.6); f++) {
          const lit = R.chance(0.25);
          k.box(x - w * 0.3 + q * w * 0.3, lift + 0.8 + f * 1.5, z + d / 2 + 0.02, 0.8, 0.8, 0.04, lit ? '#ffd48a' : '#3c4a55', {
            glow: lit,
            ao: 0,
          });
        }
    }
    for (let i = 0; i < 6; i++) {
      const x = W / 2 - 32 + i * 13;
      k.cyl(x, lift, rz - 0.5, 0.06, 3, '#3a4148', { seg: 6 });
      k.box(x, lift + 3, rz - 0.1, 0.12, 0.08, 0.9, '#3a4148');
      k.box(x, lift + 2.95, rz + 0.25, 0.18, 0.05, 0.3, '#ffe0a8', { glow: true });
    }
    if (!live) return;
    const mk = (col: string) => {
      const q = new Kit();
      const side: [number, number][] = [
        [-1.95, 0.28],
        [1.9, 0.28],
        [2.0, 0.5],
        [1.9, 0.72],
        [1.15, 0.84],
        [0.55, 1.28],
        [-0.75, 1.32],
        [-1.45, 0.94],
        [-1.95, 0.86],
        [-2.02, 0.5],
      ];
      q.ext(0, 0, 0, side, 1.5, col, { b: 0.12, m: 'gloss' });
      const glass: [number, number][] = [
        [-1.32, 0.92],
        [1.02, 0.86],
        [0.5, 1.2],
        [-0.72, 1.24],
      ];
      q.ext(0, 0, 0, glass, 1.62, '#141d24', { b: 0.1, m: 'glass' });
      q.ext(
        0,
        0.05,
        0,
        [
          [0.62, 0.84],
          [1.14, 0.8],
          [0.56, 1.2],
          [0.46, 1.2],
        ],
        1.2,
        '#141d24',
        { b: 0.1, m: 'glass' },
      );
      for (const a of [-1.2, 1.2])
        for (const b of [-0.74, 0.74]) {
          q.cyl(a, 0.32 - 0.11, b, 0.32, 0.22, '#14171a', { rx: Math.PI / 2, seg: 22, m: 'rubber' });
          q.cyl(a, 0.32 - 0.115, b, 0.19, 0.235, '#b9c0c5', { rx: Math.PI / 2, seg: 10, m: 'metal' });
        }
      for (const s of [-1, 1]) {
        q.rbox(1.93, 0.55, s * 0.55, 0.16, 0.12, 0.34, '#fff2c8', { glow: true, b: 0.04 });
        q.rbox(-1.98, 0.62, s * 0.58, 0.1, 0.12, 0.3, '#ff4a3a', { glow: true, b: 0.03 });
        q.rbox(0.55, 0.88, s * 0.92, 0.16, 0.1, 0.14, col, { b: 0.04, m: 'gloss' });
      }
      const gp = new THREE.Group();
      const mm = new THREE.Mesh(q.geo(), e.mat({ vc: true, std: true }));
      mm.castShadow = true;
      gp.add(mm, new THREE.Mesh(q.glow()!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
      this.gCars.add(gp);
      return gp;
    };
    for (let i = 0; i < 3; i++) {
      const v = i % 2 ? -7 : 6;
      const gp = mk(['#b5392c', '#d9d6cd', '#28597d'][i]);
      gp.position.set(i * 30, lift, rz + (v > 0 ? 5.2 : 1.8));
      gp.rotation.y = v > 0 ? 0 : Math.PI;
      this.cars.push({ m: gp, x: i * 32 - 20, v, z: 0 });
    }
  }
  private populate() {
    const g = this.g,
      low = false;
    const keep = new Set<string>();
    const add = (id: string, mk: () => Character, o: Partial<Person>) => {
      keep.add(id);
      let p = this.people.get(id);
      if (!p) {
        const c = mk();
        const w = new Walker(id);
        w.x = this.gate[0] + 0.5;
        w.z = this.plan!.h + 1.5;
        w.ry = Math.PI;
        p = { id, c, w, slot: 0, nick: '' };
        this.people.set(id, p);
        this.scene.add(c.root);
      }
      Object.assign(p, o);
    };
    const old = new Map([...this.people.values()].map(p => [p.id, p] as const));
    for (const p of [...this.people.values()])
      if (p.id.startsWith('p') || p.id.startsWith('s') || p.id === 'me') {
        this.scene.remove(p.c.root);
        p.c.dispose();
        this.people.delete(p.id);
      }
    for (const p of mine(g)) {
      const sq = g.squads[p.title]!;
      add(
        p.id,
        () => {
          const c = new Character(
            low,
            { outfit: 'civil', head: civHead(p.look), cape: false, headset: true },
            civPalette(
              p.look,
              g.club.jersey.c1,
              g.club.jersey.sleeve === 'match' ? g.club.jersey.c1 : g.club.jersey.sleeve === 'second' ? g.club.jersey.c2 : g.club.jersey.c3,
              g.club.c1,
            ),
            { human: specOf(p.look, p.id, this.wear(null, p.age)) },
          );
          const t = this.shirtOf?.(p.id);
          if (t) {
            c.mat.uniformsX.uShirt.value = t;
            c.mat.uniformsX.uHasShirt.value = 1;
          }
          return c;
        },
        { title: p.title, slot: sq.lineup.indexOf(p.id), nick: p.nick },
      );
    }
    for (const s of g.staff)
      add(
        s.id,
        () =>
          new Character(
            low,
            {
              outfit:
                s.role === 'chef'
                  ? 'chef'
                  : s.role === 'psych' || s.role === 'therapist'
                    ? 'coat'
                    : s.role === 'coach' || s.role === 'tech' || s.role === 'trainer'
                      ? 'hoodie'
                      : 'civil',
              head: s.role === 'chef' ? 'bald' : civHead(s.look),
              cape: false,
              headset: s.role === 'coach',
            },
            civPalette(
              s.look,
              s.role === 'chef'
                ? '#f2f0ea'
                : s.role === 'psych'
                  ? '#8fa08a'
                  : s.role === 'therapist'
                    ? '#f4f6f6'
                    : s.role === 'coach'
                      ? '#20262d'
                      : mixc('#4a5a64', g.club.c1, 0.3).getStyle(),
              g.club.c2,
              g.club.c1,
            ),
            { human: specOf(s.look, s.id, this.wear(s)) },
          ),
        { staff: s, nick: s.name, slot: -1 },
      );
    add(
      'me',
      () =>
        new Character(
          low,
          { outfit: 'hoodie', head: civHead(g.mgr.look), cape: false, headset: false },
          civPalette(g.mgr.look, CLOTH[g.mgr.look.oc ?? 0] ?? '#2a2e35', g.club.c1, g.club.c1),
          { human: specOf(g.mgr.look, 'me', { outfit: (g.mgr.look.o as 'suit') ?? 'suit', shoes: 'smart', age: g.mgr.look.a ?? 33 }) },
        ),
      { nick: g.mgr.name, slot: -1 },
    );
    void keep;
    for (const p of this.people.values()) {
      const o = old.get(p.id);
      if (o) p.w = o.w;
    }
  }
  /** desks with a name on them */
  private seat() {
    const g = this.g;
    if (!g || this.editing) return;
    for (const t of Object.keys(g.squads) as TitleId[]) {
      const S = seatsOf(g, t);
      let extra = S.length;
      for (const s of this.spots) if (s.slot !== undefined && s.title === t) s.slot = S.includes(s.item!) ? S.indexOf(s.item!) : extra++;
    }
  }
  private free(kinds: string[], title?: TitleId, slot?: number): Spot | null {
    for (const kk of kinds) {
      const L = this.spots.filter(s => !s.used && s.kind === kk && (!s.title || !title || s.title === title));
      if (slot !== undefined && slot >= 0) {
        const x = L.find(s => s.slot === slot);
        if (x) return x;
      }
      const y = L.filter(s => s.slot === undefined || s.kind.endsWith('seat'))[0];
      if (y) return y;
    }
    return null;
  }
  assign() {
    const g = this.g;
    if (!g || !this.nav) return;
    for (const s of this.spots) s.used = undefined;
    this.life?.reset();
    const d = dow(g.day);
    const night = this.block >= 3;
    const take = (p: Person, s: Spot | null) => {
      s ??= this.free(['wander', 'yard:guest']);
      if (!s) {
        p.w.spot = null;
        return;
      }
      s.used = p.id;
      p.w.go(s);
    };
    const order = [...this.people.values()];
    this.walkers = order.map(p => p.w);
    for (const p of order) {
      const t = p.title;
      if (!t) continue;
      p.gone = !!g.life && away(g, p.id, this.block);
      if (p.gone) {
        const [gx] = this.gate;
        p.w.go({ x: gx + 0.5, z: this.H + 2.4, ax: gx + 0.5, az: this.H + 2.4, ry: 0, act: 'idle', kind: 'out' });
        continue;
      }
      const sq = g.squads[t] as Squad | undefined;
      const b: Block = night ? 'rest' : sq ? sq.week[d][Math.min(2, this.block)] : 'rest';
      const pl = g.players[p.id];
      let ks: string[];
      const hurt = pl && pl.injury > 0;
      if (hurt) ks = ['medical:seat', 'dorm:bed', 'lounge:seat', 'kitchen:seat'];
      else if (night) ks = ['dorm:bed', 'lounge:seat', 'kitchen:seat', 'practice:seat'];
      else
        ks = (
          {
            scrim: ['practice:seat'],
            aim: ['practice:seat'],
            tactics: ['strategy:seat', 'practice:seat'],
            vod: ['strategy:seat', 'practice:seat'],
            gym: ['gym:seat', 'lounge:play', 'yard:guest'],
            mind: ['wellness:seat', 'yard:guest', 'lounge:seat', 'kitchen:seat'],
            bond: ['lounge:play', 'lounge:seat', 'yard:guest', 'kitchen:seat'],
            stream: ['stream:seat', 'practice:seat'],
            rest: ['lounge:seat', 'lounge:guest', 'kitchen:seat', 'yard:guest', 'dorm:bed', 'lounge:play'],
          } as Record<Block, string[]>
        )[b];
      let s = this.free(ks, t, p.slot);
      if (s && s.kind === 'practice:seat' && s.title !== t) s = null;
      if (!s && p.slot < 0) s = this.free(['practice:watch'], t);
      take(p, s);
    }
    for (const p of order) {
      if (!p.staff) continue;
      const r = p.staff.role;
      const t = p.staff.title;
      const sq = t ? g.squads[t] : undefined;
      const b = sq ? sq.week[d][Math.min(2, this.block)] : 'scrim';
      const ks: Record<string, string[]> = {
        coach:
          b === 'tactics' || b === 'vod'
            ? ['strategy:coach', 'practice:coach', 'practice:desk']
            : ['practice:coach', 'practice:desk', 'strategy:coach'],
        analyst: ['strategy:desk', 'office:desk', 'practice:desk'],
        psych: ['wellness:coach', 'office:desk', 'lounge:seat'],
        therapist: ['medical:coach', 'office:desk'],
        trainer: ['gym:coach', 'practice:watch'],
        chef: ['kitchen:coach', 'kitchen:helper'],
        tech: ['workshop:coach', 'practice:watch'],
        scout: ['office:desk', 'strategy:desk'],
        content: ['stream:coach', 'stream:seat'],
        partner: ['office:desk', 'office:guest'],
        // wherever it is worst
        cleaner: Object.entries(g.life?.mess ?? {})
          .sort((x, y) => y[1] - x[1])
          .flatMap(([m]) => ['watch', 'helper', 'desk', 'coach', 'guest'].map(k => m + ':' + k))
          .concat('bath:desk', 'kitchen:helper'),
      };
      const at = ks[r] ?? [];
      take(p, this.free(night ? ['kitchen:seat', 'lounge:seat', ...at] : at, t));
    }
    const me = this.people.get('me');
    if (me) take(me, this.free(this.block === 1 ? ['office:me', 'practice:watch'] : ['practice:watch', 'office:me', 'trophy:seat']));
  }
  setBlock(b: number) {
    if (b === this.block) return;
    this.block = b;
    this.todTarget = [0.35, 0.52, 0.74, 0.93][b] ?? 0.35;
    if (this.g && !this.editing) this.assign();
  }
  warp() {
    for (const p of this.people.values()) if (p.w.spot) p.w.warp(p.w.spot);
  }
  // ---------- editor
  edit(on: boolean) {
    if (this.editing === on) return;
    this.editing = on;
    this.focus = null;
    this.panX = this.panZ = 0;
    this.userZoom = 1;
    this.tool = null;
    this.keys.clear();
    this.overlay([]);
    this.hover(null);
    for (const p of this.people.values()) p.c.root.visible = !on;
    if (!on) {
      this.top = false;
      this.wallMode = 'cut';
      this.sig = '';
      this.sync(this.g);
    }
  }
  /** the plan moved under the camera, when land is added to the north or west */
  shift(dx: number, dz: number) {
    this.camTs.x += dx;
    this.camTs.z += dz;
  }
  setWalls(m: WallMode) {
    this.wallMode = m;
    this.wallsAndThings();
  }
  rotate(n: number) {
    this.yaw += (n * Math.PI) / 2;
  }
  get statuses() {
    return this.st;
  }
  get regions() {
    return this.R;
  }
  overlay(list: Ghost[], grid = false) {
    this.wipe(this.gOver);
    if (grid) {
      const P: number[] = [];
      for (let x = 0; x <= this.W; x++) P.push(x, 0.02, 0, x, 0.02, this.H);
      for (let y = 0; y <= this.H; y++) P.push(0, 0.02, y, this.W, 0.02, y);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      const l = new THREE.LineSegments(
        g,
        this.mat('grid', () => new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.13, depthWrite: false })),
      );
      l.renderOrder = 2;
      this.gOver.add(l);
    }
    const flat = (P: number[], col: string, op: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      const m = new THREE.Mesh(
        g,
        this.mat(
          'flat' + col + op,
          () =>
            new THREE.MeshBasicMaterial({
              color: col,
              transparent: true,
              opacity: op,
              depthWrite: false,
              toneMapped: false,
              side: THREE.DoubleSide,
              depthTest: false,
            }),
        ),
      );
      m.renderOrder = 4;
      this.gOver.add(m);
    };
    const quad = (P: number[], x: number, y: number, w: number, h: number) =>
      P.push(x, 0.03, y, x + w, 0.03, y + h, x + w, 0.03, y, x, 0.03, y, x, 0.03, y + h, x + w, 0.03, y + h);
    const block = (x: number, z: number, w: number, d: number, y0: number, y1: number, col: string, op: number, lines: boolean) => {
      const b = new THREE.BoxGeometry(w, y1 - y0, d);
      const m = new THREE.Mesh(
        b,
        this.mat(
          'block' + col + op,
          () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }),
        ),
      );
      m.position.set(x, (y0 + y1) / 2, z);
      m.renderOrder = 4;
      this.gOver.add(m);
      if (lines) {
        const l = new THREE.LineSegments(
          new THREE.EdgesGeometry(b),
          this.mat(
            'line' + col,
            () => new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false }),
          ),
        );
        l.position.copy(m.position);
        l.renderOrder = 5;
        this.gOver.add(l);
      }
    };
    for (const q of list) {
      if (q.k === 'rect') {
        if (q.tall) block(q.x + q.w / 2, q.y + q.h / 2, q.w, q.h, 0.01, q.tall, q.col, q.op ?? 0.25, true);
        else {
          const P: number[] = [];
          quad(P, q.x, q.y, q.w, q.h);
          flat(P, q.col, q.op ?? 0.25);
        }
      } else if (q.k === 'tiles') {
        const P: number[] = [];
        for (let i = 0; i < q.map.length; i++) if (q.map[i] === q.id) quad(P, i % q.mw, Math.floor(i / q.mw), 1, 1);
        if (P.length) flat(P, q.col, q.op ?? 0.2);
      } else if (q.k === 'edges') {
        for (const [o, x, y] of q.list) {
          const t = q.tall ?? 1.2;
          if (o === 'v') block(x, y + 0.5, 0.2, 1, 0.02, t, q.col, 0.5, false);
          else block(x + 0.5, y, 1, 0.2, 0.02, t, q.col, 0.5, false);
        }
      } else if (q.k === 'items') {
        const p: number[] = [],
          n: number[] = [],
          c: number[] = [],
          gp: number[] = [],
          gc: number[] = [];
        for (const it of q.list) {
          let wall = TALL;
          if (FURN[it.f].wall) wall = Math.max(STUBW, this.heights.item(it));
          place(furniture(it.f, { ...this.g.club, wall, low: this.e.q === 'low' }), it, p, n, c, gp, gc);
          const [w, h] = size(it);
          const F: number[] = [];
          quad(F, it.x / 2, it.y / 2, w / 2, h / 2);
          flat(F, q.ok ? '#54d199' : '#ff6f61', 0.35);
        }
        const geo = geoOf(p.concat(gp), null, c.concat(gc));
        if (geo) {
          const m = new THREE.Mesh(
            geo,
            this.mat(
              'ghost' + q.ok,
              () =>
                new THREE.MeshBasicMaterial({
                  vertexColors: true,
                  color: q.ok ? '#d8ffe9' : '#ff8a7d',
                  transparent: true,
                  opacity: q.ok ? 0.85 : 0.6,
                  toneMapped: false,
                }),
            ),
          );
          m.renderOrder = 4;
          this.gOver.add(m);
        }
      } else {
        const [w, h] = size(q.it);
        const t = this.tops.get(q.it.id) ?? [0, 1];
        block((q.it.x + w / 2) / 2, (q.it.y + h / 2) / 2, w / 2, h / 2, Math.min(0.02, t[0]), t[1] + 0.05, q.col, 0.1, true);
      }
    }
  }
  private rayOf() {
    this.ray.setFromCamera(this.ptr, this.camera);
    return this.ray.ray;
  }
  private slab(o: THREE.Vector3, v: THREE.Vector3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): number {
    let a = 0,
      b = 1e9;
    for (const [p, q, lo, hi] of [
      [o.x, v.x, x0, x1],
      [o.y, v.y, y0, y1],
      [o.z, v.z, z0, z1],
    ]) {
      if (Math.abs(q) < 1e-9) {
        if (p < lo || p > hi) return -1;
        continue;
      }
      const t0 = (lo - p) / q,
        t1 = (hi - p) / q;
      a = Math.max(a, Math.min(t0, t1));
      b = Math.min(b, Math.max(t0, t1));
    }
    return a <= b ? a : -1;
  }
  /** the piece of furniture under the pointer */
  pickItem(): Item | null {
    const { origin: o, direction: v } = this.rayOf();
    let best = 1e9,
      it: Item | null = null;
    for (const q of this.d.items) {
      const t = this.tops.get(q.id);
      if (!t) continue;
      const [w, h] = size(q);
      let x0 = q.x / 2,
        x1 = (q.x + w) / 2,
        z0 = q.y / 2,
        z1 = (q.y + h) / 2;
      if (FURN[q.f].wall) {
        if (q.r === 0) z1 = z0 + 0.2;
        else if (q.r === 2) z0 = z1 - 0.2;
        else if (q.r === 1) x1 = x0 + 0.2;
        else x0 = x1 - 0.2;
      }
      let d = this.slab(o, v, x0, x1, FURN[q.f].wall ? t[0] : 0, t[1], z0, z1);
      if (d < 0) continue;
      if (FURN[q.f].flat) d += 0.6;
      if (d < best) {
        best = d;
        it = q;
      }
    }
    return it;
  }
  /** the wall edge under the pointer: by its drawn face first, then whatever is nearest on the floor */
  pickEdge(near = 0.45, all = false): ['v' | 'h', number, number] | null {
    const { origin: o, direction: v } = this.rayOf();
    let best = 1e9,
      e: ['v' | 'h', number, number] | null = null;
    for (const s of this.segs) {
      const t =
        s.o === 'v'
          ? this.slab(o, v, s.x - 0.1, s.x + 0.1, 0, s.h, s.y, s.y + 1)
          : this.slab(o, v, s.x, s.x + 1, 0, s.h, s.y - 0.1, s.y + 0.1);
      if (t >= 0 && t < best) {
        best = t;
        e = [s.o, s.x, s.y];
      }
    }
    if (e) return e;
    const p = this.tile();
    if (!p) return null;
    const x = Math.floor(p[0]),
      y = Math.floor(p[1]);
    const c: [number, 'v' | 'h', number, number][] = [
      [p[0] - x, 'v', x, y],
      [x + 1 - p[0], 'v', x + 1, y],
      [p[1] - y, 'h', x, y],
      [y + 1 - p[1], 'h', x, y + 1],
    ];
    c.sort((a, b) => a[0] - b[0]);
    for (const [d, a, i, j] of c) if (d < near && (all || this.d.edge(a, i, j) !== '0')) return [a, i, j];
    return null;
  }
  // ---------- input
  attach(el: HTMLElement) {
    const xy = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    };
    const pt = (ev: PointerEvent): Pt => {
      const t = this.tile() ?? [-99, -99];
      return { x: t[0], z: t[1], sx: ev.clientX, sy: ev.clientY };
    };
    const dn = (ev: PointerEvent) => {
      if (ev.target !== el) return;
      xy(ev);
      (document.activeElement as HTMLElement | null)?.blur?.();
      let tool = false;
      if (this.tool && ev.button === 0) tool = this.tool.down(pt(ev), ev);
      this.drag = { x: ev.clientX, y: ev.clientY, b: ev.button, moved: false, tool };
    };
    const mv = (ev: PointerEvent) => {
      xy(ev);
      if (this.drag) {
        const dx = ev.clientX - this.drag.x,
          dy = ev.clientY - this.drag.y;
        if (this.drag.tool) {
          this.tool?.move(pt(ev), true);
          return;
        }
        if (this.drag.moved || Math.abs(dx) + Math.abs(dy) > 4) {
          this.drag.moved = true;
          this.drag.x = ev.clientX;
          this.drag.y = ev.clientY;
          if (this.drag.b === 2 || ev.shiftKey) {
            this.yaw -= dx * 0.006;
            if (!this.top) this.pitch = Math.max(0.45, Math.min(1.4, this.pitch + dy * 0.005));
          } else {
            const k = this.camDs * 0.0011;
            this.panX -= (dx * Math.cos(this.yaw) + dy * Math.sin(this.yaw)) * k;
            this.panZ -= (dy * Math.cos(this.yaw) - dx * Math.sin(this.yaw)) * k;
          }
        }
      } else if (ev.target === el) {
        if (this.tool) {
          this.tool.move(pt(ev), false);
          return;
        }
        const t = this.tile();
        const r = t ? this.roomAt(t[0], t[1]) : null;
        this.hover(t);
        this.onHover?.(r, ev.clientX, ev.clientY);
      } else {
        this.hover(null);
        this.onHover?.(null, 0, 0);
      }
    };
    const up = (ev: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.tool) {
        xy(ev);
        this.tool?.up(pt(ev), ev);
        return;
      }
      if (this.tool) {
        if (d.b === 2 && !d.moved) this.tool.cancel();
        return;
      }
      if (d.moved || ev.target !== el) return;
      const t = this.tile();
      if (t) {
        const per = this.personAt(t);
        if (per && this.onPerson) {
          this.onPerson(per);
          return;
        }
        this.onPick?.(this.roomAt(t[0], t[1]));
      }
    };
    const wh = (ev: WheelEvent) => {
      if (ev.target !== el) return;
      ev.preventDefault();
      this.userZoom = Math.max(0.16, Math.min(1.8, this.userZoom * (1 + Math.sign(ev.deltaY) * 0.1)));
    };
    const cm = (ev: Event) => ev.preventDefault();
    const typing = (ev: KeyboardEvent) => /INPUT|TEXTAREA|SELECT/.test((ev.target as HTMLElement)?.tagName ?? '');
    const kd = (ev: KeyboardEvent) => {
      if (!this.editing || typing(ev) || ev.ctrlKey || ev.metaKey) return;
      if (/^Arrow|^[wasd]$/i.test(ev.key)) {
        this.keys.add(ev.key.toLowerCase());
        if (ev.key.startsWith('Arrow')) ev.preventDefault();
      }
    };
    const ku = (ev: KeyboardEvent) => this.keys.delete(ev.key.toLowerCase());
    el.addEventListener('pointerdown', dn);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wh, { passive: false });
    el.addEventListener('contextmenu', cm);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.unhook = () => {
      el.removeEventListener('pointerdown', dn);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wh);
      el.removeEventListener('contextmenu', cm);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }
  private tile(): [number, number] | null {
    const { origin: o, direction: d } = this.rayOf();
    if (d.y >= 0) return null;
    const t = -o.y / d.y;
    return [o.x + d.x * t, o.z + d.z * t];
  }
  private personAt(t: [number, number]): string | null {
    const c = this.camera.position;
    let best = 0.75,
      id: string | null = null;
    for (const p of this.people.values()) {
      const dx = c.x - t[0],
        dz = c.z - t[1],
        l = Math.hypot(dx, dz) || 1;
      for (const h of [0.1, 0.7]) {
        const d = Math.hypot(p.w.x - (t[0] + (dx / l) * h), p.w.z - (t[1] + (dz / l) * h));
        if (d < best * 0.6) {
          best = d;
          id = p.id;
        }
      }
    }
    return id;
  }
  private regionAt(x: number, z: number): number {
    const i = Math.floor(x),
      j = Math.floor(z);
    return i < 0 || j < 0 || i >= this.W || j >= this.H || !this.R ? -1 : this.R.map[j * this.W + i];
  }
  roomAt(x: number, z: number): Room | null {
    const id = this.regionAt(x, z);
    if (id < 0) return null;
    const s = this.st.find(q => q.region?.id === id);
    return s ? (this.rooms.find(r => r.id === s.zone.id) ?? null) : null;
  }
  private hover(t: [number, number] | null) {
    const r = t ? this.roomAt(t[0], t[1]) : null;
    if (!r) {
      this.hl.visible = false;
      return;
    }
    const id = this.regionAt(t![0], t![1]);
    if (id !== this.hlId) {
      this.hlId = id;
      const P: number[] = [];
      this.R.map.forEach((q, i) => {
        if (q !== id) return;
        const x = i % this.W,
          y = Math.floor(i / this.W);
        P.push(x, 0.03, y, x, 0.03, y + 1, x + 1, 0.03, y + 1, x, 0.03, y, x + 1, 0.03, y + 1, x + 1, 0.03, y);
      });
      this.hl.geometry.dispose();
      this.hl.geometry = new THREE.BufferGeometry();
      this.hl.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    }
    this.hl.visible = true;
  }
  setInset(r: number, b: number) {
    this.insetR = r;
    this.insetB = b;
  }
  focusRoom(type: string | null, title?: TitleId) {
    if (!type) {
      this.focus = null;
    } else {
      const r =
        this.g?.rooms.find(x => x.id === type) ?? this.g?.rooms.find(x => x.type === type && (!title || !x.title || x.title === title));
      this.focus = r ? r.id : null;
    }
    this.panX = this.panZ = 0;
    this.userZoom = 1;
  }
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
  /** what people wear to work here */
  private wear(st: Staff | null, age?: number): Wear {
    const W: Record<string, Wear> = {
      coach: { outfit: 'long' },
      analyst: { outfit: 'polo' },
      psych: { outfit: 'shirt', shoes: 'smart' },
      therapist: { outfit: 'polo' },
      trainer: { outfit: 'sport', muscle: 0.8 },
      chef: { outfit: 'shirt' },
      tech: { outfit: 'work' },
      scout: { outfit: 'jacket' },
      content: { outfit: 'long' },
      partner: { outfit: 'suit', shoes: 'smart' },
      cleaner: { outfit: 'work' },
    };
    if (!st) return { outfit: 'tee', age };
    return { ...(W[st.role] ?? { outfit: 'polo' }), age: age ?? 30 + (st.id.charCodeAt(st.id.length - 1) % 5) * 5 };
  }
  private vo = { r: 0, b: 0 };
  update(dt: number, t: number) {
    this.scrU.uT.value = t;
    this.frame++;
    if (this.auto && !this.editing) {
      this.cycle += dt;
      if (this.cycle > 26) {
        this.cycle = 0;
        this.setBlock((this.block + 1) % 3);
      }
    }
    this.tod += ((this.editing ? 0.42 : this.todTarget) - this.tod) * Math.min(1, dt * 0.9 * (this.editing ? 3 : this.timeScale));
    if (this.soft && this.timeScale <= 1 && !this.editing) this.tod = this.todTarget;
    const td = this.tod;
    this.darkS += (this.dark - this.darkS) * (this.soft ? 1 : Math.min(1, dt * 6));
    const dk = 1 - this.darkS * 0.9;
    const day = Math.max(0, Math.sin(((td - 0.18) / 0.66) * Math.PI)) * (1 - this.darkS * 0.75);
    const dusk = Math.max(0, 1 - Math.abs(td - 0.78) / 0.14),
      a = (td - 0.2) * 4.2;
    const low = this.e.q === 'low';
    this.sun.position.set(this.W / 2 + Math.cos(a) * -22, 10 + day * 24, this.H / 2 + 14 + Math.sin(a) * 6);
    this.sun.target.position.set(this.W / 2, 0, this.H / 2);
    const sc = new THREE.Color('#fff3e0')
      .lerp(new THREE.Color('#ff9a5a'), dusk)
      .lerp(new THREE.Color('#8fa8ff'), Math.max(0, 1 - day * 3) * (1 - dusk) * 0.7);
    this.sun.color.copy(sc);
    this.sun.intensity = 0.35 + day * 2.3 + dusk * 0.5;
    this.hemi.intensity = 0.55 + day * 0.55;
    this.hemi.color.set('#dfeaf4').lerp(new THREE.Color('#5a6a9a'), Math.max(0, 1 - day * 1.6));
    this.sun.intensity *= 0.35 + 0.65 * dk;
    this.hemi.intensity *= 0.25 + 0.75 * dk;
    this.beauty.environmentIntensity = 0.4 * (0.2 + 0.8 * dk);
    this.scene.environmentIntensity = 0.35 * (0.2 + 0.8 * dk);
    for (const l of this.lamps) l.intensity = ((1 - day) * 26 + 2) * (this.darkS > 0.5 ? 0 : 1);
    if (this.soft) {
      this.bSun.position.copy(this.sun.position);
      this.bSun.target.position.copy(this.sun.target.position);
      this.bSun.color.copy(sc);
      this.bSun.intensity = this.sun.intensity * 1.18;
      this.bHemi.intensity = this.hemi.intensity * 0.62;
      this.bHemi.color.copy(this.hemi.color);
      this.bLamps.forEach((l, i) => {
        l.intensity = this.darkS > 0.5 ? 0 : (1 - day) * 24 + 3;
        const q = this.lampAt[i];
        if (q) l.position.copy(q);
      });
    }
    const bg = new THREE.Color('#a9c3cf')
      .lerp(new THREE.Color('#e0a27a'), dusk * 0.8)
      .lerp(new THREE.Color('#141d2b'), Math.max(0, 1 - day * 2.2) * (1 - dusk * 0.5));
    this.scene.background = bg;
    if (this.soft) {
      this.beauty.background = bg;
      if (Math.abs(this.tod - this.bakedTod) > 0.012) {
        this.bakedTod = this.tod;
        this.dirty = true;
      }
    }
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(bg, 70, 150);
    (this.scene.fog as THREE.Fog).color.copy(bg);
    (this.scene.fog as THREE.Fog).near = this.camDs * 1.3 + 16;
    (this.scene.fog as THREE.Fog).far = this.camDs * 2 + 120;
    if (low) {
      LOWU.uSunD.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
      LOWU.uSunC.value.copy(sc).multiplyScalar(0.18 + day * 0.5 + dusk * 0.12);
      const n = 1 - day;
      LOWU.uSky.value.setRGB(0.52 + day * 0.17, 0.52 + day * 0.18, 0.55 + day * 0.18);
      LOWU.uGnd.value.setRGB(0.42 + n * 0.06, 0.38, 0.35 - n * 0.04);
    }
    for (const c of this.cars) {
      c.x += c.v * dt;
      if (c.x > 80) c.x = -70;
      if (c.x < -70) c.x = 80;
      c.m.position.x = c.x;
    }
    if (!this.editing) this.walk(dt, t, low);
    this.life.visible = !this.editing;
    this.life.update(dt, t);
    this.blobs.visible = !this.editing;
    this.view(dt, t);
  }
  private walk(dt: number, t: number, low: boolean) {
    let bi = 0;
    const M = new THREE.Matrix4();
    let plans = this.e.software ? 2 : 4;
    for (const p of this.people.values()) {
      const R = p.c.rig,
        w = p.w;
      if (w.need && w.state === 'free' && plans > 0) {
        plans--;
        w.plan(this.nav);
      }
      p.c.root.visible = !(p.gone && w.arrived && w.spot?.kind === 'out');
      const moving = w.step(this.nav, dt, 1.55 * Math.min(4, this.timeScale), this.walkers);
      const s = w.spot;
      const onto = w.state === 'in';
      R.speed = moving ? 1.5 * Math.min(2.2, this.timeScale) : s?.act === 'run' && w.arrived ? 3.0 : 0;
      const act = moving || !w.arrived ? (moving ? 'move' : 'idle') : s?.act === 'run' ? 'move' : (s?.act ?? 'idle');
      if (R.act !== act) {
        R.act = act as any;
        R.actT = 0;
      }
      if (act === 'pingpong') R.hold = 'none';
      R.seat = s?.seat ?? 0.42;
      const y = onto && s?.y !== undefined ? s.y : 0;
      const lie = act === 'lie' || act === 'bench';
      p.c.root.position.set(w.x, y, w.z);
      p.c.root.rotation.y = w.ry;
      const every = this.e.software ? 3 : 1;
      p.c.setLod(this.e.software ? (this.camDs > 30 ? 2 : 1) : this.camDs > 60 && this.e.q !== 'ultra' ? 1 : this.camDs < 16 ? 0 : 1);
      if ((this.frame + bi) % every === 0 || moving) p.c.update(dt * (moving ? 1 : every), t);
      if (bi < 80) {
        const q = lie ? 0 : 0.95;
        M.makeScale(q, 1, q).setPosition(w.x, 0.02, w.z);
        this.blobs.setMatrixAt(bi++, M);
      }
    }
    this.blobs.count = Math.max(1, bi);
    this.blobs.instanceMatrix.needsUpdate = true;
  }
  private view(dt: number, t: number) {
    const E = this.editing;
    let tx = E ? this.W / 2 : (this.box[0] + this.box[2]) / 2,
      tz = E ? this.H / 2 : (this.box[1] + this.box[3]) / 2,
      d = this.fit();
    if (this.focus && !E) {
      const r = this.rooms.find(x => x.id === this.focus);
      if (r) {
        tx = r.x + r.w / 2;
        tz = r.y + r.h / 2;
        d = Math.max(r.w, r.h) * 2.6 + 7;
      }
    }
    if (E && this.keys.size) {
      const k = dt * this.camDs * 0.45,
        c = Math.cos(this.yawS),
        s = Math.sin(this.yawS);
      const mx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
        mz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
      this.panX += (mx * c + mz * s) * k;
      this.panZ += (mz * c - mx * s) * k;
    }
    const vw = Math.max(0.3, 1 - this.vo.r / this.w),
      vh = Math.max(0.45, 1 - this.vo.b / this.h),
      asp = (this.w * vw) / (this.h * vh);
    d *= (Math.max(1, 1.25 / asp) / (E ? vh : 1)) * this.userZoom;
    // straight down, like a floor plan: square to the screen, the whole plot in view
    const plan = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
    if (this.top) {
      const side = Math.round(this.yaw / (Math.PI / 2)) % 2 !== 0;
      const pw = side ? this.H : this.W,
        ph = side ? this.W : this.H;
      d = ((Math.max(ph, pw / asp) / 0.4987 / vh) * 1.24 + 2) * this.userZoom;
    }
    const kk = 1 - Math.exp(-dt * (E ? 6 : 2.6));
    this.panX = Math.max(-this.W, Math.min(this.W, this.panX));
    this.panZ = Math.max(-this.H, Math.min(this.H, this.panZ));
    const ease = (v: number, to: number, k: number, eps: number) => (Math.abs(to - v) < eps ? to : v + (to - v) * k);
    this.camTs.x = ease(this.camTs.x, tx + this.panX, kk, 0.02);
    this.camTs.z = ease(this.camTs.z, tz + this.panZ, kk, 0.02);
    this.camDs = ease(this.camDs, d, kk, 0.04);
    this.yawS = ease(this.yawS, (this.top ? plan + 0.0001 : this.yaw) + (E || this.soft ? 0 : Math.sin(t * 0.07) * 0.03), kk, 0.0006);
    this.pitchS = ease(this.pitchS, this.top ? 1.5707 : this.pitch, Math.min(1, dt * 6), 0.0006);
    // keep clear of the exact diagonal so that walls do not flicker between two states
    if (this.plan && this.quadrant() !== this.quad) {
      const s = Math.abs(Math.sin(this.yawS)),
        c = Math.abs(Math.cos(this.yawS));
      if ((s > 0.04 && c > 0.04) || (this.quad & 4) !== (this.quadrant() & 4)) this.wallsAndThings();
    }
    this.vo.r = ease(this.vo.r, this.insetR, Math.min(1, dt * 6), 0.6);
    this.vo.b = ease(this.vo.b, this.insetB, Math.min(1, dt * 6), 0.6);
    const cp = Math.cos(this.pitchS),
      sp = Math.sin(this.pitchS);
    this.camera.position.set(
      this.camTs.x + Math.sin(this.yawS) * cp * this.camDs,
      sp * this.camDs,
      this.camTs.z + Math.cos(this.yawS) * cp * this.camDs,
    );
    this.camera.lookAt(this.camTs.x, 0.3, this.camTs.z);
    this.camera.setViewOffset(this.w, this.h, this.vo.r / 2, this.vo.b / 2, this.w, this.h);
  }
  resizeSoft(r: THREE.WebGLRenderer) {
    const pr = r.getPixelRatio();
    const w = Math.round(this.w * pr),
      h = Math.round(this.h * pr);
    this.baker!.resize(w, h);
    const k = this.e.software ? 0.62 : 0.85;
    const lw = Math.round(this.w * k),
      lh = Math.round(this.h * k);
    if (!this.lowRt)
      this.lowRt = new THREE.WebGLRenderTarget(lw, lh, { magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace } as any);
    if (this.lowRt.width !== lw || this.lowRt.height !== lh) this.lowRt.setSize(lw, lh);
  }
  private solid(on: boolean) {
    this.gGround.visible = this.gFloor.visible = this.gWalls.visible = this.gItems.visible = on;
  }
  /** the slow-machine path: a quick look while things move, the full picture as soon as they stop */
  render(r: THREE.WebGLRenderer, dt: number) {
    this.resizeSoft(r);
    const b = this.baker!;
    this.camera.updateMatrixWorld();
    const m = this.camera.matrixWorld.elements,
      q = this.lastCam.elements;
    let d = 0;
    for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(m[i] - q[i]));
    const vo = this.camera.view;
    const vk = vo ? vo.offsetX * 0.01 + vo.offsetY * 0.013 : 0;
    const moved = d > 0.0012 || Math.abs(vk - this.lastVo) > 0.003;
    if (moved) {
      this.lastCam.copy(this.camera.matrixWorld);
      this.lastVo = vk;
      this.still = 0;
      b.stop();
      this.dirty = true;
    } else this.still += dt;
    if (this.dirty && this.still > 0.1) {
      this.dirty = false;
      const keep = b.ready;
      if (this.bSun.shadow.camera.right !== this.sun.shadow.camera.right) {
        Object.assign(this.bSun.shadow.camera, {
          left: this.sun.shadow.camera.left,
          right: this.sun.shadow.camera.right,
          top: this.sun.shadow.camera.top,
          bottom: this.sun.shadow.camera.bottom,
          near: 1,
          far: 120,
        });
        this.bSun.shadow.camera.updateProjectionMatrix();
      }
      b.start(this.camera, keep);
    }
    b.step(this.beauty, this.exposure);
    r.autoClear = false;
    if (b.ready) {
      r.setRenderTarget(null);
      r.clear();
      b.draw(dt);
      this.solid(false);
      const bg = this.scene.background;
      const fog = this.scene.fog;
      this.scene.background = null;
      this.scene.fog = null;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = this.exposure * 1.12;
      r.render(this.scene, this.camera);
      r.toneMapping = THREE.NoToneMapping;
      this.scene.background = bg;
      this.scene.fog = fog;
      this.solid(true);
    } else {
      r.autoClear = true;
      r.setRenderTarget(this.lowRt);
      r.render(this.scene, this.camera);
      r.setRenderTarget(null);
      if (!this.upQ) {
        this.upQ = new THREE.Scene();
        const mt = new THREE.ShaderMaterial({
          vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
          fragmentShader:
            'varying vec2 vUv; uniform sampler2D t; void main(){ gl_FragColor=texture2D(t,vUv);\n#include <colorspace_fragment>\n }',
          uniforms: { t: { value: null } },
          depthTest: false,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mt);
        mesh.frustumCulled = false;
        this.upQ.add(mesh);
      }
      ((this.upQ.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.t.value = this.lowRt!.texture;
      r.render(this.upQ, this.upCam);
    }
    r.autoClear = true;
  }
  private lastVo = 0;
  private upQ: THREE.Scene | null = null;
  private upCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  project(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h];
  }
  dispose() {
    this.unhook?.();
    this.life.dispose();
    this.baker?.dispose();
    this.lowRt?.dispose();
    disposeScene(this.beauty);
    for (const p of this.people.values()) p.c.dispose();
    disposeScene(this.scene);
    for (const m of this.mats.values()) m.dispose();
  }
}
const STUBW = 1.1;
/** grass and asphalt up close: fine noise over the big ground picture */
function grain(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = q => {
    q.uniforms.uDet = { value: detailTex() };
    q.vertexShader = q.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGw=(modelMatrix*vec4(position,1.0)).xyz;');
    q.fragmentShader = q.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGw; uniform sampler2D uDet;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat gA=texture2D(uDet,vGw.xz*0.9).r, gB=texture2D(uDet,vGw.xz*0.13).a, gC=texture2D(uDet,vGw.xz*0.031).a; diffuseColor.rgb*=(0.66+0.5*gA)*(0.8+0.4*gB)*(0.86+0.28*gC);',
      );
  };
  m.customProgramCacheKey = () => 'grain';
}
