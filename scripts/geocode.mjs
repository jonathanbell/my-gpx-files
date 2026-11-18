// Reverse geocodes each route's start point with Nominatim into
// data/geocode.json. Only new or moved routes are looked up; entries for
// deleted files are dropped. Lookup failures warn and leave the entry out.
//
// Usage: npm run geocode

import { readFile, writeFile } from 'node:fs/promises';
import { loadGpx } from '../src/lib/routes.ts';
import { planGeocode, roundCoord, toPlace } from '../src/lib/geocode.ts';

const CACHE_FILE = 'data/geocode.json';
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'my-gpx-files-build';
const DELAY_MS = 1100; // usage policy: at most 1 request per second
const ZOOM_STATE = '5';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function lookup([lon, lat]) {
  const params = new URLSearchParams({ lat, lon, zoom: ZOOM_STATE, format: 'jsonv2' });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return (await res.json()).address;
}

async function main() {
  const routes = (await loadGpx()).filter((r) => !r.isOverlay);
  const starts = Object.fromEntries(routes.map((r) => [r.repoPath, roundCoord(r.gpx.lines[0][0])]));
  const { keep, todo } = planGeocode(await readCache(), starts);

  for (const [i, file] of todo.entries()) {
    if (i > 0) await sleep(DELAY_MS);

    try {
      keep[file] = toPlace(starts[file], await lookup(starts[file]));
      console.log(`${file}: ${keep[file].region}, ${keep[file].country}`);
    } catch (error) {
      console.warn(`${file}: geocode failed, skipping: ${error.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.entries(keep).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeFile(CACHE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

await main();
