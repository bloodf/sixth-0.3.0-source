/** The house as a place where people live: what just went wrong, who cannot stand whom, and what to do about the dishes. */
import { act, app, bump, decide, G_, go, incidentDone, useApp } from '../store.ts';
import { $, B, Bar, MoodMark, PFace, Plate, SFace, Tabs, UI, useEffect, useState } from '../kit.tsx';
import { INC } from '../../game/incidents.ts';
import { dirt, emoOf, houseCost, moraleOf, nameOf, people, rel, relKey, type Feed } from '../../game/life.ts';
import { EMO, FEED, HOUSE, MEALS, QUIRKS } from '../../data/life.ts';
import { ROOMS, STAFF } from '../../data/club.ts';
import { audio } from '../../audio/audio.ts';
import { openEditor } from './build.tsx';
import { tShort } from '../store.ts';
import type { G } from '../../game/types.ts';
void [
  UI('wind'),
  UI('users'),
  UI('hammer'),
  UI('heart'),
  UI('message-circle'),
  UI('utensils'),
  UI('droplets'),
  UI('gamepad-2'),
  UI('flame'),
  UI('bath'),
  UI('ear'),
  UI('sandwich'),
  UI('popcorn'),
  UI('siren'),
  UI('handshake'),
  UI('trash'),
  UI('sofa'),
];
/** anybody's face, player or staff */
export const AnyFace = ({
  id,
  s = 40,
  h,
  crop,
  px,
}: {
  id: string;
  s?: number | string;
  h?: number | string;
  crop?: 'bust' | 'half' | 'full';
  px?: number;
}) => {
  const g = G_();
  const p = g.players[id];
  if (p) return <PFace p={p} s={s} h={h} crop={crop} px={px} />;
  const st = g.staff.find(x => x.id === id);
  return st ? <SFace st={st} s={s} h={h} crop={crop} px={px} /> : null;
};
export const feedText = (g: G, f: Feed) => {
  const t = FEED[f.k]?.t ?? '';
  return t
    .replace(/\{a\}/g, nameOf(g, f.a))
    .replace(/\{b\}/g, f.o ? nameOf(g, f.o) : '')
    .replace(/\{x\}/g, f.x ?? '');
};
const BN = ['morning', 'afternoon', 'evening', 'night'];
export function FeedList({ n, id, days }: { n: number; id?: string; days?: number }) {
  const g = G_();
  const L = g.life.feed.filter(f => (!id || f.a === id || f.o === id) && (!days || g.day - f.d < days)).slice(0, n);
  if (!L.length) return <p class="sm mut">Quiet so far.</p>;
  return (
    <div class="hfeed">
      {L.map((f, i) => (
        <button
          key={i + f.k + f.a + f.d}
          onClick={() => {
            if (f.a !== 'me') {
              app.player = f.a;
              audio.play('tap');
              bump();
            }
          }}
        >
          <span class="pair">
            {f.a !== 'me' && <AnyFace id={f.a} s={30} />}
            {f.o && f.k !== 'inc' && <AnyFace id={f.o} s={30} />}
          </span>
          <span class={'grow fx' + FEED[f.k].tone}>
            {feedText(g, f)}
            {days !== 1 && (
              <span class="mut"> {f.d === g.day ? BN[f.b] : f.d === g.day - 1 ? 'yesterday' : `${g.day - f.d} days ago`}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
// ---------- incident
export function IncidentDlg() {
  const a = useApp();
  const g = G_();
  const i = g.life.inc;
  const [last, setLast] = useState<{ t: string } | null>(null);
  useEffect(() => {
    if (i) setLast({ t: INC[i.id].title(g, i) });
  }, [i?.id]);
  const d = i ? INC[i.id] : null;
  const ch = i && d ? d.choices(g, i) : [];
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (a.outcome && (e.key === 'Enter' || e.key === ' ')) incidentDone();
      const n = +e.key;
      const c = ch[n - 1];
      if (c && !a.outcome && (c.cost ?? 0) <= g.club.cash) decide(c.id);
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  });
  return (
    <div class="incident" role="dialog" aria-modal="true">
      <div class="lb">
        {!a.outcome && <b>{d?.ctx === 'match' ? 'Match morning' : 'Live from the house'}</b>}
        <span>{a.outcome ? 'Afterwards' : i ? `Day ${g.day + 1}, ${BN[i.b] ?? 'morning'}` : ''}</span>
      </div>
      <div class="pan">
        <div>
          <h1>{a.outcome ? last?.t : d && i ? d.title(g, i) : ''}</h1>
          <p>{a.outcome || (d && i ? d.body(g, i) : '')}</p>
          {i?.who && !a.outcome && (
            <div class="row" style={{ marginTop: 14 }}>
              <AnyFace id={i.who} s={54} />
              {i.oth && g.players[i.oth] && <AnyFace id={i.oth} s={54} />}
            </div>
          )}
        </div>
        {a.outcome ? (
          <div class="row end">
            <B k="p l" onClick={incidentDone}>
              Carry on
            </B>
          </div>
        ) : (
          <div class="opts2">
            {ch.map((c, n) => (
              <button key={c.id} disabled={(c.cost ?? 0) > g.club.cash} onClick={() => decide(c.id)}>
                <kbd>{n + 1}</kbd>
                <span class="grow">
                  <b>{c.label}</b>
                  <span class="sm sec">{c.hint}</span>
                </span>
                {!!c.cost && <b>{$(c.cost)}</b>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ---------- a room, picked on the home screen
export function RoomPop() {
  const a = useApp();
  const g = G_();
  const r = g.rooms.find(x => x.id === a.room);
  if (!r) return null;
  const off = () => {
    app.room = null;
    app.hq?.focusRoom(null);
    bump();
  };
  const m = Math.round(g.life.mess[r.type] ?? 0);
  const role = Object.values(STAFF).find(s => s.room === r.type);
  return (
    <div class="roompop">
      <div class="nm">
        <b>
          {ROOMS[r.type].name}
          {r.title ? ` ${tShort(r.title)}` : ''}
        </b>
        <span class="sm sec">
          Level {r.lvl}, {r.w} × {r.h} m{m > 14 ? `, ${m > 60 ? 'filthy' : m > 34 ? 'messy' : 'lived in'}` : ''}
        </span>
      </div>
      <button
        class="rb pr"
        onClick={() => {
          app.room = null;
          openEditor(r.id);
        }}
      >
        {UI('hammer', 20)}Edit room
      </button>
      {r.type === 'practice' && (
        <button
          class="rb"
          onClick={() => {
            app.title = r.title!;
            go('hq', { tab: 'gear' });
          }}
        >
          {UI('monitor', 20)}Computers
        </button>
      )}
      {r.type === 'practice' && (
        <button
          class="rb"
          onClick={() => {
            app.title = r.title!;
            go('hq', { tab: 'seats' });
          }}
        >
          {UI('armchair', 20)}Seating
        </button>
      )}
      {role && (
        <button class="rb" onClick={() => go('staff', { role: role.id })}>
          {UI('users', 20)}Staff
        </button>
      )}
      <button class="rb" onClick={() => go('house')}>
        {UI('heart', 20)}People
      </button>
      <button class="rb" onClick={off} aria-label="Close">
        {UI('x', 20)}Back
      </button>
    </div>
  );
}
// ---------- the house sheet
const need = (v: number) => (v < 28 ? 'var(--loss)' : v < 50 ? 'var(--warn)' : 'var(--win)');
/** what is wrong with them, in their own order */
const gripe = (g: G, id: string) => {
  const l = g.life.p[id];
  const o = [
    l.anger > 60 && 'One more thing and it blows.',
    l.hyg < 28 && (l.dry > 1 ? `${l.dry} days without a shower.` : 'Could use a shower.'),
    l.hun < 26 && 'Has not eaten properly.',
    l.fun < 22 && 'Has not laughed in days.',
    l.soc < 22 && 'Feels alone in a full house.',
  ].filter(Boolean);
  return o.length ? o.slice(0, 2).join(' ') : 'Nothing to complain about, today.';
};
export const NEEDS: [string, string, (g: G, id: string) => number][] = [
  ['Fed', 'utensils', (g, id) => g.life.p[id].hun],
  ['Washed', 'droplets', (g, id) => g.life.p[id].hyg],
  ['Fun', 'gamepad-2', (g, id) => g.life.p[id].fun],
  ['Company', 'message-circle', (g, id) => g.life.p[id].soc],
  ['Temper', 'flame', (g, id) => 100 - g.life.p[id].anger],
];
export function HouseSheet() {
  useApp();
  const g = G_();
  const [tab, setTab] = useState('people');
  const ids = people(g);
  const d = Math.round(dirt(g));
  const R = g.life.rules;
  const set = (n: Partial<typeof R>) => act({ t: 'house', rules: { ...R, ...n } });
  const pairs = Object.entries(g.life.rel)
    .map(([k, v]) => ({ a: k.split('|')[0], b: k.split('|')[1], v }))
    .sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  return (
    <>
      <Plate title="The house">
        <span class="sm sec">{d > 60 ? 'A pigsty' : d > 36 ? 'Messy' : d > 16 ? 'Lived in' : 'Spotless'}</span>
      </Plate>
      <Tabs
        v={tab}
        set={setTab}
        items={[
          ['people', 'People'],
          ['ties', 'Who likes whom'],
          ['rules', 'House rules'],
          ['diary', 'Diary'],
        ]}
      />
      <div class="body">
        {tab === 'people' && (
          <div class="housegrid">
            {ids.map(id => {
              const e = emoOf(g, id);
              return (
                <button
                  class="hp"
                  key={id}
                  onClick={() => {
                    audio.play('tap');
                    app.player = id;
                    bump();
                  }}
                >
                  <AnyFace id={id} s={104} />
                  <span class="hpi">
                    <b>{nameOf(g, id)}</b>
                    <span class="hsay">
                      <span style={{ color: EMO[e].col }}>{EMO[e].name}.</span> {gripe(g, id)}
                    </span>
                    <span class="mn">
                      {NEEDS.map(([n, ic, f]) => {
                        const v = f(g, id);
                        return (
                          <i key={n} title={`${n} ${Math.round(v)}`} style={{ color: v < 35 ? need(v) : undefined }}>
                            {UI(ic, 14)}
                            <em>
                              <u style={{ width: v + '%', height: '100%', background: need(v) }} />
                            </em>
                          </i>
                        );
                      })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {tab === 'ties' && (
          <div class="g2">
            <div>
              <h2>Close</h2>
              {pairs
                .filter(p => p.v > 8)
                .slice(0, 9)
                .map(p => (
                  <Tie key={p.a + p.b} {...p} />
                ))}
              {!pairs.some(p => p.v > 8) && <p class="sec">Nobody has got to know anybody yet.</p>}
            </div>
            <div>
              <h2>Bad blood</h2>
              {pairs
                .filter(p => p.v < -5)
                .slice(0, 9)
                .map(p => (
                  <Tie key={p.a + p.b} {...p} fix />
                ))}
              {!pairs.some(p => p.v < -5) && <p class="sec">No grudges. Enjoy it.</p>}
            </div>
          </div>
        )}
        {tab === 'rules' && (
          <div class="col" style={{ gap: 18 }}>
            <div>
              <h2>Food</h2>
              <div class="g3">
                {MEALS.map(([n, t, c], i) => (
                  <button class={'p ' + (R.meals === i ? 'sel' : '')} key={n} onClick={() => set({ meals: i as 0 | 1 | 2 })}>
                    <h3>{n}</h3>
                    <p class="sm sec">{t}</p>
                    <span class="sm" style={{ color: 'var(--warn)' }}>
                      {c ? `${$(c * ids.length)} a week` : 'Free'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2>Rules on the fridge</h2>
              <div class="g2">
                {HOUSE.map(h => (
                  <button
                    class={'p row ' + (R[h.k] ? 'sel' : '')}
                    key={h.k}
                    onClick={() => set({ [h.k]: !R[h.k] })}
                    style={{ alignItems: 'flex-start' }}
                  >
                    <span style={{ color: R[h.k] ? 'var(--amber)' : 'var(--t3)', marginTop: 2 }}>
                      {UI(R[h.k] ? 'circle-check' : 'circle', 20)}
                    </span>
                    <span class="grow">
                      <b>{h.name}</b>
                      <span class="sm sec" style={{ display: 'block' }}>
                        {h.desc}
                      </span>
                      <span class="xs mut">{h.cost}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2>Dirt</h2>
              <div class="g2">
                {g.rooms.map(r => {
                  const v = g.life.mess[r.type] ?? 0;
                  return (
                    <div class="row sm" key={r.id}>
                      <span class="grow sec">{ROOMS[r.type].name}</span>
                      <Bar v={v} inv w={150} />
                    </div>
                  );
                })}
              </div>
              <p class="sm mut" style={{ marginTop: 10 }}>
                A housekeeper, a cleaning rota, waste bins and tidy people bring it down. Everything else brings it up.
              </p>
            </div>
            {houseCost(g) > 0 && <p class="sm sec">Food comes to {$(houseCost(g))} a week.</p>}
          </div>
        )}
        {tab === 'diary' && <FeedList n={60} />}
      </div>
    </>
  );
}
function Tie({ a, b, v, fix }: { a: string; b: string; v: number; fix?: boolean }) {
  const g = G_();
  const can = g.life.p[a]?.care < g.day;
  return (
    <div class="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
      <AnyFace id={a} s={38} />
      <AnyFace id={b} s={38} />
      <span class="grow sm">
        <b>{nameOf(g, a)}</b> and <b>{nameOf(g, b)}</b>
        <span class="relbar" style={{ display: 'block', marginTop: 5 }}>
          <i
            style={{
              left: v < 0 ? 50 + v / 2 + '%' : '50%',
              width: Math.abs(v) / 2 + '%',
              background: v < 0 ? 'var(--loss)' : 'var(--win)',
            }}
          />
        </span>
      </span>
      {fix && (
        <B k="s" disabled={!can} title={can ? '' : 'Tomorrow again'} onClick={() => act({ t: 'care', id: a, o: b, c: 'mediate' })}>
          Sit them down
        </B>
      )}
    </div>
  );
}
// ---------- one person's life, inside the person dialog
export function LifePane({ id }: { id: string }) {
  const g = G_();
  const l = g.life.p[id];
  if (!l) return <p class="sec">Lives elsewhere.</p>;
  const e = emoOf(g, id);
  const can = l.care < g.day;
  const others = people(g)
    .filter(o => o !== id && g.life.rel[relKey(id, o)] !== undefined)
    .map(o => ({ o, v: rel(g, id, o) }))
    .sort((x, y) => Math.abs(y.v) - Math.abs(x.v))
    .slice(0, 5);
  const worst = others.find(x => x.v < -8);
  const CARE: [string, string, string, boolean][] = [
    ['listen', 'Listen', 'ear', true],
    ['food', 'Order food, $35', 'sandwich', l.hun < 80],
    ['shower', 'Send to the shower', 'bath', l.hyg < 55],
    ['night', 'Night out, $120', 'popcorn', true],
    ['warn', 'Have a word', 'siren', true],
  ];
  return (
    <>
      <div class="row">
        <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: EMO[e].col, color: '#0a0c0f' }}>
          {UI(EMO[e].icon, 24)}
        </span>
        <div class="grow">
          <b class="xc" style={{ fontSize: 26, textTransform: 'uppercase', display: 'block', lineHeight: 0.95 }}>
            {EMO[e].name}
          </b>
          <span class="sm sec">{gripe(g, id)}</span>
        </div>
        <span class="lab">Mood {Math.round(moraleOf(g, id))}</span>
      </div>
      <div class="needs">
        {NEEDS.map(([n, i, f]) => {
          const v = f(g, id);
          return (
            <div class="need" key={n}>
              <span style={{ color: need(v) }}>{UI(i, 18)}</span>
              <span>{n}</span>
              <b class="num">{Math.round(v)}</b>
              <div class="bar">
                <i style={{ width: v + '%', background: need(v) }} />
              </div>
            </div>
          );
        })}
      </div>
      <div class="g3" style={{ gap: 8 }}>
        {l.q.map(q => (
          <div class="quirk" key={q}>
            <b>{QUIRKS[q].name}</b>
            {QUIRKS[q].desc}
          </div>
        ))}
      </div>
      <div class="row w">
        {CARE.filter(c => c[3]).map(([c, n, i]) => (
          <B
            key={c}
            k="s"
            disabled={!can}
            title={can ? '' : 'You already spent time together today'}
            onClick={() => act({ t: 'care', id, c })}
          >
            {UI(i, 16)}
            {n}
          </B>
        ))}
        {worst && (
          <B k="s" disabled={!can} onClick={() => act({ t: 'care', id, o: worst.o, c: 'mediate' })}>
            {UI('handshake', 16)}Sit down with {nameOf(g, worst.o)}
          </B>
        )}
      </div>
      {others.length > 0 && (
        <div>
          <h2>Closest, for better or worse</h2>
          {others.map(({ o, v }) => (
            <button
              class="relrow"
              key={o}
              onClick={() => {
                app.player = o;
                bump();
              }}
            >
              <AnyFace id={o} s={34} />
              <span>
                {nameOf(g, o)}
                <span class="xs mut" style={{ display: 'block' }}>
                  {v > 50
                    ? 'Inseparable'
                    : v > 20
                      ? 'Friends'
                      : v > 5
                        ? 'Getting along'
                        : v > -8
                          ? 'Neutral'
                          : v > -30
                            ? 'Tense'
                            : v > -60
                              ? 'Cannot stand each other'
                              : 'Enemies'}
                </span>
              </span>
              <span class="relbar">
                <i
                  style={{
                    left: v < 0 ? 50 + v / 2 + '%' : '50%',
                    width: Math.abs(v) / 2 + '%',
                    background: v < 0 ? 'var(--loss)' : 'var(--win)',
                  }}
                />
              </span>
              <b class="num">{Math.round(v)}</b>
            </button>
          ))}
        </div>
      )}
      <div>
        <h2>Lately</h2>
        <FeedList n={6} id={id} />
      </div>
    </>
  );
}
void MoodMark;
