# ==============================================================================
# nepal_wards_2026.py
#
# Stand-alone builder for nepal_wards_2026_prov1..7.gpkg (this folder). Shared Nepal ward
# boundaries with IEN codes, for use across dashboards.
#
# IMPORTS (python): re, sys, difflib, unicodedata, pathlib, requests, pandas, geopandas
#
# INPUTS:
#   raw/master_crosswalk_prov_dist_mun.xlsx (IEN code crosswalk, read only; see README).
#     If missing, <Nepal_Floods>/2_raw/00_crosswalk/ is found by walking up from this script;
#     or pass the path as the first argument: uv run nepal_wards_2026.py <crosswalk.xlsx>
#   raw/sd_geoportal_ward_nameupdated_wgs.geojson   (downloaded from nationalgeoportal.gov.np WFS if missing)
#   raw/sd_geoportal_wards.geojson                  (downloaded from nationalgeoportal.gov.np WFS if missing)
#
# OUTPUTS (paths relative to this script):
#   nepal_wards_2026_prov1.gpkg ... nepal_wards_2026_prov7.gpkg  (layer 'wards', one file per province)
#   raw/nepal_wards_2026_match.csv  (not committed, see .gitignore)
#   raw/nepal_wards_2026_checks.csv (not committed, see .gitignore)
# ==============================================================================
# /// script
# requires-python = ">=3.11"  # built with Python 3.12.5
# dependencies = ["requests==2.34.2", "pandas==3.0.5", "geopandas==1.0.1", "shapely==2.0.6", "pyogrio==0.10.0", "openpyxl==3.1.5"]  # versions used for the 2026-11-18 build
# ///
"""
nepal_wards_2026.py -> nepal_wards_2026_prov1.gpkg ... nepal_wards_2026_prov7.gpkg

Ward polygons for all of Nepal from the Survey Department's National Geoportal
(WFS layer geonode:ward_nameupdated_wgs, EPSG:4326), with codes from the master
crosswalk:
  district_code (3-digit), muni_code (5-digit = crosswalk municipality_code),
  ward_code = muni_code*100 + ward_no; province_code = district_code // 100 (1-7).
One file per province keeps each file well under the 25 MB file limit of Cloudflare Pages.

Survey Dept palikas are matched to the crosswalk by normalized names within
district (exact -> phonetic -> fuzzy), never by the Survey Dept numeric codes,
which use a different numbering. Polygons with ward no. 99 are protected-area
parts (national parks etc.); they are kept with is_ward=0 and no ward_code.

Side outputs (in raw/):
  nepal_wards_2026_match.csv   one row per Survey Dept palika: match method/score
  nepal_wards_2026_checks.csv  one row per crosswalk palika: n wards + area checks
Run: uv run nepal_wards_2026.py [path/to/master_crosswalk_prov_dist_mun.xlsx]
"""
import re
import sys
import difflib
import unicodedata
from pathlib import Path

import requests
import pandas as pd
import geopandas as gpd

# outputs go next to this script; downloads and check tables go to raw/
OUT = Path(__file__).resolve().parent
SRC = OUT / "raw"
CW_REL = Path("2_raw") / "00_crosswalk" / "master_crosswalk_prov_dist_mun.xlsx"


def find_crosswalk():
    """First argument if given, else the copy in raw/, else the first parent folder that holds 2_raw/00_crosswalk/."""
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    if (SRC / CW_REL.name).exists():
        return SRC / CW_REL.name
    for p in OUT.parents:
        if (p / CW_REL).exists():
            return p / CW_REL
    sys.exit("crosswalk not found; pass its path: uv run nepal_wards_2026.py <master_crosswalk_prov_dist_mun.xlsx>")


WFS = ("https://nationalgeoportal.gov.np/geoserver/wfs?service=WFS&version=1.0.0"
       "&request=GetFeature&typeName=geonode:ward_nameupdated_wgs&outputFormat=application/json")
SRC_FILE = SRC / "sd_geoportal_ward_nameupdated_wgs.geojson"

