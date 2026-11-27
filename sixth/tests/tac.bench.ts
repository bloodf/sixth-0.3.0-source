import { TacSim } from '../src/sim/tac.ts';
import { mockCfg } from '../src/sim/mock.ts';
for (const [t, m] of [
  ['cs2', 'kasbah'],
  ['cs2', 'foundry'],
  ['cs2', 'quarry'],
  ['val', 'halcyon'],
  ['val', 'terrace'],
  ['val', 'arcade'],
] as const) {
  for (const [a, b] of [
    [0.6, 0.6],
    [0.66, 0.6],
    [0.75, 0.6],
  ]) {
    let w = 0,
      ms = 0,
      rounds = 0,
      tw = 0,
      plants = 0,
      N = 24,
      ticks = 0,
      why: any = {},
      tto = 0;
    const diff: number[] = [];
    for (let i = 0; i < N; i++) {
      const s = new TacSim(mockCfg(t, m, 's' + i, a, b));
      const t0 = performance.now();
      let g = 0;
      while (!s.done && g++ < 80000) {
        s.step();
        for (const e of s.ev) {
          if (e.k === 'roundEnd') {
            rounds++;
            if (e.win === s.tSide) tw++;
            why[e.why] = (why[e.why] ?? 0) + 1;
            tto += s.t;
          }
          if (e.k === 'planted') plants++;
        }
      }
      ms += performance.now() - t0;
      const r = s.result();
      if (r.winner === 0) w++;
      ticks += r.ticks;
      diff.push(r.score[0] - r.score[1]);
      if (g >= 80000) console.log('STUCK', s.score, s.ph, s.t);
    }
    console.log(
      t,
      m,
      a,
      b,
      'win',
      (w / N).toFixed(2),
      'Twin',
      (tw / rounds).toFixed(2),
      'plant',
      (plants / rounds).toFixed(2),
      'rnds',
      (rounds / N).toFixed(1),
      'ms',
      (ms / N).toFixed(0),
      'min',
      (ticks / N / 600).toFixed(1),
      'avgRound',
      (tto / rounds / 10).toFixed(0),
      JSON.stringify(why),
    );
  }
}
const a = new TacSim(mockCfg('cs2', 'kasbah', 'z')),
  b = new TacSim(mockCfg('cs2', 'kasbah', 'z'));
while (!a.done) a.step();
while (!b.done) b.step();
console.log(
  a.result().hash === b.result().hash,
  a.result().score,
  a.result().stats[0].map(x => [x.k, x.d, x.a, x.rating].join('/')),
  a.log.slice(0, 8),
);
