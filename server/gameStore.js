import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same DATA_DIR convention as bankStore.js/userStore.js — on Render this is the
// mounted persistent disk, so a snapshot survives a crash or a redeploy.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Reads the last snapshot of in-progress rooms. Returns [] if there isn't one (or it's unreadable). */
export function loadSnapshot() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(GAMES_FILE, "utf-8"));
  } catch (err) {
    console.warn("⚠️  Could not read games.json snapshot, starting with no in-progress rooms:", err.message);
    return [];
  }
}

/** Overwrites the snapshot with the current set of rooms — called periodically and on shutdown. */
export function saveSnapshot(serializedRooms) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(serializedRooms));
}
