import { genesis, reduce } from '../src/game/reducer.ts';
import { opts, settleIncident } from './fixture.ts';
import { WEEK_PRESETS } from '../src/data/club.ts';
import { mine } from '../src/game/events.ts';
import { myToday } from '../src/game/league.ts';
for (const k of Object.keys(WEEK_PRESETS))
  for (const int of [1, 2]) {
    const g = genesis(opts('backed', ['ow'], 'c'));
    reduce(g, { t: 'week', title: 'ow', week: WEEK_PRESETS[k].week });
    reduce(g, { t: 'intensity', title: 'ow', v: int });
    const out: string[] = [];
    while (g.day < 71) {
      if (settleIncident(g, (a: any) => reduce(g, a))) continue;
      const f = myToday(g);
      if (f) {
        reduce(g, { t: 'delegate', fid: f.id });
        continue;
      }
      for (const m of g.inbox.filter(m => m.choices && !m.done)) reduce(g, { t: 'choose', id: m.id, c: m.choices!.at(-1)!.id });
      reduce(g, { t: 'advance' });
      if (g.day % 14 === 5) {
        const L = mine(g),
          av = (f: any) => Math.round(L.reduce((s, p) => s + f(p), 0) / L.length);
        out.push(`E${av((p: any) => p.energy)} S${av((p: any) => p.stress)} M${av((p: any) => p.morale)}`);
      }
    }
    console.log(
      k,
      int,
      out.join(' | '),
      'fam',
      g.squads.ow!.fam.toFixed(2),
      'syn',
      g.squads.ow!.syn.toFixed(2),
      'W',
      g.stats.w,
      g.stats.l,
      'evt',
      g.inbox.filter(m => m.kind === 'event').length,
    );
  }
