#!/usr/bin/env node
// Converts the Cliopatria dataset (Seshat Global History Databank, CC BY 4.0)
// into small files the app can load year by year.
//
//   1. Download cliopatria.geojson.zip from
//      https://github.com/Seshat-Global-History-Databank/cliopatria and unzip it.
//   2. node scripts/build-borders.mjs path/to/cliopatria_polities_only_vXXX.geojson
//
// Output (public/borders/):
//   index.json        one row per (polity, year range): name, years, type,
//                     Wikipedia / Wikidata ids, umbrella polity, shard number
//   shard-<n>.json    unique geometries, stored in the 50-year bucket of the
//                     first row that uses them, keyed by geometry id
//
// Changes made to the data: coordinates are rounded to 2 decimals (~1 km),
// repeated points and degenerate rings are dropped, and rows with identical
// borders share one stored geometry. Names, dates and links are unchanged.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-borders.mjs <cliopatria geojson>');
  process.exit(1);
}
const BUCKET = 50;
const out = new URL('../public/borders/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const data = JSON.parse(await readFile(src, 'utf8'));
const round = (v) => Math.round(v * 100) / 100;

function cleanRing(ring) {
  const r = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    const last = r[r.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) r.push(p);
  }
  return r.length >= 4 ? r : null;
}
function cleanGeometry(g) {
  if (!g) return null;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])
    .map((rings) => {
      const outer = cleanRing(rings[0]);
      if (!outer) return null;
      return [outer, ...rings.slice(1).map(cleanRing).filter(Boolean)];
    })
    .filter(Boolean);
  if (!polys.length) return null;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

const rows = [];
const shards = new Map();
const geomIds = new Map(); // geometry JSON -> [geometry id, shard]
let nextGeom = 0;
for (const f of data.features) {
  const p = f.properties;
  const geometry = cleanGeometry(f.geometry);
  if (!geometry) continue;
  const key = JSON.stringify(geometry);
  let entry = geomIds.get(key);
  if (!entry) {
    entry = [nextGeom++, Math.floor(p.FromYear / BUCKET)];
    geomIds.set(key, entry);
    if (!shards.has(entry[1])) shards.set(entry[1], {});
    shards.get(entry[1])[entry[0]] = geometry;
  }
  const [geomId, shard] = entry;
  rows.push([
    p.Name,
    p.FromYear,
    p.ToYear,
    p.Type === 'RELATION' ? 'R' : 'P',
    p.Wikipedia || '',
    p.Wikidata || '',
    p.MemberOf || '',
    Math.round(p.Area || 0),
    shard,
    geomId,
  ]);
}

await writeFile(
  new URL('index.json', out),
  JSON.stringify({
    source: 'Cliopatria (Seshat Global History Databank)',
    url: 'https://github.com/Seshat-Global-History-Databank/cliopatria',
    license: 'CC BY 4.0',
    bucket: BUCKET,
    fields: ['name', 'from', 'to', 'type', 'wikipedia', 'wikidata', 'memberOf', 'areaKm2', 'shard', 'geometry'],
    rows,
  }),
);
let bytes = 0;
for (const [n, geoms] of shards) {
  const s = JSON.stringify(geoms);
  bytes += s.length;
  await writeFile(new URL(`shard-${n}.json`, out), s);
}
console.log(`${rows.length} rows, ${nextGeom} unique geometries, ${shards.size} shards, ${(bytes / 1e6).toFixed(1)} MB of geometry`);
