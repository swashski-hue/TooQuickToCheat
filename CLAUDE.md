# CLAUDE.md

Fast-pickup context for working on this repo. Read this first. For the
history of what's shipped, what broke, and why — see `PROJECT_STATUS.md`.
For the user-facing feature writeup — see `README.md`.

## What this is

"Too Quick To Cheat Quizzing" — a self-hosted, SpeedQuizzing-style live quiz
app. A quiz master controls the game from a control screen; players join
from their phones via a room code and answer for points; an optional
big-screen/projector view shows the live state to everyone.

**Live at https://2quick2cheat.com** (Render, auto-deploys on push to `main`).

## Tech stack

- **Server**: Node.js + Express + Socket.IO. In-memory game state (a `Map` of
  rooms in `gameManager.js`) — not persisted, not clustered. Quiz Bank and
  accounts persist to JSON files on disk (see below).
- **Client**: Vite + React. Plain CSS (`index.css`, retro SNES-inspired
  palette), no CSS framework.
- **Auth**: bcrypt + JWT session cookie, gated by a shared `INVITE_CODE` for
  signup. Only hosting/Quiz Bank management requires sign-in — joining a game
  as a player never does (room code + nickname/emoji only, by design).
- **Deployment**: single Render service — the server serves the built client
  (`client/dist`) itself, so the whole app lives behind one URL/one port. No
  separate frontend host. `render.yaml` is the Blueprint.

## Where things live

```
server/
  index.js       — Express routes + every Socket.IO event handler (the main wiring file)
  gameManager.js — in-memory room/game state machine, scoring logic, round types
                   (pure-ish functions, no server/socket dependency — see "Testing" below)
  bankStore.js   — Quiz Bank persistence (DATA_DIR/bank.json)
  userStore.js   — accounts persistence (DATA_DIR/users.json)
  gameStore.js   — in-progress game-state snapshots (DATA_DIR/games.json),
                   so a crash/redeploy doesn't lose a live room — see
                   gameManager.js's loadRoomsFromSnapshot/resumeQuestionTimer
  auth.js        — session JWT sign/verify, cookie config
  data/          — bank.json, users.json, uploads/ (gitignored, holds real content)

client/src/
  pages/      — one file per route: Home, Login, HostSetup, HostRoom, BankManager,
                RoundEditor, PlayerJoin, PlayerGame, PresentationScreen
  components/ — AddRoundModal, RunningOrderPanel (used inside HostRoom)
  lib/        — api.js (fetch helpers), socket.js (shared socket.io client),
                useCurrentUser.js, roundTypes.js, questionTypes.js, answerLetter.js,
                formatDate.js, playerSession.js
```

## Architecture

**Three client roles, one server:**
- **Host** (`/host/room/:code`) — the quiz master's control screen. Desktop-only.
- **Presentation** (`/present/:code`) — read-only big-screen/projector view. Desktop-only.
- **Player** (`/play/:code`) — where players answer. Mobile-first.

**Room state machine** (`room.state` in `gameManager.js`): `lobby → intro →
question → reveal → (leaderboard, client-side only) → round-end`. The host
drives every transition explicitly (start question, reveal answer board,
reveal scoreboard) — nothing auto-advances except the question timer itself.

**Socket events** follow a `role:action` (client→server) / `game:event`
(server→client broadcast) naming convention, e.g. `player:submitAnswer` →
`game:answerCount`. `index.js` is the only file that touches sockets
directly; all game logic/scoring lives in `gameManager.js` and is called
from there.

**Scoring** (`gameManager.js` constants): `CORRECT_ANSWER_SCORE = 5`,
`RANK_BONUS = [5,4,3,2,1]` (1st–5th correct, Standard/Evil/Go Wide rounds),
`SPEED_ROUND_FASTEST_BONUS = 5` (Speed rounds only).

**Round types** (chosen per queue entry, independent of round content):
- **Standard** — base score + rank bonus to the first 5 correct.
- **Speed** — everyone correct gets the base score; only the single fastest
  also gets the bonus.
- **Evil** — a wrong answer costs points; skipping is safe.
- **Go Wide** — optional, per-answer widening for half points. The pattern
  for every question type is the same: **submit a first pick/answer
  normally for full points, then optionally widen afterward for half
  points** — never a pre-answer "mode" the player has to choose first.
  - Multiple Choice/Normal: after submitting, the board stays active so a
    *second*, different option can be tapped (`addSecondPick`).
  - Number: a one-way "Go Wide (±1)" button — can't be unpressed, stays
    pressable even after submitting (`updateGoWideNumber`).
  - Sequence: mark one item as a wildcard (its position doesn't count);
    chosen before submitting, since it's part of the one submission.

**Fast Track** — an optional per-round modifier (independent of round type):
if the top-3 players (snapshotted before the question) all get it wrong, the
single fastest correct answerer (necessarily outside the top 3) jumps to
equal the leader's score.

## Design guidelines

- **Host-facing tools are desktop-only**: `HostSetup`, `HostRoom` (+
  `AddRoundModal`/`RunningOrderPanel`), `BankManager`, `RoundEditor`,
  `PresentationScreen`. Design/test for mouse + keyboard at a normal desktop
  width first — mobile usability is a non-goal there (just avoid outright
  breakage like horizontal overflow).
- **Player-facing tools are mobile-first**: `PlayerJoin`, `PlayerGame`.
  Design/test for touch + portrait first — desktop usability is a non-goal.
- `Login`/`Home` are host-only in practice — treat as desktop-optimized too.
- If a new screen's bucket isn't obvious, ask rather than retrofit later.
- **The host screen must be self-sufficient**: assume the host is not
  looking at the Presentation Screen while running the game. Anything
  presentation shows that's operationally useful to the host (who answered
  what, who was fastest, etc.) needs its own treatment on the host screen
  too — not just a "same as presentation" reuse.

## Testing convention

**No automated test suite.** The established pattern for verifying scoring
logic (Go Wide, Fast Track, etc.) without a server or sockets: write a
throwaway Node script that imports `gameManager.js` directly via a
`file:///...` URL and calls its exported functions (`createRoom`,
`addPlayer`, `selectRound`, `advanceToNextQuestion`, `revealBoard`,
`submitAnswer`, `addSecondPick`, `updateGoWideNumber`, etc.) directly. Fast,
reliable, and avoids the real problem with browser-automation testing here:
driving two tabs (host + player) through a live countdown timer consistently
loses the race. Put these scripts in the scratchpad, not the repo.

For UI changes, `cd client && npx vite build` is a fast sanity check before
anything else.

## Running it locally

```bash
cd server && npm install && npm start      # http://localhost:4000
cd client && npm install && npm run dev    # http://localhost:5173
```

Optional server env vars: `SESSION_SECRET`, `INVITE_CODE`, `ALLOWED_ORIGINS`,
`DATA_DIR` — all have dev defaults (with a console warning if unset). Two
test accounts already exist in `server/data/users.json` (`Ben` / `Sam`,
passwords `password123` / `password456`).

## Known environment quirks (don't re-debug these)

- Windows `curl`'s schannel TLS backend fails the handshake against
  `2quick2cheat.com` even though the cert and server are fine — verify with
  `openssl s_client` or a real browser instead.
- The Browser-pane screenshot tool has a scaling/letterboxing bug at some
  emulated viewport sizes that doesn't match the actual DOM layout — trust
  `getBoundingClientRect()` over a screenshot if a layout bug looks wrong in
  a screenshot but you can't reproduce it live.

## Known gaps

See `PROJECT_STATUS.md`'s "Known gaps" section — kept there since it
changes as work lands.
