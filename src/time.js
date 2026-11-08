// Time helpers.
//
// Years are "historical" integers: 1453 = AD 1453, -490 = 490 BC. There is
// no year 0 (1 BC is followed directly by AD 1).

export const MIN_YEAR = -10000;
export const MAX_YEAR = new Date().getFullYear();

/** Historical year -> astronomical (continuous) year, so arithmetic works across 1 BC/AD 1. */
export const toAstro = (y) => (y < 0 ? y + 1 : y);
/** Astronomical year -> historical year. */
export const fromAstro = (a) => (a <= 0 ? a - 1 : a);

export function clampYear(y) {
  y = Math.round(y);
  if (y === 0) y = 1;
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
}

/** Add n years to historical year y, skipping year 0. */
export const addYears = (y, n) => clampYear(fromAstro(toAstro(y) + n));

export const yearDiff = (a, b) => toAstro(a) - toAstro(b);

export function formatYear(y, { short = false } = {}) {
  if (y < 0) {
    const n = -y;
    return `${n.toLocaleString('en-US')} BC`;
  }
  return short || y >= 1000 ? `${y}` + (short ? '' : ' AD') : `${y} AD`;
}

export function centuryLabel(y) {
  const c = y < 0 ? Math.ceil(-y / 100) : Math.ceil(y / 100);
  const suffix = (n) => {
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  };
  if (y < 0 && -y > 3000) return `${(-y / 1000).toFixed(-y % 1000 ? 1 : 0)} millennium BC`;
  return `${c}${suffix(c)} century${y < 0 ? ' BC' : ''}`;
}

const ERAS = [
  [MIN_YEAR, -3300, 'Neolithic'],
  [-3300, -1200, 'Bronze Age'],
  [-1200, -800, 'Early Iron Age'],
  [-800, 476, 'Classical Antiquity'],
  [476, 1000, 'Early Middle Ages'],
  [1000, 1300, 'High Middle Ages'],
  [1300, 1500, 'Late Middle Ages'],
  [1500, 1789, 'Early Modern Period'],
  [1789, 1914, 'Age of Revolutions & Empires'],
  [1914, 1945, 'Era of the World Wars'],
  [1945, 1991, 'Cold War'],
  [1991, 99999, 'Contemporary Era'],
];

export function eraName(y) {
  const e = ERAS.find(([a, b]) => y >= a && y < b);
  return e ? e[2] : '';
}

// ---- Non-linear slider scale -------------------------------------------
// The slider runs 0..1000; recent centuries get more room because more is
// known about them (and more changes per year).
const SEGMENTS = [
  // [fromYear, toYear, share of slider]
  [MIN_YEAR, -3000, 0.07],
  [-3000, -500, 0.15],
  [-500, 500, 0.15],
  [500, 1500, 0.26],
  [1500, 1800, 0.16],
  [1800, MAX_YEAR, 0.21],
];
export const SLIDER_MAX = 1000;

export function yearToPos(y) {
  const a = toAstro(y);
  let acc = 0;
  for (const [f, t, share] of SEGMENTS) {
    const fa = toAstro(f), ta = toAstro(t);
    if (a <= ta) return (acc + (share * (a - fa)) / (ta - fa)) * SLIDER_MAX;
    acc += share;
  }
  return SLIDER_MAX;
}

export function posToYear(p) {
  let x = p / SLIDER_MAX;
  for (const [f, t, share] of SEGMENTS) {
    if (x <= share) {
      const fa = toAstro(f), ta = toAstro(t);
      return clampYear(fromAstro(Math.round(fa + (x / share) * (ta - fa))));
    }
    x -= share;
  }
  return MAX_YEAR;
}

/** Labelled ticks drawn under the main slider. */
export const TRACK_LABELS = [-10000, -3000, -2000, -1000, -500, 1, 500, 1000, 1200, 1400, 1500, 1600, 1800, 1900, 2000];

// ---- Day of year ----------------------------------------------------------
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dayToMonthDay(doy) {
  let d = doy;
  for (let m = 0; m < 12; m++) {
    if (d <= MONTH_DAYS[m]) return { month: m + 1, day: d };
    d -= MONTH_DAYS[m];
  }
  return { month: 12, day: 31 };
}

export function monthDayToDay(month, day) {
  let d = 0;
  for (let m = 0; m < month - 1; m++) d += MONTH_DAYS[m];
  return d + Math.min(day || 1, MONTH_DAYS[month - 1]);
}

export function formatMonthDay(month, day) {
  if (!month) return '';
  return day ? `${day} ${MONTHS[month - 1]}` : MONTHS[month - 1];
}

/** Human date of an event record ({year, month?, day?, endYear?}). */
export function formatEventDate(e) {
  const md = formatMonthDay(e.month, e.day);
  let s = md ? `${md} ${formatYear(e.year)}` : formatYear(e.year);
  if (e.approx) s = `c. ${s}`;
  if (e.endYear && e.endYear !== e.year) s += ` – ${formatYear(e.endYear)}`;
  return s;
}

/** How many years either side of the current year to show events for, when on "auto". */
export function autoWindow(y) {
  if (y < -3000) return 500;
  if (y < -1000) return 100;
  if (y < 0) return 40;
  if (y < 1000) return 25;
  if (y < 1500) return 10;
  if (y < 1800) return 5;
  if (y < 1900) return 3;
  return 1;
}

export function wikiYearTitle(y) {
  return y < 0 ? `${-y}_BC` : `AD_${y}`;
}
