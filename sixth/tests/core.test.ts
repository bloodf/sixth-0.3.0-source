import { test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { sha256, canon } from '../src/core/hash.ts';
import { dsin, datan2, dexp } from '../src/core/dmath.ts';
import { Rng } from '../src/core/rng.ts';
test('sha256 matches node for many lengths', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 70001]) {
    const s = 'aé'.repeat(n).slice(0, n);
    assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'));
  }
});
test('canon sorts keys', () => assert.equal(canon({ b: 1, a: [1, { d: 2, c: -0 }] }), '{"a":[1,{"c":0,"d":2}],"b":1}'));
test('dmath accuracy', () => {
  for (let x = -10; x < 10; x += 0.13) {
    assert.ok(Math.abs(dsin(x) - Math.sin(x)) < 1e-6);
    assert.ok(Math.abs(dexp(x) / Math.exp(x) - 1) < 1e-4);
    assert.ok(Math.abs(datan2(x, 2.2) - Math.atan2(x, 2.2)) < 0.002);
  }
});
test('rng reproducible', () => {
  const a = Rng.of('x'),
    b = Rng.of('x');
  for (let i = 0; i < 100; i++) assert.equal(a.f(), b.f());
});
