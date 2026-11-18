import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGeocode, toPlace } from './geocode.ts';

const cache = {
  'gpx/a.gpx': { coord: [1, 2] as [number, number], region: 'Yukon', country: 'Canada' },
  'gpx/moved.gpx': { coord: [3, 4] as [number, number], region: 'Utah', country: 'United States' },
  'gpx/deleted.gpx': { coord: [5, 6] as [number, number], country: 'Iceland' },
};

test('hits are kept, misses and moved starts are looked up, stale entries dropped', () => {
  const { keep, todo } = planGeocode(cache, {
    'gpx/a.gpx': [1.000001, 2],
    'gpx/moved.gpx': [3.1, 4],
    'gpx/new.gpx': [7, 8],
  });

  assert.deepEqual(Object.keys(keep), ['gpx/a.gpx']);
  assert.deepEqual(todo, ['gpx/moved.gpx', 'gpx/new.gpx']);
});

test('region falls back from state to province, region and county', () => {
  assert.equal(toPlace([0, 0], { state: 'Yukon', county: 'x' }).region, 'Yukon');
  assert.equal(toPlace([0, 0], { county: 'Hornafjörður' }).region, 'Hornafjörður');
  assert.equal(toPlace([0, 0]).region, undefined);
});
