/** The small things: who talks to whom, what they say, what their faces and the floor look like, and what has just gone wrong. */
import * as THREE from 'three';
import type { HQView } from './hq.ts';
import { Kit } from './kit.ts';
import { EMO, FX_SAY, IDLE_SAY, SAY, type Emo, type FeedK } from '../data/life.ts';
import { away, dirt, emoOf, type Feed } from '../game/life.ts';
import type { Fx } from '../game/incidents.ts';
import type { G } from '../game/types.ts';
import { dow } from '../game/day.ts';
import type { Spot } from './hqnav.ts';
import { softTex } from './tex.ts';
type Tone = 'good' | 'bad' | 'flat';
interface Bubble {
  id: string;
  el: HTMLElement;
  until: number;
}
interface Moment {
  f: Feed;
  t: number;
  step: number;
  a: string;
  b?: string;
  lines: [string, string];
  tone: Tone;
  meet: boolean;
  back: [string, Spot | null][];
}
const OVER: Partial<Record<FeedK, 'talk' | 'argue' | 'rage' | 'laugh' | 'eat' | 'face' | 'wash'>> = {
  chat: 'talk',
  laugh: 'laugh',
  deep: 'talk',
  comfort: 'talk',
  praise: 'talk',
  help: 'talk',
  snap: 'argue',
  fight: 'argue',
  smell: 'argue',
  smellno: 'argue',
  dishes: 'argue',
  stole: 'argue',
  prankno: 'argue',
  prankok: 'laugh',
  noise: 'argue',
  gossip: 'talk',
  peace: 'talk',
  rage: 'rage',
  storm: 'argue',
  quit: 'argue',
  queue: 'argue',
  hangry: 'face',
  crash: 'face',
  call: 'talk',
};
const BAD = new Set<FeedK>([
  'snap',
  'fight',
  'smell',
  'smellno',
  'dishes',
  'stole',
  'prankno',
  'noise',
  'rage',
  'storm',
  'quit',
  'queue',
  'hangry',
  'gossip',
]);
const GOOD = new Set<FeedK>(['laugh', 'deep', 'comfort', 'praise', 'help', 'cooked', 'prankok', 'peace', 'chat', 'smellok']);
export class HouseLife {
  layer: HTMLElement;
  private bubbles: Bubble[] = [];
  private tags = new Map<string, { el: HTMLElement; emo: string }>();
  private queue: Moment[] = [];
  private now: Moment | null = null;
  private t = 0;
  private nextChat = 4;
  private nextErrand = 3;
  private errands = new Map<string, { until: number; back: Spot | null; over: string }>();
  private mess = new THREE.Group();
  private bmess = new THREE.Group();
  private messSig = '';
  fx: Fx = 'none';
  fxRoom = '';
  private fxT = 0;
  private parts: THREE.Points;
  private pp: Float32Array;
  private pc: Float32Array;
  private ps: Float32Array;
  private pd: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    l: number;
    m: number;
    r: number;
    g: number;
    b: number;
    s: number;
    gr: number;
  }[] = [];
  private water: THREE.Mesh | null = null;
  private bugs: THREE.InstancedMesh | null = null;
  /** nobody speaks while the editor or a menu is open */
  quiet = false;
  visible = true;
  selected: string | null = null;
  constructor(private v: HQView) {
    this.layer = document.createElement('div');
    this.layer.className = 'lifelayer';
    document.getElementById('hqlayer')?.after(this.layer);
    const n = 260;
    this.pp = new Float32Array(n * 3);
    this.pc = new Float32Array(n * 4);
    this.ps = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pc, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      vertexShader:
        'attribute vec4 color; attribute float size; varying vec4 vC; void main(){ vC=color; vec4 p=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*projectionMatrix[1][1]*300.0/-p.z; gl_Position=projectionMatrix*p; }',
      fragmentShader:
        'varying vec4 vC; uniform sampler2D t; void main(){ float a=texture2D(t,gl_PointCoord).a; gl_FragColor=vec4(vC.rgb,vC.a*a); }',
      uniforms: { t: { value: softTex() } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.parts = new THREE.Points(g, m);
    this.parts.frustumCulled = false;
    this.parts.renderOrder = 6;
    v.scene.add(this.parts, this.mess);
    v.stillScene?.add(this.bmess);
  }
  // ---------- clutter
  /** what the mess in each room looks like: cans, boxes, socks, paper */
  clutter(g: G) {
    const sig = g.rooms.map(r => r.id + Math.floor((g.life.mess[r.type] ?? 0) / 9)).join() + this.v.planKey;
    if (sig === this.messSig) return;
    this.messSig = sig;
    for (const q of [this.mess, this.bmess]) {
      q.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      q.clear();
    }
    const put = (low: boolean, into: THREE.Group, mat: THREE.Material) => {
      const k = new Kit();
      k.plain = low;
      for (const r of g.rooms) {
        const n = Math.floor((g.life.mess[r.type] ?? 0) / 9) * Math.max(1, Math.round(r.area / 26));
        if (!n) continue;
        const spots = this.v.freeSpots(r, n * 2);
        for (let i = 0; i < Math.min(n * 2, spots.length); i++) {
          const [x, z] = spots[i];
          const h = (i * 2654435761) >>> 0;
          junk(k, x, z, h % 9, (h % 628) / 100, g.club.c1, g.club.c2);
        }
      }
      if (!k.p.length) return;
      const m = new THREE.Mesh(k.geo(), mat);
      m.receiveShadow = m.castShadow = !low;
      into.add(m);
    };
    put(this.v.soft, this.mess, this.v.soft ? this.v.plainMat() : this.v.fineMat());
    if (this.v.soft) put(false, this.bmess, this.v.fineMat());
    this.v.touch();
  }
  // ---------- words
  say(id: string, text: string, ms = 2600, tone: Tone = 'flat') {
    if (!text || !this.v.people.has(id)) return;
    this.bubbles = this.bubbles.filter(b => {
      if (b.id !== id) return true;
      b.el.remove();
      return false;
    });
    const el = document.createElement('div');
    el.className = 'say ' + tone;
    el.textContent = text;
    this.layer.append(el);
    this.bubbles.push({ id, el, until: this.t + ms / 1000 });
  }
  play(list: Feed[]) {
    for (const f of list.slice(0, 8)) {
      if (f.k === 'inc' || f.k === 'mgr') continue;
      const L = SAY[f.k];
      const lines = L ? L[Math.floor(Math.random() * L.length)] : (['', ''] as [string, string]);
      this.queue.push({
        f,
        t: 0,
        step: 0,
        a: f.a,
        b: f.o || undefined,
        lines,
        tone: BAD.has(f.k) ? 'bad' : GOOD.has(f.k) ? 'good' : 'flat',
        meet: false,
        back: [],
      });
    }
    if (this.queue.length > 10) this.queue.length = 10;
  }
  clearMoments() {
    this.queue = [];
    this.endMoment();
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
  }
  get talking() {
    return !!this.now || this.queue.length > 0;
  }
  private endMoment() {
    const m = this.now;
    this.now = null;
    if (!m) return;
    for (const id of [m.a, m.b]) {
      const p = id ? this.v.people.get(id) : null;
      if (p && !this.errands.has(id!)) p.c.rig.over = '';
    }
    for (const [id, s] of m.back) {
      const p = this.v.people.get(id);
      if (p && s) p.w.go(s);
    }
  }
  private moment(dt: number) {
    if (!this.now) {
      const m = this.queue.shift();
      if (!m) return;
      const A = this.v.people.get(m.a),
        Bp = m.b ? this.v.people.get(m.b) : null;
      if (!A || !A.c.root.visible) return;
      this.now = m;
      if (Bp && Bp.c.root.visible) {
        const d = Math.hypot(A.w.x - Bp.w.x, A.w.z - Bp.w.z);
        const sit = (p: typeof A) => p!.w.state === 'in';
        // somebody on their feet walks over; two people at their desks talk from there
        const mover = !sit(A) ? A : !sit(Bp) ? Bp : m.tone === 'bad' && d > 2.2 ? A : null;
        const other = mover === A ? Bp : A;
        if (mover && d > 1.3) {
          const near = this.v.nav.nearest(
            other.w.x + (mover.w.x - other.w.x) * (0.95 / Math.max(0.95, d)),
            other.w.z + (mover.w.z - other.w.z) * (0.95 / Math.max(0.95, d)),
            1.6,
          );
          if (
            near &&
            this.v.nav.path(
              mover.w.state === 'in' && mover.w.spot ? mover.w.spot.ax : mover.w.x,
              mover.w.state === 'in' && mover.w.spot ? mover.w.spot.az : mover.w.z,
              near[0],
              near[1],
            )
          ) {
            m.back.push([mover.id, mover.w.spot]);
            mover.w.go({
              x: near[0],
              z: near[1],
              ax: near[0],
              az: near[1],
              ry: Math.atan2(other.w.x - near[0], other.w.z - near[1]),
              act: 'idle',
              kind: 'meet',
            });
            m.meet = true;
          }
        }
      }
      return;
    }
    const m = this.now;
    m.t += dt;
    const A = this.v.people.get(m.a),
      Bp = m.b ? this.v.people.get(m.b) : null;
    if (!A) return this.endMoment();
    if (m.step === 0) {
      const there = !m.meet || m.back.every(([id]) => this.v.people.get(id)?.w.arrived);
      if (!there && m.t < 9) return;
      m.step = 1;
      m.t = 0;
      for (const p of [A, Bp])
        if (p && Bp) {
          const o = p === A ? Bp : A;
          if (p.w.state === 'free') p.w.ry = Math.atan2(o.w.x - p.w.x, o.w.z - p.w.z);
        }
      const ov = OVER[m.f.k];
      if (ov) A.c.rig.over = ov as any;
      this.say(m.a, m.lines[0], 2600, m.tone);
      if (m.tone === 'bad' && m.f.k !== 'hangry') this.puff(A.w.x, 1.9, A.w.z, [1, 0.25, 0.1], 7, 0.5);
    } else if (m.step === 1 && m.t > 1.5) {
      m.step = 2;
      if (Bp && m.lines[1]) {
        const ov = OVER[m.f.k];
        Bp.c.rig.over = (ov === 'rage' ? 'face' : (ov ?? 'talk')) as any;
        this.say(m.b!, m.lines[1], 2600, m.tone);
      }
      if (m.f.k === 'rage') this.puff(A.w.x, 1.1, A.w.z, [0.9, 0.9, 0.9], 14, 1.2);
    } else if (m.step === 2 && m.t > 3.6) this.endMoment();
  }
  // ---------- a life between the blocks
  private errand(g: G) {
    // most people are where the day wants them
    if (this.errands.size >= Math.max(1, Math.round(this.v.people.size * 0.2))) return;
    const L = [...this.v.people.values()].filter(
      p => p.c.root.visible && !this.errands.has(p.id) && p.w.arrived && !(this.now && (this.now.a === p.id || this.now.b === p.id)),
    );
    if (!L.length) return;
    const p = L[Math.floor(Math.random() * L.length)];
    const l = g.life.p[p.id];
    const want: [string, string, number][] = [];
    const has = (k: string) => this.v.spots.some(s => s.kind === k && !s.used);
    if (l) {
      if (l.hun < 55) want.push(['kitchen:coach', 'eat', 3], ['kitchen:seat', 'eat', 3], ['kitchen:helper', 'eat', 1]);
      if (l.hyg < 60 && !l.q.includes('slob')) want.push(['bath:seat', 'wash', 2], ['bath:desk', 'wash', 2]);
      if (l.fun < 40) want.push(['lounge:play', '', 2], ['lounge:seat', 'phone', 1]);
    }
    want.push(
      ['bath:guest', 'phone', 0.5],
      ['bath:desk', 'wash', 0.4],
      ['kitchen:helper', 'eat', 0.6],
      ['wander', 'phone', 0.8],
      ['lounge:guest', 'phone', 0.4],
    );
    const ok = want.filter(w => has(w[0]));
    if (!ok.length) {
      p.c.rig.over = Math.random() < 0.5 ? 'scratch' : 'phone';
      this.errands.set(p.id, { until: this.t + 3 + Math.random() * 3, back: null, over: '' });
      return;
    }
    let r = Math.random() * ok.reduce((s, w) => s + w[2], 0);
    const w = ok.find(q => (r -= q[2]) < 0) ?? ok[0];
    const s = this.v.spots.find(q => q.kind === w[0] && !q.used)!;
    s.used = p.id;
    const back = p.w.spot;
    p.w.go(s);
    this.errands.set(p.id, { until: this.t + 14 + Math.random() * 9, back, over: w[1] });
  }
  reset() {
    this.errands.clear();
    for (const p of this.v.people.values()) p.c.rig.over = '';
    this.now = null;
  }
  private puff(x: number, y: number, z: number, c: [number, number, number], n: number, v: number) {
    for (let i = 0; i < n && this.pd.length < 250; i++) {
      const a = Math.random() * 6.28;
      this.pd.push({
        x,
        y,
        z,
        vx: Math.cos(a) * 0.25 * v,
        vy: 0.35 + Math.random() * 0.5 * v,
        vz: Math.sin(a) * 0.25 * v,
        l: 0,
        m: 0.8 + Math.random() * 0.6,
        r: c[0],
        g: c[1],
        b: c[2],
        s: 0.05 + Math.random() * 0.06,
        gr: 0.1,
      });
    }
  }
  setFx(fx: Fx, room = '') {
    if (fx === this.fx) return;
    this.fx = fx;
    this.fxRoom = room;
    this.fxT = 0;
    this.v.scrMode(fx === 'dark' ? 0 : fx === 'offline' ? 2 : 1);
    this.v.dark = fx === 'dark' ? 1 : 0;
    this.v.touch();
    document.documentElement.dataset.fx = fx;
    this.water?.removeFromParent();
    this.water?.geometry.dispose();
    this.water = null;
    this.bugs?.removeFromParent();
    this.bugs?.dispose();
    this.bugs = null;
    const b = this.v.boxOf(room || 'bath');
    if (fx === 'water' && b) {
      const m = new THREE.ShaderMaterial({
        vertexShader:
          'varying vec2 vP; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vP=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader:
          'varying vec2 vP; uniform float t,r; uniform vec2 c; float h(vec2 p){return sin(p.x*3.1+t*1.7)*sin(p.y*2.7-t*1.3)+sin((p.x+p.y)*5.0+t*2.1)*0.5;} void main(){ float d=length((vP-c)*vec2(1.0,1.1))+h(vP)*0.16; float a=smoothstep(r,r-0.35,d); float s=smoothstep(0.75,1.3,h(vP*1.6)); gl_FragColor=vec4(mix(vec3(0.16,0.34,0.42),vec3(0.75,0.9,0.95),s*0.6),a*0.55); }',
        uniforms: { t: { value: 0 }, r: { value: 0.4 }, c: { value: new THREE.Vector2(b[0] + b[2] / 2, b[1] + b[3] / 2) } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(b[2] + 5, b[3] + 5).rotateX(-Math.PI / 2), m);
      this.water.position.set(b[0] + b[2] / 2, 0.03, b[1] + b[3] / 2);
      this.water.renderOrder = 2;
      this.v.scene.add(this.water);
    }
    if (fx === 'bugs' && b) {
      this.bugs = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.035, 6, 4).scale(1, 0.5, 1.6),
        new THREE.MeshBasicMaterial({ color: '#2a1608' }),
        40,
      );
      this.bugs.frustumCulled = false;
      this.v.scene.add(this.bugs);
    }
  }
  update(dt: number, t: number) {
    this.t += dt;
    this.fxT += dt;
    const g = this.v.gameState;
    if (!g?.life || !this.visible) {
      this.layer.style.display = 'none';
      return;
    }
    this.layer.style.display = '';
    if (!this.quiet) {
      this.moment(dt * Math.min(2, this.v.timeScale));
      this.nextErrand -= dt;
      if (this.nextErrand < 0) {
        this.nextErrand = 2.2 + Math.random() * 3;
        this.errand(g);
      }
      this.nextChat -= dt;
      if (this.nextChat < 0 && !this.now && !this.queue.length) {
        this.nextChat = 3.2 + Math.random() * 4;
        this.chatter(g);
      }
    }
    for (const [id, e] of this.errands) {
      const p = this.v.people.get(id);
      if (!p) {
        this.errands.delete(id);
        continue;
      }
      if (e.over && p.w.arrived && p.w.state !== 'rise') p.c.rig.over = e.over as any;
      if (this.t > e.until) {
        this.errands.delete(id);
        p.c.rig.over = '';
        if (e.back && p.w.spot) {
          p.w.spot.used = undefined;
          p.w.go(e.back);
        }
      }
    }
    // smell, steam
    if (Math.random() < dt * 5)
      for (const p of this.v.people.values()) {
        const l = g.life.p[p.id];
        if (!l || !p.c.root.visible) continue;
        if (l.hyg < 28 && Math.random() < 0.5)
          this.pd.push({
            x: p.w.x + (Math.random() - 0.5) * 0.3,
            y: 1.0 + Math.random() * 0.4,
            z: p.w.z + (Math.random() - 0.5) * 0.3,
            vx: 0.05,
            vy: 0.22,
            vz: 0,
            l: 0,
            m: 2.2,
            r: 0.62,
            g: 0.78,
            b: 0.22,
            s: 0.1,
            gr: 0.12,
          });
        if (l.anger > 72 && Math.random() < 0.5)
          this.pd.push({
            x: p.w.x,
            y: 1.85,
            z: p.w.z,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.6,
            vz: (Math.random() - 0.5) * 0.3,
            l: 0,
            m: 0.9,
            r: 1,
            g: 0.28,
            b: 0.12,
            s: 0.09,
            gr: 0.16,
          });
      }
    const b = this.v.boxOf(this.fxRoom || 'kitchen');
    if (this.fx === 'smoke' && b) {
      for (let i = 0; i < 3 && this.pd.length < 250; i++)
        this.pd.push({
          x: b[0] + b[2] * 0.5 + (Math.random() - 0.5),
          y: 0.9,
          z: b[1] + 0.8 + Math.random() * 0.6,
          vx: 0.1,
          vy: 0.9,
          vz: 0.05,
          l: 0,
          m: 2.6,
          r: 0.2,
          g: 0.19,
          b: 0.18,
          s: 0.3,
          gr: 0.5,
        });
      if (Math.random() < 0.7)
        this.pd.push({
          x: b[0] + b[2] * 0.5 + (Math.random() - 0.5) * 0.7,
          y: 0.95,
          z: b[1] + 0.8 + Math.random() * 0.4,
          vx: 0,
          vy: 1.1,
          vz: 0,
          l: 0,
          m: 0.5,
          r: 1,
          g: 0.55,
          b: 0.12,
          s: 0.2,
          gr: -0.2,
        });
    }
    if (this.fx === 'party' && Math.random() < dt * 30) {
      const q = this.v.planBox;
      const c = [
        [1, 0.8, 0.2],
        [0.3, 0.8, 1],
        [1, 0.35, 0.5],
        [0.5, 1, 0.5],
      ][Math.floor(Math.random() * 4)];
      this.pd.push({
        x: q[0] + Math.random() * (q[2] - q[0]),
        y: 2.6,
        z: q[1] + Math.random() * (q[3] - q[1]),
        vx: (Math.random() - 0.5) * 0.6,
        vy: -0.7,
        vz: (Math.random() - 0.5) * 0.6,
        l: 0,
        m: 3,
        r: c[0],
        g: c[1],
        b: c[2],
        s: 0.06,
        gr: 0,
      });
    }
    if (this.water) {
      const u = (this.water.material as THREE.ShaderMaterial).uniforms;
      u.t.value = t;
      u.r.value = Math.min(4.4, 0.4 + this.fxT * 0.22);
    }
    if (this.bugs && b) {
      const M = new THREE.Matrix4();
      for (let i = 0; i < 40; i++) {
        const a = i * 2.4,
          k = t * (0.5 + (i % 5) * 0.12) + i;
        const x = b[0] + b[2] * (0.5 + 0.44 * Math.sin(k * 0.7 + a) * Math.cos(k * 0.31)),
          z = b[1] + b[3] * (0.5 + 0.44 * Math.cos(k * 0.6 + a * 2) * Math.sin(k * 0.27 + 1));
        M.makeRotationY(k).setPosition(x, 0.02, z);
        this.bugs.setMatrixAt(i, M);
      }
      this.bugs.instanceMatrix.needsUpdate = true;
    }
    this.particles(dt);
    this.labels(g);
  }
  private chatter(g: G) {
    const L = [...this.v.people.values()].filter(p => p.c.root.visible && p.w.arrived && !this.errands.has(p.id));
    if (!L.length) return;
    const p = L[Math.floor(Math.random() * L.length)];
    const l = g.life.p[p.id];
    const e = l ? emoOf(g, p.id) : 'calm';
    let line = '';
    const now = FX_SAY[this.fx];
    if (now && p.id !== 'me') {
      this.say(p.id, now[Math.floor(Math.random() * now.length)], 2600, this.fx === 'party' ? 'good' : 'bad');
      return;
    }
    if (l && Math.random() < 0.45) {
      const M: Partial<Record<Emo, string[]>> = {
        hungry: ['So hungry.', 'Is there food?', 'My stomach is scrimming.'],
        tired: ['*yawn*', 'Coffee. Now.', 'Slept three hours.'],
        angry: ['Don’t talk to me.', 'Ugh!', 'This place…'],
        furious: ['I swear…', 'One more word.', '!!!'],
        disgusted: ['Who left this?', 'It’s moving.', 'I can’t live like this.'],
        sad: ['…', 'What’s the point.', 'I miss home.'],
        anxious: ['What if we lose?', 'Hands are shaking.', 'Breathe.'],
        happy: ['Good day.', 'Love this team.', '♪'],
        excited: ['Let’s GO!', 'We’re so good.', 'Again! Again!'],
      };
      const q = M[e];
      if (q) line = q[Math.floor(Math.random() * q.length)];
      if (!line && l.hyg < 30) line = l.q.includes('slob') ? 'Smells like victory.' : 'I need a shower.';
    }
    if (!line && p.title) {
      const sq = g.squads[p.title];
      const b = sq?.week[dow(g.day)][Math.min(2, this.v.block)];
      const q = b ? IDLE_SAY[b] : null;
      if (q) line = q[Math.floor(Math.random() * q.length)];
    }
    if (line)
      this.say(
        p.id,
        line,
        2300,
        e === 'angry' || e === 'furious' || e === 'disgusted' ? 'bad' : e === 'happy' || e === 'excited' ? 'good' : 'flat',
      );
  }
  private particles(dt: number) {
    let n = 0;
    for (let i = this.pd.length - 1; i >= 0; i--) {
      const p = this.pd[i];
      p.l += dt;
      if (p.l > p.m) {
        this.pd.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (n >= 260) continue;
      this.pp.set([p.x, p.y, p.z], n * 3);
      const k = p.l / p.m;
      this.pc.set([p.r, p.g, p.b, Math.sin(Math.min(1, k * 3) * 1.57) * (1 - k) * 0.75], n * 4);
      this.ps[n] = Math.max(0.01, p.s + p.gr * p.l);
      n++;
    }
    const g = this.parts.geometry;
    g.setDrawRange(0, n);
    if (n) for (const k of ['position', 'color', 'size']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
  /** bubbles and mood marks sit over heads, in crisp HTML */
  private labels(g: G) {
    const close = this.v.zoom < 34;
    const seen = new Set<string>();
    for (const p of this.v.people.values()) {
      if (!p.c.root.visible) continue;
      const l = g.life.p[p.id];
      const e = l ? emoOf(g, p.id) : 'calm';
      const strong = e === 'angry' || e === 'furious' || e === 'hungry' || e === 'tired' || e === 'disgusted' || e === 'sad';
      const smelly = !!l && l.hyg < 28;
      const name = close || this.selected === p.id;
      const speaking = this.bubbles.some(b => b.id === p.id);
      if (speaking || (!strong && !smelly && !name)) continue;
      seen.add(p.id);
      let tag = this.tags.get(p.id);
      const key = e + smelly + name + p.nick;
      if (!tag || tag.emo !== key) {
        tag?.el.remove();
        const el = document.createElement('div');
        el.className = 'mood' + (name ? ' named' : '');
        el.style.setProperty('--mc', EMO[e].col);
        el.innerHTML = (strong || smelly || name ? this.v.icon(smelly && !strong ? 'wind' : EMO[e].icon) : '') + (name ? `<b></b>` : '');
        if (name) el.querySelector('b')!.textContent = p.nick;
        this.layer.append(el);
        this.tags.set(p.id, (tag = { el, emo: key }));
      }
      const [x, y, vis] = this.v.headOf(p);
      tag.el.style.display = vis ? '' : 'none';
      tag.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const [id, t] of this.tags)
      if (!seen.has(id)) {
        t.el.remove();
        this.tags.delete(id);
      }
    this.bubbles = this.bubbles.filter(b => {
      const p = this.v.people.get(b.id);
      if (!p || this.t > b.until || !p.c.root.visible) {
        b.el.remove();
        return false;
      }
      const [x, y, vis] = this.v.headOf(p);
      b.el.style.display = vis ? '' : 'none';
      b.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      return true;
    });
  }
  dispose() {
    this.layer.remove();
    delete document.documentElement.dataset.fx;
    this.parts.geometry.dispose();
  }
}
void away;
void dirt;
function junk(k: Kit, x: number, z: number, kind: number, a: number, c1: string, c2: string) {
  k.push(x, 0.012, z, a);
  if (kind === 0) {
    k.cyl(0, 0, 0, 0.033, 0.12, c1, { rz: Math.PI / 2, seg: 10, m: 'metal' });
  } else if (kind === 1) {
    k.rbox(0, 0, 0, 0.34, 0.04, 0.34, '#d9c29a', { b: 0.008, m: 'paint' });
    k.rbox(0, 0.03, -0.19, 0.34, 0.02, 0.34, '#d9c29a', { b: 0.006, rx: -1.1, m: 'paint' });
    k.cyl(0.05, 0.035, 0.04, 0.1, 0.012, '#c9822f', { seg: 10, m: 'paint' });
  } else if (kind === 2) {
    k.ico(0, 0.05, 0, 0.06, '#eef1f2', { det: 0, m: 'paint' });
    k.ico(0.14, 0.04, 0.06, 0.045, '#e2e4e0', { det: 0, m: 'paint' });
  } else if (kind === 3) {
    k.pillow(0, 0, 0, 0.12, 0.06, 0.26, '#f2f2ee', { m: 'cloth', puff: 0.6 });
    k.pillow(0.1, 0, 0.1, 0.11, 0.06, 0.22, c2, { m: 'cloth', puff: 0.6, ry: 0.8 });
  } else if (kind === 4) {
    k.lathe(
      0,
      0,
      0,
      [
        [0, 0],
        [0.035, 0],
        [0.05, 0.11],
        [0.046, 0.11],
        [0.03, 0.01],
        [0, 0.01],
      ],
      '#f2f2ee',
      { m: 'paint', seg: 12 },
    );
  } else if (kind === 5) {
    k.pillow(0, 0, 0, 0.5, 0.08, 0.42, c1, { m: 'cloth', puff: 0.6 });
    k.pillow(0.18, 0.02, 0.12, 0.3, 0.07, 0.16, c1, { m: 'cloth', puff: 0.6, ry: 0.7 });
  } else if (kind === 6) {
    k.lathe(
      0,
      0,
      0,
      [
        [0, 0],
        [0.06, 0],
        [0.11, 0.014],
        [0, 0.008],
      ],
      '#f4f2ec',
      { m: 'gloss', seg: 16 },
    );
    k.ico(0.02, 0.022, 0.01, 0.03, '#7a4a22', { det: 0 });
  } else if (kind === 7) {
    k.cyl(0, 0, 0, 0.03, 0.2, '#6fb26a', { rz: Math.PI / 2, seg: 10, m: 'glass' });
    k.cyl(0.12, 0.012, 0.05, 0.033, 0.12, c2, { rz: 1.4, seg: 10, m: 'metal' });
  } else {
    k.rbox(0, 0, 0, 0.2, 0.012, 0.1, '#c5432f', { b: 0.004, ry: 0.4 });
    k.rbox(0.08, 0.003, 0.12, 0.18, 0.01, 0.07, '#e8c35a', { b: 0.004, ry: -0.5 });
  }
  k.pop();
}
