// Stop CRUD + the live stops listener. No default/seed stops — the friend group plans
// the actual route themselves (per the brief), so a fresh room starts with an empty list
// and the creator adds real stops via the Add Stop modal.

import { getRoomRef } from './room.js';

const STOP_ID_PREFIX = 's';

// Old app's fallback when lat/lng were left blank: jitter around a fixed city center so
// an un-pinned stop still shows up somewhere sane on the map instead of at (0,0).
// Exported so the Add/Edit Stop modal's pin picker can default to the same spot.
export const FALLBACK_CENTER = { lat: 39.7684, lng: -86.1581 }; // downtown Indianapolis

function nextStopId() {
  return STOP_ID_PREFIX + Date.now();
}

export async function addStop({ name, desc, address, lat, lng }) {
  const id = nextStopId();
  const finalLat = lat != null ? lat : FALLBACK_CENTER.lat + (Math.random() - 0.5) * 0.02;
  const finalLng = lng != null ? lng : FALLBACK_CENTER.lng + (Math.random() - 0.5) * 0.02;
  await getRoomRef()
    .child('stops/' + id)
    .set({ name, desc, address, lat: finalLat, lng: finalLng });
  return id;
}

export async function updateStop(stopId, { name, desc, address, lat, lng }) {
  const updates = { name, desc, address };
  if (lat != null) updates.lat = lat;
  if (lng != null) updates.lng = lng;
  await getRoomRef().child('stops/' + stopId).update(updates);
}

export async function removeStop(stopId, allRatings) {
  const roomRef = getRoomRef();
  await roomRef.child('stops/' + stopId).remove();
  const removals = Object.keys(allRatings || {}).map((user) =>
    roomRef.child('ratings/' + user + '/' + stopId).remove()
  );
  await Promise.all(removals);
}

// Geocodes a free-text address to {lat, lng} via Nominatim (OpenStreetMap) — free, no
// API key. Nominatim's usage policy asks that lookups be user-triggered (a button click)
// rather than fired automatically on every keystroke, and allows at most ~1 request/sec,
// which a manual "Look up" button naturally respects. Returns null if nothing matched.
export async function geocodeAddress(address) {
  const query = address.trim();
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding request failed (${res.status})`);
  const results = await res.json();
  if (!results.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// onChange(stopsArray) fires with the live, ordered list of stops whenever the room's
// stops node changes. Order is by creation (id embeds a timestamp for added stops).
export function attachStopsListener(onChange) {
  const stopsRef = getRoomRef().child('stops');
  const listener = (snap) => {
    const data = snap.val();
    if (!data) return onChange([]);
    const stops = Object.keys(data)
      .map((id) => ({ id, ...data[id] }))
      .sort((a, b) => {
        const aNum = parseInt(a.id.replace(/\D/g, ''), 10) || Infinity;
        const bNum = parseInt(b.id.replace(/\D/g, ''), 10) || Infinity;
        return aNum - bNum;
      });
    onChange(stops);
  };
  stopsRef.on('value', listener);
  return { ref: stopsRef, event: 'value', listener };
}
