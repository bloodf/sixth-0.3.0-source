/**
 * The vault. Nothing about a career is stored in the clear.
 *
 *  - header, state and every action are sealed with AES-256-GCM under a key the page can use but never read
 *  - each action is bound to the one before it (the previous hash is authenticated data), so none can be removed or reordered
 *  - the sealed header is signed with the manager's ECDSA key; three anchors catch rollbacks
 *  - on load everything is verified; then a worker replays the whole career from its seed and compares
 *  - any contradiction seals the save for good and flags the manager
 */
import { canon, sha256 } from '../core/hash.ts';
import { RULES, type Action, type G } from '../game/types.ts';
import { genesis, reduce, type NewOpts } from '../game/reducer.ts';
import { Replay, nextHead as next, reduceUnder, upgrade, upgradeAction } from './replay.ts';
import { isSealed } from './sealed.ts';
import { all, del, get, multi, put } from './db.ts';
import { b64, fingerprint, gunzip, gzip, loadKeys, mac, open, randHex, seal, sign, ub64, verify, type Sealed } from './crypto.ts';
export interface Meta {
  name: string;
  tag: string;
  c1: string;
  c2: string;
  c3: string;
  crest: any;
  mgr: string;
  titles: string[];
  day: number;
  cash: number;
  rep: number;
  saved: number;
}
/** what the header says once opened */
export interface Head {
  rules: number;
  meta: Meta;
  seq: number;
  head: string;
  stateHash: string;
  ranked: boolean;
  sealed?: string;
}
/** what lies in the database: two opaque boxes and a signature */
export interface Row {
  id: string;
  v: 2;
  box: Sealed;
  snap: Sealed;
  sig: string;
}
/** version 0.1.0 kept the header readable */
interface Row1 extends Head {
  id: string;
  snapSeq: number;
  snap: Sealed;
  sig: string;
}
/** an entry on the title screen */
export interface Entry extends Head {
  id: string;
}
export interface Flag {
  pub: string;
  reason: string;
  at: string;
  career: string;
  sig: string;
}
export class TamperError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}
const pad = (n: number) => String(n).padStart(8, '0');
const logKey = (id: string, seq: number) => `${id}:${pad(seq)}`;
const row1Sig = (r: Row1) =>
  canon({ id: r.id, rules: r.rules, seq: r.seq, head: r.head, sh: r.stateHash, ss: r.snapSeq, rk: r.ranked, sl: r.sealed ?? '' });
