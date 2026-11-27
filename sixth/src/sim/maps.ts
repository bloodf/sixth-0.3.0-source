import { dcos, dsin } from '../core/dmath.ts';
import { Grid, WALL, LOW, FLOOR, TREE } from './grid.ts';
import type { TitleId } from '../data/titles.ts';
export type P = [number, number];
export type Theme = 'desert' | 'industry' | 'temple' | 'terrace' | 'vale' | 'ashen' | 'orbital' | 'harbour';
export interface SiteDef {
  plant: P;
  rect: [number, number, number, number];
  holds: [number, number, number, number][];
  post: [number, number, number, number][];
  smokes: P[];
  routes: P[][];
}
export interface TacMap {
  id: string;
  name: string;
  title: TitleId;
  theme: Theme;
  kind: 'tac';
  grid: Grid;
  spawn: [P, P];
  sites: { A: SiteDef; B: SiteDef };
  mid: [number, number, number, number][];
  midRoute: P[];
  boxes: [number, number, number, number, number][];
  zones: [string, number, number][];
}
type R4 = [number, number, number, number];

interface TacSrc {
  floors: R4[];
  high: R4[];
  low: R4[];
  spawnT: P;
  spawnC: P;
  A: SiteDef;
  B: SiteDef;
  mid: [number, number, number, number][];
  midRoute: P[];
  zones: [string, number, number][];
}
const W = 72,
  H = 52;
