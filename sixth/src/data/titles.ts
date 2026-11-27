export type TitleId = 'cs2' | 'val' | 'dota' | 'ow';
export const TITLES: TitleId[] = ['cs2', 'val', 'dota', 'ow'];
export type Attr = 'mech' | 'react' | 'sense' | 'pos' | 'dec' | 'util' | 'team' | 'comms' | 'comp' | 'focus' | 'stam' | 'adapt';
export const ATTRS: Attr[] = ['mech', 'react', 'sense', 'pos', 'dec', 'util', 'team', 'comms', 'comp', 'focus', 'stam', 'adapt'];
export const ATTR_INFO: Record<Attr, { name: string; group: 'Hands' | 'Head' | 'Team' | 'Nerve'; hint: string }> = {
  mech: { name: 'Mechanics', group: 'Hands', hint: 'Raw aim, last-hitting and input precision' },
  react: { name: 'Reaction', group: 'Hands', hint: 'Time from seeing to acting' },
  stam: { name: 'Stamina', group: 'Hands', hint: 'How long the level holds in a series and in a season' },
  sense: { name: 'Game sense', group: 'Head', hint: 'Reading where opponents are and what comes next' },
  pos: { name: 'Positioning', group: 'Head', hint: 'Angles, spacing, use of cover' },
  dec: { name: 'Decisions', group: 'Head', hint: 'Choosing the right fight and the right exit' },
  adapt: { name: 'Adaptability', group: 'Head', hint: 'Learning new heroes, patches and systems' },
  util: { name: 'Utility', group: 'Team', hint: 'Grenades, abilities and spell timing' },
  team: { name: 'Teamwork', group: 'Team', hint: 'Trading, peeling, following a plan' },
  comms: { name: 'Comms', group: 'Team', hint: 'Clear, calm, useful information' },
  comp: { name: 'Composure', group: 'Nerve', hint: 'Resisting pressure and tilt' },
  focus: { name: 'Focus', group: 'Nerve', hint: 'Fewer lapses late in games' },
};
export interface RoleDef {
  id: string;
  name: string;
  w: Partial<Record<Attr, number>>;
}
export interface TitleDef {
  id: TitleId;
  real: string;
  realShort: string;
  studio: string;
  studioShort: string;
  genre: string;
  format: string;
  icon: string;
  matchDow: number;
  roles: RoleDef[];
  mapWord: string;
  scoreWord: string;
  blurb: string;
  platform: string;
}
const r = (id: string, name: string, w: Partial<Record<Attr, number>>): RoleDef => ({ id, name, w });
export const TITLE: Record<TitleId, TitleDef> = {
  cs2: {
    id: 'cs2',
    real: 'Counter-Strike 2',
    realShort: 'CS2',
    studio: 'Breachpoint',
    studioShort: 'BRP',
    genre: 'Tactical shooter',
    format: '5v5, first to 13 rounds',
    icon: 'plastic',
    matchDow: 5,
    mapWord: 'Map',
    scoreWord: 'rounds',
    platform: 'PC',
    blurb: 'Economy, angles, utility. Round by round, thirteen to win.',
    roles: [
      r('igl', 'In-game leader', { dec: 3, sense: 3, comms: 3, team: 2, comp: 2, mech: 1, util: 2 }),
      r('entry', 'Entry', { mech: 4, react: 3, comp: 2, pos: 1, team: 2, focus: 1 }),
      r('awp', 'AWPer', { react: 4, mech: 3, pos: 3, comp: 2, focus: 2 }),
      r('lurk', 'Lurker', { sense: 4, pos: 3, dec: 2, mech: 2, comp: 2 }),
      r('sup', 'Support', { util: 4, team: 3, comms: 2, pos: 2, mech: 2, sense: 1 }),
    ],
  },
  val: {
    id: 'val',
    real: 'Valorant',
    realShort: 'VAL',
    studio: 'Sigil Protocol',
    studioShort: 'SGL',
    genre: 'Ability shooter',
    format: '5v5, first to 13 rounds',
    icon: 'sigil',
    matchDow: 4,
    mapWord: 'Map',
    scoreWord: 'rounds',
    platform: 'PC',
    blurb: 'Gunfights bent by abilities. Compositions decide executes.',
    roles: [
      r('duel', 'Duelist', { mech: 4, react: 4, comp: 2, util: 1, dec: 1 }),
      r('init', 'Initiator', { util: 4, team: 3, comms: 2, mech: 2, sense: 2 }),
      r('ctrl', 'Controller', { util: 3, dec: 3, sense: 3, comms: 2, mech: 1 }),
      r('sent', 'Sentinel', { pos: 4, sense: 3, comp: 2, mech: 2, util: 2 }),
      r('flex', 'Flex', { adapt: 3, mech: 3, util: 2, dec: 2, team: 2 }),
    ],
  },
  dota: {
    id: 'dota',
    real: 'Dota 2',
    realShort: 'DOTA',
    studio: 'Elderlane',
    studioShort: 'ELD',
    genre: 'MOBA',
    format: '5v5, destroy the core',
    icon: 'lane',
    matchDow: 6,
    mapWord: 'Game',
    scoreWord: 'kills',
    platform: 'PC',
    blurb: 'Three lanes, twenty heroes, one core. Draft, farm, fight.',
    roles: [
      r('carry', 'Carry', { mech: 4, focus: 3, dec: 2, pos: 3, comp: 1 }),
      r('mid', 'Mid', { mech: 4, react: 2, dec: 3, comp: 2, sense: 1 }),
      r('off', 'Offlane', { dec: 3, team: 3, pos: 2, comp: 2, util: 2 }),
      r('soft', 'Soft support', { sense: 3, util: 3, team: 3, adapt: 2, react: 1 }),
      r('hard', 'Hard support', { comms: 3, team: 3, util: 3, sense: 3, pos: 1 }),
    ],
  },
  ow: {
    id: 'ow',
    real: 'Overwatch',
    realShort: 'OW',
    studio: 'Nova Vanguard',
    studioShort: 'NVG',
    genre: 'Hero shooter',
    format: '5v5, control and escort',
    icon: 'nova',
    matchDow: 3,
    mapWord: 'Map',
    scoreWord: 'points',
    platform: 'PC / console',
    blurb: 'Shields, ultimates and a point to hold. Fights swing on one combo.',
    roles: [
      r('tank', 'Tank', { pos: 3, dec: 3, team: 3, comms: 2, util: 2, comp: 1 }),
      r('hit', 'Hitscan', { mech: 4, react: 3, focus: 2, pos: 2, sense: 1 }),
      r('fdps', 'Flex DPS', { mech: 3, adapt: 3, dec: 2, sense: 2, util: 2 }),
      r('msup', 'Main support', { team: 3, comms: 3, pos: 3, util: 2, sense: 2 }),
      r('fsup', 'Flex support', { util: 3, mech: 3, react: 2, sense: 2, comp: 2 }),
    ],
  },
};
export const roleOf = (t: TitleId, id: string) => TITLE[t].roles.find(x => x.id === id)!;
export function overall(attrs: Record<Attr, number>, t: TitleId, role: string): number {
  const w = roleOf(t, role).w;
  let s = 0,
    n = 0;
  for (const a of ATTRS) {
    const k = (w[a] ?? 0) + 0.35;
    s += attrs[a] * k;
    n += k;
  }
  return s / n;
}
