import {
  act,
  app,
  bump,
  endMatchView,
  G_,
  go,
  leaveCareer,
  nextDay,
  skipAhead,
  startMatch,
  toast,
  tName,
  tShort,
  useApp,
  type Sheet,
} from '../store.ts';
import {
  $,
  ask,
  B,
  Bar,
  Cond,
  CrestI,
  Face,
  fog,
  Form,
  Gi,
  know,
  Modal,
  N,
  Num,
  ovr,
  PFace,
  SFace,
  Plate,
  RoleName,
  Six,
  TeamCrest,
  TI,
  UI,
  useEffect,
  useState,
  vis,
} from '../kit.tsx';
import { dow, money, wagesWeek } from '../../game/day.ts';
import { isMe, meId, myNext, myToday, sorted, strength, todays, expected, won } from '../../game/league.ts';
import { mine } from '../../game/events.ts';
import type { Fixture, G, MatchRec, Msg, Player, Staff, TitleId } from '../../game/types.ts';
import { ATTRS, ATTR_INFO, TITLE, TITLES } from '../../data/titles.ts';
import { TRAITS, BLOCKS, ORIGINS } from '../../data/club.ts';
import { askFor, feeFor, interest } from '../../game/reducer.ts';
import { valueFor, wageFor, DIV_NAME } from '../../game/gen.ts';
import { squadReady } from '../../game/match.ts';
import { heroName, heroIcon } from '../../data/heroes.ts';
import { MAP_META } from '../../sim/maps.ts';
import { NATION } from '../../data/names.ts';
import { audio } from '../../audio/audio.ts';
import { AnyFace, FeedList, LifePane } from './life.tsx';
import { openEditor } from './build.tsx';
import { emoOf, nameOf, people } from '../../game/life.ts';
import { EMO } from '../../data/life.ts';
import { STAFF } from '../../data/club.ts';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dateOf = (d: number) => new Date(Date.UTC(2027, 0, 4 + d));
export const fmtDay = (d: number) => {
  const x = dateOf(d);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};
export const fmtShort = (d: number) => {
  const x = dateOf(d);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
};
const NAV: [Exclude<Sheet, null>, string, string][] = [
  ['inbox', 'Inbox', 'inbox'],
  ['squad', 'Squad', 'users'],
  ['training', 'Training', 'calendar-days'],
  ['tactics', 'Tactics', 'map'],
  ['staff', 'Staff', 'id-card'],
  ['house', 'House', 'heart'],
  ['hq', 'HQ', 'building'],
  ['market', 'Market', 'search'],
  ['league', 'Leagues', 'trophy'],
  ['club', 'Club', 'wallet'],
  ['online', 'Online', 'globe'],
];
void [
  UI('inbox'),
  UI('users'),
  UI('calendar-days'),
  UI('map'),
  UI('id-card'),
  UI('building'),
  UI('heart'),
  UI('search'),
  UI('trophy'),
  UI('wallet'),
  UI('globe'),
];
const fixLabel = (f: Fixture) =>
  (f.comp === 'masters' ? 'World Masters' : f.comp === 'playoff' ? DIV_NAME[f.div] + ' playoffs' : DIV_NAME[f.div]) +
  ', ' +
  f.stage.toLowerCase();
