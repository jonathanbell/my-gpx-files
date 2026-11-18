import { DOMParser } from '@xmldom/xmldom';
import { gpx } from '@tmcw/togeojson';

export type Coord = [lon: number, lat: number, ele: number];
export type LonLat = [lon: number, lat: number];

export interface Waypoint {
  name: string;
  coord: Coord;
}

export interface ParsedGpx {
  lines: Coord[][]; // tracks, segments and routes, in file order
  waypoints: Waypoint[];
}

export const ElevationRule = { Required: 'required', Optional: 'optional' } as const;
export type ElevationRule = (typeof ElevationRule)[keyof typeof ElevationRule];

export function parseGpx(text: string, file: string, rule: ElevationRule): ParsedGpx {
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(`${file}: unparseable GPX: ${message}`);
    },
  }).parseFromString(text, 'text/xml');

  if (doc.documentElement?.nodeName !== 'gpx') {
    throw new Error(`${file}: unparseable GPX: root element is not <gpx>`);
  }

  const lines: Coord[][] = [];
  const waypoints: Waypoint[] = [];

  // togeojson emits tracks first, then routes, then waypoints.
  for (const { geometry, properties } of gpx(doc as unknown as Document).features) {
    if (!geometry) continue;

    if (geometry.type === 'Point') {
      waypoints.push({ name: properties?.name ?? '', coord: geometry.coordinates as Coord });
      continue;
    }

    if (geometry.type === 'LineString') lines.push(geometry.coordinates as Coord[]);
    if (geometry.type === 'MultiLineString') lines.push(...(geometry.coordinates as Coord[][]));
  }

  const points = lines.flat();
  if (points.length === 0) throw new Error(`${file}: route has zero points`);

  const missing = points.findIndex((c) => !Number.isFinite(c[2]));
  if (rule === ElevationRule.Required && missing !== -1) {
    throw new Error(`${file}: point ${missing} has no elevation, run npm run fill-elevation`);
  }

  return { lines: lines.filter((l) => l.length > 0), waypoints };
}
