import { app, bump, G_, startMatch, toast, tName, tShort, useApp } from '../store.ts';
import { ask, B, CrestI, Gi, Plate, Tabs, TI, UI, useEffect, useRef, useState, useTitle } from '../kit.tsx';
import { CodeChannel, RoomChannel, type Channel } from '../../p2p/net.ts';
import { Session, type Duel, type Mode, type PeerInfo } from '../../p2p/session.ts';
import * as LG from '../../p2p/league.ts';
import { ladder, loadRecs, seasonOf, subs, allRecs } from '../../p2p/records.ts';
import { fingerprint, myId } from '../../save/crypto.ts';
import { TITLES, type TitleId } from '../../data/titles.ts';
import { simTeam } from '../../game/match.ts';
import { meId } from '../../game/league.ts';
import { levelTeam } from '../../p2p/session.ts';
import { MAP_META } from '../../sim/maps.ts';
const net = {
  s: null as Session | null,
  room: '',
  code: null as CodeChannel | null,
  offer: '',
  syncs: new Map<string, { push: () => void; stop: () => void }>(),
};
function onDuel(d: Duel) {
  startMatch({ cfg: d.cfg!, us: d.us, kind: 'duel', title: tName(d.title), sub: d.mode === 'open' ? 'Open match' : 'Level match' });
}
async function openSession(ch: Channel, name: string) {
  net.s?.close();
  net.syncs.forEach(x => x.stop());
  net.syncs.clear();
  const s = new Session(ch, () => app.career);
  net.s = s;
  net.room = name;
  app.session = s;
  s.onDuel = onDuel;
  s.subs.add(bump);
  await s.start();
  for (const l of await LG.listLeagues()) attach(l);
  bump();
}
function attach(l: LG.PLeague) {
  if (!net.s || net.syncs.has(l.code)) return;
  net.syncs.set(
    l.code,
    LG.sync(l, net.s, () => {
      autoplay(l).then(bump);
    }),
  );
}
async function autoplay(l: LG.PLeague) {
  const v = LG.view(l);
  const me = await myId();
  if (v && v.stage === 'reveal' && v.committed.has(me) && !v.revealed.has(me)) {
    if (await LG.reveal(l, v.round)) net.syncs.get(l.code)?.push();
  }
  await LG.crunch(l);
}
export function OnlineSheet() {
  const a = useApp();
  const [tab, setTab] = useState('lobby');
  const [, f] = useState(0);
  const [id, setId] = useState('');
  const s = net.s;
  useEffect(() => {
    myId().then(p => setId(fingerprint(p)));
    loadRecs().then(() => f(1));
    const g = () => f(x => x + 1);
    subs.add(g);
    return () => {
      subs.delete(g);
    };
  }, []);
  const blocked = a.flagged > 0;
  return (
    <>
      <Plate title="Online">
        <span class="sm num" style={{ fontWeight: 650 }}>
          {id}
        </span>
      </Plate>
      <Tabs
        v={tab}
        set={setTab}
        items={[
          ['lobby', 'Lobby'],
          ['ladder', 'World ladder'],
          ['leagues', 'Private leagues'],
          ['direct', 'Direct code'],
          ['how', 'Trust'],
        ]}
        right={
          s ? (
            <span class="chip g" style={{ marginRight: 8 }}>
              {s.ch.peers().length} connected
            </span>
          ) : undefined
        }
      />
      <div class="body">
        {blocked && (
          <div class="p hot" style={{ marginBottom: 12 }}>
            This manager is flagged for save tampering. Others see the flag, and open matches are refused.
          </div>
        )}
        {tab === 'lobby' && <Lobby s={s} />}
        {tab === 'ladder' && <Ladder s={s} />}
        {tab === 'leagues' && <Leagues />}
        {tab === 'direct' && <Direct />}
        {tab === 'how' && <How />}
      </div>
    </>
  );
}
function Lobby({ s }: { s: Session | null }) {
  const [name, setName] = useState('world');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [s?.chat.length]);
  if (!s || s.closed)
    return (
      <div class="col" style={{ maxWidth: 560 }}>
        <h3>Meet other managers</h3>
        <p class="sec">
          Browsers find each other through public relays, then talk directly. Use "world" for the open lobby, or any word you share with
          friends.
        </p>
        <div class="row">
          <label class="f grow">
            <span>Room</span>
            <input type="text" value={name} maxLength={32} onInput={e => setName((e.target as any).value.replace(/[^\w-]/g, ''))} />
          </label>
        </div>
        <B
          k="p"
          disabled={busy || !name}
          onClick={async () => {
            setBusy(true);
            try {
              await openSession(new RoomChannel('lobby-' + name.toLowerCase()), name);
            } catch (e) {
              toast('Could not open the room: ' + (e as Error).message, 'err');
            }
            setBusy(false);
          }}
        >
          {busy ? 'Opening…' : 'Enter room'}
        </B>
      </div>
    );
  return (
    <div class="col">
      <div class="row">
        <b class="grow">Room: {net.room}</b>
        <B
          k="s"
          onClick={() => {
            s.close();
            net.s = null;
            app.session = null;
            net.syncs.forEach(x => x.stop());
            net.syncs.clear();
            bump();
          }}
        >
          Leave
        </B>
      </div>
      {s.duel && !['done', 'failed'].includes(s.duel.stage) && <DuelBox s={s} d={s.duel} />}
      {s.duel && s.duel.stage === 'failed' && <div class="p hot">{s.duel.msg}</div>}
      {s.challenges
        .filter(c => !c.mine)
        .map(c => {
          const p = s.peers.get(c.from);
          return (
            <div class="p hot row" key={c.id}>
              <CrestI c={p?.card?.crest as any} s={36} />
              <span class="grow">
                <b>{p?.card?.name}</b> challenge you: {tName(c.title)}, {c.mode === 'open' ? 'open squads' : 'level squads'}
              </span>
              <B k="s" onClick={() => s.cancel(c)}>
                Decline
              </B>
              <B k="s p" onClick={() => (G_().squads[c.title] ? s.accept(c) : toast(`You do not run a ${tShort(c.title)} squad`, 'err'))}>
                Accept
              </B>
            </div>
          );
        })}
      {s.challenges
        .filter(c => c.mine)
        .map(c => (
          <div class="p row" key={c.id}>
            <span class="grow sec">
              Waiting for {s.peers.get(c.from)?.card?.name ?? 'them'}: {tShort(c.title)}
            </span>
            <B k="s" onClick={() => s.cancel(c)}>
              Cancel
            </B>
          </div>
        ))}
      {[...s.peers.values()].map(p => (
        <PeerRow p={p} s={s} key={p.id} />
      ))}
      {!s.peers.size && (
        <p class="sec">Nobody else is here yet. Discovery can take half a minute. Share the room name, or use a direct code.</p>
      )}
      <h2>Chat</h2>
      <div class="p" style={{ height: 150, overflow: 'auto' }}>
        {s.chat.map((c, i) => (
          <div key={i} class="sel">
            <b style={{ color: c.me ? 'var(--amber)' : 'var(--t1)' }}>{c.who}</b> <span class="sec">{c.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        class="row"
        onSubmit={e => {
          e.preventDefault();
          if (msg.trim()) {
            s.say(msg.trim());
            setMsg('');
          }
        }}
      >
        <input type="text" maxLength={240} value={msg} aria-label="Message" onInput={e => setMsg((e.target as any).value)} />
        <B type="submit">Send</B>
      </form>
    </div>
  );
}
function PeerRow({ p, s }: { p: PeerInfo; s: Session }) {
  const [t] = useTitle();
  const [mode, setMode] = useState<Mode>('open');
  const blocked = app.flagged > 0;
  const canOpen = p.clean && !!p.ranked && !blocked && (app.career?.ranked ?? false);
  const m: Mode = mode === 'open' && !canOpen ? 'level' : mode;
  return (
    <div class="p row w">
      <CrestI c={(p.card?.crest ?? {}) as any} s={40} />
      <span class="grow">
        <b>{p.card ? `${p.card.name}` : 'Connecting'}</b>
        <span class="sm mut" style={{ display: 'block' }}>
          {p.card ? `${p.card.mgr}, ${s.fp(p.card.pub)}` : p.why}
        </span>
      </span>
      {p.ok ? (
        p.clean ? (
          <span class="chip g">verified</span>
        ) : (
          <span class="chip r">{p.why || 'flagged'}</span>
        )
      ) : (
        <span class="chip a">{p.why}</span>
      )}
      {p.ok && p.card && (
        <>
          <div class="opts">
            <B
              k={'s ' + (m === 'open' ? 'on' : '')}
              disabled={!canOpen}
              onClick={() => setMode('open')}
              title="Your real squads. Careers are replayed and verified first. Counts for the ladder."
            >
              Open
            </B>
            <B k={'s ' + (m === 'level' ? 'on' : '')} onClick={() => setMode('level')} title="Squads are scaled to equal strength.">
              Level
            </B>
          </div>
          <B
            k="s p"
            disabled={!p.card.titles.includes(t)}
            title={p.card.titles.includes(t) ? '' : `They do not run ${tShort(t)}`}
            onClick={() => s.challenge(p.id, t, m)}
          >
            Challenge, {tShort(t)}
          </B>
        </>
      )}
    </div>
  );
}
const DuelBox = ({ s, d }: { s: Session; d: Duel }) => (
  <div class="p hot col">
    <div class="row">
      <b class="grow">
        {tName(d.title)} v {d.theirCard.name}
      </b>
      <B k="s" onClick={() => s.fail('Cancelled')}>
        Cancel
      </B>
    </div>
    <span class="sec">
      {d.msg}
      {d.stage === 'verify' ? ` ${Math.round(d.progress * 100)}%` : ''}
    </span>
    {d.stage === 'verify' && (
      <div class="bar">
        <i style={{ width: d.progress * 100 + '%', background: 'var(--amber)' }} />
      </div>
    )}
  </div>
);
function Ladder({ s }: { s: Session | null }) {
  const [t] = useTitle();
  const [tt, setT] = useState<TitleId>(t);
  const [mode, setMode] = useState<Mode>('open');
  const [me, setMe] = useState('');
  useEffect(() => {
    myId().then(setMe);
  }, []);
  const sea = seasonOf(Date.now());
  const L = ladder(tt, sea, new Set(s ? [...s.banned.keys()] : []), mode);
  return (
    <>
      <div class="row w" style={{ marginBottom: 12 }}>
        <div class="opts">
          {TITLES.map(x => (
            <B k={'s ' + (x === tt ? 'on' : '')} key={x} onClick={() => setT(x)}>
              <Gi k={TI[x]} s={15} />
              {tShort(x)}
            </B>
          ))}
        </div>
        <div class="grow" />
        <div class="opts">
          <B k={'s ' + (mode === 'open' ? 'on' : '')} onClick={() => setMode('open')}>
            Open
          </B>
          <B k={'s ' + (mode === 'level' ? 'on' : '')} onClick={() => setMode('level')}>
            Level
          </B>
        </div>
      </div>
      <p class="sm sec" style={{ marginBottom: 10 }}>
        Season {sea}. Built from {allRecs().length} match records on this device, each signed by both managers and re-simulated before it
        counts. Meet people and their records merge with yours.
      </p>
      {L.length ? (
        <table>
          <thead>
            <tr>
              <th class="n">#</th>
              <th>Club</th>
              <th>Manager</th>
              <th class="n">W</th>
              <th class="n">L</th>
              <th class="n">Rating</th>
            </tr>
          </thead>
          <tbody>
            {L.map((x, i) => (
              <tr key={x.pub} class={x.pub === me ? 'me' : ''}>
                <td class="n">{i + 1}</td>
                <td>
                  <span class="row">
                    <CrestI c={x.card.crest as any} s={26} />
                    {String(x.card.name).slice(0, 24)}
                  </span>
                </td>
                <td class="sec">{String(x.card.mgr).slice(0, 24)}</td>
                <td class="n">{x.w}</td>
                <td class="n">{x.l}</td>
                <td class="n">
                  <b>{Math.round(x.elo)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="mut">No records yet this season. Play an {mode === 'open' ? 'open' : 'even'} match in the lobby.</p>
      )}
    </>
  );
}
function Leagues() {
  const [ls, setLs] = useState<LG.PLeague[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('level');
  const [t] = useTitle();
  const load = () =>
    LG.listLeagues().then(async L => {
      setLs([...L]);
      for (const l of L) {
        attach(l);
        await LG.crunch(l);
      }
      setLs([...L]);
    });
  useEffect(() => {
    load();
  }, []);
  const card = async () => {
    const g = G_();
    return {
      pub: await myId(),
      name: g.club.name,
      tag: g.club.tag,
      mgr: g.mgr.name,
      c1: g.club.c1,
      c2: g.club.c2,
      crest: g.club.crest,
      region: g.club.region,
      titles: Object.keys(g.squads) as TitleId[],
    };
  };
  const l = ls.find(x => x.code === open);
  if (l)
    return (
      <OneLeague
        l={l}
        back={() => {
          setOpen(null);
          load();
        }}
      />
    );
  return (
    <div class="g2">
      <div class="col">
        <h3>Your leagues</h3>
        {ls.map(x => {
          const v = LG.view(x);
          return (
            <button
              class="p"
              key={x.code}
              onClick={() => {
                attach(x);
                setOpen(x.code);
              }}
            >
              <div class="row sb">
                <b>{v?.name ?? 'Waiting for first sync'}</b>
                <span class="chip">{x.code}</span>
              </div>
              <span class="sm mut">
                {v
                  ? `${tShort(v.title)}, ${v.members.length} clubs, ${v.stage === 'lobby' ? 'not started' : v.stage === 'done' ? 'finished' : `round ${v.round + 1} of ${v.rounds}`}`
                  : 'Meet any member in a room to receive it.'}
              </span>
            </button>
          );
        })}
        {!ls.length && <p class="sec">None yet. Leagues live on the members' devices and merge when any two meet.</p>}
      </div>
      <div class="col" style={{ gap: 18 }}>
        <div class="p col">
          <h3>Create</h3>
          <input type="text" placeholder="League name" value={name} maxLength={28} onInput={e => setName((e.target as any).value)} />
          <div class="row">
            <span class="chip">
              <Gi k={TI[t]} s={14} />
              {tShort(t)}
            </span>
            <div class="opts">
              <B k={'s ' + (mode === 'level' ? 'on' : '')} onClick={() => setMode('level')}>
                Level squads
              </B>
              <B k={'s ' + (mode === 'open' ? 'on' : '')} onClick={() => setMode('open')}>
                Open squads
              </B>
            </div>
          </div>
          <B
            k="p"
            disabled={!name.trim()}
            onClick={async () => {
              const x = await LG.createLeague(name.trim(), t, mode, await card());
              attach(x);
              await load();
              setOpen(x.code);
            }}
          >
            Create for {tShort(t)}
          </B>
        </div>
        <div class="p col">
          <h3>Join</h3>
          <input
            type="text"
            placeholder="ABCD-1234"
            value={code}
            maxLength={9}
            onInput={e => setCode((e.target as any).value.toUpperCase())}
          />
          <B
            disabled={!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)}
            onClick={async () => {
              const x = await LG.joinLeague(code, await card());
              if (!net.s || net.s.closed) {
                try {
                  await openSession(new RoomChannel('league-' + code.toLowerCase()), code);
                } catch {
                  toast('Offline: it will sync when you next enter a room', 'info');
                }
              }
              attach(x);
              await load();
              setOpen(x.code);
            }}
          >
            Join league
          </B>
        </div>
      </div>
    </div>
  );
}
function OneLeague({ l, back }: { l: LG.PLeague; back: () => void }) {
  const [, f] = useState(0);
  const [me, setMe] = useState('');
  useEffect(() => {
    myId().then(setMe);
    const iv = setInterval(() => autoplay(l).then(() => f(x => x + 1)), 2500);
    autoplay(l).then(() => f(x => x + 1));
    return () => clearInterval(iv);
  }, [l.code]);
  const v = LG.view(l);
  const push = () => net.syncs.get(l.code)?.push();
  const connect = async () => {
    try {
      await openSession(new RoomChannel('league-' + l.code.toLowerCase()), l.code);
      attach(l);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
    f(x => x + 1);
  };
  const live = net.s && !net.s.closed;
  const nm = (p: string) => v?.members.find(m => m.pub === p);
  if (!v)
    return (
      <div class="col">
        <B k="s q" onClick={back}>
          Back
        </B>
        <p class="sec">Waiting to receive league {l.code} from a member.</p>
        {!live && (
          <B k="p" onClick={connect}>
            Connect to members
          </B>
        )}
      </div>
    );
  return (
    <div class="col">
      <div class="row">
        <B k="s q" onClick={back}>
          {UI('chevron-left', 16)}Leagues
        </B>
        <h3 class="grow">{v.name}</h3>
        <span class="chip sel">{l.code}</span>
        <span class="chip">
          {tShort(v.title)}, {v.mode === 'level' ? 'level squads' : 'open squads'}
        </span>
        {live ? (
          <span class="chip g">{net.s!.ch.peers().length} here</span>
        ) : (
          <B k="s" onClick={connect}>
            Connect
          </B>
        )}
      </div>
      {v.stage === 'lobby' ? (
        <>
          <p class="sec">Share the code. The creator starts once everyone is in.</p>
          <div class="g2">
            {v.members.map(m => (
              <div class="p row" key={m.pub}>
                <CrestI c={m.crest as any} s={36} />
                <span>
                  <b>{m.name}</b>
                  <span class="sm mut" style={{ display: 'block' }}>
                    {m.mgr}
                    {m.pub === v.owner ? ', creator' : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {me === v.owner && (
            <B
              k="p"
              disabled={v.members.length < 2}
              onClick={async () => {
                await LG.post(l, 'start', { members: v.members.map(m => m.pub) });
                push();
                f(x => x + 1);
              }}
            >
              Start with {v.members.length} clubs
            </B>
          )}
        </>
      ) : (
        <>
          {v.champ && (
            <div class="p hot row">
              {UI('trophy', 22)}
              <b>{nm(v.champ)?.name} win the league</b>
            </div>
          )}
          {v.stage !== 'done' && (
            <div class="p row w">
              <span class="grow">
                <b>
                  Round {v.round + 1} of {v.rounds}
                </b>
                <span class="sm sec" style={{ display: 'block' }}>
                  {v.committed.size}/{v.members.length} squads locked, {v.revealed.size} revealed. Results appear when all are in.
                </span>
              </span>
              {!v.committed.has(me) ? (
                <B
                  k="p"
                  disabled={!G_().squads[v.title]}
                  onClick={async () => {
                    let t = simTeam(G_(), meId(v.title), 'lg');
                    if (v.mode === 'level') t = levelTeam(t);
                    await LG.commit(l, t, v.round);
                    push();
                    await autoplay(l);
                    f(x => x + 1);
                  }}
                >
                  Lock in my squad
                </B>
              ) : (
                <span class="chip g">You are in</span>
              )}
              {me === v.owner && v.stage === 'commit' && v.committed.size >= 2 && (
                <B
                  k="s"
                  onClick={() =>
                    ask(
                      'Close the round?',
                      'Anyone who has not locked in plays with their last squad, or forfeits.',
                      'Close round',
                      async () => {
                        await LG.post(l, 'skip', { r: v.round });
                        push();
                        await autoplay(l);
                        f(x => x + 1);
                      },
                    )
                  }
                >
                  Close round
                </B>
              )}
            </div>
          )}
          <div class="g2">
            <div>
              <h2>Table</h2>
              <table>
                <thead>
                  <tr>
                    <th class="n">#</th>
                    <th>Club</th>
                    <th class="n">W</th>
                    <th class="n">L</th>
                    <th class="n">+/−</th>
                  </tr>
                </thead>
                <tbody>
                  {v.table.map((r, i) => (
                    <tr key={r.pub} class={r.pub === me ? 'me' : ''}>
                      <td class="n">{i + 1}</td>
                      <td>
                        <span class="row">
                          <CrestI c={(nm(r.pub)?.crest ?? {}) as any} s={24} />
                          {nm(r.pub)?.name}
                        </span>
                      </td>
                      <td class="n">{r.w}</td>
                      <td class="n">{r.l}</td>
                      <td class="n">{r.f - r.a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2>Matches</h2>
              {v.matches
                .slice()
                .reverse()
                .map(m => (
                  <button
                    class="fx"
                    style={{ width: '100%' }}
                    key={m.id}
                    disabled={!m.cfg}
                    onClick={() => m.cfg && startMatch({ cfg: m.cfg, us: m.b === me ? 1 : 0, kind: 'replay', title: v.name, sub: '' })}
                  >
                    <span class="h">{nm(m.a)?.name}</span>
                    <span class="sc">{m.res ? `${m.res.score[0]}–${m.res.score[1]}` : m.cfg ? '…' : `R${m.round + 1}`}</span>
                    <span>
                      {nm(m.b)?.name}
                      {m.res?.map ? <span class="xs mut"> {MAP_META.find(x => x.id === m.res!.map)?.name}</span> : null}
                    </span>
                  </button>
                ))}
              <p class="sm mut" style={{ marginTop: 8 }}>
                Click a result to watch it in 3D.
              </p>
            </div>
          </div>
        </>
      )}
      <B
        k="s d"
        onClick={() =>
          ask(
            'Leave this league?',
            'It is removed from this device only.',
            'Leave',
            async () => {
              await LG.leaveLeague(l.code);
              back();
            },
            true,
          )
        }
      >
        Leave league
      </B>
    </div>
  );
}
function Direct() {
  const [mine_, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [role, setRole] = useState<'none' | 'host' | 'guest'>('none');
  const [busy, setBusy] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(mine_).then(
      () => toast('Copied', 'ok'),
      () => toast('Select and copy it by hand', 'info'),
    );
  };
  const begin = async (c: CodeChannel) => {
    c.onJoin(() => {
      toast('Connected', 'ok');
      bump();
    });
    await openSession(c, 'direct');
  };
  return (
    <div class="col" style={{ maxWidth: 620 }}>
      <h3>Connect without any relay</h3>
      <p class="sec">Two codes, passed through any chat. One of you hosts, the other answers.</p>
      <div class="opts">
        <B
          k={role === 'host' ? 'on' : ''}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setRole('host');
            const c = new CodeChannel();
            net.code = c;
            setMine(await c.offer());
            await begin(c);
            setBusy(false);
          }}
        >
          1. I host
        </B>
        <B
          k={role === 'guest' ? 'on' : ''}
          disabled={busy}
          onClick={() => {
            setRole('guest');
            setMine('');
          }}
        >
          1. I answer
        </B>
      </div>
      {role === 'host' && (
        <>
          <label class="f">
            <span>2. Send this code</span>
            <textarea readOnly value={mine_} />
          </label>
          <B disabled={!mine_} onClick={copy}>
            {UI('copy', 16)}Copy
          </B>
          <label class="f">
            <span>3. Paste their answer</span>
            <textarea value={theirs} onInput={e => setTheirs((e.target as any).value)} />
          </label>
          <B
            k="p"
            disabled={!theirs.trim().startsWith('SX2-')}
            onClick={async () => {
              try {
                await net.code!.accept(theirs);
              } catch {
                toast('That answer does not fit this code', 'err');
              }
            }}
          >
            Connect
          </B>
        </>
      )}
      {role === 'guest' && (
        <>
          <label class="f">
            <span>2. Paste the host code</span>
            <textarea value={theirs} onInput={e => setTheirs((e.target as any).value)} />
          </label>
          <B
            k="p"
            disabled={busy || !theirs.trim().startsWith('SX1-')}
            onClick={async () => {
              setBusy(true);
              try {
                const c = new CodeChannel();
                net.code = c;
                setMine(await c.answer(theirs));
                await begin(c);
              } catch {
                toast('That code is not valid', 'err');
              }
              setBusy(false);
            }}
          >
            Make an answer
          </B>
          {mine_ && (
            <>
              <label class="f">
                <span>3. Send this back</span>
                <textarea readOnly value={mine_} />
              </label>
              <B onClick={copy}>{UI('copy', 16)}Copy</B>
            </>
          )}
        </>
      )}
      {net.code && (
        <p class="sm sec">
          State: {net.code.state}. {net.s && net.s.peers.size > 0 ? 'You are connected. Challenge them from the Lobby tab.' : ''}
        </p>
      )}
    </div>
  );
}
function How() {
  return (
    <div class="col" style={{ maxWidth: 640, gap: 14 }}>
      <h3>How this stays fair without a server</h3>
      {[
        [
          'Nothing on disk can be read or changed',
          'Careers, opponents, ladder and leagues are encrypted with a key that never leaves this browser. Backups are encrypted with your password. A single changed byte is found, and the save seals.',
        ],
        [
          'Your save is a history, not a number',
          'A career is a seed plus every decision you made, down to the last wall you built, hash-chained and signed. Money and ratings are computed from it. Editing them contradicts the history, and the save seals.',
        ],
        [
          'Opponents replay you',
          'Before an open match, each side re-runs the other’s entire career in the background. If the squad on the table is not the squad the history produces, the match is refused and the manager is flagged on this device.',
        ],
        [
          'Nobody picks the dice',
          'Both sides commit to a secret before either is revealed. The match seed is both secrets hashed together.',
        ],
        [
          'Both browsers play the match',
          'The simulation gives identical results everywhere. Calls from the bench are exchanged in lockstep. The result is signed by both managers or it does not exist.',
        ],
        [
          'The ladder is a pile of receipts',
          'Every client folds the same signed matches into the same table. You can check any of them by re-simulating it, and the game does.',
        ],
        [
          'What it cannot do',
          'A player can grind seeds offline, or rebuild the game and lie to themselves. They cannot make your copy believe it. A few home networks block direct connections; a relay server of your own fixes that.',
        ],
      ].map(([h, b]) => (
        <div key={h}>
          <b>{h}</b>
          <p class="sec">{b}</p>
        </div>
      ))}
    </div>
  );
}
