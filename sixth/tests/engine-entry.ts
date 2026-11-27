import { genesis, reduce } from '../src/game/reducer.ts';
import { myToday } from '../src/game/league.ts';
import { canon, sha256 } from '../src/core/hash.ts';
import { makeSim } from '../src/sim/index.ts';
import { mockCfg } from '../src/sim/mock.ts';
import { opts, settleIncident } from './fixture.ts';
import { Draft, layout, diffCost } from '../src/game/build.ts';
import { ROOM_TYPES } from '../src/data/club.ts';
import { Replay, upgradeAction } from '../src/save/replay.ts';
const sim = (t: any, m: string, ticks: number) => () => {
  const s = makeSim(mockCfg(t, m, 'xe', 0.62, 0.6));
  for (let i = 0; i < ticks && !s.done; i++) {
    if (i === 200) s.order(0, t === 'ow' ? 'push' : t === 'dota' ? 'push1' : 't:rushA');
    s.step();
  }
  return m + ' ' + s.tick + ' ' + s.result().hash + ' ' + sha256(s.actors.map(a => a.x + ',' + a.y + ',' + a.hp).join(';')).slice(0, 16);
};
(globalThis as any).__parts = [
  sim('cs2', 'kasbah', 1500),
  sim('val', 'halcyon', 1500),
  sim('ow', 'solstice', 1500),
  sim('ow', 'meridian', 1200),
  sim('dota', 'oldvale', 900),
  ...((globalThis as any).__FULL
    ? [sim('cs2', 'kasbah', 60000), sim('val', 'terrace', 60000), sim('ow', 'solstice', 60000), sim('dota', 'ashmere', 20000)]
    : []),
  () => {
    const out: string[] = [];
    const g = genesis(opts('backed', (globalThis as any).__FULL ? ['cs2', 'ow'] : ['ow'], 'xe'));
    let n = 0;
    while (g.day < ((globalThis as any).__FULL ? 16 : 9) && n++ < 60) {
      if (settleIncident(g, a => reduce(g, a))) continue;
      const f = myToday(g);
      if (f) {
        reduce(g, { t: 'delegate', fid: f.id });
        continue;
      }
      for (const x of g.inbox.filter(x => x.choices && !x.done)) reduce(g, { t: 'choose', id: x.id, c: x.choices![0].id });
      reduce(g, { t: 'advance' });
    }
    // build a gym on bought land, the way the editor does
    const d = new Draft(JSON.parse(JSON.stringify(g.hq)));
    d.land('e', 6);
    d.preset('gym', 2, d.w - 7, 1);
    g.club.cash += 1e5;
    const o = reduce(g, { t: 'remodel', hq: d.hq() });
    if (!o.ok) throw new Error(o.err);
    out.push('career ' + g.day + ' ' + sha256(canon(g)));
    return out.join('\n');
  },
  () => {
    const q = layout(3, [...ROOM_TYPES.map(type => ({ type, lvl: 3, ...(type === 'practice' ? { title: 'cs2' as const } : {}) }))]);
    return 'layout ' + sha256(canon(q)) + ' ' + diffCost(layout(0, []), q, 3).cost;
  },
  () => {
    const r = new Replay();
    for (const a of [
      { t: '#genesis', opts: opts('backed', ['cs2', 'dota'], 'xe'), rules: 1 },
      { t: 'advance' },
      { t: 'advance' },
      upgradeAction(2),
      upgradeAction(3),
      { t: 'advance' },
    ])
      r.step(a as any);
    return 'old career, upgraded ' + r.rules + ' ' + r.hash();
  },
];
