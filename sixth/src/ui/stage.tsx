import { useEffect, useRef } from 'preact/hooks';
import * as THREE from 'three';
import { Cast } from '../gfx/cast.ts';
import { shirtAtlas } from './art.ts';
import type { Crest, Jersey, Look } from '../game/types.ts';
import { app } from './store.ts';
const WHO: Look = {
  skin: 2,
  hair: 3,
  hairC: 1,
  face: 1,
  eye: 1,
  brow: 1,
  nose: 0,
  mouth: 0,
  beard: 0,
  glasses: 0,
  fem: false,
  head: 0,
  r: 0,
  h: 'h_short4',
  f: Array(22).fill(0),
};
/** someone in the current shirt, turning. Own small renderer, disposed with the component. */
export function ShirtStage({
  j,
  crest,
  name,
  num,
  sponsor,
  accent,
}: {
  j: Jersey;
  crest: Crest;
  name: string;
  num: number;
  sponsor: string;
  accent: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<Cast | null>(null);
  const sig = JSON.stringify([j, crest, name, num, sponsor]);
  useEffect(() => {
    const cv = ref.current!;
    const soft = !!app.engine?.software;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, premultipliedAlpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    const c = (st.current = new Cast(soft, cv, true));
    c.shot('shirt', true);
    c.yaw = 0.3;
    c.spin = 0.4;
    c.tint(j.c1, accent);
    cv.style.cursor = 'grab';
    let raf = 0,
      last = 0,
      w0 = 0,
      h0 = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < (soft ? 45 : 15)) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const w = cv.clientWidth,
        h = cv.clientHeight;
      if (w !== w0 || h !== h0) {
        r.setPixelRatio(soft ? 0.9 : devicePixelRatio);
        r.setSize((w0 = w), (h0 = h), false);
        c.resize(w, h);
      }
      c.update(dt, t / 1000);
      c.render(r);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      c.dispose();
      st.current = null;
      r.dispose();
      r.forceContextLoss();
    };
  }, []);
  useEffect(() => {
    let dead = false;
    const c = st.current;
    if (!c) return;
    c.sleeves = j.sleeve === 'match' ? j.c1 : j.sleeve === 'second' ? j.c2 : j.c3;
    c.set([{ key: 'me', look: WHO, id: 'shirt', wear: { outfit: 'tee', age: 20 }, c1: j.c1, c2: j.c2, x: 0, z: 0, yaw: 0, shirt: true }]);
    shirtAtlas(j, crest, { name, num, sponsor, res: 1024 }).then(cv => {
      if (!dead) st.current?.setShirt(cv);
    });
    return () => {
      dead = true;
    };
  }, [sig]);
  return (
    <canvas ref={ref} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} aria-label="Shirt preview, drag to turn" />
  );
}
