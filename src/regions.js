// Coarse world regions, used to group event lists.
export const REGIONS = ['Europe', 'Middle East & North Africa', 'Sub-Saharan Africa', 'South Asia', 'East Asia', 'Southeast Asia', 'Central Asia & Steppe', 'Americas', 'Oceania'];

/** A coarse lat/lng → world-region lookup (good enough for grouping lists). */
export function regionOf(lat, lng) {
  if (lat == null || lng == null) return 'Europe';
  // Pacific first, so Hawaii and Rapa Nui don't count as the Americas.
  if (lng > 160 || lng < -150 || (lat < -10 && lng > 110) || (lat < -10 && lng < -100)) return 'Oceania';
  if (lng < -25) return 'Americas';
  // Europe (incl. the Mediterranean islands and European Russia)
  if (lng < 26 && lng >= -25 && lat >= 36 && !(lng > -2 && lng < 11.6 && lat < 37.2)) return 'Europe';
  if (lng >= 11.6 && lng < 26 && lat >= 34.8) return 'Europe';
  if (lng >= 26 && lng < 41 && lat >= 40.7 && !(lng > 29.2 && lat < 41.3)) return 'Europe';
  if (lng >= 41 && lng < 60 && lat >= 46) return 'Europe';
  if (lng >= 26 && lng < 50 && lat >= 41.3) return 'Europe';
  // Middle East & North Africa
  if (lat >= 19 && lng >= -20 && lng < 63 && lat < 46) return 'Middle East & North Africa';
  if (lat >= 12 && lng >= 42 && lng < 60) return 'Middle East & North Africa';
  if (lat < 19 && lng >= -20 && lng < 52) return 'Sub-Saharan Africa';
  if (lat < 0 && lng >= 30 && lng < 60) return 'Sub-Saharan Africa';
  if (lat >= 35 && lng >= 46 && lng < 90 && lat < 56) return 'Central Asia & Steppe';
  if (lat >= 46 && lng >= 60) return lng > 120 && lat < 54 ? 'East Asia' : 'Central Asia & Steppe';
  if (lng >= 60 && lng < 92 && lat < 37) return 'South Asia';
  if (lng >= 92 && lng < 130 && (lat < 21.5 || (lng < 108 && lat < 23))) return 'Southeast Asia';
  if (lng >= 90 && lat >= 37 && lat < 50 && lng < 105) return 'Central Asia & Steppe';
  if (lng >= 90) return 'East Asia';
  return 'Middle East & North Africa';
}

