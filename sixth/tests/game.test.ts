import { test } from 'node:test';
import assert from 'node:assert';
import { genesis, reduce } from '../src/game/reducer.ts';
import { canon, sha256 } from '../src/core/hash.ts';
import type { G, Action } from '../src/game/types.ts';
import { myToday, sorted, meId } from '../src/game/league.ts';
import { wagesWeek } from '../src/game/day.ts';
import { mine } from '../src/game/events.ts';
import { ovr } from '../src/game/gen.ts';
import type { TitleId } from '../src/data/titles.ts';
import { opts, settleIncident } from './fixture.ts';
function play(g: G, days: number, log: Action[], spend = true) {
  const d = (a: Action) => {
    const o = reduce(g, a);
    if (o.ok) log.push(a);
    return o;
  };
  const start = g.day;
  let guard = 0;
  while (g.day - start < days && !g.over && guard++ < days * 9) {
    if (settleIncident(g, d)) continue;
    const f = myToday(g);
    if (f) {
      d({ t: 'delegate', fid: f.id });
      continue;
    }
    for (const m of g.inbox.filter(m => m.choices && !m.done))
      d({ t: 'choose', id: m.id, c: m.kind === 'bid' ? 'reject' : m.choices![0].id });
    if (spend) {
      for (const x of g.deals.filter(x => !x.signed)) d({ t: 'deal', id: x.id, c: 'yes' });
      for (const p of mine(g))
        if (p.contract && p.contract.until - g.day < 20) {
          const o = d({ t: 'offer', pid: p.id, salary: Math.round(p.contract.salary * 1.1), months: 12 });
          if (o.data?.counter) d({ t: 'offer', pid: p.id, salary: o.data.counter + 50, months: 12 });
        }
    }
    const o = d({ t: 'advance' });
    if (!o.ok) throw new Error(o.err + ' ' + JSON.stringify(g.inbox[0]));
  }
}
test('replay is bit exact over a season, two titles', () => {
  const log: Action[] = [];
  const o = opts('backed', ['cs2', 'ow']);
  const g = genesis(o);
  play(g, 100, log);
  const h = sha256(canon(g));
  const g2 = genesis(JSON.parse(JSON.stringify(o)));
  const t0 = performance.now();
  for (const a of log) {
    const r = reduce(g2, JSON.parse(JSON.stringify(a)));
    assert.ok(r.ok, a.t + r.err);
  }
  console.log(
    'actions',
    log.length,
    'replay ms',
    Math.round(performance.now() - t0),
    'state KB',
    Math.round(canon(g).length / 1024),
    'cash',
    g.club.cash,
    'fans',
    g.club.fans,
  );
  assert.equal(sha256(canon(g2)), h);
});
test('saving and reloading at any point never changes the future', () => {
  const o = opts('backed', ['cs2', 'dota'], 'reload');
  const log: Action[] = [];
  const g = genesis(o);
  play(g, 120, log);
  const h = sha256(canon(g));
  let g2: G = JSON.parse(canon(genesis(JSON.parse(JSON.stringify(o)))));
  let i = 0;
  for (const a of log) {
    assert.ok(reduce(g2, JSON.parse(canon(a))).ok);
    if (i++ % 7 === 0) g2 = JSON.parse(canon(g2));
  }
  assert.equal(sha256(canon(g2)), h);
});
for (const [or, ts] of [
  ['flat', ['cs2']],
  ['backed', ['dota']],
  ['fallen', ['cs2', 'val', 'dota', 'ow']],
] as [string, TitleId[]][])
  test('economy ' + or, () => {
    const log: Action[] = [];
    const g = genesis(opts(or, ts, 'eco' + or));
    const o0 = mine(g).reduce((s, p) => s + ovr(p), 0) / mine(g).length;
    for (let s = 0; s < 4; s++) {
      play(g, 91, log);
      const w = wagesWeek(g);
      console.log(
        or,
        'season',
        s + 1,
        'day',
        g.day,
        'cash',
        g.club.cash,
        'fans',
        g.club.fans,
        'rep',
        g.club.rep,
        'W-L',
        g.stats.w,
        g.stats.l,
        'div',
        Object.keys(g.squads).map(t => g.teams[meId(t as TitleId)].div),
        'ovr',
        o0.toFixed(1),
        '->',
        (mine(g).reduce((s, p) => s + ovr(p), 0) / mine(g).length).toFixed(1),
        'wages/wk',
        w.players,
        'rent',
        w.rent,
        'upk',
        w.upkeep,
        'players',
        mine(g).length,
        'E',
        Math.round(mine(g).reduce((s, p) => s + p.energy, 0) / mine(g).length),
        'S',
        Math.round(mine(g).reduce((s, p) => s + p.stress, 0) / mine(g).length),
        'M',
        Math.round(mine(g).reduce((s, p) => s + p.morale, 0) / mine(g).length),
        'led',
        JSON.stringify(g.ledger[g.ledger.length - 2]?.items),
        g.over,
      );
      if (g.over) break;
      const t = ts[0];
      void sorted;
      void t;
    }
  });
