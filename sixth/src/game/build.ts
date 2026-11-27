/**
 * The house editor's model. A headquarters is land, floor tiles, wall edges and furniture. Rooms are not stored:
 * they are found by flood fill, and what a room is worth follows from what stands in it.
 * Pure and deterministic: the same code runs in the editor, in the career, in the audit and at other managers' machines.
 */
import { FLOORS, FLOOR_BY, FURN, NEEDS, PRICE, WALLS, WALL_BY, type Furn } from '../data/furniture.ts';
import { ROOMS, ROOM_TYPES, SITES, type RoomType } from '../data/club.ts';
import { TITLES, type TitleId } from '../data/titles.ts';
export interface Item {
  id: string;
  f: string;
  /** top-left corner in half-tiles, rotation in quarter turns */
  x: number;
  y: number;
  r: number;
}
export interface Zone {
  id: string;
  x: number;
  y: number;
  type: RoomType;
  title?: TitleId;
}
export interface HQ {
  w: number;
  h: number;
  /** one char per tile, '.' is bare land */
  floor: string;
  /** vertical edges, (w+1) per row: '0' open, '1' wall, 'D' door, 'W' window */
  wv: string;
  /** horizontal edges, w per row, h+1 rows */
  wh: string;
  pv: string;
  ph: string;
  items: Item[];
  zones: Zone[];
}
export interface Room {
  id: string;
  type: RoomType;
  lvl: number;
  title?: TitleId;
  /** centre and bounds in tiles */
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}
export const MIN_W = 10,
  MIN_H = 8;
