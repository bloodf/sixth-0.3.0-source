/** Deterministic sfc32 PRNG. State is four uint32, so it survives JSON round-trips bit-exactly. */
export type RngState = [number, number, number, number];

export function seedRng(seed: string): RngState {
  // cyrb128: string -> 128-bit state
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const s: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  for (let i = 0; i < 12; i++) next(s);
  return s;
}

function next(s: RngState): number {
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

export class Rng {
  constructor(public s: RngState) {}
  static of(seed: string) {
    return new Rng(seedRng(seed));
  }
  /** [0,1) */
  f() {
    return next(this.s) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.f();
  }
  /** integer in [a,b] */
  int(a: number, b: number) {
    return a + Math.floor(this.f() * (b - a + 1));
  }
  chance(p: number) {
    return this.f() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.f() * arr.length)];
  }
  /** roughly normal, mean 0, sd ~1, only + and * so it is identical in every engine */
  gauss() {
    return (this.f() + this.f() + this.f() + this.f() + this.f() + this.f() - 3) * 1.4142;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  weighted<T>(items: readonly T[], w: (t: T) => number): T {
    let sum = 0;
    for (const i of items) sum += Math.max(0, w(i));
    let r = this.f() * sum;
    for (const i of items) {
      r -= Math.max(0, w(i));
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }
}
