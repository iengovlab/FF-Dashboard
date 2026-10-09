/* Minimal GeoPackage geometry reader: GPKG header + WKB (Point, LineString, Polygon,
   Multi*), XY only (Z/M ordinates skipped). Returns GeoJSON-style geometry objects. */
window.GPKG = (function () {
  "use strict";
  const ENV = [0, 32, 48, 48, 64];
  function parse(blob) {
    const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
    if (u8[0] !== 0x47 || u8[1] !== 0x50) throw new Error("not a GPKG geometry");
    const flags = u8[3];
    if (flags & 0x10) return null; // empty geometry
    const off = 8 + ENV[(flags >> 1) & 7];
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let p = off;
    function readGeom() {
      const le = dv.getUint8(p) === 1; p += 1;
      let t = dv.getUint32(p, le); p += 4;
      let dims = 2;
      if (t & 0x80000000) dims++; if (t & 0x40000000) dims++; // EWKB Z/M flags
      t &= 0x0fffffff;
      if (t > 3000) { dims = 4; t -= 3000; } else if (t > 2000) { dims = 3; t -= 2000; } else if (t > 1000) { dims = 3; t -= 1000; }
      const pt = () => { const x = dv.getFloat64(p, le), y = dv.getFloat64(p + 8, le); p += 8 * dims; return [x, y]; };
      const line = () => { const n = dv.getUint32(p, le); p += 4; const a = new Array(n); for (let i = 0; i < n; i++) a[i] = pt(); return a; };
      const poly = () => { const n = dv.getUint32(p, le); p += 4; const a = new Array(n); for (let i = 0; i < n; i++) a[i] = line(); return a; };
      const multi = () => { const n = dv.getUint32(p, le); p += 4; const a = []; for (let i = 0; i < n; i++) a.push(readGeom().coordinates); return a; };
      switch (t) {
        case 1: return { type: "Point", coordinates: pt() };
        case 2: return { type: "LineString", coordinates: line() };
        case 3: return { type: "Polygon", coordinates: poly() };
        case 4: return { type: "MultiPoint", coordinates: multi() };
        case 5: return { type: "MultiLineString", coordinates: multi() };
        case 6: return { type: "MultiPolygon", coordinates: multi() };
        default: throw new Error("unsupported WKB type " + t);
      }
    }
    return readGeom();
  }
  return { parse };
})();
