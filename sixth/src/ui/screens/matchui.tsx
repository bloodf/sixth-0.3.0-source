import { act, app, bump, endMatchView, G_, tName, tShort, toast, useApp } from '../store.ts';
import { B, CrestI, Gi, PFace, UI, useEffect, useRef, useState, on, vis, N } from '../kit.tsx';
import { orgCrest } from '../art.ts';
import type { CamMode } from '../../gfx/match.ts';
import type { Ev, OrderDef, Sim } from '../../sim/types.ts';
import { heroIcon, heroName } from '../../data/heroes.ts';
import { MAP_META } from '../../sim/maps.ts';
import { audio } from '../../audio/audio.ts';
import type { TacSim } from '../../sim/tac.ts';
import type { MobaSim, Hero } from '../../sim/moba.ts';
import type { ArenaSim, Fig } from '../../sim/arena.ts';
interface Feed {
  id: number;
  a: string;
  b: string;
  ca: string;
  cb: string;
  w: string;
  hs: boolean;
}
let fid = 1;
void [UI('pause'), UI('play')];
const WN: Record<string, string> = {
  rifle: 'rifle',
  smg: 'smg',
  pistol: 'pistol',
  awp: 'sniper',
  shotgun: 'shotgun',
  he: 'grenade',
  fire: 'fire',
  bomb: 'blast',
  hitscan: 'shot',
  proj: 'shot',
  beam: 'beam',
  melee: 'hammer',
  spell: 'spell',
  atk: 'strike',
  tower: 'tower',
  creep: 'creep',
  hero: 'strike',
  boss: 'Warden',
};
export function MatchUI() {
  const a = useApp();
  const L = a.live!,
    v = a.match!;
  const [, tick] = useState(0);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [cast, setCast] = useState<{ s: string; k: number } | null>(null);
  const [big, setBig] = useState<{ t: string; s: string; c: string; k: number } | null>(null);
  const [sp, setSp] = useState(1);
  const [paused, setPaused] = useState(false);
  const [cam, setCam] = useState<CamMode>('action');
  const [panel, setPanel] = useState(true);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const duel = a.session?.duel ?? null;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const S = v.sim;
    const cols = L.cfg.teams.map(t => vis(t.c1));
    if (L.kind === 'duel') {
      v.speed = 2;
      setSp(2);
      v.gate = () => a.session!.gate(S.tick);
      v.preStep = () => a.session!.preStep(S);
      duel!.stage = 'live';
      duel!.lastMsg = Date.now();
    } else if (L.orders?.length) {
      let i = 0;
      const O = [...L.orders].sort((x, y) => x.tick - y.tick);
      v.preStep = () => {
        while (i < O.length && O[i].tick <= S.tick) {
          S.order(O[i].team, O[i].cmd);
          i++;
        }
      };
      if (L.kind === 'career') {
        const last = O[O.length - 1].tick;
        let n = 0;
        while (S.tick <= last && !S.done && n++ < 120000) {
          v.preStep();
          S.step();
        }
        (v as any).snap();
      }
    }
    let heat = 0;
    v.onMode = m => setCam(m);
    v.onStep = (evs: Ev[]) => {
      for (const e of evs) {
        if (e.k === 'kill') {
          heat += 1;
          const A = e.by >= 0 ? S.actors[e.by] : null,
            D = S.actors[e.i];
          setFeed(f => [
            ...f.slice(-4),
            { id: fid++, a: A?.nick ?? '', b: D.nick, ca: A ? cols[A.team] : '#aaa', cb: cols[D.team], w: WN[e.w] ?? '', hs: !!e.hs },
          ]);
        } else if (e.k === 'say') setCast({ s: e.s, k: fid++ });
        else if (e.k === 'roundEnd') {
          const t = L.cfg.teams[e.win];
          const why: Record<string, string> = {
            elimination: 'Elimination',
            defused: 'Defused',
            detonated: 'Detonated',
            time: 'Time',
            control: 'Point held',
            escort: `${e.m} m`,
          };
          setBig({ t: `${t.tag} ${e.why === 'escort' ? 'stop' : 'take it'}`, s: why[e.why] ?? '', c: cols[e.win], k: fid++ });
          setSent({});
        } else if (e.k === 'half') setBig({ t: 'Switching sides', s: '', c: '#fff', k: fid++ });
        else if (e.k === 'timeout') setBig({ t: 'Timeout', s: L.cfg.teams[e.team].name, c: cols[e.team], k: fid++ });
        else if (e.k === 'end') {
          const w = S.result().winner;
          setBig({
            t: w === L.us ? 'Victory' : L.kind === 'replay' ? L.cfg.teams[w].tag : 'Defeat',
            s: `${S.score[0]}–${S.score[1]}`,
            c: cols[w],
            k: fid++,
          });
          audio.play(w === L.us ? 'win' : 'horn');
        } else if (e.k === 'ult') {
          setCast({ s: `${S.actors[e.i].nick}: ${e.name}`, k: fid++ });
          heat += 0.6;
        } else if (e.k === 'tower' || e.k === 'cap' || e.k === 'planted') heat += 1.5;
      }
    };
    v.onDone = () => {
      setDone(true);
      if (L.kind === 'duel') a.session!.finish(S);
    };
    const iv = setInterval(() => {
      heat *= 0.9;
      audio.intensity += (Math.min(1, 0.25 + heat * 0.14 + Math.max(S.score[0], S.score[1]) * 0.02) - audio.intensity) * 0.2;
      tick(x => x + 1);
    }, 220);
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === '1') v.setMode('action');
      else if (e.key === '2') v.setMode('top');
      else if (e.key === '3') v.setMode('arena');
      else if (e.key === '+' || e.key === '=') speed(Math.min(8, v.speed * 2));
      else if (e.key === '-') speed(Math.max(0.5, v.speed / 2));
    };
    addEventListener('keydown', kd);
    return () => {
      clearInterval(iv);
      removeEventListener('keydown', kd);
    };
  }, []);
  useEffect(() => {
    if (!cast) return;
    const t = setTimeout(() => setCast(null), 3200);
    return () => clearTimeout(t);
  }, [cast?.k]);
  useEffect(() => {
    if (!big) return;
    const t = setTimeout(() => setBig(null), 2400);
    return () => clearTimeout(t);
  }, [big?.k]);
  useEffect(() => {
    if (!feed.length) return;
    const t = setTimeout(() => setFeed(f => f.slice(1)), 6500);
    return () => clearTimeout(t);
  }, [feed.length ? feed[0].id : 0]);
  useEffect(() => {
    v.insetB = !done && L.kind !== 'replay' && panel ? 118 : 40;
  }, [panel, done]);
  const S = v.sim;
  const canCtl = L.kind !== 'duel';
  const toggle = () => {
    if (!canCtl) return;
    v.paused = !v.paused;
    setPaused(v.paused);
  };
  const speed = (n: number) => {
    if (!canCtl) return;
    v.speed = n;
    setSp(n);
  };
  const order = (o: OrderDef) => {
    if (L.kind === 'replay') return;
    if (L.kind === 'duel') {
      a.session!.order(o.cmd);
    } else {
      if (!S.order(L.us, o.cmd)) {
        audio.play('error');
        return;
      }
      const r = act({ t: 'matchOrder', tick: S.tick, cmd: o.cmd }, true);
      if (!r.ok) return;
    }
    audio.play('confirm', { vol: 0.5 });
    setSent({ ...sent, [o.group]: o.cmd });
  };
  const leave = () => {
    if (L.kind === 'replay') {
      endMatchView();
      return;
    }
    if (L.kind === 'duel') {
      if (duel && duel.stage !== 'done') {
        a.session!.fail('Left the match');
      }
      endMatchView();
      return;
    }
  };
  const finish = () => {
    if (L.kind !== 'career') {
      endMatchView();
      return;
    }
    const o = act({ t: 'matchEnd' }, true);
    if (!o.ok) return;
    if (o.data?.res?.hash !== S.result().hash) toast('The recorded result differs from the view. The record stands.', 'info');
    if (o.data?.done) {
      const rec = G_().recs[0];
      endMatchView();
      app.postmatch = rec;
      bump();
    } else {
      const l = G_().live!;
      endMatchView();
      app.live = null;
      import('./shell.tsx').then(m => m.resumeLive());
      toast(`Game ${l.game + 1}. ${l.wins[l.us]}–${l.wins[1 - l.us]}`, 'info');
    }
  };
  const [A, Z] = L.cfg.teams;
  const meC = (i: number) =>
    L.kind !== 'duel' && app.career && L.cfg.teams[i].id.endsWith(':me')
      ? G_().club.crest
      : L.kind === 'duel' && duel
        ? i === L.us
          ? a.session!.me.crest
          : duel.theirCard.crest
        : orgCrest(L.cfg.teams[i].icon, L.cfg.teams[i].c1, L.cfg.teams[i].c2, L.cfg.teams[i].tag);
  const esc = (S as any).escort?.();
  const pts: [string, string] = [String(S.score[0]), String(S.score[1])];
  const stall = L.kind === 'duel' && a.session!.stalled();
  return (
    <>
      <div class="score hud">
        <div class="tm" style={{ '--tc': A.c1 } as any}>
          <CrestI c={meC(0)} s={38} />
          <b>{A.name}</b>
        </div>
        <div class="pt" style={{ background: A.c1, color: on(A.c1) }}>
          {pts[0]}
        </div>
        <div class="ck">
          <b>{S.clock()}</b>
          <span>{S.phase()}</span>
        </div>
        <div class="pt" style={{ background: Z.c1, color: on(Z.c1) }}>
          {pts[1]}
        </div>
        <div class="tm r" style={{ '--tc': Z.c1 } as any}>
          <CrestI c={meC(1)} s={38} />
          <b>{Z.name}</b>
        </div>
      </div>
      <Extra S={S} t={L.cfg.title} />
      {cast && (
        <div class="cast" key={cast.k} style={{ top: L.cfg.title === 'dota' || L.cfg.title === 'ow' ? 104 : 66 }}>
          {cast.s}
        </div>
      )}
      {big && (
        <div class="big" key={big.k} style={{ '--tc': big.c, '--ton': on(big.c.length === 7 ? big.c : '#ffffff') } as any}>
          <span class="bigin2">
            <b>{big.t}</b>
            <span>{big.s}</span>
          </span>
        </div>
      )}
      <Side
        S={S}
        team={0}
        cls="l"
        fol={v.mode === 'follow' ? v.followI : -1}
        click={i => {
          v.follow(i);
          setCam('follow');
          tick(x => x + 1);
        }}
        t={L.cfg.title}
      />
      <Side
        S={S}
        team={1}
        cls="r"
        fol={v.mode === 'follow' ? v.followI : -1}
        click={i => {
          v.follow(i);
          setCam('follow');
          tick(x => x + 1);
        }}
        t={L.cfg.title}
      />
      <div class="kfeed">
        {feed.map(f => (
          <div key={f.id} class={f.hs ? 'hs' : ''}>
            {f.a && <span style={{ color: f.ca }}>{f.a}</span>}
            <span class="mut">{f.hs ? 'headshot' : f.w}</span>
            <span style={{ color: f.cb }}>{f.b}</span>
          </div>
        ))}
      </div>
      {stall && !done && (
        <div class="cast" style={{ top: '45%' }}>
          Waiting for {duel!.theirCard.name}…
        </div>
      )}
      <div class="mbar">
        {done ? (
          <div class="orders hud" style={{ alignItems: 'center' }}>
            <b style={{ fontSize: 17 }}>
              {A.name} {S.score[0]}–{S.score[1]} {Z.name}
            </b>
            {L.kind === 'duel' && <span class="sec">{duel?.msg}</span>}
            <B k="p l" onClick={finish}>
              {L.kind === 'career' ? 'Record result' : 'Leave'}
            </B>
          </div>
        ) : L.kind !== 'replay' && panel ? (
          <div class="orders hud">
            <Orders S={S} us={L.us} order={order} sent={sent} />
          </div>
        ) : null}
        <div class="ctl hud">
          {L.kind !== 'replay' && !done && (
            <button class="ib" aria-label="Toggle orders" title="Orders" onClick={() => setPanel(!panel)}>
              {UI('clipboard-list', 19)}
            </button>
          )}
          {(['action', 'top', 'arena'] as CamMode[]).map(m => (
            <B
              k={'s ' + (cam === m ? 'on' : 'q')}
              key={m}
              onClick={() => {
                v.setMode(m);
                setCam(m);
              }}
            >
              {{ action: 'Action', top: 'Top', arena: 'Arena' }[m as 'top']}
            </B>
          ))}
          <span style={{ width: 8 }} />
          {canCtl && (
            <button class="ib" aria-label={paused ? 'Play' : 'Pause'} onClick={toggle}>
              {UI(paused ? 'play' : 'pause', 20)}
            </button>
          )}
          {canCtl &&
            [1, 2, 4, 8].map(n => (
              <B k={'s ' + (sp === n ? 'on' : 'q')} key={n} onClick={() => speed(n)}>
                {n}×
              </B>
            ))}
          {canCtl && !done && (
            <button
              class="ib"
              aria-label="Skip to the end"
              title="Skip to the end"
              onClick={() => {
                v.paused = false;
                v.fastForward();
              }}
            >
              {UI('skip-forward', 20)}
            </button>
          )}
          <button
            class="ib"
            aria-label="Settings"
            onClick={() => {
              a.settings = true;
              bump();
            }}
          >
            {UI('settings', 19)}
          </button>
          {L.kind !== 'career' && (
            <button class="ib" aria-label="Leave" onClick={leave}>
              {UI('log-out', 19)}
            </button>
          )}
        </div>
      </div>
      <div class="mtag">
        <b>{L.kind === 'replay' ? 'Replay' : tName(L.cfg.title)}</b>
        <span>
          {MAP_META.find(m => m.id === L.cfg.map)?.name}
          {L.sub && L.kind === 'career' ? `, ${L.sub.toLowerCase()}` : ''}
        </span>
      </div>
      {esc && null}
    </>
  );
}
function Orders({ S, us, order, sent }: { S: Sim; us: 0 | 1; order: (o: OrderDef) => void; sent: Record<string, string> }) {
  const L = S.orders(us);
  const gs = [...new Set(L.map(o => o.group))];
  return (
    <>
      {gs.map(g => (
        <div class="grp" key={g}>
          <span>{g}</span>
          <div>
            {L.filter(o => o.group === g).map(o => (
              <button class={'ob ' + (sent[g] === o.cmd ? 'sent' : '')} key={o.cmd} title={o.hint} onClick={() => order(o)}>
                <Gi k={o.icon} s={17} />
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
/** the person at the computer, when we know them */
const face = (S: Sim, a: Sim['actors'][number]) => {
  const id = S.cfg.teams[a.team].players.find(x => x.nick === a.nick)?.id;
  const p = id ? app.career?.g.players[id] : undefined;
  return p ? <PFace p={p as any} s={44} /> : null;
};
function Side({ S, team, cls, click, fol, t }: { S: Sim; team: number; cls: string; click: (i: number) => void; fol: number; t: string }) {
  const c = vis(S.cfg.teams[team].c1);
  return (
    <div class={'side hud ' + cls}>
      {S.actors
        .filter(a => a.team === team)
        .map(a => {
          const x = a as any;
          const ult =
            t === 'val'
              ? Math.min(1, x.ult / 7)
              : t === 'ow'
                ? Math.min(1, x.ult / (x.h?.ult.cost ?? 1))
                : t === 'dota'
                  ? x.lvl >= 6
                    ? 1 - x.ucd / (x.h.ult.cd * 10)
                    : 0
                  : -1;
          return (
            <button
              class={'pl ' + (a.alive ? '' : 'dead ') + (fol === a.i ? 'fol' : '')}
              style={{ '--tc': c } as any}
              key={a.i}
              onClick={() => click(a.i)}
            >
              <span class="plf">
                {face(S, a) ?? (a.hero ? <Gi k={heroIcon(a.hero)} s={24} c="#d8dbdc" /> : <span class="num">{a.num}</span>)}
                {ult >= 1 && <i class="ultr" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block' }}>{a.nick}</b>
                <span class="xt">
                  {t === 'dota' ? `${heroName(a.hero)} ${x.lvl}` : t === 'ow' ? heroName(a.hero) : `${x.w}${t === 'val' ? '' : ''}`}
                </span>
              </span>
              <span class="kda" style={{ textAlign: 'right' }}>
                {x.k}/{x.d}/{x.a}
                <span class="xt" style={{ display: 'block' }}>
                  {t === 'dota'
                    ? a.alive
                      ? N(x.nw)
                      : `${Math.ceil(x.respawn / 10)}s`
                    : t === 'ow'
                      ? a.alive
                        ? `${Math.round(ult * 100)}%`
                        : `${Math.ceil(x.respawn / 10)}s`
                      : `$${N(x.money)}`}
                </span>
              </span>
              <div class="hpb">
                <i style={{ width: Math.max(0, (a.hp / a.maxHp) * 100) + '%', background: c }} />
              </div>
            </button>
          );
        })}
    </div>
  );
}
function Extra({ S, t }: { S: Sim; t: string }) {
  if (t === 'dota') {
    const m = S as MobaSim;
    const nw = [0, 1].map(k => (m.actors as Hero[]).filter(a => a.team === k).reduce((s, a) => s + a.nw, 0));
    const d = nw[0] - nw[1];
    const H = m.nwHist.slice(-60);
    const mx = Math.max(2000, ...H.map(Math.abs));
    return (
      <div
        class="hud"
        style={{
          position: 'absolute',
          top: 62,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 250,
          background: 'rgba(7,9,11,.86)',
          padding: '4px 10px',

          zIndex: 5,
        }}
      >
        <div class="row sb xs">
          <span style={{ color: vis(S.cfg.teams[0].c1) }}>{d > 0 ? '+' + N(d) : ''}</span>
          <span class="mut">gold lead</span>
          <span style={{ color: vis(S.cfg.teams[1].c1) }}>{d < 0 ? '+' + N(-d) : ''}</span>
        </div>
        <svg class="nw" style={{ height: 16 }} viewBox="0 0 100 20" preserveAspectRatio="none">
          <line x1="0" x2="100" y1="10" y2="10" stroke="#33535e" vector-effect="non-scaling-stroke" />
          <polyline
            points={H.map((v, i) => `${(i / Math.max(1, H.length - 1)) * 100},${10 - (v / mx) * 9}`).join(' ')}
            fill="none"
            stroke="#ffc61a"
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  }
  if (t === 'ow') {
    const m = S as ArenaSim;
    void (null as unknown as Fig);
    const esc = m.escort();
    return (
      <div
        class="hud"
        style={{
          position: 'absolute',
          top: 62,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          background: 'rgba(7,9,11,.86)',
          padding: '6px 10px',

          zIndex: 5,
        }}
      >
        {esc ? (
          <div style={{ position: 'relative', height: 10, background: 'rgba(255,255,255,.12)' }}>
            <div
              style={{
                width: (m.cart / m.pathLen) * 100 + '%',
                height: '100%',
                background: m.contested ? '#ffe08a' : vis(S.cfg.teams[m.atk].c1),
              }}
            />
            {m.cps.slice(0, 2).map(c => (
              <i
                key={c}
                style={{ position: 'absolute', left: (c / m.pathLen) * 100 + '%', top: -2, width: 2, height: 14, background: '#fff' }}
              />
            ))}
          </div>
        ) : (
          <div class="row" style={{ gap: 8 }}>
            <b class="num" style={{ width: 38, color: vis(S.cfg.teams[0].c1) }}>
              {Math.floor(m.pct[0])}%
            </b>
            <div class="grow" style={{ height: 8, background: 'rgba(255,255,255,.12)', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  width: m.pct[0] / 2 + '%',
                  height: '100%',
                  background: vis(S.cfg.teams[0].c1),
                  opacity: m.own === 0 ? 1 : 0.4,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  width: m.pct[1] / 2 + '%',
                  height: '100%',
                  background: vis(S.cfg.teams[1].c1),
                  opacity: m.own === 1 ? 1 : 0.4,
                }}
              />
            </div>
            <b class="num" style={{ width: 38, textAlign: 'right', color: vis(S.cfg.teams[1].c1) }}>
              {Math.floor(m.pct[1])}%
            </b>
          </div>
        )}
      </div>
    );
  }
  const m = S as TacSim;
  if (m.ph === 'freeze')
    return (
      <div
        class="hud"
        style={{
          position: 'absolute',
          top: 62,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(7,9,11,.86)',
          padding: '3px 12px',

          zIndex: 5,
        }}
      >
        <span class="xs sec">
          {m.cfg.teams[0].tag} {m.tSide === 0 ? 'attack' : 'defend'}: {m.buyWas[0]} · {m.cfg.teams[1].tag}{' '}
          {m.tSide === 1 ? 'attack' : 'defend'}: {m.buyWas[1]}
        </span>
      </div>
    );
  return null;
}
export { tShort };
