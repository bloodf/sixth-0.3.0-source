import { TacSim } from './tac.ts';
import { MobaSim } from './moba.ts';
import { ArenaSim } from './arena.ts';
import type { GameResult, MatchCfg, Order, Sim } from './types.ts';
export function makeSim(cfg: MatchCfg): Sim {
  return cfg.title === 'dota' ? new MobaSim(cfg) : cfg.title === 'ow' ? new ArenaSim(cfg) : new TacSim(cfg);
}
/** Headless run. Orders are applied before the step of their tick. This is what replay audits and P2P verification use. */
export function runSim(cfg: MatchCfg, orders: Order[] = []): GameResult {
  const s = makeSim(cfg);
  let i = 0;
  const o = [...orders].sort((a, b) => a.tick - b.tick);
  let guard = 0;
  while (!s.done && guard++ < 120000) {
    while (i < o.length && o[i].tick <= s.tick) {
      s.order(o[i].team, o[i].cmd);
      i++;
    }
    s.step();
  }
  return s.result();
}
