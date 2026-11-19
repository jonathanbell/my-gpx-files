// Route page: track, markers, waypoints and overlays on the map, linked to
// the elevation chart. Hovering either one moves a dot on the other.

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { LngLatBounds, Popup, type GeoJSONSource, type LngLat } from 'maplibre-gl';
import { createMap } from './map.ts';
import { HOME_SEARCH_KEY } from './keys.ts';

type LonLat = [number, number];

interface Data {
  color: string;
  lines: LonLat[][];
  profile: [number, number, number, number][]; // distance m, ele, lon, lat
  start: LonLat;
  end: LonLat | null;
  waypoints: { name: string; coord: LonLat; at: number | null }[];
  overlays: { title: string; color: string; rings: LonLat[][] }[];
}

const KM = 1000;
const CHART_HEIGHT = 240;
const PADDING = 40;
const START_COLOR = '#1a9850';
const END_COLOR = '#1d2321';

const data = JSON.parse(document.getElementById('data')!.textContent!) as Data;
const xs = data.profile.map((p) => p[0] / KM);
const ys = data.profile.map((p) => p[1]);

// Back link keeps the home filters; copy link needs the clipboard API.

try {
  const back = document.getElementById('back') as HTMLAnchorElement;
  back.href += sessionStorage.getItem(HOME_SEARCH_KEY) ?? '';
} catch {}

const copy = document.getElementById('copy') as HTMLButtonElement;
copy.hidden = !navigator.clipboard;
copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  copy.textContent = 'Copied';
  setTimeout(() => (copy.textContent = 'Copy link'), 2000);
});

// Map

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const feature = (geometry: GeoJSON.Geometry, properties = {}): GeoJSON.Feature => ({ type: 'Feature', properties, geometry });
const closeRing = (ring: LonLat[]) => (ring.at(-1)!.join() === ring[0].join() ? ring : [...ring, ring[0]]);

const all = data.lines.flat();
const bounds = all.reduce((b, c) => b.extend(c), new LngLatBounds(all[0], all[0]));
const map = createMap(document.getElementById('map')!, { bounds, fitBoundsOptions: { padding: PADDING } });
const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 });

const markers = [
  feature({ type: 'Point', coordinates: data.start }, { name: data.end ? 'Start' : 'Start and end', color: START_COLOR }),
  ...(data.end ? [feature({ type: 'Point', coordinates: data.end }, { name: 'End', color: END_COLOR })] : []),
  ...data.waypoints.map((w) => feature({ type: 'Point', coordinates: w.coord }, { name: w.name, color: '#fff' })),
];

function showDot(i: number | null) {
  const source = map.getSource('cursor') as GeoJSONSource | undefined;
  if (!source) return;

  const p = i === null ? undefined : data.profile[i];
  source.setData(collection(p ? [feature({ type: 'Point', coordinates: [p[2], p[3]] })] : []));
}

// Nearest profile point to the mouse, with longitude scaled by latitude.
function nearest({ lng, lat }: LngLat): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let bestD = Infinity;

  data.profile.forEach((p, i) => {
    const d = ((p[2] - lng) * k) ** 2 + (p[3] - lat) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });

  return best;
}

