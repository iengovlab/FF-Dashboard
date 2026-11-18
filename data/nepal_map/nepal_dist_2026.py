# ==============================================================================
# nepal_dist_2026.py
#
# Stand-alone builder for nepal_dist_2026.gpkg (this folder). Run after nepal_wards_2026.py.
#
# IMPORTS (python): sys, pathlib, pandas, geopandas
#
# INPUTS (paths relative to this script):
#   nepal_wards_2026_prov1..7.gpkg           (layer 'wards', from nepal_wards_2026.py)
#   raw/master_crosswalk_prov_dist_mun.xlsx  (IEN code crosswalk, read only; see README).
#     If missing, <Nepal_Floods>/2_raw/00_crosswalk/ is found by walking up from this script;
#     or pass the path as the first argument: uv run nepal_dist_2026.py <crosswalk.xlsx>
#
# OUTPUTS (paths relative to this script):
#   nepal_dist_2026.gpkg                     (layer 'districts')
# ==============================================================================
# /// script
# requires-python = ">=3.11"  # built with Python 3.12.5
# dependencies = ["pandas==3.0.5", "geopandas==1.0.1", "shapely==2.0.6", "pyogrio==0.10.0", "openpyxl==3.1.5"]  # versions used for the 2026-11-18 build
# ///
"""
nepal_dist_2026.py -> nepal_dist_2026.gpkg

District polygons: all polygons of nepal_wards_2026_prov*.gpkg, wards and protected-area
pieces alike, dissolved by district_code, so districts also cover national parks.
Province from the crosswalk (province_id; province 1 is named Koshi).
Columns: province_code, province_name, district_code, district_name, n_munis, area_km2.
Run: uv run nepal_dist_2026.py [path/to/master_crosswalk_prov_dist_mun.xlsx]
"""
import sys
from pathlib import Path

import pandas as pd
import geopandas as gpd

OUT = Path(__file__).resolve().parent
SRC = OUT / "raw"
CW_REL = Path("2_raw") / "00_crosswalk" / "master_crosswalk_prov_dist_mun.xlsx"
WARDS = sorted(OUT.glob("nepal_wards_2026_prov*.gpkg"))  # one ward file per province


# The Survey Dept wards leave a few hair-line gaps (< 5 m2) between neighbours, which turn
# into tiny holes once wards are dissolved. Holes under SLIVER_M2 are filled; real holes stay.
SLIVER_M2 = 100


def fill_slivers(gs):
    """Remove interior rings smaller than SLIVER_M2 (area measured in UTM 45N) from each (multi)polygon."""
    from shapely.geometry import Polygon, MultiPolygon

    def small(ring):
        return gpd.GeoSeries([Polygon(ring)], crs=gs.crs).to_crs(32645).area.iat[0] < SLIVER_M2

    def fix(g):
        polys = list(getattr(g, "geoms", [g]))
        polys = [Polygon(p.exterior, [r for r in p.interiors if not small(r)]) for p in polys]
        return polys[0] if len(polys) == 1 else MultiPolygon(polys)

    return gs.map(fix)


def find_crosswalk():
    """First argument if given, else the copy in raw/, else the first parent folder that holds 2_raw/00_crosswalk/."""
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    if (SRC / CW_REL.name).exists():
        return SRC / CW_REL.name
    for p in OUT.parents:
        if (p / CW_REL).exists():
            return p / CW_REL
    sys.exit("crosswalk not found; pass its path: uv run nepal_dist_2026.py <master_crosswalk_prov_dist_mun.xlsx>")


def provinces(cw):
    """district_code -> province_code, province_name (the crosswalk names province 1 only by number; it is Koshi since 2023)."""
    p = cw[["district_code", "province_id", "province"]].drop_duplicates("district_code")
    p = p.rename(columns={"province_id": "province_code", "province": "province_name"})
    p["province_name"] = p.province_name.astype(str).replace({"1": "Koshi"})
    return p


def main():
    cw = pd.read_excel(find_crosswalk(), sheet_name="Sheet1")
    w = gpd.GeoDataFrame(pd.concat([gpd.read_file(f, layer="wards") for f in WARDS], ignore_index=True))
    print("polygons without district_code:", w.district_code.isna().sum())
    out = w.dissolve(by="district_code", as_index=False,
                     aggfunc={"district_name": "first", "muni_code": "nunique"})
    out = out.rename(columns={"muni_code": "n_munis"})
    out = out.merge(provinces(cw), on="district_code", how="left")
    out["geometry"] = fill_slivers(out.geometry.make_valid())
    out["area_km2"] = (out.to_crs(32645).area / 1e6).round(4)
    cols = ["province_code", "province_name", "district_code", "district_name", "n_munis", "area_km2"]
    out = gpd.GeoDataFrame(out[cols + ["geometry"]], crs=w.crs).sort_values("district_code").reset_index(drop=True)
    for c in ["province_code", "district_code", "n_munis"]:
        out[c] = out[c].astype("Int64")

    miss = set(cw.district_code) - set(out.district_code)
    print(f"districts: {len(out)} (crosswalk {cw.district_code.nunique()}), missing: {sorted(miss)}")
    print(f"missing province: {out.province_code.isna().sum()}")

    f = OUT / "nepal_dist_2026.gpkg"
    out.to_file(f, layer="districts", driver="GPKG")
    print("wrote", f, len(out))


if __name__ == "__main__":
    sys.exit(main())
