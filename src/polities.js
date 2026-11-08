// Curated, year-aware summaries of territories.
//
// Each file in src/data/polities is an array of entries:
//   { names: ["Mali", ...], wiki: "Mali_Empire", eras: [{ from, to, text }] }
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

/**
 * Curated entry for a map feature in `year`: tries its own name, then the
 * realm it belongs to. An entry's optional `only` limits a name to a range of
 * years, for names that cover different states at different times.
 */
export function polityFor(feature, year) {
  for (const n of [feature.name, feature.memberOf, feature.subjecto, feature.partof]) {
    if (!n) continue;
    const p = byName.get(n.toLowerCase());
    if (!p) continue;
    const lim = p.only && Object.entries(p.only).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1];
    if (lim && year != null && (year < lim[0] || year > lim[1])) continue;
    return { polity: p, via: n === feature.name ? null : n };
  }
  return null;
}

export function polityByName(name) {
  return byName.get(String(name).toLowerCase()) || null;
}

/** The period of a polity that contains `year`, or null. */
export function eraFor(polity, year) {
  if (!polity?.eras?.length) return null;
  const a = toAstro(year);
  const era = polity.eras.find((e) => a >= toAstro(e.from) && a <= toAstro(e.to));
  return era ? { era, exact: true } : null;
}
