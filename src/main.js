import './style.css';
import { geoContains } from 'd3-geo';
import { createGlobe } from './globe.js';
import { createTimeline } from './timeline.js';
import { snapshotFor, loadSnapshot, prefetchAround } from './basemaps.js';
import { EVENTS, EVENT_BY_ID, EVENT_TYPES, eventsInWindow, timeDistance } from './events.js';
import { renderTerritory, renderEvent, renderOverview, esc } from './panel.js';
import { setupSearch } from './search.js';
import { wikidataEvents } from './wiki.js';
import {
  clampYear, addYears, formatYear, eraName, centuryLabel, autoWindow, dayToMonthDay, monthDayToDay,
  formatMonthDay, formatEventDate, toAstro, MAX_YEAR,
} from './time.js';

const $ = (id) => document.getElementById(id);
// Cultural / ethnic regions in the border dataset that aren't states — kept
// out of the "largest powers" list.
const NON_STATE = /hunter|gatherer|farmers|peoples|cultures?\b|tribes|nomads|foragers|pastoral|fishers|fichers|aboriginal|chiefdoms|^(siberians|khoisan|thule|athabaskan|bantu peoples|sámi|saami|polynesians|papuans|innu|dorset|beothuk|ainu|celts|germanic tribes|arabs|austronesians|mon-khmer)$/i;

const state = {
  year: 1450,
  day: 0, // 0 = the whole year; 1..365 = a specific day
  windowMode: 'auto',
  showEvents: true,
  showWikidata: true,
  snapshot: null,
  features: [],
  wdEvents: [],
  wdStatus: '',
  panel: null, // { kind: 'territory'|'event'|'overview', feature?, event? }
  selectedEvent: null,
  playing: false,
};

// ---------------------------------------------------------------------------
const globeApi = createGlobe($('globe'), {
  onTerritoryClick: (f) => app.openTerritory(f, { fly: false }),
  onEventClick: (e) => app.openEvent(e, { fly: false }),
  onHover: (f) => showTooltip(f ? tooltipForFeature(f) : null),
  onEventHover: (e) => showTooltip(e ? tooltipForEvent(e) : null),
  onGlobeClick: () => {},
});

const timeline = createTimeline({
  events: EVENTS,
  onYear: (y, opts) => app.setYear(y, opts),
  onDay: (d) => app.setDay(d),
});

// ---- tooltip --------------------------------------------------------------
const tooltip = $('tooltip');
let mouse = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (!tooltip.hidden) positionTooltip();
});
function positionTooltip() {
  const pad = 14;
  const r = tooltip.getBoundingClientRect();
  let x = mouse.x + pad, y = mouse.y + pad;
  if (x + r.width > innerWidth - 8) x = mouse.x - r.width - pad;
  if (y + r.height > innerHeight - 8) y = mouse.y - r.height - pad;
  tooltip.style.transform = `translate(${x}px, ${y}px)`;
}
function showTooltip(html) {
  if (!html || matchMedia('(hover: none)').matches) { tooltip.hidden = true; return; }
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  positionTooltip();
}
function tooltipForFeature(f) {
  return `<b>${esc(f.name)}</b>${f.subjecto ? `<br><span>${esc(f.subjecto)}</span>` : ''}<div class="tt-hint">Click to read more</div>`;
}
function tooltipForEvent(e) {
  return `<b>${esc(e.title)}</b><br><span>${esc(formatEventDate(e))}</span>`;
}

