# Too Quick To Cheat Quizzing

A SpeedQuizzing-style live quiz: a quiz master controls the game from a control screen, a big-screen presentation view can be projected or shared over a call, and players join from their phones via a room code and answer for points.

**🔗 Live at: https://2quick2cheat.com** — bookmark it, nothing to install or run locally to play. (Also reachable at `www.2quick2cheat.com` and the original `too-quick-to-cheat.onrender.com`, which keeps working alongside the custom domain.)

Rounds aren't planned out in advance as one fixed quiz — you build up a shared **Quiz Bank** of reusable rounds ahead of time, and the quiz master builds a **running order** live from that bank (picking each round's type as it's added). The running order can be built up while players are still joining, and stays editable — reordered, added to, or trimmed down — right up until a round is actually started; only the round currently being played is locked in.

## Structure

- `server/` — Node.js + Express + Socket.IO. Holds the Quiz Bank (`bank.json`), accounts (`users.json`), and all live-game state/logic. In production it also serves the built client, so the whole app is one service behind one URL.
- `client/` — Vite + React web app, with three distinct screen roles:

  | Screen | Route | Job |
  |---|---|---|
  | **Quiz Master** | `/host/room/:code` | You use this to run the game: pick each round from the bank, start/reveal questions, see who's joined, see live answer counts, advance the leaderboard. |
  | **Quiz Master Sharable** (Presentation) | `/present/:code` | A read-only, large-text view for a projector, TV, or screen-shared in Teams/Zoom. Shows the room code to join, the current question, how many got it right, the fastest correct answers, and the scoreboard between questions. Open it from the **📺 Presentation Screen** button on the Quiz Master screen — it's meant to run on a second tab/display, separate from your control screen. |
  | **Player** | `/play/:code` | The answer boards (multiple choice, letters, number pad, sequence) — what each player uses on their own phone. |

  The Quiz Master and Presentation screens are independent connections to the same room (a "spectator" connection that just listens — it doesn't control the game or take a player slot), so you can have both open at once, on different devices if you like.

## Hosting and playing a game

1. Go to **https://2quick2cheat.com** → **Sign in** (see **Accounts & access** below) → **Host a quiz** → **Start New Game**. Note the room code shown.
2. Players, from anywhere (not restricted to your Wi-Fi), open **https://2quick2cheat.com/join** — or just the homepage → **Join a quiz** — and enter the room code first. Once it's confirmed, they land on a naming screen to pick a team/player name and an emoji to represent them (each emoji can only be used once per room — already-taken ones are greyed out). No account needed to join.
3. While players are joining, use **+ Add round** on the Quiz Master screen to build up your running order — pick a round from the bank and a round type for each. Reorder or remove entries with the ↑/↓/✕ buttons any time.
4. Click **Start Quiz** once you've got at least one round queued and one player joined. The running order stays open the whole game — keep adding, removing, or reordering upcoming rounds even while a question is live; only the round actually being played is locked in.
5. Once a question's answer is revealed, click **Show Scoreboard** whenever you're ready to move on — standings don't appear to players/presentation automatically, so you can take your time on the correct-answer screen first.
6. After a round's last question, click **Start Next Round** to pop the next queued round, or add one first if the queue's empty — or end the quiz.
7. Open **📺 Presentation Screen** on a second device/tab (projector, TV, screen-share) for a read-only big-screen view everyone can watch.

## Accounts & access

Hosting a game and managing the Quiz Bank require signing in; **joining a game as a player never does** — that stays frictionless, just a room code and a nickname.

Anyone can create their own account from `/login` — **Create an account** — but only with the shared invite code (set as `INVITE_CODE` on the deployment, see **Updating the deployment** below). Give that code to friends you want to let in; nobody else can self-register. Once signed in, you can host your own games independently of anyone else's, and the Quiz Bank is shared: every signed-in person can see, use, and edit everyone's *public* rounds (communal, like a shared doc), while a *private* round is only ever visible to the person who made it — see **Round visibility** below.

Login attempts are rate-limited per IP (10 per 15 minutes) to make password guessing impractical.

## The Quiz Bank

Go to **📚 Manage Quiz Bank** (from the home screen or the Host a Quiz screen) to build up **rounds** ahead of time — everyone signed in shares the same bank. Each round has a name and up to 10 questions, any mix of the four question types below, plus who created it and when. Rounds are just content; **how a round scores points is decided live when it's added to the running order** (see Round Types), so the same round can be played as a Speed round one night and an Evil round the next.

When adding a round to the running order, the picker shows you the round's full question list (text and type for each), plus who made it and when — so you know exactly what you're queuing up before committing to it.

## Question types

- **Multiple Choice** — 3 to 6 options; players tap the one they think is correct, which submits immediately for full points, same as a normal round. In a Go Wide round, the board stays active afterward — tapping a *second*, different option widens the answer to either one counting, for half points. Stick with just the one pick and it scores full points as normal.
- **Normal** — the answer board is the alphabet, laid out as a 4×6 grid of tiles (U/V and Y/Z share a tile, so all 26 letters fit). Players press the letter the answer *starts with*. A leading "The" is ignored, so "The Beatles" → **B**, "Paris" → **P**. Pressing the merged U/V or Y/Z tile counts as either letter. Same Go Wide mechanic as Multiple Choice — pick one to submit, optionally tap a second letter afterward to widen for half points.
- **Number** — players type a numeric answer on a number pad (0–9, **C** to clear, **Enter** to submit), same as always. In a Go Wide round, an optional "Go Wide (±1)" button also accepts the number 1 above or below the exact answer, for half points — leave it unpressed and an exact answer still scores full points. It's a one-way selection (once pressed it stays on, it can't be un-pressed) and it stays pressable even after submitting: players can still decide to go wide right up until the question ends, without having to retype or resubmit their number.
- **Sequence** — the round-builder sets 3–6 items in the correct order (e.g. "smallest to largest", "put these lyrics in order"). Players see the items shuffled and tap them in the order they believe is correct; the whole sequence must match to be correct. In a Go Wide round, players can optionally tap ⚡ on one item (in the pool or already placed) to mark it a wildcard — that item's position is ignored when checking the order, as long as everything else is still correctly ordered relative to each other — for half points. Don't mark one and the order still has to match exactly for full points.
- **Picture modifier** — any question (any type above) can have a picture attached. Players see it in the question itself (see below).

