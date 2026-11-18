# 01 Workflow overview: station mapping (2026-10 scoping)

Goal: list BIPAD river and rain monitoring stations, then, for each river station, list the wards downstream along the river with the along-river distance and the markets in each ward.

Folders (under `C:\Users\Anubhav\Dropbox\Nepal_Floods\2_Data`):
- Documentation: `5_documentation\01_2026-10_scoping_ktm\` (this file is in its `00_dashboard\`)
- Scripts: `1_do\01_2026-10_scoping_ktm\` (each `.py` is named exactly like the file it writes; run in number order with `uv run <script>`)
- Outputs: `2_raw\01_2026-10_scoping_ktm\` (downloaded sources cached in `_source\`)
- Codes: `2_raw\00_crosswalk\master_crosswalk_prov_dist_mun.xlsx` (read only)

Every output carries `district_code` (3-digit), `muni_code` (5-digit = crosswalk `municipality_code`) and `ward_code` = muni_code × 100 + ward no. (for example 1010501).

## Pipeline

| # | Script → output | Source | What it does |
|---|---|---|---|
| 01 | `01_wards_nepal.py` → `01_wards_nepal.gpkg` (+ `_match.csv`, `_checks.csv`) | Survey Dept National Geoportal ward layer (`geonode:ward_nameupdated_wgs`) | 6,748 ward polygons plus 44 protected-area pieces (`is_ward=0`, no ward_code). Palikas matched to the crosswalk by normalized name within district (exact, then phonetic, then fuzzy); checks ward counts and areas against the crosswalk. |
| 02 | `02_rivers_hydrorivers.py` → `02_rivers_hydrorivers.gpkg` | [HydroRIVERS v1.0 Asia](https://www.hydrosheds.org/products/hydrorivers) | Reaches within Nepal + 10 km buffer. Keeps `HYRIV_ID`, `NEXT_DOWN`, `LENGTH_KM`, `MAIN_RIV`, `ORD_STRA`, `UPLAND_SKM`, `DIS_AV_CMS`, `in_nepal`. |
| 03 | `03_monitors_bipad.py` → `03_monitors_bipad.csv` | BIPAD API `/api/v1/river-stations/`, `/api/v1/rain-stations/` (behind [bipadportal.gov.np/realtime](https://bipadportal.gov.np/realtime/)); DHM station list ([hydrology.gov.np](https://hydrology.gov.np)) | 948 stations (284 river `RIV_###`, 664 rain `RAI_###`, ordered by BIPAD id). `active_2d` = 1 if the last reading is within 48 h of the BIPAD snapshot (`snapshot_at`, `last_reading_at`, `hours_since_reading`); 188 river stations are active. BIPAD-reported admin units plus point-in-polygon codes from 01; mismatch flags; distance to the nearest river; cross-check against DHM coordinates. |
| 04 | `04_markets_osm.py` → `04_markets_osm.csv` | OpenStreetMap via Overpass | 1,508 features: `amenity=marketplace`, `landuse=retail/commercial`, and anything named Bazar/Bazaar/Haat/Mandi/बजार/हाट. Codes by point-in-polygon on 01. |
| 05 | `05_downstream_wards.py` → `05_downstream_wards.csv` | 01–04 | Active river monitors only (`ACTIVE_WINDOW_H=48`), and wards within `MAX_RIVER_KM=25` along the river: one row per monitor × downstream ward (2,059 rows; 188 monitors; 1,293 wards; median 10 wards per monitor). The monitor is snapped to the nearest reach (if that reach drains less than 50 km², the smallest reach of at least 50 km² within 1 km is used instead; see `snap_method`), then the path follows `NEXT_DOWN` until 25 km or the Nepal border (`path_end`). A ward is included if the path crosses it. `river_km` = along-channel km from the snapped monitor to where the path first enters the ward. `markets` lists the 04 names in that ward (`;`-separated), with `n_markets` and `market_ids`. |

## Dashboard: how it is built, hosted and maintained

