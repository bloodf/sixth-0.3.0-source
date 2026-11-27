import { FEED } from '../src/data/life.ts';
import { nameOf, type Feed } from '../src/game/life.ts';
import { neighbours } from '../src/game/seats.ts';
import type { TitleId } from '../src/data/titles.ts';
export { emoOf, people, rel, relKey } from '../src/game/life.ts';
export const feedText = (g: any, f: Feed) =>
  (FEED[f.k]?.t ?? '')
    .replace(/\{a\}/g, nameOf(g, f.a))
    .replace(/\{b\}/g, f.o ? nameOf(g, f.o) : '')
    .replace(/\{x\}/g, f.x ?? '');
export const neighboursAll = (g: any, t: TitleId) => g.squads[t].lineup.reduce((s: number, id: string) => s + neighbours(g, id).length, 0);
