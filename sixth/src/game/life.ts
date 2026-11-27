/**
 * People living together. Needs run down, habits show, words are exchanged, and all of it ends up in how somebody feels.
 * Pure and deterministic like the rest of the career.
 */
import { Rng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import { CLASH, GRIPES, QUIRK_IDS, TOPICS, TRICKS, type Emo, type FeedK, type HouseRules } from '../data/life.ts';
import { GEAR, GEAR_SLOTS, type Block, type RoomType } from '../data/club.ts';
import type { TitleId } from '../data/titles.ts';
import type { G, Player, Squad, Staff } from './types.ts';
import { mine, msg } from './events.ts';
import { staffSkill } from './match.ts';
import { neighbours } from './seats.ts';
export interface Life {
  /** fed, washed, entertained, in company: 0 to 100 */
  hun: number;
  hyg: number;
  fun: number;
  soc: number;
  anger: number;
  /** staff only; players have their own */
  mor: number;
  q: string[];
  /** days since the last proper shower */
  dry: number;
  /** walked out: first block of the day they miss from, or -1 */
  out: number;
  /** what is on their mind, newest first */
  mem: { d: number; k: FeedK; o: string }[];
  /** last day the manager did something for them */
  care: number;
  /** days in a row of being properly angry */
  hotd: number;
}
export interface Feed {
  d: number;
  /** block of the day, 3 is the night */
  b: number;
  k: FeedK;
  a: string;
  o?: string;
  x?: string;
  /** room it happened in */
  r?: RoomType | 'hall';
}
export interface LifeState {
  p: Record<string, Life>;
  /** "a|b" in order: what they think of each other, -100 to 100 */
  rel: Record<string, number>;
  /** dirt by room type, 0 to 100 */
  mess: Record<string, number>;
  feed: Feed[];
  rules: HouseRules;
  /** next block to run today */
  block: number;
  inc: Incident | null;
  /** last day each kind of incident happened */
  last: Record<string, number>;
  /** things that wear off: match penalties and the like */
  mods: Mod[];
  /** an incident was already looked for before this block */
  rolled: number;
}
export interface Incident {
  id: string;
  d: number;
  b: number;
  who?: string;
  oth?: string;
  title?: TitleId;
  room?: RoomType;
  done?: string;
}
export interface Mod {
  k: 'match' | 'train' | 'nobath' | 'nokitchen' | 'nosleep';
  v: number;
  until: number;
  why: string;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
export const newLife = (): LifeState => ({
  p: {},
  rel: {},
  mess: {},
  feed: [],
  rules: { meals: 0, rota: false, hygiene: false, quiet: false, curfew: false },
  block: 0,
  inc: null,
  last: {},
  mods: [],
  rolled: -1,
});
export const relKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
export const rel = (g: G, a: string, b: string) => g.life.rel[relKey(a, b)] ?? 0;
export const nameOf = (g: G, id: string) =>
  id === 'me' ? g.mgr.name : (g.players[id]?.nick ?? g.staff.find(s => s.id === id)?.name ?? '?');
export const people = (g: G): string[] => [...mine(g).map(p => p.id), ...g.staff.map(s => s.id)];
const hasQ = (l: Life, q: string) => l.q.includes(q);
function quirks(r: Rng, p: Player | Staff): string[] {
  const want = r.chance(0.25) ? 3 : r.chance(0.75) ? 2 : 1;
  const out: string[] = [];
  const tr = (p as Player).traits ?? [];
  if (tr.includes('hothead')) out.push('hot');
  if ((p as Staff).role === 'cleaner') out.push('neat');
  if ((p as Staff).role === 'chef') out.push('cook');
  for (let i = 0; i < 30 && out.length < want; i++) {
    const q = r.pick(QUIRK_IDS);
    if (out.includes(q) || CLASH.some(([a, b]) => (a === q && out.includes(b)) || (b === q && out.includes(a)))) continue;
    if ((p as Staff).role && (q === 'slob' || q === 'prank' || q === 'caff' || q === 'super')) continue;
    out.push(q);
  }
  return out;
}
/** everybody who lives or works here has a life, and nobody else */
export function settle(g: G) {
  const now = new Set(people(g));
  for (const id of [...now].sort())
    if (!g.life.p[id]) {
      const p = g.players[id] ?? g.staff.find(s => s.id === id)!;
      const r = Rng.of(g.seed + '|life|' + id);
      g.life.p[id] = {
        hun: r.int(70, 95),
        hyg: r.int(70, 98),
        fun: r.int(55, 80),
        soc: r.int(50, 80),
        anger: r.int(0, 12),
        mor: 62,
        q: quirks(r, p),
        dry: 0,
        out: -1,
        mem: [],
        care: -9,
        hotd: 0,
      };
    }
  for (const id of Object.keys(g.life.p)) if (!now.has(id)) delete g.life.p[id];
  for (const k of Object.keys(g.life.rel)) {
    const [a, b] = k.split('|');
    if (!now.has(a) || !now.has(b)) delete g.life.rel[k];
  }
  g.life.feed = g.life.feed.slice(0, 90);
}
const lvl = (g: G, t: RoomType) => g.rooms.reduce((m, x) => (x.type === t ? Math.max(m, x.lvl) : m), 0);
export const have = (g: G, f: string) => g.hq.items.filter(i => i.f === f).length;
const add = (l: Life, k: 'hun' | 'hyg' | 'fun' | 'soc' | 'anger' | 'mor', d: number) => {
  l[k] = r2(clamp(l[k] + d, 0, 100));
};
export function upset(g: G, id: string, d: number) {
  const l = g.life.p[id];
  if (!l) return;
  add(l, 'anger', d * (d > 0 ? (hasQ(l, 'hot') ? 1.5 : hasQ(l, 'sunny') || hasQ(l, 'peace') ? 0.65 : 1) : 1));
}
export function feel(g: G, id: string, d: number) {
  const p = g.players[id];
  if (p) p.morale = r2(clamp(p.morale + d, 0, 100));
  else if (g.life.p[id]) add(g.life.p[id], 'mor', d);
}
export function bond(g: G, a: string, b: string, d: number) {
  if (a === b || a === 'me' || b === 'me') return;
  const k = relKey(a, b);
  g.life.rel[k] = r2(clamp((g.life.rel[k] ?? 0) + d, -100, 100));
  if (g.life.rel[k] === 0) delete g.life.rel[k];
}
export function note(g: G, b: number, k: FeedK, a: string, o?: string, x?: string, r?: RoomType | 'hall') {
  g.life.feed.unshift({ d: g.day, b, k, a, ...(o ? { o } : {}), ...(x ? { x } : {}), ...(r ? { r } : {}) });
  if (g.life.feed.length > 90) g.life.feed.length = 90;
  for (const id of [a, o])
    if (id && g.life.p[id]) {
      const m = g.life.p[id].mem;
      m.unshift({ d: g.day, k, o: id === a ? (o ?? '') : a });
      if (m.length > 6) m.length = 6;
    }
}
export const moraleOf = (g: G, id: string) => g.players[id]?.morale ?? g.life.p[id]?.mor ?? 60;
export function emoOf(g: G, id: string): Emo {
  const l = g.life.p[id];
  if (!l) return 'calm';
  const p = g.players[id];
  if (l.anger >= 82) return 'furious';
  if (l.anger >= 58) return 'angry';
  if ((hasQ(l, 'neat') || hasQ(l, 'germ')) && dirt(g) > 55) return 'disgusted';
  if (l.hun < 24) return 'hungry';
  if (p && p.energy < 30) return 'tired';
  if (p && p.stress > 68) return 'anxious';
  const m = moraleOf(g, id);
  if (m < 34 || l.soc < 14) return 'sad';
  if (m > 80 && l.fun > 62) return 'excited';
  if (m > 64 && l.fun > 44) return 'happy';
  return 'calm';
}
/** how somebody's life shows in their work: around 1 */
export function lifeK(g: G, id: string): number {
  const l = g.life?.p[id];
  if (!l) return 1;
  let k = 1;
  if (l.hun < 30) k -= (30 - l.hun) * 0.0022;
  if (l.anger > 40) k -= (l.anger - 40) * 0.0013;
  if (l.hyg < 25) k -= (25 - l.hyg) * 0.0008;
  if (l.fun < 20) k -= (20 - l.fun) * 0.0012;
  if (l.fun > 60 && l.soc > 55 && l.anger < 25) k += 0.012;
  return k;
}
export const dirt = (g: G) => {
  const v = Object.values(g.life.mess);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
};
export function dirty(g: G, room: RoomType, d: number) {
  if (!lvl(g, room)) room = g.rooms.some(r => r.type === 'lounge') ? 'lounge' : 'practice';
  const bins = Math.min(4, have(g, 'bin'));
  g.life.mess[room] = r2(clamp((g.life.mess[room] ?? 0) + (d > 0 ? d * (1 - bins * 0.08) : d), 0, 100));
}
export const modK = (g: G, k: Mod['k']) => g.life.mods.filter(m => m.k === k && m.until >= g.day).reduce((s, m) => s * m.v, 1);
export const hasMod = (g: G, k: Mod['k']) => g.life.mods.some(m => m.k === k && m.until >= g.day);
const WHERE: Record<Block, RoomType> = {
  scrim: 'practice',
  aim: 'practice',
  tactics: 'strategy',
  vod: 'strategy',
  gym: 'gym',
  mind: 'wellness',
  bond: 'lounge',
  stream: 'stream',
  rest: 'lounge',
} as any;
export const roomFor = (g: G, b: Block | undefined): RoomType | 'hall' => {
  const t = b ? WHERE[b] : 'kitchen';
  return lvl(g, t) ? t : 'practice';
};
const STAFF_ROOM: Record<string, RoomType> = {
  coach: 'practice',
  analyst: 'strategy',
  psych: 'wellness',
  therapist: 'medical',
  trainer: 'gym',
  chef: 'kitchen',
  tech: 'workshop',
  scout: 'office',
  content: 'stream',
  partner: 'office',
  cleaner: 'bath',
};
export function away(g: G, id: string, block: number) {
  const l = g.life.p[id];
  return !!l && l.out >= 0 && block >= l.out;
}
/** one block of everybody's day */
export function lifeBlock(g: G, r: Rng, day: number, b: number, match: Set<TitleId>) {
  const L = g.life;
  const here = people(g).filter(id => !away(g, id, b));
  const at = new Map<string, { room: RoomType | 'hall'; bl?: Block }>();
  for (const id of here) {
    const p = g.players[id];
    if (p) {
      const sq = g.squads[p.title] as Squad;
      const bl = match.has(p.title) && b > 0 ? 'rest' : sq.week[day][b];
      at.set(id, { room: roomFor(g, bl), bl });
    } else {
      const s = g.staff.find(x => x.id === id)!;
      const t = STAFF_ROOM[s.role] ?? 'office';
      at.set(id, { room: lvl(g, t) ? t : 'hall' });
    }
  }
  // ---- mornings: who washes
  if (b === 0) {
    const bath = hasMod(g, 'nobath') ? 0 : lvl(g, 'bath');
    const heads = have(g, 'shower');
    const want: string[] = [];
    for (const id of here) {
      const l = L.p[id];
      const c =
        (hasQ(l, 'slob') ? 0.34 : hasQ(l, 'messy') ? 0.74 : hasQ(l, 'germ') || hasQ(l, 'neat') ? 1 : 0.9) +
        (L.rules.hygiene ? 0.25 : 0) +
        (bath >= 2 ? 0.06 : 0) -
        (g.players[id] && g.players[id].energy < 35 ? 0.2 : 0) -
        (l.anger > 60 ? 0.15 : 0);
      const home = g.players[id] ? (bath ? 1 : 0.62) : 0.96;
      if (r.chance(clamp(c * home, 0.03, bath >= 3 ? 1 : 0.98))) want.push(id);
      else if (g.players[id]) {
        l.dry++;
        if (l.dry >= 3 && r.chance(0.5)) note(g, b, 'noshower', id, undefined, String(l.dry), 'bath');
      }
      if (L.rules.hygiene && hasQ(l, 'proud')) upset(g, id, 1.5);
    }
    want.forEach((id, i) => {
      const l = L.p[id];
      add(l, 'hyg', 70);
      l.dry = 0;
      dirty(g, 'bath', hasQ(l, 'messy') ? 3 : 0.9);
      const room = Math.max(1, heads) * 5;
      if (bath && g.players[id] && i >= room && r.chance(0.25)) {
        const o = want[r.int(0, Math.min(room, want.length) - 1)];
        if (o !== id) {
          note(g, b, 'queue', id, o, undefined, 'bath');
          upset(g, id, 7);
          upset(g, o, 4);
          bond(g, id, o, -4);
        }
      }
    });
    if (have(g, 'hamper') + have(g, 'washer') === 0) for (const id of here) if (g.players[id]) add(L.p[id], 'hyg', -4);
  }
  // ---- needs
  for (const id of here) {
    const l = L.p[id];
    const w = at.get(id)!;
    const bl = w.bl;
    add(l, 'hun', -(bl === 'gym' ? 22 : 15) - (hasQ(l, 'caff') ? 3 : 0));
    add(l, 'hyg', -(bl === 'gym' ? 20 : 8) - (hasQ(l, 'slob') ? 3 : 0));
    add(l, 'fun', bl === 'bond' ? 20 : bl === 'rest' ? 10 + 2 * lvl(g, 'lounge') : bl === 'stream' ? 3 : -6.5);
    add(l, 'soc', hasQ(l, 'quiet') ? -1 : bl === 'bond' ? 16 : bl === 'scrim' || bl === 'tactics' ? 2 : -5);
    upset(g, id, bl === 'mind' ? -14 - staffSkill(g, 'psych') * 8 : bl === 'rest' || bl === 'bond' ? -6.5 : -2);
    if (hasQ(l, 'messy') || hasQ(l, 'slob')) dirty(g, w.room === 'hall' ? 'lounge' : w.room, hasQ(l, 'messy') ? 2.6 : 1.6);
    else if (g.players[id]) dirty(g, w.room === 'hall' ? 'lounge' : w.room, 0.5);
    // bad games stick
    if ((bl === 'scrim' || bl === 'aim') && r.chance(hasQ(l, 'hot') ? 0.34 : 0.17)) upset(g, id, 4 + r.f() * 9);
    if (l.hun < 20) {
      upset(g, id, 3);
      if (r.chance(0.2)) note(g, b, 'hangry', id, undefined, undefined, w.room);
    }
    if ((hasQ(l, 'neat') || hasQ(l, 'germ')) && dirt(g) > 40) upset(g, id, (dirt(g) - 40) * 0.08);
    if (g.players[id] && g.players[id].energy < 24 && r.chance(0.35)) note(g, b, 'crash', id, undefined, undefined, w.room);
  }
  // ---- words
  const groups = new Map<string, string[]>();
  for (const id of here) {
    const k = at.get(id)!.room;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(id);
  }
  const n = Math.max(1, Math.round(here.length * 0.42));
  for (let i = 0; i < n; i++) {
    const mixed = r.chance(0.22);
    const pool = mixed ? here : (groups.get(at.get(r.pick(here))!.room) ?? here);
    if (pool.length < 2) continue;
    const a = r.pick(pool);
    // at the desks, people mostly talk to whoever is an elbow away
    const near = !mixed && at.get(a)!.room === 'practice' ? neighbours(g, a).filter(x => pool.includes(x)) : [];
    const o = near.length && r.chance(0.6) ? r.pick(near) : r.pick(pool.filter(x => x !== a));
    talk(g, r, b, a, o, mixed ? 'hall' : at.get(a)!.room, at.get(a)!.bl);
  }
  meals(g, r, b, here);
  tidy(g, r, b, here);
  boil(g, r, b, here, at);
}
function talk(g: G, r: Rng, b: number, a: string, o: string, room: RoomType | 'hall', bl?: Block) {
  const A = g.life.p[a],
    O = g.life.p[o];
  // people who cannot stand each other keep out of each other's way
  if (rel(g, a, o) < -38 && r.chance(0.66)) return;
  const k = clamp(rel(g, a, o), -45, 60);
  const psych = staffSkill(g, 'psych');
  const pa = g.players[a],
    po = g.players[o];
  // something in the air first
  if (O.hyg < 28 && r.chance(0.3 + (hasQ(A, 'germ') || hasQ(A, 'neat') ? 0.4 : 0) + (28 - O.hyg) * 0.012)) {
    note(g, b, 'smell', a, o, undefined, room);
    bond(g, a, o, -3);
    upset(g, a, 5);
    const give = 0.5 + (hasQ(O, 'slob') ? -0.22 : 0.1) + (hasQ(O, 'proud') ? -0.25 : 0) + k * 0.003;
    if (r.chance(clamp(give, 0.08, 0.92)) && !hasMod(g, 'nobath')) {
      note(g, b, 'smellok', a, o, undefined, 'bath');
      add(O, 'hyg', 60);
      O.dry = 0;
      upset(g, o, 3);
    } else {
      note(g, b, 'smellno', a, o, undefined, room);
      upset(g, a, 9);
      upset(g, o, 8);
      bond(g, a, o, -6);
    }
    return;
  }
  if (hasQ(A, 'glutton') && O.hun > 0 && A.hun < 70 && r.chance(0.16)) {
    note(g, b, 'stole', o, a, undefined, 'kitchen');
    add(A, 'hun', 30);
    add(O, 'hun', -22);
    upset(g, o, 14);
    bond(g, a, o, -8);
    return;
  }
  if ((hasQ(A, 'neat') || hasQ(A, 'germ')) && (hasQ(O, 'messy') || hasQ(O, 'slob')) && dirt(g) > 34 && r.chance(0.4)) {
    note(g, b, 'dishes', a, o, r.pick(['Tuesday', 'last night', 'Sunday', 'yesterday']), 'kitchen');
    upset(g, a, 8);
    upset(g, o, 7);
    bond(g, a, o, -6);
    if (r.chance(0.5)) dirty(g, 'kitchen', -9);
    return;
  }
  if (hasQ(A, 'prank') && r.chance(0.16)) {
    const ok = r.chance(clamp(0.5 + k * 0.004 + (O.fun - 50) * 0.004 - O.anger * 0.006 - (hasQ(O, 'proud') ? 0.2 : 0), 0.08, 0.9));
    note(g, b, ok ? 'prankok' : 'prankno', a, o, undefined, room);
    if (ok) {
      add(A, 'fun', 12);
      add(O, 'fun', 9);
      bond(g, a, o, 4);
      feel(g, o, 1);
    } else {
      upset(g, o, 18);
      bond(g, a, o, -9);
      add(A, 'fun', 6);
    }
    return;
  }
  if (hasQ(O, 'loud') && (hasQ(A, 'quiet') || (pa && pa.energy < 40)) && r.chance(g.life.rules.quiet ? 0.12 : 0.32)) {
    note(g, b, 'noise', a, o, undefined, room);
    upset(g, a, 8);
    upset(g, o, 4);
    bond(g, a, o, -4);
    return;
  }
  if (hasQ(A, 'gossip') && r.chance(0.16)) {
    const third = people(g).filter(x => x !== a && x !== o);
    if (third.length) {
      const t = r.pick(third);
      note(g, b, 'gossip', a, o, nameOf(g, t), room);
      bond(g, o, t, -6);
      bond(g, a, o, 2);
      upset(g, o, 5);
      return;
    }
  }
  // how it goes: liking, mood, nerves
  const heat =
    A.anger * 0.006 +
    O.anger * 0.004 +
    (pa ? pa.stress * 0.0022 : 0) +
    (A.hun < 30 ? 0.12 : 0) -
    k * 0.0035 -
    (hasQ(A, 'sunny') ? 0.16 : 0) -
    (hasQ(O, 'sunny') ? 0.08 : 0) +
    (hasQ(A, 'hot') ? 0.12 : 0) +
    (hasQ(A, 'proud') ? 0.06 : 0) -
    psych * 0.08 +
    (bl === 'scrim' ? 0.05 : 0);
  const roll = r.f() + heat * 0.75;
  const fought = g.life.feed.some(f => f.k === 'fight' && f.d === g.day && (f.b === b || f.a === a || f.o === a));
  if (roll > 1.13 && !fought) {
    note(g, b, 'fight', a, o, r.pick(GRIPES), room);
    upset(g, a, 16);
    upset(g, o, 18);
    bond(g, a, o, -14);
    feel(g, a, -3);
    feel(g, o, -3);
    for (const p of [pa, po]) if (p) p.stress = r2(clamp(p.stress + 5, 0, 100));
    if (pa && po && pa.title === po.title) {
      const s = g.squads[pa.title];
      if (s) s.syn = clamp(Math.round((s.syn - 0.008) * 10000) / 10000, 0.1, 1);
    }
    const med = people(g).find(
      x => x !== a && x !== o && (hasQ(g.life.p[x], 'peace') || g.staff.some(s => s.id === x && s.role === 'psych')),
    );
    if (med && r.chance(0.55 + psych * 0.3)) {
      note(g, b, 'peace', med, a, nameOf(g, o), room);
      upset(g, a, -12);
      upset(g, o, -12);
      bond(g, a, o, 8);
    }
  } else if (roll > 0.93) {
    note(g, b, 'snap', a, o, r.pick(GRIPES), room);
    upset(g, a, 4);
    upset(g, o, 9);
    bond(g, a, o, -5);
  } else if (po && (po.stress > 62 || po.morale < 38) && (k > 5 || hasQ(A, 'sunny') || hasQ(A, 'peace')) && r.chance(0.6)) {
    note(g, b, 'comfort', a, o, undefined, room);
    po.stress = r2(clamp(po.stress - 3.5, 0, 100));
    feel(g, o, 1.6);
    upset(g, o, -8);
    bond(g, a, o, 6);
    add(O, 'soc', 10);
  } else if (k > 42 && r.chance(0.14)) {
    note(g, b, 'deep', a, o, undefined, room);
    bond(g, a, o, 5);
    add(A, 'soc', 14);
    add(O, 'soc', 14);
    feel(g, a, 0.8);
  } else if (r.chance(0.2)) {
    note(g, b, 'laugh', a, o, undefined, room);
    add(A, 'fun', 7);
    add(O, 'fun', 9);
    bond(g, a, o, 4);
    upset(g, o, -5);
  } else if (pa && po && pa.title === po.title && r.chance(0.22)) {
    note(g, b, r.chance(0.5) ? 'praise' : 'help', a, o, r.pick(TRICKS), room);
    feel(g, o, 0.7);
    bond(g, a, o, 3);
  } else {
    // most talk is small and nobody writes it down, but some of it is worth a line
    if (r.chance(0.34)) note(g, b, 'chat', a, o, r.pick(TOPICS), room);
    bond(g, a, o, 1.6);
    add(A, 'soc', 7);
    add(O, 'soc', 7);
  }
}
function meals(g: G, r: Rng, b: number, here: string[]) {
  if (b === 1) {
    // breakfast happened; lunch before the afternoon is already counted with it
  }
  const L = g.life;
  const kit = hasMod(g, 'nokitchen') ? 0 : lvl(g, 'kitchen');
  const chef = staffSkill(g, 'chef');
  const cook = here.find(id => hasQ(L.p[id], 'cook') && L.p[id].anger < 60);
  const base =
    L.rules.meals === 2 ? 46 : kit ? (chef > 0 ? 30 + chef * 18 : L.rules.meals === 1 ? 25 : 19) : L.rules.meals === 1 ? 21 : 16.5;
  const treat = kit > 0 && !chef && L.rules.meals < 2 && !!cook && r.chance(0.3);
  if (treat) {
    note(g, b, 'cooked', cook!, undefined, undefined, 'kitchen');
    for (const id of here) if (id !== cook) bond(g, cook!, id, 1);
  }
  for (const id of here) {
    const l = L.p[id];
    let f = base + (treat ? 20 : 0);
    if (hasQ(l, 'skip') && L.rules.meals < 2 && r.chance(0.42)) f *= 0.2;
    if (hasQ(l, 'glutton')) f *= 1.2;
    // the emptier the stomach, the bigger the plate
    f *= 1 + clamp((52 - l.hun) / 70, -0.35, 0.6);
    add(l, 'hun', f);
    if (treat) feel(g, id, 0.6);
    if (kit && L.rules.meals < 2 && chef < 0.01) dirty(g, 'kitchen', hasQ(l, 'messy') ? 2 : hasQ(l, 'neat') ? 0 : 0.7);
    else if (!kit) dirty(g, 'lounge', 0.8);
  }
}
function tidy(g: G, r: Rng, b: number, here: string[]) {
  const L = g.life;
  const cl = staffSkill(g, 'cleaner');
  // even the worst of them takes the bin out now and then
  for (const k of Object.keys(L.mess)) L.mess[k] = r2(Math.max(0, L.mess[k] - 0.4 - L.mess[k] * 0.022));
  if (cl > 0) for (const k of Object.keys(L.mess)) L.mess[k] = r2(Math.max(0, L.mess[k] - 5 - cl * 9 - (have(g, 'cart') ? 2 : 0)));
  if (L.rules.rota && b === 2) {
    for (const k of Object.keys(L.mess)) L.mess[k] = r2(Math.max(0, L.mess[k] - 6.5));
    for (const id of here) if (g.players[id] && (hasQ(L.p[id], 'messy') || hasQ(L.p[id], 'slob'))) upset(g, id, 2.2);
  }
  for (const id of here) {
    const l = L.p[id];
    if (!hasQ(l, 'neat')) continue;
    const worst = Object.keys(L.mess).sort((x, y) => L.mess[y] - L.mess[x] || (x < y ? -1 : 1))[0];
    if (worst && L.mess[worst] > 30 && r.chance(0.35)) {
      L.mess[worst] = r2(Math.max(0, L.mess[worst] - 16));
      if (cl <= 0 && g.staff.every(s => s.id !== id || s.role !== 'cleaner')) {
        note(g, b, 'cleaned', id, undefined, ROOMNAME[worst] ?? worst, worst as RoomType);
        upset(g, id, 4);
      }
    }
  }
}
const ROOMNAME: Record<string, string> = {
  practice: 'practice room',
  bath: 'bathroom',
  wellness: 'quiet room',
  stream: 'studio',
  strategy: 'strategy room',
  trophy: 'trophy room',
};
/** when it is too much */
function boil(g: G, r: Rng, b: number, here: string[], at: Map<string, { room: RoomType | 'hall'; bl?: Block }>) {
  const L = g.life;
  for (const id of here) {
    const l = L.p[id];
    const p = g.players[id];
    if (!p || l.anger < 66) continue;
    const bl = at.get(id)!.bl;
    const sq = g.squads[p.title] as Squad;
    if (bl && (bl === 'scrim' || bl === 'aim' || bl === 'stream') && r.chance((l.anger - 62) * 0.012)) {
      const i = Math.max(0, sq.lineup.indexOf(id));
      const slot = r.pick(['keyboard', 'mouse', 'headset', 'monitor'] as const);
      sq.stations[i].c[slot] = 8;
      note(g, b, 'rage', id, undefined, slot, 'practice');
      upset(g, id, -16);
      for (const o of here)
        if (o !== id && g.players[o]?.title === p.title) {
          g.players[o].stress = r2(clamp(g.players[o].stress + 3, 0, 100));
          bond(g, id, o, -3);
        }
      msg(g, {
        kind: 'info',
        from: 'House',
        title: `${p.nick} broke a ${slot}`,
        body: `${GEAR[slot][sq.stations[i].m[slot]].name}, seat ${i + 1}. It still works, in a way. Equipment, Service repairs it.`,
        data: { p: id },
      });
    } else if (l.anger > 78 && r.chance((l.anger - 74) * 0.016)) {
      l.out = b + 1;
      note(g, b, 'storm', id, undefined, undefined, at.get(id)!.room);
      upset(g, id, -12);
      feel(g, id, -3);
    }
  }
  void GEAR_SLOTS;
}
/** the night: people cool down, sleep badly or well, and some decide they have had enough */
export function lifeNight(g: G, r: Rng) {
  const L = g.life;
  for (const id of people(g)) {
    const l = L.p[id];
    const p = g.players[id];
    if (l.out >= 0 && L.block >= 0) {
      l.out = -1;
      if (p && r.chance(0.7)) note(g, 3, 'back', id, undefined, undefined, 'hall');
    }
    upset(g, id, -4.5);
    add(l, 'hun', -12);
    add(l, 'soc', -2);
    // staff go home, to dinner and to somebody who is not a gamer
    if (!p) {
      add(l, 'fun', Math.max(0, 66 - l.fun) * 0.6);
      add(l, 'soc', Math.max(0, 68 - l.soc) * 0.6);
      add(l, 'hun', Math.max(0, 70 - l.hun) * 0.7);
    }
    if (hasQ(l, 'home') && r.chance(0.2)) {
      note(g, 3, 'call', id);
      feel(g, id, r.chance(0.6) ? 1 : -2);
      add(l, 'soc', 8);
    }
    if (p) {
      let e = 0;
      if (L.rules.quiet) e += 1.2;
      if (L.rules.curfew) e += hasQ(l, 'owl') ? 0.4 : 1.6;
      if (hasMod(g, 'nosleep')) e -= 7;
      if (hasQ(l, 'owl') && !L.rules.curfew) e -= 1;
      if (hasQ(l, 'caff')) e -= 0.8;
      p.energy = r2(clamp(p.energy + e, 0, 100));
      if (L.rules.curfew && hasQ(l, 'owl')) upset(g, id, 3);
      if (L.rules.quiet) add(l, 'fun', -1.5);
      // contentment leaks into the rest of life, slowly
      const c =
        (l.fun - 45) * 0.01 +
        (l.soc - 45) * 0.007 +
        (l.hun - 38) * 0.007 -
        Math.max(0, l.anger - 34) * 0.015 -
        Math.max(0, 25 - l.hyg) * 0.01 -
        Math.max(0, dirt(g) - 45) * 0.008;
      p.morale = r2(clamp(p.morale + clamp(c - Math.max(0, p.morale - 72) * 0.03, -1.6, p.morale < 60 ? 0.4 : 0), 0, 100));
      l.hotd = l.anger > 62 ? l.hotd + 1 : Math.max(0, l.hotd - 1);
      if (
        l.hotd >= 6 &&
        p.morale < 40 &&
        !g.inbox.some(m => m.kind === 'event' && !m.done && m.data?.quit === id) &&
        (L.last['quit' + id] ?? -99) < g.day - 20 &&
        (L.last['quit'] ?? -99) < g.day - 18 &&
        r.chance(0.4)
      ) {
        L.last['quit'] = g.day;
        L.last['quit' + id] = g.day;
        note(g, 3, 'quit', id, undefined, undefined, 'hall');
        msg(g, {
          kind: 'event',
          from: p.nick,
          title: `${p.nick} has walked out`,
          body: `Bags in the hall, taxi outside. “I am not doing another week of this.” The others are watching from the stairs.`,
          data: { e: 'ragequit', p: id, quit: id },
          choices: [
            { id: 'talk', label: 'Run after the taxi', hint: 'You, the rain, and honest words' },
            { id: 'raise', label: 'Offer a bonus and a clean house', hint: 'Four weeks of wages, and a cleaning firm' },
            { id: 'week', label: 'Give a week at home', hint: 'No training for seven days' },
            { id: 'go', label: 'Let them go', hint: 'The contract ends today' },
          ],
        });
      }
    }
  }
  // a few bonds fade
  for (const k of Object.keys(L.rel)) {
    // grudges fade a little faster than friendships
    L.rel[k] = r2(L.rel[k] * (L.rel[k] < 0 ? 0.975 : 0.992));
    if (Math.abs(L.rel[k]) < 0.2) delete L.rel[k];
  }
  L.mods = L.mods.filter(m => m.until >= g.day);
  L.block = 0;
  L.rolled = -1;
  settle(g);
}
export const houseCost = (g: G) => [0, 28, 74][g.life.rules.meals] * people(g).length;
