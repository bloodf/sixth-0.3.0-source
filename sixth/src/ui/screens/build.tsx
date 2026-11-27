/** The house editor: land, floors, walls, doors, paint and furniture, drawn straight onto the headquarters. */
import { act, app, bump, G_, toast, tShort, useApp } from '../store.ts';
import { $, ask, B, PFace, UI, useEffect, useRef, useState } from '../kit.tsx';
import { ROOMS, ROOM_TYPES, SITES, type RoomType } from '../../data/club.ts';
import {
  CATS,
  FLOORS,
  FLOOR_BY,
  FURN,
  FURN_LIST,
  NEEDS,
  PRICE,
  WALLS,
  WALL_BY,
  type Cat,
  type Furn,
  type Style,
} from '../../data/furniture.ts';
import {
  diffCost,
  Draft,
  itemError,
  size,
  status,
  template,
  templateCost,
  validate,
  type HQ,
  type Item,
  type RoomStatus,
} from '../../game/build.ts';
import type { Ghost, Pt, Tool } from '../../gfx/hq.ts';
import { floorSwatch } from '../../gfx/house.ts';
import { itemThumb, roomThumb } from '../../gfx/thumbs.ts';
import { TITLES, type TitleId } from '../../data/titles.ts';
import { deskMate, desks } from '../../game/seats.ts';
import { audio } from '../../audio/audio.ts';
type Mode = 'select' | 'preset' | 'room' | 'wall' | 'open' | 'floor' | 'paint' | 'item' | 'erase' | 'land';
interface Ed {
  base: HQ;
  d: Draft;
  q: HQ;
  undo: HQ[];
  redo: HQ[];
  mode: Mode;
  cat: Cat;
  item: string | null;
  r: number;
  floor: string;
  paint: string;
  open: 'D' | 'W';
  whole: boolean;
  preset: { type: RoomType; lvl: number; title?: TitleId } | null;
  lvl: number;
  flip: boolean;
  sel: { k: 'item'; id: string } | { k: 'room'; x: number; y: number } | null;
  /** carrying a room or an item that is already there */
  carry:
    { k: 'item'; it: Item; dx: number; dz: number; copy?: boolean } | { k: 'room'; x: number; y: number; gx: number; gy: number } | null;
  drag: { x: number; z: number } | null;
  last: Pt | null;
  tip: string;
  bad: boolean;
  grid: boolean;
}
let ed: Ed | null = null;
const hqv = () => app.hq!;
export function openEditor(focusRoom?: string) {
  const g = G_();
  const q: HQ = JSON.parse(JSON.stringify(g.hq));
  ed = {
    base: q,
    d: new Draft(q),
    q,
    undo: [],
    redo: [],
    mode: 'select',
    cat: 'play',
    item: null,
    r: 0,
    floor: 'a',
    paint: 'a',
    open: 'D',
    whole: false,
    preset: null,
    lvl: 1,
    flip: false,
    sel: null,
    carry: null,
    drag: null,
    last: null,
    tip: '',
    bad: false,
    grid: true,
  };
  if (focusRoom) {
    const z = q.zones.find(x => x.id === focusRoom);
    if (z) ed.sel = { k: 'room', x: z.x, y: z.y };
  }
  app.sheet = null;
  app.arg = null;
  app.player = null;
  app.edit = true;
  const v = hqv();
  v.edit(true);
  v.show(q);
  v.tool = tool;
  paintOver();
  audio.play('whoosh', { vol: 0.3 });
  bump();
}
function close() {
  ed = null;
  app.edit = false;
  hqv().edit(false);
  hqv().warp();
  bump();
}
// ---------- changing the plan
function set(q: HQ) {
  ed!.q = q;
  ed!.d = new Draft(q);
  hqv().show(q);
}
function commit(f: (d: Draft) => string | null | void, sound = 'build'): boolean {
  const e = ed!;
  const d = new Draft(e.q);
  const r = f(d);
  if (r) {
    toast(r, 'err');
    audio.play('error');
    return false;
  }
  e.undo.push(e.q);
  if (e.undo.length > 120) e.undo.shift();
  e.redo = [];
  set(d.hq());
  if (e.sel?.k === 'item' && !e.d.items.some(i => i.id === (e.sel as any).id)) e.sel = null;
  audio.play(sound as any, { vol: 0.4 });
  paintOver();
  bump();
  return true;
}
function step(from: 'undo' | 'redo') {
  const e = ed!;
  const q = e[from].pop();
  if (!q) return;
  e[from === 'undo' ? 'redo' : 'undo'].push(e.q);
  const dx = q.w - e.q.w,
    dy = q.h - e.q.h;
  void dx;
  void dy;
  e.carry = null;
  e.sel = null;
  set(q);
  audio.play('tap');
  paintOver();
  bump();
}
const regionAt = (x: number, y: number) => {
  const e = ed!;
  const R = hqv().regions;
  return x < 0 || y < 0 || x >= e.q.w || y >= e.q.h ? -1 : R.map[y * e.q.w + x];
};
const tileOf = (p: Pt): [number, number] => [Math.floor(p.x), Math.floor(p.z)];
function rotated(f: string, r: number): [number, number] {
  const d = FURN[f];
  return r % 2 ? [d.d, d.w] : [d.w, d.d];
}
/** where an item would go for this pointer; hanging things find the nearest wall */
function aim(f: string, r: number, p: Pt, dx = 0, dz = 0): Item {
  const e = ed!;
  if (FURN[f].wall) {
    let best: Item | null = null,
      bd = 1e9;
    const edge = hqv().pickEdge(0.9);
    for (let k = 0; k < 4; k++) {
      const [w, h] = rotated(f, k);
      const cx = Math.round(p.x * 2 - w / 2),
        cy = Math.round(p.z * 2 - h / 2);
      for (let s = -3; s <= 3; s++)
        for (let t = -3; t <= 3; t++) {
          const it: Item = { id: 'ghost', f, x: cx + (k % 2 ? s : t), y: cy + (k % 2 ? t : s), r: k };
          const mx = it.x + w / 2,
            my = it.y + h / 2;
          let d = Math.hypot(mx - p.x * 2, my - p.z * 2);
          if (edge) {
            const [o, ex, ey] = edge;
            const onIt =
              o === 'v'
                ? (k === 1 && it.x === ex * 2) || (k === 3 && it.x + w === ex * 2)
                : (k === 0 && it.y === ey * 2) || (k === 2 && it.y + h === ey * 2);
            if (onIt) d -= 2.2;
          }
          if (k === r) d -= 0.05;
          if (d >= bd) continue;
          if (itemError(e.d, it, e.carry?.k === 'item' ? e.carry.it.id : undefined)) continue;
          bd = d;
          best = it;
        }
    }
    if (best) return best;
  }
  const [w, h] = rotated(f, r);
  return { id: 'ghost', f, x: Math.round(p.x * 2 - dx - w / 2), y: Math.round(p.z * 2 - dz - h / 2), r };
}
const GREEN = '#54d199',
  RED = '#ff6f61',
  AMBER = '#ffb23e',
  SKY = '#7fd0ff';
