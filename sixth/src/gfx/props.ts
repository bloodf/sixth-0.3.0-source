import * as THREE from 'three';
import { Kit } from './kit.ts';
import type { Look } from '../data/heroes.ts';
const cache = new Map<string, { g: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }>();
/** Held items. Grip at origin, business end along +Z. */
export function prop(kind: string, c1: string, c2: string, glow: string) {
  const key = [kind, c1, c2, glow, THREE.ColorManagement.enabled].join();
  const h = cache.get(key);
  if (h) return h;
  const k = new Kit();
  const steel = '#aab4be',
    dark = '#23282e',
    wood = '#5b4028';
  const bx = (x: number, y: number, z: number, w: number, hh: number, d: number, c: THREE.ColorRepresentation, o = {}) =>
    k.box(x, y - hh / 2, z, w, hh, d, c, { ao: 0.1, ...o });
  switch (kind) {
    case 'rifle':
      bx(0, 0.03, 0.16, 0.045, 0.09, 0.46, dark);
      bx(0, 0.035, 0.5, 0.022, 0.022, 0.34, '#15181c');
      bx(0, -0.05, 0.14, 0.035, 0.13, 0.06, '#31373e', { rx: 0.25 });
      bx(0, 0.02, -0.16, 0.04, 0.1, 0.2, c1);
      bx(0, 0.1, 0.12, 0.03, 0.04, 0.12, '#15181c');
      bx(0, 0.03, 0.36, 0.05, 0.06, 0.16, c1);
      break;
    case 'awp':
      bx(0, 0.03, 0.16, 0.05, 0.09, 0.5, c1);
      bx(0, 0.04, 0.7, 0.024, 0.024, 0.62, '#15181c');
      bx(0, 0.04, 1.02, 0.04, 0.04, 0.09, '#15181c');
      bx(0, 0.01, -0.2, 0.045, 0.12, 0.26, c1);
      bx(0, 0.13, 0.14, 0.05, 0.05, 0.3, '#15181c');
      bx(0, 0.13, 0.3, 0.052, 0.04, 0.01, glow, { glow: true });
      break;
    case 'smg':
      bx(0, 0.03, 0.12, 0.045, 0.09, 0.34, dark);
      bx(0, 0.035, 0.33, 0.025, 0.025, 0.14, '#15181c');
      bx(0, -0.08, 0.12, 0.03, 0.16, 0.045, '#31373e');
      bx(0, 0.03, -0.1, 0.03, 0.07, 0.16, c1);
      break;
    case 'pistol':
      bx(0, 0.05, 0.08, 0.035, 0.055, 0.22, dark);
      bx(0, -0.02, 0, 0.032, 0.1, 0.05, '#31373e');
      break;
    case 'shotgun':
    case 'cannon':
      bx(0, 0.02, 0.2, 0.11, 0.13, 0.55, c1);
      k.cyl(0, -0.29, 0.5, 0.07, 0.5, dark, { rx: Math.PI / 2, seg: 8 });
      bx(0, 0.1, 0.15, 0.05, 0.05, 0.3, c2);
      bx(0, 0.02, 0.74, 0.09, 0.09, 0.02, glow, { glow: true });
      bx(0, -0.02, -0.14, 0.07, 0.12, 0.18, dark);
      break;
    case 'pistols':
      bx(0, 0.05, 0.1, 0.045, 0.065, 0.26, dark);
      bx(0, -0.02, 0, 0.036, 0.11, 0.055, wood);
      bx(0, 0.05, 0.235, 0.02, 0.02, 0.02, glow, { glow: true });
      break;
    case 'sword':
      bx(0, 0, 0.02, 0.035, 0.035, 0.2, wood);
      bx(0, 0, 0.13, 0.22, 0.04, 0.04, c2);
      bx(0, 0, 0.62, 0.06, 0.018, 0.95, steel);
      k.cone(0, -0.06, 1.15, 0.032, 0.12, steel, { rx: Math.PI / 2, seg: 4 });
      bx(0, 0.012, 0.55, 0.012, 0.006, 0.8, glow, { glow: true });
      break;
    case 'daggers':
      bx(0, 0, 0.02, 0.03, 0.03, 0.14, wood);
      bx(0, 0, 0.1, 0.1, 0.03, 0.025, c2);
      bx(0, 0, 0.28, 0.045, 0.014, 0.34, steel);
      bx(0, 0.01, 0.27, 0.01, 0.006, 0.3, glow, { glow: true });
      break;
    case 'axe':
    case 'hammer':
      k.cyl(0, -0.65, 0, 0.026, 1.3, wood, { rx: Math.PI / 2, seg: 6 });
      {
        const k2 = 0.62;
        if (kind === 'axe') {
          k.cyl(0.12, -0.025, k2, 0.2, 0.05, steel, { seg: 10 });
          bx(0, 0, k2, 0.1, 0.08, 0.14, c2);
        } else {
          bx(0, 0, k2, 0.3, 0.18, 0.18, c2);
          bx(0.16, 0, k2, 0.035, 0.21, 0.21, steel);
          bx(-0.16, 0, k2, 0.035, 0.21, 0.21, steel);
          bx(0, 0.095, k2, 0.18, 0.01, 0.05, glow, { glow: true });
        }
      }
      break;
    case 'staff':
      k.cyl(0, -0.85, 0, 0.024, 1.7, wood, { rx: Math.PI / 2, seg: 6 });
      k.sph(0, 0, 0.92, 0.085, glow, { glow: true, seg: 8 });
      k.tor(0, 0, 0.92, 0.13, 0.022, c2, { rx: Math.PI / 2 });
      break;
    case 'spear':
      k.cyl(0, -1, 0.1, 0.022, 2.0, wood, { rx: Math.PI / 2, seg: 6 });
      k.cone(0, -0.15, 1.2, 0.06, 0.3, steel, { rx: Math.PI / 2, seg: 4 });
      break;
    case 'bow':
      for (let i = 0; i < 10; i++) {
        const a = -1.1 + (i / 9) * 2.2;
        bx(0, Math.sin(a) * 0.6, Math.cos(a) * 0.3 - 0.22, 0.03, 0.16, 0.035, i % 9 === 0 ? c2 : wood, { rx: a * 0.9 });
      }
      bx(0, 0, -0.09, 0.006, 1.06, 0.006, glow, { glow: true });
      break;
    case 'orb':
      k.sph(0, 0.16, 0.1, 0.1, glow, { glow: true, seg: 10 });
      k.tor(0, 0.16, 0.1, 0.15, 0.012, c2, { rx: 0.5 });
      break;
    case 'shield':
      k.cyl(0, -0.025, 0.05, 0.4, 0.05, c2, { rx: Math.PI / 2, seg: 12 });
      k.cyl(0, -0.02, 0.08, 0.14, 0.04, glow, { rx: Math.PI / 2, glow: true });
      break;
    default:
      return null as any;
  }
  const r = { g: k.geo(), glow: k.glow() };
  cache.set(key, r);
  return r;
}
export const holdOf = (p: Look['prop']): any => (p === 'axe' ? 'hammer' : p);
