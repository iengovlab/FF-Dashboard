/* Downstream places dashboard. Reads the pipeline outputs in ./data in the browser; nothing is written anywhere.
   Rows and wards come straight from 05_downstream_wards.csv; the controls only filter it. */
(function () {
  "use strict";
  // Limits of what 05 holds: keep equal to MAX_RIVER_KM / ACTIVE_WINDOW_H in 05_downstream_wards.py
  const KM_MAX = 100, H_MAX = 168;
  // Filter values on load and on Reset
  const KM_DEF = 25, H_DEF = 168;
  const MK_MIN_ZOOM = 12; // markets are drawn only at this map zoom or closer
  const NEED = ["01_wards_nepal.gpkg", "02_rivers_hydrorivers.gpkg", "03_monitors_bipad.csv", "04_markets_osm.csv", "05_downstream_wards.csv"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const gmaps = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  const gLink = (lat, lon) => `<a href="${gmaps(lat, lon)}" target="_blank" rel="noopener">View in Google Maps</a>`;
  // BIPAD has no per-station page (checked its realtime routes), so link the realtime map plus the station API record
  const BIPAD = "https://bipadportal.gov.np";
  const bipadRec = (kind, bid) => `${BIPAD}/api/v1/${kind}-stations/${parseInt(bid)}/?format=json`;
  const bLink = (kind, bid) => `<a href="${BIPAD}/realtime/" target="_blank" rel="noopener">BIPAD realtime</a>` +
    (bid ? ` · <a href="${bipadRec(kind, bid)}" target="_blank" rel="noopener">station record</a>` : "");
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const status = (s) => { $("status").textContent = s; };
  document.querySelectorAll(".kmMax").forEach((e) => (e.textContent = KM_MAX));
  document.querySelectorAll(".hMax").forEach((e) => (e.textContent = H_MAX));

  // data files sit in ./data next to this page; fetched as Blobs so the readers below work unchanged
  (async () => {
    try {
      const files = {};
      for (const n of NEED) {
        status("Downloading " + n + "…");
        const r = await fetch("data/" + n);
        if (!r.ok) throw new Error(n + " not found in the data folder (HTTP " + r.status + ")");
        files[n] = await r.blob();
      }
      await load(files);
    } catch (err) { console.error(err); status("Could not load the data: " + err.message + ". If you opened this file directly, run it through a web server (see README)."); }
  })();

  const csv = (file) => new Promise((res, rej) => Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej }));

  async function load(files) {
    status("Reading CSV files…");
    const [m03, m04, r05] = await Promise.all([csv(files["03_monitors_bipad.csv"]), csv(files["04_markets_osm.csv"]), csv(files["05_downstream_wards.csv"])]);
    status("Loading GeoPackage reader…");
    const SQL = await initSqlJs({ locateFile: (f) => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f });
    const wardCodes = [...new Set(r05.map((r) => r.ward_code))].filter(Boolean);
    status(`Reading ward polygons for ${fmt(wardCodes.length)} wards…`);
    const wdb = new SQL.Database(new Uint8Array(await files["01_wards_nepal.gpkg"].arrayBuffer()));
    const wards = {};
    const ws = wdb.prepare(`SELECT ward_code, geom FROM wards WHERE ward_code IN (${wardCodes.map(Number).join(",")})`);
    while (ws.step()) { const [c, g] = ws.get(); wards[c] = thin(GPKG.parse(g)); }
    ws.free(); wdb.close();
    status("Reading river network…");
    const rdb = new SQL.Database(new Uint8Array(await files["02_rivers_hydrorivers.gpkg"].arrayBuffer()));
    const rivers = new Map();
    const rs = rdb.prepare("SELECT HYRIV_ID, NEXT_DOWN, in_nepal, geom FROM rivers");
    while (rs.step()) { const [id, nd, inn, g] = rs.get(); rivers.set(id, { nd, inn, c: GPKG.parse(g).coordinates }); }
    rs.free(); rdb.close();
    status("");
    start({ m03, m04, r05, wards, rivers, names: Object.keys(files) });
  }

  // drop vertices closer than ~20 m to the previous kept one (display only)
  function thin(g) {
    const t = 0.0002;
    const ring = (r) => { if (r.length < 8) return r.map(([x, y]) => [y, x]); const o = [[r[0][1], r[0][0]]]; let [px, py] = r[0];
      for (let i = 1; i < r.length - 1; i++) { const [x, y] = r[i]; if (Math.abs(x - px) > t || Math.abs(y - py) > t) { o.push([y, x]); px = x; py = y; } }
      o.push([r[r.length - 1][1], r[r.length - 1][0]]); return o; };
    if (g.type === "Polygon") return [g.coordinates.map(ring)];
    if (g.type === "MultiPolygon") return g.coordinates.map((p) => p.map(ring));
    return [];
  }
  const hav = (a, b) => { const R = 6371.0088, r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r;
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

  function start(D) {
    // ---- index data
    const mon03 = new Map(D.m03.map((r) => [r.monitor_id, r]));
    const river = D.m03.filter((r) => r.type === "river" && r.lat).map((r) => ({ id: r.monitor_id, bid: r.bipad_id, name: r.name, basin: r.basin,
      lat: +r.lat, lon: +r.lon, dist: r.district_name, muni: r.muni_name, hrs: num(r.hours_since_reading), last: r.last_reading_at }));
    const rain = D.m03.filter((r) => r.type === "rain" && r.lat).map((r) => ({ id: r.monitor_id, bid: r.bipad_id, name: r.name, lat: +r.lat, lon: +r.lon, dist: r.district_name, hrs: num(r.hours_since_reading) }));
    const byId = new Map(river.map((r) => [r.id, r]));
    const snapshot = D.m03.find((r) => r.snapshot_at)?.snapshot_at || "n/a";
    const rows05 = D.r05.map((r) => ({ id: r.monitor_id, km: +r.river_km, order: +r.ward_order, code: r.ward_code, d: r.district_name, m: r.muni_name,
      w: r.ward_no, n: +r.n_markets || 0, mk: r.markets || "" }));
    const meta05 = new Map();
    for (const r of D.r05) if (!meta05.has(r.monitor_id)) meta05.set(r.monitor_id, { hy: +r.hyriv_id, snap: r.snap_method, up: +r.snapped_upland_skm,
      sd: +r.snap_dist_m, pkm: +r.path_km, end: r.path_end });
    for (const r of river) r.m5 = meta05.get(r.id);
    const mkByWard = {};
    for (const m of D.m04) if (m.ward_code) (mkByWard[m.ward_code] ||= []).push(m);
    const wardCenter = {};
    for (const [c, polys] of Object.entries(D.wards)) { let a = 1e9, b = 1e9, x = -1e9, y = -1e9;
      for (const p of polys) for (const [la, lo] of p[0]) { a = Math.min(a, la); x = Math.max(x, la); b = Math.min(b, lo); y = Math.max(y, lo); }
      wardCenter[c] = [((a + x) / 2).toFixed(5), ((b + y) / 2).toFixed(5)]; }

    // downstream line for a monitor: snapped reach from the monitor's projection, then NEXT_DOWN
    const pathCache = new Map();
    function fullPath(r) {
      if (pathCache.has(r.id)) return pathCache.get(r.id);
      const out = []; const m = r.m5; if (!m || !D.rivers.has(m.hy)) { pathCache.set(r.id, out); return out; }
      const c0 = D.rivers.get(m.hy).c, kx = Math.cos(r.lat * Math.PI / 180);
      let best = 0, bd = Infinity, bp = c0[0];
      for (let i = 0; i < c0.length - 1; i++) { const [x1, y1] = c0[i], [x2, y2] = c0[i + 1]; const dx = (x2 - x1) * kx, dy = y2 - y1;
        let t = ((r.lon - x1) * kx * dx + (r.lat - y1) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t));
        const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1), d = ((r.lon - px) * kx) ** 2 + (r.lat - py) ** 2; if (d < bd) { bd = d; best = i; bp = [px, py]; } }
      let km = 0, prev = bp; out.push([bp[1], bp[0], 0]);
      const push = (pt) => { km += hav(prev, pt); out.push([pt[1], pt[0], km]); prev = pt; };
      for (let i = best + 1; i < c0.length; i++) push(c0[i]);
      let cur = m.hy, seen = new Set([cur]);
      while (km < KM_MAX + 1) { const nd = D.rivers.get(cur).nd; const nx = D.rivers.get(nd);
        if (!nd || !nx || seen.has(nd) || nx.inn === 0) break; for (let i = 1; i < nx.c.length; i++) push(nx.c[i]); seen.add(nd); cur = nd; }
      pathCache.set(r.id, out); return out;
    }
    function cutPath(path, km) {
      const out = [];
      for (let i = 0; i < path.length; i++) { const [la, lo, k] = path[i];
        if (k <= km) { out.push([la, lo]); continue; }
        if (i > 0) { const [pa, po, pk] = path[i - 1]; const t = (km - pk) / (k - pk || 1); out.push([pa + t * (la - pa), po + t * (lo - po)]); }
        break; }
      return out;
    }

    // ---- state and controls
    const st = { km: KM_DEF, hrs: H_DEF, basin: "", q: "", sel: null, shown: 300 };
    const basins = [...new Set(river.map((r) => r.basin).filter(Boolean))].sort();
    for (const b of basins) $("basin").insertAdjacentHTML("beforeend", `<option>${esc(b)}</option>`);
    const sync = () => { $("km").value = st.km; $("kmR").value = st.km; $("hrs").value = st.hrs; $("hrsR").value = st.hrs; };
    const clampSet = (key, max, el) => el.addEventListener("input", () => { let v = parseFloat(el.value); if (isNaN(v)) return; v = Math.max(0, Math.min(max, v)); st[key] = v; sync(); schedule(); });
    clampSet("km", KM_MAX, $("km")); clampSet("km", KM_MAX, $("kmR")); clampSet("hrs", H_MAX, $("hrs")); clampSet("hrs", H_MAX, $("hrsR"));
    $("basin").addEventListener("change", (e) => { st.basin = e.target.value; schedule(); });
    $("q").addEventListener("input", (e) => { st.q = e.target.value.trim().toLowerCase(); schedule(); });
    for (const id of ["lyMk", "lyRiver", "lyRain", "lyInRiver", "lyInRain"]) $(id).addEventListener("change", schedule);
    $("reset").addEventListener("click", () => { Object.assign(st, { km: KM_DEF, hrs: H_DEF, basin: "", q: "", sel: null }); $("basin").value = ""; $("q").value = ""; sync(); schedule(); });
    $("more").addEventListener("click", () => { st.shown += 300; renderTable(); });
    sync();
    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(update, 60); }

    // ---- map
    $("loader").hidden = true; $("app").hidden = false;
    const map = L.map("map", { preferCanvas: true }).setView([28.2, 84.1], 7);
    // OSM tiles need a Referer: fine on GitHub Pages / the local server, blocked when the page is opened from disk
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery &copy; Esri" });
    const gWards = L.layerGroup().addTo(map), gPaths = L.layerGroup().addTo(map), gMk = L.layerGroup().addTo(map),
          gRain = L.layerGroup().addTo(map), gMon = L.layerGroup().addTo(map);
    L.control.layers({ "OpenStreetMap": osm, "Satellite (Esri)": sat }, null, { collapsed: true }).addTo(map);
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => { const d = L.DomUtil.create("div", "legend"); d.innerHTML =
      `<div><i style="background:${css("--active")};border-radius:1px"></i>active river monitor</div><div><i style="background:${css("--inactive")};border-radius:1px"></i>inactive river monitor</div>` +
      `<div><i style="background:${css("--rain")}"></i>rain monitor</div><div><i style="background:${css("--market")}"></i>market</div>` +
      `<div><i style="background:${css("--path")};border-radius:1px;height:3px"></i>downstream river</div>` +
      `<div><i style="background:${css("--ward")};border:1px solid ${css("--ward-line")};border-radius:2px"></i>downstream place</div>`; return d; };
    legend.addTo(map);
    // current zoom, bottom right, and markets only from MK_MIN_ZOOM
    const zoomLbl = L.control({ position: "bottomright" });
    zoomLbl.onAdd = () => L.DomUtil.create("div", "zoomlbl");
    zoomLbl.addTo(map);
    const onZoom = () => { const z = map.getZoom(); zoomLbl.getContainer().textContent = "zoom " + z;
      if (z >= MK_MIN_ZOOM) map.addLayer(gMk); else map.removeLayer(gMk); };
    map.on("zoomend", onZoom); onZoom();
    // show/hide the downstream river path and the ward boundaries (the layers keep their content)
    const syncLayers = () => { for (const [id, g] of [["lyPath", gPaths], ["lyWards", gWards]]) { if ($(id).checked) map.addLayer(g); else map.removeLayer(g); } };
    for (const id of ["lyPath", "lyWards"]) $(id).addEventListener("change", syncLayers);
    // flood hazard (METEOR / Fathom): live tiles, depth in metres; layer name = type + return period, e.g. fd-1in100
    const FLOOD_URL = "https://maps.meteor-project.org/mapproxy/npl-flood/wmts/{l}/webmercator/{z}/{x}/{y}.png";
    // METEOR depth classes (m) and colours, the same for every flood layer; drawn here so the legend matches the other map legends
    const FLOOD_CLASSES = [["#f86700", "0.1"], ["#cbcbff", "1"], ["#9999ff", "2"], ["#5a5ae1", "3"], ["#3434ff", "4"], ["#0000ff", "5"], ["#dd34e2", "permanent water"]];
    const floodName = () => $("floodType").value + "-" + $("floodRp").value;
    const flood = L.tileLayer(FLOOD_URL, { l: floodName(), opacity: 0.7, maxNativeZoom: 15, maxZoom: 19,
      attribution: 'Flood hazard &copy; <a href="https://maps.meteor-project.org/map/flood-npl/" target="_blank" rel="noopener">METEOR</a> / Fathom (ODbL)' });
    const floodLegend = L.control({ position: "bottomleft" });
    floodLegend.onAdd = () => { const d = L.DomUtil.create("div", "legend floodleg");
      d.innerHTML = `<div class="ft">Flood depth (m)</div>` +
        FLOOD_CLASSES.map(([c, t]) => `<div><i style="background:${c};border-radius:1px;opacity:.8"></i>${t}</div>`).join(""); return d; };
    const syncFlood = () => {
      const on = $("lyFlood").checked;
      flood.options.l = floodName(); flood.redraw();   // setUrl() skips the redraw when the template is unchanged
      if (on) { map.addLayer(flood); if (!floodLegend._map) floodLegend.addTo(map); }
      else { map.removeLayer(flood); if (floodLegend._map) floodLegend.remove(); }
    };
    $("lyFlood").addEventListener("change", syncFlood);
    // changing the type or rarity turns the layer on, so the choice always has a visible effect
    for (const id of ["floodType", "floodRp"]) $(id).addEventListener("change", () => { $("lyFlood").checked = true; syncFlood(); });
    // selection box: says how to filter, and resets the filter (the only way to clear it besides Reset)
    const selBox = L.control({ position: "topright" });
    selBox.onAdd = () => { const d = L.DomUtil.create("div", "mapsel"); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      d.addEventListener("click", (e) => { if (e.target.closest("button")) { st.sel = null; update(); map.closePopup(); map.setView([28.2, 84.1], 7); } }); return d; };
    selBox.addTo(map);

    const isActive = (r) => r.hrs != null && r.hrs <= st.hrs;
    function monPopup(r) {
      const m = r.m5;
      return `<b>${esc(r.name)}</b><br>${esc(r.basin || "")} basin · ${esc(r.muni || "")}, ${esc(r.dist || "")}` +
        `<br>last reading: ${esc(r.last || "n/a")} (${r.hrs == null ? "n/a" : r.hrs.toFixed(1) + " h before snapshot"})` +
        (m ? `<br>snapped: ${esc(m.snap)}, ${fmt(m.up)} km² upstream, ${Math.round(m.sd)} m away<br>path in 05: ${m.pkm.toFixed(1)} km (${esc(m.end)})` : `<br><i>not in 05 (inactive at the 05 run)</i>`) +
        `<br>${bLink("river", r.bid)}`;
    }

    // ---- compute + render
    let rows = [], curMon = [];
    function compute() {
      const q = st.q; rows = []; const per = new Map();
      for (const x of rows05) {
        const r = byId.get(x.id); if (!r || !isActive(r) || x.km > st.km || (st.basin && r.basin !== st.basin)) continue;
        if (q && ![r.id, r.name, r.dist, r.muni, x.d, x.m].some((s) => String(s || "").toLowerCase().includes(q))) continue;
        rows.push({ r, ...x }); per.set(r, (per.get(r) || 0) + 1);
      }
      curMon = [...per.entries()].sort((a, b) => a[0].id.localeCompare(b[0].id));
    }
    function update() {
      compute();
      if (st.sel && !curMon.some(([r]) => r.id === st.sel)) st.sel = null;
      st.shown = 300;
      renderTiles(); renderSel(); renderMap(); renderTable();
    }
    const visRows = () => (st.sel ? rows.filter((x) => x.r.id === st.sel) : rows);
    function renderTiles() {
      const wset = new Map(); for (const x of rows) wset.set(x.code, x);
      const pal = new Set(rows.map((x) => x.d + "|" + x.m)), dist = new Set(rows.map((x) => x.d));
      let mk = 0, wmk = 0; for (const x of wset.values()) { mk += x.n; if (x.n) wmk++; }
      const actR = river.filter(isActive).length;
      $("tiles").innerHTML = `<b>${fmt(actR)}</b> of ${fmt(river.length)} river monitors active · <b>${fmt(wset.size)}</b> downstream places · ` +
        `<b>${fmt(pal.size)}</b> palikas in ${fmt(dist.size)} districts · <b>${fmt(mk)}</b> markets (in ${fmt(wmk)} wards)`;
    }
    function renderSel() {
      const d = selBox.getContainer(), cur = st.sel && curMon.find(([r]) => r.id === st.sel);
      d.innerHTML = cur ? `<b>${esc(cur[0].name)}</b><div class="muted">${cur[1]} downstream places</div><button class="btn" type="button">Show all monitors</button>`
        : `<span class="muted">Click a river monitor to show only its wards</span>`;
    }
    // clicking a monitor marker filters map + table to its wards and zooms there
    function selectMonitor(id) {
      st.sel = id; update();
      const r = byId.get(id); const p = cutPath(fullPath(r), Math.min(st.km, r.m5 ? r.m5.pkm : st.km));
      const b = L.latLngBounds(p.length ? p : [[r.lat, r.lon]]); for (const x of visRows()) { const g = D.wards[x.code]; if (g) b.extend(L.polygon(g).getBounds()); }
      map.fitBounds(b.pad(0.15), { maxZoom: 14 });
      const mk = monMarkers.get(id); if (mk) mk.openPopup();
    }
    const monMarkers = new Map();
    let tipTimer = null; const wardTip = L.tooltip({ direction: "top", className: "wardtip" });
    // details tooltip once the mouse has rested on a map object for 1.2 s
    function hoverTip(layer, html) {
      return layer.on("mouseover", (e) => { clearTimeout(tipTimer); tipTimer = setTimeout(() => wardTip.setLatLng(e.latlng).setContent(html).addTo(map), 1200); })
        .on("mouseout", () => { clearTimeout(tipTimer); map.removeLayer(wardTip); });
    }
    function renderMap() {
      gWards.clearLayers(); gPaths.clearLayers(); gMk.clearLayers(); gRain.clearLayers(); gMon.clearLayers();
      const wardC = css("--ward"), pathC = css("--path"), vis = visRows();
      const wset = new Map(); for (const x of vis) if (!wset.has(x.code)) wset.set(x.code, x);
      const wInfo = new Map(); for (const x of vis) { const i = wInfo.get(x.code) || { km: x.km, mons: new Set() }; i.km = Math.min(i.km, x.km); i.mons.add(x.r.name); wInfo.set(x.code, i); }
      for (const [c, x] of wset) { const g = D.wards[c]; if (!g) continue; const [la, lo] = wardCenter[c];
        const wi = wInfo.get(c), tipHtml = `<b>Municipality: ${esc(x.m)}</b><br>Ward - ${esc(x.w)}<br>${esc(x.d)}<br>${wi.km.toFixed(1)} km downstream` +
          (x.n ? `<br>Markets: ${x.n}<br><span style='opacity:.75'>${esc(x.mk.split(";").slice(0, 6).join("; "))}${x.n > 6 ? " …" : ""}</span>` : "");
        const poly = L.polygon(g, { color: css("--ward-line"), weight: 1.2, fillColor: wardC, fillOpacity: 0.35 });
        hoverTip(poly, tipHtml);
        poly.bindPopup(`${tipHtml}<br>${gLink(la, lo)}`).addTo(gWards); }
      const monShown = st.sel ? curMon.filter(([r]) => r.id === st.sel) : curMon;
      for (const [r] of monShown) { const p = cutPath(fullPath(r), Math.min(st.km, r.m5 ? r.m5.pkm : st.km)); if (p.length > 1) L.polyline(p, { color: pathC, weight: 3, opacity: 0.9 }).addTo(gPaths); }
      if ($("lyMk").checked) for (const c of wset.keys()) for (const m of mkByWard[c] || [])
        hoverTip(L.circleMarker([+m.lat, +m.lon], { radius: 4, color: css("--market"), weight: 1, fillOpacity: 0.85 }), `<b>${esc(m.name || "[unnamed market]")}</b><br>${esc((m.category || "").replace(/_/g, " "))}`)
          .bindPopup(`<b>${esc(m.name || "[unnamed]")}</b><br>${esc((m.category || "").replace(/_/g, " "))}<br>${gLink(m.lat, m.lon)}`).addTo(gMk);
      for (const r of rain) {
        const a = r.hrs != null && r.hrs <= st.hrs; if (!(a ? $("lyRain").checked : $("lyInRain").checked)) continue;
        hoverTip(L.circleMarker([r.lat, r.lon], { radius: 4, color: a ? css("--rain") : css("--inactive"), weight: 1, fillOpacity: a ? 0.8 : 0.3 }), `<b>${esc(r.name)}</b><br>rain monitor · ${esc(r.dist || "")}<br>${r.hrs == null ? "no reading" : "last reading " + r.hrs.toFixed(1) + " h before snapshot"}`)
          .bindPopup(`<b>${esc(r.name)}</b><br>rain monitor · ${esc(r.dist || "")}<br>${r.hrs == null ? "no reading" : r.hrs.toFixed(1) + " h before snapshot"}<br>${bLink("rain", r.bid)}`).addTo(gRain);
      }
      const shownIds = new Set(monShown.map(([r]) => r.id)), withWards = new Set(curMon.map(([r]) => r.id));
      monMarkers.clear();
      for (const r of river) {
        const a = isActive(r);
        if (!(a ? $("lyRiver").checked : $("lyInRiver").checked)) continue;
        if (st.sel && r.id !== st.sel) continue;
        // square markers like BIPAD's river stations; the selected monitor is larger with a dark outline
        const big = st.sel === r.id, s = big ? 16 : shownIds.has(r.id) ? 12 : 9;
        const mk = L.marker([r.lat, r.lon], { icon: L.divIcon({ className: "monsq" + (a ? "" : " off") + (big ? " sel" : ""), iconSize: [s, s], popupAnchor: [0, -s / 2] }),
          zIndexOffset: a ? 1000 : 0 });
        hoverTip(mk, `<b>${esc(r.name)}</b><br>river monitor · ${esc(r.basin || "")} basin<br>${esc(r.dist || "")}<br>${r.hrs == null ? "no reading" : (a ? "active" : "inactive") + ", last reading " + r.hrs.toFixed(1) + " h before snapshot"}`);
        mk.bindPopup(monPopup(r)).addTo(gMon);
        monMarkers.set(r.id, mk);
        if (withWards.has(r.id) && r.id !== st.sel) mk.on("click", () => selectMonitor(r.id));
      }
    }
    function renderTable() {
      const vis = visRows();
      $("rowCount").textContent = `(${fmt(vis.length)} rows · ≤ ${st.km} km · active ≤ ${st.hrs} h)`;
      document.querySelector("#tbl tbody").innerHTML = vis.slice(0, st.shown).map((x) => { const r = x.r, c = wardCenter[x.code];
        return `<tr><td>${r.bid ? `<a href="${bipadRec("river", r.bid)}" target="_blank" rel="noopener" title="BIPAD station record">${esc(r.name)}</a>` : esc(r.name)}</td><td>${esc(r.basin || "")}</td><td>${esc((r.last || "").slice(0, 16).replace("T", " "))}</td>` +
          `<td>${esc(x.d)}</td><td>${esc(x.m)}</td><td class="num">${esc(x.w)}</td><td class="num">${x.km.toFixed(2)}</td><td class="num">${x.n}</td>` +
          `<td class="mk">${esc(x.mk.split(";").slice(0, 6).join("; "))}${x.n > 6 ? " …" : ""}</td><td>${c ? `<a href="${gmaps(c[0], c[1])}" target="_blank" rel="noopener">Google Maps</a>` : ""}</td></tr>`; }).join("")
        || `<tr><td colspan="10" class="muted">No rows for these parameters.</td></tr>`;
      $("more").hidden = vis.length <= st.shown;
    }
    $("dl").addEventListener("click", () => {
      const q = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const head = ["monitor_id", "bipad_id", "monitor_name", "basin", "monitor_lat", "monitor_lon", "last_reading_at", "hours_since_reading",
        "ward_order", "district_name", "muni_name", "ward_no", "ward_code", "river_km", "n_markets", "markets"];
      const lines = [head.join(",")].concat(visRows().map((x) => { const r = x.r;
        return [r.id, r.bid, r.name, r.basin, r.lat, r.lon, r.last, r.hrs, x.order, x.d, x.m, x.w, x.code, x.km, x.n, x.mk].map(q).join(","); }));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const name = `downstream_places_${st.km}km_${st.hrs}h${st.sel ? "_" + st.sel : ""}.csv`;
      // Chrome/Edge: ask where to save; other browsers fall back to a normal download
      if (window.showSaveFilePicker) {
        window.showSaveFilePicker({ suggestedName: name, types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }] })
          .then(async (h) => { const w = await h.createWritable(); await w.write(blob); await w.close(); })
          .catch((err) => { if (err && err.name !== "AbortError") console.error(err); });
        return;
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $("foot").innerHTML = `BIPAD snapshot: <b>${esc(snapshot)}</b> (the active window counts back from this time).`;
    update();
  }
})();
