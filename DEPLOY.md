# funroot 360 Deployment Guide

Automated deployment and testing for any quiz across local, Vercel, and Render environments.

## Quick Start

### Local Only (Default)
```bash
./deploy.sh                    # Test demo-360 locally
./deploy.sh spandana-birthday-queen  # Test custom quiz locally
```

### Deploy to All Environments
```bash
DEPLOY_VERCEL=1 DEPLOY_RENDER=1 ./deploy.sh demo-360
```

### Deploy to Render Only
```bash
DEPLOY_RENDER=1 ./deploy.sh spandana-birthday-queen
```

## How It Works

The `deploy.sh` script automates the entire deployment pipeline:

1. **Prerequisites Check** — Validates quiz file exists and dev server is running
2. **Git Commit & Push** — Commits changes and pushes to GitHub (triggers auto-deploy on Vercel/Render)
3. **Deployment Monitoring** — Waits for Vercel/Render to become live (runs in parallel)
4. **Test Execution** — Runs E2E tests on each environment (runs in parallel)
5. **Status Report** — Shows pass/fail summary with logs

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QUIZ_ID` | `demo-360` | Quiz to test (must exist in `data/quizzes/`) |
| `DEPLOY_VERCEL` | `0` | Deploy to Vercel (1=yes, 0=no) |
| `DEPLOY_RENDER` | `1` | Deploy to Render (1=yes, 0=no) |
| `SKIP_LOCAL_TEST` | `0` | Skip local tests (1=yes, 0=no) |
| `SKIP_REMOTE_TEST` | `0` | Skip remote tests (1=yes, 0=no) |

## Examples

### Test Multiple Quizzes Locally
```bash
for quiz in demo-360 spandana-birthday-queen marriage-survival-guide-birthday; do
  ./deploy.sh "$quiz"
done
```

### Deploy Specific Quiz to All Environments
```bash
DEPLOY_VERCEL=1 DEPLOY_RENDER=1 ./deploy.sh marriage-survival-guide-birthday
```

### Quick Deploy (Skip Tests)
```bash
DEPLOY_RENDER=1 SKIP_REMOTE_TEST=1 ./deploy.sh demo-360
```

### Commit & Push Only (No Deployment)
```bash
SKIP_LOCAL_TEST=1 SKIP_REMOTE_TEST=1 DEPLOY_RENDER=0 DEPLOY_VERCEL=0 ./deploy.sh
```

## Deployment URLs

| Environment | URL |
|---|---|
| Local | `http://localhost:3000` |
| Render | `https://kahoot-clone-ajpi.onrender.com` |
| Vercel | `https://funroot.vercel.app` |

## Available Quizzes

- `demo-360` — Reference implementation (10 items, all types)
- `spandana-birthday-queen` — Birthday quiz (31 items)
- `marriage-survival-guide-birthday` — Marriage jokes (32 items)

## Test Results

Each run generates a status report:

```
===============================================
  funroot 360 Deployment Status Report
===============================================

Quiz ID: demo-360

Local (http://localhost:3000):     PASS
Vercel (https://funroot.vercel.app):     PASS
Render (https://kahoot-clone-ajpi.onrender.com):    PASS

Logs: /tmp/funroot-deploy-12345
===============================================
```

- **PASS** — All E2E tests passed (89/89 for demo-360, 71/71 for custom)
- **FAIL** — One or more tests failed
- **NOT DEPLOYED** — Environment not selected for deployment

## Logs

Detailed logs saved to `/tmp/funroot-deploy-<PID>/`:

- `deploy.log` — Main deployment log
- `local-test.log` — Local test output
- `vercel-test.log` — Vercel test output
- `render-test.log` — Render test output

View logs:
```bash
cat /tmp/funroot-deploy-*/deploy.log
cat /tmp/funroot-deploy-*/local-test.log | tail -100
```

## Prerequisites

**Required:**
- Dev server running: `npm run dev` (for local tests)
- Git repository with remote tracking
- Node.js 18+
- `jq` for JSON parsing

**Optional:**
- `timeout` command (macOS: not required, script handles gracefully)

## Troubleshooting

### Dev Server Not Running
```
❌ Dev server not running. Start with: npm run dev
```
**Fix:** Start the dev server in another terminal:
```bash
npm run dev
```

### Quiz File Not Found
```
❌ Quiz not found: data/quizzes/my-quiz.json
```
**Fix:** Create the quiz file first, or check the filename:
```bash
ls data/quizzes/
```

### Deployment Timeout
If Vercel/Render take >60 seconds to deploy, the script will timeout. Wait manually:
```bash
# Check Render
curl https://kahoot-clone-ajpi.onrender.com/api/quizzes | jq .

# Check Vercel
curl https://funroot.vercel.app/api/quizzes | jq .
```

### Test Failures
Check the test log for details:
```bash
cat /tmp/funroot-deploy-*/local-test.log | grep "❌"
```

## What Gets Committed

The script auto-commits changes to quiz files:

```
chore: deploy quiz $QUIZ_ID

Automated deployment with funroot 360 deploy script.
```

To review before commit, check `git status`:
```bash
git status
git diff
```

## Performance Notes

- **Local tests:** ~100 seconds (10 question × 6s average, 5s reading phase, overhead)
- **Remote wait:** ~30 seconds (average deployment time)
- **Parallel execution:** Vercel & Render deploy and test simultaneously
- **Total runtime:** ~3-5 minutes for full deployment to all environments

## Manual Deployment

If you prefer manual control:

```bash
# Local only
npm run test:e2e

# Specific quiz
QUIZ_ID=spandana-birthday-queen npm run test:e2e

# Remote
BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh demo-360
BASE_URL=https://funroot.vercel.app ./test-quiz.sh demo-360
```

## Exit Codes

- `0` — All configured deployments/tests passed
- `1` — One or more deployments/tests failed

Use in automation:
```bash
./deploy.sh demo-360 && echo "✅ Passed" || echo "❌ Failed"
```
