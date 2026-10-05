const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const CORRECT_ANSWER_SCORE = 10;
// Standard/Evil/Go Wide rounds all give this bonus to the 1st..5th correct answer.
const RANK_BONUS = [5, 4, 3, 2, 1];
// A "speed" round gives everyone correct the base score, plus this extra bonus for ONLY the single fastest.
const SPEED_ROUND_FASTEST_BONUS = 10;

export const ROUND_TYPES = {
  standard: {
    label: "Standard",
    description: "10 points for a correct answer, plus a speed bonus for the first 5 correct: +5/+4/+3/+2/+1.",
  },
  speed: {
    label: "Speed",
    description: "10 points for any correct answer — but the single fastest correct answer gets a bonus 10 on top.",
  },
  evil: {
    label: "Evil",
    description: "A wrong answer costs you 10 points. Skipping is safe. Correct answers still get the speed bonus.",
  },
  go_wide: {
    label: "Go Wide",
    description: "Players pick 2 answers instead of 1, for half the points (including any speed bonus).",
  },
};

/** @type {Map<string, Room>} */
const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

/** The alphabet-board answer is the first letter of the answer text, ignoring a leading "The". */
export function computeAnswerLetter(answerText) {
  if (!answerText) return null;
  let text = answerText.trim();
  const leadingThe = /^the\s+/i.exec(text);
  if (leadingThe) text = text.slice(leadingThe[0].length);
  const letterMatch = /[A-Za-z]/.exec(text);
  return letterMatch ? letterMatch[0].toUpperCase() : null;
}

/** The letter board merges U/V and Y/Z into single tiles, so either letter in a pair counts as a match. */
function letterGroup(letter) {
  if (letter === "U" || letter === "V") return "UV";
  if (letter === "Y" || letter === "Z") return "YZ";
  return letter;
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

function shuffledWithOriginalIndex(options) {
  const items = options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createRoom(hostSocketId) {
  const code = generateCode();
  const room = {
    code,
    hostSocketId,
    round: null, // { id, name, questions, roundType } — the round currently being played
    queue: [], // [{ id, roundId, roundName, roundType, questionCount }] — the running order, editable until each entry is played
    queueSeq: 0,
    players: new Map(), // socketId -> { id, name, score, lastAnswer }
    state: "lobby", // lobby | picture | question | reveal | ended
    questionIndex: -1,
    questionStartedAt: null,
    timer: null,
  };
  rooms.set(code, room);
  return room;
}

export function queueList(room) {
  return room.queue;
}

export function addToQueue(room, roundSummary, roundType, fastTrack) {
  room.queueSeq += 1;
  const entry = {
    id: `q${room.queueSeq}`,
    roundId: roundSummary.id,
    roundName: roundSummary.name,
    roundType: ROUND_TYPES[roundType] ? roundType : "standard",
    fastTrack: !!fastTrack,
    questionCount: roundSummary.questionCount,
    visibility: roundSummary.visibility,
  };
  room.queue.push(entry);
  return entry;
}

export function removeFromQueue(room, entryId) {
  room.queue = room.queue.filter((e) => e.id !== entryId);
}

export function reorderQueue(room, entryId, direction) {
  const idx = room.queue.findIndex((e) => e.id === entryId);
  if (idx === -1) return;
  const target = idx + direction;
  if (target < 0 || target >= room.queue.length) return;
  const queue = [...room.queue];
  [queue[idx], queue[target]] = [queue[target], queue[idx]];
  room.queue = queue;
}

/** Pops the next queued round off the front of the running order. */
export function popNextFromQueue(room) {
  return room.queue.shift();
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

export function removeRoom(code) {
  const room = rooms.get(code);
  if (room?.timer) clearTimeout(room.timer);
  if (room?.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);
  if (room) {
    for (const p of room.players.values()) {
      if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    }
  }
  rooms.delete(code);
}

/** Loads a round from the bank into the room and resets per-round progress. Keeps players' scores. */
export function selectRound(room, roundData, roundType, fastTrack) {
  if (room.timer) clearTimeout(room.timer);
  room.round = {
    id: roundData.id,
    name: roundData.name,
    questions: roundData.questions,
    roundType: ROUND_TYPES[roundType] ? roundType : "standard",
    fastTrack: !!fastTrack,
  };
  room.questionIndex = -1;
  room.questionStartedAt = null;
  room.correctAnswerCount = 0;
  room.fastTrackTopIds = null;
  room.state = "lobby";
  for (const p of room.players.values()) p.lastAnswer = null;
}

export function addPlayer(room, socketId, name) {
  room.players.set(socketId, {
    id: socketId,
    name: name.slice(0, 24),
    score: 0,
    lastAnswer: null,
    disconnected: false,
    disconnectTimer: null,
  });
}

export function removePlayer(room, socketId) {
  room.players.delete(socketId);
}

/** Finds a player by name (case-insensitive) regardless of their current socket id. */
export function findPlayerByName(room, name) {
  const normalized = name.trim().toLowerCase();
  for (const [socketId, player] of room.players) {
    if (player.name.toLowerCase() === normalized) return { socketId, player };
  }
  return null;
}

export function markPlayerDisconnected(room, socketId) {
  const player = room.players.get(socketId);
  if (player) player.disconnected = true;
  return player;
}

/** Moves a disconnected player's record onto their new socket id, keeping their score. */
export function resumePlayer(room, oldSocketId, newSocketId) {
  const player = room.players.get(oldSocketId);
  if (!player) return null;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  room.players.delete(oldSocketId);
  player.id = newSocketId;
  player.disconnected = false;
  player.disconnectTimer = null;
  room.players.set(newSocketId, player);
  return player;
}

export function playerList(room) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    online: !p.disconnected,
  }));
}

