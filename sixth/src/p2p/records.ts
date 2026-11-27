/** The world ladder: a grow-only set of doubly signed match records that every client folds into the same table. */
import { canon, sha256 } from '../core/hash.ts';
import { logistic } from '../core/dmath.ts';
import { sall, sput } from '../save/sealed.ts';
import { verify } from '../save/crypto.ts';
import { TITLES, type TitleId } from '../data/titles.ts';
import type { Crest } from '../game/types.ts';
import type { MatchCfg, Order } from '../sim/types.ts';
import { simJob } from './jobs.ts';
import { runSim } from '../sim/index.ts';
export interface Card {
  pub: string;
  name: string;
  tag: string;
  mgr: string;
  c1: string;
  c2: string;
  crest: Crest;
  region: string;
  titles: TitleId[];
}
export interface Rec {
  v: 1;
  id: string;
  title: TitleId;
  t: number;
  mode: 'open' | 'level';
  a: Card;
  b: Card;
  cfg: MatchCfg;
  orders: Order[];
  score: [number, number];
  winner: 0 | 1;
  hash: string;
  sa: string;
  sb: string;
}
export interface FraudNote {
  pub: string;
  reason: string;
  at: string;
  by: string;
  sig: string;
}
export const recCore = (r: Omit<Rec, 'sa' | 'sb'>) =>
  canon({
    v: r.v,
    id: r.id,
    title: r.title,
    t: r.t,
    mode: r.mode,
    a: r.a.pub,
    b: r.b.pub,
    cfg: sha256(canon(r.cfg)),
    ord: sha256(canon(r.orders)),
    score: r.score,
    winner: r.winner,
    hash: r.hash,
  });
export const seasonOf = (t: number) => new Date(t).toISOString().slice(0, 7);
const store = new Map<string, Rec>();
let loaded = false;
const bad = new Set<string>();
export const subs = new Set<() => void>();
export async function loadRecs() {
  if (loaded) return;
  loaded = true;
  const loose: any[] = [];
  for (const { v } of await sall<Rec>('ladder', undefined, (_k, v) => loose.push(v))) store.set(v.id, v);
  // records written before encryption are checked again from scratch
  for (const v of loose) void addRec(v);
}
export const allRecs = () => [...store.values()];
export const recIds = () => [...store.keys()];
const shape = (r: any): r is Rec =>
  r &&
  r.v === 1 &&
  typeof r.id === 'string' &&
  r.id.length < 80 &&
  TITLES.includes(r.title) &&
  typeof r.t === 'number' &&
  r.t < Date.now() + 6e5 &&
  r.a?.pub &&
  r.b?.pub &&
  r.a.pub !== r.b.pub &&
  r.cfg?.teams?.length === 2 &&
  Array.isArray(r.orders) &&
  r.orders.length < 500 &&
  r.cfg.title === r.title;
/** Accepts a record only if both signatures hold and re-simulating the match reproduces it. */
export async function addRec(r: any, trusted = false): Promise<boolean> {
  if (!shape(r) || store.has(r.id) || bad.has(r.id)) return false;
  const core = recCore(r);
  if (!(await verify(r.a.pub, core, r.sa)) || !(await verify(r.b.pub, core, r.sb))) {
    bad.add(r.id);
    return false;
  }
  if (!trusted) {
    try {
      const x = await simJob(r.cfg, r.orders);
      if (x.hash !== r.hash || x.winner !== r.winner) {
        bad.add(r.id);
        return false;
      }
    } catch {
      bad.add(r.id);
      return false;
    }
  }
  store.set(r.id, r);
  await sput('ladder', r.id, r);
  if (store.size > 1200) {
    const old = allRecs().sort((a, b) => a.t - b.t)[0];
    store.delete(old.id);
  }
  subs.forEach(f => f());
  return true;
}
export interface Line {
  pub: string;
  card: Card;
  elo: number;
  w: number;
  l: number;
  last: number;
}
export function ladder(title: TitleId, season: string, banned: Set<string>, mode: 'open' | 'level' = 'open'): Line[] {
  const T = new Map<string, Line>();
  const pair = new Map<string, number>();
  const L = allRecs()
    .filter(r => r.title === title && r.mode === mode && seasonOf(r.t) === season)
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  const get = (c: Card, t: number) => {
    let x = T.get(c.pub);
    if (!x) T.set(c.pub, (x = { pub: c.pub, card: c, elo: 1200, w: 0, l: 0, last: 0 }));
    x.card = c;
    x.last = t;
    return x;
  };
  for (const r of L) {
    if (banned.has(r.a.pub) || banned.has(r.b.pub)) continue;
    const k = [r.a.pub, r.b.pub].sort().join() + Math.floor(r.t / 864e5);
    const n = (pair.get(k) ?? 0) + 1;
    pair.set(k, n);
    if (n > 3) continue;
    const a = get(r.a, r.t),
      b = get(r.b, r.t);
    const e = logistic((a.elo - b.elo) / 174);
    const d = 28 * ((r.winner === 0 ? 1 : 0) - e);
    a.elo += d;
    b.elo -= d;
    if (r.winner === 0) {
      a.w++;
      b.l++;
    } else {
      b.w++;
      a.l++;
    }
  }
  return [...T.values()].sort((a, b) => b.elo - a.elo || (a.pub < b.pub ? -1 : 1));
}
export { runSim };
