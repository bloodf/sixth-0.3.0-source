import { msg } from './events.ts';
import { newLife, settle } from './life.ts';
import type { G } from './types.ts';
/** Rules 2 -> 3. People get needs, habits and opinions; the house gets dirt. Deterministic, part of the career. */
export function migrate2to3(old: any): G {
  const g = old as G;
  g.life = newLife();
  settle(g);
  const bath = g.rooms.some(r => r.type === 'bath');
  msg(g, {
    kind: 'board',
    from: 'House',
    title: 'They live here now',
    body: `People in the building now get hungry, dirty, bored, lonely and angry, and make friends and enemies. House in the menu shows how they are and sets the rules.${bath ? '' : ' There is no bathroom yet: press B and place one, or wait until somebody else notices.'}`,
  });
  g.rules = 3;
  return g;
}
