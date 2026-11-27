import { bond, feel, nameOf, newLife, note, people, rel, settle, upset } from './life.ts';
import { INC, resolveIncident } from './incidents.ts';
import { Rng, seedRng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import { TITLE, TITLES, type TitleId } from '../data/titles.ts';
import {
  ORIGINS,
  SITES,
  SPONSOR_SLOTS,
  STAFF,
  STAFF_ROLES,
  GEAR,
  GEAR_SLOTS,
  BLOCK_IDS,
  WEEK_PRESETS,
  TITLE_ENTRY_COST,
  type Block,
  type GearSlot,
  type RoomType,
} from '../data/club.ts';
import { Draft, MIN_H, MIN_W, diffCost, layout, roomsOf, validate, type HQ } from './build.ts';
import { heroPool } from '../data/heroes.ts';
import { runSim } from '../sim/index.ts';
import { RULES, type Action, type Fixture, type G, type Look, type MatchRec, type Outcome, type Player, type Squad } from './types.ts';
import { genPlayer, genWorld, genLook, ovr, plan0, refillPool, station, valueFor, wageFor, DIV_NAME } from './gen.ts';
import { finish, isMe, meId, myToday, newSeason, strength, todays } from './league.ts';
import { advance, book, dow, makeOffer, money, sponsorProgress, wagesWeek } from './day.ts';
import { adj, mine, msg, resolveEvent } from './events.ts';
import { buildCfg, staffSkill } from './match.ts';
import { desks, deskMate, seatsOf } from './seats.ts';
import { NATION } from '../data/names.ts';
const err = (e: string): Outcome => ({ ok: false, err: e });
const ok = (m?: string, data?: any): Outcome => ({ ok: true, msg: m, data });
const hex = (s: any) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const str = (s: any, n: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
const int = (v: any, a: number, b: number) => Number.isInteger(v) && v >= a && v <= b;
export interface NewOpts {
  seed: string;
  mgr: { name: string; nat: string; style: string; look?: Look };
  club: Pick<G['club'], 'name' | 'tag' | 'c1' | 'c2' | 'c3' | 'crest' | 'jersey' | 'region' | 'city' | 'motto'>;
  origin: string;
  titles: TitleId[];
  t0: string;
}
const WEARS = ['suit', 'shirt', 'jacket', 'polo', 'long', 'tee', 'work', 'sport', 'short'];
/** the face the manager drew in the creator, cut to what the game can show */
function ownLook(base: Look, l?: Look): Look {
  if (!l || typeof l !== 'object') return base;
  const n = (v: any, a: number, b: number, d: number) => (Number.isInteger(v) && v >= a && v <= b ? v : d);
  const o: Look = {
    skin: n(l.skin, 0, 6, base.skin),
    hair: n(l.hair, 0, 13, base.hair),
    hairC: n(l.hairC, 0, 11, base.hairC),
    face: n(l.face, 0, 4, base.face),
    eye: n(l.eye, 0, 3, base.eye),
    brow: n(l.brow, 0, 3, base.brow),
    nose: n(l.nose, 0, 3, base.nose),
    mouth: n(l.mouth, 0, 3, base.mouth),
    beard: n(l.beard, 0, 4, 0),
    glasses: n(l.glasses, 0, 2, 0),
    fem: !!l.fem,
    head: n(l.head, 0, 9, base.head),
  };
  if (l.r !== undefined) o.r = n(l.r, 0, 2, 0);
  if (Array.isArray(l.f)) o.f = l.f.slice(0, 22).map(x => n(x, -100, 100, 0));
  if (typeof l.h === 'string' && /^(h_[a-z0-9]{2,8})?$/.test(l.h)) o.h = l.h;
  if (l.ec !== undefined) o.ec = n(l.ec, 0, 7, 0);
  if (l.o !== undefined) o.o = WEARS.includes(l.o) ? l.o : 'suit';
  if (l.oc !== undefined) o.oc = n(l.oc, 0, 9, 0);
  if (l.a !== undefined) o.a = n(l.a, 20, 64, 33);
  return o;
}
export function genesis(o: NewOpts): G {
  const or = ORIGINS.find(x => x.id === o.origin) ?? ORIGINS[0];
  const r = new Rng(seedRng(o.seed));
  const titles = TITLES.filter(t => o.titles.includes(t));
  if (!titles.length) throw new Error('no titles');
  const g: G = {
    rules: RULES,
    seed: o.seed,
    rng: [0, 0, 0, 0],
    day: 0,
    seq: 0,
    uid: 1,
    t0: o.t0,
    mgr: { name: o.mgr.name, nat: o.mgr.nat, style: o.mgr.style, look: ownLook(genLook(r, o.mgr.nat), o.mgr.look) },
    club: {
      ...o.club,
      origin: or.id,
      fans: or.fans,
      rep: or.rep,
      cash: Math.round(or.cash * (1 + (titles.length - 1) * 0.55)),
      loan: 0,
      merch: 1,
    },
    players: {},
    teams: {},
    squads: {},
    seasons: {},
    site: or.site,
    hq: Draft.empty(MIN_W, MIN_H).hq(),
    rooms: [],
    staff: [],
    pool: [],
    know: {},
    scout: { pid: null, title: null },
    inbox: [],
    ledger: [],
    week: {},
    deals: [],
    bids: [],
    nego: {},
    live: null,
    recs: [],
    trophies: [],
    stats: { w: 0, l: 0, prize: 0, best: 3 },
    streak: 0,
    bankrupt: 0,
    lastEvt: {},
    ranked: true,
    over: null,
    life: newLife(),
  };
  if (titles.length >= 2) g.site = Math.max(g.site, 1);
  if (titles.length >= 3) g.site = Math.max(g.site, 2);
  for (const t of titles) addTitle(g, r, t, or.quality, or.gear, 0);
  setHQ(
    g,
    layout(g.site, [...titles.map(t => ({ type: 'practice' as RoomType, title: t, lvl: 1 })), ...or.rooms.map(type => ({ type, lvl: 1 }))]),
  );
  refillPool(g, r);
  if (or.id !== 'flat') {
    const c = g.pool.find(s => s.role === 'coach')!;
    hire(g, c.id, titles[0]);
  }
  for (const s of ['front', 'front', 'drink'] as const) g.deals.push(makeOffer(g, r, s));
  msg(g, {
    kind: 'board',
    from: 'You',
    title: `Day one at ${g.club.name}`,
    body: `${g.mgr.name}, the lease is signed. One week until the season opens. Set the training week, choose between the sponsor offers under Club, and check who needs a better chair.`,
  });
  settle(g);
  g.rng = r.s;
  return g;
}
function addTitle(g: G, r: Rng, t: TitleId, quality: number, gear: number, start: number) {
  genWorld(g, r, t);
  const id = meId(t);
  g.teams[id] = {
    id,
    title: t,
    org: -1,
    name: g.club.name,
    tag: g.club.tag,
    icon: g.club.crest.icon,
    c1: g.club.c1,
    c2: g.club.c2,
    region: g.club.region,
    div: 2,
    elo: 1190,
    roster: [],
    plan: plan0(),
    form: '',
    gear: 0,
  };
  const core = NATION[g.mgr.nat]?.region === g.club.region ? g.mgr.nat : undefined;
  const lineup: string[] = [];
  TITLE[t].roles.forEach((ro, i) => {
    const p = genPlayer(
      g,
      r,
      t,
      ro.id,
      clamp(quality + r.gauss() * 2.5, 36, 72),
      i < 3 && core ? core : Object.values(g.players)[r.int(0, 40)].nat,
      r.int(17, 24),
    );
    p.team = id;
    p.num = [7, 10, 1, 23, 99][i];
    p.pot = Math.max(p.pot, ovr(p) + 6);
    p.contract = { salary: Math.round((wageFor(p) * 0.8) / 10) * 10, until: g.day + r.int(170, 400), buyout: 0, bonus: 0 };
    p.contract.buyout = valueFor(p, g.day);
    g.players[p.id] = p;
    g.know[p.id] = 100;
    p.joined = g.day;
    lineup.push(p.id);
  });
  g.squads[t] = {
    title: t,
    lineup,
    heroes: [null, null, null, null, null],
    week: WEEK_PRESETS.balanced.week.map(d => [...d]),
    intensity: 1,
    plan: plan0(),
    fam: 0.42,
    syn: 0.45,
    prep: 0,
    stations: [0, 1, 2, 3, 4].map(() => station(gear)),
    captain: lineup[0],
    remote: false,
  };
  g.seasons[t] = newSeason(g, r, t, 0, start);
}
/** work out which rooms exist, after anything that changes the building */
function surveyed(g: G) {
  g.rooms = roomsOf(g.hq);
}
function setHQ(g: G, q: HQ) {
  const ids = new Map<string, string>();
  const name = (id: string, p: string) => {
    if (!id.startsWith('n')) return id;
    const k = p + g.uid++;
    ids.set(id, k);
    return k;
  };
  g.hq = { ...q, items: q.items.map(i => ({ ...i, id: name(i.id, 'i') })), zones: q.zones.map(z => ({ ...z, id: name(z.id, 'z') })) };
  surveyed(g);
}
function hire(g: G, sid: string, title?: TitleId): Outcome {
  const i = g.pool.findIndex(s => s.id === sid);
  if (i < 0) return err('That person is no longer available');
  const s = g.pool[i],
    def = STAFF[s.role];
  const n = g.staff.filter(x => x.role === s.role).length;
  if (n >= def.max) return err(`You already have ${n}`);
  if (def.perTitle && (!title || !g.squads[title])) return err('Choose a squad');
  if (def.perTitle && g.staff.some(x => x.role === s.role && x.title === title)) return err('That squad already has a head coach');
  g.pool.splice(i, 1);
  s.since = g.day;
  if (def.perTitle) s.title = title;
  g.staff.push(s);
  book(g, 'Signing fees', -s.salary);
  settle(g);
  return ok(`${s.name} joins as ${def.name.toLowerCase()}`);
}
export function askFor(g: G, p: Player): number {
  const div = g.teams[meId(p.title)]?.div ?? 2;
  let a = wageFor(p) * (1.06 - g.club.rep * 0.0022) * (div === 2 && ovr(p) > 62 ? 1.15 + (ovr(p) - 62) * 0.02 : 1);
  if (p.team && isMe(p.team))
    a *= p.traits.includes('loyal') ? 0.88 : p.traits.includes('merc') ? 1.15 : p.morale > 70 ? 0.95 : p.morale < 40 ? 1.2 : 1;
  return Math.round(a / 10) * 10;
}
export function interest(g: G, p: Player): number {
  const div = g.teams[meId(p.title)]?.div ?? 2;
  const lvl = [84, 72, 62][div];
  return clamp(0.9 - Math.max(0, ovr(p) - lvl - g.club.rep * 0.09) * 0.085, 0, 1);
}
function drop(g: G, p: Player) {
  const sq = g.squads[p.title];
  if (sq) {
    sq.lineup = sq.lineup.map(x => (x === p.id ? null : x));
    if (sq.captain === p.id) sq.captain = sq.lineup.find(x => x) ?? null;
    sq.syn = clamp(sq.syn - 0.06, 0.1, 1);
  }
  p.team = null;
  p.contract = null;
  p.listed = false;
  g.bids = g.bids.filter(b => b.pid !== p.id);
}
function join(g: G, p: Player, salary: number, months: number) {
  if (p.team && !isMe(p.team)) {
    const t = g.teams[p.team];
    const i = t.roster.indexOf(p.id);
    if (i >= 0) {
      const r = new Rng(g.rng);
      const c =
        Object.values(g.players)
          .filter(x => x.title === p.title && !x.team && x.role === p.role)
          .sort((a, b) => ovr(b) - ovr(a) || (a.id < b.id ? -1 : 1))[0] ??
        (() => {
          const n = genPlayer(g, r, p.title, p.role, clamp(ovr(p) - 4, 35, 85), p.nat, 18);
          g.players[n.id] = n;
          g.know[n.id] = 30;
          return n;
        })();
      c.team = t.id;
      c.contract = { salary: wageFor(c), until: g.day + 364, buyout: valueFor(c, g.day), bonus: 0 };
      t.roster[i] = c.id;
      g.rng = r.s;
    }
  }
  p.team = meId(p.title);
  p.contract = { salary, until: g.day + months * 30, buyout: 0, bonus: 0 };
  p.contract.buyout = valueFor(p, g.day);
  p.joined = g.day;
  p.listed = false;
  g.know[p.id] = 100;
  const used = mine(g)
    .filter(x => x !== p && x.title === p.title)
    .map(x => x.num);
  while (used.includes(p.num)) p.num = (p.num % 99) + 1;
  const sq = g.squads[p.title]!;
  const i = TITLE[p.title].roles.findIndex((ro, k) => ro.id === p.role && !sq.lineup[k]);
  if (i >= 0) sq.lineup[i] = p.id;
  sq.syn = clamp(sq.syn - 0.05, 0.1, 1);
}
export const feeFor = (g: G, p: Player) => (p.team && !isMe(p.team) ? Math.round((valueFor(p, g.day) * 1.25) / 500) * 500 : 0);
// ---------- matches
function startLive(g: G, f: Fixture): Outcome {
  if (g.life.inc) return err('Something in the house needs a decision');
  const s = g.seasons[f.title]!;
  const us = (isMe(f.home) ? 0 : 1) as 0 | 1;
  const map = s.maps[(f.day + f.id.length * 3) % s.maps.length];
  const cfg = buildCfg(g, f.title, f.home, f.away, map, `${g.seed}|${f.id}|0|${g.rng[0]}`);
  g.live = { fid: f.id, game: 0, wins: [0, 0], us, cfg, orders: [], games: [], cfgs: [] };
  return ok();
}
function endGame(g: G): Outcome {
  const L = g.live!;
  const f = g.seasons[L.cfg.title]!.fixtures.find(x => x.id === L.fid)!;
  const res = runSim(L.cfg, L.orders);
  L.games.push({ map: L.cfg.map, res, us: L.us });
  L.cfgs.push({ cfg: L.cfg, orders: L.orders });
  L.wins[res.winner]++;
  tire(g, L.cfg.title);
  const need = (f.bo + 1) / 2;
  if (L.wins[0] < need && L.wins[1] < need) {
    L.game++;
    const s = g.seasons[f.title]!;
    const i = s.maps.indexOf(L.cfg.map);
    const map = s.maps[(i + 1) % s.maps.length];
    L.cfg = buildCfg(g, f.title, f.home, f.away, map, `${g.seed}|${f.id}|${L.game}|${g.rng[0]}`);
    L.orders = [];
    return ok('next', { res, done: false });
  }
  finalise(g, f);
  return ok('done', { res, done: true });
}
function tire(g: G, t: TitleId) {
  for (const p of mine(g))
    if (p.title === t && g.squads[t]!.lineup.includes(p.id)) {
      adj(p, 'energy', -(9 - p.attr.stam * 0.05));
      adj(p, 'stress', 4 - p.attr.comp * 0.03);
    }
}
/** the manager steps in */
function care(g: G, a: any): Outcome {
  const l = g.life.p[a.id];
  if (!l) return err('?');
  if (l.care >= g.day) return err(`You already spent time with ${nameOf(g, a.id)} today`);
  const r = new Rng(g.rng);
  const n = nameOf(g, a.id);
  const psych = staffSkill(g, 'psych');
  const soft = g.mgr.style === 'mentor' ? 0.15 : 0;
  let t = '';
  const pay = (c: number) => {
    if (g.club.cash < c) return false;
    book(g, 'House', -c);
    return true;
  };
  switch (a.c) {
    case 'listen':
      upset(g, a.id, -14 - psych * 8 - soft * 40);
      feel(g, a.id, 2);
      l.soc = Math.min(100, l.soc + 10);
      t = r.chance(0.5) ? `${n} talks. You mostly nod. It helps more than it should.` : `${n} says it is nothing, for twenty minutes.`;
      break;
    case 'shower':
      if (l.hyg > 55) return err(`${n} smells fine`);
      if (r.chance(0.8 - (l.q.includes('proud') ? 0.3 : 0) - (l.q.includes('slob') ? 0.12 : 0) + soft)) {
        l.hyg = 92;
        l.dry = 0;
        upset(g, a.id, 4);
        t = `${n} goes. The corridor breathes out.`;
      } else {
        upset(g, a.id, 12);
        feel(g, a.id, -2);
        t = `${n} asks whether it is in the contract.`;
      }
      break;
    case 'food':
      if (!pay(35)) return err('Not enough cash');
      l.hun = Math.min(100, l.hun + 55);
      upset(g, a.id, -6);
      feel(g, a.id, 1.2);
      t = `The good place, extra sauce. ${n} eats standing up.`;
      break;
    case 'night':
      if (!pay(120)) return err('Not enough cash');
      l.fun = Math.min(100, l.fun + 34);
      l.soc = Math.min(100, l.soc + 18);
      upset(g, a.id, -18);
      feel(g, a.id, 2.5);
      if (g.players[a.id]) g.players[a.id].energy = Math.max(0, g.players[a.id].energy - 5);
      t = `A film, a burger, no shop talk. ${n} laughs at the trailers.`;
      break;
    case 'warn':
      upset(g, a.id, l.q.includes('hot') || l.q.includes('proud') ? 16 : 6);
      feel(g, a.id, -3);
      for (const k of Object.keys(g.life.mess))
        g.life.mess[k] = Math.max(0, Math.round((g.life.mess[k] - (l.q.includes('messy') || l.q.includes('slob') ? 10 : 2)) * 100) / 100);
      t = `${n} cleans up after that. Loudly.`;
      break;
    case 'mediate': {
      const o = a.o;
      if (!g.life.p[o] || o === a.id) return err('?');
      const k = rel(g, a.id, o);
      if (k > -8) return err('They get along');
      if (r.chance(0.45 + psych * 0.35 + soft + (people(g).some(x => g.life.p[x].q.includes('peace')) ? 0.08 : 0))) {
        bond(g, a.id, o, 26);
        upset(g, a.id, -16);
        upset(g, o, -16);
        t = `${n} and ${nameOf(g, o)} shake hands. One of them smiles first.`;
      } else {
        bond(g, a.id, o, -6);
        upset(g, a.id, 6);
        upset(g, o, 6);
        t = `${n} and ${nameOf(g, o)} agree on one thing: that this was your idea.`;
      }
      g.life.p[o].care = g.day;
      break;
    }
    default:
      return err('?');
  }
  l.care = g.day;
  note(g, Math.min(2, g.life.block), 'mgr', a.id, a.o, t, 'hall');
  g.rng = r.s;
  return { ok: true, msg: t };
}
function finalise(g: G, f: Fixture) {
  const L = g.live!,
    us = L.us,
    win = L.wins[us] > L.wins[1 - us];
  f.games = L.games.map(x => ({ map: x.map, score: x.res.score }));
  const hw = L.wins[0] > L.wins[1];
  finish(g, f, f.bo === 1 ? L.games[0].res.score : [...L.wins], hw);
  f.played = true;
  const opp = g.teams[us === 0 ? f.away : f.home];
  const agg: Record<string, number[]> = {};
  for (const gm of L.games)
    for (const ps of gm.res.stats[us]) {
      (agg[ps.id] ??= []).push(ps.rating);
      const p = g.players[ps.id];
      if (!p) continue;
      p.s.k += ps.k;
      p.s.d += ps.d;
      p.s.a += ps.a;
    }
  let mvp = '',
    mb = -1;
  for (const id of Object.keys(agg).sort()) {
    const av = agg[id].reduce((a, b) => a + b, 0) / agg[id].length;
    const p = g.players[id];
    if (av > mb) {
      mb = av;
      mvp = id;
    }
    if (p) {
      p.s.m++;
      p.car.m++;
      if (win) {
        p.s.w++;
        p.car.w++;
      }
      p.s.r = Math.round((p.s.r + av) * 100) / 100;
      p.form = clamp(Math.round((p.form * 0.7 + (av - 1) * 3.2) * 100) / 100, -5, 5);
      p.fame = Math.round((p.fame + (win ? 0.5 : 0.1) + Math.max(0, av - 1.1)) * 100) / 100;
      adj(p, 'morale', win ? 5 : -4);
      upset(g, p.id, win ? -16 : 9 + p.stress * 0.08);
      adj(p, 'stress', win ? -3 : 3.5 - staffSkill(g, 'psych') * 2);
      for (const a of ['comp', 'dec', 'sense'] as const)
        p.attr[a] = clamp(Math.round((p.attr[a] + 0.03 * (p.pot > ovr(p) ? 1 : 0.2)) * 1000) / 1000, 5, 99);
    }
  }
  if (g.players[mvp]) {
    g.players[mvp].s.mvp++;
    g.players[mvp].car.mvp++;
  }
  const big = f.comp === 'masters' ? 3 : f.comp === 'playoff' ? 1.8 : 1;
  const up = strength(g, opp.id) - strength(g, meId(f.title));
  const fd = Math.round(
    (win ? 40 + Math.sqrt(g.club.fans) * 1.8 : -Math.sqrt(g.club.fans) * 0.25 + 12) *
      big *
      (1 + clamp(up * 0.04, -0.4, 0.8)) *
      (1 + staffSkill(g, 'content') * 0.3) *
      (g.mgr.style === 'showman' && win ? 1.15 : 1) *
      (1 + [0, 0.08, 0.16, 0.25][g.rooms.find(x => x.type === 'trophy')?.lvl ?? 0]),
  );
  g.club.fans = Math.max(50, g.club.fans + fd);
  g.club.rep = clamp(
    Math.round(
      (g.club.rep + (win ? (0.45 + Math.max(0, up) * 0.05) * (1.15 - g.club.rep / 100) : -0.12 - g.club.rep * 0.005) * big) * 100,
    ) / 100,
    0,
    100,
  );
  if (win) {
    g.stats.w++;
    g.streak = g.streak > 0 ? g.streak + 1 : 1;
    sponsorProgress(g, 'win');
    book(g, 'Match bonus', [2600, 1300, 650][Math.min(2, f.div)] * big);
  } else {
    g.stats.l++;
    g.streak = g.streak < 0 ? g.streak - 1 : -1;
  }
  const rec: MatchRec = {
    fid: f.id,
    day: g.day,
    title: f.title,
    opp: opp.name,
    oppTag: opp.tag,
    comp: f.comp,
    stage: f.stage,
    score:
      f.bo === 1 ? (us ? [L.games[0].res.score[1], L.games[0].res.score[0]] : [...L.games[0].res.score]) : [L.wins[us], L.wins[1 - us]],
    win,
    games: L.games,
    mvp,
    cfgs: L.cfgs,
    fans: fd,
  };
  g.recs.unshift(rec);
  if (g.recs.length > 24) g.recs.pop();
  g.recs.forEach((x, i) => {
    if (i >= 5) delete x.cfgs;
  });
  g.live = null;
}
// ---------- dispatch
export function apply(g: G, a: Action): Outcome {
  if (g.over && a.t !== 'read') return err('The club is closed');
  const sq = (t: any): Squad | undefined => g.squads[t as TitleId];
  const pl = (id: any): Player | undefined => g.players[id];
  const own = (p?: Player) => !!p && !!p.team && isMe(p.team);
  switch (a.t) {
    case 'advance': {
      const o = advance(g, !!a.step);
      return 'err' in o ? err(o.err) : { ok: true, data: o };
    }
    case 'read': {
      const m = g.inbox.find(x => x.id === a.id);
      if (!m) return err('gone');
      m.read = true;
      return ok();
    }
    case 'readAll':
      g.inbox.forEach(m => {
        if (!m.choices || m.done) m.read = true;
      });
      return ok();
    case 'choose': {
      const m = g.inbox.find(x => x.id === a.id);
      if (!m || m.done || !m.choices?.some(c => c.id === a.c)) return err('Already decided');
      if (m.kind === 'bid') {
        const b = g.bids.find(x => x.id === m.data.bid);
        if (!b || !own(pl(b?.pid))) {
          m.done = 'The offer has expired.';
          m.read = true;
          return ok();
        }
        if (a.c === 'accept') {
          const p = pl(b.pid)!;
          const t = g.teams[b.team];
          drop(g, p);
          const i = TITLE[p.title].roles.findIndex(x => x.id === p.role);
          const old = g.players[t.roster[i]];
          if (old) {
            old.team = null;
            old.contract = null;
          }
          t.roster[i] = p.id;
          p.team = t.id;
          p.contract = { salary: wageFor(p), until: g.day + 540, buyout: valueFor(p, g.day), bonus: 0 };
          book(g, 'Transfers', b.fee);
          m.done = `Sold for ${money(b.fee)}.`;
          mine(g)
            .filter(x => x.title === p.title)
            .forEach(x => adj(x, 'morale', -4));
        } else {
          m.done = 'Turned down.';
          const p = pl(b.pid)!;
          if (p.traits.includes('merc')) adj(p, 'morale', -6);
          else adj(p, 'morale', 2);
        }
        g.bids = g.bids.filter(x => x.id !== b.id);
        m.read = true;
        return ok(m.done);
      }
      const r = new Rng(g.rng);
      const x = resolveEvent(g, r, m, a.c);
      g.rng = r.s;
      return x ? ok(m.done) : err('?');
    }
    // squad
    case 'lineup': {
      const s = sq(a.title);
      if (!s || !Array.isArray(a.lineup) || a.lineup.length !== 5) return err('Bad lineup');
      const set = new Set<string>();
      for (const id of a.lineup)
        if (id !== null) {
          const p = pl(id);
          if (!own(p) || p!.title !== a.title || set.has(id)) return err('Bad lineup');
          set.add(id);
        }
      const ch = s.lineup.filter(x => x && !set.has(x)).length;
      s.lineup = [...a.lineup];
      s.syn = clamp(s.syn - ch * 0.02, 0.1, 1);
      return ok();
    }
    case 'hero': {
      const s = sq(a.title);
      if (!s || !int(a.i, 0, 4)) return err('Bad slot');
      if (a.hero !== null && !heroPool(a.title, TITLE[a.title as TitleId].roles[a.i].id).some(h => h.id === a.hero))
        return err('Not available');
      s.heroes = s.heroes.map((h, i) => (i === a.i ? a.hero : h === a.hero ? null : h));
      return ok();
    }
    case 'captain': {
      const s = sq(a.title);
      if (!s || !own(pl(a.pid)) || pl(a.pid)!.title !== a.title) return err('?');
      s.captain = a.pid;
      return ok();
    }
    case 'number': {
      const p = pl(a.pid);
      if (!own(p) || !int(a.n, 0, 99)) return err('0 to 99');
      if (mine(g).some(x => x !== p && x.title === p!.title && x.num === a.n)) return err('Number taken');
      p!.num = a.n;
      return ok();
    }
    case 'week': {
      const s = sq(a.title);
      if (
        !s ||
        !Array.isArray(a.week) ||
        a.week.length !== 7 ||
        !a.week.every((d: any) => Array.isArray(d) && d.length === 3 && d.every((b: any) => BLOCK_IDS.includes(b)))
      )
        return err('Bad schedule');
      s.week = a.week.map((d: Block[]) => [...d]);
      return ok();
    }
    case 'intensity': {
      const s = sq(a.title);
      if (!s || !int(a.v, 0, 2)) return err('?');
      s.intensity = a.v;
      return ok();
    }
    case 'plan': {
      const s = sq(a.title);
      const p = a.plan;
      if (!s || !p) return err('?');
      const n = (v: any) => (typeof v === 'number' && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : 0.5);
      const np = {
        style: n(p.style),
        tempo: n(p.tempo),
        risk: n(p.risk),
        focus: ['auto', 'A', 'B', '0', '1', '2', 'dive', 'brawl', 'poke'].includes(p.focus) ? p.focus : 'auto',
      };
      const d =
        Math.abs(np.style - s.plan.style) +
        Math.abs(np.tempo - s.plan.tempo) +
        Math.abs(np.risk - s.plan.risk) +
        (np.focus !== s.plan.focus ? 0.15 : 0);
      s.plan = np;
      s.fam = clamp(Math.round((s.fam - d * 0.09) * 10000) / 10000, 0.1, 1);
      return ok();
    }
    case 'talk': {
      const p = pl(a.pid);
      if (!own(p)) return err('?');
      if (g.day - p!.talkDay < 7) return err(`You spoke ${g.day - p!.talkDay} days ago. Give it a week.`);
      p!.talkDay = g.day;
      const r = new Rng(g.rng);
      const sk = 0.45 + staffSkill(g, 'psych') * 0.2 + (g.mgr.style === 'mentor' ? 0.2 : 0);
      let out = '';
      if (a.c === 'praise') {
        const d = p!.form > 0.5 ? 8 : 3;
        adj(p!, 'morale', d);
        out = d > 4 ? `${p!.nick} stands a little taller.` : `${p!.nick} thanks you, not sure what for.`;
      } else if (a.c === 'push') {
        if (r.chance(sk + (p!.traits.includes('grinder') ? 0.25 : 0) - (p!.traits.includes('hothead') ? 0.3 : 0))) {
          p!.form = clamp(p!.form + 1, -5, 5);
          adj(p!, 'stress', 4);
          out = `${p!.nick} takes it as a challenge.`;
        } else {
          adj(p!, 'morale', -8);
          adj(p!, 'stress', 7);
          out = `${p!.nick} hears criticism and nothing else.`;
        }
      } else if (a.c === 'listen') {
        adj(p!, 'stress', -8 - sk * 8);
        adj(p!, 'morale', 3);
        out = `${p!.nick} talks for forty minutes. You mostly nod.`;
      } else return err('?');
      g.rng = r.s;
      return ok(out);
    }
    // market
    case 'offer': {
      const p = pl(a.pid);
      if (!p || !g.squads[p.title]) return err('Not available');
      if (!int(a.salary, 50, 200000) || !int(a.months, 3, 30)) return err('Bad terms');
      const renew = own(p);
      if (!renew && mine(g).filter(x => x.title === p.title).length >= 8) return err('Squad is full (8). Release somebody first.');
      const n = g.nego[p.id];
      if (n && n.tries >= 3) return err(`${p.nick} has walked away for now`);
      if (!renew && interest(g, p) < 0.25) return err(`${p.nick} wants to play at a higher level`);
      const ask = askFor(g, p);
      const fee = feeFor(g, p);
      if (fee > g.club.cash) return err(`Buyout is ${money(fee)}`);
      const len = a.months >= 12 && a.months <= 24 ? 0.97 : 1.03;
      const need = ask * len * (n ? 1 + n.tries * 0.02 : 1);
      if (a.salary >= need) {
        delete g.nego[p.id];
        if (renew) {
          p.contract = { salary: a.salary, until: Math.max(g.day, p.contract!.until) + a.months * 30, buyout: 0, bonus: 0 };
          p.contract.buyout = valueFor(p, g.day);
          adj(p, 'morale', 6);
          return ok(`${p.nick} renews`);
        }
        if (fee) book(g, 'Transfers', -fee);
        book(g, 'Signing fees', -a.salary);
        join(g, p, a.salary, a.months);
        return ok(`${p.nick} signs`);
      }
      const tries = (n?.tries ?? 0) + 1;
      g.nego[p.id] = { ask: Math.round(need / 10) * 10, tries, until: g.day + 14 };
      return {
        ok: true,
        msg: tries >= 3 ? `${p.nick} walks away` : `${p.nick} wants ${money(Math.round(need / 10) * 10)} a week`,
        data: { counter: Math.round(need / 10) * 10, walked: tries >= 3 },
      };
    }
    case 'release': {
      const p = pl(a.pid);
      if (!own(p)) return err('?');
      const cost = Math.round((p!.contract?.salary ?? 0) * clamp((p!.contract!.until - g.day) / 7, 2, 8));
      if (cost > g.club.cash) return err(`Severance is ${money(cost)}`);
      book(g, 'Severance', -cost);
      drop(g, p!);
      return ok(`${p!.nick} released for ${money(cost)}`);
    }
    case 'list': {
      const p = pl(a.pid);
      if (!own(p)) return err('?');
      p!.listed = !p!.listed;
      adj(p!, 'morale', p!.listed ? -8 : 3);
      return ok(p!.listed ? 'On the transfer list' : 'Off the list');
    }
    case 'scout': {
      if (a.pid !== null && !pl(a.pid)) return err('?');
      if (a.title !== null && a.title !== undefined && !TITLES.includes(a.title)) return err('?');
      g.scout = { pid: a.pid ?? null, title: a.title ?? null };
      return ok();
    }
    // staff
    case 'hire':
      return hire(g, a.id, a.title);
    case 'fire': {
      const s = g.staff.find(x => x.id === a.id);
      if (!s) return err('?');
      book(g, 'Severance', -s.salary * 3);
      g.staff = g.staff.filter(x => x.id !== a.id);
      return ok(`${s.name} leaves`);
    }
    // HQ
    case 'seat': {
      const sq = g.squads[a.title as TitleId];
      if (!sq || !sq.lineup.includes(a.pid)) return err('Only the starting five have a desk');
      const D = desks(g, a.title).map(i => i.id);
      if (!D.includes(a.item)) return err('There is no desk');
      const cur = seatsOf(g, a.title);
      const mine_ = cur[sq.lineup.indexOf(a.pid)];
      const other = deskMate(g, a.title, a.item);
      if (mine_ === a.item) return err('Already sits there');
      // write everybody down, so nobody else moves
      const next: Record<string, string> = {};
      sq.lineup.forEach((pid, i) => {
        if (pid && cur[i]) next[pid] = cur[i]!;
      });
      next[a.pid] = a.item;
      if (other) {
        if (mine_) next[other] = mine_;
        else delete next[other];
      }
      sq.seats = next;
      return ok(`${g.players[a.pid].nick} moves desk`);
    }
    case 'remodel': {
      const e = validate(
        a.hq,
        g.site,
        TITLES.filter(t => g.squads[t]),
      );
      if (e) return err(e);
      const next = new Draft(a.hq).hq();
      const old = new Set([...g.hq.items.map(i => i.id + i.f), ...g.hq.zones.map(z => z.id + z.type)]);
      // things that claim to be here already must really be here
      if (
        next.items.some(i => !i.id.startsWith('n') && !old.has(i.id + i.f)) ||
        next.zones.some(z => !z.id.startsWith('n') && !g.hq.zones.some(o => o.id === z.id))
      )
        return err('The plan does not match the building');
      const c = diffCost(g.hq, next, g.site);
      if (c.cost > 0 && c.cost > g.club.cash) return err(`That costs ${money(c.cost)}`);
      const before = g.rooms.length;
      if (c.cost) book(g, 'Building', -c.cost);
      setHQ(g, next);
      const opened = g.rooms.length - before;
      return ok(opened > 0 ? `${opened} ${opened === 1 ? 'room opens' : 'rooms open'}` : 'Building work done');
    }
    case 'site': {
      if (!int(a.n, 0, SITES.length - 1) || a.n === g.site) return err('?');
      const s = SITES[a.n];
      const back = Math.round(SITES[g.site].deposit * 0.6);
      if (a.n > g.site) {
        if (g.club.cash < s.deposit - back) return err(`Deposit is ${money(s.deposit)}`);
        const d = new Draft(g.hq);
        // the building stays in the middle of the larger plot, towards the street
        if (d.w < s.w) {
          const k = s.w - d.w;
          d.land('e', Math.ceil(k / 2));
          if (k > 1) d.land('w', Math.floor(k / 2));
        }
        if (d.h < s.h) d.land('n', s.h - d.h);
        book(g, 'Deposit', back - s.deposit);
        g.site = a.n;
        g.hq = d.hq();
      } else {
        if (g.hq.w > s.mw || g.hq.h > s.mh) return err(`Your land is ${g.hq.w} by ${g.hq.h}. There it can be at most ${s.mw} by ${s.mh}`);
        book(g, 'Deposit', back);
        g.site = a.n;
      }
      surveyed(g);
      return ok(`Moved to the ${s.name.toLowerCase()}`);
    }
    // the house and the people in it
    case 'incident': {
      const r = new Rng(g.rng);
      const i = g.life.inc;
      const ch = i && INC[i.id]?.choices(g, i).find(x => x.id === a.c);
      if (!i || !ch) return err('Nothing to decide');
      if (ch.cost && ch.cost > g.club.cash) return err('Not enough cash');
      const t = resolveIncident(g, r, a.c);
      g.rng = r.s;
      return t ? { ok: true, msg: t, data: { text: t } } : err('?');
    }
    case 'house': {
      const n = a.rules;
      if (!n || ![0, 1, 2].includes(n.meals) || ['rota', 'hygiene', 'quiet', 'curfew'].some(k => typeof n[k] !== 'boolean'))
        return err('?');
      const old = g.life.rules;
      g.life.rules = { meals: n.meals, rota: n.rota, hygiene: n.hygiene, quiet: n.quiet, curfew: n.curfew };
      const strict = (x: any) => +x.rota + +x.hygiene + +x.quiet + +x.curfew;
      if (strict(n) > strict(old)) for (const id of people(g)) upset(g, id, g.life.p[id].q.includes('proud') ? 6 : 2.5);
      if (n.meals > old.meals) for (const id of people(g)) feel(g, id, 1.5);
      return ok('House rules changed');
    }
    case 'care':
      return care(g, a);
    case 'gear': {
      const s = sq(a.title);
      if (!s || !GEAR_SLOTS.includes(a.slot) || !int(a.m, 0, GEAR[a.slot as GearSlot].length - 1)) return err('?');
      const L = a.all ? [0, 1, 2, 3, 4] : [a.i];
      if (!L.every((i: any) => int(i, 0, 4))) return err('?');
      const todo = L.filter((i: number) => s.stations[i].m[a.slot as GearSlot] !== a.m);
      let cost = 0;
      for (const i of todo) {
        const old = s.stations[i];
        cost +=
          GEAR[a.slot as GearSlot][a.m].price -
          Math.round((GEAR[a.slot as GearSlot][old.m[a.slot as GearSlot]].price * 0.4 * old.c[a.slot as GearSlot]) / 100);
      }
      if (cost > g.club.cash) return err('Not enough cash');
      if (!todo.length) return err('Already fitted');
      book(g, 'Equipment', -cost);
      for (const i of todo) {
        s.stations[i].m[a.slot as GearSlot] = a.m;
        s.stations[i].c[a.slot as GearSlot] = 100;
      }
      return ok(`Fitted for ${money(cost)}`);
    }
    case 'service': {
      const s = sq(a.title);
      if (!s) return err('?');
      let c = 0;
      for (const st of s.stations) for (const k of GEAR_SLOTS) c += ((100 - st.c[k]) / 100) * (GEAR[k][st.m[k]].price * 0.12 + 6);
      c = Math.round(c);
      if (c > g.club.cash) return err('Not enough cash');
      book(g, 'Equipment', -c);
      for (const st of s.stations) for (const k of GEAR_SLOTS) st.c[k] = 100;
      return ok(`Serviced for ${money(c)}`);
    }
    // club
    case 'deal': {
      const d = g.deals.find(x => x.id === a.id);
      if (!d || d.signed) return err('Offer gone');
      if (a.c === 'no') {
        g.deals = g.deals.filter(x => x !== d);
        return ok('Declined');
      }
      if (g.deals.some(x => x.signed && x.slot === d.slot)) return err(`${SPONSOR_SLOTS[d.slot].name} is already sold`);
      d.signed = true;
      d.until = g.day + d.weeks * 7;
      d.prog = 0;
      g.deals = g.deals.filter(x => x.signed || x.slot !== d.slot);
      book(g, 'Sponsors', d.weekly);
      return ok(`${d.brand} signed`);
    }
    case 'loan': {
      if (!int(a.n, -500000, 500000) || a.n === 0) return err('?');
      const lim = Math.round(30000 + g.club.rep * 4000 + g.club.fans * 0.8);
      if (a.n > 0) {
        if (g.club.loan + a.n > lim) return err(`Limit is ${money(lim)}`);
        g.club.loan += a.n;
        book(g, 'Loan', a.n);
      } else {
        const q = Math.min(-a.n, g.club.loan);
        if (q > g.club.cash) return err('Not enough cash');
        g.club.loan -= q;
        book(g, 'Loan', -q);
      }
      return ok();
    }
    case 'merch': {
      if (!int(a.v, 0, 2)) return err('?');
      g.club.merch = a.v;
      return ok();
    }
    case 'brand': {
      const c = a.club;
      if (!c || !str(c.name, 24) || !str(c.tag, 4) || ![c.c1, c.c2, c.c3].every(hex)) return err('Check the name and colours');
      const renamed = c.name !== g.club.name;
      if (renamed && g.day > 0) {
        if (g.club.cash < 5000) return err('A rename costs $5,000');
        book(g, 'Branding', -5000);
        g.club.fans = Math.round(g.club.fans * 0.94);
      }
      Object.assign(g.club, {
        name: c.name,
        tag: c.tag.toUpperCase(),
        c1: c.c1,
        c2: c.c2,
        c3: c.c3,
        crest: c.crest,
        jersey: c.jersey,
        motto: String(c.motto ?? '').slice(0, 48),
      });
      for (const t of Object.keys(g.squads) as TitleId[]) {
        const T = g.teams[meId(t)];
        T.name = c.name;
        T.tag = c.tag.toUpperCase();
        T.c1 = c.c1;
        T.c2 = c.c2;
        T.icon = c.crest.icon;
      }
      return ok('Brand updated');
    }
    case 'addTitle': {
      if (!TITLES.includes(a.title) || g.squads[a.title as TitleId]) return err('?');
      const c = TITLE_ENTRY_COST[a.title as TitleId];
      if (g.club.cash < c) return err(`Entry is ${money(c)}`);
      book(g, 'Entry fee', -c);
      const r = new Rng(g.rng);
      const mon = g.day + ((7 - dow(g.day)) % 7);
      addTitle(g, r, a.title, 48 + g.club.rep * 0.1, 0, mon);
      g.rng = r.s;
      msg(g, {
        kind: 'board',
        from: 'League office',
        title: `Entered ${TITLE[a.title as TitleId].realShort}`,
        body: `Five hopefuls signed, Division 3. The season opens in a week. They will train from home until you build them a practice room.`,
      });
      return ok();
    }
    // match
    case 'matchStart': {
      const f = todays(g).find(x => x.id === a.fid);
      if (!f || f.played || !(isMe(f.home) || isMe(f.away)) || g.live) return err('No match');
      return startLive(g, f);
    }
    case 'matchOrder': {
      const L = g.live;
      if (!L || !int(a.tick, 0, 120000) || typeof a.cmd !== 'string' || a.cmd.length > 16) return err('?');
      const last = L.orders[L.orders.length - 1];
      if (L.orders.length > 200 || (last && last.tick > a.tick)) return err('Late');
      L.orders.push({ tick: a.tick, team: L.us, cmd: a.cmd });
      return ok();
    }
    case 'matchEnd':
      if (!g.live) return err('No match');
      return endGame(g);
    case 'delegate': {
      if (!g.live) {
        const f = todays(g).find(x => x.id === a.fid);
        if (!f || f.played || !(isMe(f.home) || isMe(f.away))) return err('No match');
        startLive(g, f);
      }
      let o: Outcome = ok();
      while (g.live) o = endGame(g);
      return o;
    }
  }
  return err('Unknown action ' + a.t);
}
/** Iteration order of keyed tables must not depend on whether the state was just loaded or has been live for hours. */
const TABLES = ['players', 'teams', 'squads', 'seasons', 'know', 'nego', 'lastEvt', 'week'] as const;
function normalise(g: G) {
  for (const t of TABLES) {
    const o = g[t] as Record<string, unknown>;
    let prev = '',
      ok = true;
    for (const k in o) {
      if (k < prev) {
        ok = false;
        break;
      }
      prev = k;
    }
    if (!ok)
      (g as any)[t] = Object.fromEntries(
        Object.keys(o)
          .sort()
          .map(k => [k, o[k]]),
      );
  }
}
/** The only door into the game state. Increments seq on success so every accepted action is ordered. */
export function reduce(g: G, a: Action): Outcome {
  normalise(g);
  const o = apply(g, a);
  if (o.ok) g.seq++;
  return o;
}
export { wagesWeek, myToday, DIV_NAME, STAFF_ROLES };
