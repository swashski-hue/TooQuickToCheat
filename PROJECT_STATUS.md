# Project Status

**For any new session: read `CLAUDE.md` first** (architecture, tech stack,
conventions, how to run/test it) — this file is the living changelog: what's
shipped, what's outstanding, and what's next. Keep "Shipped" current, move
finished items out of "Next up," and add anything discovered to "Known
gaps." Quick bug/feedback notes from testing go in `FEEDBACK.md` first —
triage those into this file (and clear them out) periodically. For *why* a past fix was built a specific way or what exact bug it
fixed, `git log`/`git show` on the relevant commit has the full story — this
file intentionally doesn't repeat that detail.

## Shipped

**Core app**: Quiz Bank (rounds of up to 10 questions, 4 question types,
optional picture per question) · public/private round visibility (enforced
server-side) · invite-gated accounts · live editable running order of
rounds · three screens (host/presentation/player) · reconnect grace periods
for host (45s) and player (60s) · retro SNES-inspired branding throughout.

**Round types & scoring**: Standard, Speed, Evil, Go Wide (see
`CLAUDE.md` for the mechanic breakdown — Go Wide is now consistently
"submit normally first, then optionally widen afterward for half points"
across all 4 question types) · Fast Track per-round modifier.

**Host/Quiz Bank tooling**: two-pane RoundEditor (question list + editor,
reorder/remove/add) · dashboard-style HostSetup (stats + recent rounds) ·
sortable BankManager table with "times used" tracking · AddRoundModal round
picker with usage badges, creator filter, and created-date sort.

