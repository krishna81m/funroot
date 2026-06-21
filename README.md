# funroot 360

An enterprise-grade interactive quiz platform built with Next.js 16 (App Router), Tailwind CSS v4, and a custom Node.js WebSocket server — all in a single process, no database required.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Running Locally](#running-locally)
5. [Deployments](#deployments)
6. [Manual Browser Verification](#manual-browser-verification)
7. [Automated Test Suite](#automated-test-suite)
8. [Question Types Reference](#question-types-reference)
9. [Admin Quiz Builder](#admin-quiz-builder)
10. [Project Structure](#project-structure)
11. [Environment Variables](#environment-variables)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    server.js (port 3000)             │
│                                                      │
│  HTTP requests                                       │
│  ├── /api/*  →  inline API router  →  GameEngine    │
│  └── /*      →  Next.js (Turbopack)                 │
│                                                      │
│  WebSocket upgrade                                   │
│  └── /ws  →  socketServer  →  router  →  GameEngine │
└─────────────────────────────────────────────────────┘
```

- **Single process**: HTTP + WebSocket share one port via `server.on('upgrade', ...)`
- **In-memory state**: All game sessions live in a `Map<pin, GameSession>` — no database
- **Thread safety**: All `GameEngine` mutations are synchronous (Node.js single-threaded event loop; no `await` gaps in critical sections)
- **Snapshot audit trail**: Every state change writes a JSON snapshot to `data/snapshots/<pin>.json` via a per-session serialized write queue
- **Anti-cheat**: Host receives full question data; players receive only the widget descriptor — correct-answer fields (`text`, `correctIndices`, `correctIndex`, `acceptedAnswers`, `correctValue`, `correctOrder`) are stripped before the payload leaves the server
- **Per-player score isolation**: `server:player_result` events are routed exclusively to each answering player's socket via `broadcast(pin, event, payload, 'SOCKET:<id>')` — no player can see another's score or correctness in transit
- **Auto-advance**: When every connected player has submitted an answer, the engine immediately closes the answer window and transitions to RESULTS without waiting for the timer to expire
- **Quiz catalog**: JSON files in `data/quizzes/` — hot-reloadable without restart via the `/admin` UI

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 18+ (tested on v24) | |
| npm | 9+ | |
| Google Chrome | any recent | Required for the E2E browser suite (Playwright) |

---

## Installation

```bash
git clone <repo-url>
cd funroot
npm install
```

---

## Running Locally

```bash
npm run dev
```

The server starts on **http://localhost:3000** with Turbopack hot-reload enabled.

Terminal output:
```
> Ready on http://localhost:3000
> WebSocket endpoint: ws://localhost:3000/ws
```

To run in production mode (no hot-reload):
```bash
npm run build && npm start
```

---

## Deployments

| Environment | URL | WebSocket | Full game | Admin |
|-------------|-----|-----------|-----------|-------|
| **Local** | `http://localhost:3000` | ✅ | ✅ | ✅ |
| **Render** | `https://kahoot-clone-ajpi.onrender.com` | ✅ | ✅ | ✅ |
| **Vercel** | `https://funroot.vercel.app` | ❌ | ❌ (UI preview only) | ✅ (login + quiz builder) |

### Render

Git-based Node.js service; auto-deploys on every push to `master`.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Port assigned by Render via the `PORT` env var; server binds `0.0.0.0`
- Reports and snapshots live in `/tmp/` (ephemeral — cleared on restart)
- Free tier may sleep after inactivity; first request can take ~30 s to wake

### Vercel

Serverless Next.js deployment — no persistent process, no WebSocket.

- `/api/quizzes` returns the bundled `demo-360.json` (static import fallback when the engine can't load)
- `/api/sessions` returns a placeholder PIN; no real game state is created
- Admin login and quiz builder UI work; quiz saves go to the function's temp filesystem and are discarded at request end
- Use for UI previews and admin quiz-builder testing only; run real games on Local or Render

---

## Manual Browser Verification

Open at least two browser windows — one for the **host**, one or more for **players**.

### Step 1 — Host: Create a Session

1. Navigate to **http://localhost:3000**
2. Click **Host →** next to the `funroot 360 Demo` quiz
3. You land on `/host/<PIN>` — the lobby screen showing a 6-digit PIN
4. Share the PIN or the displayed join URL (`/play?pin=<PIN>`) with players

### Step 2 — Players: Join

1. Navigate to **http://localhost:3000/play** in each player's tab or device
2. Enter the **PIN** shown on the host screen
3. Enter a unique nickname and click **Join**
4. Each player appears in the host's lobby list in real time

> Open 3 or more player tabs to verify multiplayer scoring. Each player's score is tracked independently — faster correct answers earn more base points, and consecutive correct answers earn streak bonuses. When all players have answered, the engine auto-advances to RESULTS without waiting for the timer.

### Step 3 — Run the Game

Use the host dashboard to step through every question type in the demo quiz:

| # | Type | What to verify |
|---|------|---------------|
| 1 | **SLIDE** | Host sees title + content; all players see the same slide; no input |
| 2 | **quiz** (multi-select) | Each player selects option tiles independently; faster correct answer scores more; host sees live bar chart |
| 3 | **truefalse** | Player sees True/False buttons; after 2 consecutive correct answers the streak bonus (+100) applies |
| 4 | **typeAnswer** | Player types free text; fuzzy match accepts near-misses like "Pari" or "paris" (Levenshtein ≤ 1) |
| 5 | **slider** | Player drags slider; proximity scoring — exact hit = 100%, off by tolerance = proportional |
| 6 | **puzzle** | Player drag-sorts tiles into correct order; exact sequence required for full points |
| 7 | **poll** | No scoring; all votes aggregated into bar chart the host sees |
| 8 | **wordcloud** | Player types one word; host sees animated word cloud |
| 9 | **brainstorm** | COLLECT phase (players submit ideas) → host clicks Next → VOTE phase (players upvote submitted ideas) |
| 10 | **openended** | Free text; host sees all responses; no scoring |

**Host controls during a game:**

| Button | Visible in state | Effect |
|--------|-----------------|--------|
| Start Game | LOBBY | Transitions to the first quiz item |
| Skip | QUESTION_READING | Bypass the 5-second reading phase → QUESTION_ACTIVE (countdown timer starts immediately) |
| Skip | QUESTION_ACTIVE | End the answer window early → RESULTS |
| Next | RESULTS, LEADERBOARD, SLIDE | Advance to the next item |
| Pause / Resume | QUESTION_ACTIVE | Freeze / unfreeze the countdown timer and block new player submissions |
| Kick | Any (player list) | Remove a specific player; their socket closes and they are removed from the leaderboard |
| Finish | Any | End the game immediately → FINISHED state |

### Step 4 — Leaderboard and Report

1. After the last question the host sees the **final leaderboard**
2. Click **Finish** to end the session
3. Download the report:
   - JSON: `http://localhost:3000/api/report/<PIN>/json`
   - CSV: `http://localhost:3000/api/report/<PIN>/csv`

The report includes per-question aggregation, knowledge gap flags (questions with < 35% correct rate), and a complete per-player answer history with timing and points.

### Step 5 — Reconnect Test

1. While a game is in progress, **close a player tab** and reopen it
2. Go to `/play`, enter the same PIN and **same nickname**
3. The player rejoins instantly — their total score, current streak, and answer history are fully preserved

---

## Automated Test Suite

All tests run against the **live dev server** — start it first, then run tests in a second terminal.

```bash
# Terminal 1
npm run dev
```

### E2E browser suite (covers everything end-to-end)

Requires Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Suites 4, 7, and 8 use real WebSocket connections; they are automatically skipped on Vercel.

```bash
# Local (default)
node test/e2e-browser.js

# Render
BASE_URL=https://kahoot-clone-ajpi.onrender.com node test/e2e-browser.js

# Vercel (WebSocket suites auto-skipped)
BASE_URL=https://funroot.vercel.app node test/e2e-browser.js
```

Expected results:

| Target | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| Local | 80 | 0 | — |
| Render | 80 | 0 | — |
| Vercel | 18 | 0 | 5 |

**What each suite covers:**

| Suite | Name | Assertions | What it verifies |
|-------|------|-----------|-----------------|
| 1 | HTTP + API Smoke | 10 | All REST endpoints return correct status codes and response shapes |
| 2 | Home Page | 5 | Quiz picker renders with correct title and controls; no JS errors |
| 3 | Host Flow | 5 | Full lobby creation in a real browser; PIN visible on screen |
| 4 | Multiplayer Flow | 21 | 3 simultaneous browser players join, see quiz options, submit answers; Alice (correct multi-select) sees positive points; Bob (wrong) sees 0 pts; Charlie's UI is verified independently |
| 5 | Admin Page | 3 | Login, quiz dashboard, and quiz builder UI all render |
| 6 | Report API | 5 | JSON + CSV download endpoints return 200 with correct content-type after a finished game |
| 7 | WebSocket Health | 6 | WS connection handshake; LOBBY state_sync; anti-cheat projection confirmed — correct-answer fields absent from player payload |
| 8 | Multi-Player Score Tracking | 25 | 3 concurrent WS players with predetermined answer timing — per-player result isolation, time-based score ordering (Alice 1000 > Bob 975 at Q1), streak bonus on Q2 (+100 → 1100), auto-advance when all 3 players answer, leaderboard after each scored question, final scores distinct and in descending order |

### Phase API tests (deep per-subsystem assertions)

```bash
# All phases at once
npm run test:api

# Individual phases
node test/phase2-integration.js   # 27 assertions — WebSocket E2E, anti-cheat, pause/resume
node test/phase3-scoring.js       # 55 assertions — all evaluators, boundary cases, streak bonuses
node test/phase5-player.js        #  8 assertions — reconnect, duplicate nickname, kick, pause
node test/phase6-unscored.js      # 14 assertions — poll, wordcloud, brainstorm, openended, reveal
node test/phase7-analytics.js     # 24 assertions — JSON/CSV report, knowledge gaps, download API
node test/phase8-admin.js         # 24 assertions — auth, CRUD, hot-reload, file persistence
```

Total phase assertions: **152, 0 failures**.

#### Phase 2 — Socket integration

- Host and player connect via WebSocket; `client:join` → `state_sync` handshake
- Anti-cheat: `playerView` strips `correctIndices`, `correctIndex`, `acceptedAnswers`, `correctValue`, `correctOrder`, and `text`
- Pause/resume freezes and restores the countdown timer
- `host:skip` from QUESTION_READING → QUESTION_ACTIVE (timer starts); from QUESTION_ACTIVE → RESULTS
- Simultaneous player answer submission; `host:kick` disconnects the target socket

#### Phase 3 — Scoring & evaluators

- `quiz`: single-correct, multi-correct, partial credit
- `truefalse`: correct / incorrect
- `typeAnswer`: exact, fuzzy (≤ 1 Levenshtein), wrong, empty
- `slider`: exact hit, within tolerance (accuracy score), outside tolerance
- `puzzle`: correct order, incorrect order, partial
- Decay formula: `points = round(multiplier × 1000 × max(0, 1 − t / 2T))` → 1000 at t=0, 500 at t=T, 0 after
- Streak bonuses: 2→+100, 3→+200, 4→+300, 5+→+500

#### Phase 5 — Player client

- Reconnect: player with same nickname rejoins mid-game; score, streak, and history preserved
- Duplicate nickname blocked while the original socket is still live
- Kick: kicked player's WebSocket closes; subsequent events from that socket are ignored
- Pause propagates to all players as `PAUSED` state_sync

#### Phase 6 — Unscored types

- Poll: votes aggregated and broadcast to host
- Word cloud: words aggregated by frequency
- Brainstorm: COLLECT phase → `host:reveal` → VOTE phase with upvote counts
- Open-ended: responses collected, no scoring
- All unscored answers return `isCorrect: null`, `pointsEarned: 0`

#### Phase 7 — Analytics & report

- Report generated after `host:finish`
- JSON report: per-question stats, per-player answer history with timing
- CSV report: downloadable with correct headers and row count
- Knowledge gap flag: questions with < 35% correct rate are flagged; unscored types never flagged
- `/api/report/<PIN>/json` and `/api/report/<PIN>/csv` return correct content-type + attachment header

#### Phase 8 — Admin & quiz builder

- `POST /api/admin/login` — correct password → 200, wrong → 401
- `POST /api/admin/quizzes` — requires `x-admin-password` header; writes to `data/quizzes/<id>.json`
- Hot-reload: new quiz immediately appears in `/api/quizzes` catalog without restart
- `GET /api/admin/quiz/:id` — returns full quiz for editing
- Validation: missing `id` or `items` → 400
- `DELETE /api/admin/quizzes/:id` — removes file and evicts quiz from in-memory catalog

---

## Question Types Reference

| Type | Scored | Input widget | How correct is determined |
|------|--------|-------------|--------------------------|
| `SLIDE` | — | None (read-only) | N/A |
| `quiz` | Yes | Multi-select option tiles | All `correctIndices` selected and no wrong index selected |
| `truefalse` | Yes | True / False buttons | Matches `correctIndex` |
| `typeAnswer` | Yes | Text input + submit | Levenshtein distance ≤ 1 from any entry in `acceptedAnswers` |
| `slider` | Yes | Range slider + submit | `accuracy = max(0, 1 − |answer − correctValue| / tolerance)` |
| `puzzle` | Yes | Drag-sort tiles + submit | Submitted order matches `correctOrder` exactly |
| `poll` | No | Single-select options | No right answer; results aggregated into bar chart |
| `wordcloud` | No | Text input (one word) | Aggregated by frequency into word cloud |
| `brainstorm` | No | Multi-line ideas + upvotes | Two sub-phases: COLLECT then VOTE |
| `openended` | No | Text area | All responses collected, no evaluation |

**Scoring formula (scored types only):**

```
basePoints = round(multiplier × 1000 × max(0, 1 − responseTimeMs / (2 × timeLimitMs)))
```

- Perfect answer at t=0 → `multiplier × 1000` points
- Answer exactly at the buzzer (t=timeLimitMs) → `multiplier × 500` points
- After time expires → 0 points (answer still recorded for the report)

**Streak bonuses** (consecutive correct answers):

| Streak | Bonus |
|--------|-------|
| 2 | +100 |
| 3 | +200 |
| 4 | +300 |
| 5+ | +500 |

---

## Admin Quiz Builder

The `/admin` interface lets you create and edit quizzes without touching JSON files.

### Login

- URL: **http://localhost:3000/admin**
- Default password: `admin123`
- Credentials stored in `sessionStorage` (cleared on tab close)
- Override: `ADMIN_PASSWORD=mypassword npm run dev`

### Create a quiz

1. Click **New Quiz** → `/admin/quiz/new`
2. Set a unique **Quiz ID** (becomes the filename: `data/quizzes/<id>.json`)
3. Add items using the **+ [type]** buttons; fill in question text, time limit, multiplier, and type-specific fields (answer choices, correct answers, slider min/max, etc.)
4. Click **Save Quiz** — the quiz is immediately available to host without restarting the server

### Edit a quiz

1. Click the quiz title on the `/admin` dashboard
2. Modify items, reorder with ▲▼, remove with ✕
3. Save — overwrites the existing JSON and hot-reloads the in-memory engine catalog

### Delete a quiz

Click the trash icon on the `/admin` dashboard. The JSON file is deleted and the quiz is evicted from the in-memory catalog immediately.

---

## Project Structure

```
funroot/
├── server.js                    # Single entry point: HTTP + WebSocket server
├── data/
│   ├── quizzes/                 # Quiz JSON files (source of truth; hand-editable)
│   │   └── demo-360.json        # Seed quiz covering all 10 item types
│   ├── snapshots/               # Per-session state snapshots (auto-created, gitignored)
│   └── reports/                 # Post-game JSON + CSV reports (auto-created, gitignored)
├── lib/
│   ├── engine/
│   │   ├── GameEngine.js        # Singleton — all in-memory session state + transition logic
│   │   ├── stateMachine.js      # Legal status transitions (enforced on every mutation)
│   │   ├── scoring.js           # Decay formula + streak bonuses
│   │   ├── SnapshotService.js   # Serialized write queue for safe JSON snapshots
│   │   ├── TimerService.js      # Per-question countdown with pause/resume support
│   │   ├── ReportBuilder.js     # JSON + CSV report generation
│   │   ├── aggregators.js       # Per-type result aggregation (bar, cloud, notes)
│   │   └── evaluators/          # Per-type answer evaluators
│   │       ├── quiz.js
│   │       ├── truefalse.js
│   │       ├── typeAnswer.js    # Levenshtein fuzzy match
│   │       ├── slider.js        # Proximity-based accuracy scoring
│   │       └── puzzle.js
│   └── ws/
│       ├── contracts.js         # Zod schemas for all WebSocket events (validated before engine)
│       ├── router.js            # Event dispatch: client events → engine methods
│       └── socketServer.js      # WebSocket registry + broadcast(pin, event, payload, target)
├── hooks/
│   └── useGameSocket.ts         # React hook — connects to /ws, merges all server:* events into state
├── app/
│   ├── page.tsx                 # Home: quiz picker + PIN join form
│   ├── host/[pin]/page.tsx      # Host dashboard (lobby → questions → results → finished)
│   ├── play/page.tsx            # Player client (join → input widgets → per-player score feedback)
│   ├── admin/
│   │   ├── page.tsx             # Admin dashboard: login + quiz list
│   │   ├── quiz/new/page.tsx    # New quiz builder
│   │   └── quiz/[id]/page.tsx   # Edit existing quiz
│   └── components/
│       ├── host/QuizBuilder.tsx # Quiz builder with per-type ItemEditor components
│       └── charts/              # SVG/Canvas result visualizations
│           ├── BarChart.tsx
│           ├── DistributionCurve.tsx
│           ├── WordCloudCanvas.tsx
│           └── StickyNotes.tsx
└── test/
    ├── e2e-browser.js           # 80-assertion E2E suite (Playwright; all 8 suites)
    ├── phase2-integration.js    # 27 assertions: WebSocket E2E, anti-cheat, pause/resume
    ├── phase3-scoring.js        # 55 assertions: all evaluators + scoring formula
    ├── phase5-player.js         #  8 assertions: reconnect, kick, duplicate nickname, pause
    ├── phase6-unscored.js       # 14 assertions: poll, wordcloud, brainstorm, openended
    ├── phase7-analytics.js      # 24 assertions: reports + knowledge gaps
    └── phase8-admin.js          # 24 assertions: admin CRUD + hot-reload
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP + WebSocket port |
| `HOST` | `localhost` | Bind address (`0.0.0.0` in production) |
| `NODE_ENV` | `development` | Set to `production` for `npm start` |
| `ADMIN_PASSWORD` | `admin123` | Password for `/admin` UI and `x-admin-password` API header |
