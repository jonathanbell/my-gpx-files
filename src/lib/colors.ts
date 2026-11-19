// Okabe-Ito, colour-blind safe, for routes.
const PALETTE = ['#0072B2', '#009E73', '#E69F00', '#56B4E9', '#CC79A7', '#D55E00', '#7F7F7F'];

// Hazard overlays, in area order. Kept clear of the route palette.
const OVERLAY_COLORS = ['#E41A1C', '#7B2CBF', '#A65628', '#333333'];
export const overlayColor = (i: number) => OVERLAY_COLORS[i % OVERLAY_COLORS.length];

const FIXED: Record<string, string> = {
  'alpine-climbing': PALETTE[0],
  'hiking-and-fastpacking': PALETTE[1],
  'rock-climbing': PALETTE[2],
  'ski-mountaineering': PALETTE[3],
  'trail-running': PALETTE[4],
};

// Known categories keep their colour; new ones take the next unused one.
export function categoryColors(slugs: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  const free = PALETTE.filter((c) => !Object.values(FIXED).includes(c));

  for (const slug of [...slugs].sort()) {
    colors[slug] = FIXED[slug] ?? free.shift() ?? PALETTE.at(-1)!;
  }

  return colors;
}
