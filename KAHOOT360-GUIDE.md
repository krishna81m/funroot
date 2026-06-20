# Kahoot! 360 — Complete Operator & Player Guide

This guide covers every capability of Kahoot! 360: hosting a game, playing as a participant,
administering quizzes, downloading reports, and verifying everything with the test suite —
for all three deployment environments.

---

## Deployment environments

| Environment | URL | WebSocket | Full game | Admin |
|-------------|-----|-----------|-----------|-------|
| **Local** | `http://localhost:3000` | ✅ | ✅ | ✅ |
| **Render** | `https://kahoot-clone-ajpi.onrender.com` | ✅ | ✅ | ✅ |
| **Vercel** | `https://funroot.vercel.app` | ❌ | ❌ (static preview only) | ✅ (login + quiz builder) |

> Vercel is a serverless platform — it can render pages and handle REST API calls, but it cannot
> run a persistent WebSocket server. Use Local or Render for a real multiplayer game session.

---

## Passwords & credentials

| Item | Value | Notes |
|------|-------|-------|
| Admin password | `admin123` | Override with `ADMIN_PASSWORD` env var |
| Game PIN | 6-digit number generated per session | Shown on host lobby screen |
| Nickname | Any text (1–30 chars) | Chosen by each player at join time |

---

## Part 1: Hosting a game

### 1.1 Start the server (Local only)

```bash
npm run dev          # development — hot reload on port 3000
# OR
npm run build && npm start   # production build
```

Server starts at `http://localhost:3000`. Terminal confirms:
```
> Ready on http://localhost:3000
> WebSocket endpoint: ws://localhost:3000/ws
```

On Render, the service starts automatically after every push to `master`.
On Vercel, pages and REST API routes are available immediately after deploy.

---

### 1.2 Open the host interface

Navigate to the home page (`/`) and click **Host →** next to the quiz you want to run,
or go directly to `/host/new` to pick from the quiz list.

The app will:
1. Call `GET /api/quizzes` to list available quizzes
2. Call `POST /api/sessions` with the chosen quiz ID to create a session
3. Redirect to `/host/<PIN>` (e.g., `/host/869744`)
4. Open a WebSocket connection to `/ws` and send `client:join` with `role: HOST`

---

### 1.3 Lobby screen

The lobby shows:
- **Game PIN** (large, prominent — share this with players)
- **Join URL** — `<base-url>/play?pin=<PIN>` — displayable or shareable link
- **Player list** — updates in real time as participants join via WebSocket
- **Start Game** button — active as soon as at least one player has joined
  (you can also start with zero players to run through slides/questions unattended)

---

### 1.4 Starting the game

Click **Start Game**. The host dashboard transitions through items in sequence.
The demo quiz (`Kahoot! 360 Demo`) contains one of every question type:

| # | Type | Title / Question |
|---|------|-----------------|
| 1 | SLIDE | Welcome to Kahoot! 360 |
| 2 | quiz | Which planets are gas giants? (20 s) |
| 3 | truefalse | The Great Wall of China is visible from space… (15 s) |
| 4 | typeAnswer | What is the capital of France? (30 s) |
| 5 | slider | In what year did the Berlin Wall fall? (30 s) |
| 6 | puzzle | Order these events chronologically (45 s) |
| 7 | poll | Which learning format do you prefer? (20 s) |
| 8 | wordcloud | In one word, how are you feeling today? (20 s) |
| 9 | brainstorm | Top ideas for improving team collaboration (60 s) |
| 10 | openended | What is one thing you'd like to learn more about? (60 s) |

---

### 1.5 Full state machine

Every item passes through this sequence:

```
LOBBY
  └─► SLIDE ──────────────────────────────────── host:next_item ──► (next item)
  └─► QUESTION_READING  (5-second reading phase)
        ├── auto-advance after 5 s ──────────────────────────────► QUESTION_ACTIVE
        └── host:skip ──────────────────────────────────────────► QUESTION_ACTIVE
              QUESTION_ACTIVE  (answer window open; countdown timer running)
                ├── all players answer ──────────────────────────► RESULTS (auto)
                ├── timer expires ───────────────────────────────► RESULTS (auto)
                └── host:skip ───────────────────────────────────► RESULTS
                      RESULTS
                        ├── scored type → LEADERBOARD (auto, 100 ms) → host:next_item
                        └── unscored type → host:next_item (no LEADERBOARD)
```

---

### 1.6 Host controls (per item)

