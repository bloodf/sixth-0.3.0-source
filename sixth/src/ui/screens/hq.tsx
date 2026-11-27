import { act, app, bump, G_, go, tShort, useApp } from '../store.ts';
import { $, ask, B, Bar, Gi, PFace, Plate, SFace, Six, Tabs, TI, UI, useEffect, useState, useTitle, TitleTabs } from '../kit.tsx';
import { ROOMS, ROOM_TYPES, SITES, STAFF, STAFF_ROLES, GEAR, GEAR_SLOTS, type GearSlot, type StaffRole } from '../../data/club.ts';
import { NEEDS } from '../../data/furniture.ts';
import { Draft, size, status, type RoomStatus } from '../../game/build.ts';
import { deskMate, desks, neighbours, seatsOf } from '../../game/seats.ts';
import { rel } from '../../game/life.ts';
import { stationQ, gearQ } from '../../game/match.ts';
import type { Staff, TitleId } from '../../game/types.ts';
import { audio } from '../../audio/audio.ts';
import { NATION } from '../../data/names.ts';
import { practiceFor } from '../../game/day.ts';
import { Lv, openEditor } from './build.tsx';
const rentOf = (site: number, w: number, h: number) => {
  const S = SITES[site];
  return S.rent + Math.round(Math.max(0, w * h - S.w * S.h) * S.landRent);
};
export function HQSheet() {
  const a = useApp();
  const g = G_();
  const [tab, setTab] = useState<string>(a.arg?.tab ?? 'rooms');
  useEffect(() => {
    if (a.arg?.tab) setTab(a.arg.tab === 'build' ? 'rooms' : a.arg.tab);
    if (a.arg?.room) setTab('rooms');
  }, [a.arg]);
  const st = status(new Draft(g.hq));
  const sel = a.arg?.room ? st.find(x => x.zone.id === a.arg.room) : null;
  const ts = Object.keys(g.squads) as TitleId[];
  const missing = ROOM_TYPES.flatMap((t): { t: (typeof ROOM_TYPES)[number]; title?: TitleId }[] =>
    t === 'practice' ? ts.filter(x => !practiceFor(g, x)).map(x => ({ t, title: x })) : g.rooms.some(r => r.type === t) ? [] : [{ t }],
  );
  return (
    <>
      <Plate title="Headquarters">
        <span class="sm" style={{ fontWeight: 650 }}>
          {SITES[g.site].name}, {$(rentOf(g.site, g.hq.w, g.hq.h))} a week
        </span>
      </Plate>
      <Tabs
        v={tab}
        set={t => {
          setTab(t);
          app.arg = null;
          app.hq?.focusRoom(t === 'gear' || t === 'seats' ? 'practice' : null, app.title ?? undefined);
          bump();
        }}
        items={[
          ['rooms', 'Rooms'],
          ['seats', 'Seating'],
          ['gear', 'Equipment'],
          ['site', 'Location'],
        ]}
      />
      {tab === 'seats' ? (
        <Seating />
      ) : tab === 'gear' ? (
        <Gear />
      ) : (
        <div class="body">
          {tab === 'rooms' && (
            <>
              <button class="p edopen" onClick={() => openEditor()}>
                {UI('hammer', 30)}
                <span class="grow">
                  <b>Open the house editor</b>
                  <span class="sm sec">Draw rooms, move walls, buy land, furnish. Nothing is spent until you build.</span>
                </span>
                {UI('chevron-right', 22)}
              </button>
              {sel && <RoomCard s={sel} />}
              <h2>{sel ? 'All rooms' : 'Rooms'}</h2>
              <div class="col" style={{ gap: 6 }}>
                {st.map(x => (
                  <button
                    class={'p row ' + (x === sel ? 'sel' : '')}
                    key={x.zone.id}
                    onClick={() => {
                      audio.play('tap');
                      app.arg = { room: x.zone.id };
                      app.hq?.focusRoom(x.zone.id);
                      bump();
                    }}
                  >
                    <span class="sec">{UI(ROOMS[x.zone.type].icon, 22)}</span>
                    <span class="grow">
                      <b>
                        {ROOMS[x.zone.type].name}
                        {x.zone.title ? `, ${tShort(x.zone.title)}` : ''}
                      </b>
                      <span class={'sm ' + (x.lvl ? 'mut' : 'neg')} style={{ display: 'block' }}>
                        {x.lvl ? ROOMS[x.zone.type].fx[x.lvl - 1] : x.problems[0]}
                      </span>
                    </span>
                    {x.lvl > 0 && x.lvl < 3 && (
                      <span class="xs mut num">
                        {x.points} / {x.next}
                      </span>
                    )}
                    <Lv n={x.lvl} />
                  </button>
                ))}
              </div>
              {missing.length > 0 && (
                <>
                  <h2>Not here yet</h2>
                  <div class="g2">
                    {missing.map(({ t, title }) => (
                      <div class="p row" key={t + (title ?? '')} style={{ alignItems: 'flex-start' }}>
                        <span class="sec">{UI(ROOMS[t].icon, 22)}</span>
                        <span class="grow">
                          <b>
                            {ROOMS[t].name}
                            {title ? `, ${tShort(title)}` : ''}
                          </b>
                          <span class="sm sec" style={{ display: 'block' }}>
                            {ROOMS[t].desc}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === 'site' && (
            <div class="col">
              {SITES.map((s, i) => (
                <div class={'p ' + (i === g.site ? 'sel' : '')} key={s.name}>
                  <div class="row sb">
                    <h3>{s.name}</h3>
                    <span class="chip">
                      {s.w} × {s.h} m, up to {s.mw} × {s.mh}
                    </span>
                  </div>
                  <p class="sec sm" style={{ margin: '4px 0 10px' }}>
                    {s.desc}
                  </p>
                  <div class="row w">
                    <span class="chip">Rent {$(s.rent)} a week</span>
                    <span class="chip">Deposit {$(s.deposit)}</span>
                    <span class="chip">Extra land {$(s.land)} a tile</span>
                    <div class="grow" />
                    {i === g.site ? (
                      <span class="chip g">
                        You are here, {g.hq.w} × {g.hq.h}
                      </span>
                    ) : (
                      <B
                        k={i > g.site ? 'p s' : 's'}
                        onClick={() =>
                          ask(
                            `Move to the ${s.name.toLowerCase()}?`,
                            i > g.site
                              ? `Deposit ${$(s.deposit)}, rent ${$(s.rent)} a week. The whole building comes with you, with more land around it.`
                              : `Cheaper, with less land. Your ${g.hq.w} by ${g.hq.h} plot must fit into ${s.mw} by ${s.mh}.`,
                            'Move',
                            () => act({ t: 'site', n: i }),
                          )
                        }
                      >
                        Move here
                      </B>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
function RoomCard({ s }: { s: RoomStatus }) {
  const g = G_();
  const r = s.zone;
  const d = ROOMS[r.type];
  const staff = g.staff.filter(x => STAFF[x.role].room === r.type && (!r.title || !x.title || x.title === r.title));
  const need = STAFF_ROLES.filter(x => STAFF[x].room === r.type);
  const n = NEEDS[r.type];
  const to = s.lvl >= 2 ? n.p3 : n.p2;
  return (
    <div class="p col" style={{ marginTop: 10 }}>
      <div class="row">
        <span>{UI(d.icon, 28)}</span>
        <div class="grow">
          <h3>
            {d.name}
            {r.title ? `, ${tShort(r.title)}` : ''}
          </h3>
          <span class="sec sm">{d.desc}</span>
        </div>
        <Lv n={s.lvl} />
      </div>
      <div class="g3">
        {d.fx.map((f, i) => (
          <div key={f} class="sm" style={{ color: i + 1 === s.lvl ? 'var(--t1)' : 'var(--t3)', fontWeight: i + 1 === s.lvl ? 700 : 500 }}>
            Level {i + 1}: {f}
          </div>
        ))}
      </div>
      {s.problems.length > 0 && (
        <div class="row w">
          {s.problems.map(p => (
            <span class="chip r" key={p}>
              {p}
            </span>
          ))}
        </div>
      )}
      {s.lvl > 0 && s.lvl < 3 && (
        <div class="row sm">
          <span class="sec">
            {s.points} of {to} points to level {s.lvl + 1}
          </span>
          <div class="grow">
            <Bar v={(s.points / to) * 100} />
          </div>
        </div>
      )}
      {need.length > 0 && (
        <div class="row w sm">
          {staff.map(x => (
            <span class="chip g" key={x.id}>
              {x.name}, {STAFF[x.role].name.toLowerCase()}
            </span>
          ))}
          {need
            .filter(q => !staff.some(x => x.role === q))
            .map(q => (
              <button class="chip a" key={q} onClick={() => go('staff', { role: q })}>
                no {STAFF[q].name.toLowerCase()}
              </button>
            ))}
        </div>
      )}
      <div class="row w">
        <B k="p" onClick={() => openEditor(r.id)}>
          {UI('hammer', 17)}Edit this room
        </B>
        {r.type === 'practice' && (
          <B
            onClick={() => {
              app.title = r.title!;
              go('hq', { tab: 'gear' });
            }}
          >
            Equipment
          </B>
        )}
        {r.type === 'practice' && (
          <B
            onClick={() => {
              app.title = r.title!;
              go('hq', { tab: 'seats' });
            }}
          >
            Seating
          </B>
        )}
        <span class="grow" />
        <span class="sm mut">Upkeep {$(Math.round(d.upkeep * (0.7 + s.lvl * 0.3)))} a week</span>
      </div>
    </div>
  );
}
function Gear() {
  const g = G_();
  const [t] = useTitle();
  const sq = g.squads[t]!;
  const [st, setSt] = useState(-1);
  const [slot, setSlot] = useState<GearSlot>('rig');
  const names: Record<GearSlot, string> = {
    rig: 'PC or console',
    monitor: 'Monitor',
    mouse: 'Mouse',
    keyboard: 'Keyboard',
    headset: 'Headset',
    chair: 'Chair',
  };
  const ic: Record<GearSlot, string> = {
    rig: 'pc-case',
    monitor: 'monitor',
    mouse: 'mouse',
    keyboard: 'keyboard',
    headset: 'headphones',
    chair: 'armchair',
  };
  void [UI('pc-case'), UI('monitor'), UI('mouse'), UI('keyboard'), UI('headphones'), UI('armchair')];
  const fx: Record<GearSlot, string> = {
    rig: 'Frame rate: mechanics and reaction',
    monitor: 'Refresh: reaction and mechanics',
    mouse: 'Precision: mechanics',
    keyboard: 'Response: utility',
    headset: 'Clarity: comms',
    chair: 'Support: stamina and focus',
  };
  const worn = Math.round(100 - sq.stations.reduce((s, x) => s + GEAR_SLOTS.reduce((q, k) => q + x.c[k], 0) / 6, 0) / 5);
  return (
    <>
      <TitleTabs
        right={
          <div class="row" style={{ paddingRight: 6 }}>
            <span class="sm mut">Wear {worn}%</span>
            <B k="s" onClick={() => act({ t: 'service', title: t })}>
              Service all
            </B>
          </div>
        }
      />
      <div class="body">
        <div class="desk">
          {sq.stations.map((s, i) => {
            const p = sq.lineup[i] ? g.players[sq.lineup[i]!] : null;
            return (
              <button
                class={'p col ' + (st === i ? 'sel' : '')}
                style={{ gap: 6 }}
                key={i}
                onClick={() => {
                  audio.play('tap');
                  setSt(st === i ? -1 : i);
                }}
              >
                <div class="row sb">
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p?.nick ?? 'Station ' + (i + 1)}</b>
                  <Six v={stationQ(s)} s />
                </div>
                {GEAR_SLOTS.map(k => (
                  <div class="row" key={k} style={{ gap: 6 }}>
                    <span class="sec">{UI(ic[k], 15)}</span>
                    <span class="xs grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {GEAR[k][s.m[k]].name}
                    </span>
                    <Bar v={s.c[k]} w={26} />
                  </div>
                ))}
              </button>
            );
          })}
        </div>
        <div class="row w" style={{ margin: '16px 0 10px' }}>
          {GEAR_SLOTS.map(k => (
            <B k={'s ' + (slot === k ? 'on' : '')} key={k} onClick={() => setSlot(k)}>
              {UI(ic[k], 16)}
              {names[k]}
            </B>
          ))}
        </div>
        <p class="sm sec" style={{ marginBottom: 10 }}>
          {fx[slot]}. Buying for {st < 0 ? 'all five stations' : (sq.lineup[st] && g.players[sq.lineup[st]!]?.nick) || `station ${st + 1}`};
          old parts are traded in.
        </p>
        <div class="gear">
          {GEAR[slot].map((it, m) => {
            const L = st < 0 ? [0, 1, 2, 3, 4] : [st];
            const todo = L.filter(i => sq.stations[i].m[slot] !== m);
            const cost = todo.reduce(
              (s, i) => s + it.price - Math.round((GEAR[slot][sq.stations[i].m[slot]].price * 0.4 * sq.stations[i].c[slot]) / 100),
              0,
            );
            return (
              <div class="p col" style={{ gap: 6 }} key={it.name}>
                <div class="row sb">
                  <b>{it.name}</b>
                  <Six v={it.q} s />
                </div>
                <span class="xs mut">
                  {it.brand}. {it.spec}
                </span>
                <div class="row" style={{ marginTop: 'auto' }}>
                  <b class="num grow">{it.price ? $(it.price) : 'Free'}</b>
                  {todo.length ? (
                    <B
                      k="s"
                      disabled={cost > g.club.cash}
                      onClick={() => act(st < 0 ? { t: 'gear', title: t, slot, m, all: 1 } : { t: 'gear', title: t, slot, m, i: st })}
                    >
                      {cost >= 0 ? $(cost) : '+' + $(-cost)}
                    </B>
                  ) : (
                    <span class="chip g">Fitted</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
/** the practice room from above: click somebody, then a desk */
function Seating() {
  const g = G_();
  const [t] = useTitle();
  const sq = g.squads[t]!;
  const D = desks(g, t);
  const S = seatsOf(g, t);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [t]);
  if (!D.length)
    return (
      <>
        <TitleTabs />
        <div class="body">
          <p class="sec">No desks in this practice room yet.</p>
          <B k="p" onClick={() => openEditor(g.rooms.find(r => r.type === 'practice' && r.title === t)?.id)}>
            {UI('hammer', 17)}Build some
          </B>
        </div>
      </>
    );
  const box = D.map(i => {
    const [w, h] = size(i);
    return { i, x: i.x + w / 2, y: i.y + h / 2 };
  });
  const x0 = Math.min(...box.map(b => b.x)),
    x1 = Math.max(...box.map(b => b.x)),
    y0 = Math.min(...box.map(b => b.y)),
    y1 = Math.max(...box.map(b => b.y));
  const C = 112;
  const k = Math.max(40, Math.min(46, (740 - C) / Math.max(1, x1 - x0)));
  const W = (x1 - x0) * k + C,
    H = (y1 - y0) * k + C + 34;
  const pairs: { a: string; b: string; p: (typeof box)[0]; q: (typeof box)[0]; v: number }[] = [];
  box.forEach((p, n) =>
    box.slice(n + 1).forEach(q => {
      const a = deskMate(g, t, p.i.id),
        b = deskMate(g, t, q.i.id);
      if (a && b && neighbours(g, a).includes(b)) pairs.push({ a, b, p, q, v: rel(g, a, b) });
    }),
  );
  const click = (item: string) => {
    const who = deskMate(g, t, item);
    audio.play('tap');
    if (sel) {
      if (sel !== who) act({ t: 'seat', title: t, pid: sel, item });
      setSel(null);
    } else if (who) setSel(who);
  };
  return (
    <>
      <TitleTabs />
      <div class="body">
        <p class="sec" style={{ maxWidth: '64ch' }}>
          {sel ? (
            <>
              Now pick a desk for <b>{g.players[sel].nick}</b>.
            </>
          ) : (
            'Pick somebody, then a desk. At the desks people mostly talk to whoever is an elbow away, for better or worse.'
          )}
        </p>
        <div class="seatroom" style={{ overflow: 'auto' }}>
          <div class="seats" style={{ width: W, height: H }}>
            <svg width={W} height={H} aria-hidden="true">
              {pairs.map(o => (
                <line
                  key={o.a + o.b}
                  x1={(o.p.x - x0) * k + C / 2}
                  y1={(o.p.y - y0) * k + C / 2}
                  x2={(o.q.x - x0) * k + C / 2}
                  y2={(o.q.y - y0) * k + C / 2}
                  stroke={o.v > 8 ? 'var(--win)' : o.v < -8 ? 'var(--loss)' : 'var(--line2)'}
                  stroke-width={o.v > 30 || o.v < -30 ? 7 : 4}
                />
              ))}
            </svg>
            {box.map(({ i, x, y }) => {
              const who = deskMate(g, t, i.id);
              const p = who ? g.players[who] : null;
              return (
                <button
                  key={i.id}
                  class={'seat ' + (who && who === sel ? 'on' : '')}
                  style={{ left: (x - x0) * k, top: (y - y0) * k, width: C }}
                  onClick={() => click(i.id)}
                >
                  {p ? <PFace p={p} s={C - 16} /> : <span class="none">{UI('monitor', 34)}</span>}
                  <b>{p ? p.nick : 'Free'}</b>
                </button>
              );
            })}
          </div>
        </div>
        {S.some((s, i) => !s && sq.lineup[i]) && <p class="neg">Somebody has no desk. Build another one.</p>}
        <div class="ties2">
          {pairs
            .filter(o => Math.abs(o.v) > 8)
            .sort((a, b) => a.v - b.v)
            .map(o => (
              <span key={o.a + o.b} class={o.v > 0 ? 'pos' : 'neg'}>
                {g.players[o.a].nick} and {g.players[o.b].nick}{' '}
                {o.v > 50
                  ? 'are inseparable'
                  : o.v > 20
                    ? 'are friends'
                    : o.v > 0
                      ? 'get along'
                      : o.v > -30
                        ? 'are tense'
                        : 'cannot stand each other'}
                .
              </span>
            ))}
        </div>
        <B onClick={() => openEditor(g.rooms.find(r => r.type === 'practice' && r.title === t)?.id)}>
          {UI('move', 17)}Move the desks themselves
        </B>
      </div>
    </>
  );
}
export function StaffSheet() {
  const a = useApp();
  const g = G_();
  const [tab, setTab] = useState<string>(a.arg?.role ? 'hire' : 'team');
  const [role, setRole] = useState<StaffRole | 'all'>(a.arg?.role ?? 'all');
  useEffect(() => {
    if (a.arg?.role) {
      setTab('hire');
      setRole(a.arg.role);
    }
  }, [a.arg]);
  const [ct] = useTitle();
  const hasRoom = (r: StaffRole) => g.rooms.some(x => x.type === STAFF[r].room);
  const Card = ({ s, hire }: { s: Staff; hire?: boolean }) => (
    <article class="hand">
      <button
        class="hface"
        disabled={hire}
        aria-label={s.name}
        onClick={() => {
          app.player = s.id;
          bump();
        }}
      >
        <SFace st={s} s="100%" h={164} px={200} />
        <span class="ov">{s.skill}</span>
      </button>
      <div class="hin">
        <b class="hn">{s.name}</b>
        <span class="sm sec">
          {STAFF[s.role].name}
          {s.title ? `, ${tShort(s.title)}` : ''}
        </span>
        <span class="sm mut">
          {s.age}, {NATION[s.nat].name}. {s.trait}. {STAFF[s.role].fx}.
        </span>
        {!hasRoom(s.role) && <span class="sm warn">Needs a {ROOMS[STAFF[s.role].room].name.toLowerCase()} to work fully.</span>}
        <span class="hft">
          <span class="num">
            {$(s.salary)} <small>a week</small>
          </span>
          {hire ? (
            <B k="p s" onClick={() => act({ t: 'hire', id: s.id, title: STAFF[s.role].perTitle ? ct : undefined })}>
              Hire{STAFF[s.role].perTitle && Object.keys(g.squads).length > 1 ? ` for ${tShort(ct)}` : ''}
            </B>
          ) : (
            <B
              k="s d"
              onClick={() =>
                ask(
                  `Let ${s.name} go?`,
                  `Three weeks of severance: ${$(s.salary * 3)}.`,
                  'Let go',
                  () => act({ t: 'fire', id: s.id }),
                  true,
                )
              }
            >
              Let go
            </B>
          )}
        </span>
      </div>
    </article>
  );
  return (
    <>
      <Plate title="Staff">
        <span class="sm" style={{ fontWeight: 650 }}>
          {$(g.staff.reduce((s, x) => s + x.salary, 0))} a week
        </span>
      </Plate>
      <Tabs
        v={tab}
        set={setTab}
        items={[
          ['team', `Employed (${g.staff.length})`],
          ['hire', 'Hire'],
        ]}
      />
      <div class="body">
        {tab === 'team' ? (
          <div class="col">
            <div class="hands">
              {g.staff.map(s => (
                <Card s={s} key={s.id} />
              ))}
            </div>
            <h2>{g.staff.length ? 'Open roles' : 'Nobody works here yet'}</h2>
            <div class="g2">
              {STAFF_ROLES.filter(r => g.staff.filter(s => s.role === r).length < (r === 'coach' ? Object.keys(g.squads).length : 1)).map(
                r => (
                  <button
                    class="p"
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setTab('hire');
                    }}
                  >
                    <div class="row sb">
                      <h3>{STAFF[r].name}</h3>
                      {UI('chevron-right', 18)}
                    </div>
                    <p class="sm sec">{STAFF[r].desc}</p>
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          <div class="col">
            <div class="opts">
              <B k={'s ' + (role === 'all' ? 'on' : '')} onClick={() => setRole('all')}>
                All
              </B>
              {STAFF_ROLES.map(r => (
                <B k={'s ' + (role === r ? 'on' : '')} key={r} onClick={() => setRole(r)}>
                  {STAFF[r].name}
                </B>
              ))}
            </div>
            {(role === 'all' || STAFF[role as StaffRole].perTitle) && Object.keys(g.squads).length > 1 && (
              <div class="row sm sec">
                Coaches are hired for <TitlePick />
              </div>
            )}
            <div class="hands">
              {g.pool
                .filter(s => role === 'all' || s.role === role)
                .sort((x, y) => y.skill - x.skill)
                .map(s => (
                  <Card s={s} hire key={s.id} />
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
const TitlePick = () => {
  const [t, ts] = useTitle();
  return (
    <div class="opts">
      {ts.map(x => (
        <B
          k={'s ' + (x === t ? 'on' : '')}
          key={x}
          onClick={() => {
            app.title = x;
            bump();
          }}
        >
          <Gi k={TI[x]} s={15} />
          {tShort(x)}
        </B>
      ))}
    </div>
  );
};
export { gearQ };