map.on('load', () => {
  map.addSource('overlays', {
    type: 'geojson',
    data: collection(data.overlays.flatMap((o) =>
      o.rings.map((ring) => feature({ type: 'Polygon', coordinates: [closeRing(ring)] }, { title: o.title, color: o.color })))),
  });
  map.addSource('route', { type: 'geojson', data: feature({ type: 'MultiLineString', coordinates: data.lines }) });
  map.addSource('markers', { type: 'geojson', data: collection(markers) });
  map.addSource('cursor', { type: 'geojson', data: collection([]) });

  map.addLayer({ id: 'overlay-fill', type: 'fill', source: 'overlays', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
  map.addLayer({ id: 'overlay-line', type: 'line', source: 'overlays', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#fff', 'line-width': 7 },
    layout: { 'line-join': 'round', 'line-cap': 'round' } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': data.color, 'line-width': 4 },
    layout: { 'line-join': 'round', 'line-cap': 'round' } });
  map.addLayer({ id: 'route-hit', type: 'line', source: 'route', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 } });
  map.addLayer({ id: 'markers', type: 'circle', source: 'markers',
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': 7, 'circle-stroke-color': '#1d2321', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'overlay-label', type: 'symbol', source: 'overlays',
    layout: { 'text-field': ['get', 'title'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
  map.addLayer({ id: 'cursor', type: 'circle', source: 'cursor',
    paint: { 'circle-color': data.color, 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
});

map.on('mouseenter', 'markers', (e) => {
  const f = e.features![0];
  popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as LonLat).setText(f.properties.name).addTo(map);
});
map.on('mouseleave', 'markers', () => popup.remove());
map.on('click', 'markers', (e) => {
  const f = e.features![0];
  popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as LonLat).setText(f.properties.name).addTo(map);
});

map.on('mousemove', 'route-hit', (e) => {
  const i = nearest(e.lngLat);
  chart?.setCursor({ left: chart.valToPos(xs[i], 'x'), top: chart.valToPos(ys[i], 'y') });
});
map.on('mouseleave', 'route-hit', () => {
  chart?.setCursor({ left: -10, top: -10 });
  showDot(null);
});

// Elevation chart

const profileEl = document.getElementById('profile')!;
let chart: uPlot | undefined;
let moveBadges: ((u: uPlot) => void) | undefined;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const kmLabel = (v: number) => `${v.toLocaleString('en', { maximumFractionDigits: 1 })} km`;
const mLabel = (v: number) => `${Math.round(v).toLocaleString('en')} m`;

function drawWaypoints(u: uPlot) {
  const ctx = u.ctx;
  const dpr = devicePixelRatio;

  ctx.save();
  ctx.strokeStyle = cssVar('--muted');
  ctx.fillStyle = cssVar('--ink');
  ctx.font = `${12 * dpr}px system-ui, sans-serif`;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.textAlign = 'left'; // uPlot leaves it set to "right"

  // Labels go in the first row where they do not overlap the previous label.
  const rowEnds: number[] = [];
  const onTrack = data.waypoints.filter((w) => w.at !== null).sort((a, b) => a.at! - b.at!);

  for (const w of onTrack) {
    const x = u.valToPos(w.at! / KM, 'x', true);
    const width = ctx.measureText(w.name).width + 8 * dpr;
    let row = rowEnds.findIndex((end) => end < x);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = x + width;

    ctx.beginPath();
    ctx.moveTo(x, u.bbox.top);
    ctx.lineTo(x, u.bbox.top + u.bbox.height);
    ctx.stroke();
    ctx.fillText(w.name, x + 4 * dpr, u.bbox.top + (14 + row * 14) * dpr);
  }

  ctx.restore();
}

// Crosshair follows the profile, not the mouse's height.
function snap(u: uPlot, left: number, top: number): [number, number] {
  if (left < 0) return [left, top];

  const i = u.posToIdx(left);
  return [u.valToPos(xs[i], 'x'), u.valToPos(ys[i], 'y')];
}

// Badges on the axes with the distance and elevation under the crosshair.
function badges(u: uPlot) {
  const x = document.createElement('div');
  const y = document.createElement('div');
  x.className = 'axis-badge x';
  y.className = 'axis-badge y';
  x.hidden = y.hidden = true;
  u.over.parentElement!.append(x, y);

  return (u: uPlot) => {
    const { idx, left = -1, top = -1 } = u.cursor;
    x.hidden = y.hidden = idx == null || left < 0;
    if (x.hidden) return;

    const { offsetLeft, offsetTop, offsetHeight } = u.over;
    x.textContent = kmLabel(xs[idx!]);
    x.style.left = `${offsetLeft + left}px`;
    x.style.top = `${offsetTop + offsetHeight}px`;
    y.textContent = mLabel(ys[idx!]);
    y.style.left = `${offsetLeft}px`;
    y.style.top = `${offsetTop + top}px`;
  };
}

function drawChart() {
  chart?.destroy();

  const ink = cssVar('--muted');
  const grid = { stroke: cssVar('--line'), width: 1 };

  chart = new uPlot(
    {
      width: profileEl.clientWidth,
      height: CHART_HEIGHT,
      scales: { x: { time: false } },
      cursor: { drag: { x: false, y: false }, points: { size: 10 }, move: snap },
      series: [
        { label: 'Distance', value: (_, v) => (v == null ? '-' : kmLabel(v)) },
        { label: 'Elevation', stroke: data.color, fill: `${data.color}40`, width: 2, points: { show: false },
          value: (_, v) => (v == null ? '-' : mLabel(v)) },
      ],
      axes: [
        { stroke: ink, grid, ticks: grid, values: (_, vals) => vals.map(kmLabel) },
        { stroke: ink, grid, ticks: grid, size: 64, values: (_, vals) => vals.map(mLabel) },
      ],
      hooks: {
        setCursor: [(u) => showDot(u.cursor.idx ?? null), (u) => moveBadges?.(u)],
        ready: [(u) => (moveBadges = badges(u))],
        draw: [drawWaypoints],
      },
    },
    [xs, ys],
    profileEl,
  );
}

drawChart();
new ResizeObserver(() => chart?.setSize({ width: profileEl.clientWidth, height: CHART_HEIGHT })).observe(profileEl);
window.addEventListener('themechange', drawChart);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawChart);
