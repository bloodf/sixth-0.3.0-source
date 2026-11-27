import { act, app, bump, G_, tName, tShort, useApp } from '../store.ts';
import {
  $,
  ask,
  B,
  CrestI,
  fog,
  Form,
  Gi,
  know,
  N,
  ovr,
  PFace,
  Plate,
  RoleName,
  Shirt,
  Tabs,
  TeamCrest,
  TI,
  TitleTabs,
  UI,
  useEffect,
  useState,
  useTitle,
} from '../kit.tsx';
import { Kv, fmtShort, WD, dateOf } from './shell.tsx';
import { TITLE, TITLES, type TitleId } from '../../data/titles.ts';
import { DIV_NAME, valueFor, wageFor } from '../../game/gen.ts';
import { isMe, meId, PRIZE, sorted, MASTERS_PRIZE, won } from '../../game/league.ts';
import type { Fixture, Player } from '../../game/types.ts';
import { feeFor, interest } from '../../game/reducer.ts';
import { dow, merchWeek, streamIncome, wagesWeek } from '../../game/day.ts';
import { SPONSOR_SLOTS, TITLE_ENTRY_COST, type SponsorSlot } from '../../data/club.ts';
import { CrestEd, ShirtEd, Swatches } from './wizard.tsx';
import { ShirtStage } from '../stage.tsx';
import { mixHex } from '../art.ts';
export function MarketSheet() {
  useApp();
  const g = G_();
  const [t] = useTitle();
  const [mode, setMode] = useState<'fa' | 'all' | 'bids'>('fa');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState<'ovr' | 'age' | 'fee' | 'pot'>('ovr');
  const [q, setQ] = useState('');
  const list = Object.values(g.players).filter(
    p =>
      p.title === t &&
      !(p.team && isMe(p.team)) &&
      (mode === 'all' || !p.team) &&
      (role === 'all' || p.role === role) &&
      (!q || (p.nick + p.last).toLowerCase().includes(q.toLowerCase())),
  );
  const est = (p: Player) => {
    const k = know(g, p.id);
    return ovr(p) * (k / 100) + 58 * (1 - k / 100);
  };
  list.sort((a, b) =>
    sort === 'age'
      ? a.age - b.age
      : sort === 'fee'
        ? feeFor(g, a) - feeFor(g, b)
        : sort === 'pot'
          ? b.pot * know(g, b.id) - a.pot * know(g, a.id)
          : est(b) - est(a),
  );
  const Th = ({ k, l }: { k: typeof sort; l: string }) => (
    <th class="n">
      <button onClick={() => setSort(k)} style={{ color: sort === k ? 'var(--amber)' : 'inherit' }}>
        {l}
      </button>
    </th>
  );
  const tgt = g.scout.pid ? g.players[g.scout.pid] : null;
  return (
    <>
      <Plate title="Market" />
      <TitleTabs />
      <div class="body">
        <div class="row w">
          <div class="opts">
            <B k={'s ' + (mode === 'fa' ? 'on' : '')} onClick={() => setMode('fa')}>
              Free agents
            </B>
            <B k={'s ' + (mode === 'all' ? 'on' : '')} onClick={() => setMode('all')}>
              Everyone
            </B>
            <B k={'s ' + (mode === 'bids' ? 'on' : '')} onClick={() => setMode('bids')}>
              Bids for you ({g.bids.length})
            </B>
          </div>
          <div class="grow" />
          <input type="text" placeholder="Find by name" value={q} onInput={e => setQ((e.target as any).value)} style={{ width: 160 }} />
        </div>
        {mode === 'bids' ? (
          <div class="col" style={{ marginTop: 14 }}>
            {g.bids.map(b => {
              const p = g.players[b.pid],
                m = g.inbox.find(x => x.data?.bid === b.id && !x.done);
              return (
                <div class="p row" key={b.id}>
                  <PFace p={p} s={44} />
                  <span class="grow">
                    <b>{p.nick}</b>
                    <span class="sm sec" style={{ display: 'block' }}>
                      {g.teams[b.team].name} offer {$(b.fee)}. Valued at {$(valueFor(p, g.day))}.
                    </span>
                  </span>
                  {m && (
                    <>
                      <B k="s p" onClick={() => act({ t: 'choose', id: m.id, c: 'accept' })}>
                        Sell
                      </B>
                      <B k="s" onClick={() => act({ t: 'choose', id: m.id, c: 'reject' })}>
                        Turn down
                      </B>
                    </>
                  )}
                </div>
              );
            })}
            {!g.bids.length && <p class="sec">No bids this week. Listing a player brings them in.</p>}
          </div>
        ) : (
          <>
            <div class="opts" style={{ margin: '12px 0' }}>
              <B k={'s ' + (role === 'all' ? 'on' : '')} onClick={() => setRole('all')}>
                All roles
              </B>
              {TITLE[t].roles.map(r => (
                <B k={'s ' + (role === r.id ? 'on' : '')} key={r.id} onClick={() => setRole(r.id)}>
                  {r.name}
                </B>
              ))}
            </div>
            <div class="p row sm" style={{ marginBottom: 8 }}>
              {UI('binoculars', 18)}
              <span class="grow">
                {tgt ? (
                  <>
                    Scouting <b>{tgt.nick}</b>, {know(g, tgt.id)}% known
                  </>
                ) : g.scout.title ? (
                  `Scouts are covering ${tShort(g.scout.title)}`
                ) : (
                  'Scouts are watching everyone a little'
                )}
              </span>
              {tgt ? (
                <B k="s" onClick={() => act({ t: 'scout', pid: null, title: t }, true)}>
                  Stop
                </B>
              ) : (
                <B k="s" onClick={() => act({ t: 'scout', pid: null, title: t }, true)}>
                  Focus on {tShort(t)}
                </B>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Role</th>
                  <Th k="age" l="Age" />
                  <Th k="ovr" l="Overall" />
                  <Th k="pot" l="Ceiling" />
                  <th>Known</th>
                  <th>Club</th>
                  <th class="n">Wage</th>
                  <Th k="fee" l="Buyout" />
                  <th>Interest</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 70).map(p => {
                  const k = know(g, p.id);
                  const it = interest(g, p);
                  return (
                    <tr
                      class="k"
                      key={p.id}
                      onClick={() => {
                        app.player = p.id;
                        bump();
                      }}
                    >
                      <td>
                        <span class="row">
                          <PFace p={p} s={28} />
                          <b>{p.nick}</b>
                        </span>
                      </td>
                      <td class="sec">{RoleName(t, p.role)}</td>
                      <td class="n">{p.age}</td>
                      <td class="n">
                        <b>{fog(ovr(p), k, p.id)}</b>
                      </td>
                      <td class="n sec">{k >= 80 ? fog(p.pot, k, p.id + 'x') : '?'}</td>
                      <td>
                        <div class="bar" style={{ width: 44 }}>
                          <i style={{ width: k + '%', background: 'var(--info)' }} />
                        </div>
                      </td>
                      <td class="sec">{p.team ? g.teams[p.team].tag : 'Free'}</td>
                      <td class="n">{k > 50 ? $(wageFor(p)) : '?'}</td>
                      <td class="n">{p.team ? $(feeFor(g, p), true) : ''}</td>
                      <td>
                        {it >= 0.7 ? (
                          <span class="chip g">keen</span>
                        ) : it >= 0.4 ? (
                          <span class="chip">open</span>
                        ) : it >= 0.25 ? (
                          <span class="chip a">wary</span>
                        ) : (
                          <span class="chip r">no</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length > 70 && (
              <p class="sm mut" style={{ marginTop: 8 }}>
                Showing 70 of {list.length}. Narrow by role or name.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
const Fx = ({ f }: { f: Fixture }) => {
  const g = G_();
  const H = g.teams[f.home],
    A = g.teams[f.away];
  const me = isMe(f.home) || isMe(f.away);
  const w = f.played ? won(f) : '';
  const N_ = ({ t }: { t: typeof H }) => (
    <span style={{ fontWeight: w === t.id ? 750 : 500, color: w && w !== t.id ? 'var(--t3)' : undefined }}>{t.name}</span>
  );
  return (
    <div class={'fx ' + (me ? 'me' : '')}>
      <span class="h row end">
        <N_ t={H} />
        <TeamCrest t={H} s={24} />
      </span>
      <span class="sc">{f.played ? `${f.score![0]}–${f.score![1]}` : `${WD[dow(f.day)]} ${fmtShort(f.day)}`}</span>
      <span class="row">
        <TeamCrest t={A} s={24} />
        <N_ t={A} />
      </span>
    </div>
  );
};
export function LeagueSheet() {
  useApp();
  const g = G_();
  const [t] = useTitle();
  const s = g.seasons[t]!;
  const mine_ = g.teams[meId(t)];
  const [tab, setTab] = useState('table');
  const [div, setDiv] = useState(mine_.div);
  const [tm, setTm] = useState<string | null>(null);
  useEffect(() => {
    setDiv(g.teams[meId(t)].div);
    setTm(null);
  }, [t]);
  const rows = sorted(s.tables[div]);
  const rd = Math.max(1, ...s.fixtures.filter(f => f.comp === 'league' && f.played).map(f => +f.stage.slice(6)));
  const [r, setR] = useState(rd);
  useEffect(() => {
    setR(Math.min(9, rd));
  }, [t, rd]);
  const T = tm ? g.teams[tm] : null;
  const left = s.start + 91 - g.day;
  return (
    <>
      <Plate title="Leagues">
        <span class="sm" style={{ fontWeight: 650 }}>
          Season {s.n + 1}, {Math.max(0, Math.ceil(left / 7))} weeks left
        </span>
      </Plate>
      <TitleTabs />
      <Tabs
        v={tab}
        set={x => {
          setTab(x);
          setTm(null);
        }}
        items={[
          ['table', 'Table'],
          ['fixtures', 'Fixtures'],
          ['playoffs', 'Playoffs'],
          ['masters', 'World Masters'],
          ['world', 'World ranking'],
        ]}
      />
      <div class="body">
        {T ? (
          <div class="col">
            <div class="row">
              <TeamCrest t={T} s={64} />
              <div class="grow">
                <h1 style={{ font: '900 38px/0.9 var(--xc)', textTransform: 'uppercase' }}>{T.name}</h1>
                <span class="sec">
                  {T.div === 9 ? 'International' : DIV_NAME[T.div]}, rating {Math.round(T.elo)}
                </span>
              </div>
              <Form f={T.form} />
              <B k="s q" onClick={() => setTm(null)}>
                Back
              </B>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Role</th>
                  <th class="n">Age</th>
                  <th class="n">Overall</th>
                  <th class="n">Buyout</th>
                </tr>
              </thead>
              <tbody>
                {(isMe(T.id) ? g.squads[t]!.lineup : T.roster)
                  .map(id => id && g.players[id])
                  .filter(Boolean)
                  .map(p => {
                    const pl = p as Player;
                    return (
                      <tr
                        class="k"
                        key={pl.id}
                        onClick={() => {
                          app.player = pl.id;
                          bump();
                        }}
                      >
                        <td>
                          <span class="row">
                            <PFace p={pl} s={28} />
                            <b>{pl.nick}</b>
                          </span>
                        </td>
                        <td class="sec">{RoleName(t, pl.role)}</td>
                        <td class="n">{pl.age}</td>
                        <td class="n">{fog(ovr(pl), know(g, pl.id), pl.id)}</td>
                        <td class="n">{isMe(T.id) ? '' : $(feeFor(g, pl), true)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {(tab === 'table' || tab === 'fixtures' || tab === 'playoffs') && (
              <div class="opts" style={{ marginBottom: 12 }}>
                {DIV_NAME.map((n, i) => (
                  <B k={'s ' + (div === i ? 'on' : '')} key={n} onClick={() => setDiv(i)}>
                    {n}
                  </B>
                ))}
              </div>
            )}
            {tab === 'table' && (
              <>
                <table>
                  <thead>
                    <tr>
                      <th class="n">#</th>
                      <th>Team</th>
                      <th class="n">P</th>
                      <th class="n">W</th>
                      <th class="n">L</th>
                      <th class="n">{TITLE[t].scoreWord}</th>
                      <th>Form</th>
                      <th class="n">Rating</th>
                      <th class="n">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x, i) => {
                      const q = g.teams[x.team];
                      return (
                        <tr
                          key={x.team}
                          class={'k ' + (isMe(x.team) ? 'me ' : '') + (i < 4 ? 'po ' : '') + (i >= 8 && div < 2 ? 'dn' : '')}
                          onClick={() => setTm(x.team)}
                        >
                          <td class="n">{i + 1}</td>
                          <td>
                            <span class="row">
                              <TeamCrest t={q} s={26} />
                              {q.name}
                            </span>
                          </td>
                          <td class="n">{x.p}</td>
                          <td class="n">{x.w}</td>
                          <td class="n">{x.l}</td>
                          <td class="n">
                            {x.mw}–{x.ml}
                          </td>
                          <td>
                            <Form f={q.form} />
                          </td>
                          <td class="n">{Math.round(q.elo)}</td>
                          <td class="n">{$(PRIZE[div][i], true)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p class="sm mut" style={{ marginTop: 10 }}>
                  Top four play off. {div > 0 ? 'Both finalists go up.' : 'Both finalists reach the World Masters.'}
                  {div < 2 ? ' Bottom two go down.' : ''}
                </p>
              </>
            )}
            {tab === 'fixtures' && (
              <>
                <div class="opts" style={{ marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <B k={'s ' + (r === n ? 'on' : '')} key={n} onClick={() => setR(n)}>
                      {n}
                    </B>
                  ))}
                </div>
                <div class="p" style={{ padding: 0 }}>
                  {s.fixtures
                    .filter(f => f.comp === 'league' && f.div === div && f.stage === `Round ${r}`)
                    .map(f => (
                      <Fx f={f} key={f.id} />
                    ))}
                </div>
              </>
            )}
            {tab === 'playoffs' &&
              (s.stage === 'league' ? (
                <p class="sec">The bracket is drawn after round nine. First plays fourth, second plays third, best of three.</p>
              ) : (
                <div class="g2">
                  <div>
                    <h2>Semi-finals</h2>
                    {s.fixtures
                      .filter(f => f.comp === 'playoff' && f.div === div && f.stage === 'Semi-final')
                      .map(f => (
                        <Fx f={f} key={f.id} />
                      ))}
                  </div>
                  <div>
                    <h2>Final</h2>
                    {s.fixtures
                      .filter(f => f.comp === 'playoff' && f.div === div && f.stage === 'Final')
                      .map(f => (
                        <Fx f={f} key={f.id} />
                      ))}
                    {s.champs[div] && (
                      <div class="p hot row" style={{ marginTop: 12 }}>
                        {UI('trophy', 22)}
                        <b>{g.teams[s.champs[div]!].name}</b>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            {tab === 'masters' && (
              <>
                <p class="sec" style={{ marginBottom: 12 }}>
                  Eight teams from three continents. Division 1 finalists qualify. The winner takes {$(MASTERS_PRIZE[0])}.
                </p>
                {s.masters.length ? (
                  <div class="g3">
                    {['Quarter-final', 'Semi-final', 'Final'].map(st => (
                      <div key={st}>
                        <h2>{st}</h2>
                        {s.fixtures
                          .filter(f => f.comp === 'masters' && f.stage === st)
                          .map(f => (
                            <Fx f={f} key={f.id} />
                          ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="mut">Drawn in week twelve.</p>
                )}
                {s.mchamp && (
                  <div class="p hot row" style={{ marginTop: 14 }}>
                    {UI('trophy', 22)}
                    <b>{g.teams[s.mchamp].name} are world champions</b>
                  </div>
                )}
              </>
            )}
            {tab === 'world' && (
              <table>
                <thead>
                  <tr>
                    <th class="n">#</th>
                    <th>Team</th>
                    <th>Where</th>
                    <th>Form</th>
                    <th class="n">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(g.teams)
                    .filter(x => x.title === t)
                    .sort((a, b) => b.elo - a.elo)
                    .map((x, i) => (
                      <tr key={x.id} class={'k ' + (isMe(x.id) ? 'me' : '')} onClick={() => setTm(x.id)}>
                        <td class="n">{i + 1}</td>
                        <td>
                          <span class="row">
                            <TeamCrest t={x} s={26} />
                            {x.name}
                          </span>
                        </td>
                        <td class="sec">{x.div === 9 ? 'International' : DIV_NAME[x.div]}</td>
                        <td>
                          <Form f={x.form} />
                        </td>
                        <td class="n">{Math.round(x.elo)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}
export function ClubSheet() {
  const a = useApp();
  const g = G_();
  const [tab, setTab] = useState(a.arg?.tab ?? 'money');
  useEffect(() => {
    if (a.arg?.tab) setTab(a.arg.tab);
  }, [a.arg]);
  return (
    <>
      <Plate title="Club" />
      <Tabs
        v={tab}
        set={setTab}
        items={[
          ['money', 'Money'],
          ['sponsors', `Sponsors${g.deals.some(d => !d.signed) ? ' (' + g.deals.filter(d => !d.signed).length + ')' : ''}`],
          ['brand', 'Brand'],
          ['games', 'Games'],
          ['honours', 'Honours'],
        ]}
      />
      <div class="body">
        {tab === 'money' && <Money />}
        {tab === 'sponsors' && <Sponsors />}
        {tab === 'brand' && <Brand />}
        {tab === 'games' && <Games />}
        {tab === 'honours' && <Honours />}
      </div>
    </>
  );
}
function Money() {
  const g = G_();
  const w = wagesWeek(g);
  const sp = g.deals.filter(d => d.signed).reduce((s, d) => s + d.weekly, 0);
  const st = Object.values(g.squads).reduce((s, q) => s + q!.week.flat().filter(b => b === 'stream').length, 0) * streamIncome(g);
  const inc: [string, number][] = [
    ['Sponsors', sp],
    ['Merchandise', merchWeek(g)],
    ['Streaming', st],
  ];
  const out: [string, number][] = [
    ['Players', w.players],
    ['Staff', w.staff],
    ['Rent', w.rent],
    ['Rooms', w.upkeep],
    ['Travel', w.travel],
    ['Loan interest', w.loan],
  ];
  const I = inc.reduce((s, x) => s + x[1], 0),
    O = out.reduce((s, x) => s + x[1], 0);
  const L = [...g.ledger.slice(-26).map(x => x.cash), g.club.cash];
  const mx = Math.max(1, ...L),
    mn = Math.min(0, ...L);
  const pt = (v: number, i: number) => `${L.length < 2 ? 50 : (i / (L.length - 1)) * 600},${100 - ((v - mn) / (mx - mn || 1)) * 92 - 4}`;
  const lim = Math.round(30000 + g.club.rep * 4000 + g.club.fans * 0.8);
  const M = Math.max(I, O, 1);
  const Row = ({ l, v, c }: any) =>
    v > 0 ? (
      <div class="row">
        <span class="sec" style={{ width: 100 }}>
          {l}
        </span>
        <div class="grow" style={{ height: 14, background: 'var(--k3)' }}>
          <div style={{ width: (v / M) * 100 + '%', height: '100%', background: c }} />
        </div>
        <b class="num" style={{ width: 74, textAlign: 'right' }}>
          {$(v)}
        </b>
      </div>
    ) : null;
  return (
    <>
      <div class="g4">
        <div class="p">
          <Kv l="Cash" v={$(g.club.cash)} />
        </div>
        <div class="p">
          <Kv
            l="A normal week"
            v={
              <span class={I - O >= 0 ? 'pos' : 'neg'}>
                {I - O >= 0 ? '+' : ''}
                {$(I - O)}
              </span>
            }
          />
        </div>
        <div class="p">
          <Kv l="Prize money, all time" v={$(g.stats.prize, true)} />
        </div>
        <div class="p">
          <Kv l="Loan" v={$(g.club.loan, true)} />
        </div>
      </div>
      {L.length > 1 && (
        <>
          <h2>Cash, last {L.length} weeks</h2>
          <div class="p">
            <svg class="spark" viewBox="0 0 600 104" preserveAspectRatio="none" role="img" aria-label="Cash over time">
              <line
                x1="0"
                x2="600"
                y1={100 - ((0 - mn) / (mx - mn || 1)) * 92 - 4}
                y2={100 - ((0 - mn) / (mx - mn || 1)) * 92 - 4}
                stroke="#2f5561"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              />
              <polyline points={L.map(pt).join(' ')} fill="none" stroke="#ffb23e" stroke-width="2.5" vector-effect="non-scaling-stroke" />
            </svg>
            <div class="row sb xs mut">
              <span>low {$(Math.min(...L), true)}</span>
              <span>high {$(mx, true)}</span>
            </div>
          </div>
        </>
      )}
      <div class="g2" style={{ marginTop: 18 }}>
        <div class="col" style={{ gap: 7 }}>
          <h2>In, each week</h2>
          {inc.map(([l, v]) => (
            <Row l={l} v={v} c="#58d39b" key={l} />
          ))}
        </div>
        <div class="col" style={{ gap: 7 }}>
          <h2 style={{ margin: '0 0 10px' }}>Out, each week</h2>
          {out.map(([l, v]) => (
            <Row l={l} v={v} c="#ff7a6b" key={l} />
          ))}
        </div>
      </div>
      <div class="g2" style={{ marginTop: 18 }}>
        <div>
          <h2>Bank</h2>
          <p class="sm sec" style={{ marginBottom: 8 }}>
            Up to {$(lim)}. Interest is 0.6% a week.
          </p>
          <div class="opts">
            {[10000, 50000].map(n => (
              <B key={n} disabled={g.club.loan + n > lim} onClick={() => act({ t: 'loan', n })}>
                Borrow {$(n, true)}
              </B>
            ))}
            {g.club.loan > 0 && (
              <B disabled={g.club.cash <= 0} onClick={() => act({ t: 'loan', n: -Math.min(g.club.loan, Math.max(0, g.club.cash)) })}>
                Repay {$(Math.min(g.club.loan, Math.max(0, g.club.cash)), true)}
              </B>
            )}
          </div>
        </div>
        <div>
          <h2 style={{ margin: '0 0 10px' }}>Shirt price</h2>
          <div class="opts">
            {['Fair', 'Standard', 'Premium'].map((l, i) => (
              <B k={g.club.merch === i ? 'on' : ''} key={l} onClick={() => act({ t: 'merch', v: i }, true)}>
                {l}
              </B>
            ))}
          </div>
        </div>
      </div>
      <h2>Last week</h2>
      <div class="g3">
        {Object.entries(g.ledger.at(-1)?.items ?? {}).map(([k, v]) => (
          <div class="row sb" key={k}>
            <span class="sec">{k}</span>
            <b class={'num ' + (v < 0 ? 'neg' : 'pos')}>{$(v)}</b>
          </div>
        ))}
      </div>
    </>
  );
}
function Sponsors() {
  const g = G_();
  const goal = (d: any) => (d.goal === 'win' ? `${d.goalN} wins` : d.goal === 'fans' ? `${N(d.goalN)} fans` : 'reach the playoffs');
  return (
    <div class="col" style={{ gap: 14 }}>
      {(Object.keys(SPONSOR_SLOTS) as SponsorSlot[]).map(s => {
        const cur = g.deals.find(d => d.slot === s && d.signed),
          of = g.deals.filter(d => d.slot === s && !d.signed);
        return (
          <div class="p col" key={s}>
            <div class="row sb">
              <h3>{SPONSOR_SLOTS[s].name}</h3>
              {cur ? (
                <span class="chip g">
                  {cur.brand}, until {fmtShort(cur.until)}
                </span>
              ) : (
                <span class="chip">{of.length ? 'choose one' : 'open'}</span>
              )}
            </div>
            {cur && (
              <div class="row w">
                <span class="sec grow">
                  {$(cur.weekly)} a week. Bonus {$(cur.bonus)} for {goal(cur)}
                  {cur.goal === 'win' ? ` (${cur.prog}/${cur.goalN})` : cur.prog >= cur.goalN ? ', paid' : ''}.
                </span>
              </div>
            )}
            {!cur &&
              of.map(d => (
                <div class="row w" key={d.id} style={{ background: 'var(--k3)', padding: '10px 12px' }}>
                  <span class="grow">
                    <b>{d.brand}</b> <span class="mut sm">{d.sector}</span>
                    <span class="sm sec" style={{ display: 'block' }}>
                      {$(d.weekly)} a week for {d.weeks} weeks. Bonus {$(d.bonus)} for {goal(d)}. Stands {Math.max(0, d.exp - g.day)} more
                      days.
                    </span>
                  </span>
                  <B k="s" onClick={() => act({ t: 'deal', id: d.id, c: 'no' }, true)}>
                    Decline
                  </B>
                  <B k="s p" onClick={() => act({ t: 'deal', id: d.id, c: 'yes' })}>
                    Sign
                  </B>
                </div>
              ))}
            {!cur && !of.length && (
              <span class="sm mut">Offers arrive on Mondays. Reputation, fans and a partnerships lead bring more.</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Brand() {
  const g = G_();
  const c = g.club;
  const [d, setD] = useState({ name: c.name, tag: c.tag, c1: c.c1, c2: c.c2, c3: c.c3, motto: c.motto, crest: c.crest, jersey: c.jersey });
  const [ed, setEd] = useState<'none' | 'crest' | 'shirt' | 'id'>('none');
  const sp = g.deals.find(x => x.signed && x.slot === 'front')?.brand;
  const dirty =
    JSON.stringify(d) !==
    JSON.stringify({ name: c.name, tag: c.tag, c1: c.c1, c2: c.c2, c3: c.c3, motto: c.motto, crest: c.crest, jersey: c.jersey });
  return (
    <>
      <div class="g2" style={{ gridTemplateColumns: '1fr 300px' }}>
        <div class="col">
          <div class="row" style={{ gap: 18 }}>
            <CrestI c={d.crest} s={110} />
            <div>
              <div style={{ font: '900 44px/0.88 var(--xc)', textTransform: 'uppercase' }}>{d.name}</div>
              <div class="sec">
                {d.tag}
                {d.motto ? `. ${d.motto}` : ''}
              </div>
              <div class="row" style={{ marginTop: 10, gap: 4 }}>
                {[d.c1, d.c2, d.c3].map((x, i) => (
                  <i key={i} style={{ width: 44, height: 18, background: x }} />
                ))}
              </div>
            </div>
          </div>
          <div class="opts">
            <B k={'s ' + (ed === 'id' ? 'on' : '')} onClick={() => setEd(ed === 'id' ? 'none' : 'id')}>
              Name and colours
            </B>
            <B k={'s ' + (ed === 'crest' ? 'on' : '')} onClick={() => setEd(ed === 'crest' ? 'none' : 'crest')}>
              Crest
            </B>
            <B k={'s ' + (ed === 'shirt' ? 'on' : '')} onClick={() => setEd(ed === 'shirt' ? 'none' : 'shirt')}>
              Shirt
            </B>
          </div>
          {dirty && (
            <div class="p hot row">
              <span class="grow">{d.name !== c.name && g.day > 0 ? 'Renaming costs $5,000 and 6% of your fans.' : 'Unsaved changes.'}</span>
              <B
                k="s q"
                onClick={() =>
                  setD({ name: c.name, tag: c.tag, c1: c.c1, c2: c.c2, c3: c.c3, motto: c.motto, crest: c.crest, jersey: c.jersey })
                }
              >
                Undo
              </B>
              <B k="s p" onClick={() => act({ t: 'brand', club: d })}>
                Apply
              </B>
            </div>
          )}
          {ed === 'id' && (
            <div class="col">
              <div class="row">
                <label class="f grow">
                  <span>Name</span>
                  <input type="text" maxLength={22} value={d.name} onInput={e => setD({ ...d, name: (e.target as any).value })} />
                </label>
                <label class="f" style={{ width: 90 }}>
                  <span>Tag</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={d.tag}
                    onInput={e => setD({ ...d, tag: (e.target as any).value.toUpperCase() })}
                  />
                </label>
              </div>
              <label class="f">
                <span>Motto</span>
                <input type="text" maxLength={48} value={d.motto} onInput={e => setD({ ...d, motto: (e.target as any).value })} />
              </label>
              <Swatches
                label="First colour"
                v={d.c1}
                set={x =>
                  setD({ ...d, c1: x, crest: { ...d.crest, c1: x, c2: mixHex(x, '#000000', 0.22) }, jersey: { ...d.jersey, c1: x } })
                }
              />
              <Swatches label="Second colour" v={d.c2} set={x => setD({ ...d, c2: x, jersey: { ...d.jersey, c2: x } })} />
              <Swatches
                label="Third colour"
                v={d.c3}
                set={x => setD({ ...d, c3: x, crest: { ...d.crest, c3: x }, jersey: { ...d.jersey, c3: x } })}
              />
            </div>
          )}
          {ed === 'crest' && <CrestEd c={d.crest} set={crest => setD({ ...d, crest })} />}
          {ed === 'shirt' && <ShirtEd j={d.jersey} set={jersey => setD({ ...d, jersey })} />}
          {ed === 'none' && (
            <div class="row w" style={{ gap: 14 }}>
              <Shirt j={d.jersey} crest={d.crest} w={150} sponsor={sp} />
              <Shirt j={d.jersey} crest={d.crest} side="back" w={150} name={g.mgr.name.split(' ').pop()} num={6} />
              <Shirt j={d.jersey} crest={d.crest} away w={150} sponsor={sp} />
            </div>
          )}
        </div>
        <div style={{ position: 'relative', height: 420, background: mixHex(d.c1, '#07090b', 0.72), overflow: 'hidden' }}>
          <ShirtStage j={d.jersey} crest={d.crest} name={g.mgr.name.split(' ').pop() ?? ''} num={6} sponsor={sp ?? ''} accent={d.c1} />
        </div>
      </div>
    </>
  );
}
function Games() {
  const g = G_();
  return (
    <div class="col">
      {TITLES.map(t => {
        const on = !!g.squads[t],
          d = TITLE[t];
        const T = on ? g.teams[meId(t)] : null;
        const s = on ? g.seasons[t]! : null;
        const pos = on ? sorted(s!.tables[T!.div] ?? []).findIndex(x => isMe(x.team)) + 1 : 0;
        return (
          <div class="p row" key={t}>
            <Gi k={TI[t]} s={36} />
            <div class="grow">
              <h3>{tName(t)}</h3>
              <span class="sm sec">
                {d.genre}. {d.format}. Matches on{' '}
                {['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][d.matchDow]}.
              </span>
            </div>
            {on ? (
              <span class="chip g">
                {DIV_NAME[T!.div]}
                {pos ? `, ${pos}${['st', 'nd', 'rd'][pos - 1] ?? 'th'}` : ''}
              </span>
            ) : (
              <B
                k="p s"
                disabled={g.club.cash < TITLE_ENTRY_COST[t]}
                onClick={() =>
                  ask(
                    `Enter ${tName(t)}?`,
                    `${$(TITLE_ENTRY_COST[t])} to enter Division 3 with five hopefuls. Wages and travel start next Monday.`,
                    'Enter',
                    () => act({ t: 'addTitle', title: t }),
                  )
                }
              >
                Enter, {$(TITLE_ENTRY_COST[t], true)}
              </B>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Honours() {
  const g = G_();
  return (
    <>
      <div class="g4">
        <div class="p">
          <Kv l="Won" v={g.stats.w} />
        </div>
        <div class="p">
          <Kv l="Lost" v={g.stats.l} />
        </div>
        <div class="p">
          <Kv l="Trophies" v={g.trophies.length} />
        </div>
        <div class="p">
          <Kv l="Since" v={dateOf(0).getUTCFullYear()} />
        </div>
      </div>
      <h2>Trophies</h2>
      {g.trophies.length ? (
        <div class="col" style={{ gap: 6 }}>
          {g.trophies.map((x, i) => (
            <div class="p row" key={i}>
              <span class="am">{UI('trophy', 22)}</span>
              <b class="grow">
                {x.name}, {tShort(x.title)}
              </b>
              <span class="mut sm">
                {fmtShort(x.day)} {dateOf(x.day).getUTCFullYear()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p class="sec">The hall is empty. For now.</p>
      )}
      <h2>Recent matches</h2>
      <table>
        <tbody>
          {g.recs.map((r, i) => (
            <tr
              class="k"
              key={i}
              onClick={() => {
                app.postmatch = r;
                bump();
              }}
            >
              <td class="sec">{fmtShort(r.day)}</td>
              <td>
                <span class="chip">{tShort(r.title)}</span>
              </td>
              <td>{r.opp}</td>
              <td class="sec">{r.comp === 'league' ? r.stage : r.comp === 'masters' ? 'Masters' : 'Playoffs'}</td>
              <td class="n">
                <b class={r.win ? 'pos' : 'neg'}>
                  {r.score[0]}–{r.score[1]}
                </b>
              </td>
              <td class="mut sm">{r.cfgs ? 'replay' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
export type { TitleId };
