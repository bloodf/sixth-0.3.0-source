/** Rebuilds a career from its first action. Careers may cross rule versions: each part runs under the rules it was played with. */
import { canon, sha256 } from '../core/hash.ts';
import { genesis, reduce } from '../game/reducer.ts';
import { migrate2to3 } from '../game/migrate.ts';
import { RULES, type Action, type G } from '../game/types.ts';
import * as rules1 from '../legacy/rules1.js';
import * as rules2 from '../legacy/rules2.js';
const ENG: Record<number, { genesis(o: any): any; reduce(g: any, a: any): { ok: boolean; err?: string } }> = {
  1: rules1,
  2: rules2,
  3: { genesis, reduce },
};
/** one step up; each migration is frozen together with the rules it leads to */
const UP: Record<number, (g: any) => any> = { 1: rules2.migrate1to2, 2: migrate2to3 };
export const nextHead = (head: string, a: unknown) => sha256(head + canon(a));
export const upgradeAction = (to = RULES): Action => ({ t: '#upgrade', to });
export class Replay {
  g: any = null;
  head = '';
  rules = 0;
  n = 0;
  /** returns an error, or null when the action is possible */
  step(a: Action): string | null {
    this.head = nextHead(this.head, a);
    const first = this.n++ === 0;
    if (a.t === '#genesis') {
      if (!first) return 'A second beginning';
      this.rules = Number((a as any).rules);
      if (!ENG[this.rules]) return 'Unknown rules';
      this.g = ENG[this.rules].genesis((a as any).opts);
      return null;
    }
    if (first) return 'Does not start at the beginning';
    if (a.t === '#upgrade') {
      if ((a as any).to !== this.rules + 1 || !UP[this.rules]) return 'Impossible upgrade';
      this.g = UP[this.rules](JSON.parse(canon(this.g)));
      this.rules++;
      return null;
    }
    if (a.t[0] === '#') return 'Unknown record';
    const o = ENG[this.rules].reduce(this.g, a);
    return o.ok ? null : (o.err ?? 'Impossible action');
  }
  hash() {
    return sha256(canon(this.g));
  }
}
/** Brings a verified older state up to date, and says which records that takes. */
export function upgrade(g: any, from: number): { g: G; steps: Action[] } {
  const steps: Action[] = [];
  for (let r = from; r < RULES; r++) {
    g = UP[r](JSON.parse(canon(g)));
    steps.push(upgradeAction(r + 1));
  }
  return { g, steps };
}
export const reduceUnder = (rules: number, g: any, a: Action) => ENG[rules].reduce(g, a);
