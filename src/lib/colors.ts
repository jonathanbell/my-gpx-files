// Okabe-Ito, colour-blind safe. Red is kept for hazard overlays.
const PALETTE = ['#0072B2', '#009E73', '#E69F00', '#56B4E9', '#CC79A7', '#D55E00', '#7F7F7F'];
export const OVERLAY_COLOR = '#E41A1C';

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
