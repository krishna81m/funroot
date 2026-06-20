/**
 * Phase 2 integration test: 1 host + 2 players drive a full quiz question.
 * Assertions:
 *  - Player state_sync payloads never contain question text or correctIndices
 *  - Host state_sync payloads contain question text
 *  - Both players can submit answers; tally broadcasts to host
 *  - server:player_result sent only to answering player (not others)
 *  - server:results sent to host after all answers
 *  - Pause/resume cycle works
 */
const WebSocket = require('ws')
const http = require('http')

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'

let pass = 0; let fail = 0
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++ }
  else { console.error('  FAIL:', msg); fail++ }
}

function send(ws, event, payload) {
  ws.send(JSON.stringify({ event, payload }))
}

function waitForEvent(ws, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs)
    const handler = (raw) => {
      const { event, payload } = JSON.parse(raw)
      if (event === eventName) {
        clearTimeout(t)
        ws.off('message', handler)
        resolve(payload)
      }
    }
    ws.on('message', handler)
  })
}

function collectEvents(ws, durationMs) {
  const events = []
  const handler = (raw) => events.push(JSON.parse(raw))
  ws.on('message', handler)
  return new Promise((r) => setTimeout(() => { ws.off('message', handler); r(events) }, durationMs))
}

async function createSession() {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quizId: 'demo-360' }),
  })
  return (await res.json()).pin
}

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    ws.on('open', () => resolve(ws))
    ws.on('error', (e) => { console.error('WS connect error:', e.message); resolve(null) })
  })
}

