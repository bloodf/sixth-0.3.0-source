import type { LifeState } from './life.ts';
import type { HQ, Room } from './build.ts';
import type { RngState } from '../core/rng.ts';
import type { Attr, TitleId } from '../data/titles.ts';
import type { Region } from '../data/names.ts';
import type { Block, GearSlot, RoomType, SponsorSlot, StaffRole } from '../data/club.ts';
import type { GameResult, MatchCfg, Order, Plan, PStat } from '../sim/types.ts';
/** 1: version 0.1.0, frozen in src/legacy. 2: solid bodies and the house editor. */
export const RULES = 3;
export interface Crest {
  shape: string;
  split: string;
  icon: string;
  c1: string;
  c2: string;
  c3: string;
  icolor: string;
  iscale: number;
  iy: number;
  border: number;
  ribbon: string;
  ribbonOn: boolean;
}
export interface Jersey {
  pattern: string;
  c1: string;
  c2: string;
  c3: string;
  collar: string;
  sleeve: 'match' | 'second' | 'third';
  crestPos: 'left' | 'centre' | 'none';
  font: 'wide' | 'cond' | 'block';
  numColor: string;
  sponsor: boolean;
  away: string;
}
export interface Look {
  skin: number;
  hair: number;
  hairC: number;
  face: number;
  eye: number;
  brow: number;
  nose: number;
  mouth: number;
  beard: number;
  glasses: number;
  fem: boolean;
  head: number;
  /** 0 caucasian, 1 asian, 2 african features; older looks leave it out */
  r?: number;
  /** sculpted by hand: face sliders in percent, a hair style, an eye colour */
  f?: number[];
  h?: string;
  ec?: number;
  /** what the manager wears, and how old they look */
  o?: string;
  oc?: number;
  a?: number;
}
export interface Contract {
  salary: number;
  until: number;
  buyout: number;
  bonus: number;
}
export interface Player {
  id: string;
  first: string;
  last: string;
  nick: string;
  nat: string;
  age: number;
  title: TitleId;
  role: string;
  attr: Record<Attr, number>;
  pot: number;
  traits: string[];
  look: Look;
  num: number;
  team: string | null;
  contract: Contract | null;
  energy: number;
  morale: number;
  stress: number;
  form: number;
  injury: number;
  injuryName: string;
  fame: number;
  listed: boolean;
  s: { m: number; w: number; k: number; d: number; a: number; r: number; mvp: number };
  car: { m: number; w: number; mvp: number; trophies: number };
  grow: number;
  joined: number;
  talkDay: number;
}
export interface Team {
  id: string;
  title: TitleId;
  org: number;
  name: string;
  tag: string;
  c1: string;
  c2: string;
  icon: string;
  region: Region;
  div: number;
  elo: number;
  roster: string[];
  plan: Plan;
  form: string;
  gear: number;
}
export interface Station {
  m: Record<GearSlot, number>;
  c: Record<GearSlot, number>;
}
export interface Squad {
  title: TitleId;
  lineup: (string | null)[];
  heroes: (string | null)[];
  week: Block[][];
  intensity: number;
  plan: Plan;
  fam: number;
  syn: number;
  prep: number;
  stations: Station[];
  /** desks people have been given, by player; everybody else takes what is left */
  seats?: Record<string, string>;
  captain: string | null;
  remote: boolean;
}
export interface Staff {
  id: string;
  role: StaffRole;
  name: string;
  nat: string;
  age: number;
  skill: number;
  trait: string;
  salary: number;
  title?: TitleId;
  since: number;
  look: Look;
}
export interface Fixture {
  id: string;
  title: TitleId;
  day: number;
  comp: 'league' | 'playoff' | 'masters';
  stage: string;
  div: number;
  home: string;
  away: string;
  bo: number;
  score?: [number, number];
  games?: { map: string; score: [number, number] }[];
  mvp?: string;
  played?: boolean;
}
export interface Row {
  team: string;
  p: number;
  w: number;
  l: number;
  mw: number;
  ml: number;
}
export interface Season {
  title: TitleId;
  n: number;
  start: number;
  tables: Row[][];
  fixtures: Fixture[];
  maps: string[];
  masters: string[];
  stage: 'prep' | 'league' | 'semi' | 'final' | 'masters' | 'done';
  champs: (string | null)[];
  mchamp: string | null;
}
export interface Msg {
  id: string;
  day: number;
  kind: 'info' | 'event' | 'bid' | 'contract' | 'sponsor' | 'match' | 'board' | 'staff' | 'news';
  title: string;
  body: string;
  from: string;
  read: boolean;
  data?: any;
  choices?: { id: string; label: string; hint?: string }[];
  done?: string;
}
export interface SponsorDeal {
  id: string;
  slot: SponsorSlot;
  brand: string;
  sector: string;
  weekly: number;
  weeks: number;
  until: number;
  goal: string;
  goalN: number;
  bonus: number;
  prog: number;
  signed: boolean;
  exp: number;
}
export interface LedgerWeek {
  week: number;
  items: Record<string, number>;
  cash: number;
}
export interface MatchRec {
  fid: string;
  day: number;
  title: TitleId;
  opp: string;
  oppTag: string;
  comp: string;
  stage: string;
  score: [number, number];
  win: boolean;
  games: { map: string; res: GameResult; us: 0 | 1 }[];
  mvp: string;
  cfgs?: { cfg: MatchCfg; orders: Order[] }[];
  fans: number;
}
export interface Live {
  fid: string;
  game: number;
  wins: [number, number];
  us: 0 | 1;
  cfg: MatchCfg;
  orders: Order[];
  games: { map: string; res: GameResult; us: 0 | 1 }[];
  cfgs: { cfg: MatchCfg; orders: Order[] }[];
}
export interface Bid {
  id: string;
  pid: string;
  team: string;
  fee: number;
  exp: number;
}
export interface G {
  rules: number;
  seed: string;
  rng: RngState;
  day: number;
  seq: number;
  uid: number;
  t0: string;
  mgr: { name: string; nat: string; style: string; look: Look };
  club: {
    name: string;
    tag: string;
    c1: string;
    c2: string;
    c3: string;
    crest: Crest;
    jersey: Jersey;
    region: Region;
    city: string;
    origin: string;
    fans: number;
    rep: number;
    cash: number;
    loan: number;
    merch: number;
    motto: string;
  };
  players: Record<string, Player>;
  teams: Record<string, Team>;
  squads: Partial<Record<TitleId, Squad>>;
  seasons: Partial<Record<TitleId, Season>>;
  site: number;
  /** land, floors, walls, furniture */
  hq: HQ;
  /** derived from hq: the rooms that work, best first */
  rooms: Room[];
  staff: Staff[];
  pool: Staff[];
  know: Record<string, number>;
  scout: { pid: string | null; title: TitleId | null };
  inbox: Msg[];
  ledger: LedgerWeek[];
  week: Record<string, number>;
  deals: SponsorDeal[];
  bids: Bid[];
  nego: Record<string, { ask: number; tries: number; until: number }>;
  live: Live | null;
  recs: MatchRec[];
  trophies: { day: number; title: TitleId; name: string }[];
  stats: { w: number; l: number; prize: number; best: number };
  streak: number;
  bankrupt: number;
  lastEvt: Record<string, number>;
  ranked: boolean;
  over: string | null;
  /** needs, habits, opinions and dirt */
  life: LifeState;
}
export type Action = { t: string } & Record<string, any>;
export interface Outcome {
  ok: boolean;
  err?: string;
  msg?: string;
  data?: any;
}
export type {
  HQ,
  Room,
  GameResult,
  MatchCfg,
  Order,
  Plan,
  PStat,
  Attr,
  TitleId,
  Region,
  Block,
  GearSlot,
  RoomType,
  SponsorSlot,
  StaffRole,
};
