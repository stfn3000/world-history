// Territories for any year.
//
// From 3400 BC on, states come from Cliopatria (Seshat Global History
// Databank, CC BY 4.0), which gives borders year by year (see
// scripts/build-borders.mjs). Cliopatria only maps states, so the
// historical-basemaps snapshots fill in two gaps:
//   - before 3400 BC, the whole map;
//   - afterwards, a faint layer of peoples and cultures without a state
//     ("Bantu peoples", "Plains bison hunters", ...).
import { geoArea, geoCentroid } from 'd3-geo';
import { snapshotFor, loadSnapshot, colorFor, rewind, largestPart } from './basemaps.js';

const BASE = `${import.meta.env.BASE_URL}borders/`;
export const CLIOPATRIA_START = -3400;

// Map regions in historical-basemaps that describe peoples, not states.
export const NON_STATE = /hunter|gatherer|farmers|peoples|cultures?\b|tribes|nomads|foragers|pastoral|fishers|fichers|aboriginal|chiefdoms|^(siberians|khoisan|thule|athabaskan|bantu peoples|sámi|saami|polynesians|papuans|innu|dorset|beothuk|ainu|celts|germanic tribes|arabs|austronesians|mon-khmer)$/i;

let indexPromise;
export function loadIndex() {
  indexPromise ||= fetch(`${BASE}index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`borders index: HTTP ${r.status}`);
      return r.json();
    })
    .then((j) =>
      j.rows.map(([name, from, to, type, wikipedia, wikidata, memberOf, areaKm2, shard, geom], id) => ({
        id, name, from, to, type, wikipedia, wikidata, memberOf, areaKm2, shard, geom,
      })),
    );
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

const shardCache = new Map();
function loadShard(n) {
  if (!shardCache.has(n)) {
    const p = fetch(`${BASE}shard-${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`borders shard ${n}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => shardCache.delete(n));
    shardCache.set(n, p);
  }
  return shardCache.get(n);
}

const stripParens = (s) => (s || '').replace(/^\((.*)\)$/, '$1');

function centerOf(geometry) {
  const [lng, lat] = geoCentroid(largestPart(geometry));
  return { lat, lng };
}

const featureCache = new Map();
function featureForRow(row, geometry) {
  if (featureCache.has(row.id)) return featureCache.get(row.id);
  // Several rows can share one geometry object; copy before rewinding.
  const g = JSON.parse(JSON.stringify(geometry));
  rewind(g);
  let area = geoArea(g);
  if (area > 2 * Math.PI) area = 0;
  const umbrella = row.name.startsWith('(');
  const name = stripParens(row.name);
  const memberOf = stripParens(row.memberOf) || null;
  const f = {
    type: 'Feature',
    geometry: g,
    kind: umbrella ? 'umbrella' : 'state',
    name,
    memberOf: memberOf && memberOf !== name ? memberOf : null,
    subjecto: memberOf && memberOf !== name ? memberOf : null,
    partof: null,
    wikipedia: row.wikipedia || null,
    wikidata: row.wikidata || null,
    from: row.from,
    to: row.to,
    precision: 2,
    area,
    color: colorFor(memberOf || name, name),
    center: centerOf(g),
    source: 'cliopatria',
  };
  featureCache.set(row.id, f);
  return f;
}

function cultureFeatures(mapFeatures) {
  return mapFeatures
    .filter((f) => NON_STATE.test(f.name))
    .map((f) => (f._culture ||= { ...f, kind: 'culture', source: 'basemaps' }));
}

/**
 * Everything to draw for `year`:
 * { features, source: 'cliopatria' | 'basemaps', note }
 * Features are ordered so that cultures are first, then states big → small,
 * then umbrella realms (drawn as outlines on top).
 */
export async function featuresForYear(year, { cultures = true } = {}) {
  const snap = snapshotFor(year);
  if (year < CLIOPATRIA_START) {
    const features = await loadSnapshot(snap);
    return { features, source: 'basemaps', snapshotYear: snap.year };
  }
  const rows = (await loadIndex()).filter((r) => r.type === 'P' && r.from <= year && year <= r.to);
  const shards = await Promise.all([...new Set(rows.map((r) => r.shard))].map(async (n) => [n, await loadShard(n)]));
  const byShard = new Map(shards);
  const states = [];
  const umbrellas = [];
  for (const r of rows) {
    const geometry = byShard.get(r.shard)?.[r.geom];
    if (!geometry) continue;
    const f = featureForRow(r, geometry);
    (f.kind === 'umbrella' ? umbrellas : states).push(f);
  }
  states.sort((a, b) => b.area - a.area);
  umbrellas.sort((a, b) => b.area - a.area);
  let peoples = [];
  if (cultures) {
    try {
      peoples = cultureFeatures(await loadSnapshot(snap));
    } catch {
      /* the cultures layer is optional */
    }
  }
  return { features: [...peoples, ...states, ...umbrellas], source: 'cliopatria', snapshotYear: snap.year };
}

/** Name → list of [from, to] year ranges, for search. */
export async function polityRanges() {
  const out = new Map();
  for (const r of await loadIndex()) {
    if (r.type !== 'P') continue;
    const n = stripParens(r.name);
    if (!out.has(n)) out.set(n, []);
    out.get(n).push([r.from, r.to]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a[0] - b[0]);
    // merge touching ranges
    for (let i = list.length - 1; i > 0; i--) {
      if (list[i][0] <= list[i - 1][1] + 1) {
        list[i - 1][1] = Math.max(list[i - 1][1], list[i][1]);
        list.splice(i, 1);
      }
    }
  }
  return out;
}

/** Warm the cache for a few years either side (makes scrubbing smoother). */
export async function prefetchAround(year) {
  if (year < CLIOPATRIA_START) return;
  const rows = await loadIndex();
  const near = new Set(rows.filter((r) => r.type === 'P' && r.from <= year + 50 && r.to >= year - 50).map((r) => r.shard));
  for (const n of near) loadShard(n).catch(() => {});
}
