import { Rng } from '../core/rng.ts';
import { clamp, logistic } from '../core/dmath.ts';
import { TITLE, type TitleId } from '../data/titles.ts';
import { mapsFor } from '../sim/maps.ts';
import { ELO0, ovr } from './gen.ts';
import type { Fixture, G, Row, Season, Team } from './types.ts';
export const WEEKS = 13;
export const LEAGUE_ROUNDS = 9;
export const meId = (t: TitleId) => `${t}:me`;
export const isMe = (id: string) => id.endsWith(':me');
export const PRIZE = [
  [90000, 50000, 26000, 26000, 14000, 11000, 9000, 7000, 5000, 4000],
  [34000, 20000, 11000, 11000, 6500, 5500, 4500, 3800, 3000, 2500],
  [14000, 8500, 5000, 5000, 3200, 2800, 2400, 2000, 1600, 1300],
];
export const MASTERS_PRIZE = [320000, 150000, 70000, 70000, 30000, 30000, 30000, 30000];
export function newSeason(g: G, r: Rng, title: TitleId, n: number, start: number): Season {
  const tables: Row[][] = [[], [], []],
    fixtures: Fixture[] = [];
  for (let d = 0; d < 3; d++) {
    const ids = Object.values(g.teams)
      .filter(t => t.title === title && t.div === d)
      .map(t => t.id);
    r.shuffle(ids);
    tables[d] = ids.map(team => ({ team, p: 0, w: 0, l: 0, mw: 0, ml: 0 }));
    const N = ids.length,
      arr = [...ids];
    for (let rd = 0; rd < N - 1; rd++) {
      for (let i = 0; i < N / 2; i++) {
        let h = arr[i],
          a = arr[N - 1 - i];
        if ((rd + i) % 2) {
          const t = h;
          h = a;
          a = t;
        }
        const mine = isMe(h) || isMe(a);
        fixtures.push({
          id: `${title}.${n}.${d}.${rd}.${i}`,
          title,
          day: start + 7 * (rd + 1) + (mine ? TITLE[title].matchDow : (TITLE[title].matchDow + 7 - (i % 2)) % 7),
          comp: 'league',
          stage: `Round ${rd + 1}`,
          div: d,
          home: h,
          away: a,
          bo: 1,
        });
      }
      arr.splice(1, 0, arr.pop()!);
    }
  }
  fixtures.sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1));
  return {
    title,
    n,
    start,
    tables,
    fixtures,
    maps: r.shuffle(mapsFor(title).map(m => m.id)),
    masters: [],
    stage: 'league',
    champs: [null, null, null],
    mchamp: null,
  };
}
export const sorted = (t: Row[]) =>
  [...t].sort((a, b) => b.w - a.w || b.mw - b.ml - (a.mw - a.ml) || b.mw - a.mw || (a.team < b.team ? -1 : 1));