| Button | Visible in state | What it does |
|--------|-----------------|-------------|
| **Skip** | QUESTION_READING | Bypass the 5-second reading phase → QUESTION_ACTIVE (countdown timer starts immediately) |
| **Skip** | QUESTION_ACTIVE | End the answer window early → RESULTS |
| **Next** | RESULTS, LEADERBOARD, SLIDE | Advance to the next quiz item |
| **Pause** | QUESTION_ACTIVE | Freeze the countdown timer; players cannot submit new answers |
| **Resume** | PAUSED | Unfreeze the timer from where it was paused |
| **Kick** | Any (player list) | Remove a specific player; their WebSocket closes |
| **Finish** | Any | End the game immediately → FINISHED |

**Auto-advance on all-answered**: When every connected player submits an answer, the engine immediately
transitions to RESULTS — the countdown timer does not need to expire first.

For **poll**, **wordcloud**, **brainstorm**, and **openended** types, the LEADERBOARD step
is skipped — RESULTS goes straight to the next item (or game end).

**Brainstorm** has a two-phase flow:
1. **COLLECT phase** — players submit ideas (60 s by default)
2. **VOTE phase** — players vote on collected ideas; host clicks Next to move between phases

---

### 1.7 Slide items

A slide is display-only: no answer input, no timer, no scoring. The host dashboard shows
the slide content and a **Next** button. Players see the same slide content on their screens.

---

### 1.8 End of game

After the last item the game enters **FINISHED** state. The host screen shows:
- Final leaderboard with all player scores and rankings
- **Download Report** buttons (JSON and CSV)
- Option to host a new game

---

## Part 2: Playing as a participant

### 2.1 Joining a game

1. Go to `/play` (or `<base-url>/play`)
2. Enter the 6-digit **Game PIN** shown on the host screen
3. Enter your **Nickname** (must be unique in the current session)
4. Click **Join**

The player enters a waiting lobby. The host's player list updates in real time.
Once the host clicks **Start Game**, the game transitions automatically on every player's screen.

---

### 2.2 Answer types by question type

| Question type | How to answer |
|---------------|---------------|
| **quiz** | Tap / click one or more answer tiles (multi-select); then click **Submit** |
| **truefalse** | Tap **True** or **False** — submits immediately |
| **typeAnswer** | Type your answer in the text field and click **Submit** |
| **slider** | Drag the slider to your numeric estimate and click **Submit** |
| **puzzle** | Drag tiles into the correct order and click **Submit** |
| **poll** | Tap your preferred option — submits immediately (unscored) |
| **wordcloud** | Type a word or short phrase and click **Submit** (unscored) |
| **brainstorm** | COLLECT phase: submit multiple ideas; VOTE phase: tap to upvote ideas (unscored) |
| **openended** | Type a free-text response and click **Submit** (unscored) |

---

### 2.3 Scoring

Scored types: **quiz**, **truefalse**, **typeAnswer**, **slider**, **puzzle**

```
basePoints = round(multiplier × 1000 × max(0, 1 − t / 2T))
```

Where `t` = elapsed time since QUESTION_ACTIVE began, `T` = question time limit, `multiplier` = 1 (default).

**In practice with a 20-second question:**

| Answer time | Base points |
|-------------|------------|
| 0 ms (instant) | 1000 |
| 1500 ms | ~975 |
| 3000 ms | ~950 |
| 10000 ms (half-time) | ~750 |
| 20000 ms (buzzer) | 500 |
| After timer | 0 |

**Streak bonuses** (consecutive correct answers add to base points):

| Streak | Bonus |
|--------|-------|
| 2 in a row | +100 |
| 3 in a row | +200 |
| 4 in a row | +300 |
| 5+ in a row | +500 |

Example: A player who answers Q1 correctly (1000 pts) and Q2 correctly at 0 ms earns
1000 + 100 (streak bonus) = **1100 pts** for Q2 alone.

Unscored types: **poll**, **wordcloud**, **brainstorm**, **openended** — participation is recorded
but no points are awarded.

---

### 2.4 Per-player score isolation

Each player's score feedback is sent privately. The `server:player_result` event is routed
exclusively to the answering player's WebSocket socket via `SOCKET:<id>` targeting — no other
player, including the host, receives another player's result in transit.

