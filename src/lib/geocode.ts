// Pure geocode cache logic. The network calls live in scripts/geocode.mjs.

import type { LonLat } from './gpx.ts';

export interface Place {
  coord: LonLat;
  region?: string;
  country?: string;
}

export type GeocodeCache = Record<string, Place>;

const PRECISION = 1e5;

export const roundCoord = ([lon, lat]: number[]): LonLat => [
  Math.round(lon * PRECISION) / PRECISION,
  Math.round(lat * PRECISION) / PRECISION,
];

// Keeps fresh entries, drops ones whose file is gone, and lists the files
// that need a lookup because they are new or their start point moved.
export function planGeocode(
  cache: GeocodeCache,
  starts: Record<string, LonLat>,
): { keep: GeocodeCache; todo: string[] } {
  const keep: GeocodeCache = {};
  const todo: string[] = [];

  for (const [file, start] of Object.entries(starts)) {
    const coord = roundCoord(start);
    const hit = cache[file];

    if (hit && hit.coord[0] === coord[0] && hit.coord[1] === coord[1]) keep[file] = hit;
    else todo.push(file);
  }

  return { keep, todo };
}

interface NominatimAddress {
  state?: string;
  province?: string;
  region?: string;
  county?: string;
  country?: string;
}

export function toPlace(coord: LonLat, address: NominatimAddress = {}): Place {
  return {
    coord,
    region: address.state ?? address.province ?? address.region ?? address.county,
    country: address.country,
  };
}