export function Top() {
  useApp();
  const g = G_();
  const d = dow(g.day);
  const w = wagesWeek(g);
  const out = w.players + w.staff + w.rent + w.upkeep + w.loan + w.travel + w.food;
  const unread = g.inbox.filter(m => !m.read).length;
  void unread;
  return (
    <header class="top">
      <button class="club" onClick={() => go(null)} aria-label="Home">
        <CrestI c={g.club.crest} s={38} />
        <span style={{ textAlign: 'left' }}>
          <b>{g.club.name}</b>
          <small>
            {g.mgr.name}
            {app.career && !app.career.ranked ? ', unranked' : ''}
          </small>
        </span>
      </button>
      <div class="cal">
        <div class="now">
          <b>{['Morning', 'Afternoon', 'Evening'][Math.min(2, g.life.block)]}</b>
          <span>{fmtDay(g.day)}</span>
        </div>
        {WD.map((n, i) => {
          const day = g.day - d + i;
          const m = Object.values(g.seasons).some(s => s!.fixtures.some(f => f.day === day && (isMe(f.home) || isMe(f.away))));
          return (
            <div class={'day ' + (i === d ? 'today ' : i < d ? 'past ' : '') + (m ? 'm' : '')} key={n} title={m ? 'Match day' : ''}>
              {n}
              <b>{fmtShort(day).split(' ')[0]}</b>
              {i === d && <i class="prog" style={{ width: (g.life.block / 3) * 100 + '%' }} />}
            </div>
          );
        })}
      </div>
      <div class="kv opt">
        <b>{N(g.club.fans)}</b>
        <span>fans</span>
      </div>
      <div class="kv opt">
        <b>{Math.round(g.club.rep)}</b>
        <span>reputation</span>
      </div>
      <div class="kv">
        <b class={g.club.cash < 0 ? 'neg' : ''}>{$(g.club.cash, true)}</b>
        <span>{g.club.cash >= 0 && out > 0 ? `${Math.floor(g.club.cash / out)} wks of costs` : 'overdrawn'}</span>
      </div>
      <button
        class="ib"
        aria-label="Settings"
        onClick={() => {
          app.settings = true;
          bump();
        }}
      >
        {UI('settings', 20)}
      </button>
    </header>
  );
}
export function Dock() {
  const a = useApp();
  const g = G_();
  const f = myToday(g);
  const unread = g.inbox.filter(m => !m.read || (m.choices && !m.done)).length;
  const opp = f ? g.teams[isMe(f.home) ? f.away : f.home] : null;
  const und = g.inbox.find(m => m.kind === 'event' && !m.done);
  return (
    <footer class="dock">
      <nav>
        {NAV.map(([k, l, i]) => (
          <button key={k} class={a.sheet === k ? 'on' : ''} onClick={() => go(k)}>
            {UI(i, 20)}
            {l}
            {k === 'inbox' && unread > 0 && (
              <span class="dot" style={{ right: '24%', top: 6 }}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div class="cont">
        <button
          class="go"
          disabled={!!a.timelapse || !!g.over}
          onClick={() => {
            audio.play('confirm', { vol: 0.4 });
            g.live ? resumeLive() : nextDay();
          }}
        >
          <b>{g.life.inc ? 'Trouble' : g.live ? 'Resume match' : f ? 'Match day' : 'Continue'}</b>
          <span>
            {g.life.inc
              ? 'The house needs you'
              : g.live
                ? 'Your team is on stage'
                : f
                  ? `${tShort(f.title)} v ${opp!.name}`
                  : und
                    ? 'A decision is waiting'
                    : g.life.block > 0
                      ? 'the ' + ['morning', 'afternoon', 'evening'][g.life.block]
                      : 'to ' + WD[dow(g.day + 1)] + ' ' + fmtShort(g.day + 1)}
          </span>
        </button>
        {!f && !g.live && !g.life.inc && (
          <button
            class="sk"
            aria-label="Skip to the next event"
            title="Skip to the next event"
            disabled={!!a.timelapse || !!g.over}
            onClick={() => skipAhead()}
          >
            {UI('fast-forward', 22)}
          </button>
        )}
      </div>
    </footer>
  );
}
export function resumeLive() {
  const g = G_();
  const L = g.live!;
  startMatch({ cfg: L.cfg, us: L.us, kind: 'career', orders: L.orders, title: tName(L.cfg.title), sub: 'Game ' + (L.game + 1) });
}
export function Home() {
  const a = useApp();
  const g = G_();
  const n = myNext(g);
  const dec = g.inbox.filter(m => m.choices && !m.done).slice(0, 2);
  const low = mine(g)
    .filter(p => p.energy < 42 || p.stress > 68 || p.injury > 0)
    .slice(0, 3);
  const d = dow(g.day);
  const exp = mine(g)
    .filter(p => p.contract && p.contract.until - g.day < 28)
    .slice(0, 2);
  const offers = g.deals.filter(x => !x.signed).length;
  const H = n && g.teams[n.home],
    A = n && g.teams[n.away];
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (
        app.sheet ||
        app.player ||
        app.confirm ||
        app.settings ||
        app.prematch ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '')
      )
        return;
      if (e.key.toLowerCase() === 'b') openEditor();
      if (e.key.toLowerCase() === 'h') go('house');
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);
  const mood = people(g).map(id => ({ id, e: emoOf(g, id) }));
  const hot = mood.filter(x => x.e !== 'calm' && x.e !== 'happy' && x.e !== 'excited').length;
  return (
    <>
      <div class="home">
        {n && H && A && (
          <div class="card poster">
            <div class="bgs">
              <i style={{ background: isMe(H.id) ? g.club.c1 : H.c1 }} />
              <i style={{ background: isMe(A.id) ? g.club.c1 : A.c1 }} />
            </div>
            <div class="cnt">
              <div class="row sb" style={{ alignItems: 'flex-start' }}>
                <span class="when">
                  {n.day === g.day ? 'Today' : n.day === g.day + 1 ? 'Tomorrow' : `${WD[dow(n.day)]} ${fmtShort(n.day)}`}
                </span>
                <span class="chip">
                  <Gi k={TI[n.title]} s={14} />
                  {tShort(n.title)}
                </span>
              </div>
              <div style={{ height: 14 }} />
              <Versus f={n} />
              <p class="sm sec" style={{ textAlign: 'center', marginTop: 10 }}>
                {fixLabel(n)}
                {n.bo > 1 ? `, best of ${n.bo}` : ''}
              </p>
            </div>
          </div>
        )}
        {g.day < 10 && <Checklist />}
        {dec.map(m => (
          <button
            class="card"
            key={m.id}
            style={{ textAlign: 'left', borderColor: 'rgba(255,198,26,.5)' }}
            onClick={() => go('inbox', { id: m.id })}
          >
            <div class="in row">
              <span class="am">{UI('circle-alert', 22)}</span>
              <span class="grow">
                <b style={{ display: 'block' }}>{m.title}</b>
                <span class="sm mut">{m.from}</span>
              </span>
            </div>
          </button>
        ))}
        <div class="card">
          <div class="in">
            <div class="ttl">
              Today
              <i />
            </div>
            {TITLES.filter(x => g.squads[x])
              .map(x => g.squads[x])
              .map(s => (
                <button class="row" style={{ marginTop: 8, gap: 3, width: '100%' }} key={s!.title} onClick={() => go('training')}>
                  <span class="sec" style={{ width: 44, font: '800 16px/1 var(--xc)' }}>
                    {tShort(s!.title)}
                  </span>
                  {s!.week[d].map((b, i) => (
                    <span
                      class="cell grow"
                      data-b={b}
                      key={i}
                      style={{
                        height: 26,
                        fontSize: 12.5,
                        opacity: i < g.life.block ? 0.35 : 1,
                        outline: i === g.life.block ? '1px solid var(--t1)' : 'none',
                      }}
                    >
                      {BLOCKS[b].name}
                    </span>
                  ))}
                </button>
              ))}
          </div>
        </div>
        {(low.length > 0 || exp.length > 0 || offers > 0) && (
          <div class="card">
            <div class="in col" style={{ gap: 8 }}>
              <div class="ttl">
                Watch
                <i />
              </div>
              {low.map(p => (
                <button
                  class="row"
                  key={p.id}
                  onClick={() => {
                    app.player = p.id;
                    bump();
                  }}
                >
                  <PFace p={p} s={32} />
                  <span class="grow">{p.nick}</span>
                  <Cond p={p} />
                </button>
              ))}
              {exp.map(p => (
                <button
                  class="row"
                  key={'c' + p.id}
                  onClick={() => {
                    app.player = p.id;
                    bump();
                  }}
                >
                  <PFace p={p} s={32} />
                  <span class="grow">{p.nick}</span>
                  <span class="chip a">contract {p.contract!.until - g.day}d</span>
                </button>
              ))}
              {offers > 0 && (
                <button class="row sec" onClick={() => go('club', { tab: 'sponsors' })}>
                  {UI('handshake', 18)}
                  {offers} sponsor {offers === 1 ? 'offer' : 'offers'} on the table
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div class="home rt">
        <button class="p edopen row" onClick={() => openEditor()}>
          {UI('hammer', 26)}
          <span class="grow">
            <b>Build</b>
            <span class="sm">Rooms, walls, furniture, computers</span>
          </span>
          <kbd>B</kbd>
        </button>
        <div class="card">
          <div class="in">
            <button class="ttl" style={{ width: '100%' }} onClick={() => go('house')}>
              In the house
              <i />
              <span class="sm sec" style={{ font: '650 13.5px/1 var(--body)', textTransform: 'none', letterSpacing: 0 }}>
                {hot ? `${hot} unhappy` : 'All well'}
              </span>
            </button>
            <div class="row w" style={{ gap: 3, margin: '9px 0 7px' }}>
              {mood.slice(0, 12).map(x => (
                <button
                  key={x.id}
                  title={`${nameOf(g, x.id)}: ${EMO[x.e].name.toLowerCase()}`}
                  style={{ boxShadow: `inset 0 -3px 0 ${EMO[x.e].col}`, paddingBottom: 3 }}
                  onClick={() => {
                    app.player = x.id;
                    bump();
                  }}
                >
                  <AnyFace id={x.id} s={38} />
                </button>
              ))}
            </div>
            <FeedList n={innerHeight < 780 ? 4 : 6} />
          </div>
        </div>
      </div>
    </>
  );
  void a;
}
function Checklist() {
  const g = G_();
  const ts = TITLES.filter(x => g.squads[x]);
  const L: [string, boolean, () => void][] = [
    ['Sign a shirt sponsor', g.deals.some(d => d.signed && d.slot === 'front'), () => go('club', { tab: 'sponsors' })],
    ['Hire a head coach', g.staff.some(s => s.role === 'coach'), () => go('staff', { role: 'coach' })],
    [
      'Fit better equipment',
      ts.every(t => g.squads[t]!.stations.every(s => Object.values(s.m).every(m => m > 0))),
      () => go('hq', { tab: 'gear' }),
    ],
    [
      'Build one more room',
      g.rooms.some(r => r.id !== '' && !['practice', ...(ORIGINS.find(o => o.id === g.club.origin)?.rooms ?? [])].includes(r.type)),
      () => go('hq', { tab: 'rooms' }),
    ],
  ];
  if (L.every(x => x[1])) return null;
  return (
    <div class="card">
      <div class="in col" style={{ gap: 4 }}>
        <b style={{ marginBottom: 4 }}>First week</b>
        {L.map(([l, d, f]) => (
          <button class="row" key={l} onClick={f} disabled={d} style={{ minHeight: 30, opacity: d ? 0.55 : 1 }}>
            <span style={{ color: d ? 'var(--win)' : 'var(--t3)' }}>{d ? UI('circle-check', 18) : UI('circle', 18)}</span>
            <span class="grow">{l}</span>
            {!d && <span class="mut">{UI('chevron-right', 16)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
export function Versus({ f, big }: { f: Fixture; big?: boolean }) {
  const g = G_();
  const H = g.teams[f.home],
    A = g.teams[f.away];
  const s = big ? 84 : 54;
  const T = ({ t }: { t: typeof H }) => (
    <div class="tm">
      <TeamCrest t={t} s={s} />
      <span>{t.name}</span>
      <Form f={t.form} />
    </div>
  );
  return (
    <div class="vs">
      <T t={H} />
      <div class="mid">vs</div>
      <T t={A} />
    </div>
  );
}
export function TimeLapse() {
  const a = useApp();
  return a.timelapse ? (
    <div class="tl">
      <b>{a.timelapse.label}</b>
      <span>{a.timelapse.sub}</span>
    </div>
  ) : null;
}
// ---------- inbox
export function Inbox() {
  const a = useApp();
  const g = G_();
  const [sel, setSel] = useState<string | null>(a.arg?.id ?? g.inbox.find(m => m.choices && !m.done)?.id ?? g.inbox[0]?.id ?? null);
  useEffect(() => {
    if (a.arg?.id) setSel(a.arg.id);
  }, [a.arg]);
  const m = g.inbox.find(x => x.id === sel);
  useEffect(() => {
    if (m && !m.read && !(m.choices && !m.done)) act({ t: 'read', id: m.id }, true);
  }, [sel, m?.done]);
  const p = m?.data?.p ? g.players[m.data.p] : null;
  return (
    <>
      <Plate title="Inbox">
        <button class="b s q" style={{ color: 'inherit' }} onClick={() => act({ t: 'readAll' }, true)}>
          Mark all read
        </button>
      </Plate>
      <div class="body np" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px,40%) 1fr', overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', scrollbarWidth: 'thin' }}>
          {g.inbox.map(x => (
            <button
              key={x.id}
              class={'mrow ' + (!x.read || (x.choices && !x.done) ? 'un ' : '') + (x.id === sel ? 'on' : '')}
              onClick={() => {
                audio.play('tap');
                setSel(x.id);
              }}
            >
              <i class="pip" />
              <span class="grow">
                <b>{x.title}</b>
                <span class="xs mut">
                  {x.from}, {fmtShort(x.day)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ background: 'var(--k2)', overflow: 'auto', padding: 22 }}>
          {m ? (
            <div class="col" style={{ gap: 14, maxWidth: 560 }}>
              <div class="row">
                {p && <PFace p={p} s={54} />}
                <div>
                  <h2 style={{ margin: 0, fontSize: 21 }}>{m.title}</h2>
                  <span class="sm mut">
                    {m.from}, {fmtDay(m.day)}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 16.5 }}>{m.body}</p>
              {m.done ? (
                <div class="p hot">{m.done}</div>
              ) : (
                m.choices && (
                  <div class="col">
                    {m.choices.map(c => (
                      <button
                        class="p row"
                        style={{ background: 'var(--k3)' }}
                        key={c.id}
                        onClick={() => act({ t: 'choose', id: m.id, c: c.id }, true)}
                      >
                        <span class="grow">
                          <b>{c.label}</b>
                          {c.hint && (
                            <span class="sm sec" style={{ display: 'block' }}>
                              {c.hint}
                            </span>
                          )}
                        </span>
                        {UI('chevron-right', 18)}
                      </button>
                    ))}
                  </div>
                )
              )}
              {m.kind === 'sponsor' && m.data?.deal && <B onClick={() => go('club', { tab: 'sponsors' })}>See sponsors</B>}
              {p && (
                <B
                  onClick={() => {
                    app.player = p.id;
                    bump();
                  }}
                >
                  Open {p.nick}
                </B>
              )}
              {m.data?.fid && myToday(g)?.id === m.data.fid && (
                <B
                  k="p"
                  onClick={() => {
                    app.prematch = m.data.fid;
                    bump();
                  }}
                >
                  Match day
                </B>
              )}
            </div>
          ) : (
            <p class="mut">Nothing here yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
// ---------- player dialog
/** twelve attributes at a glance */
export function Radar({ v, r = 92, c }: { v: { k: string; n: string; v: number }[]; r?: number; c: string }) {
  const n = v.length;
  const at = (i: number, k: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * r * k, Math.sin(a) * r * k];
  };
  const poly = (f: (i: number) => number) =>
    v
      .map((_, i) =>
        at(i, f(i))
          .map(x => x.toFixed(1))
          .join(','),
      )
      .join(' ');
  const w = r + 86,
    h = r + 30;
  return (
    <svg viewBox={`${-w} ${-h} ${w * 2} ${h * 2}`} width="100%" style={{ maxWidth: 400 }} role="img" aria-label="Attribute chart">
      {[0.25, 0.5, 0.75, 1].map(k => (
        <polygon key={k} points={poly(() => k)} fill="none" stroke="rgba(240,236,226,.14)" />
      ))}
      {v.map((_, i) => {
        const [x, y] = at(i, 1);
        return <line key={i} x1="0" y1="0" x2={x} y2={y} stroke="rgba(240,236,226,.1)" />;
      })}
      <polygon points={poly(i => Math.max(0.06, (v[i].v - 25) / 75))} fill={c} fill-opacity="0.38" stroke={c} stroke-width="2" />
      {v.map((a, i) => {
        const [x, y] = at(i, 1.2);
        return (
          <text
            key={a.k}
            x={x}
            y={y}
            text-anchor={Math.abs(x) < 10 ? 'middle' : x > 0 ? 'start' : 'end'}
            dominant-baseline="middle"
            fill="#b8bcc0"
            style={{ font: '600 13px var(--body)' }}
          >
            {a.n}
          </text>
        );
      })}
    </svg>
  );
}
export function PlayerDlg() {
  const a = useApp();
  const g = G_();
  const p = g.players[a.player!];
  const st = p ? null : g.staff.find(x => x.id === a.player);
  const own = !!p?.team && isMe(p.team);
  const [tab, setTab] = useState('attr');
  useEffect(() => {
    setTab(own || st ? 'life' : 'attr');
  }, [a.player]);
  if (!p && !st) return null;
  const close = () => {
    app.player = null;
    bump();
  };
  if (st) return <StaffDlg st={st} close={close} />;
  const k = know(g, p.id);
  const t = p.team ? g.teams[p.team] : null;
  const pc1 = own ? g.club.c1 : (t?.c1 ?? '#3a444e');
  return (
    <Modal close={close} wide>
      <div class="person" style={{ '--pc1': pc1 } as any}>
        <button class="ib x" aria-label="Close" onClick={close}>
          {UI('x', 22)}
        </button>
        <div class="pside">
          <span class="no">{p.num}</span>
          <PFace p={p} s="100%" crop="half" px={300} />
          <div class="cap">
            <h1>{p.nick}</h1>
            <p class="sm sec">
              {p.first} {p.last}, {p.age}, {NATION[p.nat].name}
            </p>
            <div class="row" style={{ marginTop: 10, gap: 16, alignItems: 'flex-end' }}>
              <span>
                <span class="xc" style={{ fontSize: 56, lineHeight: 0.8, display: 'block' }}>
                  {fog(ovr(p), k, p.id)}
                </span>
                <span class="lab">Overall</span>
              </span>
              <span>
                <span class="xc" style={{ fontSize: 30, lineHeight: 0.9, display: 'block', color: 'var(--t2)' }}>
                  {k >= 80 ? fog(p.pot, k, p.id + 'x') : '?'}
                </span>
                <span class="lab">Ceiling</span>
              </span>
            </div>
            <div class="row w" style={{ marginTop: 12, gap: 5 }}>
              <span class="chip">
                <Gi k={TI[p.title]} s={14} />
                {RoleName(p.title, p.role)}
              </span>
              {t ? <span class="chip">{t.name}</span> : <span class="chip g">Free agent</span>}
              {p.traits.map(x => (
                <span class={'chip ' + (TRAITS[x].good ? 'i' : 'r')} key={x} title={TRAITS[x].desc}>
                  {TRAITS[x].name}
                </span>
              ))}
              {own && <Cond p={p} />}
            </div>
          </div>
        </div>
        <div class="main">
          <div class="tabs">
            {[
              ...(own ? [['life', 'Life']] : []),
              ['attr', 'Skill'],
              ['deal', own ? 'Contract' : 'Sign'],
              ...(own ? [['talk', 'Talk']] : []),
            ].map(([x, l]) => (
              <button class={tab === x ? 'on' : ''} key={x} onClick={() => setTab(x)}>
                {l}
              </button>
            ))}
          </div>
          <div class="bd">
            {tab === 'life' && own && <LifePane id={p.id} />}
            {tab === 'attr' && (
              <div class="g2">
                <div>
                  {k >= 60 && (
                    <Radar c={own ? 'var(--amber)' : '#7cc4ff'} v={ATTRS.map(x => ({ k: x, n: ATTR_INFO[x].name, v: p.attr[x] }))} />
                  )}
                  <div class="attrs">
                    {ATTRS.map(x => (
                      <div key={x} title={ATTR_INFO[x].hint}>
                        <span class="sec">{ATTR_INFO[x].name}</span>
                        {k >= 96 ? <Num v={p.attr[x]} /> : <b class="num sec">{fog(p.attr[x], k, p.id + x)}</b>}
                      </div>
                    ))}
                  </div>
                  {k < 96 && (
                    <div class="row" style={{ marginTop: 12 }}>
                      <span class="sm mut grow">Scouted {k}%. Reports narrow the ranges.</span>
                      <B k="s" disabled={g.scout.pid === p.id} onClick={() => act({ t: 'scout', pid: p.id, title: null })}>
                        {g.scout.pid === p.id ? 'Being scouted' : 'Scout'}
                      </B>
                    </div>
                  )}
                </div>
                <div class="col" style={{ gap: 16 }}>
                  {own && (
                    <div class="col">
                      <Meter l="Energy" v={p.energy} />
                      <Meter l="Morale" v={p.morale} />
                      <Meter l="Stress" v={p.stress} inv />
                    </div>
                  )}
                  <div class="g3">
                    <Kv l="Matches" v={p.s.m} />
                    <Kv l="Won" v={p.s.w} />
                    <Kv l="Rating" v={p.s.m ? (p.s.r / p.s.m).toFixed(2) : '0.00'} />
                    <Kv l="Kills" v={p.s.k} />
                    <Kv l="Deaths" v={p.s.d} />
                    <Kv l="MVPs" v={p.s.mvp} />
                  </div>
                  <div class="g2">
                    <Kv l="Career matches" v={p.car.m} />
                    <Kv l="Trophies" v={p.car.trophies} />
                  </div>
                  {own && (
                    <label class="row sm sec">
                      Shirt number
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={p.num}
                        style={{ width: 76 }}
                        onChange={e => act({ t: 'number', pid: p.id, n: Math.round(+(e.target as any).value) }, true)}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            {tab === 'deal' && <Deal p={p} own={own} key={p.id} />}
            {tab === 'talk' && own && (
              <div class="col">
                <p class="sec">
                  {g.day - p.talkDay < 7
                    ? `You spoke ${g.day - p.talkDay === 0 ? 'today' : g.day - p.talkDay + ' days ago'}. Leave it a week.`
                    : 'A word about the game. Once a week at most.'}
                </p>
                {[
                  ['praise', 'Praise recent work', 'Better when form backs it up'],
                  ['push', 'Ask for more', 'Some rise to it. Some do not.'],
                  ['listen', 'Just listen', 'Stress down, trust up'],
                ].map(([c, l, h]) => (
                  <button class="p" disabled={g.day - p.talkDay < 7} key={c} onClick={() => act({ t: 'talk', pid: p.id, c })}>
                    <h3>{l}</h3>
                    <span class="sm sec">{h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
function StaffDlg({ st, close }: { st: Staff; close: () => void }) {
  const g = G_();
  return (
    <Modal close={close} wide>
      <div class="person" style={{ '--pc1': g.club.c1 } as any}>
        <button class="ib x" aria-label="Close" onClick={close}>
          {UI('x', 22)}
        </button>
        <div class="pside">
          <SFace st={st} s="100%" crop="half" px={300} />
          <div class="cap">
            <h1 style={{ fontSize: 42 }}>{st.name}</h1>
            <p class="sm sec">
              {STAFF[st.role].name}, {st.age}, {NATION[st.nat].name}
            </p>
            <div class="row" style={{ marginTop: 10, gap: 16, alignItems: 'flex-end' }}>
              <span>
                <span class="xc" style={{ fontSize: 56, lineHeight: 0.8, display: 'block' }}>
                  {Math.round(st.skill)}
                </span>
                <span class="lab">Skill</span>
              </span>
              <span class="chip">{st.trait}</span>
            </div>
          </div>
        </div>
        <div class="main">
          <div class="tabs">
            <button class="on">Life</button>
          </div>
          <div class="bd">
            <LifePane id={st.id} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
const Meter = ({ l, v, inv }: { l: string; v: number; inv?: boolean }) => (
  <div class="row">
    <span class="sec" style={{ width: 70 }}>
      {l}
    </span>
    <div class="grow">
      <Bar v={v} inv={inv} />
    </div>
    <b class="num" style={{ width: 30, textAlign: 'right' }}>
      {Math.round(v)}
    </b>
  </div>
);
export const Kv = ({ l, v }: { l: string; v: any }) => (
  <div>
    <div class="num kvn">{v}</div>
    <div class="sm mut">{l}</div>
  </div>
);
function Deal({ p, own }: { p: Player; own: boolean }) {
  const g = G_();
  const hasSq = !!g.squads[p.title];
  const n = g.nego[p.id];
  const ask0 = askFor(g, p),
    k = know(g, p.id);
  const guess = own
    ? ask0
    : Math.round((ask0 * (1 + ((100 - k) / 100) * (((p.id.length * 7 + p.id.charCodeAt(1)) % 5) - 2) * 0.06)) / 10) * 10;
  const [sal, setSal] = useState(guess);
  const [mo, setMo] = useState(12);
  useEffect(() => {
    if (n?.ask) setSal(n.ask);
  }, [n?.ask]);
  const fee = feeFor(g, p);
  const it = interest(g, p);
  return (
    <div class="g2">
      <div class="col">
        {own && p.contract && (
          <div class="g3">
            <Kv l="Weekly wage" v={$(p.contract.salary)} />
            <Kv l="Ends" v={fmtShort(p.contract.until)} />
            <Kv l="Value" v={$(valueFor(p, g.day), true)} />
          </div>
        )}
        {!own && (
          <div class="g3">
            <Kv l="Buyout" v={fee ? $(fee, true) : 'None'} />
            <Kv l="Market wage" v={k > 50 ? $(wageFor(p)) : '?'} />
            <Kv l="Interest" v={it > 0.7 ? 'Keen' : it > 0.4 ? 'Open' : it >= 0.25 ? 'Wary' : 'No'} />
          </div>
        )}
        {!hasSq ? (
          <p class="sec">You do not run a {tName(p.title)} squad.</p>
        ) : (
          <>
            {n && n.tries >= 3 ? (
              <div class="p hot">{p.nick} has walked away for now.</div>
            ) : n ? (
              <div class="p hot">
                {p.nick} wants {$(n.ask)} a week. {3 - n.tries} {3 - n.tries === 1 ? 'try' : 'tries'} left.
              </div>
            ) : null}
            <label class="f">
              <span>Weekly wage</span>
              <input type="number" step="10" min="50" value={sal} onInput={e => setSal(Math.round(+(e.target as any).value))} />
            </label>
            <label class="f">
              <span>Length: {mo} months</span>
              <input type="range" min="3" max="30" step="3" value={mo} onInput={e => setMo(+(e.target as any).value)} />
            </label>
            <B
              k="p"
              disabled={(!!n && n.tries >= 3) || (!own && it < 0.25)}
              onClick={() => act({ t: 'offer', pid: p.id, salary: sal, months: mo })}
            >
              {own ? 'Offer renewal' : fee ? `Offer, plus ${$(fee, true)} buyout` : 'Offer contract'}
            </B>
          </>
        )}
      </div>
      <div class="col">
        {own ? (
          <>
            <p class="sec sm">Releasing a player pays two to eight weeks of wages. Listing invites bids and stings a little.</p>
            <div class="row w">
              <B onClick={() => act({ t: 'list', pid: p.id })}>{p.listed ? 'Take off the list' : 'Transfer list'}</B>
              <B
                k="d"
                onClick={() =>
                  ask(
                    `Release ${p.nick}?`,
                    'Severance is paid now. The player becomes a free agent.',
                    'Release',
                    () => {
                      act({ t: 'release', pid: p.id });
                      app.player = null;
                      bump();
                    },
                    true,
                  )
                }
              >
                Release
              </B>
            </div>
          </>
        ) : (
          <p class="sec sm">
            Reputation, division and contract length all move the number. Three refusals and the player walks for two weeks.
          </p>
        )}
      </div>
    </div>
  );
}
// ---------- match day
export function PreMatch() {
  const a = useApp();
  const g = G_();
  const f = todays(g).find(x => x.id === a.prematch);
  const close = () => {
    app.prematch = null;
    bump();
  };
  if (!f || f.played) return null;
  const us = isMe(f.home) ? 0 : 1;
  const opp = g.teams[us ? f.home : f.away];
  const sq = g.squads[f.title]!;
  const w = squadReady(g, sq);
  const pr = expected(g, f.home, f.away);
  const p = Math.round((us ? 1 - pr : pr) * 100);
  const kb = Math.max(...opp.roster.map(r => know(g, r)));
  const mineT = g.teams[meId(f.title)];
  const odds = p;
  const Side = ({ ids, t, me }: { ids: (string | null)[]; t: typeof opp; me?: boolean }) => (
    <div class={'fo ' + (me ? 'l' : 'r')} style={{ '--fc': me ? g.club.c1 : t.c1 } as any}>
      <div class="fohd">
        <TeamCrest t={t} s={64} />
        <div>
          <h1>{t.name}</h1>
          <Form f={t.form} />
        </div>
      </div>
      <div class="fop">
        {TITLE[f.title].roles.map((r, i) => {
          const q = ids[i] ? g.players[ids[i]!] : null;
          return (
            <button
              key={r.id}
              disabled={!q}
              onClick={() => {
                app.player = q!.id;
                bump();
              }}
            >
              {q ? <PFace p={q} s="100%" h="100%" crop="half" px={210} /> : <span class="pt" style={{ width: '100%', height: '100%' }} />}
              <span class="foc">
                <b>{q?.nick ?? 'Stand-in'}</b>
                <span>
                  {r.name}
                  {me && g.squads[f.title]!.heroes[i] ? `, ${heroName(g.squads[f.title]!.heroes[i]!)}` : ''}
                </span>
              </span>
              {q && <em>{fog(ovr(q), know(g, q.id), q.id)}</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div class="faceoff" role="dialog" aria-modal="true">
      <div class="fotop">
        <span class="chip">
          <Gi k={TI[f.title]} s={14} />
          {tName(f.title)}
        </span>
        <b>
          {fixLabel(f)}
          {f.bo > 1 ? `, best of ${f.bo}` : ''}
        </b>
        <button class="ib" aria-label="Close" onClick={close}>
          {UI('x', 24)}
        </button>
      </div>
      <div class="fobody">
        <Side ids={sq.lineup} t={mineT} me />
        <div class="fovs">VS</div>
        <Side ids={opp.roster} t={opp} />
      </div>
      <div class="fobot">
        <div class="odds">
          <i style={{ width: odds + '%', background: 'var(--team)' }} />
          <i style={{ width: 100 - odds + '%', background: opp.c1 }} />
          <b>{odds}%</b>
          <b>{100 - odds}%</b>
        </div>
        <div class="row w grow" style={{ gap: 5 }}>
          <span class="chip">Familiarity {Math.round(sq.fam * 100)}%</span>
          <span class="chip">Synergy {Math.round(sq.syn * 100)}%</span>
          <span class="chip">Prep {Math.round(sq.prep * 100)}%</span>
          {kb < 40 && <span class="chip a">Little is known about them</span>}
          {w.map(x => (
            <span class="chip r" key={x}>
              {x}
            </span>
          ))}
          {sq.lineup
            .filter((x): x is string => !!x && (g.life.p[x]?.anger ?? 0) > 58)
            .map(x => (
              <span class="chip r" key={'a' + x}>
                {nameOf(g, x)} is angry
              </span>
            ))}
        </div>
        <B
          k="q"
          onClick={() => {
            close();
            go('tactics');
          }}
        >
          Adjust plan
        </B>
        <B
          onClick={() => {
            const o = act({ t: 'delegate', fid: f.id }, true);
            app.prematch = null;
            if (o.ok) app.postmatch = G_().recs[0];
            bump();
          }}
        >
          Let the coach run it
        </B>
        <B
          k="p l"
          onClick={() => {
            const o = act({ t: 'matchStart', fid: f.id }, true);
            if (o.ok) resumeLive();
          }}
        >
          Take the stage
        </B>
      </div>
    </div>
  );
}
export function PostMatch() {
  const a = useApp();
  const r = a.postmatch as MatchRec;
  const g = G_();
  const [gi, setGi] = useState(0);
  const close = () => {
    app.postmatch = null;
    bump();
  };
  const gm = r.games[Math.min(gi, r.games.length - 1)];
  const us = gm.us;
  const mvp = g.players[r.mvp];
  const cfg = r.cfgs?.[gi]?.cfg;
  const nm = (id: string) => cfg?.teams.flatMap(t => t.players).find(p => p.id === id)?.nick ?? g.players[id]?.nick ?? 'stand-in';
  const moba = r.title === 'dota',
    ow = r.title === 'ow';
  const Tab = ({ side }: { side: 0 | 1 }) => (
    <table>
      <thead>
        <tr>
          <th>{side === us ? g.club.tag : r.oppTag}</th>
          <th class="n">K</th>
          <th class="n">D</th>
          <th class="n">A</th>
          <th class="n">{moba ? 'Gold' : ow ? 'Heal' : 'Dmg'}</th>
          <th class="n">Rating</th>
        </tr>
      </thead>
      <tbody>
        {[...gm.res.stats[side]]
          .sort((x, y) => y.rating - x.rating)
          .map(s => (
            <tr key={s.id} class={s.id === r.mvp ? 'me' : ''}>
              <td>
                <span class="row" style={{ gap: 6 }}>
                  {s.hero && <Gi k={heroIcon(s.hero)} s={18} />}
                  {nm(s.id)}
                </span>
              </td>
              <td class="n">{s.k}</td>
              <td class="n">{s.d}</td>
              <td class="n">{s.a}</td>
              <td class="n">{N(moba ? s.gold! : ow ? s.heal : s.dmg)}</td>
              <td class="n">
                <b style={{ color: s.rating >= 1.2 ? 'var(--win)' : s.rating < 0.85 ? 'var(--loss)' : undefined }}>{s.rating.toFixed(2)}</b>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
  return (
    <Modal close={close} wide>
      <div class={'pmhd ' + (r.win ? 'won' : 'lost')} style={{ '--fc': g.club.c1 } as any}>
        <div class="pmt">
          <span class="sec">
            {tShort(r.title)},{' '}
            {r.comp === 'league'
              ? r.stage.toLowerCase()
              : `${r.comp === 'masters' ? 'World Masters' : 'playoffs'}, ${r.stage.toLowerCase()}`}
          </span>
          <h1>{r.win ? 'Victory' : 'Defeat'}</h1>
          <b>
            {r.score[0]}–{r.score[1]} <small>against {r.opp}</small>
          </b>
        </div>
        {mvp && (
          <button
            class="pmv"
            onClick={() => {
              close();
              app.player = mvp.id;
              bump();
            }}
          >
            <PFace p={mvp} s={190} h={200} crop="half" px={200} />
            <span>
              <small>Best on the team</small>
              <b>{mvp.nick}</b>
            </span>
          </button>
        )}
        <button class="ib x" aria-label="Close" onClick={close}>
          {UI('x', 22)}
        </button>
      </div>
      <div class="bd">
        {r.games.length > 1 && (
          <div class="opts">
            {r.games.map((x, i) => (
              <B k={'s ' + (i === gi ? 'on' : '')} key={i} onClick={() => setGi(i)}>
                {MAP_META.find(m => m.id === x.map)?.name} {x.res.score[us]}–{x.res.score[1 - us]}
              </B>
            ))}
          </div>
        )}
        {r.games.length === 1 && (
          <span class="chip" style={{ alignSelf: 'flex-start' }}>
            {MAP_META.find(m => m.id === gm.map)?.name}, {Math.round(gm.res.ticks / 600)} min
          </span>
        )}
        <div class="g2">
          <Tab side={us} />
          <Tab side={(1 - us) as 0 | 1} />
        </div>
        {gm.res.log.length > 0 && (
          <div class="p" style={{ maxHeight: 150, overflow: 'auto' }}>
            {gm.res.log.slice(-12).map((l, i) => (
              <div class="sm sec" key={i}>
                {l}
              </div>
            ))}
          </div>
        )}
        <div class="row end">
          <span class="sm mut grow">
            {r.fans >= 0 ? '+' : ''}
            {N(r.fans)} fans
          </span>
          {r.cfgs?.[gi] && (
            <B
              onClick={() => {
                const c = r.cfgs![gi];
                app.postmatch = null;
                startMatch({
                  cfg: c.cfg,
                  us,
                  kind: 'replay',
                  orders: c.orders,
                  title: 'Replay',
                  sub: MAP_META.find(m => m.id === gm.map)?.name ?? '',
                });
              }}
            >
              {UI('play', 17)}Watch replay
            </B>
          )}
          <B k="p" onClick={close}>
            Done
          </B>
        </div>
      </div>
    </Modal>
  );
}
export function GameOver() {
  const g = G_();
  return (
    <div class="scrim">
      <div class="modal">
        <div class="bd" style={{ padding: 28 }}>
          <h1 style={{ font: '900 72px/0.86 var(--xc)', textTransform: 'uppercase' }}>The lights are off</h1>
          <p class="sec">
            {g.club.name} could not pay. {g.stats.w} wins, {g.trophies.length} trophies, {fmtDay(g.day)}.
          </p>
          <B k="p l" onClick={() => leaveCareer()}>
            Back to title
          </B>
        </div>
      </div>
    </div>
  );
}
export { act, ask, endMatchView, toast, money, sorted, strength, won, Face, vis, meId, Six };
export type { G, Msg };
