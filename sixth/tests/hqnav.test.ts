/** People at the headquarters: over many buildings and a lot of walking, nobody may enter a wall or furniture. */
import { test } from 'node:test';
import assert from 'node:assert';
import { Draft, layout, roomsOf, size, type HQ } from '../src/game/build.ts';
import { Nav, Walker, spotsOf, BODY, WALL_T, type Spot } from '../src/gfx/hqnav.ts';
import { ROOM_TYPES } from '../src/data/club.ts';
import { FURN, FURN_LIST } from '../src/data/furniture.ts';
/** independent geometry: does this point lie inside wall or furniture, measured from the plan itself? */
function inside(q: HQ, x: number, z: number, r: number, but?: string): string | null {
  const d = new Draft(q);
  for (let y = Math.floor(z - 1); y <= Math.floor(z + 1); y++)
    for (let i = Math.floor(x - 1); i <= Math.floor(x + 1); i++) {
      const v = d.ev(i, y),
        h = d.eh(i, y);
      const seg = (x0: number, z0: number, x1: number, z1: number) => {
        const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0,
          dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
        return Math.hypot(dx, dz) < WALL_T + r;
      };
      if ((v === '1' || v === 'W') && seg(i, y, i, y + 1)) return `wall v ${i},${y}`;
      if ((h === '1' || h === 'W') && seg(i, y, i + 1, y)) return `wall h ${i},${y}`;
      if (v === 'D' && (seg(i, y, i, y) || seg(i, y + 1, i, y + 1))) return 'door post';
      if (h === 'D' && (seg(i, y, i, y) || seg(i + 1, y, i + 1, y))) return 'door post';
    }
  for (const it of q.items) {
    if (it.id === but || FURN[it.f].wall || FURN[it.f].flat) continue;
    const [w, hh] = size(it);
    const dx = x < it.x / 2 ? it.x / 2 - x : x > (it.x + w) / 2 ? x - (it.x + w) / 2 : 0,
      dz = z < it.y / 2 ? it.y / 2 - z : z > (it.y + hh) / 2 ? z - (it.y + hh) / 2 : 0;
    if (Math.hypot(dx, dz) < r) return it.f;
  }
  return null;
}
const T = ['cs2', 'val', 'dota', 'ow'];
const mk = (site: number, types: any[], lvl: number) => {
  let p = 0;
  return layout(
    site,
    types.map((type, i) => ({ type, lvl: lvl || 1 + (i % 3), title: type === 'practice' ? (T[p++] as any) : undefined })),
  );
};
const CASES: [string, HQ][] = [
  ['flat', mk(0, ['practice', 'kitchen'], 1)],
  ['house', mk(1, ['practice', 'kitchen', 'strategy', 'lounge', 'gym'], 2)],
  ['studio', mk(2, ['practice', 'practice', ...ROOM_TYPES.filter(t => t !== 'practice')], 0)],
  ['campus', mk(3, [...ROOM_TYPES, 'practice', 'practice', 'practice'], 3)],
];
// deterministic shuffling
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function clutter(q: HQ, n: number): HQ {
  const d = new Draft(q);
  for (let i = 0; i < n; i++) {
    const f = FURN_LIST[Math.floor(rnd() * FURN_LIST.length)];
    const it = { id: d.uid(), f: f.id, x: Math.floor(rnd() * d.w * 2), y: Math.floor(rnd() * d.h * 2), r: Math.floor(rnd() * 4) };
    if (!d.canPlace(it)) d.items.push(it);
  }
  return d.hq();
}
for (let i = 0; i < 6; i++) CASES.push([`cluttered ${i}`, clutter(CASES[i % 4][1], 120 + i * 60)]);
for (const [name, q] of CASES)
  test('nobody walks through anything: ' + name, () => {
    const nav = new Nav(q);
    const rooms = roomsOf(q);
    const spots = spotsOf(q, nav, rooms);
    assert.ok(spots.length > 5);
    if (!name.startsWith('clut'))
      for (const r of rooms)
        assert.ok(
          spots.some(s => s.kind.startsWith(r.type + ':')),
          'no place to be in ' + r.type,
        );
    for (const s of spots) {
      assert.ok(!inside(q, s.ax, s.az, BODY - 0.02), `${s.kind} approach in ${inside(q, s.ax, s.az, BODY - 0.02)}`);
      assert.ok(nav.line(s.ax, s.az, s.x, s.z, 0.03, s.item), s.kind + ' seat step crosses something');
    }
    const people = Array.from({ length: 24 }, (_, i) => new Walker('p' + i));
    const pick = () => {
      const fr = spots.filter(s => !s.used);
      return fr[Math.floor(rnd() * fr.length)];
    };
    const give = (p: Walker) => {
      const s = pick();
      if (!s) return;
      if (p.spot) p.spot.used = undefined;
      s.used = p.id;
      p.go(s);
    };
    people.forEach(p => {
      const s = pick();
      s.used = p.id;
      p.warp(s);
    });
    let arrived = 0,
      bad = '',
      walked = 0,
      late = 0;
    for (let t = 0; t < 2400; t++) {
      if (t % 600 === 0) people.forEach(give);
      let todo = 3;
      for (const p of people) {
        if (p.need && p.state === 'free' && todo-- > 0) p.plan(nav);
        const a = p.arrived;
        const px = p.x,
          pz = p.z;
        const speed = t % 2 ? 1.55 : 6.2;
        p.step(nav, 0.05, speed, people);
        walked += Math.hypot(p.x - px, p.z - pz);
        if (Math.hypot(p.x - px, p.z - pz) > speed * 0.05 + 0.05) bad ||= `${p.id} jumped ${Math.hypot(p.x - px, p.z - pz)} at ${t}`;
        if (!a && p.arrived) arrived++;
        if (p.state === 'free') {
          const k = inside(q, p.x, p.z, BODY - 0.02);
          if (k) bad ||= `${p.id} in ${k} at ${p.x.toFixed(2)},${p.z.toFixed(2)} t ${t}`;
        } else {
          const own: Spot | null = (p as any).seat;
          const k = inside(q, p.x, p.z, 0.02, own?.item);
          if (k) bad ||= `${p.id} ${p.state} through ${k}`;
        }
      }
      if (t % 600 === 599 && process.env.DBG)
        for (const p of people.filter(p => !p.arrived))
          console.log(
            p.id,
            p.state,
            'need',
            p.need,
            'path',
            p.path.length,
            p.x.toFixed(2),
            p.z.toFixed(2),
            p.spot && [p.spot.kind, p.spot.ax, p.spot.az],
            'others near',
            people.filter(o => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 0.7).map(o => o.id + o.state),
          );
      if (t % 600 === 599) late += people.filter(p => !p.arrived).length;
    }
    console.log(name.padEnd(12), 'spots', spots.length, 'walked', Math.round(walked) + ' m', 'arrived', arrived, 'still walking', late);
    assert.equal(bad, '');
    assert.equal(late, 0, late + ' never got there');
  });
