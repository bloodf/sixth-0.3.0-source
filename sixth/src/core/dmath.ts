/**
 * Deterministic math. Math.sin/exp/pow may differ between JS engines in the last bit,
 * which would make a P2P re-simulation diverge. These use only + - * / sqrt (exact per IEEE-754).
 */
export const PI = 3.141592653589793,
  TAU = 6.283185307179586;

export function dsin(x: number): number {
  x = x - Math.floor(x / TAU + 0.5) * TAU;
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 - x2 / 39916800)))));
}
export const dcos = (x: number) => dsin(x + PI / 2);

export function datan2(y: number, x: number): number {
  const ax = x < 0 ? -x : x,
    ay = y < 0 ? -y : y;
  const mx = ax > ay ? ax : ay,
    mn = ax > ay ? ay : ax;
  if (mx === 0) return 0;
  const a = mn / mx,
    s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.5707963267948966 - r;
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}
export function dexp(x: number): number {
  if (x > 60) x = 60;
  if (x < -60) x = -60;
  // reduce to |x|<=1/64 then square back
  let n = 0;
  while (x > 0.015625 || x < -0.015625) {
    x /= 2;
    n++;
  }
  let r = 1 + x * (1 + (x / 2) * (1 + (x / 3) * (1 + x / 4)));
  for (; n > 0; n--) r *= r;
  return r;
}
export const logistic = (x: number) => 1 / (1 + dexp(-x));
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
export function angDiff(a: number, b: number) {
  let d = a - b;
  d -= Math.floor(d / TAU + 0.5) * TAU;
  return d;
}
