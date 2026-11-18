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

## Files in `5_documentation\01_2026-10_scoping_ktm\`

| File | Content |
|---|---|
| `00_dashboard\` | Interactive map dashboard of the outputs, and this overview (`index.html`, with its own copy of the data: 01 as `00_dashboard\data\nepal_map\nepal_wards_2026.gpkg`, shared across dashboards and rebuilt by `nepal_wards_2026.py` next to it; 02–05 in `00_dashboard\data\01_2026-10_scoping_ktm\`). View it online through GitHub Pages, or locally with `node serve.js`. The code is hosted in the IEN GitHub account at https://github.com/iengovlab/FF-Dashboard; accounts with access to that repo can push changes. |
| `spotchecks\02_spot_check_05.py` | Check script (read only on 01–05). Run: `uv run spotchecks\02_spot_check_05.py`. |
| `spotchecks\02_spot_check_05.md` | Results for 05: integrity, random sample, upstream and distance checks, map lookups. |
| `spotchecks\02_spot_check_05_sample.csv` | The 15 sampled 05 rows with every check value. |
| `spotchecks\02_spot_check_05_cap_issues.csv` | Monitors whose ward list disagrees with my own 25 km trace (header only = none). |
| `spotchecks\02_spot_check_05_snapping.csv` | Per-monitor snapping check (flags a monitor snapped to a minor stream). |
| `spotchecks\02_spot_check_summary.json` | All counts quoted in 02 and 03. |
| `spotchecks\03_spot_check_other_datasets.md` | Results for 01, 03 and 04. |
| `spotchecks\03_spot_check_sample_03_monitors.csv`, `spotchecks\03_spot_check_sample_04_markets.csv` | Random samples used for the lookups. |

Note: OpenStreetMap, Google Maps and Nominatim can't be reached from the checking environment. The "independent map" step therefore used web search and Wikipedia coordinates, plus a recompute of the GIS steps with separate code.