const boxSig = (id: string, box: Sealed) => `${id}|${b64(box.iv)}|${sha256(box.ct)}`;
async function makeRow(id: string, h: Head, snap: Sealed): Promise<Row> {
  const box = await seal(JSON.stringify(h), `${id}|head`);
  return { id, v: 2, box, snap, sig: await sign(boxSig(id, box)) };
}
async function openHead(row: Row): Promise<Head | null> {
  const { pub } = await loadKeys();
  if (!(await verify(pub, boxSig(row.id, row.box), row.sig))) return null;
  try {
    return JSON.parse(await open(row.box, `${row.id}|head`));
  } catch {
    return null;
  }
}
const metaOf = (g: G): Meta => ({
  name: g.club.name,
  tag: g.club.tag,
  c1: g.club.c1,
  c2: g.club.c2,
  c3: g.club.c3,
  crest: g.club.crest,
  mgr: g.mgr.name,
  titles: Object.keys(g.squads),
  day: g.day,
  cash: g.club.cash,
  rep: Math.round(g.club.rep),
  saved: Date.now(),
});
// ---------- flags
export async function flags(): Promise<Flag[]> {
  const { pub } = await loadKeys();
  const out = new Map<string, Flag>();
  for (const { v } of await all<Flag>('flags')) out.set(v.sig, v);
  try {
    for (const f of JSON.parse(localStorage.getItem('sixth.f') ?? '[]') as Flag[]) out.set(f.sig, f);
  } catch {
    /* unreadable is treated as absent; IndexedDB and Cache still hold it */
  }
  try {
    const r = await (await caches.open('sixth-a')).match('/__flags');
    if (r) for (const f of (await r.json()) as Flag[]) out.set(f.sig, f);
  } catch {
    /* Cache API is unavailable on file:// */
  }
  const good: Flag[] = [];
  for (const f of out.values())
    if (f.pub === pub && (await verify(f.pub, canon({ pub: f.pub, reason: f.reason, at: f.at, career: f.career }), f.sig))) good.push(f);
  if (good.length) await spread(good);
  return good;
}
async function spread(L: Flag[]) {
  for (const f of L) await put('flags', f.sig.slice(0, 24), f);
  try {
    localStorage.setItem('sixth.f', JSON.stringify(L));
  } catch {
    /* full */
  }
  try {
    await (await caches.open('sixth-a')).put('/__flags', new Response(JSON.stringify(L)));
  } catch {
    /* file:// */
  }
}
export async function flagMe(reason: string, career: string) {
  const { pub } = await loadKeys();
  const f = { pub, reason, at: new Date().toISOString(), career };
  const sig = await sign(canon(f));
  await spread([...(await flags()), { ...f, sig }]);
  const row = await get<any>('careers', career);
  if (!row) return;
  const old = row.v === 2 ? await openHead(row) : null;
  if (old?.sealed) return;
  const meta: Meta = old?.meta ?? (row.v === 2 ? blankMeta() : row.meta);
  // the state is thrown away: a sealed career can be shown, never opened
  const h: Head = { rules: RULES, meta, seq: old?.seq ?? 0, head: old?.head ?? '', stateHash: '', ranked: false, sealed: reason };
  await put('careers', career, await makeRow(career, h, await seal('sealed', `${career}|void`)));
}
const blankMeta = (): Meta => ({
  name: 'Unreadable career',
  tag: '?',
  c1: '#444444',
  c2: '#666666',
  c3: '#999999',
  crest: {},
  mgr: '',
  titles: [],
  day: 0,
  cash: 0,
  rep: 0,
  saved: 0,
});
// ---------- anchors
interface Anchor {
  seq: number;
  m: string;
}
async function setAnchor(id: string, seq: number) {
  const a: Anchor = { seq, m: await mac(`${id}|${seq}`) };
  const s = JSON.stringify(a);
  try {
    localStorage.setItem('sixth.a.' + id, s);
  } catch {
    /* full */
  }
  try {
    await (await caches.open('sixth-a')).put('/__a/' + id, new Response(s));
  } catch {
    /* file:// */
  }
}
async function getAnchors(id: string): Promise<{ max: number; n: number; bad: boolean; full: boolean }> {
  const L: string[] = [];
  const l = localStorage.getItem('sixth.a.' + id);
  if (l) L.push(l);
  try {
    const r = await (await caches.open('sixth-a')).match('/__a/' + id);
    if (r) L.push(await r.text());
  } catch {
    /* file:// */
  }
  const x = await get<Anchor>('anchors', id);
  if (x) L.push(JSON.stringify(x));
  let max = -1,
    n = 0,
    bad = false;
  for (const s of L) {
    try {
      const a = JSON.parse(s) as Anchor;
      if (a.m !== (await mac(`${id}|${a.seq}`))) bad = true;
      else {
        max = Math.max(max, a.seq);
        n++;
      }
    } catch {
      bad = true;
    }
  }
  return { max, n, bad, full: !!l && !!x };
}
// ---------- careers
/** Opens every header. One that was altered is sealed and flagged here, before anyone clicks it. */
export async function list(): Promise<Entry[]> {
  const out: Entry[] = [];
  const { pub } = await loadKeys();
  for (const { k, v } of await all<any>('careers')) {
    let h: Head | null = null;
    if (v?.v === 2 && isSealed(v.box)) h = await openHead(v);
    else if (v?.sig && (await verify(pub, row1Sig(v), v.sig))) h = v as Row1;
    if (!h) {
      await flagMe('Save header was altered', k);
      h = { rules: RULES, meta: blankMeta(), seq: 0, head: '', stateHash: '', ranked: false, sealed: 'Save header was altered' };
    }
    out.push({
      id: k,
      rules: h.rules,
      meta: h.meta,
      seq: h.seq,
      head: h.head,
      stateHash: h.stateHash,
      ranked: h.ranked,
      ...(h.sealed ? { sealed: h.sealed } : {}),
    });
  }
  return out.sort((a, b) => b.meta.saved - a.meta.saved);
}
export async function create(o: NewOpts): Promise<Career> {
  const g = genesis(o);
  const id = randHex(8);
  const a0 = { t: '#genesis', opts: o, rules: RULES };
  const head = next('', a0);
  const c = new Career(id, g, head, 0, true);
  await c.writeFirst(a0, head);
  return c;
}
export async function remove(id: string) {
  const r = IDBKeyRange.bound(id + ':', id + ':~');
  await multi(['careers', 'log', 'anchors'], s => {
    s('careers').delete(id);
    s('log').delete(r);
    s('anchors').delete(id);
  });
  localStorage.removeItem('sixth.a.' + id);
  try {
    await (await caches.open('sixth-a')).delete('/__a/' + id);
  } catch {
    /* file:// */
  }
}
export async function readLog(id: string): Promise<Action[]> {
  const L = await all<Sealed>('log', IDBKeyRange.bound(id + ':', id + ':~'));
  const out: Action[] = [];
  let head = '';
  for (let i = 0; i < L.length; i++) {
    if (L[i].k !== logKey(id, i)) throw new TamperError('Action log has missing entries');
    let a: Action;
    try {
      a = JSON.parse(await open(L[i].v, `${id}|${i}|${head}`));
    } catch {
      throw new TamperError('Action log was modified');
    }
    head = next(head, a);
    out.push(a);
  }
  (out as any).head = head;
  return out;
}
export async function load(id: string): Promise<Career> {
  const row = await get<any>('careers', id);
  if (!row) throw new Error('Save not found');
  const { pub } = await loadKeys();
  const bad = async (why: string): Promise<never> => {
    await flagMe(why, id);
    throw new TamperError(why);
  };
  const old = row.v !== 2;
  let h: Head | null;
  if (old) h = (await verify(pub, row1Sig(row), row.sig)) ? (row as Row1) : null;
  else h = await openHead(row);
  if (!h) return bad('Save header was altered');
  if (h.sealed) throw new TamperError(h.sealed);
  const an = await getAnchors(id);
  if (an.bad) return bad('Save anchor was edited');
  if (an.max > h.seq) return bad('Save was rolled back to an earlier copy');
  let log: Action[];
  try {
    log = await readLog(id);
  } catch (e) {
    return bad((e as TamperError).reason ?? 'Action log unreadable');
  }
  if (log.length - 1 !== h.seq || (log as any).head !== h.head) return bad('Action chain does not match the header');
  const snapSeq = old ? (row as Row1).snapSeq : h.seq;
  let g: G;
  try {
    g = JSON.parse(await open(row.snap, `${id}|snap|${snapSeq}`));
  } catch {
    return bad('Save data was modified');
  }
  for (let i = snapSeq + 1; i <= h.seq; i++) if (!reduceUnder(h.rules, g, log[i]).ok) return bad('Save data contradicts its own history');
  if (sha256(canon(g)) !== h.stateHash) return bad('State hash mismatch');
  let ranked = h.ranked;
  if (!an.full && h.seq > 0) ranked = false; // anchors wiped: playable, not ranked
  const up = upgrade(g, h.rules);
  const c = new Career(id, up.g, h.head, h.seq, ranked);
  // a career from older rules continues under the new ones; each step is part of the signed history
  if (up.steps.length) await c.appendAll(up.steps);
  return c;
}
let tampered: ((why: string, id: string) => void) | null = null;
export const onTamper = (f: typeof tampered) => {
  tampered = f;
};
/** cheap fingerprint of everything worth editing, checked before every action to catch live memory edits */
function guard(g: G): string {
  const c = g.club;
  let s = `${c.cash}|${c.fans}|${c.rep}|${c.loan}|${g.day}|${g.site}|${g.seq}|${g.stats.w}|${g.stats.l}|${g.stats.prize}`;
  for (const p of Object.values(g.players))
    if (p.team && p.team.endsWith(':me'))
      s += `|${p.id}${Object.values(p.attr).join()}${p.pot}${p.energy}${p.stress}${p.morale}${p.contract?.salary}`;
  for (const q of Object.values(g.squads)) {
    s += `|${q!.fam}${q!.syn}`;
    for (const st of q!.stations) s += Object.values(st.m).join('');
  }
  s += g.staff.map(x => x.id + x.skill).join() + g.rooms.map(x => x.id + x.lvl).join();
  s += g.hq.floor + g.hq.wv + g.hq.wh + g.hq.items.map(i => i.id + i.f).join();
  return sha256(s);
}
export class Career {
  #g: G;
  #q: Promise<void> = Promise.resolve();
  #guard: string;
  #dead = false;
  onError: ((e: unknown) => void) | null = null;
  auditState: 'pending' | 'running' | 'ok' | 'failed' = 'pending';
  constructor(
    public id: string,
    g: G,
    public head: string,
    public seq: number,
    public ranked: boolean,
  ) {
    this.#g = g;
    this.#guard = guard(g);
  }
  get g(): Readonly<G> {
    return this.#g;
  }
  get dead() {
    return this.#dead;
  }
  async writeFirst(a0: Action, head: string) {
    const e = await seal(canon(a0), `${this.id}|0|`);
    const st = canon(this.#g);
    const row = await makeRow(this.id, this.#header(0, head, sha256(st)), await seal(st, `${this.id}|snap|0`));
    const am = await mac(`${this.id}|0`);
    await multi(['careers', 'log', 'anchors'], s => {
      s('careers').put(row, this.id);
      s('log').put(e, logKey(this.id, 0));
      s('anchors').put({ seq: 0, m: am }, this.id);
    });
    await setAnchor(this.id, 0);
  }
  #header(seq: number, head: string, stateHash: string): Head {
    return { rules: RULES, meta: metaOf(this.#g), seq, head, stateHash, ranked: this.ranked };
  }
  /** A player action. Synchronous state change, asynchronous durable write in order. */
  dispatch(a: Action) {
    if (this.#dead) return { ok: false, err: 'This save is sealed' };
    if (guard(this.#g) !== this.#guard) {
      this.kill('Game memory was edited while running');
      return { ok: false, err: 'Tampering detected' };
    }
    a = JSON.parse(canon(a));
    if (a.t[0] === '#') return { ok: false, err: '?' };
    const o = reduce(this.#g, a);
    if (!o.ok) return o;
    this.#guard = guard(this.#g);
    void this.append(a);
    return o;
  }
  /** write one more link: action, state and header go into the same transaction, each in its own sealed box */
  append(a: Action): Promise<void> {
    return this.appendAll([a]);
  }
  /** several links in one transaction: either all of them are there or none */
  appendAll(list: Action[]): Promise<void> {
    const links = list.map(a => {
      const prev = this.head,
        seq = ++this.seq;
      this.head = next(prev, a);
      return { js: canon(a), prev, seq };
    });
    const { seq } = links[links.length - 1];
    const st = canon(this.#g);
    const h = this.#header(seq, this.head, sha256(st));
    this.#q = this.#q
      .then(async () => {
        const es = await Promise.all(links.map(l => seal(l.js, `${this.id}|${l.seq}|${l.prev}`)));
        const row = await makeRow(this.id, h, await seal(st, `${this.id}|snap|${seq}`));
        const am = await mac(`${this.id}|${seq}`);
        await multi(['careers', 'log', 'anchors'], s => {
          s('careers').put(row, this.id);
          links.forEach((l, i) => s('log').put(es[i], logKey(this.id, l.seq)));
          s('anchors').put({ seq, m: am }, this.id);
        });
        await setAnchor(this.id, seq);
      })
      .catch(e => this.onError?.(e));
    return this.#q;
  }
  flush() {
    return this.#q;
  }
  kill(why: string) {
    if (this.#dead) return;
    this.#dead = true;
    this.#q = this.#q.then(() => flagMe(why, this.id)).then(() => tampered?.(why, this.id));
  }
  /** full replay in a worker; resolves when finished */
  async audit(spawn: () => Worker): Promise<boolean> {
    this.auditState = 'running';
    await this.flush();
    const row = await openHead((await get<Row>('careers', this.id))!);
    const log = await readLog(this.id);
    if (!row) {
      this.auditState = 'failed';
      this.kill('Save header was altered');
      return false;
    }
    return new Promise(res => {
      const w = spawn();
      w.onmessage = async ev => {
        if (ev.data.progress !== undefined) return;
        w.terminate();
        if (ev.data.ok) {
          this.auditState = 'ok';
          res(true);
        } else if (ev.data.crash) {
          this.auditState = 'pending';
          res(true);
        } else {
          this.auditState = 'failed';
          this.kill('Replay of the career does not reproduce this save');
          res(false);
        }
      };
      w.onerror = () => {
        w.terminate();
        this.auditState = 'pending';
        res(true);
      };
      w.postMessage({ log, expect: row.stateHash });
    });
  }
}
export const open_ = load;
// ---------- backup files: encrypted with a password, signed over the ciphertext
const MAGIC = 'SIXTH-BACKUP-2\n';
const te = new TextEncoder(),
  td = new TextDecoder();
async function passKey(pass: string, salt: Uint8Array<ArrayBuffer>, it: number) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function exportSave(id: string, pass: string): Promise<Uint8Array> {
  if (pass.length < 6) throw new Error('The password needs six characters or more');
  const row = await openHead((await get<Row>('careers', id))!);
  if (!row || row.sealed) throw new Error('This career cannot be exported');
  const log = await readLog(id);
  const { pub } = await loadKeys();
  const body = canon({ id, rules: row.rules, pub, seq: row.seq, head: row.head, stateHash: row.stateHash, ranked: row.ranked, log });
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    it = 400000;
  const plain = await gzip(body);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passKey(pass, salt, it), new Uint8Array(plain) as Uint8Array<ArrayBuffer>),
  );
  const h = { pub, salt: b64(salt), iv: b64(iv), it, ct: sha256(ct), own: await mac('backup|' + b64(salt)) };
  const header = te.encode(MAGIC + JSON.stringify({ ...h, sig: await sign(canon(h)) }) + '\n');
  const out = new Uint8Array(header.length + ct.length);
  out.set(header);
  out.set(ct, header.length);
  return out;
}
export const isBackup = (b: Uint8Array) => td.decode(b.subarray(0, MAGIC.length)) === MAGIC;
export async function importSave(bytes: Uint8Array, pass: string): Promise<{ id: string; ranked: boolean }> {
  if (!isBackup(bytes)) throw new Error('This is not a SIXTH backup file');
  const nl = bytes.indexOf(10, MAGIC.length);
  let h: any;
  try {
    h = JSON.parse(td.decode(bytes.subarray(MAGIC.length, nl)));
  } catch {
    throw new Error('This backup file is damaged');
  }
  const ct = bytes.subarray(nl + 1);
  const { pub } = await loadKeys();
  const mine = h.pub === pub;
  // a mark only this profile can make: without it, a file that merely claims to be yours cannot get you flagged
  const own = mine && h.own === (await mac('backup|' + h.salt));
  const fail = async (why: string): Promise<never> => {
    // only your own altered file counts against you: nobody can flag you by sending you a bad one
    if (own) await flagMe(why, 'backup');
    throw own ? new TamperError(why) : new Error(why);
  };
  if (sha256(ct) !== h.ct || !(await verify(h.pub, canon({ pub: h.pub, salt: h.salt, iv: h.iv, it: h.it, ct: h.ct, own: h.own }), h.sig)))
    return fail('The backup file was altered');
  if (!(h.it >= 100000 && h.it <= 5000000)) return fail('The backup file was altered');
  let b: any;
  try {
    const key = await passKey(pass, new Uint8Array(ub64(h.salt)) as Uint8Array<ArrayBuffer>, h.it);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ub64(h.iv)) as Uint8Array<ArrayBuffer> },
      key,
      new Uint8Array(ct) as Uint8Array<ArrayBuffer>,
    );
    b = JSON.parse(await gunzip(new Uint8Array(plain)));
  } catch {
    throw new Error('Wrong password');
  }
  const r = new Replay();
  for (const a of b.log as Action[]) if (r.step(a)) return fail('The backup history is impossible');
  if (r.head !== b.head || r.hash() !== b.stateHash || r.n - 1 !== b.seq) return fail('The backup does not replay to its own state');
  const log = b.log as Action[];
  const cur = await get<Row>('careers', b.id);
  const curHead = cur && (cur as any).v === 2 ? await openHead(cur) : null;
  const an = await getAnchors(b.id);
  const rolled = an.max > b.seq || !!(curHead && curHead.seq > b.seq);
  const ranked = b.ranked && mine && !rolled;
  // an older copy restarts the chain under a new id, so the newer line can never be confused with it
  const id = rolled || !mine || cur ? randHex(8) : b.id;
  while (r.rules < RULES) {
    const a = upgradeAction(r.rules + 1);
    log.push(a);
    if (r.step(a)) return fail('The backup cannot be brought up to date');
  }
  const g = r.g as G;
  let hd = '';
  const ents: [string, Sealed][] = [];
  for (let i = 0; i < log.length; i++) {
    ents.push([logKey(id, i), await seal(canon(log[i]), `${id}|${i}|${hd}`)]);
    hd = next(hd, log[i]);
  }
  const seq = log.length - 1,
    st = canon(g);
  const row = await makeRow(
    id,
    { rules: RULES, meta: metaOf(g), seq, head: hd, stateHash: sha256(st), ranked },
    await seal(st, `${id}|snap|${seq}`),
  );
  const am = await mac(`${id}|${seq}`);
  await multi(['careers', 'log', 'anchors'], x => {
    x('careers').put(row, id);
    x('anchors').put({ seq, m: am }, id);
    for (const [k, v] of ents) x('log').put(v, k);
  });
  await setAnchor(id, seq);
  return { id, ranked };
}
/** compact career proof for P2P: seed + every action, signed */
export async function proof(
  c: Career,
): Promise<{ gz: string; pub: string; sig: string; head: string; seq: number; stateHash: string; id: string }> {
  await c.flush();
  const row = (await openHead((await get<Row>('careers', c.id))!))!;
  const log = await readLog(c.id);
  const { pub } = await loadKeys();
  const hdr = { id: c.id, seq: row.seq, head: row.head, stateHash: row.stateHash };
  return { gz: b64(await gzip(JSON.stringify(log))), pub, sig: await sign(canon(hdr)), ...hdr };
}
export { b64, ub64, fingerprint, del, get, put };
