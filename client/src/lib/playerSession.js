// Survives a hard page reload (not just a socket reconnect) so a player who's
// fully closed and reopened their browser mid-quiz can still reclaim their seat.
const KEY = "tqtc_player_session";

export function savePlayerSession(code, name, emoji) {
  sessionStorage.setItem(KEY, JSON.stringify({ code, name, emoji }));
}

export function loadPlayerSession(code) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return stored?.code === code ? stored.name : null;
  } catch {
    return null;
  }
}

export function loadPlayerEmoji(code) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return stored?.code === code ? stored.emoji : null;
  } catch {
    return null;
  }
}

export function clearPlayerSession() {
  sessionStorage.removeItem(KEY);
}
