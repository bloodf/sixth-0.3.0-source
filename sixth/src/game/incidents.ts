/** What goes wrong (and sometimes right) in the building. An incident stops the day until somebody decides. */
import type { Rng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import type { RoomType } from '../data/club.ts';
import type { TitleId } from '../data/titles.ts';
import type { G, Squad } from './types.ts';
import { mine } from './events.ts';
import { staffSkill } from './match.ts';
import { bond, dirt, dirty, emoOf, feel, have, nameOf, note, people, upset, type Incident } from './life.ts';
export type Fx = 'dark' | 'offline' | 'water' | 'smoke' | 'hot' | 'bugs' | 'alarm' | 'party' | 'none';
export interface Choice {
  id: string;
  label: string;
  hint: string;
  cost?: number;
}
export interface IncDef {
  id: string;
  /** train: in the middle of a block; match: on the morning of a match; any: whenever */
  ctx: 'train' | 'match' | 'any';
  gap: number;
  fx: Fx;
  w: (g: G, b: number) => number;
  make?: (g: G, r: Rng, b: number) => Partial<Incident> | null;
  title: (g: G, i: Incident) => string;
  body: (g: G, i: Incident) => string;
  choices: (g: G, i: Incident) => Choice[];
  pick: (g: G, r: Rng, i: Incident, c: string) => string;
  /** share of the block that is lost while everybody waits */
  lose?: number;
}
const lvl = (g: G, t: RoomType) => g.rooms.reduce((m, x) => (x.type === t ? Math.max(m, x.lvl) : m), 0);
const room = (t: RoomType) => (): Partial<Incident> => ({ room: t });
const pay = (g: G, n: number) => {
  g.club.cash -= n;
  g.week['Repairs'] = (g.week['Repairs'] ?? 0) - n;
};
const everyone = (g: G, f: (id: string) => void) => people(g).forEach(f);
const stress = (g: G, d: number, t?: TitleId) =>
  mine(g).forEach(p => (!t || p.title === t) && (p.stress = Math.round(clamp(p.stress + d, 0, 100) * 100) / 100));
const energy = (g: G, d: number, t?: TitleId) =>
  mine(g).forEach(p => (!t || p.title === t) && (p.energy = Math.round(clamp(p.energy + d, 0, 100) * 100) / 100));
const lose = (g: G, v: number) =>
  void (g.life.mods = [...g.life.mods.filter(m => m.k !== 'train' || m.until < g.day), { k: 'train', v, until: g.day, why: 'inc' }]);
const matchMod = (g: G, v: number, why: string) => g.life.mods.push({ k: 'match', v, until: g.day, why });
const sq = (g: G, t?: TitleId) => (t ? g.squads[t] : Object.values(g.squads)[0]) as Squad;
const tech = (g: G) => staffSkill(g, 'tech');
export const INCIDENTS: IncDef[] = [
  {
    id: 'power',
    ctx: 'train',
    gap: 16,
    fx: 'dark',
    w: g => 1.3 - Math.min(0.6, lvl(g, 'workshop') * 0.2),
    title: () => 'The power goes out',
    body: () => 'Mid-round. Every screen black, the fans spinning down, somebody in the dark already swearing. The whole street is out.',
    choices: g => [
      ...(have(g, 'generator')
        ? [{ id: 'gen', label: 'Start the generator', hint: 'Two minutes and everything is back' }]
        : have(g, 'ups')
          ? [{ id: 'ups', label: 'Switch to batteries', hint: 'Enough to finish the block, half the lights' }]
          : []),
      { id: 'call', label: 'Emergency electrician', hint: 'Back within the hour, probably', cost: 900 },
      { id: 'board', label: 'Candles and the whiteboard', hint: 'No practice, but they can still think' },
      { id: 'wait', label: 'Wait it out', hint: 'The block is lost. They might enjoy it' },
    ],
    pick: (g, r, _i, c) => {
      if (c === 'gen') {
        everyone(g, id => feel(g, id, 0.5));
        return 'The generator coughs twice and catches. The round is replayed. Nobody says thank you, which is how you know it worked.';
      }
      if (c === 'ups') {
        lose(g, 0.75);
        return 'They finish on battery, lit by their own monitors. It looks better than it plays.';
      }
      if (c === 'call') {
        pay(g, 900);
        if (r.chance(0.72 + tech(g) * 0.2)) {
          lose(g, 0.7);
          return 'A fuse box older than most of the squad. Forty minutes and the lights are on.';
        }
        lose(g, 0.15);
        stress(g, 3);
        return 'It is the street, not the house. The invoice arrives before the power does.';
      }
      if (c === 'board') {
        lose(g, 0.2);
        for (const s of Object.values(g.squads) as Squad[])
          s.fam = Math.round(clamp(s.fam + 0.006 * (1 + staffSkill(g, 'coach', s.title)), 0.1, 1) * 10000) / 10000;
        everyone(g, id => g.life.p[id] && (g.life.p[id].fun = clamp(g.life.p[id].fun + 4, 0, 100)));
        return 'Candles, a marker, an argument about one angle that lasts an hour and ends with everybody agreeing. Useful, of all things.';
      }
      lose(g, 0);
      const L = people(g);
      for (let k = 0; k < 4 && L.length > 1; k++) {
        const a = r.pick(L),
          o = r.pick(L.filter(x => x !== a));
        bond(g, a, o, 6);
        note(g, g.life.block, 'laugh', a, o, undefined, 'lounge');
      }
      return 'Phone torches, ghost stories, a card game with house rules that change every hand. Nothing trained, something gained.';
    },
  },
  {
    id: 'net',
    ctx: 'train',
    gap: 14,
    fx: 'offline',
    w: g => 1.2 - Math.min(0.7, lvl(g, 'workshop') * 0.22),
    title: () => 'No internet',
    body: () => 'Five disconnects at once. The scrim partner is typing question marks. The provider plays music.',
    choices: g => [
      ...(have(g, 'router') ? [{ id: 'spare', label: 'Switch to the 5G line', hint: 'Already paid for' }] : []),
      ...(tech(g) > 0 ? [{ id: 'tech', label: 'Let the technician at it', hint: 'Better the better they are' }] : []),
      { id: 'phones', label: 'Everybody on phone hotspots', hint: 'Playable. Barely', cost: 60 },
      { id: 'offline', label: 'Offline drills instead', hint: 'Half a block, no arguments' },
    ],
    pick: (g, r, _i, c) => {
      if (c === 'spare') return 'Four bars, nineteen milliseconds. The scrim partner never finds out.';
      if (c === 'tech') {
        if (r.chance(0.35 + tech(g) * 0.55)) {
          lose(g, 0.85);
          return 'A cable behind the sofa, chewed or kicked. Nobody admits anything. Fixed.';
        }
        lose(g, 0.35);
        return 'An hour of “try it now”. Then it comes back by itself.';
      }
      if (c === 'phones') {
        pay(g, 60);
        lose(g, 0.6);
        everyone(g, id => upset(g, id, 4));
        return 'Eighty ping and a monthly allowance gone by dinner.';
      }
      lose(g, 0.5);
      return 'Aim maps and bots. Boring, quiet, not useless.';
    },
  },
  {
    id: 'netmatch',
    ctx: 'match',
    gap: 20,
    fx: 'offline',
    w: g => 1.15 - Math.min(0.7, lvl(g, 'workshop') * 0.22),
    title: () => 'No internet, and a match today',
    body: (g, i) =>
      `The line died overnight. The ${g.teams[i.oth!]?.name ?? 'other side'} lobby opens in a few hours and the admin wants five green lights.`,
    choices: g => [
      ...(have(g, 'router') ? [{ id: 'spare', label: 'Play on the 5G line', hint: 'This is why you bought it' }] : []),
      { id: 'cafe', label: 'Rent a gaming café', hint: 'Good line, wrong chairs', cost: 1200 },
      { id: 'hot', label: 'Phone hotspots', hint: 'Free and shaky: reactions suffer', cost: 60 },
      { id: 'admin', label: 'Ask the league for a short delay', hint: 'They may not care. It goes on the record' },
    ],
    pick: (g, r, i, c) => {
      if (c === 'spare') {
        everyone(g, id => feel(g, id, 1));
        return 'The spare line holds. The admin says “all green” and moves on. Money well spent.';
      }
      if (c === 'cafe') {
        pay(g, 1200);
        stress(g, 5, i.title);
        matchMod(g, 0.99, 'café');
        return 'Five chairs between teenagers and energy drinks. They bring their own keyboards and a lot of hand sanitiser.';
      }
      if (c === 'hot') {
        pay(g, 60);
        matchMod(g, 0.962, 'hotspots');
        stress(g, 8, i.title);
        return 'Five phones on five window sills. Every spike on the graph is a prayer.';
      }
      if (r.chance(0.45 + g.club.rep * 0.004)) {
        g.club.rep = clamp(g.club.rep - 0.4, 0, 100);
        return 'Two hours granted. The provider needs one hour and fifty-two minutes.';
      }
      matchMod(g, 0.975, 'line');
      stress(g, 9, i.title);
      g.club.rep = clamp(g.club.rep - 0.8, 0, 100);
      return 'No delay. The line comes back four minutes before the draft, and nobody has warmed up.';
    },
  },
  {
    id: 'powermatch',
    ctx: 'match',
    gap: 28,
    fx: 'dark',
    w: () => 0.7,
    title: () => 'A fuse goes on match day',
    body: () => 'The practice room goes dark with all ten monitors warm. Hours to go.',
    choices: g => [
      ...(have(g, 'generator') || have(g, 'ups') ? [{ id: 'gen', label: 'Run on backup power', hint: 'Enough for a match' }] : []),
      { id: 'call', label: 'Electrician, now, any price', hint: 'Very likely in time', cost: 1600 },
      { id: 'diy', label: 'Find the fuse yourself', hint: 'Your technician helps, if you have one' },
    ],
    pick: (g, r, i, c) => {
      if (c === 'gen') return 'The backup hums through the whole match. The neighbours wave. You wave back.';
      if (c === 'call') {
        pay(g, 1600);
        if (r.chance(0.9)) return 'Done before lunch, with a lecture about extension leads.';
        matchMod(g, 0.985, 'power');
        return 'Done, just. Warm-up was ten minutes long.';
      }
      if (r.chance(0.3 + tech(g) * 0.6)) {
        stress(g, 2, i.title);
        return 'Behind the freezer, of course. Click. Everything lives.';
      }
      matchMod(g, 0.965, 'power');
      stress(g, 8, i.title);
      return 'Three fuses, two shocks, one monitor that never comes back on. They play on what is left.';
    },
  },
  {
    id: 'ddos',
    ctx: 'match',
    gap: 35,
    fx: 'offline',
    w: g => clamp((g.club.fans - 4000) / 30000, 0, 0.8),
    title: () => 'Somebody is flooding your line',
    body: () => 'Pings in the thousands, and a message from an account without a face: “enjoy the match”.',
    choices: g => [
      ...(have(g, 'router') ? [{ id: 'spare', label: 'Move to the 5G line', hint: 'They do not know that address' }] : []),
      { id: 'vpn', label: 'Pay for protection', hint: 'Scrubbed traffic, a few milliseconds more', cost: 700 },
      { id: 'report', label: 'Report it and hope', hint: 'The league looks into it. Slowly' },
    ],
    pick: (g, r, i, c) => {
      if (c === 'spare') return 'New address, no flood. Somewhere a teenager is very disappointed.';
      if (c === 'vpn') {
        pay(g, 700);
        matchMod(g, 0.993, 'vpn');
        return 'The graph goes flat. Your players pretend not to notice the extra six milliseconds.';
      }
      if (r.chance(0.5)) return 'It stops an hour before the match. Maybe homework.';
      matchMod(g, 0.955, 'flood');
      stress(g, 10, i.title);
      return 'It comes in waves, always in the fourth round. The report number is eleven digits long.';
    },
  },
  {
    id: 'update',
    ctx: 'match',
    gap: 18,
    fx: 'none',
    w: g => 0.9 - lvl(g, 'workshop') * 0.15,
    title: () => 'Four PCs decided to update',
    body: () => '“Working on it, 12%. Do not turn off your computer.” The fifth is fine because its owner never clicked Accept.',
    choices: g => [
      ...(tech(g) > 0 ? [{ id: 'tech', label: 'Technician', hint: 'Knows where the bodies are buried' }] : []),
      { id: 'wait', label: 'Wait and warm up on paper', hint: 'It finishes when it finishes' },
      { id: 'swap', label: 'Borrow the office machines', hint: 'Wrong screens, right time' },
    ],
    pick: (g, r, i, c) => {
      if (c === 'tech') {
        if (r.chance(0.5 + tech(g) * 0.5)) return 'Three key combinations nobody should know. Everything boots.';
        matchMod(g, 0.988, 'update');
        return 'Saved, mostly. One crosshair is pink now and it is not negotiable.';
      }
      if (c === 'wait') {
        if (r.chance(0.6)) return '100% with nine minutes to spare. Somebody kisses a monitor.';
        matchMod(g, 0.975, 'update');
        stress(g, 6, i.title);
        return 'Three of five make it. Two players load in as the pistol round ends.';
      }
      matchMod(g, 0.982, 'office PCs');
      return 'Spreadsheet monitors at sixty hertz. It feels like playing through soup.';
    },
  },
  {
    id: 'refuse',
    ctx: 'match',
    gap: 10,
    fx: 'none',
    w: g => (mine(g).some(p => (g.life.p[p.id]?.anger ?? 0) > 80) ? 4 : 0),
    make: (g, _r) => {
      const p = mine(g)
        .filter(x => g.life.p[x.id].anger > 80)
        .sort((a, b) => g.life.p[b.id].anger - g.life.p[a.id].anger || (a.id < b.id ? -1 : 1))[0];
      return p ? { who: p.id } : null;
    },
    title: (g, i) => `${nameOf(g, i.who!)} refuses to play`,
    body: (g, i) =>
      `“Not with them. Not like this.” The door is locked. The others have opinions about the door, and about ${nameOf(g, i.who!)}.`,
    choices: () => [
      { id: 'listen', label: 'Sit outside the door and listen', hint: 'A psychologist makes this much easier' },
      { id: 'order', label: 'Remind them who pays', hint: 'They will play. They will remember' },
      { id: 'bench', label: 'Play without', hint: 'A stand-in, and a point made' },
    ],
    pick: (g, r, i, c) => {
      const id = i.who!;
      const p = g.players[id];
      if (!p) return 'Too late.';
      if (c === 'listen') {
        if (r.chance(0.5 + staffSkill(g, 'psych') * 0.4 + (g.mgr.style === 'mentor' ? 0.15 : 0))) {
          upset(g, id, -45);
          feel(g, id, 5);
          return 'It was never about the game. After forty minutes the door opens, and nobody mentions it again.';
        }
        upset(g, id, -12);
        matchMod(g, 0.985, 'mood');
        return 'The door opens. The headset goes on. Not one word in the team chat.';
      }
      if (c === 'order') {
        upset(g, id, 8);
        feel(g, id, -9);
        matchMod(g, 0.98, 'mood');
        return 'Contracts are quoted. They play angry and they play badly.';
      }
      const s = g.squads[p.title];
      if (s) s.lineup = s.lineup.map(x => (x === id ? null : x));
      upset(g, id, -10);
      feel(g, id, -6);
      for (const q of mine(g)) if (q.id !== id && q.title === p.title) feel(g, q.id, 2);
      return 'The chair stays empty until the stand-in logs in. The others sit up a little straighter.';
    },
  },
  {
    id: 'flood',
    ctx: 'any',
    gap: 30,
    fx: 'water',
    w: g => (lvl(g, 'bath') ? 0.8 : 0),
    make: room('bath'),
    title: () => 'Water under the bathroom door',
    body: () => 'A pipe, a shower head, or somebody’s experiment. It is spreading towards the hall and the extension leads.',
    choices: () => [
      { id: 'plumb', label: 'Call a plumber', hint: 'Fixed today', cost: 780 },
      { id: 'mop', label: 'Everybody mops', hint: 'Free, wet, oddly good for morale or the opposite' },
      { id: 'shut', label: 'Shut the water off', hint: 'No showers for three days. You will notice' },
    ],
    pick: (g, r, _i, c) => {
      if (c === 'plumb') {
        pay(g, 780);
        return 'A hair ball the size of a fist. The plumber takes a photograph for his colleagues.';
      }
      if (c === 'mop') {
        lose(g, 0.5);
        if (r.chance(0.55)) {
          everyone(g, id => upset(g, id, -4));
          return 'It turns into a sliding competition. The floor has never been cleaner.';
        }
        everyone(g, id => upset(g, id, 7));
        dirty(g, 'bath', 22);
        return 'Two mops, nine people, and a long discussion about whose hair that is.';
      }
      g.life.mods.push({ k: 'nobath', v: 0, until: g.day + 3, why: 'no water' });
      return 'Dry. By Thursday the practice room smells like a locker.';
    },
  },
  {
    id: 'grease',
    ctx: 'any',
    gap: 34,
    fx: 'smoke',
    w: g => (lvl(g, 'kitchen') && staffSkill(g, 'chef') <= 0 ? 0.9 : lvl(g, 'kitchen') ? 0.15 : 0),
    make: (g, r) => ({ room: 'kitchen' as RoomType, who: mine(g).length ? r.pick(mine(g)).id : undefined }),
    title: () => 'The kitchen is on fire',
    body: (g, i) => `${i.who ? nameOf(g, i.who) : 'Somebody'} left a pan on “just for one game”. The smoke alarm has opinions.`,
    choices: g => [
      ...(have(g, 'exting') ? [{ id: 'ext', label: 'Fire extinguisher', hint: 'On the wall, where it should be' }] : []),
      { id: 'lid', label: 'Lid on, gas off', hint: 'The right thing, if hands are steady' },
      { id: 'call', label: 'Everybody out, call the brigade', hint: 'Safe, and the block is gone', cost: 350 },
    ],
    pick: (g, r, i, c) => {
      if (i.who) upset(g, i.who, -5);
      if (c === 'ext') {
        dirty(g, 'kitchen', 18);
        return 'White foam on everything, including dinner. Four seconds, no damage.';
      }
      if (c === 'lid') {
        if (r.chance(0.66)) return 'Smothered. The pan is buried with honours.';
        pay(g, 1900);
        dirty(g, 'kitchen', 35);
        g.life.mods.push({ k: 'nokitchen', v: 0, until: g.day + 4, why: 'fire' });
        stress(g, 6);
        return 'It reaches the hood before it gives up. New cupboards, and takeaway for four days.';
      }
      pay(g, 350);
      lose(g, 0);
      return 'Two engines for one omelette. The neighbours have brought chairs.';
    },
  },
  {
    id: 'roach',
    ctx: 'any',
    gap: 24,
    fx: 'bugs',
    w: g => clamp((dirt(g) - 42) / 16, 0, 3),
    make: room('kitchen'),
    title: () => 'Something moved behind the fridge',
    body: () => 'Six legs, then many more legs. Somebody is standing on a chair and will not come down.',
    choices: () => [
      { id: 'pest', label: 'Pest control', hint: 'Gone by tomorrow', cost: 640 },
      { id: 'clean', label: 'Stop everything and clean', hint: 'The whole block, the whole house' },
      { id: 'none', label: 'It is one insect', hint: 'It is not one insect' },
    ],
    pick: (g, _r, _i, c) => {
      if (c === 'pest') {
        pay(g, 640);
        for (const k of Object.keys(g.life.mess)) g.life.mess[k] = Math.round(g.life.mess[k] * 60) / 100;
        return 'A man with a tank on his back and no questions. The chair is free again.';
      }
      if (c === 'clean') {
        lose(g, 0);
        for (const k of Object.keys(g.life.mess)) g.life.mess[k] = Math.round(g.life.mess[k] * 25) / 100;
        everyone(g, id => upset(g, id, g.life.p[id]?.q.includes('neat') ? -20 : 5));
        return 'Eleven bin bags. Under the sofa they find a headset that was reported stolen in spring.';
      }
      everyone(g, id => upset(g, id, g.life.p[id]?.q.includes('germ') ? 22 : g.life.p[id]?.q.includes('neat') ? 14 : 4));
      for (const k of Object.keys(g.life.mess)) g.life.mess[k] = clamp(g.life.mess[k] + 10, 0, 100);
      return 'They name it. Then they name its children.';
    },
  },
  {
    id: 'bug',
    ctx: 'any',
    gap: 40,
    fx: 'none',
    w: g => clamp(((g.life.mess['kitchen'] ?? 0) - 45) / 20, 0, 2),
    title: () => 'Half the house is in the bathroom',
    body: () => 'The leftovers in the blue box. Nobody remembers whose they were. Everybody had some.',
    choices: () => [
      { id: 'rest', label: 'Cancel today', hint: 'Bed and tea' },
      { id: 'doc', label: 'Doctor and electrolytes', hint: 'Back tomorrow', cost: 480 },
      { id: 'push', label: 'Play through it', hint: 'You would not' },
    ],
    pick: (g, r, _i, c) => {
      const L = mine(g).filter(() => r.chance(0.55));
      const hit = (e: number) => L.forEach(p => (p.energy = Math.round(clamp(p.energy - e, 0, 100) * 100) / 100));
      if (c === 'rest') {
        lose(g, 0);
        hit(8);
        return 'A quiet day. The blue box is burnt in the garden.';
      }
      if (c === 'doc') {
        pay(g, 480);
        lose(g, 0.4);
        hit(5);
        return 'Salt, sugar, and a sentence about fridges that will be repeated for weeks.';
      }
      hit(24);
      everyone(g, id => upset(g, id, 8));
      return 'Two headsets are never worn again.';
    },
  },
  {
    id: 'heat',
    ctx: 'train',
    gap: 30,
    fx: 'hot',
    w: g => (Math.floor(g.day / 91) % 4 === 2 ? 1.6 : 0.35),
    title: () => 'The air conditioning gives up',
    body: () => 'Ten graphics cards, thirty-four degrees, one window. The smell arrives in waves.',
    choices: () => [
      { id: 'fix', label: 'Emergency repair', hint: 'Cool by the evening', cost: 650 },
      { id: 'fans', label: 'Buy every fan in the shop', hint: 'Loud and better than nothing', cost: 180 },
      { id: 'night', label: 'Train at night instead', hint: 'Cooler, and tired tomorrow' },
    ],
    pick: (g, _r, _i, c) => {
      const sweat = (n: number) => people(g).forEach(id => g.life.p[id] && (g.life.p[id].hyg = clamp(g.life.p[id].hyg - n, 0, 100)));
      if (c === 'fix') {
        pay(g, 650);
        lose(g, 0.8);
        sweat(10);
        return 'A capacitor. It is always a capacitor.';
      }
      if (c === 'fans') {
        pay(g, 180);
        lose(g, 0.7);
        sweat(22);
        everyone(g, id => upset(g, id, 3));
        return 'Nine fans, one hurricane. Comms are shouted.';
      }
      energy(g, -9);
      g.life.mods.push({ k: 'nosleep', v: 0, until: g.day, why: 'night shift' });
      return 'It works. At four in the morning somebody is still explaining a retake to the fridge.';
    },
  },
  {
    id: 'party',
    ctx: 'any',
    gap: 32,
    fx: 'party',
    w: (g, b) => (b < 2 ? 0 : 2) + (b < 2 ? 0 : 1) * mine(g).filter(p => g.life.p[p.id]?.q.includes('loud')).length * 0.12,
    title: () => 'The neighbours throw a party',
    body: () => 'Bass through three walls. It is a good party, which makes it worse.',
    choices: () => [
      { id: 'ask', label: 'Ask them nicely', hint: 'Bring cake' },
      { id: 'join', label: 'Go over', hint: 'Fun now, sleep later' },
      { id: 'plugs', label: 'Earplugs for everybody', hint: 'Cheap', cost: 40 },
    ],
    pick: (g, r, _i, c) => {
      if (c === 'ask') {
        if (r.chance(0.6)) return 'They had no idea. The bass moves to another room.';
        g.life.mods.push({ k: 'nosleep', v: 0, until: g.day, why: 'party' });
        everyone(g, id => upset(g, id, 5));
        return 'They nod, close the door and turn it up.';
      }
      if (c === 'join') {
        energy(g, -8);
        everyone(g, id => {
          upset(g, id, -10);
          feel(g, id, 2);
          const l = g.life.p[id];
          if (l) l.fun = clamp(l.fun + 22, 0, 100);
        });
        const L = people(g);
        for (let k = 0; k < 5 && L.length > 1; k++) {
          const a = r.pick(L),
            o = r.pick(L.filter(x => x !== a));
          bond(g, a, o, 7);
        }
        return 'There is a video. It will not be shown to sponsors.';
      }
      pay(g, 40);
      return 'Orange foam in twenty ears. Breakfast is very loud.';
    },
  },
  {
    id: 'theft',
    ctx: 'any',
    gap: 60,
    fx: 'alarm',
    w: g => 0.32 + g.site * 0.05,
    title: () => 'The back door is open',
    body: () => 'Footprints in the flower bed. Two headsets, a monitor and somebody’s lucky hoodie are gone.',
    choices: () => [
      { id: 'lock', label: 'New locks, new alarm', hint: 'Never again', cost: 900 },
      { id: 'post', label: 'Post the footage', hint: 'The community is bored and very good at this' },
      { id: 'let', label: 'File a report', hint: 'Forms' },
    ],
    pick: (g, r, _i, c) => {
      const s = sq(g);
      if (s)
        for (let k = 0; k < 2; k++) {
          const st = s.stations[r.int(0, 4)];
          st.c[k ? 'monitor' : 'headset'] = 10;
        }
      if (c === 'lock') {
        pay(g, 900);
        g.life.last['theft'] = g.day + 200;
        return 'The new alarm greets you by name. Nobody asked it to.';
      }
      if (c === 'post') {
        g.club.fans += 150 + Math.round(g.club.fans * 0.01);
        if (r.chance(0.6) && s) {
          for (const st of s.stations) {
            st.c.monitor = Math.max(st.c.monitor, 70);
            st.c.headset = Math.max(st.c.headset, 70);
          }
          return 'Found in forty minutes by a viewer with a map and too much time. The hoodie has been washed.';
        }
        return 'Three million views. The burglar has a fan account now.';
      }
      everyone(g, id => upset(g, id, 3));
      return 'A reference number. The lucky hoodie is mourned.';
    },
  },
  {
    id: 'bill',
    ctx: 'any',
    gap: 40,
    fx: 'none',
    w: () => 0.5,
    title: () => 'The electricity bill',
    body: g => `Somebody has been mining, streaming, and heating the garden. $${Math.round(380 + g.rooms.length * 55)}, payable now.`,
    choices: g => [
      { id: 'pay', label: 'Pay it', hint: 'Fine', cost: Math.round(380 + g.rooms.length * 55) },
      { id: 'find', label: 'Find out who', hint: 'Awkward, cheaper next time' },
    ],
    pick: (g, r, _i, c) => {
      const n = Math.round(380 + g.rooms.length * 55);
      pay(g, n);
      if (c === 'find' && mine(g).length) {
        const p = r.pick(mine(g));
        upset(g, p.id, 12);
        feel(g, p.id, -3);
        note(g, g.life.block, 'mgr', p.id, undefined, `${p.nick} was mining coins on the practice PCs. Was.`);
        g.life.last['bill'] = g.day + 60;
        return `${p.nick}. On five practice PCs. For a coin with a dog on it.`;
      }
      return 'Paid. The meter keeps spinning.';
    },
  },
  {
    id: 'hotmic',
    ctx: 'train',
    gap: 40,
    fx: 'none',
    w: g => (mine(g).length > 4 && lvl(g, 'stream') ? 0.8 : 0.2),
    make: (g, r) => {
      const L = mine(g);
      if (L.length < 2) return null;
      const a = r.pick(L);
      const o = r.pick(L.filter(x => x.id !== a.id));
      return { who: a.id, oth: o.id };
    },
    title: (g, i) => `${nameOf(g, i.who!)}’s microphone was on`,
    body: (g, i) =>
      `Four minutes about ${nameOf(g, i.oth!)}: the aim, the haircut, the mother. Nine hundred people were watching. So was ${nameOf(g, i.oth!)}.`,
    choices: () => [
      { id: 'sorry', label: 'Apology on stream, together', hint: 'If both can stand it' },
      { id: 'fine', label: 'Fine of a week’s wage', hint: 'Clear, cold' },
      { id: 'meme', label: 'Make it a shirt', hint: 'Fans love it. The house does not' },
    ],
    pick: (g, r, i, c) => {
      const a = i.who!,
        o = i.oth!;
      bond(g, a, o, -16);
      upset(g, o, 22);
      if (c === 'sorry') {
        if (r.chance(0.62 + staffSkill(g, 'psych') * 0.25)) {
          bond(g, a, o, 24);
          upset(g, o, -24);
          g.club.fans += 60 + Math.round(g.club.fans * 0.006);
          return 'It starts stiff and ends with both of them crying with laughter about the haircut.';
        }
        upset(g, a, 10);
        return '“Sorry if you felt that way.” The chat enjoys it. Nobody else does.';
      }
      if (c === 'fine') {
        upset(g, a, 14);
        upset(g, o, -12);
        feel(g, a, -4);
        return 'Paid without a word. The microphone now has tape over it.';
      }
      g.club.fans += 200 + Math.round(g.club.fans * 0.015);
      upset(g, o, 16);
      feel(g, o, -5);
      return 'Sold out in a day. One player eats alone this week.';
    },
  },
  {
    id: 'birthday',
    ctx: 'any',
    gap: 12,
    fx: 'party',
    w: g => (mine(g).length ? 0.5 : 0),
    make: (g, r) => (mine(g).length ? { who: r.pick(mine(g)).id } : null),
    title: (g, i) => `It is ${nameOf(g, i.who!)}’s birthday`,
    body: () => 'Nobody said anything. They are pretending that is fine.',
    choices: () => [
      { id: 'cake', label: 'Cake, candles, everybody', hint: 'Half an hour of practice', cost: 60 },
      { id: 'gift', label: 'A present from the club', hint: 'Something they actually want', cost: 320 },
      { id: 'none', label: 'After the block', hint: 'After the block it is night' },
    ],
    pick: (g, _r, i, c) => {
      const id = i.who!;
      const l = g.life.p[id];
      if (c === 'cake') {
        pay(g, 60);
        lose(g, 0.82);
        feel(g, id, 9);
        upset(g, id, -30);
        everyone(g, o => {
          bond(g, id, o, 4);
          const q = g.life.p[o];
          if (q) q.fun = clamp(q.fun + 8, 0, 100);
        });
        return 'They sing in five languages and none of them in tune.';
      }
      if (c === 'gift') {
        pay(g, 320);
        feel(g, id, 13);
        upset(g, id, -20);
        return 'Unwrapped carefully, paper folded. It is on the desk the next morning.';
      }
      feel(g, id, -6);
      upset(g, id, 12);
      if (l) l.soc = clamp(l.soc - 20, 0, 100);
      return 'At eleven somebody remembers. It is worse than forgetting.';
    },
  },
  {
    id: 'dog',
    ctx: 'any',
    gap: 70,
    fx: 'none',
    w: () => 0.35,
    title: () => 'A dog is in the hall',
    body: () => 'No collar, wet, enormous eyes. It has already chosen a chair.',
    choices: () => [
      { id: 'vet', label: 'Vet and a poster', hint: 'Find the owner', cost: 90 },
      { id: 'day', label: 'Keep it for the day', hint: 'Nobody will train' },
      { id: 'out', label: 'Show it the door', hint: 'They will hate you a little' },
    ],
    pick: (g, _r, _i, c) => {
      if (c === 'vet') {
        pay(g, 90);
        everyone(g, id => feel(g, id, 1.5));
        return 'Claimed by evening by a girl of nine who knows all your starting five.';
      }
      if (c === 'day') {
        lose(g, 0.4);
        everyone(g, id => {
          upset(g, id, -14);
          feel(g, id, 2.5);
        });
        dirty(g, 'lounge', 9);
        return 'One monitor cable chewed, every argument of the week forgotten.';
      }
      everyone(g, id => feel(g, id, -3));
      return 'It looks back twice. So does everybody else.';
    },
  },
  {
    id: 'fans',
    ctx: 'any',
    gap: 26,
    fx: 'party',
    w: g => clamp(g.club.fans / 40000, 0, 0.7),
    title: () => 'Fans at the gate',
    body: () => 'A dozen of them, a banner, and a mother who drove four hours.',
    choices: () => [
      { id: 'in', label: 'Let them in for a tour', hint: 'A block of smiles' },
      { id: 'sign', label: 'Ten minutes at the gate', hint: 'Signatures and photos' },
      { id: 'no', label: 'Not today', hint: 'They understand. Most of them' },
    ],
    pick: (g, _r, _i, c) => {
      if (c === 'in') {
        lose(g, 0.45);
        const d = dirt(g);
        if (d > 55) {
          g.club.rep = clamp(g.club.rep - 0.6, 0, 100);
          g.club.fans += 60;
          return 'They are very polite about the smell. The photographs are less polite.';
        }
        g.club.fans += 180 + Math.round(g.club.fans * 0.012);
        everyone(g, id => feel(g, id, 3));
        return 'The mother cries at the trophy shelf. Everybody plays better for the rest of the day, or thinks so.';
      }
      if (c === 'sign') {
        lose(g, 0.9);
        g.club.fans += 70 + Math.round(g.club.fans * 0.005);
        everyone(g, id => feel(g, id, 1));
        return 'Twelve shirts, one cast on a broken arm, one very patient dog.';
      }
      g.club.fans = Math.max(0, g.club.fans - 40);
      return 'The banner is left on the fence. It rains on it.';
    },
  },
  {
    id: 'gift',
    ctx: 'any',
    gap: 45,
    fx: 'none',
    w: g => (g.deals.some(d => d.signed) ? 0.5 : 0.1),
    title: () => 'A pallet from a sponsor',
    body: () => 'Two hundred cans of something that is not for sale yet. The label glows.',
    choices: () => [
      { id: 'drink', label: 'Fridge, everybody', hint: 'Energy now' },
      { id: 'stream', label: 'Taste it on stream', hint: 'The sponsor would like that' },
      { id: 'give', label: 'Give it to the neighbours', hint: 'You may need them one day' },
    ],
    pick: (g, r, _i, c) => {
      if (c === 'drink') {
        energy(g, 7);
        stress(g, 3);
        g.life.mods.push({ k: 'nosleep', v: 0, until: g.day, why: 'cans' });
        return 'Peak performance until two in the morning, then until four.';
      }
      if (c === 'stream') {
        const n = Math.round(400 + r.range(0, 600));
        g.club.cash += n;
        g.week['Sponsors'] = (g.week['Sponsors'] ?? 0) + n;
        return `“Tastes like a battery.” They mean it. The sponsor pays $${n} anyway.`;
      }
      g.life.last['party'] = g.day + 40;
      return 'The neighbours are suddenly very fond of esports.';
    },
  },
  {
    id: 'laundry',
    ctx: 'any',
    gap: 40,
    fx: 'none',
    w: g => (have(g, 'washer') ? 0.6 : 0.25),
    make: (g, r) => (mine(g).length ? { who: r.pick(mine(g)).id } : null),
    title: () => 'The match shirts are pink',
    body: (g, i) => `${nameOf(g, i.who!)} washed everything together. Everything. The red sock is still in there.`,
    choices: () => [
      { id: 'new', label: 'Print new ones overnight', hint: 'Express', cost: 420 },
      { id: 'wear', label: 'Wear them', hint: 'Own it' },
      { id: 'rant', label: 'Say what you think', hint: 'Feels good. Briefly' },
    ],
    pick: (g, r, i, c) => {
      if (c === 'new') {
        pay(g, 420);
        return 'A courier at six. Nobody will ever know, except everybody.';
      }
      if (c === 'wear') {
        g.club.fans += 120 + Math.round(g.club.fans * 0.008);
        everyone(g, id => feel(g, id, r.chance(0.7) ? 1.5 : -1));
        return 'Pink on the broadcast. The shop sells forty by midnight.';
      }
      if (i.who) {
        upset(g, i.who, 14);
        feel(g, i.who, -4);
      }
      return 'The sock is presented as evidence. The house goes very quiet.';
    },
  },
];
export const INC: Record<string, IncDef> = Object.fromEntries(INCIDENTS.map(x => [x.id, x]));
/** does something happen now? */
export function rollIncident(g: G, r: Rng, ctx: 'train' | 'match', b: number, title?: TitleId, opp?: string): Incident | null {
  const L = g.life;
  // most blocks are quiet; a neglected house is not
  const calm = ctx === 'match' ? 0.24 : 0.062 + clamp((dirt(g) - 40) * 0.001, 0, 0.035);
  const forced = ctx === 'match' && mine(g).some(p => (L.p[p.id]?.anger ?? 0) > 84);
  if (!forced && !r.chance(calm)) return null;
  const pool = INCIDENTS.filter(
    x => (ctx === 'match' ? x.ctx === 'match' : x.ctx !== 'match') && g.day - (L.last[x.id] ?? -99) >= x.gap && x.w(g, b) > 0,
  );
  if (!pool.length) return null;
  const d = r.weighted(pool, x => x.w(g, b));
  const m = d.make ? d.make(g, r, b) : {};
  if (!m) return null;
  L.last[d.id] = g.day;
  const i: Incident = { id: d.id, d: g.day, b, ...(title ? { title } : {}), ...(opp ? { oth: opp } : {}), ...m };
  return i;
}
export function resolveIncident(g: G, r: Rng, c: string): string | null {
  const i = g.life.inc;
  if (!i) return null;
  const d = INC[i.id];
  const ch = d?.choices(g, i).find(x => x.id === c);
  if (!d || !ch) return null;
  const t = d.pick(g, r, i, c);
  g.life.inc = null;
  note(g, i.b, 'inc', i.who ?? 'me', undefined, `${d.title(g, i)}. ${t}`, i.room);
  return t;
}
void emoOf;