const KASBAH: TacSrc = {
  floors: [
    [28, 42, 45, 50],
    [44, 43, 63, 48],
    [56, 22, 63, 48],
    [50, 5, 67, 21],
    [56, 20, 63, 24],
    [38, 22, 53, 26],
    [48, 17, 53, 26],
    [32, 12, 39, 43],
    [6, 43, 29, 48],
    [9, 27, 16, 46],
    [5, 5, 23, 21],
    [10, 18, 15, 30],
    [22, 13, 34, 17],
    [27, 3, 47, 11],
    [44, 6, 52, 10],
    [20, 6, 30, 10],
    [32, 8, 39, 16],
    [15, 31, 34, 35],
    [20, 46, 34, 49],
  ],
  high: [
    [56, 9, 59, 12],
    [10, 9, 13, 12],
    [34, 27, 36, 29],
    [59, 30, 62, 32],
    [56, 39, 58, 41],
    [11, 34, 13, 36],
    [36, 45, 39, 47],
    [62, 15, 65, 17],
  ],
  low: [
    [62, 8, 64, 10],
    [52, 15, 54, 17],
    [7, 15, 9, 17],
    [17, 13, 19, 15],
    [19, 7, 20, 9],
    [36, 19, 38, 20],
    [32, 22, 34, 23],
    [44, 22, 46, 23],
    [22, 43, 24, 45],
    [35, 6, 38, 7],
    [51, 8, 52, 9],
    [24, 31, 26, 32],
    [57, 26, 58, 27],
  ],
  spawnT: [36, 47],
  spawnC: [37, 8.5],
  A: {
    plant: [58, 15],
    rect: [53, 8, 64, 19],
    holds: [
      [65, 7, 60, 24],
      [52, 7, 59, 23],
      [60, 6, 50, 20],
      [54, 18, 46, 24],
      [64, 18, 60, 30],
    ],
    post: [
      [60, 26, 50, 8],
      [54, 13, 48, 8],
      [65, 12, 50, 8],
      [50, 22, 48, 8],
      [57, 19, 47, 7],
    ],
    smokes: [
      [48, 8],
      [56, 19],
      [52, 12],
    ],
    routes: [
      [
        [50, 45.5],
        [59, 45],
        [59.5, 36],
        [60, 27],
        [59, 18],
      ],
      [
        [35.5, 39],
        [35.5, 31],
        [38, 24],
        [48, 24],
        [51, 19],
        [55, 15],
      ],
    ],
  },
  B: {
    plant: [13, 14],
    rect: [8, 8, 20, 19],
    holds: [
      [7, 7, 12, 22],
      [21, 8, 13, 20],
      [18, 18, 13, 24],
      [9, 18, 12, 26],
      [16, 7, 24, 15],
    ],
    post: [
      [12, 23, 22, 9],
      [7, 13, 22, 8],
      [20, 18, 24, 9],
      [16, 9, 24, 15],
      [9, 7, 21, 8],
    ],
    smokes: [
      [22, 8],
      [23, 15],
      [17, 8],
    ],
    routes: [
      [
        [24, 47],
        [12, 45.5],
        [12, 38],
        [12.5, 28],
        [12.5, 20],
      ],
      [
        [35.5, 39],
        [33, 33],
        [35.5, 24],
        [33, 15],
        [24, 15],
        [20, 16],
        [15.5, 15],
      ],
    ],
  },
  mid: [
    [35, 11, 35, 30],
    [34, 15, 35, 34],
  ],
  midRoute: [
    [35.5, 40],
    [35.5, 32],
  ],
  zones: [
    ['T spawn', 36, 47],
    ['Long', 60, 40],
    ['Long', 60, 30],
    ['A site', 58, 14],
    ['Catwalk', 45, 24],
    ['Mid', 35, 30],
    ['Top mid', 35, 18],
    ['Tunnels', 12, 36],
    ['B site', 13, 14],
    ['Window', 28, 15],
    ['CT spawn', 37, 8],
    ['Lower', 24, 33],
  ],
};
const HALCYON: TacSrc = {
  floors: [
    [2, 18, 13, 33],
    [7, 6, 13, 20],
    [7, 31, 13, 46],
    [7, 5, 29, 14],
    [28, 7, 43, 12],
    [42, 3, 57, 19],
    [7, 39, 27, 47],
    [26, 40, 43, 45],
    [42, 34, 58, 50],
    [12, 23, 28, 29],
    [26, 18, 43, 34],
    [33, 11, 38, 20],
    [40, 13, 45, 22],
    [40, 30, 45, 37],
    [42, 24, 60, 29],
    [58, 18, 70, 34],
    [56, 9, 64, 14],
    [60, 10, 64, 22],
    [57, 39, 64, 44],
    [60, 30, 64, 43],
  ],
  high: [
    [48, 8, 51, 11],
    [49, 40, 52, 43],
    [33, 24, 36, 27],
    [18, 8, 20, 10],
    [17, 42, 19, 45],
    [62, 24, 65, 27],
    [53, 14, 55, 16],
    [46, 46, 48, 48],
  ],
  low: [
    [44, 15, 46, 16],
    [54, 6, 55, 8],
    [45, 38, 47, 39],
    [55, 45, 57, 46],
    [29, 20, 31, 21],
    [39, 30, 41, 31],
    [38, 21, 40, 22],
    [28, 31, 30, 32],
    [22, 25, 23, 27],
    [50, 25, 52, 26],
    [34, 8, 35, 9],
    [34, 43, 35, 44],
    [58, 11, 59, 12],
  ],
  spawnT: [7, 25.5],
  spawnC: [66, 26],
  A: {
    plant: [49, 14],
    rect: [44, 5, 55, 18],
    holds: [
      [55, 4, 43, 9],
      [56, 17, 44, 15],
      [52, 12, 42, 10],
      [45, 4, 40, 10],
      [61, 12, 50, 10],
    ],
    post: [
      [44, 8, 57, 11],
      [43, 16, 57, 11],
      [53, 5, 60, 12],
      [46, 17, 58, 12],
      [56, 17, 61, 12],
    ],
    smokes: [
      [58, 11],
      [44, 14],
      [50, 6],
    ],
    routes: [
      [
        [10, 18],
        [11, 10],
        [24, 9.5],
        [36, 9.5],
        [44, 9.5],
        [48, 13],
      ],
      [
        [20, 26],
        [30, 22],
        [36, 20],
        [42, 17],
        [47, 14],
      ],
    ],
  },
  B: {
    plant: [49, 45],
    rect: [44, 36, 56, 49],
    holds: [
      [56, 49, 43, 43],
      [57, 36, 44, 38],
      [53, 38, 42, 42],
      [44, 48, 40, 43],
      [61, 41, 50, 44],
    ],
    post: [
      [44, 42, 58, 41],
      [43, 36, 58, 41],
      [55, 48, 60, 41],
      [46, 44, 58, 41],
      [56, 36, 61, 41],
    ],
    smokes: [
      [58, 41],
      [44, 37],
      [51, 37],
    ],
    routes: [
      [
        [10, 34],
        [11, 43],
        [22, 43],
        [35, 42.5],
        [44, 42.5],
        [47, 45],
      ],
      [
        [20, 26],
        [30, 30],
        [38, 32],
        [42.5, 34],
        [46, 41],
      ],
    ],
  },
  mid: [
    [56, 26, 40, 26],
    [58, 28, 40, 27],
  ],
  midRoute: [
    [20, 26],
    [29, 26],
  ],
  zones: [
    ['Spawn', 7, 26],
    ['A lobby', 18, 9],
    ['A main', 36, 9],
    ['A site', 49, 12],
    ['Courtyard', 35, 26],
    ['B lobby', 18, 43],
    ['B main', 35, 42],
    ['B site', 49, 43],
    ['Mid link', 50, 26],
    ['Heaven', 61, 15],
    ['Garage', 62, 38],
    ['Defender spawn', 66, 26],
    ['A link', 42, 18],
    ['B link', 42, 34],
  ],
};
function flipX(s: TacSrc): TacSrc {
  const r = (a: R4): R4 => [W - a[2], a[1], W - a[0], a[3]],
    p = (a: P): P => [W - a[0], a[1]],
    q = (a: [number, number, number, number]): [number, number, number, number] => [W - a[0], a[1], W - a[2], a[3]];
  const site = (t: SiteDef): SiteDef => ({
    plant: p(t.plant),
    rect: r(t.rect),
    holds: t.holds.map(q),
    post: t.post.map(q),
    smokes: t.smokes.map(p),
    routes: t.routes.map(x => x.map(p)),
  });
  return {
    floors: s.floors.map(r),
    high: s.high.map(r),
    low: s.low.map(r),
    spawnT: p(s.spawnT),
    spawnC: p(s.spawnC),
    A: site(s.B),
    B: site(s.A),
    mid: s.mid.map(q),
    midRoute: s.midRoute.map(p),
    zones: s.zones.map(([n, x, y]) => [n.startsWith('A ') ? 'B ' + n.slice(2) : n.startsWith('B ') ? 'A ' + n.slice(2) : n, W - x, y]),
  };
}
/** Barrels and pots hug the walls. They are part of the map, so everybody has to walk around them. */
function placeProps(g: Grid, boxes: [number, number, number, number, number][], keep: P[]) {
  const box = new Set<number>();
  for (const b of boxes) for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) box.add(y * g.W + x);
  const wall = (x: number, y: number) => g.at(x, y) === WALL && !box.has(y * g.W + x);
  for (let y = 1; y < g.H - 1; y++)
    for (let x = 1; x < g.W - 1; x++) {
      if (g.at(x, y) !== FLOOR) continue;
      const n = wall(x, y - 1),
        s = wall(x, y + 1),
        l = wall(x - 1, y),
        r = wall(x + 1, y);
      const q = (x * 31 + y * 17) % 37;
      let px = -1,
        py = -1;
      if ((n ? 1 : 0) + (s ? 1 : 0) + (l ? 1 : 0) + (r ? 1 : 0) === 2 && (n || s) && (l || r) && q % 3) {
        px = x + (l ? 0.34 : 0.66);
        py = y + (n ? 0.34 : 0.66);
      } else if (n && q === 5) {
        px = x + 0.5;
        py = y + 0.3;
      }
      if (px < 0 || keep.some(k => (k[0] - px) * (k[0] - px) + (k[1] - py) * (k[1] - py) < 2.2)) continue;
      g.statics.push({ x: px, y: py, r: 0.28, q });
    }
}
function buildTac(id: string, name: string, title: TitleId, theme: Theme, s: TacSrc, extraHigh: R4[] = [], extraLow: R4[] = []): TacMap {
  const g = new Grid(W, H, 1, WALL);
  const boxes: [number, number, number, number, number][] = [];
  for (const f of s.floors) g.rect(...f, FLOOR);
  for (const b of [...s.high, ...extraHigh]) {
    g.rect(...b, WALL);
    boxes.push([...b, 2]);
  }
  for (const b of [...s.low, ...extraLow]) {
    g.rect(...b, LOW);
    boxes.push([...b, 1]);
  }
  const pts = (d: SiteDef): P[] => [
    d.plant,
    ...d.holds.map(h => [h[0], h[1]] as P),
    ...d.post.map(h => [h[0], h[1]] as P),
    ...d.routes.flat(),
  ];
  placeProps(g, boxes, [s.spawnT, s.spawnC, ...pts(s.A), ...pts(s.B), ...s.mid.map(h => [h[0], h[1]] as P), ...s.midRoute]);
  return {
    id,
    name,
    title,
    theme,
    kind: 'tac',
    grid: g,
    spawn: [s.spawnT, s.spawnC],
    sites: { A: s.A, B: s.B },
    mid: s.mid,
    midRoute: s.midRoute,
    boxes,
    zones: s.zones,
  };
}
export interface MobaMap {
  id: string;
  name: string;
  title: TitleId;
  theme: Theme;
  kind: 'moba';
  grid: Grid;
  lanes: P[][];
  base: [P, P];
  towers: { team: 0 | 1; lane: number; tier: number; x: number; y: number }[];
  camps: P[];
  pit: P;
  river: P[];
}
const MS = 120;
function along(poly: P[], d: number): P {
  for (let i = 0; i + 1 < poly.length; i++) {
    const dx = poly[i + 1][0] - poly[i][0],
      dy = poly[i + 1][1] - poly[i][1],
      l = Math.sqrt(dx * dx + dy * dy);
    if (d <= l) return [poly[i][0] + (dx * d) / l, poly[i][1] + (dy * d) / l];
    d -= l;
  }
  return poly[poly.length - 1];
}
function plen(poly: P[]) {
  let s = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const dx = poly[i + 1][0] - poly[i][0],
      dy = poly[i + 1][1] - poly[i][1];
    s += Math.sqrt(dx * dx + dy * dy);
  }
  return s;
}
function nearPoly(poly: P[], x: number, y: number) {
  let b = 1e9;
  for (let i = 0; i + 1 < poly.length; i++) {
    const dx = poly[i + 1][0] - poly[i][0],
      dy = poly[i + 1][1] - poly[i][1];
    let u = ((x - poly[i][0]) * dx + (y - poly[i][1]) * dy) / (dx * dx + dy * dy);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = poly[i][0] + dx * u - x,
      ey = poly[i][1] + dy * u - y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < b) b = d;
  }
  return b;
}
function buildMoba(id: string, name: string, theme: Theme, jungle: P[][]): MobaMap {
  const g = new Grid(MS / 2, MS / 2, 2, TREE);
  const rot = (p: P): P => [MS - p[0], MS - p[1]];
  const lanes: P[][] = [
    [
      [14, 98],
      [13, 40],
      [15, 20],
      [22, 14],
      [42, 12],
      [98, 14],
    ],
    [
      [22, 98],
      [50, 69],
      [60, 60],
      [70, 51],
      [98, 22],
    ],
    [
      [22, 106],
      [78, 108],
      [98, 106],
      [105, 98],
      [107, 78],
      [106, 22],
    ],
  ];
  const carve = (poly: P[], r: number) => {
    const l = plen(poly);
    for (let d = 0; d <= l; d += 0.8) {
      const [x, y] = along(poly, d);
      g.disc(x / 2, y / 2, r / 2, FLOOR);
    }
  };
  for (const l of lanes) carve(l, 5.4);
  const base: [P, P] = [
    [13, 107],
    [107, 13],
  ];
  for (const b of base) g.disc(b[0] / 2, b[1] / 2, 10.5, FLOOR);
  const river: P[] = [
    [16, 16],
    [34, 36],
    [48, 46],
    [60, 60],
    [72, 74],
    [86, 84],
    [104, 104],
  ];
  carve(river, 5);
  for (const j of jungle) {
    carve(j, 2.8);
    carve(j.map(rot), 2.8);
  }
  const campsA: P[] = jungle.flatMap(j => [j[Math.floor(j.length / 2)]]).slice(0, 5);
  const camps = [...campsA, ...campsA.map(rot)];
  for (const c of camps) g.disc(c[0] / 2, c[1] / 2, 2.4, FLOOR);
  const pit: P = [38, 47];
  g.disc(pit[0] / 2, pit[1] / 2, 3.2, FLOOR);
  const towers: MobaMap['towers'] = [];
  lanes.forEach((l, li) => {
    const L = plen(l);
    for (let t = 0; t < 3; t++) {
      const d = [0.4, 0.245, 0.09][t] * L;
      const a = along(l, d),
        b = along(l, L - d);
      towers.push({ team: 0, lane: li, tier: t, x: a[0], y: a[1] }, { team: 1, lane: li, tier: t, x: b[0], y: b[1] });
    }
  });
  for (const b of base)
    for (let q = 0; q < 10; q++) {
      const a = (q / 10) * 6.283185307179586;
      const x = b[0] + dcos(a) * 9.5,
        y = b[1] + dsin(a) * 9.5;
      if (g.depth(x, y, 1.8) === 0 && !lanes.some(l => nearPoly(l, x, y) < 2.4)) g.statics.push({ x, y, r: 0.45, q: -1 });
    }
  for (let q = 0; q < 9; q++) {
    const a = (q / 9) * 6.283185307179586 + 0.3;
    const x = pit[0] + dcos(a) * 6.2,
      y = pit[1] + dsin(a) * 6.2;
    if (g.depth(x, y, 2.1) === 0) g.statics.push({ x, y, r: 0.75, q: -2 - q });
  }
  return { id, name, title: 'dota', theme, kind: 'moba', grid: g, lanes, base, towers, camps, pit, river };
}
export interface ArenaMap {
  id: string;
  name: string;
  title: TitleId;
  theme: Theme;
  kind: 'arena';
  mode: 'control' | 'escort';
  grid: Grid;
  spawn: [P, P];
  point: P;
  pr: number;
  path?: P[];
  packs: P[];
  boxes: [number, number, number, number, number][];
  routes: [P[][], P[][]];
}
function buildControl(): ArenaMap {
  const w = 76,
    h = 46,
    g = new Grid(w, h, 1, WALL);
  const boxes: ArenaMap['boxes'] = [];
  const sym = (r: R4, v: number, hh = 0) => {
    const m: R4 = [w - r[2], h - r[3], w - r[0], h - r[1]];
    g.rect(...r, v);
    g.rect(...m, v);
    if (hh) boxes.push([...r, hh], [...m, hh]);
  };
  for (const f of [
    [2, 16, 12, 30],
    [10, 19, 28, 27],
    [14, 6, 20, 40],
    [18, 5, 40, 11],
    [18, 35, 40, 41],
    [26, 12, 50, 34],
    [34, 8, 42, 14],
  ] as R4[])
    sym(f, FLOOR);
  for (const f of [
    [27, 14, 29, 17],
    [27, 29, 29, 32],
    [33, 17, 35, 19],
    [16, 22, 18, 24],
  ] as R4[])
    sym(f, WALL, 2);
  for (const f of [
    [31, 24, 33, 26],
    [22, 20, 23, 22],
    [26, 7, 28, 8],
    [26, 38, 28, 39],
  ] as R4[])
    sym(f, LOW, 1);
  placeProps(g, boxes, [
    [6, 23],
    [70, 23],
    [38, 23],
    [17, 8],
    [59, 38],
    [17, 38],
    [59, 8],
  ]);
  return {
    id: 'solstice',
    name: 'Solstice',
    title: 'ow',
    theme: 'orbital',
    kind: 'arena',
    mode: 'control',
    grid: g,
    spawn: [
      [6, 23],
      [70, 23],
    ],
    point: [38, 23],
    pr: 6,
    packs: [
      [17, 8],
      [59, 38],
      [17, 38],
      [59, 8],
    ],
    boxes,
    routes: [
      [
        [
          [19.5, 23],
          [26, 23],
          [38, 23],
        ],
        [
          [17, 10],
          [30, 8],
          [38, 11],
          [38, 20],
        ],
        [
          [17, 36],
          [30, 38],
          [38, 35],
          [38, 26],
        ],
      ],
      [
        [
          [56.5, 23],
          [50, 23],
          [38, 23],
        ],
        [
          [59, 36],
          [46, 38],
          [38, 35],
          [38, 26],
        ],
        [
          [59, 10],
          [46, 8],
          [38, 11],
          [38, 20],
        ],
      ],
    ],
  };
}
function buildEscort(): ArenaMap {
  const w = 90,
    h = 44,
    g = new Grid(w, h, 1, WALL);
  const boxes: ArenaMap['boxes'] = [];
  const path: P[] = [
    [12, 33],
    [26, 33],
    [31, 28],
    [31, 16],
    [36, 11],
    [52, 11],
    [57, 15],
    [57, 27],
    [62, 32],
    [82, 32],
  ];
  for (const f of [
    [2, 27, 14, 40],
    [10, 29, 36, 37],
    [26, 9, 36, 34],
    [28, 7, 60, 15],
    [52, 9, 62, 34],
    [54, 27, 88, 37],
    [16, 20, 27, 24],
    [16, 22, 20, 30],
    [34, 20, 54, 24],
    [60, 12, 76, 17],
    [72, 14, 77, 29],
    [38, 14, 42, 22],
    [40, 22, 46, 32],
    [34, 30, 56, 34],
    [14, 8, 28, 13],
    [14, 10, 18, 22],
    [76, 6, 88, 16],
    [80, 14, 86, 28],
  ] as R4[])
    g.rect(...f, FLOOR);
  const add = (r: R4, v: number, hh: number) => {
    g.rect(...r, v);
    boxes.push([...r, hh]);
  };
  for (const f of [
    [20, 29, 22, 31],
    [34, 17, 36, 19],
    [44, 13, 46, 15],
    [53, 20, 55, 22],
    [66, 34, 68, 37],
    [72, 27, 74, 29],
    [47, 22, 49, 24],
  ] as R4[])
    add(f, WALL, 2);
  for (const f of [
    [24, 36, 26, 37],
    [26, 22, 27, 24],
    [40, 8, 42, 9],
    [60, 26, 61, 28],
    [64, 28, 66, 29],
    [78, 35, 80, 36],
  ] as R4[])
    add(f, LOW, 1);
  placeProps(g, boxes, [[6, 34], [83, 10], [18, 22], [41, 21], [74, 16], [44, 32], ...path]);
  return {
    id: 'meridian',
    name: 'Meridian Line',
    title: 'ow',
    theme: 'harbour',
    kind: 'arena',
    mode: 'escort',
    grid: g,
    spawn: [
      [6, 34],
      [83, 10],
    ],
    point: [12, 33],
    pr: 4.2,
    path,
    packs: [
      [18, 22],
      [41, 21],
      [74, 16],
      [44, 32],
    ],
    boxes,
    routes: [[[[14, 33]]], [[[80, 20]]]],
  };
}
const J1: P[][] = [
  [
    [26, 92],
    [34, 78],
    [30, 64],
    [22, 56],
  ],
  [
    [34, 92],
    [46, 92],
    [56, 84],
    [60, 72],
  ],
  [
    [30, 64],
    [42, 60],
    [50, 54],
  ],
  [
    [56, 84],
    [66, 90],
    [74, 98],
  ],
  [
    [14, 62],
    [26, 60],
    [36, 54],
  ],
  [
    [46, 92],
    [50, 102],
  ],
];
const J2: P[][] = [
  [
    [28, 90],
    [40, 82],
    [44, 70],
    [38, 58],
  ],
  [
    [36, 96],
    [52, 94],
    [62, 86],
    [68, 74],
  ],
  [
    [14, 70],
    [26, 70],
    [44, 70],
  ],
  [
    [62, 86],
    [76, 90],
    [82, 104],
  ],
  [
    [38, 58],
    [24, 48],
    [14, 46],
  ],
  [
    [26, 70],
    [28, 90],
  ],
];
export type GameMap = TacMap | MobaMap | ArenaMap;
export const MAP_META: { id: string; name: string; title: TitleId; theme: Theme }[] = [
  { id: 'kasbah', name: 'Kasbah', title: 'cs2', theme: 'desert' },
  { id: 'foundry', name: 'Foundry', title: 'cs2', theme: 'industry' },
  { id: 'quarry', name: 'Quarry', title: 'cs2', theme: 'terrace' },
  { id: 'halcyon', name: 'Halcyon', title: 'val', theme: 'temple' },
  { id: 'terrace', name: 'Terrace', title: 'val', theme: 'terrace' },
  { id: 'arcade', name: 'Arcade', title: 'val', theme: 'industry' },
  { id: 'oldvale', name: 'The Old Vale', title: 'dota', theme: 'vale' },
  { id: 'ashmere', name: 'Ashmere', title: 'dota', theme: 'ashen' },
  { id: 'solstice', name: 'Solstice', title: 'ow', theme: 'orbital' },
  { id: 'meridian', name: 'Meridian Line', title: 'ow', theme: 'harbour' },
];
const cache = new Map<string, GameMap>();
export function getMap(id: string): GameMap {
  let m = cache.get(id);
  if (m) return m;
  switch (id) {
    case 'kasbah':
      m = buildTac(id, 'Kasbah', 'cs2', 'desert', KASBAH);
      break;
    case 'foundry':
      m = buildTac(id, 'Foundry', 'cs2', 'industry', HALCYON, [[36, 29, 38, 31]], [[37, 26, 39, 28]]);
      break;
    case 'quarry':
      m = buildTac(id, 'Quarry', 'cs2', 'terrace', flipX(KASBAH), [], [[36, 36, 38, 37]]);
      break;
    case 'halcyon':
      m = buildTac(id, 'Halcyon', 'val', 'temple', HALCYON);
      break;
    case 'terrace':
      m = buildTac(id, 'Terrace', 'val', 'terrace', KASBAH, [[36, 34, 38, 36]], [[60, 25, 62, 26]]);
      break;
    case 'arcade':
      m = buildTac(id, 'Arcade', 'val', 'industry', flipX(HALCYON), [[40, 20, 41, 23]], []);
      break;
    case 'oldvale':
      m = buildMoba(id, 'The Old Vale', 'vale', J1);
      break;
    case 'ashmere':
      m = buildMoba(id, 'Ashmere', 'ashen', J2);
      break;
    case 'solstice':
      m = buildControl();
      break;
    case 'meridian':
      m = buildEscort();
      break;
    default:
      throw new Error('unknown map ' + id);
  }
  cache.set(id, m);
  return m;
}
export const mapsFor = (t: TitleId) => MAP_META.filter(m => m.title === t);
export { along, plen };