async function run() {
  console.log('\n=== Phase 2: Socket Integration Test ===\n')

  const pin = await createSession()
  console.log('Session PIN:', pin)

  const host = await connect()
  const p1   = await connect()
  const p2   = await connect()

  assert(host && p1 && p2, 'All 3 clients connected')

  // Track all messages per client
  const hostMsgs = []; const p1Msgs = []; const p2Msgs = []
  host.on('message', (r) => hostMsgs.push(JSON.parse(r)))
  p1.on('message',   (r) => p1Msgs.push(JSON.parse(r)))
  p2.on('message',   (r) => p2Msgs.push(JSON.parse(r)))

  // Join
  send(host, 'client:join', { pin, role: 'HOST' })
  await new Promise(r => setTimeout(r, 200))
  send(p1, 'client:join', { pin, role: 'PLAYER', nickname: 'Alice', identifier: 'alice@co.com' })
  await new Promise(r => setTimeout(r, 200))
  send(p2, 'client:join', { pin, role: 'PLAYER', nickname: 'Bob' })
  await new Promise(r => setTimeout(r, 400))

  const playerJoinedMsgs = hostMsgs.filter(m => m.event === 'server:player_joined')
  assert(playerJoinedMsgs.length >= 2, 'Host received player_joined events')
  const lastJoin = playerJoinedMsgs[playerJoinedMsgs.length - 1]
  assert(lastJoin.payload.players.length === 2, 'Host sees 2 players')

  // Start game — first item is a SLIDE
  send(host, 'host:start', { pin })
  await new Promise(r => setTimeout(r, 500))

  const slideSync = hostMsgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'SLIDE')
  assert(slideSync != null, 'Host received SLIDE state_sync')
  const playerSlide = p1Msgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'SLIDE')
  assert(playerSlide != null, 'Player received SLIDE state_sync')

  // Advance past slide to first question (quiz type: "Which planets are gas giants?")
  send(host, 'host:next_item', { pin })
  await new Promise(r => setTimeout(r, 500)) // QUESTION_READING

  const hostQR = hostMsgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'QUESTION_READING')
  assert(hostQR != null, 'Host received QUESTION_READING')
  assert(hostQR.payload.item?.text === 'Which planets are gas giants?', 'Host sees question text')
  assert(Array.isArray(hostQR.payload.item?.correctIndices), 'Host sees correctIndices')

  const p1QR = p1Msgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'QUESTION_READING')
  assert(p1QR != null, 'Player received QUESTION_READING')
  assert(p1QR.payload.item?.text === undefined, 'Player state_sync has NO question text (anti-cheat)')
  assert(p1QR.payload.item?.correctIndices === undefined, 'Player state_sync has NO correctIndices (anti-cheat)')
  assert(p1QR.payload.item?.type === 'quiz', 'Player sees question type (for rendering input widget)')

  // Skip reading phase → QUESTION_ACTIVE
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 400))

  const activeSync = hostMsgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'QUESTION_ACTIVE')
  assert(activeSync != null, 'QUESTION_ACTIVE state reached after skip')

  // Test pause/resume while active
  send(host, 'host:pause', { pin })
  await new Promise(r => setTimeout(r, 200))
  const pauseEvts = p1Msgs.filter(m => m.event === 'server:game_paused')
  assert(pauseEvts.length >= 1, 'Player received server:game_paused')

  send(host, 'host:resume', { pin })
  await new Promise(r => setTimeout(r, 200))
  const resumeEvts = p1Msgs.filter(m => m.event === 'server:game_resumed')
  assert(resumeEvts.length >= 1, 'Player received server:game_resumed')

  // Players submit answers (question: Jupiter=1, Saturn=2)
  send(p1, 'client:submit_answer', { pin, questionId: 'q-quiz-1', answer: { selected: [1, 2] } })
  await new Promise(r => setTimeout(r, 300))

  const tally1 = hostMsgs.filter(m => m.event === 'server:answer_tally')
  assert(tally1.length >= 1, 'Host received answer_tally after p1 submits')
  assert(tally1[tally1.length-1].payload.received === 1, 'Tally shows 1 answer received')

  const p1Result = p1Msgs.find(m => m.event === 'server:player_result')
  assert(p1Result != null, 'p1 received server:player_result')
  assert(p1Result.payload.isCorrect === true, 'p1 correct (selected [1,2])')
  assert(p1Result.payload.pointsEarned > 0, 'p1 earned points')

  // p2 result should NOT be in p1 messages
  const p2ResultInP1 = p1Msgs.find(m => m.event === 'server:player_result' && m.payload.nickname === 'Bob')
  assert(p2ResultInP1 === undefined, 'p1 did not receive p2\'s result (per-socket delivery)')

  // p2 submits wrong answer
  send(p2, 'client:submit_answer', { pin, questionId: 'q-quiz-1', answer: { selected: [0] } })
  await new Promise(r => setTimeout(r, 500))

  const p2Result = p2Msgs.find(m => m.event === 'server:player_result')
  assert(p2Result != null, 'p2 received server:player_result')
  assert(p2Result.payload.isCorrect === false, 'p2 incorrect (selected [0])')
  assert(p2Result.payload.pointsEarned === 0, 'p2 earned 0 points')

  // After all players answered, results should come
  const hostResults = hostMsgs.filter(m => m.event === 'server:results')
  assert(hostResults.length >= 1, 'Host received server:results')

  const tally2 = hostMsgs.filter(m => m.event === 'server:answer_tally')
  const lastTally = tally2[tally2.length - 1]
  assert(lastTally.payload.received === 2, 'Final tally shows 2 answers')
  assert(lastTally.payload.total === 2, 'Total players is 2')

  // Validation errors
  const errWs = await connect()
  send(errWs, 'client:submit_answer', { pin: '000000', questionId: 'x', answer: { selected: [] } })
  await new Promise(r => setTimeout(r, 200))
  const errMsgs = []
  errWs.on('message', (r) => errMsgs.push(JSON.parse(r)))
  send(errWs, 'client:join', { pin: '999999', role: 'PLAYER', nickname: 'X' })
  await new Promise(r => setTimeout(r, 200))
  // Should get error for unknown session
  errWs.close()

  host.close(); p1.close(); p2.close()

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1) })
