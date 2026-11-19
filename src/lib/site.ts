// Assembles everything the pages need from gpx/, the notes collection and the
// geocode cache. Built once per build and shared by every page.

import { readFile } from 'node:fs/promises';
import { getCollection, type CollectionEntry } from 'astro:content';
import { loadGpx, type GpxFile } from './routes.ts';
import { computeStats, downsample, haversine, profile, type Stats } from './stats.ts';
import { simplifyTo } from './simplify.ts';
import { categoryColors, overlayColor } from './colors.ts';
import type { GeocodeCache, Place } from './geocode.ts';
import type { LonLat } from './gpx.ts';

const GEOCODE_FILE = 'data/geocode.json';
const ROUTE_POINTS = 2000;
const PREVIEW_POINTS = 100;
const PROFILE_POINTS = 1000;
const WAYPOINT_NEAR = 250; // metres from the track to mark a waypoint on the chart
const SAME_SPOT = 50; // metres; closer start and end share one marker

export interface Route extends GpxFile {
  stats: Stats;
  place?: Place;
  color: string;
  notes?: CollectionEntry<'notes'>;
}

export interface Category {
  slug: string;
  name: string;
  color: string;
}

export interface Site {
  routes: Route[]; // sorted by title, overlays excluded
  overlays: GpxFile[];
  categories: Category[];
}

export const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' });

let site: Promise<Site> | undefined;
export const getSite = () => (site ??= build());

async function build(): Promise<Site> {
  const files = await loadGpx();
  const geocode: GeocodeCache = JSON.parse(await readFile(GEOCODE_FILE, 'utf8'));
  const notes = new Map((await getCollection('notes')).map((n) => [n.id, n]));

  const names = new Map(files.map((f) => [f.categorySlug, f.category]));
  const colors = categoryColors([...names.keys()]);
  const categories = [...names].map(([slug, name]) => ({ slug, name, color: colors[slug] }));

  const routes = files
    .filter((f) => !f.isOverlay)
    .map((f) => ({
      ...f,
      stats: computeStats(f.gpx.lines),
      place: geocode[f.repoPath],
      color: colors[f.categorySlug],
      notes: notes.get(f.file.replace(/\.gpx$/, '.md')),
    }))
    .sort(byTitle);

  return { routes, overlays: files.filter((f) => f.isOverlay), categories: categories.sort(byName) };
}

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'en');

const sameArea = (a: GpxFile, b: GpxFile) =>
  a.area !== undefined && a.categorySlug === b.categorySlug && a.areaSlug === b.areaSlug;

export function areaOf(route: Route, site: Site) {
  return {
    overlays: site.overlays.filter((o) => sameArea(o, route)),
    siblings: site.routes.filter((r) => r !== route && sameArea(r, route)),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export const startOf = (route: GpxFile): LonLat => {
  const [lon, lat] = route.gpx.lines[0][0];
  return [r5(lon), r5(lat)];
};

// ~11 m precision is plenty for a hover preview and keeps the home page small.
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
export const previewOf = (route: GpxFile) =>
  simplifyTo(route.gpx.lines, PREVIEW_POINTS).map((l) => l.map(([lon, lat]) => [r4(lon), r4(lat)]));

// Geometry and profile for one route page, inlined as JSON.
export function routeData(route: Route, overlays: GpxFile[]) {
  const full = profile(route.gpx.lines);
  const first = route.gpx.lines[0][0];
  const last = route.gpx.lines.at(-1)!.at(-1)!;

  const waypoints = route.gpx.waypoints.map(({ name, coord }) => {
    const nearest = full.reduce((best, p) => {
      const d = haversine(coord, [p[2], p[3]]);
      return d < best.d ? { d, at: p[0] } : best;
    }, { d: Infinity, at: 0 });

    return {
      name,
      coord: [r5(coord[0]), r5(coord[1])],
      at: nearest.d <= WAYPOINT_NEAR ? Math.round(nearest.at) : null,
    };
  });

  return {
    color: route.color,
    lines: simplifyTo(route.gpx.lines, ROUTE_POINTS),
    profile: downsample(full, PROFILE_POINTS).map(([d, e, lon, lat]) => [Math.round(d), r1(e), r5(lon), r5(lat)]),
    start: startOf(route),
    end: haversine(first, last) > SAME_SPOT ? [r5(last[0]), r5(last[1])] : null,
    waypoints,
    overlays: overlays.map((o, i) => ({ title: o.title, color: overlayColor(i), rings: simplifyTo(o.gpx.lines, ROUTE_POINTS) })),
  };
}

export type RouteData = ReturnType<typeof routeData>;
