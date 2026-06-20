# Kahoot! 360 — Complete Operator & Player Guide

This guide covers every capability of Kahoot! 360: hosting a game, playing as a participant,
administering quizzes, and downloading reports — for all three deployment environments.

---

## Deployment environments

| Environment | URL | WebSocket | Full game | Admin |
|-------------|-----|-----------|-----------|-------|
| **Local** | `http://localhost:3000` | ✅ | ✅ | ✅ |
| **Render** | `https://kahoot-clone-ajpi.onrender.com` | ✅ | ✅ | ✅ |
| **Vercel** | `https://funroot.vercel.app` | ❌ | ❌ (static preview only) | ✅ (login + quiz builder) |

> Vercel is a serverless platform — it can show pages and handle REST API calls, but it cannot run a
> WebSocket server. Use Local or Render for a real game session.

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

Server starts at `http://localhost:3000`. The terminal will confirm port binding.

---

### 1.2 Open the host interface

Navigate to the home page (`/`) and click **Host →** next to the quiz you want to run,
or go directly to `/host/new` to pick from the quiz list.

The app will:
1. Create a game session (GET `/api/quizzes`, POST `/api/sessions`)
2. Redirect to `/host/<PIN>` (e.g., `/host/869744`)
3. Establish a WebSocket connection to `/ws`

---

### 1.3 Lobby screen

The lobby shows:
- **Game PIN** (large, prominent — share this with players)
- **Join URL** — `<base-url>/play?pin=<PIN>` — display or share this link
- **Player list** — updates in real time as participants join
- **Start Game** button — becomes active as soon as at least one player has joined
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

### 1.5 Host controls (per question)

Every question goes through this state machine:

```
LOBBY → QUESTION_READING (5-second reading phase)
         → QUESTION_ACTIVE (answer window open)
           → RESULTS
             → LEADERBOARD   (scored types only)
               → next item
```

**Buttons available to the host:**

| Button | State it appears in | What it does |
|--------|--------------------|----|
| **Skip** | QUESTION_READING | Bypass the 5-second reading phase → go to QUESTION_ACTIVE immediately |
| **Skip** | QUESTION_ACTIVE | End the answer window early → go to RESULTS |
| **Next** | RESULTS, LEADERBOARD, SLIDE | Advance to the next quiz item |
| **Finish** | Any state | End the game immediately → FINISHED |

For **poll**, **wordcloud**, **brainstorm**, and **openended** types, the LEADERBOARD step
is skipped — RESULTS goes straight to the next item (or game end).

**Brainstorm** has a two-phase flow:
1. **COLLECT** phase — players submit ideas (60 s by default)
2. **VOTE** phase — players vote on collected ideas
The host sees both phases and clicks Next to move between them.

---

### 1.6 Slide items (SLIDE type)

A slide is display-only: no answer input, no timer, no scoring. The host dashboard shows
the slide content and a **Next** button. Players see the slide content on their screens.

---

### 1.7 End of game

After the last item the game enters **FINISHED** state. The host screen shows:
- Final leaderboard
- **Download Report** buttons (JSON and CSV)
- Option to host a new game

---

## Part 2: Playing as a participant

### 2.1 Joining a game

1. Go to `/play` (or `<base-url>/play`)
2. Enter the 6-digit **Game PIN** shown on the host screen
3. Enter your **Nickname**
4. Click **Join**

The player is held in a waiting lobby until the host starts the game.

---

### 2.2 Answer types by question type

| Question type | How to answer |
|---------------|---------------|
| **quiz** | Tap / click one or more answer tiles (multiple-choice) |
| **truefalse** | Tap **True** or **False** |
| **typeAnswer** | Type your answer in the text field and submit |
| **slider** | Drag the slider to your numeric estimate and submit |
| **puzzle** | Drag tiles into the correct order and submit |
| **poll** | Tap your preferred option (unscored — no right/wrong) |
| **wordcloud** | Type a word or short phrase and submit |
| **brainstorm** | Submit ideas during COLLECT phase; vote on ideas during VOTE phase |
| **openended** | Type a free-text answer and submit |

---

### 2.3 Scoring

