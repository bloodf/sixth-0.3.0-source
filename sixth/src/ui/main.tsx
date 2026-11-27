import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/sofia-sans';
import '@fontsource-variable/sofia-sans-semi-condensed';
import '@fontsource-variable/sofia-sans-extra-condensed';
import './styles.css';
import './skin.css';
import './creator.css';
import * as store from './store.ts';
import { app, boot, bump, G_, refreshFlags, titleScene, useApp, watchTampering } from './store.ts';
import { HouseSheet, IncidentDlg, RoomPop } from './screens/life.tsx';
import { TitleScreen, Sealed, Settings } from './screens/title.tsx';
import { Wizard } from './screens/wizard.tsx';
import { Dock, GameOver, Home, Inbox, PlayerDlg, PostMatch, PreMatch, TimeLapse, Top } from './screens/shell.tsx';
import { SquadSheet, TacticsSheet, TrainingSheet } from './screens/squad.tsx';
import { HQSheet, StaffSheet } from './screens/hq.tsx';
import { Editor } from './screens/build.tsx';
import { ClubSheet, LeagueSheet, MarketSheet } from './screens/world.tsx';
import { OnlineSheet } from './screens/online.tsx';
import { MatchUI } from './screens/matchui.tsx';
import { B, Modal } from './kit.tsx';
import { on } from './art.ts';
const SHEETS = {
  house: HouseSheet,
  inbox: Inbox,
  squad: SquadSheet,
  training: TrainingSheet,
  tactics: TacticsSheet,
  staff: StaffSheet,
  hq: HQSheet,
  market: MarketSheet,
  league: LeagueSheet,
  club: ClubSheet,
  online: OnlineSheet,
} as const;
function Confirm() {
  const c = app.confirm!;
  const close = () => {
    app.confirm = null;
    bump();
  };
  return (
    <Modal close={close}>
      <div class="hd">
        <h1>{c.title}</h1>
      </div>
      <div class="bd">
        <p class="sec">{c.body}</p>
        <div class="row end">
          <B k="q" onClick={close}>
            Cancel
          </B>
          <B
            k={c.danger ? 'd' : 'p'}
            onClick={() => {
              close();
              c.run();
            }}
          >
            {c.yes}
          </B>
        </div>
      </div>
    </Modal>
  );
}
function Loading({ f }: { f: number }) {
  return (
    <div class="load">
      <div>
        <div class="bars">
          {[0, 1, 2, 3, 4].map(i => (
            <i key={i}>
              <u style={{ height: Math.max(0, Math.min(1, f * 6 - i)) * 100 + '%' }} />
            </i>
          ))}
        </div>
        <div class="six6">
          <u style={{ width: Math.max(0, Math.min(1, f * 6 - 5)) * 100 + '%' }} />
        </div>
        <p>{f < 0.35 ? 'Unlocking the building' : f < 0.95 ? 'People arriving' : 'Lights on'}</p>
      </div>
    </div>
  );
}
function App() {
  const a = useApp();
  useEffect(() => {
    document.documentElement.classList.toggle('in-match', a.screen === 'match');
    if (a.career) {
      const r = document.documentElement.style,
        c = a.career.g.club;
      r.setProperty('--team', c.c1);
      r.setProperty('--team2', c.c2);
      r.setProperty('--on-team', on(c.c1));
    }
    const sh = document.querySelector('.sheet') as HTMLElement | null;
    const bar = document.querySelector('.edbar') as HTMLElement | null;
    if (a.edit) a.hq?.setInset(innerWidth > 1000 ? 300 : 0, (bar?.offsetHeight ?? 0) - 52);
    else
      a.hq?.setInset(
        a.screen === 'game' && sh && innerWidth > 1100
          ? sh.offsetWidth + 20
          : a.screen === 'title' || a.screen === 'new'
            ? -innerWidth * 0.4
            : a.screen === 'game' && !a.timelapse && innerWidth > 900
              ? -306 + 300 * (innerWidth > 1180 ? 1 : 0)
              : 0,
        0,
      );
  });
  const S = a.sheet ? SHEETS[a.sheet] : null;
  return (
    <>
      {a.loading !== null && <Loading f={a.loading} />}
      {a.screen === 'title' && a.loading === null && <TitleScreen />}
      {a.screen === 'new' && <Wizard />}
      {a.screen === 'sealed' && <Sealed />}
      {a.screen === 'game' && a.career && a.edit && <Editor />}
      {a.screen === 'game' && a.career && !a.edit && (
        <>
          {!a.incident && <Top />}
          {!S && !a.timelapse && !a.incident && <Home />}
          {!S && !a.timelapse && !a.incident && a.room && <RoomPop />}
          {S && (
            <section class="sheet" key={a.sheet}>
              <S />
            </section>
          )}
          <TimeLapse />
          {a.incident ? <IncidentDlg /> : <Dock />}
          {a.prematch && <PreMatch />}
          {a.postmatch && <PostMatch />}
          {a.player && <PlayerDlg />}
          {G_().over && <GameOver />}
        </>
      )}
      {a.screen === 'match' && a.match && <MatchUI key={a.live!.cfg.seed + a.live!.kind} />}
      {a.settings && <Settings />}
      {a.confirm && <Confirm />}
      <div class="toasts" aria-live="polite">
        {a.toasts.map(t => (
          <div class={'toast ' + t.kind} key={t.id}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
const root = document.getElementById('ui')!;
render(<App />, root);
(async () => {
  try {
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    watchTampering();
    await boot(document.getElementById('gl') as HTMLCanvasElement, document.getElementById('hqlayer')!);
    refreshFlags();
    titleScene();
  } catch (e) {
    root.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'sealed';
    d.innerHTML = '<div><h1>No 3D here</h1><p></p></div>';
    d.querySelector('p')!.textContent = 'SIXTH needs WebGL 2, IndexedDB and WebCrypto. ' + (e as Error).message;
    root.appendChild(d);
    console.error(e);
  }
})();
if (import.meta.env.DEV) Object.assign(window as any, { __app: app, __dev: store });
