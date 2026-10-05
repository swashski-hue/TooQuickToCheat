# Too Quick To Cheat Quizzing

A self-hosted SpeedQuizzing-style live quiz: you run it on your own machine, a quiz master controls the game from a control screen, a big-screen presentation view can be projected or shared over a call, and players join from their phones via a room code and answer for points.

Rounds aren't planned out in advance as one fixed quiz — you build up a shared **Quiz Bank** of reusable rounds ahead of time, and the quiz master builds a **running order** live from that bank (picking each round's type as it's added). The running order can be built up while players are still joining, and stays editable — reordered, added to, or trimmed down — right up until a round is actually started; only the round currently being played is locked in.

## Structure

- `server/` — Node.js + Express + Socket.IO. Holds the Quiz Bank (`server/data/bank.json`) and all live-game state/logic.
- `client/` — Vite + React web app, with three distinct screen roles:

  | Screen | Route | Job |
  |---|---|---|
  | **Quiz Master** | `/host/room/:code` | You use this to run the game: pick each round from the bank, start/reveal questions, see who's joined, see live answer counts, advance the leaderboard. |
  | **Quiz Master Sharable** (Presentation) | `/present/:code` | A read-only, large-text view for a projector, TV, or screen-shared in Teams/Zoom. Shows the room code to join, the current question, how many got it right, the fastest correct answers, and the scoreboard between questions. Open it from the **📺 Presentation Screen** button on the Quiz Master screen — it's meant to run on a second tab/display, separate from your control screen. |
  | **Player** | `/play/:code` | The answer boards (multiple choice, letters, number pad, sequence) — what each player uses on their own phone. |

  The Quiz Master and Presentation screens are independent connections to the same room (a "spectator" connection that just listens — it doesn't control the game or take a player slot), so you can have both open at once, on different devices if you like.

## Running it

In two terminals:

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

Then open `http://localhost:5173` on the host computer.

The server reads three optional environment variables — set them before `npm start` (e.g. `SESSION_SECRET=... INVITE_CODE=... ALLOWED_ORIGINS=... npm start`) for anything beyond local testing:

- `SESSION_SECRET` — signs login sessions. Without it, a dev default is used and a warning is printed — fine for testing on your own machine, not for a real deployment.
- `INVITE_CODE` — required to create a new account (see **Accounts & access** below). Defaults to `quiznight` with a warning if unset.
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to make credentialed requests (e.g. `https://quiz.example.com`). Without it, the server reflects any request origin back, which is what makes LAN play (below) work across whatever IP your network hands out — fine for local/LAN use, not for a real public deployment.

## Accounts & access

Hosting a game and managing the Quiz Bank require signing in; **joining a game as a player never does** — that stays frictionless, just a room code and a nickname.

Anyone can create their own account from `/login` — **Create an account** — but only with the shared invite code (see above). Give that code to friends you want to let in; nobody else can self-register. Once signed in, you can host your own games independently of anyone else's, and the Quiz Bank is shared: every signed-in person can see, use, and edit everyone's *public* rounds (communal, like a shared doc), while a *private* round is only ever visible to the person who made it — see **Round visibility** below.

Login attempts are rate-limited per IP (10 per 15 minutes) to make password guessing impractical.

## Playing on phones (same Wi-Fi)

1. Find the host computer's LAN IP (Windows: `ipconfig`, look for IPv4 Address, e.g. `192.168.1.42`).
2. On the host computer, go to `http://localhost:5173` → **Host a quiz** → **Start New Game**. Note the room code shown.
3. On each phone (same Wi-Fi network), open `http://192.168.1.42:5173/join`, enter the room code and a name.
4. While players are joining, use **+ Add round** on the Quiz Master screen to build up your running order — pick a round from the bank and a round type for each. Reorder or remove entries with the ↑/↓/✕ buttons any time.
5. Click **Start Quiz** once you've got at least one round queued and one player joined. The running order stays open the whole game — keep adding, removing, or reordering upcoming rounds even while a question is live; only the round actually being played is locked in.
6. After a round's last question, click **Start Next Round** to pop the next queued round, or add one first if the queue's empty — or end the quiz.

Both the client (5173) and server (4000) need to be reachable from phones — if Windows Firewall prompts when you first start them, allow access on private networks.

## Deploying for friends over the internet (Render)

For a permanent URL you can just bookmark and open — no terminal, nothing to start on your own PC — this repo includes a [Render](https://render.com) Blueprint (`render.yaml`) that deploys the server (which serves the built client itself, so it's one service/one URL) with a persistent disk for the Quiz Bank, accounts, and uploaded images.

**One-time setup:**

1. Push this repo to GitHub (Render deploys from a connected Git repo):
   ```bash
   git remote add origin <your-new-empty-github-repo-url>
   git push -u origin main
   ```
   (Create the empty repo first at [github.com/new](https://github.com/new) — **don't** tick "Add a README", since this repo already has one.)
2. On [dashboard.render.com](https://dashboard.render.com), sign up/log in, then **New +** → **Blueprint**, and connect the GitHub repo you just pushed. Render reads `render.yaml` and sets up the web service, persistent disk, and a generated `SESSION_SECRET` automatically.
3. When prompted for `INVITE_CODE`, enter whatever invite code you want to give friends (this gates who can create an account — see **Accounts & access** above).
4. Click deploy. Render builds the client, installs the server, and gives you a URL like `https://too-quick-to-cheat.onrender.com`.

That URL is permanent — bookmark it. Every time you want to host, just open it; there's nothing to start locally. The `starter` plan in `render.yaml` costs a few dollars a month and keeps the app always-on with a real persistent disk (the free tier spins down when idle and wipes its disk on restart, which would lose your Quiz Bank between game nights — this repo is deliberately *not* configured for that tier).

**No-cost, no-deployment alternative:** if you'd rather not pay anything and don't mind a bit more terminal work each time, a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) run from your own PC gets you a temporary public URL for free, with your PC acting as the server for that session. Install `cloudflared` (`winget install --id Cloudflare.cloudflared -e`), build the client once (`cd client && npm run build`), then each time you want to host: start the server (`cd server && SESSION_SECRET=<random string> INVITE_CODE=<code> npm start`) and in a second terminal run `cloudflared tunnel --url http://localhost:4000` — it prints a random `https://<something>.trycloudflare.com` URL to share, which changes every time you restart the tunnel.

See `PROJECT_STATUS.md` for known gaps either way (e.g. game state is in-memory only — a server crash or redeploy mid-game loses the round in progress).

## The Quiz Bank

Go to **📚 Manage Quiz Bank** (from the home screen or the Host a Quiz screen) to build up **rounds** ahead of time — anyone hosting from this install shares the same bank. Each round has a name and up to 10 questions, any mix of the four question types below, plus who created it and when. Rounds are just content; **how a round scores points is decided live when it's added to the running order** (see Round Types), so the same round can be played as a Speed round one night and an Evil round the next.

When adding a round to the running order, the picker shows you the round's full question list (text and type for each), plus who made it and when — so you know exactly what you're queuing up before committing to it.

## Question types

- **Multiple Choice** — 3 to 6 options; players tap the one they think is correct (or two, in a Go Wide round).
- **Normal** — the answer board is the alphabet, laid out as a 4×6 grid of tiles (U/V and Y/Z share a tile, so all 26 letters fit). Players press the letter the answer *starts with*. A leading "The" is ignored, so "The Beatles" → **B**, "Paris" → **P**. Pressing the merged U/V or Y/Z tile counts as either letter.
- **Number** — players type a numeric answer on a number pad (0–9, **C** to clear, **Enter** to submit).
- **Sequence** — the round-builder sets 3–6 items in the correct order (e.g. "smallest to largest", "put these lyrics in order"). Players see the items shuffled and tap them in the order they believe is correct; the whole sequence must match to be correct.
- **Picture modifier** — any question (any type above) can have a picture attached. When a question has a picture, the host screen shows it first with a **Reveal Answer Board** button; players see the picture and wait. Once revealed, the timer starts and the normal answer board appears, with the picture still shown.

## Round types

Picked live, right before you start each round:

A correct answer is worth **10 points**. Standard, Evil, and Go Wide rounds all also give a speed bonus to the first 5 correct answers: 1st +5, 2nd +4, 3rd +3, 4th +2, 5th +1 (6th onwards gets no bonus, just the 10).

| Round type | How it scores |
|---|---|
| **Standard** | 10 points for a correct answer, plus the speed bonus above. Wrong or missed = 0. |
| **Speed** ⚡ | Every correct answer scores the base 10 points — but the single fastest correct answer also gets an extra +10 bonus on top (20 total). No bonus for 2nd place onward, just the 10. |
| **Evil** 😈 | 10 points for correct (plus the speed bonus), but a *wrong* (submitted) answer costs you 10 points. Skipping a question is always safe — only guessing wrong is punished. |
| **Go Wide** 🎯 | Players pick **2** answers instead of 1 (multiple choice or Normal/letters questions). If either pick is right, they score half of whatever they would've scored — including any speed bonus — rounded to the nearest point. |

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

The Quiz Bank is stored in `server/data/bank.json`, accounts in `server/data/users.json`, and uploaded pictures in `server/data/uploads/` — back all three up if you build a library you care about.
