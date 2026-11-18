// Shared MapLibre setup: two raster base layers, a switcher that remembers
// the visitor's choice, and the worker URL for Vite.

import { Map as MapLibre, NavigationControl, ScaleControl, setWorkerUrl, type IControl, type MapOptions } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

const BaseLayer = { Topo: 'topo', Satellite: 'satellite' } as const;
type BaseLayer = (typeof BaseLayer)[keyof typeof BaseLayer];

const LABELS: Record<BaseLayer, string> = { topo: 'Topo', satellite: 'Satellite' };
const STORAGE_KEY = 'base-layer';
const TILE_SIZE = 256;

const style: MapOptions['style'] = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    topo: {
      type: 'raster',
      tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      tileSize: TILE_SIZE,
      maxzoom: 17,
      attribution:
        'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | ' +
        'Map style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    },
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: TILE_SIZE,
      maxzoom: 19,
      attribution:
        'Tiles © Esri - Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [
    { id: 'topo', type: 'raster', source: 'topo' },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
  ],
};

function storedLayer(): BaseLayer {
  try {
    return localStorage.getItem(STORAGE_KEY) === BaseLayer.Satellite ? BaseLayer.Satellite : BaseLayer.Topo;
  } catch {
    return BaseLayer.Topo;
  }
}

class LayerSwitch implements IControl {
  #el = document.createElement('div');

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

    const select = (layer: BaseLayer) => {
      for (const [id, button] of buttons) {
        map.setLayoutProperty(id, 'visibility', id === layer ? 'visible' : 'none');
        button.setAttribute('aria-pressed', String(id === layer));
      }

      try {
        localStorage.setItem(STORAGE_KEY, layer);
      } catch {}
    };

    map.once('load', () => select(storedLayer()));
    return this.#el;
  }

  onRemove() {
    this.#el.remove();
  }
}

export function createMap(container: HTMLElement, options: Partial<MapOptions> = {}): MapLibre {
  const map = new MapLibre({ container, style, maxZoom: 18, ...options });

  map.addControl(new NavigationControl({ showCompass: false }));
  map.addControl(new LayerSwitch(), 'top-left');
  map.addControl(new ScaleControl({ unit: 'metric' }));
  return map;
}