Every question, picture or not, opens with a **question intro**: the host sees it first (with a **Reveal Answer Board & Start Timer** button) and players see just the question text (and picture, if any) — no answer board, no countdown. Nothing starts until the host clicks reveal, so hosts can read the question aloud, talk it up, or just take their time before the clock starts. Once revealed, players also get a collapsible bar at the top of their screen showing the question — tap it to expand the full text or picture at any point during the question. Picking an answer highlights it immediately (white for your own pick, then green for the correct one once it's revealed) — the answer screen itself stays up throughout, it never switches away to a separate result screen. The question timer always runs the full time limit regardless of how quickly everyone answers — it only ends early if the host presses **Reveal now**.

Whoever answers correctly the fastest each question gets a little fanfare on the **Presentation Screen**, 3 seconds after the correct answer appears (so the splash doesn't cover it up) — their emoji (picked when they joined) bursts across the screen with a "⚡ [Name] was fastest!" callout.

## Round types

Picked live, right before you start each round:

A correct answer is worth **5 points**. Standard, Evil, and Go Wide rounds all also give a speed bonus to the first 5 correct answers: 1st +5, 2nd +4, 3rd +3, 4th +2, 5th +1 (6th onwards gets no bonus, just the 5).

| Round type | How it scores |
|---|---|
| **Standard** | 5 points for a correct answer, plus the speed bonus above. Wrong or missed = 0. |
| **Speed** ⚡ | Every correct answer scores the base 5 points — but the single fastest correct answer also gets an extra +5 bonus on top (10 total). No bonus for 2nd place onward, just the 5. |
| **Evil** 😈 | 5 points for correct (plus the speed bonus), but a *wrong* (submitted) answer costs you 5 points. Skipping a question is always safe — only guessing wrong is punished. |
| **Go Wide** 🎯 | Optional, decided per answer, not forced — answer normally and it scores exactly like a Standard round. Opt in for a wider (but cheaper) shot at being correct instead: half of whatever they would've scored, including any speed bonus, rounded to the nearest point. Multiple Choice/Normal: a toggle lets players pick **2** answers instead of 1, either one counts. Number: a toggle also accepts ±1 off the exact answer. Sequence: players can mark one item a wildcard, so its position doesn't count. |

### Fast Track

An optional toggle (alongside the round type, in the same "add round" picker) that works on top of any round type. On every question in that round: if everyone who was in the **top 3** *before* the question all get it wrong (or don't answer), whoever answers correctly the fastest — by definition, someone outside the top 3 — is **Fast Tracked**: their score jumps up to equal the current leader's. It's a catch-up mechanic for when the leaders all whiff a question and an underdog nails it. Announced with a banner on both the Quiz Master screen and the Presentation screen the moment it happens.

If nobody answers correctly, or any of the top 3 gets it right, nothing happens — Fast Track only fires on a clean "leaders all missed it, someone else got it" moment.

## Editing a round

From **Manage Quiz Bank**, use **+ New round** or **Edit** on an existing one. The round is automatically attributed to whoever's signed in — "Created by" isn't editable, so attribution can't be faked. For each question you can:

- Choose the type (Multiple Choice, Normal, Number, or Sequence)
- Attach a picture (optional, max 8MB — png/jpg/gif/webp)
- For Multiple Choice: add/remove options (3–6) and mark which is correct
- For Normal: enter the answer text — the editor shows you the letter players will need to press
- For Number: enter the correct numeric answer
- For Sequence: add 3–6 items and use the ↑/↓ buttons to put them in the correct order
- Set a time limit

A round holds up to 10 questions. Scoring rules (Standard/Speed/Evil/Go Wide) aren't set here — they're chosen by the quiz master when the round is played.

### Round visibility

Every round is **🌐 Public** or **🔒 Private**, set when you create it — only the round's creator can change this later (shown as a read-only pill to everyone else). Public rounds show up in everyone's bank and everyone can edit or delete them, same as before. A private round only ever appears to its creator — in the bank list, in the "add round" picker when hosting, even a direct link to it 404s for anyone else.

Player answer screens are mobile-first — a collapsible question panel (tap to expand) keeps the answer board front and center on a phone screen.

The Quiz Bank, accounts, and uploaded pictures all live on the deployment's persistent disk — see **Updating the deployment** below for where that's backed up.

## Updating the deployment

The live app is deployed on [Render](https://render.com) from this repo via `render.yaml` (a Render "Blueprint" — defines the web service, a 1GB persistent disk for the Quiz Bank/accounts/uploads, and env vars). Render auto-deploys on every push to `main`:

```bash
git add .
git commit -m "..."
git push
```

Watch the build in the Render dashboard → the `too-quick-to-cheat` service → **Events** tab. It usually takes a minute or two.

Environment variables (`SESSION_SECRET`, `INVITE_CODE`, `DATA_DIR`) are set in the Render dashboard under the service's **Environment** tab, not passed on a command line — change `INVITE_CODE` there if you want to rotate who can sign up.

### Custom domain

`2quick2cheat.com` (bought via GoDaddy) is set up as the primary domain, with `www.2quick2cheat.com` as a second verified domain and the bare domain redirecting to it. The original `too-quick-to-cheat.onrender.com` URL is left enabled in Render alongside both — nothing to migrate, it just keeps working.

DNS lives in GoDaddy's DNS Management for the domain. Two records point it at Render:

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.24.57.1` (Render's apex-domain target — GoDaddy doesn't support `CNAME`/`ANAME` on a bare domain, so Render's docs call for an `A` record here instead) |
| CNAME | `www` | `too-quick-to-cheat.onrender.com.` |

Everything else in GoDaddy's DNS (both `NS` records, the `SOA` record, the `_domainconnect` CNAME, and the `_dmarc` TXT record) is GoDaddy's own default setup, unrelated to Render — don't touch those.

To add another domain or subdomain later: Render dashboard → the `too-quick-to-cheat` service → **Settings** → **Custom Domains** → **Add Custom Domain**, type the domain, and Render shows the exact DNS record to add at your registrar. Verification and the free TLS certificate are both automatic once the DNS record resolves — no extra step needed, though the certificate can take a little while to issue even after DNS verification passes.

## Developing locally

Local development runs the client and server as two separate processes (hot-reload on the client, no production build needed):

```bash
cd server
npm install   # first time only
npm start
```

```bash
cd client
npm install   # first time only
npm run dev
```

Then open `http://localhost:5173` on your machine.

The server reads three optional environment variables — set them before `npm start` (e.g. `SESSION_SECRET=... INVITE_CODE=... ALLOWED_ORIGINS=... npm start`) for anything beyond local testing:

- `SESSION_SECRET` — signs login sessions. Without it, a dev default is used and a warning is printed — fine for testing on your own machine, not for a real deployment.
- `INVITE_CODE` — required to create a new account (see **Accounts & access** above). Defaults to `quiznight` with a warning if unset.
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to make credentialed requests. Without it, the server reflects any request origin back — fine for local/LAN use, not needed at all for the Render deployment (same-origin, see **Structure** above) but available as extra hardening if you ever split client/server hosting again.
- `DATA_DIR` — where `bank.json`, `users.json`, and `uploads/` live. Defaults to `server/data` locally; the Render deployment sets this to its mounted persistent disk.

### Playing on phones over LAN (local dev only)

Useful for testing without deploying anything:

1. Find your computer's LAN IP (Windows: `ipconfig`, look for IPv4 Address, e.g. `192.168.1.42`).
2. Start both processes as above, then on each phone (same Wi-Fi network) open `http://192.168.1.42:5173/join` instead of the production URL.
3. Both the client (5173) and server (4000) need to be reachable from phones — if Windows Firewall prompts when you first start them, allow access on private networks.

### No-cost public URL without deploying (Cloudflare Tunnel)

If you want a temporary public URL without pushing to the live deployment — e.g. testing an unreleased change with a friend — build the client and serve it from the server itself, then tunnel that:

```bash
cd client && npm install && npm run build
cd ../server && SESSION_SECRET=<random string> INVITE_CODE=<code> npm start
```

In a second terminal:

```bash
cloudflared tunnel --url http://localhost:4000
```

(Install `cloudflared` first: `winget install --id Cloudflare.cloudflared -e`.) It prints a random `https://<something>.trycloudflare.com` URL — that's the whole app, usable by anyone. It changes every time you restart the tunnel, and this doesn't touch the Render deployment or its data at all.

See `PROJECT_STATUS.md` for known gaps (e.g. game state is in-memory only — a server crash or redeploy mid-game loses the round in progress).
