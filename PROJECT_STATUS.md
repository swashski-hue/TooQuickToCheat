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

## Known gaps (not yet fixed)

- **Game state is in-memory only** — a server crash/redeploy loses any
  in-progress game (not the Quiz Bank, that's on disk). Ranked #2 in
  "Next up" below.

## Next up

Ranked by effort × value (discovery + ranking session, 2026-10-10) — value
rated by the user, effort estimated against the current code. The
host-reveal-screen chunk, pictures-as-hero, and the player question
full-screen overlay are all done — see "Shipped" above — so this list has
moved up and dropped the two items that overlay rework resolved.

1. **Audio — presentation screen only** *(High value, M effort)* — a
   question-timer tick/countdown sound and a sting for the
   fastest-answerer reveal, played from Presentation Screen only
   (host/player stay silent — the room hears it together off the big
   screen/speakers). No mute control needed on host for now. Needs a
   user-gesture-unlock pattern to get past browser autoplay restrictions.
   Sound asset selection still TBD; scope this first pass as wiring the
   trigger mechanism (phase/event → playback) cleanly, swap in real
   sounds once that's proven.
2. **Persistence (Redis or similar for game state)** *(High value, L
   effort)* — known gap above; infra work (new store + deploy changes),
   not a UI task.
3. **Timer bar** *(Medium value, S/M effort)* — add a draining bar across
   the screen on both Presentation Screen and the host screen, alongside
   (not replacing) the existing numeric countdown.
4. **Player-side question display rework** *(Medium value, L effort)* —
   current player-side question display may need to change — specifics
   TBD, needs a discovery pass. (Separate from the question-panel overlay
   mechanism above — this is about the broader question display, not the
   "see full question" interaction, which is now shipped.)
