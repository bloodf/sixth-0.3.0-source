// Does the plan matter, and is any plan dominant? Equal squads, one side changes plan.
import { runSim } from '../src/sim/index.ts';
import { mockCfg } from '../src/sim/mock.ts';
const N = +(process.argv[2] ?? 40);
for (const [t, m] of [
  ['ow', 'solstice'],
  ['ow', 'meridian'],
  ['cs2', 'kasbah'],
  ['dota', 'oldvale'],
] as const)
  for (const [n, p] of Object.entries({
    base: {},
    fast: { tempo: 0.95 },
    slow: { tempo: 0.05 },
    loose: { style: 0.95 },
    strict: { style: 0.05 },
    risky: { risk: 0.95 },
    safe: { risk: 0.05 },
    ...(t === 'ow' ? { dive: { focus: 'dive' }, brawl: { focus: 'brawl' }, poke: { focus: 'poke' } } : {}),
  })) {
    let w = 0;
    const K = t === 'dota' ? Math.min(N, 16) : N;
    for (let i = 0; i < K; i++) {
      const c = mockCfg(t, m, 'pl' + i, 0.62, 0.62);
      const s = (i % 2) as 0 | 1;
      c.teams[s].players.forEach((x, j) => {
        x.st = { ...x.st };
      });
      Object.assign(c.teams[s].plan, p);
      if (runSim(c).winner === s) w++;
    }
    console.log(t, m, n, (w / K).toFixed(2));
  }
