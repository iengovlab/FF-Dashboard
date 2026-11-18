# IEN Floods-Firms Dashboard

One dashboard for the project, organised in tabs (and sub-tabs where needed). It is a static page: `index.html` + `theme.js` + `tabs.js` + `tabs/*.js` + `gpkg.js` + `style.css`, reading the files in `data/` (all read-only, nothing is saved).

## Tabs
| Tab | Code | What it shows |
|---|---|---|
| River Monitors (`#river-monitors`) | `tabs/river_monitors.js` | Pick a river monitor on the map to see the wards downstream of it and the markets there. |

To add a tab: add it to `TABS` at the top of `tabs.js`, add a `<main class="page" data-page="<id>" hidden>` block in `index.html`, and put its code in `tabs/<id>.js` (loaded at the bottom of `index.html`). Sub-tabs work the same way; see the note at the top of `tabs.js`. To archive a finished tab, set `archived: true` on it in `TABS`: it moves from the tab bar into the "Archived" dropdown at the right end, and still opens from there.

## Data
- `data/nepal_map/`: shared Nepal boundaries with IEN codes (ward, municipality, district, province, country), reusable by any dashboard. See its README.
- `data/01_2026-10_scoping_ktm/`: files for the 2026-10 scoping activity (`02_rivers_hydrorivers.gpkg`, `03_monitors_bipad.csv`, `04_markets_osm.csv`, `05_downstream_wards.csv`). See its README.

For a new project, add a `data/<project>/` folder and point the new tab's code at it (see `PROJECT` and `NEED` at the top of `tabs/river_monitors.js`).

The optional flood hazard layer is loaded live from maps.meteor-project.org (METEOR / Fathom, ODbL), so it needs internet.

## View online
Hosted on Cloudflare Pages from this GitHub repository (IEN accounts); every push to `main` publishes it. Setup steps, access and the hand-over guide are in `01_workflow_overview.md`.

## View locally
Browsers block a double-clicked page from reading `data/`, so run `node serve.js` in this folder
and open http://127.0.0.1:8765
