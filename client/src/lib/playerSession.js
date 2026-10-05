// Survives a hard page reload (not just a socket reconnect) so a player who's
// fully closed and reopened their browser mid-quiz can still reclaim their seat.
const KEY = "tqtc_player_session";

export function savePlayerSession(code, name) {
  sessionStorage.setItem(KEY, JSON.stringify({ code, name }));
}

export function loadPlayerSession(code) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return stored?.code === code ? stored.name : null;
  } catch {
    return null;
  }
}

export function clearPlayerSession() {
  sessionStorage.removeItem(KEY);
}
