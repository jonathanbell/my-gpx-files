// Maps a GPX file path to its category, area, title and URL. The filesystem is
// the database: gpx/<Category>/[<Area>/]<Title>[ [overlay]].gpx

export const OVERLAY_SUFFIX = ' [overlay]';
export const RESERVED_SLUGS = ['routes'];

const GPX_EXT = '.gpx';
const MAX_DEPTH = 3; // category / area / file

export interface RoutePath {
  file: string; // relative to gpx/, e.g. "Alpine Climbing/Mount Logan/Kings Trench.gpx"
  category: string;
  categorySlug: string;
  area?: string;
  areaSlug?: string;
  title: string;
  name: string; // original filename, used for downloads
  isOverlay: boolean;
  url: string; // e.g. "alpine-climbing/mount-logan/kings-trench"
}

// "Dän Zhùr (Donjek)" -> "dan-zhur-donjek"
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parsePath(file: string): RoutePath {
  const parts = file.normalize('NFC').split('/');

  if (parts.length < 2) throw new Error(`${file}: must be inside a category folder`);
  if (parts.length > MAX_DEPTH) {
    throw new Error(`${file}: nested too deep, only one subfolder level is allowed`);
  }

  const name = parts.at(-1)!;
  const base = name.slice(0, -GPX_EXT.length);
  const isOverlay = base.endsWith(OVERLAY_SUFFIX);
  const title = isOverlay ? base.slice(0, -OVERLAY_SUFFIX.length) : base;
  const category = parts[0];
  const area = parts.length === MAX_DEPTH ? parts[1] : undefined;
  const areaSlug = area === undefined ? undefined : slugify(area);
  const segments = [slugify(category), areaSlug, slugify(base)].filter((s) => s !== undefined);

  if (segments.some((s) => s === '')) throw new Error(`${file}: a name slugs to nothing`);

  return {
    file: parts.join('/'),
    category,
    categorySlug: segments[0],
    area,
    areaSlug,
    title,
    name,
    isOverlay,
    url: segments.join('/'),
  };
}

// Throws on reserved category slugs and on two files sharing one URL.
export function checkUrls(paths: RoutePath[]): void {
  for (const p of paths) {
    if (RESERVED_SLUGS.includes(p.categorySlug)) {
      throw new Error(`${p.file}: category slug "${p.categorySlug}" is reserved`);
    }
  }

  const seen = new Map<string, string>();
  for (const p of paths) {
    const other = seen.get(p.url);
    if (other) throw new Error(`Duplicate URL /${p.url}/: ${other} and ${p.file}`);
    seen.set(p.url, p.file);
  }
}
