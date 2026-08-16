// Leaflet map with numbered pins per stop. Kept from the old app on Blake's call — a
// crawl app benefits from a visual sense of the route, not just a list.

let map = null;
let markers = {};

function makeNumberedIcon(num) {
  return L.divIcon({
    className: 'mm-marker',
    html: `<div style="
      background: var(--gold, #F4A623);
      color: var(--ink, #1B2A1E);
      border: 3px solid var(--ink, #1B2A1E);
      width: 34px; height: 34px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Trebuchet MS', sans-serif; font-weight: 700; font-size: 1rem;
      box-shadow: 0 3px 0 rgba(0,0,0,0.4);
    ">${num}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function initMap(center = [39.7684, -86.1581]) {
  if (map) return map;
  map = L.map('map', { scrollWheelZoom: false }).setView(center, 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  return map;
}

export function refreshMarkers(stops) {
  if (!map) return;
  Object.values(markers).forEach((m) => map.removeLayer(m));
  markers = {};
  stops.forEach((stop, i) => {
    if (stop.lat == null || stop.lng == null) return;
    const marker = L.marker([stop.lat, stop.lng], { icon: makeNumberedIcon(i + 1) })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.address)}`);
    markers[stop.id] = marker;
  });
  if (stops.length) {
    const bounds = L.latLngBounds(stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }
}

// ---------------- ADD/EDIT STOP MODAL PIN PICKER ----------------
// A separate, small Leaflet instance embedded in the modal — kept independent of the
// main route map so opening/closing the modal never fights with the main map's state
// (zoom, bounds, click handlers) sitting behind it.
let pickerMap = null;
let pickerMarker = null;

function makePickerIcon() {
  return L.divIcon({
    className: 'mm-picker-marker',
    html: `<div style="
      background: var(--coral, #FF6B5B);
      border: 3px solid var(--ink, #1B2A1E);
      width: 26px; height: 26px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 0 rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

// Opens the picker at (lat, lng), calling onMove({lat, lng}) whenever the user drags the
// pin or clicks elsewhere on the mini-map. Safe to call every time the modal opens —
// tears down any previous instance first (Leaflet errors if you re-init the same div).
export function showStopPicker(lat, lng, onMove) {
  destroyStopPicker();
  pickerMap = L.map('stopPickerMap', { scrollWheelZoom: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(pickerMap);

  pickerMarker = L.marker([lat, lng], { icon: makePickerIcon(), draggable: true }).addTo(pickerMap);
  pickerMarker.on('drag', (e) => onMove(e.target.getLatLng()));

  pickerMap.on('click', (e) => {
    pickerMarker.setLatLng(e.latlng);
    onMove(e.latlng);
  });

  // The modal is display:none when this runs the first time in some flows, which gives
  // Leaflet a zero-size container — nudge it to recalculate once it's actually visible.
  setTimeout(() => pickerMap && pickerMap.invalidateSize(), 50);
}

// Call when new lat/lng values are typed directly into the number inputs, so the pin
// stays in sync with manual edits instead of only reflecting drag/click.
export function setStopPickerPosition(lat, lng) {
  if (!pickerMap || !pickerMarker) return;
  pickerMarker.setLatLng([lat, lng]);
  pickerMap.panTo([lat, lng]);
}

export function destroyStopPicker() {
  if (pickerMap) {
    pickerMap.remove();
    pickerMap = null;
    pickerMarker = null;
  }
}
