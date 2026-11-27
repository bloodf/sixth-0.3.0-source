/** HQ rooms, sites, staff, equipment, sponsors, training blocks. All money in whole dollars. */
import type { TitleId } from './titles.ts';
export type RoomType =
  | 'practice'
  | 'strategy'
  | 'gym'
  | 'wellness'
  | 'kitchen'
  | 'lounge'
  | 'stream'
  | 'workshop'
  | 'office'
  | 'medical'
  | 'dorm'
  | 'trophy'
  | 'bath';
export interface RoomDef {
  id: RoomType;
  name: string;
  w: number;
  h: number;
  cost: number;
  upkeep: number;
  desc: string;
  fx: [string, string, string];
  max: number;
  icon: string;
}
export const ROOMS: Record<RoomType, RoomDef> = {
  practice: {
    id: 'practice',
    name: 'Practice room',
    w: 8,
    h: 6,
    cost: 14000,
    upkeep: 220,
    max: 4,
    icon: 'monitor',
    desc: 'Five stations for one squad. Without one, that squad trains from home.',
    fx: ['Squad trains at full rate', 'Training +12%', 'Training +25%'],
  },
  strategy: {
    id: 'strategy',
    name: 'Strategy room',
    w: 6,
    h: 5,
    cost: 11000,
    upkeep: 140,
    max: 1,
    icon: 'presentation',
    desc: 'VOD wall and table. Where coaches and analysts work.',
    fx: ['Tactics and VOD +15%', 'Tactics and VOD +30%', 'Tactics and VOD +45%'],
  },
  gym: {
    id: 'gym',
    name: 'Gym',
    w: 6,
    h: 5,
    cost: 16000,
    upkeep: 260,
    max: 1,
    icon: 'dumbbell',
    desc: 'Stamina, posture and wrists. The trainer works here.',
    fx: ['Physical +20%', 'Physical +40%', 'Physical +60%, fewer strains'],
  },
  wellness: {
    id: 'wellness',
    name: 'Quiet room',
    w: 5,
    h: 4,
    cost: 9000,
    upkeep: 120,
    max: 1,
    icon: 'brain',
    desc: 'Counselling and recovery. The psychologist works here.',
    fx: ['Stress relief +25%', 'Stress relief +50%', 'Stress relief +80%'],
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    w: 6,
    h: 5,
    cost: 8500,
    upkeep: 180,
    max: 1,
    icon: 'utensils',
    desc: 'Real food at a real table. The chef works here.',
    fx: ['Energy recovery +10%', 'Energy recovery +18%', 'Energy recovery +28%'],
  },
  lounge: {
    id: 'lounge',
    name: 'Lounge',
    w: 6,
    h: 5,
    cost: 7000,
    upkeep: 90,
    max: 1,
    icon: 'sofa',
    desc: 'Sofas, consoles, a table-tennis table. Chemistry happens here.',
    fx: ['Morale +', 'Morale ++, synergy +', 'Morale +++, synergy ++'],
  },
  stream: {
    id: 'stream',
    name: 'Streaming studio',
    w: 5,
    h: 4,
    cost: 12000,
    upkeep: 150,
    max: 1,
    icon: 'video',
    desc: 'Content and income. The content lead works here.',
    fx: ['Stream income and fans', 'Stream income +40%', 'Stream income +90%'],
  },
  workshop: {
    id: 'workshop',
    name: 'IT workshop',
    w: 5,
    h: 4,
    cost: 10000,
    upkeep: 110,
    max: 1,
    icon: 'wrench',
    desc: 'Spares, benches, a server rack. The technician works here.',
    fx: ['Wear -20%', 'Wear -40%, better pings', 'Wear -60%, best pings'],
  },
  office: {
    id: 'office',
    name: 'Front office',
    w: 6,
    h: 4,
    cost: 9500,
    upkeep: 130,
    max: 1,
    icon: 'briefcase',
    desc: 'Scouts, partnerships and your own desk.',
    fx: ['Scouting and sponsors', 'Scouting +25%, sponsors +8%', 'Scouting +50%, sponsors +16%'],
  },
  medical: {
    id: 'medical',
    name: 'Treatment room',
    w: 4,
    h: 4,
    cost: 12000,
    upkeep: 170,
    max: 1,
    icon: 'stethoscope',
    desc: 'Physiotherapy for wrists, backs and eyes. The therapist works here.',
    fx: ['Injury risk -25%', 'Injury risk -45%', 'Injury risk -65%'],
  },
  dorm: {
    id: 'dorm',
    name: 'Sleep pods',
    w: 7,
    h: 5,
    cost: 15000,
    upkeep: 240,
    max: 1,
    icon: 'bed',
    desc: 'Dark, cool, quiet. Sleep is a stat.',
    fx: ['Night recovery +12%', 'Night recovery +22%', 'Night recovery +32%'],
  },
  trophy: {
    id: 'trophy',
    name: 'Trophy hall',
    w: 5,
    h: 4,
    cost: 18000,
    upkeep: 60,
    max: 1,
    icon: 'trophy',
    desc: 'What you have won, on show. Sponsors like walking through it.',
    fx: ['Fans +8%', 'Fans +16%, sponsors +5%', 'Fans +25%, sponsors +10%'],
  },
  bath: {
    id: 'bath',
    name: 'Bathroom',
    w: 4,
    h: 4,
    cost: 6000,
    upkeep: 90,
    max: 2,
    icon: 'shower-head',
    desc: 'Showers, toilets, a mirror. Without one people wash at home, when they remember to.',
    fx: ['People can wash', 'Morning freshness, hygiene +', 'Nobody skips a shower'],
  },
};
export const ROOM_TYPES = Object.keys(ROOMS) as RoomType[];
export interface SiteDef {
  name: string;
  /** land you start with, in tiles of one metre */
  w: number;
  h: number;
  /** most land you can own here */
  mw: number;
  mh: number;
  rent: number;
  deposit: number;
  /** one-off price and weekly rent per extra tile of land */
  land: number;
  landRent: number;
  desc: string;
}
export const SITES: SiteDef[] = [
  {
    name: 'Rented flat',
    w: 18,
    h: 13,
    mw: 24,
    mh: 18,
    rent: 650,
    deposit: 0,
    land: 60,
    landRent: 2,
    desc: 'A ground-floor flat and a yard behind a laundromat. Everyone started somewhere.',
  },
  {
    name: 'Team house',
    w: 24,
    h: 18,
    mw: 34,
    mh: 26,
    rent: 1500,
    deposit: 16000,
    land: 75,
    landRent: 2.5,
    desc: 'A house with a garden. The neighbours are patient so far.',
  },
  {
    name: 'Studio plot',
    w: 34,
    h: 24,
    mw: 44,
    mh: 32,
    rent: 3400,
    deposit: 60000,
    land: 90,
    landRent: 3,
    desc: 'A converted warehouse plot at the edge of town.',
  },
  {
    name: 'Campus',
    w: 42,
    h: 30,
    mw: 60,
    mh: 44,
    rent: 7500,
    deposit: 180000,
    land: 110,
    landRent: 3.5,
    desc: 'Open land for a purpose-built training centre.',
  },
];
export type StaffRole =
  'coach' | 'analyst' | 'psych' | 'therapist' | 'trainer' | 'chef' | 'tech' | 'scout' | 'content' | 'partner' | 'cleaner';
