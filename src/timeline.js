// Timeline dock: main (non-linear) year slider, month/day slider, buttons.
import { yearToPos, posToYear, TRACK_LABELS, formatYear, dayToMonthDay, monthDayToDay, toAstro } from './time.js';
import { typeInfo } from './events.js';

export function createTimeline({ onYear, onDay, events }) {
  const slider = document.getElementById('year-slider');
  const daySlider = document.getElementById('day-slider');
  const canvas = document.getElementById('track-canvas');
  const fineCanvas = document.getElementById('fine-canvas');
  const labels = document.getElementById('track-labels');

  slider.addEventListener('input', () => onYear(posToYear(+slider.value), { fromSlider: true }));
  daySlider.addEventListener('input', () => onDay(+daySlider.value));

  // Labels along the track
  // On narrow screens only the "major" ticks are shown (see style.css).
  const MAJOR = new Set([-3000, 1, 1000, 1500, 1800, 2000]);
  labels.innerHTML = TRACK_LABELS.map(
    (y) => `<span class="${MAJOR.has(y) ? '' : 'minor'}" style="left:${(yearToPos(y) / 10).toFixed(2)}%">${y === 1 ? '1 AD' : formatYear(y, { short: true }).replace(',', '')}</span>`,
  ).join('');

  // Eras shaded behind the main track + a tick per curated event.
  const ERA_BANDS = [
    [-10000, -3300, '#3a4a3f'],
    [-3300, -1200, '#6b5a2f'],
    [-1200, 476, '#5f3b2f'],
    [476, 1500, '#2f4a5f'],
    [1500, 1789, '#4b3a66'],
    [1789, 1914, '#5c3b4f'],
    [1914, 2100, '#3b5c58'],
  ];

  function drawTrack() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const x = (y) => (yearToPos(y) / 1000) * w;
    for (const [a, b, c] of ERA_BANDS) {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x(a), h * 0.3, Math.max(1, x(Math.min(b, new Date().getFullYear())) - x(a)), h * 0.4);
    }
    ctx.globalAlpha = 0.8;
    for (const e of events) {
      const px = Math.round(x(e.year)) + 0.5;
      ctx.strokeStyle = typeInfo(e.type).color;
      ctx.lineWidth = 1;
      const len = e.importance >= 3 ? h * 0.42 : h * 0.26;
      ctx.beginPath();
      ctx.moveTo(px, h * 0.5 - len / 2);
      ctx.lineTo(px, h * 0.5 + len / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  let fineEvents = [];
  function drawFine() {
    const dpr = window.devicePixelRatio || 1;
    const w = fineCanvas.clientWidth, h = fineCanvas.clientHeight;
    if (!w) return;
    fineCanvas.width = w * dpr;
    fineCanvas.height = h * dpr;
    const ctx = fineCanvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let m = 1; m < 12; m++) {
      const px = Math.round((monthDayToDay(m + 1, 1) / 365) * w) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, h * 0.3);
      ctx.lineTo(px, h * 0.7);
      ctx.stroke();
    }
    for (const e of fineEvents) {
      if (!e.month) continue;
      const d = monthDayToDay(e.month, e.day || 15);
      const px = (d / 365) * w;
      ctx.fillStyle = typeInfo(e.type).color;
      ctx.beginPath();
      ctx.arc(px, h / 2, e.source === 'wikidata' ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const ro = new ResizeObserver(() => {
    drawTrack();
    drawFine();
  });
  ro.observe(canvas);
  ro.observe(fineCanvas);

  return {
    setYear(y) {
      slider.value = String(yearToPos(y));
    },
    setDay(d) {
      daySlider.value = String(d);
    },
    /** Events of the current year that have a known month — drawn on the day track. */
    setYearEvents(year, list) {
      const a = toAstro(year);
      fineEvents = list.filter((e) => e.astro === a && e.month);
      drawFine();
    },
    redraw: drawTrack,
    dayToMonthDay,
  };
}
