# PRD: GPX route viewer

Turn this repo from GPX storage into a static website that displays every
route on a map, with elevation profiles, search, shareable URLs and downloads.
Think Strava route pages or gpx.studio, read-only, for one person's routes.

Live URL: `https://jonathanbell.github.io/my-gpx-files/` (base path
`/my-gpx-files/`).

## Goals

- Browse all routes on one map, filtered by category and fuzzy search.
- Every route has a unique, shareable URL with a good link preview.
- Every route page shows the track, stats, an elevation profile and a download
  button for the original GPX.
- Adding a route stays as simple as dropping a `.gpx` into a folder and
  pushing (CLI or GitHub web upload).

## Non-goals

- No server, database, accounts, or in-browser upload or editing.
- No imperial units. Metric only, everywhere.
- No estimated time, difficulty rating, pace or moving time.
- No privacy zones. The raw GPX files are public in the repo anyway.
- No visual distinction between planned routes (`<rte>`) and recorded
  tracks (`<trk>`).
- No analytics, cookies or cookie banner.
- No 3D terrain (MapLibre makes this a later one-liner if wanted).

## Current state

- 83 GPX files in `gpx/`, about 25 MB.
- `scripts/fill-elevation.mjs` (+ test) fills missing or zero `<ele>` values
  from the Copernicus GLO-30 DEM. All current files are already filled.
- `package.json` exists (`"type": "module"`, `geotiff` pinned). Extend it,
  do not replace it.
- Some filenames contain non-ASCII characters, e.g. `Dän Zhùr (Donjek)`,
  `Múlagljúfur`.

## Content conventions

The filesystem is the database. The build derives everything from paths.

```
gpx/
  <Category>/                      top-level folder = category
    <Title>.gpx                    route
    <Title>.md                     optional notes for that route
    <Area>/                        optional subfolder = area tag
      <Title>.gpx
      <Title> [overlay].gpx        hazard polygon, not a route
```

| Concept | Source | Example |
|---|---|---|
| Category | top-level folder name, verbatim | `Alpine Climbing` |
| Area | subfolder name, verbatim (optional) | `Mount Logan` |
| Title | filename without `.gpx`, verbatim | `Golden Hinde (v2)` |
| Overlay | filename ends with ` [overlay]` | `Crevasse areas [overlay].gpx` |
| Region, country | reverse geocode of start point | `British Columbia`, `Canada` |
| Notes | sibling `.md` with the same basename | `Mount Daniel.md` |

Rules:

- Only one level of subfolder is supported. Deeper nesting fails the build.
- Ignore non-GPX files (`.DS_Store`, etc.) except `.md` sidecars.
- The GPX `<name>` element is ignored for titles. Filename wins.

### Notes sidecar

Optional. Frontmatter fields are all optional. Add this template to the
README:

```markdown
---
date: 2014-07-19
partners: [Joel, Eric]
---

Free-form Markdown: trip report, beta, conditions, links.
```

Render `date` and `partners` under the title, and the body below the stats.
Notes text is included in search.

### Overlays

- Drawn as translucent filled polygons (close the ring if the GPX does not)
  on every route page in the same area folder. Each overlay file gets its
  own colour and a map label with its title; the Overlays list shows the
  same colour.
- Excluded from the home map, list, search, stats and "More in this area".
- Not given their own page. Still downloadable from the route pages that show
  them (small "Overlays" list with download links).

## URLs

Path-based slugs, one pre-rendered HTML page per route:

```
/my-gpx-files/                                         home
/my-gpx-files/routes/                                  text index of all routes
/my-gpx-files/<category>/<slug>/                       route without area
/my-gpx-files/<category>/<area>/<slug>/                route with area
/my-gpx-files/<category>/<area>/<slug>/route.gpx       original file
/my-gpx-files/<category>/<area>/<slug>/og.png          link preview image
```

- Slugify: Unicode NFKD, strip diacritics, lowercase, non-alphanumerics to
  `-`, collapse and trim dashes. `Dän Zhùr (Donjek)` -> `dan-zhur-donjek`,
  `Golden Hinde (v2)` -> `golden-hinde-v2`.
