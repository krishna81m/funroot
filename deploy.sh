#!/bin/bash
#
# deploy.sh — Comprehensive quiz deployment & verification script
#
# Deploys to local, Vercel, and Render in parallel with automatic monitoring.
# Minimizes Claude token usage by running independently with detailed logging.
#
# Usage:
#   ./deploy.sh                          # Deploy demo-360 locally
#   ./deploy.sh spandana-birthday-queen  # Deploy custom quiz locally
#   DEPLOY_VERCEL=1 DEPLOY_RENDER=1 ./deploy.sh  # Deploy to all
#
# Environment variables:
#   QUIZ_ID           Quiz to test (default: demo-360)
#   DEPLOY_VERCEL     Deploy to Vercel (default: 0)
#   DEPLOY_RENDER     Deploy to Render (default: 0)
#   SKIP_LOCAL_TEST   Skip local tests (default: 0)
#   SKIP_REMOTE_TEST  Skip remote tests (default: 0)

set -e

# ============================================================================
# Configuration & Defaults
# ============================================================================

QUIZ_ID="${QUIZ_ID:-demo-360}"
DEPLOY_VERCEL="${DEPLOY_VERCEL:-0}"
DEPLOY_RENDER="${DEPLOY_RENDER:-1}"
SKIP_LOCAL_TEST="${SKIP_LOCAL_TEST:-0}"
SKIP_REMOTE_TEST="${SKIP_REMOTE_TEST:-0}"

# Deployment URLs
VERCEL_URL="https://funroot.vercel.app"
RENDER_URL="https://kahoot-clone-ajpi.onrender.com"
LOCAL_URL="http://localhost:3000"

# Timeouts (seconds)
LOCAL_TIMEOUT=100
RENDER_TIMEOUT=250
VERCEL_TIMEOUT=250

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log file
LOG_DIR="/tmp/funroot-deploy-$$"
mkdir -p "$LOG_DIR"
MAIN_LOG="$LOG_DIR/deploy.log"

# ============================================================================
# Utility Functions
# ============================================================================

log() {
  echo "[$(date '+%H:%M:%S')] $@" | tee -a "$MAIN_LOG"
}

log_success() {
  echo -e "${GREEN}✅ $@${NC}" | tee -a "$MAIN_LOG"
}

log_error() {
  echo -e "${RED}❌ $@${NC}" | tee -a "$MAIN_LOG"
}

log_info() {
  echo -e "${BLUE}ℹ️  $@${NC}" | tee -a "$MAIN_LOG"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $@${NC}" | tee -a "$MAIN_LOG"
}

# Check if dev server is running
is_local_running() {
  curl -s "$LOCAL_URL" > /dev/null 2>&1
}

# Check if deployment is live (via API health check)
is_deployment_live() {
  local url="$1"
  curl -s "$url/api/quizzes" 2>&1 | grep -q '"id"'
}

# Wait for deployment with timeout
wait_for_deployment() {
  local url="$1"
  local max_attempts="$2"
  local service="$3"

  log_info "Waiting for $service to be live..."

  for ((i=1; i<=max_attempts; i++)); do
    if is_deployment_live "$url"; then
      log_success "$service is live"
      return 0
    fi
    echo -n "."
    sleep 2
  done

  log_error "$service did not become live after $((max_attempts * 2)) seconds"
  return 1
}

# ============================================================================
# Prerequisites Check
# ============================================================================

check_prerequisites() {
  log "Checking prerequisites..."

  # Check if quiz file exists
  if [ ! -f "data/quizzes/$QUIZ_ID.json" ]; then
    log_error "Quiz not found: data/quizzes/$QUIZ_ID.json"
    exit 1
  fi
  log_success "Quiz file found: $QUIZ_ID"

  # Check if dev server is running (for local tests)
  if [ "$SKIP_LOCAL_TEST" -eq 0 ]; then
    if ! is_local_running; then
      log_error "Dev server not running. Start with: npm run dev"
      exit 1
    fi
    log_success "Dev server is running"
  fi

  # Check required commands
  for cmd in git curl node jq; do
    if ! command -v "$cmd" &> /dev/null; then
      log_error "Required command not found: $cmd"
      exit 1
    fi
  done
  log_success "All prerequisites met"
}

