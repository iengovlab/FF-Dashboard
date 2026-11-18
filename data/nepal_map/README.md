# nepal_map

Shared Nepal administrative boundaries with IEN codes. Not tied to any one project, so any dashboard can reuse them.

**Exception to the usual IEN layout:** here the code files (`.py`) and the data files (`.gpkg`) they create live in the same folder, instead of separate `1_do/` and `2_raw/` folders. This keeps the boundaries self-contained, so the folder can be copied into any new dashboard as is.

## Files (run the scripts in this order)

| # | Script | Creates | Content |
|---|---|---|---|
| 1 | `nepal_wards_2026.py` | `nepal_wards_2026_prov1.gpkg` … `nepal_wards_2026_prov7.gpkg` (layer `wards`) | 6,748 ward polygons plus 44 protected-area pieces (`is_ward=0`, no `ward_code`), one file per province (6 to 9 MB each, so every file stays under Cloudflare's 25 MB limit). From the Survey Dept Geoportal and the IEN crosswalk. |
| 2 | `nepal_muni_2026.py` | `nepal_muni_2026.gpkg` (layer `munis`) | 753 municipalities (palikas): wards dissolved by `muni_code`. Protected-area pieces are left out. |
| 3 | `nepal_dist_2026.py` | `nepal_dist_2026.gpkg` (layer `districts`) | 77 districts: all ward-file polygons, protected areas included, dissolved by `district_code`. |
| 4 | `nepal_prov_2026.py` | `nepal_prov_2026.gpkg` (layer `provinces`) | 7 provinces: districts dissolved by `province_code`. |
| 5 | `nepal_country_2026.py` | `nepal_country_2026.gpkg` (layer `country`) | Nepal: provinces dissolved into one polygon. |

All files are EPSG:4326 and carry `area_km2` (UTM 45N). Steps 2 and 3 read the crosswalk; steps 4 and 5 only read the file before them.
The Survey Dept wards leave a few hair-line gaps (< 5 m²) between neighbours; steps 2 to 5 fill holes under 100 m² that this leaves after dissolving. Real holes stay.

Codes (from the IEN crosswalk `master_crosswalk_prov_dist_mun.xlsx`):
- `province_code`: 1 to 7 (crosswalk `province_id`); `province_name` from the crosswalk, with province 1 named Koshi
- `district_code`: 3 digits
- `muni_code`: 5 digits (= crosswalk `municipality_code`)
- `ward_code` = `muni_code` × 100 + `ward_no` (for example 1010501)

## How the ward file is created
Source: Survey Department, Government of Nepal, National Geoportal (WFS layer `geonode:ward_nameupdated_wgs`).
Palikas are matched to the crosswalk by name within district (exact, then phonetic, then fuzzy), and ward counts and areas are checked against the crosswalk.

Rebuild everything with:

    uv run nepal_wards_2026.py
    uv run nepal_muni_2026.py
    uv run nepal_dist_2026.py
    uv run nepal_prov_2026.py
    uv run nepal_country_2026.py

(or `python <script>` if geopandas is installed). Scripts 1 to 3 take an optional crosswalk path as argument; without it they use the copy in `raw/`, or else look for `2_raw/00_crosswalk/` in a parent folder (the Nepal_Floods Dropbox).

## `raw/` (raw inputs; in Dropbox only, not on GitHub)
`nepal_wards_2026.py` creates `raw/` if it is missing and downloads the Geoportal layers there. It is git-ignored because the GeoJSONs are about 70 MB each (over GitHub's 50 MB warning size).
Copies placed here on 2026-11-18, so the scripts rebuild the files exactly without downloading:

| File | Copied from | Version | MD5 |
|---|---|---|---|
| `master_crosswalk_prov_dist_mun.xlsx` | `Nepal_Floods/2_raw/00_crosswalk/` | IEN master crosswalk, file dated 2025-09-05, sheet `Sheet1`, 753 rows | `fef995db37b109211760439a59804bcb` |
| `sd_geoportal_ward_nameupdated_wgs.geojson` | `Nepal_Floods/2_raw/01_2026-10_scoping_ktm/_source/` | Geoportal download of 2026-10-08 | `52d7d35c3da38482a9ca9680cb44c9f0` |
| `sd_geoportal_wards.geojson` | `Nepal_Floods/2_raw/01_2026-10_scoping_ktm/_source/` | Geoportal download of 2026-10-08 | `6788b3e93db697cac9d05ab4f23a0c8e` |

To use newer Geoportal data, delete the two GeoJSONs and rerun; the script downloads them again. The ward run also writes `nepal_wards_2026_match.csv` and `nepal_wards_2026_checks.csv` here.

The ward file was first made as `01_wards_nepal.gpkg` in the 2026-10 scoping pipeline (`1_do/01_2026-10_scoping_ktm/01_wards_nepal.py`); `nepal_wards_2026.py` is a stand-alone copy of that code. Re-running it on 2026-11-18 gave the same attributes and geometries as that file. On the same day the output was split into the seven province files and given a `province_code` column (= `district_code` // 100); the wards in them are unchanged.
