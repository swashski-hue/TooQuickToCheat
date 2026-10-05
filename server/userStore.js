import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a deployment point this at a mounted persistent disk (e.g. Render)
// instead of the local server/data folder.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeAll(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

export function findByName(name) {
  const normalized = name.trim().toLowerCase();
  return readAll().find((u) => u.name.toLowerCase() === normalized) || null;
}

export function findById(id) {
  return readAll().find((u) => u.id === id) || null;
}

export function createUser({ name, passwordHash }) {
  const users = readAll();
  const user = {
    id: nanoid(10),
    name: name.trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeAll(users);
  return user;
}
