import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { crestSvg, gi, lu, on, orgCrest, paintShirt, vis, crestImage, paintFlatShirt } from './art.ts';
import { shoot, shotNow, type Shot } from '../gfx/studio.ts';
import { EMO } from '../data/life.ts';
import { emoOf } from '../game/life.ts';
import type { Crest, G, Jersey, Look, Player, Staff, Team, TitleId } from '../game/types.ts';
import { app, bump, G_, setTitle, tShort, useApp } from './store.ts';
import { isMe } from '../game/league.ts';
import { audio } from '../audio/audio.ts';
import { ovr } from '../game/gen.ts';
const raw = (h: string) => ({ __html: h });
export const Html = ({ h, c, style }: { h: string; c?: string; style?: Record<string, any> }) => (
  <span class={c} style={{ display: 'inline-flex', ...style }} dangerouslySetInnerHTML={raw(h)} />
);
export const UI = (i: string, s = 18) => <Html h={lu(i, s)} />;
export const Gi = ({ k, s = 20, c }: { k: string; s?: number; c?: string }) => <Html h={gi(k, s, c)} />;
export const CrestI = ({ c, s = 40 }: { c: Partial<Crest>; s?: number }) => <Html h={crestSvg(c, s)} />;
export const TeamCrest = ({ t, s = 32 }: { t: Team; s?: number }) => (
  <CrestI c={isMe(t.id) ? G_().club.crest : orgCrest(t.icon, t.c1, t.c2, t.tag)} s={s} />
);
const BUCKET = [64, 96, 144, 208, 288, 420, 560];
/** a photograph of somebody; a quiet silhouette until it is developed */
export function Pt({
  l,
  id,
  c1,
  c2,
  w,
  h,
  age,
  mood,
  outfit = 'tee',
  crop = 'bust',
  mark,
  act: pose,
  px,
}: {
  l: Look;
  id: string;
  c1: string;
  c2: string;
  w: number | string;
  h?: number | string;
  age?: number;
  mood?: string;
  outfit?: string;
  crop?: 'bust' | 'half' | 'full';
  mark?: ComponentChildren;
  act?: string;
  px?: number;
}) {
  const want = px ?? (typeof w === 'number' ? w : 300);
  const size = BUCKET.find(x => x >= want * 1.35) ?? 560;
  const shot: Shot = {
    look: l,
    id,
    wear: { outfit: outfit as any, age, shoes: outfit === 'suit' ? 'smart' : 'sneak' },
    c1,
    c2,
    size,
    crop,
    mood: mood ? { [mood]: mood === 'open' ? 0.7 : 0.9 } : {},
    act: pose,
  };
  const key = JSON.stringify([shot.look, id, outfit, c1, c2, size, crop, mood, age, pose]);
  const [u, setU] = useState<string | undefined>(() => shotNow(shot));
  useEffect(() => {
    let on = true;
    const k = shotNow(shot);
    setU(k);
    const ab = new AbortController();
    if (!k) shoot(shot, want > 200, ab.signal).then(x => on && setU(x));
    return () => {
      on = false;
      ab.abort();
    };
  }, [key]);
  const css = (v: number | string | undefined) => (typeof v === 'number' ? v + 'px' : v);
  return (
    <span class="pt" style={{ width: css(w), height: css(h ?? w), '--pb': mixHex(c1, '#20262d', 0.45) } as any}>
      {u ? (
        <img src={u} alt="" draggable={false} />
      ) : (
        <Html h='<svg viewBox="0 0 64 64" width="100%" height="100%"><path fill="#fff" d="M32 12a11 12 0 0 1 11 12c0 7-3 11-5 13v3c8 2 15 6 17 24H9c2-18 9-22 17-24v-3c-2-2-5-6-5-13a11 12 0 0 1 11-12z"/></svg>' />
      )}
      {mark}
    </span>
  );
}
const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
  const x = p(a),
    y = p(b);
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
export const Face = ({
  l,
  c1,
  c2,
  s = 40,
  id = 'x',
  age,
  outfit,
  mood,
}: {
  l: Look;
  c1: string;
  c2: string;
  s?: number;
  hs?: boolean;
  bg?: string;
  id?: string;
  age?: number;
  outfit?: string;
  mood?: string;
}) => <Pt l={l} id={id} c1={c1} c2={c2} w={s} age={age} outfit={outfit ?? 'tee'} mood={mood} />;
/** mood as a small coloured square in the corner of a picture */
export const MoodMark = ({ id }: { id: string }) => {
  const g = G_();
  const e = emoOf(g, id);
  return e === 'calm' ? null : (
    <i class="mk" style={{ background: EMO[e].col }} title={EMO[e].name}>
      {UI(EMO[e].icon, 14)}
    </i>
  );
};
export const PFace = ({
  p,
  s = 40,
  h,
  crop,
  px,
}: {
  p: Player;
  s?: number | string;
  h?: number | string;
  hs?: boolean;
  crop?: 'bust' | 'half' | 'full';
  px?: number;
}) => {
  const g = G_();
  const t = p.team ? g.teams[p.team] : null;
  const me = !!t && isMe(t.id);
  const c1 = me ? g.club.jersey.c1 : (t?.c1 ?? '#4a545e'),
    c2 = me ? g.club.jersey.c2 : (t?.c2 ?? '#8a949c');
  const e = me && g.life?.p[p.id] ? emoOf(g, p.id) : 'calm';
  return (
    <Pt
      l={p.look}
      id={p.id}
      c1={c1}
      c2={c2}
      w={s}
      h={h}
      age={p.age}
      crop={crop}
      px={px}
      mood={EMO[e].face || undefined}
      mark={me && crop !== 'half' && crop !== 'full' ? <MoodMark id={p.id} /> : undefined}
    />
  );
};
const SUIT: Record<string, string> = {
  coach: 'long',
  analyst: 'polo',
  psych: 'shirt',
  therapist: 'polo',
  trainer: 'sport',
  chef: 'shirt',
  tech: 'work',
  scout: 'jacket',
  content: 'long',
  partner: 'suit',
  cleaner: 'work',
};
export const SFace = ({
  st,
  s = 40,
  h,
  crop,
  px,
}: {
  st: Staff;
  s?: number | string;
  h?: number | string;
  crop?: 'bust' | 'half' | 'full';
  px?: number;
}) => {
  const g = G_();
  const e = g.life?.p[st.id] ? emoOf(g, st.id) : 'calm';
  return (
    <Pt
      l={st.look}
      id={st.id}
      c1={st.role === 'chef' || st.role === 'therapist' ? '#f2f0ea' : g.club.c1}
      c2={g.club.c2}
      w={s}
      h={h}
      age={st.age}
      outfit={SUIT[st.role] ?? 'polo'}
      crop={crop}
      px={px}
      mood={EMO[e].face || undefined}
      mark={g.life?.p[st.id] && crop !== 'half' ? <MoodMark id={st.id} /> : undefined}
    />
  );
};
export function B({
  children,
  onClick,
  k = '',
  disabled,
  title,
  type,
}: {
  children: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  k?: string;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type ?? 'button'}
      class={
        'b ' +
        k
          .split(' ')
          .map(x => (x === 'p' ? 'pri' : x))
          .join(' ')
      }
      disabled={disabled}
      title={title}
      onClick={e => {
        audio.play('click', { vol: 0.5 });
        onClick?.(e as any);
      }}
    >
      {children}
    </button>
  );
}
/** The house meter: five bars, and a sixth that only lights for the exceptional. */
export const Six = ({ v, s }: { v: number; s?: boolean }) => (
  <span class={'six' + (s ? ' s' : '')} role="img" aria-label={`${Math.round(v)} of 100`}>
    {[0, 1, 2, 3, 4].map(i => (
      <i key={i}>
        <u style={{ height: Math.max(0, Math.min(1, (v - i * 17.6) / 17.6)) * 100 + '%' }} />
      </i>
    ))}
    <i class="x">
      <u style={{ height: Math.max(0, Math.min(1, (v - 88) / 8)) * 100 + '%' }} />
    </i>
  </span>
);
export const Bar = ({ v, inv, w }: { v: number; inv?: boolean; w?: number }) => {
  const q = inv ? 100 - v : v;
  return (
    <div class={'bar ' + (q < 35 ? 'lo' : q < 60 ? 'md' : '')} style={w ? { width: w + 'px' } : undefined}>
      <i style={{ width: Math.max(0, Math.min(100, v)) + '%' }} />
    </div>
  );
};
export const attrCol = (v: number) => (v >= 85 ? '#ffb23e' : v >= 72 ? '#7fe6b8' : v >= 58 ? '#cfe3e2' : v >= 45 ? '#a3bcc0' : '#7f9aa1');
export const Num = ({ v }: { v: number }) => (
  <b class="num" style={{ color: attrCol(v) }}>
    {Math.round(v)}
  </b>
);
export const $ = (n: number, short = false) => {
  const a = Math.abs(n);
  const s =
    short && a >= 1e6
      ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'
      : short && a >= 1e4
        ? (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k'
        : Math.round(a).toLocaleString('en-US');
  return (n < 0 ? '−$' : '$') + s;
};
export const N = (n: number) => Math.round(n).toLocaleString('en-US');
export const Plate = ({ title, children }: { title: string; children?: ComponentChildren }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useApp();
  const g = G_();
  const J = g.club.jersey;
  useLayoutEffect(() => {
    const c = ref.current!;
    c.width = 900;
    c.height = 64;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 900, 64);
    paintShirt(x, { ...J, collar: 'none', sponsor: false, crestPos: 'none' }, 300, -268, 600, 600, 'front', {});
    const q = x.createLinearGradient(0, 0, 900, 0);
    q.addColorStop(0, J.c1);
    q.addColorStop(0.36, J.c1);
    q.addColorStop(0.62, J.c1 + '00');
    x.fillStyle = q;
    x.fillRect(0, 0, 900, 64);
  }, [JSON.stringify(J)]);
  return (
    <div class="plate" style={{ background: J.c1, color: on(J.c1) }}>
      <canvas ref={ref} />
      <h1>{title}</h1>
      <div class="sp" />
      {children}
      <button
        class="ib"
        aria-label="Close panel"
        onClick={() => {
          app.sheet = null;
          app.arg = null;
          app.hq?.focusRoom(null);
          audio.play('whoosh', { vol: 0.25 });
          bump();
        }}
      >
        {UI('x', 22)}
      </button>
    </div>
  );
};
export const Tabs = ({
  v,
  set,
  items,
  right,
}: {
  v: string;
  set: (k: any) => void;
  items: [string, ComponentChildren][];
  right?: ComponentChildren;
}) => (
  <div class="tabs" role="tablist">
    {items.map(([k, l]) => (
      <button
        role="tab"
        aria-selected={v === k}
        class={v === k ? 'on' : ''}
        key={k}
        onClick={() => {
          audio.play('tap');
          set(k);
        }}
      >
        {l}
      </button>
    ))}
    <div class="sp" />
    {right}
  </div>
);
export const useTitle = (): [TitleId, TitleId[]] => {
  const g = G_();
  const ts = TITLES.filter(x => g.squads[x]);
  if (!app.title || !ts.includes(app.title)) app.title = ts[0];
  return [app.title!, ts];
};
export const TitleTabs = ({ right }: { right?: ComponentChildren }) => {
  const [t, ts] = useTitle();
  return (
    <Tabs
      v={t}
      set={setTitle}
      items={ts.map(x => [
        x,
        <>
          {<Gi k={TI[x]} s={17} />}
          {tShort(x)}
        </>,
      ])}
      right={right}
    />
  );
};
export const TI: Record<TitleId, string> = { cs2: 'desert-eagle', val: 'wind-slap', dota: 'crossed-swords', ow: 'shield-reflect' };
export const Modal = ({ children, close, wide }: { children: ComponentChildren; close?: () => void; wide?: boolean }) => {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close) close();
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [close]);
  return (
    <div
      class="scrim"
      onMouseDown={e => {
        if (e.target === e.currentTarget) close?.();
      }}
    >
      <div class={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
};
export const ask = (title: string, body: string, yes: string, run: () => void, danger = false) => {
  app.confirm = { title, body, yes, run, danger };
  bump();
};
export function Shirt({
  j,
  crest,
  side = 'front',
  w = 200,
  name,
  num,
  sponsor,
  away,
}: {
  j: Jersey;
  crest: Crest;
  side?: 'front' | 'back';
  w?: number;
  name?: string;
  num?: number;
  sponsor?: string;
  away?: boolean;
}) {
  const r = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (r.current) paintFlatShirt(r.current, j, crest, side, { name, num, sponsor, away });
  }, [JSON.stringify([j, crest, side, name, num, sponsor, away])]);
  return <canvas ref={r} width={w * 2} height={w * 2} style={{ width: w + 'px', height: w + 'px' }} />;
}
export const Cond = ({ p }: { p: Player }) => (
  <span class="row" style={{ gap: 6 }}>
    {p.injury > 0 && (
      <span class="chip r">
        {p.injuryName} {p.injury}d
      </span>
    )}
    {p.energy < 45 && <span class="chip a">tired</span>}
    {p.stress > 70 && <span class="chip r">stressed</span>}
    {p.form >= 1.5 && <span class="chip g">in form</span>}
    {p.form <= -1.5 && <span class="chip r">cold</span>}
  </span>
);
/** knowledge-limited view of a rating */
export const know = (g: G, id: string) => (g.players[id]?.team && isMe(g.players[id].team!) ? 100 : (g.know[id] ?? 20));
export const fog = (v: number, k: number, seed: string) => {
  if (k >= 96) return String(Math.round(v));
  const w = Math.ceil((100 - k) / 7);
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const o = (h % (w * 2 + 1)) - w;
  const a = Math.max(1, Math.round(v + o - w)),
    b = Math.min(99, Math.round(v + o + w));
  return `${a}–${b}`;
};
export const RoleName = (t: TitleId, r: string) => ROLE[t]?.[r] ?? r;
import { TITLE, TITLES } from '../data/titles.ts';
const ROLE: any = Object.fromEntries(TITLES.map(t => [t, Object.fromEntries(TITLE[t].roles.map(r => [r.id, r.name]))]));
export { ovr, useState, useEffect, useRef, useLayoutEffect, vis, on, crestImage };
export const Form = ({ f }: { f: string }) => (
  <span style={{ display: 'inline-flex', gap: 2 }}>
    {f.split('').map((c, i) => (
      <i
        key={i}
        title={c === 'W' ? 'Win' : 'Loss'}
        style={{
          width: 16,
          height: 16,
          borderRadius: 2,
          background: c === 'W' ? '#1d5a45' : '#5c2a27',
          color: c === 'W' ? '#8ff0c6' : '#ffb9b0',
          font: '700 11px/16px var(--cond)',
          textAlign: 'center',
          fontStyle: 'normal',
        }}
      >
        {c}
      </i>
    ))}
  </span>
);
