import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { parseCookie as parseCookieHeader } from "cookie";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import * as bankStore from "./bankStore.js";
import * as userStore from "./userStore.js";
import * as game from "./gameManager.js";
import * as gameStore from "./gameStore.js";
import { COOKIE_NAME, COOKIE_MAX_AGE_MS, signSession, verifySession } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a deployment point this at a mounted persistent disk (e.g. Render)
// instead of the local server/data folder. Kept in sync with bankStore.js/userStore.js.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PORT = process.env.PORT || 4000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const HOST_RECONNECT_GRACE_MS = 45_000;
const PLAYER_RECONNECT_GRACE_MS = 60_000;
const SNAPSHOT_INTERVAL_MS = 5_000;
const INVITE_CODE = process.env.INVITE_CODE || "quiznight";
if (!process.env.INVITE_CODE) {
  console.warn('⚠️  INVITE_CODE is not set — using the default "quiznight". Set a real one before deploying.');
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null;
if (!ALLOWED_ORIGINS) {
  console.warn(
    "⚠️  ALLOWED_ORIGINS is not set — reflecting any request origin (fine for LAN dev, not for a real deployment)."
  );
}

function corsOrigin(origin, callback) {
  // No ALLOWED_ORIGINS configured: dev mode, reflect whatever origin asked (LAN IPs vary by network).
  if (!ALLOWED_ORIGINS) return callback(null, true);
  // No origin header (e.g. same-origin or server-to-server) or an explicitly allowed origin.
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`Origin ${origin} not allowed by CORS`));
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

const app = express();
// Only trust X-Forwarded-* headers from the immediate hop when it's loopback —
// that's cloudflared/a local reverse proxy, not an arbitrary LAN/internet client
// spoofing its IP to dodge the login rate limiter.
app.set("trust proxy", "loopback");
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(UPLOADS_DIR));

