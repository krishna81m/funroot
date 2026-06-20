/**
 * Kahoot! 360 — End-to-End Browser Regression Suite
 *
 * Drives a real Chromium/Chrome browser via Playwright to verify the full
 * golden path from the homepage through a complete game session.
 *
 * Prerequisites:
 *   npm run dev          (server must be running on localhost:3000)
 *
 * Run:
 *   node test/e2e-browser.js
 *   npm run test:e2e
 *
 * Saves failure screenshots to /tmp/kahoot-e2e-*.png for debugging.
 */

'use strict'

const path = require('path')
const fs   = require('fs')

// ── Playwright resolution ─────────────────────────────────────────────────────
// Try local node_modules first (installed via npm), then fall back to the
// npx cache so the suite works even if playwright isn't in package.json yet.
let playwright
const localPw = path.join(process.cwd(), 'node_modules/playwright')
if (fs.existsSync(localPw)) {
  playwright = require(localPw)
} else {
  const { execSync } = require('child_process')
  const caches = [
    path.join(process.env.HOME, '.npm/_npx'),
  ]
  for (const base of caches) {
    if (!fs.existsSync(base)) continue
    const hit = fs.readdirSync(base)
      .map(d => path.join(base, d, 'node_modules/playwright'))
      .find(p => fs.existsSync(p))
    if (hit) { playwright = require(hit); break }
  }
}
if (!playwright) {
  console.error('FATAL: playwright not found. Run: npm install --save-dev playwright')
  process.exit(1)
}

const { chromium } = playwright

// ── Chrome executable ─────────────────────────────────────────────────────────
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p))
if (!CHROME) {
  console.error('FATAL: Chrome/Chromium not found. Install Google Chrome.')
  process.exit(1)
}

// ── Test harness ──────────────────────────────────────────────────────────────
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const WS_BASE = BASE.replace(/^http/, 'ws')
let pass = 0, fail = 0

