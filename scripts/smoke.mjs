// Post-build check of dist/: every route has a page, an og.png and a
// byte-identical route.gpx; the home page stays inside its size budget.
//
// Usage: npm run build && npm run smoke

import { readFile, access } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { loadGpx } from '../src/lib/routes.ts';

const DIST = 'dist';
const HOME_BUDGET = 500 * 1024; // gzipped home HTML + JS, excluding map tiles
const PNG_MAGIC = '89504e47';

const files = await loadGpx();
const routes = files.filter((f) => !f.isOverlay);

for (const page of ['index.html', 'routes/index.html', '404.html']) await access(`${DIST}/${page}`);

for (const f of files) {
  const gpx = await readFile(`${DIST}/${f.url}/route.gpx`);
  assert.ok(gpx.equals(await readFile(f.repoPath)), `${f.repoPath}: route.gpx differs`);
  if (f.isOverlay) continue;

  await access(`${DIST}/${f.url}/index.html`);
  const png = await readFile(`${DIST}/${f.url}/og.png`);
  assert.equal(png.subarray(0, 4).toString('hex'), PNG_MAGIC, `${f.repoPath}: og.png is not a PNG`);
}

const index = await readFile(`${DIST}/routes/index.html`, 'utf8');
const links = index.match(/<li><a href=/g)?.length ?? 0;
assert.equal(links, routes.length, `/routes/ lists ${links} of ${routes.length} routes`);

// Follow the home page's scripts through their imports, plus the map worker.
const home = await readFile(`${DIST}/index.html`, 'utf8');
const seen = new Set();
const queue = [...home.matchAll(/\/_astro\/([\w.-]+\.m?js)/g)].map((m) => m[1]);
let bytes = gzipSync(home).length;

while (queue.length) {
  const name = queue.pop();
  if (seen.has(name)) continue;

  seen.add(name);
  // MapLibre's source names its default worker file, which Vite renames.
  const js = await readFile(`${DIST}/_astro/${name}`, 'utf8').catch(() => '');
  if (!js) continue;

  bytes += gzipSync(js).length;
  queue.push(...[...js.matchAll(/["'`/]([\w.-]+\.m?js)["'`]/g)].map((m) => m[1]).filter((n) => n !== name));
}

assert.ok(bytes <= HOME_BUDGET, `home page is ${bytes} bytes gzipped, budget ${HOME_BUDGET}`);
console.log(`smoke ok: ${routes.length} routes, ${files.length - routes.length} overlays, home ${Math.round(bytes / 1024)} KB gzipped`);