// ---- status line ------------------------------------------------------------
let statusTimer;
function setStatus(msg, { sticky = false } = {}) {
  const el = $('status');
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
  clearTimeout(statusTimer);
  if (msg && !sticky) statusTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ---------------------------------------------------------------------------
const app = {
  currentWindow() {
    return state.windowMode === 'auto' ? autoWindow(state.year) : +state.windowMode;
  },

  /** All events (curated + Wikidata) in the current window. */
  visibleEvents() {
    const w = this.currentWindow();
    const list = state.showEvents ? eventsInWindow(EVENTS, state.year, w) : [];
    const wd = state.showWikidata ? eventsInWindow(state.wdEvents, state.year, w) : [];
    // Drop Wikidata items that duplicate a curated event's article.
    const curatedTitles = new Set(list.map((e) => (e.wiki || '').toLowerCase()));
    return [...list, ...wd.filter((e) => !curatedTitles.has(decodeURIComponent((e.wikiUrl || '').split('/wiki/')[1] || '').toLowerCase()))];
  },

  async setYear(y, opts = {}) {
    y = clampYear(y);
    const changed = y !== state.year;
    state.year = y;
    if (!opts.fromSlider) timeline.setYear(y);
    updateWhen();
    scheduleHash();
    refreshEvents();
    scheduleWikidata();
    const loading = this.ensureSnapshot();
    if (changed && state.panel?.kind === 'overview') this.openOverview();
    await loading;
  },

  setDay(d) {
    state.day = Math.max(0, Math.min(365, d || 0));
    timeline.setDay(state.day);
    updateWhen();
    refreshEvents();
    scheduleHash();
  },

  async ensureSnapshot() {
    const snap = snapshotFor(state.year);
    if (snap === state.snapshot && state.features.length) return;
    state.snapshot = snap;
    $('snapshot-display').innerHTML = `Borders: <b>c. ${esc(formatYear(snap.year))}</b> map`;
    setStatus(`Loading borders for c. ${formatYear(snap.year)}…`, { sticky: true });
    try {
      const features = await loadSnapshot(snap);
      if (state.snapshot !== snap) return; // user moved on
      state.features = features;
      globeApi.setFeatures(features);
      setStatus('');
      prefetchAround(snap);
      // Keep an open territory panel in sync with the new map.
      if (state.panel?.kind === 'territory') {
        const prev = state.panel.feature;
        const same = features.filter((f) => f.name === prev.name).sort((a, b) => b.area - a.area)[0];
        if (same) this.openTerritory(same, { fly: false, quiet: true });
        else this.openTerritory(prev, { fly: false, quiet: true, stale: true });
      }
      if (state.panel?.kind === 'event') this.openEvent(state.panel.event, { fly: false, quiet: true });
    } catch (err) {
      console.error(err);
      setStatus('Could not load the border map (offline?). Events still work.', { sticky: true });
    }
  },

  featureAt(lat, lng) {
    // Features are sorted big → small; prefer the smallest one containing the point.
    for (let i = state.features.length - 1; i >= 0; i--) {
      const f = state.features[i];
      try {
        if (geoContains(f, [lng, lat])) return f;
      } catch { /* malformed geometry */ }
    }
    return null;
  },

  openTerritory(f, { fly = false, quiet = false, stale = false } = {}) {
    if (!f) return;
    const w = this.currentWindow();
    const evs = this.visibleEvents();
    const here = [], elsewhere = [];
    for (const e of evs) {
      let inside = false;
      try { inside = !stale && geoContains(f, [e.lng, e.lat]); } catch { /* ignore */ }
      (inside ? here : elsewhere).push(e);
    }
    elsewhere.sort((a, b) => b.importance - a.importance || timeDistance(a, state.year, w) - timeDistance(b, state.year, w));
    state.panel = { kind: 'territory', feature: f };
    globeApi.setSelected(stale ? null : f);
    // A pulse helps find small territories (e.g. Venice) on a zoomed-out globe.
    globeApi.setRing(stale || f.area > 0.05 ? null : { lat: f.center.lat, lng: f.center.lng });
    state.selectedEvent = null;
    refreshPins();
    openPanel();
    renderTerritory($('panel-body'), f, {
      year: state.year, window: w, snapshotYear: state.snapshot?.year ?? f.snapshot, eventsHere: here, eventsElsewhere: elsewhere,
    }, app);
    if (stale) {
      $('panel-body').insertAdjacentHTML('afterbegin', `<div class="notice">“${esc(f.name)}” is not on the c. ${esc(formatYear(state.snapshot.year))} map — it may not exist yet, or be named differently.</div>`);
    }
    if (fly) globeApi.flyTo(f.center.lat, f.center.lng, f.area > 0.3 ? 2.2 : f.area > 0.02 ? 1.5 : 0.9);
    if (!quiet) scheduleHash();
  },

  async openEvent(e, { fly = true, jump = false, quiet = false } = {}) {
    if (!e) return;
    if (jump) {
      this.setDay(e.month ? monthDayToDay(e.month, e.day || 1) : 0);
      await this.setYear(e.year);
    }
    state.panel = { kind: 'event', event: e };
    state.selectedEvent = e;
    globeApi.setSelected(null);
    globeApi.setRing({ lat: e.lat, lng: e.lng });
    refreshPins();
    const ruler = this.featureAt(e.lat, e.lng);
    const w = Math.max(this.currentWindow(), 2);
    const nearby = eventsInWindow([...EVENTS, ...state.wdEvents], e.year, w)
      .filter((n) => n !== e)
      .sort((a, b) => b.importance - a.importance || Math.abs(a.astro - e.astro) - Math.abs(b.astro - e.astro))
      .slice(0, 6);
    openPanel();
    renderEvent($('panel-body'), e, { year: state.year, ruler, snapshotYear: state.snapshot?.year, nearby }, app);
    if (fly) globeApi.flyTo(e.lat, e.lng, 1.4);
    if (!quiet) scheduleHash();
  },

  openEventById(id) {
    const e = EVENT_BY_ID.get(id) || state.wdEvents.find((x) => x.id === id);
    if (!e) return;
    const inWindow = Math.abs(e.astro - toAstro(state.year)) <= this.currentWindow();
    this.openEvent(e, { fly: true, jump: !inWindow });
  },

  openOverview() {
    const w = this.currentWindow();
    const powers = state.features
      .filter((f) => !NON_STATE.test(f.name))
      .slice(0, 14);
    state.panel = { kind: 'overview' };
    globeApi.setSelected(null);
    globeApi.setRing(null);
    state.selectedEvent = null;
    refreshPins();
    openPanel();
    renderOverview($('panel-body'), { year: state.year, window: w, events: this.visibleEvents(), powers }, app);
    scheduleHash();
  },

  async openPolityByName(name, years) {
    // Stay in the current year if the polity is on the current map; otherwise go to the closest map that has it.
    let f = state.features.filter((x) => x.name === name).sort((a, b) => b.area - a.area)[0];
    if (!f && years?.length) {
      const a = toAstro(state.year);
      const target = years.reduce((best, y) => (Math.abs(toAstro(y) - a) < Math.abs(toAstro(best) - a) ? y : best), years[0]);
      await this.setYear(target === -1 ? -1 : target);
      f = state.features.filter((x) => x.name === name).sort((a2, b) => b.area - a2.area)[0];
    }
    if (f) this.openTerritory(f, { fly: true });
    else setStatus(`Couldn't find “${name}” on the map.`);
  },

  closePanel() {
    state.panel = null;
    state.selectedEvent = null;
    globeApi.setSelected(null);
    globeApi.setRing(null);
    refreshPins();
    $('panel').hidden = true;
    document.body.classList.remove('panel-open');
    updateOffset();
    scheduleHash();
  },
};
window.chronoglobe = app; // handy for debugging in the console

function openPanel() {
  $('panel').hidden = false;
  document.body.classList.add('panel-open');
  $('panel-body').scrollTop = 0;
  updateOffset();
}

function updateOffset() {
  const wide = window.innerWidth > 860;
  const panelOpen = !$('panel').hidden;
  const dock = document.querySelector('.dock').offsetHeight + 14;
  if (wide) globeApi.setOffset(panelOpen ? -($('panel').offsetWidth + 14) / 2 : 0, -dock / 2 + 24);
  else globeApi.setOffset(0, panelOpen ? -window.innerHeight * 0.24 : -dock / 2 + 20);
}

// ---- events on the globe -------------------------------------------------------
function refreshEvents() {
  refreshPins();
  timeline.setYearEvents(state.year, [...(state.showEvents ? EVENTS : []), ...(state.showWikidata ? state.wdEvents : [])]);
}

function refreshPins() {
  const w = app.currentWindow();
  const a = toAstro(state.year);
  let list = app.visibleEvents();
  // Keep the globe readable: at most 160 pins, most important / closest first.
  if (list.length > 160) {
    list = list
      .slice()
      .sort((x, y) => y.importance - x.importance || timeDistance(x, state.year, w) - timeDistance(y, state.year, w))
      .slice(0, 160);
  }
  if (state.selectedEvent && !list.includes(state.selectedEvent)) list.push(state.selectedEvent);
  globeApi.setPins(
    list.map((e) => ({
      event: e,
      faded: timeDistance(e, state.year, w),
      upcoming: state.day > 0 && e.astro === a && e.month && monthDayToDay(e.month, e.day || 1) > state.day,
      selected: e === state.selectedEvent,
    })),
  );
}

// ---- Wikidata ------------------------------------------------------------------
let wdTimer;
function scheduleWikidata() {
  clearTimeout(wdTimer);
  if (!state.showWikidata || state.playing) return;
  wdTimer = setTimeout(async () => {
    const year = state.year, w = app.currentWindow();
    try {
      const list = await wikidataEvents(year, w);
      if (year !== state.year) return;
      state.wdEvents = list;
      refreshEvents();
      if (state.panel?.kind === 'overview') app.openOverview();
    } catch (err) {
      console.warn('Wikidata lookup failed', err);
      if (year === state.year) {
        state.wdEvents = [];
        refreshEvents();
      }
    }
  }, 650);
}

// ---- header readouts ---------------------------------------------------------------
function updateWhen() {
  $('year-display').textContent = formatYear(state.year);
  if (state.day) {
    const { month, day } = dayToMonthDay(state.day);
    $('date-display').textContent = formatMonthDay(month, day);
  } else {
    $('date-display').textContent = 'Whole year';
  }
  $('era-display').textContent = `${eraName(state.year)} · ${centuryLabel(state.year)}`;
}

// ---- URL hash (shareable links) ---------------------------------------------------
let hashTimer;
function scheduleHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set('y', state.year);
    if (state.day) p.set('d', state.day);
    if (state.panel?.kind === 'event') p.set('e', state.panel.event.id);
    if (state.panel?.kind === 'territory') p.set('t', state.panel.feature.name);
    if (state.panel?.kind === 'overview') p.set('o', '1');
    history.replaceState(null, '', `#${p.toString()}`);
  }, 300);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { y: p.get('y'), d: p.get('d'), e: p.get('e'), t: p.get('t'), o: p.get('o') };
}

