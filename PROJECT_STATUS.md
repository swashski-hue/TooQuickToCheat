# Project Status

**For any new session: read `CLAUDE.md` first** (architecture, tech stack,
conventions, how to run/test it) — this file is the living changelog: what's
shipped, what's outstanding, and what's next. Keep "Shipped" current, move
finished items out of "Next up," and add anything discovered to "Known
gaps." For *why* a past fix was built a specific way or what exact bug it
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

**Resilience**: host reload mid-question/mid-reveal restores the correct
screen (including recomputed remaining time) instead of resetting to lobby.
*(Known gap: the player/presentation side of this doesn't have the
equivalent fix yet — see below.)*

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

All of the above is live-verified either in-browser this session or
directly by the user on a real device — nothing in this list is "logic
only, unverified" at this point except where flagged. If that changes for
something new, flag it explicitly in this file until it's confirmed.

## Known gaps (not yet fixed)

- **Reload mid-question for players/presentation** (host-side is fixed,
  see "Resilience" above): a player or the presentation screen reloading
  during a live question lands back on "lobby" until the next phase-change
  event, instead of showing the current question. Self-heals on the host's
  next action; lower priority than the host-side version was.
- **No automated test suite** — see `CLAUDE.md`'s "Testing convention" for
  the isolated-script pattern used instead.
- **No Quiz Bank export/import** — no way to back up or share rounds as a file.
- **Legacy rounds have `ownerId: null`** — the two original sample rounds
  predate accounts; can't be made private without recreating them.
- **Game state is in-memory only** — a server crash/redeploy loses any
  in-progress game (not the Quiz Bank, that's on disk). Acceptable for a
  hobby project; would need Redis or similar to fix properly.

## Next up

No specific block queued — the app is fully live and the recent round of
real-device bug reports (Go Wide, join flow, reveal screens) is resolved
and confirmed working. Pick from "Known gaps" above, or whatever the user
raises next.
