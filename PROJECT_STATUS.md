# Project Status & Roadmap

**For any new session picking this up: read this file first, then update it as you go.** Keep "Working" current, move finished items out of "Next up," and add anything you discover to "Known gaps." This file is for whoever (human or Claude) picks the project up next — it is not user-facing like `README.md`.

## What this is

A self-hosted, SpeedQuizzing-style live quiz app ("Too Quick To Cheat Quizzing"). Node/Express/Socket.IO server + Vite/React client. See `README.md` for the full feature/user-facing writeup — this file is the dev-continuity summary instead.

## Design guidelines

- **Host-facing tools are optimized for a Windows PC/laptop (desktop)**: `HostSetup`, `HostRoom` (+ its `AddRoundModal`/`RunningOrderPanel`), `BankManager`, `RoundEditor`, and `PresentationScreen` (the big-screen/projector view the host opens). The quiz master always runs these on a desktop/laptop — design and test these for mouse + keyboard on a normal desktop viewport first; mobile usability is a non-goal (though we still avoid the worst breakage, e.g. horizontal page overflow).
- **Player-facing tools are optimized for mobile**: `PlayerJoin`, `PlayerGame`. Players always join from their phone — design and test these mobile-first (touch targets, portrait layout); desktop usability is a non-goal there.
- `Login`/`Home` are effectively host-only in practice (players never sign in), so treat them as desktop-optimized too.
- When in doubt about which bucket a new screen/component falls into, ask rather than assume — don't retrofit a host tool to be mobile-first or vice versa without checking first.

## Where things live

```
server/
  index.js        — Express routes + all Socket.IO event handlers (the main wiring file)
  gameManager.js   — in-memory room/game state machine, scoring logic, round types
  bankStore.js     — Quiz Bank persistence (server/data/bank.json)
  userStore.js     — accounts persistence (server/data/users.json)
  auth.js          — session JWT sign/verify, cookie config
  data/            — bank.json, users.json, uploads/ (gitignore-worthy, holds real content)

client/src/
  pages/           — one file per route (Home, Login, HostSetup, HostRoom, BankManager,
                      RoundEditor, PlayerJoin, PlayerGame, PresentationScreen)
  components/      — AddRoundModal, RunningOrderPanel (used inside HostRoom)
  lib/             — api.js (fetch helpers), socket.js (shared socket.io client),
                      useCurrentUser.js (auth hook), roundTypes.js, questionTypes.js,
                      answerLetter.js, formatDate.js, playerSession.js
```

## Working (built and verified live in-browser)

