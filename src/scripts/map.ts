// Shared MapLibre setup: three base layers, a switcher that remembers the
// visitor's choice, and the worker URL for Vite.

import { Map as MapLibre, NavigationControl, ScaleControl, setWorkerUrl, type IControl, type MapOptions,
  type RasterSourceSpecification, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

const BaseLayer = { Topo: 'topo', Outdoor: 'outdoor', Satellite: 'satellite' } as const;
type BaseLayer = (typeof BaseLayer)[keyof typeof BaseLayer];

const LABELS: Record<BaseLayer, string> = { topo: 'Topo', outdoor: 'Outdoor', satellite: 'Satellite' };
const STORAGE_KEY = 'base-layer';
const TILE_SIZE = 256;
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const BASE = 'base'; // layer metadata flag; untagged layers belong to the page

const raster = (id: string, source: RasterSourceSpecification): StyleSpecification => ({
  version: 8,
  glyphs: GLYPHS,
  sources: { [id]: source },
  layers: [{ id, type: 'raster', source: id }],
});

const STYLES: Record<BaseLayer, StyleSpecification | string> = {
  topo: raster('topo', {
    type: 'raster',
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    tileSize: TILE_SIZE,
    maxzoom: 17,
    attribution:
      'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | ' +
      'Map style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  }),
  // OpenFreeMap: free vector tiles with OSM trails, no key.
  outdoor: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: raster('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: TILE_SIZE,
    maxzoom: 19,
    attribution:
      'Tiles © Esri - Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  }),
};

function storedLayer(): BaseLayer {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return Object.values(BaseLayer).find((l) => l === stored) ?? BaseLayer.Topo;
  } catch {
    return BaseLayer.Topo;
  }
}

// Swap the base style but carry over the page's own sources and layers.
function keepPage(prev: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  const page = prev?.layers.filter((l) => !(l.metadata as Record<string, unknown> | undefined)?.[BASE]) ?? [];
  const used = new Set(page.map((l) => ('source' in l ? l.source : undefined)));
  const sources = Object.entries(prev?.sources ?? {}).filter(([id]) => used.has(id));

  return {
    ...next,
    sources: { ...next.sources, ...Object.fromEntries(sources) },
    layers: [...next.layers.map((l) => ({ ...l, metadata: { [BASE]: true } })), ...page],
  };
}

class LayerSwitch implements IControl {
  #el = document.createElement('div');
  #current: BaseLayer | undefined;

  onAdd(map: MapLibre) {
    this.#el.className = 'maplibregl-ctrl maplibregl-ctrl-group layer-switch';

    const buttons = Object.values(BaseLayer).map((layer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = LABELS[layer];
      button.addEventListener('click', () => select(layer));
      this.#el.append(button);
      return [layer, button] as const;
    });

    const select = async (layer: BaseLayer) => {
      if (layer === this.#current) return;

      this.#current = layer;
      for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === layer));

      try {
        localStorage.setItem(STORAGE_KEY, layer);
      } catch {}

      const terrain = layer === BaseLayer.Outdoor ? await import('./terrain.ts') : undefined;
      if (layer !== this.#current) return; // a newer click won the race

      map.setStyle(STYLES[layer], {
        transformStyle: (prev, next) => keepPage(prev, terrain ? terrain.withTerrain(next) : next),
      });
    };

    select(storedLayer());
    return this.#el;
  }

  onRemove() {
    this.#el.remove();
  }
}

export function createMap(container: HTMLElement, options: Partial<MapOptions> = {}): MapLibre {
  const map = new MapLibre({ container, maxZoom: 18, ...options });

  map.addControl(new NavigationControl({ showCompass: false }));
  map.addControl(new LayerSwitch(), 'top-left');
  map.addControl(new ScaleControl({ unit: 'metric' }));
  return map;
}
