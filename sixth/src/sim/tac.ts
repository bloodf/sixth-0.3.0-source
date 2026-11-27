/** Tactical shooter simulation (CS2 / Valorant class). Deterministic: same cfg + same orders => same result on any machine. */
import { Rng } from '../core/rng.ts';
import { angDiff, clamp, datan2, dcos, dsin, hyp, PI } from '../core/dmath.ts';
import { sha256 } from '../core/hash.ts';
import { separate } from './bodies.ts';
import { getMap, type TacMap, type SiteDef } from './maps.ts';
import { AGENT_BY } from '../data/heroes.ts';
import type { Actor, Ev, GameResult, MatchCfg, OrderDef, PStat, Sim, SimPlayer, SimTeam } from './types.ts';

type Wpn = 'pistol' | 'smg' | 'rifle' | 'awp' | 'shotgun';
interface WDef {
  cost: number;
  dmg: number;
  rof: number;
  acc: number;
  fall: number;
  move: number;
  mag: number;
  kill: number;
}
const WPN: Record<Wpn, WDef> = {
  pistol: { cost: 0, dmg: 27, rof: 3, acc: 0.27, fall: 15, move: 0.75, mag: 12, kill: 300 },
  smg: { cost: 1300, dmg: 23, rof: 1, acc: 0.2, fall: 14, move: 0.8, mag: 25, kill: 450 },
  shotgun: { cost: 1100, dmg: 60, rof: 8, acc: 0.5, fall: 6, move: 0.8, mag: 6, kill: 700 },
  rifle: { cost: 2800, dmg: 31, rof: 1, acc: 0.225, fall: 27, move: 0.4, mag: 30, kill: 300 },
  awp: { cost: 4750, dmg: 118, rof: 15, acc: 0.62, fall: 60, move: 0.12, mag: 5, kill: 100 },
};
type Mode = 'stage' | 'exec' | 'post' | 'hold' | 'rotate' | 'retake' | 'plant' | 'defuse' | 'save' | 'mid' | 'hunt';
interface Ag extends Actor {
  p: SimPlayer;
  armor: number;
  w: Wpn;
  util: Record<string, number>;
  money: number;
  mag: number;
  reload: number;
  cool: number;
  blind: number;
  stun: number;
  slow: number;
  path: [number, number][];
  goal: [number, number] | null;
  look: number | null;
  mode: Mode;
  site: 'A' | 'B';
  route: [number, number][];
  ri: number;
  delay: number;
  tgt: number;
  seen: number[];
  alertT: number;
  alertD: number;
  strafe: number;
  strafeT: number;
  tilt: number;
  k: number;
  d: number;
  a: number;
  dmg: number;
  obj: number;
  rk: number;
  dmgBy: number[];
  useT: number;
  ult: number;
  od: number;
  kit: boolean;
  vx: number;
  vy: number;
  revealT: number;
  stuck: number;
  conf: number;
  anchored: boolean;
  fireT: number;
  hurtT: number;
  moving: boolean;
  deadT: number;
  walkT: number;
}
export interface Smoke {
  x: number;
  y: number;
  r: number;
  t: number;
  team: number;
  kind: 'smoke' | 'domain';
}
export interface Fire {
  x: number;
  y: number;
  r: number;
  t: number;
  team: number;
  by: number;
}
export interface VWall {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  team: number;
}
export interface Trap {
  x: number;
  y: number;
  team: number;
  by: number;
  on: boolean;
}
export interface Bomb {
  state: 'held' | 'drop' | 'plant' | 'done';
  x: number;
  y: number;
  by: number;
  t: number;
  site: 'A' | 'B';
}

const RUN = 0.46,
  WALK = 0.24; // metres per tick
/** collision radius in metres; characters are drawn at 1.4x so this matches the shoulders */
export const BODY = 0.45;
const BOMB_T = 400,
  ROUND_T = 1000;

export class TacSim implements Sim {
  tick = 0;
  done = false;
  score: [number, number] = [0, 0];
  actors: Ag[] = [];
  ev: Ev[] = [];
  map: TacMap;
  rng: Rng;
  val: boolean;
  round = 0;
  t = 0;
  ph: 'freeze' | 'live' | 'end' | 'break' = 'freeze';
  phT = 0;
  tSide: 0 | 1 = 0;
  smokes: Smoke[] = [];
  fires: Fire[] = [];
  walls: VWall[] = [];
  traps: Trap[] = [];
  flying: { x0: number; y0: number; x: number; y: number; t: number; T: number; kind: string; team: number; by: number }[] = [];
  bomb: Bomb = { state: 'held', x: 0, y: 0, by: -1, t: 0, site: 'A' };
  loss: [number, number] = [0, 0];
  streak: [number, number] = [0, 0];
  history: (0 | 1)[] = [];
  log: string[] = [];
  strat = 'default';
  setup = 'std';
  execSite: 'A' | 'B' = 'A';
  execT = 0;
  execOn = false;
  info: { A: number; B: number; mid: number } = { A: 0, B: 0, mid: 0 };
  pend: [Record<string, string>, Record<string, string>] = [{}, {}];
  timeouts: [number, number] = [3, 3];
  boost: [number, number] = [0, 0];
  buyCall: [string, string] = ['auto', 'auto'];
  buyWas: [string, string] = ['', ''];
  vis: Uint8Array = new Uint8Array(100);
  lastSeen: { x: number; y: number; t: number }[] = [];
  roundK = 0;
  firstK = -1;