export function strength(g: G, id: string): number {
  const t = g.teams[id];
  if (isMe(id)) {
    const sq = g.squads[t.title]!;
    const ps = sq.lineup.map((p, i) => (p && g.players[p] ? ovr(g.players[p], TITLE[t.title].roles[i].id) : 38));
    return ps.reduce((a, b) => a + b, 0) / 5 + (sq.syn - 0.5) * 4;
  }
  const ps = t.roster.map(p => g.players[p]).filter(Boolean);
  return ps.reduce((a, p) => a + ovr(p), 0) / Math.max(1, ps.length);
}
export function expected(g: G, a: string, b: string): number {
  const k = g.teams[a].title === 'dota' ? 0.12 : 0.16;
  return logistic((strength(g, a) - strength(g, b)) * k);
}
/** cheap result for AI v AI */
export function quick(g: G, r: Rng, f: Fixture): void {
  const p = expected(g, f.home, f.away);
  const need = (f.bo + 1) / 2;
  let s: [number, number] = [0, 0];
  const games: { map: string; score: [number, number] }[] = [];
  const maps = mapsFor(f.title);
  while (s[0] < need && s[1] < need) {
    const h = r.chance(p);
    const gap = Math.abs(p - 0.5);
    let sc: [number, number];
    if (f.title === 'dota') {
      const w = r.int(24, 48),
        l = clamp(w - r.int(4, 26) - Math.round(gap * 10), 4, 47);
      sc = [w, l];
    } else if (f.title === 'ow') sc = r.chance(0.42) ? [2, 1] : [2, 0];
    else {
      const l = clamp(Math.round(8 + r.gauss() * 2.6 - gap * 5), 0, 11);
      sc = r.chance(0.08) ? [16, 14 - r.int(0, 1)] : [13, l];
    }
    if (!h) sc = [sc[1], sc[0]];
    games.push({ map: r.pick(maps).id, score: sc });
    s[h ? 0 : 1]++;
  }
  f.games = games;
  finish(g, f, f.bo === 1 ? games[0].score : s, s[0] > s[1]);
}
export function finish(g: G, f: Fixture, score: [number, number], homeWin: boolean) {
  f.score = score;
  f.played = true;
  const s = g.seasons[f.title]!;
  const H = g.teams[f.home],
    A = g.teams[f.away];
  const e = logistic((H.elo - A.elo) / 174);
  const k = f.comp === 'masters' ? 34 : f.comp === 'playoff' ? 28 : 22;
  const d = Math.round(k * ((homeWin ? 1 : 0) - e) * 10) / 10;
  H.elo = Math.round((H.elo + d) * 10) / 10;
  A.elo = Math.round((A.elo - d) * 10) / 10;
  H.form = ((homeWin ? 'W' : 'L') + H.form).slice(0, 5);
  A.form = ((homeWin ? 'L' : 'W') + A.form).slice(0, 5);
  if (f.comp === 'league') {
    const h = s.tables[f.div].find(x => x.team === f.home)!,
      a = s.tables[f.div].find(x => x.team === f.away)!;
    h.p++;
    a.p++;
    h.mw += score[0];
    h.ml += score[1];
    a.mw += score[1];
    a.ml += score[0];
    if (homeWin) {
      h.w++;
      a.l++;
    } else {
      a.w++;
      h.l++;
    }
  }
}
export function todays(g: G, day = g.day): Fixture[] {
  return Object.values(g.seasons).flatMap(s => s!.fixtures.filter(f => f.day === day));
}
export function myToday(g: G): Fixture | undefined {
  return todays(g).find(f => !f.played && (isMe(f.home) || isMe(f.away)));
}
export function myNext(g: G, t?: TitleId): Fixture | undefined {
  return Object.values(g.seasons)
    .filter(s => !t || s!.title === t)
    .flatMap(s => s!.fixtures)
    .filter(f => !f.played && f.day >= g.day && (isMe(f.home) || isMe(f.away)))
    .sort((a, b) => a.day - b.day)[0];
}
const won = (f: Fixture) => {
  const hw = f.games ? f.games.filter(x => x.score[0] > x.score[1]).length * 2 > f.games.length : f.score![0] > f.score![1];
  return hw ? f.home : f.away;
};
const lost = (f: Fixture) => (won(f) === f.home ? f.away : f.home);
export { won, lost };
/** Called at the start of each day after fixtures resolved: builds next stages. Returns milestones. */
export function progress(g: G, r: Rng, title: TitleId): { k: string; team?: string; div?: number; prize?: number; place?: number }[] {
  const s = g.seasons[title]!,
    out: { k: string; team?: string; div?: number; prize?: number; place?: number }[] = [],
    base = s.start,
    dow = TITLE[title].matchDow;
  if (s.stage === 'league' && s.fixtures.every(f => f.comp !== 'league' || f.played)) {
    for (let d = 0; d < 3; d++) {
      const t = sorted(s.tables[d]);
      const mk = (h: string, a: string, i: number) =>
        s.fixtures.push({
          id: `${title}.${s.n}.${d}.sf${i}`,
          title,
          day: base + 7 * 10 + dow,
          comp: 'playoff',
          stage: 'Semi-final',
          div: d,
          home: h,
          away: a,
          bo: 3,
        });
      mk(t[0].team, t[3].team, 0);
      mk(t[1].team, t[2].team, 1);
      t.forEach((x, i) => {
        if (i >= 4) out.push({ k: 'place', team: x.team, div: d, place: i + 1, prize: PRIZE[d][i] });
      });
    }
    s.stage = 'semi';
    out.push({ k: 'playoffs' });
  } else if (s.stage === 'semi') {
    const sf = s.fixtures.filter(f => f.stage === 'Semi-final' && f.comp === 'playoff');
    if (sf.every(f => f.played)) {
      for (let d = 0; d < 3; d++) {
        const x = sf.filter(f => f.div === d);
        s.fixtures.push({
          id: `${title}.${s.n}.${d}.f`,
          title,
          day: base + 7 * 11 + dow,
          comp: 'playoff',
          stage: 'Final',
          div: d,
          home: won(x[0]),
          away: won(x[1]),
          bo: 3,
        });
        for (const q of x) out.push({ k: 'place', team: lost(q), div: d, place: 3, prize: PRIZE[d][2] });
      }
      s.stage = 'final';
    }
  } else if (s.stage === 'final') {
    const fs = s.fixtures.filter(f => f.stage === 'Final' && f.comp === 'playoff');
    if (fs.every(f => f.played)) {
      for (const f of fs) {
        s.champs[f.div] = won(f);
        out.push(
          { k: 'champ', team: won(f), div: f.div, place: 1, prize: PRIZE[f.div][0] },
          { k: 'place', team: lost(f), div: f.div, place: 2, prize: PRIZE[f.div][1] },
        );
      }
      const d1 = fs.find(f => f.div === 0)!;
      const intl = Object.values(g.teams)
        .filter(t => t.title === title && t.div === 9)
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 6)
        .map(t => t.id);
      const f8 = [won(d1), lost(d1), ...intl];
      s.masters = f8;
      const pr = [
        [0, 7],
        [3, 4],
        [1, 6],
        [2, 5],
      ];
      pr.forEach(([a, b], i) =>
        s.fixtures.push({
          id: `${title}.${s.n}.m.q${i}`,
          title,
          day: base + 7 * 12 + Math.max(0, dow - 2),
          comp: 'masters',
          stage: 'Quarter-final',
          div: 0,
          home: f8[a],
          away: f8[b],
          bo: 3,
        }),
      );
      s.stage = 'masters';
      out.push({ k: 'masters' });
    }
  } else if (s.stage === 'masters') {
    const q = s.fixtures.filter(f => f.comp === 'masters' && f.stage === 'Quarter-final'),
      sm = s.fixtures.filter(f => f.comp === 'masters' && f.stage === 'Semi-final'),
      fn = s.fixtures.filter(f => f.comp === 'masters' && f.stage === 'Final');
    if (!sm.length && q.every(f => f.played)) {
      for (const f of q) out.push({ k: 'mplace', team: lost(f), place: 5, prize: MASTERS_PRIZE[4] });
      [
        [0, 1],
        [2, 3],
      ].forEach(([a, b], i) =>
        s.fixtures.push({
          id: `${title}.${s.n}.m.s${i}`,
          title,
          day: base + 7 * 12 + Math.max(1, dow - 1),
          comp: 'masters',
          stage: 'Semi-final',
          div: 0,
          home: won(q[a]),
          away: won(q[b]),
          bo: 3,
        }),
      );
    } else if (sm.length && !fn.length && sm.every(f => f.played)) {
      for (const f of sm) out.push({ k: 'mplace', team: lost(f), place: 3, prize: MASTERS_PRIZE[2] });
      s.fixtures.push({
        id: `${title}.${s.n}.m.f`,
        title,
        day: base + 7 * 12 + Math.max(2, dow),
        comp: 'masters',
        stage: 'Final',
        div: 0,
        home: won(sm[0]),
        away: won(sm[1]),
        bo: 3,
      });
    } else if (fn.length && fn[0].played) {
      s.mchamp = won(fn[0]);
      out.push(
        { k: 'mchamp', team: s.mchamp, prize: MASTERS_PRIZE[0] },
        { k: 'mplace', team: lost(fn[0]), place: 2, prize: MASTERS_PRIZE[1] },
      );
      s.stage = 'done';
    }
  }
  return out;
}
/** promotion / relegation then roll a new season */
export function rollover(g: G, title: TitleId): { up: string[]; down: string[] } {
  const s = g.seasons[title]!;
  const up: string[] = [],
    down: string[] = [];
  const fin = (d: number) => {
    const f = s.fixtures.find(x => x.comp === 'playoff' && x.stage === 'Final' && x.div === d)!;
    return [f.home, f.away];
  };
  const last = (d: number) =>
    sorted(s.tables[d])
      .slice(-2)
      .map(x => x.team);
  for (const d of [1, 2]) {
    const u = fin(d),
      w = last(d - 1);
    for (const id of u) {
      up.push(id);
    }
    for (const id of w) {
      down.push(id);
    }
  }
  for (const id of up) {
    const t = g.teams[id];
    t.div--;
    t.elo += 30;
    t.gear = Math.min(92, t.gear + 10);
  }
  for (const id of down) {
    const t = g.teams[id];
    t.div++;
    t.elo -= 30;
  }
  void ELO0;
  return { up, down };
}
export type { Team };
