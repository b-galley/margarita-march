// "Remember this device" — fixes La Lucha del Taco's #1 complaint: every reload forced
// re-entering a username, and typos silently created a brand-new identity. There's no
// Firebase Auth here on purpose (see PROJECT plan) — this is plain localStorage keyed to
// this browser, verified against the room on load so a deleted/expired room falls back
// to the splash screen cleanly instead of dead-ending the user.

import { db } from './firebase.js';

const STORAGE_KEY = 'mm_session';

export function saveSession(userName, roomCode) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ userName, roomCode }));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function readSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.userName && parsed.roomCode) return parsed;
  } catch {
    // corrupted value — treat as no session
  }
  return null;
}

// Returns { userName, roomCode } if this device has a still-valid remembered session,
// or null if there's nothing to restore (caller should fall back to the splash screen).
export async function restoreSession() {
  const session = readSession();
  if (!session) return null;

  const { userName, roomCode } = session;
  const roomSnap = await db.ref('rooms/' + roomCode).once('value');
  if (!roomSnap.exists()) {
    clearSession();
    return null;
  }

  const userSnap = await db.ref('rooms/' + roomCode + '/users/' + userName).once('value');
  if (!userSnap.exists()) {
    clearSession();
    return null;
  }

  return { userName, roomCode };
}
