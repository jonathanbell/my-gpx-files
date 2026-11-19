// Home page: every route line plus clustered start pins, fuzzy search, category chips and a result list
// limited to the map viewport. Filter state lives in the query string.

import Fuse from 'fuse.js';
import { LngLatBounds, Popup, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { createMap } from './map.ts';
import { HOME_SEARCH_KEY } from './keys.ts';

type LonLat = [number, number];

interface Item {
  url: string;
  title: string;
  cat: string;
  category: string;
  area: string;
  region: string;
  country: string;
  distance: string;
  gain: string;
  start: LonLat;
  line: LonLat[][];
  waypoints: string;
  notes: string;
}

interface Category {
  slug: string;
  name: string;
  color: string;
}

const NONE = '';
const PADDING = 48;
const FADED = 0.3;
const SWIPE = 30; // px of vertical drag that opens or closes the sheet

const { categories, routes } = JSON.parse(document.getElementById('data')!.textContent!) as {
  categories: Category[];
  routes: Item[];
};
const colors = Object.fromEntries(categories.map((c) => [c.slug, c.color]));

const search = document.getElementById('q') as HTMLInputElement;
const results = document.getElementById('results')!;
const count = document.getElementById('count')!;
const chips = [...document.querySelectorAll<HTMLButtonElement>('.chip')];

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') ?? '',
  cats: new Set((params.get('cat') ?? '').split(',').filter(Boolean)),
};

const fuse = new Fuse(routes, {
  keys: [{ name: 'title', weight: 3 }, 'category', 'area', 'region', 'country', 'waypoints', 'notes'],
  threshold: 0.25, // 0.35 lets "rainer" match "Mountaineering"
  ignoreLocation: true,
});

const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' });

function matches(): Item[] {
  const found = state.q ? fuse.search(state.q).map((r) => r.item).sort(byTitle) : routes;
  return found.filter((r) => state.cats.size === 0 || state.cats.has(r.cat));
}

const points = (items: Item[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: items.map((r) => ({
    type: 'Feature',
    properties: { url: r.url, title: r.title, color: colors[r.cat] },
    geometry: { type: 'Point', coordinates: r.start },
  })),
});

const lines = (items: Item[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: items.map((r) => ({
    type: 'Feature',
    properties: { url: r.url, title: r.title, color: colors[r.cat] },
    geometry: { type: 'MultiLineString', coordinates: r.line },
  })),
});

const bounds = routes.reduce((b, r) => b.extend(r.start), new LngLatBounds(routes[0].start, routes[0].start));
const map = createMap(document.getElementById('map')!, { bounds, fitBoundsOptions: { padding: PADDING } });
const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
let loaded = false;

function highlight(url: string, title?: string, at?: LonLat) {
  if (!loaded) return;

  for (const id of ['preview-casing', 'preview']) map.setFilter(id, ['==', ['get', 'url'], url]);

  // Fade the other lines so the hovered one stands out where they overlap.
  const faded = url === NONE ? 1 : ['case', ['==', ['get', 'url'], url], 1, FADED];
  for (const id of ['lines', 'lines-casing']) map.setPaintProperty(id, 'line-opacity', faded);
  if (title && at) popup.setLngLat(at).setText(title).addTo(map);
  else popup.remove();
}

function listItem(r: Item): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  const title = document.createElement('span');
  const where = document.createElement('span');
  const swatch = document.createElement('span');
  const numbers = document.createElement('span');

  a.href = r.url;
  title.className = 'title';
  title.textContent = r.title;
  where.className = 'sub';
  swatch.className = 'swatch';
  swatch.style.setProperty('--c', colors[r.cat]);
  where.append(swatch, [r.category, r.area].filter(Boolean).join(' · '));
  numbers.className = 'sub';
  numbers.textContent = `${r.distance} · ${r.gain} gain`;
  a.append(title, where, numbers);
  li.append(a);

  for (const event of ['mouseenter', 'focus']) a.addEventListener(event, () => highlight(r.url, r.title, r.start));
  for (const event of ['mouseleave', 'blur']) a.addEventListener(event, () => highlight(NONE));
  return li;
}

function renderList() {
  const all = matches();
  const view = loaded ? map.getBounds() : undefined;
  const visible = view ? all.filter((r) => view.contains(r.start)) : all;

  results.replaceChildren(...visible.map(listItem));
  count.textContent = view
    ? `${visible.length} of ${all.length} routes in view`
    : `${all.length} routes`;
}

