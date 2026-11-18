import { test } from 'node:test';
import assert from 'node:assert/strict';
import { climb, computeStats, downsample, haversine, profile } from './stats.ts';
import type { Coord } from './gpx.ts';

test('haversine: one degree of latitude is about 111 km', () => {
  assert.equal(Math.round(haversine([0, 0], [0, 1]) / 1000), 111);
});

test('a jittery flat line gains nothing', () => {
  const jitter = Array.from({ length: 500 }, (_, i) => 100 + (i % 2 ? 2 : -2));

  assert.deepEqual(climb(jitter), { gain: 0, loss: 0 });
});

test('real climbs and descents are counted', () => {
  assert.deepEqual(climb([100, 110, 120, 118, 90, 100]), { gain: 30, loss: 30 });
});

test('segments join with no distance between them', () => {
  const lines: Coord[][] = [
    [[0, 0, 10], [0, 0.01, 20]],
    [[5, 5, 20], [5, 5.01, 40]],
  ];
  const stats = computeStats(lines);
  const segment = haversine([0, 0], [0, 0.01]);

  assert.equal(Math.round(stats.distance), Math.round(segment * 2));
  assert.equal(stats.gain, 30);
  assert.equal(stats.max, 40);
  assert.equal(stats.min, 10);
  assert.equal(profile(lines).length, 4);
});

test('downsample keeps the first and last points', () => {
  const points = Array.from({ length: 2501 }, (_, i) => i);
  const out = downsample(points, 1000);

  assert.ok(out.length <= 1001);
  assert.equal(out[0], 0);
  assert.equal(out.at(-1), 2500);
});
