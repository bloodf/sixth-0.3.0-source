import { runSim } from '../sim/index.ts';
import { Replay } from './replay.ts';
import { RULES } from '../game/types.ts';
/** Replays a whole career. Input { log, expect } -> { ok } or { ok:false, at }. Also used to verify opponents and matches. */
self.onmessage = (e: MessageEvent) => {
  if (e.data.sim) {
    try {
      postMessage({ res: runSim(e.data.sim.cfg, e.data.sim.orders) });
    } catch (err) {
      postMessage({ why: String(err) });
    }
    return;
  }
  const { log, expect, wantState } = e.data;
  const r = new Replay();
  try {
    for (let i = 0; i < log.length; i++) {
      const why = r.step(log[i]);
      if (why) {
        postMessage({ ok: false, at: i, why });
        return;
      }
      if (i % 10 === 0) postMessage({ progress: i / log.length });
    }
    const h = r.hash();
    postMessage({ ok: h === expect && r.rules === RULES, head: r.head, hash: h, state: wantState ? r.g : undefined });
  } catch (err) {
    postMessage({ ok: false, crash: !wantState, why: String(err) });
  }
};
