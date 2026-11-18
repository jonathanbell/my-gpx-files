import { readFile } from 'node:fs/promises';
import type { APIRoute } from 'astro';
import { getSite } from '../../lib/site.ts';

// Original bytes, untouched. Overlays included so route pages can link them.
export async function getStaticPaths() {
  const { routes, overlays } = await getSite();
  return [...routes, ...overlays].map((f) => ({ params: { path: f.url }, props: { file: f.repoPath } }));
}

export const GET: APIRoute = async ({ props }) =>
  new Response(await readFile(props.file as string), { headers: { 'Content-Type': 'application/gpx+xml' } });