What each party receives after an answer window closes:
- **Each player** gets `server:player_result` with `{ isCorrect, pointsEarned, streak, totalScore }` — their own result only
- **Host** gets `server:answer_tally` with aggregate counts (how many answered correctly)
- **Everyone** (host + all players) gets `server:leaderboard` with the ranked standings

---

### 2.5 Anti-cheat

The server sends structurally different payloads to hosts and players:

- **Host** receives the full item including `text`, `correctIndices`, `correctIndex`,
  `acceptedAnswers`, `correctValue`, `correctOrder`
- **Players** receive the same item with all of those fields stripped — correct answers
  cannot be read from WebSocket traffic even with a network inspector

---

### 2.6 Leaderboard

After each **scored** question:
- Players see their current rank and total cumulative score
- Host sees the full ranked leaderboard with all player names and scores

After **unscored** questions (poll, wordcloud, brainstorm, openended):
- No leaderboard is shown; the game advances directly to the next item

---

### 2.7 Reconnecting mid-game

If a player's connection drops:
1. Go to `/play` and enter the same PIN and the **same nickname**
2. The engine recognises the nickname and reattaches the existing player record
3. Total score, current streak, and answer history are fully preserved

If a player tries to join with a nickname that is already connected, they are blocked with an error
until the original socket disconnects.

---

## Part 3: Admin panel

### 3.1 Accessing admin

Navigate to `/admin` on any environment.

**Login**
- Password: `admin123` (or value of `ADMIN_PASSWORD` env var)
- Credentials are stored in `sessionStorage` (cleared on tab close)

> On Vercel: login works; quiz builder works; but created sessions do not start real games
> because there is no persistent WebSocket server.

---

### 3.2 Quiz dashboard

After login the admin dashboard shows:
- List of all quizzes (title, ID, item count)
- **New Quiz** button → opens the quiz builder at `/admin/quiz/new`
- **Edit** link per quiz → opens builder pre-loaded with the existing quiz data
- **Delete** button per quiz → removes the JSON file and evicts the quiz from the in-memory engine

---

### 3.3 Quiz builder (`/admin/quiz/new` or `/admin/quiz/<id>`)

Fill in:

| Field | Required | Notes |
|-------|----------|-------|
| Quiz ID | Yes | Alphanumeric + hyphens; used as the filename (`data/quizzes/<id>.json`) |
| Title | Yes | Shown on home page and in reports |
| Description | No | Shown on home page below the title |

Then add items. Each item has:
- **Type** — pick from the dropdown (all 10 types supported)
- **Question text**
- **Time limit** (seconds)
- **Points multiplier** (1× default)
- Type-specific fields: answer choices and correct answer(s) for quiz/truefalse/typeAnswer; range and correct value for slider; blocks and correct order for puzzle; options for poll; nothing extra for wordcloud/openended

Click **Save Quiz**. The quiz is written to `data/quizzes/<id>.json` and immediately
available for hosting without restarting the server.

---

### 3.4 Hot-reload

The engine reloads the quiz catalog on every admin save (`engine.reloadQuiz(quiz)`).
Existing in-progress game sessions are unaffected; the new quiz data applies to new sessions only.

---

## Part 4: Reports

Reports are generated at the end of every finished game session.

### 4.1 Downloading reports from the host UI

At the FINISHED screen, click:
- **Download JSON** — full session data including all answers, scores, and timing
- **Download CSV** — flat spreadsheet with one row per player per question

### 4.2 Report API

```
GET /api/report/<PIN>/json
GET /api/report/<PIN>/csv
```

Reports are available immediately after `host:finish` transitions the session to FINISHED.
They are written to a temp directory and survive until the server restarts.

**Example (local):**
```bash
curl http://localhost:3000/api/report/869744/json | python3 -m json.tool
curl http://localhost:3000/api/report/869744/csv
```

**Example (Render):**
```bash
curl https://kahoot-clone-ajpi.onrender.com/api/report/<PIN>/json
```

> On Vercel, reports are not available — no full game sessions can complete without WebSocket.

### 4.3 Report contents

The JSON report includes:
- Session metadata (quiz ID, title, PIN, player count, start/end timestamps)
- Per-question aggregations: correct count, incorrect count, response count, average score, knowledge gap flag (< 35% correct rate)
- Per-player history: for each question, the answer submitted, whether it was correct, points earned, streak at that moment, and response time in ms

The CSV report has one row per (player, question) pair with the same fields as columns.

---

## Part 5: Running the test suite

All test scripts accept `BASE_URL` to point at any deployment. The dev server must be running for local tests.

