import { simplify } from '@turf/simplify';
import { multiLineString } from '@turf/helpers';
import type { Coord, LonLat } from './gpx.ts';

const START_TOLERANCE = 1e-6; // degrees, about 10 cm
const TOLERANCE_STEP = 1.5;
const PRECISION = 1e5; // 5 decimals, about 1 m

const count = (lines: number[][][]) => lines.reduce((n, l) => n + l.length, 0);
const round = (n: number) => Math.round(n * PRECISION) / PRECISION;

// Douglas-Peucker with a growing tolerance until the lines fit in `max`
// points. Drops elevation and rounds to ~1 m to keep page JSON small.
export function simplifyTo(lines: Coord[][], max: number): LonLat[][] {
  const source = lines.filter((l) => l.length > 1);
  let out: number[][][] = source;
  let tolerance = START_TOLERANCE;

  while (count(out) > max) {
    out = simplify(multiLineString(source), { tolerance }).geometry.coordinates;
    tolerance *= TOLERANCE_STEP;
  }

  return out.map((line) => line.map((c) => [round(c[0]), round(c[1])] as LonLat));
}
