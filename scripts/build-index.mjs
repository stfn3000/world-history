#!/usr/bin/env node
// Regenerates src/data/snapshots.json and src/data/polity-index.json from the
// `index.json` published by aourednik/historical-basemaps.
//
//   node scripts/build-index.mjs                 # downloads index.json from jsDelivr
//   node scripts/build-index.mjs ./index.json    # or reads a local copy
//
// snapshots.json   -> the list of years for which a border map exists
// polity-index.json -> { years: [...], names: { "Venice": [i, j, ...] } }
//                      (indices into `years`), used by search to find the
//                      years in which a polity appears on the map.

import { readFile, writeFile } from 'node:fs/promises';
import { BASEMAP_COMMIT } from './basemap-source.mjs';

const src = process.argv[2];
const text = src
  ? await readFile(src, 'utf8')
  : await (await fetch(`https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAP_COMMIT}/index.json`)).text();
const index = JSON.parse(text);

const years = index.years.map((y) => y.year).sort((a, b) => a - b);
const snapshots = index.years
  .map((y) => ({ year: y.year, file: y.filename, count: y.countries.length }))
  .sort((a, b) => a.year - b.year);

const names = {};
for (const y of index.years) {
  const i = years.indexOf(y.year);
  for (const n of y.countries) {
    if (!n) continue;
    (names[n] ||= []).push(i);
  }
}
for (const n of Object.keys(names)) names[n].sort((a, b) => a - b);

await writeFile(new URL('../src/data/snapshots.json', import.meta.url), JSON.stringify(snapshots, null, 1) + '\n');
await writeFile(new URL('../src/data/polity-index.json', import.meta.url), JSON.stringify({ years, names }) + '\n');
console.log(`Wrote ${snapshots.length} snapshots and ${Object.keys(names).length} polity names.`);
