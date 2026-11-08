// Renders the side panel: territory details, event details, and the
// "world right now" overview.
import { formatYear, formatEventDate, centuryLabel, wikiYearTitle, toAstro, eraName } from './time.js';
import { typeInfo, REGIONS, wikiUrl, youtubeSearch, britannicaSearch, wikiSearch } from './events.js';
import { polityFor, eraFor } from './polities.js';
import { polityWikiSummary, wikiSummary } from './wiki.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const link = (href, label, icon) =>
  `<a class="link-chip" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon ? `<span>${icon}</span>` : ''}${esc(label)}</a>`;

function eventItem(e, { showRegion = false } = {}) {
  const t = typeInfo(e.type);
  return `<li><button class="ev-item${e.source === 'wikidata' ? ' wd' : ''}" data-event="${esc(e.id)}" style="--c:${t.color}">
    <span class="ev-ico">${t.icon}</span>
    <span class="ev-text"><span class="ev-title">${esc(e.title)}</span>
    <span class="ev-date">${esc(formatEventDate(e))}${showRegion ? ` · ${esc(e.region)}` : ''}${e.source === 'wikidata' ? ' · <i>Wikidata</i>' : ''}</span></span>
  </button></li>`;
}

function rangeLabel(year, w) {
  if (!w) return formatYear(year);
  const a = toAstro(year);
  const from = a - w <= 0 ? a - w - 1 : a - w;
  const to = a + w <= 0 ? a + w - 1 : a + w;
  return `${formatYear(from)} – ${formatYear(to)}`;
}

function polityLinks(name, wikiTitle, year) {
  const century = centuryLabel(year);
  return [
    wikiTitle ? link(wikiUrl(wikiTitle), `Wikipedia: ${wikiTitle.replace(/_/g, ' ')}`, '📖') : link(wikiSearch(name), `Search Wikipedia for “${name}”`, '📖'),
    link(wikiSearch(`History of ${name}`), `History of ${name}`, '📚'),
    link(youtubeSearch(`${name} history ${century}`), `YouTube: ${name} in the ${century}`, '▶️'),
    link(youtubeSearch(`history of ${name} documentary`), 'YouTube documentaries', '🎬'),
    link(britannicaSearch(name), 'Britannica', '🏛️'),
    link(wikiUrl(wikiYearTitle(year)), `What else happened in ${formatYear(year)}`, '🗓️'),
  ].join('');
}

