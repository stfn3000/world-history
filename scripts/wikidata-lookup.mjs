#!/usr/bin/env node
// Looks up every Wikipedia title used in src/data on Wikidata, in batches:
// does the article exist (and under which title after redirects), its Wikidata
// id, its recorded dates and coordinates, and its Encyclopaedia Britannica id.
// Writes a JSON cache that scripts/add-sources.mjs and the date check use.
//
//   node scripts/wikidata-lookup.mjs <out.json>
import { readdir, readFile, writeFile } from 'node:fs/promises';

const UA = 'Chronoglobe/0.1 (https://github.com/stfn3000/world-history; educational history globe)';
const root = new URL('../src/data/', import.meta.url);
const titles = new Set();
for (const dir of ['events', 'polities']) {
  for (const f of await readdir(new URL(dir, root))) {
    for (const x of JSON.parse(await readFile(new URL(`${dir}/${f}`, root), 'utf8'))) if (x.wiki) titles.add(x.wiki.replace(/_/g, ' '));
  }
}
const list = [...titles];
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < list.length; i += 60) {
  const batch = list.slice(i, i + 60);
  const values = batch.map((t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`).join(' ');
  const q = `SELECT ?name ?item ?label ?brit ?date ?start ?end ?coord WHERE {
    VALUES ?name { ${values} }
    ?article schema:name ?name ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?item .
    OPTIONAL { ?item rdfs:label ?label FILTER(lang(?label) = "en") }
    OPTIONAL { ?item wdt:P1417 ?brit }
    OPTIONAL { ?item wdt:P585 ?date }
    OPTIONAL { ?item wdt:P580 ?start }
    OPTIONAL { ?item wdt:P582 ?end }
    OPTIONAL { ?item wdt:P625 ?coord }
  }`;
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (res.ok) break;
    await sleep(5000 * (attempt + 1));
  }
  if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
  for (const b of (await res.json()).results.bindings) {
    const t = b.name.value;
    const e = (out[t] ||= { qid: b.item.value.split('/').pop(), label: b.label?.value, brit: new Set(), dates: new Set(), coord: b.coord?.value });
    if (b.brit) e.brit.add(b.brit.value);
    for (const k of ['date', 'start', 'end']) if (b[k]) e.dates.add(`${k}:${b[k].value}`);
  }
  process.stderr.write(`${Math.min(i + 60, list.length)}/${list.length}\n`);
  await sleep(1500);
}
for (const e of Object.values(out)) { e.brit = [...e.brit]; e.dates = [...e.dates]; }
const missing = list.filter((t) => !out[t]);
await writeFile(process.argv[2], JSON.stringify({ found: out, missing }, null, 1));
console.log(`${Object.keys(out).length} found, ${missing.length} not found as Wikipedia titles`);
