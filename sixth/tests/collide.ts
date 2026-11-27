// Solid bodies: over whole matches, nobody may stand inside or travel through a wall, crate, tree or tower.
import { makeSim } from '../src/sim/index.ts';
import { mockCfg } from '../src/sim/mock.ts';
import { MAP_META, getMap } from '../src/sim/maps.ts';
const N = +(process.argv[2] ?? 3),
  R = 0.45;
let bad = 0;
for (const m of MAP_META) {
  const map = getMap(m.id),
    g = map.grid;
  let ticks = 0,
    inside = 0,
    through = 0,
    worst = 0,
    tp = 0,
    overlap = 0;
  const ex: string[] = [];
  const depth = (x: number, y: number, r: number) => {
    let d = 0;
    const c = g.cell;
    for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++)
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        if (g.at(cx, cy) === 0) continue;
        const px = Math.max(cx * c, Math.min(x, (cx + 1) * c)),
          py = Math.max(cy * c, Math.min(y, (cy + 1) * c));
        const q = Math.hypot(x - px, y - py);
        d = Math.max(d, q === 0 ? r : r - q);
      }
    return d;
  };
  for (let i = 0; i < N; i++) {
    const s: any = makeSim(mockCfg(m.title, m.id, 'col' + i));
    const prev = s.actors.map((a: any) => [a.x, a.y, a.alive]);
    let guard = 0;
    while (!s.done && guard++ < (m.title === 'dota' ? 9000 : 20000)) {
      s.step();
      ticks++;
      const reset = s.ev.some((e: any) => e.k === 'round' || e.k === 'half');
      s.actors.forEach((a: any, k: number) => {
        const p = prev[k];
        const back = reset || !p[2] || s.ev.some((e: any) => (e.k === 'spawn' || e.k === 'revive') && e.i === a.i);
        if (a.alive) {
          const rad = m.title === 'dota' ? 0.55 : m.title === 'ow' ? 0.378 : 0.45;
          let d = depth(a.x, a.y, rad);
          for (const o of g.statics) d = Math.max(d, o.r + rad - Math.hypot(a.x - o.x, a.y - o.y) - 0.1);
          if (d > 0.03) {
            inside++;
            worst = Math.max(worst, d);
            if (ex.length < 3) ex.push(`in ${a.nick} ${a.x.toFixed(2)},${a.y.toFixed(2)} d${d.toFixed(2)} ${a.anim} t${s.tick}`);
          }
          if (!back) {
            const dx = a.x - p[0],
              dy = a.y - p[1],
              L = Math.hypot(dx, dy);
            if (L > 4) tp++;
            for (let u = 0; u <= L; u += 0.1)
              if (g.atp(p[0] + (dx * u) / (L || 1), p[1] + (dy * u) / (L || 1)) !== 0) {
                through++;
                if (ex.length < 6) ex.push(`thru ${a.nick} L${L.toFixed(2)} ${a.anim} t${s.tick}`);
                break;
              }
          }
        }
        prev[k] = [a.x, a.y, a.alive];
      });
      if (s.towers)
        for (const t of s.towers)
          if (t.alive) for (const a of s.actors) if (a.alive && Math.hypot(a.x - t.x, a.y - t.y) < (t.core ? 2.4 : 1.1) + 0.25) overlap++;
      if (s.creeps && s.tick % 5 === 0)
        for (const c of s.creeps)
          if (c.alive) {
            if (depth(c.x, c.y, 0.2) > 0.05) inside++;
          }
      if (s.tick % 3 === 0)
        for (let a = 0; a < 10; a++)
          for (let b = a + 1; b < 10; b++) {
            const A = s.actors[a],
              B = s.actors[b];
            if (A.alive && B.alive && Math.hypot(A.x - B.x, A.y - B.y) < (m.title === 'ow' ? 0.48 : 0.54)) overlap++;
          }
    }
  }
  if (inside + through > 0) bad++;
  console.log(
    `${inside + through ? 'FAIL' : 'PASS'} ${m.id.padEnd(9)} ticks ${ticks} clipping ${inside} (worst ${worst.toFixed(2)} m) crossed-wall ${through} overlapping-bodies ${overlap} jumps>4m ${tp}`,
    inside + through ? ex.join(' | ') : '',
  );
}
console.log(bad ? bad + ' maps fail' : 'Nobody entered or crossed anything solid');
process.exit(bad ? 1 : 0);
