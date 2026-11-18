import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ElevationRule, parseGpx } from './gpx.ts';
import { loadGpx } from './routes.ts';
import { simplifyTo } from './simplify.ts';

const Required = ElevationRule.Required;
const wrap = (body: string) => `<?xml version="1.0"?><gpx version="1.1">${body}</gpx>`;
const read = (file: string) => readFile(`gpx/${file}`, 'utf8');

test('multi-segment tracks become separate lines in file order', async () => {
  const file = 'Hiking and Fastpacking/Howe Sound Crest Trail.gpx';
  const { lines, waypoints } = parseGpx(await read(file), file, Required);

  assert.equal(lines.length, 4);
  assert.equal(waypoints.length, 4);
});

test('a route-only file (<rte>) parses', async () => {
  const file = 'Hiking and Fastpacking/Golden Hinde (v2).gpx';
  const { lines } = parseGpx(await read(file), file, Required);

  assert.equal(lines.length, 1);
  assert.ok(lines[0].length > 3000);
});

test('waypoint names are kept', () => {
  const gpx = wrap(`<wpt lat="1" lon="2"><ele>5</ele><name>Burman Lake</name></wpt>
    <trk><trkseg><trkpt lat="1" lon="2"><ele>5</ele></trkpt><trkpt lat="1" lon="3"><ele>5</ele></trkpt></trkseg></trk>`);

  assert.equal(parseGpx(gpx, 'x.gpx', Required).waypoints[0].name, 'Burman Lake');
});

test('broken XML fails, naming the file', () => {
  assert.throws(() => parseGpx('<gpx><trk>', 'gpx/broken.gpx', Required), /gpx\/broken\.gpx: unparseable/);
});

test('a file with zero points fails', () => {
  assert.throws(() => parseGpx(wrap(''), 'gpx/empty.gpx', Required), /empty\.gpx: route has zero points/);
});

test('a point without elevation fails for routes only', () => {
  const gpx = wrap('<trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1" lon="3"/></trkseg></trk>');

  assert.throws(() => parseGpx(gpx, 'gpx/flat.gpx', Required), /flat\.gpx: point 0 has no elevation/);
  assert.doesNotThrow(() => parseGpx(gpx, 'gpx/flat.gpx', ElevationRule.Optional));
});

test('simplify fits big tracks under the point budget', async () => {
  const file = 'Hiking and Fastpacking/Golden Hinde (v1).gpx';
  const { lines } = parseGpx(await read(file), file, Required);
  const out = simplifyTo(lines, 1000);
  const count = out.flat().length;

  assert.ok(count <= 1000 && count > 300, `got ${count} points`);
});

test('every file in gpx/ loads and validates', async () => {
  const files = await loadGpx();

  assert.ok(files.length > 80);
  assert.equal(files.filter((f) => f.isOverlay).length, 2);
});
