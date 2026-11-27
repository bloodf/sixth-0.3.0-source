import { lifeK, modK } from './life.ts';
import { clamp } from '../core/dmath.ts';
import { ATTRS, TITLE, type Attr, type TitleId } from '../data/titles.ts';
import { GEAR, GEAR_SLOTS } from '../data/club.ts';
import { heroPool } from '../data/heroes.ts';
import { Rng } from '../core/rng.ts';
import type { G, MatchCfg, Player, Squad, Station } from './types.ts';
import type { SimPlayer, SimStats, SimTeam } from '../sim/types.ts';
import { isMe, meId } from './league.ts';
import type { GearSlot } from '../data/club.ts';
export const gearQ = (s: Station, slot: GearSlot) => GEAR[slot][s.m[slot]].q * (0.55 + (0.45 * s.c[slot]) / 100);
export function stationQ(s: Station) {
  return GEAR_SLOTS.reduce((a, k) => a + gearQ(s, k), 0) / GEAR_SLOTS.length;
}
export function staffSkill(g: G, role: string, title?: TitleId): number {
  const L = g.staff.filter(s => s.role === role && (!title || !s.title || s.title === title));
  if (!L.length) return 0;
  const best = Math.max(...L.map(s => s.skill));
  return best / 100;
}
/** effective match stats for one player, 0..1 */
export function simStats(
  g: G,
  p: Player,
  q: { mech: number; react: number; util: number; comms: number; stam: number },
  offRole: boolean,
): SimStats {
  const st = {} as SimStats;
  const en = 0.9 + (0.1 * p.energy) / 100,
    mo = 0.975 + (0.05 * p.morale) / 100,
    fo = 1 + p.form * 0.008,
    inj = p.injury > 0 ? 0.85 : 1,
    str = p.stress / 100,
    // how they live shows in how they play
    lf = p.team?.endsWith(':me') && g.life ? lifeK(g, p.id) * modK(g, 'match') : 1;
  for (const a of ATTRS) {
    let m = en * mo * fo * inj * lf * (offRole ? 0.93 : 1);
    if (a === 'comp' || a === 'focus' || a === 'dec') m *= 1 - str * 0.16;
    if (a === 'mech') m *= q.mech;
    if (a === 'react') m *= q.react;
    if (a === 'util') m *= q.util;
    if (a === 'comms') m *= q.comms;
    if (a === 'stam') m *= q.stam;
    (st as any)[a] = clamp(Math.round(p.attr[a] * m) / 100, 0.04, 0.99);
  }
  return st;
}
const gq = (v: number) => 0.935 + (0.105 * v) / 100;
export function pickHeroes(title: TitleId, roles: string[], want: (string | null)[], seed: string): (string | undefined)[] {
  const r = Rng.of(seed),
    used = new Set<string>();
  const out: (string | undefined)[] = [];
  roles.forEach((ro, i) => {
    const pool = heroPool(title, ro);
    const w = want[i];
    if (w && !used.has(w) && pool.some(h => h.id === w)) {
      out[i] = w;
      used.add(w);
    }
  });
  roles.forEach((ro, i) => {
    if (out[i]) return;
    const pool = heroPool(title, ro).filter(h => !used.has(h.id));
    if (!pool.length) {
      out[i] = undefined;
      return;
    }
    const h = r.pick(pool);
    out[i] = h.id;
    used.add(h.id);
  });
  return out;
}
export function standIn(title: TitleId, i: number): SimPlayer {
  const st = {} as SimStats;
  for (const a of ATTRS) (st as any)[a] = 0.38;
  return { id: 'standin' + i, nick: 'stand-in', role: TITLE[title].roles[i].id, st, traits: [], num: 90 + i };
}
/** friends cover for each other, enemies do not: a little on top of synergy */
export function cohesion(g: G, lineup: (string | null)[]): number {
  const L = lineup.filter((x): x is string => !!x);
  let s = 0,
    n = 0;
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++) {
      s += g.life?.rel[L[i] < L[j] ? L[i] + '|' + L[j] : L[j] + '|' + L[i]] ?? 0;
      n++;
    }
  return n ? clamp((s / n) * 0.0011, -0.06, 0.06) : 0;
}
export function simTeam(g: G, id: string, seed: string): SimTeam {
  const t = g.teams[id],
    roles = TITLE[t.title].roles.map(r => r.id);
  if (isMe(id)) {
    const sq = g.squads[t.title]!;
    const hs = pickHeroes(t.title, roles, sq.heroes, seed + 'me');
    const ws = g.rooms.find(r => r.type === 'workshop');
    const tech = staffSkill(g, 'tech');
    return {
      id,
      name: g.club.name,
      tag: g.club.tag,
      c1: g.club.c1,
      c2: g.club.c2,
      icon: g.club.crest.icon,
      plan: { ...sq.plan },
      syn: clamp(sq.syn + cohesion(g, sq.lineup), 0.05, 1),
      fam: sq.fam,
      prep: sq.prep,
      coach: staffSkill(g, 'coach', t.title),
      players: sq.lineup.map((pid, i) => {
        const p = pid ? g.players[pid] : null;
        if (!p) return { ...standIn(t.title, i), hero: hs[i] };
        const s = sq.stations[i];
        const lat = (ws ? 0.004 * ws.lvl : 0) + tech * 0.006;
        const q = {
          mech: gq((gearQ(s, 'mouse') * 2 + gearQ(s, 'rig') + gearQ(s, 'monitor')) / 4) + lat,
          react: gq((gearQ(s, 'monitor') * 2 + gearQ(s, 'rig') * 1.5) / 3.5) + lat,
          util: gq(gearQ(s, 'keyboard')),
          comms: gq(gearQ(s, 'headset')),
          stam: gq(gearQ(s, 'chair')),
        };
        return {
          id: p.id,
          nick: p.nick,
          role: roles[i],
          hero: hs[i],
          st: simStats(g, p, q, p.role !== roles[i]),
          traits: p.traits,
          num: p.num,
        };
      }),
    };
  }
  const hs = pickHeroes(t.title, roles, [], seed + id);
  const v = gq(t.gear);
  const q = { mech: v, react: v, util: v, comms: v, stam: v };
  return {
    id,
    name: t.name,
    tag: t.tag,
    c1: t.c1,
    c2: t.c2,
    icon: t.icon,
    plan: { ...t.plan },
    syn: 0.62,
    fam: 0.62,
    prep: 0.3,
    coach: clamp(t.gear / 130, 0, 1),
    players: roles.map((ro, i) => {
      const p = t.roster[i] ? g.players[t.roster[i]] : null;
      if (!p) return { ...standIn(t.title, i), hero: hs[i] };
      return { id: p.id, nick: p.nick, role: ro, hero: hs[i], st: simStats(g, p, q, false), traits: p.traits, num: p.num };
    }),
  };
}
/** my heroes are fixed first; opponents avoid duplicates in MOBA drafts */
export function buildCfg(g: G, title: TitleId, home: string, away: string, map: string, seed: string): MatchCfg {
  const a = simTeam(g, home, seed + 'h'),
    b = simTeam(g, away, seed + 'a');
  if (title === 'dota') {
    const meFirst = isMe(away) ? [b, a] : [a, b];
    const used = new Set(meFirst[0].players.map(p => p.hero));
    const r = Rng.of(seed + 'd');
    for (const p of meFirst[1].players)
      if (used.has(p.hero)) {
        const pool = heroPool('dota', p.role).filter(h => !used.has(h.id) && !meFirst[1].players.some(o => o.hero === h.id));
        const any = pool.length
          ? pool
          : heroPool('dota', 'carry')
              .concat(heroPool('dota', 'off'), heroPool('dota', 'hard'))
              .filter(h => !used.has(h.id) && !meFirst[1].players.some(o => o.hero === h.id));
        p.hero = r.pick(any).id;
        used.add(p.hero);
      } else used.add(p.hero);
  }
  if (a.c1.toLowerCase() === b.c1.toLowerCase()) b.c1 = b.c2;
  return { title, map, seed, teams: [a, b] };
}
export function squadReady(g: G, sq: Squad): string[] {
  const w: string[] = [];
  sq.lineup.forEach((p, i) => {
    const r = TITLE[sq.title].roles[i].name;
    if (!p) w.push(`No ${r}: a stand-in will play`);
    else {
      const x = g.players[p];
      if (x.injury > 0) w.push(`${x.nick} is hurt (${x.injuryName})`);
      else if (x.energy < 45) w.push(`${x.nick} is exhausted`);
      else if (x.stress > 75) w.push(`${x.nick} is close to burning out`);
    }
  });
  return w;
}
export { meId };
export type { Attr };
