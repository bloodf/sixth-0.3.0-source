/** People who live in the house: needs, grudges, incidents, desks. Everything has to be the same on every machine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genesis, reduce } from '../src/game/reducer.ts';
import { INCIDENTS, INC, rollIncident } from '../src/game/incidents.ts';
import { emoOf, neighboursAll, people, rel, relKey } from './helpers.ts';
import { desks, deskMate, neighbours, seatsOf } from '../src/game/seats.ts';
import { FEED, QUIRKS, EMO } from '../src/data/life.ts';
import { feedText } from './helpers.ts';
import { myToday } from '../src/game/league.ts';
import { Rng } from '../src/core/rng.ts';
import { opts, settleIncident } from './fixture.ts';
const clone = (g: any) => JSON.parse(JSON.stringify(g));
/** plays until a day, the way somebody in a hurry would */
function live(g: any, days: number, step = false) {
  let guard = 0;
  while (g.day < days && !g.over && guard++ < 9000) {
    if (settleIncident(g, a => reduce(g, a))) continue;
    const f = myToday(g);
    if (f) {
      assert.equal(reduce(g, { t: 'delegate', fid: f.id } as any).ok, true);
      continue;
    }
    for (const m of g.inbox.filter((m: any) => m.choices && !m.done))
      reduce(g, { t: 'choose', id: m.id, c: m.kind === 'bid' ? 'reject' : m.choices[0].id } as any);
    const o = reduce(g, (step ? { t: 'advance', step: 1 } : { t: 'advance' }) as any);
    assert.equal(o.ok, true, (o as any).err);
  }
}
function sane(g: any) {
  for (const id of people(g)) {
    const l = g.life.p[id];
    assert.ok(l, id + ' has a life');
    for (const k of ['hun', 'hyg', 'fun', 'soc', 'anger']) assert.ok(l[k] >= 0 && l[k] <= 100 && Number.isFinite(l[k]), `${k} ${l[k]}`);
    assert.ok(EMO[emoOf(g, id)], 'a known emotion');
    for (const q of l.q) assert.ok(QUIRKS[q], q);
  }
  for (const [k, v] of Object.entries(g.life.rel)) {
    assert.ok((v as number) >= -100 && (v as number) <= 100, `${k} ${v}`);
    const [a, b] = k.split('|');
    assert.ok(a < b);
  }
  for (const f of g.life.feed) {
    assert.ok(FEED[f.k as keyof typeof FEED], f.k);
    assert.doesNotMatch(feedText(g, f), /\{|undefined/);
  }
  assert.ok(g.life.feed.length <= 400, 'the diary does not grow for ever');
}
test('three months in the house, block by block or in one go, are the same three months', () => {
  const a = genesis(opts('backed', ['cs2', 'dota'], 'life-a')),
    b = genesis(opts('backed', ['cs2', 'dota'], 'life-a'));
  live(a, 40);
  live(b, 40);
  assert.deepEqual(a, b);
  const c = genesis(opts('backed', ['cs2', 'dota'], 'life-a'));
  live(c, 40, true);
  const strip = (g: any) => ({ ...clone(g), seq: 0 });
  assert.deepEqual(strip(c), strip(a));
  sane(a);
});
test('houses stay sane for a season, whatever the origin', () => {
  for (const [o, t, s] of [
    ['flat', ['val'], 'x1'],
    ['backed', ['cs2', 'ow'], 'x2'],
    ['fallen', ['cs2', 'val', 'dota'], 'x3'],
  ] as any) {
    const g = genesis(opts(o, t, s));
    live(g, 70);
    sane(g);
    const kinds = new Set(g.life.feed.map((f: any) => f.k));
    assert.ok(kinds.size > 4, 'life is varied: ' + [...kinds]);
  }
});
test('every incident can be met with every answer', () => {
  const base: any = genesis(opts('backed', ['cs2'], 'inc'));
  live(base, 14);
  base.life.inc = null;
  base.club.cash = 900000;
  let tried = 0;
  const seen = new Set<string>();
  for (const d of INCIDENTS) {
    const g = clone(base);
    g.life.last = {};
    // the situations that make each of them possible
    const ids = people(g);
    g.life.p[ids[0]].anger = 95;
    g.life.rel[relKey(ids[0], ids[1])] = -70;
    for (const k of ['kitchen', 'bath', 'practice', 'lounge']) g.life.mess[k] = 80;
    g.life.p[ids[0]].q = ['slob', 'loud', 'prank'];
    g.club.fans = 80000;
    let inc: any = null;
    for (let n = 0; n < 4000 && !inc; n++) {
      const r = Rng.of(d.id + n);
      const m = d.make ? d.make(g, r, 1) : {};
      if (m) inc = { id: d.id, d: g.day, b: 1, title: 'cs2', oth: Object.keys(g.teams).find(x => !x.endsWith(':me')), ...m };
    }
    if (!inc) continue;
    seen.add(d.id);
    assert.doesNotMatch(d.title(g, inc) + d.body(g, inc), /undefined|NaN/);
    for (const c of d.choices(g, inc))
      for (const n of [1, 2, 3]) {
        const h = clone(g);
        h.life.inc = clone(inc);
        h.rng = Rng.of('p' + n).s;
        const cash = h.club.cash;
        const o: any = reduce(h, { t: 'incident', c: c.id } as any);
        assert.equal(o.ok, true, `${d.id}/${c.id}: ${o.err}`);
        assert.ok(o.data.text.length > 8, `${d.id}/${c.id} says something`);
        assert.doesNotMatch(o.data.text, /undefined|NaN/);
        assert.equal(h.life.inc, null);
        if (!c.cost) assert.ok(h.club.cash >= cash - 4000, `${d.id}/${c.id} costs more than it says: ${cash - h.club.cash}`);
        sane(h);
        tried++;
      }
  }
  assert.ok(seen.size >= INCIDENTS.length - 2, `${seen.size} of ${INCIDENTS.length} tried`);
  assert.ok(tried > 120, String(tried));
});
test('an incident stops the clock, and only a listed answer starts it again', () => {
  const g: any = genesis(opts('backed', ['cs2'], 'stop'));
  g.life.inc = { id: 'power', d: 0, b: 1 };
  assert.equal(reduce(g, { t: 'advance' } as any).ok, false);
  assert.equal(reduce(g, { t: 'incident', c: 'nonsense' } as any).ok, false);
  g.club.cash = 10;
  assert.equal(reduce(g, { t: 'incident', c: 'call' } as any).ok, false, 'cannot pay');
  assert.equal(reduce(g, { t: 'incident', c: 'gen' } as any).ok, false, 'no generator in the building');
  assert.equal(reduce(g, { t: 'incident', c: 'wait' } as any).ok, true);
  assert.equal(reduce(g, { t: 'incident', c: 'wait' } as any).ok, false, 'once');
});
test('things do happen, but not all the time', () => {
  let n = 0,
    days = 0;
  for (const s of ['r1', 'r2', 'r3', 'r4']) {
    const g: any = genesis(opts('backed', ['cs2'], s));
    let guard = 0;
    while (g.day < 60 && guard++ < 4000) {
      if (g.life.inc) n++;
      if (settleIncident(g, a => reduce(g, a))) continue;
      const f = myToday(g);
      if (f) reduce(g, { t: 'delegate', fid: f.id } as any);
      else {
        for (const m of g.inbox.filter((m: any) => m.choices && !m.done))
          reduce(g, { t: 'choose', id: m.id, c: m.kind === 'bid' ? 'reject' : m.choices[0].id } as any);
        if (!reduce(g, { t: 'advance' } as any).ok) break;
      }
    }
    days += g.day;
  }
  const per = n / days;
  assert.ok(per > 0.06 && per < 0.35, `${per.toFixed(3)} incidents a day`);
});
test('a match morning with somebody furious may end with a locked door', () => {
  const g: any = genesis(opts('backed', ['cs2'], 'door'));
  live(g, 8);
  const id = g.squads.cs2.lineup[0];
  g.life.p[id].anger = 97;
  g.life.last = {};
  let hit = 0;
  for (let n = 0; n < 200; n++) {
    const h = clone(g);
    const i = rollIncident(h, Rng.of('q' + n), 'match', 0, 'cs2', 'x');
    if (i?.id === 'refuse') {
      hit++;
      assert.equal(i.who, id);
    }
  }
  assert.ok(hit > 5, String(hit));
  void INC;
});
test('looking after somebody works once a day', () => {
  const g: any = genesis(opts('backed', ['cs2'], 'care'));
  const [a, b] = g.squads.cs2.lineup;
  g.life.p[a].hun = 20;
  const cash = g.club.cash;
  assert.equal(reduce(g, { t: 'care', id: a, c: 'food' } as any).ok, true);
  assert.equal(cash - g.club.cash, 35);
  assert.ok(g.life.p[a].hun >= 70);
  assert.equal(reduce(g, { t: 'care', id: a, c: 'listen' } as any).ok, false, 'once a day');
  assert.equal(reduce(g, { t: 'care', id: b, c: 'mediate', o: a } as any).ok, false, 'they get along');
  assert.equal(reduce(g, { t: 'care', id: b, c: 'bribe' } as any).ok, false);
  assert.equal(reduce(g, { t: 'care', id: 'nobody', c: 'listen' } as any).ok, false);
  g.life.rel[relKey(a, b)] = -50;
  live(g, 1);
  const before = rel(g, a, b);
  assert.equal(reduce(g, { t: 'care', id: b, c: 'mediate', o: a } as any).ok, true);
  assert.notEqual(rel(g, a, b), before);
});
test('house rules and food', () => {
  const g: any = genesis(opts('backed', ['cs2'], 'rules'));
  assert.equal(reduce(g, { t: 'house', rules: { meals: 3, rota: true, hygiene: true, quiet: true, curfew: true } } as any).ok, false);
  assert.equal(reduce(g, { t: 'house', rules: { meals: 2, rota: 'yes', hygiene: true, quiet: true, curfew: true } } as any).ok, false);
  assert.equal(reduce(g, { t: 'house', rules: { meals: 2, rota: true, hygiene: true, quiet: false, curfew: false } } as any).ok, true);
  const plain: any = genesis(opts('backed', ['cs2'], 'rules'));
  live(g, 21);
  live(plain, 21);
  const hun = (x: any) => people(x).reduce((s: number, id: string) => s + x.life.p[id].hun, 0) / people(x).length;
  assert.ok(hun(g) > hun(plain), `catered ${hun(g).toFixed(0)} against ${hun(plain).toFixed(0)}`);
  assert.ok((g.week['Food'] ?? 0) <= 0);
});
test('desks: one each, swaps are clean, neighbours are near', () => {
  const g: any = genesis(opts('backed', ['cs2', 'val'], 'seats'));
  for (const t of ['cs2', 'val'] as const) {
    const D = desks(g, t);
    assert.equal(D.length, 5);
    const S = seatsOf(g, t);
    assert.equal(new Set(S).size, 5);
    const L = g.squads[t].lineup;
    assert.equal(neighbours(g, L[0]).length, 1, 'the end of the row');
    assert.equal(neighbours(g, L[2]).length, 2);
  }
  const L = g.squads.cs2.lineup;
  const S = seatsOf(g, 'cs2');
  assert.equal(reduce(g, { t: 'seat', title: 'cs2', pid: L[0], item: S[3] } as any).ok, true);
  const N = seatsOf(g, 'cs2');
  assert.equal(N[0], S[3]);
  assert.equal(N[3], S[0]);
  assert.deepEqual([N[1], N[2], N[4]], [S[1], S[2], S[4]]);
  assert.equal(deskMate(g, 'cs2', S[3]!), L[0]);
  assert.equal(reduce(g, { t: 'seat', title: 'cs2', pid: L[0], item: S[3] } as any).ok, false, 'already there');
  assert.equal(reduce(g, { t: 'seat', title: 'cs2', pid: L[0], item: desks(g, 'val')[0].id } as any).ok, false, 'another room');
  assert.equal(reduce(g, { t: 'seat', title: 'cs2', pid: 'x', item: S[1] } as any).ok, false);
  assert.equal(reduce(g, { t: 'seat', title: 'ow', pid: L[0], item: S[1] } as any).ok, false);
  // benching somebody frees the desk, and a place in the line-up still gets one
  const h = clone(g);
  h.squads.cs2.lineup[0] = null;
  assert.equal(seatsOf(h, 'cs2').filter(Boolean).length, 5);
  assert.ok(neighboursAll(g, 'cs2') >= 4);
});
test('the manager in the creator: a face is kept, nonsense is not', () => {
  const look: any = {
    skin: 4,
    hair: 9,
    hairC: 2,
    face: 1,
    eye: 2,
    brow: 1,
    nose: 1,
    mouth: 2,
    beard: 0,
    glasses: 1,
    fem: true,
    head: 1,
    r: 2,
    f: Array(22).fill(40),
    h: 'h_afro',
    ec: 3,
    o: 'jacket',
    oc: 2,
    a: 51,
  };
  const g: any = genesis({ ...opts('backed', ['cs2'], 'me'), mgr: { name: 'A', nat: 'BR', style: 'mentor', look } } as any);
  assert.deepEqual(g.mgr.look, look);
  const bad: any = { ...look, skin: 99, h: '<img>', f: [1e9, 'x'], o: 'crown', a: -3, evil: 1 };
  const b: any = genesis({ ...opts('backed', ['cs2'], 'me'), mgr: { name: 'A', nat: 'BR', style: 'mentor', look: bad } } as any);
  assert.ok(b.mgr.look.skin <= 6);
  assert.equal(b.mgr.look.h, undefined);
  assert.deepEqual(b.mgr.look.f, [0, 0]);
  assert.equal(b.mgr.look.o, 'suit');
  assert.equal(b.mgr.look.a, 33);
  assert.equal(b.mgr.look.evil, undefined);
  // the world does not depend on the face
  const n: any = genesis(opts('backed', ['cs2'], 'me'));
  assert.deepEqual(Object.keys(n.players), Object.keys(g.players));
});