This section is the hand-over guide for the dashboard in `00_dashboard\` (this folder).

### Principles
1. **Hosting:** the dashboard is hosted on Cloudflare (Cloudflare Pages), which publishes it straight from the GitHub repository. Every push to the `main` branch updates the live site within a minute or two.
2. **Accounts:** both the Cloudflare account and the GitHub account that host the dashboard belong to IEN, not to any individual. The GitHub repository is https://github.com/iengovlab/FF-Dashboard.
3. **Access:** the IEN GitHub account gives our individual GitHub accounts access to the repository (Settings > Collaborators). People edit and push with their own accounts; nobody shares the IEN login.
4. **One dashboard:** we use a single dashboard for all project work. Each new piece of work is added as a tab (or a sub-tab under an existing tab), not as a new site. Each tab loads its data only when it is first opened, so adding tabs does not slow down the others.

### How the dashboard is built
- It is a static website: plain HTML, CSS and JavaScript, with no build step and no server code. The browser reads the data files directly (GeoPackage files with sql.js, CSV files with PapaParse) and draws the map with Leaflet. All three libraries load from cdnjs.
- All paths are relative, so the same folder works locally, on Cloudflare and on any device.
- Files in `00_dashboard\`:

| Path | Role |
|---|---|
| `index.html` | Page layout: header, tab bars and one `<main class="page" data-page="...">` block per tab or sub-tab. |
| `style.css` | IEN look (terracotta `#CE8769` from the logo, warm beige, Montserrat) with light and dark themes. |
| `theme.js` | Light/dark toggle in the header. It follows the computer's setting until someone picks a theme, and then remembers that choice in the browser. |
| `tabs.js` | The list of tabs and sub-tabs (`TABS`). It builds the tab bars and the Archived dropdown, shows the open page and keeps it in the address (`#river-monitors`). |
| `tabs\river_monitors.js` | Code for the River Monitors tab. |
| `gpkg.js` | Small reader for GeoPackage geometries. |
| `serve.js` | Local preview server only (not used online). |
| `assets\` | IEN logos and fonts, copied from `Nepal_IEN\0_admin\9_logos_letterhead` (see its README). |
| `data\nepal_map\` | Shared Nepal boundaries with IEN codes (ward, municipality, district, province, country) and the scripts that build them. See its README. |
| `data\<project folder>\` | Data for one piece of work, e.g. `data\01_2026-10_scoping_ktm\` for this scoping. Each has a README saying where its files are created. |

### Adding a new piece of work (a new tab)
1. Put its data in a new `data\<project folder>\` with a short README on where the files come from. Reuse `data\nepal_map\` for boundaries instead of copying them.
2. Add the tab to `TABS` at the top of `tabs.js` (with `subs` for sub-tabs).
3. Add its `<main class="page" data-page="<tab id>" hidden>` block in `index.html` (for a sub-tab: `data-page="<tab id>/<sub id>"`), and its script tag at the bottom.
4. Write `tabs\<tab id>.js`. Start loading data inside a `tabshown` listener for that page, as `tabs\river_monitors.js` does, so nothing downloads until someone opens the tab.
5. Check it locally, then commit and push (below).

### Archiving a tab
When a piece of work is finished, set `archived: true` on its entry in `TABS` (`tabs.js`). It leaves the tab bar and appears in the "Archived" dropdown at the right end of the tab bar, from where it still opens with its data. Nothing is deleted, so it can be brought back by removing the flag.

### Working on it locally
1. Get the code: either use this Dropbox folder (it is a git clone), or run `git clone https://github.com/iengovlab/FF-Dashboard.git`.
2. In `00_dashboard\`, run `node serve.js` and open http://127.0.0.1:8765. Browsers block a double-clicked `index.html` from reading `data\`, so the small server is needed.
3. Commit and push with your own GitHub account: `git add -A`, `git commit -m "..."`, `git push origin main`. Cloudflare publishes the new version automatically.

### Setting up hosting (one time, by whoever holds the IEN accounts)
1. In the IEN Cloudflare account: Workers & Pages > Create > Pages > Connect to Git, sign in with the IEN GitHub account, and pick `iengovlab/FF-Dashboard`.
2. Production branch `main`; framework preset None; build command empty; build output directory `/`.
3. Save and deploy. Cloudflare gives a `*.pages.dev` address; a custom domain can be added under the project's Custom domains.
4. Keep every file under 25 MB (Cloudflare Pages limit; GitHub also warns above 50 MB). This is why the ward boundaries are split into one file per province (`nepal_wards_2026_prov1.gpkg` to `_prov7.gpkg`, 6 to 9 MB each); the largest file today is `nepal_muni_2026.gpkg` at about 18 MB. Split any new large file the same way.
5. In the IEN GitHub account, add each team member under the repository's Settings > Collaborators.

## Files in `5_documentation\01_2026-10_scoping_ktm\`

| File | Content |
|---|---|
| `00_dashboard\` | Interactive map dashboard of the outputs, and this overview (`index.html`, with its own copy of the data: 01 as `00_dashboard\data\nepal_map\nepal_wards_2026_prov1.gpkg` to `_prov7.gpkg` (one per province), shared across dashboards and rebuilt by `nepal_wards_2026.py` next to them; 02–05 in `00_dashboard\data\01_2026-10_scoping_ktm\`). View it online through Cloudflare Pages (see the dashboard section above), or locally with `node serve.js`. The code is hosted in the IEN GitHub account at https://github.com/iengovlab/FF-Dashboard; accounts with access to that repo can push changes. |
| `spotchecks\02_spot_check_05.py` | Check script (read only on 01–05). Run: `uv run spotchecks\02_spot_check_05.py`. |
| `spotchecks\02_spot_check_05.md` | Results for 05: integrity, random sample, upstream and distance checks, map lookups. |
| `spotchecks\02_spot_check_05_sample.csv` | The 15 sampled 05 rows with every check value. |
| `spotchecks\02_spot_check_05_cap_issues.csv` | Monitors whose ward list disagrees with my own 25 km trace (header only = none). |
| `spotchecks\02_spot_check_05_snapping.csv` | Per-monitor snapping check (flags a monitor snapped to a minor stream). |
| `spotchecks\02_spot_check_summary.json` | All counts quoted in 02 and 03. |
| `spotchecks\03_spot_check_other_datasets.md` | Results for 01, 03 and 04. |
| `spotchecks\03_spot_check_sample_03_monitors.csv`, `spotchecks\03_spot_check_sample_04_markets.csv` | Random samples used for the lookups. |

Note: OpenStreetMap, Google Maps and Nominatim can't be reached from the checking environment. The "independent map" step therefore used web search and Wikipedia coordinates, plus a recompute of the GIS steps with separate code.
