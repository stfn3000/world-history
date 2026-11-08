# 🌍 Chronoglobe — the world at any moment in history

An interactive 3D globe for answering the question *"what else was going on in the world at that time?"*

Drag a timeline from 10,000 BC to today and watch the borders of the world change. Click any territory to read what was happening there **in that year**; click an event icon (⚔️ battles, 📜 treaties, 👑 rulers, 🌋 disasters, ⛵ voyages …) to read about it. Every blurb links out to Wikipedia, YouTube, Britannica and more.

Pick any moment — the rise of the Mongols, the height of Mali, the Inca conquests, the age of revolutions — and see what every other part of the world was doing at the same time. Try clicking a territory, then hit **🗞️ World now** to see everything happening around the globe in that period, grouped by region.

## Features

- **3D globe** (three.js via [globe.gl](https://github.com/vasturiano/globe.gl)) with the borders of 1,600+ states, changing year by year from 3400 BC to 2024 (Cliopatria) — including city-states like Genoa, Pisa and Florence and realms like the Holy Roman Empire drawn as outlines around their members — plus approximate maps back to 10,000 BC.
- **Two-level time control**
  - a big, non-linear year slider (recent centuries get more room) with era bands and a tick for every curated event,
  - a fine month/day slider (far left = the whole year); once a date is picked, events later in the year are dimmed,
  - step buttons (±1/10/100 years), click the year to type one in (BC/AD), ▶ play at 1–100 years/second, ← → keys.
- **Territories**: hover for the name, click for
  - a hand-written, *year-specific* summary for ~160 states and peoples on every continent (e.g. China in 1450 → "The Ming dynasty", Mali in 1330 → "The empire of gold"), with a clickable timeline of all its periods,
  - the Wikipedia lead section, fetched live,
  - events that happened inside its borders around that time, and "meanwhile elsewhere",
  - links: Wikipedia, "History of …", YouTube searches, Britannica, the Wikipedia page for that year.
- **Events**: ~400 curated events from every region with dates, places, summaries, "why it matters" notes and links, plus (optional, on by default) **notable battles, sieges, revolutions, treaties and disasters loaded live from Wikidata** for whatever period you are looking at.
- **🗞️ World now**: everything on record in the current window, grouped by region (Europe, Middle East & North Africa, East Asia, Americas …), plus the largest powers on the map.
- **Search** across events and every territory name in the border dataset; it jumps to the right year and flies to it.
- **Shareable URLs** — the year, date and open panel are kept in the address bar (e.g. `#y=1571&d=280&e=lepanto`).
- Works on phones (bottom-sheet panel, compact timeline).

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
```

Border maps are downloaded on demand from the jsDelivr CDN (pinned to a specific commit of the dataset). To keep a local copy — for offline use or to avoid the CDN — run:

```bash
npm run fetch-basemaps   # ~70 MB into public/basemaps/ (git-ignored)
```

The app automatically uses `public/basemaps/` when it exists.

### Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. Enable it once in the repository's **Settings → Pages → Build and deployment → Source: GitHub Actions**. The build uses relative paths, so it works at `https://<user>.github.io/<repo>/`.

## Data and how to add to it

| What | Where | Source |
| --- | --- | --- |
| States and their borders, 3400 BC – 2024, year by year | `public/borders/` (built by `scripts/build-borders.mjs`; coordinates rounded and simplified) | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria), Seshat Global History Databank ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) — see [the paper](https://doi.org/10.1038/s41597-025-04516-9) |
| Maps before 3400 BC, and peoples without a state | fetched at runtime; index in `src/data/snapshots.json`, `src/data/polity-index.json` | [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0) |
| Curated events | `src/data/events/*.json` | written for this app |
| Territory summaries | `src/data/polities/*.json` | written for this app |
| Extra events | live from the Wikidata SPARQL endpoint | Wikidata (CC0) |
| Territory descriptions | live from the Wikipedia REST API | Wikipedia (CC BY-SA) |
| Globe textures | `public/img/` | from the three-globe examples (NASA Blue Marble) |

**Add an event** — append an object to any file in `src/data/events/` (files are just grouped by era):

```json
{
  "id": "waitangi",
  "year": 1840, "month": 2, "day": 6,
  "title": "Treaty of Waitangi",
  "type": "treaty",
  "lat": -35.27, "lng": 174.08, "place": "Waitangi, New Zealand",
  "importance": 2,
  "summary": "British representatives and over 500 Māori chiefs sign…",
  "significance": "(optional) why it matters",
  "wiki": "Treaty_of_Waitangi"
}
```

- `year` is negative for BC (`-490` = 490 BC); there is no year 0. Optional: `endYear`, `approx: true` (shows "c."), `links: [{ "label", "url", "icon" }]`, `youtube` (a custom YouTube search query).
- `type` is one of: battle, siege, war, treaty, founding, fall, ruler, revolution, exploration, science, religion, culture, disaster, plague, politics, trade, monument, assassination, space.
- `importance` 1–3 controls icon size and ordering.

**Add a territory summary** — add to `src/data/polities/*.json`:

```json
{ "names": ["Mali", "Mali Empire"], "wiki": "Mali_Empire",
  "eras": [ { "from": 1235, "to": 1360, "title": "The empire of gold", "text": "…" } ] }
```

`names` must match the `NAME` used in the border dataset (search `src/data/polity-index.json`); the era containing the selected year is shown, or the nearest one.

Run `npm run validate` to check the data files.

## How the text is sourced

Every event summary and territory period in `src/data` cites the Wikipedia articles it is based on (`sources`), shown as numbered citations at the end of the text. Each text was checked against the full text of its cited articles: every year, number and proper name it contains, and at least 80% of its other significant words, had to appear in the sources; flagged texts were reread against the article and corrected or rewritten (about 200 of 737 were changed, including several wrong figures). Wikipedia article titles were confirmed on Wikidata, and event dates compared with Wikidata's records. "Learn more" also links each entry's Encyclopaedia Britannica article where Wikidata records one; Britannica is not cited, because its pages could not be checked automatically. Text loaded live from Wikipedia and Wikidata is labelled as such.

When adding entries, include `sources` (`{ "title", "url", "publisher" }`) for the articles the text is based on.

## Caveats

- All historical borders are approximate, and Cliopatria maps states only; peoples without a state come from coarser snapshot maps.
- Dates before about 500 BC are often approximate or debated, and the summaries are short by design — follow the links for depth.
- Wikidata and Wikipedia are queried live from your browser; if they are unreachable, the curated content still works.

## License

The app's code and the curated events and summaries are offered under the MIT license. `public/borders/` is adapted from Cliopatria (Seshat Global History Databank), licensed CC BY 4.0: coordinates are rounded and simplified, nothing else is changed. The snapshot maps are © André Ourednik and contributors, GPL-3.0, and are downloaded from their repository at runtime (or by `npm run fetch-basemaps`). Wikipedia text is CC BY-SA; Wikidata is CC0.
