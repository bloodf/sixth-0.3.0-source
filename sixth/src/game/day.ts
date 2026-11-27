import { away, houseCost, lifeBlock, lifeK, lifeNight, modK, settle } from './life.ts';
import { rollIncident } from './incidents.ts';
import { Rng } from '../core/rng.ts';
import { clamp } from '../core/dmath.ts';
import { ATTRS, TITLE, type Attr, type TitleId } from '../data/titles.ts';
import {
  BLOCKS,
  GEAR,
  GEAR_SLOTS,
  ROOMS,
  SITES,
  SPONSORS,
  SPONSOR_SLOTS,
  STAFF,
  type Block,
  type RoomType,
  type SponsorSlot,
} from '../data/club.ts';
import { genPlayer, natFor, ovr, refillFA, refillPool, valueFor, wageFor, DIV_LVL, DIV_NAME } from './gen.ts';
import { finish as _f, isMe, meId, myToday, newSeason, progress, quick, rollover, todays } from './league.ts';
import { adj, mine, msg, rollEvent } from './events.ts';
import { staffSkill, stationQ } from './match.ts';
import type { G, Player, SponsorDeal, Squad } from './types.ts';
export const dow = (day: number) => ((day % 7) + 7) % 7;
void _f;
export const room = (g: G, t: RoomType) => g.rooms.find(r => r.type === t);
export const rl = (g: G, t: RoomType) => room(g, t)?.lvl ?? 0;
export const practiceFor = (g: G, t: TitleId) => g.rooms.find(r => r.type === 'practice' && r.title === t);
export const money = (n: number) => (n < 0 ? '-$' : '$') + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function book(g: G, k: string, n: number) {
  g.club.cash += Math.round(n);
  g.week[k] = (g.week[k] ?? 0) + Math.round(n);
}
const TRAIN: Record<Block, [Attr, number][]> = {
  scrim: [
    ['team', 1],
    ['dec', 0.9],
    ['comms', 0.9],
    ['sense', 0.7],
    ['adapt', 0.5],
    ['mech', 0.3],
  ],
  aim: [
    ['mech', 1.5],
    ['react', 1.2],
    ['focus', 0.35],
  ],
  tactics: [
    ['util', 1.3],
    ['pos', 1.1],
    ['team', 0.5],
    ['dec', 0.4],
  ],
  vod: [
    ['sense', 1.3],
    ['dec', 1.1],
    ['pos', 0.6],
    ['adapt', 0.6],
  ],
  gym: [
    ['stam', 1.8],
    ['react', 0.25],
    ['focus', 0.4],
  ],
  mind: [
    ['comp', 1.5],
    ['focus', 1.3],
  ],
  bond: [
    ['comms', 0.7],
    ['team', 0.6],
    ['comp', 0.3],
  ],
  stream: [
    ['adapt', 0.25],
    ['mech', 0.2],
  ],
  rest: [],
};
/** per-block multiplier for a squad; used by UI as well */
export function blockMult(g: G, sq: Squad, b: Block): number {
  let m = 1;
  const pr = practiceFor(g, sq.title);
  if (b === 'scrim' || b === 'aim') m *= pr ? [1, 1.12, 1.25][pr.lvl - 1] : 0.66;
  if (b === 'tactics' || b === 'vod') m *= 1 + 0.15 * rl(g, 'strategy');
  if (b === 'gym') m *= 0.75 + 0.28 * rl(g, 'gym') + staffSkill(g, 'trainer') * 0.4;
  if (b === 'mind') m *= 0.7 + 0.2 * rl(g, 'wellness') + staffSkill(g, 'psych') * 0.6;
  if (b === 'vod') m *= 1 + staffSkill(g, 'analyst') * 0.35;
  if (b === 'bond') m *= 0.8 + 0.2 * rl(g, 'lounge');
  const c = staffSkill(g, 'coach', sq.title);
  if (b === 'scrim' || b === 'tactics' || b === 'aim' || b === 'vod') m *= 0.82 + c * 0.5;
  return m * [0.75, 1, 1.22][sq.intensity];
}
function train(g: G, r: Rng, sq: Squad, p: Player, b: Block, k: number) {
  const m = blockMult(g, sq, b) * k;
  const inten = [0.75, 1, 1.3][sq.intensity];
  if (p.injury > 0 && b !== 'rest' && b !== 'mind') {
    adj(p, 'energy', 6);
    return;
  }
  const gap = clamp((p.pot - ovr(p)) / 11, 0.06, 1.35),
    ag = p.age <= 19 ? 1.25 : p.age <= 23 ? 1 : p.age <= 26 ? 0.7 : 0.45;
  const tr = p.traits.includes('grinder') ? 1.2 : p.traits.includes('prodigy') ? 1.15 : 1;
  const en = p.energy < 35 ? 0.4 : p.energy < 55 ? 0.75 : 1;
  for (const [a, w] of TRAIN[b]) {
    const head = clamp((99 - p.attr[a]) / 45, 0.1, 1);
    const d = 0.034 * w * m * gap * ag * tr * en * head * (0.7 + r.f() * 0.6) * (a === 'adapt' ? 1 : 0.8 + p.attr.adapt / 250);
    p.attr[a] = clamp(Math.round((p.attr[a] + d) * 1000) / 1000, 5, 99);
  }
  const def = BLOCKS[b];
  let e = def.energy;
  if (e < 0) e *= (1.3 - p.attr.stam / 170) * inten * (p.traits.includes('grinder') ? 1.12 : 1);
  else e *= b === 'rest' ? 1 + 0.06 * rl(g, 'lounge') : 1;
  adj(p, 'energy', e * k);
  let s = def.stress;
  if (s > 0) s *= inten * (1.4 - p.attr.comp / 130);
  else s *= b === 'mind' ? 0.6 + 0.25 * rl(g, 'wellness') + staffSkill(g, 'psych') * 0.7 : 1;
  adj(p, 'stress', s * k);
  if (b === 'bond') adj(p, 'morale', 1.4 + 0.5 * rl(g, 'lounge'));
  if (b === 'stream') p.fame = Math.round((p.fame + (p.traits.includes('streamer') ? 0.16 : 0.08)) * 100) / 100;
  if (def.energy < -5 && p.injury <= 0) {
    const risk =
      0.0005 *
      inten *
      (p.traits.includes('glass') ? 2.2 : 1) *
      (p.energy < 30 ? 5 : p.energy < 45 ? 2 : 1) *
      (1 - [0, 0.25, 0.45, 0.65][rl(g, 'medical')]) *
      (1 - staffSkill(g, 'therapist') * 0.4);
    if (r.chance(risk)) {
      p.injury = Math.max(2, Math.round(r.range(4, 15) * (1 - staffSkill(g, 'therapist') * 0.35)));
      p.injuryName = r.pick(['wrist strain', 'back pain', 'eye strain', 'neck strain']);
      msg(g, {
        kind: 'info',
        from: 'Medical',
        title: `${p.nick}: ${p.injuryName}`,
        body: `Out for about ${p.injury} days. Playing through it costs performance.`,
        data: { p: p.id },
      });
    }
  }
}
export function streamIncome(g: G): number {
  return (18 + Math.sqrt(Math.max(0, g.club.fans)) * 1.15) * (0.55 + 0.3 * rl(g, 'stream') + staffSkill(g, 'content') * 0.6);
}
export function wagesWeek(g: G) {
  return {
    players: mine(g).reduce((s, p) => s + (p.contract?.salary ?? 0), 0),
    staff: g.staff.reduce((s, x) => s + x.salary, 0),
    rent: SITES[g.site].rent + Math.round(Math.max(0, g.hq.w * g.hq.h - SITES[g.site].w * SITES[g.site].h) * SITES[g.site].landRent),
    upkeep: g.rooms.reduce((s, r) => s + Math.round(ROOMS[r.type].upkeep * (0.7 + r.lvl * 0.3)), 0),
    loan: Math.round(g.club.loan * 0.006),
    travel: Object.keys(g.squads).length * 140,
    food: houseCost(g),
  };
}
export function merchWeek(g: G) {
  return Math.round(Math.sqrt(g.club.fans) * 2.1 + g.club.fans * 0.006 * (0.7 + g.club.merch * 0.3) * (1 + staffSkill(g, 'content') * 0.3));
}
const bestDiv = (g: G) => Math.min(...Object.keys(g.squads).map(t => g.teams[meId(t as TitleId)].div));
export function makeOffer(g: G, r: Rng, slot: SponsorSlot): SponsorDeal {
  const [brand, sector] = r.pick(SPONSORS[slot]);
  const d = bestDiv(g);
  const pl = staffSkill(g, 'partner');
  const base =
    ([5200, 2600, 1350][d] + g.club.rep * 26 + Math.sqrt(g.club.fans) * 6) *
    (1 + (Object.keys(g.squads).length - 1) * 0.34) *
    SPONSOR_SLOTS[slot].k *
    (0.8 + r.f() * 0.5) *
    (1 + pl * 0.25 + [0, 0, 0.05, 0.1][rl(g, 'trophy')] + [0, 0, 0.08, 0.16][rl(g, 'office')]) *
    (g.mgr.style === 'showman' ? 1.08 : 1);
  const goals: [string, number, number][] = [
    ['win', r.int(3, 7), 1],
    ['fans', Math.round((g.club.fans * r.range(1.15, 1.5)) / 100) * 100 + 300, 1],
    ['playoff', 1, 1.4],
  ];
  const [gk, gn, gm] = r.pick(goals);
  return {
    id: 'd' + g.uid++,
    slot,
    brand,
    sector,
    weekly: Math.round(base / 10) * 10,
    weeks: r.pick([8, 13, 13, 26]),
    until: 0,
    goal: gk,
    goalN: gn,
    bonus: Math.round((base * gm * r.range(2, 4)) / 100) * 100,
    prog: 0,
    signed: false,
    exp: g.day + 14,
  };
}
export function sponsorProgress(g: G, kind: string) {
  for (const d of g.deals)
    if (d.signed && d.prog < d.goalN && d.goal === kind) {
      d.prog++;
      if (d.prog >= d.goalN) {
        book(g, 'Sponsor bonus', d.bonus);
        msg(g, { kind: 'sponsor', from: d.brand, title: `${d.brand} target met`, body: `Bonus of ${money(d.bonus)} paid.` });
      }
    }
}
function weekly(g: G, r: Rng) {
  const w = wagesWeek(g);
  book(g, 'Player wages', -w.players);
  book(g, 'Staff wages', -w.staff);
  book(g, 'Rent', -w.rent);
  book(g, 'Rooms', -w.upkeep);
  if (w.loan) book(g, 'Loan interest', -w.loan);
  book(g, 'Travel', -w.travel);
  if (w.food) book(g, 'Food', -w.food);
  book(g, 'Merchandise', merchWeek(g));
  for (const d of [...g.deals])
    if (d.signed) {
      if (g.day >= d.until) {
        g.deals.splice(g.deals.indexOf(d), 1);
        msg(g, {
          kind: 'sponsor',
          from: d.brand,
          title: `${d.brand} deal has ended`,
          body: `The ${SPONSOR_SLOTS[d.slot].name.toLowerCase()} space is free again.`,
        });
      } else book(g, 'Sponsors', d.weekly);
    } else if (g.day > d.exp) g.deals.splice(g.deals.indexOf(d), 1);
  for (const d of g.deals)
    if (d.signed && d.goal === 'fans' && d.prog < d.goalN) {
      d.prog = Math.min(d.goalN, g.club.fans);
      if (d.prog >= d.goalN) {
        book(g, 'Sponsor bonus', d.bonus);
        msg(g, { kind: 'sponsor', from: d.brand, title: `${d.brand} target met`, body: `Bonus of ${money(d.bonus)} paid.` });
      }
    }
  const free = (Object.keys(SPONSOR_SLOTS) as SponsorSlot[]).filter(
    s => !g.deals.some(d => d.slot === s && d.signed) && g.deals.filter(d => d.slot === s && !d.signed).length < 2,
  );
  for (const s of free)
    if (r.chance(0.34 + g.club.rep * 0.004 + staffSkill(g, 'partner') * 0.3)) {
      const o = makeOffer(g, r, s);
      g.deals.push(o);
      msg(g, {
        kind: 'sponsor',
        from: o.brand,
        title: `Offer: ${SPONSOR_SLOTS[s].name.toLowerCase()}`,
        body: `${o.brand} (${o.sector}) offer ${money(o.weekly)} a week for ${o.weeks} weeks. See Club, Sponsors.`,
        data: { deal: o.id },
      });
    }
  g.ledger.push({ week: Math.floor(g.day / 7), items: g.week, cash: g.club.cash });
  if (g.ledger.length > 60) g.ledger.shift();
  g.week = {};
  if (g.club.cash < 0) {
    g.bankrupt++;
    if (g.bankrupt === 1)
      msg(g, {
        kind: 'board',
        from: 'Bank',
        title: 'The account is overdrawn',
        body: 'You have four weeks to get back above zero. Sell, release, borrow or win.',
      });
    if (g.bankrupt >= 4) {
      g.over = 'bankrupt';
      msg(g, { kind: 'board', from: 'Bank', title: 'The club is closed', body: 'Four weeks overdrawn. The bank has taken the keys.' });
    } else all(g, -4);
  } else g.bankrupt = 0;
  // staff market turns over, AI moves
  for (let i = 0; i < 2 && g.pool.length; i++) g.pool.splice(r.int(0, g.pool.length - 1), 1);
  refillPool(g, r);
  for (const t of Object.keys(g.squads) as TitleId[]) aiMarket(g, r, t);
  for (const p of mine(g))
    if (!g.bids.some(b => b.pid === p.id)) {
      const sc = ovr(p) + (p.listed ? 14 : 0) + p.fame * 0.1;
      const L = Object.values(g.teams)
        .filter(t => t.title === p.title && !isMe(t.id))
        .filter(t => {
          const cur = t.roster.map(x => g.players[x]).find(x => x && x.role === p.role);
          return cur && ovr(cur) < ovr(p) - 1;
        });
      if (L.length && r.chance(clamp((sc - 52) * 0.004 + (p.listed ? 0.3 : 0), 0, 0.45))) {
        const t = r.pick(L);
        const fee = Math.round((valueFor(p, g.day) * r.range(0.8, 1.35)) / 500) * 500;
        const b = { id: 'b' + g.uid++, pid: p.id, team: t.id, fee, exp: g.day + 7 };
        g.bids.push(b);
        msg(g, {
          kind: 'bid',
          from: t.name,
          title: `${t.name} want ${p.nick}`,
          body: `They offer ${money(fee)}. Your valuation is ${money(valueFor(p, g.day))}. The offer stands for a week.`,
          data: { bid: b.id, p: p.id },
          choices: [
            { id: 'accept', label: `Sell for ${money(fee)}` },
            { id: 'reject', label: 'Turn it down' },
          ],
        });
      }
    }
  g.bids = g.bids.filter(b => b.exp >= g.day);
}
const all = (g: G, d: number) => mine(g).forEach(p => adj(p, 'morale', d));
function aiMarket(g: G, r: Rng, t: TitleId) {
  // weak AI slots pick up better free agents
  const teams = Object.values(g.teams).filter(x => x.title === t && !isMe(x.id));
  for (let n = 0; n < 2; n++) {
    const T = r.pick(teams);
    const i = r.int(0, 4);
    const cur = g.players[T.roster[i]];
    if (!cur) continue;
    const ro = TITLE[t].roles[i].id;
    const c = Object.values(g.players)
      .filter(p => p.title === t && !p.team && p.role === ro && ovr(p) > ovr(cur) + 1.5 && ovr(p) < ovr(cur) + 14)
      .sort((a, b) => ovr(b) - ovr(a) || (a.id < b.id ? -1 : 1))[0];
    if (c) {
      cur.team = null;
      cur.contract = null;
      c.team = T.id;
      c.contract = { salary: wageFor(c), until: g.day + 364, buyout: 0, bonus: 0 };
      c.contract.buyout = valueFor(c, g.day);
      T.roster[i] = c.id;
      if (ovr(c) > 66)
        msg(g, {
          kind: 'news',
          from: 'Transfers',
          title: `${T.name} sign ${c.nick}`,
          body: `${c.nick} replaces ${cur.nick} as ${TITLE[t].roles[i].name.toLowerCase()}.`,
        });
    }
  }
  const fa = Object.values(g.players).filter(p => p.title === t && !p.team).length;
  if (fa < 26) refillFA(g, r, t, 30);
}
function seasonEnd(g: G, r: Rng, t: TitleId) {
  const { up, down } = rollover(g, t);
  const me = g.teams[meId(t)];
  if (up.includes(me.id)) {
    msg(g, {
      kind: 'board',
      from: 'League office',
      title: `Promoted to ${DIV_NAME[me.div]}`,
      body: 'Bigger crowd, bigger cheques, better opponents.',
    });
    g.club.rep = clamp(g.club.rep + 7 * (1.1 - g.club.rep / 100), 0, 100);
    g.club.fans += Math.round(1500 + Math.sqrt(g.club.fans) * 20);
  } else if (down.includes(me.id)) {
    msg(g, {
      kind: 'board',
      from: 'League office',
      title: `Relegated to ${DIV_NAME[me.div]}`,
      body: 'It happens to good clubs. It happens to them once.',
    });
    g.club.rep = clamp(g.club.rep - 6, 0, 100);
  }
  const yearEnd = g.seasons[t]!.n % 4 === 3;
  for (const p of Object.values(g.players))
    if (p.title === t) {
      if (yearEnd) {
        p.age++;
        if (p.age > 26) {
          p.attr.react = clamp(Math.round((p.attr.react - r.range(0.6, 2)) * 10) / 10, 5, 99);
          p.attr.mech = clamp(Math.round((p.attr.mech - r.range(0.2, 1.2)) * 10) / 10, 5, 99);
        }
      }
      if (!p.team || !isMe(p.team)) {
        const o = ovr(p),
          room = clamp((p.pot - o) / 10, 0, 1);
        const k = p.age < 24 ? room * r.range(0.6, 2.2) : p.age > 27 ? -r.range(0, 1.2) : room * r.range(0, 0.8);
        for (const a of ATTRS) p.attr[a] = clamp(Math.round((p.attr[a] + k * r.range(0.4, 1.6)) * 10) / 10, 5, 98);
        p.energy = 92;
        p.stress = 15;
        p.form = 0;
      }
      p.s = { m: 0, w: 0, k: 0, d: 0, a: 0, r: 0, mvp: 0 };
    }
  // AI squads slowly regress to their division level, so the ladder does not collapse over decades
  for (const T of Object.values(g.teams))
    if (T.title === t && !isMe(T.id)) {
      const target = T.div === 9 ? 80 : DIV_LVL[T.div];
      const avg = T.roster.reduce((s, id) => s + (g.players[id] ? ovr(g.players[id]) : 40), 0) / 5;
      if (Math.abs(avg - target) > 5)
        for (const id of T.roster) {
          const p = g.players[id];
          if (p) for (const a of ATTRS) p.attr[a] = clamp(Math.round((p.attr[a] + (target - avg) * 0.25) * 10) / 10, 5, 98);
        }
      for (const id of T.roster) {
        const p = g.players[id];
        if (p && p.contract && p.contract.until < g.day + 30) {
          p.contract.until = g.day + r.int(180, 560);
          p.contract.salary = wageFor(p);
          p.contract.buyout = valueFor(p, g.day);
        }
        if (p && p.age >= 32) {
          const i = T.roster.indexOf(id);
          const np = genPlayer(g, r, t, p.role, clamp(target + r.gauss() * 3, 30, 92), natFor(r, T.region), r.int(17, 20));
          np.team = T.id;
          np.contract = { salary: wageFor(np), until: g.day + 500, buyout: valueFor(np, g.day), bonus: 0 };
          g.players[np.id] = np;
          g.know[np.id] = 40;
          T.roster[i] = np.id;
          delete g.players[id];
        }
      }
      T.plan.tempo = clamp(Math.round((T.plan.tempo + r.gauss() * 0.08) * 100) / 100, 0, 1);
      T.plan.risk = clamp(Math.round((T.plan.risk + r.gauss() * 0.08) * 100) / 100, 0, 1);
    }
  for (const p of Object.values(g.players))
    if (p.title === t && !p.team && (p.age > 29 || (ovr(p) < 46 && p.age > 20 && r.chance(0.5)))) {
      delete g.players[p.id];
      delete g.know[p.id];
    }
  refillFA(g, r, t, 34);
  const n = g.seasons[t]!.n + 1;
  g.seasons[t] = newSeason(g, r, t, n, g.day);
  msg(g, {
    kind: 'board',
    from: 'League office',
    title: `${TITLE[t].realShort}: season ${n + 1} begins`,
    body: `One week of preparation, nine league rounds, then playoffs. Map pool: ${g.seasons[t]!.maps.length} maps.`,
    data: { t },
  });
}
export type Stop = 'block' | 'incident' | 'day';
/** Why the day cannot go on, if it cannot. */
export function blockedBy(g: G): string | null {
  if (g.over) return 'The club is closed';
  if (g.live) return 'Finish the match in progress first';
  if (g.life.inc) return 'Something in the house needs a decision';
  if (myToday(g)) return 'There is a match to play today';
  if (g.inbox.some(m => m.kind === 'event' && !m.done && g.day - m.day >= 2)) return 'Something in your inbox needs a decision';
  return null;
}
/** Runs the next block of the day, or all that are left. Stops early when something happens. */
export function advance(g: G, step: boolean): { err: string } | { stop: Stop } {
  const e = blockedBy(g);
  if (e) return { err: e };
  const r = new Rng(g.rng);
  settle(g);
  while (g.life.block < 3) {
    if (g.life.rolled !== g.life.block) {
      g.life.rolled = g.life.block;
      const i = rollIncident(g, r, 'train', g.life.block);
      if (i) {
        g.life.inc = i;
        g.rng = r.s;
        return { stop: 'incident' };
      }
    }
    runBlock(g, r, g.life.block);
    g.life.block++;
    if (step && g.life.block < 3) {
      g.rng = r.s;
      return { stop: 'block' };
    }
  }
  night(g, r);
  g.rng = r.s;
  return { stop: g.life.inc ? 'incident' : 'day' };
}
const playedToday = (g: G) =>
  todays(g)
    .filter(f => f.played && (isMe(f.home) || isMe(f.away)))
    .map(f => f.title);