Scored types: **quiz**, **truefalse**, **typeAnswer**, **slider**, **puzzle**

```
basePoints = round(multiplier × 1000 × max(0, 1 − t / 2T))
```

Where `t` = elapsed time, `T` = question time limit, `multiplier` = 1 (default).
Faster correct answers score more.

**Streak bonuses** (consecutive correct answers):
- 2 correct in a row: +100
- 3 in a row: +200
- 4 in a row: +300
- 5+ in a row: +500

Unscored types: **poll**, **wordcloud**, **brainstorm**, **openended** — participation only.

---

### 2.4 Anti-cheat

The server sends different payloads to hosts and players:
- **Host**: receives full question data including correct answers
- **Players**: receive question without `text`, `correctIndices`, `correctIndex`,
  `acceptedAnswers`, `correctValue`, `correctOrder` — answers cannot be read from
  the WebSocket traffic

---

### 2.5 Leaderboard

After each scored question, players see their current rank and total score.
The host sees the full leaderboard with all player names and scores.

---

## Part 3: Admin panel

### 3.1 Accessing admin

Navigate to `/admin` on any environment.

**Login**
- Password: `admin123` (or value of `ADMIN_PASSWORD` env var)
- On Vercel: login works; quiz builder works; creating sessions does not start real games
  (no WebSocket)

---

### 3.2 Quiz dashboard

After login the admin dashboard shows:
- List of all quizzes (title, ID, item count)
- **New Quiz** button → opens the quiz builder at `/admin/quiz/new`
- **Edit** link per quiz → opens builder pre-loaded with existing quiz
- **Delete** button per quiz → removes quiz file and unloads from engine

---

### 3.3 Quiz builder (`/admin/quiz/new`)

Fill in:
| Field | Required | Notes |
|-------|----------|-------|
| Quiz ID | Yes | Alphanumeric + hyphens; used as filename |
| Title | Yes | Shown on home page and in reports |
| Description | No | Shown on home page |

Then add items. Each item has:
- **Type** — pick from the dropdown (all 10 types supported)
- **Question text**
- **Time limit** (seconds)
- **Points multiplier** (1× default)
- Type-specific fields (answer choices, correct answers, slider min/max, etc.)

Click **Save Quiz**. The quiz is written to `data/quizzes/<id>.json` and immediately
available for hosting without restarting the server.

---

### 3.4 Hot-reload

The engine reloads the quiz catalog on every admin save (`engine.reloadQuiz(quiz)`).
Existing in-progress game sessions are unaffected; the new quiz data applies to new sessions.

---

## Part 4: Reports

Reports are generated at the end of every finished game session.

### 4.1 Downloading reports from the host UI

At the FINISHED screen, click:
- **Download JSON** — full session data including all answers, scores, timing
- **Download CSV** — flat spreadsheet with one row per player per question

### 4.2 Report API

```
GET /api/report/<PIN>/json
GET /api/report/<PIN>/csv
```

Reports are available immediately after the game finishes. They are written to a temp
directory and survive until the server restarts.

**Example (local):**
```bash
curl http://localhost:3000/api/report/869744/json | python3 -m json.tool
curl http://localhost:3000/api/report/869744/csv
```

**Example (Render):**
```bash
curl https://kahoot-clone-ajpi.onrender.com/api/report/<PIN>/json
```

> On Vercel, reports are not available (no completed WS sessions possible).

---

## Part 5: Running the test suite

All test scripts accept `BASE_URL` to point at any deployment.

```bash
# Local (default)
node test/e2e-browser.js

# Render
BASE_URL=https://kahoot-clone-ajpi.onrender.com node test/e2e-browser.js

# Vercel (WS suites auto-skipped)
BASE_URL=https://funroot.vercel.app node test/e2e-browser.js

# Individual phase tests
node test/phase2-integration.js
node test/phase3-scoring.js
node test/phase5-player.js
node test/phase6-unscored.js
node test/phase7-analytics.js
node test/phase8-admin.js

# All phases at once
npm run test:api
```

Expected results:
| Target | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| Local | 41 | 0 | — |
| Render | 41 | 0 | — |
| Vercel | 18 | 0 | 4 |

