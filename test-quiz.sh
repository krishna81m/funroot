#!/bin/bash
# Test any quiz on any environment
# Usage:
#   ./test-quiz.sh demo-360                           # local, demo-360
#   ./test-quiz.sh spandana-birthday-queen            # local, spandana
#   BASE_URL=https://kahoot-clone-ajpi.onrender.com ./test-quiz.sh marriage-survival-guide-birthday

QUIZ_ID="${1:-demo-360}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "🎮 Kahoot! 360 Quiz Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Target: $BASE_URL"
echo "Quiz:   $QUIZ_ID"
echo ""

export QUIZ_ID
export BASE_URL

node test/e2e-browser.js
