import type { APIRoute } from 'astro';
import { getSite, type Route } from '../../lib/site.ts';
import { ogImage } from '../../lib/og.ts';

export async function getStaticPaths() {
  const site = await getSite();
  return site.routes.map((route) => ({ params: { path: route.url }, props: { route } }));
}

export const GET: APIRoute = async ({ props }) =>
  new Response(await ogImage((props as { route: Route }).route), { headers: { 'Content-Type': 'image/png' } });