const money = (n: number) => (n < 0 ? `${$(-n)} back` : $(n));
/** cost of one change, for the label at the pointer */
function price(f: (d: Draft) => string | null | void): { err: string | null; cost: number } {
  const d = new Draft(ed!.q);
  const err = f(d) ?? null;
  if (err) return { err, cost: 0 };
  return { err: null, cost: diffCost(ed!.q, d.hq(), G_().site).cost };
}
const rectOf = (a: { x: number; z: number }, p: Pt): [number, number, number, number] => {
  const x0 = Math.floor(Math.min(a.x, p.x)),
    y0 = Math.floor(Math.min(a.z, p.z)),
    x1 = Math.floor(Math.max(a.x, p.x)) + 1,
    y1 = Math.floor(Math.max(a.z, p.z)) + 1;
  return [x0, y0, x1 - x0, y1 - y0];
};
/** everything drawn over the plan for the current tool, pointer and selection */
function paintOver() {
  const e = ed!;
  const L: Ghost[] = [];
  const p = e.last;
  e.tip = '';
  e.bad = false;
  const R = hqv().regions;
  let hide: string | null = null;
  if (e.sel?.k === 'room') {
    const id = regionAt(e.sel.x, e.sel.y);
    if (id < 0) e.sel = null;
    else L.push({ k: 'tiles', map: R.map, id, mw: e.q.w, col: AMBER, op: 0.16 });
  }
  if (e.sel?.k === 'item' && !(e.carry?.k === 'item')) {
    const it = e.d.items.find(i => i.id === (e.sel as any).id);
    if (it) L.push({ k: 'box', it, col: AMBER });
  }
  if (p && p.x > -50) {
    const [tx, ty] = tileOf(p);
    if (e.carry?.k === 'item') {
      const c = e.carry;
      const it = aim(c.it.f, c.it.r, p, c.dx, c.dz);
      const er = itemError(e.d, { ...it, id: c.copy ? 'ghost' : c.it.id });
      if (!c.copy) hide = c.it.id;
      L.push({ k: 'items', list: [it], ok: !er });
      e.tip = er ?? (c.copy ? money(FURN[it.f].price) : '');
      e.bad = !!er;
    } else if (e.carry?.k === 'room') {
      const c = e.carry;
      const id = regionAt(c.x, c.y);
      const g = R.list[id];
      if (g) {
        const dx = Math.round(p.x - c.gx),
          dy = Math.round(p.z - c.gy);
        const t = price(d => d.moveRegion(id, dx, dy));
        L.push({ k: 'rect', x: g.x + dx, y: g.y + dy, w: g.w, h: g.h, col: t.err ? RED : GREEN, op: 0.22, tall: 0.8 });
        e.tip = t.err ?? (t.cost ? money(t.cost) : 'Click to put it here');
        e.bad = !!t.err;
      }
    } else if (e.mode === 'item' && e.item) {
      const it = aim(e.item, e.r, p);
      const er = itemError(e.d, it);
      L.push({ k: 'items', list: [it], ok: !er });
      e.tip = er ?? money(FURN[it.f].price);
      e.bad = !!er;
    } else if (e.mode === 'preset' && e.preset) {
      const [x, y] = presetAt(p);
      const t = template(e.preset.type, e.preset.lvl);
      const tr = new Draft(e.q);
      const before = new Set(tr.items.map(i => i.id));
      const er = tr.preset(e.preset.type, e.preset.lvl, x, y, e.preset.title, e.flip);
      L.push({ k: 'rect', x, y, w: t.w, h: t.h, col: er ? RED : GREEN, op: 0.18, tall: 0.9 });
      if (!er) L.push({ k: 'items', list: tr.items.filter(i => !before.has(i.id)), ok: true });
      e.tip = er ?? `${t.w} × ${t.h}, ${money(diffCost(e.q, tr.hq(), G_().site).cost)}`;
      e.bad = !!er;
    } else if (e.mode === 'room') {
      const [x, y, w, h] = e.drag ? rectOf(e.drag, p) : [tx, ty, 1, 1];
      if (e.drag) {
        const t = price(d => d.drawRoom(x, y, w, h, e.floor, e.paint));
        L.push({ k: 'rect', x, y, w, h, col: t.err ? RED : GREEN, op: 0.22, tall: 0.9 });
        e.tip = t.err ?? `${w} × ${h}, ${money(t.cost)}`;
        e.bad = !!t.err;
      } else L.push({ k: 'rect', x, y, w, h, col: SKY, op: 0.3 });
    } else if (e.mode === 'wall') {
      const [x, y] = [Math.round(p.x), Math.round(p.z)];
      if (e.drag) {
        const list = lineEdges(e.drag, p);
        const t = price(d => {
          const [a, b, c, f] = lineOf(e.drag!, p);
          d.wallLine(a, b, c, f, '1', e.paint);
          return blocked(d);
        });
        L.push({ k: 'edges', list, col: t.err ? RED : GREEN });
        e.tip = t.err ?? `${list.length} m, ${money(t.cost)}`;
        e.bad = !!t.err;
      } else L.push({ k: 'rect', x: x - 0.15, y: y - 0.15, w: 0.3, h: 0.3, col: SKY, op: 0.8 });
    } else if (e.mode === 'open' || (e.mode === 'paint' && !e.whole)) {
      const k = hqv().pickEdge(0.5);
      if (k) {
        const t = price(d => (e.mode === 'open' ? openEdge(d, k) : paintEdge(d, k)));
        L.push({ k: 'edges', list: [k], col: t.err ? RED : GREEN, tall: e.mode === 'open' && e.open === 'D' ? 2 : 1.3 });
        e.tip = t.err ?? (t.cost ? money(t.cost) : e.mode === 'open' ? 'Back to plain wall' : 'Same paint');
        e.bad = !!t.err;
      } else e.tip = e.mode === 'open' ? 'Point at a wall' : '';
    } else if (e.mode === 'paint') {
      const id = regionAt(tx, ty);
      if (id >= 0) {
        L.push({ k: 'tiles', map: R.map, id, mw: e.q.w, col: GREEN, op: 0.2 });
        e.tip = money(price(d => d.paintRegion(id, e.paint)).cost);
      }
    } else if (e.mode === 'floor') {
      if (e.whole && e.floor !== '.') {
        const id = regionAt(tx, ty);
        if (id >= 0) {
          L.push({ k: 'tiles', map: R.map, id, mw: e.q.w, col: GREEN, op: 0.25 });
          e.tip = money(price(d => d.floorRegion(id, e.floor)).cost);
        }
      } else {
        const [x, y, w, h] = e.drag ? rectOf(e.drag, p) : [tx, ty, 1, 1];
        const t = price(d => d.fill(x, y, w, h, e.floor));
        L.push({ k: 'rect', x, y, w, h, col: t.err ? RED : e.floor === '.' ? RED : GREEN, op: 0.3 });
        e.tip = t.err ?? `${w} × ${h}, ${money(t.cost)}`;
        e.bad = !!t.err;
      }
    } else if (e.mode === 'erase') {
      const it = hqv().pickItem();
      if (it) {
        L.push({ k: 'box', it, col: RED });
        e.tip = `${FURN[it.f].name}, ${money(price(d => void (d.items = d.items.filter(i => i.id !== it.id))).cost)}`;
      } else {
        const k = hqv().pickEdge(0.28);
        if (k) {
          L.push({ k: 'edges', list: [k], col: RED });
          const t = price(d => dropEdge(d, k));
          e.tip = t.err ?? `Wall, ${money(t.cost)}`;
          e.bad = !!t.err;
        } else {
          const id = regionAt(tx, ty);
          if (id >= 0) {
            L.push({ k: 'tiles', map: R.map, id, mw: e.q.w, col: RED, op: 0.22 });
            e.tip = `Whole room, ${money(price(d => d.removeRegion(id)).cost)}`;
          }
        }
      }
    } else if (e.mode === 'select') {
      const it = hqv().pickItem();
      if (it) {
        if (!(e.sel?.k === 'item' && e.sel.id === it.id)) L.push({ k: 'box', it, col: '#ffffff' });
        e.tip = FURN[it.f].name;
      } else {
        const id = regionAt(tx, ty);
        if (id >= 0 && !(e.sel?.k === 'room' && regionAt(e.sel.x, e.sel.y) === id))
          L.push({ k: 'tiles', map: R.map, id, mw: e.q.w, col: '#ffffff', op: 0.1 });
      }
    }
  }
  if (hide !== hidden) {
    hidden = hide;
    hqv().things(hide ? new Set([hide]) : null);
  }
  hqv().overlay(L, e.grid);
  const t = document.getElementById('edtip');
  if (t && p) {
    t.style.display = e.tip ? '' : 'none';
    t.textContent = e.tip;
    t.className = e.bad ? 'bad' : '';
    t.style.transform = `translate(${p.sx + 16}px,${p.sy + 14}px)`;
  }
}
let hidden: string | null = null;
const presetAt = (p: Pt): [number, number] => {
  const t = template(ed!.preset!.type, ed!.preset!.lvl);
  return [Math.max(0, Math.min(ed!.q.w - t.w, Math.round(p.x - t.w / 2))), Math.max(0, Math.min(ed!.q.h - t.h, Math.round(p.z - t.h / 2)))];
};
const lineOf = (a: { x: number; z: number }, p: Pt): [number, number, number, number] => {
  const q = ed!.q;
  const X = (v: number) => Math.max(0, Math.min(q.w, Math.round(v))),
    Y = (v: number) => Math.max(0, Math.min(q.h, Math.round(v)));
  const x0 = X(a.x),
    y0 = Y(a.z);
  return Math.abs(p.x - a.x) > Math.abs(p.z - a.z) ? [x0, y0, X(p.x), y0] : [x0, y0, x0, Y(p.z)];
};
function lineEdges(a: { x: number; z: number }, p: Pt): ['v' | 'h', number, number][] {
  const [x0, y0, x1, y1] = lineOf(a, p);
  const out: ['v' | 'h', number, number][] = [];
  if (x0 === x1) for (let j = Math.min(y0, y1); j < Math.max(y0, y1); j++) out.push(['v', x0, j]);
  else for (let i = Math.min(x0, x1); i < Math.max(x0, x1); i++) out.push(['h', i, y0]);
  return out;
}
/** a wall may not run through furniture */
function blocked(d: Draft): string | null {
  for (const it of d.items) {
    const er = itemError(d, it);
    if (er) return `${FURN[it.f].name}: ${er.toLowerCase()}`;
  }
  return null;
}
function openEdge(d: Draft, [o, x, y]: ['v' | 'h', number, number]): string | null {
  const k = d.edge(o, x, y);
  if (k === '0') return 'Point at a wall';
  d.setE(o, x, y, k === ed!.open ? '1' : ed!.open);
  return blocked(d);
}
function paintEdge(d: Draft, [o, x, y]: ['v' | 'h', number, number]): string | null {
  d.setE(o, x, y, d.edge(o, x, y), ed!.paint);
  return null;
}
function dropEdge(d: Draft, [o, x, y]: ['v' | 'h', number, number]): string | null {
  d.setE(o, x, y, '0');
  d.dropLooseWallItems();
  return null;
}
// ---------- pointer
const tool: Tool = {
  down(p) {
    const e = ed!;
    e.last = p;
    if (e.carry) return true;
    if (e.mode === 'select') {
      const it = hqv().pickItem();
      if (it) {
        e.sel = { k: 'item', id: it.id };
        e.drag = { x: p.x, z: p.z };
        paintOver();
        bump();
        return true;
      }
      // clicks select a room, drags move the camera
      const [x, y] = tileOf(p);
      const was = JSON.stringify(e.sel);
      e.sel = regionAt(x, y) >= 0 ? { k: 'room', x, y } : null;
      if (JSON.stringify(e.sel) !== was) audio.play('tap');
      paintOver();
      bump();
      return false;
    }
    if (e.mode === 'land') return false;
    if (e.mode === 'room' || e.mode === 'wall' || (e.mode === 'floor' && !(e.whole && e.floor !== '.'))) e.drag = { x: p.x, z: p.z };
    paintOver();
    return true;
  },
  move(p, dragging) {
    const e = ed!;
    e.last = p;
    if (dragging && e.mode === 'select' && e.drag && !e.carry && e.sel?.k === 'item' && Math.hypot(p.x - e.drag.x, p.z - e.drag.z) > 0.2) {
      const it = e.d.items.find(i => i.id === (e.sel as any).id);
      if (it) {
        const [w, h] = size(it);
        e.carry = { k: 'item', it: { ...it }, dx: e.drag.x * 2 - (it.x + w / 2), dz: e.drag.z * 2 - (it.y + h / 2) };
      }
    }
    queue();
  },
  up(p) {
    const e = ed!;
    e.last = p;
    const drag = e.drag;
    e.drag = null;
    if (e.carry) {
      const c = e.carry;
      if (c.k === 'item') {
        const it = aim(c.it.f, c.it.r, p, c.dx, c.dz);
        if (c.copy) {
          commit(d => itemError(d, it) ?? void d.items.push({ ...it, id: d.uid() }), 'place');
        } else {
          const same = it.x === c.it.x && it.y === c.it.y && it.r === ed!.d.items.find(i => i.id === c.it.id)?.r;
          e.carry = null;
          if (!same)
            commit(d => {
              const er = itemError(d, { ...it, id: c.it.id });
              if (er) return er;
              Object.assign(
                d.items.find(i => i.id === c.it.id)!,
                { x: it.x, y: it.y, r: it.r },
              );
            }, 'place');
          else paintOver();
        }
      } else {
        const id = regionAt(c.x, c.y);
        const dx = Math.round(p.x - c.gx),
          dy = Math.round(p.z - c.gy);
        if (commit(d => d.moveRegion(id, dx, dy))) {
          e.carry = null;
          e.sel = { k: 'room', x: c.x + dx, y: c.y + dy };
          paintOver();
        }
      }
      bump();
      return;
    }
    const [tx, ty] = tileOf(p);
    if (e.mode === 'item' && e.item) {
      const it = aim(e.item, e.r, p);
      commit(d => itemError(d, it) ?? void d.items.push({ ...it, id: d.uid() }), 'place');
    } else if (e.mode === 'preset' && e.preset) {
      const [x, y] = presetAt(p);
      const q = e.preset;
      if (
        commit(d => {
          const er = d.preset(q.type, q.lvl, x, y, q.title, e.flip);
          return er ?? blocked(d);
        })
      ) {
        const t = template(q.type, q.lvl);
        e.sel = { k: 'room', x: x + Math.floor(t.w / 2), y: y + Math.floor(t.h / 2) };
        setMode('select');
      }
    } else if (e.mode === 'room' && drag) {
      const [x, y, w, h] = rectOf(drag, p);
      if (w * h > 1 && commit(d => d.drawRoom(x, y, w, h, e.floor, e.paint) ?? blocked(d))) {
        e.sel = { k: 'room', x, y };
        setMode('select');
      }
    } else if (e.mode === 'wall' && drag) {
      const [a, b, c, f] = lineOf(drag, p);
      if (a !== c || b !== f)
        commit(d => {
          d.wallLine(a, b, c, f, '1', e.paint);
          return blocked(d);
        });
    } else if (e.mode === 'open') {
      const k = hqv().pickEdge(0.5);
      if (k) commit(d => openEdge(d, k));
    } else if (e.mode === 'paint') {
      if (e.whole) {
        const id = regionAt(tx, ty);
        if (id >= 0) commit(d => d.paintRegion(id, e.paint), 'place');
      } else {
        const k = hqv().pickEdge(0.5);
        if (k) commit(d => paintEdge(d, k), 'place');
      }
    } else if (e.mode === 'floor') {
      if (e.whole && e.floor !== '.') {
        const id = regionAt(tx, ty);
        if (id >= 0) commit(d => d.floorRegion(id, e.floor), 'place');
      } else {
        const [x, y, w, h] = rectOf(drag ?? { x: p.x, z: p.z }, p);
        commit(d => d.fill(x, y, w, h, e.floor), 'place');
      }
    } else if (e.mode === 'erase') {
      const it = hqv().pickItem();
      if (it) commit(d => void (d.items = d.items.filter(i => i.id !== it.id)), 'cash');
      else {
        const k = hqv().pickEdge(0.28);
        if (k) commit(d => dropEdge(d, k), 'cash');
        else {
          const id = regionAt(tx, ty);
          if (id >= 0) commit(d => d.removeRegion(id), 'cash');
        }
      }
    }
    paintOver();
    bump();
  },
  cancel() {
    escape();
  },
};
let queued = false;
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (ed) paintOver();
  });
}
function escape() {
  const e = ed!;
  if (e.carry || e.drag) {
    e.carry = null;
    e.drag = null;
  } else if (e.mode === 'item' && e.item) e.item = null;
  else if (e.mode === 'preset' && e.preset) e.preset = null;
  else if (e.mode !== 'select') setMode('select');
  else e.sel = null;
  paintOver();
  bump();
}
function setMode(m: Mode) {
  const e = ed!;
  e.mode = m;
  e.carry = null;
  e.drag = null;
  if (m !== 'select') e.sel = null;
  paintOver();
  bump();
}
function turn() {
  const e = ed!;
  if (e.carry?.k === 'item') {
    e.carry.it.r = (e.carry.it.r + 1) % 4;
    e.carry.dx = e.carry.dz = 0;
  } else if (e.mode === 'item') e.r = (e.r + 1) % 4;
  else if (e.mode === 'preset') e.flip = !e.flip;
  else if (e.sel?.k === 'item') {
    const id = e.sel.id;
    commit(d => {
      const it = d.items.find(i => i.id === id)!;
      for (let k = 1; k <= 3; k++) {
        const r = (it.r + k) % 4;
        const [w0, h0] = size(it);
        const [w, h] = rotated(it.f, r);
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 1],
          [-1, -1],
        ]) {
          const t = { ...it, r, x: it.x + Math.round((w0 - w) / 2) + ox, y: it.y + Math.round((h0 - h) / 2) + oy };
          if (!itemError(d, t)) {
            Object.assign(it, t);
            return null;
          }
        }
      }
      return 'No room to turn it';
    }, 'place');
    return;
  }
  paintOver();
  bump();
}
function remove() {
  const e = ed!;
  if (e.carry) {
    escape();
    return;
  }
  if (e.sel?.k === 'item') {
    const id = e.sel.id;
    e.sel = null;
    commit(d => void (d.items = d.items.filter(i => i.id !== id)), 'cash');
  } else if (e.sel?.k === 'room') {
    const id = regionAt(e.sel.x, e.sel.y);
    e.sel = null;
    if (id >= 0) commit(d => d.removeRegion(id), 'cash');
  }
}
/** choose what a space is for */
function purpose(type: RoomType | '', title?: TitleId) {
  const e = ed!;
  if (e.sel?.k !== 'room') return;
  const { x, y } = e.sel;
  const id = regionAt(x, y);
  commit(d => {
    const R = d.regions();
    const old = d.zones.filter(z => R.map[z.y * d.w + z.x] === id);
    d.zones = d.zones.filter(z => !old.includes(z));
    if (type) {
      const g = R.list[id];
      let [zx, zy] = [x, y];
      if (R.map[zy * d.w + zx] !== id) [zx, zy] = [g.x, g.y];
      d.zones.push({ id: old.find(o => o.type === type)?.id ?? d.uid(), x: zx, y: zy, type, ...(title ? { title } : {}) });
    }
  }, 'tap');
}
// ---------- keys
function keys(ev: KeyboardEvent) {
  if (!ed || app.confirm || app.settings) return;
  if (/INPUT|TEXTAREA|SELECT/.test((ev.target as HTMLElement)?.tagName ?? '')) return;
  const k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') {
    ev.preventDefault();
    step(ev.shiftKey ? 'redo' : 'undo');
  } else if ((ev.ctrlKey || ev.metaKey) && k === 'y') {
    ev.preventDefault();
    step('redo');
  } else if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  else if (k === 'escape') escape();
  else if (k === 'r') turn();
  else if (k === 'delete' || k === 'backspace') remove();
  else if (k === 'q') hqv().rotate(-1);
  else if (k === 'e') hqv().rotate(1);
  else if (k === 't') {
    hqv().top = !hqv().top;
    bump();
  } else if (k === 'v') cycleWalls();
  else if (k === 'g') {
    ed.grid = !ed.grid;
    paintOver();
    bump();
  } else {
    const m = MODES.find(x => x[3] === ev.key);
    if (m) setMode(m[0]);
  }
}
function cycleWalls() {
  const v = hqv();
  v.setWalls(v.wallMode === 'cut' ? 'down' : v.wallMode === 'down' ? 'up' : 'cut');
  paintOver();
  bump();
}
const MODES: [Mode, string, string, string][] = [
  ['select', 'Select', 'mouse-pointer-2', '1'],
  ['preset', 'Ready-made', 'layout-template', '2'],
  ['room', 'Draw room', 'square-dashed', '3'],
  ['wall', 'Wall', 'brick-wall', '4'],
  ['open', 'Doors', 'door-open', '5'],
  ['item', 'Furniture', 'armchair', '6'],
  ['floor', 'Floor', 'grid-2x2', '7'],
  ['paint', 'Paint', 'paint-roller', '8'],
  ['erase', 'Remove', 'eraser', '9'],
  ['land', 'Land', 'land-plot', '0'],
];
void [
  UI('mouse-pointer-2'),
  UI('layout-template'),
  UI('square-dashed'),
  UI('brick-wall'),
  UI('door-open'),
  UI('armchair'),
  UI('grid-2x2'),
  UI('paint-roller'),
  UI('eraser'),
  UI('land-plot'),
];
const roomName = (t: RoomType, title?: string) => ROOMS[t].name + (title ? ', ' + tShort(title as TitleId) : '');
/** what changes for the club when this plan is built */
function changes(a: HQ, b: RoomStatus[]): { open: string[]; close: string[]; up: string[]; down: string[] } {
  const A = status(new Draft(a)).filter(s => s.lvl);
  const key = (s: RoomStatus) => s.zone.type + (s.zone.title ?? '');
  const best = (L: RoomStatus[]) => {
    const m = new Map<string, RoomStatus>();
    for (const s of L) if (s.lvl && (m.get(key(s))?.lvl ?? 0) < s.lvl) m.set(key(s), s);
    return m;
  };
  const x = best(A),
    y = best(b);
  const out = { open: [] as string[], close: [] as string[], up: [] as string[], down: [] as string[] };
  for (const [k, s] of y) {
    const o = x.get(k);
    const n = roomName(s.zone.type, s.zone.title);
    if (!o) out.open.push(n);
    else if (s.lvl > o.lvl) out.up.push(`${n} to level ${s.lvl}`);
    else if (s.lvl < o.lvl) out.down.push(`${n} to level ${s.lvl}`);
  }
  for (const [k, s] of x) if (!y.has(k)) out.close.push(roomName(s.zone.type, s.zone.title));
  return out;
}
export function Editor() {
  useApp();
  const g = G_();
  useEffect(() => {
    addEventListener('keydown', keys);
    return () => removeEventListener('keydown', keys);
  }, []);
  if (!ed) return null;
  const e = ed;
  const v = hqv();
  const c = diffCost(e.base, e.q, g.site);
  const dirty = e.undo.length > 0;
  const left = g.club.cash - c.cost;
  const er = dirty
    ? validate(
        e.q,
        g.site,
        TITLES.filter(t => g.squads[t]),
      )
    : null;
  const ch = changes(e.base, v.statuses);
  const leave = () => (dirty ? ask('Leave without building?', 'The plan is lost.', 'Leave', close, true) : close());
  const build = () => {
    const go = () => {
      const o = act({ t: 'remodel', hq: e.q });
      if (o.ok) close();
    };
    const bad = [...ch.close.map(x => x + ' closes'), ...ch.down.map(x => x.replace(' to level', ' drops to level'))];
    if (bad.length) ask('Build it this way?', bad.join('. ') + '.', 'Build', go);
    else go();
  };
  return (
    <>
      <header class="top edtop">
        <b class="edname">House editor</b>
        <span class="chip">
          {e.q.w} × {e.q.h} m
        </span>
        <div class="row" style={{ gap: 2 }}>
          <button class="ib" title="Undo (Ctrl Z)" aria-label="Undo" disabled={!e.undo.length} onClick={() => step('undo')}>
            {UI('undo-2', 19)}
          </button>
          <button class="ib" title="Redo (Ctrl Y)" aria-label="Redo" disabled={!e.redo.length} onClick={() => step('redo')}>
            {UI('redo-2', 19)}
          </button>
          <i class="edsep" />
          <button class="ib" title="Turn the view left (Q)" aria-label="Turn left" onClick={() => v.rotate(-1)}>
            {UI('rotate-ccw', 18)}
          </button>
          <button class="ib" title="Turn the view right (E)" aria-label="Turn right" onClick={() => v.rotate(1)}>
            {UI('rotate-cw', 18)}
          </button>
          <button
            class={'ib ' + (v.top ? 'on' : '')}
            title="From above (T)"
            aria-label="View from above"
            onClick={() => {
              v.top = !v.top;
              bump();
            }}
          >
            {UI('scan-eye', 18)}
          </button>
          <button
            class={'ib ' + (v.wallMode !== 'cut' ? 'on' : '')}
            title="Walls: cut away, down, up (V)"
            aria-label="Walls"
            onClick={cycleWalls}
          >
            {UI('blocks', 18)}
          </button>
          <button
            class={'ib ' + (e.grid ? 'on' : '')}
            title="Grid (G)"
            aria-label="Grid"
            onClick={() => {
              e.grid = !e.grid;
              paintOver();
              bump();
            }}
          >
            {UI('grid-3x3', 18)}
          </button>
        </div>
        <div class="grow" />
        <div class="kv" title={c.parts.map(p => `${p[0]}: ${p[1] < 0 ? '+' : '−'}$${Math.abs(p[1])}`).join('\n')}>
          <b class={c.cost > 0 ? 'am' : c.cost < 0 ? 'pos' : ''}>{c.cost < 0 ? '+' + $(-c.cost) : $(c.cost)}</b>
          <span>{c.cost < 0 ? 'money back' : 'cost'}</span>
        </div>
        <div class="kv">
          <b class={left < 0 ? 'neg' : ''}>{$(left)}</b>
          <span>cash after</span>
        </div>
        <B k="q" onClick={leave}>
          {dirty ? 'Discard' : 'Close'}
        </B>
        <B
          k="p"
          disabled={!dirty || !!er || (c.cost > 0 && left < 0)}
          title={er ?? (left < 0 ? `Short by ${$(-left)}` : '')}
          onClick={build}
        >
          {UI('hammer', 17)}Build
        </B>
      </header>
      <Labels />
      <div id="edtip" style={{ display: 'none' }} />
      {(e.sel || ch.open.length + ch.close.length + ch.up.length + ch.down.length > 0 || er) && (
        <aside class="edside">
          {e.sel?.k === 'item' && <ItemCard />}
          {e.sel?.k === 'room' && <RoomCard />}
          {(ch.open.length > 0 || ch.close.length > 0 || ch.up.length > 0 || ch.down.length > 0 || er) && (
            <div class="edsum">
              {er && <div class="neg">{er}</div>}
              {ch.open.map(x => (
                <div class="pos" key={x}>
                  {UI('plus', 15)}
                  {x} opens
                </div>
              ))}
              {ch.up.map(x => (
                <div class="pos" key={x}>
                  {UI('arrow-up', 15)}
                  {x}
                </div>
              ))}
              {ch.down.map(x => (
                <div class="wrn" key={x}>
                  {UI('arrow-down', 15)}
                  {x}
                </div>
              ))}
              {ch.close.map(x => (
                <div class="neg" key={x}>
                  {UI('x', 15)}
                  {x} closes
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
      <footer class="edbar">
        <nav class="edtools">
          {MODES.map(([m, n, i, k]) => (
            <button
              class={e.mode === m ? 'on' : ''}
              key={m}
              title={`${n} (${k})`}
              onClick={() => {
                audio.play('tap');
                setMode(m);
              }}
            >
              {UI(i, 20)}
              <span>{n}</span>
            </button>
          ))}
        </nav>
        <div class="edpane">
          <Pane />
        </div>
      </footer>
    </>
  );
}
/** room names floating over the plan */
function Labels() {
  const e = ed!;
  const st = hqv().statuses;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const f = () => {
      raf = requestAnimationFrame(f);
      const box = ref.current;
      if (!box || !ed) return;
      for (const n of Array.from(box.children) as HTMLElement[]) {
        // towards the far wall, so that the name does not cover the furniture
        const a = hqv().yaw;
        const [x, y] = hqv().project(
          +n.dataset.x! - Math.sin(a) * +n.dataset.w! * 0.36,
          0.2,
          +n.dataset.z! - Math.cos(a) * +n.dataset.h! * 0.36,
        );
        n.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      }
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div class="edlabels" ref={ref}>
      {st.map(s => {
        const g = s.region;
        if (!g) return null;
        return (
          <div
            key={s.zone.id + s.zone.type}
            data-x={g.x + g.w / 2}
            data-z={g.y + g.h / 2}
            data-w={g.w}
            data-h={g.h}
            class={s.lvl ? '' : 'off'}
          >
            {roomName(s.zone.type, s.zone.title)}
            {s.lvl ? <Lv n={s.lvl} /> : UI('triangle-alert', 14)}
          </div>
        );
      })}
      {e.q.zones.length === 0 && null}
    </div>
  );
}
export const Lv = ({ n }: { n: number }) => (
  <span class="row" style={{ gap: 3 }} aria-label={`level ${n} of 3`}>
    {[1, 2, 3].map(i => (
      <i key={i} style={{ width: 7, height: 13, background: i <= n ? (i === 3 ? 'var(--amber)' : 'var(--t1)') : 'var(--k4)' }} />
    ))}
  </span>
);
function Pane() {
  const e = ed!;
  const g = G_();
  const club = { c1: g.club.c1, c2: g.club.c2, c3: g.club.c3 };
  if (e.carry?.k === 'room') return <p class="edhint">Put the room down where you want it. Esc to cancel.</p>;
  if (e.carry?.k === 'item') return <p class="edhint">Click to put it down. R turns it, Esc cancels.</p>;
  if (e.mode === 'select')
    return (
      <div class="edhint">
        <p>Click a room to change its purpose, size or place. Click furniture to move, turn, copy or sell it, or drag it straight away.</p>
        <p class="mut">
          Drag the ground to move the view, right-drag to turn it, wheel to zoom, WASD also works. R turns, Delete sells, Ctrl Z undoes.
        </p>
      </div>
    );
  if (e.mode === 'item') return <Catalogue club={club} />;
  if (e.mode === 'preset') return <Presets club={club} />;
  if (e.mode === 'room' || e.mode === 'wall')
    return (
      <div class="edcols">
        <p class="edhint">
          {e.mode === 'room'
            ? 'Drag a rectangle on your land. Rooms may share walls.'
            : 'Drag along the grid to put up a wall. Split a room in two, or fence the garden.'}
          <span class="mut">
            {' '}
            Wall {$(PRICE.wall)} a metre{e.mode === 'room' ? ', floor by the tile' : ''}.
          </span>
        </p>
        {e.mode === 'room' && (
          <Styles list={FLOORS} cur={e.floor === '.' ? 'a' : e.floor} set={k => (e.floor = k)} club={club} unit="tile" />
        )}
        <Styles list={WALLS} cur={e.paint} set={k => (e.paint = k)} club={club} unit="m" wall />
      </div>
    );
  if (e.mode === 'open')
    return (
      <div class="edcols">
        <div class="opts" style={{ padding: '4px 0' }}>
          <B k={e.open === 'D' ? 'on' : ''} onClick={() => ((e.open = 'D'), paintOver(), bump())}>
            {UI('door-open', 18)}Door, {$(PRICE.door)}
          </B>
          <B k={e.open === 'W' ? 'on' : ''} onClick={() => ((e.open = 'W'), paintOver(), bump())}>
            {UI('app-window', 18)}Window, {$(PRICE.window)}
          </B>
        </div>
        <p class="edhint">
          Click a wall. Click again to close it up. <span class="mut">Every room needs a way in from the street.</span>
        </p>
      </div>
    );
  if (e.mode === 'floor' || e.mode === 'paint')
    return (
      <div class="edcols">
        <div class="opts" style={{ padding: '4px 0' }}>
          <B k={'s ' + (e.whole ? '' : 'on')} onClick={() => ((e.whole = false), paintOver(), bump())}>
            {e.mode === 'floor' ? 'Drag an area' : 'One wall'}
          </B>
          <B k={'s ' + (e.whole ? 'on' : '')} onClick={() => ((e.whole = true), paintOver(), bump())}>
            Whole room
          </B>
          {e.mode === 'floor' && (
            <B k={'s d ' + (e.floor === '.' ? 'on' : '')} onClick={() => ((e.floor = '.'), (e.whole = false), paintOver(), bump())}>
              Take floor up
            </B>
          )}
        </div>
        {e.mode === 'floor' ? (
          <Styles list={FLOORS} cur={e.floor} set={k => (e.floor = k)} club={club} unit="tile" />
        ) : (
          <Styles list={WALLS} cur={e.paint} set={k => (e.paint = k)} club={club} unit="m" wall />
        )}
      </div>
    );
  if (e.mode === 'erase')
    return (
      <p class="edhint">
        Click furniture, a wall or a whole room to remove it. Furniture returns 60%, walls 40% and floors 30% of their price.
      </p>
    );
  return <Land />;
}
function Styles({
  list,
  cur,
  set,
  club,
  unit,
  wall,
}: {
  list: Style[];
  cur: string;
  set: (k: string) => void;
  club: any;
  unit: string;
  wall?: boolean;
}) {
  return (
    <div class="edswatches">
      {list.map(s => (
        <button
          key={s.k}
          class={cur === s.k ? 'on' : ''}
          title={`${s.name}, ${$(s.price)} a ${unit}`}
          onClick={() => {
            audio.play('tap');
            set(s.k);
            paintOver();
            bump();
          }}
        >
          <Swatch s={s} club={club} wall={wall} />
          <span>{s.name}</span>
          <small>{s.price ? $(s.price) : 'free'}</small>
        </button>
      ))}
    </div>
  );
}
function Swatch({ s, club, wall }: { s: Style; club: any; wall?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const x = c.getContext('2d')!;
    const hex = (q: string) => (q === '@1' ? club.c1 : q === '@2' ? club.c2 : q);
    if (wall) {
      x.fillStyle = hex(s.c1);
      x.fillRect(0, 0, 66, 40);
      x.fillStyle = hex(s.c2);
      if (s.kind === 'brick')
        for (let j = 0; j < 5; j++) {
          x.fillRect(0, j * 8, 66, 1);
          for (let i = 0; i < 5; i++) x.fillRect(i * 16 + (j % 2) * 8, j * 8, 1, 8);
        }
      else if (s.kind === 'panel') for (let i = 0; i < 6; i++) x.fillRect(i * 12, 0, 2, 40);
    } else x.drawImage(floorSwatch(s, club), 0, 0, 66, 40, 0, 0, 66, 40);
  }, [s, club.c1, club.c2]);
  return <canvas ref={ref} width={66} height={40} />;
}
/** thumbnails are rendered a few per frame so the panel opens at once */
function Thumb({ k, make }: { k: string; make: () => string }) {
  const [u, setU] = useState('');
  useEffect(() => {
    let on = true;
    jobs.push(() => on && setU(make()));
    pump();
    return () => {
      on = false;
    };
  }, [k]);
  return u ? <img src={u} alt="" draggable={false} /> : <span class="ph" />;
}
const jobs: (() => void)[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const f = () => {
    const t = performance.now();
    while (jobs.length && performance.now() - t < 12) jobs.shift()!();
    if (jobs.length) requestAnimationFrame(f);
    else pumping = false;
  };
  requestAnimationFrame(f);
}
const worth = (f: Furn): string => {
  const L = Object.entries(f.pts ?? {}).filter(x => x[0] !== '*') as [RoomType, number][];
  L.sort((a, b) => b[1] - a[1]);
  return L.slice(0, 3)
    .map(([t, n]) => `${ROOMS[t].name} +${n}`)
    .join(', ');
};
function Catalogue({ club }: { club: any }) {
  const e = ed!;
  const list = FURN_LIST.filter(f => f.cat === e.cat);
  return (
    <div class="edcat">
      <div class="edcats">
        {CATS.map(([c, n]) => (
          <button
            key={c}
            class={c === e.cat ? 'on' : ''}
            onClick={() => {
              audio.play('tap');
              e.cat = c;
              bump();
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div class="edgrid">
        {list.map(f => (
          <button
            key={f.id}
            class={e.item === f.id ? 'on' : ''}
            title={`${f.name}, ${f.w / 2} × ${f.d / 2} m${worth(f) ? '\n' + worth(f) : ''}`}
            onClick={() => {
              audio.play('tap');
              e.item = f.id;
              paintOver();
              bump();
            }}
          >
            <Thumb k={f.id + club.c1} make={() => itemThumb(f.id, club)} />
            <b>{f.name}</b>
            <small>{$(f.price)}</small>
          </button>
        ))}
      </div>
      <div class="edinfo">
        {e.item && FURN[e.item] ? (
          <>
            <b>{FURN[e.item].name}</b>
            <span class="sm sec">
              {FURN[e.item].w / 2} × {FURN[e.item].d / 2} m
              {FURN[e.item].wall ? ', hangs on a wall' : FURN[e.item].flat ? ', people walk over it' : ''}
              {FURN[e.item].out ? ', also outdoors' : ''}
            </span>
            <span class="sm" style={{ color: 'var(--win)' }}>
              {worth(FURN[e.item]) || (FURN[e.item].pts?.['*'] ? `Any room +${FURN[e.item].pts!['*']}` : needFor(FURN[e.item]))}
            </span>
            <span class="sm mut">{FURN[e.item].wall ? 'Turns itself to the wall' : 'R turns it'}</span>
          </>
        ) : (
          <span class="sm mut">Pick something, then click where it goes.</span>
        )}
      </div>
    </div>
  );
}
const needFor = (f: Furn) => {
  const t = ROOM_TYPES.filter(r => NEEDS[r].need.some(n => f.is?.includes(n[0])));
  return t.length ? `Needed for: ${t.map(x => ROOMS[x].name.toLowerCase()).join(', ')}` : '';
};
function Presets({ club }: { club: any }) {
  const e = ed!;
  const g = G_();
  const ts = TITLES.filter(x => g.squads[x]);
  const list = ROOM_TYPES.flatMap((t): { t: RoomType; title?: TitleId }[] => (t === 'practice' ? ts.map(x => ({ t, title: x })) : [{ t }]));
  return (
    <div class="edcat">
      <div class="edcats">
        {[1, 2, 3].map(l => (
          <button
            key={l}
            class={e.lvl === l ? 'on' : ''}
            onClick={() => {
              audio.play('tap');
              e.lvl = l;
              if (e.preset) e.preset.lvl = l;
              paintOver();
              bump();
            }}
          >
            Level {l}
          </button>
        ))}
        <button
          class={e.flip ? 'on' : ''}
          title="R"
          onClick={() => {
            e.flip = !e.flip;
            paintOver();
            bump();
          }}
        >
          Door at the back
        </button>
      </div>
      <div class="edgrid wide">
        {list.map(({ t, title }) => {
          const p = template(t, e.lvl);
          const on = e.preset?.type === t && e.preset.title === title;
          const has = hqv().statuses.some(s => s.lvl && s.zone.type === t && s.zone.title === title);
          return (
            <button
              key={t + (title ?? '')}
              class={on ? 'on' : ''}
              title={ROOMS[t].desc + '\n' + ROOMS[t].fx[e.lvl - 1]}
              onClick={() => {
                audio.play('tap');
                e.preset = { type: t, lvl: e.lvl, title };
                paintOver();
                bump();
              }}
            >
              <Thumb k={t + e.lvl + club.c1} make={() => roomThumb(t, e.lvl, club)} />
              <b>
                {roomName(t, title)}
                {has && <i class="edhas">{UI('check', 13)}</i>}
              </b>
              <small>
                {p.w} × {p.h} · {$(templateCost(t, e.lvl))}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Land() {
  const e = ed!;
  const g = G_();
  const S = SITES[g.site];
  const go = (side: 'n' | 'e' | 's' | 'w', n: number) => {
    if (n > 0 && ((side === 'e' || side === 'w' ? e.q.w + n > S.mw : e.q.h + n > S.mh) as boolean)) {
      toast(`The neighbours will not sell more. ${S.name}: ${S.mw} × ${S.mh} m at most`, 'err');
      audio.play('error');
      return;
    }
    if (commit(d => d.land(side, n))) hqv().shift(side === 'w' ? n : 0, side === 'n' ? n : 0);
  };
  const Side = ({ s, n }: { s: 'n' | 'e' | 's' | 'w'; n: string }) => (
    <div class="edland">
      <span>{n}</span>
      <B k="s" onClick={() => go(s, -1)}>
        −
      </B>
      <B k="s" onClick={() => go(s, 1)}>
        +
      </B>
      <B k="s" onClick={() => go(s, 4)}>
        +4
      </B>
    </div>
  );
  const extra = Math.max(0, e.q.w * e.q.h - S.w * S.h);
  return (
    <div class="edcols">
      <div class="edlands">
        <Side s="n" n="Back" />
        <Side s="s" n="Street" />
        <Side s="w" n="Left" />
        <Side s="e" n="Right" />
      </div>
      <p class="edhint">
        {S.name}: {e.q.w} × {e.q.h} m now, up to {S.mw} × {S.mh}. Land beyond {S.w * S.h} m² costs {$(S.land)} a tile once and $
        {S.landRent.toFixed(2)} a week.
        {extra > 0 && (
          <span class="am">
            {' '}
            {extra} extra tiles, {$(Math.round(extra * S.landRent))} a week.
          </span>
        )}
      </p>
    </div>
  );
}
/** whose desk this is; a desk has to exist before anybody can have it */
function SeatPick({ it, fresh }: { it: Item; fresh: boolean }) {
  const g = G_();
  const t = (Object.keys(g.squads) as TitleId[]).find(x => desks(g, x).some(i => i.id === it.id));
  if (fresh || !t) return <span class="sm mut">Build first, then choose who sits here.</span>;
  const who = deskMate(g, t, it.id);
  return (
    <div class="fld">
      <span class="lab">Who sits here</span>
      <div class="edseat">
        {g.squads[t]!.lineup.map(id =>
          id ? (
            <button
              key={id}
              class={id === who ? 'on' : ''}
              title={g.players[id].nick}
              aria-label={`${g.players[id].nick} sits here`}
              onClick={() => id !== who && act({ t: 'seat', title: t, pid: id, item: it.id })}
            >
              <PFace p={g.players[id]} s="100%" px={48} />
            </button>
          ) : null,
        )}
      </div>
      {who && <span class="sm sec">{g.players[who].nick}</span>}
    </div>
  );
}
function ItemCard() {
  const e = ed!;
  const it = e.d.items.find(i => i.id === (e.sel as any).id);
  if (!it) return null;
  const f = FURN[it.f];
  const fresh = !e.base.items.some(i => i.id === it.id);
  return (
    <div class="edcard">
      <h3>{f.name}</h3>
      <span class="sm sec">
        {f.w / 2} × {f.d / 2} m, {fresh ? `new, ${$(f.price)}` : `sells for ${$(Math.round(f.price * 0.6))}`}
      </span>
      {(worth(f) || needFor(f)) && <span class="sm pos">{worth(f) || needFor(f)}</span>}
      {it.f === 'station' && <SeatPick it={it} fresh={fresh} />}
      <div class="row w" style={{ gap: 6 }}>
        <B
          k="s"
          onClick={() => {
            e.carry = { k: 'item', it: { ...it }, dx: 0, dz: 0 };
            paintOver();
            bump();
          }}
        >
          {UI('move', 16)}Move
        </B>
        {!f.wall && (
          <B k="s" onClick={turn}>
            {UI('rotate-cw', 16)}Turn
          </B>
        )}
        <B
          k="s"
          onClick={() => {
            e.carry = { k: 'item', it: { ...it }, dx: 0, dz: 0, copy: true };
            paintOver();
            bump();
          }}
        >
          {UI('copy', 16)}Copy
        </B>
        <B k="s d" onClick={remove}>
          {UI('trash', 16)}Sell
        </B>
      </div>
    </div>
  );
}
function RoomCard() {
  const e = ed!;
  const g = G_();
  const s0 = e.sel as { k: 'room'; x: number; y: number };
  const id = regionAt(s0.x, s0.y);
  const R = hqv().regions;
  const r = R.list[id];
  if (!r) return null;
  const st = hqv().statuses.find(s => s.region?.id === id);
  const ts = TITLES.filter(x => g.squads[x]);
  const need = st ? NEEDS[st.zone.type] : null;
  const rect = r.area === r.w * r.h;
  const pull = (side: 'n' | 'e' | 's' | 'w', n: number) => {
    const f = (d: Draft) => d.stretch(id, side, n);
    const x = e.sel as any;
    if (commit(f)) {
      // keep hold of the same room when its corner moved
      if (side === 'w' && n < 0 && x.x < r.x - n) x.x = r.x - n;
      if (side === 'n' && n < 0 && x.y < r.y - n) x.y = r.y - n;
      if (side === 'e' && n < 0 && x.x >= r.x + r.w + n) x.x = r.x + r.w + n - 1;
      if (side === 's' && n < 0 && x.y >= r.y + r.h + n) x.y = r.y + r.h + n - 1;
      e.sel = x;
      paintOver();
      bump();
    }
  };
  const val = st ? st.zone.type + (st.zone.title ? ':' + st.zone.title : '') : '';
  const ideas = st
    ? FURN_LIST.filter(f => (f.pts?.[st.zone.type] ?? 0) >= 1)
        .sort((a, b) => (b.pts![st.zone.type]! * 900) / b.price - (a.pts![st.zone.type]! * 900) / a.price)
        .slice(0, 3)
    : [];
  const Arrows = ({ side, n }: { side: 'n' | 'e' | 's' | 'w'; n: string }) => (
    <div class="edpull">
      <span>{n}</span>
      <button aria-label={n + ' in'} disabled={!rect} onClick={() => pull(side, -1)}>
        −
      </button>
      <button aria-label={n + ' out'} disabled={!rect} onClick={() => pull(side, 1)}>
        +
      </button>
    </div>
  );
  return (
    <div class="edcard">
      <label class="f">
        <span>
          {r.w} × {r.h} m, {r.area} tiles
        </span>
        <select
          value={val}
          onChange={ev => {
            const q = (ev.target as HTMLSelectElement).value.split(':');
            purpose(q[0] as RoomType | '', q[1] as TitleId | undefined);
          }}
        >
          <option value="">Hall, no purpose</option>
          {ROOM_TYPES.flatMap(t =>
            t === 'practice'
              ? ts.map(x => (
                  <option key={x} value={'practice:' + x}>
                    {roomName('practice', x)}
                  </option>
                ))
              : [
                  <option key={t} value={t}>
                    {ROOMS[t].name}
                  </option>,
                ],
          )}
        </select>
      </label>
      {st && need && (
        <>
          <div class="row sb">
            {st.lvl ? <b>Level {st.lvl}</b> : <b class="neg">Not working yet</b>}
            {st.lvl > 0 && <Lv n={st.lvl} />}
          </div>
          <div class="edreq">
            <Req ok={r.area >= need.area} t={`${need.area} tiles or more`} n={`${r.area}`} />
            {need.need.map(([k, n, name]) => (
              <Req
                key={k}
                ok={(st.have[k] ?? 0) >= n}
                t={name + (n > 1 ? ` × ${n}` : '')}
                n={`${st.have[k] ?? 0}`}
                go={() => shop(FURN_LIST.find(f => f.is?.includes(k))!)}
              />
            ))}
            <Req ok={r.enclosed} t="Walls all round" />
            <Req
              ok={r.reach}
              t="A way in"
              go={() => {
                e.open = 'D';
                setMode('open');
              }}
            />
          </div>
          {st.lvl < 3 ? (
            <>
              <div class="row sb sm">
                <span class="sec">Points to level {Math.max(2, st.lvl + 1)}</span>
                <b class="num">
                  {st.points} / {st.lvl >= 2 ? need.p3 : need.p2}
                </b>
              </div>
              <div class="bar">
                <i style={{ width: Math.min(100, (st.points / (st.lvl >= 2 ? need.p3 : need.p2)) * 100) + '%' }} />
              </div>
              <div class="edideas">
                {ideas.map(f => (
                  <button key={f.id} onClick={() => shop(f)}>
                    {f.name} <b>+{f.pts![st.zone.type]}</b>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span class="sm pos">{ROOMS[st.zone.type].fx[2]}</span>
          )}
          {st.lvl > 0 && st.lvl < 3 && <span class="sm mut">Now: {ROOMS[st.zone.type].fx[st.lvl - 1]}</span>}
        </>
      )}
      <div class="edpulls" title={rect ? '' : 'Only rectangular rooms can be stretched'}>
        <Arrows side="n" n="Back" />
        <Arrows side="s" n="Street" />
        <Arrows side="w" n="Left" />
        <Arrows side="e" n="Right" />
      </div>
      <div class="row w" style={{ gap: 6 }}>
        <B
          k="s"
          onClick={() => {
            const p = e.last;
            e.carry = { k: 'room', x: s0.x, y: s0.y, gx: r.x + r.w / 2, gy: r.y + r.h / 2 };
            void p;
            paintOver();
            bump();
          }}
        >
          {UI('move', 16)}Move
        </B>
        <B k="s d" onClick={remove}>
          {UI('trash', 16)}Tear down
        </B>
      </div>
    </div>
  );
}
const Req = ({ ok, t, n, go }: { ok: boolean; t: string; n?: string; go?: () => void }) => {
  const inner = (
    <>
      {UI(ok ? 'check' : 'x', 15)}
      <span class="grow">{t}</span>
      {n !== undefined && !ok && <b class="num">{n}</b>}
      {go && !ok && UI('chevron-right', 15)}
    </>
  );
  return go && !ok ? <button onClick={go}>{inner}</button> : <div class={ok ? 'ok' : ''}>{inner}</div>;
};
/** straight to one piece in the catalogue */
function shop(f: Furn) {
  const e = ed!;
  audio.play('tap');
  e.mode = 'item';
  e.cat = f.cat;
  e.item = f.id;
  e.carry = null;
  e.sel = null;
  paintOver();
  bump();
}
void [UI('undo-2'), UI('redo-2'), FLOOR_BY, WALL_BY];