- Two files producing the same URL fails the build with both paths listed.
  `routes` is reserved: a category slugging to it also fails the build.
- Renaming or moving a file changes its URL. Old links break. Accepted.
- Home filter state lives in the query string and is shareable:
  `/?q=rainier&cat=alpine-climbing,ski-mountaineering`.
- Provide a 404 page linking home.

## Data pipeline

```
 gpx/**/*.gpx (+ .md)
        |
        v
 [fill-elevation]  missing/zero <ele> -> Copernicus GLO-30   (writes gpx/)
 [geocode]         start point -> region, country            (writes data/geocode.json)
        |
        v
 [Astro build]
   parse GPX ---------> full-res stats (distance, gain, loss, max, min)
        |
        +-- simplify --> per-route geometry + profile JSON
        +-- preview  --> home index (start point, ~100-pt line, stats, search text)
        +-- satori ----> og.png per route
        +-- copy ------> route.gpx (original bytes, untouched)
        |
        v
 dist/ -> GitHub Pages
```

### Parsing

- Use `@tmcw/togeojson`. Support `<trk>` (multiple `<trkseg>`), `<rte>` and
  `<wpt>` in the same file.
- Multiple tracks or segments: draw all of them; stats and profile treat them
  as one line in file order, with no distance added between segments.
- Ignore timestamps.

### Stats

Computed at build time from full-resolution points, before simplification.

- Distance: haversine sum, shown in km with 1 decimal.
- Gain and loss: hysteresis threshold of 5 m. Only count a climb or descent
  once elevation has moved at least 5 m from the last counted value. This
  stops GPS jitter inflating gain. Shown in whole metres.
- Max and min elevation, whole metres.
- Format numbers with thousands separators: `1,380 m`.

### Simplification

- Route page geometry: Douglas-Peucker (`@turf/simplify`) tuned to about
  1,000 to 2,000 points per route.
- Home page preview line: about 100 points per route.
- Elevation profile: downsample to at most ~1,000 points.

### Elevation fill

`scripts/fill-elevation.mjs` already exists and is tested. It fills missing or
zero `<ele>` values from Copernicus GLO-30 tiles on AWS (no key) and never
touches recorded elevation. Running it twice is a no-op. Keep it as is. The
build must fail if any route point still lacks elevation after CI runs it.

### Geocoding

New script `scripts/geocode.mjs`, run as `npm run geocode`.

- Reverse geocode each route's start point with Nominatim
  (`https://nominatim.openstreetmap.org/reverse`, `zoom=5`, `format=jsonv2`).
- Respect the usage policy: at most 1 request per second and a `User-Agent`
  identifying the app (e.g. `my-gpx-files-build`).
- Region = `address.state` (fall back to `province`, `region`, `county`).
  Country = `address.country`.
- Cache in `data/geocode.json`, keyed by the route's repo-relative GPX path,
  storing the coordinate used plus the result. Only look up entries that are
  missing or whose start coordinate changed. Remove entries whose file no
  longer exists.
- The build reads only the cache, never the network. A missing entry renders
  without region rather than failing.

## Pages

### Home

- Full-screen map with a sidebar (desktop) or swipe-up bottom sheet (mobile).
- **Map**: every route's preview line is always drawn, coloured by category,
  plus one pin per route at its start point, clustered when zoomed out.
  Hovering a line, pin or list item highlights the route and shows its name.
  Clicking a line or pin opens the route page. Initial view fits all routes.
- **Sidebar**:
  - Search box. Fuzzy (Fuse.js) over title, category, area, region, country,
    waypoint names and notes text. `rainer` finds Rainier, `burman` finds
    Golden Hinde via its waypoint.
  - Category chips, multi-select toggles. None selected = all.
  - Result list sorted by title. Each item: title, category · area, distance,
    gain.
  - The list shows only routes inside the current map viewport. Search and
    chips filter both list and pins.
