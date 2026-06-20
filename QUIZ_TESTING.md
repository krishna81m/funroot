# Quiz Testing Guide

## Quick Start

Test any quiz on any environment with the `test-quiz.sh` helper:

```bash
# Local environment (default: http://localhost:3000, default quiz: demo-360)
./test-quiz.sh demo-360
./test-quiz.sh spandana-birthday-queen
./test-quiz.sh marriage-survival-guide-birthday

# Remote environment (Render)
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh demo-360
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh spandana-birthday-queen
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh marriage-survival-guide-birthday
```

Or use `node test/e2e-browser.js` directly with environment variables:

```bash
QUIZ_ID=spandana-birthday-queen node test/e2e-browser.js
BASE_URL=https://kahoot-clone-ajpi.onrender.com QUIZ_ID=marriage-survival-guide-birthday node test/e2e-browser.js
```

## Available Quizzes

### 1. **demo-360** (10 items, reference implementation)
   - 2 slides + 8 questions
   - 5 scored (quiz, truefalse, typeAnswer, slider, puzzle)
   - 3 unscored (poll, wordcloud, brainstorm, openended)
   - **Test result**: 89 assertions (includes demo-360-specific answer sequence checks)

### 2. **spandana-birthday-queen** (31 items, long quiz)
   - 5 slides + 26 questions
   - 20 scored (all `quiz` type)
   - 7 unscored (all `poll` type)
   - **Test result**: 71 assertions (generic checks only)

### 3. **marriage-survival-guide-birthday** (32 items, longest quiz)
   - 1 slide + 31 questions
   - 30 scored (all `quiz` type with custom host reveals)
   - 1 unscored (none — all questions are scored)
   - **Test result**: 71 assertions (generic checks only)

## Test Results Interpretation

### Demo-360 (89 assertions)
Suite 8 includes **demo-360-specific assertions**:
- Q1 answer sequence: Alice (Jupiter+Saturn) correct+fastest, Bob correct+slower, Charlie (Mars) wrong
- Q2 streak bonus: Alice streak=2 after 2 consecutive correct
- Leaderboard positions and scores after Q1 and final
- All 3 players have distinct final scores

### Spandana & Marriage Quizzes (71 assertions)
Suite 8 runs **generic assertions** only (no quiz-specific expectations):
- Player count and event isolation
- Leaderboard structure (3 players in final leaderboard)
- Final scores in descending order
- No assumptions about specific Q1 answers or scores

## Running Tests

### Start Dev Server
```bash
npm run dev    # Starts on http://localhost:3000
```

### Run Full Suite (Local)
```bash
./test-quiz.sh                                      # demo-360
./test-quiz.sh spandana-birthday-queen
./test-quiz.sh marriage-survival-guide-birthday
```

### Run Full Suite (Render)
```bash
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh demo-360
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh spandana-birthday-queen
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh marriage-survival-guide-birthday
```

## What Each Suite Tests

| Suite | Name | Quiz-Agnostic? | Notes |
|-------|------|---|---|
| 1 | HTTP + API Smoke | ✅ Yes | Tests all 3 endpoints with any quiz |
| 2 | Home Page | ✅ Yes | UI hydration, quiz card loading |
| 3 | Host Flow | ✅ Yes | Create session, lobby, start game |
| 4 | Multiplayer (3 players) | ✅ Yes | Join screen, game state, browser rendering |
| 5 | Admin Page | ✅ Yes | Login, quiz builder |
| 6 | Report API | ✅ Yes | JSON & CSV report generation |
| 7 | WebSocket Health | ✅ Yes | Anti-cheat, state sync |
| 8 | Multi-Player Scoring | ⚠️ Conditional | Demo-360: specific answer checks; Others: generic only |
| 9 | Mid-Game Join + Comment + Attribution | ✅ Yes | Late joins, comments, attribution broadcast |

## Timeout Behavior

**WS_TIMEOUT** (per-question round-trip):
- Local: 10 seconds
- Remote: 25 seconds

**Suite 8 Timeout** = WS_TIMEOUT × 10
- Local: ~100 seconds
- Remote: ~250 seconds
- Accommodates quizzes with 30+ items

## Adding a New Quiz

1. Create `data/quizzes/<quiz-id>.json` with standard schema
2. Test locally:
   ```bash
   ./test-quiz.sh <quiz-id>
   ```
3. Push to GitHub (triggers Render auto-deploy)
4. Test on Render:
   ```bash
   BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh <quiz-id>
   ```

## Debugging Failed Tests

Check logs:
```bash
cat logs/e2e.log | grep "❌"   # Find failures
cat logs/e2e.log | tail -50   # See end of last run
```

For Render-specific issues:
- Check deploy status: `BASE_URL=https://kahoot-clone-ajpi.onrender.com node test/e2e-browser.js 2>&1 | head -20`
- Verify new quiz is loaded: `curl -s https://kahoot-clone-ajpi.onrender.com/api/quizzes | jq '.[] | .id'`