- **Quiz Bank**: rounds of up to 10 questions, 4 question types (multiple choice, "normal"/letters-board, number, sequence), optional picture attached to any question.
- **Round visibility**: 🌐 public (communal, anyone signed in can edit) or 🔒 private (only visible/editable by its creator). Enforced server-side, not just hidden in the UI.
- **Accounts**: self-service signup gated by a shared `INVITE_CODE`, bcrypt + JWT session cookie, works across both REST and the Socket.IO handshake. Hosting and Quiz Bank management require sign-in; **joining a game as a player never does** (room code + nickname only, by design).
- **Running Order**: the quiz master builds a live, editable queue of rounds (each with its own chosen round type) — buildable while players join, editable mid-game, nothing locked until that round actually starts.
- **Round types** (chosen per queue entry, independent of the round's content): Standard (10 pts + speed bonus to top 5), Speed (10 pts to everyone correct, +10 bonus only to the single fastest), Evil (wrong costs 10 pts, skipping is safe), Go Wide (pick 2 answers, half points).
- **Three screens**: Quiz Master (host control, `/host/room/:code`), Presentation (read-only big-screen/Teams view, `/present/:code`), Player (`/play/:code`).
- **Reconnect handling**: both host and player get a grace period (45s / 60s) on disconnect before being dropped, with a resume path that reclaims their state (host's room, player's score) on reconnect. Verified against a real page reload mid-game.
- **Retro SNES-inspired palette** + "Too Quick To Cheat" branding throughout, including `HostSetup` and `RoundEditor` (see below — just rebuilt).
- **RoundEditor ("quiz maker")**: rebuilt as a two-pane layout — a left-hand question list (compact summary row per question: type + text preview, with ↑/↓ reorder and remove) and a right-hand editor for whichever question is selected. Reordering/removing/adding keeps the selected question in view. A save-time validation failure now jumps the selection to the offending question instead of silently failing (previously every question was visible at once so this wasn't an issue). Verified live in-browser at desktop and mobile widths.
- **HostSetup (host landing screen)**: rebuilt with the retro dashboard visual identity (stat panel, chip-style recent-rounds list) instead of plain centered text. Shows total round count and a "jump back into editing" list of your 3 most-recently-created rounds (reuses the existing `listRounds()` call, no new endpoint). Start New Game button now has a loading/disabled state during the socket round-trip.
- **BankManager ("quiz bank") list**: rebuilt as a sortable table (click any column header to sort, click again to flip direction) — Name, Visibility, Questions, Created by, Created, Times used. Replaces the old card list.
- **"Times used" tracking**: new `timesUsed` counter per round (`bankStore.js`'s `normalizeRound` backfills `0` on old records; `incrementTimesUsed(id)` bumps it). Hooked into `index.js`'s `host:startQuestion` handler right where a queued round is actually popped and started (`game.selectRound(...)` call) — so it counts rounds actually *played*, not just added to a running order. Exposed on `GET /api/bank` (list) alongside the existing fields.
- **AddRoundModal ("round selector")**: the plain `<select>` dropdown was replaced with a scrollable list of round cards — each shows visibility, question count, creator, created date, and a "Used N×" / "Never used" badge (using the `timesUsed` field above) — so the host can tell at a glance which rounds are fresh before picking one. Selecting a card still loads the question-content preview below. `RunningOrderPanel` queue entries also picked up the visibility icon for consistency (`visibility` now flows through `host:queueAdd` → `gameManager.addToQueue` → the emitted queue entry).
- **AddRoundModal filter/sort**: added a "Created by" dropdown (built from the distinct creators in the current round list — "Everyone" plus each name) and a "Created ▲/▼" sort toggle (newest/oldest first, default newest). If the active filter/sort hides the currently-selected round, selection auto-jumps to the first still-visible one rather than silently pointing at something hidden. Verified with a second test account (Sam) to confirm cross-creator filtering actually excludes/includes correctly, not just with the single-creator case.
- **CORS allowlist**: new optional `ALLOWED_ORIGINS` env var (comma-separated), same pattern as `SESSION_SECRET`/`INVITE_CODE` — unset falls back to the old permissive `origin: true`-equivalent behavior (reflect any origin, needed for LAN IPs that vary by network) with a console warning; set it to lock both the REST `cors()` middleware and the Socket.IO server down to an explicit list before a real public deployment. Implemented as a shared `corsOrigin` callback in `server/index.js` used by both. Documented in `README.md`. Not yet verified against an actual second-origin rejection (no public deployment to test against) — logic only, not browser-verified.
- **Login rate limiting**: `/api/auth/login` now uses `express-rate-limit` (new dependency), capped at 10 attempts per IP per 15-minute window, returning `429` with `{"error": "Too many login attempts..."}` once exceeded. Scoped to login only — signup's invite-code check was not in scope for this pass. Verified with a throwaway server instance on a scratch port (`PORT=4099`) and 12 rapid `curl` attempts: first 10 got `401`, 11th and 12th got `429`.
- **Single-origin deploy support**: `server/index.js` now serves the built client (`client/dist`, via `express.static` + a SPA fallback route excluding `/api`, `/uploads`, `/socket.io`) when that directory exists, so the whole app — host screens, player join, presentation view, API, sockets — lives behind one port/one public URL. `client/src/lib/api.js`/`socket.js` pick up a `VITE_SERVER_URL` override (empty = same-origin); `client/.env.production` sets it empty so a production build calls relative paths instead of the dev-only hardcoded `:4000` guess. Also added `app.set("trust proxy", "loopback")` — needed so `express-rate-limit`'s per-IP bucketing and the secure-cookie check see the real client IP/protocol through a local reverse proxy (cloudflared, or Render's own edge) instead of treating every request as coming from `127.0.0.1`. Verified end-to-end on a scratch port (`PORT=4098`): built client served at `/`, API still reachable at `/api/*`, static JS/CSS assets load, an arbitrary client route (`/play/ABC123`) correctly falls back to `index.html`, and a real login round-trips.
- **`DATA_DIR` env var + a real fixed bug**: `bankStore.js`, `userStore.js`, and `index.js`'s uploads dir now all resolve their storage path from `DATA_DIR` (default: the existing local `server/data`), so a deployment can point it at a mounted persistent disk instead. While doing this, found and fixed a real crash: `bankStore.js`'s `readAll()` called `fs.readFileSync` on `bank.json` unconditionally with no existence check (unlike `userStore.js`, which already guarded this) — so *any* fresh environment with no pre-existing `bank.json` (a clean deploy, a fresh disk, even a from-scratch clone) would crash on the very first `GET /api/bank`. Now mirrors `userStore.js`'s guard (missing file → empty list). Verified by pointing `DATA_DIR` at a genuinely empty scratch directory and confirming `GET /api/bank`, signup, login, and an authenticated bank listing all work and the files get created on demand.
- **Git repo + Render deployment**: this folder (`quiz-app/`) is now a git repo (previously wasn't one at all) with `.gitignore`s excluding `node_modules`, `server/data` (real content, not source), and `client/dist` (build artifact). Added `render.yaml` — a Render Blueprint that deploys the server (serving the built client itself per the point above) on the `starter` plan (not the free tier, specifically because the free tier's disk doesn't persist — would wipe the Quiz Bank on every restart) with a 1GB persistent disk mounted at `/var/data` (matches `DATA_DIR`), an auto-generated `SESSION_SECRET`, and a prompted `INVITE_CODE`. Documented the full flow in `README.md`'s new "Deploying for friends over the internet (Render)" section, with the Cloudflare Tunnel approach (previously the primary recommendation) kept as a no-cost/no-signup fallback underneath it. **Not done — needs the user**: actually creating the GitHub repo, pushing, and clicking through the Render Blueprint flow. I can't create accounts or push to an external GitHub remote on the user's behalf; `gh` CLI isn't installed/authenticated in this environment either. The render.yaml's `plan: starter` name/pricing is also worth the user double-checking in Render's current dashboard before confirming, since pricing/plan names can shift.

## Known gaps (not yet fixed, flagged along the way)

- **Reload mid-question**: if a player reloads *during* a live question (not between questions), they land back on the "lobby" phase until the *next* phase-change event arrives — they don't get shown the current question. Deferred, not forgotten.
- **No automated tests.**
- **No Quiz Bank export/import** — no way to back up or share your rounds as a file yet.
- **Orphaned uploads**: deleting a question/round doesn't delete its uploaded picture from `server/data/uploads/`.
- **Legacy rounds have `ownerId: null`**: the two original sample rounds predate accounts, so nobody "owns" them — they're public and can't be made private without recreating them.
- **Game state is in-memory only**: a server crash or redeploy loses any in-progress game (not the Quiz Bank — that's on disk). Acceptable for a hobby project; would need Redis or similar to fix properly.
- **Found and fixed while building the bank table**: `#root` in `index.css` had no `width` set. It's body's flex item (body is `display:flex; justify-content:center`), so with `width:auto` it sized to its content's max-content width instead of the viewport — invisible until a page had genuinely wide unwrappable content (a table, or 4 type-toggle buttons in a row), at which point the *whole page* overflowed horizontally and (because of `justify-content:center`) visibly shifted left/cropped rather than just showing a scrollbar. Fixed by giving `#root` `width: 100%; min-width: 0;`. Also added `overflow-x: hidden` to `body` as a defensive backstop, and `flex-wrap: wrap` to `.type-toggle` (4 buttons in a row had the same latent issue on narrow screens, independent of this bank-table work). If a future page introduces more wide/unwrappable content, this class of bug shouldn't resurface — but worth knowing why `#root` has an explicit width now, since it looks redundant until you know this.

## Next up (where we stopped)

The RoundEditor and HostSetup redesigns described in earlier versions of this file are **done** (see "Working" above) — two-pane builder with reorder, and a real dashboard-style landing screen with bank stats + recent rounds. Decision made along the way: a two-pane list+editor layout was chosen over the originally-floated accordion approach, since it reads more like a real tool than a long form.

CORS allowlist and login rate limiting (above) are both done — the two deployment prerequisites originally flagged here. No specific next block queued; pick from "Known gaps" above (automated tests, Quiz Bank export/import, orphaned uploads, legacy `ownerId: null` rounds, in-memory-only game state, and the reload-mid-question gap are all still open).

## Running it locally

```bash
cd server && npm install && npm start      # http://localhost:4000
cd client && npm install && npm run dev    # http://localhost:5173
```

Optional env vars (server): `SESSION_SECRET`, `INVITE_CODE` — both have dev defaults with a console warning if unset. See `README.md` for the full rundown, LAN play instructions, and the invite-code/accounts model.

Two test accounts already exist in `server/data/users.json` from development (`Ben`, `Sam`, password `password123`/`password456`) — fine to keep using them or wipe `users.json`/`bank.json` for a clean slate.