/** Territory panel. ctx = { year, window, snapshotYear, eventsHere, eventsElsewhere } */
export function renderTerritory(el, f, ctx, app) {
  const match = polityFor(f);
  const polity = match?.polity;
  const eraInfo = polity ? eraFor(polity, ctx.year) : null;
  const relation = [
    f.subjecto ? `Under <b>${esc(f.subjecto)}</b>` : '',
    f.partof && f.partof !== f.subjecto ? `Part of <b>${esc(f.partof)}</b>` : '',
  ].filter(Boolean).join(' · ');
  const precision = ['', 'approximate borders', 'moderately precise borders', 'borders fixed by treaty / law'][f.precision] || '';

  let eraHtml = '';
  if (eraInfo) {
    const { era, exact } = eraInfo;
    eraHtml = `<section class="era-card">
      <div class="kicker">${exact ? `In ${esc(formatYear(ctx.year))}` : `Nearest period on record`}${match.via ? ` · about ${esc(match.via)}` : ''}</div>
      <h3>${esc(era.title || '')} <span class="muted">${esc(formatYear(era.from))} – ${esc(formatYear(era.to))}</span></h3>
      <p>${esc(era.text)}</p>
    </section>`;
    if (polity.eras.length > 1) {
      eraHtml += `<details class="era-list"><summary>Timeline of ${esc(polity.names[0])} (${polity.eras.length} periods)</summary><ol>
        ${polity.eras
          .map(
            (e) => `<li class="${e === era ? 'current' : ''}"><button data-jump="${Math.round((toAstro(e.from) + toAstro(e.to)) / 2)}" title="Jump to this period">
            <span class="muted">${esc(formatYear(e.from))} – ${esc(formatYear(e.to))}</span> ${esc(e.title || '')}</button></li>`,
          )
          .join('')}
      </ol></details>`;
    }
  }

  el.innerHTML = `
    <div class="kicker">Territory · ${esc(eraName(ctx.year))}</div>
    <h2>${esc(f.name)}</h2>
    ${relation ? `<div class="relation">${relation}</div>` : ''}
    <div class="muted small">Borders from the c. ${esc(formatYear(ctx.snapshotYear))} map${precision ? ` · ${precision}` : ''}</div>
    ${eraHtml}
    <section class="wiki-card" id="wiki-card"><div class="loading">Loading from Wikipedia…</div></section>
    <section>
      <h4>Events here <span class="muted">${esc(rangeLabel(ctx.year, ctx.window))}</span></h4>
      ${ctx.eventsHere.length ? `<ul class="ev-list">${ctx.eventsHere.map((e) => eventItem(e)).join('')}</ul>` : `<p class="muted small">No events on record inside these borders for this period. Try widening the event window (🗺️ Layers) or moving the slider.</p>`}
    </section>
    <section>
      <h4>Meanwhile elsewhere</h4>
      ${ctx.eventsElsewhere.length ? `<ul class="ev-list">${ctx.eventsElsewhere.slice(0, 8).map((e) => eventItem(e, { showRegion: true })).join('')}</ul>` : '<p class="muted small">Nothing else on record for this period.</p>'}
      <button class="text-btn" data-action="overview">See the whole world in ${esc(formatYear(ctx.year))} →</button>
    </section>
    <section>
      <h4>Learn more</h4>
      <div class="links">${polityLinks(f.name, polity?.wiki, ctx.year)}</div>
    </section>`;

  wire(el, app);

  const token = (el.dataset.token = String(Math.random()));
  const hint = f.subjecto ? `${f.subjecto}` : 'kingdom history';
  const p = polity?.wiki ? wikiSummary(polity.wiki) : polityWikiSummary(f.name, hint);
  p.then((s) => {
    if (el.dataset.token !== token) return;
    const card = el.querySelector('#wiki-card');
    if (!card) return;
    if (!s) {
      card.innerHTML = `<p class="muted small">No Wikipedia summary found automatically. ${link(wikiSearch(f.name), 'Search Wikipedia', '🔎')}</p>`;
      return;
    }
    card.innerHTML = `
      ${s.thumbnail ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy" />` : ''}
      <div class="kicker">From Wikipedia · ${esc(s.title)}</div>
      <p>${esc(s.extract)}</p>
      <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Read the full article →</a>`;
  });
}

/** Event panel. ctx = { year, ruler (feature|null), nearby: [] } */
export function renderEvent(el, e, ctx, app) {
  const t = typeInfo(e.type);
  const links = [];
  const wTitle = e.wiki ? wikiUrl(e.wiki) : e.wikiUrl;
  if (wTitle) links.push(link(wTitle, 'Wikipedia article', '📖'));
  else links.push(link(wikiSearch(e.title), 'Search Wikipedia', '📖'));
  for (const l of e.links || []) links.push(link(l.url, l.label, l.icon || '🔗'));
  links.push(link(youtubeSearch(e.youtube || `${e.title} ${e.year < 0 ? formatYear(e.year) : e.year} history`), 'YouTube videos', '▶️'));
  links.push(link(britannicaSearch(e.title), 'Britannica', '🏛️'));
  if (e.wikidata) links.push(link(`https://www.wikidata.org/wiki/${e.wikidata}`, 'Wikidata', '🗃️'));
  links.push(link(wikiUrl(wikiYearTitle(e.year)), `Everything in ${formatYear(e.year)}`, '🗓️'));

  el.innerHTML = `
    <div class="kicker" style="--c:${t.color}"><span class="type-dot"></span>${t.icon} ${esc(t.label)} · ${esc(e.region)}</div>
    <h2>${esc(e.title)}</h2>
    <div class="ev-meta">🗓️ ${esc(formatEventDate(e))}${e.place ? ` &nbsp;·&nbsp; 📍 ${esc(e.place)}` : ''}</div>
    <section class="summary" id="ev-summary">${e.summary ? `<p>${esc(e.summary)}</p>` : ''}</section>
    ${e.significance ? `<section class="significance"><h4>Why it matters</h4><p>${esc(e.significance)}</p></section>` : ''}
    ${ctx.ruler ? `<section><h4>Whose land was this?</h4><button class="terr-chip" data-action="ruler" style="--c:hsl(${ctx.ruler.color.h} ${ctx.ruler.color.s}% ${ctx.ruler.color.l}%)">${esc(ctx.ruler.name)}${ctx.ruler.subjecto ? ` <span class="muted">(${esc(ctx.ruler.subjecto)})</span>` : ''} →</button><div class="muted small">on the c. ${esc(formatYear(ctx.snapshotYear))} border map</div></section>` : ''}
    ${ctx.nearby.length ? `<section><h4>Around the same time</h4><ul class="ev-list">${ctx.nearby.map((n) => eventItem(n, { showRegion: true })).join('')}</ul></section>` : ''}
    <section><h4>Learn more</h4><div class="links">${links.join('')}</div></section>
    ${e.source === 'wikidata' ? '<p class="muted small">This event was loaded live from Wikidata; its short description comes from there.</p>' : ''}`;

  wire(el, app, { ruler: ctx.ruler });

  // Wikidata events only have a one-line description: pull in the article lead.
  if (e.source === 'wikidata' && e.wikiUrl) {
    const token = (el.dataset.token = String(Math.random()));
    const title = decodeURIComponent(e.wikiUrl.split('/wiki/')[1] || '');
    wikiSummary(title).then((s) => {
      if (!s || el.dataset.token !== token) return;
      const box = el.querySelector('#ev-summary');
      if (box) box.innerHTML = `<p>${esc(s.extract)}</p>${s.thumbnail ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy" />` : ''}`;
    });
  } else {
    el.dataset.token = '';
  }
}

/** "World now" overview. ctx = { year, window, events, powers: [feature] } */
export function renderOverview(el, ctx, app) {
  const groups = new Map(REGIONS.map((r) => [r, []]));
  for (const e of ctx.events) (groups.get(e.region) || groups.get('Europe')).push(e);
  const regionHtml = [...groups.entries()]
    .filter(([, list]) => list.length)
    .map(
      ([r, list]) => `<section><h4>${esc(r)} <span class="muted">${list.length}</span></h4>
      <ul class="ev-list">${list
        .sort((a, b) => b.importance - a.importance || a.astro - b.astro)
        .slice(0, 12)
        .sort((a, b) => a.astro - b.astro || (a.month || 0) - (b.month || 0))
        .map((e) => eventItem(e))
        .join('')}</ul></section>`,
    )
    .join('');

  el.innerHTML = `
    <div class="kicker">The world · ${esc(eraName(ctx.year))}</div>
    <h2>${esc(rangeLabel(ctx.year, ctx.window))}</h2>
    <p class="muted small">Everything on record within ${ctx.window ? `±${ctx.window} year${ctx.window > 1 ? 's' : ''}` : 'this year'} of ${esc(formatYear(ctx.year))}, grouped by region. Change the window in 🗺️ Layers.</p>
    ${ctx.powers.length ? `<section><h4>Largest powers on the map</h4><div class="power-list">${ctx.powers
      .map((f, i) => `<button class="terr-chip" data-power="${i}" style="--c:hsl(${f.color.h} ${f.color.s}% ${f.color.l}%)">${esc(f.name)}</button>`)
      .join('')}</div></section>` : ''}
    ${regionHtml || '<p class="muted">No events on record for this period yet — try a wider window.</p>'}
    <section><h4>Learn more about this time</h4><div class="links">
      ${link(wikiUrl(wikiYearTitle(ctx.year)), `Wikipedia: ${formatYear(ctx.year)}`, '🗓️')}
      ${link(wikiUrl(centuryLabel(ctx.year).replace(/ /g, '_')), `Wikipedia: ${centuryLabel(ctx.year)}`, '📖')}
      ${link(youtubeSearch(`world history ${centuryLabel(ctx.year)}`), `YouTube: the world in the ${centuryLabel(ctx.year)}`, '▶️')}
    </div></section>`;
  wire(el, app, { powers: ctx.powers });
}

function wire(el, app, extra = {}) {
  el.querySelectorAll('[data-event]').forEach((b) => b.addEventListener('click', () => app.openEventById(b.dataset.event)));
  el.querySelectorAll('[data-jump]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = +b.dataset.jump;
      app.setYear(a <= 0 ? a - 1 : a, { keepPanel: true });
    }),
  );
  el.querySelectorAll('[data-action="overview"]').forEach((b) => b.addEventListener('click', () => app.openOverview()));
  el.querySelectorAll('[data-action="ruler"]').forEach((b) => b.addEventListener('click', () => app.openTerritory(extra.ruler, { fly: false })));
  el.querySelectorAll('[data-power]').forEach((b) => b.addEventListener('click', () => app.openTerritory(extra.powers[+b.dataset.power], { fly: true })));
}
