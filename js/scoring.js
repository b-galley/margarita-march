// Composite/aggregate/rank math, and the actual Firebase write when a user submits their
// ratings for a stop. Pure functions here (no DOM), so badges.js (M2) can reuse them
// without any coupling to rendering.

import { CATEGORIES } from './categories.js';
import { SERVER_TIMESTAMP } from './firebase.js';
import { getRoomRef, getRoomState } from './room.js';

export function getUserComposite(scores) {
  const values = CATEGORIES.map((c) => scores[c.key] ?? 7);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// stops: array of {id, ...}. allRatings: {userName: {stopId: {scores...}}}.
export function getAggregatedScores(stops, allRatings) {
  return stops.map((stop) => {
    const composites = [];
    Object.keys(allRatings).forEach((user) => {
      const userStop = allRatings[user]?.[stop.id];
      if (userStop) composites.push(getUserComposite(userStop));
    });
    const composite = composites.length
      ? composites.reduce((a, b) => a + b, 0) / composites.length
      : 0;
    return { ...stop, composite, raterCount: composites.length };
  });
}

export function getRanked(stops, allRatings) {
  return getAggregatedScores(stops, allRatings).sort((a, b) => b.composite - a.composite);
}

export function getLeaderId(stops, allRatings) {
  const ranked = getRanked(stops, allRatings);
  if (!ranked.length || ranked[0].composite === 0) return null;
  return ranked[0].id;
}

export function submitRatings(stopId, scores) {
  const { userName } = getRoomState();
  return getRoomRef()
    .child('ratings/' + userName + '/' + stopId)
    .set({ ...scores, submittedAt: SERVER_TIMESTAMP });
}

// onChange({allRatings}) fires on every ratings change, live for the whole room.
export function attachRatingsListener(onChange) {
  const ratingsRef = getRoomRef().child('ratings');
  const listener = (snap) => onChange(snap.val() || {});
  ratingsRef.on('value', listener);
  return { ref: ratingsRef, event: 'value', listener };
}
