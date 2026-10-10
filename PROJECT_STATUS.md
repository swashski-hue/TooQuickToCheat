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

All of the above is live-verified either in-browser this session or
directly by the user on a real device — nothing in this list is "logic
only, unverified" at this point except where flagged. If that changes for
something new, flag it explicitly in this file until it's confirmed.

## Known gaps (not yet fixed)

- **Game state is in-memory only** — a server crash/redeploy loses any
  in-progress game (not the Quiz Bank, that's on disk). Ranked #3 in
  "Next up" below.

## Next up

Ranked by effort × value (discovery + ranking session, 2026-10-10) — value
rated by the user, effort estimated against the current code. The
host-reveal-screen chunk (round-ended state, fastest-correct, full reveal
rework) is done — see "Shipped" above — so this list has moved up.

1. **Audio — presentation screen only** *(High value, M effort)* — a
   question-timer tick/countdown sound and a sting for the
   fastest-answerer reveal, played from Presentation Screen only
   (host/player stay silent — the room hears it together off the big
   screen/speakers). No mute control needed on host for now. Needs a
   user-gesture-unlock pattern to get past browser autoplay restrictions.
   Sound asset selection still TBD; scope this first pass as wiring the
   trigger mechanism (phase/event → playback) cleanly, swap in real
   sounds once that's proven.
2. **Pictures as hero element** *(High value, M effort)* — on both the
   intro screen and the live question screen, the picture becomes the
   dominant visual element (question text shrinks to a caption-style
   strip), replacing today's image-above-text stacked layout
   (`.picture-display` in both `HostRoom.jsx` and `PresentationScreen.jsx`).
   Needs a couple of quick visual iterations to land on — not fully
   nailed down until seen live.
3. **Persistence (Redis or similar for game state)** *(High value, L
   effort)* — known gap above; infra work (new store + deploy changes),
   not a UI task.
4. **Player "see question" interaction rework** *(High value, L effort)*
   — rework how "see question" (bringing the picture into view) works on
   the player app, separate from the hero-picture treatment in #2. Largest
   unknown on the list: direction isn't decided yet, so this needs its own
   discovery pass before it's buildable.
5. **Timer bar** *(Medium value, S/M effort)* — add a draining bar across
   the screen on both Presentation Screen and the host screen, alongside
   (not replacing) the existing numeric countdown.
6. **Player-side question display rework** *(Medium value, L effort)* —
    current player-side question display may need to change — specifics
    TBD, needs a discovery pass.
7. **Expanding the full question** *(Medium value, L effort)* — some way
    for a question to be shown "expanded"/full-size — mechanism and
    trigger entirely undefined, needs a discovery pass.