# Survey Dept district label -> crosswalk `district`
DIST_ALIAS = {
    "TERHATHUM": "Tenhrathum", "UDAYAPUR": "Udaya Pur", "DHANUSHA": "Dhanusa",
    "MAKAWANPUR": "Makwanpur", "CHITAWAN": "Chitwan", "KABHREPALANCHOK": "Kavrepalanchok",
    "NAWALPARASI_E": "Nawalparasi East", "NAWALPARASI_W": "Nawalparasi West",
    "RUKUM_E": "Rukum East", "RUKUM_W": "Rukum West", "PARBAT": "Parwat",
}
# Survey Dept palika name -> crosswalk muni_name, for renamed palikas the
# normalizer cannot resolve. Keys are (SD district, SD gapa_napa).
MUNI_ALIAS = {("SOLUKHUMBU", "Thulung Dudhkoshi"): "Dhudha Koushika"}  # formerly Dudhkaushika

DROP_WORDS = r"\b(rural|municipality|municipal|sub|metropolitian|metropolitan|metropolis|city|gaunpalika|nagarpalika|mahanagarpalika|upamahanagarpalika|ruralnp|np|gaupalika)\b"


def norm(s):
    """Lowercase ASCII letters only, admin-type words removed."""
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("-", " ")
    s = re.sub(DROP_WORDS, " ", s)
    return re.sub(r"[^a-z]", "", s)


def phon(s):
    """Collapse common romanization variants (aa/a, w/v, kh/k, ksh/chh, doubled letters...)."""
    s = norm(s)
    for a, b in [("ksh", "x"), ("chh", "x"), ("ch", "x"), ("sh", "s"), ("w", "v"),
                 ("ee", "i"), ("oo", "u"), ("y", "i"), ("z", "j"), ("ou", "au")]:
        s = s.replace(a, b)
    s = s.replace("h", "")
    s = re.sub(r"(.)\1+", r"\1", s)
    return s


def load_crosswalk():
    cw = pd.read_excel(find_crosswalk(), sheet_name="Sheet1")
    cw = cw[["district_code", "district", "municipality_code", "muni_name", "muni_name_sp",
             "municipality_eng", "muni_2017", "muni_type", "n_wards", "area_muni"]].copy()
    cw = cw.rename(columns={"municipality_code": "muni_code", "district": "district_name"})
    return cw


def fetch():
    SRC.mkdir(parents=True, exist_ok=True)
    if not SRC_FILE.exists():
        print("downloading", WFS)
        r = requests.get(WFS, timeout=900)
        r.raise_for_status()
        SRC_FILE.write_bytes(r.content)
    return gpd.read_file(SRC_FILE)


CW_NAME_COLS = ["muni_name", "muni_name_sp", "municipality_eng", "muni_2017"]


def old_names():
    """Older Survey Dept layer (geonode:wards) carries pre-rename palika names; keyed by ddgn."""
    f = SRC / "sd_geoportal_wards.geojson"
    if not f.exists():
        r = requests.get(WFS.replace("ward_nameupdated_wgs", "wards"), timeout=900)
        r.raise_for_status()
        f.write_bytes(r.content)
    o = gpd.read_file(f, columns=["ddgn", "gapa_napa", "new_ward_n"], ignore_geometry=True)
    o = o[o.new_ward_n.between(1, 98)]
    return o.drop_duplicates("ddgn").set_index("ddgn").gapa_napa.to_dict()


