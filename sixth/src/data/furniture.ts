/**
 * Build catalogue. Sizes are in half-tiles (0.5 m). An item's local frame has its back at -z and its front at +z;
 * rotation r turns it by r * 90 degrees. Spots are where people use it, in metres from the centre.
 */
import type { RoomType } from './club.ts';
export type Cat =
  'wash' | 'play' | 'work' | 'kitchen' | 'comfort' | 'fitness' | 'care' | 'media' | 'sleep' | 'trophies' | 'decor' | 'outdoor';
export const CATS: [Cat, string][] = [
  ['play', 'Practice'],
  ['work', 'Work'],
  ['kitchen', 'Kitchen'],
  ['comfort', 'Comfort'],
  ['fitness', 'Fitness'],
  ['care', 'Care'],
  ['media', 'Media'],
  ['sleep', 'Sleep'],
  ['wash', 'Wash and order'],
  ['trophies', 'Trophies'],
  ['decor', 'Decor'],
  ['outdoor', 'Garden'],
];
export interface SpotDef {
  x: number;
  z: number;
  ry: number;
  act: string;
  role: 'seat' | 'coach' | 'desk' | 'play' | 'bed' | 'helper' | 'guest' | 'me';
  seat?: number;
  y?: number;
}
export interface Furn {
  id: string;
  name: string;
  cat: Cat;
  w: number;
  d: number;
  price: number;
  /** hangs on a wall behind it and never blocks the floor */
  wall?: boolean;
  /** rugs and mats: people walk over them */
  flat?: boolean;
  /** may stand on bare land */
  out?: boolean;
  /** counts towards these requirements */
  is?: string[];
  /** room points by purpose; '*' counts anywhere */
  pts?: Partial<Record<RoomType | '*', number>>;
  spots?: SpotDef[];
}
const PI = Math.PI;
const sp = (x: number, z: number, ry: number, act: string, role: SpotDef['role'] = 'seat', o: Partial<SpotDef> = {}): SpotDef => ({
  x,
  z,
  ry,
  act,
  role,
  ...o,
});
const f = (id: string, name: string, cat: Cat, w: number, d: number, price: number, o: Partial<Furn> = {}): Furn => ({
  id,
  name,
  cat,
  w,
  d,
  price,
  ...o,
});
const L: Furn[] = [
  // practice
  f('station', 'Gaming station', 'play', 3, 4, 1400, { is: ['station'], spots: [sp(-0.1, 0.42, PI, 'type', 'seat', { seat: 0.44 })] }),
  f('coachdesk', 'Coach desk', 'play', 4, 4, 900, {
    pts: { practice: 2, strategy: 1 },
    spots: [sp(0, 0.45, PI, 'type', 'desk', { seat: 0.44 })],
  }),
  f('wallscreen', 'Wall screen', 'play', 6, 1, 1600, {
    wall: true,
    is: ['screen'],
    pts: { practice: 3, strategy: 2, lounge: 1, office: 1 },
  }),
  f('acoustic', 'Acoustic panels', 'play', 4, 1, 420, { wall: true, pts: { practice: 1.5, stream: 2 } }),
  f('ledstrip', 'Light strip', 'play', 6, 1, 260, { wall: true, pts: { practice: 1, stream: 1, lounge: 0.5 } }),
  f('cooler', 'Water cooler', 'play', 2, 2, 220, { pts: { practice: 1, gym: 1.5, office: 0.5, strategy: 0.5 } }),
  f('minifridge', 'Drinks fridge', 'play', 2, 2, 480, { pts: { practice: 1.5, kitchen: 2.5, lounge: 1, stream: 1 } }),
  // work
  f('meet6', 'Meeting table', 'work', 10, 7, 2400, {
    is: ['table'],
    pts: { strategy: 1 },
    spots: [-1, 0, 1]
      .flatMap(i => [sp(i, 1.2, PI, 'sit'), sp(i, -1.2, 0, 'sit')])
      .concat([sp(-1.98, 0, PI / 2, 'sit'), sp(1.98, 0, -PI / 2, 'sit')]),
  }),
  f('whiteboard', 'Whiteboard', 'work', 4, 1, 340, { wall: true, pts: { strategy: 2, office: 1.5, workshop: 1 } }),
  f('officedesk', 'Office desk', 'work', 4, 4, 760, { is: ['desk'], spots: [sp(0, 0.45, PI, 'type', 'desk', { seat: 0.44 })] }),
  f('filing', 'Filing cabinet', 'work', 2, 1, 240, { is: ['storage'], pts: { office: 1 } }),
  f('bookcase', 'Bookcase', 'work', 4, 1, 420, { is: ['storage'], pts: { office: 2, wellness: 1, lounge: 1, strategy: 1 } }),
  f('workbench', 'Workbench', 'work', 6, 2, 1500, {
    is: ['bench'],
    spots: [sp(-0.6, 0.85, PI, 'cook', 'coach'), sp(0.7, 0.85, PI, 'cook', 'seat')],
  }),
  f('rack', 'Server rack', 'work', 2, 2, 1900, { is: ['rack'], pts: { workshop: 3.5 } }),
  f('shelves', 'Spares shelf', 'work', 4, 1, 360, { is: ['rack'], pts: { workshop: 2 } }),
  f('crates', 'Parts crates', 'work', 2, 2, 120, { pts: { workshop: 1 } }),
  f('printer', 'Printer', 'work', 2, 2, 380, { pts: { office: 1.5, strategy: 0.5 } }),
  // kitchen
  f('counter', 'Counter', 'kitchen', 2, 2, 320, { pts: { kitchen: 0.5 } }),
  f('sinkc', 'Sink', 'kitchen', 2, 2, 520, { is: ['sink'], spots: [sp(0, 0.85, PI, 'cook', 'helper')] }),
  f('stove', 'Stove', 'kitchen', 2, 2, 860, { is: ['stove'], spots: [sp(0, 0.85, PI, 'cook', 'coach')] }),
  f('prostove', 'Chef range', 'kitchen', 4, 2, 3200, { is: ['stove'], pts: { kitchen: 4 }, spots: [sp(0, 0.85, PI, 'cook', 'coach')] }),
  f('fridge', 'Fridge', 'kitchen', 2, 2, 780, { is: ['fridge'] }),
  f('island', 'Kitchen island', 'kitchen', 4, 2, 900, { pts: { kitchen: 2 } }),
  f('dining4', 'Dining table for four', 'kitchen', 5, 6, 780, {
    is: ['dining'],
    spots: [sp(-0.45, 0.95, PI, 'sit'), sp(0.45, 0.95, PI, 'sit'), sp(-0.45, -0.95, 0, 'sit'), sp(0.45, -0.95, 0, 'sit')],
  }),
  f('dining6', 'Dining table for six', 'kitchen', 7, 6, 1300, {
    is: ['dining'],
    pts: { kitchen: 1.5 },
    spots: [-0.85, 0, 0.85].flatMap(i => [sp(i, 0.95, PI, 'sit'), sp(i, -0.95, 0, 'sit')]),
  }),
  f('coffee', 'Coffee bar', 'kitchen', 3, 2, 1100, { pts: { kitchen: 2.5, lounge: 1.5, office: 1.5 } }),
  // comfort
  f('sofa', 'Sofa', 'comfort', 5, 2, 720, {
    is: ['sofa'],
    spots: [sp(-0.6, 0.05, 0, 'sit', 'seat', { seat: 0.34 }), sp(0.6, 0.05, 0, 'sit', 'seat', { seat: 0.34 })],
  }),
  f('armchair', 'Armchair', 'comfort', 2, 2, 380, {
    is: ['armchair'],
    pts: { lounge: 1, office: 0.5 },
    spots: [sp(0, 0.05, 0, 'sit', 'guest', { seat: 0.34 })],
  }),
  f('beanbag', 'Beanbag', 'comfort', 2, 2, 120, {
    pts: { lounge: 1, stream: 0.5 },
    spots: [sp(0, 0.02, 0, 'sit', 'seat', { seat: 0.24 })],
  }),
  f('ctable', 'Coffee table', 'comfort', 3, 2, 240, { pts: { lounge: 1, wellness: 0.5 } }),
  f('tv', 'Television', 'comfort', 4, 1, 1100, { is: ['fun'], wall: true, pts: { lounge: 2.5, dorm: 1 } }),
  f('pingpong', 'Table tennis', 'comfort', 6, 4, 1400, {
    is: ['fun'],
    pts: { lounge: 3 },
    spots: [sp(-1.85, 0, PI / 2, 'pingpong', 'play'), sp(1.85, 0, -PI / 2, 'pingpong', 'play')],
  }),
  f('arcade', 'Arcade cabinet', 'comfort', 2, 2, 1300, { is: ['fun'], pts: { lounge: 2.5 }, spots: [sp(0, 0.8, PI, 'cook', 'play')] }),
  f('foosball', 'Table football', 'comfort', 3, 4, 900, {
    is: ['fun'],
    pts: { lounge: 2.5 },
    spots: [sp(-1.05, 0, PI / 2, 'pingpong', 'play'), sp(1.05, 0, -PI / 2, 'pingpong', 'play')],
  }),
  // fitness
  f('treadmill', 'Treadmill', 'fitness', 2, 4, 2200, {
    is: ['cardio'],
    pts: { gym: 1 },
    spots: [sp(0, 0.1, PI, 'run', 'seat', { y: 0.19 })],
  }),
  f('bench', 'Bench press', 'fitness', 3, 4, 1500, { is: ['weights'], pts: { gym: 1.5 }, spots: [sp(0, 0.15, 0, 'bench', 'seat')] }),
  f('dumbbells', 'Dumbbell rack', 'fitness', 4, 1, 980, {
    is: ['weights'],
    pts: { gym: 2 },
    spots: [sp(-0.5, 0.85, PI, 'lift', 'seat'), sp(0.6, 0.9, PI, 'lift', 'seat')],
  }),
  f('mat', 'Yoga mat', 'fitness', 2, 4, 60, { flat: true, pts: { gym: 1, wellness: 1 }, spots: [sp(0, 0, 0, 'yoga', 'seat')] }),
  f('bag', 'Punch bag', 'fitness', 2, 2, 320, { pts: { gym: 1.5 } }),
  f('mirror', 'Mirror wall', 'fitness', 6, 1, 520, { wall: true, pts: { gym: 2 } }),
  // care
  f('couch', 'Therapy couch', 'care', 4, 2, 980, { is: ['couch'], spots: [sp(0.05, 0, -PI / 2, 'lie', 'seat', { y: -0.12 })] }),
  f('listener', 'Counsellor chair', 'care', 2, 2, 520, {
    is: ['armchair'],
    pts: { wellness: 1 },
    spots: [sp(0, 0.05, 0, 'sit', 'coach', { seat: 0.34 })],
  }),
  f('salt', 'Salt lamp', 'care', 1, 1, 90, { pts: { wellness: 1.5, dorm: 0.5 } }),
  f('fountain', 'Indoor fountain', 'care', 2, 2, 860, { pts: { wellness: 3, lounge: 0.5 } }),
  f('bedt', 'Treatment bed', 'care', 2, 4, 1300, {
    is: ['treat'],
    spots: [sp(0, 0.1, 0, 'lie', 'seat', { y: 0.02 }), sp(0.85, -0.1, -PI / 2, 'cook', 'coach')],
  }),
  f('medcab', 'Medical cabinet', 'care', 3, 1, 760, { is: ['med'], pts: { medical: 1 } }),
  f('scanner', 'Recovery scanner', 'care', 2, 2, 2600, { pts: { medical: 4 } }),
  f('icebath', 'Ice bath', 'care', 3, 3, 1900, { pts: { medical: 3, gym: 2 } }),
  // media
  f('streamdesk', 'Streaming desk', 'media', 4, 5, 2200, { is: ['stream'], spots: [sp(0, 0.25, PI, 'type', 'seat', { seat: 0.44 })] }),
  f('backdrop', 'Backdrop', 'media', 6, 1, 620, { wall: true, is: ['backdrop'], pts: { stream: 1 } }),
  f('softbox', 'Softbox light', 'media', 1, 1, 280, { pts: { stream: 1.5 } }),
  f('camera', 'Broadcast camera', 'media', 2, 2, 1800, { pts: { stream: 3 }, spots: [sp(0, 0.75, PI, 'idle', 'coach')] }),
  // sleep
  f('pod', 'Sleep pod', 'sleep', 2, 4, 1300, { is: ['bed'], spots: [sp(0, 0.15, 0, 'lie', 'bed', { y: -0.02 })] }),
  f('bunk', 'Bunk bed', 'sleep', 2, 4, 980, { is: ['bed', 'bed'], spots: [sp(0, 0.15, 0, 'lie', 'bed', { y: -0.02 })] }),
  f('nightstand', 'Nightstand', 'sleep', 1, 1, 120, { pts: { dorm: 1 } }),
  f('wardrobe', 'Wardrobe', 'sleep', 4, 1, 520, { pts: { dorm: 2 } }),
  f('blackout', 'Blackout curtain', 'sleep', 4, 1, 360, { wall: true, pts: { dorm: 2.5 } }),
  // trophies
  f('plinth', 'Trophy plinth', 'trophies', 1, 1, 520, { is: ['plinth'], pts: { trophy: 0.5 } }),
  f('tcase', 'Trophy case', 'trophies', 4, 1, 1800, { is: ['plinth', 'plinth'], pts: { trophy: 2.5, office: 1 } }),
  f('banner', 'Club banner', 'trophies', 3, 1, 380, { wall: true, pts: { trophy: 2, practice: 0.5, lounge: 0.5, '*': 0.25 } }),
  f('jersey', 'Framed shirt', 'trophies', 2, 1, 260, { wall: true, pts: { trophy: 1.5, lounge: 0.5, '*': 0.25 } }),
  f('neon', 'Neon crest', 'trophies', 3, 1, 780, { wall: true, pts: { practice: 1.5, stream: 2, lounge: 1, trophy: 2 } }),
  // decor
  f('plant', 'Plant', 'decor', 1, 1, 60, { out: true, pts: { '*': 0.5, wellness: 1 } }),
  f('palm', 'Big plant', 'decor', 2, 2, 160, { out: true, pts: { '*': 0.75, wellness: 1.5 } }),
  f('rug', 'Rug', 'decor', 6, 5, 260, { flat: true, pts: { '*': 0.5, lounge: 1, wellness: 1 } }),
  f('runner', 'Runner rug', 'decor', 2, 6, 160, { flat: true, pts: { '*': 0.5 } }),
  f('lamp', 'Floor lamp', 'decor', 1, 1, 140, { pts: { '*': 0.5, dorm: 0.5, wellness: 1 } }),
  f('painting', 'Painting', 'decor', 2, 1, 180, { wall: true, pts: { '*': 0.5 } }),
  f('clock', 'Wall clock', 'decor', 1, 1, 70, { wall: true, pts: { '*': 0.25, strategy: 0.5, office: 0.5 } }),
  f('reception', 'Reception desk', 'decor', 5, 3, 1200, { pts: { office: 1.5, '*': 0.25 } }),
  f('waitbench', 'Bench', 'decor', 4, 1, 180, {
    out: true,
    pts: { '*': 0.25 },
    spots: [sp(-0.4, 0.05, 0, 'sit', 'guest', { seat: 0.36 }), sp(0.4, 0.05, 0, 'sit', 'guest', { seat: 0.36 })],
  }),
  // wash and order
  f('shower', 'Shower', 'wash', 2, 2, 1600, { is: ['shower'], spots: [sp(0.05, 0.1, PI, 'idle', 'seat')] }),
  f('toilet', 'Toilet', 'wash', 2, 2, 700, { is: ['toilet'], spots: [sp(0, 0.05, 0, 'sit', 'guest', { seat: 0.4 })] }),
  f('basin', 'Washbasin', 'wash', 2, 1, 640, { is: ['basin'], spots: [sp(0, 0.62, PI, 'cook', 'desk')] }),
  f('bathcab', 'Mirror cabinet', 'wash', 2, 1, 320, { wall: true, pts: { bath: 2, dorm: 0.5 } }),
  f('washer', 'Washing machine', 'wash', 2, 2, 980, { pts: { bath: 3, dorm: 1 } }),
  f('hamper', 'Laundry basket', 'wash', 1, 1, 70, { pts: { bath: 1, dorm: 1 } }),
  f('bin', 'Waste bin', 'wash', 1, 1, 60, { pts: { '*': 0.5 } }),
  f('cart', 'Cleaning cart', 'wash', 2, 1, 260, { pts: { bath: 1, workshop: 0.5 } }),
  f('vending', 'Vending machine', 'kitchen', 2, 2, 2400, { pts: { lounge: 2, kitchen: 1.5 } }),
  f('exting', 'Fire extinguisher', 'wash', 1, 1, 120, { wall: true, pts: { '*': 0.25 } }),
  f('ups', 'Battery backup', 'work', 1, 1, 2600, { pts: { workshop: 2 } }),
  f('router', 'Spare 5G line', 'work', 1, 1, 1400, { pts: { workshop: 1.5 } }),
  f('generator', 'Generator', 'outdoor', 4, 2, 5200, { out: true }),
  // garden
  f('tree', 'Tree', 'outdoor', 2, 2, 180, { out: true }),
  f('hedge', 'Hedge', 'outdoor', 4, 1, 90, { out: true }),
  f('flowers', 'Flower bed', 'outdoor', 4, 2, 120, { out: true }),
  f('parasol', 'Table and parasol', 'outdoor', 4, 4, 420, {
    out: true,
    spots: [sp(0, 0.7, PI, 'sit', 'guest'), sp(0, -0.7, 0, 'sit', 'guest')],
  }),
  f('hoop', 'Basketball hoop', 'outdoor', 2, 2, 380, { out: true }),
  f('lamppost', 'Garden lamp', 'outdoor', 1, 1, 160, { out: true }),
  f('sign', 'Club sign', 'outdoor', 4, 1, 640, { out: true }),
  f('bikes', 'Bike rack', 'outdoor', 4, 2, 220, { out: true }),
];
export const FURN: Record<string, Furn> = Object.fromEntries(L.map(x => [x.id, x]));
export const FURN_LIST = L;
export interface Style {
  k: string;
  name: string;
  price: number;
  kind: 'wood' | 'carpet' | 'tile' | 'concrete' | 'rubber' | 'marble' | 'paint' | 'brick' | 'panel';
  c1: string;
  c2: string;
}
/** c1/c2 of '@1', '@2' mean the club colours */
const st = (k: string, name: string, price: number, kind: Style['kind'], c1: string, c2: string): Style => ({
  k,
  name,
  price,
  kind,
  c1,
  c2,
});
export const FLOORS: Style[] = [
  st('a', 'Oak', 45, 'wood', '#b49a76', '#a78c67'),
  st('b', 'Walnut', 60, 'wood', '#8a5f3d', '#754d30'),
  st('c', 'Pale ash', 55, 'wood', '#cdb795', '#c2aa86'),
  st('d', 'Slate carpet', 40, 'carpet', '#2b3942', '#31424c'),
  st('e', 'Club carpet', 55, 'carpet', '@1', '#1d2a31'),
  st('f', 'Night carpet', 40, 'carpet', '#364660', '#3d4e69'),
  st('g', 'Plum carpet', 40, 'carpet', '#3a3550', '#423c5c'),
  st('h', 'Checker tile', 50, 'tile', '#d9d6cd', '#b9b6ac'),
  st('i', 'Clinic tile', 50, 'tile', '#d5e2e0', '#c4d6d3'),
  st('j', 'Concrete', 25, 'concrete', '#9aa3a6', '#8f989b'),
  st('k', 'Gym rubber', 45, 'rubber', '#3c434a', '#454d55'),
  st('l', 'Dark marble', 110, 'marble', '#33302e', '#45403b'),
  st('m', 'White marble', 120, 'marble', '#e6e2da', '#d5cfc4'),
  st('n', 'Terrace stone', 35, 'tile', '#a59c8c', '#978e7f'),
];
export const WALLS: Style[] = [
  st('a', 'Chalk', 0, 'paint', '#f1ece2', '#f1ece2'),
  st('b', 'Sand', 8, 'paint', '#e0cfb2', '#e0cfb2'),
  st('c', 'Club colour', 14, 'paint', '@1', '@1'),
  st('d', 'Second colour', 14, 'paint', '@2', '@2'),
  st('e', 'Petrol', 10, 'paint', '#2c4e5a', '#2c4e5a'),
  st('f', 'Charcoal', 10, 'paint', '#3a4148', '#3a4148'),
  st('g', 'Sage', 10, 'paint', '#a9bba5', '#a9bba5'),
  st('h', 'Clay', 10, 'paint', '#c98d6e', '#c98d6e'),
  st('i', 'Brick', 22, 'brick', '#b0674a', '#9a573d'),
  st('j', 'Timber', 26, 'panel', '#a67c52', '#8f683f'),
];
export const FLOOR_BY: Record<string, Style> = Object.fromEntries(FLOORS.map(x => [x.k, x]));
export const WALL_BY: Record<string, Style> = Object.fromEntries(WALLS.map(x => [x.k, x]));
export const PRICE = { wall: 55, door: 140, window: 115 };
/** What a room needs to work, and how many points lift it. */
export interface Need {
  area: number;
  need: [string, number, string][];
  p2: number;
  p3: number;
}
export const NEEDS: Record<RoomType, Need> = {
  practice: { area: 28, need: [['station', 5, 'Gaming stations']], p2: 5, p3: 10 },
  strategy: {
    area: 20,
    need: [
      ['table', 1, 'Meeting table'],
      ['screen', 1, 'Wall screen'],
    ],
    p2: 7,
    p3: 10,
  },
  gym: {
    area: 16,
    need: [
      ['cardio', 1, 'Treadmill'],
      ['weights', 1, 'Weights'],
    ],
    p2: 7,
    p3: 12,
  },
  wellness: {
    area: 12,
    need: [
      ['couch', 1, 'Therapy couch'],
      ['armchair', 1, 'Chair for the counsellor'],
    ],
    p2: 6,
    p3: 10,
  },
  kitchen: {
    area: 18,
    need: [
      ['stove', 1, 'Stove'],
      ['fridge', 1, 'Fridge'],
      ['sink', 1, 'Sink'],
      ['dining', 1, 'Dining table'],
    ],
    p2: 5,
    p3: 10,
  },
  lounge: {
    area: 18,
    need: [
      ['sofa', 1, 'Sofa'],
      ['fun', 1, 'Something to do'],
    ],
    p2: 8,
    p3: 13,
  },
  stream: {
    area: 12,
    need: [
      ['stream', 1, 'Streaming desk'],
      ['backdrop', 1, 'Backdrop'],
    ],
    p2: 5,
    p3: 10,
  },
  workshop: {
    area: 12,
    need: [
      ['bench', 1, 'Workbench'],
      ['rack', 1, 'Rack or shelf'],
    ],
    p2: 5,
    p3: 10,
  },
  office: {
    area: 14,
    need: [
      ['desk', 2, 'Office desks'],
      ['storage', 1, 'Cabinet or bookcase'],
    ],
    p2: 5,
    p3: 9,
  },
  medical: {
    area: 10,
    need: [
      ['treat', 1, 'Treatment bed'],
      ['med', 1, 'Medical cabinet'],
    ],
    p2: 4,
    p3: 8,
  },
  dorm: { area: 20, need: [['bed', 5, 'Beds']], p2: 5, p3: 10 },
  bath: {
    area: 8,
    need: [
      ['shower', 1, 'Shower'],
      ['toilet', 1, 'Toilet'],
      ['basin', 1, 'Washbasin'],
    ],
    p2: 5,
    p3: 9,
  },
  trophy: { area: 12, need: [['plinth', 3, 'Plinths or cases']], p2: 5, p3: 10 },
};
