import { Rng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import { ATTRS, TITLE, overall, roleOf, type Attr, type TitleId } from '../data/titles.ts';
import { FEM_FIRST, NATION, NATIONS, NICKS, ORGS, type Region } from '../data/names.ts';
import { STAFF, STAFF_TRAITS, TRAITS, type StaffRole } from '../data/club.ts';
import type { G, Look, Player, Plan, Staff, Station, Team } from './types.ts';
import { GEAR_SLOTS, type GearSlot } from '../data/club.ts';
const SKIN: Record<string, [number, number]> = { EU: [0, 2], AM: [0, 5], AP: [1, 4] };
export function genLook(r: Rng, nat: string, fem = false): Look {
  const reg = NATION[nat]?.region ?? 'EU';
  const [a, b] =
    nat === 'BR' || nat === 'US'
      ? [0, 6]
      : nat === 'KR' || nat === 'CN' || nat === 'JP'
        ? [0, 2]
        : nat === 'ID' || nat === 'PH' || nat === 'TH'
          ? [2, 4]
          : SKIN[reg];
  const dark = ['KR', 'CN', 'JP', 'PH', 'ID', 'TH'].includes(nat);
  const skin = r.int(a, b);
  return {
    skin,
    hair: fem ? r.int(8, 13) : r.int(0, 7),
    hairC: dark ? (r.chance(0.15) ? r.int(2, 7) : r.int(0, 1)) : r.chance(0.06) ? r.int(8, 11) : r.int(0, 6),
    face: r.int(0, 4),
    eye: r.int(0, 3),
    brow: r.int(0, 3),
    nose: r.int(0, 3),
    mouth: r.int(0, 3),
    beard: fem || r.chance(0.68) ? 0 : r.int(1, 4),
    glasses: r.chance(0.22) ? r.int(1, 2) : 0,
    fem,
    head: r.int(0, 2),
    r: ['KR', 'CN', 'JP', 'TH'].includes(nat) ? 1 : skin >= 5 ? 2 : ['PH', 'ID'].includes(nat) ? 1 : 0,
  };
}
export function uniqueNick(g: { players: Record<string, Player> }, r: Rng): string {
  const used = new Set(Object.values(g.players).map(p => p.nick.toLowerCase()));
  for (let i = 0; i < 40; i++) {
    const n = r.pick(NICKS);
    if (!used.has(n.toLowerCase())) return n;
  }
  const SY = 'ka re vo lu mi zen dra thi sol ne ry qu ar el ox yn fa lor bi sen'.split(' ');
  for (;;) {
    let n = r.pick(SY) + r.pick(SY) + (r.chance(0.4) ? r.pick(SY) : '');
    if (r.chance(0.12)) n += r.int(1, 9);
    if (r.chance(0.3)) n = n[0].toUpperCase() + n.slice(1);
    if (!used.has(n.toLowerCase())) return n;
  }
}
export function natFor(r: Rng, reg: Region): string {
  return r.chance(0.86) ? r.pick(NATIONS.filter(n => n.region === reg)).id : r.pick(NATIONS).id;
}
export function genPlayer(g: G, r: Rng, title: TitleId, role: string, lvl: number, nat: string, ageHint?: number): Player {
  const w = roleOf(title, role).w;
  const age = ageHint ?? clamp(Math.round(21 + r.gauss() * 2.8), 16, 31);
  const attr = {} as Record<Attr, number>;
  for (const a of ATTRS) {
    const k = w[a] ?? 0;
    const ag = a === 'react' ? (22 - age) * 0.5 : a === 'dec' || a === 'comms' || a === 'comp' ? (age - 22) * 0.8 : 0;
    attr[a] = clamp(Math.round((lvl - 4 + k * 1.9 + r.gauss() * 6.5 + ag) * 10) / 10, 12, 98);
  }
  const d = lvl - overall(attr, title, role);
  for (const a of ATTRS) attr[a] = clamp(Math.round((attr[a] + d) * 10) / 10, 10, 98);
  const fem = r.chance(0.14);
  const n = NATION[nat];
  const tr: string[] = [];
  const keys = Object.keys(TRAITS);
  if (r.chance(0.55)) tr.push(r.pick(keys));
  if (r.chance(0.18)) {
    const t = r.pick(keys);
    if (!tr.includes(t)) tr.push(t);
  }
  let pot = clamp(overall(attr, title, role) + Math.max(0, (25 - age) * 1.6 + r.gauss() * 6), lvl, 97);
  if (tr.includes('prodigy')) pot = clamp(pot + 8, 0, 98);
  const id = 'p' + g.uid++;
  return {
    id,
    first: fem ? r.pick(FEM_FIRST[n.region]) : r.pick(n.first),
    last: r.pick(n.last),
    nick: uniqueNick(g, r),
    nat,
    age,
    title,
    role,
    attr,
    pot: Math.round(pot * 10) / 10,
    traits: tr,
    look: genLook(r, nat, fem),
    num: r.int(1, 99),
    team: null,
    contract: null,
    energy: 90,
    morale: 65 + r.int(-10, 15),
    stress: r.int(8, 28),
    form: 0,
    injury: 0,
    injuryName: '',
    fame: Math.round(Math.max(0, (lvl - 45) * 1.4 + r.gauss() * 8 + (tr.includes('star') ? 15 : 0))),
    listed: false,
    s: { m: 0, w: 0, k: 0, d: 0, a: 0, r: 0, mvp: 0 },
    car: { m: 0, w: 0, mvp: 0, trophies: 0 },
    grow: 0,
    joined: 0,
    talkDay: -99,
  };
}
export const ovr = (p: Player, role?: string) => overall(p.attr, p.title, role ?? p.role);
export function wageFor(p: Player): number {
  const o = ovr(p);
  const x = Math.max(0, o - 40);
  const base = 260 + x * 22 + x * x * 1.55 + (o > 72 ? (o - 72) * (o - 72) * 16 : 0);
  return Math.round((base * (1 + p.fame * 0.003) * (p.traits.includes('star') ? 1.15 : 1)) / 10) * 10;
}
export function valueFor(p: Player, day: number): number {
  const o = ovr(p),
    w = wageFor(p);
  const left = p.contract ? clamp((p.contract.until - day) / 364, 0.15, 2) : 0.3;
  const youth = 1 + Math.max(0, 24 - p.age) * 0.09 + Math.max(0, p.pot - o) * 0.03;
  return Math.round((w * 20 * youth * (0.45 + left * 0.55)) / 500) * 500;
}
export function genStaff(g: G, r: Rng, role: StaffRole, lvl: number, region: Region): Staff {
  const nat = natFor(r, region),
    n = NATION[nat],
    fem = r.chance(0.42);
  const skill = clamp(Math.round(lvl + r.gauss() * 9), 20, 96);
  return {
    id: 's' + g.uid++,
    role,
    name: (fem ? r.pick(FEM_FIRST[n.region]) : r.pick(n.first)) + ' ' + r.pick(n.last),
    nat,
    age: r.int(26, 56),
    skill,
    trait: r.pick(STAFF_TRAITS),
    salary: Math.round((STAFF[role].base * (0.35 + skill / 62)) / 10) * 10,
    since: -1,
    look: genLook(r, nat, fem),
  };
}
export function station(tier: number): Station {
  const m = {} as Record<GearSlot, number>,
    c = {} as Record<GearSlot, number>;
  for (const s of GEAR_SLOTS) {
    m[s] = tier;
    c[s] = 100;
  }
  return { m, c };
}
export const plan0 = (r?: Rng): Plan => ({
  style: r ? Math.round(r.range(0.2, 0.8) * 100) / 100 : 0.5,
  tempo: r ? Math.round(r.range(0.2, 0.8) * 100) / 100 : 0.5,
  risk: r ? Math.round(r.range(0.2, 0.8) * 100) / 100 : 0.4,
  focus: 'auto',
});
export const DIV_LVL = [74, 64, 53];
export const DIV_NAME = ['Division 1', 'Division 2', 'Division 3'];
export const ELO0 = [1620, 1420, 1220];
/** Build the AI world for one title. `mine` slots the player's team into Division 3. */
export function genWorld(g: G, r: Rng, title: TitleId): void {
  const region = g.club.region;
  const local = r.shuffle(ORGS.map((o, i) => ({ o, i })).filter(x => x.o[5] === region)),
    rest = r.shuffle(ORGS.map((o, i) => ({ o, i })).filter(x => x.o[5] !== region));
  const league = [...local, ...rest].slice(0, 29),
    intl = [...rest].filter(x => !league.includes(x)).slice(0, 8);
  r.shuffle(league);
  const mk = (x: { o: (typeof ORGS)[0]; i: number }, div: number, lvl: number) => {
    const id = `${title}:${x.i}`;
    const t: Team = {
      id,
      title,
      org: x.i,
      name: x.o[0],
      tag: x.o[1],
      icon: x.o[2],
      c1: x.o[3],
      c2: x.o[4],
      region: x.o[5],
      div,
      elo: (div === 9 ? 1720 : ELO0[div]) + Math.round((lvl - (div === 9 ? 80 : DIV_LVL[div])) * 12),
      roster: [],
      plan: plan0(r),
      form: '',
      gear: div === 9 ? 92 : [84, 66, 46][div],
    };
    g.teams[id] = t;
    const core = natFor(r, x.o[5]);
    TITLE[title].roles.forEach(ro => {
      const nat = r.chance(0.55) ? core : natFor(r, x.o[5]);
      const p = genPlayer(g, r, title, ro.id, clamp(lvl + r.gauss() * 3, 30, 93), nat);
      p.team = id;
      const w = wageFor(p);
      p.contract = { salary: w, until: g.day + r.int(60, 640), buyout: 0, bonus: 0 };
      p.contract.buyout = valueFor(p, g.day);
      g.players[p.id] = p;
      t.roster.push(p.id);
      g.know[p.id] = div === 2 ? 40 : div === 1 ? 45 : 60;
    });
  };
  league.forEach((x, k) => {
    const div = k < 10 ? 0 : k < 20 ? 1 : 2;
    mk(x, div, DIV_LVL[div] + r.gauss() * 3.4);
  });
  intl.forEach(x => mk(x, 9, 80 + r.gauss() * 3));
  refillFA(g, r, title, 34);
}
export function refillFA(g: G, r: Rng, title: TitleId, n: number) {
  const fa = Object.values(g.players).filter(p => p.title === title && !p.team).length;
  for (let i = fa; i < n; i++) {
    const ro = r.pick(TITLE[title].roles);
    const young = r.chance(0.45);
    const lvl = clamp(young ? 46 + r.gauss() * 6 : 56 + r.gauss() * 9, 34, 84);
    const p = genPlayer(g, r, title, ro.id, lvl, natFor(r, g.club.region), young ? r.int(16, 19) : undefined);
    g.players[p.id] = p;
    g.know[p.id] = 25 + r.int(0, 15);
  }
}
export function refillPool(g: G, r: Rng) {
  for (const role of Object.keys(STAFF) as StaffRole[]) {
    const have = g.pool.filter(s => s.role === role).length;
    for (let i = have; i < 3; i++) g.pool.push(genStaff(g, r, role, clamp(38 + g.club.rep * 0.55 + r.gauss() * 4, 30, 84), g.club.region));
  }
}
