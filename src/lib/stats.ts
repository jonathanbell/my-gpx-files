import type { Coord } from './gpx.ts';

const EARTH_RADIUS = 6_371_008.8; // metres, mean
const HYSTERESIS = 5; // metres before a climb or descent counts

export interface Stats {
  distance: number; // metres
  gain: number;
  loss: number;
  max: number;
  min: number;
}

// [distance along route in metres, elevation, lon, lat]
export type ProfilePoint = [number, number, number, number];

const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversine(a: Coord | number[], b: Coord | number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

// Gain and loss only move once elevation leaves a 5 m band around the last
// counted value, so GPS jitter on a flat line adds nothing.
export function climb(elevations: number[]): { gain: number; loss: number } {
  let ref = elevations[0];
  let gain = 0;
  let loss = 0;

  for (const ele of elevations) {
    if (ele - ref >= HYSTERESIS) gain += ele - ref;
    else if (ref - ele >= HYSTERESIS) loss += ref - ele;
    else continue;

    ref = ele;
  }

  return { gain, loss };
}

// Segments are joined in file order with no distance between them.
export function profile(lines: Coord[][]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let distance = 0;

  for (const line of lines) {
    line.forEach((c, i) => {
      if (i > 0) distance += haversine(line[i - 1], c);
      out.push([distance, c[2], c[0], c[1]]);
    });
  }

  return out;
}

export function computeStats(lines: Coord[][]): Stats {
  const points = profile(lines);
  const elevations = points.map((p) => p[1]);

  return {
    distance: points.at(-1)![0],
    ...climb(elevations),
    // reduce, not spread: big tracks exceed the argument limit
    max: elevations.reduce((a, b) => Math.max(a, b)),
    min: elevations.reduce((a, b) => Math.min(a, b)),
  };
}

// Keeps every nth point plus the last, e.g. 5,000 points -> at most 1,000.
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;

  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out.at(-1) !== points.at(-1)) out.push(points.at(-1)!);
  return out;
}
