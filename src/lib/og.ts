// 1200x630 link preview: route line top right, title and stats left, filled
// elevation profile along the bottom. No map tiles.

import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { downsample, profile } from './stats.ts';
import { dot, km, m } from './format.ts';
import { simplifyTo } from './simplify.ts';
import type { Route } from './site.ts';

const W = 1200;
const H = 630;
const PAD = 60;
const LINE_BOX = { x: 640, y: PAD, w: W - 640 - PAD, h: 330 };
const PROFILE_H = 150;
const BG = '#f7f5f0';
const INK = '#1d2321';
const MUTED = '#5b6461';
const FONT_DIR = 'node_modules/@fontsource/inter/files';

let fonts: Promise<Parameters<typeof satori>[1]['fonts']> | undefined;

const loadFonts = () =>
  (fonts ??= Promise.all(
    ['latin', 'latin-ext'].flatMap((subset) =>
      ([400, 700] as const).map(async (weight) => ({
        name: 'Inter',
        weight,
        style: 'normal' as const,
        data: await readFile(`${FONT_DIR}/inter-${subset}-${weight}-normal.woff`),
      })),
    ),
  ));

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Equirectangular projection scaled by cos(lat), fitted into LINE_BOX.
function routeSvg(route: Route): string {
  const lines = simplifyTo(route.gpx.lines, 1500);
  const pts = lines.flat();
  const k = Math.cos((pts[0][1] * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(LINE_BOX.w / (x1 - x0 || 1), LINE_BOX.h / (y1 - y0 || 1));
  const ox = (LINE_BOX.w - (x1 - x0) * scale) / 2;
  const oy = (LINE_BOX.h - (y1 - y0) * scale) / 2;

  const d = lines
    .map((l) => l.map(([lon, lat], i) =>
      `${i ? 'L' : 'M'}${(ox + (lon * k - x0) * scale).toFixed(1)} ${(oy + (-lat - y0) * scale).toFixed(1)}`).join(''))
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LINE_BOX.w}" height="${LINE_BOX.h}">
    <path d="${d}" fill="none" stroke="${route.color}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function profileSvg(route: Route): string {
  const pts = downsample(profile(route.gpx.lines), 600);
  const dist = pts.at(-1)![0] || 1;
  const { min, max } = route.stats;
  const range = max - min || 1;
  const y = (e: number) => (PROFILE_H - ((e - min) / range) * (PROFILE_H - 20)).toFixed(1);
  const d = pts.map(([dd, e]) => `L${((dd / dist) * W).toFixed(1)} ${y(e)}`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PROFILE_H}">
    <path d="M0 ${PROFILE_H}${d}L${W} ${PROFILE_H}Z" fill="${route.color}" fill-opacity="0.35" stroke="${route.color}" stroke-width="3"/>
  </svg>`;
}

const el = (type: string, style: object, children?: unknown, props: object = {}) => ({
  type,
  props: { style, children, ...props },
});

export async function ogImage(route: Route): Promise<Buffer> {
  const { stats } = route;
  const place = dot([route.place?.region, route.place?.country]);
  const text = el('div', { position: 'absolute', left: PAD, top: PAD, width: 540, display: 'flex', flexDirection: 'column' }, [
    el('div', { fontSize: 24, color: MUTED }, 'my-gpx-files'),
    el('div', { fontSize: 56, fontWeight: 700, color: INK, lineHeight: 1.1, marginTop: 16 }, route.title),
    el('div', { fontSize: 26, color: MUTED, marginTop: 16 }, dot([route.category, route.area])),
    place ? el('div', { fontSize: 26, color: MUTED, marginTop: 4 }, place) : null,
    el('div', { fontSize: 32, color: INK, marginTop: 28, fontWeight: 700 },
      `${km(stats.distance)}  ·  ${m(stats.gain)} gain  ·  ${m(stats.max)} max`),
  ].filter(Boolean));

  const root = el('div', { width: W, height: H, display: 'flex', position: 'relative', background: BG, fontFamily: 'Inter' }, [
    el('img', { position: 'absolute', left: LINE_BOX.x, top: LINE_BOX.y }, undefined,
      { src: svgUri(routeSvg(route)), width: LINE_BOX.w, height: LINE_BOX.h }),
    el('img', { position: 'absolute', left: 0, bottom: 0 }, undefined,
      { src: svgUri(profileSvg(route)), width: W, height: PROFILE_H }),
    text,
  ]);

  const svg = await satori(root as never, { width: W, height: H, fonts: await loadFonts() });
  return new Resvg(svg).render().asPng();
}
