# ==============================================================================
# nepal_country_2026.py
#
# Stand-alone builder for nepal_country_2026.gpkg (this folder). Run after nepal_prov_2026.py.
#
# IMPORTS (python): sys, pathlib, geopandas
#
# INPUTS (paths relative to this script):
#   nepal_prov_2026.gpkg      (layer 'provinces', from nepal_prov_2026.py)
#
# OUTPUTS (paths relative to this script):
#   nepal_country_2026.gpkg   (layer 'country')
# ==============================================================================
# /// script
# requires-python = ">=3.11"  # built with Python 3.12.5
# dependencies = ["geopandas==1.0.1", "shapely==2.0.6", "pyogrio==0.10.0"]  # versions used for the 2026-11-18 build
# ///
"""
nepal_country_2026.py -> nepal_country_2026.gpkg

National boundary: the provinces of nepal_prov_2026.gpkg dissolved into one polygon.
Columns: country, n_provinces, area_km2.
Run: uv run nepal_country_2026.py
"""
import sys
from pathlib import Path

import geopandas as gpd

OUT = Path(__file__).resolve().parent
PROVINCES = OUT / "nepal_prov_2026.gpkg"


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
    p = gpd.read_file(PROVINCES, layer="provinces")
    out = gpd.GeoDataFrame({"country": ["Nepal"], "n_provinces": [p.province_code.nunique()]},
                           geometry=[p.union_all()], crs=p.crs)
    out["geometry"] = fill_slivers(out.geometry.make_valid())
    out["area_km2"] = (out.to_crs(32645).area / 1e6).round(4)
    print(out.drop(columns="geometry").to_string(index=False))

    f = OUT / "nepal_country_2026.gpkg"
    out.to_file(f, layer="country", driver="GPKG")
    print("wrote", f, len(out))


if __name__ == "__main__":
    sys.exit(main())
