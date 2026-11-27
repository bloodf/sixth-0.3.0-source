/** What is painted on the wall behind people: names the height of a person, crests, flat colour. */
import { crestImage, lum, mixHex, on } from './art.ts';
import type { Crest } from '../game/types.ts';
const FF = '"Sofia Sans Extra Condensed Variable"';
const W = 3072,
  H = 1229;
let ready: Promise<unknown> | null = null;
const fonts = () => (ready ??= document.fonts.load(`900 100px ${FF}`).catch(() => 0));
/** fits a word to a width; returns the size of the letters */
function word(x: CanvasRenderingContext2D, t: string, cx: number, base: number, w: number, max: number) {
  x.font = `900 200px ${FF}`;
  const k = Math.min(max, (200 * w) / Math.max(1, x.measureText(t).width));
  x.font = `900 ${k}px ${FF}`;
  x.fillText(t, cx, base);
  return k;
}
export interface Wall {
  kind: 'you' | 'club' | 'crest' | 'shirt';
  c1: string;
  c2: string;
  c3: string;
  text: string;
  crest?: Crest;
}
/** the plane is 16 by 6.4 metres; only the middle third is usually seen */
export async function paintWall(o: Wall): Promise<{ cv: HTMLCanvasElement; ground: string }> {
  await fonts();
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d')!;
  const M = W / 16; // pixels per metre
  const cx = W / 2;
  const ground = o.kind === 'you' ? '#14181d' : mixHex(o.c1, '#0a0c0f', lum(o.c1) > 0.5 ? 0.2 : 0.12);
  x.fillStyle = ground;
  x.fillRect(0, 0, W, H);
  const ink = o.kind === 'you' ? '#2a313a' : on(o.c1) === '#ffffff' ? mixHex(o.c1, '#ffffff', 0.2) : mixHex(o.c1, '#000000', 0.2);
  // one hard shape, never a pattern
  x.fillStyle = o.kind === 'you' ? '#ffc61a' : o.c2;
  x.beginPath();
  if (o.kind === 'you') {
    x.moveTo(cx + 1.02 * M, 0);
    x.lineTo(cx + 1.5 * M, 0);
    x.lineTo(cx + 0.42 * M, H);
    x.lineTo(cx - 0.06 * M, H);
  } else if (o.kind === 'shirt') {
    x.rect(0, H - 1.55 * M, W, 0.18 * M);
  } else if (o.kind === 'club') {
    x.moveTo(cx + 1.1 * M, 0);
    x.lineTo(W, 0);
    x.lineTo(W, H);
    x.lineTo(cx - 0.7 * M, H);
  }
  x.fill();
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  const t = o.text.toUpperCase().trim();
  if (o.kind === 'crest' && o.crest) {
    const im = await crestImage(o.crest).catch(() => null);
    x.save();
    x.globalAlpha = 0.16;
    if (im) x.drawImage(im, cx - 4.2 * M, H / 2 - 4.0 * M, 8 * M, 8 * M);
    x.restore();
    x.save();
    x.shadowColor = 'rgba(0,0,0,.5)';
    x.shadowBlur = 0.16 * M;
    x.shadowOffsetY = 0.07 * M;
    if (im) x.drawImage(im, cx - 1.12 * M, H - 3.05 * M, 2.24 * M, 2.24 * M);
    x.restore();
  } else if (t) {
    const parts = t.split(/\s+/);
    const lines =
      parts.length > 1 && t.length > 6
        ? [parts.slice(0, Math.ceil(parts.length / 2)).join(' '), parts.slice(Math.ceil(parts.length / 2)).join(' ')]
        : [t];
    x.fillStyle = o.kind === 'club' ? on(mixHex(o.c1, o.c2, 0.5)) : ink;
    // as large as the space beside the panel allows
    const size = lines.map(l => {
      x.font = `900 200px ${FF}`;
      return Math.min(2.1 * M, (200 * 2.85 * M) / Math.max(1, x.measureText(l).width));
    });
    const tall = size.reduce((a, v) => a + v * 0.72, 0) + 0.1 * M * (lines.length - 1);
    const k = Math.min(1, (1.95 * M) / tall);
    let y = H - 0.78 * M;
    for (let i = lines.length - 1; i >= 0; i--) {
      word(x, lines[i], cx, y, 2.85 * M * k, size[i] * k);
      y -= size[i] * k * 0.72 + 0.1 * M;
    }
  }
  // light from above, dirt from below
  const g = x.createRadialGradient(cx, H * 0.3, M * 0.5, cx, H * 0.42, M * 6.2);
  g.addColorStop(0, 'rgba(255,255,255,.13)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.72)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const b = x.createLinearGradient(0, H - 1.1 * M, 0, H);
  b.addColorStop(0, 'rgba(0,0,0,0)');
  b.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = b;
  x.fillRect(0, 0, W, H);
  return { cv, ground };
}