function update() {
  const query = new URLSearchParams();
  if (state.q) query.set('q', state.q);
  if (state.cats.size) query.set('cat', [...state.cats].join(','));

  const qs = query.size ? `?${query}`.replaceAll('%2C', ',') : '';
  history.replaceState(null, '', `${location.pathname}${qs}`);

  try {
    sessionStorage.setItem(HOME_SEARCH_KEY, qs);
  } catch {}

  if (loaded) {
    (map.getSource('routes') as GeoJSONSource).setData(points(matches()));
    (map.getSource('lines') as GeoJSONSource).setData(lines(matches()));
  }
  renderList();
}

map.on('load', () => {
  map.addSource('routes', { type: 'geojson', data: points(matches()), cluster: true, clusterRadius: 40, clusterMaxZoom: 11 });
  map.addSource('lines', { type: 'geojson', data: lines(matches()) });

  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer({ id: 'lines-casing', type: 'line', source: 'lines', paint: { 'line-color': '#fff', 'line-width': 5 }, layout: round });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': ['get', 'color'], 'line-width': 3 }, layout: round });
  map.addLayer({ id: 'lines-hit', type: 'line', source: 'lines', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } });
  map.addLayer({ id: 'preview-casing', type: 'line', source: 'lines', filter: ['==', ['get', 'url'], NONE],
    paint: { 'line-color': '#fff', 'line-width': 9 }, layout: round });
  map.addLayer({ id: 'preview', type: 'line', source: 'lines', filter: ['==', ['get', 'url'], NONE],
    // Dashes over the white casing set the hovered route apart from same-colour neighbours.
    paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [2, 1.5] },
    layout: { 'line-join': 'round', 'line-cap': 'butt' } });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'routes', filter: ['has', 'point_count'],
    paint: { 'circle-color': '#1d2321', 'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 30, 21],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'routes', filter: ['has', 'point_count'],
    layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
    paint: { 'text-color': '#fff' } });
  map.addLayer({ id: 'pins', type: 'circle', source: 'routes', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

  loaded = true;
  renderList();
});

map.on('moveend', renderList);

// Pins and lines both name the route on hover and open it on click. Pins and
// clusters sit on top, so a line yields to them.

const onPin = (e: MapLayerMouseEvent) => map.queryRenderedFeatures(e.point, { layers: ['pins', 'clusters'] }).length > 0;

map.on('mousemove', 'pins', (e) => {
  const f = e.features![0];
  map.getCanvas().style.cursor = 'pointer';
  highlight(f.properties.url, f.properties.title, (f.geometry as GeoJSON.Point).coordinates as LonLat);
});

map.on('mousemove', 'lines-hit', (e) => {
  if (onPin(e)) return;

  const f = e.features![0];
  map.getCanvas().style.cursor = 'pointer';
  highlight(f.properties.url, f.properties.title, e.lngLat.toArray());
});

for (const layer of ['pins', 'lines-hit']) {
  map.on('mouseleave', layer, () => {
    map.getCanvas().style.cursor = '';
    highlight(NONE);
  });
}

map.on('click', 'pins', (e) => location.assign(e.features![0].properties.url));
map.on('click', 'lines-hit', (e) => onPin(e) || location.assign(e.features![0].properties.url));

map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));

map.on('click', 'clusters', async (e) => {
  const f = e.features![0];
  const zoom = await (map.getSource('routes') as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
  map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as LonLat, zoom });
});

// Controls

search.value = state.q;
search.addEventListener('input', () => {
  state.q = search.value.trim();
  update();
});

for (const chip of chips) {
  const cat = chip.dataset.cat!;
  chip.setAttribute('aria-pressed', String(state.cats.has(cat)));

  chip.addEventListener('click', () => {
    if (state.cats.has(cat)) state.cats.delete(cat);
    else state.cats.add(cat);

    chip.setAttribute('aria-pressed', String(state.cats.has(cat)));
    update();
  });
}

// Mobile bottom sheet: tap or swipe the handle, or focus search, to open.

const sheet = document.getElementById('sheet')!;
const handle = document.getElementById('handle')!;
const Sheet = { Open: 'open', Closed: 'closed' } as const;
type Sheet = (typeof Sheet)[keyof typeof Sheet];
let dragFrom: number | undefined;

const setSheet = (state: Sheet) => {
  sheet.dataset.state = state;
  handle.setAttribute('aria-expanded', String(state === Sheet.Open));
};
const toggleSheet = () => setSheet(sheet.dataset.state === Sheet.Open ? Sheet.Closed : Sheet.Open);

handle.addEventListener('pointerdown', (e) => (dragFrom = e.clientY));
handle.addEventListener('pointerup', (e) => {
  const dy = e.clientY - (dragFrom ?? e.clientY);
  dragFrom = undefined;
  if (Math.abs(dy) < SWIPE) return toggleSheet();
  setSheet(dy < 0 ? Sheet.Open : Sheet.Closed);
});
handle.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  toggleSheet();
});
search.addEventListener('focus', () => setSheet(Sheet.Open));

update();
