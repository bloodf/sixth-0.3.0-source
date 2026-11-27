import VerifyWorker from '../save/audit.worker.ts?worker&inline';
import type { GameResult, MatchCfg, Order } from '../sim/types.ts';
import type { G } from '../game/types.ts';
import { runSim } from '../sim/index.ts';
export const spawn = () => new VerifyWorker();
/** Re-simulate a match off the main thread. */
export function simJob(cfg: MatchCfg, orders: Order[]): Promise<GameResult> {
  return new Promise((res, rej) => {
    let w: Worker;
    try {
      w = spawn();
    } catch {
      try {
        res(runSim(cfg, orders));
      } catch (e) {
        rej(e);
      }
      return;
    }
    const t = setTimeout(() => {
      w.terminate();
      rej(new Error('timeout'));
    }, 60000);
    w.onmessage = e => {
      if (e.data.progress !== undefined) return;
      clearTimeout(t);
      w.terminate();
      e.data.res ? res(e.data.res) : rej(new Error(e.data.why ?? 'failed'));
    };
    w.onerror = e => {
      clearTimeout(t);
      w.terminate();
      rej(e);
    };
    w.postMessage({ sim: { cfg, orders } });
  });
}
/** Replay an opponent's whole career from its seed. Resolves to the state it really produces. */
export function replayJob(
  log: unknown[],
  expect: string,
  onP: (p: number) => void,
): Promise<{ ok: boolean; head?: string; state?: G; why?: string }> {
  return new Promise(res => {
    const w = spawn();
    const t = setTimeout(() => {
      w.terminate();
      res({ ok: false, why: 'Verification took too long' });
    }, 240000);
    w.onmessage = e => {
      if (e.data.progress !== undefined) {
        onP(e.data.progress);
        return;
      }
      clearTimeout(t);
      w.terminate();
      res(e.data);
    };
    w.onerror = () => {
      clearTimeout(t);
      w.terminate();
      res({ ok: false, why: 'Verification crashed' });
    };
    w.postMessage({ log, expect, wantState: true });
  });
}
