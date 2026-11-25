// Two layers of storage for a player's seat in a room:
// - sessionStorage: this tab's current seat (gone when the tab closes).
// - localStorage: a per-device token plus the last name/emoji used in each room,
//   so a reopened tab or restarted browser on the same phone can reclaim the
//   same seat (score and answers included) without retyping anything.
// Every access is wrapped: storage can be blocked (private mode, site data
// cleared), and the page must still work without it.
const KEY = "tqtc_player_session";
const DEVICE_KEY = "tqtc_device_id";
const SEATS_KEY = "tqtc_player_seats"; // { [roomCode]: { name, emoji } }

function readJson(store, key) {
  try {
    return JSON.parse(store.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — nothing to remember */
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** Stable id for this browser, sent with join/resume so the server can match the same device. */
export function getDeviceToken() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return newId(); // storage blocked: still an id for this page load, name matching still works
  }
}

function seatFor(code) {
  const seats = readJson(localStorage, SEATS_KEY) || {};
  return seats[code] || null;
}

export function savePlayerSession(code, name, emoji) {
  writeJson(sessionStorage, KEY, { code, name, emoji });
  const seats = readJson(localStorage, SEATS_KEY) || {};
  seats[code] = { name, emoji };
  writeJson(localStorage, SEATS_KEY, seats);
}

export function loadPlayerSession(code) {
  const stored = readJson(sessionStorage, KEY);
  if (stored?.code === code) return stored.name;
  return seatFor(code)?.name ?? null;
}

export function loadPlayerEmoji(code) {
  const stored = readJson(sessionStorage, KEY);
  if (stored?.code === code) return stored.emoji;
  return seatFor(code)?.emoji ?? null;
}

/** Forgets this tab's seat. Pass the room code to also forget the remembered seat for that room. */
export function clearPlayerSession(code) {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (code) {
    const seats = readJson(localStorage, SEATS_KEY) || {};
    delete seats[code];
    writeJson(localStorage, SEATS_KEY, seats);
  }
}
