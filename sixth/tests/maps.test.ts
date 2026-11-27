import { test } from 'node:test';
import assert from 'node:assert';
import { MAP_META, getMap } from '../src/sim/maps.ts';
for (const mm of MAP_META)
  test('map ' + mm.id, () => {
    const m = getMap(mm.id),
      g = m.grid;
    const pts: [string, number, number][] = [];
    let from: [number, number];
    if (m.kind === 'tac') {
      from = m.spawn[0];
      pts.push(['sT', ...m.spawn[0]], ['sC', ...m.spawn[1]]);
      for (const k of ['A', 'B'] as const) {
        const s = m.sites[k];
        pts.push([k + 'plant', ...s.plant]);
        s.holds.forEach((h, i) => pts.push([k + 'hold' + i, h[0], h[1]]));
        s.post.forEach((h, i) => pts.push([k + 'post' + i, h[0], h[1]]));
        s.routes.forEach((r, i) => r.forEach((p, j) => pts.push([`${k}r${i}.${j}`, ...p])));
      }
      m.midRoute.forEach((p, i) => pts.push(['mid' + i, ...p]));
      m.mid.forEach((p, i) => pts.push(['midh' + i, p[0], p[1]]));
    } else if (m.kind === 'moba') {
      from = m.base[0];
      pts.push(['b1', ...m.base[1]]);
      m.camps.forEach((p, i) => pts.push(['camp' + i, ...p]));
      pts.push(['pit', ...m.pit]);
      m.towers.forEach((t, i) => pts.push(['tw' + i, t.x, t.y]));
      m.lanes.forEach((l, i) => l.forEach((p, j) => pts.push([`l${i}.${j}`, ...p])));
    } else {
      from = m.spawn[0];
      pts.push(['s1', ...m.spawn[1]], ['pt', ...m.point]);
      m.packs.forEach((p, i) => pts.push(['pk' + i, ...p]));
      m.path?.forEach((p, i) => pts.push(['path' + i, ...p]));
      m.routes.flat(2).forEach((p, i) => pts.push(['r' + i, ...p]));
    }
    const bad: string[] = [];
    for (const [n, x, y] of pts) {
      if (!g.walk(x, y)) {
        bad.push(n + ' not walkable ' + x + ',' + y);
        continue;
      }
      const p = g.path(from[0], from[1], x, y);
      const e = p[p.length - 1];
      if (Math.hypot(e[0] - x, e[1] - y) > 0.5) bad.push(n + ' unreachable');
    }
    if (bad.length) console.log(mm.id, bad);
    assert.equal(bad.length, 0);
  });