// ---- controls -----------------------------------------------------------------------
document.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => app.setYear(addYears(state.year, +b.dataset.step))));

let playTimer = null, playAcc = 0;
function setPlaying(on) {
  state.playing = on;
  $('btn-play').textContent = on ? '❚❚' : '▶';
  $('btn-play').classList.toggle('on', on);
  clearInterval(playTimer);
  if (on) {
    if (state.year >= MAX_YEAR) app.setYear(-3000);
    playAcc = 0;
    playTimer = setInterval(() => {
      playAcc += +$('play-speed').value / 10;
      const whole = Math.floor(playAcc);
      if (!whole) return;
      playAcc -= whole;
      const next = addYears(state.year, whole);
      app.setYear(next);
      if (next >= MAX_YEAR) setPlaying(false);
    }, 100);
  } else {
    scheduleWikidata();
  }
}
$('btn-play').addEventListener('click', () => setPlaying(!state.playing));

// Click the big year to type one in.
$('year-display').addEventListener('click', () => {
  $('year-display').hidden = true;
  $('year-form').hidden = false;
  $('year-input').value = Math.abs(state.year);
  $('era-input').value = state.year < 0 ? 'BC' : 'AD';
  $('year-input').focus();
  $('year-input').select();
});
function closeYearForm() {
  $('year-form').hidden = true;
  $('year-display').hidden = false;
}
$('year-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const n = Math.abs(parseInt($('year-input').value, 10));
  if (n) app.setYear($('era-input').value === 'BC' ? -n : n);
  closeYearForm();
});
$('year-form').addEventListener('focusout', (ev) => {
  if (!$('year-form').contains(ev.relatedTarget)) closeYearForm();
});

