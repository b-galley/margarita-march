// Boot sequence for Margarita March. M0: splash/lobby -> room entry, session restore
// ("remember this device"), presence roster, countdown/time-adjuster. M1 adds: stops
// CRUD, the map, scoring, and the leaderboard — the actual crawl-night core loop.

import { DEFAULT_SCORES } from "./categories.js";
import {
  destroyStopPicker,
  initMap,
  refreshMarkers,
  setStopPickerPosition,
  showStopPicker,
} from "./map.js";
import {
  avatarChip,
  renderLeaderboard,
  renderStops,
  updateStickyLeader,
} from "./render.js";
import {
  createRoom,
  detachListeners,
  enterRoom,
  getRoomState,
  joinRoom,
  setStartTime,
} from "./room.js";
import {
  attachRatingsListener,
  getUserComposite,
  submitRatings,
} from "./scoring.js";
import { clearSession, restoreSession } from "./session.js";
import {
  addStop,
  attachStopsListener,
  FALLBACK_CENTER,
  geocodeAddress,
  removeStop,
  updateStop,
} from "./stops.js";

const $ = (id) => document.getElementById(id);

let TARGET = new Date("2026-09-12T15:00:00-05:00").getTime(); // 3pm ET Indy on crawl day

// Extra listeners beyond what room.js tracks (users/startTime) — stops + ratings attach
// once a room is entered, so they need their own cleanup on switch-device / re-entry.
let extraListeners = [];

// ---------------- APP STATE ----------------
// Full-rebuild-on-change render pattern (same approach the old app used) — state lives
// here, render.js just turns it into HTML on demand.
const state = {
  stops: [],
  allRatings: {},
  allUsers: {},
  myLocalScores: {},
  mySubmittedStops: {},
  notes: {},
  expandedStopId: null,
  editingStopId: null,
};

// ---------------- TOAST ----------------
function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------------- COUNTDOWN ----------------
function updateCountdown() {
  const cdH = $("cd-h"),
    cdM = $("cd-m"),
    cdS = $("cd-s");
  if (!cdH) return;
  const diff = TARGET - Date.now();
  if (diff <= 0) {
    cdH.textContent = "00";
    cdM.textContent = "00";
    cdS.textContent = "00";
    const lbl = document.querySelector(".countdown-label");
    if (lbl) lbl.textContent = "★ The March is LIVE! ★";
    return;
  }
  const totalH = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  cdH.textContent = String(totalH).padStart(2, "0");
  cdM.textContent = String(m).padStart(2, "0");
  cdS.textContent = String(s).padStart(2, "0");
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ---------------- ROOM CODE INPUT UX ----------------
const roomChars = document.querySelectorAll(".room-char");
roomChars.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (input.value && i < 3) roomChars[i + 1].focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && i > 0)
      roomChars[i - 1].focus();
    if (e.key === "Enter") $("joinRoomBtn").click();
  });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    for (let j = 0; j < 4 && j < pasted.length; j++)
      roomChars[j].value = pasted[j];
    if (pasted.length >= 4) roomChars[3].focus();
  });
});

function showLobbyError(msg) {
  $("lobbyError").textContent = msg;
}

// ---------------- ROOM ROSTER / PRESENCE RENDER ----------------
function renderRoster(usersObj) {
  state.allUsers = usersObj || {};
  const names = Object.keys(state.allUsers);
  const onlineCount = names.filter(
    (n) => state.allUsers[n] && state.allUsers[n].online,
  ).length;
  $("userCountDisplay").textContent =
    `${onlineCount} marcher${onlineCount === 1 ? "" : "s"}`;
  $("roomRoster").innerHTML = names
    .map((n) => avatarChip(n, { size: 22, fontSize: "0.6rem" }))
    .join("");
  renderAll(); // a joining/leaving user changes "who's rated" chips on every open stop card
}

