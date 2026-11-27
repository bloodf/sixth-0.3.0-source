import { ArenaSim } from '../src/sim/arena.ts';
import { mockCfg } from '../src/sim/mock.ts';
for (const m of ['solstice', 'meridian'])
  for (const [a, b] of [
    [0.6, 0.6],
    [0.66, 0.6],
    [0.75, 0.6],
  ]) {
    let w = 0,
      ms = 0,
      N = 40,
      ticks = 0,
      k = 0,
      ults = 0,
      sc: Record<string, number> = {},
      stuck = 0,
      heal = 0,
      dmg = 0;
    for (let i = 0; i < N; i++) {
      const c = mockCfg('ow', m, 's' + i, a, b);
      if (a === b && i % 2) {
        const t = c.teams[0].players;
        c.teams[0].players = c.teams[1].players;
        c.teams[1].players = t;
      }
      const s = new ArenaSim(c);
      const t0 = performance.now();
      let g = 0;
      while (!s.done && g++ < 40000) {
        s.step();
        for (const e of s.ev) {
          if (e.k === 'ult') ults++;
        }
      }
      if (g >= 40000) {
        stuck++;
      }
      ms += performance.now() - t0;
      const r = s.result();
      if (r.winner === 0) w++;
      ticks += r.ticks;
      for (const x of r.stats.flat()) {
        k += x.k;
        heal += x.heal;
        dmg += x.dmg;
      }
      sc[r.score.join('-')] = (sc[r.score.join('-')] ?? 0) + 1;
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
      'ults',
      (ults / N).toFixed(0),
      'ms',
      (ms / N).toFixed(0),
      'dmg/min/p',
      ((dmg / ticks) * 60).toFixed(0),
      'heal',
      ((heal / ticks) * 60 * 2.5).toFixed(0),
      JSON.stringify(sc),
      'stuck',
      stuck,
    );
  }
const a = new ArenaSim(mockCfg('ow', 'solstice', 'z')),
  b = new ArenaSim(mockCfg('ow', 'solstice', 'z'));
while (!a.done) a.step();
while (!b.done) b.step();
console.log(
  a.result().hash === b.result().hash,
  a
    .result()
    .stats.flat()
    .map(x => [x.hero, x.k, x.d, x.a, x.dmg, x.heal, x.rating].join('/')),
  a.log,
);
