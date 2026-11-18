# ==============================================================================
# nepal_prov_2026.py
#
# Stand-alone builder for nepal_prov_2026.gpkg (this folder). Run after nepal_dist_2026.py.
#
# IMPORTS (python): sys, pathlib, geopandas
#
# INPUTS (paths relative to this script):
#   nepal_dist_2026.gpkg   (layer 'districts', from nepal_dist_2026.py)
#
# OUTPUTS (paths relative to this script):
#   nepal_prov_2026.gpkg   (layer 'provinces')
# ==============================================================================
# /// script
# requires-python = ">=3.11"
# dependencies = ["geopandas", "shapely", "pyogrio"]
# ///
"""
nepal_prov_2026.py -> nepal_prov_2026.gpkg

Province polygons: the districts of nepal_dist_2026.gpkg dissolved by province_code.
Columns: province_code, province_name, n_districts, area_km2.
Run: uv run nepal_prov_2026.py
"""
import sys
from pathlib import Path

import geopandas as gpd

OUT = Path(__file__).resolve().parent
DISTRICTS = OUT / "nepal_dist_2026.gpkg"


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


def main():
    d = gpd.read_file(DISTRICTS, layer="districts")
    out = d.dissolve(by="province_code", as_index=False,
                     aggfunc={"province_name": "first", "district_code": "nunique"})
    out = out.rename(columns={"district_code": "n_districts"})
    out["geometry"] = fill_slivers(out.geometry.make_valid())
    out["area_km2"] = (out.to_crs(32645).area / 1e6).round(4)
    cols = ["province_code", "province_name", "n_districts", "area_km2"]
    out = gpd.GeoDataFrame(out[cols + ["geometry"]], crs=d.crs).sort_values("province_code").reset_index(drop=True)
    for c in ["province_code", "n_districts"]:
        out[c] = out[c].astype("Int64")
    print(out.drop(columns="geometry").to_string(index=False))

    f = OUT / "nepal_prov_2026.gpkg"
    out.to_file(f, layer="provinces", driver="GPKG")
    print("wrote", f, len(out))


if __name__ == "__main__":
    sys.exit(main())
