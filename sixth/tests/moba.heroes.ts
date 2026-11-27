import { MobaSim } from '../src/sim/moba.ts';
import { mockCfg } from '../src/sim/mock.ts';
import { MOBA } from '../src/data/heroes.ts';
import { Rng } from '../src/core/rng.ts';
import { TITLE } from '../src/data/titles.ts';
const W: Record<string, [number, number]> = {};
const N = +(process.argv[2] ?? 60);
const perf0 = performance.now();
let side = 0;
for (let i = 0; i < N; i++) {
  const c = mockCfg('dota', i % 2 ? 'oldvale' : 'ashmere', 'h' + i);
  const r = Rng.of('hh' + i);
  const used = new Set<string>();
  for (const t of c.teams)
    t.players.forEach((p, j) => {
      const pool = MOBA.filter(h => h.pos.includes(TITLE.dota.roles[j].id) && !used.has(h.id));
      const h = pool.length ? r.pick(pool) : r.pick(MOBA.filter(h => !used.has(h.id)));
      p.hero = h.id;
      used.add(h.id);
    });
  const s = new MobaSim(c);
  while (!s.done) s.step();
  side += s.winner;
  c.teams.forEach((t, ti) =>
    t.players.forEach(p => {
      const k = p.role + ':' + p.hero!;
      for (const kk of [k, p.hero!]) {
        W[kk] ??= [0, 0];
        W[kk][1]++;
        if (ti === s.winner) W[kk][0]++;
      }
    }),
  );
}
console.log('team1 rate', side / N, 'ms', (performance.now() - perf0) / N);
console.log(
  Object.entries(W)
    .filter(x => !x[0].includes(':'))
    .sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])
    .map(([k, v]) => `${k} ${(v[0] / v[1]).toFixed(2)} (${v[1]})`)
    .join('\n'),
);
