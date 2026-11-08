#!/usr/bin/env node
// Optional: downloads every border snapshot into public/basemaps/ so the app
// works offline and doesn't depend on the jsDelivr CDN.
//
//   npm run fetch-basemaps                       # download from jsDelivr
//   npm run fetch-basemaps -- /path/to/clone     # copy from a local git clone
//
// When public/basemaps/manifest.json exists the app loads maps from there
// first and only falls back to the CDN if a file is missing.

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BASEMAP_COMMIT } from './basemap-source.mjs';

const snapshots = JSON.parse(await readFile(new URL('../src/data/snapshots.json', import.meta.url), 'utf8'));
const outDir = new URL('../public/basemaps/', import.meta.url);
await mkdir(outDir, { recursive: true });

const localClone = process.argv[2];
const base = `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAP_COMMIT}/geojson/`;

for (const s of snapshots) {
  const dest = new URL(s.file, outDir);
  if (localClone) {
    await copyFile(join(localClone, 'geojson', s.file), dest);
  } else {
    const res = await fetch(base + s.file);
    if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  console.log('✓', s.file);
}
await writeFile(new URL('manifest.json', outDir), JSON.stringify({ commit: BASEMAP_COMMIT, files: snapshots.map((s) => s.file) }, null, 1));
console.log(`Saved ${snapshots.length} maps to public/basemaps/`);
