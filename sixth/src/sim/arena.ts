/** Hero shooter simulation (Overwatch class): control and escort. Deterministic. */
import { Rng } from '../core/rng.ts';
import { angDiff, clamp, datan2, dcos, dsin, hyp, PI } from '../core/dmath.ts';
import { sha256 } from '../core/hash.ts';
import { along, getMap, plen, type ArenaMap, type P } from './maps.ts';
import { separate } from './bodies.ts';
import { OW_BY, type OwHero } from '../data/heroes.ts';
import type { Actor, Ev, GameResult, MatchCfg, OrderDef, PStat, Sim, SimPlayer, SimTeam } from './types.ts';
export interface Fig extends Actor {
  p: SimPlayer;
  h: OwHero;
  cds: number[];
  ac: number;
  ult: number;
  respawn: number;
  path: [number, number][];
  goal: P | null;
  repath: number;
  tgt: number;
  seen: number;
  stun: number;
  barrier: number;
  barrierOn: boolean;
  barrierCd: number;
  boost: number;
  nano: number;
  shield: number;
  k: number;
  d: number;
  a: number;
  dmg: number;
  heal: number;
  obj: number;
  hitBy: number[];
  tilt: number;
  vx: number;
  vy: number;
  castT: number;
  fireT: number;
  hurtT: number;
  beam: number;
  strafe: number;
  strafeT: number;
  od: number;
  kind: 'fig';
  hook: number;
  pinned: number;
  seenT: number[];
  hold: boolean;
  anti: number;
  stuck: number;
}
/** big heroes are wider, but always fit a one-metre gap */
export const rad = (f: { h: OwHero }) => Math.min(0.49, 0.42 * (f.h.look.s ?? 1));
interface Proj {
  x: number;
  y: number;
  dx: number;
  dy: number;
  sp: number;
  life: number;
  by: number;
  dmg: number;
  r: number;
  kind: string;
  id: number;
  col: string;
}
interface Zone {
  x: number;
  y: number;
  r: number;
  t: number;
  T: number;
  team: number;
  by: number;
  kind: string;
  col: string;
}
export class ArenaSim implements Sim {
  tick = 0;
  done = false;
  score: [number, number] = [0, 0];
  actors: Fig[] = [];
  ev: Ev[] = [];
  map: ArenaMap;
  rng: Rng;
  log: string[] = [];
  projs: Proj[] = [];
  zones: Zone[] = [];
  uid = 1;
  ph: 'ready' | 'live' | 'break' = 'ready';
  phT = 60;
  rt = 0;
  sub = 0;
  own: -1 | 0 | 1 = -1;
  cap = 0;
  pct: [number, number] = [0, 0];
  cart = 0;
  best: [number, number] = [0, 0];
  atk: 0 | 1 = 0;
  timeLeft = 0;
  cps: number[] = [];
  cpI = 0;
  pathLen = 0;
  cartPos: P = [0, 0];
  contested = false;
  ot = 0;
  mode: [string, string] = ['auto', 'auto'];
  modeT: [number, number] = [0, 0];
  ults: ['auto' | 'hold' | 'go', 'auto' | 'hold' | 'go'] = ['auto', 'auto'];
  timeouts: [number, number] = [2, 2];
  calm: [number, number] = [0, 0];
  winner: 0 | 1 = 0;
  engaged: [number, number] = [0, 0];
  ultGo: [number, number] = [0, 0];
  packT: number[];
  constructor(public cfg: MatchCfg) {
    this.map = getMap(cfg.map) as ArenaMap;
    this.map = { ...this.map, grid: this.map.grid.fork() };
    this.rng = Rng.of(cfg.seed);
    this.packT = this.map.packs.map(() => 0);
    cfg.teams.forEach((tm, ti) =>
      tm.players.forEach(p => {
        const h = OW_BY[p.hero ?? 'vector'] ?? OW_BY.vector;
        this.actors.push({
          kind: 'fig',
          i: this.actors.length,
          team: ti as 0 | 1,
          x: 0,
          y: 0,
          dir: 0,
          hp: h.hp,
          maxHp: h.hp,
          alive: true,
          anim: 'idle',
          nick: p.nick,
          num: p.num,
          hero: h.id,
          role: p.role,
          p,
          h,
          cds: [0, 0],
          ac: 0,
          ult: 0,
          respawn: 0,
          path: [],
          goal: null,
          repath: 0,
          tgt: -1,
          seen: 0,
          stun: 0,
          barrier: 700,
          barrierOn: false,
          barrierCd: 0,
          boost: 0,
          nano: 0,
          shield: 0,
          k: 0,
          d: 0,
          a: 0,
          dmg: 0,
          heal: 0,
          obj: 0,
          hitBy: new Array(10).fill(-999),
          tilt: 0,
          vx: 0,
          vy: 0,
          castT: 0,
          fireT: -99,
          hurtT: -99,
          beam: -1,
          strafe: 1,
          strafeT: 0,
          od: 0,
          hook: 0,
          pinned: 0,
          seenT: new Array(10).fill(0),
          hold: false,
          stuck: 0,
          anti: 0,
        });
      }),
    );
    if (this.map.path) {
      this.pathLen = plen(this.map.path);
      this.cps = [0.38, 0.7, 1].map(f => f * this.pathLen);
      this.atk = this.rng.chance(0.5) ? 1 : 0;
    }
    this.startRound();
  }
  emit(k: string, o: object = {}) {
    this.ev.push({ k, ...o });
  }
  say(s: string) {
    this.log.push(`${this.clock()} ${s}`);
    this.emit('say', { s });
  }
  team(i: number): SimTeam {
    return this.cfg.teams[i];
  }
  escort() {
    return this.map.mode === 'escort';
  }
  clock() {
    const s = Math.max(0, Math.ceil((this.escort() ? this.timeLeft : this.rt) / 10));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  phase() {
    return this.ph === 'ready' ? 'Setup' : this.escort() ? `${this.team(this.atk).tag} attack` : `Round ${this.sub + 1}`;
  }
  alive(t: number) {
    return this.actors.filter(a => a.team === t && a.alive);
  }
  spawnOf(t: number): P {
    if (!this.escort()) return this.map.spawn[t];
    if (t === this.atk) return this.map.spawn[0];
    const f = this.cart / this.pathLen;
    return f > 0.72 ? [84, 20] : this.map.spawn[1];
  }
  startRound() {
    this.ph = 'ready';
    this.phT = 60;
    this.rt = 0;
    this.own = -1;
    this.cap = 0;
    this.pct = [0, 0];
    this.cart = 0;
    this.cpI = 0;
    this.timeLeft = 1900;
    this.projs = [];
    this.zones = [];
    this.ot = 0;
    this.contested = false;
    if (this.map.path) this.cartPos = this.map.path[0];
    for (const a of this.actors) {
      this.place(a);
      if (this.sub === 0 || !this.escort()) a.ult *= 0.5;
      a.cds = [0, 0];
    }
    this.emit('round', { n: this.sub + 1, atk: this.atk });
  }
  place(a: Fig) {
    const s = this.spawnOf(a.team);
    const [x, y] = this.map.grid.nearestWalk(s[0] + ((a.i % 5) - 2) * 1.1, s[1] + ((a.i % 2) * 2 - 1));
    a.x = x;
    a.y = y;
    a.hp = a.maxHp;
    a.alive = true;
    a.anim = 'idle';
    a.path = [];
    a.goal = null;
    a.stun = 0;
    a.boost = 0;
    a.nano = 0;
    a.shield = 0;
    a.barrier = 700;
    a.od = 0;
    a.tgt = -1;
    a.hook = 0;
    a.anti = 0;
    a.dir = datan2(this.map.point[1] - y, this.map.point[0] - x);
  }
  nerve(a: Fig, v: number) {
    return v * (1 - a.tilt * 0.14 + (this.calm[a.team] > 0 ? 0.04 : 0) - (this.tick > 4200 ? (1 - a.p.st.focus) * 0.05 : 0));
  }
  objPos(): P {
    return this.escort() ? this.cartPos : this.map.point;
  }
  step() {
    if (this.done) return;
    this.ev.length = 0;
    this.tick++;
    for (const i of [0, 1]) if (this.calm[i] > 0) this.calm[i]--;
    if (this.ph === 'ready') {
      if (--this.phT <= 0) {
        this.ph = 'live';
        this.emit('live');
      }
      if (this.escort()) for (const a of this.actors) if (a.team !== this.atk) this.brain(a, true);
      for (const a of this.actors) this.move(a);
      this.settle();
      return;
    }
    if (this.ph === 'break') {
      if (--this.phT <= 0) {
        if (this.fin()) {
          this.done = true;
          this.emit('end');
        } else {
          if (this.escort()) this.atk = (1 - this.atk) as 0 | 1;
          this.startRound();
        }
      }
      return;
    }
    this.rt++;
    for (let i = 0; i < this.packT.length; i++) if (this.packT[i] > 0) this.packT[i]--;
    for (const i of [0, 1] as const) {
      if (this.modeT[i] > 0 && --this.modeT[i] === 0) this.mode[i] = 'auto';
      if (this.ultGo[i] > 0) this.ultGo[i]--;
      this.engaged[i] *= 0.96;
    }
    for (const a of this.actors) {
      if (!a.alive) {
        if (--a.respawn <= 0) {
          this.place(a);
          this.emit('spawn', { i: a.i });
        }
        continue;
      }
      this.brain(a, false);
    }
    for (const a of this.actors) if (a.alive) this.move(a);
    this.settle();
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      const x0 = p.x,
        y0 = p.y;
      const free = this.map.grid.ray(x0, y0, x0 + p.dx * p.sp, y0 + p.dy * p.sp);
      p.x += p.dx * p.sp * free;
      p.y += p.dy * p.sp * free;
      let gone = --p.life <= 0 || free < 1;
      const by = this.actors[p.by];
      let hitT: Fig | null = null;
      for (const e of this.actors)
        if (e.alive && e.team !== by.team) {
          // hitbox against the whole step, so a fast projectile cannot skip over anyone
          const u = clamp((e.x - x0) * p.dx + (e.y - y0) * p.dy, 0, p.sp * free);
          const d = hyp(e.x - (x0 + p.dx * u), e.y - (y0 + p.dy * u));
          if (e.barrierOn && d < 2.6 && Math.abs(angDiff(datan2(p.y - e.y, p.x - e.x), e.dir)) < 0.9) {
            this.hitBarrier(e, p.dmg);
            gone = true;
            break;
          }
          if (d < 0.95 * (e.h.look.s ?? 1)) {
            hitT = e;
            gone = true;
            break;
          }
        }
      if (gone) {
        this.projs.splice(i, 1);
        if (p.r > 0) {
          this.emit('boom', { x: p.x, y: p.y, s: p.r / 4, col: p.col });
          for (const e of this.actors)
            if (e.alive && e.team !== by.team && hyp(e.x - p.x, e.y - p.y) < p.r && this.map.grid.los(x0, y0, e.x, e.y))
              this.hurt(e, by, p.dmg * (e === hitT ? 1 : 1 - (hyp(e.x - p.x, e.y - p.y) / p.r) * 0.6));
        } else if (hitT) {
          this.hurt(hitT, by, p.dmg);
          this.emit('impact', { x: p.x, y: p.y, col: p.col });
        }
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t--;
      const by = this.actors[z.by];
      if (z.kind === 'nova') {
        if (z.t <= 0) {
          this.emit('boom', { x: z.x, y: z.y, s: z.r / 3, col: z.col });
          for (const e of this.actors)
            if (e.alive && e.team !== z.team && hyp(e.x - z.x, e.y - z.y) < z.r && this.map.grid.los(z.x, z.y, e.x, e.y))
              this.hurt(e, by, 260);
        }
      } else if (z.kind === 'storm' && z.t % 5 === 0) {
        for (const e of this.actors)
          if (e.alive && hyp(e.x - z.x, e.y - z.y) < z.r && this.map.grid.los(z.x, z.y, e.x, e.y)) {
            if (e.team !== z.team) this.hurt(e, by, 30);
            else this.mend(e, by, 34);
          }
      } else if (z.kind === 'barrage' && z.t % 4 === 0) {
        const es = this.actors.filter(
          e => e.alive && e.team !== z.team && hyp(e.x - z.x, e.y - z.y) < z.r && this.map.grid.los(z.x, z.y, e.x, e.y),
        );
        if (es.length) {
          const e = this.rng.pick(es);
          this.emit('boom', { x: e.x, y: e.y, s: 0.5, col: z.col });
          this.hurt(e, by, 58);
        }
      }
      if (z.t <= 0) this.zones.splice(i, 1);
    }
    this.objective();
  }
  objective() {
    const o = this.objPos(),
      r = this.map.pr;
    const on = [0, 1].map(t => this.actors.filter(a => a.alive && a.team === t && hyp(a.x - o[0], a.y - o[1]) < r).length);
    this.contested = on[0] > 0 && on[1] > 0;
    if (this.rt % 10 === 0) for (const a of this.actors) if (a.alive && hyp(a.x - o[0], a.y - o[1]) < r) a.obj += 0.1;
    if (!this.escort()) {
      if (!this.contested) {
        const t = on[0] > 0 ? 0 : on[1] > 0 ? 1 : -1;
        if (t >= 0 && t !== this.own) {
          this.cap += 1.1 * Math.min(3, on[t]) * (t === 0 ? 1 : -1);
          if (Math.abs(this.cap) >= 60) {
            this.own = t as 0 | 1;
            this.cap = 0;
            this.emit('cap', { team: t });
            this.say(`${this.team(t).name} take the point`);
          }
        } else if (t === this.own || t < 0) this.cap *= 0.92;
      }
      if (this.own >= 0) {
        const w = this.own as 0 | 1;
        const lim = 99;
        if (this.pct[w] < lim) this.pct[w] += 0.115;
        else if ((!this.contested && this.cap === 0) || this.ot > 300) {
          this.win(w);
          return;
        } else {
          this.ot++;
          if (Math.abs(this.cap) < 0.5 && !this.contested && on[1 - w] === 0) {
            this.win(w);
            return;
          }
        }
        if (this.pct[w] >= lim && !this.contested && on[1 - w] === 0) {
          this.win(w);
          return;
        }
      }
    } else {
      const A = this.atk,
        D = (1 - A) as 0 | 1;
      const target = this.sub === 1 ? this.best[D] : 1e9;
      if (!this.contested && on[A] > 0) this.cart += 0.05 * (1 + 0.25 * Math.min(2, on[A] - 1));
      else if (on[A] === 0 && on[D] > 0) this.cart = Math.max(this.cpI ? this.cps[this.cpI - 1] : 0, this.cart - 0.012);
      this.cartPos = along(this.map.path!, this.cart);
      if (this.cart >= this.cps[this.cpI]) {
        this.cpI++;
        if (this.cpI >= 3) {
          this.endEscort();
          return;
        }
        this.timeLeft += 950;
        this.emit('checkpoint', { team: A });
        this.say(`${this.team(A).name} reach checkpoint ${this.cpI}`);
      }
      if (this.sub === 1 && this.cart > target + 0.3) {
        this.endEscort();
        return;
      }
      if (this.timeLeft > 0) this.timeLeft--;
      else if (on[A] === 0 || ++this.ot > 450) {
        this.endEscort();
        return;
      }
    }
  }
  endEscort() {
    this.best[this.atk] = this.cart + (this.cpI >= 3 ? 10 + this.timeLeft / 100 : 0);
    this.score[this.atk] = this.cpI;
    this.emit('roundEnd', { win: this.atk, why: 'escort', m: Math.round(this.cart) });
    this.say(`${this.team(this.atk).name} stop at ${Math.round(this.cart)} m`);
    this.sub++;
    this.ph = 'break';
    this.phT = 50;
  }
  win(t: 0 | 1) {
    this.score[t]++;
    this.sub++;
    this.emit('roundEnd', { win: t, why: 'control' });
    this.say(`${this.team(t).name} win the round`);
    const l = 1 - t;
    for (const a of this.actors)
      if (a.team === l) a.tilt = clamp(a.tilt + 0.12 * (1.25 - a.p.st.comp), 0, 1);
      else a.tilt *= 0.8;
    this.ph = 'break';
    this.phT = 50;
  }
  fin() {
    if (this.escort()) {
      if (this.sub < 2) return false;
      this.winner =
        this.best[0] > this.best[1]
          ? 0
          : this.best[1] > this.best[0]
            ? 1
            : this.actors.filter(a => a.team === 0).reduce((s, a) => s + a.k, 0) >=
                this.actors.filter(a => a.team === 1).reduce((s, a) => s + a.k, 0)
              ? 0
              : 1;
      if (this.score[0] === this.score[1]) this.score[this.winner]++;
      return true;
    }
    if (this.score[0] >= 2 || this.score[1] >= 2) {
      this.winner = this.score[0] > this.score[1] ? 0 : 1;
      return true;
    }
    return false;
  }
  hitBarrier(e: Fig, d: number) {
    e.barrier -= d;
    this.emit('bhit', { i: e.i });
    if (e.barrier <= 0) {
      e.barrierOn = false;
      e.barrierCd = 70;
      this.emit('bbreak', { i: e.i });
    }
  }
  mend(t: Fig, by: Fig, v: number) {
    if (t.anti > 0) return;
    v *= 0.6 + 0.65 * this.nerve(by, by.p.st.util);
    const q = Math.min(v, t.maxHp - t.hp);
    if (q <= 0) return;
    t.hp += q;
    by.heal += q;
    by.ult += q * 0.85;
  }
  hurt(v: Fig, by: Fig, d: number, crit = false) {
    if (!v.alive || v.pinned > 9000) return;
    d *= 1 - v.h.arm;
    d *= 1.2 - 0.4 * this.nerve(v, v.p.st.pos);
    if (v.nano > 0) d *= 0.6;
    if (v.boost > 0 && v.h.role === 'tank') d *= 0.85;
    if (by.nano > 0) d *= 1.45;
    if (by.boost > 0) d *= 1.15;
    if (v.shield > 0) {
      const q = Math.min(v.shield, d);
      v.shield -= q;
      d -= q;
    }
    const q = Math.min(d, v.hp);
    v.hp -= d;
    by.dmg += q;
    by.ult += q * 0.8;
    v.hitBy[by.i] = this.tick;
    v.hurtT = this.tick;
    this.engaged[by.team] += 1;
    this.emit('hit', { i: v.i, by: by.i, d: q, hs: crit });
    if (v.hp <= 0) {
      v.hp = 0;
      v.alive = false;
      v.anim = 'dead';
      v.d++;
      v.respawn = 95;
      v.barrierOn = false;
      v.path = [];
      by.k++;
      by.ult += 40;
      v.tilt = clamp(
        v.tilt + 0.05 * (1.3 - v.p.st.comp) * (v.p.traits.includes('hothead') ? 1.7 : v.p.traits.includes('ice') ? 0.5 : 1),
        0,
        1,
      );
      by.tilt *= 0.93;
      for (const a of this.actors)
        if (a.team === by.team && a !== by && (this.tick - v.hitBy[a.i] < 60 || (a.h.role === 'sup' && a.beam === by.i))) a.a++;
      this.emit('kill', { i: v.i, by: by.i, x: v.x, y: v.y, w: by.h.shot });
      const left = this.alive(v.team).length;
      if (left === 0) this.say(`${this.team(by.team).name} wipe the fight`);
    }
  }
  brain(a: Fig, setup: boolean) {
    const R = this.rng,
      st = a.p.st,
      g = this.map.grid,
      PL = this.team(a.team).plan,
      comp = PL.focus;
    a.vx = a.vy = 0;
    a.anim = 'idle';
    for (let j = 0; j < 2; j++) if (a.cds[j] > 0) a.cds[j]--;
    if (a.ac > 0) a.ac--;
    if (a.repath > 0) a.repath--;
    if (a.castT > 0) a.castT--;
    if (a.boost > 0) a.boost--;
    if (a.nano > 0) a.nano--;
    if (a.od > 0) a.od--;
    if (a.strafeT > 0) a.strafeT--;
    if (a.anti > 0) a.anti--;
    if (a.shield > 0) a.shield = Math.max(0, a.shield - 1.5);
    a.beam = -1;
    if (!setup) a.ult += 0.55 + (a.h.role === 'sup' ? 0.25 : 0);
    if (this.tick - a.hurtT > 40) a.hp = Math.min(a.maxHp, a.hp + 2.2);
    if (a.barrierCd > 0) {
      a.barrierCd--;
      if (a.barrierCd === 0) a.barrier = 500;
    } else if (!a.barrierOn) a.barrier = Math.min(700, a.barrier + 6);
    if (a.stun > 0) {
      a.stun--;
      a.anim = 'stun';
      a.barrierOn = false;
      return;
    }
    const en = this.actors.filter(e => e.team !== a.team && e.alive),
      al = this.alive(a.team);
    const o = this.objPos();
    const enemyNear = en.filter(e => hyp(e.x - a.x, e.y - a.y) < 30);
    // who can I see
    let tgt: Fig | null = null,
      bs = -1e9;
    for (const e of enemyNear) {
      const d = hyp(e.x - a.x, e.y - a.y);
      if (!g.los(a.x, a.y, e.x, e.y)) {
        a.seenT[e.i] = 0;
        continue;
      }
      a.seenT[e.i]++;
      const rngOk = d <= a.h.range * 1.15;
      const foc = al.filter(m => m.tgt === e.i).length * (0.5 + st.team);
      const s =
        (1 - e.hp / e.maxHp) * 7 +
        (rngOk ? 4 : 0) -
        d * 0.22 +
        foc +
        (e.h.role === 'sup' ? 2 * st.dec + (comp === 'dive' ? 2.5 : 0) : e.h.role === 'tank' ? (comp === 'brawl' ? 0.5 : -1.5) : 0.5) -
        (comp === 'poke' ? d * 0.06 : 0) +
        (a.tgt === e.i ? 1.5 : 0) -
        (e.barrierOn ? 3 : 0) +
        (e.stun > 0 ? 3 : 0);
      if (s > bs) {
        bs = s;
        tgt = e;
      }
    }
    a.tgt = tgt ? tgt.i : -1;
    const td = tgt ? hyp(tgt.x - a.x, tgt.y - a.y) : 99;
    const numA = al.length,
      numE = en.length,
      mode = this.mode[a.team];
    const tank = al.find(m => m.h.role === 'tank');
    const near = al.filter(m => hyp(m.x - a.x, m.y - a.y) < 12).length;
    const losing = numE - numA >= (PL.risk > 0.66 ? 3 : 2) || (numA <= 2 && numE >= 4);
    const must = this.escort()
      ? (a.team !== this.atk && this.cps[this.cpI] - this.cart < 4) || (a.team === this.atk && this.timeLeft < 80)
      : this.own === 1 - a.team && this.pct[1 - a.team] > 90;
    const back = (losing && !must && st.dec > 0.3 && !setup && hyp(a.x - o[0], a.y - o[1]) > 4) || mode === 'safe';
    if (tgt) {
      if (this.ability(a, tgt, td, al, en)) return;
      this.shoot(a, tgt, td, al);
    }
    if (a.h.heal > 0) this.support(a, al);
    // health
    if (a.hp < a.maxHp * 0.4 && this.tick - a.hurtT < 30 && a.h.role !== 'tank') {
      const pk = this.map.packs
        .map((p, i) => ({ p, i, d: hyp(p[0] - a.x, p[1] - a.y) }))
        .filter(p => this.packT[p.i] <= 0 && p.d < 16)
        .sort((x, y) => x.d - y.d)[0];
      if (pk && st.dec > 0.3) {
        if (pk.d < 1.4) {
          this.packT[pk.i] = 130;
          a.hp = Math.min(a.maxHp, a.hp + 150);
          this.emit('heal', { i: a.i });
        } else {
          this.walk(a, pk.p[0], pk.p[1]);
          return;
        }
      }
    }
    // move goal
    let gx = o[0],
      gy = o[1];
    const sp = this.spawnOf(a.team);
    const slot = a.i % 5;
    const dirIn = datan2(o[1] - sp[1], o[0] - sp[0]);
    const group =
      mode === 'group' ||
      (near < Math.min(comp === 'brawl' ? 4 : comp === 'dive' ? 2 : 3, numA) &&
        hyp(a.x - o[0], a.y - o[1]) > 17 &&
        mode !== 'push' &&
        R.chance((0.4 + st.team * 0.6) * (1.25 - PL.tempo * 0.5) * (1.15 - PL.style * 0.3)));
    if (setup) {
      const dp = along(this.map.path!, 16);
      gx = dp[0] + dcos(slot * 1.25) * 4;
      gy = dp[1] + dsin(slot * 1.25) * 3;
    } else if (back) {
      gx = a.x + (sp[0] - a.x) * 0.5;
      gy = a.y + (sp[1] - a.y) * 0.5;
      if (hyp(a.x - o[0], a.y - o[1]) > 26) {
        gx = a.x;
        gy = a.y;
      }
    } else if (group && !must) {
      const c = al.filter(m => hyp(m.x - o[0], m.y - o[1]) > 8);
      const cx = c.reduce((s, m) => s + m.x, 0) / Math.max(1, c.length),
        cy = c.reduce((s, m) => s + m.y, 0) / Math.max(1, c.length);
      if (c.length > 1) {
        gx = cx + (slot - 2);
        gy = cy + (slot % 2) * 2 - 1;
      }
    } else if (tgt && a.h.role === 'dps') {
      const flank = a.h.look.body === 'light' || a.h.look.body === 'rogue';
      const want = Math.min(a.h.range * (comp === 'dive' ? 0.46 : comp === 'brawl' ? 0.5 : comp === 'poke' ? 0.82 : 0.62), 15);
      if (td > want + 2) {
        gx = tgt.x;
        gy = tgt.y;
      } else if (td < want - 3 && !flank) {
        gx = a.x - (tgt.x - a.x);
        gy = a.y - (tgt.y - a.y);
      } else {
        gx = a.x;
        gy = a.y;
      }
      if (al.length && !must && hyp(a.x - o[0], a.y - o[1]) > 11 + PL.style * 8) {
        gx = (gx + o[0]) / 2;
        gy = (gy + o[1]) / 2;
      }
    } else if (a.h.role === 'sup' && tank && !must) {
      const td2 = tgt ? datan2(tank.y - tgt.y, tank.x - tgt.x) : dirIn + PI;
      const dist = a.h.shot === 'beam' ? 5 : 7;
      gx = tank.x + dcos(td2 + (slot === 3 ? 0.5 : -0.5)) * dist;
      gy = tank.y + dsin(td2 + (slot === 3 ? 0.5 : -0.5)) * dist;
    } else if (a.h.role === 'tank') {
      if (tgt && (td < 14 || mode === 'push')) {
        const w = a.h.range * 0.7;
        if (td > w) {
          gx = tgt.x;
          gy = tgt.y;
        } else {
          gx = a.x;
          gy = a.y;
        }
        const leash = hyp(a.x - o[0], a.y - o[1]);
        if (leash > 9.5 + PL.tempo * 7 && mode !== 'push') {
          gx = o[0];
          gy = o[1];
        }
      } else {
        gx = o[0];
        gy = o[1];
      }
    } else {
      gx = o[0] + dcos(slot * 1.25 + a.team) * 3;
      gy = o[1] + dsin(slot * 1.25 + a.team) * 3;
    }
    const dd = hyp(gx - a.x, gy - a.y);
    if (dd > 1.2) this.walk(a, gx, gy, tgt ? 0.82 : 1);
    if (tgt) {
      if (a.strafeT <= 0) {
        a.strafeT = R.int(4, 10);
        a.strafe = R.chance(0.5) ? 1 : -1;
      }
      const ang = datan2(tgt.y - a.y, tgt.x - a.x);
      const s = a.h.speed * 0.1 * (dd > 1.2 ? 0.35 : 0.7);
      a.vx += dcos(ang + (PI / 2) * a.strafe) * s;
      a.vy += dsin(ang + (PI / 2) * a.strafe) * s;
      this.face(a, ang);
      if (a.anim === 'idle') a.anim = 'run';
      if (this.tick - a.fireT < 3) a.anim = 'shoot';
    }
    a.barrierOn =
      a.h.ab.some(x => x.k === 'barrier') &&
      a.h.id === 'bulwark' &&
      a.barrierCd <= 0 &&
      a.barrier > 60 &&
      !!tgt &&
      td > 4.5 &&
      enemyNear.length >= 1;
    if (a.barrierOn) {
      a.anim = a.anim === 'run' ? 'shieldrun' : 'shield';
      a.vx *= 0.75;
      a.vy *= 0.75;
    }
  }
  face(a: Fig, to: number) {
    const d = angDiff(to, a.dir);
    a.dir += clamp(d, -0.6, 0.6);
  }
  blockedBy(a: Fig, e: Fig): Fig | null {
    for (const b of this.actors)
      if (b.alive && b.barrierOn && b.team === e.team && b !== e) {
        const bx = b.x + dcos(b.dir) * 1.6,
          by = b.y + dsin(b.dir) * 1.6;
        const dx = e.x - a.x,
          dy = e.y - a.y,
          l2 = dx * dx + dy * dy;
        const u = ((bx - a.x) * dx + (by - a.y) * dy) / Math.max(0.01, l2);
        if (u > 0 && u < 1 && hyp(a.x + dx * u - bx, a.y + dy * u - by) < 2.2) return b;
      } else if (b === e && b.barrierOn && Math.abs(angDiff(datan2(a.y - b.y, a.x - b.x), b.dir)) < 0.9) return b;
    return null;
  }
  shoot(a: Fig, t: Fig, d: number, al: Fig[]) {
    const h = a.h,
      R = this.rng,
      st = a.p.st;
    if (a.ac > 0 || a.castT > 0 || d > h.range * 1.2 || a.barrierOn) return;
    if (h.shot === 'beam' && al.some(m => m !== a && m.hp < m.maxHp * 0.9)) return;
    const react = 5 - Math.round(this.nerve(a, st.react) * 4);
    if (a.seenT[t.i] < react) return;
    if (Math.abs(angDiff(datan2(t.y - a.y, t.x - a.x), a.dir)) > 0.7) return;
    a.ac = Math.max(1, a.od > 0 ? Math.round(h.rof * 0.65) : h.rof);
    a.fireT = this.tick;
    const per = (h.dps * Math.max(1, h.rof)) / 10;
    const aim = this.nerve(a, st.mech);
    const tm = this.team(a.team);
    if (h.shot === 'proj') {
      const lead = 0.75 + aim * 0.4;
      const tt = d / 1.5;
      const ax = t.x + t.vx * tt * lead + (R.gauss() * (1.15 - aim) * 1.1 * d) / 14,
        ay = t.y + t.vy * tt * lead + (R.gauss() * (1.15 - aim) * 1.1 * d) / 14;
      const l = hyp(ax - a.x, ay - a.y) || 1;
      this.projs.push({
        id: this.uid++,
        x: a.x,
        y: a.y,
        dx: (ax - a.x) / l,
        dy: (ay - a.y) / l,
        sp: 1.5,
        life: 26,
        by: a.i,
        dmg: per * 1.55,
        r: h.id === 'skylark' ? 2.6 : 0,
        kind: h.id === 'skylark' ? 'rocket' : 'bolt',
        col: h.look.glow,
      });
      this.emit('pshot', { i: a.i });
      return;
    }
    const bl = this.blockedBy(a, t);
    if (bl && h.shot !== 'melee') {
      this.hitBarrier(bl, per);
      this.emit('shot', { i: a.i, x: a.x, y: a.y, tx: bl.x + dcos(bl.dir) * 1.5, ty: bl.y + dsin(bl.dir) * 1.5, hit: false, w: h.shot });
      return;
    }
    let p = (0.36 + aim * 0.62) * (t.vx * t.vx + t.vy * t.vy > 0.02 ? 0.94 - 0.12 * t.p.st.mech : 1) * (0.95 + 0.1 * tm.syn * tm.fam);
    if (h.shot === 'shotgun') p = Math.min(0.95, p * 1.25);
    if (h.shot === 'melee') p = 0.95;
    if (d > h.range) p *= 0.5;
    const fall = h.shot === 'shotgun' ? clamp(1.35 - d / h.range, 0.25, 1.15) : d > h.range * 0.7 ? 0.75 : 1;
    const hit = R.chance(p);
    const crit = hit && h.shot !== 'melee' && h.shot !== 'beam' && R.chance(0.06 + aim * 0.16);
    if (h.shot === 'melee') {
      this.emit('swing', { i: a.i });
      for (const e of this.actors)
        if (
          e.alive &&
          e.team !== a.team &&
          hyp(e.x - a.x, e.y - a.y) < h.range &&
          this.map.grid.los(a.x, a.y, e.x, e.y) &&
          Math.abs(angDiff(datan2(e.y - a.y, e.x - a.x), a.dir)) < 1
        )
          this.hurt(e, a, per);
      return;
    }
    const ms = hit ? 0 : (R.f() - 0.5) * 2.4,
      ang = datan2(t.y - a.y, t.x - a.x);
    this.emit('shot', {
      i: a.i,
      x: a.x,
      y: a.y,
      tx: t.x - dsin(ang) * ms,
      ty: t.y + dcos(ang) * ms,
      hit,
      w: h.shot,
      hs: crit,
      col: h.look.glow,
    });
    if (hit) this.hurt(t, a, per * fall * (crit ? 1.8 : 1) * (h.shot === 'hitscan' && h.rof > 3 ? 1.35 : 1.15), crit);
  }
  support(a: Fig, al: Fig[]) {
    const h = a.h;
    const c = al
      .filter(m => m !== a && m.hp < m.maxHp - 5 && hyp(m.x - a.x, m.y - a.y) < h.range * 1.1 && this.map.grid.los(a.x, a.y, m.x, m.y))
      .sort((x, y) => x.hp / x.maxHp - (x.h.role === 'tank' ? 0.05 : 0) - (y.hp / y.maxHp - (y.h.role === 'tank' ? 0.05 : 0)) || x.i - y.i);
    if (h.id === 'cadence') {
      for (const m of al) if (hyp(m.x - a.x, m.y - a.y) < 11) this.mend(m, a, h.heal * 0.05);
      return;
    }
    if (h.shot === 'beam') {
      const t = c[0] ?? al.find(m => m !== a && m.h.role === 'dps' && hyp(m.x - a.x, m.y - a.y) < h.range);
      if (t) {
        a.beam = t.i;
        if (t.hp < t.maxHp) this.mend(t, a, h.heal * 0.1);
        else {
          t.boost = Math.max(t.boost, 3);
        }
        this.emit('beam', { i: a.i, t: t.i, heal: t.hp < t.maxHp });
      }
      return;
    }
    if (c[0] && a.ac <= 1 && c[0].hp < c[0].maxHp * (0.55 + a.p.st.team * 0.3)) {
      a.ac = h.rof;
      a.fireT = this.tick;
      this.mend(c[0], a, ((h.heal * h.rof) / 10) * 1.25);
      this.emit('healshot', { i: a.i, t: c[0].i, col: h.look.glow });
    }
  }
  ability(a: Fig, t: Fig, d: number, al: Fig[], en: Fig[]): boolean {
    const R = this.rng,
      h = a.h,
      st = a.p.st,
      sk = this.nerve(a, st.util);
    if (a.castT > 0) return false;
    const ang = datan2(t.y - a.y, t.x - a.x);
    const cl = en.filter(e => hyp(e.x - t.x, e.y - t.y) < 6).length;
    const T = a.team;
    if (a.ult >= h.ult.cost && this.ults[T] !== 'hold') {
      const hurtN = al.filter(m => hyp(m.x - a.x, m.y - a.y) < 14 && m.hp < m.maxHp * 0.55).length;
      const PL = this.team(T).plan,
        even = al.length >= en.length - 1 - (PL.risk > 0.66 ? 1 : 0);
      const smart = st.dec * 0.6 + this.team(T).syn * 0.4;
      let want = false;
      const k = h.ult.k;
      const combo = this.ultGo[T] > 0 && R.chance(st.comms);
      if (k === 'slam' || k === 'nova' || k === 'storm') want = cl >= (R.chance(smart) ? 2 : 1) && d < 9;
      else if (k === 'barrage') want = cl >= 2 && d < h.range;
      else if (k === 'deadeye')
        want = en.filter(e => hyp(e.x - a.x, e.y - a.y) < 22 && e.hp < e.maxHp * 0.7 && this.map.grid.los(a.x, a.y, e.x, e.y)).length >= 1;
      else if (k === 'rally') want = d < 8 && en.length >= 2;
      else if (k === 'sound') want = hurtN >= (R.chance(smart) ? 2 : 1);
      else if (k === 'nano') want = al.some(m => m !== a && m.h.role !== 'sup' && m.tgt >= 0 && hyp(m.x - a.x, m.y - a.y) < 20);
      if (
        (want && even && R.chance((0.1 + smart * 0.2) * (0.65 + PL.risk * 0.7))) ||
        (combo && d < 14) ||
        (this.ults[T] === 'go' && d < 14 && (want || R.chance(0.2)))
      ) {
        this.ultimate(a, t, al, en);
        return true;
      }
    }
    for (let j = 0; j < 2; j++) {
      const ab = h.ab[j];
      if (a.cds[j] > 0) continue;
      const go = (p: number) => R.chance(p * (0.35 + sk * 0.9));
      const use = (o: object = {}) => {
        a.cds[j] = ab.cd * 10;
        a.castT = 3;
        a.anim = 'cast';
        this.emit('cast', { i: a.i, name: ab.name, ak: ab.k, x: t.x, y: t.y, col: h.look.glow, u: false, ...o });
      };
      switch (ab.k) {
        case 'dash':
          if (
            h.role === 'tank' || h.id === 'oni'
              ? d > 3 && d < 11 && go(0.1) && al.length >= en.length - 1
              : a.hp < a.maxHp * 0.45 && go(0.25)
          ) {
            const dir = h.role === 'tank' || h.id === 'oni' ? ang : ang + PI;
            const fx = a.x,
              fy = a.y;
            const L = Math.min(7, h.role === 'tank' || h.id === 'oni' ? Math.max(0, d - 1.4) : 6);
            [a.x, a.y] = this.map.grid.charge(a.x, a.y, dcos(dir) * L, dsin(dir) * L, rad(a));
            a.path = [];
            use({ fx, fy });
            this.emit('dash', { i: a.i, fx, fy, col: h.look.glow });
            if ((h.role === 'tank' || h.id === 'oni') && hyp(t.x - a.x, t.y - a.y) < 2.6) {
              this.hurt(t, a, 50);
              if (h.id === 'bulwark') t.stun = 6;
            }
            return true;
          }
          break;
        case 'blink':
          if ((a.hp < a.maxHp * 0.5 || d > h.range * 0.8) && go(0.2)) {
            const dir = a.hp < a.maxHp * 0.5 ? ang + PI * 0.8 : ang + 0.5;
            const fx = a.x,
              fy = a.y;
            [a.x, a.y] = this.map.grid.charge(a.x, a.y, dcos(dir) * 6, dsin(dir) * 6, rad(a));
            if (ab.name === 'Rewind') a.hp = Math.min(a.maxHp, a.hp + 90);
            a.path = [];
            use();
            this.emit('dash', { i: a.i, fx, fy, col: h.look.glow });
            return true;
          }
          break;
        case 'nade':
          if (d < 15 && go(0.07)) {
            use();
            const dm = dodgeable(R, t, sk);
            if (h.role === 'sup') {
              for (const m of al) if (hyp(m.x - t.x, m.y - t.y) < 5) this.mend(m, a, 80);
              if (!dm) {
                t.anti = 35;
                this.hurt(t, a, 45);
              }
            } else if (!dm) {
              this.hurt(t, a, 55);
              if (ab.name === 'Stun Pin') t.stun = 8;
            }
            if (h.id === 'harrow') a.hp = Math.min(a.maxHp, a.hp + 160);
            this.emit('boom', { x: t.x, y: t.y, s: 0.4, col: h.look.glow });
            return true;
          }
          break;
        case 'rocket':
          if (d < 20 && d > 4 && go(0.09)) {
            use();
            const l = d || 1;
            this.projs.push({
              id: this.uid++,
              x: a.x,
              y: a.y,
              dx: (t.x - a.x) / l,
              dy: (t.y - a.y) / l,
              sp: 1.6,
              life: 26,
              by: a.i,
              dmg: 90,
              r: 2.6,
              kind: 'rocket',
              col: h.look.glow,
            });
            return true;
          }
          break;
        case 'hook':
          if (d > 5 && d < 17 && go(0.1) && !this.blockedBy(a, t)) {
            use();
            if (!dodgeable(R, t, sk)) {
              const fx = t.x,
                fy = t.y;
              [t.x, t.y] = this.map.grid.charge(t.x, t.y, -dcos(ang) * (d - 2), -dsin(ang) * (d - 2), rad(t));
              t.stun = 6;
              t.path = [];
              this.emit('hook', { i: a.i, t: t.i, fx, fy });
              this.hurt(t, a, 40);
            }
            return true;
          }
          break;
        case 'sleep':
          if (d < 20 && go(0.05) && t.h.role !== 'sup') {
            use();
            if (!dodgeable(R, t, sk * 0.85)) {
              t.stun = t.h.role === 'tank' ? 20 : 28;
              this.emit('stun', { i: t.i });
            }
            return true;
          }
          break;
        case 'boost':
          if (go(0.06)) {
            use();
            for (const m of al)
              if (hyp(m.x - a.x, m.y - a.y) < 10) {
                m.boost = 50;
                if (h.id === 'vector') this.mend(m, a, 40);
              }
            this.emit('aoe', { x: a.x, y: a.y, r: 6, col: h.look.glow, ak: 'heal' });
            return true;
          }
          break;
        case 'cleanse': {
          const m = al.filter(m => m.hp < m.maxHp * 0.4 && hyp(m.x - a.x, m.y - a.y) < 14).sort((x, y) => x.hp - y.hp || x.i - y.i)[0];
          if (m && go(0.3)) {
            use({ x: m.x, y: m.y });
            m.stun = 0;
            m.anti = 0;
            m.shield = 120;
            this.mend(m, a, 70);
            this.emit('shield', { i: m.i, col: h.look.glow });
            return true;
          }
          break;
        }
        case 'wall':
          if (d < 7 && go(0.08)) {
            use();
            for (const e of en)
              if (hyp(e.x - a.x, e.y - a.y) < 7 && Math.abs(angDiff(datan2(e.y - a.y, e.x - a.x), ang)) < 0.8) {
                if (!this.map.grid.los(a.x, a.y, e.x, e.y)) continue;
                [e.x, e.y] = this.map.grid.charge(e.x, e.y, dcos(ang) * 2.5, dsin(ang) * 2.5, rad(e));
                e.path = [];
                this.hurt(e, a, 30);
              }
            this.emit('shock', { x: a.x, y: a.y, dir: ang });
            return true;
          }
          break;
        case 'barrier':
          if (h.id === 'kestrel' && a.hp < a.maxHp * 0.6 && go(0.2)) {
            use();
            a.shield = 200;
            this.emit('shield', { i: a.i, col: h.look.glow });
            return true;
          }
          break;
      }
    }
    return false;
  }
  ultimate(a: Fig, t: Fig, al: Fig[], en: Fig[]) {
    const h = a.h,
      k = h.ult.k,
      col = h.look.glow;
    a.ult = 0;
    a.castT = 8;
    a.anim = 'ult';
    this.ultGo[a.team] = 25;
    this.emit('ult', { i: a.i, u: k, name: h.ult.name, x: t.x, y: t.y, col });
    const sk = this.nerve(a, a.p.st.util);
    switch (k) {
      case 'slam':
        this.emit('shock', { x: a.x, y: a.y, dir: a.dir, big: true });
        for (const e of en)
          if (hyp(e.x - a.x, e.y - a.y) < 11 && !dodgeable(this.rng, e, sk * 1.05)) {
            e.stun = 22;
            this.hurt(e, a, 60);
          }
        break;
      case 'barrage':
        this.zones.push({ x: t.x, y: t.y, r: 6.5, t: 30, T: 30, team: a.team, by: a.i, kind: 'barrage', col });
        break;
      case 'nova':
        this.zones.push({ x: t.x, y: t.y, r: 4.6, t: 10, T: 10, team: a.team, by: a.i, kind: 'nova', col });
        break;
      case 'storm':
        this.zones.push({ x: t.x, y: t.y, r: 6.5, t: 50, T: 50, team: a.team, by: a.i, kind: 'storm', col });
        break;
      case 'deadeye':
        for (const e of en.filter(e => hyp(e.x - a.x, e.y - a.y) < 24 && this.map.grid.los(a.x, a.y, e.x, e.y)).slice(0, 3)) {
          const bl = this.blockedBy(a, e);
          this.emit('shot', { i: a.i, x: a.x, y: a.y, tx: e.x, ty: e.y, hit: !bl, w: 'awp', col });
          if (bl) this.hitBarrier(bl, 200);
          else this.hurt(e, a, 165);
        }
        break;
      case 'rally':
        a.od = 70;
        a.nano = 60;
        a.boost = 70;
        break;
      case 'sound':
        for (const m of al)
          if (hyp(m.x - a.x, m.y - a.y) < 15) {
            m.shield = Math.max(m.shield, h.id === 'cadence' ? 260 : 140);
            this.mend(m, a, 220);
            this.emit('shield', { i: m.i, col });
          }
        break;
      case 'nano': {
        const m =
          al
            .filter(m => m !== a && m.h.role !== 'sup' && hyp(m.x - a.x, m.y - a.y) < 22)
            .sort((x, y) => y.p.st.mech - x.p.st.mech || x.i - y.i)[0] ?? a;
        m.nano = 80;
        this.mend(m, a, 250);
        this.emit('shield', { i: m.i, col });
        break;
      }
    }
  }
  walk(a: Fig, x: number, y: number, m = 1) {
    const sp = a.h.speed * 0.1 * m * (a.boost > 0 && a.h.id === 'cadence' ? 1.2 : 1);
    const moved = a.goal ? hyp(a.goal[0] - x, a.goal[1] - y) : 99;
    if (!a.path.length || (moved > 1.2 && a.repath <= 0)) {
      a.goal = [x, y];
      a.path = this.map.grid.path(a.x, a.y, x, y);
      a.repath = 6 + (a.i % 4);
    }
    const p = a.path[0];
    if (!p) return;
    const dx = p[0] - a.x,
      dy = p[1] - a.y,
      d = hyp(dx, dy);
    if (d <= sp) {
      a.path.shift();
      a.vx += dx;
      a.vy += dy;
    } else {
      a.vx += (dx / d) * sp;
      a.vy += (dy / d) * sp;
    }
    if (a.tgt < 0 && d > 0.02) this.face(a, datan2(dy, dx));
    a.anim = 'run';
  }
  /** keep bodies apart, and out of the payload */
  settle() {
    const g = this.map.grid;
    g.obstacles = this.escort() ? [...g.statics, { x: this.cartPos[0], y: this.cartPos[1], r: 1.3 }] : g.statics;
    separate(this.actors, g, rad);
    if (this.escort()) for (const a of this.actors) if (a.alive) [a.x, a.y] = g.push(a.x, a.y, rad(a));
  }
  move(a: Fig) {
    const ox = a.x,
      oy = a.y;
    [a.x, a.y] = this.map.grid.slide(a.x, a.y, a.vx, a.vy, rad(a));
    const want = hyp(a.vx, a.vy);
    if (want > 0.15 && hyp(a.x - ox, a.y - oy) < want * 0.25) {
      if (++a.stuck > 6) {
        a.stuck = 0;
        a.path = [];
        a.repath = 0;
      }
    } else a.stuck = 0;
  }
  orders(team: 0 | 1): OrderDef[] {
    const o: OrderDef[] = [
      { cmd: 'auto', label: 'Play our game', hint: 'Follow the plan', group: 'Fight call', icon: 'radar-sweep' },
      { cmd: 'group', label: 'Group up', hint: 'Wait for five, then go', group: 'Fight call', icon: 'three-friends' },
      { cmd: 'push', label: 'Engage', hint: 'Take space and chase', group: 'Fight call', icon: 'sprint' },
      { cmd: 'safe', label: 'Back off', hint: 'Reset, deny ult charge', group: 'Fight call', icon: 'shield' },
      { cmd: 'ult:go', label: 'Use ults', hint: 'Chain them this fight', group: 'Ultimates', icon: 'embrassed-energy' },
      { cmd: 'ult:hold', label: 'Hold ults', hint: 'Bank for the next fight', group: 'Ultimates', icon: 'padlock' },
      { cmd: 'ult:auto', label: 'Players decide', hint: 'Trust them', group: 'Ultimates', icon: 'brain' },
    ];
    if (this.timeouts[team] > 0)
      o.push({ cmd: 'timeout', label: `Pause (${this.timeouts[team]})`, hint: 'Settle nerves', group: 'Bench', icon: 'hourglass' });
    return o;
  }
  order(team: 0 | 1, cmd: string) {
    if (this.done) return false;
    if (cmd === 'timeout') {
      if (this.timeouts[team] <= 0) return false;
      this.timeouts[team]--;
      this.calm[team] = 900;
      for (const a of this.actors) if (a.team === team) a.tilt *= 0.4;
      this.emit('timeout', { team });
      return true;
    }
    const m = /^ult:(go|hold|auto)$/.exec(cmd);
    if (m) {
      this.ults[team] = m[1] as any;
      return true;
    }
    if (!/^(auto|group|push|safe)$/.test(cmd)) return false;
    this.mode[team] = cmd;
    this.modeT[team] = cmd === 'safe' ? 80 : 250;
    return true;
  }
  result(): GameResult {
    const min = Math.max(1, this.tick / 600);
    const mk = (t: number): PStat[] =>
      this.actors
        .filter(a => a.team === t)
        .map(a => ({
          id: a.p.id,
          k: a.k,
          d: a.d,
          a: a.a,
          dmg: Math.round(a.dmg),
          heal: Math.round(a.heal),
          obj: Math.round(a.obj),
          hero: a.h.id,
          rating:
            Math.round(
              clamp(
                0.45 +
                  ((a.k * 0.09 + a.a * 0.07 - a.d * 0.075) / min) * 1.6 +
                  a.dmg / min / 2600 +
                  a.heal / min / 1900 +
                  (a.obj / min) * 0.004 +
                  (t === this.winner ? 0.08 : 0),
                0.1,
                2.6,
              ) * 100,
            ) / 100,
        }));
    const stats: [PStat[], PStat[]] = [mk(0), mk(1)];
    return {
      score: [...this.score],
      winner: this.winner,
      ticks: this.tick,
      stats,
      log: this.log.slice(-40),
      hash: sha256(JSON.stringify([this.score, this.winner, stats, this.tick])).slice(0, 24),
    };
  }
}
function dodgeable(R: Rng, t: Fig, sk: number) {
  return R.chance(clamp(0.45 + t.p.st.react * 0.3 - sk * 0.5 - (t.stun > 0 ? 1 : 0), 0.03, 0.7));
}