// ---------------- MAIN RENDER ----------------
function renderAll() {
  renderStops(
    $("stopsList"),
    {
      stops: state.stops,
      allRatings: state.allRatings,
      allUsers: state.allUsers,
      myLocalScores: state.myLocalScores,
      mySubmittedStops: state.mySubmittedStops,
      notes: state.notes,
      expandedStopId: state.expandedStopId,
    },
    stopHandlers,
  );
  renderLeaderboard($("leaderboardList"), state.stops, state.allRatings);
  updateStickyLeader(state.stops, state.allRatings);
  refreshMarkers(state.stops);
}

// ---------------- STOP CARD HANDLERS ----------------
const stopHandlers = {
  onToggle(id) {
    state.expandedStopId = state.expandedStopId === id ? null : id;
    renderAll();
  },
  onSliderInput(id, cat, val) {
    if (!state.myLocalScores[id])
      state.myLocalScores[id] = { ...DEFAULT_SCORES };
    state.myLocalScores[id][cat] = val;
    // Cheap local-only update (no full re-render) to keep sliders smooth while dragging.
    const valBox = $(`val-${id}-${cat}`);
    if (valBox) valBox.textContent = val;
    const card = document.querySelector(`.stop-card[data-stop-id="${id}"]`);
    if (card) {
      const pillScore = card.querySelector(".pill-score");
      const pillLabel = card.querySelector(".stop-score-pill small");
      if (pillScore)
        pillScore.textContent = getUserComposite(
          state.myLocalScores[id],
        ).toFixed(1);
      if (pillLabel) pillLabel.textContent = "YOURS";
      if (state.mySubmittedStops[id]) {
        const btn = card.querySelector(".submit-ratings-btn");
        if (btn) {
          btn.className = "submit-ratings-btn not-submitted";
          btn.textContent = "Update My Ratings";
        }
      }
    }
  },
  async onSubmit(id) {
    const { userName } = getRoomState();
    const scores = state.myLocalScores[id] || { ...DEFAULT_SCORES };
    await submitRatings(id, scores);
    state.mySubmittedStops[id] = true;
    showToast("Ratings submitted!");
  },
  onNotesInput(id, text) {
    state.notes[id] = text; // local-only, matches old app's notes behavior
  },
  onNav(id, dir) {
    const idx = state.stops.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const targetIdx =
      dir === "prev"
        ? (idx - 1 + state.stops.length) % state.stops.length
        : (idx + 1) % state.stops.length;
    state.expandedStopId = state.stops[targetIdx].id;
    renderAll();
    document
      .querySelectorAll(".stop-card")
      [targetIdx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  onEdit(id) {
    const stop = state.stops.find((s) => s.id === id);
    if (!stop) return;
    state.editingStopId = id;
    $("newStopName").value = stop.name;
    $("newStopDesc").value = stop.desc;
    $("newStopAddr").value = stop.address;
    $("newStopLat").value = stop.lat ?? "";
    $("newStopLng").value = stop.lng ?? "";
    $("stopModalEyebrow").textContent = "EDIT STOP";
    $("stopModalTitle").textContent = "Edit Stop";
    $("confirmAddStop").textContent = "Save Changes";
    $("addStopModal").classList.add("active");
    const lat = stop.lat ?? FALLBACK_CENTER.lat;
    const lng = stop.lng ?? FALLBACK_CENTER.lng;
    showStopPicker(lat, lng, onPinMove);
  },
  async onRemove(id) {
    const stop = state.stops.find((s) => s.id === id);
    if (!stop) return;
    if (!confirm(`Remove "${stop.name}" from the route?`)) return;
    await removeStop(id, state.allRatings);
    showToast(`${stop.name} removed`);
  },
};

// ---------------- ADD / EDIT STOP MODAL ----------------
// The pin picker (a small Leaflet instance embedded in the modal, see map.js) keeps the
// lat/lng inputs and the visual pin in sync in both directions: dragging/clicking the
// pin fills the inputs, and typing new numbers moves the pin.
function onPinMove(latlng) {
  $("newStopLat").value = latlng.lat.toFixed(6);
  $("newStopLng").value = latlng.lng.toFixed(6);
}

function onCoordInputChange() {
  const lat = parseFloat($("newStopLat").value);
  const lng = parseFloat($("newStopLng").value);
  if (!isNaN(lat) && !isNaN(lng)) setStopPickerPosition(lat, lng);
}
$("newStopLat").addEventListener("change", onCoordInputChange);
$("newStopLng").addEventListener("change", onCoordInputChange);

// "Look up" geocodes the typed address (Nominatim) and snaps both the coordinate fields
// and the picker pin to the result — works for a brand-new stop or an edit in progress,
// since it's the same modal/fields either way.
$("lookupAddrBtn").addEventListener("click", async () => {
  const address = $("newStopAddr").value.trim();
  if (!address) return showToast("Enter an address first");

  const btn = $("lookupAddrBtn");
  btn.disabled = true;
  btn.textContent = "Looking up…";
  try {
    const result = await geocodeAddress(address);
    if (!result) {
      showToast("No match found for that address");
      return;
    }
    onPinMove(result);
    setStopPickerPosition(result.lat, result.lng);
    showToast("Pin updated");
  } catch (err) {
    showToast("Lookup failed — try again");
  } finally {
    btn.disabled = false;
    btn.textContent = "Look up";
  }
});

$("addStopBtn").addEventListener("click", () => {
  state.editingStopId = null;
  ["newStopName", "newStopDesc", "newStopAddr"].forEach((id) => {
    $(id).value = "";
  });
  // Default the fields to match the pin's starting spot exactly, rather than leaving
  // them blank — otherwise the visible pin and the coordinates actually saved (which
  // used to fall back to a random jitter near the city center) could silently diverge.
  $("newStopLat").value = FALLBACK_CENTER.lat.toFixed(6);
  $("newStopLng").value = FALLBACK_CENTER.lng.toFixed(6);
  $("stopModalEyebrow").textContent = "NEW STOP";
  $("stopModalTitle").textContent = "Add a Stop";
  $("confirmAddStop").textContent = "Save Stop";
  $("addStopModal").classList.add("active");
  showStopPicker(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng, onPinMove);
});

$("cancelAddStop").addEventListener("click", () => {
  state.editingStopId = null;
  $("addStopModal").classList.remove("active");
  destroyStopPicker();
});

$("confirmAddStop").addEventListener("click", async () => {
  const name = $("newStopName").value.trim();
  if (!name) return showToast("Name required");
  const desc = $("newStopDesc").value.trim() || "A new stop on the march.";
  const addr = $("newStopAddr").value.trim() || "Indianapolis, IN";
  const latStr = $("newStopLat").value.trim();
  const lngStr = $("newStopLng").value.trim();
  const lat = latStr ? parseFloat(latStr) : null;
  const lng = lngStr ? parseFloat(lngStr) : null;

  if (state.editingStopId) {
    await updateStop(state.editingStopId, {
      name,
      desc,
      address: addr,
      lat,
      lng,
    });
    showToast(`${name} updated`);
    state.editingStopId = null;
  } else {
    await addStop({ name, desc, address: addr, lat, lng });
    showToast(`${name} added`);
  }
  $("addStopModal").classList.remove("active");
  destroyStopPicker();
});

// ---------------- LEADERBOARD MOBILE TOGGLE ----------------
$("leaderboardToggle").addEventListener("click", () => {
  $("leaderboard").classList.toggle("open");
});

// ---------------- ENTER-ROOM UI TRANSITION ----------------
function showAppShell(userName, roomCode) {
  $("scoringAs").textContent = "Scoring as " + userName;
  $("roomCodeDisplay").textContent = roomCode;
  $("roomInfoBar").style.display = "flex";
  $("splash").style.display = "none";
  $("appShell").classList.add("active");
}

function detachExtraListeners() {
  for (const { ref, event, listener } of extraListeners)
    ref.off(event, listener);
  extraListeners = [];
}

async function goToRoom(userName, roomCode) {
  detachExtraListeners();
  const roomState = await enterRoom(userName, roomCode, {
    onUsersChange: renderRoster,
    onStartTimeChange: (t) => {
      TARGET = t;
    },
  });
  if (roomState.isRoomCreator) {
    $("stickyDate").classList.add("creator-hint");
  }
  showAppShell(userName, roomCode);
  showToast(`Welcome, ${userName}!`);

  initMap();

  extraListeners.push(
    attachStopsListener((stops) => {
      state.stops = stops;
      if (!state.expandedStopId && stops.length)
        state.expandedStopId = stops[0].id;
      renderAll();
    }),
  );

  extraListeners.push(
    attachRatingsListener((allRatings) => {
      state.allRatings = allRatings;
      if (allRatings[userName]) {
        Object.keys(allRatings[userName]).forEach((stopId) => {
          state.mySubmittedStops[stopId] = true;
          if (!state.myLocalScores[stopId]) {
            state.myLocalScores[stopId] = { ...allRatings[userName][stopId] };
          }
        });
      }
      renderAll();
    }),
  );
}

// ---------------- LOBBY: CREATE ----------------
$("createRoomLink").addEventListener("click", async () => {
  const name = $("playerName").value.trim();
  if (!name) return showLobbyError("Enter your name first");
  if (name.length > 20) return showLobbyError("Name too long — 20 chars max");

  const roomCode = await createRoom(name);
  goToRoom(name, roomCode);
});

// ---------------- LOBBY: JOIN ----------------
$("joinRoomBtn").addEventListener("click", async () => {
  const name = $("playerName").value.trim();
  if (!name) return showLobbyError("Enter your name first");
  if (name.length > 20) return showLobbyError("Name too long — 20 chars max");

  const code = Array.from(roomChars)
    .map((c) => c.value)
    .join("")
    .toUpperCase();
  if (code.length !== 4)
    return showLobbyError("Enter the full 4-character room code");

  const result = await joinRoom(name, code);
  if (result === "not_found")
    return showLobbyError(`Room ${code} not found — check the code`);

  goToRoom(name, code);
});

// ---------------- SWITCH DEVICE ----------------
$("switchDeviceLink").addEventListener("click", () => {
  detachListeners();
  detachExtraListeners();
  clearSession();
  location.reload();
});

// ---------------- TIME ADJUSTER (creator-only, triple-tap sticky-date) ----------------
(function () {
  const dateEl = $("stickyDate");
  let tapCount = 0;
  let tapTimer = null;

  dateEl.addEventListener("click", () => {
    if (!getRoomState().isRoomCreator) return;
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, 600);
    if (tapCount >= 3) {
      tapCount = 0;
      openTimeAdjuster();
    }
  });

  function openTimeAdjuster() {
    const d = new Date(TARGET);
    const pad = (n) => String(n).padStart(2, "0");
    const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $("timeAdjustInput").value = localStr;
    $("timeAdjustOverlay").classList.add("active");
  }

  $("timeAdjustCancel").addEventListener("click", () => {
    $("timeAdjustOverlay").classList.remove("active");
  });

  $("timeAdjustOverlay").addEventListener("click", (e) => {
    if (e.target === $("timeAdjustOverlay"))
      $("timeAdjustOverlay").classList.remove("active");
  });

  $("timeAdjustSave").addEventListener("click", () => {
    const val = $("timeAdjustInput").value;
    if (!val) return showToast("Pick a time first");
    const newTime = new Date(val).getTime();
    if (isNaN(newTime)) return showToast("Invalid time");
    setStartTime(newTime);
    $("timeAdjustOverlay").classList.remove("active");
    showToast("★ Start time updated ★");
  });
})();

// ---------------- BOOT: try to restore a remembered session first ----------------
(async function boot() {
  const session = await restoreSession();
  if (session) {
    await goToRoom(session.userName, session.roomCode);
  }
  // else: splash stays visible, lobby handlers above take over
})();