export interface StaffDef {
  id: StaffRole;
  name: string;
  room: RoomType;
  base: number;
  max: number;
  desc: string;
  fx: string;
  perTitle?: boolean;
}
export const STAFF: Record<StaffRole, StaffDef> = {
  coach: {
    id: 'coach',
    name: 'Head coach',
    room: 'strategy',
    base: 900,
    max: 4,
    perTitle: true,
    desc: 'Runs practice for one squad and stands behind them on stage.',
    fx: 'Training growth, tactic familiarity, steadier timeouts',
  },
  analyst: {
    id: 'analyst',
    name: 'Analyst',
    room: 'strategy',
    base: 620,
    max: 2,
    desc: 'Turns footage into a plan.',
    fx: 'VOD review, opponent reports, map preparation',
  },
  psych: {
    id: 'psych',
    name: 'Psychologist',
    room: 'wellness',
    base: 760,
    max: 2,
    desc: 'Keeps pressure from becoming tilt.',
    fx: 'Stress, composure, conflict outcomes',
  },
  therapist: {
    id: 'therapist',
    name: 'Physiotherapist',
    room: 'medical',
    base: 640,
    max: 2,
    desc: 'Wrists, shoulders, eyes. The career-length job.',
    fx: 'Injury risk and recovery time',
  },
  trainer: {
    id: 'trainer',
    name: 'Performance trainer',
    room: 'gym',
    base: 580,
    max: 2,
    desc: 'Sleep, movement, routine.',
    fx: 'Stamina growth, energy recovery',
  },
  chef: {
    id: 'chef',
    name: 'Chef',
    room: 'kitchen',
    base: 520,
    max: 2,
    desc: 'Food and beverage for the whole building.',
    fx: 'Energy, morale, fewer sick days',
  },
  tech: {
    id: 'tech',
    name: 'IT technician',
    room: 'workshop',
    base: 560,
    max: 2,
    desc: 'Frames, latency, spares.',
    fx: 'Equipment wear, no mid-match failures',
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    room: 'office',
    base: 600,
    max: 3,
    desc: 'Watches the ladder so you do not have to.',
    fx: 'Reveals attributes and potential faster',
  },
  content: {
    id: 'content',
    name: 'Content lead',
    room: 'stream',
    base: 540,
    max: 2,
    desc: 'Turns players into people fans know.',
    fx: 'Stream income, fan growth, merch',
  },
  partner: {
    id: 'partner',
    name: 'Partnerships lead',
    room: 'office',
    base: 680,
    max: 1,
    desc: 'Sells the space on the shirt.',
    fx: 'More and better sponsor offers',
  },
  cleaner: {
    id: 'cleaner',
    name: 'Housekeeper',
    room: 'bath',
    base: 420,
    max: 2,
    desc: 'Clears what the squads leave behind, and says so.',
    fx: 'Mess, smells, arguments about dishes',
  },
};
export const STAFF_ROLES = Object.keys(STAFF) as StaffRole[];
export const STAFF_TRAITS = [
  'Disciplinarian',
  'Player whisperer',
  'Data-led',
  'Ex-pro',
  'Night shift',
  'Patient',
  'Perfectionist',
  'Well connected',
] as const;

