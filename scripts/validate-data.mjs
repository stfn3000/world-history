#!/usr/bin/env node
// Sanity-checks the curated data in src/data. Run with `npm run validate`.
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../src/data/', import.meta.url);
const TYPES = new Set(['battle', 'siege', 'war', 'treaty', 'founding', 'fall', 'ruler', 'revolution', 'exploration', 'science', 'religion', 'culture', 'disaster', 'plague', 'politics', 'trade', 'monument', 'assassination', 'space', 'other']);
const errors = [];
const warnings = [];

async function loadDir(dir) {
  const out = [];
  for (const f of (await readdir(new URL(dir, root))).filter((f) => f.endsWith('.json')).sort()) {
    try {
      out.push([f, JSON.parse(await readFile(new URL(`${dir}/${f}`, root), 'utf8'))]);
    } catch (e) {
      errors.push(`${dir}/${f}: invalid JSON — ${e.message}`);
    }
  }
  return out;
}

// ---- events
const ids = new Set();
let nEvents = 0;
for (const [file, list] of await loadDir('events')) {
  if (!Array.isArray(list)) { errors.push(`${file}: not an array`); continue; }
  for (const e of list) {
    nEvents++;
    const where = `${file} ${e.id || e.title}`;
    for (const k of ['id', 'year', 'title', 'type', 'lat', 'lng', 'summary']) if (e[k] == null || e[k] === '') errors.push(`${where}: missing ${k}`);
    if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
    ids.add(e.id);
    if (!/^[a-z0-9-]+$/.test(e.id || '')) errors.push(`${where}: id should be kebab-case`);
    if (!TYPES.has(e.type)) errors.push(`${where}: unknown type "${e.type}"`);
    if (!Number.isInteger(e.year) || e.year === 0) errors.push(`${where}: year must be a non-zero integer`);
    if (e.endYear != null && (!Number.isInteger(e.endYear) || e.endYear < e.year)) errors.push(`${where}: bad endYear`);
    if (e.month != null && !(e.month >= 1 && e.month <= 12)) errors.push(`${where}: bad month`);
    if (e.day != null && !(e.day >= 1 && e.day <= 31 && e.month)) errors.push(`${where}: bad day`);
    if (!(Math.abs(e.lat) <= 90 && Math.abs(e.lng) <= 180)) errors.push(`${where}: bad coordinates`);
    if (e.importance != null && ![1, 2, 3].includes(e.importance)) errors.push(`${where}: importance must be 1–3`);
    if (!e.wiki) warnings.push(`${where}: no wiki link`);
    if (e.wiki && /\s/.test(e.wiki)) warnings.push(`${where}: wiki title has spaces (use underscores)`);
  }
}

// ---- polities
const index = JSON.parse(await readFile(new URL('polity-index.json', root), 'utf8'));
const mapNames = new Set(Object.keys(index.names).map((n) => n.toLowerCase()));
const seenNames = new Map();
let nPolities = 0, nEras = 0, matched = 0;
for (const [file, list] of await loadDir('polities')) {
  for (const p of list) {
    nPolities++;
    const where = `${file} ${p.names?.[0]}`;
    if (!Array.isArray(p.names) || !p.names.length) errors.push(`${where}: names[] required`);
    if (!p.wiki) warnings.push(`${where}: no wiki title`);
    for (const n of p.names || []) {
      const k = n.toLowerCase();
      if (seenNames.has(k) && seenNames.get(k) !== where) errors.push(`${where}: name "${n}" also used by ${seenNames.get(k)}`);
      seenNames.set(k, where);
      if (mapNames.has(k)) matched++;
    }
    if (!(p.names || []).some((n) => mapNames.has(n.toLowerCase()))) warnings.push(`${where}: none of its names appear on any border map`);
    for (const e of p.eras || []) {
      nEras++;
      if (!(Number.isInteger(e.from) && Number.isInteger(e.to) && e.from < e.to)) errors.push(`${where}: bad era range ${e.from}–${e.to}`);
      if (!e.text) errors.push(`${where}: era without text`);
    }
  }
}

for (const w of warnings) console.warn('warn:', w);
for (const e of errors) console.error('ERROR:', e);
console.log(`\n${nEvents} events, ${nPolities} territory entries (${nEras} periods, ${matched} names matched on maps). ${errors.length} errors, ${warnings.length} warnings.`);
process.exit(errors.length ? 1 : 0);