def match_munis(sd, cw):
    """Return DataFrame (sd_district, gapa_napa) -> muni_code, method, score.

    Steps within district: alias -> exact -> phonetic (current or older SD name vs any
    crosswalk name column) -> containment -> fuzzy (>=0.75) -> residual pairing by area
    (only when the unmatched palikas left in a district pair up within 10% area).
    """
    oldn = old_names()
    pal = (sd.assign(a3857=sd.to_crs(3857).area / 1e6)
           .groupby(["district", "gapa_napa"], dropna=False)
           .agg(ddgn=("ddgn", "first"), a3857=("a3857", "sum")).reset_index())
    rows = []
    for _, r in pal.iterrows():
        sd_dist, gn = r.district, r.gapa_napa
        names = [gn] + ([oldn[r.ddgn]] if oldn.get(r.ddgn) not in (None, gn) else [])
        dname = DIST_ALIAS.get(sd_dist, str(sd_dist).title())
        cand = cw[cw.district_name == dname]
        rec = dict(sd_district=sd_dist, gapa_napa=gn, sd_old_name=names[1] if len(names) > 1 else "",
                   district_name=dname, sd_area3857_km2=round(r.a3857, 2),
                   muni_code=pd.NA, method="unmatched", score=0.0, cw_name="")
        rows.append(rec)
        if cand.empty:
            continue
        if (sd_dist, gn) in MUNI_ALIAS:
            hit = cand[cand.muni_name == MUNI_ALIAS[(sd_dist, gn)]]
            if len(hit) == 1:
                rec.update(muni_code=hit.muni_code.iat[0], method="alias", score=1.0, cw_name=hit.muni_name.iat[0])
                continue
        done = False
        for fn, method in [(norm, "exact"), (phon, "phonetic")]:
            keys = {fn(n) for n in names} - {""}
            hits = cand[cand[CW_NAME_COLS].apply(lambda col: col.map(fn)).isin(keys).any(axis=1)]
            if hits.muni_code.nunique() == 1:
                rec.update(muni_code=hits.muni_code.iat[0], method=method, score=1.0, cw_name=hits.muni_name.iat[0])
                done = True
                break
        if done:
            continue
        keys = [phon(n) for n in names if len(phon(n)) >= 4]
        hits = cand[cand[CW_NAME_COLS].apply(lambda col: col.map(
            lambda v: any(len(phon(v)) >= 4 and (phon(v) in k or k in phon(v)) for k in keys))).any(axis=1)]
        if hits.muni_code.nunique() == 1:
            rec.update(muni_code=hits.muni_code.iat[0], method="contains", score=1.0, cw_name=hits.muni_name.iat[0])
            continue
        best, bs = None, 0.0
        for _, c in cand.iterrows():
            for col in CW_NAME_COLS:
                for n in names:
                    sc = difflib.SequenceMatcher(None, phon(n), phon(c[col])).ratio()
                    if sc > bs:
                        best, bs = c, sc
        if bs >= 0.75:
            rec.update(muni_code=best.muni_code, method="fuzzy", score=round(bs, 3), cw_name=best.muni_name)
        else:
            rec.update(score=round(bs, 3), cw_name=f"(best: {best.muni_name})" if best is not None else "")
    m = pd.DataFrame(rows)

    # residual pairing by area within district (crosswalk area_muni is EPSG:3857 m2)
    for dname, grp in m[m.method == "unmatched"].groupby("district_name"):
        used = set(m.muni_code.dropna())
        left = cw[(cw.district_name == dname) & ~cw.muni_code.isin(used)]
        for i, r in grp.iterrows():
            if left.empty:
                break
            ratio = r.sd_area3857_km2 / (left.area_muni / 1e6)
            j = (ratio - 1).abs().idxmin()
            if abs(ratio[j] - 1) <= 0.10 and ((ratio - 1).abs() <= 0.10).sum() == 1:
                m.loc[i, ["muni_code", "method", "score", "cw_name"]] = [
                    left.muni_code[j], "residual_area", round(float(ratio[j]), 3), left.muni_name[j]]
                left = left.drop(j)
    return m


