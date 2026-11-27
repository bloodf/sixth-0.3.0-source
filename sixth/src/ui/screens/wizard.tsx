/** The first ten minutes: who you are, what the club looks like, what it plays and where it starts. People are real, the place is the one you will get. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { app, bump, enter, makeHQ, titleScene, toast, tName, tShort, useApp } from '../store.ts';
import { $, B, CrestI, Gi, Pt, RoleName, Shirt, Six, UI } from '../kit.tsx';
import { PATTERNS, SHAPES, SPLITS, shirtAtlas, mixHex, on } from '../art.ts';
import { paintWall } from '../wall.ts';
import { Cast, castView, type Actor, type ShotName } from '../../gfx/cast.ts';
import { shoot } from '../../gfx/studio.ts';
import { HEAD } from '../../gfx/human.ts';
import { HAIR_F, HAIR_M } from '../../gfx/look.ts';
import { CLOTH, HAIRS, SKINS } from '../../gfx/character.ts';
import { AGENTS, MOBA, OW, type Look as HeroLook } from '../../data/heroes.ts';
import { CREST_ICONS } from '../../data/icons.gen.ts';
import { NATION, NATIONS, REGION, type Region } from '../../data/names.ts';
import { ORIGINS, ROOMS, SITES } from '../../data/club.ts';
import { TITLE, TITLES, type TitleId } from '../../data/titles.ts';
import type { Crest, G, Jersey, Look } from '../../game/types.ts';
import { genesis, type NewOpts } from '../../game/reducer.ts';
import * as vault from '../../save/vault.ts';
import { randHex } from '../../save/crypto.ts';
import { audio } from '../../audio/audio.ts';
export const SW = [
  '#0b0d10',
  '#3a4048',
  '#8f9aa3',
  '#f4f1e8',
  '#d8362f',
  '#8f1f3a',
  '#f0602a',
  '#ffb01f',
  '#ffe14a',
  '#9ad13c',
  '#1e7a4c',
  '#12a594',
  '#2f8fe0',
  '#1f4fd8',
  '#1d2b64',
  '#6a3fd0',
  '#c14ad0',
  '#e8669a',
  '#6a4630',
  '#c9a25e',
];
export const Swatches = ({ v, set, label }: { v: string; set: (c: string) => void; label: string }) => (
  <div class="fld">
    <span class="lab">{label}</span>
    <div class="sw">
      {SW.map(c => (
        <button
          key={c}
          class={v.toLowerCase() === c ? 'on' : ''}
          style={{ background: c }}
          aria-label={label + ' ' + c}
          onClick={() => set(c)}
        />
      ))}
      <label class="own" style={{ background: SW.includes(v.toLowerCase()) ? undefined : v }} title="Any colour">
        {UI('pipette', 15)}
        <input type="color" value={v} aria-label={label + ' custom'} onInput={e => set((e.target as HTMLInputElement).value)} />
      </label>
    </div>
  </div>
);
export const Fld = ({ l, children, r }: { l: string; children: ComponentChildren; r?: ComponentChildren }) => (
  <div class="fld">
    <span class="lab row sb">
      {l}
      {r}
    </span>
    {children}
  </div>
);
/** one choice out of a few, in a single strip */
export const Seg = <T extends string>({ v, set, o }: { v: T; set: (k: T) => void; o: readonly (readonly [T, string])[] }) => (
  <div class="seg" role="radiogroup">
    {o.map(([k, n]) => (
      <button key={k} role="radio" aria-checked={v === k} class={v === k ? 'on' : ''} onClick={() => set(k)}>
        {n}
      </button>
    ))}
  </div>
);
const Slide = ({
  l,
  v,
  set,
  a = -100,
  b = 100,
  s = 1,
}: {
  l: string;
  v: number;
  set: (n: number) => void;
  a?: number;
  b?: number;
  s?: number;
}) => (
  <label class="sld">
    <span>{l}</span>
    <input
      type="range"
      min={a}
      max={b}
      step={s}
      value={v}
      style={{ '--v': ((v - a) / (b - a)) * 100 + '%', '--z': (a < 0 ? 50 : 0) + '%' } as any}
      onInput={e => set(+(e.target as HTMLInputElement).value)}
    />
  </label>
);
export function CrestEd({ c, set }: { c: Crest; set: (c: Crest) => void }) {
  const u = (p: Partial<Crest>) => set({ ...c, ...p });
  return (
    <div class="col" style={{ gap: 18 }}>
      <Fld l="Emblem">
        <div class="icg">
          {CREST_ICONS.map(i => (
            <button key={i} class={c.icon === i ? 'on' : ''} aria-label={i.replace(/-/g, ' ')} onClick={() => u({ icon: i })}>
              <Gi k={i} s={30} />
            </button>
          ))}
        </div>
      </Fld>
      <Fld l="Shape">
        <div class="tiles" style={{ '--n': 8 } as any}>
          {Object.keys(SHAPES).map(s => (
            <button key={s} aria-label={s} class={c.shape === s ? 'on' : ''} onClick={() => u({ shape: s })}>
              <svg viewBox="0 0 100 100" width="30" height="30">
                <path d={SHAPES[s]} fill="currentColor" />
              </svg>
            </button>
          ))}
        </div>
      </Fld>
      <Fld l="Field">
        <div class="tiles" style={{ '--n': 8 } as any}>
          {Object.keys(SPLITS).map(s => (
            <button key={s} aria-label={s} class={c.split === s ? 'on' : ''} onClick={() => u({ split: s })}>
              <CrestI c={{ ...c, split: s, icon: '', ribbonOn: false }} s={34} />
            </button>
          ))}
        </div>
      </Fld>
      <div class="g2" style={{ gap: '4px 24px' }}>
        <Slide l="Emblem size" v={c.iscale} a={0.5} b={1.5} s={0.02} set={n => u({ iscale: n })} />
        <Slide l="Emblem height" v={c.iy} a={-16} b={16} set={n => u({ iy: n })} />
        <Slide l="Border" v={c.border} a={0} b={8} s={0.5} set={n => u({ border: n })} />
        <label class="sld">
          <span>
            <input type="checkbox" checked={c.ribbonOn} onChange={e => u({ ribbonOn: (e.target as any).checked })} /> Ribbon
          </span>
          <input
            type="text"
            maxLength={8}
            value={c.ribbon}
            onInput={e => u({ ribbon: (e.target as any).value.toUpperCase(), ribbonOn: true })}
          />
        </label>
      </div>
      <Swatches label="Emblem colour" v={c.icolor} set={x => u({ icolor: x })} />
    </div>
  );
}
export function ShirtEd({ j, set }: { j: Jersey; set: (j: Jersey) => void }) {
  const u = (p: Partial<Jersey>) => set({ ...j, ...p });
  return (
    <div class="col" style={{ gap: 18 }}>
      <Fld l="Pattern">
        <div class="tiles" style={{ '--n': 6 } as any}>
          {PATTERNS.map(p => (
            <button key={p} aria-label={p} class={j.pattern === p ? 'on' : ''} onClick={() => u({ pattern: p })}>
              <Shirt j={{ ...j, pattern: p, sponsor: false, crestPos: 'none' }} crest={{} as any} w={56} />
            </button>
          ))}
        </div>
      </Fld>
      <Swatches label="Body" v={j.c1} set={x => u({ c1: x })} />
      <Swatches label="Pattern" v={j.c2} set={x => u({ c2: x })} />
      <Swatches label="Trim" v={j.c3} set={x => u({ c3: x })} />
      <Swatches label="Lettering" v={j.numColor} set={x => u({ numColor: x })} />
      <div class="g2" style={{ gap: '16px 24px' }}>
        <Fld l="Collar">
          <Seg
            v={j.collar as 'v'}
            set={collar => u({ collar })}
            o={
              [
                ['crew', 'Crew'],
                ['v', 'V-neck'],
                ['polo', 'Polo'],
              ] as any
            }
          />
        </Fld>
        <Fld l="Sleeves">
          <Seg
            v={j.sleeve}
            set={sleeve => u({ sleeve })}
            o={[
              ['match', 'Body'],
              ['second', 'Pattern'],
              ['third', 'Trim'],
            ]}
          />
        </Fld>
        <Fld l="Typeface">
          <Seg
            v={j.font}
            set={font => u({ font })}
            o={[
              ['wide', 'Wide'],
              ['cond', 'Narrow'],
              ['block', 'Block'],
            ]}
          />
        </Fld>
        <Fld l="Crest">
          <Seg
            v={j.crestPos}
            set={crestPos => u({ crestPos })}
            o={[
              ['left', 'Heart'],
              ['centre', 'Centre'],
              ['none', 'Off'],
            ]}
          />
        </Fld>
      </div>
      <Swatches label="Away body" v={j.away} set={x => u({ away: x })} />
    </div>
  );
}
const STYLES = [
  { k: 'mentor', n: 'Mentor', icon: 'heart-handshake', d: 'Talks land better. Players open up, and come back from a bad night sooner.' },
  {
    k: 'tactician',
    n: 'Tactician',
    icon: 'brain-circuit',
    d: 'Knows the game cold. Prep and plans are worth more when they come from you.',
  },
  { k: 'showman', n: 'Showman', icon: 'megaphone', d: 'Fans and sponsors come looking. So does the press.' },
];
const DUOS: [string, string, string][] = [
  ['#d8362f', '#0b0d10', '#f4f1e8'],
  ['#1f4fd8', '#ffe14a', '#f4f1e8'],
  ['#0b0d10', '#ffb01f', '#f4f1e8'],
  ['#12a594', '#1d2b64', '#f4f1e8'],
  ['#6a3fd0', '#e8669a', '#f4f1e8'],
  ['#f0602a', '#3a4048', '#f4f1e8'],
  ['#1e7a4c', '#c9a25e', '#f4f1e8'],
  ['#f4f1e8', '#d8362f', '#0b0d10'],
  ['#8f1f3a', '#c9a25e', '#f4f1e8'],
  ['#1d2b64', '#2f8fe0', '#ffe14a'],
  ['#ffe14a', '#0b0d10', '#0b0d10'],
  ['#9ad13c', '#3a4048', '#f4f1e8'],
];
const SLIDERS: [string, [string, string][]][] = [
  [
    'Head',
    [
      ['headSquare', 'Square'],
      ['headRound', 'Round'],
      ['headTall', 'Tall'],
      ['headFat', 'Weight'],
    ],
  ],
  [
    'Eyes and brow',
    [
      ['eyesBig', 'Eye size'],
      ['eyesTilt', 'Eye tilt'],
      ['eyesApart', 'Eye spacing'],
      ['browHeavy', 'Brow'],
    ],
  ],
  [
    'Nose',
    [
      ['noseWide', 'Width'],
      ['noseLong', 'Length'],
      ['noseOut', 'Depth'],
      ['noseHump', 'Bridge'],
      ['noseTip', 'Tip'],
    ],
  ],
  [
    'Mouth and jaw',
    [
      ['mouthWide', 'Mouth'],
      ['lipsFull', 'Lips'],
      ['chinLong', 'Chin length'],
      ['chinWide', 'Jaw width'],
      ['chinOut', 'Chin forward'],
    ],
  ],
  [
    'Cheeks and ears',
    [
      ['cheekBones', 'Cheekbones'],
      ['cheekFull', 'Cheeks'],
      ['earsBig', 'Ear size'],
      ['earsOut', 'Ear angle'],
    ],
  ],
];
const HAIRN: Record<string, string> = {
  h_short1: 'Crop',
  h_short2: 'Side part',
  h_short3: 'Textured',
  h_short4: 'Swept',
  h_afro: 'Afro',
  h_hawk: 'Mohawk',
  h_curly: 'Curls',
  h_bob1: 'Bob',
  h_bob2: 'Long bob',
  h_pony: 'Ponytail',
  h_long: 'Long',
  h_braid: 'Braid',
  '': 'Shaved',
};
const EYES = ['#4a2f1c', '#5b7f9c', '#6f8a5a', '#7a5b34', '#2c1c12', '#8aa0aa', '#4f7a6a', '#9a7a3c'];
const WEARS: [string, string][] = [
  ['suit', 'Suit'],
  ['shirt', 'Shirt'],
  ['jacket', 'Jacket'],
  ['polo', 'Polo'],
  ['long', 'Sweatshirt'],
  ['tee', 'T-shirt'],
  ['work', 'Overshirt'],
];
const GAME_ART: Record<TitleId, { look: HeroLook; id: string; gun?: string; bg: string; act?: string }> = {
  cs2: {
    look: { body: 'soldier', c1: '#55603a', c2: '#c7a35a', glow: '#ffb23e', head: 'helm', prop: 'rifle' } as HeroLook,
    id: 'breach',
    bg: '#c98a2b',
  },
  val: { look: AGENTS[1].look, id: AGENTS[1].id, bg: '#d2313f' },
  dota: { look: MOBA.find(h => h.look.body === 'knight')!.look, id: 'k', bg: '#3d6b2f' },
  ow: { look: OW.find(h => h.look.body === 'soldier' && h.look.prop === 'rifle')!.look, id: 'ow', bg: '#2f63c9' },
};
const R = (n: number) => Math.floor(Math.random() * n);
/** somebody */
function anyone(fem = Math.random() < 0.4, keep: Partial<Look> = {}): Look {
  const r = R(3);
  const bell = () => Math.round(((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * 55);
  return {
    skin: r === 2 ? 4 + R(3) : r === 1 ? R(3) : R(4),
    hair: fem ? 8 + R(6) : R(8),
    hairC: r === 0 ? R(8) : R(3),
    face: R(5),
    eye: R(4),
    brow: R(4),
    nose: 1,
    mouth: R(4),
    beard: fem ? 0 : [0, 0, 1, 2, 3, 4][R(6)],
    glasses: Math.random() < 0.2 ? 1 : 0,
    fem,
    head: R(4),
    r,
    f: HEAD.map(bell),
    h: (fem ? HAIR_F : HAIR_M)[R((fem ? HAIR_F : HAIR_M).length - 1)],
    ec: r ? 0 : R(8),
    o: 'suit',
    oc: 0,
    a: 27 + R(22),
    ...keep,
  };
}
const Hero = ({ t }: { t: TitleId }) => {
  const a = GAME_ART[t];
  const [u, setU] = useState('');
  useEffect(() => {
    let on = true;
    shoot(
      {
        look: {} as Look,
        id: t,
        wear: { outfit: 'tee' },
        c1: a.bg,
        c2: '#ffffff',
        size: 420,
        hero: { look: a.look, id: a.id, gun: a.gun },
        act: a.act,
      },
      true,
    ).then(x => on && setU(x));
    return () => {
      on = false;
    };
  }, []);
  return u ? <img src={u} alt="" /> : <i class="ghost" />;
};
const STEPS = ['You', 'Club', 'Crest', 'Shirt', 'Games', 'Start'] as const;
const HEADS = ['Who runs it', 'Name the club', 'Draw the crest', 'Cut the shirt', 'Pick your games', 'Where it begins'];
export function Wizard() {
  useApp();
  const [st, setSt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'person' | 'face' | 'hair' | 'wear'>('person');
  const [m, setM] = useState({ name: '', nat: 'DK', style: 'mentor' });
  const [look, setLook] = useState<Look>(() => anyone());
  const [faces, setFaces] = useState<Look[]>(() => Array.from({ length: 8 }, (_, i) => anyone(i % 2 === 1)));
  const [c, setC] = useState({
    name: '',
    tag: '',
    city: '',
    motto: '',
    region: 'EU' as Region,
    c1: '#d8362f',
    c2: '#0b0d10',
    c3: '#f4f1e8',
  });
  const [crest, setCrest] = useState<Crest>({
    shape: 'heater',
    split: 'half',
    icon: 'raven',
    c1: '#d8362f',
    c2: '#a92a25',
    c3: '#f4f1e8',
    icolor: '#f4f1e8',
    iscale: 1,
    iy: 0,
    border: 3.5,
    ribbon: '',
    ribbonOn: false,
  });
  const [j, setJ] = useState<Jersey>({
    pattern: 'sash',
    c1: '#d8362f',
    c2: '#0b0d10',
    c3: '#f4f1e8',
    collar: 'v',
    sleeve: 'second',
    crestPos: 'left',
    font: 'wide',
    numColor: '#f4f1e8',
    sponsor: true,
    away: '#f4f1e8',
  });
  const [ts, setTs] = useState<TitleId[]>(['cs2']);
  const [or, setOr] = useState('backed');
  const [tagTouched, setTT] = useState(false);
  const [seed] = useState(() => randHex(16));
  const recolor = (p: Partial<typeof c>) => {
    const n = { ...c, ...p };
    setC(n);
    const d = mixHex(n.c1, '#000000', 0.22);
    setCrest({ ...crest, c1: n.c1, c2: d, c3: n.c3, icolor: on(n.c1) === '#ffffff' ? n.c3 : n.c2 });
    setJ({ ...j, c1: n.c1, c2: n.c2, c3: n.c3, numColor: on(n.c1) === '#ffffff' ? '#f4f1e8' : '#0b0d10' });
  };
  const okStep = [m.name.trim().length > 1, c.name.trim().length > 1 && /^[A-Z0-9]{2,4}$/.test(c.tag), true, true, ts.length > 0, true];
  const reach = (i: number) => okStep.slice(0, i).every(Boolean);
  const opts = (): NewOpts => ({
    seed,
    mgr: { ...m, name: m.name.trim(), look },
    club: { ...c, name: c.name.trim(), crest, jersey: j },
    origin: or,
    titles: TITLES.filter(t => ts.includes(t)),
    t0: new Date().toISOString().slice(0, 10),
  });
  // ---------- the stage behind
  const cast = useRef<Cast | null>(null);
  useEffect(() => {
    const e = app.engine!;
    const s = (cast.current = castView(e));
    e.setView(s);
    return () => {
      if (e.view === s) e.setView(null);
      s.dispose();
    };
  }, []);
  const away = st === 5;
  useEffect(() => {
    const e = app.engine!;
    if (!away && cast.current && e.view !== cast.current) e.setView(cast.current);
  }, [away]);
  useEffect(() => {
    const f = () => cast.current?.setInset(innerWidth > 900 ? Math.min(560, innerWidth * 0.44) : 0);
    f();
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  const draft = useRef(0);
  useEffect(() => {
    const s = cast.current!;
    const shot: ShotName =
      st === 0
        ? tab === 'face' || tab === 'hair'
          ? 'face'
          : tab === 'person'
            ? 'half'
            : 'full'
        : st === 2
          ? 'crest'
          : st === 3
            ? 'full'
            : 'full';
    s.shot(shot);
    s.close = shot === 'face' || shot === 'half';
    s.yaw = 0;
    s.wake(1.4);
    s.spin = st === 3 ? 0.35 : 0;
  }, [st, tab]);
  const lookSig = JSON.stringify([look, c.c1, c.c2, st, j.sleeve, j.c1]);
  useEffect(() => {
    const s = cast.current!;
    const me: Actor = {
      key: 'me',
      look,
      id: 'me',
      wear: { outfit: (look.o as 'suit') ?? 'suit', shoes: 'smart', age: look.a ?? 33 },
      c1: CLOTH[look.oc ?? 0] ?? c.c1,
      c2: c.c1,
      x: 0,
      z: 0,
      yaw: 0.16,
      mood: { smile: 0.18 },
    };
    const kid = (k: string, fem: boolean, x: number, yaw: number): Actor => ({
      key: k,
      look: { ...KIDS[fem ? 1 : 0] },
      id: k,
      wear: { outfit: 'tee', age: 20 },
      c1: j.c1,
      c2: j.c2,
      x,
      z: 0.1,
      yaw,
      shirt: true,
    });
    s.sleeves = j.sleeve === 'match' ? j.c1 : j.sleeve === 'second' ? j.c2 : j.c3;
    const go = (d: boolean) =>
      s.set(st === 3 ? [kid('k1', false, -0.56, 0.3), kid('k2', true, 0.56, Math.PI + 0.3)] : st === 2 || st === 4 ? [] : [me], d);
    go(st === 0);
    clearTimeout(draft.current);
    if (st === 0) draft.current = window.setTimeout(() => go(false), 500) as any;
    return () => clearTimeout(draft.current);
  }, [lookSig]);
  const wallSig = JSON.stringify([st, c.c1, c.c2, c.c3, st === 0 ? m.name : c.name, st === 2 ? crest : 0]);
  useEffect(() => {
    let dead = false;
    const id = setTimeout(
      () =>
        paintWall({
          kind: (['you', 'club', 'crest', 'shirt', 'club', 'club'] as const)[st],
          c1: c.c1,
          c2: c.c2,
          c3: c.c3,
          crest,
          text: st === 0 ? m.name.trim().split(/\s+/).pop() || 'Sixth' : st === 3 ? c.tag || 'SIX' : c.name || 'Your club',
        }).then(w => {
          if (!dead) cast.current?.paint(w.cv, w.ground, st ? c.c1 : '#ffc61a', st ? c.c2 : '#ffffff');
        }),
      120,
    );
    return () => {
      dead = true;
      clearTimeout(id);
    };
  }, [wallSig]);
  const shirtSig = JSON.stringify([j, crest, st === 3]);
  useEffect(() => {
    if (st !== 3) return;
    let dead = false;
    shirtAtlas(j, crest, { name: m.name.trim().split(/\s+/).pop() || 'SIXTH', num: 6, sponsor: 'NORTHBANK', res: 1024 }).then(cv => {
      if (!dead) cast.current?.setShirt(cv);
    });
    return () => {
      dead = true;
    };
  }, [shirtSig]);
  // ---------- the place you will get
  const [g, setG] = useState<G | null>(null);
  useEffect(() => {
    if (st !== 5) return;
    const id = setTimeout(() => {
      const n = genesis(opts());
      setG(n);
      const hq = makeHQ(n);
      hq.auto = true;
      hq.setInset(-Math.min(560, innerWidth * 0.44) * 0.9, 0);
      bump();
    }, 60);
    return () => clearTimeout(id);
  }, [st, or]);
  const go = async () => {
    setBusy(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      await enter(await vault.create(opts()));
    } catch (e) {
      toast('Could not create the career: ' + (e as Error).message, 'err');
      setBusy(false);
    }
  };
  const next = () => {
    if (!okStep[st] || busy) return;
    audio.play('whoosh', { vol: 0.35 });
    if (st < 5) setSt(st + 1);
    else go();
  };
  const jump = (i: number) => {
    if (!reach(i) || i === st) return;
    audio.play('click');
    setSt(i);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button,select,textarea')) next();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });
  const tagOf = (n: string) => {
    const w = n
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    return (w.length >= 3 ? w.map(x => x[0]).join('') : w.length === 2 ? w[0].slice(0, 2) + w[1][0] : (w[0] ?? '').slice(0, 3)).slice(0, 4);
  };
  const rand = () => {
    const A = ['Harbour', 'North', 'Copper', 'Signal', 'Tidal', 'Night', 'Paper', 'Iron', 'Glass', 'Low', 'Ember', 'Quiet'],
      Z = ['Foxes', 'Club', 'Union', 'Parish', 'Five', 'Circuit', 'Ravens', 'Works', 'House', 'Guard', 'Kings', 'Static'];
    const n = `${A[R(A.length)]} ${Z[R(Z.length)]}`;
    setC({ ...c, name: n, tag: tagTouched ? c.tag : tagOf(n) });
  };
  const L = (p: Partial<Look>) => setLook({ ...look, ...p });
  const f = look.f ?? HEAD.map(() => 0);
  return (
    <div class={'cz s' + st} style={{ '--wz': c.c1, '--wz2': c.c2, '--onwz': on(c.c1) } as any}>
      <nav class="czn" aria-label="Steps">
        {STEPS.map((n, i) => (
          <button key={n} class={(i === st ? 'on ' : '') + (i < st ? 'done' : '')} disabled={!reach(i)} onClick={() => jump(i)}>
            <i />
            <span>{n}</span>
          </button>
        ))}
      </nav>
      {st === 4 && (
        <div class="games">
          {TITLES.map(t => {
            const sel = ts.includes(t);
            return (
              <button
                key={t}
                class={sel ? 'on' : ''}
                aria-pressed={sel}
                style={{ '--gc': GAME_ART[t].bg } as any}
                onClick={() => {
                  audio.play('click');
                  setTs(sel ? ts.filter(x => x !== t) : [...ts, t]);
                }}
              >
                <Hero t={t} />
                <span class="gt">
                  <em>{sel ? UI('check', 26) : UI('plus', 24)}</em>
                  <small>{TITLE[t].genre}</small>
                  <b>{tName(t)}</b>
                  <p>{TITLE[t].blurb}</p>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {st !== 4 && (
        <section class="czp" key={st}>
          <header>
            <h1>{HEADS[st]}</h1>
            {st === 0 && (
              <div class="cztabs" role="tablist">
                {(
                  [
                    ['person', 'Person'],
                    ['face', 'Face'],
                    ['hair', 'Hair'],
                    ['wear', 'Clothes'],
                  ] as const
                ).map(([k, n]) => (
                  <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                    {n}
                  </button>
                ))}
                <button
                  class="dice"
                  title="Somebody else"
                  aria-label="Somebody else"
                  onClick={() => {
                    audio.play('click');
                    setLook(anyone(look.fem, { o: look.o, oc: look.oc }));
                  }}
                >
                  {UI('dices', 19)}
                </button>
              </div>
            )}
          </header>
          <div class="bd">
            {st === 0 && tab === 'person' && (
              <>
                <Fld l="Your name">
                  <input
                    class="bigin"
                    type="text"
                    maxLength={24}
                    value={m.name}
                    autoFocus
                    placeholder="First and last"
                    onInput={e => setM({ ...m, name: (e.target as any).value })}
                  />
                </Fld>
                <div class="g2" style={{ gap: 20 }}>
                  <Fld l="From">
                    <select
                      value={m.nat}
                      onChange={e => {
                        const n = (e.target as any).value;
                        setM({ ...m, nat: n });
                        setC({ ...c, region: NATION[n].region });
                      }}
                    >
                      {NATIONS.map(n => (
                        <option value={n.id} key={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </Fld>
                  <Fld l="Body">
                    <Seg
                      v={look.fem ? 'f' : 'm'}
                      set={k => {
                        if ((k === 'f') !== look.fem)
                          setLook(anyone(k === 'f', { o: look.o, oc: look.oc, r: look.r, skin: look.skin, a: look.a }));
                      }}
                      o={[
                        ['m', 'Man'],
                        ['f', 'Woman'],
                      ]}
                    />
                  </Fld>
                </div>
                <Slide l={`Age ${look.a ?? 33}`} v={look.a ?? 33} a={22} b={64} set={a => L({ a })} />
                <Fld l="How you lead">
                  <div class="picks">
                    {STYLES.map(({ k, n, icon, d }) => (
                      <button key={k} class={m.style === k ? 'on' : ''} onClick={() => setM({ ...m, style: k })}>
                        {UI(icon, 24)}
                        <span>
                          <b>{n}</b>
                          {d}
                        </span>
                      </button>
                    ))}
                  </div>
                </Fld>
              </>
            )}
            {st === 0 && tab === 'face' && (
              <>
                <Fld
                  l="Start from a face"
                  r={
                    <button class="lnk" onClick={() => setFaces(Array.from({ length: 8 }, () => anyone(look.fem)))}>
                      Eight more
                    </button>
                  }
                >
                  <div class="facegrid">
                    {faces.map((l, i) => (
                      <button
                        key={i}
                        class={JSON.stringify(l.f) === JSON.stringify(look.f) ? 'on' : ''}
                        aria-label={'Face ' + (i + 1)}
                        onClick={() => setLook({ ...l, o: look.o, oc: look.oc, a: look.a })}
                      >
                        <Pt l={l} id="me" c1="#2b333d" c2="#858c94" w="100%" px={82} age={look.a} outfit="tee" />
                      </button>
                    ))}
                  </div>
                </Fld>
                <div class="g2" style={{ gap: 20 }}>
                  <Fld l="Features">
                    <Seg
                      v={String(look.r ?? 0)}
                      set={k => L({ r: +k })}
                      o={[
                        ['0', 'A'],
                        ['1', 'B'],
                        ['2', 'C'],
                      ]}
                    />
                  </Fld>
                  <Fld l="Skin">
                    <div class="sw even">
                      {SKINS.map((s, i) => (
                        <button
                          key={s}
                          class={look.skin === i ? 'on' : ''}
                          aria-label={'Skin ' + (i + 1)}
                          style={{ background: s }}
                          onClick={() => L({ skin: i })}
                        />
                      ))}
                    </div>
                  </Fld>
                </div>
                <Fld l="Eyes">
                  <div class="sw even">
                    {EYES.map((s, i) => (
                      <button
                        key={i}
                        class={look.ec === i ? 'on' : ''}
                        aria-label={'Eye colour ' + (i + 1)}
                        style={{ background: s }}
                        onClick={() => L({ ec: i })}
                      />
                    ))}
                  </div>
                </Fld>
                {SLIDERS.map(([n, l]) => (
                  <Fld l={n} key={n}>
                    <div class="g2" style={{ gap: '2px 24px' }}>
                      {l.map(([k, lab]) => {
                        const i = HEAD.indexOf(k as 'headSquare');
                        return <Slide key={k} l={lab} v={f[i]} set={v => L({ f: f.map((x, q) => (q === i ? v : x)) })} />;
                      })}
                    </div>
                  </Fld>
                ))}
              </>
            )}
            {st === 0 && tab === 'hair' && (
              <>
                <Fld l="Cut">
                  <div class="facegrid">
                    {(look.fem ? HAIR_F : HAIR_M).map(h => (
                      <button key={h} class={look.h === h ? 'on' : ''} aria-label={HAIRN[h]} onClick={() => L({ h })}>
                        <Pt l={{ ...look, h }} id="me" c1="#2b333d" c2="#858c94" w="100%" px={82} age={look.a} outfit="tee" />
                        <small>{HAIRN[h]}</small>
                      </button>
                    ))}
                  </div>
                </Fld>
                <Fld l="Colour">
                  <div class="sw even">
                    {HAIRS.map((s, i) => (
                      <button
                        key={s}
                        class={look.hairC === i ? 'on' : ''}
                        aria-label={'Hair colour ' + (i + 1)}
                        style={{ background: s }}
                        onClick={() => L({ hairC: i })}
                      />
                    ))}
                  </div>
                </Fld>
                <Fld l="Brows">
                  <Seg
                    v={String(look.brow)}
                    set={k => L({ brow: +k })}
                    o={[
                      ['0', 'Thin'],
                      ['1', 'Straight'],
                      ['2', 'Arched'],
                      ['3', 'Thick'],
                    ]}
                  />
                </Fld>
                {!look.fem && (
                  <Fld l="Beard">
                    <Seg
                      v={String(look.beard)}
                      set={k => L({ beard: +k })}
                      o={[
                        ['0', 'None'],
                        ['2', 'Shadow'],
                        ['1', 'Stubble'],
                        ['3', 'Moustache'],
                        ['4', 'Full'],
                      ]}
                    />
                  </Fld>
                )}
              </>
            )}
            {st === 0 && tab === 'wear' && (
              <>
                <Fld l="What you turn up in">
                  <div class="seg wrap">
                    {WEARS.filter(([k]) => !look.fem || !['shirt', 'jacket', 'polo', 'long', 'work'].includes(k))
                      .concat(
                        look.fem
                          ? [
                              ['short', 'Summer'],
                              ['sport', 'Training'],
                            ]
                          : [],
                      )
                      .map(([k, n]) => (
                        <button key={k} class={look.o === k ? 'on' : ''} onClick={() => L({ o: k })}>
                          {n}
                        </button>
                      ))}
                  </div>
                </Fld>
                <Fld l="Glasses">
                  <Seg
                    v={look.glasses ? '1' : '0'}
                    set={k => L({ glasses: +k })}
                    o={[
                      ['0', 'Off'],
                      ['1', 'On'],
                    ]}
                  />
                </Fld>
                <Fld l="Build">
                  <Slide
                    l="Face weight"
                    v={f[HEAD.indexOf('headFat')]}
                    set={v => L({ f: f.map((x, q) => (q === HEAD.indexOf('headFat') ? v : x)) })}
                  />
                </Fld>
                <Fld l="Cloth">
                  <div class="sw even">
                    {CLOTH.map((s, i) => (
                      <button
                        key={s}
                        class={(look.oc ?? 0) === i ? 'on' : ''}
                        aria-label={'Cloth ' + (i + 1)}
                        style={{ background: s }}
                        onClick={() => L({ oc: i })}
                      />
                    ))}
                  </div>
                </Fld>
              </>
            )}
            {st === 1 && (
              <>
                <Fld
                  l="Name"
                  r={
                    <button class="lnk" onClick={rand}>
                      Suggest one
                    </button>
                  }
                >
                  <input
                    class="bigin"
                    type="text"
                    maxLength={22}
                    value={c.name}
                    autoFocus
                    onInput={e => {
                      const n = (e.target as any).value;
                      setC({ ...c, name: n, tag: tagTouched ? c.tag : tagOf(n) });
                    }}
                  />
                </Fld>
                <div class="czg3">
                  <Fld l="Tag">
                    <input
                      type="text"
                      maxLength={4}
                      value={c.tag}
                      onInput={e => {
                        setTT(true);
                        setC({ ...c, tag: (e.target as any).value.toUpperCase().replace(/[^A-Z0-9]/g, '') });
                      }}
                    />
                  </Fld>
                  <Fld l="City">
                    <input type="text" maxLength={20} value={c.city} onInput={e => setC({ ...c, city: (e.target as any).value })} />
                  </Fld>
                  <Fld l="League region">
                    <select value={c.region} onChange={e => setC({ ...c, region: (e.target as any).value })}>
                      {Object.entries(REGION).map(([k, n]) => (
                        <option value={k} key={k}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Fld>
                </div>
                <Fld l="Motto, if you must">
                  <input type="text" maxLength={48} value={c.motto} onInput={e => setC({ ...c, motto: (e.target as any).value })} />
                </Fld>
                <Fld l="Colours">
                  <div class="duos">
                    {DUOS.map(d => (
                      <button
                        key={d.join()}
                        class={c.c1 === d[0] && c.c2 === d[1] ? 'on' : ''}
                        aria-label={'Colours ' + d.join(' ')}
                        style={{ background: `linear-gradient(115deg, ${d[0]} 0 58%, ${d[1]} 58% 88%, ${d[2]} 88%)` }}
                        onClick={() => {
                          audio.play('click');
                          recolor({ c1: d[0], c2: d[1], c3: d[2] });
                        }}
                      />
                    ))}
                  </div>
                </Fld>
                <Swatches label="First" v={c.c1} set={x => recolor({ c1: x })} />
                <Swatches label="Second" v={c.c2} set={x => recolor({ c2: x })} />
                <Swatches label="Third" v={c.c3} set={x => recolor({ c3: x })} />
              </>
            )}
            {st === 2 && <CrestEd c={crest} set={setCrest} />}
            {st === 3 && <ShirtEd j={j} set={setJ} />}
            {st === 5 && (
              <>
                <div class="picks or">
                  {ORIGINS.map(o => {
                    const site = Math.max(o.site, ts.length >= 3 ? 2 : ts.length >= 2 ? 1 : 0);
                    return (
                      <button key={o.id} class={or === o.id ? 'on' : ''} onClick={() => setOr(o.id)}>
                        <span>
                          <b>{o.name}</b>
                          {o.desc}
                          <span class="nums">
                            <u>
                              <b>{$(Math.round(o.cash * (1 + (ts.length - 1) * 0.55)), true)}</b>cash
                            </u>
                            <u>
                              <b>{o.fans.toLocaleString('en-US')}</b>fans
                            </u>
                            <u>
                              <b>{SITES[site].name}</b>
                              {o.diff}
                            </u>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {g &&
                  ts.map(t => (
                    <Fld l={`Your ${tShort(t)} five`} key={t}>
                      <div class="five5">
                        {g.squads[t]!.lineup.map(id => {
                          const p = g.players[id!];
                          return p ? (
                            <span key={p.id}>
                              <Pt l={p.look} id={p.id} c1={j.c1} c2={j.c2} w="100%" px={150} age={p.age} />
                              <b>{p.nick}</b>
                              <small>{RoleName(t, p.role)}</small>
                            </span>
                          ) : null;
                        })}
                      </div>
                    </Fld>
                  ))}
                {g && (
                  <p class="sec sm">
                    {g.rooms.length} rooms: {[...new Set(g.rooms.map(r => ROOMS[r.type].name.toLowerCase()))].join(', ')}. Every wall in it
                    can be moved.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      )}
      <footer class="czf">
        <B k="l q" onClick={() => (st ? setSt(st - 1) : titleScene())}>
          {UI('arrow-left', 20)}
          {st ? STEPS[st - 1] : 'Title'}
        </B>
        {st === 4 && (
          <span class="sec grow czt">
            {ts.length
              ? `${ts.map(tShort).join(', ')}. ${ts.length > 1 ? `${ts.length} squads, ${ts.length} payrolls, and more starting cash.` : 'More can be added later.'}`
              : 'Pick at least one.'}
          </span>
        )}
        {st !== 4 && <span class="grow" />}
        {st > 0 && st !== 2 && (
          <span class="lock">
            <CrestI c={crest} s={44} />
            <span>
              <b>{c.name || 'Your club'}</b>
              <small>{[c.city, REGION[c.region]].filter(Boolean).join(', ')}</small>
            </span>
          </span>
        )}
        {st === 2 && (
          <span class="lock">
            <CrestI c={crest} s={58} />
            <CrestI c={crest} s={32} />
            <CrestI c={crest} s={18} />
          </span>
        )}
        <B k="p l" disabled={!okStep[st] || busy || (st === 5 && !g)} onClick={next}>
          {st < 5 ? STEPS[st + 1] : busy ? 'Unlocking…' : 'Open the doors'}
          {UI('arrow-right', 22)}
        </B>
      </footer>
    </div>
  );
}
const KIDS: Look[] = [
  { ...anyone(false), skin: 2, r: 0, hairC: 1, h: 'h_short4', beard: 0, glasses: 0, f: HEAD.map(() => 0), a: undefined, o: undefined },
  { ...anyone(true), skin: 3, r: 1, hairC: 0, h: 'h_pony', beard: 0, glasses: 0, f: HEAD.map(() => 0), a: undefined, o: undefined },
];
export { useMemo, Six };
