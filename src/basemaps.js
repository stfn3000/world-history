// Loads historical border snapshots from aourednik/historical-basemaps.
import { geoArea, geoCentroid } from 'd3-geo';
import snapshots from './data/snapshots.json';

export const BASEMAP_COMMIT = '4b5039e50d8d2464b065bd76ad6086cd4597108d';
const REMOTE_SOURCES = [
  `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAP_COMMIT}/geojson/`,
  `https://raw.githubusercontent.com/aourednik/historical-basemaps/${BASEMAP_COMMIT}/geojson/`,
];
const LOCAL_BASE = `${import.meta.env.BASE_URL}basemaps/`;

// The 123,000 BC map is a curiosity (hominin ranges); we start at 10,000 BC.
export const SNAPSHOTS = snapshots.filter((s) => s.year >= -10000);

/** The latest snapshot at or before `year` (or the earliest one). */
export function snapshotFor(year) {
  let best = SNAPSHOTS[0];
  for (const s of SNAPSHOTS) if (s.year <= year) best = s;
  return best;
}

let sourcesPromise;
function sources() {
  // Prefer a local copy (npm run fetch-basemaps) when one exists.
  sourcesPromise ||= fetch(`${LOCAL_BASE}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (m && Array.isArray(m.files) ? [LOCAL_BASE, ...REMOTE_SOURCES] : REMOTE_SOURCES))
    .catch(() => REMOTE_SOURCES);
  return sourcesPromise;
}

const cache = new Map();

export function loadSnapshot(snap) {
  if (!cache.has(snap.file)) {
    const p = (async () => {
      let lastErr;
      for (const base of await sources()) {
        try {
          const res = await fetch(base + snap.file);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return prepare(await res.json(), snap);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('No basemap source reachable');
    })();
    p.catch(() => cache.delete(snap.file));
    cache.set(snap.file, p);
  }
  return cache.get(snap.file);
}

/** Warm the cache for the neighbouring snapshots so scrubbing feels instant. */
export function prefetchAround(snap) {
  const i = SNAPSHOTS.indexOf(snap);
  for (const j of [i + 1, i - 1]) if (SNAPSHOTS[j]) loadSnapshot(SNAPSHOTS[j]).catch(() => {});
}

// ---- colours -------------------------------------------------------------
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hand-picked hues for a few long-lived powers so they stay recognisable as
// you scrub through time. Everything else gets a stable hashed hue.
const FIXED_HUES = {
  'Roman Empire': 0, 'Roman Republic': 0, 'Western Roman Empire': 0, 'Byzantine Empire': 285, 'Eastern Roman Empire': 285,
  'Ottoman Empire': 140, 'Holy Roman Empire': 45, 'Kingdom of France': 225, France: 225, 'Kingdom of England': 350,
  'British Empire': 350, 'Kingdom of Great Britain': 350, 'United Kingdom': 350, 'Spanish Empire': 30, 'Kingdom of Spain': 30,
  'Crown of Castile': 30, 'Kingdom of Portugal': 120, 'Portuguese Empire': 120, 'Russian Empire': 165, 'Tsardom of Russia': 165,
  'Union of Soviet Socialist Republics': 0, 'Mongol Empire': 20, 'Yuan Dynasty': 20, 'Han Dynasty': 55, 'Tang Dynasty': 55,
  'Ming Dynasty': 55, 'Qing Dynasty': 55, "People's Republic of China": 55, 'Achaemenid Empire': 270, 'Abbasid Caliphate': 95,
  'Umayyad Caliphate': 95, 'Mughal Empire': 75, 'Papal States': 50, 'United States of America': 215, 'Japan': 330,
  'Republic of Venice': 205, 'Republic of Genoa': 0, 'Mali Empire': 35, 'Inca Empire': 300, 'Aztec Triple Alliance': 160,
};

/**
 * Colour for a territory. `group` (an empire or overlord) decides the hue so
 * members of one realm look related; `own` varies saturation and lightness.
 */
export function colorFor(group, own = group) {
  const h = FIXED_HUES[group] ?? FIXED_HUES[own] ?? (hash(group) % 360);
  const s = 55 + (hash(own + 's') % 25);
  const l = 50 + (hash(own + 'l') % 14);
  return { h, s, l };
}
export const hsla = ({ h, s, l }, a, dl = 0) => `hsla(${h}, ${s}%, ${Math.min(90, l + dl)}%, ${a})`;

// ---- geometry prep
// d3-geo expects exterior rings clockwise (the opposite of RFC 7946). A
// polygon wound the "wrong" way is read as covering the rest of the sphere,
// which breaks area, centroid and point-in-polygon tests, so flip those.
export function rewind(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polys) {
    if (!rings.length) continue;
    if (geoArea({ type: 'Polygon', coordinates: [rings[0]] }) > 2 * Math.PI) {
      for (const r of rings) r.reverse();
    }
  }
}
export function largestPart(geometry) {
  if (geometry.type === 'Polygon') return geometry;
  let best = null, bestArea = -1;
  for (const coords of geometry.coordinates) {
    const g = { type: 'Polygon', coordinates: coords };
    const a = geoArea(g);
    if (a > bestArea && a < 2 * Math.PI) { best = g; bestArea = a; }
  }
  return best || { type: 'Polygon', coordinates: geometry.coordinates[0] };
}

function prepare(geojson, snap) {
  const features = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    if (!p.NAME || !f.geometry) continue;
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    rewind(f.geometry);
    let area = geoArea(f);
    if (area > 2 * Math.PI) area = 0;
    const main = largestPart(f.geometry);
    const [lng, lat] = geoCentroid(main);
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: p,
      name: p.NAME,
      subjecto: p.SUBJECTO && p.SUBJECTO !== p.NAME ? p.SUBJECTO : null,
      partof: p.PARTOF && p.PARTOF !== p.NAME ? p.PARTOF : null,
      precision: p.BORDERPRECISION || 1,
      area,
      color: colorFor(p.SUBJECTO || p.NAME, p.NAME),
      kind: 'map',
      wikipedia: null,
      center: { lat, lng },
      snapshot: snap.year,
    });
  }
  // Big polygons first so small ones render above them.
  features.sort((a, b) => b.area - a.area);
  return features;
}