function runBlock(g: G, r: Rng, i: number) {
  const d = dow(g.day);
  const had = playedToday(g);
  const k = modK(g, 'train');
  for (const sq of Object.values(g.squads) as Squad[]) {
    if (had.includes(sq.title) && i > 0) continue;
    const b = sq.week[d][i];
    const ps = mine(g).filter(p => p.title === sq.title && !away(g, p.id, i));
    const lost = b === 'rest' || b === 'bond' || b === 'mind' ? 1 : k;
    for (const p of ps) train(g, r, sq, p, b, lost * lifeK(g, p.id));
    if (b === 'stream' && ps.length) {
      book(
        g,
        'Streaming',
        (lost * (streamIncome(g) * ps.reduce((s, p) => s + 0.7 + p.fame * 0.012 + (p.traits.includes('streamer') ? 0.5 : 0), 0))) / 5,
      );
      g.club.fans += Math.round((2 + Math.sqrt(g.club.fans) * 0.06) * (1 + staffSkill(g, 'content') + 0.2 * rl(g, 'stream')) * lost);
    }
  }
  lifeBlock(g, r, d, i, new Set(had));
  // an interrupted block is over when the block is
  g.life.mods = g.life.mods.filter(m => m.k !== 'train');
}
function night(g: G, r: Rng) {
  const d = dow(g.day);
  const had = playedToday(g);
  for (const sq of Object.values(g.squads) as Squad[]) {
    const ps = mine(g).filter(p => p.title === sq.title);
    const match = had.includes(sq.title);
    const bl = sq.week[d];
    let sc = 0,
      tc = 0,
      vd = 0,
      bd = 0;
    bl.forEach((b, i) => {
      if (match && i > 0) return;
      if (b === 'scrim') sc++;
      if (b === 'tactics') tc++;
      if (b === 'vod') vd++;
      if (b === 'bond') bd++;
    });
    const cs = staffSkill(g, 'coach', sq.title);
    sq.fam = clamp(
      Math.round(
        (sq.fam +
          (tc * 0.016 * (1 + 0.15 * rl(g, 'strategy')) + sc * 0.008) *
            (0.8 + cs * 0.7) *
            (g.mgr.style === 'tactician' ? 1.18 : 1) *
            (1.15 - sq.fam) -
          0.004) *
          10000,
      ) / 10000,
      0.1,
      1,
    );
    const langs = new Set(sq.lineup.map(p => p && g.players[p]?.nat)).size;
    sq.syn = clamp(
      Math.round(
        (sq.syn +
          (0.0016 + sc * 0.0022 + bd * 0.004 * (1 + 0.2 * rl(g, 'lounge'))) * (1.12 - sq.syn) * (langs <= 2 ? 1.2 : langs >= 5 ? 0.8 : 1)) *
          10000,
      ) / 10000,
      0.1,
      1,
    );
    sq.prep = clamp(Math.round((sq.prep * 0.9 + vd * 0.09 * (1 + staffSkill(g, 'analyst') * 1.2)) * 1000) / 1000, 0, 1);
    const used = bl.filter(b => b === 'scrim' || b === 'aim' || b === 'stream').length;
    const wr = (used / 2) * (1 - [0, 0.2, 0.4, 0.6][rl(g, 'workshop')]) * (1 - staffSkill(g, 'tech') * 0.35);
    for (const s of sq.stations)
      for (const k of GEAR_SLOTS) s.c[k] = Math.max(8, Math.round((s.c[k] - GEAR[k][s.m[k]].wear * wr) * 100) / 100);
    // repairs by technician
    const tech = staffSkill(g, 'tech');
    if (tech > 0) {
      const w = sq.stations.map(s => s.c);
      for (const c of w) for (const k of GEAR_SLOTS) if (c[k] < 90) c[k] = Math.min(90, Math.round((c[k] + tech * 0.5) * 100) / 100);
    }
    const cq = sq.stations.reduce((a, s) => a + stationQ(s), 0) / 5;
    for (const p of ps) {
      const rec =
        (9.5 + p.attr.stam * 0.05) *
        (1 +
          [0, 0.1, 0.18, 0.28][rl(g, 'kitchen')] +
          [0, 0.12, 0.22, 0.32][rl(g, 'dorm')] +
          staffSkill(g, 'chef') * 0.15 +
          staffSkill(g, 'trainer') * 0.1);
      adj(p, 'energy', rec);
      adj(p, 'stress', -0.5 - staffSkill(g, 'psych') * 1.1);
      const mt =
        56 +
        rl(g, 'lounge') * 3 +
        staffSkill(g, 'chef') * 6 +
        (cq - 50) * 0.08 +
        clamp(g.streak, -5, 5) * 2 -
        (p.traits.includes('merc') && p.contract && p.contract.salary < wageFor(p) * 0.9 ? 10 : 0) +
        (sq.lineup.includes(p.id) ? 3 : -6);
      adj(p, 'morale', (mt - p.morale) * 0.045);
      if (p.injury > 0) {
        p.injury--;
        if (p.injury === 0) {
          p.injuryName = '';
          msg(g, { kind: 'info', from: 'Medical', title: `${p.nick} is available`, body: 'Back to full practice today.' });
        }
      }
      p.form = Math.round(p.form * 0.97 * 100) / 100;
    }
  }
  // scouting
  const ss =
    (g.staff.filter(s => s.role === 'scout').reduce((a, s) => a + s.skill, 0) / 100) *
      (rl(g, 'office') ? [1, 1, 1.25, 1.5][rl(g, 'office')] : 0.5) +
    0.12;
  if (g.scout.pid && g.players[g.scout.pid]) {
    const k = g.scout.pid;
    g.know[k] = clamp(Math.round((g.know[k] ?? 20) + 7 + ss * 9), 0, 100);
    if (g.know[k] >= 100) {
      msg(g, {
        kind: 'info',
        from: 'Scouting',
        title: `Full report: ${g.players[k].nick}`,
        body: `Overall ${Math.round(ovr(g.players[k]))}, ceiling about ${Math.round(g.players[k].pot)}.`,
        data: { p: k },
      });
      g.scout.pid = null;
    }
  } else {
    const L = Object.keys(g.know)
      .filter(id => {
        const p = g.players[id];
        return p && g.know[id] < 95 && (!g.scout.title || p.title === g.scout.title);
      })
      .sort();
    for (let i = 0; i < 5 && L.length; i++) {
      const id = r.pick(L);
      g.know[id] = clamp(Math.round(g.know[id] + ss * 6), 0, 100);
    }
  }
  for (const f of todays(g)) if (!f.played) quick(g, r, f);
  for (const t of Object.keys(g.seasons) as TitleId[])
    for (const e of progress(g, r, t)) {
      if (e.team && isMe(e.team) && e.prize) {
        book(g, 'Prize money', e.prize);
        g.stats.prize += e.prize;
        msg(g, {
          kind: 'board',
          from: 'League office',
          title:
            e.k === 'champ'
              ? `Champions of ${DIV_NAME[e.div!]}`
              : e.k === 'mchamp'
                ? 'World Masters champions'
                : `Finished ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][e.place! - 1]}${e.k === 'mplace' ? ' at the Masters' : ''}`,
          body: `${money(e.prize)} prize money.`,
        });
        if (e.k === 'champ' || e.k === 'mchamp') {
          g.trophies.push({ day: g.day, title: t, name: e.k === 'mchamp' ? 'World Masters' : `${DIV_NAME[e.div!]} title` });
          g.club.rep = clamp(g.club.rep + (e.k === 'mchamp' ? 15 : 5) * (1.1 - g.club.rep / 100), 0, 100);
          g.club.fans += Math.round((e.k === 'mchamp' ? 9000 : 800) + Math.sqrt(g.club.fans) * (e.k === 'mchamp' ? 110 : 14));
          mine(g)
            .filter(p => p.title === t)
            .forEach(p => {
              p.car.trophies++;
              adj(p, 'morale', 18);
            });
        }
      }
      if (e.k === 'playoffs') {
        const s = g.seasons[t]!;
        if (s.fixtures.some(f => f.stage === 'Semi-final' && f.comp === 'playoff' && (isMe(f.home) || isMe(f.away)))) {
          sponsorProgress(g, 'playoff');
          msg(g, {
            kind: 'board',
            from: 'League office',
            title: `${TITLE[t].realShort}: you are in the playoffs`,
            body: 'Best of three from here.',
          });
        }
      }
      if (e.k === 'masters' && g.seasons[t]!.masters.some(isMe))
        msg(g, {
          kind: 'board',
          from: 'World Masters',
          title: `${TITLE[t].realShort}: qualified for the Masters`,
          body: 'Eight teams, three continents, one week.',
        });
    }
  lifeNight(g, r);
  g.day++;
  for (const t of Object.keys(g.seasons) as TitleId[])
    if (g.seasons[t]!.stage === 'done' && g.day >= g.seasons[t]!.start + 91) seasonEnd(g, r, t);
  for (const p of mine(g)) {
    if (!p.contract) continue;
    const left = p.contract.until - g.day;
    if (left === 28)
      msg(g, {
        kind: 'contract',
        from: p.nick,
        title: `${p.nick}'s contract ends in four weeks`,
        body: `Currently ${money(p.contract.salary)} a week. Renew from the player page.`,
        data: { p: p.id },
      });
    if (left <= 0) {
      const sq = g.squads[p.title]!;
      sq.lineup = sq.lineup.map(x => (x === p.id ? null : x));
      p.team = null;
      p.contract = null;
      msg(g, { kind: 'contract', from: p.nick, title: `${p.nick} has left`, body: 'The contract ran out. They are a free agent.' });
    }
  }
  for (const k of Object.keys(g.nego)) if (g.nego[k].until < g.day) delete g.nego[k];
  if (dow(g.day) === 0) weekly(g, r);
  rollEvent(g, r);
  const nx = myToday(g);
  if (nx) {
    const o = g.teams[isMe(nx.home) ? nx.away : nx.home];
    msg(g, {
      kind: 'match',
      from: 'Match day',
      title: `${TITLE[nx.title].realShort}: ${o.name}`,
      body: `${nx.comp === 'league' ? DIV_NAME[nx.div] : nx.comp === 'masters' ? 'World Masters' : 'Playoffs'}, ${nx.stage.toLowerCase()}${nx.bo > 1 ? ', best of ' + nx.bo : ''}.`,
      data: { fid: nx.id },
    });
    // match mornings have their own luck
    g.life.inc = rollIncident(g, r, 'match', 0, nx.title, isMe(nx.home) ? nx.away : nx.home);
  }
  void STAFF;
}