$('panel-close').addEventListener('click', () => app.closePanel());
$('btn-overview').addEventListener('click', () => (state.panel?.kind === 'overview' ? app.closePanel() : app.openOverview()));
$('btn-help').addEventListener('click', () => $('help').showModal());
$('btn-layers').addEventListener('click', (ev) => {
  ev.stopPropagation();
  $('layers-menu').hidden = !$('layers-menu').hidden;
});
document.addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest('#layers-menu, #btn-layers')) $('layers-menu').hidden = true;
});
$('opt-borders').addEventListener('change', (e) => globeApi.setShowBorders(e.target.checked));
$('opt-labels').addEventListener('change', (e) => globeApi.setShowLabels(e.target.checked));
$('opt-events').addEventListener('change', (e) => { state.showEvents = e.target.checked; refreshEvents(); });
$('opt-wikidata').addEventListener('change', (e) => {
  state.showWikidata = e.target.checked;
  if (state.showWikidata) scheduleWikidata();
  refreshEvents();
});
$('opt-rotate').addEventListener('change', (e) => globeApi.setAutoRotate(e.target.checked));
$('opt-window').addEventListener('change', (e) => {
  state.windowMode = e.target.value;
  refreshEvents();
  scheduleWikidata();
  if (state.panel?.kind === 'overview') app.openOverview();
  if (state.panel?.kind === 'territory') app.openTerritory(state.panel.feature, { quiet: true });
});
$('legend').innerHTML = Object.entries(EVENT_TYPES)
  .filter(([k]) => k !== 'other')
  .map(([, t]) => `<span class="lg"><span class="lg-ico" style="--c:${t.color}">${t.icon}</span>${esc(t.label)}</span>`)
  .join('');

