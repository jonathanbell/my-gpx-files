// Fills missing or zero <ele> values in GPX files from the Copernicus GLO-30
// DEM. Recorded elevations are never touched. Edits files in place.
//
// Usage: npm run fill-elevation [-- file.gpx ...]  (default: every file in gpx/)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fromUrl } from 'geotiff';

const GPX_DIR = 'gpx';
const DEM_BASE = 'https://copernicus-dem-30m.s3.amazonaws.com';
const NOT_FOUND = 404;

// Matches <trkpt>, <rtept> and <wpt>, self-closing or not.
const POINT = /<(trkpt|rtept|wpt)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
const ELE = /<ele>\s*([^<]*?)\s*<\/ele>/;

const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
const key = (lat, lon) => `${lat},${lon}`;

function needsEle(body) {
  const value = body?.match(ELE)?.[1];
  return value === undefined || !Number(value); // also catches 0, "" and NaN
}

export function missingPoints(text) {
  const points = [];

  for (const [, , attrs, , body] of text.matchAll(POINT)) {
    if (!needsEle(body)) continue;

    points.push({ lat: attr(attrs, 'lat'), lon: attr(attrs, 'lon') });
  }

  return points;
}

// `elevations` maps "lat,lon" (attribute strings) to metres.
export function patchGpx(text, elevations) {
  return text.replace(POINT, (whole, tag, attrs, close, body) => {
    const ele = elevations.get(key(attr(attrs, 'lat'), attr(attrs, 'lon')));
    if (ele === undefined || !needsEle(body)) return whole;

    const eleTag = `<ele>${ele.toFixed(1)}</ele>`;
    if (close === '/>') return `<${tag}${attrs}>${eleTag}</${tag}>`;
    if (ELE.test(body)) return whole.replace(ELE, eleTag);

    // GPX schema wants <ele> first; reuse the body's indentation.
    const indent = body.match(/^\s*/)[0];
    return `<${tag}${attrs}>${indent}${eleTag}${body}</${tag}>`;
  });
}

// GLO-30 tiles are 1x1 degree, named by their south-west corner.
function tileUrl(lat, lon) {
  const y = Math.floor(lat);
  const x = Math.floor(lon);
  const ns = `${y < 0 ? 'S' : 'N'}${String(Math.abs(y)).padStart(2, '0')}`;
  const ew = `${x < 0 ? 'W' : 'E'}${String(Math.abs(x)).padStart(3, '0')}`;
  const name = `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;

  return `${DEM_BASE}/${name}/${name}.tif`;
}

const tiles = new Map();

async function openTile(url) {
  if (tiles.has(url)) return tiles.get(url);

  // Ocean tiles do not exist; a HEAD avoids a confusing geotiff error.
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok && head.status !== NOT_FOUND) {
    throw new Error(`DEM tile ${url}: HTTP ${head.status}`);
  }

  const image = head.ok ? await (await fromUrl(url)).getImage() : null;
  tiles.set(url, image);
  return image;
}

// Bilinear samples for points within one tile, read as a single window since
// remote reads are slow. GLO-30 is PixelIsPoint: the origin is a pixel centre.
async function sampleTile(url, points, elevations) {
  const image = await openTile(url);
  if (!image) return;

  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution();
  const px = points.map(({ lat, lon }) => {
    const fx = (Number(lon) - ox) / rx;
    const fy = (Number(lat) - oy) / ry;
    const x0 = Math.min(Math.max(Math.floor(fx), 0), image.getWidth() - 2);
    const y0 = Math.min(Math.max(Math.floor(fy), 0), image.getHeight() - 2);
    return { lat, lon, fx, fy, x0, y0 };
  });

  const left = Math.min(...px.map((p) => p.x0));
  const top = Math.min(...px.map((p) => p.y0));
  const right = Math.max(...px.map((p) => p.x0)) + 2;
  const bottom = Math.max(...px.map((p) => p.y0)) + 2;
  const [raster] = await image.readRasters({ window: [left, top, right, bottom] });
  const width = right - left;
  const at = (x, y) => raster[(y - top) * width + (x - left)];

  for (const { lat, lon, fx, fy, x0, y0 } of px) {
    const dx = fx - x0;
    const dy = fy - y0;
    const upper = at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx;
    const lower = at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx;
    elevations.set(key(lat, lon), upper * (1 - dy) + lower * dy);
  }
}

async function fillFile(path) {
  const text = await readFile(path, 'utf8');
  const points = missingPoints(text);
  if (points.length === 0) return;

  const byTile = Map.groupBy(points, (p) => tileUrl(Number(p.lat), Number(p.lon)));
  const elevations = new Map();
  for (const [url, tilePoints] of byTile) await sampleTile(url, tilePoints, elevations);

  const patched = patchGpx(text, elevations);
  const before = [...text.matchAll(POINT)].length;
  const after = [...patched.matchAll(POINT)].length;
  if (before !== after) throw new Error(`${path}: point count changed`);

  await writeFile(path, patched);
  const left = missingPoints(patched).length;
  console.log(`${path}: filled ${points.length - left}/${points.length}`);
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : (await readdir(GPX_DIR, { recursive: true }))
        .filter((f) => f.endsWith('.gpx'))
        .map((f) => join(GPX_DIR, f));

  for (const file of files) await fillFile(file);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
