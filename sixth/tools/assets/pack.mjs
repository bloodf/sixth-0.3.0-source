// Simplifies, quantises and packs the raw parts written by humans.py into public/assets/humans.bin
// node tools/assets/pack.mjs <raw dir> <out file>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { MeshoptSimplifier as S } from 'meshoptimizer';
await S.ready;
const [raw, out] = process.argv.slice(2);
const shp = JSON.parse(readFileSync(raw + '/shapes.json'));
const parts = JSON.parse(readFileSync(new URL('./parts.json', import.meta.url)));
const TARGET = { body: [15000, 2600, 560], outfit: [4200, 1000, 340], shoes: [1500, 280, 90], hair: [4200, 900, 260], eyes: [172, 172, 40], lash: [368, 0, 0], beard: [748, 300, 80], glasses: [1500, 300, 60], brow: [192, 60, 0] };
const blobs = [];
let off = 0;
const add = a => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const pad = (4 - (u.length % 4)) % 4;
  const o = off;
  blobs.push(u);
  if (pad) blobs.push(new Uint8Array(pad));
  off += u.length + pad;
  return o;
};
const lib = { macro: shp.macro, head: shp.head, ex: shp.ex, parts: {} };
for (const f of readdirSync(raw).filter(x => x.endsWith('.json') && x !== 'shapes.json')) {
  const m = JSON.parse(readFileSync(raw + '/' + f));
  const buf = readFileSync(raw + '/' + f.replace('.json', '.bin'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const n = m.verts;
  const kind = m.kind ?? 'body';
  const uv = new Float32Array(ab, m.uv, n * 2),
    idx = new Uint32Array(ab, m.idx, m.tris * 3),
    vm = new Uint32Array(ab, m.vm, n),
    si = new Uint8Array(ab, m.si, n * 4),
    sw = new Uint8Array(ab, m.sw, n * 4);
  const shape = k => new Float32Array(ab, m.shapes[k], n * 3);
  const gens = m.gens ?? ['male', 'female'];
  const base = shape(gens[0] + '/base');
  // zones from connected pieces
  const parent = new Map();
  const find = x => {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const v of vm) if (!parent.has(v)) parent.set(v, v);
  for (let i = 0; i < idx.length; i += 3) {
    const a = find(vm[idx[i]]);
    for (const j of [1, 2]) {
      const b = find(vm[idx[i + j]]);
      if (a !== b) parent.set(b, a);
    }
  }
  const comp = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(vm[i]);
    const c = comp.get(r) ?? comp.set(r, { n: 0, lo: 9, hi: -9 }).get(r);
    c.n++;
    c.lo = Math.min(c.lo, base[i * 3 + 1]);
    c.hi = Math.max(c.hi, base[i * 3 + 1]);
  }
  const order = [...comp.entries()].sort((a, b) => b[1].n - a[1].n).map(x => x[0]);
  const zoneOf = r => {
    const c = comp.get(r),
      k = order.indexOf(r);
    if (kind === 'body') return 0;
    if (kind === 'hair' || kind === 'brow' || kind === 'beard') return 1;
    if (kind === 'eyes') return 12;
    if (kind === 'lash') return 13;
    if (kind === 'glasses') return c.n < 200 ? 99 : 8;
    if (kind === 'shoes') return c.hi > 0.15 ? 11 : 5;
    if (m.name === 'jacket_m') return c.hi < 1.2 ? 4 : k === 0 ? 2 : c.lo > 1.2 ? 11 : 3;
    if (m.name === 'work_m') return k === 0 ? 4 : c.hi > 1.3 ? 2 : 7;
    if (m.name === 'shirt_m') return 2;
    return c.hi > 1.3 ? 2 : 4;
  };
  const zone = new Uint8Array(n);
  for (let i = 0; i < n; i++) zone[i] = zoneOf(find(vm[i]));
  if (m.name === 'shirt_m') for (let i = 0; i < n; i++) if (base[i * 3 + 1] < 0.96 && Math.abs(base[i * 3]) < 0.24) zone[i] = 4;
  // levels of detail share the vertices
  const [t0, t1, t2] = TARGET[kind];
  const nor = normals(base, idx, vm);
  const attr = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    attr.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], uv[i * 2] * 2, uv[i * 2 + 1] * 2], i * 5);
  }
  const simp = (src, tris) => {
    if (!tris) return new Uint32Array(0);
    if (src.length / 3 <= tris) return src;
    const [r] = S.simplifyWithAttributes(src, base, 3, attr, 5, kind === 'body' ? [0.5, 0.5, 0.5, 0.3, 0.3] : [0.25, 0.25, 0.25, 0.3, 0.3], null, tris * 3, 1, ['LockBorder'].filter(() => kind === 'body'));
    if (r.length > tris * 3 * 1.25) {
      const [q] = S.simplify(src, base, 3, tris * 3, 1, kind === 'hair' || kind === 'glasses' ? ['Prune'] : []);
      if (q.length > tris * 3 * 1.3 || q.length < tris * 1.2) {
        const [z] = S.simplifySloppy(src, base, 3, null, tris * 3, 1);
        if (z.length > tris * 1.2) return z;
        // cards that cannot be merged: keep the largest triangles
        const ar = [];
        for (let i = 0; i < src.length; i += 3) {
          const p = k => [0, 1, 2].map(c => base[src[i + k] * 3 + c]);
          const [a, b, c] = [p(0), p(1), p(2)];
          const e = b.map((x, k) => x - a[k]),
            g = c.map((x, k) => x - a[k]);
          ar.push([Math.hypot(e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]), i]);
        }
        ar.sort((a, b) => b[0] - a[0]);
        return Uint32Array.from(ar.slice(0, tris * 2).flatMap(x => [src[x[1]], src[x[1] + 1], src[x[1] + 2]]));
      }
      return q;
    }
    return r;
  };
  // faces and hands deserve more than the rest of the body
  let l0, l1, l2;
  if (kind === 'body') {
    const split = pred => idx.filter((_, i) => pred(Math.floor(i / 3)));
    const isHead = t => base[idx[t * 3] * 3 + 1] > 1.46,
      isFace = t => isHead(t);
    const H = split(t => isFace(t)),
      R = split(t => !isFace(t));
    l0 = Uint32Array.from([...simp(H, 9000), ...simp(R, 6000)]);
    const h0 = simp(H, 9000).length;
    const l1h = simp(l0.slice(0, h0), 1100),
      l1r = simp(l0.slice(h0), 1500);
    l1 = Uint32Array.from([...l1h, ...l1r]);
    l2 = Uint32Array.from([...simp(l1h, 330), ...simp(l1r, 260)]);
  } else {
    l0 = simp(idx, t0);
    l1 = simp(l0, t1);
    l2 = simp(l1, t2);
  }
  const used = new Int32Array(n).fill(-1);
  const back = [];
  for (const L of [l0, l1, l2])
    for (const v of L)
      if (used[v] < 0) {
        used[v] = back.length;
        back.push(v);
      }
  const N = back.length;
  const pick = (a, k, T = a.constructor) => {
    const r = new T(N * k);
    back.forEach((v, i) => {
      for (let c = 0; c < k; c++) r[i * k + c] = a[v * k + c];
    });
    return r;
  };
  const wm = new Map();
  const weld = Uint16Array.from(back.map(v => (wm.has(vm[v]) ? wm.get(vm[v]) : (wm.set(vm[v], wm.size), wm.size - 1))));
  const rec = { kind, n: N, gens, l0: l0.length, l1: l1.length, l2: l2.length, shapes: {} };
  rec.uv = add(Uint16Array.from(pick(uv, 2).map(x => Math.max(0, Math.min(65535, Math.round(((x % 1) + 1) % 1 * 65535))))));
  rec.i0 = add(Uint16Array.from(l0.map(v => used[v])));
  rec.i1 = add(Uint16Array.from(l1.map(v => used[v])));
  rec.i2 = add(Uint16Array.from(l2.map(v => used[v])));
  rec.weld = add(weld);
  rec.si = add(pick(si, 4));
  rec.sw = add(pick(sw, 4));
  rec.zone = add(pick(zone, 1));
  if (kind === 'body') {
    rec.hide = {};
    // which original base vertex each one was, for hiding skin under clothes
    rec.vm = add(Uint16Array.from(back.map(v => vm[v])));
  }
  const q16 = (a, s) => Int16Array.from(a.map(x => Math.max(-32767, Math.min(32767, Math.round(x / s)))));
  const q8 = (a, s) => Int8Array.from(a.map(x => Math.max(-127, Math.min(127, Math.round(x / s)))));
  const bases = {};
  for (const g of gens) {
    const B = (bases[g] = pick(shape(g + '/base'), 3));
    rec.shapes[g + '/base'] = { o: add(q16(B, 1 / 8000)), s: 1 / 8000, t: 16 };
    for (const k of shp.macro) {
      const P = pick(shape(g + '/' + k), 3).map((x, i) => x - B[i]);
      const mx = P.reduce((a, x) => Math.max(a, Math.abs(x)), 0);
      if (mx < 4e-4) continue;
      const s = Math.max(mx / 32000, 1.5e-4);
      rec.shapes[g + '/' + k] = { o: add(q16(P, s)), s, t: 16 };
    }
  }
  for (const k of [...shp.head, ...shp.ex.map(x => 'ex_' + x)]) {
    const acc = new Float32Array(N * 3);
    for (const g of gens) {
      const P = pick(shape(g + '/' + k), 3);
      for (let i = 0; i < P.length; i++) acc[i] += (P[i] - bases[g][i]) / gens.length;
    }
    const mx = acc.reduce((a, x) => Math.max(a, Math.abs(x)), 0);
    if (mx < 4e-4) continue;
    const s = mx / 127;
    rec.shapes[k] = { o: add(q8(acc, s)), s, t: 8 };
  }
  lib.parts[m.name] = rec;
  console.log(m.name.padEnd(10), kind.padEnd(7), 'verts', N, 'tris', l0.length / 3, l1.length / 3, l2.length / 3);
}
// skin hidden by each outfit, one bit per body vertex
const np = readFileSync(raw + '/hide.bits');
const man = JSON.parse(readFileSync(raw + '/hide.json.txt'));
const body = lib.parts.body;
{
  const bodyVm = new Uint16Array(blobsAt(body.vm, body.n * 2));
  for (const [k, o] of Object.entries(man)) {
    const bits = new Uint8Array(Math.ceil(body.n / 8));
    for (let i = 0; i < body.n; i++) if (np[o + bodyVm[i]]) bits[i >> 3] |= 1 << (i & 7);
    body.hide[k] = add(bits);
  }
}
function blobsAt(o, len) {
  const all = Buffer.concat(blobs.map(b => Buffer.from(b.buffer, b.byteOffset, b.byteLength)));
  const u = new Uint8Array(all.subarray(o, o + len));
  return u.buffer.slice(u.byteOffset, u.byteOffset + len);
}
function normals(p, ix, w) {
  const N = new Float32Array((Math.max(...w) + 1) * 3);
  for (let i = 0; i < ix.length; i += 3) {
    const [a, b, c] = [ix[i], ix[i + 1], ix[i + 2]];
    const e = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]),
      f = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
    const x = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[w[v] * 3 + k] += x[k];
  }
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length / 3; i++) {
    const l = Math.hypot(N[w[i] * 3], N[w[i] * 3 + 1], N[w[i] * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) o[i * 3 + k] = N[w[i] * 3 + k] / l;
  }
  return o;
}
const head = Buffer.from(JSON.stringify(lib));
const all = Buffer.concat([...blobs.map(b => Buffer.from(b.buffer, b.byteOffset, b.byteLength))]);
const pre = Buffer.alloc(8);
const padded = Buffer.concat([head, Buffer.alloc((4 - (head.length % 4)) % 4, 32)]);
pre.write('SXH1', 0);
pre.writeUInt32LE(padded.length, 4);
const z = deflateRawSync(Buffer.concat([pre, padded, all]), { level: 9 });
writeFileSync(out, z);
console.log('raw', all.length, 'packed', z.length);
