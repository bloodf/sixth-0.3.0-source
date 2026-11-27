/** Synchronous SHA-256 + canonical JSON. Sync because the reducer and audit worker hash inside tight loops. */
const K = new Uint32Array(64);
(() => {
  let n = 0,
    c = 2;
  const frac = (x: number) => ((x - Math.floor(x)) * 4294967296) >>> 0;
  // Prime cube roots by Newton, so no dependency on engine-specific Math.cbrt.
  const cbrt = (v: number) => {
    let r = v / 3 + 1;
    for (let i = 0; i < 80; i++) r = (2 * r + v / (r * r)) / 3;
    return r;
  };
  while (n < 64) {
    let p = true;
    for (let i = 2; i * i <= c; i++)
      if (c % i === 0) {
        p = false;
        break;
      }
    if (p) K[n++] = frac(cbrt(c));
    c++;
  }
})();
const enc = new TextEncoder();
const W = new Uint32Array(64);

export function sha256(input: string | Uint8Array): string {
  const m = typeof input === 'string' ? enc.encode(input) : input;
  const l = m.length,
    tail = new Uint8Array(((l + 9 + 63) & ~63) - (l & ~63));
  tail.set(m.subarray(l & ~63));
  tail[l & 63] = 0x80;
  const dv = new DataView(tail.buffer);
  dv.setUint32(tail.length - 8, Math.floor(l / 0x20000000));
  dv.setUint32(tail.length - 4, (l << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const block = (b: Uint8Array, o: number) => {
    for (let i = 0; i < 16; i++, o += 4) W[i] = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15],
        y = W[i - 2];
      W[i] =
        (W[i - 16] +
          (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
          W[i - 7] +
          (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) |
        0;
    }
    let a = H[0],
      b2 = H[1],
      c = H[2],
      d = H[3],
      e = H[4],
      f = H[5],
      g = H[6],
      h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b2;
      b2 = a;
      a = (t1 + t2) | 0;
    }
    H[0] += a;
    H[1] += b2;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  };
  for (let o = 0; o + 64 <= l; o += 64) block(m, o);
  for (let o = 0; o < tail.length; o += 64) block(tail, o);
  let s = '';
  for (let i = 0; i < 8; i++) s += H[i].toString(16).padStart(8, '0');
  return s;
}

/** Key-sorted JSON. -0 becomes 0, undefined keys dropped. */
export function canon(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite number in state');
    return JSON.stringify(v === 0 ? 0 : v);
  }
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : canon(x))).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter(k => o[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canon(o[k]))
      .join(',') +
    '}'
  );
}