function requireAuth(req, res, next) {
  const user = verifySession(req.cookies[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  req.user = user;
  next();
}

// ---- Auth ----
app.post("/api/auth/signup", (req, res) => {
  const { name, password, inviteCode } = req.body || {};
  if (inviteCode !== INVITE_CODE) return res.status(403).json({ error: "Invalid invite code" });
  if (!name || !name.trim() || name.trim().length > 24) {
    return res.status(400).json({ error: "Enter a name up to 24 characters" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (userStore.findByName(name)) {
    return res.status(409).json({ error: "That name is already taken" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = userStore.createUser({ name, passwordHash });
  const token = signSession(user);
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
  res.status(201).json({ user: { id: user.id, name: user.name } });
});

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { name, password } = req.body || {};
  const user = name ? userStore.findByName(name) : null;
  if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Wrong name or password" });
  }
  const token = signSession(user);
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
  res.json({ user: { id: user.id, name: user.name } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = verifySession(req.cookies[COOKIE_NAME]);
  res.json({ user });
});

// ---- Quiz Bank REST API ----
// Public rounds are visible to everyone signed in; private rounds only to their owner.
function visibleTo(round, userId) {
  return round.visibility === "public" || round.ownerId === userId;
}

app.get("/api/bank", requireAuth, (req, res) => {
  const rounds = bankStore
    .listAllRounds()
    .filter((r) => visibleTo(r, req.user.id))
    .map(({ id, name, questions, createdBy, createdAt, visibility, ownerId, timesUsed }) => ({
      id,
      name,
      questionCount: questions.length,
      createdBy,
      createdAt,
      visibility,
      timesUsed,
      mine: ownerId === req.user.id,
    }));
  res.json(rounds);
});

app.get("/api/bank/:id", requireAuth, (req, res) => {
  const round = bankStore.getRound(req.params.id);
  if (!round || !visibleTo(round, req.user.id)) return res.status(404).json({ error: "Not found" });
  res.json({ ...round, mine: round.ownerId === req.user.id });
});

app.post("/api/bank", requireAuth, (req, res) => {
  const round = bankStore.createRound({ ...req.body, ownerId: req.user.id, createdBy: req.user.name });
  res.status(201).json(round);
});

app.put("/api/bank/:id", requireAuth, (req, res) => {
  const existing = bankStore.getRound(req.params.id);
  if (!existing || !visibleTo(existing, req.user.id)) return res.status(404).json({ error: "Not found" });

  const isOwner = existing.ownerId === req.user.id;
  const payload = { ...req.body };
  // Only the owner can change a round's visibility — everyone else edits content only.
  if (!isOwner) delete payload.visibility;

  const round = bankStore.updateRound(req.params.id, payload);
  res.json(round);
});

app.delete("/api/bank/:id", requireAuth, (req, res) => {
  const existing = bankStore.getRound(req.params.id);
  if (!existing || !visibleTo(existing, req.user.id)) return res.status(404).json({ error: "Not found" });
  bankStore.deleteRound(req.params.id);
  res.status(204).end();
});

app.get("/api/round-types", (req, res) => {
  res.json(game.ROUND_TYPES);
});

// ---- Image upload (for the picture question modifier) ----
app.post("/api/uploads", requireAuth, (req, res) => {
  const { dataUrl } = req.body || {};
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(dataUrl || "");
  if (!match) return res.status(400).json({ error: "Expected a base64 image data URL (png/jpg/gif/webp)" });

  const ext = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: "Image too large (max 8MB)" });
  }

  const filename = `${nanoid(10)}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  res.status(201).json({ url: `/uploads/${filename}` });
});

// ---- Built client (served from the same origin/port as the API, so a single
// public URL — e.g. a Cloudflare Tunnel hostname — covers the whole app) ----
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
} else {
  console.warn("⚠️  client/dist not found — run `npm run build` in client/ to serve it from here.");
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });

io.use((socket, next) => {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie || "");
  socket.data.user = verifySession(cookies[COOKIE_NAME]);
  next();
});

function emitPlayers(room) {
  io.to(room.code).emit("room:players", game.playerList(room));
}

// Shared by a live socket "disconnect" and by the startup restore below (every
// player/host comes back from a disk snapshot already "disconnected" under a
// now-stale socket id, so they go through the exact same grace-period logic a
// real disconnect would have triggered).
function schedulePlayerDisconnectGrace(room, player) {
  const disconnectedSocketId = player.id;
  player.disconnectTimer = setTimeout(() => {
    const current = room.players.get(disconnectedSocketId);
    if (current === player && player.disconnected) {
      game.removePlayer(room, disconnectedSocketId);
      emitPlayers(room);
    }
  }, PLAYER_RECONNECT_GRACE_MS);
}

function scheduleHostDisconnectGrace(room, disconnectedSocketId) {
  room.hostDisconnectTimer = setTimeout(() => {
    room.hostDisconnectTimer = null;
    if (room.hostSocketId === disconnectedSocketId) {
      io.to(room.code).emit("game:hostLeft");
      game.removeRoom(room.code);
    }
  }, HOST_RECONNECT_GRACE_MS);
}

function emitQueue(room) {
  io.to(room.code).emit("game:queue", game.queueList(room));
}

function emitLeaderboard(room) {
  io.to(room.code).emit("game:leaderboard", {
    standings: game.leaderboard(room),
    hasMore: game.hasMoreQuestions(room),
  });
}

function doReveal(room) {
  const reveal = game.revealAnswer(room);
  room.lastReveal = reveal; // cached so a host reconnect mid-reveal can restore this screen, not just the lobby
  io.to(room.code).emit("game:reveal", reveal);
}

function doRevealBoard(room) {
  const board = game.revealBoard(room, () => doReveal(room));
  room.lastBoard = board; // same reason as room.lastReveal above
  io.to(room.code).emit("game:answerBoard", board);
}

// What a reconnecting client (host, player, or presentation) needs to land
// back on the screen it was actually on, instead of always resetting to the
// lobby. Re-derives from current state where that's safe (intro); replays
// the cached payload where it isn't (question/reveal — revealBoard()/
// revealAnswer() both mutate state, so they can't just be called again).
// Room-level, not host-specific, despite the historical name of the one
// caller that needed it first.
function roomLiveState(room) {
  if (room.state === "intro") {
    return { phase: "intro", intro: game.questionIntroPayload(room) };
  }
  if (room.state === "question" && room.lastBoard) {
    const q = game.currentQuestion(room);
    const elapsedSec = (Date.now() - room.questionStartedAt) / 1000;
    const secondsLeft = Math.max(0, Math.round(q.timeLimitSeconds - elapsedSec));
    return { phase: "question", board: room.lastBoard, secondsLeft };
  }
  if (room.state === "reveal" && room.lastReveal) {
    return { phase: "reveal", board: room.lastBoard, reveal: room.lastReveal };
  }
  return null;
}

io.on("connection", (socket) => {
  // ----- Host events -----
  socket.on("host:createRoom", (_payload, ack) => {
    if (!socket.data.user) return ack?.({ ok: false, error: "Sign in to host a quiz" });
    try {
      const room = game.createRoom(socket.id);
      socket.join(room.code);
      socket.data.role = "host";
      socket.data.roomCode = room.code;
      ack?.({ ok: true, code: room.code });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // Re-identifies a reconnecting socket as the host of a room it previously
  // hosted, canceling any pending grace-period removal (see "disconnect").
  socket.on("host:resume", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }
    room.hostSocketId = socket.id;
    socket.join(room.code);
    socket.data.role = "host";
    socket.data.roomCode = room.code;

    ack?.({
      ok: true,
      code: room.code,
      round: room.round
        ? {
            name: room.round.name,
            roundType: room.round.roundType,
            fastTrack: room.round.fastTrack,
            questionCount: room.round.questions.length,
          }
        : null,
      queue: game.queueList(room),
      live: roomLiveState(room),
    });
  });

  // ----- Running order (queue) events -----
  // The running order can be built up and edited any time — while players are
  // still joining, or mid-game between rounds — right up until a round is
  // actually popped off the front and started.
  socket.on("host:queueAdd", ({ code, roundId, roundType, fastTrack }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    if (!socket.data.user) return ack?.({ ok: false, error: "Sign in to host a quiz" });

    const roundData = bankStore.getRound(roundId);
    if (!roundData || !visibleTo(roundData, socket.data.user.id)) {
      return ack?.({ ok: false, error: "Round not found in the bank" });
    }
    if (!roundData.questions.length) return ack?.({ ok: false, error: "That round has no questions" });
    if (!game.ROUND_TYPES[roundType]) return ack?.({ ok: false, error: "Unknown round type" });

    game.addToQueue(
      room,
      {
        id: roundData.id,
        name: roundData.name,
        questionCount: roundData.questions.length,
        visibility: roundData.visibility,
      },
      roundType,
      fastTrack
    );
    emitQueue(room);
    ack?.({ ok: true });
  });

  socket.on("host:queueRemove", ({ code, entryId }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    game.removeFromQueue(room, entryId);
    emitQueue(room);
    ack?.({ ok: true });
  });

  socket.on("host:queueReorder", ({ code, entryId, direction }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    game.reorderQueue(room, entryId, direction);
    emitQueue(room);
    ack?.({ ok: true });
  });

  socket.on("host:startQuestion", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });

    // Current round exhausted (or no round yet) — pull the next one off the running order.
    if (!room.round || !game.hasMoreQuestions(room)) {
      const nextEntry = game.popNextFromQueue(room);
      if (!nextEntry) return ack?.({ ok: false, error: "Add a round to the running order first" });

      const roundData = bankStore.getRound(nextEntry.roundId);
      if (!roundData || !roundData.questions.length) {
        return ack?.({ ok: false, error: "That round is no longer available in the bank" });
      }

      game.selectRound(room, roundData, nextEntry.roundType, nextEntry.fastTrack);
      bankStore.incrementTimesUsed(roundData.id);
      io.to(room.code).emit("game:roundSelected", {
        roundName: room.round.name,
        roundType: room.round.roundType,
        fastTrack: room.round.fastTrack,
        questionCount: room.round.questions.length,
      });
      emitQueue(room);
    }

    const q = game.advanceToNextQuestion(room);
    if (!q) return ack?.({ ok: false, error: "This round has no questions" });

    // Every question starts in "intro" — players see the question (and picture,
    // if any) but no answer board or timer until the host explicitly reveals it
    // via "host:revealBoard", at their own pace.
    io.to(room.code).emit("game:questionIntro", game.questionIntroPayload(room));
    ack?.({ ok: true, phase: "intro" });
  });

  socket.on("host:revealBoard", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    if (room.state !== "intro") return ack?.({ ok: false, error: "Not in intro phase" });
    doRevealBoard(room);
    ack?.({ ok: true });
  });

  socket.on("host:forceReveal", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    if (room.state !== "question") return ack?.({ ok: false, error: "Not in question state" });
    doReveal(room);
    ack?.({ ok: true });
  });

  // The scoreboard used to auto-appear 4s after a reveal; now the host decides
  // when, same pacing model as the question intro/reveal-board steps.
  socket.on("host:revealScoreboard", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    if (room.state !== "reveal") return ack?.({ ok: false, error: "Not in reveal phase" });
    emitLeaderboard(room);
    ack?.({ ok: true });
  });

  socket.on("host:endGame", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    io.to(room.code).emit("game:ended", { standings: game.leaderboard(room) });
    game.removeRoom(room.code);
    ack?.({ ok: true });
  });

  // Lets the host kick a player (misbehaving, joined by mistake, etc.) out of
  // the room entirely — distinct from the reconnect-grace "disconnected" state,
  // this removes them immediately and tells their client to bail out.
  socket.on("host:removePlayer", ({ code, playerId }, ack) => {
    const room = game.getRoom(code);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, error: "Not authorized" });
    const player = room.players.get(playerId);
    if (!player) return ack?.({ ok: false, error: "Player not found" });

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    game.removePlayer(room, playerId);
    emitPlayers(room);

    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) {
      playerSocket.emit("game:removed");
      playerSocket.leave(room.code);
    }
    ack?.({ ok: true });
  });

  // ----- Presentation (spectator) events -----
  // Joins the room's broadcast group without becoming a player or the host —
  // for the big-screen/Teams-share view the quiz master projects.
  socket.on("spectator:join", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    socket.join(room.code);
    socket.data.role = "spectator";
    socket.data.roomCode = room.code;

    ack?.({ ok: true, roundName: room.round?.name ?? null, live: roomLiveState(room) });
    emitPlayers(room);
  });

  // ----- Player events -----
  // Validates a room code before the naming/emoji screen, and reports which
  // emoji are already taken so the picker can grey them out up front. Joining
  // is allowed at any point in a game (not just the lobby) — both for genuine
  // latecomers, and so a player who got fully dropped (past the reconnect
  // grace period, removed from the room) has a way back in via this same
  // flow rather than being stuck once their "player:resume" session expires.
  socket.on("player:checkRoom", ({ code }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    ack?.({ ok: true, takenEmojis: Array.from(game.takenEmojis(room)) });
  });

  socket.on("player:join", ({ code, name, emoji }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    if (!name || !name.trim()) return ack?.({ ok: false, error: "Name required" });

    const result = game.addPlayer(room, socket.id, name.trim(), emoji);
    if (!result.ok) return ack?.(result);
    socket.join(room.code);
    socket.data.role = "player";
    socket.data.roomCode = room.code;

    // A latecomer lands on whatever screen is actually live (question, reveal,
    // etc.) via the same payload a reconnect uses — PlayerGame.jsx's
    // "player:resume" call right after this join picks it up from there.
    ack?.({ ok: true, roundName: room.round?.name ?? null, live: roomLiveState(room) });
    emitPlayers(room);
  });

  // Re-identifies a reconnecting socket as an existing player by name, so a
  // screen lock, app switch, or brief Wi-Fi drop doesn't wipe their score.
  // Called on every socket "connect" from the player screen, including the
  // very first one right after "player:join" — so it must be a no-op then.
  socket.on("player:resume", ({ code, name }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    if (!name || !name.trim()) return ack?.({ ok: false, error: "Name required" });

    const found = game.findPlayerByName(room, name);
    if (!found) return ack?.({ ok: false, error: "Session expired — please rejoin" });

    if (found.socketId === socket.id) {
      // Already this exact connection (the resume call right after a fresh join).
      socket.join(room.code);
      socket.data.role = "player";
      socket.data.roomCode = room.code;
      return ack?.({
        ok: true,
        roundName: room.round?.name ?? null,
        score: found.player.score,
        live: roomLiveState(room),
        myAnswer: found.player.lastAnswer,
      });
    }

    if (!found.player.disconnected) {
      return ack?.({ ok: false, error: "That name is already connected elsewhere" });
    }

    const player = game.resumePlayer(room, found.socketId, socket.id);
    socket.join(room.code);
    socket.data.role = "player";
    socket.data.roomCode = room.code;

    ack?.({
      ok: true,
      roundName: room.round?.name ?? null,
      score: player.score,
      live: roomLiveState(room),
      myAnswer: player.lastAnswer,
    });
    emitPlayers(room);
  });

  socket.on("player:submitAnswer", ({ code, response }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    const result = game.submitAnswer(room, socket.id, response);
    if (!result) return ack?.({ ok: false, error: "Could not submit answer" });
    ack?.({ ok: true, result });

    io.to(room.code).emit("game:answerCount", {
      answered: Array.from(room.players.values()).filter((p) => p.lastAnswer !== null).length,
      total: room.players.size,
    });
  });

  // Lets a player flip Go Wide on a Number question after already submitting,
  // as long as the question is still live — see updateGoWideNumber for why.
  socket.on("player:updateGoWide", ({ code, wide }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    const result = game.updateGoWideNumber(room, socket.id, !!wide);
    if (!result) return ack?.({ ok: false, error: "Could not update answer" });
    ack?.({ ok: true, result });
  });

  // Multiple Choice/Normal Go Wide: a second pick submitted after the first,
  // same "stays live after submitting" pattern as Number — see addSecondPick.
  socket.on("player:addSecondPick", ({ code, pick }, ack) => {
    const room = game.getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    const result = game.addSecondPick(room, socket.id, pick);
    if (!result) return ack?.({ ok: false, error: "Could not add second pick" });
    ack?.({ ok: true, result });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = game.getRoom(code);
    if (!room) return;

    if (socket.data.role === "player") {
      // Grace period: a screen lock, backgrounded app, or brief Wi-Fi drop
      // shouldn't kick the player and wipe their score. Only remove them if
      // they don't reclaim their name (via "player:resume") before it fires.
      const player = game.markPlayerDisconnected(room, socket.id);
      if (player) {
        emitPlayers(room);
        schedulePlayerDisconnectGrace(room, player);
      }
    } else if (socket.data.role === "host" && room.hostSocketId === socket.id) {
      // Grace period: a page refresh or brief network drop shouldn't nuke the
      // room and every player's score. Only remove it if nobody re-identifies
      // as this room's host (via "host:resume") before the timer fires.
      scheduleHostDisconnectGrace(room, socket.id);
    }
  });
});

// ---- Game-state persistence (survives a crash or a redeploy) ----
// Rooms live in memory only; this snapshots them to the same persistent disk
// bankStore.js/userStore.js use (DATA_DIR), and restores on boot. Every
// player/host comes back "disconnected" under their old socket id and goes
// through the normal reconnect-grace flow — see gameManager.js's
// loadRoomsFromSnapshot/resumeQuestionTimer for the state-rebuild details.
const restoredRooms = game.loadRoomsFromSnapshot(gameStore.loadSnapshot());
for (const room of restoredRooms) {
  game.resumeQuestionTimer(room, () => doReveal(room));
  scheduleHostDisconnectGrace(room, null);
  for (const player of room.players.values()) {
    schedulePlayerDisconnectGrace(room, player);
  }
}
if (restoredRooms.length) {
  console.log(`Restored ${restoredRooms.length} in-progress room(s) from disk.`);
}

function snapshotRooms() {
  gameStore.saveSnapshot(game.allRooms().map(game.serializeRoom));
}
setInterval(snapshotRooms, SNAPSHOT_INTERVAL_MS);
// Render sends SIGTERM before killing the old instance on a redeploy — flush
// one last snapshot so we don't lose up to SNAPSHOT_INTERVAL_MS of state.
process.on("SIGTERM", () => {
  snapshotRooms();
  process.exit(0);
});

httpServer.listen(PORT, () => {
  console.log(`Quiz server listening on http://localhost:${PORT}`);
});