  constructor(public cfg: MatchCfg) {
    this.map = getMap(cfg.map) as TacMap;
    this.map = { ...this.map, grid: this.map.grid.fork() };
    this.rng = Rng.of(cfg.seed);
    this.val = cfg.title === 'val';
    cfg.teams.forEach((tm, ti) =>
      tm.players.forEach((p, pi) => {
        this.actors.push({
          i: this.actors.length,
          team: ti as 0 | 1,
          x: 0,
          y: 0,
          dir: 0,
          hp: 100,
          maxHp: 100,
          alive: true,
          anim: 'idle',
          nick: p.nick,
          num: p.num,
          hero: p.hero,
          role: p.role,
          p,
          armor: 0,
          w: 'pistol',
          util: {},
          money: 800,
          mag: 12,
          reload: 0,
          cool: 0,
          blind: 0,
          stun: 0,
          slow: 0,
          path: [],
          goal: null,
          look: null,
          mode: 'hold',
          site: 'A',
          route: [],
          ri: 0,
          delay: 0,
          tgt: -1,
          seen: new Array(10).fill(0),
          alertT: 0,
          alertD: 0,
          strafe: 0,
          strafeT: 0,
          tilt: 0,
          k: 0,
          d: 0,
          a: 0,
          dmg: 0,
          obj: 0,
          rk: 0,
          dmgBy: new Array(10).fill(0),
          useT: 0,
          ult: 0,
          od: 0,
          kit: false,
          vx: 0,
          vy: 0,
          revealT: 0,
          stuck: 0,
          conf: 0,
          anchored: false,
          fireT: 0,
          hurtT: 0,
          moving: false,
          deadT: 0,
          walkT: 0,
        });
      }),
    );
    for (let i = 0; i < 10; i++) this.lastSeen.push({ x: 0, y: 0, t: -9999 });
    this.startRound();
  }
  team(i: number): SimTeam {
    return this.cfg.teams[i];
  }
  emit(k: string, o: object = {}) {
    this.ev.push({ k, ...o });
  }
  say(s: string) {
    this.log.push(`R${this.round + 1} ${s}`);
    this.emit('say', { s });
  }
  sideOf(a: Ag) {
    return a.team === this.tSide ? 'T' : 'C';
  }
  alive(team: number) {
    return this.actors.filter(a => a.team === team && a.alive);
  }
  clock() {
    if (this.ph === 'freeze') return 'BUY';
    if (this.ph === 'break') return 'HALF';
    const left = this.bomb.state === 'plant' ? Math.max(0, this.bomb.t) : Math.max(0, ROUND_T - this.t);
    const s = Math.ceil(left / 10);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  phase() {
    return this.bomb.state === 'plant' && this.ph === 'live'
      ? this.val
        ? 'Spike planted'
        : 'Bomb planted'
      : this.ph === 'freeze'
        ? 'Buy phase'
        : this.ph === 'break'
          ? 'Half-time'
          : `Round ${this.round + 1}`;
  }

  // ---------- round setup
  startRound() {
    this.ph = 'freeze';
    this.phT = 50;
    this.t = 0;
    this.smokes = [];
    this.fires = [];
    this.walls = [];
    this.traps = [];
    this.flying = [];
    this.execOn = false;
    this.info = { A: 0, B: 0, mid: 0 };
    this.roundK = 0;
    this.firstK = -1;
    const T = this.tSide,
      C = (1 - T) as 0 | 1;
    for (let ti = 0; ti < 2; ti++) {
      const q = this.pend[ti];
      if (q.timeout) {
        this.boost[ti] = 3;
        this.phT = 90;
        this.emit('timeout', { team: ti });
        for (const a of this.actors) if (a.team === ti) a.tilt *= 0.35 - 0.2 * this.team(ti).coach;
        delete q.timeout;
      }
    }
    this.pickStrat(T, C);
    const sp = this.map.spawn;
    let n = [0, 0];
    for (const a of this.actors) {
      const isT = a.team === T,
        s = isT ? sp[0] : sp[1],
        j = n[a.team]++;
      const [x, y] = this.map.grid.nearestWalk(s[0] + (j - 2) * 1.5, s[1] + ((j % 2) * 1.4 - 0.7));
      a.x = x;
      a.y = y;
      a.hp = 100;
      if (!a.alive) {
        a.w = 'pistol';
        a.armor = 0;
        a.util = {};
        a.kit = false;
      }
      a.alive = true;
      a.anim = 'idle';
      a.blind = a.stun = a.slow = a.reload = a.cool = a.od = 0;
      a.path = [];
      a.goal = null;
      a.look = null;
      a.tgt = -1;
      a.seen.fill(0);
      a.alertT = 0;
      a.useT = 0;
      a.rk = 0;
      a.dmgBy.fill(0);
      a.revealT = 0;
      a.conf = 0;
      a.moving = false;
      a.vx = a.vy = 0;
      a.mag = WPN[a.w].mag;
      a.anchored = false;
      const site = this.map.sites.A.plant;
      a.dir = datan2(site[1] - y, site[0] - x);
    }
    this.buy(T);
    this.buy(C);
    this.assign(T, C);
    const ts = this.alive(T),
      carrier = ts.find(a => a.p.role === 'sup' || a.p.role === 'ctrl') ?? ts[0];
    this.bomb = { state: 'held', x: carrier.x, y: carrier.y, by: carrier.i, t: 0, site: this.execSite };
    this.emit('round', { n: this.round + 1, tSide: T, strat: this.strat, buy: [...this.buyWas] });
  }
  pickStrat(T: 0 | 1, C: 0 | 1) {
    const pt = this.team(T).plan,
      pc = this.team(C).plan,
      R = this.rng;
    const ot = this.pend[T].t,
      oc = this.pend[C].c;
    if (ot) {
      this.strat = ot;
      delete this.pend[T].t;
    } else {
      const fast = 0.2 + pt.tempo * 0.9,
        slow = 1.1 - pt.tempo * 0.7;
      const opts: [string, number][] = [
        ['default', 1.2 * slow],
        ['rushA', 0.35 * fast],
        ['rushB', 0.35 * fast],
        ['splitA', 0.6],
        ['splitB', 0.6],
        ['execA', 0.7],
        ['execB', 0.7],
        ['fakeA', 0.25 * (1 - pt.style)],
        ['fakeB', 0.25 * (1 - pt.style)],
      ];
      if (pt.focus === 'A' || pt.focus === 'B') for (const o of opts) if (o[0].endsWith(pt.focus)) o[1] *= 1.7;
      this.strat = R.weighted(opts, o => o[1])[0];
    }
    if (oc) {
      this.setup = oc;
      delete this.pend[C].c;
    } else
      this.setup = R.weighted(
        [
          ['std', 1.4],
          ['aggr', 0.15 + pc.risk * 0.7],
          ['passive', 0.2 + (1 - pc.risk) * 0.5],
          ['stackA', 0.15],
          ['stackB', 0.15],
        ] as [string, number][],
        o => o[1],
      )[0];
    const s = this.strat;
    this.execSite = s.endsWith('A') ? 'A' : s.endsWith('B') ? 'B' : R.chance(0.5) ? 'A' : 'B';
    if (s === 'fakeA') this.execSite = 'B';
    if (s === 'fakeB') this.execSite = 'A';
  }
  buy(ti: 0 | 1) {
    const ms = this.actors.filter(a => a.team === ti),
      R = this.rng,
      avg = ms.reduce((s, a) => s + a.money, 0) / 5,
      pl = this.team(ti).plan,
      T = ti === this.tSide;
    const pistol = this.round === 0 || this.round === 12;
    let call = this.pend[ti].buy ?? 'auto';
    delete this.pend[ti].buy;
    if (call === 'auto')
      call = pistol
        ? 'pistol'
        : avg > 3900
          ? 'full'
          : avg > 2400 && (R.chance(0.12 + pl.risk * 0.6) || this.score[1 - ti] >= 11 || this.round >= 23)
            ? 'force'
            : this.round === 11 || this.round === 23
              ? 'force'
              : avg > 1900 && R.chance(pl.risk * 0.35)
                ? 'force'
                : 'eco';
    this.buyWas[ti] = call;
    for (const a of ms) {
      const st = a.p.st,
        spend = (c: number) => {
          if (a.money >= c) {
            a.money -= c;
            return true;
          }
          return false;
        };
      const reserve = call === 'eco' ? 2400 : 0,
        can = (c: number) => a.money - reserve >= c;
      if (a.w === 'pistol') {
        if (call === 'full') {
          if (a.p.role === 'awp' && can(4750 + 650)) {
            spend(4750);
            a.w = 'awp';
          } else if (can(2800 + 400)) {
            spend(2800);
            a.w = 'rifle';
          } else if (can(1300)) {
            spend(1300);
            a.w = 'smg';
          }
        } else if (call === 'force') {
          if (can(3500)) {
            spend(2800);
            a.w = 'rifle';
          } else if (can(1900)) {
            spend(1300);
            a.w = 'smg';
          }
        }
      } else if (a.w === 'smg' && call === 'full' && can(3200)) {
        spend(2800);
        a.w = 'rifle';
      }
      if (call !== 'eco') {
        if (a.armor < 50 && can(650)) {
          spend(650);
          a.armor = 100;
        } else if (pistol && can(650)) {
          spend(650);
          a.armor = 100;
        }
      }
      if (!T && call !== 'eco' && can(400) && !a.kit) {
        spend(400);
        a.kit = true;
      }
      a.mag = WPN[a.w].mag;
      if (this.val) {
        const ag = AGENT_BY[a.p.hero ?? ''] ?? AGENT_BY.gust;
        const n: Record<string, number> = {};
        const rich = call === 'full' ? 1 : call === 'eco' ? 0.45 : 0.75;
        for (const k of ag.kit) if (rich >= 1 || R.chance(rich)) n[k] = (n[k] ?? 0) + 1;
        if (n.recon) n.recon = 2;
        a.util = n;
        if (call !== 'eco') spend(Math.min(a.money, 400));
      } else {
        const u: Record<string, number> = a.util.smoke || a.util.flash ? a.util : {};
        const b = call === 'full' ? 1 : call === 'force' ? 0.6 : pistol ? 0.4 : 0.15;
        if (R.chance(b) && can(300)) {
          spend(300);
          u.smoke = 1;
        }
        if (R.chance(b) && can(200)) {
          spend(200);
          u.flash = a.p.role === 'sup' ? 2 : 1;
        }
        if (R.chance(b * 0.75) && can(400)) {
          spend(400);
          u.molly = 1;
        }
        if (R.chance(b * 0.5) && can(300)) {
          spend(300);
          u.he = 1;
        }
        a.util = u;
        void st;
      }
    }
  }
  assign(T: 0 | 1, C: 0 | 1) {
    const R = this.rng,
      ts = this.alive(T),
      cs = this.alive(C),
      S = this.map.sites,
      s = this.strat;
    // attackers
    const other = this.execSite === 'A' ? 'B' : 'A';
    const rush = s.startsWith('rush');
    const order = [...ts].sort(
      (a, b) =>
        b.p.st.mech +
        (b.p.role === 'entry' || b.p.role === 'duel' ? 1 : 0) -
        (a.p.st.mech + (a.p.role === 'entry' || a.p.role === 'duel' ? 1 : 0)),
    );
    order.forEach((a, j) => {
      const site = S[this.execSite];
      a.site = this.execSite;
      a.mode = 'stage';
      a.ri = 0;
      let route = site.routes[0];
      const lurk = a.p.role === 'lurk' || a.p.role === 'flex';
      if (s.startsWith('split')) route = site.routes[j % 2];
      else if (rush) route = site.routes[0];
      else if (s.startsWith('exec')) route = site.routes[j === 4 ? 1 : 0];
      else if (s === 'default') {
        if (j === 0) route = S.A.routes[0];
        else if (j === 1) route = S.B.routes[0];
        else if (j === 2) route = this.map.midRoute.concat(site.routes[1].slice(2));
        else route = site.routes[j % 2];
      } else if (s.startsWith('fake')) {
        route = j < 2 ? S[other].routes[0] : site.routes[j % 2];
      }
      if (lurk && !rush && j > 1) route = S[other].routes[0];
      a.route = route;
      a.delay = rush ? j * 3 : R.int(0, 20) + j * 5;
    });
    this.execT = rush
      ? 60
      : s === 'default'
        ? R.int(380, 560)
        : s.startsWith('fake')
          ? R.int(430, 560)
          : R.int(230, 400) + Math.round((0.5 - this.team(T).plan.tempo) * 140);
    // defenders
    const need: ('A' | 'B' | 'mid')[] =
      this.setup === 'stackA'
        ? ['A', 'A', 'A', 'B', 'mid']
        : this.setup === 'stackB'
          ? ['B', 'B', 'B', 'A', 'mid']
          : R.chance(0.5)
            ? ['A', 'A', 'mid', 'B', 'B']
            : ['A', 'A', 'B', 'B', 'mid'];
    const cpick = [...cs].sort((a, b) => b.p.st.pos - a.p.st.pos);
    const used = new Set<string>();
    cpick.forEach((a, j) => {
      const z = need[j];
      a.mode = 'hold';
      a.delay = R.int(0, 6);
      a.anchored = j < 2;
      let h: [number, number, number, number];
      if (z === 'mid') {
        h = R.pick(this.map.mid);
        a.site = R.chance(0.5) ? 'A' : 'B';
      } else {
        const L = S[z].holds;
        let k = R.int(0, L.length - 1);
        for (let q = 0; q < L.length && used.has(z + k); q++) k = (k + 1) % L.length;
        used.add(z + k);
        h = L[k];
        a.site = z;
        if (this.setup === 'aggr' && !a.anchored && R.chance(0.6)) {
          const r = S[z].routes[0];
          const p = r[Math.max(0, r.length - 2)];
          h = [p[0], p[1], r[Math.max(0, r.length - 4)][0], r[Math.max(0, r.length - 4)][1]];
        }
      }
      const [gx, gy] = this.map.grid.nearestWalk(h[0], h[1]);
      a.goal = [gx, gy];
      a.look = datan2(h[3] - gy, h[2] - gx);
      a.path = [];
      if (this.val && a.util.trap) {
        const r = S[a.site].routes[j % S[a.site].routes.length],
          p = r[Math.max(0, r.length - 2)];
        this.traps.push({ x: p[0], y: p[1], team: C, by: a.i, on: true });
        a.util.trap--;
      }
    });
  }
  // ---------- helpers
  blocked(x0: number, y0: number, x1: number, y1: number, team: number): boolean {
    for (const s of this.smokes) {
      if (s.kind === 'domain' && s.team === team) continue;
      const dx = x1 - x0,
        dy = y1 - y0,
        l2 = dx * dx + dy * dy;
      let u = l2 > 0 ? ((s.x - x0) * dx + (s.y - y0) * dy) / l2 : 0;
      u = clamp(u, 0, 1);
      const ex = x0 + dx * u - s.x,
        ey = y0 + dy * u - s.y;
      if (ex * ex + ey * ey < s.r * s.r * 0.8) return true;
    }
    for (const w of this.walls) {
      const d1 = (x1 - x0) * (w.y0 - y0) - (y1 - y0) * (w.x0 - x0),
        d2 = (x1 - x0) * (w.y1 - y0) - (y1 - y0) * (w.x1 - x0),
        d3 = (w.x1 - w.x0) * (y0 - w.y0) - (w.y1 - w.y0) * (x0 - w.x0),
        d4 = (w.x1 - w.x0) * (y1 - w.y0) - (w.y1 - w.y0) * (x1 - w.x0);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
    return false;
  }
  eff(a: Ag, v: number) {
    const t = this.team(a.team),
      late = this.round > 14 ? (1 - a.p.st.stam) * 0.06 : 0;
    let m = 1 - a.tilt * 0.14 - late + (this.boost[a.team] > 0 ? 0.03 + 0.03 * t.coach : 0);
    const opp = this.score[1 - a.team] - this.score[a.team];
    if (a.p.traits.includes('clutch') && (opp >= 3 || this.alive(a.team).length <= 2)) m += 0.06;
    return v * m;
  }
  go(a: Ag, x: number, y: number) {
    if (a.goal && Math.abs(a.goal[0] - x) < 0.3 && Math.abs(a.goal[1] - y) < 0.3 && a.path.length) return;
    const g = this.map.grid.nearestWalk(x, y);
    a.goal = g;
    a.path = this.map.grid.path(a.x, a.y, g[0], g[1]);
  }
  hurt(v: Ag, by: Ag | null, dmg: number, how: string, hs = false) {
    if (!v.alive) return;
    let d = dmg;
    if (v.armor > 0 && how !== 'fire') {
      const sv = d * 0.24;
      v.armor = Math.max(0, v.armor - sv * 1.6);
      d -= sv;
    }
    d = Math.min(v.hp, d);
    v.hp -= d;
    v.hurtT = this.tick;
    if (by && by.team !== v.team) {
      by.dmg += d;
      v.dmgBy[by.i] += d;
    }
    this.emit('hit', { i: v.i, by: by?.i ?? -1, d, hs });
    if (v.hp <= 0.01) {
      v.hp = 0;
      v.alive = false;
      v.anim = 'dead';
      v.deadT = this.tick;
      v.d++;
      v.tilt = clamp(
        v.tilt +
          0.1 *
            (1.3 - this.cfg.teams[v.team].players.find(p => p.id === v.p.id)!.st.comp) *
            (v.p.traits.includes('hothead') ? 1.7 : v.p.traits.includes('ice') ? 0.5 : 1),
        0,
        1,
      );
      if (by && by.team !== v.team) {
        by.k++;
        by.rk++;
        by.money += WPN[by.w].kill;
        by.tilt *= 0.9;
        by.ult++;
        this.roundK++;
        if (this.firstK < 0) this.firstK = by.i;
      }
      v.ult += 1;
      for (const o of this.actors) if (o.team !== v.team && o !== by && v.dmgBy[o.i] > 30) o.a++;
      this.emit('kill', { i: v.i, by: by?.i ?? -1, w: how, hs, x: v.x, y: v.y });
      for (const m of this.actors)
        if (m.team === v.team && m.alive && by) {
          const dd = hyp(m.x - v.x, m.y - v.y);
          if (dd < 22 || this.rng.chance(m.p.st.comms)) {
            this.lastSeen[by.i] = { x: by.x, y: by.y, t: this.tick };
          }
          if (dd < 16) {
            m.alertT = 12;
            m.alertD = datan2(by.y - m.y, by.x - m.x);
          }
        }
      if (by && by.rk >= 4) this.say(`${by.nick} ${by.rk === 5 ? 'aces the round!' : 'has four!'}`);
      if (this.bomb.state === 'held' && this.bomb.by === v.i) {
        this.bomb.state = 'drop';
        this.bomb.x = v.x;
        this.bomb.y = v.y;
        this.emit('drop', { x: v.x, y: v.y });
      }
    }
  }
  throwU(a: Ag, kind: string, x: number, y: number) {
    if (!a.util[kind]) return false;
    a.util[kind]--;
    const d = hyp(x - a.x, y - a.y),
      T = Math.max(4, Math.round(d / 1.6));
    this.flying.push({ x0: a.x, y0: a.y, x, y, t: 0, T, kind, team: a.team, by: a.i });
    a.cool = Math.max(a.cool, 5);
    a.anim = 'throw';
    a.fireT = this.tick;
    this.emit('throw', { i: a.i, kind, x, y, T });
    return true;
  }
  land(f: TacSim['flying'][0]) {
    const by = this.actors[f.by];
    if (f.kind === 'smoke') {
      this.smokes.push({ x: f.x, y: f.y, r: this.val ? 3.4 : 3.1, t: 150, team: f.team, kind: 'smoke' });
      this.emit('smoke', { x: f.x, y: f.y, team: f.team });
    } else if (f.kind === 'flash') {
      this.emit('flash', { x: f.x, y: f.y });
      for (const v of this.actors)
        if (v.alive) {
          const d = hyp(v.x - f.x, v.y - f.y);
          if (d < 18 && this.map.grid.los(f.x, f.y, v.x, v.y) && !this.blocked(f.x, f.y, v.x, v.y, -1)) {
            const face = Math.abs(angDiff(v.dir, datan2(f.y - v.y, f.x - v.x)));
            const own = v.team === f.team;
            const turn = own ? 0.85 : 0.15 + v.p.st.react * 0.35;
            if (face < 1.6 && !this.rng.chance(turn)) {
              v.blind = Math.max(v.blind, Math.round((26 - d) * (1.15 - v.p.st.react * 0.35)));
              this.emit('blind', { i: v.i });
            }
          }
        }
    } else if (f.kind === 'molly') {
      this.fires.push({ x: f.x, y: f.y, r: 2.4, t: 65, team: f.team, by: f.by });
      this.emit('molly', { x: f.x, y: f.y });
    } else if (f.kind === 'he') {
      this.emit('boom', { x: f.x, y: f.y, s: 0.6 });
      for (const v of this.actors)
        if (v.alive && v.team !== f.team) {
          const d = hyp(v.x - f.x, v.y - f.y);
          if (d < 5.5 && this.map.grid.los(f.x, f.y, v.x, v.y)) this.hurt(v, by, 58 * (1 - d / 6.5), 'he');
        }
    } else if (f.kind === 'recon') {
      this.emit('recon', { x: f.x, y: f.y, team: f.team });
      for (const v of this.actors)
        if (v.alive && v.team !== f.team && hyp(v.x - f.x, v.y - f.y) < 12) {
          v.revealT = 30;
          this.lastSeen[v.i] = { x: v.x, y: v.y, t: this.tick };
          this.note(v);
        }
    }
  }
  note(v: Ag) {
    const A = this.map.sites.A.plant,
      B = this.map.sites.B.plant;
    const da = hyp(v.x - A[0], v.y - A[1]),
      db = hyp(v.x - B[0], v.y - B[1]);
    const k = da < db ? 'A' : 'B';
    if (Math.min(da, db) < 24 && v.team === this.tSide) this.info[k] += 1;
  }
  // ---------- main step
  step() {
    if (this.done) return;
    this.ev.length = 0;
    this.tick++;
    if (this.ph === 'freeze' || this.ph === 'break') {
      if (--this.phT <= 0) {
        if (this.ph === 'break') {
          this.startRound();
        } else {
          this.ph = 'live';
          this.emit('live');
        }
      }
      return;
    }
    if (this.ph === 'end') {
      if (--this.phT <= 0) {
        this.nextRound();
        return;
      }
      this.moveOnly();
      return;
    }
    this.t++;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      if (++f.t >= f.T) {
        this.flying.splice(i, 1);
        this.land(f);
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) if (--this.smokes[i].t <= 0) this.smokes.splice(i, 1);
    for (let i = this.walls.length - 1; i >= 0; i--) if (--this.walls[i].t <= 0) this.walls.splice(i, 1);
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (--f.t <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      if (f.t % 3 === 0)
        for (const v of this.actors)
          if (v.alive && hyp(v.x - f.x, v.y - f.y) < f.r && this.map.grid.los(f.x, f.y, v.x, v.y))
            this.hurt(v, v.team === f.team ? null : this.actors[f.by], 6, 'fire');
    }
    for (const tr of this.traps)
      if (tr.on)
        for (const v of this.actors)
          if (v.alive && v.team !== tr.team && hyp(v.x - tr.x, v.y - tr.y) < 2) {
            tr.on = false;
            v.slow = 25;
            v.revealT = 30;
            this.lastSeen[v.i] = { x: v.x, y: v.y, t: this.tick };
            this.info[this.nearSite(v)] += 2;
            this.emit('trap', { x: tr.x, y: tr.y, i: v.i });
          }
    if (this.t % 10 === 0) {
      this.info.A *= 0.93;
      this.info.B *= 0.93;
    }
    // visibility matrix
    for (const a of this.actors)
      for (const b of this.actors) {
        if (a.team !== 0 || b.team !== 1) continue;
        let v = 0;
        if (a.alive && b.alive) {
          const d = hyp(a.x - b.x, a.y - b.y);
          if (d < 46 && this.map.grid.los(a.x, a.y, b.x, b.y)) {
            const ba = this.blocked(a.x, a.y, b.x, b.y, a.team),
              bb = this.blocked(a.x, a.y, b.x, b.y, b.team);
            v = (ba ? 0 : 1) | (bb ? 0 : 2);
          }
        }
        this.vis[a.i * 10 + b.i] = v & 1;
        this.vis[b.i * 10 + a.i] = v >> 1;
      }
    this.director();
    for (const a of this.actors) if (a.alive) this.think(a);
    for (const a of this.actors) if (a.alive) this.move(a);
    separate(this.actors, this.map.grid, () => BODY);
    this.objective();
    this.checkEnd();
  }
  nearSite(v: Ag): 'A' | 'B' {
    const A = this.map.sites.A.plant,
      B = this.map.sites.B.plant;
    return hyp(v.x - A[0], v.y - A[1]) < hyp(v.x - B[0], v.y - B[1]) ? 'A' : 'B';
  }
  director() {
    const T = this.tSide,
      C = 1 - T,
      ts = this.alive(T),
      cs = this.alive(C),
      R = this.rng;
    if (!ts.length || !cs.length) return;
    if (this.bomb.state === 'plant') {
      if (this.t % 5 === 0) {
        const site = this.map.sites[this.bomb.site];
        for (const c of cs)
          if (c.mode !== 'retake' && c.mode !== 'defuse' && c.mode !== 'save') {
            const hard = cs.length === 1 && ts.length >= 3 && this.round !== 11 && this.round < 23;
            c.mode = hard && R.chance(0.8) ? 'save' : 'retake';
            c.delay = R.int(0, 25);
            c.path = [];
            c.goal = null;
          }
        let k = 0;
        for (const a of ts)
          if (a.mode !== 'post') {
            a.mode = 'post';
            const h = site.post[(k + a.i) % site.post.length];
            a.look = datan2(h[3] - h[1], h[2] - h[0]);
            this.go(a, h[0], h[1]);
          } else k++;
      }
      return;
    }
    // attackers: call the execute
    if (!this.execOn && this.t % 10 === 0) {
      const igl = ts.reduce((m, a) => Math.max(m, a.p.st.dec * 0.6 + a.p.st.sense * 0.4), 0);
      const staged = ts.filter(a => a.mode !== 'stage' || a.ri >= a.route.length - 2).length;
      const early = this.roundK > 0 && ts.length > cs.length && this.t > 150 && R.chance(0.05 + igl * 0.06);
      if (this.t >= this.execT || early || this.t > 680) {
        if (this.strat === 'default' || this.t > 600) {
          // read the map
          const seenA = this.lastSeen.filter(
              (l, i) =>
                this.actors[i].team === C &&
                this.actors[i].alive &&
                this.tick - l.t < 250 &&
                hyp(l.x - this.map.sites.A.plant[0], l.y - this.map.sites.A.plant[1]) < 20,
            ).length,
            seenB = this.lastSeen.filter(
              (l, i) =>
                this.actors[i].team === C &&
                this.actors[i].alive &&
                this.tick - l.t < 250 &&
                hyp(l.x - this.map.sites.B.plant[0], l.y - this.map.sites.B.plant[1]) < 20,
            ).length;
          if (R.chance(0.35 + igl * 0.6)) this.execSite = seenA < seenB ? 'A' : seenB < seenA ? 'B' : this.execSite;
        }
        if (staged >= ts.length - 1 || this.t > this.execT + 120) {
          this.execOn = true;
          this.emit('exec', { site: this.execSite });
          const site = this.map.sites[this.execSite];
          let si = 0;
          for (const a of ts) {
            if (a.p.role === 'lurk' && ts.length > 3 && a.site !== this.execSite && R.chance(0.6)) {
              a.site = this.execSite;
              a.delay = R.int(20, 50);
              a.mode = 'exec';
              a.route = site.routes[1].slice(-3);
              a.ri = 0;
              continue;
            }
            const was = a.site === this.execSite && a.route.length;
            a.site = this.execSite;
            a.mode = 'exec';
            if (!was || hyp(a.x - site.plant[0], a.y - site.plant[1]) > 34 || !site.routes.includes(a.route as any)) {
              const r = site.routes[a.i % 2];
              a.route = r.slice(Math.max(0, r.length - 4));
              a.ri = 0;
            }
            a.delay = a.p.role === 'entry' || a.p.role === 'duel' ? 0 : R.int(3, 14);
            a.path = [];
            a.goal = null;
          }
          for (const a of ts) {
            const d = hyp(a.x - site.plant[0], a.y - site.plant[1]);
            if (a.util.smoke && d < 34 && si < site.smokes.length && R.chance(0.5 + a.p.st.util * 0.5)) {
              const s = site.smokes[si++];
              const err = (1 - a.p.st.util) * 2.2;
              this.throwU(a, 'smoke', s[0] + R.gauss() * err, s[1] + R.gauss() * err);
            } else if (a.util.flash && d < 30) {
              this.throwU(a, 'flash', site.plant[0] + R.gauss() * 3, site.plant[1] + R.gauss() * 3);
            } else if (a.util.molly && d < 24) {
              const h = R.pick(site.holds);
              this.throwU(a, 'molly', h[0] + R.gauss() * (1 - a.p.st.util) * 2, h[1] + R.gauss() * (1 - a.p.st.util) * 2);
            } else if (a.util.recon) this.throwU(a, 'recon', site.plant[0], site.plant[1]);
            if (this.val && a.ult >= 7) this.ultimate(a, site.plant);
          }
        }
      }
    }
    // defenders: rotate on information
    if (this.t % 8 === 0)
      for (const c of cs)
        if (c.mode === 'hold' && !c.conf) {
          const o = c.site === 'A' ? 'B' : 'A',
            threat = this.info[o],
            here = this.info[c.site];
          const p = (c.p.st.sense * 0.5 + c.p.st.comms * 0.5) * 0.35;
          if (threat > 2.5 && threat > here * 1.8 && R.chance(c.anchored ? p * 0.25 : p)) {
            c.mode = 'rotate';
            c.site = o;
            const h = R.pick(this.map.sites[o].holds);
            c.look = datan2(h[3] - h[1], h[2] - h[0]);
            this.go(c, h[0], h[1]);
            c.mode = 'hold';
          }
        }
    if (this.t % 20 === 0 && this.execOn === false)
      for (const a of ts)
        if (a.mode === 'stage' && a.util.recon && a.ri >= a.route.length - 2 && R.chance(0.3)) {
          const s = this.map.sites[a.site].plant;
          this.throwU(a, 'recon', s[0], s[1]);
        }
  }
  ultimate(a: Ag, at: [number, number]) {
    const ag = AGENT_BY[a.p.hero ?? ''];
    if (!ag) return;
    const k = ag.ult;
    if (k === 'revive') {
      const dead = this.actors.find(o => o.team === a.team && !o.alive && hyp(o.x - a.x, o.y - a.y) < 26);
      if (!dead) return;
      a.ult = 0;
      dead.alive = true;
      dead.hp = 80;
      dead.anim = 'idle';
      dead.mode = a.mode;
      dead.w = 'smg';
      dead.mag = 25;
      dead.path = [];
      dead.goal = null;
      dead.delay = 10;
      this.emit('ult', { i: a.i, u: k, name: ag.ultName, x: dead.x, y: dead.y });
      this.emit('revive', { i: dead.i });
      return;
    }
    a.ult = 0;
    if (k === 'overdrive') a.od = 120;
    else if (k === 'domain') {
      this.smokes.push({ x: at[0], y: at[1], r: 7, t: 130, team: a.team, kind: 'domain' });
    } else {
      const d = datan2(at[1] - a.y, at[0] - a.x);
      for (const v of this.actors)
        if (v.alive && v.team !== a.team) {
          const vd = hyp(v.x - a.x, v.y - a.y),
            da = angDiff(datan2(v.y - a.y, v.x - a.x), d);
          if (vd < 28 && Math.abs(dsin(da)) * vd < 4 && dcos(da) > 0) {
            v.stun = 22;
            v.blind = Math.max(v.blind, 8);
          }
        }
      this.emit('shock', { x: a.x, y: a.y, dir: d });
    }
    this.emit('ult', { i: a.i, u: k, name: ag.ultName, x: at[0], y: at[1] });
  }
  think(a: Ag) {
    const R = this.rng,
      st = a.p.st;
    a.anim = 'idle';
    if (a.cool > 0) a.cool--;
    if (a.blind > 0) a.blind--;
    if (a.stun > 0) a.stun--;
    if (a.slow > 0) a.slow--;
    if (a.od > 0) a.od--;
    if (a.alertT > 0) a.alertT--;
    if (a.revealT > 0) a.revealT--;
    if (a.strafeT > 0) a.strafeT--;
    a.conf = Math.max(0, a.conf - 1);
    a.moving = false;
    if (a.reload > 0 && --a.reload === 0) a.mag = WPN[a.w].mag;
    // perceive
    let best = -1,
      bs = 1e9;
    for (const e of this.actors) {
      if (e.team === a.team || !e.alive) continue;
      const see = this.vis[a.i * 10 + e.i] === 1;
      const d = hyp(e.x - a.x, e.y - a.y);
      const ang = datan2(e.y - a.y, e.x - a.x),
        off = Math.abs(angDiff(ang, a.dir));
      const inFov = off < 1.0 || (off < 1.9 && d < 12);
      if (see && a.blind <= 0 && (inFov || e.revealT > 0)) {
        a.seen[e.i] = Math.min(60, a.seen[e.i] + 1);
        if (this.tick - this.lastSeen[e.i].t > 12) this.note(e);
        this.lastSeen[e.i] = { x: e.x, y: e.y, t: this.tick };
        const s = d + e.hp * 0.05 + off * 4 - (a.tgt === e.i ? 4 : 0);
        if (s < bs) {
          bs = s;
          best = e.i;
        }
      } else {
        a.seen[e.i] = Math.max(0, a.seen[e.i] - 3);
        const loud = (e.moving && e.walkT <= 0 && d < 13) || (this.tick - e.fireT < 4 && d < 34);
        if (loud && a.alertT <= 0 && R.chance(0.1 + st.sense * 0.35)) {
          a.alertT = 14;
          a.alertD = ang;
          if (this.tick - e.fireT < 4) {
            this.lastSeen[e.i] = { x: e.x + R.gauss() * 2, y: e.y + R.gauss() * 2, t: this.tick - 4 };
            this.note(e);
          }
        }
      }
    }
    if (best !== a.tgt) {
      a.tgt = best;
      if (best >= 0 && a.seen[best] <= 1) a.seen[best] = 1;
    }
    if (a.stun > 0) {
      a.anim = 'stun';
      return;
    }
    if (a.tgt >= 0) {
      this.fight(a, this.actors[a.tgt]);
      return;
    }
    if (a.blind > 0) {
      a.anim = 'blind';
      return;
    }
    if (a.reload === 0 && a.mag < WPN[a.w].mag * 0.4) {
      a.reload = 22;
    }
    const fear = this.fires.find(f => hyp(a.x - f.x, a.y - f.y) < f.r + 0.4);
    if (fear) {
      const dx = a.x - fear.x,
        dy = a.y - fear.y,
        d = hyp(dx, dy) || 1;
      a.vx = (dx / d) * RUN;
      a.vy = (dy / d) * RUN;
      a.moving = true;
      a.anim = 'run';
      a.path = [];
      a.goal = null;
      a.useT = 0;
      return;
    }
    if (a.delay > 0) {
      a.delay--;
      if (a.alertT > 0) this.turn(a, a.alertD, 0.3);
      return;
    }
    // heal utility
    if (a.util.heal && a.hp < 55) {
      a.util.heal--;
      a.hp = Math.min(100, a.hp + 50);
      this.emit('heal', { i: a.i });
    }
    if (this.val && a.ult >= 8 && AGENT_BY[a.p.hero ?? '']?.ult === 'revive' && this.t % 20 === 0) this.ultimate(a, [a.x, a.y]);
    switch (a.mode) {
      case 'stage': {
        const lim = a.route.length - (this.strat.startsWith('rush') ? 0 : 2);
        if (a.ri < lim) {
          const p = a.route[a.ri];
          this.go(a, p[0], p[1]);
          a.walkT = this.strat.startsWith('rush') ? 0 : a.ri >= lim - 1 ? 2 : 0;
          if (hyp(a.x - p[0], a.y - p[1]) < 1.6) a.ri++;
          this.follow(a, a.walkT > 0 ? WALK : RUN);
        } else {
          const p = a.route[Math.min(a.route.length - 1, a.ri)];
          a.look = datan2(p[1] - a.y, p[0] - a.x);
          this.turn(a, a.alertT > 0 ? a.alertD : a.look + dsin(this.tick * 0.05 + a.i) * 0.4, 0.2);
          if (!this.val && a.util.smoke && R.chance(0.002)) this.throwU(a, 'smoke', p[0], p[1]);
        }
        break;
      }
      case 'exec': {
        const site = this.map.sites[a.site];
        if (a.ri < a.route.length) {
          const p = a.route[a.ri];
          this.go(a, p[0], p[1]);
          if (hyp(a.x - p[0], a.y - p[1]) < 1.8) a.ri++;
          this.follow(a, RUN);
          if (a.util.dash && hyp(a.x - site.plant[0], a.y - site.plant[1]) < 16 && a.ri >= a.route.length - 2 && R.chance(0.12)) {
            a.util.dash--;
            const d = a.dir;
            [a.x, a.y] = this.map.grid.charge(a.x, a.y, dcos(d) * 4.6, dsin(d) * 4.6, BODY);
            a.path = [];
            a.goal = null;
            this.emit('dash', { i: a.i });
          }
        } else if (this.bomb.by === a.i && this.bomb.state === 'held') {
          a.mode = 'plant';
          a.path = [];
          a.goal = null;
        } else {
          const rr = site.post[a.i % site.post.length];
          if (hyp(a.x - rr[0], a.y - rr[1]) > 1.2) {
            this.go(a, rr[0], rr[1]);
            this.follow(a, RUN * 0.9);
          } else this.turn(a, datan2(rr[3] - a.y, rr[2] - a.x), 0.25);
        }
        if (this.bomb.state === 'drop') this.fetch(a);
        break;
      }
      case 'plant': {
        const s = this.map.sites[a.site],
          px = s.plant[0] + (((a.i * 7) % 5) - 2) * 0.6,
          py = s.plant[1] + (((a.i * 3) % 5) - 2) * 0.6;
        if (hyp(a.x - px, a.y - py) > 0.9 && !(a.x > s.rect[0] && a.x < s.rect[2] && a.y > s.rect[1] && a.y < s.rect[3] && a.useT > 0)) {
          this.go(a, px, py);
          this.follow(a, RUN);
        } else {
          if (a.useT === 0) this.emit('planting', { i: a.i });
          a.useT++;
          a.anim = 'plant';
          if (a.useT >= 32) {
            this.bomb = { state: 'plant', x: a.x, y: a.y, by: a.i, t: BOMB_T, site: a.site };
            a.useT = 0;
            a.obj++;
            a.money += 300;
            a.mode = 'post';
            const h = s.post[a.i % s.post.length];
            a.look = datan2(h[3] - h[1], h[2] - h[0]);
            this.go(a, h[0], h[1]);
            this.emit('planted', { x: a.x, y: a.y, site: a.site });
            this.say(`${this.val ? 'Spike' : 'Bomb'} planted on ${a.site} by ${a.nick}`);
          }
        }
        break;
      }
      case 'post':
      case 'hold': {
        if (a.goal && hyp(a.x - a.goal[0], a.y - a.goal[1]) > 0.7) {
          if (!a.path.length) a.path = this.map.grid.path(a.x, a.y, a.goal[0], a.goal[1]);
          this.follow(a, RUN);
        } else {
          const sw = a.look ?? a.dir;
          this.turn(a, a.alertT > 0 ? a.alertD : sw + dsin(this.tick * 0.04 + a.i * 2) * 0.3, 0.22);
          a.conf = a.alertT > 0 ? 8 : a.conf;
          const sc = this.sideOf(a) === 'C';
          if (sc && this.info[a.site] > 3 && !this.execOn === false) {
            const r = this.map.sites[a.site].routes[a.i % 2],
              p = r[r.length - 2];
            if (a.util.smoke && R.chance(0.03 + st.util * 0.03)) this.throwU(a, 'smoke', p[0], p[1]);
            else if (a.util.molly && R.chance(0.04 + st.util * 0.04)) this.throwU(a, 'molly', p[0], p[1]);
            else if (a.util.flash && R.chance(0.05)) this.throwU(a, 'flash', p[0], p[1]);
            else if (a.util.wall && R.chance(0.08)) this.mkWall(a, p);
            else if (a.util.he && R.chance(0.05)) this.throwU(a, 'he', p[0], p[1]);
            if (this.val && a.ult >= 7 && R.chance(0.1)) this.ultimate(a, [p[0], p[1]]);
          }
        }
        if (this.bomb.state === 'drop' && this.sideOf(a) === 'T') this.fetch(a);
        break;
      }
      case 'retake': {
        const b = this.bomb,
          mates = this.alive(a.team);
        const d = hyp(a.x - b.x, a.y - b.y);
        const grouped = mates.filter(m => hyp(m.x - b.x, m.y - b.y) < 26).length;
        const wait = d < 24 && d > 14 && grouped < mates.length && b.t > 190;
        if (d < 22 && d > 8) {
          if (a.util.flash && R.chance(0.1)) this.throwU(a, 'flash', b.x + R.gauss() * 2, b.y + R.gauss() * 2);
          else if (a.util.smoke && mates.length > 1 && R.chance(0.03)) this.throwU(a, 'smoke', b.x, b.y);
          else if (a.util.recon) this.throwU(a, 'recon', b.x, b.y);
          if (this.val && a.ult >= 7 && R.chance(0.1)) this.ultimate(a, [b.x, b.y]);
        }
        if (d < 1.2) {
          a.mode = 'defuse';
          a.useT = 0;
        } else if (!wait) {
          this.go(a, b.x, b.y);
          this.follow(a, RUN);
        } else this.turn(a, datan2(b.y - a.y, b.x - a.x), 0.3);
        break;
      }
      case 'defuse': {
        const b = this.bomb;
        if (b.state !== 'plant') break;
        const lead = this.alive(a.team)
          .filter(m => m.mode === 'defuse')
          .sort((p, q) => q.useT - p.useT || p.i - q.i)[0];
        if (lead && lead !== a) {
          this.turn(a, a.dir + 0.2, 0.2);
          break;
        }
        a.useT++;
        a.anim = 'plant';
        if (a.useT === 1) this.emit('defusing', { i: a.i });
        if (a.useT >= (a.kit || this.val ? 55 : 100)) {
          b.state = 'done';
          a.obj += 2;
          this.emit('defused', { i: a.i, x: b.x, y: b.y });
          this.say(`${a.nick} defuses with ${(b.t / 10).toFixed(1)}s left`);
        }
        break;
      }
      case 'save': {
        const s = this.map.spawn[this.sideOf(a) === 'T' ? 0 : 1];
        if (hyp(a.x - s[0], a.y - s[1]) > 4) {
          this.go(a, s[0], s[1]);
          this.follow(a, RUN);
        }
        break;
      }
    }
  }
  mkWall(a: Ag, p: [number, number]) {
    a.util.wall--;
    const d = datan2(p[1] - a.y, p[0] - a.x) + PI / 2,
      c = dcos(d) * 3.4,
      s = dsin(d) * 3.4;
    this.walls.push({ x0: p[0] - c, y0: p[1] - s, x1: p[0] + c, y1: p[1] + s, t: 120, team: a.team });
    this.emit('wall', { x0: p[0] - c, y0: p[1] - s, x1: p[0] + c, y1: p[1] + s, team: a.team });
  }
  fetch(a: Ag) {
    const b = this.bomb;
    const near = this.alive(this.tSide).sort((p, q) => hyp(p.x - b.x, p.y - b.y) - hyp(q.x - b.x, q.y - b.y) || p.i - q.i)[0];
    if (near !== a) return;
    if (hyp(a.x - b.x, a.y - b.y) < 1) {
      b.state = 'held';
      b.by = a.i;
      a.mode = this.execOn ? 'plant' : a.mode;
      this.emit('pickup', { i: a.i });
    } else {
      this.go(a, b.x, b.y);
      this.follow(a, RUN);
    }
  }
  fight(a: Ag, e: Ag) {
    const R = this.rng,
      st = a.p.st,
      d = hyp(e.x - a.x, e.y - a.y),
      ang = datan2(e.y - a.y, e.x - a.x),
      w = WPN[a.w];
    a.conf = 15;
    a.useT = 0;
    if (a.mode === 'defuse' && this.bomb.t < 60 && this.bomb.state === 'plant') {
      /* commit */
    }
    const off = Math.abs(angDiff(ang, a.dir));
    this.turn(a, ang, 0.35 + this.eff(a, st.react) * 0.45);
    a.look = a.mode === 'hold' || a.mode === 'post' ? a.look : ang;
    const ready = Math.round(
      4.6 -
        this.eff(a, st.react) * 2.9 +
        (a.moving ? 1 : 0) +
        (a.w === 'awp' ? 1 : 0) -
        (a.mode === 'hold' || a.mode === 'post' ? 0.9 : 0) -
        (a.mode === 'hold' ? 0.5 : 0),
    );
    const canShoot = a.seen[e.i] >= ready && off < 0.5 && a.reload === 0 && a.cool <= 0;
    // stance: strafe in the open, hold in cover, retreat when hurt
    const mates = this.actors.filter(m => m.team === a.team && m.alive && m !== a && hyp(m.x - a.x, m.y - a.y) < 14).length,
      foes = this.actors.filter(m => m.team !== a.team && m.alive && this.vis[a.i * 10 + m.i]).length;
    const retreat = a.hp < 35 && st.dec > 0.35 && foes > mates && R.chance(0.06 * st.dec);
    if (retreat && a.strafeT <= 0) {
      a.strafeT = 12;
      a.strafe = 2;
    }
    if (a.strafeT <= 0) {
      a.strafe = R.chance(0.5) ? 1 : -1;
      a.strafeT = R.int(4, 9);
    }
    const sp = a.strafe === 2 ? RUN : a.mode === 'hold' || a.mode === 'post' ? 0.1 : 0.17;
    const sa = a.strafe === 2 ? ang + PI : ang + (a.strafe * PI) / 2;
    let fx = dcos(sa) * sp,
      fy = dsin(sa) * sp;
    if (a.mode === 'exec' && d > 9 && a.p.role !== 'awp' && a.seen[e.i] < ready) {
      fx += dcos(ang) * 0.2;
      fy += dsin(ang) * 0.2;
    }
    if (a.w === 'smg' || a.w === 'shotgun') {
      if (d > 7) {
        fx += dcos(ang) * 0.22;
        fy += dsin(ang) * 0.22;
      }
    }
    if (a.w !== 'awp' || a.cool > 3) {
      a.vx = fx;
      a.vy = fy;
      a.moving = true;
    }
    a.walkT = 2;
    a.anim = 'aim';
    if (!canShoot) return;
    if (a.mag <= 0) {
      a.reload = 20;
      return;
    }
    a.mag--;
    a.cool = a.od > 0 ? Math.max(1, w.rof - 1) : w.rof;
    if (a.w === 'rifle' || a.w === 'smg') {
      if (w.mag - a.mag > 0 && (w.mag - a.mag) % 6 === 0) a.cool += 2;
    }
    a.fireT = this.tick;
    a.anim = 'shoot';
    let p = ((w.acc * (0.5 + this.eff(a, st.mech) * 1.0)) / (1 + (d / w.fall) * (d / w.fall))) * (off < 0.12 ? 1.2 : 0.8);
    if (a.strafe === 2) p *= w.move;
    p *= e.moving && e.strafe !== 0 ? 0.9 - 0.12 * e.p.st.mech : 1;
    p *= 1 - 0.22 * e.p.st.pos;
    if (this.coverBonus(e, a)) p *= 0.72;
    if (a.blind > 0) p *= 0.15;
    p *= 0.94 + 0.12 * this.team(a.team).fam * this.team(a.team).syn + 0.04 * this.team(a.team).prep;
    if (a.od > 0) p *= 1.25;
    if (d < 5) p *= 1.4;
    const hit = R.chance(clamp(p, 0.01, 0.93));
    const hs = hit && a.w !== 'awp' && R.chance(0.08 + this.eff(a, st.mech) * 0.24);
    const miss = hit ? 0 : (R.f() - 0.5) * 2.2;
    this.emit('shot', {
      i: a.i,
      x: a.x,
      y: a.y,
      tx: e.x + miss * dcos(ang + PI / 2),
      ty: e.y + miss * dsin(ang + PI / 2),
      hit,
      w: a.w,
      hs,
    });
    e.alertT = Math.max(e.alertT, 10);
    e.alertD = ang + PI;
    if (hit) this.hurt(e, a, w.dmg * (hs ? 3.6 : 1) * (0.9 + R.f() * 0.2), a.w, hs);
    if (a.p.role !== 'awp' && a.cool <= 2 && R.chance(0.002 + st.util * 0.012)) {
      if (a.util.flash && d > 8) this.throwU(a, 'flash', e.x, e.y);
      else if (a.util.he && d > 7) this.throwU(a, 'he', e.x, e.y);
    }
  }
  coverBonus(e: Ag, from: Ag) {
    const d = datan2(from.y - e.y, from.x - e.x);
    const g = this.map.grid;
    const x = e.x + dcos(d) * 1.1,
      y = e.y + dsin(d) * 1.1;
    return (
      g.atp(x, y) === 2 ||
      g.atp(e.x + dcos(d + 0.9) * 0.9, e.y + dsin(d + 0.9) * 0.9) !== 0 ||
      g.atp(e.x + dcos(d - 0.9) * 0.9, e.y + dsin(d - 0.9) * 0.9) !== 0
    );
  }
  turn(a: Ag, to: number, rate: number) {
    const d = angDiff(to, a.dir);
    a.dir += clamp(d, -rate, rate);
  }
  follow(a: Ag, sp: number) {
    if (!a.path.length) {
      if (a.goal && hyp(a.goal[0] - a.x, a.goal[1] - a.y) > 0.5) a.path = this.map.grid.path(a.x, a.y, a.goal[0], a.goal[1]);
      if (!a.path.length) return;
    }
    const [px, py] = a.path[0],
      dx = px - a.x,
      dy = py - a.y,
      d = hyp(dx, dy);
    if (a.slow > 0) sp *= 0.5;
    if (d < sp + 0.05) {
      a.path.shift();
      a.vx = dx;
      a.vy = dy;
    } else {
      a.vx = (dx / d) * sp;
      a.vy = (dy / d) * sp;
    }
    a.moving = true;
    a.walkT = sp < 0.3 ? 2 : 0;
    a.anim = sp < 0.3 ? 'walk' : 'run';
    this.turn(a, a.alertT > 0 ? a.alertD : datan2(dy, dx), 0.45);
  }
  move(a: Ag) {
    if (!a.moving) {
      a.vx = a.vy = 0;
      return;
    }
    const ox = a.x,
      oy = a.y;
    [a.x, a.y] = this.map.grid.slide(a.x, a.y, a.vx, a.vy, BODY);
    // boxed in by a corner or a team-mate: think again instead of pushing forever
    const want = hyp(a.vx, a.vy);
    if (want > 0.15 && hyp(a.x - ox, a.y - oy) < want * 0.25) {
      if (++a.stuck > 7) {
        a.stuck = 0;
        a.path = a.goal ? this.map.grid.path(a.x, a.y, a.goal[0], a.goal[1]) : [];
        if (a.goal && hyp(a.goal[0] - a.x, a.goal[1] - a.y) < 2) {
          a.goal = [a.x, a.y];
          a.path = [];
        }
      }
    } else a.stuck = 0;
    if (this.bomb.state === 'held' && this.bomb.by === a.i) {
      this.bomb.x = a.x;
      this.bomb.y = a.y;
    }
  }
  moveOnly() {
    for (const a of this.actors) {
      if (a.anim === 'run' || a.anim === 'shoot' || a.anim === 'aim' || a.anim === 'walk') a.anim = 'idle';
      a.moving = false;
    }
  }
  objective() {
    const b = this.bomb;
    if (b.state !== 'plant') return;
    b.t--;
    const s = b.t;
    if (s > 0 && (s < 50 ? s % 3 === 0 : s < 120 ? s % 6 === 0 : s % 10 === 0)) this.emit('beep', { x: b.x, y: b.y });
  }
  checkEnd() {
    const T = this.tSide,
      C = (1 - T) as 0 | 1,
      ta = this.alive(T).length,
      ca = this.alive(C).length,
      b = this.bomb;
    let win: 0 | 1 | -1 = -1,
      why = '';
    if (b.state === 'done') {
      win = C;
      why = 'defused';
    } else if (b.state === 'plant' && b.t <= 0) {
      win = T;
      why = 'detonated';
      this.emit('explode', { x: b.x, y: b.y });
      for (const v of this.actors) if (v.alive && hyp(v.x - b.x, v.y - b.y) < 11) this.hurt(v, null, 200, 'bomb');
    } else if (ca === 0) {
      win = T;
      why = 'elimination';
    } else if (ta === 0 && b.state !== 'plant') {
      win = C;
      why = 'elimination';
    } else if (this.t >= ROUND_T && b.state !== 'plant') {
      win = C;
      why = 'time';
    }
    if (win < 0) return;
    const w = win as 0 | 1,
      l = (1 - w) as 0 | 1;
    this.score[w]++;
    this.history.push(w);
    this.loss[l] = Math.min(4, this.loss[l] + 1);
    this.loss[w] = Math.max(0, this.loss[w] - 1);
    this.streak[w]++;
    this.streak[l] = 0;
    for (const a of this.actors) {
      if (a.team === w) {
        a.money += why === 'elimination' ? 3250 : 3400;
        a.tilt *= 0.82;
      } else {
        a.money += 1400 + 500 * Math.max(0, this.loss[l] - 1) + (b.state !== 'held' && b.state !== 'drop' && l === T ? 800 : 0);
        const lead = this.cfg.teams[l].players.some(p => p.traits.includes('leader')) ? 0.75 : 1;
        a.tilt = clamp(a.tilt + 0.085 * (1.2 - a.p.st.comp) * (1 + this.streak[w] * 0.25) * lead, 0, 1);
      }
      a.money = Math.min(16000, a.money);
    }
    for (let i = 0; i < 2; i++) if (this.boost[i] > 0) this.boost[i]--;
    const cl = this.alive(w);
    if (cl.length === 1 && cl[0].rk >= 2 && why !== 'time') {
      this.say(`${cl[0].nick} clutches it`);
      this.emit('clutch', { i: cl[0].i });
      cl[0].obj += 2;
    }
    this.emit('roundEnd', { win: w, why, score: [...this.score] });
    this.ph = 'end';
    this.phT = 35;
  }
  nextRound() {
    this.round++;
    const [a, b] = this.score,
      tot = a + b;
    const reg = 13;
    const over =
      (a >= reg || b >= reg) &&
      (tot <= 24 ? true : Math.max(a, b) >= 16 + 3 * Math.floor(Math.max(0, tot - 30) / 6) && Math.abs(a - b) >= 1) &&
      !(tot === 24 && a === b);
    let fin = false;
    if (tot < 24) fin = a >= 13 || b >= 13;
    else if (tot === 24) fin = a !== b;
    else {
      const ot = Math.floor((tot - 24 - 1) / 6);
      const base = 12 + ot * 3;
      fin = a >= base + 4 || b >= base + 4;
      if (!fin && tot >= 48) fin = a !== b;
    }
    void over;
    if (fin) {
      this.done = true;
      this.emit('end');
      return;
    }
    if (this.round === 12 || (this.round >= 24 && (this.round - 24) % 3 === 0)) {
      this.tSide = (1 - this.tSide) as 0 | 1;
      for (const p of this.actors) {
        p.money = this.round >= 24 ? 10000 : 800;
        p.alive = false;
      }
      this.loss = [0, 0];
      this.ph = 'break';
      this.phT = 60;
      this.emit('half');
      this.say(this.round === 12 ? `Half-time ${a}-${b}` : `Overtime ${a}-${b}`);
      this.pend = [{ ...this.keep(0) }, { ...this.keep(1) }];
      return;
    }
    this.startRound();
  }
  keep(i: number) {
    const p = this.pend[i];
    const o: Record<string, string> = {};
    if (p.timeout) o.timeout = p.timeout;
    return o;
  }
  orders(team: 0 | 1): OrderDef[] {
    const T = team === this.tSide;
    const o: OrderDef[] = T
      ? [
          { cmd: 't:default', label: 'Default', hint: 'Spread, read the map, then commit', group: 'Attack call', icon: 'radar-sweep' },
          { cmd: 't:rushA', label: 'Rush A', hint: 'Straight in, five together', group: 'Attack call', icon: 'sprint' },
          { cmd: 't:rushB', label: 'Rush B', hint: 'Straight in, five together', group: 'Attack call', icon: 'sprint' },
          { cmd: 't:splitA', label: 'Split A', hint: 'Two lanes, one timing', group: 'Attack call', icon: 'divergence' },
          { cmd: 't:splitB', label: 'Split B', hint: 'Two lanes, one timing', group: 'Attack call', icon: 'divergence' },
          { cmd: 't:fakeA', label: 'Fake A', hint: 'Noise on A, hit B', group: 'Attack call', icon: 'domino-mask' },
          { cmd: 't:fakeB', label: 'Fake B', hint: 'Noise on B, hit A', group: 'Attack call', icon: 'domino-mask' },
        ]
      : [
          { cmd: 'c:std', label: 'Standard', hint: '2-1-2', group: 'Defence call', icon: 'shield' },
          { cmd: 'c:aggr', label: 'Push', hint: 'Take space for early information', group: 'Defence call', icon: 'sprint' },
          { cmd: 'c:passive', label: 'Sit back', hint: 'Deep positions, play retake', group: 'Defence call', icon: 'stone-tower' },
          { cmd: 'c:stackA', label: 'Stack A', hint: 'Three on A', group: 'Defence call', icon: 'stack' },
          { cmd: 'c:stackB', label: 'Stack B', hint: 'Three on B', group: 'Defence call', icon: 'stack' },
        ];
    o.push(
      { cmd: 'buy:eco', label: 'Eco', hint: 'Save this round', group: 'Economy', icon: 'piggy-bank' },
      { cmd: 'buy:force', label: 'Force', hint: 'Spend what we have', group: 'Economy', icon: 'cash' },
      { cmd: 'buy:full', label: 'Full buy', hint: 'Rifles and utility', group: 'Economy', icon: 'two-coins' },
    );
    if (this.timeouts[team] > 0)
      o.push({
        cmd: 'timeout',
        label: `Timeout (${this.timeouts[team]})`,
        hint: 'Calm nerves, sharper for three rounds',
        group: 'Bench',
        icon: 'hourglass',
      });
    return o;
  }
  order(team: 0 | 1, cmd: string) {
    if (this.done) return false;
    const p = this.pend[team];
    if (cmd === 'timeout') {
      if (this.timeouts[team] <= 0 || p.timeout) return false;
      this.timeouts[team]--;
      p.timeout = '1';
      return true;
    }
    const m = /^(t|c|buy):(default|rushA|rushB|splitA|splitB|fakeA|fakeB|execA|execB|std|aggr|passive|stackA|stackB|eco|force|full)$/.exec(
      cmd,
    );
    if (!m) return false;
    p[m[1]] = m[2];
    return true;
  }
  result(): GameResult {
    const rounds = Math.max(1, this.score[0] + this.score[1]);
    const mk = (t: number): PStat[] =>
      this.actors
        .filter(a => a.team === t)
        .map(a => ({
          id: a.p.id,
          k: a.k,
          d: a.d,
          a: a.a,
          dmg: Math.round(a.dmg),
          heal: 0,
          obj: a.obj,
          hero: a.hero,
          rating:
            Math.round(
              (0.25 +
                (a.k / rounds) * 0.75 +
                ((rounds - a.d) / rounds) * 0.32 +
                (a.a / rounds) * 0.2 +
                a.dmg / rounds / 420 +
                a.obj * 0.012) *
                100,
            ) / 100,
        }));
    const stats: [PStat[], PStat[]] = [mk(0), mk(1)];
    const winner = (this.score[0] > this.score[1] ? 0 : 1) as 0 | 1;
    return {
      score: [...this.score],
      winner,
      ticks: this.tick,
      stats,
      log: this.log.slice(-40),
      hash: sha256(JSON.stringify([this.score, stats, this.tick])).slice(0, 24),
    };
  }
}
export type { SiteDef };
