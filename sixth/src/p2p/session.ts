/** Online session: presence, flag gossip, ladder gossip, challenges and lockstep matches. UI-agnostic. */
import { canon, sha256 } from '../core/hash.ts';
import { Rng } from '../core/rng.ts';
import { TITLES, type TitleId } from '../data/titles.ts';
import { ATTRS } from '../data/titles.ts';
import { mapsFor } from '../sim/maps.ts';
import { heroPool } from '../data/heroes.ts';
import { RULES, type G, type MatchCfg, type Order } from '../game/types.ts';
import type { Sim, SimTeam } from '../sim/types.ts';
import { simTeam } from '../game/match.ts';
import { meId } from '../game/league.ts';
import { flags, proof, type Career, type Flag } from '../save/vault.ts';
import { fingerprint, gunzip, myId, randHex, sign, ub64, verify } from '../save/crypto.ts';
import { sall, sget, sput } from '../save/sealed.ts';
import { addRec, allRecs, loadRecs, recCore, recIds, type Card, type FraudNote, type Rec } from './records.ts';
import { replayJob } from './jobs.ts';
import type { Channel } from './net.ts';
export interface PeerInfo {
  id: string;
  card: Card | null;
  ok: boolean;
  clean: boolean;
  ranked?: boolean;
  why: string;
  ladder?: number;
  seen: number;
}
export type Mode = 'open' | 'level';
export interface Challenge {
  id: string;
  from: string;
  title: TitleId;
  mode: Mode;
  mine: boolean;
}
export interface Duel {
  id: string;
  peer: string;
  title: TitleId;
  mode: Mode;
  us: 0 | 1;
  stage: 'squads' | 'verify' | 'ready' | 'live' | 'done' | 'failed';
  msg: string;
  progress: number;
  cfg: MatchCfg | null;
  orders: Order[];
  turns: Map<number, string[]>[];
  sent: number;
  queue: string[];
  myNonce: string;
  commit: [string, string];
  nonce: [string, string];
  team: [SimTeam | null, SimTeam | null];
  sim: Sim | null;
  theirCard: Card;
  rec: Rec | null;
  lastMsg: number;
  dropped: boolean;
  sig: [string, string];
  core: string;
  proofOk: boolean;
  hashes: Map<number, string>;
}
export const TURN = 10;
const DELAY = 2;
export function levelTeam(t: SimTeam): SimTeam {
  const L = t.players.flatMap(p => ATTRS.map(a => p.st[a]));
  const avg = L.reduce((a, b) => a + b, 0) / L.length;
  return {
    ...t,
    syn: 0.65,
    fam: 0.65,
    prep: 0.3,
    coach: 0.5,
    players: t.players.map(p => ({
      ...p,
      st: Object.fromEntries(ATTRS.map(a => [a, Math.max(0.2, Math.min(0.95, Math.round((p.st[a] / avg) * 0.66 * 1000) / 1000))])) as any,
    })),
  };
}
/** strict validation: a peer's team is data, never trusted */
export function cleanTeam(t: any, title: TitleId): SimTeam | null {
  try {
    if (!t || !Array.isArray(t.players) || t.players.length !== 5) return null;
    const s = (v: any, n: number) => String(v ?? '').slice(0, n);
    const f = (v: any) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5);
    const hx = (v: any, d: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
    return {
      id: s(t.id, 40),
      name: s(t.name, 24),
      tag: s(t.tag, 4),
      c1: hx(t.c1, '#3366aa'),
      c2: hx(t.c2, '#ffffff'),
      icon: s(t.icon, 40),
      plan: { style: f(t.plan?.style), tempo: f(t.plan?.tempo), risk: f(t.plan?.risk), focus: s(t.plan?.focus, 8) },
      syn: f(t.syn),
      fam: f(t.fam),
      coach: f(t.coach),
      prep: f(t.prep),
      players: t.players.map((p: any, i: number) => ({
        id: s(p.id, 24),
        nick: s(p.nick, 16),
        role: s(p.role, 8),
        hero:
          p.hero && heroPool(title, s(p.role, 8)).some(h => h.id === p.hero)
            ? p.hero
            : title === 'cs2'
              ? undefined
              : heroPool(title, s(p.role, 8))[i % 2]?.id,
        num: Number.isInteger(p.num) ? p.num : i,
        traits: Array.isArray(p.traits) ? p.traits.slice(0, 3).map((x: any) => s(x, 12)) : [],
        st: Object.fromEntries(ATTRS.map(a => [a, f(p.st?.[a])])),
      })) as any,
    };
  } catch {
    return null;
  }
}
export class Session {
  peers = new Map<string, PeerInfo>();
  challenges: Challenge[] = [];
  duel: Duel | null = null;
  chat: { who: string; text: string; t: number; me: boolean }[] = [];
  subs = new Set<() => void>();
  me!: Card;
  status = 'connecting';
  myFlags: Flag[] = [];
  banned = new Map<string, FraudNote>();
  private nonces = new Map<string, string>();
  closed = false;
  onDuel: ((d: Duel) => void) | null = null;
  constructor(
    public ch: Channel,
    public career: () => Career | null,
  ) {}
  bump() {
    this.subs.forEach(f => f());
  }
  async start() {
    await loadRecs();
    const pub = await myId();
    const c = this.career();
    const g = c?.g;
    this.myFlags = await flags();
    for (const { v } of await sall<FraudNote>('peers', IDBKeyRange.bound('ban:', 'ban:~'))) this.banned.set(v.pub, v);
    this.me = g
      ? {
          pub,
          name: g.club.name,
          tag: g.club.tag,
          mgr: g.mgr.name,
          c1: g.club.c1,
          c2: g.club.c2,
          crest: g.club.crest,
          region: g.club.region,
          titles: Object.keys(g.squads) as TitleId[],
        }
      : { pub, name: 'Free agent', tag: 'FA', mgr: 'Manager', c1: '#2f6b7a', c2: '#ffffff', crest: {} as any, region: 'EU', titles: [] };
    this.ch.onJoin(id => this.greet(id));
    this.ch.onLeave(id => {
      this.peers.delete(id);
      if (this.duel && this.duel.peer === id && this.duel.stage !== 'done') this.drop();
      this.bump();
    });
    this.ch.on('hi', async (d, from) => {
      if (typeof d?.n !== 'string') return;
      const sig = await sign(
        canon({ hello: d.n, card: this.me, rules: RULES, ranked: this.career()?.ranked ?? false, flagged: this.myFlags.length }),
      );
      this.ch.send(
        'hello',
        { card: this.me, rules: RULES, ranked: this.career()?.ranked ?? false, flagged: this.myFlags.length, sig },
        from,
      );
    });
    this.ch.on('hello', async (d, from) => {
      const n = this.nonces.get(from);
      const p = this.peers.get(from);
      if (!n || !p || !d?.card?.pub) return;
      const ok = await verify(d.card.pub, canon({ hello: n, card: d.card, rules: d.rules, ranked: d.ranked, flagged: d.flagged }), d.sig);
      p.card = d.card;
      p.ok = ok && d.rules === RULES;
      p.why = !ok ? 'Identity could not be verified' : d.rules !== RULES ? 'Different game version' : '';
      const ban = this.banned.get(d.card.pub);
      p.clean = ok && !d.flagged && !ban;
      p.ranked = !!d.ranked;
      if (d.flagged) p.why = 'Flagged for save tampering';
      else if (ban) p.why = ban.reason;
      if (p.ok) {
        this.ch.send('have', { recs: recIds().slice(-400), bans: [...this.banned.values()].slice(-50) }, from);
      }
      this.bump();
    });
    this.ch.on('have', async (d, from) => {
      if (!Array.isArray(d?.recs)) return;
      const h = new Set(d.recs);
      const miss = allRecs()
        .filter(r => !h.has(r.id))
        .slice(-60);
      for (const r of miss) this.ch.send('rec', r, from);
      const mineSet = new Set(recIds());
      const want = d.recs.filter((x: any) => typeof x === 'string' && !mineSet.has(x)).slice(-60);
      if (want.length) this.ch.send('want', { ids: want }, from);
    });
    this.ch.on('want', (d, from) => {
      for (const id of (d?.ids ?? []).slice(0, 60)) {
        const r = allRecs().find(x => x.id === id);
        if (r) this.ch.send('rec', r, from);
      }
    });
    this.ch.on('rec', async r => {
      if (await addRec(r)) this.bump();
    });
    this.ch.on('chat', (d, from) => {
      const p = this.peers.get(from);
      const s = String(d?.s ?? '').slice(0, 240);
      if (s && p?.ok) {
        this.chat.push({ who: p.card?.name ?? '?', text: s, t: Date.now(), me: false });
        if (this.chat.length > 80) this.chat.shift();
        this.bump();
      }
    });
    this.ch.on('challenge', (d, from) => {
      const p = this.peers.get(from);
      if (!p?.ok || !TITLES.includes(d?.title) || this.challenges.length > 20) return;
      if (d.mode !== 'level' && (!p.clean || !p.ranked || !this.canOpen())) {
        this.ch.send('decline', { id: d.id }, from);
        return;
      }
      this.challenges.push({
        id: String(d.id).slice(0, 40),
        from,
        title: d.title,
        mode: d.mode === 'level' ? 'level' : 'open',
        mine: false,
      });
      this.bump();
    });
    this.ch.on('cancel', d => {
      this.challenges = this.challenges.filter(c => c.id !== d?.id);
      this.bump();
    });
    this.ch.on('accept', (d, from) => {
      const c = this.challenges.find(x => x.id === d?.id && x.mine && x.from === from);
      if (!c) return;
      this.challenges = this.challenges.filter(x => x !== c);
      this.begin(c, 0);
    });
    this.ch.on('decline', d => {
      this.challenges = this.challenges.filter(c => c.id !== d?.id);
      this.bump();
    });
    this.ch.on('squad', (d, from) => this.onSquad(d, from));
    this.ch.on('proof', (d, from) => this.onProof(d, from));
    this.ch.on('reveal', (d, from) => this.onReveal(d, from));
    this.ch.on('turn', (d, from) => {
      const D = this.duel;
      if (!D || D.peer !== from || d?.id !== D.id || !Number.isInteger(d.n)) return;
      D.lastMsg = Date.now();
      D.turns[1 - D.us].set(
        d.n,
        (Array.isArray(d.c) ? d.c : []).slice(0, 4).map((x: any) => String(x).slice(0, 16)),
      );
      if (d.h) {
        const m = D.hashes.get(d.hn);
        if (m && m !== d.h) this.fail('The two simulations diverged');
      }
    });
    this.ch.on('sig', (d, from) => this.onSig(d, from));
    this.ch.on('abort', (d, from) => {
      if (this.duel && this.duel.peer === from && this.duel.id === d?.id && this.duel.stage !== 'done')
        this.fail(String(d.why ?? 'Opponent left').slice(0, 80), false);
    });
    for (const id of this.ch.peers()) this.greet(id);
    this.status = 'online';
    this.bump();
  }
  /** open matches need a clean identity and an unbroken career on both sides */
  canOpen() {
    return !this.myFlags.length && !!this.career()?.ranked;
  }
  private greet(id: string) {
    if (this.peers.has(id)) return;
    const n = randHex(12);
    this.nonces.set(id, n);
    this.peers.set(id, { id, card: null, ok: false, clean: false, why: 'Verifying identity', seen: Date.now() });
    this.ch.send('hi', { n }, id);
    this.bump();
  }
  say(s: string) {
    this.chat.push({ who: this.me.name, text: s, t: Date.now(), me: true });
    this.ch.send('chat', { s });
    this.bump();
  }
  challenge(to: string, title: TitleId, mode: Mode) {
    const id = randHex(8);
    this.challenges.push({ id, from: to, title, mode, mine: true });
    this.ch.send('challenge', { id, title, mode }, to);
    this.bump();
  }
  cancel(c: Challenge) {
    this.challenges = this.challenges.filter(x => x !== c);
    this.ch.send(c.mine ? 'cancel' : 'decline', { id: c.id }, c.from);
    this.bump();
  }
  accept(c: Challenge) {
    this.challenges = this.challenges.filter(x => x !== c);
    this.ch.send('accept', { id: c.id }, c.from);
    this.begin(c, 1);
  }
  private async begin(c: Challenge, us: 0 | 1) {
    const car = this.career();
    const p = this.peers.get(c.from);
    if (
      !car ||
      !p?.card ||
      (c.mode === 'open' && (!p.clean || !p.ranked || !this.canOpen())) ||
      (this.duel && !['done', 'failed'].includes(this.duel.stage))
    )
      return;
    const nonce = randHex(16);
    const D: Duel = (this.duel = {
      id: c.id,
      peer: c.from,
      title: c.title,
      mode: c.mode,
      us,
      stage: 'squads',
      msg: 'Exchanging squads',
      progress: 0,
      cfg: null,
      orders: [],
      turns: [new Map(), new Map()],
      sent: -1,
      queue: [],
      myNonce: nonce,
      commit: ['', ''],
      nonce: ['', ''],
      team: [null, null],
      sim: null,
      theirCard: p.card,
      rec: null,
      lastMsg: Date.now(),
      dropped: false,
      sig: ['', ''],
      core: '',
      proofOk: c.mode === 'level',
      hashes: new Map(),
    });
    const g = car.g as G;
    let t = simTeam(g, meId(c.title), 'p2p');
    t = { ...t, id: (await myId()).slice(0, 20) + us };
    if (c.mode === 'level') t = levelTeam(t);
    D.team[us] = t;
    D.commit[us] = sha256(nonce + canon(t));
    D.nonce[us] = nonce;
    this.ch.send('squad', { id: D.id, team: t, commit: D.commit[us] }, D.peer);
    if (c.mode === 'open') {
      const pr = await proof(car);
      this.ch.send('proof', { ...pr, cid: pr.id, id: D.id }, D.peer);
    }
    this.bump();
  }
  private pendSquad: any = null;
  private pendProof: any = null;
  private async onSquad(d: any, from: string) {
    const D = this.duel;
    if (!D || D.id !== d?.id || D.peer !== from) {
      this.pendSquad = { d, from };
      setTimeout(() => {
        const p = this.pendSquad;
        this.pendSquad = null;
        if (p && this.duel?.id === p.d?.id) this.onSquad(p.d, p.from);
      }, 400);
      return;
    }
    const them = 1 - D.us;
    const t = cleanTeam(d.team, D.title);
    if (!t) return this.fail('Invalid squad received');
    D.team[them] = t;
    D.commit[them] = String(d.commit);
    this.tryReveal();
  }
  private async onProof(d: any, from: string) {
    const D = this.duel;
    if (!D || D.id !== d?.id || D.peer !== from) {
      this.pendProof = { d, from };
      setTimeout(() => {
        const p = this.pendProof;
        this.pendProof = null;
        if (p && this.duel?.id === p.d?.id) this.onProof(p.d, p.from);
      }, 500);
      return;
    }
    D.stage = 'verify';
    D.msg = 'Replaying opponent career';
    this.bump();
    const them = (1 - D.us) as 0 | 1;
    const ban = async (reason: string) => {
      const by = await myId();
      const n: FraudNote = {
        pub: D.theirCard.pub,
        reason,
        at: new Date().toISOString(),
        by,
        sig: await sign(canon({ pub: D.theirCard.pub, reason })),
      };
      this.banned.set(n.pub, n);
      await sput('peers', 'ban:' + n.pub, n);
      const p = this.peers.get(D.peer);
      if (p) {
        p.clean = false;
        p.why = reason;
      }
      this.fail(reason);
    };
    if (d.pub !== D.theirCard.pub) return this.fail('Career proof belongs to somebody else');
    let log: any[];
    try {
      const s = await gunzip(ub64(d.gz));
      if (s.length > 3e7) throw 0;
      log = JSON.parse(s);
    } catch {
      return this.fail('Career proof unreadable');
    }
    const key = 'seen:' + d.pub + ':' + d.cid;
    const seen = await sget<{ seq: number; head: string }>('peers', key);
    const r = await replayJob(log, d.stateHash, p => {
      if (this.duel === D) {
        D.progress = p;
        this.bump();
      }
    });
    if (this.duel !== D || (D.stage as string) === 'failed') return;
    if (!r.ok) return ban(`Career does not replay: ${r.why ?? 'state mismatch'}`);
    if (!(await verify(d.pub, canon({ id: d.cid, seq: d.seq, head: d.head, stateHash: d.stateHash }), d.sig)) || r.head !== d.head)
      return ban('Career proof signature is invalid');
    if (seen && seen.seq <= d.seq) {
      let h = '';
      for (let i = 0; i <= seen.seq; i++) h = sha256(h + canon(log[i]));
      if (h !== seen.head) return ban('Career was rolled back and replayed differently');
    } else if (seen && seen.seq > d.seq) return ban('Career is older than one already seen');
    await sput('peers', key, { seq: d.seq, head: d.head });
    const wait = Date.now();
    while (!D.team[them] && Date.now() - wait < 8000) await new Promise(x => setTimeout(x, 100));
    const t = D.team[them];
    if (!t || !r.state) return this.fail('No squad received');
    const real = simTeam(r.state, meId(D.title), 'p2p');
    const cmp = (x: SimTeam) =>
      canon({ p: x.players.map(p => ({ id: p.id, r: p.role, st: p.st, h: p.hero ?? '' })), s: x.syn, f: x.fam, c: x.coach, q: x.prep });
    if (cmp(real) !== cmp(t)) return ban('Squad does not match the verified career');
    D.proofOk = true;
    D.stage = 'squads';
    D.msg = 'Career verified';
    this.tryReveal();
    this.bump();
  }
  private revealed = '';
  private tryReveal() {
    const D = this.duel;
    if (!D || !D.team[0] || !D.team[1] || !D.commit[0] || !D.commit[1] || !D.proofOk || this.revealed === D.id) return;
    this.revealed = D.id;
    this.ch.send('reveal', { id: D.id, n: D.myNonce }, D.peer);
    this.tryCfg();
  }
  private onReveal(d: any, from: string) {
    const D = this.duel;
    if (!D || D.id !== d?.id || D.peer !== from) return;
    D.nonce[1 - D.us] = String(d.n).slice(0, 64);
    this.tryCfg();
  }
  private rawCommitOk(i: 0 | 1, D: Duel) {
    return i === D.us || sha256(D.nonce[i] + canon(D.team[i])) === D.commit[i];
  }
  private tryCfg() {
    const D = this.duel;
    if (!D || D.cfg || !D.nonce[0] || !D.nonce[1] || this.revealed !== D.id) return;
    const them = (1 - D.us) as 0 | 1;
    if (!this.rawCommitOk(them, D)) return this.fail('Opponent changed the squad after committing');
    const seed = sha256([D.id, D.nonce[0], D.nonce[1]].join('|'));
    const r = Rng.of(seed);
    const maps = mapsFor(D.title);
    const teams: [SimTeam, SimTeam] = [JSON.parse(canon(D.team[0])), JSON.parse(canon(D.team[1]))];
    if (D.title === 'dota') dedupe(teams, r);
    if (teams[0].c1.toLowerCase() === teams[1].c1.toLowerCase()) teams[1].c1 = teams[1].c2;
    D.cfg = { title: D.title, map: maps[r.int(0, maps.length - 1)].id, seed, teams };
    D.stage = 'ready';
    D.msg = 'Both squads locked';
    this.sendTurn(0);
    this.sendTurn(1);
    this.bump();
    this.onDuel?.(D);
  }
  // ---------- lockstep
  private sendTurn(n: number) {
    const D = this.duel!;
    if (n <= D.sent) return;
    for (let k = D.sent + 1; k <= n; k++) {
      const c = D.queue.splice(0, 3);
      D.turns[D.us].set(k, c);
      const hn = Math.floor((k - DELAY) / 10) * 10;
      this.ch.send('turn', { id: D.id, n: k, c, ...(k % 10 === 5 && D.hashes.has(hn) ? { h: D.hashes.get(hn), hn } : {}) }, D.peer);
    }
    D.sent = n;
  }
  order(cmd: string) {
    if (this.duel) this.duel.queue.push(cmd);
  }
  /** may the simulation take the step that starts at `tick`? */
  gate(tick: number): boolean {
    const D = this.duel;
    if (!D) return true;
    const n = Math.floor(tick / TURN);
    if (tick % TURN === 0) this.sendTurn(n + DELAY);
    return D.dropped || (D.turns[0].has(n) && D.turns[1].has(n));
  }
  preStep(sim: Sim) {
    const D = this.duel;
    if (!D) return;
    D.sim = sim;
    if (sim.tick % TURN === 0) {
      const n = sim.tick / TURN;
      for (const t of [0, 1] as const)
        for (const c of D.turns[t].get(n) ?? []) if (sim.order(t, c)) D.orders.push({ tick: sim.tick, team: t, cmd: c });
      if (n % 10 === 0)
        D.hashes.set(
          n,
          sha256(sim.score.join() + sim.actors.map(a => a.x.toFixed(4) + a.y.toFixed(4) + a.hp.toFixed(2)).join()).slice(0, 16),
        );
    }
  }
  stalled() {
    const D = this.duel;
    return !!D && D.stage === 'live' && Date.now() - D.lastMsg > 6000;
  }
  drop() {
    const D = this.duel;
    if (!D) return;
    if (D.stage === 'live') {
      D.dropped = true;
      D.msg = 'Opponent disconnected. The rest plays out, but it will not count.';
    } else this.fail('Opponent disconnected', false);
    this.bump();
  }
  async finish(sim: Sim) {
    const D = this.duel;
    if (!D || !D.cfg || D.stage === 'done') return;
    const res = sim.result();
    D.stage = 'done';
    if (D.dropped) {
      D.msg = 'Unfinished: not recorded';
      this.bump();
      return;
    }
    const A = D.us === 0 ? this.me : D.theirCard,
      B = D.us === 0 ? D.theirCard : this.me;
    const r = {
      v: 1 as const,
      id: sha256(D.cfg.seed).slice(0, 32),
      title: D.title,
      t: 0,
      mode: D.mode,
      a: A,
      b: B,
      cfg: D.cfg,
      orders: D.orders,
      score: res.score,
      winner: res.winner,
      hash: res.hash,
    };
    D.rec = { ...r, sa: '', sb: '' };
    if (D.us === 0) {
      D.rec.t = Date.now();
      const s = await sign(recCore(D.rec));
      D.rec.sa = s;
      this.ch.send('sig', { id: D.id, t: D.rec.t, s, hash: res.hash }, D.peer);
    } else if (this.pendSig) this.onSig(this.pendSig, D.peer);
    D.msg = 'Signing result';
    this.bump();
  }
  private pendSig: any = null;
  private async onSig(d: any, from: string) {
    const D = this.duel;
    if (!D || D.id !== d?.id || D.peer !== from) return;
    if (!D.rec) {
      this.pendSig = d;
      return;
    }
    if (d.hash !== D.rec.hash) {
      D.msg = 'Results differ: not recorded';
      this.bump();
      return;
    }
    if (D.us === 1 && !D.rec.sa) {
      if (Math.abs(d.t - Date.now()) > 9e5) {
        D.msg = 'Clock mismatch: not recorded';
        this.bump();
        return;
      }
      D.rec.t = d.t;
      D.rec.sa = d.s;
      if (!(await verify(D.rec.a.pub, recCore(D.rec), d.s))) {
        D.msg = 'Bad signature: not recorded';
        return;
      }
      D.rec.sb = await sign(recCore(D.rec));
      this.ch.send('sig', { id: D.id, s: D.rec.sb, hash: D.rec.hash }, D.peer);
    } else if (D.us === 0) {
      D.rec.sb = d.s;
    }
    this.pendSig = null;
    if (await addRec(D.rec, true)) {
      D.msg = D.mode === 'open' ? 'Signed by both managers and added to the world ladder' : 'Signed by both managers';
      for (const p of this.ch.peers()) if (p !== D.peer) this.ch.send('rec', D.rec, p);
    } else D.msg = 'Record rejected';
    this.bump();
  }
  fail(why: string, tell = true) {
    const D = this.duel;
    if (!D) return;
    D.stage = 'failed';
    D.msg = why;
    if (tell) this.ch.send('abort', { id: D.id, why }, D.peer);
    this.bump();
  }
  close() {
    this.closed = true;
    this.ch.leave();
  }
  fp(pub: string) {
    return fingerprint(pub);
  }
}
export function dedupe(teams: [SimTeam, SimTeam], r: Rng) {
  const used = new Set(teams[0].players.map(p => p.hero));
  for (const p of teams[1].players) {
    if (used.has(p.hero)) {
      const pool = ['carry', 'mid', 'off', 'soft', 'hard']
        .flatMap(x => (x === p.role ? heroPool('dota', x) : []))
        .concat(heroPool('dota', 'off'), heroPool('dota', 'hard'), heroPool('dota', 'carry'))
        .filter(h => !used.has(h.id) && !teams[1].players.some(o => o.hero === h.id));
      p.hero = r.pick(pool).id;
    }
    used.add(p.hero);
  }
}