- Category colours: a fixed, colour-blind-safe palette keyed by category
  slug. New categories get the next colour. Category is also shown as text,
  never colour alone.

### Route page

- Header: title, then `Category · Area · Region, Country`; then notes `date`
  and `partners` if present.
- Stats row: distance, gain, loss, max, min.
- Map fitted to the route bounds, with:
  - the route line coloured by category,
  - start and end markers (single marker if they are within 50 m),
  - waypoint pins with name popups,
  - area overlays.
- Elevation profile (uPlot) below the map: elevation against distance, with
  waypoints marked. Hovering the chart moves a dot along the route on the map.
  Hovering the line on the map moves the chart cursor.
- Buttons: "Download GPX" (original bytes, `download` attribute set to the
  original filename, e.g. `Golden Hinde (v2).gpx`) and "Copy link".
- Notes body (rendered Markdown), if present.
- "More in this area": sibling routes in the same area folder, excluding
  overlays. Hidden when there is no area or no siblings.
- Back link to home that keeps the previous filter state.

### Route index

A plain-text list of every route at `/routes/`. Static HTML, no map and no
client JavaScript.

- Grouped by category (`<h2>`), then by area (`<h3>`, routes without an area
  listed first), sorted by title within each group.
- Each row: linked title, region and country, distance, gain.
- Total route count at the top.
- Overlays excluded.
- Linked from the home sidebar footer and from every route page.

### Link previews

Each route page has:

- `og:title` = title
- `og:description` = `12.4 km · 1,380 m gain · Alpine Climbing`
- `og:image` = absolute URL to `og.png`, plus `twitter:card` =
  `summary_large_image`
- `og.png`: 1200x630, generated at build time with satori + resvg. Plain
  background, the route line (category colour, fitted with padding) in the
  top two thirds, the elevation profile as a filled area along the bottom,
  title and stats text. No map tiles.

## Map

- MapLibre GL JS.
- Base layers, toggleable from a small control:
  - OpenTopoMap raster (default): `https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png`
  - Outdoor: OpenFreeMap Liberty vector style
    (`https://tiles.openfreemap.org/styles/liberty`, OSM trails) plus
    hillshade and contour lines (`maplibre-contour`) built in the browser
    from Terrarium DEM tiles
    (`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`).
    The contour code loads only when this layer is picked.
  - Esri World Imagery raster:
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Switching layers keeps the page's own sources and layers.
- Show the attribution each provider requires. Remember the chosen layer per
  visitor in `localStorage`, wrapped in try/catch.
- No API keys anywhere.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Astro (static output) + TypeScript, `base: '/my-gpx-files'` |
| Map | MapLibre GL JS |
| GPX parsing | `@tmcw/togeojson` + `@xmldom/xmldom` at build time |
| Simplification | `@turf/simplify` |
| Search | Fuse.js, client side |
| Elevation chart | uPlot |
| Preview images | satori + `@resvg/resvg-js` |
| Markdown notes | Astro's built-in Markdown support |
| Styling | Plain CSS, no framework |
| Tests | `node --test` (already used by `scripts/`) |
| Node | 24 LTS in CI |

Pin exact dependency versions. Ship client JavaScript only on interactive
islands (map, chart, search).

## CI / deploy

One workflow, `.github/workflows/deploy.yml`, on push to `main` and manual
dispatch.

```
checkout -> npm ci
  -> npm run fill-elevation
  -> npm run geocode
  -> if git diff: commit as github-actions[bot] and push to main
       message: "chore: fill elevation and geocode"
  -> npm test
  -> npm run build
  -> upload-pages-artifact -> deploy-pages
```

- Permissions: `contents: write`, `pages: write`, `id-token: write`.
- `concurrency: { group: pages, cancel-in-progress: false }`.
- Pushes made with the built-in `GITHUB_TOKEN` do not trigger another run, so
  there is no loop. The same run deploys the updated files.
- One-time manual setup: repo Settings > Pages > Source = "GitHub Actions".

