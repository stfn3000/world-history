// Search across curated events and every territory on the maps: the
// Cliopatria states (year ranges) and the peoples/cultures of
// historical-basemaps (snapshot years).
import { esc } from './panel.js';
import { typeInfo, EVENTS } from './events.js';
import { POLITIES } from './polities.js';
import { formatYear, formatEventDate } from './time.js';
import polityIndex from './data/polity-index.json';
import { polityRanges, NON_STATE, CLIOPATRIA_START } from './borders.js';

let polityEntries = [];
const aliasToMap = new Map();

// Peoples / cultures from the snapshot maps (and everything before Cliopatria starts).
const basemapEntries = Object.entries(polityIndex.names)
  .map(([name, idx]) => ({ name, years: idx.map((i) => polityIndex.years[i]).filter((y) => y >= -10000) }))
  .map((p) => ({ name: p.name, ranges: p.years.filter((y) => y < CLIOPATRIA_START || NON_STATE.test(p.name)).map((y) => [y, y]) }))
  .filter((p) => p.ranges.length);

export async function loadSearchIndex() {
  const ranges = await polityRanges();
  const byName = new Map(basemapEntries.map((p) => [p.name, p]));
  for (const [name, r] of ranges) byName.set(name, { name, ranges: r });
  polityEntries = [...byName.values()];
  // Curated aliases (e.g. "Venice" → "Republic of Venice") so searches find the map name.
  for (const p of POLITIES) {
    const onMap = p.names.find((n) => byName.has(n));
    if (!onMap) continue;
    for (const n of p.names) if (!byName.has(n)) aliasToMap.set(n.toLowerCase(), onMap);
    if (p.wiki) aliasToMap.set(p.wiki.replace(/_/g, ' ').toLowerCase(), onMap);
  }
}

function score(text, q) {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const i = t.indexOf(q);
  if (i < 0) return 0;
  return /\W/.test(t[i - 1] || ' ') ? 60 : 30;
}

export function search(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const e of EVENTS) {
    const s = Math.max(score(e.title, q), score(e.place || '', q) * 0.6, (e.tags || []).some((t) => t.toLowerCase().includes(q)) ? 40 : 0);
    if (s) out.push({ kind: 'event', score: s + (e.importance || 2) * 3, event: e });
  }
  const seen = new Set();
  for (const [alias, mapName] of aliasToMap) {
    const s = score(alias, q);
    if (s && !seen.has(mapName)) {
      seen.add(mapName);
      const entry = polityEntries.find((p) => p.name === mapName);
      if (entry) out.push({ kind: 'polity', score: s + 12, polity: entry, alias: alias.toLowerCase() !== mapName.toLowerCase() ? alias : null });
    }
  }
  for (const p of polityEntries) {
    if (seen.has(p.name)) continue;
    const s = score(p.name, q);
    if (s) out.push({ kind: 'polity', score: s + Math.min(10, p.ranges.length), polity: p });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}

export function setupSearch(app) {
  loadSearchIndex().catch((err) => console.warn('search index', err));
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-results');
  let results = [];
  let active = -1;

  function render() {
    if (!results.length) {
      box.innerHTML = input.value.trim().length >= 2 ? '<div class="sr-empty">No matches</div>' : '';
      box.hidden = input.value.trim().length < 2;
      return;
    }
    box.innerHTML = results
      .map((r, i) => {
        if (r.kind === 'event') {
          const t = typeInfo(r.event.type);
          return `<button class="sr${i === active ? ' active' : ''}" data-i="${i}"><span class="sr-ico">${t.icon}</span><span><b>${esc(r.event.title)}</b><small>${esc(formatEventDate(r.event))}${r.event.place ? ' · ' + esc(r.event.place) : ''}</small></span></button>`;
        }
        const rs = r.polity.ranges;
        const a = rs[0][0], b = rs[rs.length - 1][1];
        const span = a === b ? formatYear(a) : `${formatYear(a)} – ${formatYear(b)}`;
        return `<button class="sr${i === active ? ' active' : ''}" data-i="${i}"><span class="sr-ico">🗺️</span><span><b>${esc(r.polity.name)}</b><small>${r.alias ? `“${esc(r.alias)}” · ` : ''}On the map ${esc(span)}</small></span></button>`;
      })
      .join('');
    box.hidden = false;
  }

  function choose(r) {
    if (!r) return;
    box.hidden = true;
    input.blur();
    if (r.kind === 'event') app.openEvent(r.event, { jump: true, fly: true });
    else app.openPolityByName(r.polity.name, r.polity.ranges);
  }

  input.addEventListener('input', () => {
    results = search(input.value);
    active = results.length ? 0 : -1;
    render();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { choose(results[active]); ev.preventDefault(); }
    else if (ev.key === 'Escape') { box.hidden = true; input.blur(); }
  });
  input.addEventListener('focus', () => { if (results.length) box.hidden = false; });
  box.addEventListener('mousedown', (ev) => {
    const b = ev.target.closest('[data-i]');
    if (b) { ev.preventDefault(); choose(results[+b.dataset.i]); }
  });
  document.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('.search')) box.hidden = true;
  });
}
