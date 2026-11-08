// Curated, year-aware summaries of territories.
//
// Each file in src/data/polities is an array of entries:
//   { names: ["Venice", ...], wiki: "Republic_of_Venice", eras: [{ from, to, text }] }
// `names` are matched (case-insensitively) against the NAME / SUBJECTO
// properties of the border dataset.
import { toAstro } from './time.js';

const modules = import.meta.glob('./data/polities/*.json', { eager: true, import: 'default' });
export const POLITIES = Object.values(modules).flat();

const byName = new Map();
for (const p of POLITIES) {
  p.eras = (p.eras || []).slice().sort((a, b) => a.from - b.from);
  for (const n of p.names) byName.set(n.toLowerCase(), p);
}

/** Curated entry for a dataset feature, trying NAME, then SUBJECTO, then PARTOF. */
export function polityFor(feature) {
  for (const n of [feature.name, feature.subjecto, feature.partof]) {
    if (!n) continue;
    const p = byName.get(n.toLowerCase());
    if (p) return { polity: p, via: n === feature.name ? null : n };
  }
  return null;
}

export function polityByName(name) {
  return byName.get(String(name).toLowerCase()) || null;
}

/** The era of a polity that best describes `year` (the closest one if none contains it). */
export function eraFor(polity, year) {
  if (!polity?.eras?.length) return null;
  const a = toAstro(year);
  let best = null, bestD = Infinity;
  for (const e of polity.eras) {
    const f = toAstro(e.from), t = toAstro(e.to);
    const d = a < f ? f - a : a > t ? a - t : 0;
    if (d < bestD) { best = e; bestD = d; }
  }
  return { era: best, exact: bestD === 0, distance: bestD };
}
