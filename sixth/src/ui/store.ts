import { useEffect, useReducer } from 'preact/hooks';
import * as THREE from 'three';
import { Engine, type Quality } from '../gfx/engine.ts';
import { loadHumans } from '../gfx/human.ts';
import { openStudio, warmStudio } from '../gfx/studio.ts';
import { INC } from '../game/incidents.ts';
import { lu } from './art.ts';
import { HQView } from '../gfx/hq.ts';
import { MatchView } from '../gfx/match.ts';
import { audio } from '../audio/audio.ts';
import * as vault from '../save/vault.ts';
import type { Action, G, MatchCfg, Order, Outcome, TitleId } from '../game/types.ts';
import { TITLE } from '../data/titles.ts';
import { crestImage, shirtAtlas } from './art.ts';
import { myToday, isMe } from '../game/league.ts';
import { mine } from '../game/events.ts';
import { spawn } from '../p2p/jobs.ts';
import type { Session } from '../p2p/session.ts';
import type { PLeague } from '../p2p/league.ts';
import { genesis } from '../game/reducer.ts';
import { layout, roomsOf } from '../game/build.ts';
export type Sheet = 'house' | 'inbox' | 'squad' | 'training' | 'tactics' | 'staff' | 'hq' | 'market' | 'league' | 'club' | 'online' | null;
export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'err' | 'info';
}
export interface LiveView {
  cfg: MatchCfg;
  us: 0 | 1;
  kind: 'career' | 'duel' | 'replay';
  orders?: Order[];
  title: string;
  sub: string;
}
export const app = {
  screen: 'boot' as 'boot' | 'title' | 'new' | 'game' | 'match' | 'sealed',
  sheet: null as Sheet,
  arg: null as any,
  career: null as vault.Career | null,
  title: null as TitleId | null,
  toasts: [] as Toast[],
  engine: null as Engine | null,
  hq: null as HQView | null,
  match: null as MatchView | null,
  live: null as LiveView | null,
  sealed: '',
  flagged: 0,
  settings: false,
  /** 0..1 while the game loads, null once it runs */
  loading: 0 as number | null,
  /** the dialog for what has just gone wrong in the house */
  incident: false,
  outcome: '' as string,
  /** the room picked on the home screen */
  room: null as string | null,
  /** the house editor is open */
  edit: false,
  player: null as string | null,
  timelapse: null as null | { label: string; sub: string },
  prematch: null as string | null,
  postmatch: null as any,
  session: null as Session | null,
  leagues: [] as PLeague[],
  confirm: null as null | { title: string; body: string; yes: string; danger?: boolean; run: () => void },
  quality: 'low' as Quality,
  fast: false,
  lockLost: false,
  names: (localStorage.getItem('sixth.names') ?? 'real') as 'real' | 'studio',
  reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  booted: false,
  busy: '',
};
const subs = new Set<() => void>();
export const bump = () => subs.forEach(f => f());
export function useApp() {
  const [, f] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const g = () => f(0);
    subs.add(g);
    return () => {
      subs.delete(g);
    };
  }, []);
  return app;
}
export const G_ = (): G => app.career!.g as G;
export const tName = (t: TitleId) => (app.names === 'real' ? TITLE[t].real : TITLE[t].studio);
export const tShort = (t: TitleId) => (app.names === 'real' ? TITLE[t].realShort : TITLE[t].studioShort);
export const setNames = (n: 'real' | 'studio') => {
  app.names = n;
  localStorage.setItem('sixth.names', n);
  bump();
};
let tid = 1;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: tid++, text, kind };
  app.toasts = [...app.toasts.slice(-3), t];
  bump();
  setTimeout(() => {
    app.toasts = app.toasts.filter(x => x !== t);
    bump();
  }, 3800);
}
export function act(a: Action, quiet = false): Outcome {
  const c = app.career;
  if (!c) return { ok: false, err: 'No career' };
  const cash = c.g.club.cash;
  const o = c.dispatch(a) as Outcome;
  if (!o.ok) {
    toast(o.err ?? 'Not possible', 'err');
    audio.play('error');
  } else {
    if (o.msg && !quiet) toast(o.msg, 'ok');
    if (!quiet) audio.play(c.g.club.cash !== cash ? 'cash' : 'confirm', { vol: 0.5 });
    if (a.t === 'remodel' || a.t === 'site') audio.play('build');
    afterChange(a.t);
  }
  bump();
  return o;
}
let brandSig = '';
async function brandArt(g: G) {
  const sig =
    JSON.stringify([g.club.crest, g.club.jersey, g.club.tag, mine(g).map(p => [p.id, p.nick, p.num])]) +
    (g.deals.find(d => d.signed && d.slot === 'front')?.brand ?? '');
  if (sig === brandSig || !app.hq) return;
  brandSig = sig;
  const hq = app.hq;
  try {
    const im = await crestImage(g.club.crest);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    cv.getContext('2d')!.drawImage(im, 0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    hq.crestTex = t;
  } catch {
    /* crest art is optional */
  }
  const sp = g.deals.find(d => d.signed && d.slot === 'front')?.brand ?? '';
  const m: Record<string, THREE.Texture> = {};
  for (const p of mine(g)) {
    const c = await shirtAtlas(g.club.jersey, g.club.crest, { sponsor: sp, name: p.nick, num: p.num });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.ColorManagement.enabled ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    m[p.id] = t;
  }
  if (app.hq !== hq) return;
  hq.shirts = m;
  hq.shirtOf = id => hq.shirts[id] ?? null;
  (hq as any).sig = '';
  (hq as any).psig = '';
  hq.sync(G_());
  if (!app.booted) {
    hq.warp();
  }
}
export function afterChange(t?: string) {
  const g = app.career?.g as G | undefined;
  if (!g || !app.hq) return;
  if (
    !t ||
    [
      'remodel',
      'site',
      'gear',
      'hire',
      'fire',
      'offer',
      'release',
      'brand',
      'lineup',
      'number',
      'choose',
      'advance',
      'matchEnd',
      'delegate',
      'addTitle',
      'week',
      'incident',
      'care',
      'house',
    ].includes(t)
  ) {
    app.hq.sync(g);
    brandArt(g);
  }
}
export const go = (s: Sheet, arg: any = null) => {
  app.sheet = app.sheet === s && !arg ? null : s;
  app.arg = arg;
  app.player = null;
  audio.play('whoosh', { vol: 0.3 });
  const F: Record<string, [string | null, boolean]> = {
    squad: ['practice', true],
    training: ['practice', true],
    tactics: ['strategy', true],
    staff: ['office', true],
    league: ['trophy', true],
    club: ['office', true],
    market: ['office', true],
    inbox: [null, false],
    hq: [null, false],
    online: [null, false],
  };
  if (app.hq) {
    const f = s && app.sheet ? F[s] : null;
    const has = f?.[0] && (app.career?.g.rooms.some(r => r.type === f[0]) ?? false);
    app.hq.focusRoom(has ? f![0] : null, app.title ?? undefined);
  }
  bump();
};
export const setTitle = (t: TitleId) => {
  app.title = t;
  if (app.hq?.focus) app.hq.focusRoom(app.sheet === 'tactics' ? 'strategy' : 'practice', t);
  bump();
};
// ---------- engine and views
export function boot(canvas: HTMLCanvasElement, layer: HTMLElement) {
  const q = localStorage.getItem('sixth.q') as Quality | null;
  const e = (app.engine = new Engine(canvas, q ?? undefined));
  app.quality = e.q;
  e.onQuality = n => {
    app.quality = n;
    rebuildViews();
    bump();
  };
  const rs = () => e.resize(innerWidth, innerHeight);
  addEventListener('resize', rs);
  rs();
  (app as any).layer = layer;
  document.documentElement.classList.toggle('soft', e.software);
  audio.load();
  const un = () => audio.unlock();
  addEventListener('pointerdown', un);
  addEventListener('keydown', un);
  return loadHumans(f => {
    app.loading = f;
    bump();
  }).then(async () => {
    openStudio(e);
    app.loading = 0.97;
    bump();
    await new Promise(r => setTimeout(r, 60));
    warmStudio();
    app.loading = null;
    bump();
  });
}
export function watchTampering() {
  vault.onTamper((why, _id) => {
    app.sealed = why;
    app.screen = 'sealed';
    teardown();
    refreshFlags();
    bump();
  });
}
export async function refreshFlags() {
  app.flagged = (await vault.flags()).length;
  bump();
}
function teardown() {
  app.match?.dispose();
  app.match = null;
  app.live = null;
  app.engine?.setView(null);
}
let lastLow: boolean | null = null;
export function makeHQ(g?: G) {
  const e = app.engine!;
  app.hq?.dispose();
  lastLow = e.q === 'low';
  brandSig = '';
  const hq = (app.hq = new HQView(e));
  hq.icon = n => lu(n, 14);
  const layer = (app as any).layer as HTMLElement;
  hq.attach(layer);
  hq.onPick = r => {
    if (app.screen !== 'game') return;
    if (!r || app.sheet || app.incident) {
      if (app.room) {
        app.room = null;
        hq.focusRoom(null);
        bump();
      }
      return;
    }
    audio.play('click');
    app.room = r.id;
    hq.focusRoom(r.id);
    bump();
  };
  hq.onPerson = id => {
    if (app.screen !== 'game') return;
    if (app.career?.g.players[id]) {
      audio.play('click');
      app.player = id;
      bump();
    } else if (app.career?.g.staff.some(s => s.id === id)) {
      audio.play('click');
      app.player = id;
      bump();
    }
  };
  hq.onHover = (r, x, y) => {
    const h = document.getElementById('hover');
    if (!h) return;
    if (!r || app.screen !== 'game') {
      h.style.display = 'none';
      return;
    }
    h.style.display = '';
    h.style.transform = `translate(${x + 14}px,${y + 12}px)`;
    h.textContent = roomLabel(r);
  };
  const gg = g ?? (app.career?.g as G | undefined);
  if (gg) {
    hq.sync(gg);
    hq.warp();
    if (!g) brandArt(gg);
  }
  if (app.screen !== 'match') e.setView(hq);
  return hq;
}
import { ROOMS } from '../data/club.ts';
const roomLabel = (r: any) => `${ROOMS[r.type as 'gym'].name}${r.title ? ' · ' + tShort(r.title) : ''} · level ${r.lvl}`;
function rebuildViews() {
  const low = app.engine!.q === 'low';
  if (lastLow !== null && low === lastLow) return;
  if (app.hq) makeHQ(app.career ? undefined : (demoG ?? undefined));
}
export function setQuality(q: Quality | 'auto') {
  const e = app.engine!;
  if (q === 'auto') {
    localStorage.removeItem('sixth.q');
    e.setQuality(e.software ? 'low' : 'high', true);
  } else {
    localStorage.setItem('sixth.q', q);
    e.setQuality(q);
  }
  app.quality = e.q;
  bump();
}
let demoG: G | null = null;
/** the title screen shows a late-game club */
export function titleScene() {
  if (!demoG) {
    const crest = {
      shape: 'heater',
      split: 'five',
      icon: 'raven',
      c1: '#12313b',
      c2: '#1d4a57',
      c3: '#ffb23e',
      icolor: '#ffb23e',
      iscale: 1,
      iy: -2,
      border: 4,
      ribbon: '',
      ribbonOn: false,
    };
    demoG = genesis({
      seed: 'title',
      mgr: { name: 'You', nat: 'DK', style: 'mentor' },
      club: {
        name: 'Sixth',
        tag: 'SIX',
        c1: '#1f7f86',
        c2: '#ffb23e',
        c3: '#f4efe2',
        crest,
        jersey: {
          pattern: 'five',
          c1: '#175f68',
          c2: '#1f7f86',
          c3: '#ffb23e',
          collar: 'v',
          sleeve: 'second',
          crestPos: 'left',
          font: 'wide',
          numColor: '#ffb23e',
          sponsor: true,
          away: '#f4efe2',
        },
        region: 'EU',
        city: '',
        motto: '',
      },
      origin: 'backed',
      titles: ['cs2', 'dota'],
      t0: '',
    });
    demoG.club.cash = 1e7;
    demoG.site = 2;
    demoG.day = 2;
    demoG.hq = layout(2, [
      { type: 'practice', title: 'cs2', lvl: 3 },
      { type: 'practice', title: 'dota', lvl: 2 },
      { type: 'strategy', lvl: 2 },
      { type: 'trophy', lvl: 2 },
      { type: 'kitchen', lvl: 3 },
      { type: 'lounge', lvl: 3 },
      { type: 'gym', lvl: 2 },
      { type: 'wellness', lvl: 2 },
      { type: 'office', lvl: 2 },
      { type: 'stream', lvl: 3 },
      { type: 'workshop', lvl: 2 },
      { type: 'dorm', lvl: 2 },
      { type: 'bath', lvl: 2 },
    ]);
    demoG.rooms = roomsOf(demoG.hq);
    for (const s of ['coach', 'chef', 'psych', 'trainer', 'tech', 'scout', 'content', 'analyst']) {
      const c = demoG.pool.find(p => p.role === s)!;
      demoG.pool = demoG.pool.filter(p => p !== c);
      if (s === 'coach') c.title = 'cs2';
      demoG.staff.push(c);
    }
    for (const q of Object.values(demoG.squads)) for (const st of q!.stations) for (const k of Object.keys(st.m)) (st.m as any)[k] = 3;
    demoG.trophies = [0, 1, 2, 3].map(i => ({ day: i, title: 'cs2' as TitleId, name: 'x' }));
  }
  app.screen = 'title';
  app.career = null;
  const hq = makeHQ(demoG);
  hq.setInset(0, 0);
  hq.auto = true;
  audio.music('title');
  bump();
}
// ---------- careers
let lock: { release: () => void } | null = null;
async function takeLock(id: string): Promise<boolean> {
  if (!navigator.locks) return true;
  return new Promise(res => {
    navigator.locks.request('sixth-' + id, { ifAvailable: true }, l => {
      if (!l) {
        res(false);
        return;
      }
      res(true);
      return new Promise<void>(r => {
        lock = { release: r };
      });
    });
  });
}
export async function openCareer(id: string): Promise<void> {
  app.busy = 'Verifying save';
  bump();
  try {
    if (!(await takeLock(id))) {
      toast('This career is open in another tab', 'err');
      return;
    }
    const c = await vault.open_(id);
    await enter(c);
  } catch (e) {
    lock?.release();
    lock = null;
    if (e instanceof vault.TamperError) {
      app.sealed = e.reason;
      app.screen = 'sealed';
      await refreshFlags();
    } else toast(String((e as Error).message ?? e), 'err');
  } finally {
    app.busy = '';
    bump();
  }
}
export async function enter(c: vault.Career) {
  if (!lock) await takeLock(c.id);
  app.career = c;
  c.onError = () => toast('Could not write the save. Is the disk full?', 'err');
  app.title = Object.keys(c.g.squads)[0] as TitleId;
  app.screen = 'game';
  app.sheet = null;
  app.booted = false;
  makeHQ();
  app.hq!.auto = false;
  app.hq!.setBlock(Math.min(2, c.g.life.block));
  app.booted = true;
  audio.music('hq');
  audio.play('day', { vol: 0.5 });
  bump();
  setTimeout(() => {
    if (app.career === c) c.audit(spawn).then(() => bump());
    bump();
  }, 4000);
  if (c.g.live) toast('A match was in progress. It resumes from where your orders stopped.', 'info');
}
export async function leaveCareer() {
  if (app.match) {
    app.match.dispose();
    app.match = null;
    app.live = null;
  }
  await app.career?.flush();
  app.session?.close();
  app.session = null;
  lock?.release();
  lock = null;
  app.career = null;
  app.edit = false;
  app.sheet = null;
  app.player = null;
  app.settings = false;
  titleScene();
}
// ---------- time
const BL = ['Morning', 'Afternoon', 'Evening'];
import { BLOCKS } from '../data/club.ts';
import { dow } from '../game/day.ts';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** show what has gone wrong, in the room it went wrong in */
export function showIncident() {
  const g = G_();
  const i = g.life.inc;
  if (!i) return;
  const d = INC[i.id];
  app.incident = true;
  app.outcome = '';
  app.sheet = null;
  app.player = null;
  app.room = null;
  app.timelapse = null;
  const hq = app.hq!;
  hq.timeScale = 1;
  hq.life.clearMoments();
  hq.life.setFx(d.fx, i.room ?? '');
  const room = i.room && g.rooms.some(r => r.type === i.room) ? i.room : d.fx === 'party' || d.fx === 'alarm' ? null : 'practice';
  hq.focusRoom(d.ctx === 'match' || d.fx === 'dark' || d.fx === 'offline' ? 'practice' : room);
  audio.play(d.fx === 'dark' ? 'down' : d.fx === 'party' ? 'notify' : 'error');
  bump();
}
export function decide(c: string) {
  const o = act({ t: 'incident', c }, true);
  if (o.ok) {
    app.outcome = (o.data as any).text;
    app.hq!.life.setFx('none');
    audio.play('confirm', { vol: 0.5 });
    bump();
  }
}
export function incidentDone() {
  app.incident = false;
  app.outcome = '';
  app.hq!.focusRoom(null);
  const g = G_();
  bump();
  // an interrupted day goes on by itself; a match morning waits for the manager
  if (!myToday(g) && g.life.block > 0) nextDay();
}
const newest = () => G_().life.feed[0];
export async function nextDay(quick = false): Promise<boolean> {
  const g = G_();
  if (app.timelapse) return false;
  if (g.life.inc) {
    showIncident();
    return false;
  }
  const f = myToday(g);
  if (f) {
    app.prematch = f.id;
    app.sheet = null;
    bump();
    return false;
  }
  const und = g.inbox.find(m => m.kind === 'event' && !m.done && g.day - m.day >= 2);
  if (und) {
    go('inbox', { id: und.id });
    return false;
  }
  const hq = app.hq!;
  const d = dow(g.day);
  const show = !quick && !app.fast;
  const day = g.day;
  if (show) {
    app.sheet = null;
    app.player = null;
    app.room = null;
    hq.focusRoom(null);
    hq.auto = false;
  }
  let ok = false;
  while (g.day === day) {
    const b = g.life.block;
    const before = newest();
    if (show) {
      hq.life.clearMoments();
      hq.setBlock(b);
      hq.timeScale = 2.4;
      app.timelapse = {
        label: BL[b],
        sub: Object.values(g.squads)
          .map(s => `${tShort(s!.title)}: ${BLOCKS[s!.week[d][b]].name}`)
          .join('   '),
      };
      bump();
      await wait(1500);
      if (!app.career) return false;
      hq.timeScale = 1;
    }
    const o = act({ t: 'advance', step: 1 }, true);
    if (!o.ok) break;
    ok = true;
    const stop = (o.data as any).stop as string;
    if (g.life.inc) {
      app.timelapse = null;
      if (stop === 'incident' && g.day !== day) await nightfall(show);
      showIncident();
      return false;
    }
    if (show) {
      const news = [];
      for (const x of g.life.feed) {
        if (x === before) break;
        news.push(x);
      }
      news.reverse();
      // the loudest moments of the block are the ones you see
      const W = (k: string) =>
        ({
          quit: 9,
          fight: 8,
          rage: 8,
          storm: 7,
          smellno: 6,
          dishes: 5,
          stole: 5,
          peace: 5,
          prankno: 5,
          comfort: 4,
          deep: 4,
          cooked: 4,
          laugh: 3,
          snap: 3,
          smell: 3,
        })[k] ?? 1;
      hq.life.play([...news].sort((x, y) => W(y.k) - W(x.k)).slice(0, 3));
      const t0 = performance.now();
      await wait(1600);
      while (hq.life.talking && performance.now() - t0 < 9000 && app.timelapse) await wait(200);
      if (!app.career) return false;
    }
    if (stop === 'day') break;
  }
  await nightfall(show);
  return ok;
}
async function nightfall(show: boolean) {
  const hq = app.hq!;
  if (show) {
    hq.life.clearMoments();
    hq.setBlock(3);
    hq.timeScale = 2.4;
    app.timelapse = { label: 'Night', sub: 'Lights out' };
    bump();
    await wait(1100);
    hq.timeScale = 1;
  }
  app.timelapse = null;
  hq.setBlock(0);
  audio.play('day', { vol: show ? 0.45 : 0.15 });
  bump();
}
export async function skipAhead() {
  const seen = G_().inbox[0]?.id;
  for (let i = 0; i < 30; i++) {
    if (!(await nextDay(true))) break;
    const g = G_();
    if (myToday(g) || g.over || g.life.inc) break;
    const m = g.inbox.filter(x => x.day === g.day);
    if (m.some(x => (x.kind === 'event' || x.kind === 'bid' || x.kind === 'contract' || x.kind === 'board') && x.id !== seen)) break;
    await wait(70);
  }
  if (G_().life.inc) showIncident();
}
// ---------- matches
export function startMatch(l: LiveView) {
  app.live = l;
  app.screen = 'match';
  app.sheet = null;
  app.prematch = null;
  app.player = null;
  app.settings = false;
  const ov = document.getElementById('matchlayer')!;
  const v = (app.match = new MatchView(app.engine!, l.cfg, ov));
  v.sfx = audio.play;
  app.engine!.setView(v);
  audio.music('match');
  bump();
}
export function endMatchView() {
  app.match?.dispose();
  app.match = null;
  app.live = null;
  app.screen = 'game';
  app.engine!.setView(app.hq!);
  audio.music('hq');
  bump();
}
export { isMe };
