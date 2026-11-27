import * as THREE from 'three';
const cache = new Map<string, THREE.Texture>();
function mk(k: string, s: number, f: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  let t = cache.get(k);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  f(c.getContext('2d')!, s);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  cache.set(k, t);
  return t;
}
export const softTex = () =>
  mk('soft', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
export const puffTex = () =>
  mk('puff', 128, (g, s) => {
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4,
        d = Math.sqrt(i / 26) * s * 0.28,
        x = s / 2 + Math.cos(a) * d,
        y = s / 2 + Math.sin(a) * d,
        r = s * (0.13 + (i % 5) * 0.018);
      const q = g.createRadialGradient(x, y, 0, x, y, r);
      q.addColorStop(0, 'rgba(255,255,255,.34)');
      q.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = q;
      g.fillRect(0, 0, s, s);
    }
  });
export const ringTex = () =>
  mk('ring', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.62, 'rgba(255,255,255,.25)');
    r.addColorStop(0.82, 'rgba(255,255,255,1)');
    r.addColorStop(0.9, 'rgba(255,255,255,.5)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
export const flareTex = () =>
  mk('flare', 64, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 7; i++) {
      g.rotate(0.9);
      const q = g.createLinearGradient(0, 0, s / 2, 0);
      q.addColorStop(0, 'rgba(255,255,255,.9)');
      q.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = q;
      g.beginPath();
      g.moveTo(0, -s * 0.06);
      g.lineTo(s * 0.5, 0);
      g.lineTo(0, s * 0.06);
      g.fill();
    }
  });
export const blobTex = () =>
  mk('blob', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(0,0,0,.6)');
    r.addColorStop(0.5, 'rgba(0,0,0,.34)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
/** value noise for textures */
export function noise2(seed: number) {
  const h = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 974711);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const v = (x: number, y: number) => {
    const X = Math.floor(x),
      Y = Math.floor(y),
      a = x - X,
      b = y - Y,
      u = a * a * (3 - 2 * a),
      w = b * b * (3 - 2 * b);
    return (h(X, Y) * (1 - u) + h(X + 1, Y) * u) * (1 - w) + (h(X, Y + 1) * (1 - u) + h(X + 1, Y + 1) * u) * w;
  };
  return (x: number, y: number) => v(x, y) * 0.55 + v(x * 2.1, y * 2.1) * 0.28 + v(x * 4.3, y * 4.3) * 0.17;
}
