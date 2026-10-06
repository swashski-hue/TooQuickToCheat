import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a deployment point this at a mounted persistent disk (e.g. Render)
// instead of the local server/data folder.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bank.json");
// Kept in sync with index.js's UPLOADS_DIR — needed here to clean up orphaned
// picture uploads when a question/round referencing them is removed.
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const MAX_QUESTIONS_PER_ROUND = 10;
fs.mkdirSync(DATA_DIR, { recursive: true });

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw).map(normalizeRound);
}

function writeAll(rounds) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rounds, null, 2));
}

/** Backfills fields on rounds saved before accounts/visibility/usage tracking existed. */
function normalizeRound(round) {
  return {
    ...round,
    ownerId: round.ownerId ?? null,
    visibility: round.visibility === "private" ? "private" : "public",
    timesUsed: round.timesUsed ?? 0,
  };
}

// Full records, unfiltered — callers (index.js) apply visibility/ownership rules.
export function listAllRounds() {
  return readAll();
}

export function getRound(id) {
  return readAll().find((r) => r.id === id);
}

export function incrementTimesUsed(id) {
  const rounds = readAll();
  const idx = rounds.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rounds[idx] = { ...rounds[idx], timesUsed: rounds[idx].timesUsed + 1 };
  writeAll(rounds);
  return rounds[idx];
}

export function createRound({ name, questions, ownerId, createdBy, visibility }) {
  const rounds = readAll();
  const round = {
    id: nanoid(8),
    name: name || "Untitled Round",
    questions: (questions || []).slice(0, MAX_QUESTIONS_PER_ROUND).map(normalizeQuestion),
    ownerId: ownerId ?? null,
    createdBy: (createdBy || "").trim() || "Unknown",
    createdAt: new Date().toISOString(),
    visibility: visibility === "private" ? "private" : "public",
    timesUsed: 0,
  };
  rounds.push(round);
  writeAll(rounds);
  return round;
}

export function updateRound(id, { name, questions, visibility }) {
  const rounds = readAll();
  const idx = rounds.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const oldPictures = picturesOf(rounds[idx]);
  rounds[idx] = {
    ...rounds[idx],
    name: name ?? rounds[idx].name,
    questions: questions ? questions.slice(0, MAX_QUESTIONS_PER_ROUND).map(normalizeQuestion) : rounds[idx].questions,
    visibility: visibility !== undefined ? (visibility === "private" ? "private" : "public") : rounds[idx].visibility,
    // ownerId, createdBy and createdAt are set once at creation and never change.
  };
  writeAll(rounds);
  if (questions) cleanUpOrphanedPictures(oldPictures, rounds);
  return rounds[idx];
}

export function deleteRound(id) {
  const rounds = readAll();
  const target = rounds.find((r) => r.id === id);
  if (!target) return false;
  const next = rounds.filter((r) => r.id !== id);
  writeAll(next);
  cleanUpOrphanedPictures(picturesOf(target), next);
  return true;
}

/** All pictureUrls a round's questions reference. */
function picturesOf(round) {
  return new Set((round.questions || []).map((q) => q.pictureUrl).filter(Boolean));
}

/**
 * Deletes each previously-referenced upload file that no round in `rounds`
 * still references — i.e. a question/round was deleted or had its picture
 * removed/replaced. Safe even though uploads are never reused across
 * questions in practice: it re-checks the whole bank before unlinking.
 */
function cleanUpOrphanedPictures(candidateUrls, rounds) {
  if (candidateUrls.size === 0) return;
  const stillReferenced = new Set();
  for (const r of rounds) for (const url of picturesOf(r)) stillReferenced.add(url);
  for (const url of candidateUrls) {
    if (stillReferenced.has(url)) continue;
    fs.rmSync(path.join(UPLOADS_DIR, path.basename(url)), { force: true });
  }
}

const QUESTION_TYPES = ["multiple_choice", "normal", "number", "sequence"];

function normalizeQuestion(q) {
  const type = QUESTION_TYPES.includes(q.type) ? q.type : "multiple_choice";
  const base = {
    id: q.id || nanoid(6),
    type,
    text: q.text || "",
    timeLimitSeconds: q.timeLimitSeconds || 15,
    pictureUrl: q.pictureUrl || null,
  };

  if (type === "normal") {
    base.answerText = q.answerText || "";
  } else if (type === "number") {
    base.answerNumber = Number.isFinite(Number(q.answerNumber)) ? Number(q.answerNumber) : 0;
  } else if (type === "sequence") {
    let options = Array.isArray(q.options) ? q.options.slice(0, 6) : [];
    while (options.length < 3) options.push("");
    base.options = options;
  } else {
    let options = Array.isArray(q.options) ? q.options.slice(0, 6) : [];
    while (options.length < 3) options.push("");
    base.options = options;
    base.correctIndex = typeof q.correctIndex === "number" ? Math.min(q.correctIndex, options.length - 1) : 0;
  }

  return base;
}
