import { INC } from '../src/game/incidents.ts';
import type { TitleId } from '../src/data/titles.ts';
const crest: any = {
  shape: 'shield',
  split: 'none',
  icon: 'wolf-head',
  c1: '#112233',
  c2: '#445566',
  c3: '#ffffff',
  icolor: '#ffffff',
  iscale: 1,
  iy: 0,
  border: 2,
  ribbon: '',
  ribbonOn: false,
};
const jersey: any = {
  pattern: 'solid',
  c1: '#112233',
  c2: '#445566',
  c3: '#ffffff',
  collar: 'crew',
  sleeve: 'match',
  crestPos: 'left',
  font: 'wide',
  numColor: '#ffffff',
  sponsor: true,
  away: '#ffffff',
};
export const opts = (origin: string, titles: TitleId[], seed = 'seed1') => ({
  seed,
  mgr: { name: 'Test', nat: 'DK', style: 'mentor' },
  club: {
    name: 'Test Club',
    tag: 'TST',
    c1: '#112233',
    c2: '#445566',
    c3: '#ffffff',
    crest,
    jersey,
    region: 'EU' as const,
    city: 'Copenhagen',
    motto: '',
  },
  origin,
  titles,
  t0: '2026-01-01',
});

/** what an idle manager would do about whatever stopped the day */
export function settleIncident(g: any, d: (a: any) => any): boolean {
  if (!g.life?.inc) return false;
  const L = INC[g.life.inc.id].choices(g, g.life.inc).filter((c: any) => (c.cost ?? 0) <= g.club.cash);
  return d({ t: 'incident', c: L[g.day % L.length].id }).ok;
}
