import { Engine } from '../src/gfx/engine.ts';
import { HQView } from '../src/gfx/hq.ts';
import { genesis, reduce } from '../src/game/reducer.ts';
import { layout, roomsOf } from '../src/game/build.ts';
const q = new URLSearchParams(location.search);
import { loadHumans } from '../src/gfx/human.ts';
await loadHumans();
const e = new Engine(document.getElementById('c') as any, (q.get('q') as any) ?? undefined);
e.auto = false;
e.resize(innerWidth, innerHeight);
const or = q.get('o') ?? 'backed';
const g = genesis({
  seed: 'hq',
  mgr: { name: 'Test', nat: 'DK', style: 'mentor' },
  club: {
    name: 'Test Club',
    tag: 'TST',
    c1: '#1f8f86',
    c2: '#f2b441',
    c3: '#ffffff',
    crest: {} as any,
    jersey: { c1: '#1f8f86', c2: '#f2b441', c3: '#fff', sleeve: 'second' } as any,
    region: 'EU',
    city: 'x',
    motto: '',
  },
  origin: or,
  titles: (q.get('t') ?? 'cs2').split(',') as any,
  t0: '',
});
g.club.cash = 9e6;
g.site = +(q.get('site') ?? g.site);
const lv = +(q.get('lvl') ?? 1);
if (q.get('full')) {
  const ts = Object.keys(g.squads) as any[];
  g.hq = layout(g.site, [
    ...ts.map(title => ({ type: 'practice' as const, title, lvl: lv })),
    ...(['gym', 'wellness', 'kitchen', 'lounge', 'stream', 'workshop', 'office', 'medical', 'dorm', 'trophy', 'strategy'] as const).map(
      type => ({ type, lvl: lv }),
    ),
  ]);
  g.rooms = roomsOf(g.hq);
  for (const s of ['coach', 'chef', 'psych', 'trainer', 'tech', 'scout', 'content', 'therapist', 'analyst', 'partner']) {
    const c = g.pool.find(p => p.role === s);
    if (c) reduce(g, { t: 'hire', id: c.id, title: Object.keys(g.squads)[0] });
  }
  g.trophies = [1, 2, 3].map(() => ({ day: 0, title: 'cs2', name: 'x' })) as any;
}
const v = new HQView(e);
v.auto = false;
v.sync(g);
const b = +(q.get('b') ?? 0);
v.setBlock(b);
(v as any).tod = v.todTarget;
v.warp();
if (q.get('yaw')) v.yaw = +q.get('yaw')!;
if (q.get('f')) {
  v.focusRoom(q.get('f'));
}
e.setView(v);
(window as any).v = v;
(window as any).fps = () => e.fps + ' ' + e.q + ' tris ' + e.r.info.render.triangles;
(window as any).e = e;
const still = +(q.get('still') ?? 0);
if (still) setTimeout(() => (e.paused = true), still * 1000);
