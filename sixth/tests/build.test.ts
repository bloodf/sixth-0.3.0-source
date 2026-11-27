import { test } from 'node:test';
import assert from 'node:assert';
import { Draft, diffCost, itemError, layout, roomsOf, status, template, templateCost, validate, regions } from '../src/game/build.ts';
import { ROOM_TYPES, SITES } from '../src/data/club.ts';
import { FURN_LIST } from '../src/data/furniture.ts';
for (const t of ROOM_TYPES)
  test('ready-made ' + t, () => {
    let prev = 0;
    for (const l of [1, 2, 3])
      for (const flip of [false, true]) {
        const d = Draft.empty(30, 20);
        assert.equal(d.preset(t, l, 5, 5, t === 'practice' ? 'cs2' : undefined, flip), null);
        for (const it of d.items)
          assert.equal(itemError(d, it), null, `${t} ${l} flip ${flip}: ${it.f} at ${it.x - 10},${it.y - 10} ${itemError(d, it)}`);
        const s = status(d)[0];
        assert.deepEqual(s.problems, [], `${t} ${l}: ${s.problems}`);
        assert.equal(s.lvl, l, `${t} wanted level ${l}, got ${s.lvl} with ${s.points} points (next ${s.next})`);
        const R = regions(d);
        void R;
        if (!flip) {
          const c = templateCost(t, l);
          assert.ok(c > prev);
          prev = c;
        }
      }
    console.log(t.padEnd(9), [1, 2, 3].map(l => '$' + templateCost(t, l)).join(' '), template(t, 1).w + 'x' + template(t, 1).h);
  });
test('first layouts', () => {
  for (const [site, rooms] of [
    [0, ['practice', 'kitchen']],
    [1, ['practice', 'kitchen', 'strategy', 'lounge']],
    [1, ['practice', 'practice', 'kitchen', 'strategy', 'lounge']],
    [2, ['practice', 'practice', 'practice', 'practice', 'kitchen', 'strategy', 'lounge', 'office', 'trophy']],
    [3, [...ROOM_TYPES, 'practice', 'practice', 'practice']],
    [0, [...ROOM_TYPES]],
  ] as [number, any[]][]) {
    const T = ['cs2', 'val', 'dota', 'ow'];
    let p = 0;
    const want = rooms.map(type => ({ type, lvl: 1 + (rooms.length % 3), title: type === 'practice' ? (T[p++] as any) : undefined }));
    const q = layout(site, want);
    const s = status(new Draft(q));
    console.log(
      'site',
      site,
      q.w + 'x' + q.h,
      'max',
      SITES[site].mw + 'x' + SITES[site].mh,
      'rooms',
      s.filter(x => x.lvl).length + '/' + rooms.length,
      s
        .filter(x => !x.lvl)
        .map(x => x.zone.type + ': ' + x.problems.join(';'))
        .join(' | '),
    );
    if (site !== 0 || rooms.length < 5) {
      assert.equal(validate(q, site, T as any), null);
      assert.equal(roomsOf(q).length, rooms.length);
    }
  }
});
test('editor operations keep the plan valid', () => {
  const q = layout(1, [
    { type: 'practice', title: 'cs2', lvl: 2 },
    { type: 'kitchen', lvl: 1 },
  ]);
  const d = new Draft(q);
  assert.equal(diffCost(q, q, 1).cost, 0);
  assert.equal(d.land('e', 4), null);
  assert.equal(d.land('w', 3), null);
  assert.equal(d.land('n', 2), null);
  const moved = d.hq();
  assert.equal(validate(moved, 1, ['cs2']), null);
  const c = diffCost(q, moved, 1);
  assert.deepEqual(
    c.parts.map(x => x[0]),
    ['Land'],
    JSON.stringify(c),
  );
  assert.equal(roomsOf(moved).length, 2);
  const R = d.regions();
  const z = d.zones.find(z => z.type === 'kitchen')!;
  const id = R.map[z.y * d.w + z.x];
  const before = d.itemsIn(id).length;
  assert.equal(d.stretch(id, 'e', 2), null);
  assert.equal(validate(d.hq(), 1, ['cs2']), null);
  assert.equal(d.itemsIn(d.regions().map[z.y * d.w + z.x]).length, before);
  assert.equal(roomsOf(d.hq()).filter(r => r.type === 'kitchen')[0].area, R.list[id].area + 2 * R.list[id].h);
  const id2 = d.regions().map[z.y * d.w + z.x];
  const e = d.stretch(id2, 'e', -2);
  assert.equal(e, null);
  const id3 = d.regions().map[z.y * d.w + z.x];
  const m = new Draft(d.hq());
  const er = m.moveRegion(id3, 3, 0);
  assert.equal(er, null);
  assert.equal(validate(m.hq(), 1, ['cs2']), null, String(validate(m.hq(), 1, ['cs2'])));
  m.removeRegion(m.regions().map[m.zones.find(x => x.type === 'kitchen')!.y * m.w + m.zones.find(x => x.type === 'kitchen')!.x]);
  assert.equal(m.zones.length, 1);
  assert.equal(validate(m.hq(), 1, ['cs2']), null);
  assert.ok(diffCost(d.hq(), m.hq(), 1).cost < 0);
});
test('random vandalism never yields an invalid accepted plan', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 40; n++) {
    const d = new Draft(
      layout(2, [
        { type: 'practice', title: 'cs2', lvl: 1 },
        { type: 'gym', lvl: 2 },
        { type: 'lounge', lvl: 3 },
      ]),
    );
    for (let k = 0; k < 40; k++) {
      const o = new Draft(d.hq());
      const x = Math.floor(rnd() * d.w),
        y = Math.floor(rnd() * d.h);
      const R = d.regions();
      let e: string | null = null;
      const op = Math.floor(rnd() * 8);
      if (op === 0) e = d.drawRoom(x, y, 2 + Math.floor(rnd() * 5), 2 + Math.floor(rnd() * 5), 'a', 'a');
      else if (op === 1) d.wallLine(x, y, x, Math.min(d.h, y + 4), rnd() < 0.5 ? '1' : '0', 'b');
      else if (op === 2 && R.list.length)
        e = d.moveRegion(Math.floor(rnd() * R.list.length), Math.floor(rnd() * 5) - 2, Math.floor(rnd() * 5) - 2);
      else if (op === 3 && R.list.length)
        e = d.stretch(Math.floor(rnd() * R.list.length), 'nesw'[Math.floor(rnd() * 4)] as any, Math.floor(rnd() * 5) - 2);
      else if (op === 4) e = d.land('nesw'[Math.floor(rnd() * 4)] as any, Math.floor(rnd() * 5) - 2);
      else if (op === 5 && R.list.length) d.removeRegion(Math.floor(rnd() * R.list.length));
      else if (op === 6) e = d.fill(x, y, 3, 3, rnd() < 0.5 ? '.' : 'b');
      else {
        const f = FURN_LIST[Math.floor(rnd() * FURN_LIST.length)];
        const it = { id: d.uid(), f: f.id, x: x * 2, y: y * 2, r: Math.floor(rnd() * 4) };
        if (!itemError(d, it)) d.items.push(it);
      }
      const bad = e ? 'err' : validate(d.hq(), 2, ['cs2']);
      // the editor refuses an operation that errors or that leaves anything illegal behind
      if (bad) Object.assign(d, o);
      assert.equal(validate(d.hq(), 2, ['cs2']), null);
    }
  }
});
