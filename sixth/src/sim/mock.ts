import type { TitleId } from '../data/titles.ts';
import { TITLE, ATTRS } from '../data/titles.ts';
import { heroPool } from '../data/heroes.ts';
import { Rng } from '../core/rng.ts';
import type { MatchCfg, SimTeam } from './types.ts';
export function mockTeam(t: TitleId, lvl: number, seed: string, c1 = '#2b6cb0', c2 = '#ffffff', name = 'Alpha'): SimTeam {
  const r = Rng.of(seed),
    used = new Set<string>();
  return {
    id: name,
    name,
    tag: name.slice(0, 3).toUpperCase(),
    c1,
    c2,
    icon: 'wolf-head',
    syn: 0.6,
    fam: 0.6,
    coach: 0.5,
    prep: 0.3,
    plan: { style: 0.5, tempo: 0.5, risk: 0.5, focus: 'auto' },
    players: TITLE[t].roles.map((ro, i) => {
      const st: any = {};
      for (const a of ATTRS) st[a] = Math.max(0.05, Math.min(0.98, lvl + r.gauss() * 0.06));
      const pool = heroPool(t, ro.id).filter(h => !used.has(h.id));
      const h = pool.length ? r.pick(pool).id : undefined;
      if (h) used.add(h);
      return { id: name + i, nick: name.toLowerCase() + i, role: ro.id, hero: h, st, traits: [], num: i + 1 };
    }),
  };
}
export const mockCfg = (t: TitleId, map: string, seed: string, a = 0.6, b = 0.6): MatchCfg => ({
  title: t,
  map,
  seed,
  teams: [mockTeam(t, a, seed + 'a', '#2b6cb0', '#ffffff', 'Alpha'), mockTeam(t, b, seed + 'b', '#c53030', '#ffe0c0', 'Bravo')],
});
