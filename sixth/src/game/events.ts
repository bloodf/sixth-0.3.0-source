import type { Rng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import type { G, Msg, Player } from './types.ts';
import { staffSkill } from './match.ts';
import { TITLES } from '../data/titles.ts';
export const mine = (g: G) => Object.values(g.players).filter(p => p.team && p.team.endsWith(':me'));
export function msg(g: G, m: Omit<Msg, 'id' | 'day' | 'read'>): Msg {
  const x: Msg = { id: 'm' + g.uid++, day: g.day, read: m.kind === 'match' || m.kind === 'news', ...m };
  g.inbox.unshift(x);
  if (g.inbox.length > 70) {
    const i = g.inbox.findLastIndex(y => y.read && (!y.choices || y.done));
    g.inbox.splice(i >= 0 ? i : g.inbox.length - 1, 1);
  }
  return x;
}
const adj = (p: Player, k: 'morale' | 'stress' | 'energy', d: number) => {
  p[k] = clamp(Math.round((p[k] + d) * 100) / 100, 0, 100);
};
const grp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
interface Evt {
  id: string;
  w: (g: G) => number;
  gap: number;
  make: (g: G, r: Rng) => Omit<Msg, 'id' | 'day' | 'read'> | null;
  pick: (g: G, r: Rng, m: Msg, c: string) => string;
}
const P = (g: G, m: Msg) => g.players[m.data.p];
const all = (g: G, k: 'morale' | 'stress' | 'energy', d: number) => mine(g).forEach(p => adj(p, k, d));
export const EVENTS: Evt[] = [
  {
    id: 'ragequit',
    gap: 0,
    w: () => 0,
    make: () => null,
    pick: (g, r, m, c) => {
      const p = P(g, m);
      const l = g.life.p[p.id];
      const calm = (d: number) => {
        if (l) {
          l.anger = clamp(l.anger - d, 0, 100);
          l.hotd = 0;
        }
      };
      const leave = () => {
        const sq = g.squads[p.title]!;
        sq.lineup = sq.lineup.map(x => (x === p.id ? null : x));
        sq.syn = clamp(sq.syn - 0.04, 0.1, 1);
        p.team = null;
        p.contract = null;
        all(g, 'morale', -4);
      };
      if (c === 'talk') {
        if (r.chance(0.5 + staffSkill(g, 'psych') * 0.3 + (g.mgr.style === 'mentor' ? 0.15 : 0))) {
          calm(55);
          adj(p, 'morale', 14);
          return `${p.nick} pays the driver and comes back in. You are both soaked.`;
        }
        leave();
        return `The taxi does not stop. ${p.nick} is a free agent.`;
      }
      if (c === 'raise') {
        const n = (p.contract?.salary ?? 500) * 4 + 400;
        g.club.cash -= n;
        g.week['Signing fees'] = (g.week['Signing fees'] ?? 0) - n;
        calm(60);
        adj(p, 'morale', 16);
        for (const k of Object.keys(g.life.mess)) g.life.mess[k] = 5;
        return `$${grp(n)} and a house you can see the floor of. ${p.nick} stays.`;
      }
      if (c === 'week') {
        calm(70);
        adj(p, 'morale', 10);
        adj(p, 'energy', 20);
        p.injury = Math.max(p.injury, 7);
        p.injuryName = 'at home';
        return `Seven days of mother’s cooking. ${p.nick} sends a picture of a lake.`;
      }
      leave();
      return `A handshake on the pavement. ${p.nick} is a free agent, and the others do the maths.`;
    },
  },
  {
    id: 'argue',
    gap: 24,
    w: g => (mine(g).length >= 5 ? 1 + mine(g).reduce((s, p) => s + p.stress, 0) / 400 : 0),
    make: (g, r) => {
      const sq = Object.values(g.squads)[0]!;
      const L = mine(g).filter(p => p.title === sq.title);
      if (L.length < 2) return null;
      r.shuffle(L);
      return {
        kind: 'event',
        from: 'Practice room',
        title: `${L[0].nick} and ${L[1].nick} stopped talking`,
        body: `It started over a call in scrims and ended with two headsets on the desk. The others are pretending to check their phones.`,
        data: { p: L[0].id, q: L[1].id },
        choices: [
          { id: 'med', label: 'Sit them down together', hint: 'Better with a psychologist on staff' },
          { id: 'a', label: `Back ${L[0].nick}`, hint: 'Quick, but somebody loses' },
          { id: 'let', label: 'Let them sort it out', hint: 'They are adults. Mostly.' },
        ],
      };
    },
    pick: (g, r, m, c) => {
      const a = P(g, m),
        b = g.players[m.data.q];
      const sk = staffSkill(g, 'psych');
      if (c === 'med') {
        if (r.chance(0.5 + sk * 0.45)) {
          [a, b].forEach(p => {
            adj(p, 'morale', 6);
            adj(p, 'stress', -8);
          });
          const s = g.squads[a.title];
          if (s) s.syn = clamp(s.syn + 0.04, 0, 1);
          return 'They talk for an hour and come out laughing about something else.';
        }
        [a, b].forEach(p => adj(p, 'stress', 6));
        return 'Both say the right words. Neither means them yet.';
      }
      if (c === 'a') {
        adj(a, 'morale', 7);
        adj(b, 'morale', -12);
        adj(b, 'stress', 8);
        return `${b.nick} nods and goes quiet for the rest of the day.`;
      }
      if (r.chance(0.45)) {
        return 'By dinner it is forgotten.';
      }
      const s = g.squads[a.title];
      if (s) s.syn = clamp(s.syn - 0.06, 0, 1);
      [a, b].forEach(p => adj(p, 'morale', -5));
      return 'It is not forgotten. Comms are short all week.';
    },
  },
  {
    id: 'viral',
    gap: 30,
    w: g => 0.7 + staffSkill(g, 'content'),
    make: (g, r) => {
      const p = r.pick(mine(g));
      if (!p) return null;
      return {
        kind: 'event',
        from: 'Socials',
        title: `A clip of ${p.nick} is everywhere`,
        body: 'Two million views before lunch. Somebody has already made it into a ringtone.',
        data: { p: p.id },
        choices: [
          { id: 'lean', label: 'Lean into it', hint: 'Fans now, focus later' },
          { id: 'merch', label: 'Print a shirt', hint: '$4,000 up front' },
          { id: 'calm', label: 'Keep the player out of it', hint: 'Protect the routine' },
        ],
      };
    },
    pick: (g, r, m, c) => {
      const p = P(g, m);
      const f = Math.round(400 + g.club.fans * 0.05);
      if (c === 'lean') {
        g.club.fans += f;
        p.fame += 8;
        adj(p, 'stress', 6);
        return `+${f} fans. ${p.nick} has not slept much.`;
      }
      if (c === 'merch') {
        g.club.cash -= 4000;
        const inc = Math.round(r.range(1500, 4500) + g.club.fans * 0.22);
        g.club.cash += inc;
        g.club.fans += Math.round(f * 0.5);
        return `The run sells for $${grp(inc)}.`;
      }
      adj(p, 'morale', 3);
      adj(p, 'stress', -3);
      return `${p.nick} is grateful and back in the server by two.`;
    },
  },
  {
    id: 'home',
    gap: 30,
    w: g => (mine(g).some(p => p.age < 21) ? 0.8 : 0.2),
    make: (g, r) => {
      const L = mine(g).filter(p => p.age < 22 || p.traits.includes('homebody'));
      if (!L.length) return null;
      const p = r.pick(L);
      return {
        kind: 'event',
        from: p.nick,
        title: `${p.nick} is homesick`,
        body: `"I keep thinking about the kitchen at my parents' place. I know it sounds stupid."`,
        data: { p: p.id },
        choices: [
          { id: 'fly', label: 'Three days at home', hint: '$900, misses practice' },
          { id: 'fam', label: 'Fly the family in', hint: '$2,200' },
          { id: 'push', label: 'Stay focused', hint: 'Free' },
        ],
      };
    },
    pick: (g, _r, m, c) => {
      const p = P(g, m);
      if (c === 'fly') {
        g.club.cash -= 900;
        adj(p, 'morale', 14);
        adj(p, 'stress', -18);
        adj(p, 'energy', 10);
        const s = g.squads[p.title];
        if (s) s.fam = clamp(s.fam - 0.03, 0, 1);
        return `${p.nick} comes back with a bag of food for everyone.`;
      }
      if (c === 'fam') {
        g.club.cash -= 2200;
        adj(p, 'morale', 18);
        adj(p, 'stress', -14);
        all(g, 'morale', 2);
        return 'A mother has reorganised your kitchen. Nobody complains.';
      }
      adj(p, 'morale', -10);
      adj(p, 'stress', 9);
      return `"Sure." ${p.nick} goes back to the practice room.`;
    },
  },
  {
    id: 'fix',
    gap: 120,
    w: g => (g.club.rep < 40 ? 0.35 : 0.1),
    make: (g, r) => {
      const p = r.pick(mine(g));
      if (!p) return null;
      return {
        kind: 'event',
        from: 'Unknown number',
        title: 'An offer to lose',
        body: `A message to ${p.nick}: one map, lost on purpose, twenty thousand dollars. They forwarded it to you without a word.`,
        data: { p: p.id },
        choices: [
          { id: 'report', label: 'Report it to the league', hint: 'Integrity first' },
          { id: 'ignore', label: 'Delete it', hint: 'No paperwork' },
        ],
      };
    },
    pick: (g, r, m, c) => {
      const p = P(g, m);
      if (c === 'report') {
        g.club.rep = clamp(g.club.rep + 3, 0, 100);
        adj(p, 'morale', 8);
        return 'The league opens a case and thanks you publicly.';
      }
      if (r.chance(0.3)) {
        g.club.rep = clamp(g.club.rep - 5, 0, 100);
        g.club.cash -= 8000;
        return 'A journalist finds the thread. The league fines you $8,000 for not reporting it.';
      }
      return 'Nothing comes of it. You think about it anyway.';
    },
  },
  {
    id: 'flu',
    gap: 40,
    w: g => 0.6 - staffSkill(g, 'chef') * 0.4,
    make: () => ({
      kind: 'event',
      from: 'Kitchen',
      title: 'Something is going around',
      body: 'Two players are coughing and the third is wearing a scarf indoors.',
      choices: [
        { id: 'rest', label: 'Everyone rests today', hint: 'Lose a day of sharpness' },
        { id: 'doc', label: 'Call a doctor', hint: '$1,200' },
        { id: 'play', label: 'Practise through it', hint: 'Risky' },
      ],
    }),
    pick: (g, r, _m, c) => {
      if (c === 'rest') {
        all(g, 'energy', 6);
        Object.values(g.squads).forEach(s => {
          s!.fam = clamp(s!.fam - 0.02, 0, 1);
        });
        return 'Soup, films, an early night.';
      }
      if (c === 'doc') {
        g.club.cash -= 1200;
        all(g, 'energy', 3);
        return 'A day later it has passed.';
      }
      if (r.chance(0.55)) {
        all(g, 'energy', -16);
        return 'By evening all of them have it.';
      }
      return 'Somehow it fades on its own.';
    },
  },
  {
    id: 'landlord',
    gap: 70,
    w: g => (g.site <= 1 ? 0.6 : 0),
    make: () => ({
      kind: 'event',
      from: 'Landlord',
      title: 'Noise complaint',
      body: '"The neighbours hear shouting at one in the morning. Something about a rotate."',
      choices: [
        { id: 'foam', label: 'Fit acoustic panels', hint: '$2,500' },
        { id: 'curfew', label: 'Quiet after eleven', hint: 'Less late practice' },
        { id: 'pay', label: 'Send flowers', hint: '$200' },
      ],
    }),
    pick: (g, r, _m, c) => {
      if (c === 'foam') {
        g.club.cash -= 2500;
        all(g, 'stress', -3);
        return 'It even sounds better on stream.';
      }
      if (c === 'curfew') {
        all(g, 'energy', 8);
        Object.values(g.squads).forEach(s => {
          s!.fam = clamp(s!.fam - 0.02, 0, 1);
        });
        return 'Everyone sleeps. Some of them hate it.';
      }
      g.club.cash -= 200;
      if (r.chance(0.5)) {
        g.club.cash -= 1500;
        return 'The flowers were not enough. You are fined $1,500.';
      }
      return 'The neighbours come to a match.';
    },
  },
  {
    id: 'charity',
    gap: 60,
    w: g => (g.club.fans > 2500 ? 0.6 : 0.2),
    make: () => ({
      kind: 'event',
      from: 'Children’s hospital',
      title: 'A charity stream',
      body: 'Twelve hours on Sunday. They are asking for your players, not your money.',
      choices: [
        { id: 'yes', label: 'Do all twelve hours', hint: 'Fans and goodwill, tired players' },
        { id: 'short', label: 'Do three hours', hint: 'A fair compromise' },
        { id: 'no', label: 'Donate instead', hint: '$3,000' },
      ],
    }),
    pick: (g, _r, _m, c) => {
      if (c === 'yes') {
        all(g, 'energy', -12);
        all(g, 'morale', 6);
        g.club.fans += Math.round(500 + g.club.fans * 0.04);
        g.club.rep = clamp(g.club.rep + 2, 0, 100);
        return 'Eleven hours in, somebody reads a letter and the whole room goes quiet.';
      }
      if (c === 'short') {
        all(g, 'energy', -4);
        all(g, 'morale', 3);
        g.club.fans += Math.round(250 + g.club.fans * 0.015);
        return 'Good energy, good cause, home by nine.';
      }
      g.club.cash -= 3000;
      g.club.rep = clamp(g.club.rep + 1, 0, 100);
      return 'They send a drawing of your crest.';
    },
  },
  {
    id: 'burn',
    gap: 14,
    w: g => (mine(g).some(p => p.stress > 70) ? 2.2 : 0),
    make: (g, r) => {
      const L = mine(g).filter(p => p.stress > 70);
      if (!L.length) return null;
      const p = r.pick(L);
      return {
        kind: 'event',
        from: p.nick,
        title: `${p.nick} wants a break`,
        body: '"I load in and I feel nothing. I do not want to let anyone down, but I think I am."',
        data: { p: p.id },
        choices: [
          { id: 'week', label: 'Take five days', hint: 'Unavailable, fully reset' },
          { id: 'psy', label: 'Daily sessions', hint: 'Needs a psychologist' },
          { id: 'push', label: 'Finish the season', hint: 'Danger' },
        ],
      };
    },
    pick: (g, r, m, c) => {
      const p = P(g, m);
      if (c === 'week') {
        p.injury = 5;
        p.injuryName = 'on leave';
        adj(p, 'stress', -55);
        adj(p, 'morale', 12);
        return 'The phone is off. Good.';
      }
      if (c === 'psy') {
        const sk = staffSkill(g, 'psych');
        if (sk > 0) {
          adj(p, 'stress', -18 - 22 * sk);
          adj(p, 'morale', 6);
          return 'It helps. Slowly, then noticeably.';
        }
        adj(p, 'stress', -4);
        return 'There is nobody on staff to do it properly.';
      }
      if (r.chance(0.6)) {
        p.injury = 16;
        p.injuryName = 'burnout';
        adj(p, 'morale', -20);
        return `Three days later ${p.nick} cannot get out of bed.`;
      }
      adj(p, 'morale', -8);
      return `${p.nick} nods. You both know it is a loan.`;
    },
  },
  {
    id: 'media',
    gap: 21,
    w: g => (g.streak <= -3 ? 1.4 : 0),
    make: g => ({
      kind: 'event',
      from: 'Press',
      title: 'Questions about the losing run',
      body: `${-g.streak} defeats in a row. A reporter asks who is responsible.`,
      choices: [
        { id: 'me', label: '"I am."', hint: 'Take it yourself' },
        { id: 'proc', label: '"Trust the process."', hint: 'Neutral' },
        { id: 'them', label: '"They need to want it."', hint: 'Public challenge' },
      ],
    }),
    pick: (g, r, _m, c) => {
      if (c === 'me') {
        all(g, 'morale', 6);
        all(g, 'stress', -5);
        g.club.rep = clamp(g.club.rep - 1, 0, 100);
        return 'The players heard it. They practise late without being asked.';
      }
      if (c === 'proc') return 'It makes a small, polite headline.';
      if (r.chance(0.4)) {
        all(g, 'morale', 4);
        mine(g).forEach(p => {
          p.form = clamp(p.form + 1, -5, 5);
        });
        return 'It stings, and it works.';
      }
      all(g, 'morale', -9);
      all(g, 'stress', 6);
      return 'It stings. That is all it does.';
    },
  },
  {
    id: 'bootcamp',
    gap: 50,
    w: g => (g.club.rep > 12 ? 0.7 : 0.2),
    make: g => ({
      kind: 'event',
      from: 'Rival club',
      title: 'Bootcamp invitation',
      body: 'A stronger team has a free week and an empty practice room next to theirs.',
      choices: [
        { id: 'go', label: 'Travel', hint: `$${grp(2500 + mine(g).length * 300)}, big gains, tiring` },
        { id: 'online', label: 'Scrim them online', hint: 'Free, smaller gains' },
        { id: 'no', label: 'Stay on plan', hint: 'Rest' },
      ],
    }),
    pick: (g, _r, _m, c) => {
      if (c === 'go') {
        g.club.cash -= 2500 + mine(g).length * 300;
        mine(g).forEach(p => {
          p.attr.sense = clamp(p.attr.sense + 0.5, 0, 99);
          p.attr.team = clamp(p.attr.team + 0.5, 0, 99);
          p.attr.dec = clamp(p.attr.dec + 0.4, 0, 99);
          adj(p, 'energy', -14);
        });
        Object.values(g.squads).forEach(s => {
          s!.fam = clamp(s!.fam + 0.07, 0, 1);
          s!.syn = clamp(s!.syn + 0.04, 0, 1);
        });
        return 'You lose most of the scrims and learn something in all of them.';
      }
      if (c === 'online') {
        Object.values(g.squads).forEach(s => {
          s!.fam = clamp(s!.fam + 0.03, 0, 1);
        });
        return 'Useful. Forty ping of useful.';
      }
      all(g, 'energy', 4);
      return 'They respect the schedule.';
    },
  },
  {
    id: 'tour',
    gap: 45,
    w: g => (g.rooms.some(r => r.type === 'trophy' || r.type === 'lounge') ? 0.6 : 0.1),
    make: () => ({
      kind: 'event',
      from: 'Fan club',
      title: 'Fans would like to visit',
      body: 'Forty people, one minibus, and a cake shaped like your crest.',
      choices: [
        { id: 'yes', label: 'Open the doors', hint: 'Fans and merch' },
        { id: 'video', label: 'Film a tour instead', hint: 'Content' },
      ],
    }),
    pick: (g, _r, _m, c) => {
      if (c === 'yes') {
        const f = Math.round(200 + g.club.fans * 0.025);
        g.club.fans += f;
        g.club.cash += Math.round(f * 3);
        all(g, 'morale', 3);
        all(g, 'energy', -3);
        return `+${f} fans. The cake lasted nine minutes.`;
      }
      g.club.fans += Math.round(120 + g.club.fans * 0.015 * (1 + staffSkill(g, 'content')));
      return 'The tour does well. The fridge becomes a meme.';
    },
  },
  {
    id: 'wrist',
    gap: 35,
    w: g => (mine(g).length ? 0.5 - staffSkill(g, 'therapist') * 0.3 : 0),
    make: (g, r) => {
      const p = r.pick(mine(g));
      if (!p) return null;
      return {
        kind: 'event',
        from: p.nick,
        title: `${p.nick}'s wrist is sore`,
        body: 'Not painful, exactly. Just there, after the third scrim.',
        data: { p: p.id },
        choices: [
          { id: 'rest', label: 'Two days off', hint: 'Safe' },
          { id: 'physio', label: 'Treatment today', hint: 'Needs a physiotherapist' },
          { id: 'play', label: 'Keep an eye on it', hint: 'Could get worse' },
        ],
      };
    },
    pick: (g, r, m, c) => {
      const p = P(g, m);
      if (c === 'rest') {
        p.injury = Math.max(p.injury, 2);
        p.injuryName = 'resting a sore wrist';
        adj(p, 'energy', 12);
        return 'Sensible. Boring. Correct.';
      }
      if (c === 'physio') {
        const sk = staffSkill(g, 'therapist');
        if (r.chance(0.35 + sk * 0.65)) return 'Loosened up and taped. Good as new.';
        p.injury = Math.max(p.injury, 4);
        p.injuryName = 'wrist strain';
        return 'It needed more than a quick look. Four days.';
      }
      if (r.chance(p.traits.includes('glass') ? 0.6 : 0.3)) {
        p.injury = 14;
        p.injuryName = 'wrist strain';
        return 'It got worse. Two weeks.';
      }
      return 'It goes away.';
    },
  },
];
export function rollEvent(g: G, r: Rng) {
  if (g.inbox.some(m => m.kind === 'event' && !m.done) || !mine(g).length || !r.chance(0.17)) return;
  const L = EVENTS.filter(e => (g.lastEvt[e.id] ?? -999) + e.gap <= g.day);
  if (!L.length) return;
  const e = r.weighted(L, x => x.w(g));
  if (e.w(g) <= 0) return;
  const m = e.make(g, r);
  if (!m) return;
  g.lastEvt[e.id] = g.day;
  msg(g, { ...m, data: { ...(m.data ?? {}), e: e.id } });
}
export function resolveEvent(g: G, r: Rng, m: Msg, c: string) {
  const e = EVENTS.find(x => x.id === m.data?.e);
  if (!e || !m.choices?.some(x => x.id === c)) return false;
  if (m.data.p && !g.players[m.data.p]) {
    m.done = 'Time moved on.';
    return true;
  }
  m.done = e.pick(g, r, m, c);
  m.read = true;
  return true;
}
export { adj, TITLES };
