import { hyp } from '../core/dmath.ts';
/** Cell codes. FLOOR walkable. WALL blocks movement and sight. LOW blocks movement only (cover). WATER is walkable decoration. */
export const FLOOR = 0,
  WALL = 1,
  LOW = 2,
  TREE = 3;
export class Grid {
  d: Uint8Array;
  constructor(
    public W: number,
    public H: number,
    public cell: number,
    fill = WALL,
  ) {
    this.d = new Uint8Array(W * H).fill(fill);
  }
  get w() {
    return this.W * this.cell;
  }
  get h() {
    return this.H * this.cell;
  }
  at(cx: number, cy: number) {
    return cx < 0 || cy < 0 || cx >= this.W || cy >= this.H ? WALL : this.d[cy * this.W + cx];
  }
  atp(x: number, y: number) {
    return this.at(Math.floor(x / this.cell), Math.floor(y / this.cell));
  }
  walk(x: number, y: number) {
    return this.atp(x, y) === FLOOR;
  }
  rect(x1: number, y1: number, x2: number, y2: number, v: number) {
    for (let y = y1; y < y2; y++)
      for (let x = x1; x < x2; x++) if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.d[y * this.W + x] = v;
  }
  disc(cx: number, cy: number, r: number, v: number) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r && x >= 0 && y >= 0 && x < this.W && y < this.H) this.d[y * this.W + x] = v;
      }
  }
  /** line of sight, grid traversal */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const c = this.cell;
    x0 /= c;
    y0 /= c;
    x1 /= c;
    y1 /= c;
    const dx = x1 - x0,
      dy = y1 - y0;
    let cx = Math.floor(x0),
      cy = Math.floor(y0);
    const ex = Math.floor(x1),
      ey = Math.floor(y1);
    const sx = dx > 0 ? 1 : -1,
      sy = dy > 0 ? 1 : -1,
      ax = dx < 0 ? -dx : dx,
      ay = dy < 0 ? -dy : dy;
    let tx = ax < 1e-9 ? 1e9 : (dx > 0 ? cx + 1 - x0 : x0 - cx) / ax,
      ty = ay < 1e-9 ? 1e9 : (dy > 0 ? cy + 1 - y0 : y0 - cy) / ay;
    const ix = ax < 1e-9 ? 1e9 : 1 / ax,
      iy = ay < 1e-9 ? 1e9 : 1 / ay;
    for (let i = 0; i < 400; i++) {
      const v = this.at(cx, cy);
      if (v === WALL || v === TREE) return false;
      if (cx === ex && cy === ey) return true;
      if (tx < ty) {
        cx += sx;
        tx += ix;
      } else {
        cy += sy;
        ty += iy;
      }
      if (tx > 1.0001 && ty > 1.0001 && (cx !== ex || cy !== ey)) {
        if (Math.min(tx - ix, ty - iy) > 1) return true;
      }
    }
    return false;
  }
  /** Same terrain, private obstacles and scratch space. Maps are cached, so every simulation works on its own copy. */
  fork(): Grid {
    const g = new Grid(this.W, this.H, this.cell);
    g.d = this.d;
    g.statics = this.statics;
    g.obstacles = [...this.statics];
    return g;
  }
  /** Solid round things that belong to the map: barrels, pots, pillars, boulders. */
  statics: { x: number; y: number; r: number; q: number }[] = [];
  /** Solid round obstacles on top of the grid: the statics plus towers or the payload. */
  obstacles: { x: number; y: number; r: number }[] = [];
  /** Distance a circle reaches into anything solid; 0 when free. */
  depth(x: number, y: number, r: number): number {
    const c = this.cell;
    let d = 0;
    for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++)
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        if (this.at(cx, cy) === FLOOR) continue;
        const px = x < cx * c ? cx * c : x > (cx + 1) * c ? (cx + 1) * c : x;
        const py = y < cy * c ? cy * c : y > (cy + 1) * c ? (cy + 1) * c : y;
        const q = hyp(x - px, y - py);
        const k = r - q;
        if (k > d) d = k;
      }
    return d;
  }
  /** Push a circle out of everything solid. Round obstacles first, walls last, so walls always win. */
  push(x: number, y: number, r: number): [number, number] {
    if (!this.walk(x, y)) [x, y] = this.nearestCell(x, y);
    for (const o of this.obstacles) {
      const dx = x - o.x,
        dy = y - o.y,
        m = o.r + r;
      if (dx > m || dx < -m || dy > m || dy < -m) continue;
      const q = hyp(dx, dy),
        k = m - q;
      if (k <= 0) continue;
      const tx = x + (q < 1e-6 ? 1 : dx / q) * k,
        ty = y + (q < 1e-6 ? 0 : dy / q) * k;
      if (this.walk(tx, ty)) {
        x = tx;
        y = ty;
      }
    }
    const c = this.cell;
    for (let it = 0; it < 8; it++) {
      let best = 1e-6,
        nx = 0,
        ny = 0;
      for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++)
        for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
          if (this.at(cx, cy) === FLOOR) continue;
          const px = x < cx * c ? cx * c : x > (cx + 1) * c ? (cx + 1) * c : x;
          const py = y < cy * c ? cy * c : y > (cy + 1) * c ? (cy + 1) * c : y;
          let dx = x - px,
            dy = y - py,
            q = hyp(dx, dy);
          if (r - q <= best) continue;
          best = r - q;
          if (q < 1e-9) {
            // standing exactly on the edge: leave along the axis that points away from the cell
            const mx = x - (cx + 0.5) * c,
              my = y - (cy + 0.5) * c;
            const ax = mx < 0 ? -mx : mx,
              ay = my < 0 ? -my : my;
            dx = ax >= ay ? (mx < 0 ? -1 : 1) : 0;
            dy = ax >= ay ? 0 : my < 0 ? -1 : 1;
            q = 1;
          }
          nx = dx / q;
          ny = dy / q;
        }
      if (best <= 1e-6) break;
      const tx = x + nx * (best + 1e-4),
        ty = y + ny * (best + 1e-4);
      if (!this.walk(tx, ty)) break;
      x = tx;
      y = ty;
    }
    return [x, y];
  }
  /** Dash or knock-back: a straight line that stops at the first thing it touches. */
  charge(x: number, y: number, dx: number, dy: number, r: number): [number, number] {
    const L = hyp(dx, dy);
    if (L < 1e-9) return [x, y];
    const n = Math.ceil(L / 0.2);
    for (let i = 1; i <= n; i++) {
      const tx = x + dx / n,
        ty = y + dy / n;
      if (this.depth(tx, ty, r) > 0.02) break;
      let hit = false;
      for (const o of this.obstacles) if (hyp(tx - o.x, ty - o.y) < o.r + r * 0.8) hit = true;
      if (hit) break;
      x = tx;
      y = ty;
    }
    return this.push(x, y, r);
  }
  /** Move a circle by (dx, dy): swept in small steps, slides along whatever it touches, can never tunnel. */
  slide(x: number, y: number, dx: number, dy: number, r: number): [number, number] {
    const L = hyp(dx, dy);
    if (L < 1e-9) return this.push(x, y, r);
    const n = Math.ceil(L / 0.2);
    const sx = dx / n,
      sy = dy / n;
    for (let i = 0; i < n; i++) {
      let tx = x + sx,
        ty = y + sy;
      if (!this.walk(tx, ty)) {
        if (this.walk(tx, y)) ty = y;
        else if (this.walk(x, ty)) tx = x;
        else break;
      }
      for (const o of this.obstacles) {
        // slip sideways around round obstacles instead of stopping dead against them
        const ox = tx - o.x,
          oy = ty - o.y,
          m0 = o.r + r;
        if (ox > m0 || ox < -m0 || oy > m0 || oy < -m0) continue;
        const q = hyp(ox, oy);
        if (q < o.r + r && q > 1e-6) {
          const cr = ox * sy - oy * sx;
          const s = cr >= 0 ? 1 : -1,
            m = hyp(sx, sy) * 0.8;
          tx += (-oy / q) * s * m;
          ty += (ox / q) * s * m;
          if (!this.walk(tx, ty)) {
            tx = x;
            ty = y;
          }
        }
      }
      [x, y] = this.push(tx, ty, r);
    }
    return [x, y];
  }
  /** Fraction 0..1 of the segment before it meets a full-height wall. */
  ray(x0: number, y0: number, x1: number, y1: number): number {
    const L = hyp(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(L / (this.cell * 0.2)));
    for (let i = 1; i <= n; i++) {
      const v = this.atp(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
      if (v === WALL || v === TREE) return (i - 1) / n;
    }
    return 1;
  }
  /** straight walkable line with body width */
  clear(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0,
      dy = y1 - y0,
      d = hyp(dx, dy);
    if (d < 1e-6) return true;
    const n = Math.ceil(d / 0.3),
      px = (-dy / d) * this.body,
      py = (dx / d) * this.body;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (dx * i) / n,
        y = y0 + (dy * i) / n;
      if (!this.walk(x + px, y + py) || !this.walk(x - px, y - py)) return false;
    }
    return true;
  }
  /** half-width used when straightening paths and choosing standing spots */
  body = 0.43;
  nearestWalk(x: number, y: number): [number, number] {
    return this.push(x, y, this.body);
  }
  private nearestCell(x: number, y: number): [number, number] {
    if (this.walk(x, y)) return [x, y];
    const c = this.cell,
      cx = Math.floor(x / c),
      cy = Math.floor(y / c);
    for (let r = 1; r < 20; r++) {
      let best = 1e9,
        bx = -1,
        by = -1;
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (this.at(cx + ox, cy + oy) === FLOOR) {
            const px = (cx + ox + 0.5) * c,
              py = (cy + oy + 0.5) * c,
              dd = (px - x) * (px - x) + (py - y) * (py - y);
            if (dd < best) {
              best = dd;
              bx = px;
              by = py;
            }
          }
        }
      if (bx >= 0) return [bx, by];
    }
    return [x, y];
  }
  private g?: Float64Array;
  private par?: Int32Array;
  private st?: Int32Array;
  private stamp = 0;
  private heapK?: Float64Array;
  private heapV?: Int32Array;
  /** A* + string pulling. Returns list of points, excluding start. `cost` can add soft penalties per cell. */
  path(x0: number, y0: number, x1: number, y1: number, cost?: Float64Array): [number, number][] {
    const { W, H, cell: c, d } = this,
      N = W * H;
    if (!this.g) {
      this.g = new Float64Array(N);
      this.par = new Int32Array(N);
      this.st = new Int32Array(N);
      this.heapK = new Float64Array(N * 8);
      this.heapV = new Int32Array(N * 8);
    }
    const g = this.g!,
      par = this.par!,
      st = this.st!,
      hk = this.heapK!,
      hv = this.heapV!;
    const S = ++this.stamp;
    [x0, y0] = this.nearestWalk(x0, y0);
    [x1, y1] = this.nearestWalk(x1, y1);
    if (this.clear(x0, y0, x1, y1) && !cost) return [[x1, y1]];
    const s = Math.floor(y0 / c) * W + Math.floor(x0 / c),
      e = Math.floor(y1 / c) * W + Math.floor(x1 / c);
    const ex = e % W,
      ey = (e - ex) / W;
    let n = 0;
    const h = (i: number) => {
      const x = i % W,
        y = (i - x) / W;
      const ax = Math.abs(x - ex),
        ay = Math.abs(y - ey);
      return ax > ay ? ax + 0.414 * ay : ay + 0.414 * ax;
    };
    const push = (k: number, v: number) => {
      let i = n++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= k) break;
        hk[i] = hk[p];
        hv[i] = hv[p];
        i = p;
      }
      hk[i] = k;
      hv[i] = v;
    };
    const pop = () => {
      const r = hv[0];
      n--;
      const k = hk[n],
        v = hv[n];
      let i = 0;
      for (;;) {
        let j = 2 * i + 1;
        if (j >= n) break;
        if (j + 1 < n && hk[j + 1] < hk[j]) j++;
        if (hk[j] >= k) break;
        hk[i] = hk[j];
        hv[i] = hv[j];
        i = j;
      }
      hk[i] = k;
      hv[i] = v;
      return r;
    };
    const closed = -S;
    g[s] = 0;
    st[s] = S;
    par[s] = -1;
    push(h(s), s);
    let found = false;
    while (n > 0) {
      const u = pop();
      if (st[u] === closed) continue;
      if (u === e) {
        found = true;
        break;
      }
      st[u] = closed;
      const ux = u % W,
        uy = (u - ux) / W;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const vx = ux + ox,
            vy = uy + oy;
          if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
          const v = vy * W + vx;
          if (d[v] !== FLOOR || st[v] === closed) continue;
          if (ox && oy && (d[uy * W + vx] !== FLOOR || d[vy * W + ux] !== FLOOR)) continue;
          let near = 0;
          if (
            this.at(vx + 1, vy) !== FLOOR ||
            this.at(vx - 1, vy) !== FLOOR ||
            this.at(vx, vy + 1) !== FLOOR ||
            this.at(vx, vy - 1) !== FLOOR
          )
            near = 0.35;
          const ng = g[u] + (ox && oy ? 1.414 : 1) + near + (cost ? cost[v] : 0);
          if (st[v] !== S || ng < g[v]) {
            g[v] = ng;
            st[v] = S;
            par[v] = u;
            push(ng + h(v), v);
          }
        }
    }
    if (!found) return [[x0, y0]];
    const raw: [number, number][] = [];
    for (let u = e; u !== -1; u = par[u]) {
      const x = u % W;
      raw.push([(x + 0.5) * c, ((u - x) / W + 0.5) * c]);
    }
    raw.reverse();
    raw[raw.length - 1] = [x1, y1];
    const out: [number, number][] = [];
    let ax = x0,
      ay = y0,
      i = 0;
    while (i < raw.length) {
      let j = i;
      const lim = Math.min(raw.length - 1, i + 14);
      for (let k = lim; k > i; k--)
        if (this.clear(ax, ay, raw[k][0], raw[k][1])) {
          j = k;
          break;
        }
      out.push(raw[j]);
      ax = raw[j][0];
      ay = raw[j][1];
      i = j + 1;
    }
    return out;
  }
}
