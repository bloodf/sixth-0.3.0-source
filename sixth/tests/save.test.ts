/** Careers as signed histories: replay across rule versions, and what a forger may try. */
import { test } from 'node:test';
import assert from 'node:assert';
import { Replay, nextHead, upgrade, reduceUnder } from '../src/save/replay.ts';
import * as old from '../src/legacy/rules1.js';
import { genesis, reduce } from '../src/game/reducer.ts';
import { canon, sha256 } from '../src/core/hash.ts';
import { Draft, layout, roomsOf, status } from '../src/game/build.ts';
import { RULES } from '../src/game/types.ts';
import { myToday } from '../src/game/league.ts';
import { opts, settleIncident } from './fixture.ts';
const replay = (log: any[]) => {
  const r = new Replay();
  for (const a of log) {
    const e = r.step(JSON.parse(JSON.stringify(a)));
    if (e) return { err: e, r };
  }
  return { err: null, r };
};
function oldCareer() {
  const o = opts('backed', ['cs2', 'dota'], 'v1');
  const g: any = (old as any).genesis(o);
  const log: any[] = [{ t: '#genesis', opts: o, rules: 1 }];
  const d = (a: any) => {
    const r = (old as any).reduce(g, JSON.parse(JSON.stringify(a)));
    if (r.ok) log.push(a);
    return r;
  };
  for (let y = 0; y < 30 && !g.rooms.some((r: any) => r.type === 'gym'); y++)
    for (let x = 0; x < 40; x++) if (d({ t: 'build', type: 'gym', x, y }).ok) break;
  const k = g.rooms.find((r: any) => r.type === 'kitchen');
  if (k) d({ t: 'upgrade', id: k.id });
  for (let i = 0; i < 60 && g.day < 9; i++) {
    for (const m of g.inbox.filter((m: any) => m.choices && !m.done))
      d({ t: 'choose', id: m.id, c: m.kind === 'bid' ? 'reject' : m.choices[0].id });
    d({ t: 'advance' });
  }
  return { g, log };
}
test('a career from 0.1.0 continues: same club, every room at its level, replay still exact', () => {
  const { g, log } = oldCareer();
  assert.ok(g.day >= 5);
  const { g: up, steps } = upgrade(g, 1);
  assert.deepEqual(steps, [
    { t: '#upgrade', to: 2 },
    { t: '#upgrade', to: 3 },
  ]);
  assert.ok(Object.keys(up.life.p).length > 5, 'everybody gets a life');
  assert.equal(up.rules, RULES);
  assert.equal(up.club.cash, g.club.cash);
  const want = g.rooms.map((r: any) => r.type + (r.title ?? '') + r.lvl).sort();
  assert.deepEqual(up.rooms.map(r => r.type + (r.title ?? '') + r.lvl).sort(), want, 'every room survives at its level');
  assert.deepEqual(
    status(new Draft(up.hq)).flatMap(s => s.problems),
    [],
  );
  const l2 = [...log, ...steps];
  const cur = JSON.parse(canon(up));
  for (let i = 0; i < 3; i++) {
    for (const m of cur.inbox.filter((m: any) => m.choices && !m.done)) {
      const a = { t: 'choose', id: m.id, c: m.kind === 'bid' ? 'reject' : m.choices[0].id };
      if (reduce(cur, a).ok) l2.push(a);
    }
    while (settleIncident(cur, a => (l2.push(a), reduce(cur, JSON.parse(JSON.stringify(a)))))) void 0;
    const f = myToday(cur);
    const a = f ? { t: 'delegate', fid: f.id } : { t: 'advance' };
    assert.ok(reduce(cur, JSON.parse(JSON.stringify(a))).ok);
    l2.push(a);
  }
  const { err, r } = replay(l2);
  assert.equal(err, null);
  assert.equal(r.hash(), sha256(canon(cur)));
  let h = '';
  for (const a of l2) h = nextHead(h, a);
  assert.equal(r.head, h);
});
test('forged records are refused', () => {
  const { log } = oldCareer();
  assert.match(replay([...log, { t: '#epoch', state: { club: { cash: 1e9 } } }]).err!, /Unknown record/);
  assert.match(replay([...log, { t: '#upgrade', to: 2, state: {} }, { t: '#upgrade', to: 2 }]).err!, /Impossible upgrade/);
  assert.match(replay([{ t: '#upgrade', to: 2 }]).err!, /beginning/);
  assert.match(replay([{ t: '#genesis', opts: opts('backed', ['cs2']), rules: 99 }]).err!, /Unknown rules/);
  assert.match(replay([...log, log[0]]).err!, /second beginning/);
  // the upgrade carries no state: whatever is attached to it changes nothing
  const a = replay([...log, { t: '#upgrade', to: 2 }]).r.hash(),
    b = replay([...log, { t: '#upgrade', to: 2, g: { club: { cash: 1e9 } } } as any]).r.hash();
  assert.equal(a, b);
  // old actions do not work under new rules
  assert.ok(!reduceUnder(2, genesis(opts('backed', ['cs2'])), { t: 'build', type: 'gym', x: 1, y: 1 }).ok);
});
test('building: what the editor sends is checked like any other move', () => {
  const g: any = genesis(opts('backed', ['cs2', 'dota'], 'hq'));
  const q = () => JSON.parse(JSON.stringify(g.hq));
  const no = (h: any, why: RegExp) => {
    const before = sha256(canon(g));
    const o = reduce(g, { t: 'remodel', hq: h });
    assert.ok(!o.ok);
    assert.match(o.err!, why);
    assert.equal(sha256(canon(g)), before, 'a refused plan changes nothing');
  };
  let h = q();
  h.items.push({ id: 'i9999', f: 'rack', x: 2, y: 2, r: 0 });
  no(h, /way|match|floor/i);
  h = q();
  // a piece that pretends to have been there all along would be free
  const d0 = new Draft(h);
  outer: for (let y = 0; y < h.h * 2; y++)
    for (let x = 0; x < h.w * 2; x++) {
      const it = { id: 'i9998', f: 'plant', x, y, r: 0 };
      if (!d0.canPlace(it)) {
        h.items.push(it);
        break outer;
      }
    }
  no(h, /does not match/);
  h = q();
  h.floor = 'l'.repeat(h.floor.length + 1);
  no(h, /damaged/);
  h = q();
  h.w = 400;
  no(h, /wrong size/);
  h = q();
  h.zones.push({ id: 'n1', x: 1, y: 1, type: 'practice', title: 'ow' });
  no(h, /squad/);
  h = q();
  h.items[0].f = 'icebath';
  no(h, /.+/);
  no(null, /wrong size/);
  // too expensive
  g.club.cash = 500;
  const d = new Draft(q());
  d.land('n', 1);
  for (let i = 0; i < 3; i++) d.land('e', 1);
  no(d.hq(), /costs/);
  // and a fair one works and is paid for
  g.club.cash = 300000;
  const e = new Draft(q());
  assert.equal(e.land('e', 6), null);
  assert.equal(e.preset('gym', 2, e.w - 7, 1), null);
  const o = reduce(g, { t: 'remodel', hq: e.hq() });
  assert.ok(o.ok, o.err ?? '');
  assert.ok(g.rooms.some((r: any) => r.type === 'gym' && r.lvl === 2));
  assert.ok(g.club.cash < 300000 - 7000);
  assert.ok(
    g.hq.items.every((i: any) => !i.id.startsWith('n')) && g.hq.zones.every((z: any) => !z.id.startsWith('n')),
    'everything gets its own number',
  );
  // selling it again gives less than it cost
  const cash = g.club.cash;
  const s = new Draft(q());
  const R = s.regions();
  const z = s.zones.find(z => z.type === 'gym')!;
  s.removeRegion(R.map[z.y * s.w + z.x]);
  assert.ok(reduce(g, { t: 'remodel', hq: s.hq() }).ok);
  assert.ok(g.club.cash > cash && g.club.cash < 300000);
  assert.ok(!g.rooms.some((r: any) => r.type === 'gym'));
});
test('no money machine: building and undoing anything never earns', () => {
  const g: any = genesis(opts('backed', ['cs2'], 'mm'));
  g.club.cash = 1e6;
  let seed = 3;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) % n;
  const start = g.club.cash;
  for (let i = 0; i < 60; i++) {
    const before = JSON.parse(JSON.stringify(g.hq));
    const cash = g.club.cash;
    const d = new Draft(JSON.parse(JSON.stringify(g.hq)));
    const k = rnd(6);
    if (k === 0) d.land('nesw'[rnd(4)] as any, rnd(3) + 1);
    else if (k === 1) d.drawRoom(rnd(d.w - 4), rnd(d.h - 4), 2 + rnd(4), 2 + rnd(4), 'abcdefghijklmn'[rnd(14)], 'abcdefghij'[rnd(10)]);
    else if (k === 2) d.fill(rnd(d.w), rnd(d.h), 1 + rnd(5), 1 + rnd(5), 'lma.'[rnd(4)]);
    else if (k === 3) d.paintRegion(rnd(5), 'abcdefghij'[rnd(10)]);
    else if (k === 4) d.setE(rnd(2) ? 'v' : 'h', rnd(d.w), rnd(d.h), '01DW'[rnd(4)]);
    else d.removeRegion(rnd(5));
    if (!reduce(g, { t: 'remodel', hq: d.hq() }).ok) continue;
    // straight back: keep the ids of what is still there, buy the rest again
    const ids = new Set([...g.hq.items.map((i: any) => i.id), ...g.hq.zones.map((z: any) => z.id)]);
    let n = 1;
    for (const x of [...before.items, ...before.zones]) if (!ids.has(x.id)) x.id = 'n' + n++;
    assert.ok(reduce(g, { t: 'remodel', hq: before }).ok);
    assert.ok(g.club.cash <= cash, `round trip earned ${g.club.cash - cash} (move ${k})`);
  }
  assert.ok(g.club.cash <= start);
});
test('layouts are the same everywhere', () => {
  const a = layout(1, [
    { type: 'practice', title: 'cs2', lvl: 2 },
    { type: 'kitchen', lvl: 3 },
  ]);
  assert.equal(
    sha256(canon(a)),
    sha256(
      canon(
        layout(1, [
          { type: 'practice', title: 'cs2', lvl: 2 },
          { type: 'kitchen', lvl: 3 },
        ]),
      ),
    ),
  );
  assert.equal(roomsOf(a).length, 2);
});
test('a career from 0.2.0 continues too', async () => {
  const r2: any = await import('../src/legacy/rules2.js');
  const o = opts('backed', ['cs2'], 'v2');
  const g: any = r2.genesis(o);
  const log: any[] = [{ t: '#genesis', opts: o, rules: 2 }];
  for (let i = 0; i < 5; i++) {
    for (const m of g.inbox.filter((m: any) => m.choices && !m.done)) {
      const a = { t: 'choose', id: m.id, c: m.choices[0].id };
      if (r2.reduce(g, a).ok) log.push(a);
    }
    if (r2.reduce(g, { t: 'advance' }).ok) log.push({ t: 'advance' });
  }
  const { g: up, steps } = upgrade(g, 2);
  assert.equal(steps.length, 1);
  assert.equal(up.club.cash, g.club.cash);
  const a = replay([...log, ...steps]);
  assert.equal(a.err, null);
  assert.equal(a.r.hash(), sha256(canon(up)));
});
