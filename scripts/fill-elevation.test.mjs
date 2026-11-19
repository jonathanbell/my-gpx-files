import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fill, missingPoints, patchGpx } from './fill-elevation.mjs';

const GPX = `<trkseg>
   <trkpt lat="1" lon="2">
    <ele>0</ele>
   </trkpt>
   <trkpt lat="3" lon="4">
    <ele>812.5</ele>
   </trkpt>
   <trkpt lat="5" lon="6">
    <time>t</time>
   </trkpt>
</trkseg><rte><rtept lat="7" lon="8"/></rte>`;

test('finds zero, missing and self-closing points only', () => {
  const keys = missingPoints(GPX).map((p) => `${p.lat},${p.lon}`);
  assert.deepEqual(keys, ['1,2', '5,6', '7,8']);
});

test('patches without touching recorded elevation', () => {
  const ele = new Map([['1,2', 10], ['3,4', 99], ['5,6', 20], ['7,8', 30]]);
  const out = patchGpx(GPX, ele);

  assert.match(out, /lat="1" lon="2">\n    <ele>10\.0<\/ele>/);
  assert.match(out, /<ele>812\.5<\/ele>/);
  assert.match(out, /lat="5" lon="6">\n    <ele>20\.0<\/ele>\n    <time>/);
  assert.match(out, /<rtept lat="7" lon="8"><ele>30\.0<\/ele><\/rtept>/);
});

test('replace mode overwrites recorded elevation too', () => {
  assert.equal(missingPoints(GPX, Fill.All).length, 4);

  const ele = new Map([['1,2', 10], ['3,4', 99], ['5,6', 20], ['7,8', 30]]);
  const out = patchGpx(GPX, ele, Fill.All);

  assert.match(out, /<ele>99\.0<\/ele>/);
  assert.doesNotMatch(out, /812\.5/);
});
