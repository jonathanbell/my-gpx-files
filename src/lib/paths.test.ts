import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrls, parsePath, slugify } from './paths.ts';

test('slugify strips diacritics and punctuation', () => {
  assert.equal(slugify('Dän Zhùr (Donjek)'), 'dan-zhur-donjek');
  assert.equal(slugify('Golden Hinde (v2)'), 'golden-hinde-v2');
  assert.equal(slugify("King's Peak"), 'king-s-peak');
  assert.equal(slugify('Tree + Stump Routes (Leavenworth)'), 'tree-stump-routes-leavenworth');
});

test('a route without an area', () => {
  const p = parsePath('Hiking and Fastpacking/Golden Hinde (v2).gpx');

  assert.equal(p.category, 'Hiking and Fastpacking');
  assert.equal(p.area, undefined);
  assert.equal(p.title, 'Golden Hinde (v2)');
  assert.equal(p.isOverlay, false);
  assert.equal(p.url, 'hiking-and-fastpacking/golden-hinde-v2');
});

test('a route with an area', () => {
  const p = parsePath('Hiking and Fastpacking/Dän Zhùr (Donjek)/Donjek (Strava).gpx');

  assert.equal(p.area, 'Dän Zhùr (Donjek)');
  assert.equal(p.url, 'hiking-and-fastpacking/dan-zhur-donjek/donjek-strava');
});

test('an overlay keeps the suffix in its URL but not its title', () => {
  const p = parsePath('Alpine Climbing/Mount Logan/Crevasse areas [overlay].gpx');

  assert.equal(p.isOverlay, true);
  assert.equal(p.title, 'Crevasse areas');
  assert.equal(p.name, 'Crevasse areas [overlay].gpx');
  assert.equal(p.url, 'alpine-climbing/mount-logan/crevasse-areas-overlay');
});

test('nesting deeper than one subfolder fails', () => {
  assert.throws(() => parsePath('Hiking/Area/Too deep/Route.gpx'), /Too deep\/Route\.gpx: nested too deep/);
});

test('a file outside a category fails', () => {
  assert.throws(() => parsePath('Route.gpx'), /category folder/);
});

test('two files with the same URL fail, naming both', () => {
  const paths = [parsePath('Hiking/Mount Myra.gpx'), parsePath('Hiking/Mount  Myra.gpx')];

  assert.throws(() => checkUrls(paths), /Hiking\/Mount Myra\.gpx and Hiking\/Mount  Myra\.gpx/);
});

test('the "routes" category is reserved', () => {
  assert.throws(() => checkUrls([parsePath('Routes/A.gpx')]), /Routes\/A\.gpx: .*reserved/);
});
