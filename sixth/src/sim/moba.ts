/** Lane-based MOBA simulation (Dota class). Deterministic. */
import { Rng } from '../core/rng.ts';
import { clamp, datan2, dcos, dsin, hyp, PI } from '../core/dmath.ts';
import { sha256 } from '../core/hash.ts';
import { along, getMap, plen, type MobaMap, type P } from './maps.ts';
import { separate } from './bodies.ts';
import { MOBA_BY, type MobaAbility, type MobaHero } from '../data/heroes.ts';
import type { Actor, Ev, GameResult, MatchCfg, OrderDef, PStat, Sim, SimPlayer, SimTeam } from './types.ts';

export interface Hero extends Actor {
  p: SimPlayer;
  h: MobaHero;
  lvl: number;
  xp: number;
  gold: number;
  nw: number;
  mana: number;
  maxMana: number;
  cds: number[];
  ucd: number;
  ac: number;
  respawn: number;
  mode: string;
  lane: number;
  path: [number, number][];
  goal: P | null;
  tgt: Unit | null;
  stun: number;
  slow: number;
  shield: number;
  shieldT: number;
  k: number;
  d: number;
  a: number;
  dmg: number;
  heal: number;
  obj: number;
  lh: number;
  hitBy: number[];
  tilt: number;
  retreatT: number;
  vx: number;
  vy: number;
  bosst: number;
  repath: number;
  castT: number;
  atkT: number;
  streak: number;
  tpT: number;
  kind: 'hero';
  hurtT: number;
  stuck: number;
}
export interface Creep {
  kind: 'creep';
  id: number;
  team: 0 | 1;
  lane: number;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dmg: number;
  ac: number;
  ranged: boolean;
  mega: boolean;
  d: number;
  off: number;
  tgt: Unit | null;
  anim: string;
  rt: number;
}
export interface Tower {
  kind: 'tower';
  id: number;
  team: 0 | 1;
  lane: number;
  tier: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  ac: number;
  dmg: number;
  core: boolean;
  hitT: number;
}
export interface Boss {
  kind: 'boss';
  id: number;
  team: 2;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  ac: number;
  respawn: number;
  dir: number;
  n: number;
}
export interface Camp {
  x: number;
  y: number;
  hp: number;
  max: number;
  t: number;
  team: number;
}
type Unit = Hero | Creep | Tower | Boss;
interface Proj {
  x: number;
  y: number;
  sp: number;
  tgt: Unit;
  dmg: number;
  by: Hero | Creep | Tower | Boss;
  kind: string;
  col?: string;
  eff?: () => void;
  id: number;
}
interface Zone {
  x: number;
  y: number;
  r: number;
  t: number;
  team: number;
  fn: () => void;
  kind: string;
  col: string;
}
const DT = 0.1;
export const BODY = 0.55;
const CREEP = 0.35;

