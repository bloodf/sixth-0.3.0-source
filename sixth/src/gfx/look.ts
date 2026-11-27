/** From a person's saved look to a full human: face, body, hair and clothes. Same look and id, same person, on every machine. */
import { HEAD, OUTFITS, type Mood, type Outfit, type Spec } from './human.ts';
import { HAIRS, SKINS } from './character.ts';
import type { Look } from '../game/types.ts';
export interface Wear {
  outfit: Outfit;
  shoes?: 'sneak' | 'smart';
  age?: number;
  mood?: Partial<Record<Mood, number>>;
  heavy?: number;
  muscle?: number;
}
/** a few bits of noise per name: cheap, stable, not security */
function hash(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const HM = ['h_short1', 'h_short2', 'h_short3', 'h_short4', 'h_short4', 'h_short1', 'h_hawk', 'h_short2', 'h_short3', 'h_short1'];
const HF = ['h_bob1', 'h_bob2', 'h_pony', 'h_long', 'h_braid', 'h_pony', 'h_bob2', 'h_long'];
export const HAIR_M = ['h_short1', 'h_short2', 'h_short3', 'h_short4', 'h_afro', 'h_hawk', 'h_curly', 'h_bob1', ''];
export const HAIR_F = ['h_bob1', 'h_bob2', 'h_pony', 'h_long', 'h_braid', 'h_curly', 'h_afro', 'h_short3'];
export function specOf(l: Look, id: string, w: Wear): Spec {
  const r = hash(id + '|' + l.face + l.eye + l.nose + l.mouth + l.head);
  const n = () => (r() + r() + r()) / 1.5 - 1; // -1..1, mostly near zero
  const face = l.f ? HEAD.map((_, i) => (l.f![i] ?? 0) / 100) : HEAD.map(() => n() * 0.85);
  const race: [number, number, number] =
    l.r === 1
      ? [0, 1, 0]
      : l.r === 2
        ? [1, 0, 0]
        : l.r === 0
          ? [0, 0, 1]
          : l.skin >= 5
            ? [1, 0, 0]
            : l.skin === 4
              ? [0.6, 0, 0.4]
              : l.skin === 3
                ? [0.25, 0.25, 0.5]
                : l.hairC <= 1 && l.skin <= 2 && l.eye === 0
                  ? [0, 0.85, 0.15]
                  : [0, 0.05, 0.95];
  const age = w.age ?? 21;
  const k = l.fem ? 'female' : 'male';
  const build = n();
  let hair = l.h ?? (l.fem ? HF[(l.hair - 8 + 8) % HF.length] : HM[l.hair % HM.length]);
  if (race[0] > 0.55 && !l.h && !l.fem && (hair === 'h_short3' || hair === 'h_short2')) hair = 'h_afro';
  const out = OUTFITS[w.outfit][l.fem ? 1 : 0];
  return {
    g: k,
    race,
    old: Math.max(0, Math.min(1, (age - 28) / 34)),
    heavy: w.heavy ?? Math.max(0, build) * 0.45,
    thin: Math.max(0, -build) * 0.6,
    muscle: w.muscle ?? Math.max(0, n()) * 0.4,
    face,
    ex: w.mood ?? {},
    skin: SKINS[l.skin] ?? SKINS[2],
    hair,
    hairC: HAIRS[race[0] > 0.5 && l.hairC > 2 && l.hairC < 9 ? l.hairC % 3 : l.hairC] ?? HAIRS[0],
    beard: l.fem ? '' : l.beard === 4 ? 'beard' : l.beard === 3 ? 'mous' : '',
    stubble: l.fem ? 0 : l.beard === 1 ? 0.75 : l.beard === 2 ? 0.45 : age > 17 && r() < 0.4 ? 0.22 : 0,
    brow: l.brow + (l.fem ? 1 : 0),
    eye: l.ec ?? (race[1] > 0.5 || race[0] > 0.5 ? (r() < 0.85 ? 0 : 4) : Math.floor(r() * 8)),
    glasses: l.glasses > 0,
    outfit: out,
    shoes: w.shoes ?? 'sneak',
  };
}
