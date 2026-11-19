# my-gpx-files

My GPX tracks and routes (alpine climbing, hiking, skiing, running) on a map,
with elevation profiles, search and shareable links. Topo, Outdoor (trails,
hillshade, contours) and Satellite base maps; a full screen map plus chart
view on every route page.

Live: <https://jonathanbell.github.io/my-gpx-files/>

## Adding a route

Drop a `.gpx` into `gpx/` and push (CLI or GitHub web upload). The folder and
filename decide everything:

```
gpx/
  <Category>/                      top-level folder = category
    <Title>.gpx                    route
    <Title>.md                     optional notes for that route
    <Area>/                        optional subfolder = area
      <Title>.gpx
      <Title> [overlay].gpx        hazard polygon, not a route
```

- The title is the filename. The GPX `<name>` is ignored.
- Only one level of subfolder. Deeper nesting fails the build.
- The URL comes from the path, e.g.
  `Hiking and Fastpacking/Dän Zhùr (Donjek)/Donjek (Strava).gpx` ->
  `/hiking-and-fastpacking/dan-zhur-donjek/donjek-strava/`. Renaming or moving
  a file changes its URL.
- Files ending in ` [overlay].gpx` are drawn as labelled, coloured polygons
  on every route page in the same area folder. They get no page of their own.

### Notes

Optional. Put a Markdown file next to the GPX file with the same name (sidecar file). All fields are optional:

```markdown
---
date: 2014-07-19
partners: [Joel, Eric]
---

Free-form Markdown: trip report, beta, conditions, links.
```

`date` and `partners` show under the title, the body below the stats, and the
text is searchable.

## What CI does to your files

Every push to `main` runs `.github/workflows/deploy.yml`:

1. `npm run fill-elevation` fills missing or zero `<ele>` values from the
   Copernicus GLO-30 DEM. Recorded elevation is left alone. If a recording's
   GPS altitude is junk, `npm run fill-elevation -- --replace <file>`
   overwrites it with DEM values.
2. `npm run geocode` looks up the region and country of new or moved routes
   on Nominatim and caches them in `data/geocode.json`.
3. If either changed anything, `github-actions[bot]` commits it back to
   `main`. **Run `git pull` after pushing.**
4. Tests, build, smoke check, deploy to GitHub Pages.

## Local dev

Node 24+.

```sh
npm ci
npm run dev       # http://localhost:4321/my-gpx-files/
npm test          # unit tests
npm run build && npm run smoke
```