export class MobaSim implements Sim {
  tick = 0;
  done = false;
  score: [number, number] = [0, 0];
  actors: Hero[] = [];
  ev: Ev[] = [];
  map: MobaMap;
  home: [P, P];
  rng: Rng;
  log: string[] = [];
  creeps: Creep[] = [];
  towers: Tower[] = [];
  boss: Boss;
  camps: Camp[];
  projs: Proj[] = [];
  zones: Zone[] = [];
  uid = 1;
  winner: 0 | 1 = 0;
  lanesLen: number[];
  buffT: [number, number] = [0, 0];
  plan: [{ k: string; lane: number; t: number }, { k: string; lane: number; t: number }] = [
    { k: 'lane', lane: 1, t: 0 },
    { k: 'lane', lane: 1, t: 0 },
  ];
  pending: [string, string] = ['', ''];
  orderT: [number, number] = [0, 0];
  timeouts: [number, number] = [1, 1];
  calm: [number, number] = [0, 0];
  nwHist: number[] = [];
  constructor(public cfg: MatchCfg) {
    this.map = getMap(cfg.map) as MobaMap;
    this.map = { ...this.map, grid: this.map.grid.fork() };
    this.map.grid.body = BODY;
    this.home = [0, 1].map(t => [this.map.base[t][0] + (t ? 6 : -6), this.map.base[t][1] + (t ? -6 : 6)] as P) as [P, P];
    this.rng = Rng.of(cfg.seed);
    this.lanesLen = this.map.lanes.map(plen);
    cfg.teams.forEach((tm, ti) =>
      tm.players.forEach((p, pi) => {
        const h = MOBA_BY[p.hero ?? 'kaelis'] ?? MOBA_BY.kaelis;
        const b = this.home[ti];
        this.actors.push({
          kind: 'hero',
          i: this.actors.length,
          team: ti as 0 | 1,
          x: b[0] + (pi - 2) * 1.6,
          y: b[1] + ((pi % 2) * 2 - 1),
          dir: ti ? 2.4 : -0.8,
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
          lvl: 1,
          xp: 0,
          gold: 0,
          nw: 600,
          mana: h.mana,
          maxMana: h.mana,
          cds: [0, 0],
          ucd: 0,
          ac: 0,
          respawn: 0,
          mode: 'lane',
          lane: this.laneFor(ti, p.role),
          path: [],
          goal: null,
          tgt: null,
          stun: 0,
          slow: 0,
          shield: 0,
          shieldT: 0,
          k: 0,
          d: 0,
          a: 0,
          dmg: 0,
          heal: 0,
          obj: 0,
          lh: 0,
          hitBy: new Array(10).fill(-999),
          tilt: 0,
          retreatT: 0,
          vx: 0,
          vy: 0,
          bosst: 0,
          repath: 0,
          castT: 0,
          atkT: 0,
          streak: 0,
          tpT: 0,
          hurtT: -99,
          stuck: 0,
        });
      }),
    );
    for (const t of this.map.towers) {
      const hp = [1500, 1900, 2300][t.tier];
      this.towers.push({
        kind: 'tower',
        id: this.uid++,
        ...t,
        hp,
        maxHp: hp,
        alive: true,
        ac: 0,
        dmg: [115, 140, 165][t.tier],
        core: false,
        hitT: -99,
      });
    }
    for (const ti of [0, 1] as const) {
      const b = this.map.base[ti];
      this.towers.push({
        kind: 'tower',
        id: this.uid++,
        team: ti,
        lane: -1,
        tier: 3,
        x: b[0],
        y: b[1],
        hp: 4200,
        maxHp: 4200,
        alive: true,
        ac: 0,
        dmg: 150,
        core: true,
        hitT: -99,
      });
    }
    this.boss = {
      kind: 'boss',
      id: this.uid++,
      team: 2,
      x: this.map.pit[0],
      y: this.map.pit[1],
      hp: 4500,
      maxHp: 4500,
      alive: false,
      ac: 0,
      respawn: 1800,
      dir: 0,
      n: 0,
    };
    this.camps = this.map.camps.map(c => ({ x: c[0], y: c[1], hp: 0, max: 500, t: 300, team: c[0] + (120 - c[1]) < 120 ? 0 : 1 }));
  }
  laneFor(team: number, role: string) {
    if (role === 'mid') return 1;
    const safe = team === 0 ? 2 : 0,
      off = team === 0 ? 0 : 2;
    return role === 'carry' || role === 'hard' ? safe : off;
  }
  emit(k: string, o: object = {}) {
    this.ev.push({ k, ...o });
  }
  say(s: string) {
    this.log.push(`${this.clock()} ${s}`);
    this.emit('say', { s });
  }
  clock() {
    const s = Math.floor(this.tick / 10);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  phase() {
    const m = this.tick / 600;
    return m < 4 ? 'Laning' : m < 10 ? 'Mid game' : 'Late game';
  }
  team(i: number): SimTeam {
    return this.cfg.teams[i];
  }
  foes(t: number) {
    return this.actors.filter(a => a.team !== t);
  }
  // ---------- stats
  st(h: Hero) {
    const l = h.lvl;
    const n = h.nw;
    return {
      dmg: h.h.dmg + l * 4.2 + n * 0.0085,
      hp: h.h.hp + l * 62 + n * 0.075,
      sp: (h.h.speed + Math.min(0.7, n * 0.00005)) * DT,
      as: Math.max(5, h.h.as - Math.floor(n / 2600)),
      pow: 1 + l * 0.075 + n * 0.000075,
      arm: Math.min(0.55, h.h.arm + l * 0.006 + n * 0.00001),
      mana: h.h.mana + l * 32,
    };
  }
  nerve(h: Hero, v: number) {
    return v * (1 - h.tilt * 0.14 + (this.calm[h.team] > 0 ? 0.04 : 0) - (this.tick > 6000 ? (1 - h.p.st.focus) * 0.06 : 0));
  }
  hurt(u: Unit, by: Unit | null, dmg: number, how: string, magic = false) {
    if (!u.alive) return;
    let d = dmg;
    if (u.kind === 'hero') {
      const s = this.st(u);
      d *= 1 - (magic ? s.arm * 0.5 : s.arm);
      d *= 1.28 - 0.56 * this.nerve(u, u.p.st.pos);
      if (by?.kind === 'hero') d *= 0.55 + 0.85 * this.nerve(by, (by.p.st.mech + by.p.st.team + by.p.st.util) / 3);
      if (u.shield > 0) {
        const q = Math.min(u.shield, d);
        u.shield -= q;
        d -= q;
      }
      u.hurtT = this.tick;
      if (by?.kind === 'hero') {
        u.hitBy[by.i] = this.tick;
        by.dmg += Math.min(d, u.hp);
      }
    } else if (u.kind === 'tower') {
      if (!this.vulnerable(u)) {
        return;
      }
      u.hitT = this.tick;
      if (by?.kind === 'hero') d *= 0.75;
    }
    u.hp -= d;
    if (u.kind === 'hero' && d > 5) this.emit('hit', { i: u.i, d, m: magic });
    else if (u.kind === 'boss' || u.kind === 'tower') this.emit('hitU', { id: u.id, x: u.x, y: u.y });
    if (u.hp <= 0) {
      u.hp = 0;
      u.alive = false;
      this.died(u, by);
    }
  }
  vulnerable(t: Tower) {
    if (t.core) {
      return this.towers.some(o => o.team === t.team && o.tier === 2 && !o.alive);
    }
    if (t.tier === 0) return true;
    return this.towers.every(o => o.team !== t.team || o.lane !== t.lane || o.tier !== t.tier - 1 || !o.alive);
  }
  xp(h: Hero, n: number) {
    if (h.lvl >= 20) return;
    h.xp += n;
    while (h.lvl < 20 && h.xp >= 100 + h.lvl * 68) {
      h.xp -= 100 + h.lvl * 68;
      h.lvl++;
      const s = this.st(h);
      const f = h.hp / h.maxHp;
      h.maxHp = s.hp;
      h.hp = f * s.hp;
      h.maxMana = s.mana;
      this.emit('lvl', { i: h.i, l: h.lvl });
    }
  }
  pay(h: Hero, n: number) {
    h.gold += n;
    h.nw += n;
    const f = h.hp / h.maxHp;
    h.maxHp = this.st(h).hp;
    h.hp = f * h.maxHp;
  }
  died(u: Unit, by: Unit | null) {
    if (u.kind === 'hero') {
      u.d++;
      u.anim = 'dead';
      const late = Math.min(22, (this.tick / 600) * 1.1);
      u.respawn = Math.round((6 + u.lvl * 1.2 + late * 0.6) * 10);
      u.tilt = clamp(
        u.tilt + 0.12 * (1.25 - u.p.st.comp) * (u.p.traits.includes('hothead') ? 1.6 : u.p.traits.includes('ice') ? 0.5 : 1),
        0,
        1,
      );
      u.path = [];
      u.goal = null;
      u.tgt = null;
      u.mode = 'dead';
      const t = u.team,
        kt = (1 - t) as 0 | 1;
      this.score[kt]++;
      const killer =
        by?.kind === 'hero'
          ? by
          : this.actors.filter(a => a.team !== t && this.tick - u.hitBy[a.i] < 120).sort((p, q) => u.hitBy[q.i] - u.hitBy[p.i])[0];
      const bounty = 180 + u.lvl * 14 + u.streak * 60 + Math.min(260, u.nw * 0.012);
      if (killer) {
        killer.k++;
        killer.streak++;
        killer.tilt *= 0.85;
        this.pay(killer, bounty);
        this.xp(killer, 110 + u.lvl * 22);
      }
      const near = this.actors.filter(
        a => a.team === kt && a !== killer && a.alive && (hyp(a.x - u.x, a.y - u.y) < 20 || this.tick - u.hitBy[a.i] < 150),
      );
      for (const a of near) {
        a.a++;
        this.pay(a, bounty * 0.36);
        this.xp(a, ((80 + u.lvl * 14) / Math.max(1, near.length)) * 1.4);
      }
      u.streak = 0;
      this.emit('kill', { i: u.i, by: killer?.i ?? -1, x: u.x, y: u.y, w: by?.kind ?? '' });
      const dead = this.actors.filter(a => a.team === t && !a.alive).length;
      if (dead === 5) this.say(`${this.team(t).name} wiped out`);
      else if (killer && killer.streak === 5) this.say(`${killer.nick} is on a five-kill streak`);
    } else if (u.kind === 'creep') {
      const near = this.actors.filter(a => a.team !== u.team && a.alive && hyp(a.x - u.x, a.y - u.y) < 15);
      for (const a of near) this.xp(a, (u.mega ? 40 : 34) / (near.length * 0.7 + 0.3));
      if (by?.kind === 'hero') {
        by.lh++;
        this.pay(by, u.ranged ? 50 : 44);
        this.emit('gold', { i: by.i, x: u.x, y: u.y });
      }
    } else if (u.kind === 'tower') {
      const t = u.team,
        kt = (1 - t) as 0 | 1;
      this.emit('tower', { id: u.id, x: u.x, y: u.y, team: t, core: u.core });
      if (u.core) {
        this.winner = kt;
        this.done = true;
        this.emit('end');
        this.say(`${this.team(kt).name} destroy the core`);
        return;
      }
      for (const a of this.actors) if (a.team === kt) this.pay(a, 130 + u.tier * 50);
      if (by?.kind === 'hero') {
        by.obj++;
        this.pay(by, 150);
      }
      this.say(`${this.team(kt).name} take a tier ${u.tier + 1} tower`);
      if (u.tier === 2 && this.towers.filter(x => x.team === t && x.tier === 2 && !x.alive).length === 3) this.say('Mega creeps');
    } else if (u.kind === 'boss') {
      const kt = (by && by.kind === 'hero' ? by.team : 0) as 0 | 1;
      this.buffT[kt] = 1200;
      u.respawn = 2400;
      u.n++;
      for (const a of this.actors)
        if (a.team === kt) {
          this.pay(a, 180);
          this.xp(a, 160);
        }
      if (by?.kind === 'hero') by.obj += 2;
      this.say(`${this.team(kt).name} slay the Warden`);
      this.emit('boss', { team: kt, x: u.x, y: u.y });
    }
  }
  lanePos(team: number, lane: number, d: number): P {
    return along(this.map.lanes[lane], team === 0 ? d : this.lanesLen[lane] - d);
  }
  spawnWave() {
    const m = this.tick / 600;
    for (const team of [0, 1] as const)
      for (let lane = 0; lane < 3; lane++) {
        const enemyRax = this.towers.some(t => t.team !== team && t.lane === lane && t.tier === 2 && !t.alive);
        const n = m > 8 ? 5 : 4;
        for (let j = 0; j < n; j++) {
          const ranged = j === n - 1;
          const mul = 1 + m * 0.055;
          const hp = (ranged ? 210 : 340) * mul * (enemyRax ? 1.6 : 1);
          const p = this.lanePos(team, lane, 2 + (ranged ? 0 : 1.2));
          this.creeps.push({
            kind: 'creep',
            id: this.uid++,
            team,
            lane,
            x: p[0],
            y: p[1],
            dir: 0,
            hp,
            maxHp: hp,
            alive: true,
            dmg: (ranged ? 23 : 17) * mul * (enemyRax ? 1.6 : 1) * (m > 15 ? 1 + (m - 15) * 0.25 : 1),
            ac: 0,
            ranged,
            mega: enemyRax,
            d: 2 + (ranged ? 0 : 1.4 + (j % 2) * 0.6),
            off: (j - 1.5) * 0.8,
            tgt: null,
            anim: 'run',
            rt: j,
          });
        }
      }
  }
  frontier(team: 0 | 1, lane: number) {
    let best = 6;
    for (const c of this.creeps) if (c.alive && c.team === team && c.lane === lane && c.d > best) best = c.d;
    return best;
  }
  laneTower(team: 0 | 1, lane: number): Tower | null {
    return (
      this.towers.filter(t => t.team === team && t.lane === lane && t.alive).sort((a, b) => a.tier - b.tier)[0] ??
      this.towers.find(t => t.team === team && t.core)!
    );
  }
  power(h: Hero) {
    const s = this.st(h);
    return ((h.hp / h.maxHp) * 0.75 + 0.25) * (s.hp * 0.001 + s.dmg * 0.012 + s.pow * 0.55 + (h.ucd <= 0 && h.lvl >= 6 ? 0.5 : 0));
  }
  // ---------- step
  step() {
    if (this.done) return;
    this.ev.length = 0;
    this.tick++;
    const t = this.tick;
    if (t % 200 === 1) this.spawnWave();
    if (this.buffT[0] > 0) this.buffT[0]--;
    if (this.buffT[1] > 0) this.buffT[1]--;
    for (const i of [0, 1]) if (this.calm[i] > 0) this.calm[i]--;
    if (!this.boss.alive && --this.boss.respawn <= 0) {
      this.boss.alive = true;
      this.boss.maxHp = 4200 + this.boss.n * 1500 + t * 0.25;
      this.boss.hp = this.boss.maxHp;
      this.emit('bossUp', {});
    }
    for (const c of this.camps)
      if (c.hp <= 0 && --c.t <= 0) {
        c.max = 420 + t * 0.06;
        c.hp = c.max;
      }
    if (t % 20 === 0) {
      this.director(0);
      this.director(1);
    }
    if (t % 100 === 0) {
      const g = (k: number) => this.actors.filter(a => a.team === k).reduce((s, a) => s + a.nw, 0);
      this.nwHist.push(Math.round(g(0) - g(1)));
    }
    for (const l of this.byLane) l.length = 0;
    for (const c of this.creeps) if (c.alive) this.byLane[c.team * 3 + c.lane].push(c);
    this.solids();
    for (const c of this.creeps) if (c.alive) this.creepAI(c);
    if (t % 30 === 0) this.creeps = this.creeps.filter(c => c.alive);
    for (const w of this.towers) if (w.alive) this.towerAI(w);
    this.bossAI();
    for (const h of this.actors) this.heroAI(h);
    for (const h of this.actors) if (h.alive) this.move(h);
    separate(this.actors, this.map.grid, () => BODY, 0.85);
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      const dx = p.tgt.x - p.x,
        dy = p.tgt.y - p.y,
        d = hyp(dx, dy);
      if (!p.tgt.alive || d < p.sp + 0.3) {
        this.projs.splice(i, 1);
        if (p.tgt.alive) {
          this.hurt(p.tgt, p.by as Unit, p.dmg, p.kind, p.kind === 'spell');
          p.eff?.();
        }
        this.emit('impact', { x: p.tgt.x, y: p.tgt.y, col: p.col, kind: p.kind });
      } else {
        p.x += (dx / d) * p.sp;
        p.y += (dy / d) * p.sp;
      }
      if (this.done) return;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (--z.t <= 0) {
        this.zones.splice(i, 1);
        z.fn();
      }
      if (this.done) return;
    }
    if (t >= 15000 && !this.done) {
      const v = (k: number) => this.towers.filter(x => x.team === k).reduce((s, x) => s + x.hp, 0);
      this.winner = v(0) >= v(1) ? 0 : 1;
      this.done = true;
      this.emit('end');
    }
  }
  byLane: Creep[][] = [[], [], [], [], [], []];
  creepAI(c: Creep) {
    if (c.ac > 0) c.ac--;
    c.rt = (c.rt + 1) % 6;
    if (c.rt === 0 || (c.tgt && !c.tgt.alive)) {
      c.tgt = null;
      let bd = 49;
      for (const o of this.byLane[(1 - c.team) * 3 + c.lane])
        if (o.alive) {
          const dx = o.x - c.x,
            dy = o.y - c.y,
            d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            c.tgt = o;
          }
        }
      if (!c.tgt) {
        for (const o of this.towers)
          if (o.alive && o.team !== c.team && this.vulnerable(o)) {
            const d = hyp(o.x - c.x, o.y - c.y);
            if (d < 8.5 && d * d < Math.max(bd, 73)) {
              c.tgt = o;
              break;
            }
          }
      }
      if (!c.tgt)
        for (const o of this.actors)
          if (o.alive && o.team !== c.team) {
            const dx = o.x - c.x,
              dy = o.y - c.y,
              d = dx * dx + dy * dy;
            if (d < Math.min(bd, 25)) {
              bd = d;
              c.tgt = o;
            }
          }
    }
    const sp = 0.3;
    if (c.tgt) {
      const d = hyp(c.tgt.x - c.x, c.tgt.y - c.y),
        rg = c.ranged ? 5.5 : c.tgt.kind === 'tower' ? (c.tgt.core ? 3.4 : 2.4) : 1.5;
      c.dir = datan2(c.tgt.y - c.y, c.tgt.x - c.x);
      if (d > rg) {
        [c.x, c.y] = this.map.grid.slide(c.x, c.y, dcos(c.dir) * sp, dsin(c.dir) * sp, CREEP);
        c.anim = 'run';
        c.d += sp * 0.5;
      } else {
        c.anim = 'attack';
        if (c.ac <= 0) {
          c.ac = 10;
          const m = c.tgt.kind === 'tower' ? 0.7 : 1;
          if (c.ranged) this.projs.push({ id: this.uid++, x: c.x, y: c.y, sp: 1.3, tgt: c.tgt, dmg: c.dmg * m, by: c, kind: 'creep' });
          else this.hurt(c.tgt, c, c.dmg * m, 'creep');
        }
      }
    } else {
      c.d = Math.min(this.lanesLen[c.lane] - 1, c.d + sp);
      const p = this.lanePos(c.team, c.lane, c.d),
        q = this.lanePos(c.team, c.lane, Math.min(this.lanesLen[c.lane], c.d + 1));
      const dir = datan2(q[1] - p[1], q[0] - p[0]);
      const tx = p[0] - dsin(dir) * c.off,
        ty = p[1] + dcos(dir) * c.off;
      const dx = tx - c.x,
        dy = ty - c.y,
        d = hyp(dx, dy);
      if (d > sp * 1.6) {
        [c.x, c.y] = this.map.grid.slide(c.x, c.y, (dx / d) * sp * 1.4, (dy / d) * sp * 1.4, CREEP);
        c.dir = datan2(dy, dx);
      } else {
        [c.x, c.y] = this.map.grid.slide(c.x, c.y, dx, dy, CREEP);
        c.dir = dir;
      }
      c.anim = 'run';
    }
  }
  towerAI(w: Tower) {
    if (w.ac > 0) {
      w.ac--;
      return;
    }
    if ((this.tick + w.id) % 3 && !w.core) return;
    let best: Unit | null = null,
      bd = 9.5;
    for (const c of this.creeps)
      if (c.alive && c.team !== w.team) {
        const d = hyp(c.x - w.x, c.y - w.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    for (const h of this.actors)
      if (h.alive && h.team !== w.team) {
        const d = hyp(h.x - w.x, h.y - w.y);
        if (d < 9.5) {
          const dive = this.actors.some(a => a.team === w.team && a.alive && this.tick - a.hitBy[h.i] < 20);
          if (dive || !best) {
            best = h;
            break;
          }
        }
      }
    if (best) {
      w.ac = 10;
      const m = best.kind === 'creep' ? 1.1 : 1;
      this.projs.push({ id: this.uid++, x: w.x, y: w.y, sp: 1.4, tgt: best, dmg: w.dmg * m * (w.core ? 1.2 : 1), by: w, kind: 'tower' });
      this.emit('tshot', { x: w.x, y: w.y, team: w.team });
    }
    if (w.core && this.tick % 10 === 0 && this.tick - w.hitT > 80) w.hp = Math.min(w.maxHp, w.hp + 8);
  }
  bossAI() {
    const b = this.boss;
    if (!b.alive) return;
    if (b.ac > 0) b.ac--;
    const near = this.actors.filter(a => a.alive && a.bosst > 0 && hyp(a.x - b.x, a.y - b.y) < 7);
    if (!near.length) {
      if (this.tick % 5 === 0) b.hp = Math.min(b.maxHp, b.hp + 12);
      return;
    }
    const t = near.sort((p, q) => p.h.range - q.h.range || p.i - q.i)[0];
    b.dir = datan2(t.y - b.y, t.x - b.x);
    if (b.ac <= 0) {
      b.ac = 14;
      this.hurt(t, b, 95 + this.tick * 0.009, 'boss');
      this.emit('slam', { x: t.x, y: t.y });
    }
  }
  // ---------- team brain
  director(team: 0 | 1) {
    const R = this.rng,
      me = this.actors.filter(a => a.team === team),
      en = this.actors.filter(a => a.team !== team);
    const al = me.filter(a => a.alive),
      eal = en.filter(a => a.alive);
    const pl = this.plan[team],
      min = this.tick / 600;
    const tm = this.team(team);
    const igl = me.reduce((s, a) => s + a.p.st.dec + a.p.st.sense, 0) / 10;
    const sync = tm.syn * 0.5 + tm.fam * 0.5;
    if (this.orderT[team] > 0) this.orderT[team] -= 20;
    if (this.pending[team]) {
      const c = this.pending[team];
      this.pending[team] = '';
      const m = /^(push|farm|boss|defend|gank)(\d)?$/.exec(c);
      if (m) {
        pl.k = m[1];
        pl.lane = m[2] ? +m[2] : pl.lane;
        pl.t = this.tick;
        this.orderT[team] = 450;
      }
    }
    const manual = this.orderT[team] > 0;
    // defend has priority
    const threats = this.towers
      .filter(t => t.team === team && t.alive && this.vulnerable(t) && this.tick - t.hitT < 30)
      .map(t => ({ t, n: eal.filter(e => hyp(e.x - t.x, e.y - t.y) < 16).length }))
      .filter(x => x.n >= 2 || (x.t.tier >= 2 && x.n >= 1))
      .sort((a, b) => b.t.tier - a.t.tier || b.n - a.n);
    const myP = al.reduce((s, a) => s + this.power(a), 0),
      enP = eal.reduce((s, a) => s + this.power(a), 0);
    if (threats.length && min > 2.5 && (!manual || threats[0].t.tier >= 2)) {
      const th = threats[0];
      if (al.length + 1 >= th.n && (myP > enP * 0.7 || th.t.tier >= 2)) {
        pl.k = 'defend';
        pl.lane = th.t.lane < 0 ? 1 : th.t.lane;
        pl.t = this.tick;
        this.goto(team, pl);
        return;
      }
    }
    if (!manual) {
      if (pl.k === 'defend' && this.tick - pl.t > 100) pl.k = 'farm';
      const edge = al.length - eal.length,
        ratio = myP / Math.max(0.5, enP);
      const tempo = tm.plan.tempo,
        risk = tm.plan.risk;
      const age = this.tick - pl.t;
      if (min < 3.2 + (1 - tempo) * 1.6 && edge < 2) {
        if (pl.k === 'lane' && this.tick % 140 === 0 && min > 1 && R.chance(0.12 + tempo * 0.25)) {
          pl.k = 'gank';
          pl.lane = R.int(0, 2);
          pl.t = this.tick;
        } else if (pl.k !== 'lane' && !(pl.k === 'gank' && age < 160)) {
          pl.k = 'lane';
          pl.t = this.tick;
        }
      } else if (edge >= 2 || (ratio > 1.35 && al.length >= 4)) {
        if (this.boss.alive && R.chance(0.2 + igl * 0.3) && al.length >= 4 && age > 100) {
          pl.k = 'boss';
          pl.t = this.tick;
        } else if (pl.k !== 'push' || age > 420) {
          pl.k = 'push';
          pl.lane = this.bestLane(team);
          pl.t = this.tick;
        }
      } else if (age > 260 + (1 - tempo) * 160 || pl.k === 'lane') {
        const prev = pl.k;
        const opts: [string, number][] = [
          ['farm', 0.9 + (1 - tempo) * 0.8 - min * 0.035],
          ['push', 0.4 + tempo * 0.7 + min * 0.05 - tm.plan.style * 0.15],
          ['gank', 0.2 + tempo * 0.4 + tm.plan.style * 0.35],
          ['boss', this.boss.alive && min > 5 && al.length >= 4 ? 0.25 + risk * 0.35 : 0],
        ];
        pl.k = R.weighted(opts, o => Math.max(0.05, o[1]) * (o[0] === prev && prev !== 'push' ? 0.5 : 1))[0];
        pl.lane = pl.k === 'push' ? this.bestLane(team) : R.int(0, 2);
        pl.t = this.tick;
        if (R.chance(0.3 * (1 - sync))) pl.t -= 120;
      }
    }
    this.goto(team, pl);
  }
  bestLane(team: 0 | 1) {
    let best = 1,
      bs = -1;
    for (let l = 0; l < 3; l++) {
      const t = this.laneTower((1 - team) as 0 | 1, l)!;
      const s =
        (t.core ? 3 : 1.4 - t.tier * 0.25) +
        (1 - t.hp / t.maxHp) * 0.8 +
        (this.frontier(team, l) / this.lanesLen[l]) * 0.9 +
        (l === 1 ? 0.1 : 0) +
        this.rng.f() * 0.5;
      if (s > bs) {
        bs = s;
        best = l;
      }
    }
    const f = this.team(team).plan.focus;
    if (/^[012]$/.test(f) && this.rng.chance(0.35)) return +f;
    return best;
  }
  goto(team: 0 | 1, pl: { k: string; lane: number }) {
    for (const h of this.actors)
      if (h.team === team && h.alive && h.mode !== 'retreat') {
        if (pl.k === 'lane') h.mode = 'lane';
        else if (pl.k === 'farm') h.mode = h.role === 'soft' || h.role === 'hard' ? 'lane' : 'farm';
        else if (pl.k === 'gank')
          h.mode = h.role === 'soft' || h.role === 'mid' || (h.role === 'hard' && this.tick > 1800) ? 'gank' : 'lane';
        else if (pl.k === 'boss') h.mode = 'boss';
        else if (pl.k === 'defend') h.mode = 'defend';
        else h.mode = 'push';
        if ((h.mode === 'gank' || h.mode === 'push') && pl.k !== 'farm') h.bosst = 0;
      }
  }
  // ---------- hero brain
  heroAI(h: Hero) {
    if (!h.alive) {
      if (--h.respawn <= 0) {
        const b = this.home[h.team];
        h.alive = true;
        h.x = b[0] + ((h.i % 5) - 2);
        h.y = b[1] + 2;
        h.hp = h.maxHp;
        h.mana = h.maxMana;
        h.mode = 'lane';
        h.anim = 'idle';
        h.stun = h.slow = 0;
        this.emit('spawn', { i: h.i });
      }
      return;
    }
    for (let j = 0; j < 2; j++) if (h.cds[j] > 0) h.cds[j]--;
    if (h.ucd > 0) h.ucd--;
    if (h.ac > 0) h.ac--;
    if (h.slow > 0) h.slow--;
    if (h.shieldT > 0 && --h.shieldT === 0) h.shield = 0;
    if (h.retreatT > 0) h.retreatT--;
    if (h.bosst > 0) h.bosst--;
    if (h.repath > 0) h.repath--;
    if (h.castT > 0) h.castT--;
    if (h.atkT > 0) h.atkT--;
    h.mana = Math.min(h.maxMana, h.mana + 0.35 + h.lvl * 0.05);
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.0005);
    h.vx = h.vy = 0;
    if (h.castT <= 0 && h.atkT <= 0) h.anim = 'idle';
    const s = this.st(h),
      b = this.home[h.team],
      R = this.rng,
      st = h.p.st;
    if (hyp(h.x - b[0], h.y - b[1]) < 9) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.02);
      h.mana = Math.min(h.maxMana, h.mana + 12);
    }
    if (this.tick % 10 === 0) h.tilt *= 0.995;
    this.pay0(h);
    if (h.stun > 0) {
      h.stun--;
      h.anim = 'stun';
      return;
    }
    const foes = this.actors.filter(e => e.team !== h.team && e.alive),
      near = foes.filter(e => hyp(e.x - h.x, e.y - h.y) < 13),
      mates = this.actors.filter(m => m.team === h.team && m.alive && m !== h && hyp(m.x - h.x, m.y - h.y) < 15);
    const tw = this.towers.find(t => t.alive && t.team !== h.team && hyp(t.x - h.x, t.y - h.y) < 10),
      mytw = this.towers.find(t => t.alive && t.team === h.team && hyp(t.x - h.x, t.y - h.y) < 10);
    // decide fight / flight
    let mine = this.power(h) + mates.reduce((q, m) => q + this.power(m), 0) + (mytw ? 1.6 : 0),
      theirs =
        near.reduce((q, e) => q + this.power(e), 0) +
        foes.filter(e => !near.includes(e) && hyp(e.x - h.x, e.y - h.y) < 18).reduce((q, e) => q + this.power(e) * 0.6, 0) +
        (tw ? (h.lvl < 9 ? 2.2 : 1.1) : 0);
    if (this.buffT[h.team] > 0) mine *= 1.12;
    if (this.buffT[1 - h.team] > 0) theirs *= 1.12;
    const noise = 1 + R.gauss() * 0.16 * (1 - this.nerve(h, st.dec));
    const ratio = (mine / Math.max(0.3, theirs)) * noise;
    const hpf = h.hp / h.maxHp;
    const bravery =
      0.98 -
      this.team(h.team).plan.risk * 0.16 -
      this.team(h.team).syn * this.team(h.team).fam * 0.05 -
      (h.mode === 'defend' ? 0.12 : 0) -
      h.tilt * 0.1 +
      (h.role === 'carry' ? 0.05 : 0);
    if (h.mode === 'retreat') {
      if (
        (hpf > 0.86 && h.mana > h.maxMana * 0.4) ||
        (hpf > 0.55 && !near.length && h.retreatT <= 0 && hyp(h.x - b[0], h.y - b[1]) > 40 && ratio > 1.4)
      ) {
        h.mode = 'lane';
        h.path = [];
      } else {
        this.flee(h, near, s);
        return;
      }
    }
    if (hpf < 0.26 + (1 - st.dec) * 0.02 && (near.length || hpf < 0.2) && ratio < 2.2) {
      h.mode = 'retreat';
      h.retreatT = 60;
      h.path = [];
      this.flee(h, near, s);
      return;
    }
    if (near.length && ratio < bravery * 0.78 && R.chance(0.25 + st.sense * 0.5)) {
      h.mode = 'retreat';
      h.retreatT = 25;
      h.path = [];
      this.flee(h, near, s);
      return;
    }
    if (
      near.length &&
      (ratio > bravery || near.some(e => e.hp / e.maxHp < 0.3 && hyp(e.x - h.x, e.y - h.y) < 9)) &&
      (h.mode !== 'lane' || ratio > bravery + 0.1 + (1 - this.team(h.team).plan.risk) * 0.15 || near.some(e => e.hp / e.maxHp < 0.5))
    ) {
      this.battle(h, near, mates, s);
      return;
    }
    // heal friends even out of fight
    if (this.tryHeal(h, mates, s)) return;
    this.objective(h, near, s, tw);
  }
  pay0(h: Hero) {
    if (this.tick % 10 === 0) {
      const g = 1 + 1.9 * (h.p.st.sense * 0.6 + h.p.st.focus * 0.4);
      h.nw += g;
      h.gold += g;
    }
  }
  objective(h: Hero, near: Hero[], s: any, tw?: Tower) {
    const pl = this.plan[h.team],
      R = this.rng,
      st = h.p.st,
      en = (1 - h.team) as 0 | 1;
    let lane = h.lane;
    if (h.mode === 'boss' && this.boss.alive) {
      const b = this.boss;
      const d = hyp(b.x - h.x, b.y - h.y);
      const here = this.actors.filter(a => a.team === h.team && a.alive && hyp(a.x - b.x, a.y - b.y) < 9).length;
      if (d > Math.max(3.2, h.h.range * 0.8)) this.walk(h, b.x + dcos(h.i * 1.3) * 2.6, b.y + dsin(h.i * 1.3) * 2.6, s.sp);
      else if (here >= 3 || b.hp < b.maxHp * 0.5) {
        h.bosst = 20;
        this.attack(h, b, s);
        if (h.mana > 120 && h.cds[1] <= 0 && h.h.ab[1].k === 'nuke') this.cast(h, 1, b);
      }
      return;
    }
    if (h.mode === 'gank') {
      const v = this.actors
        .filter(e => e.team !== h.team && e.alive)
        .map(e => ({
          e,
          s:
            (1 - e.hp / e.maxHp) * 20 -
            hyp(e.x - h.x, e.y - h.y) * 0.5 +
            hyp(e.x - this.map.base[en][0], e.y - this.map.base[en][1]) * 0.18,
        }))
        .sort((a, b) => b.s - a.s)[0];
      if (v && hyp(v.e.x - h.x, v.e.y - h.y) < 60) {
        this.walk(h, v.e.x, v.e.y, s.sp);
        return;
      }
    }
    if (h.mode === 'farm') {
      const c = this.camps
        .filter(c => c.hp > 0 && c.team === h.team)
        .sort((a, b) => hyp(a.x - h.x, a.y - h.y) - hyp(b.x - h.x, b.y - h.y))[0];
      const laneC = this.creeps.filter(c => c.alive && c.team !== h.team && c.lane === h.lane && hyp(c.x - h.x, c.y - h.y) < 26).length;
      if (
        c &&
        laneC < 2 &&
        !this.actors.some(o => o !== h && o.team === h.team && o.alive && o.mode === 'farm' && hyp(o.x - c.x, o.y - c.y) < 4)
      ) {
        const d = hyp(c.x - h.x, c.y - h.y);
        if (d > 2.4) {
          this.walk(h, c.x, c.y, s.sp);
          return;
        }
        h.dir = datan2(c.y - h.y, c.x - h.x);
        h.anim = 'attack';
        if (h.ac <= 0) {
          h.ac = s.as;
          h.atkT = 5;
          c.hp -= s.dmg * (0.9 + 0.5 * st.mech);
          h.hp -= 9 + this.tick * 0.0011;
          this.emit('atk', { i: h.i, x: c.x, y: c.y });
          if (c.hp <= 0) {
            c.t = 420;
            this.pay(h, 120 + this.tick * 0.006);
            this.xp(h, 105);
            this.emit('gold', { i: h.i, x: c.x, y: c.y });
          }
        }
        return;
      }
    }
    if (h.mode === 'push' || h.mode === 'defend') lane = pl.lane;
    if (h.mode === 'defend') {
      const t = this.laneTower(h.team, lane)!;
      const d = hyp(t.x - h.x, t.y - h.y);
      if (d > 7) {
        this.walk(h, t.x + (this.map.base[h.team][0] - t.x) * 0.06, t.y + (this.map.base[h.team][1] - t.y) * 0.06, s.sp);
        return;
      }
    }
    if (h.mode === 'push') {
      // group first
      const g = this.actors.filter(a => a.team === h.team && a.alive && a.mode === 'push');
      const cx = g.reduce((q, a) => q + a.x, 0) / g.length,
        cy = g.reduce((q, a) => q + a.y, 0) / g.length;
      const t = this.laneTower(en, lane)!;
      const dme = hyp(h.x - t.x, h.y - t.y),
        dc = hyp(cx - t.x, cy - t.y);
      if (dme < 24 && dc > dme + 9 && g.length > 2) {
        this.walk(h, cx, cy, s.sp * 0.8);
        return;
      }
      const front = this.frontier(h.team, lane);
      const tp = hyp(h.x - t.x, h.y - t.y);
      const cre = this.creeps.filter(c => c.alive && c.team === h.team && hyp(c.x - t.x, c.y - t.y) < 10).length;
      if (
        tp < h.h.range + 10 &&
        this.vulnerable(t) &&
        (cre >= 1 || h.lvl >= 14 || this.actors.filter(a => a.team !== h.team && a.alive).length <= 1)
      ) {
        const ec = this.nearCreep(h, 7);
        if (ec && R.chance(0.6)) {
          this.attack(h, ec, s);
          this.clear(h, s);
          return;
        }
        this.attack(h, t, s);
        return;
      }
      const p = this.lanePos(h.team, lane, Math.max(4, front - (h.h.range > 4 ? 4 : 1.5)));
      const ec = this.nearCreep(h, 9);
      if (ec) {
        this.attack(h, ec, s);
        this.clear(h, s);
        return;
      }
      this.walk(h, p[0], p[1], s.sp);
      return;
    }
    // laning: last hits
    const front = this.frontier(h.team, lane);
    const ec = this.nearCreep(h, h.h.range + 7, lane);
    if (
      ec &&
      !(
        tw &&
        hyp(ec.x - tw.x, ec.y - tw.y) < 10 &&
        h.lvl < 10 &&
        this.creeps.filter(c => c.alive && c.team === h.team && hyp(c.x - tw.x, c.y - tw.y) < 9).length < 2
      )
    ) {
      const low = this.creeps
        .filter(c => c.alive && c.team !== h.team && hyp(c.x - h.x, c.y - h.y) < h.h.range + 4 && c.hp < s.dmg * 1.25)
        .sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
      const sup = h.role === 'soft' || h.role === 'hard';
      const coreHere = this.actors.some(
        a =>
          a.team === h.team &&
          a.alive &&
          a !== h &&
          a.lane === h.lane &&
          (a.role === 'carry' || a.role === 'off') &&
          hyp(a.x - h.x, a.y - h.y) < 14,
      );
      if (low && !(sup && coreHere && R.chance(0.85))) {
        if (R.chance(0.35 + this.nerve(h, st.mech) * 0.65)) this.attack(h, low, s);
        return;
      }
      // harass
      const v = near.filter(e => hyp(e.x - h.x, e.y - h.y) < h.h.range + 3.5)[0];
      if (v && R.chance(0.05 + st.mech * 0.1 + this.team(h.team).plan.risk * 0.08)) {
        const j = h.h.ab.findIndex((ab, q) => h.cds[q] <= 0 && h.mana > ab.mana + 90 && (ab.k === 'nuke' || ab.k === 'slow'));
        if (j >= 0 && R.chance(0.25)) {
          if (hyp(v.x - h.x, v.y - h.y) <= h.h.ab[j].range) {
            this.cast(h, j, v);
            return;
          }
        }
        this.attack(h, v, s);
        return;
      }
      if (this.tick > 2400 || !sup) {
        if (this.tick > 2000 && R.chance(0.6)) {
          this.attack(h, ec, s);
          this.clear(h, s);
          return;
        }
      }
      const p = this.lanePos(h.team, lane, Math.max(4, front - (h.h.range > 4 ? 4.5 : 2) - (sup ? 1.5 : 0)));
      const w = dsin(this.tick * 0.06 + h.i * 1.7) * 1.6;
      this.walk(h, p[0] + w, p[1] - w, s.sp * 0.7);
      return;
    }
    const p = this.lanePos(h.team, lane, Math.max(6, Math.min(front - 3, this.lanesLen[lane] * (this.tick < 2400 ? 0.52 : 0.75))));
    this.walk(h, p[0] + ((h.i % 3) - 1) * 1.2, p[1] + (h.i % 2) * 1.2, s.sp);
  }
  clear(h: Hero, s: any) {
    if (h.mana < h.maxMana * 0.45 || this.tick % 7 !== h.i % 7) return;
    const j = h.h.ab.findIndex((ab, q) => h.cds[q] <= 0 && ab.k === 'aoe');
    if (j >= 0) {
      const c = this.creeps.filter(c => c.alive && c.team !== h.team && hyp(c.x - h.x, c.y - h.y) < h.h.ab[j].range);
      if (c.length >= 3) this.cast(h, j, c[1]);
    }
    void s;
  }
  nearCreep(h: Hero, r: number, lane = -1) {
    let b: Creep | null = null,
      bd = r;
    for (const c of this.creeps)
      if (c.alive && c.team !== h.team && (lane < 0 || c.lane === lane)) {
        const d = hyp(c.x - h.x, c.y - h.y);
        if (d < bd) {
          bd = d;
          b = c;
        }
      }
    return b;
  }
  battle(h: Hero, near: Hero[], mates: Hero[], s: any) {
    const R = this.rng,
      st = h.p.st;
    h.path = [];
    if (this.tryHeal(h, mates, s)) return;
    const rng = h.h.range;
    let best: Hero = near[0],
      bs = -1e9;
    for (const e of near) {
      const d = hyp(e.x - h.x, e.y - h.y);
      const focus = mates.filter(m => m.tgt === e).length * (0.8 + st.team * 1.2);
      const sc =
        (1 - e.hp / e.maxHp) * 6 - d * 0.55 + focus + (e.role === 'carry' || e.role === 'hard' ? 1.2 * st.dec : 0) + (e.stun > 0 ? 1.5 : 0);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    h.tgt = best;
    const d = hyp(best.x - h.x, best.y - h.y);
    const sk = this.nerve(h, st.util);
    if (h.castT <= 0) {
      if (h.ucd <= 0 && h.lvl >= 6 && h.mana >= h.h.ult.mana) {
        const u = h.h.ult;
        const inR = near.filter(e => hyp(e.x - best.x, e.y - best.y) < (u.r ?? 3)).length;
        const want =
          u.k === 'heal' || u.k === 'shield'
            ? u.r
              ? mates.filter(m => m.hp / m.maxHp < 0.6).length + (h.hp / h.maxHp < 0.5 ? 1 : 0) >= 2 || h.hp / h.maxHp < 0.3
              : h.hp / h.maxHp < 0.5
            : u.r && u.r >= 4
              ? inR >= Math.min(2, near.length)
              : best.hp / best.maxHp < 0.65;
        if (want && (u.range === 0 || d <= u.range) && R.chance(0.12 + sk * 0.3)) {
          this.cast(h, 2, best);
          return;
        }
      }
      for (let j = 0; j < 2; j++) {
        const ab = h.h.ab[j];
        if (h.cds[j] > 0 || h.mana < ab.mana) continue;
        if (ab.k === 'dash') {
          if (d > rng + 1 && d < ab.range + rng + 1 && R.chance(0.25 * (0.4 + sk))) {
            this.cast(h, j, best);
            return;
          }
          continue;
        }
        if (ab.k === 'shield') {
          if ((h.hp / h.maxHp < 0.75 || near.length >= 2) && R.chance(0.12 + sk * 0.2)) {
            this.cast(h, j, best);
            return;
          }
          continue;
        }
        if (ab.k === 'heal') continue;
        if (d <= ab.range && (ab.k !== 'stun' || best.stun <= 2) && R.chance(0.1 + sk * 0.25)) {
          this.cast(h, j, best);
          return;
        }
      }
    }
    // positioning: ranged kite, melee chase
    const threat = near.filter(e => e.h.range < 4 && hyp(e.x - h.x, e.y - h.y) < 4.5)[0];
    if (rng > 4 && threat && h.ac > 2 && R.chance(0.3 + this.nerve(h, st.mech) * 0.6)) {
      const a = datan2(h.y - threat.y, h.x - threat.x);
      this.nudge(h, a, s.sp * (h.slow > 0 ? 0.55 : 1));
      h.anim = 'run';
      return;
    }
    if (d <= rng + 0.6) this.attack(h, best, s);
    else this.walk(h, best.x, best.y, s.sp);
  }
  tryHeal(h: Hero, mates: Hero[], s: any) {
    if (h.castT > 0) return false;
    for (let j = 0; j < 2; j++) {
      const ab = h.h.ab[j];
      if ((ab.k !== 'heal' && !(ab.k === 'shield' && ab.range > 0)) || h.cds[j] > 0 || h.mana < ab.mana) continue;
      const c = [h, ...mates]
        .filter(
          m =>
            hyp(m.x - h.x, m.y - h.y) <= Math.max(1, ab.range) &&
            m.hp / m.maxHp < (ab.k === 'heal' ? 0.62 : 0.5) &&
            this.tick - m.hurtT < 60,
        )
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.i - b.i)[0];
      if (c && this.rng.chance(0.15 + h.p.st.util * 0.3)) {
        this.cast(h, j, c);
        return true;
      }
    }
    void s;
    return false;
  }
  cast(h: Hero, j: number, t: Unit) {
    const ab: MobaAbility = j === 2 ? h.h.ult : h.h.ab[j];
    const s = this.st(h),
      R = this.rng;
    h.mana -= ab.mana;
    if (j === 2) h.ucd = ab.cd * 10;
    else h.cds[j] = Math.round(ab.cd * 10 * (1 - h.lvl * 0.008));
    h.castT = 6;
    h.anim = j === 2 ? 'ult' : 'cast';
    h.dir = datan2(t.y - h.y, t.x - h.x);
    const pow = ab.pow * s.pow,
      col = h.h.look.glow;
    const skill = this.nerve(h, h.p.st.util);
    this.emit('cast', { i: h.i, u: j === 2, name: ab.name, ak: ab.k, x: t.x, y: t.y, r: ab.r ?? 0, col });
    const dodge = (v: Unit) =>
      v.kind === 'hero' &&
      R.chance(clamp(0.32 + v.p.st.react * 0.3 - skill * 0.42 - (v.stun > 0 ? 1 : 0) - (v.slow > 0 ? 0.15 : 0), 0.02, 0.6));
    const inR = (x: number, y: number, r: number) => this.actors.filter(e => e.alive && e.team !== h.team && hyp(e.x - x, e.y - y) < r);
    switch (ab.k) {
      case 'nuke': {
        const ms = dodge(t) ? 0.25 : 1;
        this.projs.push({ id: this.uid++, x: h.x, y: h.y, sp: 1.7, tgt: t, dmg: pow * ms, by: h, kind: 'spell', col });
        break;
      }
      case 'slow': {
        const tx = t.x,
          ty = t.y;
        if (ab.r)
          this.zones.push({
            x: tx,
            y: ty,
            r: ab.r,
            t: 4,
            team: h.team,
            kind: 'slow',
            col,
            fn: () => {
              this.emit('aoe', { x: tx, y: ty, r: ab.r, col, ak: 'slow' });
              for (const e of inR(tx, ty, ab.r!)) {
                this.hurt(e, h, pow, 'spell', true);
                e.slow = Math.max(e.slow, 30);
              }
            },
          });
        else
          this.projs.push({
            id: this.uid++,
            x: h.x,
            y: h.y,
            sp: 1.6,
            tgt: t,
            dmg: pow,
            by: h,
            kind: 'spell',
            col,
            eff: () => {
              if (t.kind === 'hero') t.slow = Math.max(t.slow, 30);
            },
          });
        break;
      }
      case 'stun': {
        const tx = t.x,
          ty = t.y;
        const dur = j === 2 ? 22 : 15;
        if (ab.r)
          this.zones.push({
            x: tx,
            y: ty,
            r: ab.r,
            t: 5,
            team: h.team,
            kind: 'stun',
            col,
            fn: () => {
              this.emit('aoe', { x: tx, y: ty, r: ab.r, col, ak: 'stun' });
              for (const e of inR(tx, ty, ab.r!))
                if (!dodge(e)) {
                  this.hurt(e, h, pow, 'spell', true);
                  e.stun = Math.max(e.stun, dur);
                }
            },
          });
        else {
          const miss = dodge(t);
          this.projs.push({
            id: this.uid++,
            x: h.x,
            y: h.y,
            sp: 1.8,
            tgt: t,
            dmg: miss ? pow * 0.2 : pow,
            by: h,
            kind: 'spell',
            col,
            eff: () => {
              if (!miss && t.kind === 'hero') {
                t.stun = Math.max(t.stun, dur);
                this.emit('stun', { i: t.i });
              }
            },
          });
        }
        break;
      }
      case 'aoe': {
        const tx = t.x,
          ty = t.y,
          r = ab.r ?? 3;
        this.zones.push({
          x: tx,
          y: ty,
          r,
          t: j === 2 ? 7 : 5,
          team: h.team,
          kind: 'aoe',
          col,
          fn: () => {
            this.emit('aoe', { x: tx, y: ty, r, col, ak: 'aoe', u: j === 2 });
            for (const e of inR(tx, ty, r)) this.hurt(e, h, pow * (dodge(e) ? 0.35 : 1), 'spell', true);
            for (const c of this.creeps)
              if (c.alive && c.team !== h.team && hyp(c.x - tx, c.y - ty) < r) this.hurt(c, h, pow * 0.8, 'spell', true);
          },
        });
        break;
      }
      case 'heal': {
        const L = ab.r ? this.actors.filter(m => m.team === h.team && m.alive && hyp(m.x - h.x, m.y - h.y) < ab.r!) : [t as Hero];
        for (const m of L)
          if (m.kind === 'hero' && m.team === h.team) {
            const v = Math.min(pow, m.maxHp - m.hp);
            m.hp += v;
            h.heal += v;
            this.emit('heal', { i: m.i, col });
          }
        break;
      }
      case 'shield': {
        const L = ab.r
          ? this.actors.filter(m => m.team === h.team && m.alive && hyp(m.x - h.x, m.y - h.y) < ab.r!)
          : ab.range > 0 && t.kind === 'hero' && t.team === h.team
            ? [t]
            : [h];
        for (const m of L) {
          m.shield = Math.max(m.shield, pow);
          m.shieldT = 45;
          this.emit('shield', { i: m.i, col });
        }
        break;
      }
      case 'dash': {
        const a = datan2(t.y - h.y, t.x - h.x),
          dd = Math.min(ab.range, Math.max(0, hyp(t.x - h.x, t.y - h.y) - 1.5));
        const fx = h.x,
          fy = h.y;
        [h.x, h.y] = this.map.grid.charge(h.x, h.y, dcos(a) * dd, dsin(a) * dd, BODY);
        h.path = [];
        this.emit('dash', { i: h.i, fx, fy, col });
        if (t.kind === 'hero' && t.team !== h.team && hyp(t.x - h.x, t.y - h.y) < 3) this.hurt(t, h, pow, 'spell', true);
        break;
      }
    }
  }
  attack(h: Hero, t: Unit, s: any) {
    const d = hyp(t.x - h.x, t.y - h.y),
      rg = h.h.range + (t.kind === 'tower' ? (t.core ? 2.6 : 1.6) : t.kind === 'boss' ? 1.8 : 0);
    if (d > rg) {
      this.walk(h, t.x, t.y, s.sp);
      return;
    }
    h.dir = datan2(t.y - h.y, t.x - h.x);
    h.path = [];
    if (h.ac > 0) {
      if (h.atkT > 0) h.anim = 'attack';
      return;
    }
    h.ac = s.as;
    h.atkT = 5;
    h.anim = 'attack';
    let dmg = s.dmg * (0.92 + this.rng.f() * 0.16);
    if (this.buffT[h.team] > 0) dmg *= 1.12;
    if (t.kind === 'hero') dmg *= 0.85 + this.nerve(h, h.p.st.mech) * 0.3;
    if (this.rng.chance(0.06 + h.p.st.mech * 0.08)) dmg *= 1.5;
    if (h.h.range > 4) this.projs.push({ id: this.uid++, x: h.x, y: h.y, sp: 1.9, tgt: t, dmg, by: h, kind: 'atk', col: h.h.look.glow });
    else {
      this.emit('atk', { i: h.i, x: t.x, y: t.y });
      this.hurt(t, h, dmg, 'atk');
    }
  }
  flee(h: Hero, near: Hero[], s: any) {
    const b = this.home[h.team];
    if (near.length && h.castT <= 0) {
      const j = h.h.ab.findIndex((ab, q) => ab.k === 'dash' && h.cds[q] <= 0 && h.mana >= ab.mana);
      if (j >= 0 && this.rng.chance(0.1 + h.p.st.react * 0.3)) {
        const ab = h.h.ab[j];
        const a = datan2(b[1] - h.y, b[0] - h.x);
        h.mana -= ab.mana;
        h.cds[j] = ab.cd * 10;
        const fx = h.x,
          fy = h.y;
        [h.x, h.y] = this.map.grid.charge(h.x, h.y, dcos(a) * ab.range, dsin(a) * ab.range, BODY);
        h.path = [];
        this.emit('dash', { i: h.i, fx, fy, col: h.h.look.glow });
      }
      const q = h.h.ab.findIndex(
        (ab, i) => ab.k === 'stun' && h.cds[i] <= 0 && h.mana >= ab.mana && hyp(near[0].x - h.x, near[0].y - h.y) <= ab.range,
      );
      if (q >= 0 && this.rng.chance(0.04 + h.p.st.util * 0.1)) {
        this.cast(h, q, near[0]);
        return;
      }
    }
    this.walk(h, b[0], b[1], s.sp * 1.02);
  }
  nudge(h: Hero, a: number, sp: number) {
    [h.x, h.y] = this.map.grid.slide(h.x, h.y, dcos(a) * sp, dsin(a) * sp, BODY);
    h.dir = a;
  }
  walk(h: Hero, x: number, y: number, sp: number) {
    if (h.slow > 0) sp *= 0.55;
    const moved = h.goal ? hyp(h.goal[0] - x, h.goal[1] - y) : 99;
    if (!h.path.length || (moved > 3 && h.repath <= 0) || (moved > 0.8 && h.repath <= 0)) {
      const d = hyp(x - h.x, y - h.y);
      if (d < 0.4) return;
      h.goal = [x, y];
      h.path = d < 9 && this.map.grid.clear(h.x, h.y, x, y) ? [[x, y]] : this.map.grid.path(h.x, h.y, x, y);
      h.repath = 8 + (h.i % 5);
    }
    const p = h.path[0];
    if (!p) return;
    const dx = p[0] - h.x,
      dy = p[1] - h.y,
      d = hyp(dx, dy);
    if (d <= sp) {
      h.path.shift();
      h.vx = dx;
      h.vy = dy;
    } else {
      h.vx = (dx / d) * sp;
      h.vy = (dy / d) * sp;
    }
    if (d > 0.02) h.dir = datan2(dy, dx);
    h.anim = 'run';
  }
  move(h: Hero) {
    const ox = h.x,
      oy = h.y;
    [h.x, h.y] = this.map.grid.slide(h.x, h.y, h.vx, h.vy, BODY);
    const want = hyp(h.vx, h.vy);
    if (want > 0.15 && hyp(h.x - ox, h.y - oy) < want * 0.25) {
      if (++h.stuck > 6) {
        h.stuck = 0;
        h.path = [];
        h.repath = 0;
      }
    } else h.stuck = 0;
  }
  /** towers, cores and the river boss are solid; creeps and heroes slide around them */
  solids() {
    const o = this.map.grid.obstacles;
    o.length = 0;
    for (const s of this.map.grid.statics) o.push(s);
    for (const t of this.towers) if (t.alive) o.push({ x: t.x, y: t.y, r: t.core ? 2.3 : 1.1 });
    if (this.boss.alive) o.push({ x: this.boss.x, y: this.boss.y, r: 1.2 });
  }
  orders(team: 0 | 1): OrderDef[] {
    const o: OrderDef[] = [
      { cmd: 'push0', label: 'Push top', hint: 'Five as one, top lane', group: 'Group call', icon: 'tower-fall' },
      { cmd: 'push1', label: 'Push mid', hint: 'Five as one, mid lane', group: 'Group call', icon: 'tower-fall' },
      { cmd: 'push2', label: 'Push bottom', hint: 'Five as one, bottom lane', group: 'Group call', icon: 'tower-fall' },
      { cmd: 'farm', label: 'Farm', hint: 'Split and collect gold', group: 'Tempo', icon: 'two-coins' },
      { cmd: 'gank', label: 'Hunt', hint: 'Supports and mid look for kills', group: 'Tempo', icon: 'hunting-horn' },
      { cmd: 'defend', label: 'Defend', hint: 'Hold the lane under pressure', group: 'Tempo', icon: 'shield' },
    ];
    if (this.boss.alive)
      o.push({ cmd: 'boss', label: 'Warden', hint: 'Commit to the river boss', group: 'Group call', icon: 'spiked-dragon-head' });
    if (this.timeouts[team] > 0)
      o.push({
        cmd: 'timeout',
        label: `Pause (${this.timeouts[team]})`,
        hint: 'Settle nerves for two minutes',
        group: 'Bench',
        icon: 'hourglass',
      });
    return o;
  }
  order(team: 0 | 1, cmd: string) {
    if (this.done) return false;
    if (cmd === 'timeout') {
      if (this.timeouts[team] <= 0) return false;
      this.timeouts[team]--;
      this.calm[team] = 1200;
      for (const a of this.actors) if (a.team === team) a.tilt *= 0.4;
      this.emit('timeout', { team });
      return true;
    }
    if (!/^(push[012]|farm|gank|defend|boss)$/.test(cmd)) return false;
    this.pending[team] = cmd;
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
          obj: a.obj,
          hero: a.h.id,
          gold: Math.round(a.nw),
          lvl: a.lvl,
          rating:
            Math.round(
              clamp(
                0.55 +
                  ((a.k * 0.5 + a.a * 0.32 - a.d * 0.42) / min) * 1.35 +
                  a.nw / min / 4200 +
                  a.obj * 0.03 +
                  a.heal / min / 3000 +
                  (t === this.winner ? 0.1 : 0),
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
export { PI };
