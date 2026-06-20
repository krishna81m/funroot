# Kahoot! 360

An enterprise-grade interactive quiz platform clone built with Next.js 16 (App Router), Tailwind CSS v4, and a custom Node.js WebSocket server — all in a single process, no database required.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Running Locally](#running-locally)
5. [Manual Browser Verification](#manual-browser-verification)
6. [Automated Test Suite](#automated-test-suite)
7. [Question Types Reference](#question-types-reference)
8. [Admin Quiz Builder](#admin-quiz-builder)
9. [Project Structure](#project-structure)
10. [Environment Variables](#environment-variables)

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
- **Anti-cheat**: Host receives full question data; players receive only the widget descriptor (options without correct answers)
- **Quiz catalog**: JSON files in `data/quizzes/` — hot-reloadable without restart via the `/admin` UI

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18+ (tested on v24) |
| npm | 9+ |

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

The server starts on **http://localhost:3000** with hot-reload enabled.

You will see:
```
> Ready on http://localhost:3000
> WebSocket endpoint: ws://localhost:3000/ws
```

To run in production mode (no hot-reload):
```bash
npm run build && npm start
```

---

## Manual Browser Verification

Open two browser windows side by side — one for the **host**, one for a **player**.

### Step 1 — Host: Create a Session

1. Navigate to **http://localhost:3000**
2. Select the `Kahoot! 360 Demo` quiz from the dropdown
3. Click **Host Game**
4. You land on `/host/<PIN>` — the lobby screen showing the 6-digit PIN

### Step 2 — Player: Join

1. Navigate to **http://localhost:3000/play** (second window / tab / device)
2. Enter the **PIN** from the host screen
3. Enter a nickname and click **Join**
4. You appear in the host's player list in real time

> Add 2–3 more players in extra tabs to test the multiplayer scoring and leaderboard.

### Step 3 — Run the Game

Use the host dashboard to step through every question type in the demo quiz:

| # | Type | What to verify |
|---|------|---------------|
| 1 | **SLIDE** | Host sees title + markdown content; players see a waiting screen |
| 2 | **quiz** (multi-select) | Player selects options; host sees live bar chart after timer |
| 3 | **truefalse** | Player sees True/False buttons |
| 4 | **typeAnswer** | Player types free text; fuzzy match (Levenshtein ≤ 1) accepts near-misses like "Pari" |
| 5 | **slider** | Player drags slider; proximity scoring (tolerance window) |
| 6 | **puzzle** | Player drag-sorts blocks into correct order |
| 7 | **poll** | No points; host sees real-time bar chart |
| 8 | **wordcloud** | Host sees animated word cloud canvas |
| 9 | **brainstorm** | COLLECT phase → host clicks Reveal → VOTE phase with sticky notes |
| 10 | **openended** | Free text; host sees all responses, no scoring |

**Controls available to the host during a game:**

| Button | Effect |
|--------|--------|
| Start Game | Transitions lobby → first item |
| Next | Advances to next item |
| Skip | Skips current item (safe in any state) |
| Pause / Resume | Freezes timer and player inputs |
| Kick | Removes a specific player |

### Step 4 — Leaderboard and Report

1. After the last question the host sees the **final leaderboard**
2. Click **Finish** to end the session
3. Download the report:
   - JSON: `http://localhost:3000/api/report/<PIN>/json`
   - CSV: `http://localhost:3000/api/report/<PIN>/csv`

The report includes per-question aggregation, knowledge gap flags (< 35% correct rate), and per-player answer history.

### Step 5 — Reconnect Test

1. While a game is in progress, **close the player tab** and reopen it
2. Go to `/play`, enter the same PIN and **same nickname**
3. The player rejoins with their score and streak intact

---

## Automated Test Suite

All tests run against the **live dev server** — start it first, then run tests in a separate terminal.

```bash
# Terminal 1
npm run dev

# Terminal 2 — run all phases
for f in test/phase{2,3,5,6,7,8}-*.js; do
  echo ""
  echo "=== $f ==="
  node "$f"
done
```

Or run individual phases:

```bash
node test/phase2-integration.js   # 27 assertions — WebSocket E2E, anti-cheat, pause/resume
node test/phase3-scoring.js       # 55 assertions — all evaluators, boundary cases, streak bonuses
node test/phase5-player.js        #  8 assertions — reconnect, duplicate nickname, kick, pause
node test/phase6-unscored.js      # 14 assertions — poll, wordcloud, brainstorm, openended, reveal
node test/phase7-analytics.js     # 24 assertions — JSON/CSV report, knowledge gaps, download API
node test/phase8-admin.js         # 24 assertions — auth, CRUD, hot-reload, file persistence
```

**Expected output (all passing):**

```
=== Phase 2: Socket Layer ===
  PASS: Host can connect and join session
  PASS: Player receives LOBBY state_sync on join
  PASS: Anti-cheat — player view omits correct answers
  ... (27 total)
=== Results: 27 passed, 0 failed ===

=== Phase 3: Scoring & Evaluators ===
  PASS: quiz — all correct indices
  PASS: truefalse — correct
  PASS: typeAnswer — exact match
  PASS: typeAnswer — fuzzy match within 1 edit
  PASS: slider — exact hit
  ... (55 total)
=== Results: 55 passed, 0 failed ===
```

Total: **152 assertions, 0 failures**.

### What each phase tests

#### Phase 2 — Socket integration (`phase2-integration.js`)
- Host and player connect via WebSocket
- `client:join` → `state_sync` handshake
- Anti-cheat: `playerView` strips `correctIndices`, `acceptedAnswers`, etc.
- Pause/resume freezes and restores timer
- `host:skip` works from any question state
- Simultaneous player answers (concurrency)
- `host:kick` disconnects the target player

#### Phase 3 — Scoring & evaluators (`phase3-scoring.js`)
- `quiz`: single-correct, multi-correct, partial credit
- `truefalse`: correct / incorrect
- `typeAnswer`: exact, fuzzy (≤ 1 Levenshtein), wrong, empty
- `slider`: exact hit, within tolerance (accuracy score), outside tolerance
- `puzzle`: correct order, incorrect order, partial
- Decay formula: `points = round(multiplier × 1000 × (1 − t / 2T))` → 1000 at t=0, 500 at t=T, 0 after
- Streak bonuses: 2→+100, 3→+200, 4→+300, 5+→+500

#### Phase 5 — Player client (`phase5-player.js`)
- Reconnect: player with same nickname rejoins mid-game, score preserved
- Duplicate nickname blocked while original is still connected
- Kick: kicked player's WebSocket closes, subsequent events ignored
- Pause propagates to players as `PAUSED` state_sync

#### Phase 6 — Unscored types (`phase6-unscored.js`)
- Poll: votes aggregated and broadcast to host
- Word cloud: words aggregated by frequency
- Brainstorm: COLLECT phase → `host:reveal` → VOTE phase with upvote counts
- Open-ended: responses collected, no scoring
- All unscored answers return `isCorrect: null`, `pointsEarned: 0`

#### Phase 7 — Analytics & report (`phase7-analytics.js`)
- Report generated after `host:finish`
- JSON report: per-question stats, per-player answer history
- CSV report: downloadable with correct headers and row count
- Knowledge gap flag: questions with < 35% correct rate are flagged
- Unscored questions (`poll`, `wordcloud`, etc.) never flagged as knowledge gaps
- `/api/report/<PIN>/json` and `/api/report/<PIN>/csv` return correct content-type + attachment header

#### Phase 8 — Admin & quiz builder (`phase8-admin.js`)
- `POST /api/admin/login` — correct password → 200, wrong → 401
- `POST /api/admin/quizzes` — requires `x-admin-password` header
- Quiz JSON written to `data/quizzes/<id>.json`
- Hot-reload: new quiz immediately appears in `/api/quizzes` catalog
- Can host a game with the newly created quiz
- `GET /api/admin/quiz/:id` — returns full quiz for editing
- Validation: missing `id` or `items` → 400
- `DELETE /api/admin/quizzes/:id` — removes file and evicts from catalog
- `GET /admin` and `/admin/quiz/new` pages render (200)

---

## Question Types Reference

| Type | Scored | Input widget | How correct is determined |
|------|--------|-------------|--------------------------|
| `SLIDE` | — | None (read-only) | N/A |
| `quiz` | Yes | Multi-select options | All `correctIndices` selected, none wrong |
| `truefalse` | Yes | True / False buttons | Matches `correctIndex` |
| `typeAnswer` | Yes | Text input | Levenshtein distance ≤ 1 from any `acceptedAnswers` entry |
| `slider` | Yes | Range slider | `accuracy = max(0, 1 − |answer − correctValue| / tolerance)` |
| `puzzle` | Yes | Drag-sort blocks | Submitted order matches `correctOrder` exactly |
| `poll` | No | Single-select options | No right answer; results aggregated |
| `wordcloud` | No | Text input (one word) | Aggregated by frequency |
| `brainstorm` | No | Multi-line ideas + upvotes | Two sub-phases: COLLECT then VOTE |
| `openended` | No | Text area | All responses collected, no evaluation |

**Scoring formula (scored types only):**

```
basePoints = round(multiplier × 1000 × max(0, 1 − responseTimeMs / (2 × timeLimitMs)))
```

- Perfect answer at t=0 → `multiplier × 1000`
- Answer at the buzzer (t=timeLimitMs) → `multiplier × 500`
- After time expires → 0

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
- Credentials are stored in `sessionStorage` (cleared on tab close)
- Override the password: `ADMIN_PASSWORD=mypassword npm run dev`

### Create a quiz

1. Click **New Quiz** → `/admin/quiz/new`
2. Set a unique **Quiz ID** (becomes the filename: `data/quizzes/<id>.json`)
3. Add items using the **+ [type]** buttons
4. Click **Save Quiz** — the quiz is immediately available to host without restart

### Edit a quiz

1. Click the quiz title on the `/admin` dashboard
2. Modify items, reorder with ▲▼, remove with ✕
3. Save — overwrites the existing JSON and hot-reloads the engine catalog

### Delete a quiz

- Click the trash icon on the `/admin` dashboard
- The JSON file is deleted and the quiz is evicted from the in-memory catalog

---

## Project Structure

```
funroot/
├── server.js                    # Single entry point: HTTP + WebSocket server
├── data/
│   ├── quizzes/                 # Quiz JSON files (source of truth)
│   │   └── demo-360.json        # Seed quiz covering all 10 item types
│   ├── snapshots/               # Per-session state snapshots (auto-created)
│   └── reports/                 # Post-game JSON + CSV reports (auto-created)
├── lib/
│   ├── engine/
│   │   ├── GameEngine.js        # Singleton — all in-memory session state
│   │   ├── stateMachine.js      # Legal status transitions
│   │   ├── scoring.js           # Decay formula + streak bonuses
│   │   ├── SnapshotService.js   # Serialized write queue for safe JSON snapshots
│   │   ├── TimerService.js      # Per-question countdown with pause support
│   │   ├── ReportBuilder.js     # JSON + CSV report generation
│   │   ├── aggregators.js       # Per-type result aggregation (bar, cloud, notes)
│   │   └── evaluators/          # Per-type answer evaluators
│   │       ├── quiz.js
│   │       ├── truefalse.js
│   │       ├── typeAnswer.js    # Levenshtein fuzzy match
│   │       ├── slider.js        # Proximity-based accuracy
│   │       └── puzzle.js
│   └── ws/
│       ├── contracts.js         # Zod schemas for all WebSocket events
│       ├── router.js            # Event dispatch: client events → engine
│       └── socketServer.js      # WebSocket registry + broadcast targeting
├── hooks/
│   └── useGameSocket.ts         # React hook — connects, sends join, merges state
├── app/
│   ├── page.tsx                 # Home: quiz picker + host button
│   ├── host/[pin]/page.tsx      # Host dashboard (lobby → questions → results)
│   ├── play/page.tsx            # Player client (join → input widgets → feedback)
│   ├── admin/
│   │   ├── page.tsx             # Admin dashboard: login + quiz list
│   │   ├── quiz/new/page.tsx    # New quiz page
│   │   └── quiz/[id]/page.tsx   # Edit quiz page
│   └── components/
│       ├── host/QuizBuilder.tsx # Quiz builder with ItemEditor for all 10 types
│       └── charts/              # SVG/Canvas result visualizations
│           ├── BarChart.tsx
│           ├── DistributionCurve.tsx
│           ├── WordCloudCanvas.tsx
│           └── StickyNotes.tsx
└── test/
    ├── phase2-integration.js    # 27 assertions: WebSocket E2E
    ├── phase3-scoring.js        # 55 assertions: evaluators + scoring
    ├── phase5-player.js         #  8 assertions: reconnect, kick, pause
    ├── phase6-unscored.js       # 14 assertions: poll, wordcloud, brainstorm, openended
    ├── phase7-analytics.js      # 24 assertions: reports + knowledge gaps
    └── phase8-admin.js          # 24 assertions: admin CRUD + hot-reload
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP + WebSocket port |
| `HOST` | `localhost` | Bind address |
| `NODE_ENV` | `development` | Set to `production` for `npm start` |
| `ADMIN_PASSWORD` | `admin123` | Password for `/admin` and `x-admin-password` header |
