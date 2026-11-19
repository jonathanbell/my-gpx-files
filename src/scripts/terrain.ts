// Hillshade and contour lines for the Outdoor base layer, both generated in
// the browser from free Terrarium DEM tiles. Loaded only when selected.

import mlcontour from 'maplibre-contour';
import { addProtocol, type LayerSpecification, type SourceSpecification, type StyleSpecification } from 'maplibre-gl';

const DEM_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const DEM_MAXZOOM = 14;
const INK = 'rgba(110, 85, 50, 0.6)';

const dem = new mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: DEM_MAXZOOM, worker: true });
dem.setupMaplibre({ addProtocol });

const sources: Record<string, SourceSpecification> = {
  dem: {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [dem.sharedDemProtocolUrl],
    tileSize: 256,
    maxzoom: DEM_MAXZOOM,
    attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain: Mapzen, SRTM</a>',
  },
  contours: {
    type: 'vector',
    // [minor, major] interval in metres by zoom; none below zoom 11.
    tiles: [dem.contourProtocolUrl({ thresholds: { 11: [200, 1000], 12: [100, 500], 13: [50, 250], 14: [20, 100] } })],
    maxzoom: 15,
  },
};

const layers: LayerSpecification[] = [
  { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35 } },
  { id: 'contours', type: 'line', source: 'contours', 'source-layer': 'contours',
    paint: { 'line-color': INK, 'line-width': ['match', ['get', 'level'], 1, 1.2, 0.6] } },
  { id: 'contour-labels', type: 'symbol', source: 'contours', 'source-layer': 'contours', filter: ['>', ['get', 'level'], 0],
    layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
      'text-font': ['Noto Sans Regular'], 'text-size': 10 },
    paint: { 'text-color': INK, 'text-halo-color': '#fff', 'text-halo-width': 1 } },
];

// Slot terrain in under the roads so trails stay on top.
export function withTerrain(style: StyleSpecification): StyleSpecification {
  const at = style.layers.findIndex((l) => l.id.startsWith('tunnel_'));
  return {
    ...style,
    sources: { ...style.sources, ...sources },
    layers: style.layers.toSpliced(at === -1 ? style.layers.length : at, 0, ...layers),
  };
}
