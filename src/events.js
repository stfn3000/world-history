// Curated event data + helpers.
import { toAstro } from './time.js';

export const EVENT_TYPES = {
  battle: { icon: '⚔️', label: 'Battle', color: '#e2574c' },
  siege: { icon: '🏰', label: 'Siege / sack', color: '#d9534f' },
  war: { icon: '🔥', label: 'War / invasion', color: '#f0803c' },
  treaty: { icon: '📜', label: 'Treaty / agreement', color: '#d8b45a' },
  founding: { icon: '🏛️', label: 'Founding / new state', color: '#6fb3e0' },
  fall: { icon: '💥', label: 'Fall / collapse', color: '#b05cd6' },
  ruler: { icon: '👑', label: 'Ruler / dynasty', color: '#f5c542' },
  revolution: { icon: '✊', label: 'Revolution / uprising', color: '#ff6b6b' },
  exploration: { icon: '⛵', label: 'Exploration', color: '#4fc3c8' },
  science: { icon: '🔭', label: 'Science / invention', color: '#7bd389' },
  religion: { icon: '🛐', label: 'Religion', color: '#c9a0ff' },
  culture: { icon: '🎭', label: 'Culture / art', color: '#ff9ecf' },
  disaster: { icon: '🌋', label: 'Disaster', color: '#ff8a3d' },
  plague: { icon: '☠️', label: 'Epidemic', color: '#a3a3a3' },
  politics: { icon: '⚖️', label: 'Politics / law', color: '#8ab4f8' },
  trade: { icon: '💰', label: 'Trade / economy', color: '#e8c468' },
  monument: { icon: '🗿', label: 'Monument / building', color: '#c2a27c' },
  assassination: { icon: '🗡️', label: 'Assassination', color: '#c94f4f' },
  space: { icon: '🚀', label: 'Space', color: '#9ad0ff' },
  other: { icon: '📍', label: 'Event', color: '#cccccc' },
};

export const typeInfo = (t) => EVENT_TYPES[t] || EVENT_TYPES.other;

// Every *.json file in src/data/events is an array of events.
const modules = import.meta.glob('./data/events/*.json', { eager: true, import: 'default' });

export const EVENTS = Object.values(modules)
  .flat()
  .map((e) => ({
    ...e,
    source: 'curated',
    importance: e.importance || 2,
    astro: toAstro(e.year),
    astroEnd: toAstro(e.endYear || e.year),
    region: e.region || regionOf(e.lat, e.lng),
  }))
  .sort((a, b) => a.astro - b.astro || (a.month || 0) - (b.month || 0) || (a.day || 0) - (b.day || 0));

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

/** Events whose time span overlaps [year - w, year + w]. */
export function eventsInWindow(list, year, w) {
  const a = toAstro(year);
  return list.filter((e) => e.astroEnd >= a - w && e.astro <= a + w);
}

/** 0 = exactly now, 1 = at the edge of the window. */
export function timeDistance(e, year, w) {
  const a = toAstro(year);
  if (a >= e.astro && a <= e.astroEnd) return 0;
  const d = Math.min(Math.abs(e.astro - a), Math.abs(e.astroEnd - a));
  return w ? Math.min(1, d / w) : d ? 1 : 0;
}

export { REGIONS, regionOf } from './regions.js';
import { regionOf } from './regions.js';

// ---- Links ----------------------------------------------------------------
export const wikiUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')}`;
export const youtubeSearch = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const britannicaSearch = (q) => `https://www.britannica.com/search?query=${encodeURIComponent(q)}`;
export const wikiSearch = (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
