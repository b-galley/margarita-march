// Room lifecycle: generate/create/join a room, presence, and the listener set that needs
// to be live once a user is "in" a room. Kept deliberately decoupled from stops/scoring/etc
// (those attach their own listeners in their own modules) — room.js only owns what's
// universally true of being in a room: who's here, who created it, and when it starts.

import { db, SERVER_TIMESTAMP } from './firebase.js';
import { saveSession } from './session.js';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars (0/O, 1/I, etc.)

let roomRef = null;
let activeListeners = []; // [{ref, event}] so detachListeners() can clean them all up
let state = {
  userName: null,
  roomCode: null,
  isRoomCreator: false,
  startTime: null,
};

export function getRoomState() {
  return { ...state };
}

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

// Creates a brand-new room in Firebase and registers the creating user.
// `initialStops` is a plain {stopId: {name, desc, address, lat, lng}} object — left empty
// here since stops.js (M1) owns what a "default" stop set looks like; passed through so
// this function doesn't need to change once that exists.
export async function createRoom(userName, initialStops = {}) {
  let roomCode = generateRoomCode();

  const existing = await db.ref('rooms/' + roomCode).once('value');
  if (existing.exists()) {
    roomCode = generateRoomCode();
  }

  await db.ref('rooms/' + roomCode).set({
    createdAt: SERVER_TIMESTAMP,
    createdBy: userName,
    stops: initialStops,
    users: { [userName]: { joinedAt: SERVER_TIMESTAMP, online: true } },
  });

  return roomCode;
}

// Result: 'ok' | 'not_found'. Joining does NOT reject a name already present in the
// room's roster — same-name-returning is treated as the same user coming back, matching
// the old app's convention (now made actually useful by session.js remembering it).
export async function joinRoom(userName, roomCode) {
  const roomSnap = await db.ref('rooms/' + roomCode).once('value');
  if (!roomSnap.exists()) return 'not_found';

  await db.ref('rooms/' + roomCode + '/users/' + userName).set({
    joinedAt: SERVER_TIMESTAMP,
    online: true,
  });

  return 'ok';
}

// Transitions into "in this room" state: sets up presence, figures out creator status,
// attaches the users/startTime listeners, and persists the session so a reload skips
// the splash screen next time.
//
// callbacks: { onUsersChange(usersObj), onStartTimeChange(ms) } — both optional.
export async function enterRoom(userName, roomCode, callbacks = {}) {
  detachListeners();

  roomRef = db.ref('rooms/' + roomCode);
  state = { userName, roomCode, isRoomCreator: false, startTime: null };

  roomRef.child('users/' + userName + '/online').onDisconnect().set(false);
  roomRef.child('users/' + userName + '/online').set(true);

  const createdBySnap = await roomRef.child('createdBy').once('value');
  state.isRoomCreator = createdBySnap.val() === userName;

  const usersRef = roomRef.child('users');
  const usersListener = (snap) => {
    if (callbacks.onUsersChange) callbacks.onUsersChange(snap.val() || {});
  };
  usersRef.on('value', usersListener);
  activeListeners.push({ ref: usersRef, event: 'value', listener: usersListener });

  const startTimeRef = roomRef.child('startTime');
  const startTimeListener = (snap) => {
    const t = snap.val();
    if (typeof t === 'number') {
      state.startTime = t;
      if (callbacks.onStartTimeChange) callbacks.onStartTimeChange(t);
    }
  };
  startTimeRef.on('value', startTimeListener);
  activeListeners.push({ ref: startTimeRef, event: 'value', listener: startTimeListener });

  saveSession(userName, roomCode);

  return getRoomState();
}

export function getRoomRef() {
  return roomRef;
}

// Room-creator-only: adjust the shared start time (drives the countdown for everyone).
export function setStartTime(ms) {
  if (!roomRef) return;
  roomRef.child('startTime').set(ms);
}

// Called before re-entering a room (e.g. auto-rejoin on load, or switching devices/rooms
// mid-session) so we never end up with duplicate listeners piling up on the same refs.
export function detachListeners() {
  for (const { ref, event, listener } of activeListeners) {
    ref.off(event, listener);
  }
  activeListeners = [];
}