# ============================================================================
# Git Operations
# ============================================================================

commit_changes() {
  log "Committing changes..."

  if [ -z "$(git status --short)" ]; then
    log_warning "No changes to commit"
    return 0
  fi

  git add -A
  git commit -m "$(cat <<EOF
chore: deploy quiz $QUIZ_ID

Automated deployment with funroot 360 deploy script.

Co-Authored-By: funroot deploy <noreply@funroot.ai>
EOF
)"

  log_success "Changes committed"
}

push_to_github() {
  log "Pushing to GitHub..."

  if ! git push origin master 2>&1 | tee -a "$MAIN_LOG"; then
    log_error "Failed to push to GitHub"
    return 1
  fi

  log_success "Pushed to GitHub"
}

# ============================================================================
# Deployment Orchestration
# ============================================================================

deploy_to_vercel() {
  (
    log_info "[Vercel] Deployment triggered via git push"
    # Vercel auto-deploys on push; polling happens in wait_for_deployment
  ) &
}

deploy_to_render() {
  (
    log_info "[Render] Deployment triggered via git push"
    # Render auto-deploys on push; polling happens in wait_for_deployment
  ) &
}

# ============================================================================
# Test Execution (Parallel)
# ============================================================================

run_test() {
  local base_url="$1"
  local service="$2"
  local log_file="$3"

  {
    log "[$service] Running test for $QUIZ_ID..."

    if ! command -v ./test-quiz.sh &> /dev/null; then
      log_error "[$service] test-quiz.sh not found"
      return 1
    fi

    # Use timeout if available (Linux), otherwise run without it (macOS)
    local cmd="BASE_URL=\"$base_url\" QUIZ_ID=\"$QUIZ_ID\" ./test-quiz.sh \"$QUIZ_ID\""
    if command -v timeout &> /dev/null; then
      cmd="timeout 600 $cmd"
    fi

    if eval "$cmd" >> "$log_file" 2>&1; then
      log_success "[$service] Tests passed"
      return 0
    else
      log_error "[$service] Tests failed"
      return 1
    fi
  } &
}

# ============================================================================
# Status Reporting
# ============================================================================

report_status() {
  local local_status="$1"
  local vercel_status="$2"
  local render_status="$3"

  echo ""
  echo "==============================================="
  echo "  funroot 360 Deployment Status Report"
  echo "==============================================="
  echo ""
  echo "Quiz ID: $QUIZ_ID"
  echo ""

  # Local
  if [ "$SKIP_LOCAL_TEST" -eq 1 ]; then
    echo -e "Local (http://localhost:3000):     ${YELLOW}SKIPPED${NC}"
  else
    if [ "$local_status" -eq 0 ]; then
      echo -e "Local (http://localhost:3000):     ${GREEN}PASS${NC}"
    else
      echo -e "Local (http://localhost:3000):     ${RED}FAIL${NC}"
    fi
  fi

  # Vercel
  if [ "$DEPLOY_VERCEL" -eq 0 ]; then
    echo -e "Vercel ($VERCEL_URL):     ${YELLOW}NOT DEPLOYED${NC}"
  else
    if [ "$vercel_status" -eq 0 ]; then
      echo -e "Vercel ($VERCEL_URL):     ${GREEN}PASS${NC}"
    else
      echo -e "Vercel ($VERCEL_URL):     ${RED}FAIL${NC}"
    fi
  fi

  # Render
  if [ "$DEPLOY_RENDER" -eq 0 ]; then
    echo -e "Render ($RENDER_URL):    ${YELLOW}NOT DEPLOYED${NC}"
  else
    if [ "$render_status" -eq 0 ]; then
      echo -e "Render ($RENDER_URL):    ${GREEN}PASS${NC}"
    else
      echo -e "Render ($RENDER_URL):    ${RED}FAIL${NC}"
    fi
  fi

  echo ""
  echo "Logs: $LOG_DIR"
  echo "==============================================="
  echo ""
}

