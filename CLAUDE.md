# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (Turbopack hot-reload, port 3000)
npm run dev

# Production
npm run build && npm start

# API/integration tests (requires dev server running)
npm run test:api           # runs all phase2/3/5/6/7/8 test files

# Single phase
node test/phase2-integration.js
node test/phase3-scoring.js
node test/phase5-player.js
node test/phase6-unscored.js
node test/phase7-analytics.js
node test/phase8-admin.js

# Full browser E2E suite via Playwright (requires dev server running)
npm run test:e2e
```

**After any code change: run the relevant test phase(s) and confirm all assertions pass before considering the task done.**

Environment variables (`.env`, never committed):
- `PORT` (default 3000), `HOST` (default localhost)
- `ADMIN_PASSWORD` (default `admin123`)
- `VERCEL_TOKEN`, `DOCKER_TOKEN`, `DOCKER_USER`, `RENDER_API_KEY`

## Architecture

Single Node.js process (`server.js`) hosts both Next.js and a WebSocket server on the same port:

```
HTTP /api/*  →  inline API router (server.js)  →  GameEngine
HTTP /*      →  Next.js App Router (Turbopack)
WS   /ws     →  socketServer → router → GameEngine
```

**Critical WS upgrade handling**: `server.on('upgrade')` only handles `/ws` paths. For all other paths (e.g. `/_next/webpack-hmr`), it does nothing — Next.js registers its own upgrade listener and handles HMR itself. Calling `socket.destroy()` here would kill Turbopack's HMR connection, blocking React hydration.

### Engine layer (`lib/engine/`)

`GameEngine.js` is a singleton with all in-memory session state (`Map<pin, GameSession>`). Key invariants:
- All mutations are synchronous (no `await` gaps in critical sections)
- Engine never imports `ws` — a broadcast callback is injected by `socketServer.js` via `setBroadcast()`
- Quiz catalog (`data/quizzes/*.json`) is loaded once at startup; hot-reloadable via `engine.reloadQuiz(quiz)`

**State machine** (`stateMachine.js`) enforces legal transitions:
```
LOBBY → SLIDE | QUESTION_READING | FINISHED
SLIDE → SLIDE | QUESTION_READING | FINISHED
QUESTION_READING → QUESTION_ACTIVE | PAUSED
QUESTION_ACTIVE → RESULTS | PAUSED
RESULTS → LEADERBOARD | SLIDE | QUESTION_READING | FINISHED
LEADERBOARD → SLIDE | QUESTION_READING | FINISHED
FINISHED → (none)
```

`host:skip` transitions: SLIDE→advanceItem, QUESTION_READING→QUESTION_ACTIVE, QUESTION_ACTIVE→RESULTS.  
`host:next_item` is only legal from RESULTS, LEADERBOARD, SLIDE, LOBBY.

There is a 5-second reading phase (`setTimeout` in `beginQuestion`) before QUESTION_READING auto-advances to QUESTION_ACTIVE. `host:skip` bypasses it.

For scored item types, RESULTS auto-transitions to LEADERBOARD after 100ms. Unscored types (poll, wordcloud, brainstorm, openended) skip LEADERBOARD entirely.

### WebSocket layer (`lib/ws/`)

- `contracts.js` — Zod schemas for every client event; all payloads validated before reaching the engine
- `socketServer.js` — in-memory registry `Map<pin, { host: WebSocket, players: Map<socketId, WebSocket> }>`; implements `broadcast(pin, event, payload, target)` where target is `'HOST'`, `'PLAYERS'`, `'ALL'`, or `'SOCKET:<id>'`
- `router.js` — dispatches validated events to engine; handles `client:join` reconnect logic

**Anti-cheat**: `broadcastStateSync` sends two different payloads — hosts get `item` with full question data; players get `playerView(item)` which strips `text`, `correctIndices`, `correctIndex`, `acceptedAnswers`, `correctValue`, `correctOrder`. Player state_sync carries `item` (not `currentItem`).

**Two state_sync event names**: The router's initial join response uses `server:state_sync`; engine broadcasts also use `server:state_sync`. Tests and client code must handle both (they're actually the same name now — but old tests checked both `state_sync` and `server:state_sync` due to earlier naming drift).

### Frontend (`app/`, `hooks/`)

All interactive pages use `hooks/useGameSocket.ts`. It:
- Connects to `ws[s]://<host>/ws` (auto-selects wss in production)
- Sends `client:join` on open
- Merges all `server:*` events into a single `state` object via `handleServerEvent`
- Re-connects only when `pin` or `role` changes (not on nickname changes)

The host dashboard (`app/host/[pin]/page.tsx`) and player client (`app/play/page.tsx`) both consume `{ state, send, connected }` from this hook.

### Data persistence

- `data/quizzes/` — source-of-truth quiz JSON, hand-editable, hot-reloaded via admin UI
- `data/snapshots/` — gitignored; per-session JSON snapshots written after every state change via a serialized write queue (`SnapshotService.js`)
- `data/reports/` — gitignored; JSON + CSV reports written after `finishGame()` via `ReportBuilder.js`

### Question types

Scored: `quiz`, `truefalse`, `typeAnswer` (Levenshtein ≤ 1 fuzzy match), `slider` (proximity accuracy), `puzzle` (exact order).  
Unscored: `poll`, `wordcloud`, `brainstorm` (two sub-phases: COLLECT → VOTE), `openended`.  
Special: `SLIDE` (display-only, no answer phase).

Scoring: `basePoints = round(multiplier × 1000 × max(0, 1 − t / 2T))`. Streak bonuses: 2→+100, 3→+200, 4→+300, 5+→+500.

### Test conventions

Phase tests are plain Node.js scripts (no test framework) that talk directly to the live server via `http` and `ws` modules. Each file manages its own session lifecycle. The E2E browser suite (`test/e2e-browser.js`) uses Playwright with `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` as the executable.

When driving a game without players in tests: use `host:skip` twice per question to advance QUESTION_READING → QUESTION_ACTIVE → RESULTS (all-answered auto-advance never fires with 0 players). The test must also send `host:next_item` to advance past RESULTS/LEADERBOARD.
