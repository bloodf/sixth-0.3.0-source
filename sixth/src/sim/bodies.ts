import { hyp } from '../core/dmath.ts';
import type { Grid } from './grid.ts';
interface Body {
  x: number;
  y: number;
  alive: boolean;
  team: number;
}
/**
 * People are solid to each other. Overlapping pairs are pushed apart, each half way, always through Grid.slide so nobody is
 * ever pushed into a wall. The push is turned slightly, so two people meeting head-on step around each other.
 */
export function separate(L: Body[], g: Grid, rad: (b: any) => number, teamK = 0.72) {
  for (let it = 0; it < 3; it++) {
    let any = false;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive) continue;
        const k = a.team === b.team ? teamK : 0.95;
        const ra = rad(a),
          rb = rad(b),
          min = (ra + rb) * k;
        let dx = a.x - b.x,
          dy = a.y - b.y;
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        let d = hyp(dx, dy);
        if (d >= min) continue;
        if (d < 1e-4) {
          dx = i % 2 ? 1 : -1;
          dy = 0.3;
          d = hyp(dx, dy);
        }
        any = true;
        const p = Math.min(0.3, (min - d) / 2 + 0.005);
        const nx = dx / d,
          ny = dy / d;
        const tx = nx * 0.94 - ny * 0.34,
          ty = ny * 0.94 + nx * 0.34;
        [a.x, a.y] = g.slide(a.x, a.y, tx * p, ty * p, ra);
        [b.x, b.y] = g.slide(b.x, b.y, -tx * p, -ty * p, rb);
      }
    }
    if (!any) break;
  }
}