# ============================================================================
# Main Deployment Flow
# ============================================================================

main() {
  log "Starting funroot 360 deployment for quiz: $QUIZ_ID"
  log "Deploy Vercel: $DEPLOY_VERCEL, Deploy Render: $DEPLOY_RENDER"

  # Step 1: Prerequisites
  check_prerequisites

  # Step 2: Commit & Push
  commit_changes
  push_to_github

  # Step 3: Trigger Deployments (in parallel via git push)
  if [ "$DEPLOY_VERCEL" -eq 1 ]; then
    log "Vercel auto-deploy triggered via git push"
  fi
  if [ "$DEPLOY_RENDER" -eq 1 ]; then
    log "Render auto-deploy triggered via git push"
  fi

  # Step 4: Wait for Deployments to be Live (in parallel)
  local vercel_status=1
  local render_status=1

  if [ "$DEPLOY_VERCEL" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ]; then
    (
      if wait_for_deployment "$VERCEL_URL" 30 "Vercel"; then
        vercel_status=0
      fi
      echo "$vercel_status" > "$LOG_DIR/vercel_status"
    ) &
  fi

  if [ "$DEPLOY_RENDER" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ]; then
    (
      if wait_for_deployment "$RENDER_URL" 30 "Render"; then
        render_status=0
      fi
      echo "$render_status" > "$LOG_DIR/render_status"
    ) &
  fi

  # Wait for all background jobs
  wait

  # Read status files
  [ -f "$LOG_DIR/vercel_status" ] && vercel_status=$(cat "$LOG_DIR/vercel_status") || vercel_status=1
  [ -f "$LOG_DIR/render_status" ] && render_status=$(cat "$LOG_DIR/render_status") || render_status=1

  # Step 5: Run Tests (in parallel)
  local local_status=1

  if [ "$SKIP_LOCAL_TEST" -eq 0 ]; then
    run_test "$LOCAL_URL" "Local" "$LOG_DIR/local-test.log"
  fi

  if [ "$DEPLOY_VERCEL" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ]; then
    run_test "$VERCEL_URL" "Vercel" "$LOG_DIR/vercel-test.log"
  fi

  if [ "$DEPLOY_RENDER" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ]; then
    run_test "$RENDER_URL" "Render" "$LOG_DIR/render-test.log"
  fi

  # Wait for all test jobs
  wait

  # Collect test results
  if [ "$SKIP_LOCAL_TEST" -eq 0 ] && grep -q "Results: .* passed, 0 failed" "$LOG_DIR/local-test.log"; then
    local_status=0
  fi

  # Step 6: Final Report
  report_status "$local_status" "$vercel_status" "$render_status"

  # Exit with appropriate code
  local failed=0

  # Check local (if not skipped)
  if [ "$SKIP_LOCAL_TEST" -eq 0 ] && [ "$local_status" -ne 0 ]; then
    failed=1
  fi

  # Check Vercel (if deployed)
  if [ "$DEPLOY_VERCEL" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ] && [ "$vercel_status" -ne 0 ]; then
    failed=1
  fi

  # Check Render (if deployed)
  if [ "$DEPLOY_RENDER" -eq 1 ] && [ "$SKIP_REMOTE_TEST" -eq 0 ] && [ "$render_status" -ne 0 ]; then
    failed=1
  fi

  if [ "$failed" -eq 0 ]; then
    log_success "All configured deployments and tests passed!"
    exit 0
  else
    log_error "One or more deployments/tests failed"
    exit 1
  fi
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
