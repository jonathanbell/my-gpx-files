# AGENTS.md

Static Astro site that shows every GPX file in `gpx/` on a map. Deployed to
<https://jonathanbell.github.io/my-gpx-files/>.

## Commands

```sh
npm run dev              # local site at /my-gpx-files/
npm test                 # node --test, scripts/*.test.mjs and src/**/*.test.ts
npm run build            # astro build -> dist/
npm run smoke            # checks dist/ after a build (pages, og.png, gpx bytes, size budget)
npm run fill-elevation   # fills missing <ele> from Copernicus GLO-30, edits gpx/
npm run fill-elevation -- --replace <file>   # overwrite noisy GPS altitude
npm run geocode          # updates data/geocode.json from Nominatim
```

## Layout

```
gpx/                 source of truth: <Category>/[<Area>/]<Title>.gpx (+ .md notes)
data/geocode.json    region/country cache keyed by repo path, written by CI
scripts/             fill-elevation, geocode, smoke (Node, import src/lib/*.ts)
src/lib/             pure build logic: paths, gpx, stats, simplify, geocode,
                     colors, format, og
src/lib/site.ts      assembles pages' data (only module that imports astro:content)
src/pages/           home, /routes/, [...path]/ route page, route.gpx, og.png, 404
src/layouts/         Base.astro: header, theme toggle, footer
src/components/      Credit.astro (footer line, also in the home sidebar)
src/scripts/         client code: map.ts (shared map + base layer switch),
                     terrain.ts (lazy Outdoor hillshade/contours), home.ts,
                     route.ts (map, chart, full screen), keys.ts
```

## Map

- Base layers: Topo (OpenTopoMap raster), Outdoor (OpenFreeMap Liberty
  vector + hillshade and contours from Terrarium DEM via `maplibre-contour`),
  Satellite (Esri World Imagery). Glyphs from OpenFreeMap.
- Switching layers uses `setStyle` with `transformStyle`: base layers are
  tagged with `metadata.base`, everything else is the page's and is kept.
- Home draws every route line plus clustered start pins. Route pages draw
  overlays in per-file colours with labels.
- The elevation chart (uPlot) is linked both ways with the map, snaps its
  crosshair to the profile, and follows touch drags.

## Rules

- `gpx/` is the source of truth. Everything is derived from paths.
- CI only fills missing or zero elevation. Recorded elevation is replaced
  with DEM values only by hand, with `--replace`, when the GPS altitude is
  too noisy to trust.
- ` [overlay]` at the end of a filename marks a hazard polygon, not a route.
- CI commits back to `main`, so `git pull` after pushing.
- Node runs `src/lib/*.ts` directly via type stripping: use `.ts` import
  extensions and erasable syntax only (`as const` objects, not `enum`).
- Keep pure logic in `src/lib/` testable without mocks or network.
- Metric only. No time estimates or difficulty ratings.
- No API keys anywhere. Every tile and data source must be free and keyless.
- Home page HTML + JS stays under 500 KB gzipped (`npm run smoke` checks).
- Corners use the `--radius` token (2px); the look is utilitarian.
- Colours are tokens on `:root` with light and dark sets; theme follows the
  system unless overridden in `localStorage`.
- Personal repo: commit and push straight to `main`, no PRs.
