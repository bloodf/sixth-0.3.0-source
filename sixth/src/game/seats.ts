/** Who sits where in the practice rooms. Seats belong to people: swap the line-up and everybody keeps their chair. */
import type { TitleId } from '../data/titles.ts';
import { Draft, regionOf, regions, size, type Item } from './build.ts';
import type { G } from './types.ts';
const cache = new WeakMap<object, Map<string, Item[]>>();
/** the desks of one squad, back wall first, left to right */
export function desks(g: G, title: TitleId): Item[] {
  let m = cache.get(g.hq.items);
  if (!m) {
    m = new Map();
    const d = new Draft(g.hq);
    const R = regions(d);
    const st = d.items.filter(i => i.f === 'station').sort((a, b) => a.y - b.y || a.x - b.x);
    for (const z of d.zones)
      if (z.type === 'practice' && z.title) {
        const reg = R.map[z.y * d.w + z.x];
        m.set(z.title, [...(m.get(z.title) ?? []), ...st.filter(i => regionOf(d, i, R) === reg)]);
      }
    cache.set(g.hq.items, m);
  }
  return m.get(title) ?? [];
}
/** desk by place in the line-up; null when there is no desk left */
export function seatsOf(g: G, title: TitleId): (string | null)[] {
  const sq = g.squads[title];
  if (!sq) return [];
  const D = desks(g, title).map(i => i.id);
  const free = new Set(D);
  const out: (string | null)[] = sq.lineup.map(pid => {
    const s = pid ? sq.seats?.[pid] : undefined;
    if (!s || !free.has(s)) return null;
    free.delete(s);
    return s;
  });
  const left = D.filter(x => free.has(x));
  return out.map(s => s ?? left.shift() ?? null);
}
export function deskMate(g: G, title: TitleId, item: string): string | null {
  const i = seatsOf(g, title).indexOf(item);
  return i < 0 ? null : (g.squads[title]!.lineup[i] ?? null);
}
/** the people within an elbow of somebody */
export function neighbours(g: G, pid: string): string[] {
  const p = g.players[pid];
  const sq = p && g.squads[p.title];
  if (!sq) return [];
  const S = seatsOf(g, p.title);
  const me = S[sq.lineup.indexOf(pid)];
  if (!me) return [];
  const D = desks(g, p.title);
  const at = (id: string) => {
    const i = D.find(x => x.id === id)!;
    const [w, h] = size(i);
    return [i.x + w / 2, i.y + h / 2];
  };
  const [x, y] = at(me);
  const out: string[] = [];
  S.forEach((s, k) => {
    const o = sq.lineup[k];
    if (!s || !o || o === pid) return;
    const [a, b] = at(s);
    if ((a - x) * (a - x) + (b - y) * (b - y) <= 4.3 * 4.3) out.push(o);
  });
  return out;
}