### 5.1 E2E browser suite

```bash
# Start the server first (local only)
npm run dev

# Run the suite against each environment
node test/e2e-browser.js                                              # local
BASE_URL=https://kahoot-clone-ajpi.onrender.com node test/e2e-browser.js   # Render
BASE_URL=https://funroot.vercel.app node test/e2e-browser.js               # Vercel
```

Expected results:

| Target | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| Local | 80 | 0 | — |
| Render | 80 | 0 | — |
| Vercel | 18 | 0 | 5 (no WS) |

**Suite descriptions:**

| Suite | Assertions | What it verifies |
|-------|-----------|-----------------|
| 1 — HTTP + API Smoke | 10 | REST endpoints (`/`, `/play`, `/admin`, `/host/new`, `/api/quizzes`, `/api/sessions`, `/api/admin/login`) return correct status codes |
| 2 — Home Page | 5 | Quiz picker renders, quiz card title appears after hydration, Host button and PIN input visible, no JS errors |
| 3 — Host Flow | 5 | Real browser creates a session, redirects to `/host/<PIN>`, lobby badge and PIN appear on screen |
| 4 — Multiplayer Flow | 21 | 3 simultaneous Playwright browsers join with different nicknames, all see the gas-giants question options, Alice submits correct multi-select (Jupiter + Saturn), Bob submits wrong (Mars), Alice sees positive pts, Bob sees 0 pts |
| 5 — Admin Page | 3 | Login succeeds, quiz dashboard renders, quiz builder renders |
| 6 — Report API | 5 | JSON and CSV endpoints return 200 with correct content-type after a finished game |
| 7 — WebSocket Health | 6 | WS connection + LOBBY handshake; fresh session confirms anti-cheat: player payload has no `correctIndices`, `correctIndex`, `acceptedAnswers`, `correctValue`, `correctOrder`, or `text` |
| 8 — Multi-Player Score Tracking | 25 | 3 concurrent WS players with predetermined answers and delays — per-player result isolation (each receives only their own `server:player_result`), time-based score ordering (Alice 0 ms → 1000 pts > Bob 1500 ms → 975 pts at Q1), streak bonus on Q2 (Alice: 1000 + 100 = 1100 pts), auto-advance after all 3 answer, leaderboard after each scored question, final distinct scores in descending order |

### 5.2 Phase API tests

```bash
# All phases at once
npm run test:api

# Individual phases
node test/phase2-integration.js   # 27 assertions: WebSocket E2E, anti-cheat, pause/resume
node test/phase3-scoring.js       # 55 assertions: all evaluators, boundary cases, streak bonuses
node test/phase5-player.js        #  8 assertions: reconnect, duplicate nickname, kick, pause
node test/phase6-unscored.js      # 14 assertions: poll, wordcloud, brainstorm, openended, reveal
node test/phase7-analytics.js     # 24 assertions: JSON/CSV report, knowledge gaps, download API
node test/phase8-admin.js         # 24 assertions: auth, CRUD, hot-reload, file persistence
```

Total: **152 assertions, 0 failures** across all phase tests.

---

## Part 6: Step-by-step walkthrough (all question types)

This is a complete host + 3 player run-through of the demo quiz.

### Setup

**Host (browser A):** Open `http://localhost:3000` → click **Host →** next to
"Kahoot! 360 Demo". Note the PIN (e.g., `123456`).

**Players (browsers B, C, D):** Each opens `http://localhost:3000/play` → enters PIN `123456` →
enters a unique nickname → clicks **Join**.

Host sees all 3 players appear in the lobby list. Click **Start Game**.

---

### Item 1 — SLIDE: Welcome

- **Host**: Slide content displayed. Click **Next** to proceed.
- **Players**: All see the same slide content. No input required.

---

### Item 2 — Quiz: Gas giants (20 s, multi-select)

- **Reading phase (5 s)**: Both host and players see the question. Host can click **Skip** to bypass.
- **Active phase (20 s)**: Each player independently selects option tiles and clicks **Submit**.
  - Faster correct answers earn more points. Answering at 0 ms earns 1000 pts; at 10 s earns ~750 pts.
  - If all players submit before the 20 s timer, the engine auto-advances to RESULTS immediately.
- **Results**: Correct answers highlighted on host screen. Host sees how many players answered correctly.
- **Leaderboard**: Each player sees their own rank and score. Host sees all rankings. Click **Next**.

---