export function leaderboard(room) {
  return playerList(room).sort((a, b) => b.score - a.score);
}

/** The top `n` players' ids by current score — used to snapshot standings before a Fast Track question. */
function topPlayerIds(room, n) {
  return leaderboard(room)
    .slice(0, n)
    .map((p) => p.id);
}

export function currentQuestion(room) {
  return room.round?.questions[room.questionIndex];
}

export function hasMoreQuestions(room) {
  if (!room.round) return false;
  return room.questionIndex + 1 < room.round.questions.length;
}

/** Advance to the next question in the current round. Does NOT start the timer — call revealBoard for that. */
export function advanceToNextQuestion(room) {
  room.questionIndex += 1;
  room.questionStartedAt = null;
  room.correctAnswerCount = 0;
  for (const p of room.players.values()) p.lastAnswer = null;

  const q = currentQuestion(room);
  if (!q) {
    room.state = "round-end";
    return null;
  }

  room.state = q.pictureUrl ? "picture" : "question-pending";
  return q;
}

export function picturePayload(room) {
  const q = currentQuestion(room);
  if (!q) return null;
  return {
    pictureUrl: q.pictureUrl,
    text: q.text,
    index: room.questionIndex,
    total: room.round.questions.length,
  };
}

/** Shows the answer board (options grid or alphabet) and starts the timer. */
export function revealBoard(room, onTimeout) {
  const q = currentQuestion(room);
  if (!q) return null;

  room.state = "question";
  room.questionStartedAt = Date.now();
  // Snapshot of who's in the top 3 BEFORE this question's answers come in —
  // Fast Track checks this, not the post-question standings.
  room.fastTrackTopIds = room.round.fastTrack ? topPlayerIds(room, 3) : null;

  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (room.state === "question") {
      room.state = "reveal";
      onTimeout();
    }
  }, q.timeLimitSeconds * 1000 + 300);

  const payload = {
    type: q.type,
    text: q.text,
    pictureUrl: q.pictureUrl,
    timeLimitSeconds: q.timeLimitSeconds,
    roundType: room.round.roundType,
    fastTrack: room.round.fastTrack,
    index: room.questionIndex,
    total: room.round.questions.length,
  };

  if (q.type === "multiple_choice") {
    payload.options = q.options;
  } else if (q.type === "sequence") {
    payload.items = shuffledWithOriginalIndex(q.options);
  }

  return payload;
}

