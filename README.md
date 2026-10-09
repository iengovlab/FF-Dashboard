# Downstream places dashboard

Pick a river monitor on the map to see the wards downstream of it and the markets there.
It is a static page: `index.html` + `app.js` + `gpkg.js` + `style.css`, reading the files in `data/`.

Data files in `data/` (all read-only, nothing is saved):
- `01_wards_nepal.gpkg`, `02_rivers_hydrorivers.gpkg`
- `03_monitors_bipad.csv`, `04_markets_osm.csv`, `05_downstream_wards.csv`

## View online
Publish with GitHub Pages (repo Settings > Pages > deploy from the main branch, root folder).

## View locally
Browsers block a double-clicked page from reading `data/`, so run `node serve.js` in this folder
and open http://127.0.0.1:8765