export type GearSlot = 'rig' | 'monitor' | 'mouse' | 'keyboard' | 'headset' | 'chair';
export const GEAR_SLOTS: GearSlot[] = ['rig', 'monitor', 'mouse', 'keyboard', 'headset', 'chair'];
export interface GearItem {
  brand: string;
  name: string;
  price: number;
  q: number;
  wear: number;
  spec: string;
  console?: boolean;
}
const g = (brand: string, name: string, price: number, q: number, wear: number, spec: string, console = false): GearItem => ({
  brand,
  name,
  price,
  q,
  wear,
  spec,
  console,
});
/** q = quality 0-100, wear = condition lost per training day */
export const GEAR: Record<GearSlot, GearItem[]> = {
  rig: [
    g('Homebuilt', 'Parts bin', 0, 18, 0.75, '140 fps, throttles'),
    g('Orbis', 'Console One', 480, 34, 0.2, '120 fps locked, console', true),
    g('Corvex', 'Ember 5', 1100, 48, 0.5, '240 fps'),
    g('Corvex', 'Forge 9', 2400, 72, 0.45, '360 fps'),
    g('Halden', 'Tournament X', 4800, 93, 0.4, '540 fps, liquid loop'),
  ],
  monitor: [
    g('Generic', '60 Hz office', 0, 12, 0.2, '60 Hz, 8 ms'),
    g('Viso', 'V144', 210, 42, 0.18, '144 Hz'),
    g('Viso', 'V240 Pro', 420, 64, 0.18, '240 Hz'),
    g('Lumera', 'Strobe 360', 780, 82, 0.2, '360 Hz'),
    g('Lumera', 'Zero 600', 1500, 96, 0.22, '600 Hz, 0.5 ms'),
  ],
  mouse: [
    g('Generic', 'Two-button', 0, 15, 0.6, '1000 dpi'),
    g('Pike', 'Dart', 45, 45, 0.5, '78 g wired'),
    g('Pike', 'Dart Air', 95, 68, 0.5, '58 g wireless'),
    g('Sable', 'Feather', 150, 84, 0.55, '46 g, 4 kHz'),
    g('Sable', 'Feather Signature', 260, 95, 0.6, '39 g, 8 kHz'),
  ],
  keyboard: [
    g('Generic', 'Membrane', 0, 18, 0.4, 'Membrane'),
    g('Clackworks', 'Sixty', 80, 48, 0.3, 'Linear'),
    g('Clackworks', 'Sixty Pro', 140, 66, 0.3, 'Fast linear'),
    g('Magnet', 'Hall One', 210, 85, 0.28, 'Hall effect, rapid trigger'),
    g('Magnet', 'Hall Stage', 340, 95, 0.28, 'Hall effect, 8 kHz'),
  ],
  headset: [
    g('Generic', 'Earbuds', 0, 16, 0.5, 'Stereo'),
    g('Murmur', 'Base', 70, 46, 0.35, 'Closed back'),
    g('Murmur', 'Clear', 140, 66, 0.35, 'Noise isolating'),
    g('Aria', 'Stage', 240, 84, 0.3, 'ANC, broadcast mic'),
    g('Aria', 'Silence', 420, 95, 0.3, 'ANC, bone mic'),
  ],
  chair: [
    g('Generic', 'Kitchen chair', 0, 10, 0.2, 'No support'),
    g('Basso', 'Racer', 160, 38, 0.2, 'Foam'),
    g('Basso', 'Mesh', 380, 64, 0.12, 'Lumbar support'),
    g('Ergon', 'Posture', 820, 84, 0.1, 'Full ergonomic'),
    g('Ergon', 'Posture Pro', 1400, 95, 0.1, 'Fitted per player'),
  ],
};
export type Block = 'scrim' | 'aim' | 'tactics' | 'vod' | 'gym' | 'mind' | 'bond' | 'stream' | 'rest';
export const BLOCKS: Record<
  Block,
  { name: string; short: string; energy: number; stress: number; desc: string; room: RoomType | null; icon: string }
