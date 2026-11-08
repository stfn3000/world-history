// Search across curated events, curated territory summaries and every polity
// name that appears on any border map.
import { esc } from './panel.js';
import { typeInfo, EVENTS } from './events.js';
import { POLITIES } from './polities.js';
import { formatYear, formatEventDate } from './time.js';
import polityIndex from './data/polity-index.json';
import { SNAPSHOTS } from './basemaps.js';

const minYear = SNAPSHOTS[0].year;

const polityEntries = Object.entries(polityIndex.names)
  .map(([name, idx]) => ({ name, years: idx.map((i) => polityIndex.years[i]).filter((y) => y >= minYear) }))
  .filter((p) => p.years.length);

// Curated aliases (e.g. "Republic of Venice" → "Venice") so searches find the map name.
const aliasToMap = new Map();
for (const p of POLITIES) {
  const onMap = p.names.find((n) => polityIndex.names[n]);
  if (onMap) for (const n of p.names) aliasToMap.set(n.toLowerCase(), onMap);
  if (onMap && p.wiki) aliasToMap.set(p.wiki.replace(/_/g, ' ').toLowerCase(), onMap);
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
    if (s) out.push({ kind: 'polity', score: s + Math.min(10, p.years.length), polity: p });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}

export function setupSearch(app) {
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
        const ys = r.polity.years;
        const span = ys.length > 1 ? `${formatYear(ys[0])} – ${formatYear(ys[ys.length - 1])}` : formatYear(ys[0]);
        return `<button class="sr${i === active ? ' active' : ''}" data-i="${i}"><span class="sr-ico">🗺️</span><span><b>${esc(r.polity.name)}</b><small>${r.alias ? `“${esc(r.alias)}” · ` : ''}Territory on maps ${esc(span)} (${ys.length} map${ys.length > 1 ? 's' : ''})</small></span></button>`;
      })
      .join('');
    box.hidden = false;
  }

  function choose(r) {
    if (!r) return;
    box.hidden = true;
    input.blur();
    if (r.kind === 'event') app.openEvent(r.event, { jump: true, fly: true });
    else app.openPolityByName(r.polity.name, r.polity.years);
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