// Dual console+file logging
const LOG_DIR = path.join(process.cwd(), 'logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
const logStream = fs.createWriteStream(path.join(LOG_DIR, 'e2e.log'), { flags: 'a' })
function logLine(line) { console.log(line); logStream.write(line + '\n') }
function logErr(line) { console.error(line); logStream.write(line + '\n') }

function assert(cond, msg) {
  if (cond) {
    logLine('  ✅ ' + msg)
    pass++
  } else {
    logErr('  ❌ ' + msg)
    fail++
  }
}
function eq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`)
}
function contains(str, sub, msg) {
  assert(str && str.includes(sub), `${msg} (text: ${JSON.stringify(str?.slice(0, 120))})`)
}

async function screenshot(page, label) {
  const p = `/tmp/kahoot-e2e-${label}.png`
  await page.screenshot({ path: p, fullPage: true }).catch(() => {})
  return p
}

// ── Browser factory ───────────────────────────────────────────────────────────
async function newBrowser(headless = true) {
  return chromium.launch({
    headless,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

// Wait for an element to appear with a clear error message on timeout
async function waitFor(page, selector, timeout = 8000) {
  return page.waitForSelector(selector, { timeout }).catch(() => null)
}

// ── Suite helpers ─────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: HTTP / API Smoke Tests (no browser)
// ─────────────────────────────────────────────────────────────────────────────
async function suiteSmoke() {
  logLine('\n── Suite 1: HTTP + API Smoke ──────────────────────────────')

  const pages = ['/', '/play', '/admin', '/host/new']
  for (const p of pages) {
    const res = await fetch(`${BASE}${p}`)
    eq(res.status, 200, `GET ${p} → 200`)
  }

  const quizzes = await apiGet('/api/quizzes')
  eq(quizzes.status, 200, 'GET /api/quizzes → 200')
  assert(Array.isArray(quizzes.body) && quizzes.body.length > 0, '/api/quizzes returns non-empty array')

  const session = await apiPost('/api/sessions', { quizId: 'demo-360' })
  eq(session.status, 200, 'POST /api/sessions → 200')
  assert(session.body?.pin?.length === 6, 'Session PIN is 6 digits')

  const login = await apiPost('/api/admin/login', { password: 'admin123' })
  eq(login.status, 200, 'POST /api/admin/login → 200')
  const badLogin = await apiPost('/api/admin/login', { password: 'wrong' })
  eq(badLogin.status, 401, 'POST /api/admin/login wrong password → 401')
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Home Page — Hydration + Quiz Picker
// ─────────────────────────────────────────────────────────────────────────────
async function suiteHomePage(browser) {
  logLine('\n── Suite 2: Home Page ─────────────────────────────────────')
  const page = await browser.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('hmr')) errors.push(m.text()) })

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(2000)

  const title = await page.title()
  contains(title, 'Kahoot', 'Page title contains "Kahoot"')

  // React must hydrate and fetch /api/quizzes
  const quizCard = await waitFor(page, 'text=Kahoot! 360 Demo')
  assert(quizCard !== null, 'Quiz card "Kahoot! 360 Demo" appears after hydration')

  const hostBtn = await waitFor(page, 'text=Host →')
  assert(hostBtn !== null, '"Host →" button is visible')

  const pinInput = await waitFor(page, 'input[placeholder="Enter PIN"]')
  assert(pinInput !== null, 'PIN input field is present')

  // Filter known browser-infrastructure 404s (favicon, etc.) that don't affect functionality
  const realErrors = errors.filter(e => !e.includes('404') && !e.includes('favicon'))
  assert(realErrors.length === 0, `No JS errors on home page (errors: ${realErrors.join(', ') || 'none'})`)

  await screenshot(page, 'home')
  await page.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Host Flow — Create Session → Lobby
// ─────────────────────────────────────────────────────────────────────────────
async function suiteHostFlow(browser) {
  logLine('\n── Suite 3: Host Flow ─────────────────────────────────────')
  const page = await browser.newPage()

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(2000)

  await waitFor(page, 'text=Host →')
  await page.locator('text=Host →').first().click()

  // Should land on /host/<PIN>
  await page.waitForURL(/\/host\/\d{6}/, { timeout: 10000 })
  const url = page.url()
  const pin = url.match(/\/host\/(\d{6})/)?.[1]
  assert(pin?.length === 6, `Redirected to /host/<PIN> (pin=${pin})`)

  // Lobby screen
  const lobbyStatus = await waitFor(page, 'text=LOBBY')
  assert(lobbyStatus !== null, 'LOBBY status badge visible')

  const startBtn = await waitFor(page, 'text=Start Game')
  assert(startBtn !== null, '"Start Game" button present')

  const joinText = await waitFor(page, 'text=localhost:3000/play')
  assert(joinText !== null, 'Join URL shown to host')

  // PIN displayed to players
  const pinDisplay = await page.locator(`text=${pin}`).first().isVisible().catch(() => false)
  assert(pinDisplay, `PIN ${pin} displayed on lobby screen`)

  await screenshot(page, 'lobby')
  await page.close()
  return pin
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Multiplayer Flow — Host + Player + Game Start
// ─────────────────────────────────────────────────────────────────────────────
async function suiteMultiplayer(browser) {
  logLine('\n── Suite 4: Multiplayer Flow ──────────────────────────────')

  const hostPage   = await browser.newPage()
  const playerPage = await browser.newPage()

  // 1. Host navigates to home and hosts a game
  await hostPage.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 })
  await hostPage.waitForTimeout(1500)
  await waitFor(hostPage, 'text=Host →')
  await hostPage.locator('text=Host →').first().click()
  await hostPage.waitForURL(/\/host\/\d{6}/, { timeout: 10000 })

  const pin = hostPage.url().match(/\/host\/(\d{6})/)?.[1]
  assert(pin?.length === 6, `Host created session PIN=${pin}`)

  // 2. Player navigates to /play and joins
  await playerPage.goto(`${BASE}/play`, { waitUntil: 'networkidle', timeout: 15000 })
  const pinField = await waitFor(playerPage, 'input[placeholder*="PIN"], input[placeholder*="pin"], input[type="tel"], input[type="text"]')
  assert(pinField !== null, 'Player sees PIN input on /play')

  // Fill PIN
  await playerPage.locator('input').first().fill(pin)

  // Fill nickname
  const nicknameField = await waitFor(playerPage, 'input[placeholder*="nick"], input[placeholder*="name"], input[placeholder*="Name"]', 3000)
  if (nicknameField) {
    await nicknameField.fill('TestPlayer')
  } else {
    // Some forms show nickname after PIN entry
    const allInputs = await playerPage.locator('input').all()
    if (allInputs.length >= 2) await allInputs[1].fill('TestPlayer')
  }

  // Submit join form
  const joinBtn = await waitFor(playerPage, 'button:has-text("Join"), button:has-text("join")', 3000)
  if (joinBtn) await joinBtn.click()

  await playerPage.waitForTimeout(2000)
  await screenshot(playerPage, 'player-joined')

  // 3. Player should be in lobby / waiting state
  const playerText = await playerPage.evaluate(() => document.body.innerText)
  const playerInGame = playerText.includes('TestPlayer') || playerText.includes('Wait') ||
                       playerText.includes('lobby') || playerText.includes('Lobby') ||
                       playerText.includes('Starting')
  assert(playerInGame, 'Player page shows waiting/lobby state after join')

  // 4. Host should see 1 player in lobby
  await hostPage.waitForTimeout(2000)
  const hostText = await hostPage.evaluate(() => document.body.innerText)
  const hostSeesPlayer = hostText.includes('1 player') || hostText.includes('TestPlayer')
  assert(hostSeesPlayer, `Host lobby shows player joined (text: ${hostText.slice(0, 200)})`)

  await screenshot(hostPage, 'host-with-player')

  // 5. Host starts the game
  const startBtn = await waitFor(hostPage, 'button:has-text("Start Game")')
  assert(startBtn !== null, '"Start Game" button available')
  await startBtn.click()
  await hostPage.waitForTimeout(3000)

  // 6. Host should now show a question or slide
  const hostAfterStart = await hostPage.evaluate(() => document.body.innerText)
  const hostShowsQuestion = hostAfterStart.includes('SLIDE') || hostAfterStart.includes('QUESTION') ||
                            hostAfterStart.includes('Welcome') || hostAfterStart.includes('Ready') ||
                            hostAfterStart.includes('Skip') || hostAfterStart.includes('Next')
  assert(hostShowsQuestion, 'Host shows first item after game start')

  await screenshot(hostPage, 'host-game-started')
  await screenshot(playerPage, 'player-game-started')

  // 7. Player should see a question widget or slide
  const playerAfterStart = await playerPage.evaluate(() => document.body.innerText)
  const playerShowsContent = playerAfterStart.length > 20 &&
    !playerAfterStart.includes('Enter PIN') &&
    !playerAfterStart.includes('Enter pin')
  assert(playerShowsContent, 'Player sees game content (not still on join screen)')

  await hostPage.close()
  await playerPage.close()
  return pin
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Admin Page — Login + Quiz List
// ─────────────────────────────────────────────────────────────────────────────
async function suiteAdmin(browser) {
  logLine('\n── Suite 5: Admin Page ────────────────────────────────────')
  const page = await browser.newPage()

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 15000 })
  await page.waitForTimeout(1000)

  const adminText = await page.evaluate(() => document.body.innerText)
  contains(adminText, 'Admin', 'Admin page renders')

  // Fill password and login
  const pwInput = await waitFor(page, 'input[type="password"], input[placeholder*="assword"]')
  if (pwInput) {
    await pwInput.fill('admin123')
    const loginBtn = await waitFor(page, 'button:has-text("Login"), button:has-text("login"), button[type="submit"]', 3000)
    if (loginBtn) await loginBtn.click()
    await page.waitForTimeout(2000)
    const afterLogin = await page.evaluate(() => document.body.innerText)
    const loggedIn = afterLogin.includes('New Quiz') || afterLogin.includes('demo-360') ||
                     afterLogin.includes('Kahoot') || afterLogin.includes('Quiz')
    assert(loggedIn, 'Admin login succeeds and shows quiz dashboard')
    await screenshot(page, 'admin-dashboard')
  } else {
    // Already logged in or different flow
    const alreadyIn = adminText.includes('New Quiz') || adminText.includes('Quiz')
    assert(alreadyIn, 'Admin page shows content')
  }

  // New quiz page
  await page.goto(`${BASE}/admin/quiz/new`, { waitUntil: 'networkidle', timeout: 10000 })
  await page.waitForTimeout(1000)
  const newQuizText = await page.evaluate(() => document.body.innerText)
  const hasBuilder = newQuizText.includes('Quiz') || newQuizText.includes('Add Item') || newQuizText.includes('Save')
  assert(hasBuilder, '/admin/quiz/new renders quiz builder')

  await page.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Report Download — API returns JSON + CSV after game
// ─────────────────────────────────────────────────────────────────────────────
async function suiteReport() {
  logLine('\n── Suite 6: Report API ────────────────────────────────────')

  // Create a session and finish it via API (reuse phase7 approach)
  const ws = require('ws')

  const sessionRes = await apiPost('/api/sessions', { quizId: 'demo-360' })
  const pin = sessionRes.body?.pin
  assert(pin?.length === 6, `Created session for report test (pin=${pin})`)
  if (!pin) return

  // Drive through all 10 items via timed commands (mirrors phase7 approach)
  await new Promise((resolve, reject) => {
    const hostWs = new ws.WebSocket(`${WS_BASE}/ws`)

    function send(event) {
      hostWs.send(JSON.stringify({ event, payload: { pin } }))
    }

    hostWs.on('open', () => {
      hostWs.send(JSON.stringify({ event: 'client:join', payload: { pin, role: 'HOST' } }))
    })

    let started = false
    hostWs.on('message', (raw) => {
      const { event, payload } = JSON.parse(raw)
      const isSync = event === 'state_sync' || event === 'server:state_sync'
      if (isSync && payload?.status === 'LOBBY' && !started) {
        started = true
        // Fire a sequence of commands to advance through all 10 items.
        // Pattern per scored question: skip (→ ACTIVE), next_item (→ RESULTS), next_item (→ LB), next_item (→ next)
        // Pattern per SLIDE: next_item
        // Pattern per unscored question: skip, next_item (no leaderboard)
        // With no players, submitAnswer never fires so we manually skip each
        // question: QUESTION_READING → skip → QUESTION_ACTIVE → skip → RESULTS → next_item
        // Scored items auto-transition RESULTS→LEADERBOARD after 100ms; we wait 250ms then next_item
        // Unscored items stay in RESULTS; just call next_item directly
        const T = 200 // base spacing (ms)
        const cmds = [
          [T*0.5, 'host:start'],     // LOBBY → SLIDE (item 0)
          [T*1.5, 'host:next_item'], // SLIDE → QR (item 1: quiz, scored)
          [T*2.5, 'host:skip'],      // QR → QA
          [T*3.5, 'host:skip'],      // QA → RESULTS → auto LEADERBOARD after 100ms
          [T*5.5, 'host:next_item'], // LEADERBOARD → QR (item 2: truefalse, scored)
          [T*6.5, 'host:skip'],
          [T*7.5, 'host:skip'],
          [T*9.5, 'host:next_item'], // LB → QR (item 3: typeAnswer, scored)
          [T*10.5,'host:skip'],
          [T*11.5,'host:skip'],
          [T*13.5,'host:next_item'], // LB → QR (item 4: slider, scored)
          [T*14.5,'host:skip'],
          [T*15.5,'host:skip'],
          [T*17.5,'host:next_item'], // LB → QR (item 5: puzzle, scored)
          [T*18.5,'host:skip'],
          [T*19.5,'host:skip'],
          [T*21.5,'host:next_item'], // LB → QR (item 6: poll, UNSCORED)
          [T*22.5,'host:skip'],
          [T*23.5,'host:skip'],      // QA → RESULTS (no auto-LB for unscored)
          [T*24.5,'host:next_item'], // RESULTS → QR (item 7: wordcloud, UNSCORED)
          [T*25.5,'host:skip'],
          [T*26.5,'host:skip'],
          [T*27.5,'host:next_item'], // RESULTS → QR (item 8: brainstorm, UNSCORED)
          [T*28.5,'host:skip'],
          [T*29.5,'host:skip'],
          [T*30.5,'host:next_item'], // RESULTS → QR (item 9: openended, UNSCORED)
          [T*31.5,'host:skip'],
          [T*32.5,'host:skip'],
          [T*33.5,'host:next_item'], // RESULTS → FINISHED (no more items)
        ]
        cmds.forEach(([delay, ev]) => setTimeout(() => send(ev), delay))
      }
      if (isSync && payload?.status === 'FINISHED') {
        hostWs.close()
        resolve()
      }
    })
    hostWs.on('error', e => reject(e))
    setTimeout(() => { hostWs.close(); reject(new Error('report game timeout')) }, 15000)
  })

  // Give report builder time to write files
  await new Promise(r => setTimeout(r, 1000))

  const jsonReport = await fetch(`${BASE}/api/report/${pin}/json`)
  eq(jsonReport.status, 200, `GET /api/report/${pin}/json → 200`)
  const ct = jsonReport.headers.get('content-type') || ''
  assert(ct.includes('json'), 'JSON report has correct content-type')

  const csvReport = await fetch(`${BASE}/api/report/${pin}/csv`)
  eq(csvReport.status, 200, `GET /api/report/${pin}/csv → 200`)
  const csvCt = csvReport.headers.get('content-type') || ''
  assert(csvCt.includes('csv') || csvCt.includes('text'), 'CSV report has correct content-type')
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: WebSocket Health — Connection, Anti-Cheat Projection
// ─────────────────────────────────────────────────────────────────────────────
async function suiteWebSocket() {
  logLine('\n── Suite 7: WebSocket Health ──────────────────────────────')
  const ws = require('ws')

  const sessionRes = await apiPost('/api/sessions', { quizId: 'demo-360' })
  const pin = sessionRes.body?.pin
  assert(pin?.length === 6, `Created session for WS test (pin=${pin})`)
  if (!pin) return

  // Connect host and player simultaneously
  const [hostState, playerState] = await Promise.all([
    new Promise((resolve, reject) => {
      const sock = new ws.WebSocket(`${WS_BASE}/ws`)
      sock.on('open', () => sock.send(JSON.stringify({ event: 'client:join', payload: { pin, role: 'HOST' } })))
      sock.on('message', data => {
        const msg = JSON.parse(data)
        if (msg.event === 'state_sync' || msg.event === 'server:state_sync') { sock.close(); resolve(msg.payload) }
      })
      sock.on('error', reject)
      setTimeout(() => reject(new Error('WS timeout')), 5000)
    }),
    new Promise((resolve, reject) => {
      const sock = new ws.WebSocket(`${WS_BASE}/ws`)
      sock.on('open', () => sock.send(JSON.stringify({ event: 'client:join', payload: { pin, role: 'PLAYER', nickname: 'WSTestPlayer' } })))
      sock.on('message', data => {
        const msg = JSON.parse(data)
        if (msg.event === 'state_sync' || msg.event === 'server:state_sync') { sock.close(); resolve(msg.payload) }
      })
      sock.on('error', reject)
      setTimeout(() => reject(new Error('WS timeout')), 5000)
    }),
  ])

  assert(hostState?.status === 'LOBBY', 'Host receives LOBBY state_sync')
  assert(playerState?.status === 'LOBBY', 'Player receives LOBBY state_sync')
  assert(Array.isArray(hostState?.players), 'Host state includes players array')

  // Anti-cheat: player view must not contain correct answer fields on a question
  await new Promise((resolve, reject) => {
    const hostSock = new ws.WebSocket(`${WS_BASE}/ws`)
    const playerSock = new ws.WebSocket(`${WS_BASE}/ws`)
    let hostReady = false, playerReady = false, started = false, checked = false

    function send(sock, event) {
      sock.send(JSON.stringify({ event, payload: { pin } }))
    }
    function tryStart() {
      if (hostReady && playerReady && !started) {
        started = true
        send(hostSock, 'host:start')
      }
    }

    hostSock.on('open', () => {
      hostSock.send(JSON.stringify({ event: 'client:join', payload: { pin, role: 'HOST' } }))
    })
    hostSock.on('message', raw => {
      const msg = JSON.parse(raw)
      if (msg.event !== 'state_sync' && msg.event !== 'server:state_sync') return
      if (msg.payload?.status === 'LOBBY' && !hostReady) { hostReady = true; tryStart() }
      // Advance: SLIDE → QR, then QR → QA (skip reading phase so player gets currentItem fast)
      if (msg.payload?.status === 'SLIDE') send(hostSock, 'host:next_item')
      if (msg.payload?.status === 'QUESTION_READING') send(hostSock, 'host:skip')
    })

    playerSock.on('open', () => {
      playerSock.send(JSON.stringify({ event: 'client:join', payload: { pin, role: 'PLAYER', nickname: 'AntiCheatBot' } }))
    })
    playerSock.on('message', raw => {
      const msg = JSON.parse(raw)
      if (msg.event !== 'state_sync' && msg.event !== 'server:state_sync') return
      if (msg.payload?.status === 'LOBBY' && !playerReady) { playerReady = true; tryStart() }
      // Engine sends `item` (not `currentItem`) to players; check only during QUESTION_ACTIVE
      if (!checked && msg.payload?.status === 'QUESTION_ACTIVE' && msg.payload?.item) {
        const item = msg.payload.item
        const hasCorrectFields = 'correctIndices' in item || 'correctIndex' in item ||
                                 'acceptedAnswers' in item || 'correctValue' in item ||
                                 'correctOrder' in item
        assert(!hasCorrectFields, 'Anti-cheat: player state_sync omits correct answer fields')
        assert(!('text' in item), 'Anti-cheat: player state_sync omits question text')
        checked = true
        hostSock.close(); playerSock.close(); resolve()
      }
    })

    hostSock.on('error', e => reject(e))
    playerSock.on('error', e => reject(e))
    setTimeout(() => {
      hostSock.close(); playerSock.close()
      if (!checked) {
        assert(false, 'Anti-cheat: timed out waiting for player currentItem')
        resolve()
      }
    }, 10000)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  logLine('=== Kahoot! 360 — E2E Browser Regression Suite ===')
  logLine(`Target: ${BASE}`)
  logLine(`Browser: ${CHROME}`)

  // Verify server is up before starting
  const health = await fetch(BASE).then(r => r.status).catch(() => 0)
  if (health !== 200) {
    console.error(`\nFATAL: Server not reachable at ${BASE} (status=${health})`)
    logErr('Run: npm run dev\n')
    process.exit(1)
  }

  const browser = await newBrowser()

  try {
    await suiteSmoke()
    await suiteHomePage(browser)
    const pin1 = await suiteHostFlow(browser)
    await suiteMultiplayer(browser)
    await suiteAdmin(browser)
    await suiteReport()
    await suiteWebSocket()
  } catch (err) {
    console.error('\nFATAL ERROR:', err.message)
    fail++
  } finally {
    await browser.close()
  }

  logLine(`\n${'─'.repeat(52)}`)
  logLine(`=== Results: ${pass} passed, ${fail} failed ===`)
  if (fail > 0) {
    logLine('Failure screenshots saved to /tmp/kahoot-e2e-*.png')
  }
  process.exit(fail > 0 ? 1 : 0)
}

main()
