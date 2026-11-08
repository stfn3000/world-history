// Live lookups against Wikipedia and Wikidata (both allow CORS).
import { toAstro } from './time.js';
import { regionOf } from './events.js';

const summaryCache = new Map();

/**
 * Fetches the lead summary of a Wikipedia article.
 * Returns { title, extract, url, thumbnail } or null.
 */
export function wikiSummary(title) {
  if (!title) return Promise.resolve(null);
  const key = title.replace(/ /g, '_');
  if (!summaryCache.has(key)) {
    const p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}?redirect=true`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || j.type === 'disambiguation' || !j.extract) return null;
        return {
          title: j.title,
          extract: j.extract,
          url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${key}`,
          thumbnail: j.thumbnail?.source || null,
        };
      })
      .catch(() => null);
    summaryCache.set(key, p);
  }
  return summaryCache.get(key);
}

const searchCache = new Map();
/** Best-matching article title for a free-text query (or null). */
export function wikiSearchTitle(query) {
  if (!searchCache.has(query)) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(query)}`;
    searchCache.set(
      query,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.query?.search?.[0]?.title || null)
        .catch(() => null),
    );
  }
  return searchCache.get(query);
}

/**
 * Resolve a polity name from the border dataset (e.g. "Kanem-Bornu") to a
 * Wikipedia summary: try the name itself, then a search.
 */
export async function polityWikiSummary(name, hint) {
  const direct = await wikiSummary(name);
  if (direct && !/may refer to/i.test(direct.extract)) return direct;
  const t = await wikiSearchTitle(`${name} ${hint || 'history'}`);
  return t ? wikiSummary(t) : null;
}

// ---- Wikidata: extra events with coordinates ----------------------------
// Battles, sieges, revolutions, earthquakes, eruptions … that have a date and a
// location on Wikidata. Popularity (number of Wikipedia language editions) is
// used to keep only reasonably notable ones.
const WD_CLASSES = {
  Q178561: 'battle', // battle
  Q1261499: 'battle', // naval battle
  Q188055: 'siege', // siege
  Q10931: 'revolution', // revolution
  Q124734: 'revolution', // rebellion
  Q45382: 'revolution', // coup d'état
  Q7944: 'disaster', // earthquake
  Q7692360: 'disaster', // volcanic eruption
  Q3839081: 'disaster', // disaster
  Q3199915: 'assassination', // massacre
  Q131569: 'treaty', // treaty
};

const wdCache = new Map();

function wdDate(astroYear) {
  // Wikidata's SPARQL uses proleptic years where 1 BC = 0000 (astronomical).
  const y = astroYear;
  const sign = y < 0 ? '-' : '';
  return `${sign}${String(Math.abs(y)).padStart(4, '0')}-01-01T00:00:00Z`;
}

export function wikidataEvents(year, w) {
  const from = toAstro(year) - w;
  const to = toAstro(year) + w + 1;
  const key = `${from}:${to}`;
  if (wdCache.has(key)) return wdCache.get(key);

  // Older periods have fewer, more famous items; ask for fewer sitelinks there.
  const minLinks = year < 1500 ? 6 : year < 1900 ? 10 : 14;
  const values = Object.keys(WD_CLASSES).map((q) => `wd:${q}`).join(' ');
  const query = `
SELECT ?item ?itemLabel ?itemDescription ?date ?coord ?class ?article ?sl WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class ;
        wdt:P625 ?coord ;
        wikibase:sitelinks ?sl .
  FILTER(?sl >= ${minLinks})
  { ?item wdt:P585 ?date } UNION { ?item wdt:P580 ?date }
  FILTER(?date >= "${wdDate(from)}"^^xsd:dateTime && ?date < "${wdDate(to)}"^^xsd:dateTime)
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sl)
LIMIT 120`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const p = fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
    .then((r) => {
      if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
      return r.json();
    })
    .then((j) => parseWikidata(j))
    .catch((err) => {
      wdCache.delete(key);
      throw err;
    });
  wdCache.set(key, p);
  return p;
}

function parseWikidata(j) {
  const seen = new Map();
  for (const b of j?.results?.bindings || []) {
    const id = b.item.value.split('/').pop();
    if (seen.has(id)) continue;
    const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord?.value || '');
    if (!m) continue;
    const lng = +m[1], lat = +m[2];
    // e.g. "+1453-05-29T00:00:00Z" or "-0490-09-12T00:00:00Z"
    const dm = /^([+-]?\d+)-(\d\d)-(\d\d)/.exec(b.date.value);
    if (!dm) continue;
    const astro = parseInt(dm[1], 10);
    const year = astro <= 0 ? astro - 1 : astro;
    const month = +dm[2], day = +dm[3];
    const label = b.itemLabel?.value || id;
    if (/^Q\d+$/.test(label)) continue; // no English label
    const cls = b.class.value.split('/').pop();
    const article = b.article?.value || null;
    seen.set(id, {
      id: `wd-${id}`,
      source: 'wikidata',
      wikidata: id,
      title: label,
      summary: b.itemDescription?.value || '',
      year,
      astro,
      astroEnd: astro,
      // Wikidata stores year-precision dates as 1 January; don't pretend we know the day.
      month: month === 1 && day === 1 ? undefined : month,
      day: month === 1 && day === 1 ? undefined : day,
      lat,
      lng,
      type: WD_CLASSES[cls] || 'other',
      wikiUrl: article,
      importance: +b.sl.value > 60 ? 2 : 1,
      sitelinks: +b.sl.value,
      region: regionOf(lat, lng),
    });
  }
  return [...seen.values()];
}
