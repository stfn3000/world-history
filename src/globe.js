// The 3D globe and its layers (territories, labels, event pins, rings).
import Globe from 'globe.gl';
import { hsla } from './basemaps.js';
import { typeInfo } from './events.js';

const BASE = import.meta.env.BASE_URL;

export function createGlobe(container, handlers) {
  const state = {
    features: [],
    hover: null,
    selected: null,
    showBorders: true,
    showLabels: true,
    pins: [], // event datums currently shown
    labels: [],
    altitude: 2.5,
  };

  const globe = new Globe(container, { animateIn: false })
    .globeImageUrl(`${BASE}img/earth-blue-marble.jpg`)
    .bumpImageUrl(`${BASE}img/earth-topology.png`)
    .backgroundImageUrl(`${BASE}img/night-sky.png`)
    .atmosphereColor('#8fb8ff')
    .atmosphereAltitude(0.18)
    // ---- territories
    .polygonGeoJsonGeometry('geometry')
    .polygonCapColor((d) => capColor(d))
    .polygonSideColor((d) => (d.kind === 'umbrella' || d.kind === 'culture' ? 'rgba(0,0,0,0)' : hsla(d.color, 0.25, -20)))
    .polygonStrokeColor((d) => strokeColor(d))
    .polygonAltitude((d) => altitude(d))
    .polygonsTransitionDuration(200)
    .polygonLabel(() => '') // we draw our own tooltip
    .onPolygonHover((d) => {
      state.hover = d || null;
      refreshPolygonStyle();
      handlers.onHover?.(d || null);
      container.style.cursor = d ? 'pointer' : 'grab';
    })
    .onPolygonClick((d, ev, coords) => handlers.onTerritoryClick?.(d, coords))
    // Umbrella realms (e.g. the Holy Roman Empire) are outlines drawn over
    // their member states; clicks go through to the members underneath.
    .pointerEventsFilter((obj, d) => !(d && d.kind === 'umbrella'))
    .onGlobeClick((coords) => handlers.onGlobeClick?.(coords))
    // ---- html layer: event pins + territory labels
    .htmlLat((d) => d.lat)
    .htmlLng((d) => d.lng)
    .htmlAltitude((d) => (d.kind === 'label' ? 0.012 : 0.02))
    .htmlElement((d) => d.el)
    .htmlTransitionDuration(0)
    .htmlElementVisibilityModifier((el, visible) => {
      // three-globe's own test lets items right at the limb through; also
      // hide anything within a few degrees of the horizon so labels don't
      // float off the edge of the globe.
      el.classList.toggle('behind', !visible || nearLimb(el));
    })
    // ---- selection ring
    .ringColor(() => (t) => `rgba(255, 236, 170, ${1 - t})`)
    .ringMaxRadius(4)
    .ringPropagationSpeed(2.5)
    .ringRepeatPeriod(900)
    .ringAltitude(0.021);

  globe.controls().autoRotateSpeed = 0.35;
  globe.pointOfView({ lat: 22, lng: 40, altitude: state.altitude });
  globe.onZoom((pov) => {
    const changed = Math.abs(pov.altitude - state.altitude) > 0.05;
    state.altitude = pov.altitude;
    if (changed) scheduleLabelUpdate();
  });

  const RAD = Math.PI / 180;
  let povCache = null;
  globe.controls().addEventListener('change', () => {
    povCache = null;
    scheduleDeclutter();
  });
  function nearLimb(el) {
    const lat = +el.dataset.lat, lng = +el.dataset.lng;
    if (Number.isNaN(lat)) return false;
    povCache ||= globe.pointOfView();
    const p = povCache;
    const cosD = Math.sin(lat * RAD) * Math.sin(p.lat * RAD) + Math.cos(lat * RAD) * Math.cos(p.lat * RAD) * Math.cos((lng - p.lng) * RAD);
    const horizon = Math.acos(1 / (1 + p.altitude)) / RAD;
    return Math.acos(Math.max(-1, Math.min(1, cosD))) / RAD > horizon - 6;
  }

  function capColor(d) {
    if (d.kind === 'umbrella') return d === state.selected ? hsla(d.color, 0.25, 10) : 'rgba(0,0,0,0)';
    if (d === state.selected) return hsla(d.color, 0.78, 12);
    if (d === state.hover) return hsla(d.color, d.kind === 'culture' ? 0.4 : 0.7, 8);
    if (d.kind === 'culture') return hsla(d.color, 0.16, -5);
    return hsla(d.color, d.precision >= 2 ? 0.5 : 0.4);
  }
  function strokeColor(d) {
    if (d === state.selected) return '#fff6d5';
    if (d.kind === 'umbrella') return hsla(d.color, 0.95, 28);
    if (d.kind === 'culture') return hsla(d.color, 0.3, 10);
    return hsla(d.color, d.precision >= 2 ? 0.85 : 0.5, 18);
  }
  function altitude(d) {
    if (d.kind === 'culture') return d === state.hover ? 0.006 : 0.003;
    if (d.kind === 'umbrella') return d === state.selected ? 0.024 : 0.012;
    return d === state.selected ? 0.022 : d === state.hover ? 0.014 : 0.007;
  }

  function refreshPolygonStyle() {
    // Re-assigning accessors makes three-globe re-evaluate them.
    globe.polygonCapColor(globe.polygonCapColor()).polygonAltitude(globe.polygonAltitude()).polygonStrokeColor(globe.polygonStrokeColor());
  }

  // ---- labels ---------------------------------------------------------------
  let labelTimer = null;
  function scheduleLabelUpdate() {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(updateLabels, 120);
  }

  function labelFor(f) {
    if (!f._label) {
      const el = document.createElement('div');
      el.className = `terr-label${f.kind === 'umbrella' ? ' umbrella' : f.kind === 'culture' ? ' culture' : ''}`;
      el.textContent = f.name;
      el.dataset.lat = f.center.lat;
      el.dataset.lng = f.center.lng;
      f._label = { kind: 'label', lat: f.center.lat, lng: f.center.lng, el, feature: f };
    }
    return f._label;
  }

  function updateLabels() {
    if (!state.showLabels || !state.showBorders) {
      state.labels = [];
    } else {
      // Smaller territories get a label as you zoom in.
      const small = window.innerWidth < 700;
      const minArea = (small ? 0.03 : 0.012) * Math.pow(state.altitude / 2.2, 2.2);
      // Umbrella realms first, then states, then (large) peoples; one label per name.
      const rank = (f) => (f.kind === 'umbrella' ? 0 : f.kind === 'culture' ? 2 : 1);
      const seen = new Set();
      state.labels = state.features
        .filter((f) => f.area >= (f.kind === 'culture' ? minArea * 3 : minArea))
        .sort((a, b) => rank(a) - rank(b) || b.area - a.area)
        .filter((f) => !seen.has(f.name) && seen.add(f.name))
        .slice(0, small ? 40 : 90)
        .map(labelFor);
      for (const l of state.labels) {
        const big = l.feature.area > 0.15;
        l.el.classList.toggle('big', big);
      }
    }
    pushHtml();
    scheduleDeclutter();
  }

  // Hide labels that would overlap a bigger territory's label on screen.
  let declutterQueued = false;
  function scheduleDeclutter() {
    if (declutterQueued) return;
    declutterQueued = true;
    requestAnimationFrame(() => {
      declutterQueued = false;
      declutter();
    });
  }
  function declutter() {
    const boxes = [];
    for (const l of state.labels) {
      // labels are already ordered big → small
      const { x, y } = globe.getScreenCoords(l.lat, l.lng, 0.012);
      const w = l.el.offsetWidth || l.feature.name.length * 8;
      const h = l.el.offsetHeight || 16;
      const box = [x - w / 2 - 4, y - h / 2 - 2, x + w / 2 + 4, y + h / 2 + 2];
      const hit = !l.el.classList.contains('behind') && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      l.el.classList.toggle('crowded', hit);
      if (!hit && !l.el.classList.contains('behind')) boxes.push(box);
    }
  }

  function pushHtml() {
    globe.htmlElementsData([...state.labels, ...state.pins]);
  }

  // ---- public API -------------------------------------------------------
  return {
    globe,
    setFeatures(features) {
      state.features = features;
      if (state.selected && !features.includes(state.selected)) state.selected = null;
      state.hover = null;
      globe.polygonsData(state.showBorders ? features : []);
      updateLabels();
    },
    setSelected(f) {
      state.selected = f || null;
      refreshPolygonStyle();
    },
    get selected() {
      return state.selected;
    },
    setShowBorders(v) {
      state.showBorders = v;
      globe.polygonsData(v ? state.features : []);
      updateLabels();
    },
    setShowLabels(v) {
      state.showLabels = v;
      updateLabels();
    },
    /** pins: [{ event, faded: 0..1, upcoming, selected }] */
    setPins(items) {
      state.pins = items.map(({ event, faded, upcoming, selected }) => {
        const d = (event._pin ||= makePin(event, handlers));
        d.el.style.setProperty('--fade', String(1 - 0.75 * faded));
        d.el.classList.toggle('upcoming', !!upcoming);
        d.el.classList.toggle('selected', !!selected);
        d.el.style.zIndex = selected ? 5 : event.importance >= 3 ? 3 : event.source === 'wikidata' ? 1 : 2;
        return d;
      });
      pushHtml();
    },
    setRing(point) {
      globe.ringsData(point ? [point] : []);
    },
    flyTo(lat, lng, altitude, ms = 1200) {
      globe.pointOfView({ lat, lng, altitude: altitude ?? Math.min(state.altitude, 1.8) }, ms);
    },
    setAutoRotate(v) {
      globe.controls().autoRotate = v;
    },
    resize(w, h) {
      globe.width(w).height(h);
    },
    /** Shift the globe so it is centred in the space not covered by panels. */
    setOffset(x, y) {
      globe.globeOffset([x, y]);
    },
  };
}

function makePin(event, handlers) {
  const t = typeInfo(event.type);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `event-pin imp-${event.importance || 2}${event.source === 'wikidata' ? ' wd' : ''}`;
  el.style.setProperty('--c', t.color);
  el.innerHTML = `<span class="ico">${t.icon}</span>`;
  el.dataset.lat = event.lat;
  el.dataset.lng = event.lng;
  el.setAttribute('aria-label', `${t.label}: ${event.title}`);
  el.title = event.title;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    handlers.onEventClick?.(event);
  });
  // Keep the globe from also treating this as a click on the territory below.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
    el.addEventListener(type, (ev) => ev.stopPropagation(), { passive: true });
  }
  el.addEventListener('pointerenter', () => handlers.onEventHover?.(event, el));
  el.addEventListener('pointerleave', () => handlers.onEventHover?.(null, el));
  return { kind: 'event', lat: event.lat, lng: event.lng, el, event };
}
