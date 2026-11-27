/** Vector art as strings: crests, portraits, shirts. Every value is sanitised, so art received from peers is safe to render. */
import { GI, LU } from '../data/icons.gen.ts';
import { SKINS, HAIRS } from '../gfx/character.ts';
import type { Crest, Jersey, Look } from '../game/types.ts';
export const col = (c: unknown, d = '#888888') => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
const num = (v: unknown, a: number, b: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d;
const txt = (s: unknown, n: number) =>
  String(s ?? '')
    .slice(0, n)
    .replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!);
const h2 = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const mixHex = (a: string, b: string, t: number) => {
  const x = h2(col(a)),
    y = h2(col(b));
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
export const lum = (c: string) => {
  const [r, g, b] = h2(col(c)).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const on = (c: string) => (lum(c) > 0.36 ? '#0b1419' : '#ffffff');
/** keep team colour legible on dark panels */
export const vis = (c: string) => {
  let q = col(c);
  for (let i = 0; i < 8 && lum(q) < 0.16; i++) q = mixHex(q, '#ffffff', 0.14);
  return q;
};
export const SHAPES: Record<string, string> = {
  shield: 'M50 4 L90 14 V50 C90 74 72 90 50 97 C28 90 10 74 10 50 V14 Z',
  heater: 'M8 8 H92 V44 C92 72 74 88 50 97 C26 88 8 72 8 44 Z',
  round: 'M50 4 A46 46 0 1 1 49.99 4 Z',
  diamond: 'M50 2 L96 50 L50 98 L4 50 Z',
  hex: 'M50 3 L91 26 V74 L50 97 L9 74 V26 Z',
  pennant: 'M10 6 H90 V66 L50 97 L10 66 Z',
  swallow: 'M10 6 H90 V96 L50 76 L10 96 Z',
  arch: 'M10 96 V44 C10 20 28 4 50 4 C72 4 90 20 90 44 V96 Z',
  plate: 'M14 12 H86 L96 30 V70 L86 88 H14 L4 70 V30 Z',
  star: 'M50 2 L63 20 L85 15 L82 37 L98 50 L82 63 L85 85 L63 80 L50 98 L37 80 L15 85 L18 63 L2 50 L18 37 L15 15 L37 20 Z',
};
export const SPLITS: Record<string, (c: string) => string> = {
  none: () => '',
  half: c => `<rect x="50" width="50" height="100" fill="${c}"/>`,
  diag: c => `<path d="M0 100 L100 0 V100Z" fill="${c}"/>`,
  bend: c => `<path d="M0 22 L22 0 L100 78 L78 100Z" fill="${c}"/>`,
  chevron: c => `<path d="M0 62 L50 30 L100 62 V84 L50 52 L0 84Z" fill="${c}"/>`,
  stripes: c => [0, 1, 2, 3].map(i => `<rect x="${6 + i * 25}" width="12" height="100" fill="${c}"/>`).join(''),
  hoops: c => [0, 1, 2, 3].map(i => `<rect y="${6 + i * 25}" width="100" height="12" fill="${c}"/>`).join(''),
  quarter: c => `<path d="M50 0H100V50H0V100H50Z" fill="${c}"/>`,
  chief: c => `<rect width="100" height="30" fill="${c}"/>`,
  rays: c =>
    Array.from(
      { length: 8 },
      (_, i) =>
        `<path d="M50 50 L${50 + 90 * Math.cos(i * 0.785)} ${50 + 90 * Math.sin(i * 0.785)} L${50 + 90 * Math.cos(i * 0.785 + 0.39)} ${50 + 90 * Math.sin(i * 0.785 + 0.39)}Z" fill="${c}"/>`,
    ).join(''),
  five: c =>
    [0, 1, 2, 3, 4].map(i => `<rect x="${18 + i * 14}" y="12" width="8" height="62" fill="${c}"/>`).join('') +
    `<rect x="18" y="82" width="64" height="7" fill="${c}"/>`,
};
let uid = 0;
export function crestSvg(c: Partial<Crest> | undefined, size = 64): string {
  const s = SHAPES[c?.shape ?? ''] ?? SHAPES.shield,
    c1 = col(c?.c1, '#244b57'),
    c2 = col(c?.c2, '#2f6b7a'),
    c3 = col(c?.c3, '#ffffff'),
    ic = col(c?.icolor, '#ffffff');
  const id = 'c' + (uid++ % 100000);
  const ip = GI[c?.icon ?? ''] ?? '';
  const k = num(c?.iscale, 0.4, 1.6, 1) * 0.62,
    y = num(c?.iy, -20, 20, 0),
    b = num(c?.border, 0, 8, 3);
  const rb = c?.ribbonOn
    ? `<g><path d="M2 74 L14 70 H86 L98 74 L92 82 L98 90 L86 88 H14 L2 90 L8 82Z" fill="${c3}"/><text x="50" y="84" text-anchor="middle" font-family="Anybody Variable, sans-serif" font-weight="900" font-size="12" fill="${on(c3)}" textLength="${Math.min(62, Math.max(16, (c?.ribbon ?? '').length * 9))}" lengthAdjust="spacingAndGlyphs">${txt(c?.ribbon, 10)}</text></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${s}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs><g clip-path="url(#${id})"><rect width="100" height="100" fill="${c1}"/>${(SPLITS[c?.split ?? 'none'] ?? SPLITS.none)(c2)}<rect width="100" height="100" fill="url(#${id}g)"/></g>${b ? `<path d="${s}" fill="none" stroke="${c3}" stroke-width="${b}" stroke-linejoin="round"/>` : ''}${ip ? `<g transform="translate(${50 - 50 * k} ${48 + y - 50 * k}) scale(${((k * 100) / 512).toFixed(4)})"><path d="${ip}" fill="#000" opacity=".28" transform="translate(0 14)"/><path d="${ip}" fill="${ic}"/></g>` : ''}${rb}</svg>`;
}
export const orgCrest = (icon: string, c1: string, c2: string, tag = ''): Crest => {
  const sh = Object.keys(SHAPES),
    sp = Object.keys(SPLITS);
  let h = 0;
  for (const ch of icon + c1 + tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    shape: sh[h % sh.length],
    split: sp[(h >> 4) % sp.length],
    icon,
    c1,
    c2: mixHex(c1, c2, 0.32),
    c3: c2,
    icolor: lum(c1) > 0.45 ? (lum(c2) < 0.3 ? c2 : '#101418') : lum(c2) > 0.3 ? c2 : '#ffffff',
    iscale: 1,
    iy: 0,
    border: 3,
    ribbon: '',
    ribbonOn: false,
  };
};
export const gi = (k: string, size = 20, c = 'currentColor') =>
  `<svg viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true"><path d="${GI[k] ?? GI['radar-sweep']}" fill="${c}"/></svg>`;
export const lu = (k: string, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true">${LU[k] ?? ''}</svg>`;
// ---------- portraits
export function portraitSvg(L: Look, shirt: string, accent: string, size = 64, o: { headset?: boolean; bg?: string } = {}): string {
  const sk = SKINS[L.skin] ?? SKINS[2],
    sd = mixHex(sk, '#3a1c10', 0.24),
    sh = mixHex(sk, '#ffffff', 0.22),
    hc = HAIRS[L.hairC] ?? HAIRS[0],
    hd = mixHex(hc, '#000000', 0.35),
    hl = mixHex(hc, '#ffffff', 0.16);
  const c = col(shirt, '#2f6b7a'),
    a = col(accent, '#ffffff'),
    bg = col(o.bg, '#1a3843');
  const hw = [21, 22.5, 20][L.head % 3],
    jaw = [15, 17, 13][L.head % 3],
    jy = [68, 67, 70][L.head % 3];
  const face = `M${50 - hw} 40 C${50 - hw} 24 ${50 + hw} 24 ${50 + hw} 40 L${50 + hw - 1} 50 C${50 + hw - 1} 58 ${50 + jaw} 64 ${50 + jaw * 0.55} ${jy} C52 ${jy + 2.5} 48 ${jy + 2.5} ${50 - jaw * 0.55} ${jy} C${50 - jaw} 64 ${50 - hw + 1} 58 ${50 - hw + 1} 50 Z`;
  const ex = [9.2, 9.8, 8.8, 9.4][L.eye % 4],
    ew = [4.1, 3.6, 4.4, 3.9][L.eye % 4],
    eh = [2.7, 2.2, 3, 2.4][L.eye % 4];
  const by = [38.6, 39.2, 38, 38.8][L.brow % 4],
    bt = [1.9, 2.5, 1.5, 2.2][L.brow % 4],
    bs = [0.6, -0.6, 1.2, 0][L.brow % 4];
  const hid = L.hair % 14;
  const back: Record<number, string> = {
    8: `<path d="M26 40 C24 16 76 16 74 40 L78 82 C70 88 30 88 22 82Z" fill="${hd}"/>`,
    9: `<path d="M26 40 C24 16 76 16 74 40 L76 64 C70 70 30 70 24 64Z" fill="${hd}"/>`,
    10: `<path d="M66 30 C84 34 84 62 76 76 C74 62 72 48 66 40Z" fill="${hd}"/>`,
    11: `<circle cx="50" cy="15" r="9" fill="${hd}"/>`,
    12: `<path d="M24 44 C16 18 84 18 76 44 C84 56 80 76 72 80 C60 86 40 86 28 80 C20 76 16 56 24 44Z" fill="${hd}"/>`,
  };
  const top: Record<number, string> = {
    0: `<path d="M28 40 C27 20 40 17 50 17 C62 17 73 20 72 40 C71 33 68 29 62 28 C54 30 42 30 36 28 C31 30 29 34 28 40Z" fill="${hc}"/>`,
    1: `<path d="M27.5 41 C26 22 36 14 50 14 C60 10 74 18 72.5 41 C71 34 69 30 64 28 C56 33 40 31 35 27 C31 30 29 35 27.5 41Z" fill="${hc}"/><path d="M36 24 C44 16 58 14 66 20 C58 19 46 21 40 28Z" fill="${hl}"/>`,
    2: `<path d="M27.5 42 C25 20 42 15 52 16 C66 16 75 24 72.5 42 C71 36 69 33 65 31 C54 32 44 28 40 23 C38 30 31 32 27.5 42Z" fill="${hc}"/>`,
    3: `<path d="M28.5 39 C28 22 40 19.5 50 19.5 C60 19.5 72 22 71.5 39 C70 32 66 28.5 60 28 C53 27.5 47 27.5 40 28 C34 28.5 30 32 28.5 39Z" fill="${hc}" opacity=".86"/>`,
    4: `<g fill="${hc}"><circle cx="32" cy="28" r="7.5"/><circle cx="39" cy="21" r="8"/><circle cx="50" cy="18" r="8.5"/><circle cx="61" cy="21" r="8"/><circle cx="68" cy="28" r="7.5"/><path d="M28 40 C28 26 72 26 72 40 C70 33 62 30 50 31 C38 30 30 33 28 40Z"/></g><circle cx="44" cy="18" r="2.6" fill="${hl}"/><circle cx="57" cy="19" r="2.4" fill="${hl}"/>`,
    5: `<path d="M27 43 C24 19 40 15 50 15 C62 15 76 20 73 43 C72 37 70 34 68 33 L62 37 L57 32 L51 38 L45 32 L39 38 L33 33 C30 35 28 38 27 43Z" fill="${hc}"/>`,
    6: `<path d="M30 33 C32 17 46 13 54 15 C66 15 72 24 70 33 C64 25 50 24 40 25 C36 26 32 29 30 33Z" fill="${hc}"/><path d="M28.5 42 C28 34 29 31 31 30 L32 38Z M71.5 42 C72 34 71 31 69 30 L68 38Z" fill="${hd}" opacity=".7"/>`,
    7: `<path d="M36 24 C42 20 58 20 64 24" stroke="${sh}" stroke-width="2" fill="none" opacity=".5"/>`,
    8: `<path d="M26 48 C22 18 42 14 50 15 C60 14 78 20 74 48 C72 40 70 34 64 29 C56 34 46 30 43 25 C38 32 29 36 26 48Z" fill="${hc}"/>`,
    9: `<path d="M26 58 C20 20 40 14 50 15 C62 14 80 22 74 58 C73 46 71 38 68 34 C58 36 42 36 32 34 C29 38 27 46 26 58Z" fill="${hc}"/>`,
    10: `<path d="M27.5 41 C25 20 40 15 50 15 C62 15 75 21 72.5 41 C70 32 62 26 52 25 C40 25 31 31 27.5 41Z" fill="${hc}"/>`,
    11: `<path d="M27.5 41 C25 20 40 16 50 16 C62 16 75 20 72.5 41 C70 31 60 27 50 27 C40 27 30 31 27.5 41Z" fill="${hc}"/>`,
    12: `<path d="M25 48 C18 20 40 13 50 14 C62 13 82 20 75 48 C74 40 69 35 66 30 C60 35 54 30 50 29 C46 30 40 35 34 30 C31 35 26 40 25 48Z" fill="${hc}"/>`,
    13: `<path d="M27 42 C24 18 44 14 52 15 C66 15 76 22 73 44 C71 38 69 33 66 30 C60 30 54 27 51 23 C46 30 36 33 31 35 C29 37 28 39 27 42Z" fill="${hc}"/>`,
  };
  const beards: Record<number, string> = {
    1: `<path d="M${50 - jaw * 0.8} 60 C${50 - jaw * 0.5} ${jy + 3} ${50 + jaw * 0.5} ${jy + 3} ${50 + jaw * 0.8} 60 C58 65 54 62.5 50 62.5 C46 62.5 42 65 ${50 - jaw * 0.8} 60Z" fill="${hd}" opacity=".32"/>`,
    2: `<path d="M${50 - hw + 1} 48 C${50 - hw + 2} 62 ${50 - jaw * 0.6} ${jy + 4} 50 ${jy + 4} C${50 + jaw * 0.6} ${jy + 4} ${50 + hw - 2} 62 ${50 + hw - 1} 48 C${50 + hw - 4} 58 60 59 56 57.5 C52 56 48 56 44 57.5 C40 59 ${50 - hw + 4} 58 ${50 - hw + 1} 48Z" fill="${hc}" opacity=".92"/>`,
    3: `<path d="M44 ${jy - 6} C47 ${jy + 5} 53 ${jy + 5} 56 ${jy - 6} C53 ${jy - 4} 47 ${jy - 4} 44 ${jy - 6}Z" fill="${hc}"/>`,
    4: `<path d="M41.5 57.2 C45 54.6 55 54.6 58.5 57.2 C55 57.4 45 57.4 41.5 57.2Z" fill="${hc}"/>`,
  };
  const mo = [
    `<path d="M43.5 60 Q50 63.4 56.5 60" />`,
    `<path d="M43.5 60.6 H56.5"/>`,
    `<path d="M43.5 60 Q51 64 57 59"/>`,
    `<path d="M44 60.8 Q50 59.6 56 60.8"/>`,
  ][L.mouth % 4];
  const nose = [
    `M50 42 L47.2 52.5 Q50 54.4 52.8 52.5`,
    `M50.4 43 L46.8 52 Q50 55 53.4 52`,
    `M49.6 42 L48 53 Q50 54 52.2 53`,
    `M50 44 Q45.6 52.4 49 53.6 Q51.6 54 53 52.6`,
  ][L.nose % 4];
  const id = 'p' + (uid++ % 100000);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mixHex(bg, '#ffffff', 0.1)}"/><stop offset="1" stop-color="${mixHex(bg, '#000000', 0.34)}"/></linearGradient><clipPath id="${id}f"><path d="${face}"/></clipPath></defs><rect width="100" height="100" fill="url(#${id})"/>${back[hid] ?? ''}<path d="M6 100 C8 82 26 78 40 75 L50 82 L60 75 C74 78 92 82 94 100Z" fill="${c}"/><path d="M6 100 C8 82 20 79 28 77.6 L24 100Z" fill="${a}" opacity=".9"/><path d="M94 100 C92 82 80 79 72 77.6 L76 100Z" fill="${a}" opacity=".9"/><path d="M41 62 H59 V75 Q50 85 41 75Z" fill="${sd}"/><path d="M38 74.5 L50 84 L62 74.5 L64 77.5 L50 89 L36 77.5Z" fill="${a}"/><ellipse cx="${50 - hw}" cy="48" rx="3.4" ry="5.4" fill="${sd}"/><ellipse cx="${50 + hw}" cy="48" rx="3.4" ry="5.4" fill="${sd}"/><path d="${face}" fill="${sk}"/><g clip-path="url(#${id}f)"><path d="M60 20 H80 V80 H52 C66 66 68 44 60 20Z" fill="${sd}" opacity=".34"/><ellipse cx="38" cy="52" rx="6" ry="4" fill="#d8503a" opacity=".1"/><ellipse cx="40" cy="33" rx="10" ry="5" fill="${sh}" opacity=".35"/></g>${beards[L.beard] ?? ''}<g><ellipse cx="${50 - ex}" cy="45" rx="${ew}" ry="${eh}" fill="#fbf7f2"/><ellipse cx="${50 + ex}" cy="45" rx="${ew}" ry="${eh}" fill="#fbf7f2"/><circle cx="${50 - ex + 0.4}" cy="45" r="${eh * 0.86}" fill="#2b1c14"/><circle cx="${50 + ex + 0.4}" cy="45" r="${eh * 0.86}" fill="#2b1c14"/><circle cx="${50 - ex + 1.1}" cy="44.2" r=".75" fill="#fff"/><circle cx="${50 + ex + 1.1}" cy="44.2" r=".75" fill="#fff"/><path d="M${50 - ex - ew} ${44.6 - eh * 0.4} Q${50 - ex} ${43.6 - eh} ${50 - ex + ew} ${44.8 - eh * 0.3}M${50 + ex + ew} ${44.6 - eh * 0.4} Q${50 + ex} ${43.6 - eh} ${50 + ex - ew} ${44.8 - eh * 0.3}" stroke="#2a1810" stroke-width="${L.fem ? 1.5 : 0.9}" fill="none"/></g><path d="M${50 - ex - 5} ${by + bs} Q${50 - ex} ${by - 1.8} ${50 - ex + 5} ${by + 0.4}M${50 + ex + 5} ${by + bs} Q${50 + ex} ${by - 1.8} ${50 + ex - 5} ${by + 0.4}" stroke="${hd}" stroke-width="${L.fem ? bt * 0.7 : bt}" stroke-linecap="round" fill="none"/><path d="${nose}" stroke="${sd}" stroke-width="1.4" fill="none" stroke-linecap="round"/><g stroke="${mixHex(sk, '#7a1f1a', 0.55)}" stroke-width="${L.fem ? 2.1 : 1.5}" stroke-linecap="round" fill="none">${mo}</g>${top[hid] ?? ''}${L.glasses ? `<g fill="#bfe3ee" fill-opacity=".16" stroke="#171a1d" stroke-width="1.5">${L.glasses === 1 ? `<rect x="34" y="40.4" width="13" height="9.6" rx="2.6"/><rect x="53" y="40.4" width="13" height="9.6" rx="2.6"/>` : `<circle cx="40.6" cy="45" r="6.2"/><circle cx="59.4" cy="45" r="6.2"/>`}<path d="M47 44 H53 M34 43.5 L29 43 M66 43.5 L71 43" fill="none"/></g>` : ''}${o.headset ? `<path d="M26 46 C24 12 76 12 74 46" stroke="#15191d" stroke-width="4" fill="none"/><rect x="23" y="42" width="8" height="14" rx="3.5" fill="#15191d"/><rect x="69" y="42" width="8" height="14" rx="3.5" fill="#15191d"/><path d="M27 56 Q30 66 41 64.5" stroke="#15191d" stroke-width="2" fill="none"/>` : ''}</svg>`;
}
// ---------- shirts
export const PATTERNS = [
  'solid',
  'stripes',
  'pinstripe',
  'hoops',
  'sash',
  'halves',
  'chevron',
  'fade',
  'camo',
  'circuit',
  'panel',
  'five',
] as const;
export function paintShirt(
  g: CanvasRenderingContext2D,
  J: Jersey,
  x: number,
  y: number,
  w: number,
  h: number,
  side: 'front' | 'back',
  o: { crest?: CanvasImageSource | null; sponsor?: string; name?: string; num?: number; away?: boolean },
) {
  const c1 = o.away ? col(J.away, '#ffffff') : col(J.c1),
    c2 = o.away ? col(J.c1) : col(J.c2),
    c3 = col(J.c3);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = c1;
  g.fillRect(x, y, w, h);
  g.fillStyle = c2;
  const m = x + w / 2;
  switch (J.pattern) {
    case 'stripes':
      for (let i = 0; i < 4; i++) g.fillRect(x + w * (0.07 + i * 0.25), y, w * 0.11, h);
      break;
    case 'pinstripe':
      for (let i = 0; i < 14; i++) g.fillRect(x + w * (0.03 + i * 0.073), y, w * 0.008, h);
      break;
    case 'hoops':
      for (let i = 0; i < 4; i++) g.fillRect(x, y + h * (0.1 + i * 0.25), w, h * 0.12);
      break;
    case 'sash':
      g.beginPath();
      g.moveTo(x, y + h * 0.08);
      g.lineTo(x + w * 0.26, y);
      g.lineTo(x + w, y + h * 0.72);
      g.lineTo(x + w, y + h);
      g.lineTo(x + w * 0.86, y + h);
      g.lineTo(x, y + h * 0.34);
      g.fill();
      break;
    case 'halves':
      g.fillRect(m, y, w / 2, h);
      break;
    case 'chevron':
      g.beginPath();
      g.moveTo(x, y + h * 0.3);
      g.lineTo(m, y + h * 0.52);
      g.lineTo(x + w, y + h * 0.3);
      g.lineTo(x + w, y + h * 0.48);
      g.lineTo(m, y + h * 0.7);
      g.lineTo(x, y + h * 0.48);
      g.fill();
      break;
    case 'fade': {
      const q = g.createLinearGradient(0, y, 0, y + h);
      q.addColorStop(0.25, c1);
      q.addColorStop(1, c2);
      g.fillStyle = q;
      g.fillRect(x, y, w, h);
      break;
    }
    case 'camo':
      for (let i = 0; i < 46; i++) {
        const a = i * 2.4,
          r = Math.sqrt(i / 46);
        g.globalAlpha = 0.75;
        g.beginPath();
        g.ellipse(
          m + Math.cos(a) * r * w * 0.62,
          y + h / 2 + Math.sin(a * 1.3) * r * h * 0.6,
          w * (0.04 + (i % 5) * 0.014),
          h * (0.03 + (i % 3) * 0.02),
          a,
          0,
          7,
        );
        g.fill();
      }
      g.globalAlpha = 1;
      break;
    case 'circuit':
      g.strokeStyle = c2;
      g.lineWidth = w * 0.014;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        const yy = y + h * (0.06 + i * 0.11),
          xx = x + w * (0.1 + ((i * 0.37) % 0.6));
        g.moveTo(x, yy);
        g.lineTo(xx, yy);
        g.lineTo(xx + w * 0.1, yy + h * 0.07);
        g.lineTo(x + w, yy + h * 0.07);
        g.stroke();
        g.beginPath();
        g.arc(xx, yy, w * 0.016, 0, 7);
        g.fill();
      }
      break;
    case 'panel':
      g.fillRect(x, y, w * 0.17, h);
      g.fillRect(x + w * 0.83, y, w * 0.17, h);
      break;
    case 'five':
      for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.24 + i * 0.11), y + h * 0.08, w * 0.055, h * 0.62);
      g.fillRect(x + w * 0.24, y + h * 0.76, w * 0.495, h * 0.05);
      break;
  }
  const fam =
    { wide: '"Anybody Variable"', cond: '"Sofia Sans Semi Condensed Variable"', block: '"Sofia Sans Variable"' }[J.font] ?? 'sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const nc = col(J.numColor, '#ffffff');
  const ol = lum(nc) > 0.4 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.5)';
  const T = (s: string, px: number, yy: number, mw: number) => {
    g.font = `900 ${px}px ${fam}, sans-serif`;
    const tw = g.measureText(s).width;
    g.save();
    g.translate(m, yy);
    g.scale(Math.min(1, mw / Math.max(1, tw)), 1);
    g.lineWidth = px * 0.07;
    g.strokeStyle = ol;
    g.strokeText(s, 0, 0);
    g.fillStyle = nc;
    g.fillText(s, 0, 0);
    g.restore();
  };
  g.fillStyle = c3;
  if (J.collar === 'v') {
    g.beginPath();
    g.moveTo(m - w * 0.17, y);
    g.lineTo(m, y + h * (side === 'front' ? 0.16 : 0.05));
    g.lineTo(m + w * 0.17, y);
    g.lineTo(m + w * 0.22, y);
    g.lineTo(m, y + h * (side === 'front' ? 0.22 : 0.08));
    g.lineTo(m - w * 0.22, y);
    g.fill();
  } else if (J.collar === 'polo') {
    g.beginPath();
    g.moveTo(m - w * 0.22, y);
    g.lineTo(m, y + h * 0.1);
    g.lineTo(m + w * 0.22, y);
    g.fill();
    if (side === 'front') g.fillRect(m - w * 0.018, y + h * 0.08, w * 0.036, h * 0.16);
  } else {
    g.beginPath();
    g.ellipse(m, y - h * 0.02, w * 0.21, h * 0.11, 0, 0, Math.PI);
    g.fill();
  }
  if (side === 'front') {
    if (o.crest && J.crestPos !== 'none') {
      const s = w * 0.18;
      const cx = J.crestPos === 'centre' ? m : x + w * 0.71;
      g.drawImage(o.crest, cx - s / 2, y + h * (J.crestPos === 'centre' ? 0.2 : 0.16), s, s);
    }
    if (o.sponsor && J.sponsor) T(o.sponsor.toUpperCase(), h * 0.115, y + h * 0.52, w * 0.62);
    if (o.num !== undefined) T(String(o.num), h * 0.12, y + h * 0.27, w * 0.2);
  } else {
    if (o.name) T(o.name.toUpperCase(), h * 0.105, y + h * 0.2, w * 0.72);
    if (o.num !== undefined) T(String(o.num), h * 0.42, y + h * 0.52, w * 0.6);
  }
  g.restore();
}
const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function crestImage(c: Crest): Promise<HTMLImageElement> {
  const s = crestSvg(c, 256);
  const k = s.replace(/\b[cp]\d+g?\b/g, '');
  let p = imgCache.get(k);
  if (!p) {
    p = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
    imgCache.set(k, p);
    if (imgCache.size > 60) imgCache.delete(imgCache.keys().next().value!);
  }
  return p;
}
/** 512x256 atlas: front on the left half, back on the right */
export async function shirtAtlas(
  J: Jersey,
  crest: Crest,
  o: { sponsor?: string; name?: string; num?: number; res?: number } = {},
): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  const R = o.res ?? 256;
  c.width = R * 2;
  c.height = R;
  const g = c.getContext('2d')!;
  let im: HTMLImageElement | null = null;
  try {
    im = await crestImage(crest);
  } catch {
    im = null;
  }
  paintShirt(g, J, 0, 0, R, R, 'front', { ...o, crest: im });
  paintShirt(g, J, R, 0, R, R, 'back', { ...o, crest: im });
  return c;
}
export async function paintFlatShirt(
  cv: HTMLCanvasElement,
  J: Jersey,
  crest: Crest,
  side: 'front' | 'back',
  o: { sponsor?: string; name?: string; num?: number; away?: boolean },
) {
  const W = cv.width,
    H = cv.height,
    g = cv.getContext('2d')!;
  let im: HTMLImageElement | null = null;
  try {
    im = await crestImage(crest);
  } catch {
    im = null;
  }
  g.clearRect(0, 0, W, H);
  const s = Math.min(W / 300, H / 300);
  g.save();
  g.translate(W / 2 - 150 * s, H / 2 - 150 * s);
  g.scale(s, s);
  const c1 = o.away ? col(J.away, '#fff') : col(J.c1);
  const sl = J.sleeve === 'match' ? c1 : J.sleeve === 'second' ? col(J.c2) : col(J.c3);
  g.fillStyle = sl;
  for (const k of [1, -1]) {
    g.save();
    g.translate(150, 0);
    g.scale(k, 1);
    g.beginPath();
    g.moveTo(58, 26);
    g.bezierCurveTo(90, 34, 108, 54, 132, 112);
    g.lineTo(92, 134);
    g.lineTo(66, 92);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)';
    g.beginPath();
    g.moveTo(70, 60);
    g.lineTo(92, 134);
    g.lineTo(66, 92);
    g.fill();
    g.fillStyle = col(J.c3);
    g.beginPath();
    g.moveTo(132, 112);
    g.lineTo(92, 134);
    g.lineTo(89, 128);
    g.lineTo(129, 105);
    g.fill();
    g.fillStyle = sl;
    g.restore();
  }
  g.save();
  g.beginPath();
  g.moveTo(150 - 42, 18);
  g.quadraticCurveTo(150, side === 'front' ? 46 : 28, 150 + 42, 18);
  g.lineTo(150 + 66, 30);
  g.lineTo(150 + 72, 92);
  g.lineTo(150 + 76, 268);
  g.quadraticCurveTo(150, 282, 150 - 76, 268);
  g.lineTo(150 - 72, 92);
  g.lineTo(150 - 66, 30);
  g.closePath();
  g.clip();
  paintShirt(g, J, 72, 18, 156, 258, side, { ...o, crest: im });
  const q = g.createLinearGradient(72, 0, 228, 0);
  q.addColorStop(0, 'rgba(0,0,0,.32)');
  q.addColorStop(0.22, 'rgba(255,255,255,.05)');
  q.addColorStop(0.5, 'rgba(255,255,255,.09)');
  q.addColorStop(0.78, 'rgba(0,0,0,.03)');
  q.addColorStop(1, 'rgba(0,0,0,.34)');
  g.fillStyle = q;
  g.fillRect(72, 0, 156, 300);
  g.strokeStyle = 'rgba(0,0,0,.12)';
  g.lineWidth = 3;
  for (const [a, b, c, d] of [
    [100, 120, 118, 200],
    [200, 130, 186, 210],
    [130, 230, 140, 270],
  ]) {
    g.beginPath();
    g.moveTo(a, b);
    g.quadraticCurveTo((a + c) / 2 + 8, (b + d) / 2, c, d);
    g.stroke();
  }
  g.restore();
  g.restore();
}
