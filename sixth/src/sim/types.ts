import type { TitleId } from '../data/titles.ts';
export interface SimStats {
  mech: number;
  react: number;
  sense: number;
  pos: number;
  dec: number;
  util: number;
  team: number;
  comms: number;
  comp: number;
  focus: number;
  stam: number;
  adapt: number;
}
export interface SimPlayer {
  id: string;
  nick: string;
  role: string;
  hero?: string;
  st: SimStats;
  traits: string[];
  num: number;
}
export interface Plan {
  style: number;
  tempo: number;
  risk: number;
  focus: string;
}
/** style: 0 disciplined .. 1 loose. tempo: 0 slow .. 1 fast. risk: economy / engage appetite 0..1. focus: title-specific key */
export interface SimTeam {
  id: string;
  name: string;
  tag: string;
  c1: string;
  c2: string;
  icon: string;
  players: SimPlayer[];
  plan: Plan;
  syn: number;
  fam: number;
  coach: number;
  prep: number;
}
export interface MatchCfg {
  title: TitleId;
  map: string;
  seed: string;
  teams: [SimTeam, SimTeam];
}
export interface Order {
  tick: number;
  team: 0 | 1;
  cmd: string;
}
export interface PStat {
  id: string;
  k: number;
  d: number;
  a: number;
  dmg: number;
  heal: number;
  obj: number;
  rating: number;
  gold?: number;
  lvl?: number;
  hero?: string;
}
export interface GameResult {
  score: [number, number];
  winner: 0 | 1;
  ticks: number;
  stats: [PStat[], PStat[]];
  log: string[];
  hash: string;
}
export interface Ev {
  k: string;
  [x: string]: any;
}
export interface Actor {
  i: number;
  team: 0 | 1;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  anim: string;
  nick: string;
  num: number;
  hero?: string;
  role: string;
  z?: number;
  animT?: number;
}
export interface OrderDef {
  cmd: string;
  label: string;
  hint: string;
  group: string;
  icon: string;
}
export interface Sim {
  cfg: MatchCfg;
  tick: number;
  done: boolean;
  score: [number, number];
  actors: Actor[];
  ev: Ev[];
  step(): void;
  order(team: 0 | 1, cmd: string): boolean;
  orders(team: 0 | 1): OrderDef[];
  result(): GameResult;
  clock(): string;
  phase(): string;
}
export const TPS = 10;
