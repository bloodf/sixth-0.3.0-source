import { act, app, bump, G_, tName, tShort, useApp } from '../store.ts';
import {
  $,
  B,
  Bar,
  Cond,
  fog,
  Gi,
  Num,
  ovr,
  PFace,
  Plate,
  RoleName,
  Six,
  TitleTabs,
  UI,
  useEffect,
  useState,
  useTitle,
  on,
} from '../kit.tsx';
import { Kv, WD, fmtShort } from './shell.tsx';
import { mine } from '../../game/events.ts';
import { TITLE, ATTRS, ATTR_INFO } from '../../data/titles.ts';
import { heroPool, heroName, heroIcon } from '../../data/heroes.ts';
import { BLOCKS, BLOCK_IDS, WEEK_PRESETS, type Block } from '../../data/club.ts';
import { blockMult, dow, practiceFor } from '../../game/day.ts';
import { isMe } from '../../game/league.ts';
import type { Player, Plan } from '../../game/types.ts';
import { audio } from '../../audio/audio.ts';
import { mapsFor } from '../../sim/maps.ts';

export function SquadSheet() {
  useApp();
  const g = G_();
  const [t] = useTitle();
  const sq = g.squads[t]!;
  const [sel, setSel] = useState<number | null>(null);
  const [hero, setHero] = useState<number | null>(null);
  const all = mine(g).filter(p => p.title === t);
  const bench = all.filter(p => !sq.lineup.includes(p.id));
  useEffect(() => {
    setSel(null);
    setHero(null);
  }, [t]);
  const put = (slot: number, pid: string | null) => {
    const L = [...sq.lineup];
    const from = pid ? L.indexOf(pid) : -1;
    if (from >= 0) L[from] = L[slot];
    L[slot] = pid;
    act({ t: 'lineup', title: t, lineup: L }, true);
    setSel(null);
  };
  const clickSlot = (i: number) => {
    if (sel === null) {
      setSel(i);
      audio.play('tap');
    } else if (sel === i) {
      setSel(null);
    } else put(i, sq.lineup[sel]);
  };
  return (
    <>
      <Plate title="Squad">
        <span class="sm" style={{ fontWeight: 650 }}>
          {all.length}/8 players
        </span>
      </Plate>
      <TitleTabs />
      <div class="body">
        <div class="five">
          {TITLE[t].roles.map((r, i) => {
            const p = sq.lineup[i] ? g.players[sq.lineup[i]!] : null;
            return p ? (
              <button key={r.id} class={'slot ' + (sel === i ? 'sel' : '')} onClick={() => clickSlot(i)}>
                <PFace p={p} s="100%" h={220} px={215} />
                <span class="ov">{Math.round(ovr(p, r.id))}</span>
                <span class="st">
                  <span class="chip" style={{ background: 'rgba(7,9,11,.8)' }}>
                    {p.num}
                  </span>
                </span>
                <div class="nm">
                  <b>{p.nick}</b>
                  <span class="rl">
                    {r.name}
                    {p.role !== r.id && <span class="neg"> off role</span>}
                  </span>
                  <div style={{ marginTop: 6 }}>
                    <Bar v={p.energy} />
                  </div>
                  <div style={{ marginTop: 4, minHeight: 22 }}>
                    <Cond p={p} />
                  </div>
                </div>
              </button>
            ) : (
              <button key={r.id} class={'slot empty ' + (sel === i ? 'sel' : '')} onClick={() => clickSlot(i)}>
                {r.name}
                <br />
                empty
              </button>
            );
          })}
        </div>
        {sel !== null && (
          <div class="p hot row w" style={{ marginTop: 10 }}>
            <span class="grow">
              {sq.lineup[sel]
                ? `${g.players[sq.lineup[sel]!].nick} selected. Pick another slot or bench player to swap.`
                : `Pick a player for ${TITLE[t].roles[sel].name}.`}
            </span>
            {sq.lineup[sel] && (
              <>
                <B
                  k="s"
                  onClick={() => {
                    app.player = sq.lineup[sel]!;
                    bump();
                  }}
                >
                  Profile
                </B>
                <B k="s" onClick={() => put(sel, null)}>
                  Bench
                </B>
                <B k="s" onClick={() => act({ t: 'captain', title: t, pid: sq.lineup[sel]! })}>
                  Make captain
                </B>
              </>
            )}
            <B k="s q" onClick={() => setSel(null)}>
              Cancel
            </B>
          </div>
        )}
        <div class="g4" style={{ marginTop: 14 }}>
          <div class="p">
            <Kv l="Synergy" v={Math.round(sq.syn * 100) + '%'} />
          </div>
          <div class="p">
            <Kv l="Plan familiarity" v={Math.round(sq.fam * 100) + '%'} />
          </div>
          <div class="p">
            <Kv l="Captain" v={sq.captain ? (g.players[sq.captain]?.nick ?? 'None') : 'None'} />
          </div>
          <div class="p">
            <Kv l="Weekly wages" v={$(all.reduce((s, p) => s + (p.contract?.salary ?? 0), 0))} />
          </div>
        </div>
        {t !== 'cs2' && (
          <>
            <h2>Hero picks</h2>
            <div class="five">
              {TITLE[t].roles.map((r, i) => (
                <button
                  class={'p row ' + (hero === i ? 'sel' : '')}
                  key={r.id}
                  onClick={() => setHero(hero === i ? null : i)}
                  style={{ minWidth: 0 }}
                >
                  {sq.heroes[i] ? <Gi k={heroIcon(sq.heroes[i]!)} s={28} /> : UI('shuffle', 24)}
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sq.heroes[i] ? heroName(sq.heroes[i]!) : 'Flexible'}
                    </b>
                    <span class="xs mut">{r.name}</span>
                  </span>
                </button>
              ))}
            </div>
            {hero !== null && (
              <div class="g4" style={{ marginTop: 8 }}>
                <button
                  class="p row"
                  onClick={() => {
                    act({ t: 'hero', title: t, i: hero, hero: null }, true);
                    setHero(null);
                  }}
                >
                  {UI('shuffle', 24)}Flexible
                </button>
                {heroPool(t, TITLE[t].roles[hero].id).map(h => (
                  <button
                    class={'p row ' + (sq.heroes[hero] === h.id ? 'sel' : '')}
                    key={h.id}
                    onClick={() => {
                      act({ t: 'hero', title: t, i: hero, hero: h.id }, true);
                      setHero(null);
                    }}
                  >
                    <Gi k={h.icon} s={28} />
                    <span>
                      <b style={{ display: 'block' }}>{h.name}</b>
                      <span class="xs mut">{h.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <h2>Everyone</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th class="n">Ovr</th>
              <th>Energy</th>
              <th>Stress</th>
              <th>Morale</th>
              <th class="n">Rating</th>
              <th class="n">Wage</th>
              <th class="n">Until</th>
            </tr>
          </thead>
          <tbody>
            {[...all]
              .sort((a, b) => (sq.lineup.includes(b.id) ? 1 : 0) - (sq.lineup.includes(a.id) ? 1 : 0) || ovr(b) - ovr(a))
              .map(p => (
                <tr
                  class="k"
                  key={p.id}
                  onClick={() => {
                    if (sel !== null) put(sel, p.id);
                    else {
                      app.player = p.id;
                      bump();
                    }
                  }}
                >
                  <td>
                    <span class="row">
                      <PFace p={p} s={28} />
                      <b>{p.nick}</b>
                      {!sq.lineup.includes(p.id) && <span class="chip">bench</span>}
                      {p.listed && <span class="chip a">listed</span>}
                    </span>
                  </td>
                  <td class="sec">{RoleName(t, p.role)}</td>
                  <td class="n">
                    <Num v={ovr(p)} />
                  </td>
                  <td>
                    <Bar v={p.energy} w={54} />
                  </td>
                  <td>
                    <Bar v={p.stress} inv w={54} />
                  </td>
                  <td>
                    <Bar v={p.morale} w={54} />
                  </td>
                  <td class="n">{p.s.m ? (p.s.r / p.s.m).toFixed(2) : ''}</td>
                  <td class="n">{$(p.contract?.salary ?? 0)}</td>
                  <td class="n">{p.contract ? fmtShort(p.contract.until) : ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {bench.length === 0 && (
          <p class="sm mut" style={{ marginTop: 10 }}>
            Nobody on the bench. One injury means a stand-in.
          </p>
        )}
      </div>
    </>
  );
}
export function TrainingSheet() {
  useApp();
  const g = G_();
  const [t] = useTitle();
  const sq = g.squads[t]!;
  const [brush, setBrush] = useState<Block>('scrim');
  const [draft, setDraft] = useState<Block[][] | null>(null);
  const wk = draft ?? sq.week;
  const d = dow(g.day);
  const md = g.seasons[t]!;
  const isM = (i: number) => md.fixtures.some(f => f.day === g.day - d + i && (isMe(f.home) || isMe(f.away)));
  useEffect(() => {
    setDraft(null);
  }, [t]);
  const paint = (i: number, b: number) => {
    const n = wk.map(x => [...x]);
    n[i][b] = brush;
    setDraft(n);
    audio.play('tap');
    act({ t: 'week', title: t, week: n }, true);
    setDraft(null);
  };
  const ps = mine(g).filter(p => p.title === t);
  const av = ps.length ? ps.reduce((s, p) => s + p.attr.stam, 0) / ps.length : 50;
  const load =
    wk.flat().reduce((s, b) => {
      const e = BLOCKS[b].energy;
      return s + (e < 0 ? e * (1.3 - av / 170) * [0.75, 1, 1.3][sq.intensity] : e);
    }, 0) / 7;
  const net = load + 9.5 + av * 0.05;
  const str =
    wk
      .flat()
      .reduce(
        (s, b) =>
          s + (BLOCKS[b].stress > 0 ? BLOCKS[b].stress * [0.75, 1, 1.3][sq.intensity] * 0.95 : BLOCKS[b].stress * (b === 'mind' ? 0.9 : 1)),
        0,
      ) /
      7 -
    0.5;
  const room = practiceFor(g, t);
  return (
    <>
      <Plate title="Training" />
      <TitleTabs />
      <div class="body">
        {!room && (
          <div class="p hot" style={{ marginBottom: 12 }}>
            No practice room for this squad. Scrims and aim work run at two thirds.
          </div>
        )}
        <div class="brush">
          {BLOCK_IDS.map(b => (
            <button
              key={b}
              class={'cell ' + (brush === b ? 'on' : '')}
              data-b={b}
              onClick={() => {
                setBrush(b);
                audio.play('tap');
              }}
              title={BLOCKS[b].desc}
              aria-pressed={brush === b}
            >
              {UI(BLOCKS[b].icon, 18)}
              {BLOCKS[b].name}
            </button>
          ))}
        </div>
        <p class="sm sec" style={{ margin: '8px 0 14px' }}>
          <b>{BLOCKS[brush].name}.</b> {BLOCKS[brush].desc} Your setup runs it at {Math.round(blockMult(g, sq, brush) * 100)}%.
        </p>
        <div class="tg">
          <div />
          {WD.map((n, i) => (
            <div class={'hd ' + (i === d ? 'tod' : '')} key={n}>
              {n}
              {isM(i) ? ' · match' : ''}
            </div>
          ))}
          {['Morning', 'Afternoon', 'Evening'].map((l, b) => (
            <>
              {
                <div class="rh" key={l}>
                  {l}
                </div>
              }
              {WD.map((_, i) =>
                isM(i) && b > 0 ? (
                  <div class="cell mt" key={i}>
                    Match
                  </div>
                ) : (
                  <button
                    class="cell"
                    data-b={wk[i][b]}
                    key={i}
                    aria-label={`${WD[i]} ${l}: ${BLOCKS[wk[i][b]].name}`}
                    onClick={() => paint(i, b)}
                  >
                    {UI(BLOCKS[wk[i][b]].icon, 16)}
                    {BLOCKS[wk[i][b]].name}
                  </button>
                ),
              )}
            </>
          ))}
        </div>
        <div class="g2" style={{ marginTop: 18 }}>
          <div>
            <h2>Intensity</h2>
            <div class="opts">
              {['Light', 'Normal', 'Hard'].map((l, i) => (
                <B k={sq.intensity === i ? 'on' : ''} key={l} onClick={() => act({ t: 'intensity', title: t, v: i }, true)}>
                  {l}
                </B>
              ))}
            </div>
            <h2>Weekly outlook</h2>
            <div class="g2">
              <div class="p">
                <Kv
                  l="Energy a day"
                  v={
                    <span class={net < -3 ? 'neg' : net > 2 ? 'pos' : ''}>
                      {net >= 0 ? '+' : '−'}
                      {Math.abs(net).toFixed(1)}
                    </span>
                  }
                />
              </div>
              <div class="p">
                <Kv
                  l="Stress a day"
                  v={
                    <span class={str > 2 ? 'neg' : str < 0 ? 'pos' : ''}>
                      {str >= 0 ? '+' : '−'}
                      {Math.abs(str).toFixed(1)}
                    </span>
                  }
                />
              </div>
            </div>
          </div>
          <div>
            <h2>Ready-made weeks</h2>
            <div class="col" style={{ gap: 6 }}>
              {Object.entries(WEEK_PRESETS).map(([k, p]) => (
                <button class="p" style={{ padding: '8px 12px' }} key={k} onClick={() => act({ t: 'week', title: t, week: p.week }, true)}>
                  <b>{p.name}</b>
                  <span class="sm mut" style={{ marginLeft: 8 }}>
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <h2>Who grows</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th class="n">Age</th>
              <th class="n">Ovr</th>
              <th>Room to grow</th>
              {ATTRS.slice(0, 12).map(a => (
                <th class="n" key={a} title={ATTR_INFO[a].name}>
                  {ATTR_INFO[a].name.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ps.map(p => (
              <tr
                class="k"
                key={p.id}
                onClick={() => {
                  app.player = p.id;
                  bump();
                }}
              >
                <td>
                  <b>{p.nick}</b>
                </td>
                <td class="n">{p.age}</td>
                <td class="n">
                  <Num v={ovr(p)} />
                </td>
                <td>
                  <Bar v={Math.min(100, Math.max(3, (p.pot - ovr(p)) * 6))} w={70} />
                </td>
                {ATTRS.map(a => (
                  <td class="n" key={a}>
                    <Num v={p.attr[a]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
const SL: Record<string, Record<keyof Omit<Plan, 'focus'>, [string, string, string]>> = {
  cs2: {
    tempo: ['Tempo', 'Slow defaults', 'Early executes'],
    style: ['Structure', 'By the book', 'Loose, more fakes'],
    risk: ['Risk', 'Save and sit back', 'Force buys, pushes'],
  },
  val: {
    tempo: ['Tempo', 'Slow defaults', 'Early executes'],
    style: ['Structure', 'By the book', 'Loose, more fakes'],
    risk: ['Risk', 'Save and sit back', 'Force buys, pushes'],
  },
  dota: {
    tempo: ['Tempo', 'Scale late', 'Group early'],
    style: ['Structure', 'By the book', 'Improvise'],
    risk: ['Risk', 'Pick fights carefully', 'Fight on sight'],
  },
  ow: {
    tempo: ['Tempo', 'Poke and wait', 'Engage first'],
    style: ['Structure', 'Stay together', 'Flank freely'],
    risk: ['Risk', 'Bank ultimates', 'Spend to win fights'],
  },
};
const FOC: Record<string, [string, string][]> = {
  cs2: [
    ['auto', 'Read the map'],
    ['A', 'Lean A'],
    ['B', 'Lean B'],
  ],
  val: [
    ['auto', 'Read the map'],
    ['A', 'Lean A'],
    ['B', 'Lean B'],
  ],
  dota: [
    ['auto', 'Any lane'],
    ['0', 'Top'],
    ['1', 'Mid'],
    ['2', 'Bottom'],
  ],
  ow: [
    ['auto', 'Balanced'],
    ['dive', 'Dive'],
    ['brawl', 'Brawl'],
    ['poke', 'Poke'],
  ],
};
export function TacticsSheet() {
  useApp();
  const g = G_();
  const [t] = useTitle();
  const sq = g.squads[t]!;
  const [p, setP] = useState<Plan>(sq.plan);
  useEffect(() => {
    setP(sq.plan);
  }, [t, JSON.stringify(sq.plan)]);
  const dirty = JSON.stringify(p) !== JSON.stringify(sq.plan);
  const d =
    Math.abs(p.style - sq.plan.style) +
    Math.abs(p.tempo - sq.plan.tempo) +
    Math.abs(p.risk - sq.plan.risk) +
    (p.focus !== sq.plan.focus ? 0.15 : 0);
  const s = g.seasons[t]!;
  return (
    <>
      <Plate title="Tactics" />
      <TitleTabs />
      <div class="body">
        <div class="g2">
          <div class="col" style={{ gap: 18 }}>
            {(['tempo', 'style', 'risk'] as const).map(k => (
              <label class="f" key={k}>
                <span style={{ color: 'var(--t1)', fontSize: 16 }}>{SL[t][k][0]}</span>
                <input type="range" min="0" max="1" step="0.05" value={p[k]} onInput={e => setP({ ...p, [k]: +(e.target as any).value })} />
                <span class="row sb xs">
                  <span>{SL[t][k][1]}</span>
                  <span>{SL[t][k][2]}</span>
                </span>
              </label>
            ))}
            <div class="col" style={{ gap: 6 }}>
              <b>{t === 'ow' ? 'Composition' : t === 'dota' ? 'Favoured lane' : 'Favoured site'}</b>
              <div class="opts">
                {FOC[t].map(([k, l]) => (
                  <B k={'s ' + (p.focus === k ? 'on' : '')} key={k} onClick={() => setP({ ...p, focus: k })}>
                    {l}
                  </B>
                ))}
              </div>
            </div>
            {dirty && (
              <div class="p hot row w">
                <span class="grow">Costs {Math.max(1, Math.round(d * 9))}% familiarity.</span>
                <B k="s q" onClick={() => setP(sq.plan)}>
                  Undo
                </B>
                <B k="s p" onClick={() => act({ t: 'plan', title: t, plan: p })}>
                  Install plan
                </B>
              </div>
            )}
          </div>
          <div class="col">
            <div class="p col">
              <div class="row sb">
                <b>Familiarity</b>
                <b class="num">{Math.round(sq.fam * 100)}%</b>
              </div>
              <Bar v={sq.fam * 100} />
              <span class="sm mut">Tactics blocks build it. Changes and rest erode it.</span>
            </div>
            <div class="p col">
              <div class="row sb">
                <b>Synergy</b>
                <b class="num">{Math.round(sq.syn * 100)}%</b>
              </div>
              <Bar v={sq.syn * 100} />
              <span class="sm mut">Time together. Scrims and team time help; signings reset some of it.</span>
            </div>
            <div class="p col">
              <div class="row sb">
                <b>Opponent prep</b>
                <b class="num">{Math.round(sq.prep * 100)}%</b>
              </div>
              <Bar v={sq.prep * 100} />
              <span class="sm mut">VOD review, faster with an analyst.</span>
            </div>
            <div class="p col">
              <b>Map pool this season</b>
              <div class="opts">
                {s.maps.map(m => (
                  <span class="chip" key={m}>
                    {mapsFor(t).find(x => x.id === m)?.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <h2>On stage</h2>
        <p class="sec" style={{ maxWidth: 620 }}>
          During a live match you call{' '}
          {t === 'dota'
            ? 'group pushes, farm, hunts and the river boss'
            : t === 'ow'
              ? 'engages, resets and when to spend ultimates'
              : 'the strategy for each round, the buy, and timeouts'}{' '}
          from the bench. Orders reach the players at the next natural moment, never mid-action.
        </p>
      </div>
    </>
  );
}
export { tName, tShort, Six, on };
export type { Player };