### Item 3 — True/False: Great Wall (15 s)

- Active phase: each player taps **True** or **False**.
- A player who was correct on Q2 AND correct here earns a streak bonus of +100.
- Results → Leaderboard → Next.

---

### Item 4 — Type Answer: Capital of France (30 s)

- Player types a word. Accepted answers include exact match and within 1 edit distance:
  - `Paris` ✓ `paris` ✓ `Pari` ✓ (one deletion) `Pariss` ✓ (one insertion)
- Results show all accepted variants. Leaderboard → Next.

---

### Item 5 — Slider: Berlin Wall year (30 s)

- Player drags the slider to their estimate. The correct value is `1989`.
- Proximity scoring: exact hit → 1000 pts; off by tolerance → proportionally less.
- Results show the correct value and each player's estimate. Leaderboard → Next.

---

### Item 6 — Puzzle: Chronological order (45 s)

- Players drag tiles into the sequence they believe is correct and click **Submit**.
- Only an exact match of the full `correctOrder` earns points.
- Results show the correct order. Leaderboard → Next.

---

### Item 7 — Poll: Learning format (20 s, unscored)

- Player selects one option. No right or wrong answer — this is for gathering opinions.
- Results show the vote distribution as a bar chart on the host screen.
- No leaderboard (unscored type). Host clicks **Next**.

---

### Item 8 — Word Cloud: One word (20 s, unscored)

- Player types a single word and submits. Words are aggregated by frequency.
- Host sees an animated word cloud where more common words appear larger.
- No scoring. Host clicks **Next**.

---

### Item 9 — Brainstorm: Team collaboration (60 s + vote, unscored)

- **COLLECT phase (60 s)**: Players submit as many ideas as they like.
- When the timer expires (or host clicks **Next**): game enters **VOTE phase**.
  Players see all submitted ideas and can upvote each one.
- Host clicks **Next** after voting. Results show top-voted ideas as sticky notes.
- No scoring. Host clicks **Next**.

---

### Item 10 — Open Ended: Learn more about (60 s, unscored)

- Player types a free-text response and submits.
- Host screen shows all responses as they come in.
- No scoring. Host clicks **Next** → game ends.

---

### End of game (FINISHED)

Host screen shows the final leaderboard with all player ranks and total scores.

Download buttons:
- **Download JSON** — full session data for programmatic analysis
- **Download CSV** — open in Excel, Google Sheets, etc.

```bash
# Alternatively fetch directly:
curl http://localhost:3000/api/report/<PIN>/json | python3 -m json.tool
curl http://localhost:3000/api/report/<PIN>/csv
```

---

## Part 7: Environment-specific notes

### Local

- Port: 3000 (configurable via `PORT` env var)
- Host binding: `localhost` in dev, `0.0.0.0` in production (`npm start`)
- Quiz files: `data/quizzes/*.json` — editable while server is running; saved via `/admin` hot-reloads immediately
- Logs: `logs/app.log` (server) and `logs/e2e.log` (E2E test output)
- Reports: `data/reports/` (created after every finished game)
- Snapshots: `data/snapshots/` (written after every state change)

### Render (`https://kahoot-clone-ajpi.onrender.com`)

- Git-based Node.js service; auto-deploys on every push to `master`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Binds `0.0.0.0` on the `PORT` assigned by Render (typically 10000)
- Logs: ephemeral — accessible in the Render dashboard during the session
- Reports: written to `/tmp/` — ephemeral; cleared on every restart
- Snapshots: written to `/tmp/` — ephemeral
- Free tier may sleep after inactivity; the first request after sleep may take ~30 s
- To manually trigger a deploy via the Render API:
  ```bash
  curl -X POST https://api.render.com/v1/services/<SERVICE_ID>/deploys \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"clearCache":"do_not_clear"}'
  ```

### Vercel (`https://funroot.vercel.app`)

- Serverless Next.js deployment — no persistent process
- Pages and REST API routes work; WebSocket server does not run
- `/api/quizzes` falls back to the bundled `demo-360.json` (static ES module import)
- `/api/sessions` returns a randomly generated placeholder PIN; no real game state is created
- Admin login and quiz builder UI work; quiz saves go to the function's ephemeral temp filesystem
  and are discarded at the end of the serverless invocation
- WS-dependent E2E suites (4, 7, 8) are automatically skipped when `BASE_URL` points at Vercel
- Use for UI review and admin quiz-builder testing only; run real games on Local or Render
