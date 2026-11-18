# nepal_map

Shared Nepal administrative boundaries with IEN codes. Not tied to any one project, so any dashboard can reuse them.

| File | Content |
|---|---|
| `nepal_wards_2026.gpkg` | Layer `wards`: 6,748 ward polygons plus 44 protected-area pieces (`is_ward=0`, no `ward_code`), EPSG:4326. |
| `nepal_wards_2026.py` | Stand-alone script that builds the file above. |

Codes (from the IEN crosswalk `master_crosswalk_prov_dist_mun.xlsx`):
- `district_code`: 3 digits
- `muni_code`: 5 digits (= crosswalk `municipality_code`)
- `ward_code` = `muni_code` × 100 + `ward_no` (for example 1010501)

## How the file is created
Source: Survey Department, Government of Nepal, National Geoportal (WFS layer `geonode:ward_nameupdated_wgs`).
Palikas are matched to the crosswalk by name within district (exact, then phonetic, then fuzzy), and ward counts and areas are checked against the crosswalk.

Rebuild with:

    uv run nepal_wards_2026.py [path/to/master_crosswalk_prov_dist_mun.xlsx]

Without the argument it uses the crosswalk copy in `raw/`, or else looks for `2_raw/00_crosswalk/` in a parent folder (the Nepal_Floods Dropbox).

## `raw/` (raw inputs; in Dropbox only, not on GitHub)
The script creates `raw/` if it is missing and downloads the Geoportal layers there. It is git-ignored because the GeoJSONs are about 70 MB each (over GitHub's 50 MB warning size).
Copies placed here on 2026-11-18, so the script rebuilds `nepal_wards_2026.gpkg` exactly without downloading:

| File | Copied from | Version | MD5 |
|---|---|---|---|
| `master_crosswalk_prov_dist_mun.xlsx` | `Nepal_Floods/2_raw/00_crosswalk/` | IEN master crosswalk, file dated 2025-09-05, sheet `Sheet1`, 753 rows | `fef995db37b109211760439a59804bcb` |
| `sd_geoportal_ward_nameupdated_wgs.geojson` | `Nepal_Floods/2_raw/01_2026-10_scoping_ktm/_source/` | Geoportal download of 2026-10-08 | `52d7d35c3da38482a9ca9680cb44c9f0` |
| `sd_geoportal_wards.geojson` | `Nepal_Floods/2_raw/01_2026-10_scoping_ktm/_source/` | Geoportal download of 2026-10-08 | `6788b3e93db697cac9d05ab4f23a0c8e` |

To use newer Geoportal data, delete the two GeoJSONs and rerun; the script downloads them again. The run also writes `nepal_wards_2026_match.csv` and `nepal_wards_2026_checks.csv` here.

This file was first made as `01_wards_nepal.gpkg` in the 2026-10 scoping pipeline (`1_do/01_2026-10_scoping_ktm/01_wards_nepal.py`); the script here is a stand-alone copy of that code.