def main():
    cw = load_crosswalk()
    sd = fetch()
    print("Survey Dept polygons:", len(sd))
    sd["is_ward"] = (sd.new_ward_n.between(1, 98)).astype(int)
    # protected-area parts with no palika name (e.g. 'Chitawan National Park') are not palikas
    sd["is_palika_area"] = sd.type_gn.isin(["Gaunpalika", "Nagarpalika", "Upamahanagarpalika", "Mahanagarpalika"]).astype(int)

    m = match_munis(sd[sd.is_palika_area == 1], cw)
    # one-to-one check: two SD palikas must not map to the same crosswalk palika
    dup = m[m.muni_code.notna() & m.duplicated("muni_code", keep=False)]
    if len(dup):
        print("WARNING: several Survey Dept palikas map to the same crosswalk palika:")
        print(dup.to_string())
    m.to_csv(SRC / "nepal_wards_2026_match.csv", index=False, encoding="utf-8-sig")
    print(m.method.value_counts().to_string())
    um = m[m.method == "unmatched"]
    if len(um):
        print("UNMATCHED Survey Dept palikas:\n", um.to_string())
    nx = m[~m.method.isin(["exact", "phonetic"])]
    print("non-exact matches:\n", nx[["sd_district", "gapa_napa", "sd_old_name", "cw_name", "method", "score"]].to_string())

    g = sd.merge(m[["sd_district", "gapa_napa", "muni_code", "method"]].rename(columns={"sd_district": "district"}),
                 on=["district", "gapa_napa"], how="left")
    g = g.rename(columns={"method": "match_method", "new_ward_n": "ward_no", "district": "sd_district",
                          "gapa_napa": "sd_palika", "type_gn": "sd_type", "dan": "sd_protected_area"})
    g["muni_code"] = g.muni_code.astype("Int64")
    g = g.merge(cw[["muni_code", "district_code", "district_name", "muni_name", "muni_type"]], on="muni_code", how="left")
    # district for unmatched / protected-area polygons from the SD district label
    dmap = {k: v for k, v in zip(cw.district_name, cw.district_code)}
    fill = g.district_name.isna()
    g.loc[fill, "district_name"] = g.loc[fill, "sd_district"].map(lambda d: DIST_ALIAS.get(d, str(d).title()))
    g["district_code"] = g.district_name.map(dmap).astype("Int64")
    g["ward_no"] = g.ward_no.astype("Int64")
    g["ward_code"] = (g.muni_code * 100 + g.ward_no).where((g.is_ward == 1) & g.muni_code.notna()).astype("Int64")

    # dissolve multi-part rows so there is one feature per ward (protected-area parts stay separate)
    w = g[g.is_ward == 1]
    key = ["sd_district", "sd_palika", "ward_no"]
    if w.duplicated(key).any():
        print("dissolving", w.duplicated(key).sum(), "duplicate ward parts")
    attrs = ["district_code", "district_name", "muni_code", "muni_name", "muni_type", "ward_no", "ward_code",
             "is_ward", "sd_district", "sd_palika", "sd_type", "sd_protected_area", "ddgnww", "match_method"]
    w = w[attrs + ["geometry"]].dissolve(by=key, as_index=False, aggfunc="first")
    p = g[g.is_ward == 0][attrs + ["geometry"]]
    out = gpd.GeoDataFrame(pd.concat([w, p], ignore_index=True), crs=sd.crs)[attrs + ["geometry"]]
    out = out.rename(columns={"ddgnww": "sd_ddgnww"})
    out["geometry"] = out.geometry.make_valid()

    dupw = out[out.ward_code.notna() & out.ward_code.duplicated(keep=False)]
    if len(dupw):
        print("WARNING duplicate ward_code:\n", dupw[["district_name", "sd_palika", "muni_name", "ward_no", "ward_code"]].to_string())

    # crosswalk double-check: ward counts and palika area vs crosswalk area_muni
    # (area_muni is in EPSG:3857 m2 -- ratio to UTM area is ~0.78 everywhere -- so compare in 3857)
    out["area_km2"] = (out.to_crs(32645).area / 1e6).round(4)
    out["_a3857"] = out.to_crs(3857).area / 1e6
    chk = (out[out.muni_code.notna()].groupby("muni_code")
           .agg(n_wards_gis=("ward_code", "nunique"), area_gis_km2=("_a3857", "sum")).reset_index())
    out = out.drop(columns="_a3857")
    chk = cw[["district_code", "district_name", "muni_code", "muni_name", "n_wards", "area_muni"]].merge(chk, on="muni_code", how="left")
    chk["area_cw_km2"] = chk.area_muni / 1e6
    chk["area_ratio"] = (chk.area_gis_km2 / chk.area_cw_km2).round(3)
    chk["flag_area"] = (chk.area_ratio - 1).abs() > 0.10
    chk["flag_nwards"] = chk.n_wards.notna() & (chk.n_wards != chk.n_wards_gis)
    chk["flag_no_polygon"] = chk.n_wards_gis.isna()
    chk.drop(columns="area_muni").to_csv(SRC / "nepal_wards_2026_checks.csv", index=False, encoding="utf-8-sig")
    print(f"crosswalk palikas without polygons: {chk.flag_no_polygon.sum()}")
    print(f"area ratio off by >10%: {chk.flag_area.sum()} (of {chk.area_ratio.notna().sum()} with area)")
    print(f"ward count differs from crosswalk n_wards: {chk.flag_nwards.sum()} (of {chk.n_wards.notna().sum()} with n_wards)")
    print(f"wards: {out.is_ward.sum()}  with ward_code: {out.ward_code.notna().sum()}  total wards expected ~6743")

    # one file per province (district_code's first digit is the province number)
    out.insert(0, "province_code", (out.district_code // 100).astype("Int64"))
    for pc, part in out.groupby("province_code"):
        f = OUT / f"nepal_wards_2026_prov{pc}.gpkg"
        part.reset_index(drop=True).to_file(f, layer="wards", driver="GPKG")
        print("wrote", f, len(part))


if __name__ == "__main__":
    sys.exit(main())