export const size = (it: { f: string; r: number }): [number, number] => {
  const d = FURN[it.f];
  return it.r % 2 ? [d.d, d.w] : [d.w, d.d];
};
/** local metres -> world metres for an item */
export function toWorld(it: Item, lx: number, lz: number): [number, number] {
  const [w, h] = size(it);
  const cx = (it.x + w / 2) / 2,
    cz = (it.y + h / 2) / 2;
  const c = [1, 0, -1, 0][it.r],
    s = [0, 1, 0, -1][it.r];
  return [cx + lx * c + lz * s, cz - lx * s + lz * c];
}
export const gate = (q: { w: number; h: number }): [number, number] => [Math.floor(q.w / 2), q.h - 1];
// ---------- working copy
export class Draft {
  w: number;
  h: number;
  floor: string[];
  wv: string[];
  wh: string[];
  pv: string[];
  ph: string[];
  items: Item[];
  zones: Zone[];
  constructor(q: HQ) {
    this.w = q.w;
    this.h = q.h;
    this.floor = q.floor.split('');
    this.wv = q.wv.split('');
    this.wh = q.wh.split('');
    this.pv = q.pv.split('');
    this.ph = q.ph.split('');
    this.items = q.items.map(i => ({ ...i }));
    this.zones = q.zones.map(z => ({ ...z }));
  }
  static empty(w: number, h: number) {
    return new Draft({
      w,
      h,
      floor: '.'.repeat(w * h),
      wv: '0'.repeat((w + 1) * h),
      wh: '0'.repeat(w * (h + 1)),
      pv: 'a'.repeat((w + 1) * h),
      ph: 'a'.repeat(w * (h + 1)),
      items: [],
      zones: [],
    });
  }
  hq(): HQ {
    return {
      w: this.w,
      h: this.h,
      floor: this.floor.join(''),
      wv: this.wv.join(''),
      wh: this.wh.join(''),
      pv: this.pv.join(''),
      ph: this.ph.join(''),
      items: this.items.map(i => ({ id: i.id, f: i.f, x: i.x, y: i.y, r: i.r })),
      zones: this.zones.map(z => ({ id: z.id, x: z.x, y: z.y, type: z.type, ...(z.title ? { title: z.title } : {}) })),
    };
  }
  ft(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.floor[y * this.w + x];
  }
  iv(x: number, y: number) {
    return y * (this.w + 1) + x;
  }
  ih(x: number, y: number) {
    return y * this.w + x;
  }
  /** edge to the west of tile (x, y) */
  ev(x: number, y: number) {
    return x < 0 || y < 0 || x > this.w || y >= this.h ? '0' : this.wv[this.iv(x, y)];
  }
  /** edge to the north of tile (x, y) */
  eh(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y > this.h ? '0' : this.wh[this.ih(x, y)];
  }
  setV(x: number, y: number, k: string, p?: string) {
    if (x < 0 || y < 0 || x > this.w || y >= this.h) return;
    this.wv[this.iv(x, y)] = k;
    if (p) this.pv[this.iv(x, y)] = p;
  }
  setH(x: number, y: number, k: string, p?: string) {
    if (x < 0 || y < 0 || x >= this.w || y > this.h) return;
    this.wh[this.ih(x, y)] = k;
    if (p) this.ph[this.ih(x, y)] = p;
  }
  edge(o: 'v' | 'h', x: number, y: number) {
    return o === 'v' ? this.ev(x, y) : this.eh(x, y);
  }
  setE(o: 'v' | 'h', x: number, y: number, k: string, p?: string) {
    if (o === 'v') this.setV(x, y, k, p);
    else this.setH(x, y, k, p);
  }
  uid() {
    let n = 1;
    const used = new Set([...this.items.map(i => i.id), ...this.zones.map(z => z.id)]);
    while (used.has('n' + n)) n++;
    return 'n' + n;
  }
  // ---------- building
  /** plants and lamps in the way of a building are sold, not argued with */
  private weed(hit: (i: Item) => boolean) {
    this.items = this.items.filter(i => !(soft(i) && this.out(i) && hit(i)));
  }
  private out(i: Item) {
    return this.floor[(i.y >> 1) * this.w + (i.x >> 1)] === '.';
  }
  drawRoom(x: number, y: number, w: number, h: number, f: string, p: string): string | null {
    if (w < 2 || h < 2) return 'Rooms are at least 2 by 2';
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return 'Outside your land';
    this.weed(i => rectHit(i, x, y, w, h));
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.floor[j * this.w + i] = f;
    const v = (i: number, j: number) => {
      if (this.ev(i, j) === '0') this.setV(i, j, '1', p);
    };
    const hh = (i: number, j: number) => {
      if (this.eh(i, j) === '0') this.setH(i, j, '1', p);
    };
    for (let j = y; j < y + h; j++) {
      v(x, j);
      v(x + w, j);
    }
    for (let i = x; i < x + w; i++) {
      hh(i, y);
      hh(i, y + h);
    }
    return null;
  }
  wallLine(x1: number, y1: number, x2: number, y2: number, k: '1' | '0', p: string): number {
    let n = 0;
    if (x1 === x2) {
      for (let j = Math.min(y1, y2); j < Math.max(y1, y2); j++)
        if (k === '0' ? this.ev(x1, j) !== '0' : this.ev(x1, j) === '0') {
          this.setV(x1, j, k, p);
          n++;
        }
    } else if (y1 === y2) {
      for (let i = Math.min(x1, x2); i < Math.max(x1, x2); i++)
        if (k === '0' ? this.eh(i, y1) !== '0' : this.eh(i, y1) === '0') {
          this.setH(i, y1, k, p);
          n++;
        }
    }
    return n;
  }
  fill(x: number, y: number, w: number, h: number, f: string): string | null {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        if (f === '.' && this.items.some(it => !FURN[it.f].out && covers(it, i, j))) return 'Move the furniture first';
        this.floor[j * this.w + i] = f;
      }
    return null;
  }
  regions(): Regions {
    return regions(this);
  }
  /** paint every wall around a region */
  paintRegion(id: number, p: string, R = this.regions()) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (R.map[y * this.w + x] !== id) continue;
        if (this.ev(x, y) !== '0') this.pv[this.iv(x, y)] = p;
        if (this.ev(x + 1, y) !== '0') this.pv[this.iv(x + 1, y)] = p;
        if (this.eh(x, y) !== '0') this.ph[this.ih(x, y)] = p;
        if (this.eh(x, y + 1) !== '0') this.ph[this.ih(x, y + 1)] = p;
      }
  }
  floorRegion(id: number, f: string, R = this.regions()) {
    for (let i = 0; i < this.floor.length; i++) if (R.map[i] === id) this.floor[i] = f;
  }
  itemsIn(id: number, R = this.regions()) {
    return this.items.filter(it => regionOf(this, it, R) === id);
  }
  removeRegion(id: number) {
    const R = this.regions();
    const gone = new Set(this.itemsIn(id, R).map(i => i.id));
    this.items = this.items.filter(i => !gone.has(i.id));
    this.zones = this.zones.filter(z => R.map[z.y * this.w + z.x] !== id);
    const other = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && R.map[y * this.w + x] >= 0 && R.map[y * this.w + x] !== id;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (R.map[y * this.w + x] !== id) continue;
        if (!other(x - 1, y)) this.setV(x, y, '0');
        if (!other(x + 1, y)) this.setV(x + 1, y, '0');
        if (!other(x, y - 1)) this.setH(x, y, '0');
        if (!other(x, y + 1)) this.setH(x, y + 1, '0');
        this.floor[y * this.w + x] = '.';
      }
    this.dropLooseWallItems();
  }
  dropLooseWallItems() {
    this.items = this.items.filter(it => !FURN[it.f].wall || backed(this, it));
  }
  /** pick a room up with everything in it */
  moveRegion(id: number, dx: number, dy: number): string | null {
    const R = this.regions();
    const tiles: [number, number, string][] = [];
    const eV: [number, number, string, string][] = [],
      eH: [number, number, string, string][] = [];
    const other = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && R.map[y * this.w + x] >= 0 && R.map[y * this.w + x] !== id;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (R.map[y * this.w + x] !== id) continue;
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return 'Outside your land';
        if (other(nx, ny)) return 'Another room is in the way';
        tiles.push([nx, ny, this.ft(x, y)]);
        for (const ex of [x, x + 1]) {
          const k = this.ev(ex, y);
          if (k !== '0' || R.map[y * this.w + ex - (ex === x ? 1 : 0)] !== id)
            eV.push([ex + dx, y + dy, k === '0' ? '0' : k, this.pv[this.iv(ex, y)]]);
        }
        for (const ey of [y, y + 1]) {
          const k = this.eh(x, ey);
          if (k !== '0') eH.push([x + dx, ey + dy, k, this.ph[this.ih(x, ey)]]);
        }
      }
    const its = new Set(this.itemsIn(id, R).map(i => i.id));
    const zs = this.zones.filter(z => R.map[z.y * this.w + z.x] === id);
    const keep = this.items.filter(i => its.has(i.id));
    const others = this.items.filter(i => !its.has(i.id));
    this.removeRegionShell(id, R);
    for (const [x, y, f] of tiles) this.floor[y * this.w + x] = f;
    for (const [x, y, k, p] of eV) if (k !== '0') this.setV(x, y, this.ev(x, y) === 'D' ? 'D' : k, p);
    for (const [x, y, k, p] of eH) this.setH(x, y, this.eh(x, y) === 'D' ? 'D' : k, p);
    for (const i of keep) {
      i.x += dx * 2;
      i.y += dy * 2;
    }
    for (const z of zs) {
      z.x += dx;
      z.y += dy;
    }
    const rest = others.filter(o => !(soft(o) && tiles.some(([x, y]) => rectHit(o, x, y, 1, 1))));
    const clash = rest.some(o => !FURN[o.f].wall && !FURN[o.f].flat && keep.some(k => !FURN[k.f].wall && !FURN[k.f].flat && overlap(o, k)));
    if (clash) return 'Something in the garden is in the way';
    this.items = [...rest, ...keep];
    this.dropLooseWallItems();
    return null;
  }
  private removeRegionShell(id: number, R: Regions) {
    const other = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && R.map[y * this.w + x] >= 0 && R.map[y * this.w + x] !== id;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (R.map[y * this.w + x] !== id) continue;
        if (!other(x - 1, y)) this.setV(x, y, '0');
        if (!other(x + 1, y)) this.setV(x + 1, y, '0');
        if (!other(x, y - 1)) this.setH(x, y, '0');
        if (!other(x, y + 1)) this.setH(x, y + 1, '0');
        this.floor[y * this.w + x] = '.';
      }
  }
  /** pull or push one side of a rectangular room by n tiles */
  stretch(id: number, side: 'n' | 'e' | 's' | 'w', n: number): string | null {
    const R = this.regions();
    const g = R.list[id];
    if (!g) return 'No room there';
    if (g.area !== g.w * g.h) return 'Only rectangular rooms can be stretched';
    const { x, y, w, h } = g;
    const f = this.ft(x, y);
    const grow = n > 0;
    const k = Math.abs(n);
    if (!grow && (side === 'e' || side === 'w' ? w : h) - k < 2) return 'Too small';
    const strip =
      side === 'e'
        ? [grow ? x + w : x + w - k, y, k, h]
        : side === 'w'
          ? [grow ? x - k : x, y, k, h]
          : side === 's'
            ? [x, grow ? y + h : y + h - k, w, k]
            : [x, grow ? y - k : y, w, k];
    const [sx, sy, sw, sh] = strip;
    if (grow) {
      if (sx < 0 || sy < 0 || sx + sw > this.w || sy + sh > this.h) return 'Outside your land';
      for (let j = sy; j < sy + sh; j++)
        for (let i = sx; i < sx + sw; i++) if (R.map[j * this.w + i] >= 0) return 'Another room is in the way';
      this.weed(it => rectHit(it, sx, sy, sw, sh));
      if (this.items.some(it => !FURN[it.f].wall && rectHit(it, sx, sy, sw, sh))) return 'Something in the garden is in the way';
    } else if (this.items.some(it => !FURN[it.f].wall && regionOf(this, it, R) === id && rectHit(it, sx, sy, sw, sh)))
      return 'Furniture is in the way';
    // the wall on that side travels with the edge, doors and windows included
    const old: [number, string, string][] = [];
    const vertical = side === 'e' || side === 'w';
    const line = side === 'e' ? x + w : side === 'w' ? x : side === 's' ? y + h : y;
    const to = line + (side === 'e' || side === 's' ? n : -n);
    const other = (i: number, j: number) =>
      i >= 0 && j >= 0 && i < this.w && j < this.h && R.map[j * this.w + i] >= 0 && R.map[j * this.w + i] !== id;
    const wallMounted = this.items.filter(it => FURN[it.f].wall && regionOf(this, it, R) === id && onSide(it, side, g));
    if (vertical)
      for (let j = y; j < y + h; j++) {
        old.push([j, this.ev(line, j), this.pv[this.iv(line, j)]]);
        if (!other(side === 'e' ? line : line - 1, j)) this.setV(line, j, '0');
      }
    else
      for (let i = x; i < x + w; i++) {
        old.push([i, this.eh(i, line), this.ph[this.ih(i, line)]]);
        if (!other(i, side === 's' ? line : line - 1)) this.setH(i, line, '0');
      }
    for (let j = sy; j < sy + sh; j++)
      for (let i = sx; i < sx + sw; i++) {
        this.floor[j * this.w + i] = grow ? f : '.';
        if (!grow) {
          if (vertical) {
            if (j === y && !other(i, j - 1)) this.setH(i, j, '0');
            if (j === y + h - 1 && !other(i, j + 1)) this.setH(i, j + 1, '0');
          } else {
            if (i === x && !other(i - 1, j)) this.setV(i, j, '0');
            if (i === x + w - 1 && !other(i + 1, j)) this.setV(i + 1, j, '0');
          }
        }
      }
    for (const [q, kk, p] of old) {
      if (vertical) this.setV(to, q, kk === '0' ? '1' : kk, p);
      else this.setH(q, to, kk === '0' ? '1' : kk, p);
    }
    if (grow) {
      const p = old[0]?.[2] ?? 'a';
      if (vertical)
        for (let i = sx; i < sx + sw; i++) {
          if (this.eh(i, y) === '0') this.setH(i, y, '1', p);
          if (this.eh(i, y + h) === '0') this.setH(i, y + h, '1', p);
        }
      else
        for (let j = sy; j < sy + sh; j++) {
          if (this.ev(x, j) === '0') this.setV(x, j, '1', p);
          if (this.ev(x + w, j) === '0') this.setV(x + w, j, '1', p);
        }
    }
    const d = (side === 'e' || side === 's' ? n : -n) * 2;
    for (const it of wallMounted) {
      if (vertical) it.x += d;
      else it.y += d;
    }
    for (const z of this.zones)
      if (R.map[z.y * R.w + z.x] === id) {
        z.x = Math.max(side === 'w' ? to : x, Math.min(z.x, (side === 'e' ? to : x + w) - 1));
        z.y = Math.max(side === 'n' ? to : y, Math.min(z.y, (side === 's' ? to : y + h) - 1));
      }
    this.dropLooseWallItems();
    return null;
  }
  /** buy or give back a strip of land */
  land(side: 'n' | 'e' | 's' | 'w', n: number): string | null {
    const hor = side === 'e' || side === 'w';
    const nw = this.w + (hor ? n : 0),
      nh = this.h + (hor ? 0 : n);
    if (nw < MIN_W || nh < MIN_H) return 'That is as small as it gets';
    if (n < 0) {
      const k = -n;
      const [sx, sy, sw, sh] =
        side === 'e'
          ? [this.w - k, 0, k, this.h]
          : side === 'w'
            ? [0, 0, k, this.h]
            : side === 's'
              ? [0, this.h - k, this.w, k]
              : [0, 0, this.w, k];
      for (let j = sy; j < sy + sh; j++)
        for (let i = sx; i < sx + sw; i++) if (this.ft(i, j) !== '.') return 'There is a building on that strip';
      if (this.items.some(it => rectHit(it, sx, sy, sw, sh))) return 'Clear the strip first';
    }
    const ox = side === 'w' ? n : 0,
      oy = side === 'n' ? n : 0;
    const o = new Draft(this.hq());
    const e = Draft.empty(nw, nh);
    for (let y = 0; y < nh; y++)
      for (let x = 0; x <= nw; x++) {
        const a = x - ox,
          b = y - oy;
        if (x < nw) e.floor[y * nw + x] = o.ft(a, b);
        if (a >= 0 && b >= 0 && a <= o.w && b < o.h) {
          e.wv[e.iv(x, y)] = o.wv[o.iv(a, b)];
          e.pv[e.iv(x, y)] = o.pv[o.iv(a, b)];
        }
      }
    for (let y = 0; y <= nh; y++)
      for (let x = 0; x < nw; x++) {
        const a = x - ox,
          b = y - oy;
        if (a >= 0 && b >= 0 && a < o.w && b <= o.h) {
          e.wh[e.ih(x, y)] = o.wh[o.ih(a, b)];
          e.ph[e.ih(x, y)] = o.ph[o.ih(a, b)];
        }
      }
    this.w = nw;
    this.h = nh;
    this.floor = e.floor;
    this.wv = e.wv;
    this.wh = e.wh;
    this.pv = e.pv;
    this.ph = e.ph;
    for (const i of this.items) {
      i.x += ox * 2;
      i.y += oy * 2;
    }
    for (const z of this.zones) {
      z.x += ox;
      z.y += oy;
    }
    return null;
  }
  canPlace(it: Item, ignore?: string): string | null {
    return itemError(this, it, ignore);
  }
  /** stamp a ready-made room */
  preset(
    type: RoomType,
    lvl: number,
    x: number,
    y: number,
    title?: TitleId,
    flip = false,
    extraW = 0,
    extraH = 0,
    door = true,
  ): string | null {
    const t = template(type, lvl);
    const w = t.w + extraW,
      h = t.h + extraH;
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return 'Outside your land';
    const R = this.regions();
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (R.map[j * this.w + i] >= 0 && this.zones.some(z => R.map[z.y * this.w + z.x] === R.map[j * this.w + i]))
          return 'Another room is in the way';
    this.weed(it => rectHit(it, x, y, w, h));
    if (this.items.some(it => rectHit(it, x, y, w, h) && !FURN[it.f].wall)) return 'Furniture is in the way';
    const e = this.drawRoom(x, y, w, h, t.f, t.p);
    if (e) return e;
    // interior must be one open space
    for (let j = y; j < y + h; j++) for (let i = x + 1; i < x + w; i++) if (this.ev(i, j) !== '0') this.setV(i, j, '0');
    for (let j = y + 1; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.eh(i, j) !== '0') this.setH(i, j, '0');
    const W = w * 2,
      H = h * 2;
    for (const [f, ix, iy, r] of t.items) {
      const it: Item = { id: this.uid(), f, x: ix, y: iy, r };
      const [iw, ih] = size(it);
      // keep things against the walls they were drawn against when the room is larger than its plan
      if (ix + iw >= t.w * 2 - 1 && extraW) it.x += extraW * 2;
      if (FURN[f].wall && r === 2 && extraH) it.y += extraH * 2;
      if (flip) {
        it.x = W - it.x - iw;
        it.y = H - it.y - ih;
        it.r = (it.r + 2) % 4;
      }
      it.x += x * 2;
      it.y += y * 2;
      this.items.push(it);
    }
    if (door) {
      const dx = x + Math.floor(w / 2);
      this.setH(dx, flip ? y : y + h, 'D');
    }
    this.zones.push({ id: this.uid(), x: x + Math.floor(w / 2), y: y + Math.floor(h / 2), type, ...(title ? { title } : {}) });
    return null;
  }
}
const covers = (it: Item, tx: number, ty: number) => rectHit(it, tx, ty, 1, 1);
/** cheap things that grow, and the lamps between them */
const soft = (i: Item) => ['tree', 'hedge', 'flowers', 'plant', 'palm', 'lamppost'].includes(i.f);
export function rectHit(it: Item, x: number, y: number, w: number, h: number) {
  const [iw, ih] = size(it);
  return it.x < (x + w) * 2 && it.x + iw > x * 2 && it.y < (y + h) * 2 && it.y + ih > y * 2;
}
export function overlap(a: Item, b: Item) {
  const [aw, ah] = size(a),
    [bw, bh] = size(b);
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}
function onSide(it: Item, side: string, g: { x: number; y: number; w: number; h: number }) {
  const [w, h] = size(it);
  return side === 'n'
    ? it.y === g.y * 2 && it.r === 0
    : side === 's'
      ? it.y + h === (g.y + g.h) * 2 && it.r === 2
      : side === 'w'
        ? it.x === g.x * 2 && it.r === 1
        : it.x + w === (g.x + g.w) * 2 && it.r === 3;
}
/** the (first) wall edge behind a hanging item */
export function backedEdge(it: Item): ['v' | 'h', number, number] {
  const [w, h] = size(it);
  if (it.r === 0) return ['h', Math.floor(it.x / 2), Math.floor(it.y / 2)];
  if (it.r === 2) return ['h', Math.floor(it.x / 2), Math.floor((it.y + h) / 2)];
  if (it.r === 1) return ['v', Math.floor(it.x / 2), Math.floor(it.y / 2)];
  return ['v', Math.floor((it.x + w) / 2), Math.floor(it.y / 2)];
}
/** is a wall item's back really against plain wall, all along? */
export function backed(d: Draft, it: Item): boolean {
  const [w, h] = size(it);
  if (it.r === 0) {
    if (it.y % 2) return false;
    for (let x = it.x; x < it.x + w; x++) if (d.eh(Math.floor(x / 2), it.y / 2) !== '1') return false;
  } else if (it.r === 2) {
    if ((it.y + h) % 2) return false;
    for (let x = it.x; x < it.x + w; x++) if (d.eh(Math.floor(x / 2), (it.y + h) / 2) !== '1') return false;
  } else if (it.r === 1) {
    if (it.x % 2) return false;
    for (let y = it.y; y < it.y + h; y++) if (d.ev(it.x / 2, Math.floor(y / 2)) !== '1') return false;
  } else {
    if ((it.x + w) % 2) return false;
    for (let y = it.y; y < it.y + h; y++) if (d.ev((it.x + w) / 2, Math.floor(y / 2)) !== '1') return false;
  }
  return true;
}
export function itemError(d: Draft, it: Item, ignore?: string): string | null {
  const def = FURN[it.f];
  if (!def) return 'Unknown item';
  const [w, h] = size(it);
  if (it.x < 0 || it.y < 0 || it.x + w > d.w * 2 || it.y + h > d.h * 2) return 'Outside your land';
  const x0 = Math.floor(it.x / 2),
    y0 = Math.floor(it.y / 2),
    x1 = Math.ceil((it.x + w) / 2),
    y1 = Math.ceil((it.y + h) / 2);
  if (!def.out) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d.ft(x, y) === '.') return 'Needs a floor';
  // no wall may run through it
  for (let y = y0; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) if (x * 2 > it.x && x * 2 < it.x + w && d.ev(x, y) !== '0') return 'A wall is in the way';
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0; x < x1; x++) if (y * 2 > it.y && y * 2 < it.y + h && d.eh(x, y) !== '0') return 'A wall is in the way';
  if (def.wall && !backed(d, it)) return 'Needs a plain wall behind it';
  const layer = (x: Furn) => (x.wall ? 'w' : x.flat ? 'f' : 's');
  for (const o of d.items) {
    if (o.id === it.id || o.id === ignore) continue;
    if (layer(FURN[o.f]) === layer(def) && layer(def) !== 'f' && overlap(o, it)) return `${FURN[o.f].name} is in the way`;
  }
  return null;
}
// ---------- regions
export interface Region {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  enclosed: boolean;
  reach: boolean;
}
export interface Regions {
  map: Int16Array;
  list: Region[];
  w: number;
  /** half-cells a person can get to from the gate */
  free: Uint8Array;
}
export function regions(d: Draft): Regions {
  const { w, h } = d;
  const map = new Int16Array(w * h).fill(-1);
  const list: Region[] = [];
  const st: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (map[s] !== -1 || d.floor[s] === '.') continue;
    const g: Region = { id: list.length, x: 1e9, y: 1e9, w: 0, h: 0, area: 0, enclosed: true, reach: false };
    let mx = -1,
      my = -1;
    map[s] = g.id;
    st.push(s);
    while (st.length) {
      const i = st.pop()!;
      const x = i % w,
        y = (i - x) / w;
      g.area++;
      if (x < g.x) g.x = x;
      if (y < g.y) g.y = y;
      if (x > mx) mx = x;
      if (y > my) my = y;
      const go = (nx: number, ny: number, e: string) => {
        if (e !== '0') return;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || d.floor[ny * w + nx] === '.') {
          g.enclosed = false;
          return;
        }
        const j = ny * w + nx;
        if (map[j] === -1) {
          map[j] = g.id;
          st.push(j);
        }
      };
      go(x - 1, y, d.ev(x, y));
      go(x + 1, y, d.ev(x + 1, y));
      go(x, y - 1, d.eh(x, y));
      go(x, y + 1, d.eh(x, y + 1));
    }
    g.w = mx - g.x + 1;
    g.h = my - g.y + 1;
    list.push(g);
  }
  // who can be reached on foot
  const W = w * 2,
    H = h * 2;
  const solid = new Uint8Array(W * H);
  for (const it of d.items) {
    const f = FURN[it.f];
    if (!f || f.wall || f.flat) continue;
    const [iw, ih] = size(it);
    for (let y = Math.max(0, it.y); y < Math.min(H, it.y + ih); y++)
      for (let x = Math.max(0, it.x); x < Math.min(W, it.x + iw); x++) solid[y * W + x] = 1;
  }
  const free = new Uint8Array(W * H);
  const q: number[] = [];
  // any free strip along the south edge of the land counts as the street
  for (let x = 0; x < W; x++) {
    const i = (H - 1) * W + x;
    const e = d.eh(Math.floor(x / 2), h);
    if (!solid[i] && (e === '0' || e === 'D')) {
      free[i] = 1;
      q.push(i);
    }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k],
      x = i % W,
      y = (i - x) / W;
    const tx = x >> 1,
      ty = y >> 1;
    const go = (nx: number, ny: number, e: string) => {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || (e !== '0' && e !== 'D')) return;
      const j = ny * W + nx;
      if (solid[j] || free[j]) return;
      free[j] = 1;
      q.push(j);
    };
    go(x - 1, y, x % 2 ? '0' : d.ev(tx, ty));
    go(x + 1, y, x % 2 ? d.ev(tx + 1, ty) : '0');
    go(x, y - 1, y % 2 ? '0' : d.eh(tx, ty));
    go(x, y + 1, y % 2 ? d.eh(tx, ty + 1) : '0');
  }
  for (let i = 0; i < free.length; i++)
    if (free[i]) {
      const x = (i % W) >> 1,
        y = Math.floor(i / W) >> 1;
      const r = map[y * w + x];
      if (r >= 0) list[r].reach = true;
    }
  return { map, list, w, free };
}
export function regionOf(d: Draft, it: Item, R: Regions): number {
  const [w, h] = size(it);
  const x = Math.min(d.w - 1, Math.floor((it.x + (w - 1) / 2) / 2)),
    y = Math.min(d.h - 1, Math.floor((it.y + (h - 1) / 2) / 2));
  return R.map[y * d.w + x];
}
/** can somebody stand next to it? */
export function reachable(d: Draft, it: Item, R: Regions): boolean {
  if (FURN[it.f].wall) return true;
  const W = d.w * 2,
    H = d.h * 2;
  const [w, h] = size(it);
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && R.free[y * W + x] === 1;
  if (FURN[it.f].flat) {
    for (let y = it.y; y < it.y + h; y++) for (let x = it.x; x < it.x + w; x++) if (ok(x, y)) return true;
    return false;
  }
  const edgeV = (x: number, y: number) => d.ev(x / 2, y >> 1),
    edgeH = (x: number, y: number) => d.eh(x >> 1, y / 2);
  const open = (e: string) => e === '0' || e === 'D';
  for (let y = it.y; y < it.y + h; y++) {
    if (ok(it.x - 1, y) && (it.x % 2 !== 0 || open(edgeV(it.x, y)))) return true;
    if (ok(it.x + w, y) && ((it.x + w) % 2 !== 0 || open(edgeV(it.x + w, y)))) return true;
  }
  for (let x = it.x; x < it.x + w; x++) {
    if (ok(x, it.y - 1) && (it.y % 2 !== 0 || open(edgeH(x, it.y)))) return true;
    if (ok(x, it.y + h) && ((it.y + h) % 2 !== 0 || open(edgeH(x, it.y + h)))) return true;
  }
  return false;
}
export interface RoomStatus {
  zone: Zone;
  region: Region | null;
  lvl: number;
  points: number;
  problems: string[];
  have: Record<string, number>;
  next: number;
}
export function status(d: Draft, R = regions(d)): RoomStatus[] {
  const out: RoomStatus[] = [];
  const taken = new Set<number>();
  const byRegion = new Map<number, Item[]>();
  for (const it of d.items) {
    const r = regionOf(d, it, R);
    if (r < 0) continue;
    (byRegion.get(r) ?? byRegion.set(r, []).get(r)!).push(it);
  }
  for (const z of d.zones) {
    const rid = z.x >= 0 && z.y >= 0 && z.x < d.w && z.y < d.h ? R.map[z.y * d.w + z.x] : -1;
    const g = rid >= 0 ? R.list[rid] : null;
    const need = NEEDS[z.type];
    const s: RoomStatus = { zone: z, region: g, lvl: 0, points: 0, problems: [], have: {}, next: need.p2 };
    out.push(s);
    if (!g) {
      s.problems.push('No floor here any more');
      continue;
    }
    if (taken.has(rid)) {
      s.problems.push('This space already has a purpose');
      continue;
    }
    taken.add(rid);
    if (!g.enclosed) s.problems.push('Needs walls all the way round');
    if (!g.reach) s.problems.push('Nobody can get in: it needs a door');
    if (g.area < need.area) s.problems.push(`Too small: ${g.area} of ${need.area} tiles`);
    const seen: Record<string, number> = {};
    let pts = Math.min(2, Math.floor((g.area - need.area) / 8) * 0.5);
    if (pts < 0) pts = 0;
    let paint = 0,
      fine = 0;
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        if (R.map[y * d.w + x] !== rid) continue;
        if ((FLOOR_BY[d.ft(x, y)]?.price ?? 0) >= 55) fine++;
        if (d.eh(x, y) !== '0' && d.ph[d.ih(x, y)] !== 'a') paint++;
      }
    if (fine > g.area * 0.7) pts += 0.5;
    if (paint > g.w * 0.6) pts += 0.5;
    for (const it of byRegion.get(rid) ?? []) {
      const f = FURN[it.f];
      if (!reachable(d, it, R)) continue;
      for (const k of f.is ?? []) s.have[k] = (s.have[k] ?? 0) + 1;
      const p = f.pts?.[z.type] ?? f.pts?.['*'] ?? 0;
      if (p) {
        const n = (seen[it.f] = (seen[it.f] ?? 0) + 1);
        pts += n <= 3 ? p : p * 0.25;
      }
    }
    for (const [k, n, name] of need.need)
      if ((s.have[k] ?? 0) < n) s.problems.push(n > 1 ? `${name}: ${s.have[k] ?? 0} of ${n}` : `Missing: ${name.toLowerCase()}`);
    s.points = Math.round(pts * 100) / 100;
    if (!s.problems.length) s.lvl = s.points >= need.p3 ? 3 : s.points >= need.p2 ? 2 : 1;
    s.next = s.lvl >= 2 ? need.p3 : need.p2;
  }
  return out;
}
/** rooms that work, best first, so lookups find the best one */
export function roomsOf(q: HQ): Room[] {
  const d = new Draft(q);
  return status(d)
    .filter(s => s.lvl > 0 && s.region)
    .map(s => ({
      id: s.zone.id,
      type: s.zone.type,
      lvl: s.lvl,
      ...(s.zone.title ? { title: s.zone.title } : {}),
      x: s.region!.x,
      y: s.region!.y,
      w: s.region!.w,
      h: s.region!.h,
      area: s.region!.area,
    }))
    .sort((a, b) => b.lvl - a.lvl || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
// ---------- money
/** what it costs to turn one layout into the other; negative means money back */
export function diffCost(a: HQ, b: HQ, site: number): { cost: number; parts: [string, number][] } {
  const A = new Draft(a),
    B = new Draft(b);
  // align: land bought to the west or north shifts everything, so find the offset that keeps most of the building
  const [ox, oy] = align(A, B);
  let land = 0,
    floors = 0,
    walls = 0,
    furn = 0;
  // only land beyond what the site came with has a price
  const base = SITES[site].w * SITES[site].h;
  const dl = Math.max(0, B.w * B.h - base) - Math.max(0, A.w * A.h - base);
  land += dl > 0 ? dl * SITES[site].land : dl * SITES[site].land * 0.5;
  const x0 = Math.min(0, ox),
    y0 = Math.min(0, oy),
    x1 = Math.max(A.w + ox, B.w),
    y1 = Math.max(A.h + oy, B.h);
  const ep = (k: string) => (k === '0' ? 0 : k === 'D' ? PRICE.wall + PRICE.door : k === 'W' ? PRICE.wall + PRICE.window : PRICE.wall);
  const edge = (k0: string, p0: string, k1: string, p1: string) => {
    if (k0 === k1) return k1 !== '0' && p0 !== p1 ? (WALL_BY[p1]?.price ?? 0) : 0;
    const c0 = ep(k0),
      c1 = ep(k1);
    if (k0 === '0') return c1 + (WALL_BY[p1]?.price ?? 0);
    if (k1 === '0') return -Math.round(c0 * 0.4);
    return (c1 > c0 ? c1 - c0 : -Math.round((c0 - c1) * 0.4)) + (p0 !== p1 ? (WALL_BY[p1]?.price ?? 0) : 0);
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const f0 = A.ft(x - ox, y - oy),
        f1 = B.ft(x, y);
      if (f0 !== f1) floors += (f1 === '.' ? 0 : FLOOR_BY[f1].price) - (f0 === '.' ? 0 : Math.round(FLOOR_BY[f0].price * 0.3));
      const ax = x - ox,
        ay = y - oy;
      const inAV = ax >= 0 && ay >= 0 && ax <= A.w && ay < A.h,
        inBV = x >= 0 && y >= 0 && x <= B.w && y < B.h;
      walls += edge(
        inAV ? A.wv[A.iv(ax, ay)] : '0',
        inAV ? A.pv[A.iv(ax, ay)] : 'a',
        inBV ? B.wv[B.iv(x, y)] : '0',
        inBV ? B.pv[B.iv(x, y)] : 'a',
      );
      const inAH = ax >= 0 && ay >= 0 && ax < A.w && ay <= A.h,
        inBH = x >= 0 && y >= 0 && x < B.w && y <= B.h;
      walls += edge(
        inAH ? A.wh[A.ih(ax, ay)] : '0',
        inAH ? A.ph[A.ih(ax, ay)] : 'a',
        inBH ? B.wh[B.ih(x, y)] : '0',
        inBH ? B.ph[B.ih(x, y)] : 'a',
      );
    }
  const had = new Map(A.items.map(i => [i.id, i]));
  for (const i of B.items) {
    const o = had.get(i.id);
    if (o && o.f === i.f) had.delete(i.id);
    else furn += FURN[i.f].price;
  }
  for (const o of had.values()) furn -= Math.round(FURN[o.f].price * 0.6);
  const parts: [string, number][] = (
    [
      ['Land', Math.round(land)],
      ['Floors', Math.round(floors)],
      ['Walls, doors and windows', Math.round(walls)],
      ['Furniture', Math.round(furn)],
    ] as [string, number][]
  ).filter(x => x[1] !== 0);
  return { cost: parts.reduce((s, x) => s + x[1], 0), parts };
}
function align(A: Draft, B: Draft): [number, number] {
  const dx = B.w - A.w,
    dy = B.h - A.h;
  let best: [number, number] = [0, 0],
    bs = -1;
  const span = (n: number) => Array.from({ length: Math.abs(n) + 1 }, (_, i) => (n < 0 ? -i : i));
  for (const ox of span(dx))
    for (const oy of span(dy)) {
      let s = 0;
      for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) if (A.ft(x, y) !== '.' && A.ft(x, y) === B.ft(x + ox, y + oy)) s++;
      if (s > bs) {
        bs = s;
        best = [ox, oy];
      }
    }
  return best;
}
// ---------- validation: a layout coming from the editor is data, never trusted
export function validate(q: any, site: number, titles: TitleId[]): string | null {
  const S = SITES[site];
  const int = (v: any, a: number, b: number) => Number.isInteger(v) && v >= a && v <= b;
  if (!q || !int(q.w, MIN_W, S.mw) || !int(q.h, MIN_H, S.mh)) return 'The land is the wrong size';
  const str = (s: any, n: number, ok: RegExp) => typeof s === 'string' && s.length === n && ok.test(s);
  const fl = new RegExp('^[.' + FLOORS.map(f => f.k).join('') + ']+$'),
    wl = new RegExp('^[' + WALLS.map(f => f.k).join('') + ']+$');
  if (
    !str(q.floor, q.w * q.h, fl) ||
    !str(q.wv, (q.w + 1) * q.h, /^[01DW]+$/) ||
    !str(q.wh, q.w * (q.h + 1), /^[01DW]+$/) ||
    !str(q.pv, (q.w + 1) * q.h, wl) ||
    !str(q.ph, q.w * (q.h + 1), wl)
  )
    return 'The plan is damaged';
  if (!Array.isArray(q.items) || q.items.length > 600 || !Array.isArray(q.zones) || q.zones.length > 60) return 'Too many things';
  const ids = new Set<string>();
  for (const i of q.items) {
    if (
      !i ||
      typeof i.id !== 'string' ||
      i.id.length > 12 ||
      ids.has(i.id) ||
      !FURN[i.f] ||
      !int(i.x, 0, 200) ||
      !int(i.y, 0, 200) ||
      !int(i.r, 0, 3)
    )
      return 'Unknown furniture';
    ids.add(i.id);
  }
  for (const z of q.zones) {
    if (
      !z ||
      typeof z.id !== 'string' ||
      z.id.length > 12 ||
      ids.has(z.id) ||
      !int(z.x, 0, q.w - 1) ||
      !int(z.y, 0, q.h - 1) ||
      !ROOM_TYPES.includes(z.type)
    )
      return 'Unknown room';
    if (z.type === 'practice' ? !titles.includes(z.title) : z.title !== undefined) return 'Practice rooms belong to a squad';
    ids.add(z.id);
  }
  const d = new Draft(q);
  for (const it of d.items) {
    const e = itemError(d, it);
    if (e) return `${FURN[it.f].name}: ${e.toLowerCase()}`;
  }
  return null;
}
// ---------- ready-made rooms
type T = { w: number; h: number; f: string; p: string; items: [string, number, number, number][] };
const TEMPL: Record<RoomType, (l: number) => T> = {
  practice: l => ({
    w: 9,
    h: 6,
    f: 'd',
    p: l >= 3 ? 'e' : 'a',
    items: [
      ...[1, 4, 7, 10, 13].map(x => ['station', x, 0, 0] as [string, number, number, number]),
      ['cooler', 0, 9, 0],
      ['plant', 0, 8, 0],
      ['bin', 16, 1, 0],
      ...(l >= 2
        ? ([
            ['wallscreen', 6, 0, 0],
            ['coachdesk', 13, 7, 0],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['acoustic', 0, 2, 1],
            ['acoustic', 17, 2, 3],
            ['neon', 13, 0, 0],
            ['minifridge', 2, 10, 2],
            ['ledstrip', 0, 0, 0],
          ] as T['items'])
        : []),
    ],
  }),
  strategy: l => ({
    w: 8,
    h: 6,
    f: 'b',
    p: 'a',
    items: [
      ['meet6', 1, 3, 0],
      ['wallscreen', 3, 0, 0],
      ['coachdesk', 12, 7, 0],
      ...(l >= 2 ? ([['whiteboard', 0, 4, 1]] as T['items']) : []),
      ...(l >= 3
        ? ([
            ['bookcase', 12, 0, 0],
            ['clock', 10, 0, 0],
            ['plant', 0, 11, 0],
            ['plant', 15, 6, 0],
            ['printer', 14, 3, 3],
          ] as T['items'])
        : []),
    ],
  }),
  gym: l => ({
    w: 7,
    h: 6,
    f: 'k',
    p: 'a',
    items: [
      ['treadmill', 1, 0, 0],
      ['bench', 7, 0, 0],
      ...(l >= 2
        ? ([
            ['treadmill', 4, 0, 0],
            ['dumbbells', 13, 3, 3],
            ['cooler', 12, 9, 3],
            ['mat', 2, 6, 0],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['mirror', 0, 5, 1],
            ['mat', 5, 6, 0],
            ['bag', 11, 0, 0],
          ] as T['items'])
        : []),
    ],
  }),
  wellness: l => ({
    w: 6,
    h: 5,
    f: 'c',
    p: 'g',
    items: [
      ['couch', 1, 0, 0],
      ['listener', 8, 3, 3],
      ...(l >= 2
        ? ([
            ['palm', 0, 8, 0],
            ['palm', 10, 0, 0],
            ['salt', 6, 1, 0],
            ['lamp', 4, 9, 0],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['fountain', 10, 8, 0],
            ['rug', 1, 3, 0],
          ] as T['items'])
        : []),
    ],
  }),
  kitchen: l => ({
    w: 7,
    h: 6,
    f: 'h',
    p: 'a',
    items: [
      ['fridge', 0, 0, 0],
      ['counter', 2, 0, 0],
      ['sinkc', 4, 0, 0],
      ['counter', 6, 0, 0],
      [l >= 3 ? 'prostove' : 'stove', 8, 0, 0],
      [l >= 2 ? 'dining6' : 'dining4', 2, 4, 0],
      ['bin', 12, 1, 0],
      ['clock', 13, 0, 0],
      ...(l >= 2
        ? ([
            ['coffee', 12, 3, 3],
            ['minifridge', 12, 7, 3],
          ] as T['items'])
        : []),
    ],
  }),
  lounge: l => ({
    w: 7,
    h: 6,
    f: 'a',
    p: 'a',
    items: [
      ['tv', 2, 0, 0],
      ['sofa', 1, 5, 2],
      ['rug', 1, 1, 0],
      ['ctable', 2, 2, 0],
      ['plant', 0, 0, 0],
      ...(l >= 2
        ? ([
            ['pingpong', 9, 2, 1],
            ['beanbag', 0, 8, 2],
            ['armchair', 6, 2, 3],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['arcade', 0, 10, 1],
            ['neon', 7, 0, 0],
            ['palm', 12, 10, 0],
          ] as T['items'])
        : []),
    ],
  }),
  stream: l => ({
    w: 6,
    h: 5,
    f: 'g',
    p: 'a',
    items: [
      ['streamdesk', 1, 1, 2],
      ['backdrop', 3, 0, 0],
      ...(l >= 2
        ? ([
            ['streamdesk', 7, 1, 2],
            ['softbox', 0, 6, 0],
            ['softbox', 11, 6, 0],
            ['acoustic', 0, 1, 1],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['camera', 5, 6, 0],
            ['neon', 11, 1, 3],
          ] as T['items'])
        : []),
    ],
  }),
  workshop: l => ({
    w: 6,
    h: 5,
    f: 'j',
    p: 'a',
    items: [
      ['workbench', 0, 0, 0],
      ['shelves', 7, 0, 0],
      ...(l >= 2 ? ([['rack', 10, 8, 3]] as T['items']) : []),
      ...(l >= 3
        ? ([
            ['rack', 10, 5, 3],
            ['crates', 0, 8, 0],
          ] as T['items'])
        : []),
    ],
  }),
  office: l => ({
    w: 7,
    h: 5,
    f: 'd',
    p: 'a',
    items: [
      ['officedesk', 0, 0, 0],
      ['officedesk', 5, 0, 0],
      ['filing', 12, 0, 0],
      ...(l >= 2
        ? ([
            ['whiteboard', 2, 0, 0],
            ['coffee', 0, 8, 0],
            ['bookcase', 13, 4, 3],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['officedesk', 5, 5, 0],
            ['printer', 10, 3, 0],
            ['armchair', 10, 8, 2],
            ['palm', 12, 8, 0],
          ] as T['items'])
        : []),
    ],
  }),
  medical: l => ({
    w: 5,
    h: 5,
    f: 'i',
    p: 'a',
    items: [
      ['bedt', 1, 0, 0],
      ['medcab', 6, 0, 0],
      ...(l >= 2 ? ([['icebath', 7, 3, 0]] as T['items']) : []),
      ...(l >= 3 ? ([['scanner', 0, 6, 0]] as T['items']) : []),
    ],
  }),
  dorm: l => ({
    w: 8,
    h: 6,
    f: 'f',
    p: 'a',
    items: [
      ...[0, 3, 6, 9, 12].map(x => ['pod', x, 0, 0] as [string, number, number, number]),
      ...(l >= 2
        ? ([
            ['nightstand', 2, 0, 0],
            ['nightstand', 5, 0, 0],
            ['nightstand', 8, 0, 0],
            ['blackout', 0, 0, 0],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['wardrobe', 15, 5, 3],
            ['lamp', 15, 0, 0],
            ['tv', 0, 5, 1],
          ] as T['items'])
        : []),
    ],
  }),
  trophy: l => ({
    w: 6,
    h: 5,
    f: 'l',
    p: l >= 2 ? 'f' : 'a',
    items: [
      ['plinth', 1, 1, 0],
      ['plinth', 5, 1, 0],
      ['plinth', 9, 1, 0],
      ...(l >= 2
        ? ([
            ['plinth', 3, 4, 0],
            ['plinth', 7, 4, 0],
            ['banner', 1, 0, 0],
            ['jersey', 5, 0, 0],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['tcase', 0, 4, 1],
            ['neon', 8, 0, 0],
          ] as T['items'])
        : []),
    ],
  }),
  bath: l => ({
    w: 4,
    h: 4,
    f: 'i',
    p: l >= 3 ? 'g' : 'a',
    items: [
      ['shower', 0, 0, 0],
      ['toilet', 3, 0, 0],
      ['basin', 6, 0, 0],
      ...(l >= 2
        ? ([
            ['bathcab', 6, 0, 0],
            ['washer', 6, 6, 3],
          ] as T['items'])
        : []),
      ...(l >= 3
        ? ([
            ['bathcab', 3, 0, 0],
            ['hamper', 0, 7, 0],
            ['cart', 0, 4, 1],
          ] as T['items'])
        : []),
    ],
  }),
};
export const template = (t: RoomType, l: number): T => TEMPL[t](l);
export function templateCost(t: RoomType, l: number): number {
  const p = template(t, l);
  return (
    p.w * p.h * FLOOR_BY[p.f].price +
    (p.w + p.h) * 2 * (PRICE.wall + (WALL_BY[p.p]?.price ?? 0)) +
    PRICE.door +
    p.items.reduce((s, i) => s + FURN[i[0]].price, 0)
  );
}
/** A sensible first building: rows of rooms along corridors, a hall through the middle, a front door to the street. */
export function layout(site: number, want: { type: RoomType; title?: TitleId; lvl: number }[]): HQ {
  const S = SITES[site];
  type R = { type: RoomType; title?: TitleId; lvl: number; t: T; i: number };
  const list: R[] = want.map((r, i) => ({ ...r, t: template(r.type, r.lvl), i }));
  list.sort((a, b) => b.t.h - a.t.h || b.t.w - a.t.w || a.i - b.i);
  const HALL = 3,
    CORR = 2;
  interface Row {
    l: R[];
    r: R[];
    h: number;
  }
  const pack = (bw: number): { rows: Row[]; bh: number } | null => {
    const left = [...list];
    const rows: Row[] = [];
    while (left.length) {
      const k = rows.length;
      const side = Math.floor((bw - HALL) / 2);
      const bins = k === 0 ? [bw] : [side, bw - HALL - side];
      const got: R[][] = bins.map(() => []);
      bins.forEach((room, b) => {
        let used = 0;
        for (let q = 0; q < left.length;)
          if (used + left[q].t.w <= room) {
            used += left[q].t.w;
            got[b].push(left.splice(q, 1)[0]);
          } else q++;
      });
      if (!got.some(g => g.length)) return null;
      rows.push({ l: got[0], r: got[1] ?? [], h: Math.max(...got.flat().map(x => x.t.h)) });
      if (rows.length > 9) return null;
    }
    let bh = 0;
    rows.forEach((r, k) => (bh += r.h + (k % 2 === 0 ? CORR : 0)));
    if (rows.length === 1) bh += 1;
    return { rows, bh };
  };
  for (let grow = 0; ; grow++) {
    const W = Math.min(S.mw, S.w + grow * 2),
      H = Math.min(S.mh, S.h + grow);
    let best: { bw: number; rows: Row[]; bh: number } | null = null;
    for (let bw = 12; bw <= W - 2; bw++) {
      const p = pack(bw);
      if (p && p.bh <= H - 3 && (!best || bw * p.bh < best.bw * best.bh)) best = { bw, ...p };
    }
    if (!best) {
      if (W < S.mw || H < S.mh) continue;
      if (site < SITES.length - 1) return layout(site + 1, want); // cannot happen for anything the game asks for
      throw new Error('layout');
    }
    const { bw, rows, bh } = best;
    const d = Draft.empty(W, H);
    const X = Math.floor((W - bw) / 2),
      Y = 1;
    d.drawRoom(X, Y, bw, bh, 'a', 'a');
    const side = Math.floor((bw - HALL) / 2);
    let y = Y;
    rows.forEach((r, k) => {
      const odd = k % 2 === 1;
      const run = (L: R[], x: number, room: number) => {
        const spare = room - L.reduce((s, q) => s + q.t.w, 0);
        L.forEach((q, n) => {
          const ex = n === L.length - 1 ? Math.min(spare, 2) : 0;
          const e = d.preset(q.type, q.lvl, x, y, q.title, odd, ex, r.h - q.t.h);
          if (e) throw new Error('layout: ' + e);
          x += q.t.w + ex;
        });
      };
      run(r.l, X, k === 0 ? bw : side);
      if (k > 0) run(r.r, X + side + HALL, bw - HALL - side);
      y += r.h + (odd ? 0 : rows.length === 1 ? CORR + 1 : CORR);
    });
    const south = Y + bh;
    const fx = X + side + 1;
    d.setH(fx, south, 'D');
    const clear = (t: (it: Item) => boolean) => !d.items.some(it => FURN[it.f].wall && t(it));
    const across = (it: Item, i: number) => it.x < i * 2 + 2 && it.x + size(it)[0] > i * 2;
    for (let i = X + 1; i < X + bw - 1; i += 3)
      if (d.eh(i, Y) === '1' && clear(it => it.y === Y * 2 && it.r === 0 && across(it, i))) d.setH(i, Y, 'W');
    for (let i = X + 2; i < X + bw - 1; i += 3)
      if (d.eh(i, south) === '1' && clear(it => it.r === 2 && it.y === south * 2 - 1 && across(it, i))) d.setH(i, south, 'W');
    for (let j = Y + 1; j < Y + bh - 1; j += 3) {
      if (d.ev(X, j) === '1' && !wallAt(d, 1, X * 2, j)) d.setV(X, j, 'W');
      if (d.ev(X + bw, j) === '1' && !wallAt(d, 3, (X + bw) * 2 - 1, j)) d.setV(X + bw, j, 'W');
    }
    const put = (f: string, hx: number, hy: number, r = 0) => {
      const it: Item = { id: d.uid(), f, x: hx, y: hy, r };
      if (!itemError(d, it)) d.items.push(it);
    };
    put('hedge', 0, H * 2 - 2);
    put('hedge', W * 2 - 4, H * 2 - 2);
    put('tree', 0, H * 2 - 6);
    put('tree', W * 2 - 2, H * 2 - 6);
    put('lamppost', fx * 2 - 2, south * 2 + 1);
    // the way in: something green, somewhere to sit, something to trip over
    put('runner', fx * 2, south * 2 - 8);
    put('palm', fx * 2 - 2, south * 2 - 2);
    put('palm', fx * 2 + 2, south * 2 - 2);
    put('waitbench', fx * 2 - 2, south * 2 - 8, 1);
    put('bin', fx * 2 + 3, south * 2 - 5);
    put('exting', fx * 2 + 3, south * 2 - 8, 3);
    put('flowers', fx * 2 - 7, south * 2 + 1);
    put('flowers', fx * 2 + 4, south * 2 + 1);
    for (let x = 4; x + 4 <= W * 2 - 4; x += 4) if (x + 4 < fx * 2 - 2 || x > fx * 2 + 4) put('hedge', x, H * 2 - 2);
    return d.hq();
  }
}
function wallAt(d: Draft, r: number, x: number, ty: number) {
  return d.items.some(it => FURN[it.f].wall && it.r === r && it.x === x && it.y < ty * 2 + 2 && it.y + size(it)[1] > ty * 2);
}
export { ROOMS, TITLES };
