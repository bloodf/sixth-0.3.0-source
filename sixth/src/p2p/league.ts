/**
 * Private leagues without a server or a host that must stay online.
 * A league is a set of signed entries that any two members merge when they meet. Rounds use commit-reveal:
 * everyone commits a hash of (squad, nonce), then reveals. The round seed is the hash of all nonces, so nobody can
 * choose it, and every member computes the same results locally.
 */
import { canon, sha256 } from '../core/hash.ts';
import { Rng } from '../core/rng.ts';
import type { TitleId } from '../data/titles.ts';
import { mapsFor } from '../sim/maps.ts';
import type { GameResult, MatchCfg, SimTeam } from '../sim/types.ts';
import { del } from '../save/db.ts';
import { sall, sget, sput } from '../save/sealed.ts';
import { myId, randHex, sign, verify } from '../save/crypto.ts';
import type { Card } from './records.ts';
import { cleanTeam, dedupe, levelTeam, type Session } from './session.ts';
import { simJob } from './jobs.ts';
export type EntryKind = 'create' | 'join' | 'start' | 'commit' | 'reveal' | 'skip';
export interface Entry {
  id: string;
  league: string;
  k: EntryKind;
  pub: string;
  t: number;
  d: any;
  sig: string;
}
export interface PLeague {
  code: string;
  entries: Record<string, Entry>;
  results: Record<string, { hash: string; score: [number, number]; winner: 0 | 1; map: string; mvp: string }>;
}
export interface LMatch {
  id: string;
  round: number;
  a: string;
  b: string;
  cfg?: MatchCfg;
  res?: PLeague['results'][string];
}
export interface LView {
  code: string;
  name: string;
  title: TitleId;
  mode: 'open' | 'level';
  owner: string;
  members: Card[];
  started: boolean;
  rounds: number;
  round: number;
  stage: 'lobby' | 'commit' | 'reveal' | 'done';
  committed: Set<string>;
  revealed: Set<string>;
  matches: LMatch[];
  table: { pub: string; w: number; l: number; f: number; a: number }[];
  champ: string | null;
}
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => {
  const h = randHex(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += B32[parseInt(h.slice(i * 2, i * 2 + 2), 16) % 32];
  return s.slice(0, 4) + '-' + s.slice(4);
};
const core = (e: Omit<Entry, 'id' | 'sig'>) => canon({ l: e.league, k: e.k, p: e.pub, t: e.t, d: e.d });
async function mk(league: string, k: EntryKind, d: any): Promise<Entry> {
  const e = { league, k, pub: await myId(), t: Date.now(), d };
  const c = core(e);
  return { ...e, id: sha256(c).slice(0, 24), sig: await sign(c) };
}
const cache = new Map<string, PLeague>();
export async function listLeagues(): Promise<PLeague[]> {
  const loose: any[] = [];
  for (const { v } of await sall<PLeague>('peers', IDBKeyRange.bound('league:', 'league:~'), (_k, v) => loose.push(v)))
    if (!cache.has(v.code)) cache.set(v.code, v);
  for (const v of loose)
    if (v?.code && !cache.has(v.code)) {
      const l: PLeague = { code: String(v.code), entries: {}, results: {} };
      cache.set(l.code, l);
      await merge(l, Object.values(v.entries ?? {}));
    }
  return [...cache.values()];
}
const save = (l: PLeague) => sput('peers', 'league:' + l.code, l);
export const leaveLeague = async (c: string) => {
  cache.delete(c);
  await del('peers', 'league:' + c);
};
export async function createLeague(name: string, title: TitleId, mode: 'open' | 'level', card: Card): Promise<PLeague> {
  const c = code();
  const l: PLeague = { code: c, entries: {}, results: {} };
  const e = await mk(c, 'create', { name: name.slice(0, 28), title, mode });
  l.entries[e.id] = e;
  const j = await mk(c, 'join', { card });
  l.entries[j.id] = j;
  cache.set(c, l);
  await save(l);
  return l;
}
export async function joinLeague(c: string, card: Card): Promise<PLeague> {
  c = c.trim().toUpperCase();
  let l = cache.get(c) ?? (await sget<PLeague>('peers', 'league:' + c));
  if (!l) l = { code: c, entries: {}, results: {} };
  if (!Object.values(l.entries).some(e => e.k === 'join' && e.pub === card.pub)) {
    const j = await mk(c, 'join', { card });
    l.entries[j.id] = j;
  }
  cache.set(c, l);
  await save(l);
  return l;
}
export async function post(l: PLeague, k: EntryKind, d: any): Promise<Entry> {
  const e = await mk(l.code, k, d);
  l.entries[e.id] = e;
  await save(l);
  return e;
}
export async function merge(l: PLeague, es: any[]): Promise<number> {
  let n = 0;
  for (const e of es.slice(0, 400)) {
    if (!e?.id || l.entries[e.id] || e.league !== l.code) continue;
    const c = core(e);
    if (sha256(c).slice(0, 24) !== e.id || !(await verify(e.pub, c, e.sig))) continue;
    l.entries[e.id] = e;
    n++;
  }
  if (n) await save(l);
  return n;
}
function schedule(m: string[]): [string, string][][] {
  const L = [...m];
  if (L.length % 2) L.push('');
  const out: [string, string][][] = [];
  const N = L.length;
  for (let r = 0; r < N - 1; r++) {
    const g: [string, string][] = [];
    for (let i = 0; i < N / 2; i++) if (L[i] && L[N - 1 - i]) g.push(r % 2 ? [L[N - 1 - i], L[i]] : [L[i], L[N - 1 - i]]);
    out.push(g);
    L.splice(1, 0, L.pop()!);
  }
  return out;
}
export function view(l: PLeague): LView | null {
  const es = Object.values(l.entries).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  const cr = es.find(e => e.k === 'create');
  if (!cr) return null;
  const owner = cr.pub;
  const st = es.find(e => e.k === 'start' && e.pub === owner);
  const joins = new Map<string, Card>();
  for (const e of es)
    if (e.k === 'join' && (!st || e.t <= st.t || (st.d.members as string[]).includes(e.pub))) {
      if (!joins.has(e.pub) && e.d?.card) joins.set(e.pub, { ...e.d.card, pub: e.pub });
    }
  const members = st ? (st.d.members as string[]).filter(p => joins.has(p)).map(p => joins.get(p)!) : [...joins.values()].slice(0, 10);
  const pubs = members.map(m => m.pub).sort();
  const sch = st ? schedule(pubs) : [];
  const first = (k: EntryKind, r: number) => {
    const m = new Map<string, Entry>();
    for (const e of es) if (e.k === k && e.d?.r === r && pubs.includes(e.pub) && !m.has(e.pub)) m.set(e.pub, e);
    return m;
  };
  const v: LView = {
    code: l.code,
    name: String(cr.d.name).slice(0, 28),
    title: cr.d.title,
    mode: cr.d.mode === 'open' ? 'open' : 'level',
    owner,
    members,
    started: !!st,
    rounds: sch.length,
    round: 0,
    stage: st ? 'commit' : 'lobby',
    committed: new Set(),
    revealed: new Set(),
    matches: [],
    table: pubs.map(pub => ({ pub, w: 0, l: 0, f: 0, a: 0 })),
    champ: null,
  };
  if (!st) return v;
  const last = new Map<string, SimTeam>();
  for (let r = 0; r < sch.length; r++) {
    const c = first('commit', r),
      rv = first('reveal', r);
    const skip = es.find(e => e.k === 'skip' && e.pub === owner && e.d?.r === r);
    const okR = new Map<string, { team: SimTeam; n: string }>();
    for (const [p, e] of rv) {
      const ce = c.get(p);
      if (!ce || sha256(String(e.d.n) + canon(e.d.team)) !== ce.d.h) continue;
      const t = cleanTeam(e.d.team, v.title);
      if (t) okR.set(p, { team: t, n: String(e.d.n) });
    }
    const need = pubs.length;
    v.round = r;
    v.committed = new Set(c.keys());
    v.revealed = new Set(okR.keys());
    const closed = okR.size === need || (!!skip && okR.size >= 1 && [...c.keys()].every(p => okR.has(p) || skip.t < Date.now()));
    for (const [i, [a, b]] of sch[r].entries()) v.matches.push({ id: `${r}.${i}`, round: r, a, b });
    if (!closed) {
      v.stage = c.size === need || skip ? 'reveal' : 'commit';
      break;
    }
    for (const [p, x] of okR) last.set(p, x.team);
    const seed = sha256([l.code, r, ...[...okR].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(x => x[1].n)].join('|'));
    for (const m of v.matches.filter(m => m.round === r)) {
      const A = last.get(m.a),
        B = last.get(m.b);
      if (!A || !B) {
        const w = A ? 0 : 1;
        m.res = { hash: 'wo', score: w === 0 ? [1, 0] : [0, 1], winner: w as 0 | 1, map: '', mvp: '' };
      } else {
        const rr = Rng.of(seed + m.id);
        const maps = mapsFor(v.title);
        let teams: [SimTeam, SimTeam] = [
          { ...A, id: 'A' + m.a.slice(0, 12) },
          { ...B, id: 'B' + m.b.slice(0, 12) },
        ];
        if (v.mode === 'level') teams = [levelTeam(teams[0]), levelTeam(teams[1])];
        teams = JSON.parse(canon(teams));
        if (v.title === 'dota') dedupe(teams, rr);
        if (teams[0].c1.toLowerCase() === teams[1].c1.toLowerCase()) teams[1].c1 = teams[1].c2;
        m.cfg = { title: v.title, map: maps[rr.int(0, maps.length - 1)].id, seed: seed + '.' + m.id, teams };
        m.res = l.results[seed.slice(0, 16) + m.id];
      }
      const ra = v.table.find(t => t.pub === m.a)!,
        rb = v.table.find(t => t.pub === m.b)!;
      if (m.res) {
        ra.f += m.res.score[0];
        ra.a += m.res.score[1];
        rb.f += m.res.score[1];
        rb.a += m.res.score[0];
        if (m.res.winner === 0) {
          ra.w++;
          rb.l++;
        } else {
          rb.w++;
          ra.l++;
        }
      }
      (m as any).key = seed.slice(0, 16) + m.id;
    }
    if (r === sch.length - 1) {
      v.stage = 'done';
    }
  }
  v.table.sort((a, b) => b.w - a.w || b.f - b.a - (a.f - a.a) || (a.pub < b.pub ? -1 : 1));
  if (v.stage === 'done' && v.matches.every(m => m.res)) v.champ = v.table[0].pub;
  return v;
}
/** compute any missing results off-thread */
export async function crunch(l: PLeague): Promise<boolean> {
  const v = view(l);
  let any = false;
  for (const m of v?.matches ?? [])
    if (m.cfg && !m.res) {
      const r: GameResult = await simJob(m.cfg, []);
      const best = [...r.stats[0], ...r.stats[1]].sort((a, b) => b.rating - a.rating)[0];
      const nick = m.cfg.teams.flatMap(t => t.players).find(p => p.id === best.id)?.nick ?? '';
      l.results[(m as any).key] = { hash: r.hash, score: r.score, winner: r.winner, map: m.cfg.map, mvp: nick };
      any = true;
    }
  if (any) await save(l);
  return any;
}
const secrets = new Map<string, { n: string; team: SimTeam }>();
export async function commit(l: PLeague, team: SimTeam, round: number): Promise<Entry> {
  const n = randHex(16);
  await sput('peers', `sec:${l.code}:${round}`, { n, team });
  secrets.set(l.code + round, { n, team });
  return post(l, 'commit', { r: round, h: sha256(n + canon(team)) });
}
export async function reveal(l: PLeague, round: number): Promise<Entry | null> {
  const s = secrets.get(l.code + round) ?? (await sget<{ n: string; team: SimTeam }>('peers', `sec:${l.code}:${round}`));
  if (!s) return null;
  return post(l, 'reveal', { r: round, n: s.n, team: s.team });
}
/** wire a league to a live room: swap ids, send what the other side is missing */
export function sync(l: PLeague, s: Session, changed: () => void) {
  const ids = () => Object.keys(l.entries);
  const off1 = s.ch.on('lg:have', (d, from) => {
    if (d?.code !== l.code) return;
    const h = new Set<string>(d.ids ?? []);
    const miss = Object.values(l.entries).filter(e => !h.has(e.id));
    if (miss.length) s.ch.send('lg:put', { code: l.code, es: miss }, from);
    if ((d.ids ?? []).some((x: string) => !l.entries[x]) && !d.re) s.ch.send('lg:have', { code: l.code, ids: ids(), re: 1 }, from);
  });
  const off2 = s.ch.on('lg:put', async (d, from) => {
    if (d?.code !== l.code || !Array.isArray(d.es)) return;
    const n = await merge(l, d.es);
    if (n) {
      for (const p of s.ch.peers()) if (p !== from) s.ch.send('lg:have', { code: l.code, ids: ids() }, p);
      changed();
    }
  });
  s.ch.onJoin(id => setTimeout(() => s.ch.send('lg:have', { code: l.code, ids: ids() }, id), 300));
  const push = () => s.ch.send('lg:have', { code: l.code, ids: ids() });
  push();
  return {
    push,
    stop() {
      off1();
      off2();
    },
  };
}