export function submitAnswer(room, socketId, response) {
  const player = room.players.get(socketId);
  if (!player || room.state !== "question") return null;
  if (player.lastAnswer !== null) return null; // already answered

  const q = currentQuestion(room);
  const roundType = room.round.roundType;
  const elapsedMs = Date.now() - room.questionStartedAt;
  const goWide = roundType === "go_wide" && (q.type === "multiple_choice" || q.type === "normal");

  let isCorrect = false;
  let given;

  if (q.type === "normal") {
    const correctGroup = letterGroup(computeAnswerLetter(q.answerText));
    if (goWide) {
      const letters = Array.isArray(response?.letters)
        ? response.letters.slice(0, 2).map((l) => (l || "").toUpperCase())
        : [];
      given = letters;
      isCorrect = letters.some((l) => l && letterGroup(l) === correctGroup);
    } else {
      given = (response?.letter || "").toUpperCase();
      isCorrect = !!given && letterGroup(given) === correctGroup;
    }
  } else if (q.type === "number") {
    given = Number(response?.number);
    isCorrect = !Number.isNaN(given) && given === q.answerNumber;
  } else if (q.type === "sequence") {
    given = Array.isArray(response?.order) ? response.order : null;
    isCorrect = arraysEqual(
      given,
      q.options.map((_, i) => i)
    );
  } else if (goWide) {
    const picks = Array.isArray(response?.optionIndices) ? response.optionIndices.slice(0, 2) : [];
    given = picks;
    isCorrect = picks.includes(q.correctIndex);
  } else {
    given = response?.optionIndex;
    isCorrect = given === q.correctIndex;
  }

  let points = 0;
  let rank = null;

  if (isCorrect) {
    room.correctAnswerCount += 1;
    rank = room.correctAnswerCount;

    if (roundType === "speed") {
      // Everyone correct gets the base score; only the single fastest also gets the bonus.
      points = CORRECT_ANSWER_SCORE + (rank === 1 ? SPEED_ROUND_FASTEST_BONUS : 0);
    } else {
      const total = CORRECT_ANSWER_SCORE + (RANK_BONUS[rank - 1] || 0);
      points = goWide ? Math.round(total / 2) : total;
    }
  } else if (roundType === "evil") {
    points = -CORRECT_ANSWER_SCORE;
  }

  player.lastAnswer = { given, isCorrect, points, rank, elapsedMs };
  player.score += points;

  return player.lastAnswer;
}

export function allPlayersAnswered(room) {
  if (room.players.size === 0) return false;
  return Array.from(room.players.values()).every((p) => p.lastAnswer !== null);
}

/**
 * Fast Track: if everyone who was in the top 3 BEFORE this question got it
 * wrong (or didn't answer), whoever answered correctly the fastest — by
 * definition, someone outside the top 3 — jumps to equal the leader's score.
 * Mutates the fast-tracked player's score; call before reading final scores.
 */
function computeFastTrack(room) {
  const topIds = room.fastTrackTopIds;
  if (!topIds || topIds.length === 0) return null;

  for (const id of topIds) {
    const p = room.players.get(id);
    if (p?.lastAnswer?.isCorrect) return null; // a top-3 player got it right — no fast track
  }

  let fastest = null;
  for (const p of room.players.values()) {
    if (!p.lastAnswer?.isCorrect) continue;
    if (!fastest || p.lastAnswer.elapsedMs < fastest.lastAnswer.elapsedMs) fastest = p;
  }
  if (!fastest) return null; // nobody got it right

  const leaderScore = Math.max(...Array.from(room.players.values()).map((p) => p.score));
  if (fastest.score >= leaderScore) return null; // already tied or ahead

  fastest.score = leaderScore;
  return { playerId: fastest.id, playerName: fastest.name, newScore: leaderScore };
}

export function revealAnswer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.state = "reveal";
  const q = currentQuestion(room);

  // Must run before building `results` below so the fast-tracked player's
  // boosted score is what gets sent out, not their pre-boost score.
  const fastTrackEvent = room.round.fastTrack ? computeFastTrack(room) : null;

  const base = {
    type: q.type,
    roundType: room.round.roundType,
    fastTrackEvent,
    results: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      answer: p.lastAnswer,
      score: p.score,
    })),
  };

  if (q.type === "normal") {
    return { ...base, correctLetter: computeAnswerLetter(q.answerText), answerText: q.answerText };
  }
  if (q.type === "number") {
    return { ...base, correctNumber: q.answerNumber };
  }
  if (q.type === "sequence") {
    return { ...base, correctOrder: q.options };
  }
  return { ...base, correctIndex: q.correctIndex };
}