**Player experience**: question shown first, host reveals the answer board
and starts the timer on their own cue (every question type, not just
pictures) · timer always runs the full duration, never ends early · answer
board stays visible through pick + reveal with the player's own pick
highlighted white and the correct answer highlighted green in place (no
swap to a separate result screen) · two-step join (room code, then
name + emoji) with emoji unique per room, server-enforced · fastest-correct
player gets an emoji splash + banner on the Presentation Screen, 3s after
the answer appears · scoreboard reveal is host-controlled (a "Show
Scoreboard" button), not an automatic timer.

**Resilience**: host, player, and presentation reload mid-question/
mid-reveal all restore the correct screen (including recomputed remaining
time and, for a player, their own already-submitted answer) instead of
resetting to lobby — one shared `roomLiveState()` helper on the server
(`index.js`) feeds all three roles' resume/join acks. Presentation Screen
also now re-joins on every socket reconnect, not just the initial page
load.

**Infra & deployment**: CORS allowlist (`ALLOWED_ORIGINS`) · login rate
limiting · single-origin deploy (server serves the built client) ·
`DATA_DIR` env var for persistent storage · live on Render
(`github.com/swashski-hue/TooQuickToCheat`, auto-deploy on push to `main`)
at the custom domain `2quick2cheat.com` · upload cleanup — deleting a
question, clearing/replacing its picture, or deleting a whole round now
deletes the now-unreferenced file(s) from `server/data/uploads/`
(`bankStore.js`'s `updateRound`/`deleteRound`), checking first that no
other round still references the same upload. *(Logic only, unverified via
the Quiz Bank UI — covered by a throwaway `bankStore.js` script, not
confirmed end-to-end yet.)*

**Host reveal screen rework**: host's reveal-stage content now mirrors
Presentation Screen — correct-count stats, top-5 fastest-correct (no 3s
suspense delay, host needs to read them out loud in sync with the big
screen), and a per-player "who answered what" breakdown. The `fastest`
sort/slice logic was extracted from `PresentationScreen.jsx` into a shared
helper rather than duplicated. Round-ended state ("Round over!" + "Start
Next Round") also got a much harder-to-miss treatment on the host screen
specifically.

**Pictures as hero element** (2026-10-10): picture-bearing questions now
give the image the dominant share of the screen instead of a capped
360px/text-first layout.
- Presentation Screen: intro screens and Alphabet/Number live questions use
  a full-height hero picture with the question text as a caption strip
  underneath (`.present-hero*` in `index.css`). Multiple Choice/Sequence
  live questions use a side-by-side split instead (`.present-split*`) —
  picture on the left at full column height, boxed/centered answer options
  in a single column on the right — so the bigger picture and the options
  both stay visible together.
- Player app: intro screen only (live question/reveal screens unchanged) —
  the picture fills the available space with the caption overlaid on it
  rather than sitting below as separate text (`.intro-hero-caption`).
- Fixed a scrolling bug this introduced: `.presentation-screen` was
  `min-height: 100vh` with an unbounded flex chain underneath, so the hero
  picture had nothing to scale against and grew the page past the
  viewport. Switched to a fixed `height: 100vh` + `overflow: hidden`
  (matching the existing player-screen pattern) and propagated
  `height: 100%`/`min-height: 0` down through `present-center` →
  `present-intro-row` → `present-main` so hero/split content always scales
  to fit, never scrolls.

**Player question panel → full-screen overlay** (2026-10-10): tapping the
question panel no longer expands it in place (which used to shrink the
answer board to make room). It now opens a full-screen overlay
(`.question-overlay` in `index.css`) on top of the answer board showing the
full question text/picture; tapping anywhere on the overlay closes it and
reveals the answer board again. This also resolves what were previously
two separate undecided backlog items — "Player 'see question' interaction
rework" and "Expanding the full question" — both are now this one
mechanism.

All of the above is live-verified either in-browser this session or
directly by the user on a real device — nothing in this list is "logic
only, unverified" at this point except where flagged. If that changes for
something new, flag it explicitly in this file until it's confirmed.

**Timer bar** (2026-10-10): the numeric countdown on both the host screen
and Presentation Screen is now a merged pill+bar (`.timer-badge` /
`.present-timer`) whose fill drains as `secondsLeft` counts down, matching
the bar already on the player screen. Host drains right-to-left; the
Presentation Screen version was widened to span most of the row (almost up
to the question-number box) and drains left-to-right per the user's
preference.

**Game sound effects — in progress** (2026-10-10): trigger wiring is done
and live — `client/src/lib/hostAudio.js`, a user-gesture "🔊 Enable sound"
button, a real tick sample for the final 5 seconds of the countdown, and a
per-player-emoji sting on the fastest-answerer reveal. Lives on the host
screen (`HostRoom.jsx`), not the Presentation Screen — moved there
2026-10-10 since the host screen is what's actually in focus on the host's
machine, so that's where the audio is reliably heard; the sting is still
timed to the Presentation Screen's 3s-delayed splash so the sound and the
big-screen visual stay in sync even though they're triggered from different
screens. 8 of the 16 emojis now play a real (or deliberate stand-in) sample
sourced from Mixkit: lion, tiger, dog, cat, monkey, owl, unicorn (stand-in:
fairy sparkle), octopus (stand-in: water bubble). The remaining 8 still fall
back to a synthesized placeholder tone — see "Next up" below to finish
sourcing those.

**Game-state persistence** (2026-10-10): in-progress rooms (round, queue,
player scores/answers, current question + remaining time, cached
board/reveal payloads) now survive a server crash or a Render redeploy
instead of being lost with the in-memory `Map`.
- `server/gameStore.js` snapshots every room to `DATA_DIR/games.json`
  (same persistent disk `bankStore.js`/`userStore.js` already use) every 5s,
  plus a final flush on `SIGTERM` (Render sends this before killing the old
  instance on redeploy). Overwritten wholesale each time, so a removed room
  just drops out of the next snapshot.
- On boot, `gameManager.js`'s `loadRoomsFromSnapshot` rebuilds the `rooms`
  map from that file. Every player/host comes back marked "disconnected"
  under their now-stale socket id — deliberately reusing the *existing*
  reconnect-grace-period machinery (`host:resume`/`player:resume` already
  matched by room code/name, not socket id) rather than inventing a second
  recovery path. `resumeQuestionTimer` re-arms a live question's timer from
  the preserved `questionStartedAt` rather than restarting the full time
  limit — if time had already fully elapsed while the process was down, it
  fires the reveal transition immediately instead of scheduling anything.
- Chose a disk snapshot over adding Redis — reuses existing infra/DATA_DIR
  convention instead of new infra, cost, and deploy changes, confirmed with
  the user as the right tradeoff here. Verified with a throwaway script
  (serialize → restore → resume-timer round trip, including the
  already-expired case) per the testing convention in `CLAUDE.md`; not yet
  verified against a real Render redeploy.

**Mid-game join + host-removable players** (2026-10-10): `player:checkRoom`/
`player:join` no longer require `room.state === "lobby"` — a latecomer (or
someone who got fully dropped past the reconnect grace period and had to
fall back from `player:resume` to a fresh join) can join at any point in a
room's lifecycle. `player:join`'s ack now carries `live: roomLiveState(room)`
so the client's existing `player:resume` call right after lands them on
whatever screen is actually live (question/reveal/etc.), same mechanism a
reconnect already used — no new client-side state-landing logic needed.
Also added `host:removePlayer` (new chip "×" button in `HostRoom.jsx`'s
player list, confirm-gated): clears the player's pending disconnect timer if
any, removes them from the room, and tells their socket (`game:removed`) to
clear its session and bounce to `/join`.

## Known gaps (not yet fixed)

None currently tracked.

## Next up

Ranked by effort × value (discovery + ranking session, 2026-10-10) — value
rated by the user, effort estimated against the current code. The
host-reveal-screen chunk, pictures-as-hero, the player question
full-screen overlay, the timer bar, and persistence are all done — see
"Shipped" above. ("Player-side question display rework" also turned out to
already be covered by the question-panel overlay + pictures-as-hero work —
realized 2026-10-10, removed from this list without separate work.)

1. **Finish sourcing fastest-answer emoji sounds** *(low effort, just
   asset-hunting)* — 8 of 16 emojis in
   `client/src/lib/hostAudio.js`'s `EMOJI_SOUND_FILES` still play a
   synthesized placeholder tone instead of a real sample:
   - 🦊 fox, 🐸 frog, 🐰 rabbit, 🐹 hamster — candidates found on
     freesound.org (CC0), but all need trimming to a short clip before use
     (freesound downloads also need a free account).
   - 🦀 crab — stand-in found (a finger-snap, CC0 on freesound.org),
     needs downloading/trimming.
   - 🐼 panda, 🐨 koala — no usable real recording found on Mixkit or
     freesound; need a stand-in decision (e.g. reuse another animal's
     sample, or something unrelated entirely).
   - 🤖 robot — intentionally left synthesized; a clean beep already
     suits a robot, no real asset needed.
   Once files are in `client/public/sounds/`, wiring a new emoji into
   `EMOJI_SOUND_FILES` is a one-line change.