window.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea, dialog')) return;
  if (ev.key === 'ArrowRight') { app.setYear(addYears(state.year, ev.shiftKey ? 10 : 1)); ev.preventDefault(); }
  else if (ev.key === 'ArrowLeft') { app.setYear(addYears(state.year, ev.shiftKey ? -10 : -1)); ev.preventDefault(); }
  else if (ev.key === ' ') { setPlaying(!state.playing); ev.preventDefault(); }
  else if (ev.key === 'Escape') app.closePanel();
  else if (ev.key === '/') { $('search-input').focus(); ev.preventDefault(); }
  else if (ev.key === 'o') app.openOverview();
  else if (ev.key === '?') $('help').showModal();
});

function onResize() {
  globeApi.resize(window.innerWidth, window.innerHeight);
  updateOffset();
}
window.addEventListener('resize', onResize);
onResize();

setupSearch(app);

// ---- boot ----------------------------------------------------------------------------
(async function boot() {
  const h = readHash();
  const y = h.y ? clampYear(parseInt(h.y, 10)) : 1450;
  if (h.d) app.setDay(parseInt(h.d, 10) || 0);
  else updateWhen();
  timeline.setYear(y);
  await app.setYear(y);
  if (h.e && EVENT_BY_ID.get(h.e)) app.openEvent(EVENT_BY_ID.get(h.e), { fly: true, quiet: true });
  else if (h.t) app.openPolityByName(h.t, null);
  else if (h.o) app.openOverview();
  if (!h.y && !localStorageGet('seenHelp')) {
    setStatus('Drag the timeline · click a territory or an icon to read more', { sticky: false });
    localStorageSet('seenHelp', '1');
  }
})();

function localStorageGet(k) {
  try { return localStorage.getItem(`chronoglobe:${k}`); } catch { return null; }
}
function localStorageSet(k, v) {
  try { localStorage.setItem(`chronoglobe:${k}`, v); } catch { /* ignore */ }
}

