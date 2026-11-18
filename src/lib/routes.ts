import { readdir, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { checkUrls, parsePath, type RoutePath } from './paths.ts';
import { ElevationRule, parseGpx, type ParsedGpx } from './gpx.ts';

export const GPX_DIR = 'gpx';

export interface GpxFile extends RoutePath {
  repoPath: string; // e.g. "gpx/Alpine Climbing/Mount Daniel.gpx", the geocode key
  gpx: ParsedGpx;
}

export async function listGpx(root = GPX_DIR): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });

  return entries
    .filter((f) => f.endsWith('.gpx'))
    .map((f) => f.split(sep).join('/'))
    .sort();
}

// Reads and validates every GPX file. Throws on the first broken one, naming it.
export async function loadGpx(root = GPX_DIR): Promise<GpxFile[]> {
  const paths = (await listGpx(root)).map(parsePath);
  checkUrls(paths);

  return Promise.all(
    paths.map(async (p) => {
      const repoPath = `${GPX_DIR}/${p.file}`;
      const text = await readFile(join(root, p.file), 'utf8');
      const rule = p.isOverlay ? ElevationRule.Optional : ElevationRule.Required;

      return { ...p, repoPath, gpx: parseGpx(text, repoPath, rule) };
    }),
  );
}
