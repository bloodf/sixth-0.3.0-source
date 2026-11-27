import { Engine } from '../src/gfx/engine.ts';
import { loadHumans } from '../src/gfx/human.ts';
import { openStudio, shoot } from '../src/gfx/studio.ts';
import { genLook } from '../src/game/gen.ts';
import { Rng } from '../src/core/rng.ts';
await loadHumans();
const e = new Engine(document.getElementById('c') as any);
openStudio(e);
const d = document.getElementById('d')!;
const R = Rng.of(new URLSearchParams(location.search).get('seed') ?? 'q');
const nats = ['DK', 'KR', 'BR', 'US', 'SE', 'CN', 'US', 'FR', 'BR', 'ID'];
const put = async (o: any) => {
  const i = new Image();
  i.width = o.size;
  d.append(i);
  i.src = await shoot(o);
};
for (let i = 0; i < 14; i++) {
  const l = genLook(R, nats[i % 10], i % 4 === 1);
  if (i % 5 === 2) l.skin = 6;
  put({ look: l, id: 'p' + i, wear: { outfit: 'tee', age: 17 + i * 3 }, c1: '#1f7f86', c2: '#ffb23e', size: 196 });
}
const l = genLook(R, 'SE', false);
for (const m of ['', 'smile', 'angry', 'sad', 'open', 'disgust', 'shock'])
  put({ look: l, id: 'mm', wear: { outfit: 'tee', age: 20 }, c1: '#7a2f86', c2: '#3ea0ff', size: 196, mood: m ? { [m]: 1 } : {} });
put({ look: l, id: 'mm', wear: { outfit: 'suit', age: 30, shoes: 'smart' }, c1: '#7a2f86', c2: '#3ea0ff', size: 150, crop: 'full' });
(window as any).ok = 1;
