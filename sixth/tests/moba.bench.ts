import { MobaSim } from '../src/sim/moba.ts';
import { mockCfg } from '../src/sim/mock.ts';
for (const m of ['oldvale', 'ashmere'])
  for (const [a, b] of [
    [0.6, 0.6],
    [0.66, 0.6],
    [0.75, 0.6],
  ]) {
    let w = 0,
      ms = 0,
      N = +(process.argv[2] ?? 16),
      ticks = 0,
      k = 0,
      boss = 0,
      tw = 0,
      cap = 0,
      lh = 0,
      lvl = 0;
    for (let i = 0; i < N; i++) {
      const c = mockCfg('dota', m, 's' + i, a, b);
      if (a === b && i % 2) {
        const t = c.teams[0].players;
        c.teams[0].players = c.teams[1].players;
        c.teams[1].players = t;
      }
      const s = new MobaSim(c);
      const t0 = performance.now();
      while (!s.done) {
        s.step();
        for (const e of s.ev) {
          if (e.k === 'boss') boss++;
          if (e.k === 'tower') tw++;
        }
      }
      ms += performance.now() - t0;
      const r = s.result();
      if (r.winner === 0) w++;
      if (r.ticks >= 15000) cap++;
      ticks += r.ticks;
      k += r.score[0] + r.score[1];
      lh += s.actors[0].lh;
      lvl += s.actors[0].lvl;
    }
    console.log(
      m,
      a,
      b,
      'win',
      (w / N).toFixed(2),
      'min',
      (ticks / N / 600).toFixed(1),
      'kills',
      (k / N).toFixed(0),
      'ms',
      (ms / N).toFixed(0),
      'boss',
      (boss / N).toFixed(1),
      'towers',
      (tw / N).toFixed(1),
      'cap',
      cap,
      'carryLH',
      (lh / N).toFixed(0),
      'lvl',
      (lvl / N).toFixed(1),
    );
  }
const a = new MobaSim(mockCfg('dota', 'oldvale', 'z')),
  b = new MobaSim(mockCfg('dota', 'oldvale', 'z'));
while (!a.done) a.step();
while (!b.done) b.step();
console.log(
  a.result().hash === b.result().hash,
  a.result().score,
  a
    .result()
    .stats.flat()
    .map(x => [x.hero, x.k, x.d, x.a, x.gold, x.lvl, x.rating].join('/')),
  a.log.slice(0, 12),
);