---

## Part 6: Step-by-step walkthrough (all question types)

This section is a complete host+player run-through of the demo quiz.

### Setup

**Host (browser A):** Open `http://localhost:3000` → click **Host →** next to
"Kahoot! 360 Demo". Note the PIN (e.g., `123456`).

**Player (browser B / mobile):** Open `http://localhost:3000/play` → enter PIN `123456` →
enter nickname → **Join**.

Host sees the player appear in the lobby. Click **Start Game**.

---

### Item 1 — SLIDE: Welcome

- Host: Slide content displayed. Click **Next** to proceed.
- Player: Sees the same slide. No input required.

---

### Item 2 — Quiz: Gas giants

- **Reading phase (5 s)**: Both see the question. Host can click **Skip** to bypass.
- **Active phase (20 s)**: Player taps the correct answer tiles. A progress bar counts down.
- **Results**: Correct answers highlighted. Score and streak shown.
- **Leaderboard**: Rankings displayed. Host clicks **Next**.

---

### Item 3 — True/False: Great Wall

- Reading phase → Active (15 s): Player taps **True** or **False**.
- Results → Leaderboard → Next.

---

### Item 4 — Type Answer: Capital of France

- Player types `Paris` (fuzzy match: `Pari`, `paris` also accepted — Levenshtein ≤ 1).
- Results show accepted answers. Leaderboard → Next.

---

### Item 5 — Slider: Berlin Wall year

- Player drags slider to `1989`. Closer to the correct value scores more points.
- Results show correct value and player estimates. Leaderboard → Next.

---

### Item 6 — Puzzle: Chronological order

- Player drags tiles into the correct sequence and submits.
- Exact order required for full points. Leaderboard → Next.

---

### Item 7 — Poll: Learning format

- Player selects a preference. **No scoring** — just aggregated bar chart for host.
- Results show distribution. No leaderboard. Host clicks **Next**.

---

### Item 8 — Word Cloud: One word

- Player types a single word. Words aggregated into a cloud on the host screen.
- No scoring. Host clicks **Next**.

---

### Item 9 — Brainstorm: Team collaboration

- **COLLECT phase (60 s)**: Players submit multiple ideas.
- Host clicks **Next** (or waits for timer) → **VOTE phase**: players vote on submitted ideas.
- Host clicks **Next** after voting. No scoring. Results show top-voted ideas.

---

### Item 10 — Open Ended: Learn more about

- Player types a free-text response. All responses shown on host screen.
- No scoring. Host clicks **Next** → game ends.

---

### End of game

Host sees final leaderboard and report download buttons. Click:
- **Download JSON** — save full session data
- **Download CSV** — open in Excel/Sheets

---

## Part 7: Environment-specific notes

### Local

- Port: 3000 (configurable via `PORT` env var)
- Host binding: `localhost` in dev, `0.0.0.0` in production
- Quiz files: `data/quizzes/*.json` (editable while server is running)
- Logs: `logs/app.log` and `logs/e2e.log`
- Reports: `data/reports/` (created after game finishes)
- Snapshots: `data/snapshots/` (written after every state change)

### Render (`https://kahoot-clone-ajpi.onrender.com`)

- Git-based Node.js service; auto-deploys on push to `master`
- Build command: `npm install && npm run build`
- Start command: `node server.js`
- Binds `0.0.0.0:10000` (Render assigns port via `PORT` env var)
- Logs: `/tmp/kahoot-app.log` (ephemeral; clears on restart)
- Reports: `/tmp/kahoot360-reports/` (ephemeral)
- Free tier may sleep after inactivity — first request may take ~30 s to wake

### Vercel (`https://funroot.vercel.app`)

- Serverless Next.js deployment — no persistent process
- Pages and REST API work; WebSocket does not
- `/api/quizzes` returns the bundled `demo-360.json`
- `/api/sessions` returns a placeholder PIN (no real game state)
- Admin login and quiz builder UI work; saving a quiz writes to the function's temp
  filesystem which is discarded at the end of the request
- Use for UI previews and static feature review only; run games on Local or Render