The build fails on: unparseable GPX, a route with zero points, a route point
without elevation, duplicate URLs, or folder nesting deeper than one level.
Error messages name the offending file.

## Quality

- **Performance**: home page JS + index data under 500 KB gzipped, excluding
  map tiles. Route pages load only their own geometry and profile.
- **Accessibility**: chips are buttons with `aria-pressed`; list and search
  fully keyboard operable; visible focus styles; stats exist as text, so the
  chart is not the only source of elevation data; text contrast meets WCAG AA.
- **Responsive**: works from 360 px wide. No horizontal page scroll.
- **Branding**: site title is `my-gpx-files` (header, `<title>`, og cards).
- **Theme**: light and dark, following the OS by default. A toggle overrides
  it, remembered in `localStorage` (try/catch). Map tiles are unchanged.

## Tests

Basic unit tests with `node --test` (Node 24 strips TypeScript types, so
`*.test.ts` runs as-is). No test framework, no extra test dependencies.

Rules:

- Test files sit next to the code they test: `foo.ts` -> `foo.test.ts`.
- Keep pure logic (parsing, stats, slugs, cache decisions) apart from I/O so
  it can be tested by calling it with plain inputs. Few mocks, ideally none.
- Inputs are small inline GPX strings, or real files from `gpx/` when a real
  shape matters (e.g. multi-segment `Howe Sound Crest Trail.gpx`, the
  `<rte>`-only `Golden Hinde (v2).gpx`, the Mount Logan overlays).
- Never hit the network. Geocoding and DEM code split "decide what to fetch"
  (pure, tested) from "fetch it" (thin, untested).
- One behaviour per test, named in plain English. Assert on values, not on
  how they were computed.

Cover:

- slugify (diacritics, parentheses, collisions)
- path -> category, area, title, overlay
- stats: distance, and gain with the 5 m hysteresis (a jittery flat line
  gives ~0 gain)
- multi-segment and `<rte>` handling
- geocode cache: hit, miss, moved start point, stale entry removed
- build validation: each failure listed under CI / deploy throws an error
  naming the file
- existing `scripts/fill-elevation.test.mjs` keeps passing

`npm test` runs every test file and must pass before the build step in CI.

Plus a build smoke test in CI: the build must emit a page, `route.gpx` and
`og.png` for every non-overlay GPX.

## Documentation

Rewrite `README.md`:

- What the site is, with the live link.
- How to add a route (folder rules, overlay suffix, notes template above).
- What CI does to your files (elevation fill, geocode cache, bot commit), and
  to `git pull` after pushing.
- Local dev: `npm ci`, `npm run dev`, `npm test`.

Once the scaffold builds and tests run, add a `CLAUDE.md` covering the real
commands and layout, plus these rules: `gpx/` is the source of truth; never
modify recorded elevation; ` [overlay]` marks hazard polygons; CI commits
back to `main`, so pull after pushing.

## Acceptance criteria

1. Pushing a new GPX with no elevation to `main` via the GitHub web UI
   results in a bot commit adding elevation and a geocode entry, and the
   route is live at its slug URL within one workflow run.
2. Pasting a route URL into iMessage or Slack shows a card with the title,
   stats and the generated preview image.
3. On the home page, typing `rainer` lists Mount Rainier; toggling
   "Alpine Climbing" hides all other categories' pins and lines; reloading the URL
   restores both.
4. On a route page, hovering the elevation chart moves a dot on the map.
5. The Mount Logan route page shows the crevasse and avalanche overlays. The
   overlays do not appear anywhere on the home page.
6. "Download GPX" returns bytes identical to the file in `gpx/`.
7. `Dän Zhùr (Donjek)/Donjek (Strava).gpx` is reachable at
   `/hiking-and-fastpacking/dan-zhur-donjek/donjek-strava/`.
8. All tests pass and the site builds with no network access to Nominatim.
9. `/routes/` lists every non-overlay route grouped by category and area,
   each linking to its page, and works with JavaScript disabled.