> = {
  scrim: {
    name: 'Scrim',
    short: 'SCR',
    energy: -11,
    stress: 4,
    desc: 'Practice match. Teamwork, decisions, comms, synergy.',
    room: 'practice',
    icon: 'swords',
  },
  aim: { name: 'Aim lab', short: 'AIM', energy: -8, stress: 2.5, desc: 'Mechanics and reaction.', room: 'practice', icon: 'crosshair' },
  tactics: {
    name: 'Tactics',
    short: 'TAC',
    energy: -6,
    stress: 2,
    desc: 'Plan familiarity, utility, positioning.',
    room: 'strategy',
    icon: 'map',
  },
  vod: {
    name: 'VOD review',
    short: 'VOD',
    energy: -4,
    stress: 1.5,
    desc: 'Game sense, decisions, opponent prep.',
    room: 'strategy',
    icon: 'film',
  },
  gym: { name: 'Physical', short: 'GYM', energy: -4, stress: -3, desc: 'Stamina, fewer injuries.', room: 'gym', icon: 'dumbbell' },
  mind: { name: 'Mind', short: 'MND', energy: 3, stress: -10, desc: 'Composure, focus, stress relief.', room: 'wellness', icon: 'brain' },
  bond: { name: 'Team time', short: 'TEAM', energy: 3, stress: -5, desc: 'Morale and synergy.', room: 'lounge', icon: 'users' },
  stream: { name: 'Stream', short: 'STR', energy: -4, stress: 1, desc: 'Income and fans.', room: 'stream', icon: 'video' },
  rest: { name: 'Rest', short: 'REST', energy: 10, stress: -4, desc: 'Recover.', room: 'lounge', icon: 'moon' },
};
export const BLOCK_IDS = Object.keys(BLOCKS) as Block[];
export const WEEK_PRESETS: Record<string, { name: string; desc: string; week: Block[][] }> = {
  balanced: {
    name: 'Balanced',
    desc: 'A bit of everything, one day off',
    week: [
      ['aim', 'scrim', 'tactics'],
      ['gym', 'scrim', 'vod'],
      ['aim', 'tactics', 'mind'],
      ['vod', 'scrim', 'bond'],
      ['aim', 'tactics', 'rest'],
      ['mind', 'rest', 'bond'],
      ['rest', 'rest', 'stream'],
    ],
  },
  grind: {
    name: 'Grind',
    desc: 'Fast growth, watch the stress',
    week: [
      ['aim', 'scrim', 'scrim'],
      ['aim', 'scrim', 'tactics'],
      ['gym', 'scrim', 'scrim'],
      ['aim', 'scrim', 'vod'],
      ['aim', 'scrim', 'tactics'],
      ['vod', 'scrim', 'rest'],
      ['rest', 'mind', 'rest'],
    ],
  },
  prep: {
    name: 'Match prep',
    desc: 'Plans and opponent study',
    week: [
      ['tactics', 'vod', 'scrim'],
      ['tactics', 'scrim', 'vod'],
      ['vod', 'tactics', 'mind'],
      ['tactics', 'vod', 'bond'],
      ['tactics', 'vod', 'rest'],
      ['mind', 'rest', 'rest'],
      ['rest', 'vod', 'rest'],
    ],
  },
  recover: {
    name: 'Recovery',
    desc: 'Bring energy and morale back',
    week: [
      ['gym', 'rest', 'mind'],
      ['aim', 'rest', 'bond'],
      ['gym', 'mind', 'rest'],
      ['aim', 'bond', 'rest'],
      ['gym', 'rest', 'mind'],
      ['rest', 'bond', 'rest'],
      ['rest', 'rest', 'rest'],
    ],
  },
  content: {
    name: 'Content push',
    desc: 'Money and fans first',
    week: [
      ['aim', 'stream', 'scrim'],
      ['gym', 'stream', 'stream'],
      ['aim', 'scrim', 'stream'],
      ['vod', 'stream', 'bond'],
      ['aim', 'tactics', 'stream'],
      ['rest', 'stream', 'rest'],
      ['rest', 'bond', 'stream'],
    ],
  },
};
export type SponsorSlot = 'front' | 'sleeve' | 'tech' | 'drink';
export const SPONSOR_SLOTS: Record<SponsorSlot, { name: string; k: number }> = {
  front: { name: 'Shirt front', k: 1 },
  sleeve: { name: 'Sleeve', k: 0.5 },
  tech: { name: 'Tech partner', k: 0.6 },
  drink: { name: 'Food and drink', k: 0.45 },
};
export const SPONSORS: Record<SponsorSlot, [string, string][]> = {
  front: [
    ['Northbank', 'bank'],
    ['Parcelo', 'delivery'],
    ['Telvia', 'telecom'],
    ['Skyhop', 'airline'],
    ['Havn Insurance', 'insurance'],
    ['Mobira', 'mobility'],
  ],
  sleeve: [
    ['Pixel & Thread', 'apparel'],
    ['Gridpay', 'payments'],
    ['Loopcard', 'fintech'],
    ['Stayo', 'hotels'],
  ],
  tech: [
    ['Corvex', 'PCs'],
    ['Lumera', 'displays'],
    ['Magnet', 'keyboards'],
    ['Aria', 'audio'],
    ['Halden', 'systems'],
  ],
  drink: [
    ['Volta', 'energy drink'],
    ['Mori Tea', 'iced tea'],
    ['Bowlful', 'meals'],
    ['Kettle & Co', 'coffee'],
  ],
};
export interface Origin {
  id: string;
  name: string;
  desc: string;
  cash: number;
  site: number;
  fans: number;
  rep: number;
  diff: string;
  rooms: RoomType[];
  gear: number;
  quality: number;
}
export const ORIGINS: Origin[] = [
  {
    id: 'flat',
    name: 'From the flat',
    desc: 'Five friends, a lease and a group chat. Slow, proud, yours.',
    cash: 70000,
    site: 0,
    fans: 900,
    rep: 8,
    diff: 'Hard',
    rooms: ['kitchen'],
    gear: 0,
    quality: 50,
  },
  {
    id: 'backed',
    name: 'Backed start',
    desc: 'An investor gave you a house and eighteen months.',
    cash: 220000,
    site: 1,
    fans: 6000,
    rep: 16,
    diff: 'Normal',
    rooms: ['kitchen', 'strategy', 'lounge', 'bath'],
    gear: 1,
    quality: 54,
  },
  {
    id: 'fallen',
    name: 'Fallen giant',
    desc: 'A famous name, an empty trophy hall, expensive expectations.',
    cash: 420000,
    site: 2,
    fans: 60000,
    rep: 34,
    diff: 'Pressure',
    rooms: ['kitchen', 'strategy', 'lounge', 'office', 'trophy', 'bath'],
    gear: 2,
    quality: 58,
  },
];
export const TRAITS: Record<string, { name: string; desc: string; good: boolean }> = {
  clutch: { name: 'Clutch', desc: 'Better when outnumbered or behind', good: true },
  ice: { name: 'Ice', desc: 'Tilt builds slowly', good: true },
  grinder: { name: 'Grinder', desc: 'Trains faster, tires faster', good: true },
  leader: { name: 'Leader', desc: 'Lifts teammates’ composure', good: true },
  star: { name: 'Star', desc: 'Draws fans, costs more', good: true },
  loyal: { name: 'Loyal', desc: 'Renews cheaper', good: true },
  prodigy: { name: 'Prodigy', desc: 'High ceiling, learns fast', good: true },
  hothead: { name: 'Hothead', desc: 'Tilts quickly', good: false },
  homebody: { name: 'Homebody', desc: 'Dislikes travel and late nights', good: false },
  glass: { name: 'Fragile', desc: 'More wrist trouble', good: false },
  merc: { name: 'Mercenary', desc: 'Wants the next contract', good: false },
  streamer: { name: 'Streamer', desc: 'Great content, split focus', good: true },
};
export const TITLE_ENTRY_COST: Record<TitleId, number> = { cs2: 15000, val: 15000, dota: 15000, ow: 12000 };
