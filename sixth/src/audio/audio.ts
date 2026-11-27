/** All sound is synthesised at start-up. No samples are shipped. */
type Buf = Float32Array;
const SR = 44100;
const make = (sec: number, f: (t: number, i: number, n: number) => number): Buf => {
  const n = Math.floor(sec * SR),
    b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = f(i / SR, i, n);
  return b;
};
const noise = () => Math.random() * 2 - 1;
const lp = (b: Buf, c0: number, c1 = c0): Buf => {
  let y = 0;
  const n = b.length;
  for (let i = 0; i < n; i++) {
    const c = c0 + (c1 - c0) * (i / n);
    const a = 1 - Math.exp((-6.283 * c) / SR);
    y += a * (b[i] - y);
    b[i] = y;
  }
  return b;
};
const hp = (b: Buf, c: number): Buf => {
  let y = 0;
  const a = 1 - Math.exp((-6.283 * c) / SR);
  for (let i = 0; i < b.length; i++) {
    y += a * (b[i] - y);
    b[i] -= y;
  }
  return b;
};
const mix = (...L: [Buf, number, number?][]): Buf => {
  const n = Math.max(...L.map(([b, , d]) => b.length + Math.floor((d ?? 0) * SR)));
  const o = new Float32Array(n);
  for (const [b, g, d] of L) {
    const s = Math.floor((d ?? 0) * SR);
    for (let i = 0; i < b.length; i++) o[i + s] += b[i] * g;
  }
  return o;
};
const norm = (b: Buf, p = 0.9): Buf => {
  let m = 0;
  for (const x of b) m = Math.max(m, Math.abs(x));
  if (m > 0) for (let i = 0; i < b.length; i++) b[i] *= p / m;
  const f = Math.min(400, b.length);
  for (let i = 0; i < f; i++) b[b.length - 1 - i] *= i / f;
  return b;
};
const sat = (b: Buf, k: number): Buf => {
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * k);
  return b;
};
const verb = (b: Buf, sec: number, g: number, dark = 2500): Buf => {
  const tail = Math.floor(sec * SR),
    o = new Float32Array(b.length + tail);
  o.set(b);
  const taps: [number, number][] = [];
  for (let i = 0; i < 46; i++) {
    const t = 0.012 + Math.pow(i / 46, 1.4) * sec * 0.95;
    taps.push([Math.floor(t * SR * (0.96 + Math.random() * 0.08)), g * Math.exp((-3.6 * t) / sec) * (Math.random() < 0.5 ? -1 : 1)]);
  }
  const w = new Float32Array(o.length);
  for (const [d, a] of taps) for (let i = 0; i < b.length; i++) w[i + d] += b[i] * a;
  lp(w, dark);
  for (let i = 0; i < o.length; i++) o[i] += w[i];
  return o;
};
const shot = (crack: number, body: number, bf: number, len: number, tail: number) =>
  norm(
    verb(
      sat(
        mix(
          [
            hp(
              make(len * 0.35, t => noise() * Math.exp(-t * 70)),
              900,
            ),
            crack,
          ],
          [
            lp(
              make(len, t => noise() * Math.exp(-t * 16)),
              3800,
              500,
            ),
            body,
          ],
          [make(len, t => Math.sin(6.283 * (bf * t + bf * 0.06 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 22)), 0.9],
        ),
        2.2,
      ),
      tail,
      0.35,
    ),
  );
const tone = (f: number, len: number, a = 8, type = 0) =>
  make(len, t => {
    const p = f * t;
    const w = type === 0 ? Math.sin(6.283 * p) : type === 1 ? (p % 1 < 0.5 ? 1 : -1) * 0.6 : 2 * (p % 1) - 1;
    return w * Math.exp(-t * a) * Math.min(1, t * 400);
  });
const sweep = (f0: number, f1: number, len: number, a: number) => {
  let ph = 0;
  return make(len, (t, i, n) => {
    ph += (f0 * Math.pow(f1 / f0, i / n)) / SR;
    return Math.sin(6.283 * ph) * Math.exp(-t * a) * Math.min(1, t * 300);
  });
};
const boom = (len: number, f: number, g: number) =>
  norm(
    verb(
      sat(
        mix(
          [
            lp(
              make(len, t => noise() * Math.exp(-t * 3.2)),
              1500,
              120,
            ),
            1.2,
          ],
          [sweep(f * 2.2, f * 0.5, len * 0.8, 4), 1],
          [
            hp(
              make(0.08, t => noise() * Math.exp(-t * 40)),
              1200,
            ),
            0.6,
          ],
        ),
        g,
      ),
      1.2,
      0.4,
      900,
    ),
    0.95,
  );
const BANK: Record<string, () => Buf> = {
  rifle: () => shot(0.8, 1.1, 150, 0.2, 0.45),
  smg: () => shot(0.7, 0.8, 200, 0.13, 0.3),
  pistol: () => shot(0.9, 0.7, 240, 0.16, 0.35),
  awp: () => shot(1.2, 1.7, 80, 0.5, 1.2),
  shotgun: () => shot(0.9, 1.6, 95, 0.32, 0.7),
  pulse: () =>
    norm(
      mix(
        [sweep(1500, 260, 0.11, 20), 0.8],
        [
          hp(
            make(0.06, t => noise() * Math.exp(-t * 60)),
            2000,
          ),
          0.3,
        ],
      ),
    ),
  headshot: () =>
    norm(
      mix(
        [tone(2100, 0.18, 20), 0.7],
        [tone(3150, 0.12, 26), 0.4],
        [
          hp(
            make(0.05, t => noise() * Math.exp(-t * 80)),
            3000,
          ),
          0.5,
        ],
      ),
    ),
  down: () =>
    norm(
      mix(
        [sweep(260, 70, 0.3, 10), 1],
        [
          lp(
            make(0.2, t => noise() * Math.exp(-t * 22)),
            900,
          ),
          0.8,
        ],
      ),
    ),
  hiss: () =>
    norm(
      hp(
        make(1.1, t => noise() * Math.min(1, t * 18) * Math.exp(-t * 2.6)),
        1800,
      ),
      0.5,
    ),
  flash: () =>
    norm(
      verb(
        mix(
          [
            hp(
              make(0.2, t => noise() * Math.exp(-t * 26)),
              700,
            ),
            1,
          ],
          [make(1.1, t => Math.sin(6.283 * 5200 * t) * Math.exp(-t * 3.2) * Math.min(1, t * 9)), 0.16],
        ),
        0.7,
        0.3,
      ),
    ),
  fire: () =>
    norm(
      lp(
        make(1.4, t => noise() * (0.55 + 0.45 * Math.sin(t * 37) * Math.sin(t * 23)) * Math.min(1, t * 7) * Math.exp(-t * 1.7)),
        1400,
        500,
      ),
    ),
  boom: () => boom(0.9, 62, 2),
  bigboom: () => boom(2.1, 44, 2.8),
  ping: () => norm(verb(mix([tone(1320, 0.4, 9), 1], [tone(1980, 0.4, 12), 0.4]), 0.6, 0.4, 6000), 0.7),
  shield: () =>
    norm(
      mix(
        [sweep(220, 700, 0.4, 5), 0.8],
        [tone(1400, 0.4, 9), 0.3],
        [
          hp(
            make(0.3, t => noise() * Math.exp(-t * 12)),
            4000,
          ),
          0.12,
        ],
      ),
      0.7,
    ),
  glass: () =>
    norm(
      mix(
        ...[0, 1, 2, 3, 4, 5].map(
          i => [tone(2200 + i * 640 + Math.random() * 300, 0.35, 12 + i * 2), 0.4, i * 0.022] as [Buf, number, number],
        ),
        [
          hp(
            make(0.25, t => noise() * Math.exp(-t * 18)),
            3000,
          ),
          0.8,
        ],
      ),
    ),
  beep: () => norm(tone(1040, 0.1, 24, 0), 0.6),
  planted: () => norm(verb(mix([tone(520, 0.16, 12, 1), 0.5], [tone(780, 0.3, 9, 1), 0.5, 0.14]), 0.8, 0.4), 0.7),
  defused: () =>
    norm(verb(mix([tone(660, 0.2, 9), 0.7], [tone(880, 0.2, 9), 0.7, 0.1], [tone(1320, 0.5, 6), 0.7, 0.2]), 0.9, 0.4, 5000), 0.7),
  round: () => norm(verb(mix([tone(196, 0.5, 5), 0.8], [tone(294, 0.5, 5), 0.5, 0.08]), 1, 0.4), 0.6),
  win: () =>
    norm(
      verb(
        mix([tone(392, 0.5, 4, 2), 0.3], [tone(494, 0.5, 4, 2), 0.3, 0.09], [tone(587, 0.8, 3, 2), 0.35, 0.18], [tone(196, 0.8, 3), 0.7]),
        1.3,
        0.4,
      ),
      0.75,
    ),
  go: () => norm(mix([tone(880, 0.1, 16, 1), 0.4], [tone(1320, 0.24, 10, 1), 0.4, 0.1]), 0.5),
  horn: () =>
    norm(verb(lp(mix([tone(147, 1.1, 1.2, 2), 0.5], [tone(220, 1.1, 1.2, 2), 0.4], [tone(148.5, 1.1, 1.2, 2), 0.4]), 1400), 1.3, 0.4), 0.8),
  crowd: () =>
    norm(
      lp(
        hp(
          make(2.8, t => noise() * Math.min(1, t * 5) * Math.exp(-t * 1.1) * (0.8 + 0.2 * Math.sin(t * 31))),
          320,
        ),
        1900,
        900,
      ),
      0.8,
    ),
  dash: () =>
    norm(
      lp(
        hp(
          make(0.3, t => noise() * Math.sin(Math.min(1, t / 0.3) * 3.14)),
          500,
        ),
        4200,
        900,
      ),
      0.7,
    ),
  ult: () =>
    norm(
      verb(
        mix(
          [sweep(90, 420, 0.5, 2), 0.8],
          [sweep(180, 1260, 0.6, 2.5), 0.4],
          [tone(1046, 0.9, 4), 0.5, 0.45],
          [
            lp(
              make(0.6, t => noise() * t * 2),
              600,
              5000,
            ),
            0.25,
          ],
          [boom(0.6, 60, 1.6), 0.6, 0.45],
        ),
        1.4,
        0.45,
        4500,
      ),
    ),
  heal: () =>
    norm(verb(mix([tone(880, 0.4, 7), 0.5], [tone(1109, 0.4, 7), 0.5, 0.06], [tone(1319, 0.5, 6), 0.5, 0.12]), 0.8, 0.4, 7000), 0.55),
  quake: () =>
    norm(
      mix(
        [
          lp(
            make(0.9, t => noise() * Math.exp(-t * 4)),
            420,
            90,
          ),
          1.4,
        ],
        [sweep(95, 34, 0.8, 4), 1],
      ),
    ),
  spell: () =>
    norm(
      verb(
        mix(
          [sweep(700, 150, 0.25, 11), 0.8],
          [
            hp(
              make(0.2, t => noise() * Math.exp(-t * 20)),
              1800,
            ),
            0.5,
          ],
        ),
        0.6,
        0.4,
        4000,
      ),
      0.7,
    ),
  cast: () =>
    norm(
      mix(
        [sweep(300, 900, 0.24, 9), 0.6],
        [
          hp(
            make(0.2, t => noise() * t * 4),
            3000,
          ),
          0.2,
        ],
      ),
      0.55,
    ),
  swing: () =>
    norm(
      hp(
        lp(
          make(0.17, t => noise() * Math.sin(Math.min(1, t / 0.17) * 3.14)),
          2600,
          900,
        ),
        500,
      ),
      0.6,
    ),
  throw: () =>
    norm(
      hp(
        lp(
          make(0.14, t => noise() * Math.sin(Math.min(1, t / 0.14) * 3.14)),
          2200,
        ),
        600,
      ),
      0.5,
    ),
  hook: () =>
    norm(
      mix(...[0, 1, 2, 3, 4].map(i => [tone(1500 + i * 60, 0.06, 50, 1), 0.4, i * 0.045] as [Buf, number, number]), [
        sweep(160, 60, 0.3, 9),
        0.8,
      ]),
    ),
  click: () =>
    norm(
      mix(
        [tone(1900, 0.03, 120), 0.6],
        [
          hp(
            make(0.015, t => noise() * Math.exp(-t * 300)),
            2000,
          ),
          0.6,
        ],
      ),
      0.35,
    ),
  tap: () => norm(tone(1250, 0.025, 150), 0.22),
  confirm: () => norm(mix([tone(523, 0.12, 16), 0.7], [tone(784, 0.22, 11), 0.7, 0.07]), 0.45),
  error: () => norm(mix([tone(196, 0.14, 14, 1), 0.6], [tone(165, 0.2, 12, 1), 0.6, 0.1]), 0.35),
  cash: () =>
    norm(
      mix(
        [tone(1568, 0.12, 18), 0.6],
        [tone(2093, 0.25, 12), 0.6, 0.06],
        [
          hp(
            make(0.06, t => noise() * Math.exp(-t * 70)),
            4000,
          ),
          0.4,
        ],
      ),
      0.4,
    ),
  whoosh: () =>
    norm(
      lp(
        hp(
          make(0.38, t => noise() * Math.sin(Math.min(1, t / 0.38) * 3.14)),
          250,
        ),
        1800,
        500,
      ),
      0.35,
    ),
  notify: () => norm(verb(mix([tone(880, 0.2, 10), 0.6], [tone(1175, 0.35, 8), 0.6, 0.09]), 0.5, 0.3, 5000), 0.4),
  build: () =>
    norm(
      mix(
        [
          lp(
            make(0.16, t => noise() * Math.exp(-t * 26)),
            1200,
          ),
          1,
        ],
        [
          lp(
            make(0.16, t => noise() * Math.exp(-t * 26)),
            900,
          ),
          1,
          0.14,
        ],
        [tone(220, 0.2, 14), 0.6, 0.14],
      ),
      0.6,
    ),
  place: () =>
    norm(
      mix(
        [
          lp(
            make(0.09, t => noise() * Math.exp(-t * 46)),
            1500,
          ),
          0.9,
        ],
        [tone(170, 0.1, 26), 0.6],
      ),
      0.5,
    ),
  day: () => norm(verb(mix([tone(440, 0.5, 5), 0.4], [tone(554, 0.5, 5), 0.4, 0.05], [tone(659, 0.8, 4), 0.4, 0.1]), 1, 0.35, 4000), 0.4),
};
export type Mood = 'title' | 'hq' | 'match' | 'none';
const hzOf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
class Audio_ {
  ctx: AudioContext | null = null;
  buf = new Map<string, AudioBuffer>();
  sfxG!: GainNode;
  musG!: GainNode;
  master!: GainNode;
  vol = { master: 0.8, sfx: 0.8, music: 0.45 };
  mood: Mood = 'none';
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextT = 0;
  intensity = 0.3;
  private voices = 0;
  private pending: Mood = 'none';
  private rev: ConvolverNode | null = null;
  load() {
    try {
      const v = JSON.parse(localStorage.getItem('sixth.vol') ?? 'null');
      if (v) this.vol = { ...this.vol, ...v };
    } catch {
      /* defaults */
    }
  }
  setVol(k: 'master' | 'sfx' | 'music', v: number) {
    this.vol[k] = v;
    localStorage.setItem('sixth.vol', JSON.stringify(this.vol));
    this.apply();
  }
  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxG.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musG.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.2);
  }
  /** browsers need a gesture first */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const C = (window as any).AudioContext;
    if (!C) return;
    this.ctx = new C() as AudioContext;
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = c.createGain();
    this.sfxG = c.createGain();
    this.musG = c.createGain();
    this.sfxG.connect(this.master);
    this.musG.connect(this.master);
    this.master.connect(comp);
    comp.connect(c.destination);
    this.rev = c.createConvolver();
    const ir = c.createBuffer(2, c.sampleRate * 2.2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = noise() * Math.pow(1 - i / d.length, 3.2);
    }
    this.rev.buffer = ir;
    const rg = c.createGain();
    rg.gain.value = 0.32;
    this.rev.connect(rg);
    rg.connect(this.musG);
    this.apply();
    const ks = Object.keys(BANK);
    let i = 0;
    const fill = () => {
      const t0 = performance.now();
      while (i < ks.length && performance.now() - t0 < 10) {
        this.get(ks[i++]);
      }
      if (i < ks.length) setTimeout(fill, 16);
    };
    setTimeout(fill, 60);
    if (this.pending !== 'none') this.music(this.pending);
  }
  private get(n: string): AudioBuffer | null {
    if (!this.ctx) return null;
    let b = this.buf.get(n);
    if (!b) {
      const f = BANK[n];
      if (!f) return null;
      const d = f();
      b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.buf.set(n, b);
    }
    return b;
  }
  play = (n: string, o: { pan?: number; vol?: number; rate?: number } = {}) => {
    if (!this.ctx || this.ctx.state !== 'running' || this.voices > 26) return;
    const b = this.get(n);
    if (!b) return;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = o.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1.2, o.vol ?? 0.7);
    const p = this.ctx.createStereoPanner();
    p.pan.value = o.pan ?? 0;
    s.connect(g);
    g.connect(p);
    p.connect(this.sfxG);
    this.voices++;
    s.onended = () => this.voices--;
    s.start();
  };
  music(m: Mood) {
    this.pending = m;
    if (!this.ctx || m === this.mood) return;
    this.mood = m;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (m === 'none') return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.sched(), 60);
  }
  private note(t: number, midi: number, len: number, vol: number, type: OscillatorType, cut: number, wet = 0.3, detune = 0, att = 0.01) {
    const c = this.ctx!;
    const o = c.createOscillator(),
      g = c.createGain(),
      f = c.createBiquadFilter();
    o.type = type;
    o.frequency.value = hzOf(midi);
    o.detune.value = detune;
    f.type = 'lowpass';
    f.frequency.value = cut;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    o.connect(f);
    f.connect(g);
    g.connect(this.musG);
    if (wet && this.rev) {
      const w = c.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.rev);
    }
    o.start(t);
    o.stop(t + len + 0.05);
  }
  private drum(t: number, k: 'k' | 'h' | 's', vol: number) {
    const c = this.ctx!;
    if (k === 'k') {
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o.connect(g);
      g.connect(this.musG);
      o.start(t);
      o.stop(t + 0.3);
      return;
    }
    const b = this.get(k === 'h' ? 'tap' : 'swing');
    if (!b) return;
    const s = c.createBufferSource();
    s.buffer = this.get('hiss');
    const f = c.createBiquadFilter();
    f.type = k === 'h' ? 'highpass' : 'bandpass';
    f.frequency.value = k === 'h' ? 7000 : 1700;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (k === 'h' ? 0.045 : 0.15));
    s.connect(f);
    f.connect(g);
    g.connect(this.musG);
    s.start(t, 0.1, 0.2);
  }
  private sched() {
    const c = this.ctx!;
    if (c.state !== 'running') {
      this.nextT = c.currentTime + 0.1;
      return;
    }
    const bpm = this.mood === 'match' ? 118 : this.mood === 'title' ? 72 : 84;
    const s16 = 60 / bpm / 4;
    while (this.nextT < c.currentTime + 0.25) {
      this.bar(this.nextT, this.step, s16);
      this.step++;
      this.nextT += s16 * (this.mood === 'hq' && this.step % 2 ? 1.12 : this.mood === 'hq' ? 0.88 : 1);
    }
  }
  private bar(t: number, st: number, s16: number) {
    const b = Math.floor(st / 16),
      p = st % 16;
    if (this.mood === 'hq') {
      const ch = [
        [50, 57, 60, 64, 69],
        [55, 59, 62, 65, 69],
        [48, 55, 59, 64, 67],
        [45, 52, 55, 60, 64],
      ][b % 4];
      if (p === 0 || (p === 10 && b % 2))
        ch.forEach((m, i) => {
          this.note(t + i * 0.014, m + (i === 0 ? 0 : 0), 2.2, 0.05, 'triangle', 1500, 0.35);
          this.note(t + i * 0.014, m + 12, 0.9, 0.012, 'sine', 3000, 0.4);
        });
      if (p === 0 || p === 7) this.note(t, ch[0] - 12, 0.7, 0.12, 'sine', 500, 0);
      if (p === 0 || p === 8 || (p === 11 && b % 2)) this.drum(t, 'k', 0.24);
      if (p === 4 || p === 12) this.drum(t, 's', 0.09);
      if (p % 2 === 0) this.drum(t, 'h', p % 4 ? 0.05 : 0.03);
      if (b % 4 > 1 && [3, 6, 10, 13].includes(p) && (b * 7 + p) % 3) {
        const sc = [69, 72, 74, 76, 79, 81];
        this.note(t, sc[(b * 5 + p * 3) % 6], 0.7, 0.022, 'sine', 4000, 0.6);
      }
    } else if (this.mood === 'title') {
      const ch = [
        [38, 50, 57, 62, 65],
        [34, 50, 58, 62, 65],
        [41, 48, 57, 60, 65],
        [36, 48, 55, 60, 64],
      ][b % 4];
      if (p === 0) {
        ch.forEach((m, i) => {
          this.note(t, m, s16 * 17, i ? 0.06 : 0.14, i ? 'sawtooth' : 'sine', i ? 700 : 300, 0.6, i * 4 - 8, 1.1);
        });
      }
      if (p % 4 === 2) {
        const m = ch[1 + ((b + p) % 4)] + 12;
        this.note(t, m, 1.4, 0.028, 'triangle', 2400, 0.8);
      }
      if (b > 3 && (p === 0 || p === 6)) this.drum(t, 'k', 0.26);
    } else {
      const I = this.intensity;
      const root = [38, 38, 41, 36][Math.floor(b / 2) % 4];
      if (p % 2 === 0 || I > 0.6) this.note(t, root + (p % 8 === 6 ? 12 : 0), 0.17, 0.075 + I * 0.03, 'sawtooth', 320 + I * 900, 0.05);
      if (p % 4 === 0) this.drum(t, 'k', 0.16 + I * 0.2);
      if (p === 4 || p === 12) this.drum(t, 's', 0.05 + I * 0.09);
      if (p % 2 === 1 || I > 0.5) this.drum(t, 'h', 0.03 + I * 0.03);
      if (I > 0.4 && [0, 3, 6, 10].includes(p))
        this.note(t, root + 24 + [0, 3, 7, 10][(p + b) % 4], 0.4, 0.02 + I * 0.015, 'square', 1400, 0.5);
      if (p === 0 && b % 2 === 0)
        [0, 7, 12, 15].forEach(x => this.note(t, root + 12 + x, s16 * 30, 0.018, 'sawtooth', 500 + I * 600, 0.5, x, 0.5));
    }
  }
}
export const audio = new Audio_();
