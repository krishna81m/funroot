/**
 * Phase 7: Analytics & report verification.
 * - Play a complete game with known answers (some questions with <35% correct rate)
 * - Verify JSON report structure: leaderboard, per-question breakdown, knowledge gaps
 * - Verify CSV has per-player × per-question rows
 * - Verify download API route returns the files
 */
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')
const os = require('os')

const BASE = 'http://localhost:3000'
const WS_URL = 'ws://localhost:3000/ws'
const REPORT_DIR = path.join(os.tmpdir(), 'kahoot360-reports')

let pass = 0, fail = 0
function assert(c, msg) { if (c) { console.log('  PASS:', msg); pass++ } else { console.error('  FAIL:', msg); fail++ } }
function eq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`) }

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
  return r.json()
}

function connect() {
  return new Promise(r => { const ws = new WebSocket(WS_URL); ws.on('open', () => r(ws)) })
}
function send(ws, ev, pl) { ws.send(JSON.stringify({ event: ev, payload: pl })) }

function waitFor(ws, evName, ms = 6000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`Timeout: ${evName}`)), ms)
    const h = raw => {
      const m = JSON.parse(raw)
      if (m.event === evName) { clearTimeout(t); ws.off('message', h); res(m.payload) }
    }
    ws.on('message', h)
  })
}

async function run() {
  console.log('\n=== Phase 7: Analytics & Report ===\n')

  const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
  console.log('PIN:', pin)

  const host = await connect()
  const p1   = await connect()   // Alice: will answer most correctly
  const p2   = await connect()   // Bob: will answer everything wrong

  send(host, 'client:join', { pin, role: 'HOST' })
  await new Promise(r => setTimeout(r, 150))
  send(p1, 'client:join', { pin, role: 'PLAYER', identifier: 'alice@co.com', nickname: 'Alice' })
  send(p2, 'client:join', { pin, role: 'PLAYER', identifier: 'bob@co.com', nickname: 'Bob' })
  await new Promise(r => setTimeout(r, 300))

  // Track report_ready
  const reportPromise = waitFor(host, 'server:report_ready', 15000)

  // Drive through all items
  send(host, 'host:start', { pin }) // LOBBY → SLIDE (item 0)
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // SLIDE → QUESTION_READING (item 1: quiz)
  send(host, 'host:skip', { pin })       // → QUESTION_ACTIVE
  await new Promise(r => setTimeout(r, 200))

  // q-quiz-1: "Which planets are gas giants?" correctIndices=[1,2]
  // Alice correct, Bob wrong → correctRate = 0.5 (NOT a knowledge gap)
  send(p1, 'client:submit_answer', { pin, questionId: 'q-quiz-1', answer: { selected: [1, 2] } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-quiz-1', answer: { selected: [0] } })
  await new Promise(r => setTimeout(r, 400))
  send(host, 'host:next_item', { pin }) // → LEADERBOARD
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // → QUESTION_READING (item 2: truefalse)
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))

  // q-tf-1: "Great Wall visible from space" correctIndex=1 (False)
  // Both wrong → correctRate = 0 → knowledge gap!
  send(p1, 'client:submit_answer', { pin, questionId: 'q-tf-1', answer: { selected: [0] } }) // wrong
  send(p2, 'client:submit_answer', { pin, questionId: 'q-tf-1', answer: { selected: [0] } }) // wrong
  await new Promise(r => setTimeout(r, 400))
  send(host, 'host:next_item', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // item 3: typeAnswer
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))

  // q-type-1: "Capital of France?" acceptedAnswers=["Paris","paris"]
  // Both wrong → knowledge gap!
  send(p1, 'client:submit_answer', { pin, questionId: 'q-type-1', answer: { text: 'London' } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-type-1', answer: { text: 'Berlin' } })
  await new Promise(r => setTimeout(r, 400))
  send(host, 'host:next_item', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // item 4: slider
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))

  // q-slider-1: correctValue=1989, tolerance=5
  // Alice close (1990), Bob far off (1920) → both get partial/no credit
  send(p1, 'client:submit_answer', { pin, questionId: 'q-slider-1', answer: { value: 1990 } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-slider-1', answer: { value: 1920 } })
  await new Promise(r => setTimeout(r, 400))
  send(host, 'host:next_item', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // item 5: puzzle
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))

  // q-puzzle-1: correctOrder=[0,1,2,3]
  // Alice correct, Bob wrong
  send(p1, 'client:submit_answer', { pin, questionId: 'q-puzzle-1', answer: { order: [0,1,2,3] } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-puzzle-1', answer: { order: [3,2,1,0] } })
  await new Promise(r => setTimeout(r, 400))
  send(host, 'host:next_item', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(host, 'host:next_item', { pin }) // item 6: poll (unscored)
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(p1, 'client:submit_answer', { pin, questionId: 'q-poll-1', answer: { selected: [1] } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-poll-1', answer: { selected: [2] } })
  await new Promise(r => setTimeout(r, 300))
  send(host, 'host:next_item', { pin }) // item 7: wordcloud
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(p1, 'client:submit_answer', { pin, questionId: 'q-wc-1', answer: { word: 'excited' } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-wc-1', answer: { word: 'happy' } })
  await new Promise(r => setTimeout(r, 300))
  send(host, 'host:next_item', { pin }) // item 8: brainstorm
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(p1, 'client:submit_answer', { pin, questionId: 'q-brain-1', answer: { ideas: ['Better docs'] } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-brain-1', answer: { ideas: ['More 1:1s'] } })
  await new Promise(r => setTimeout(r, 300))
  send(host, 'host:next_item', { pin }) // item 9: openended
  send(host, 'host:skip', { pin })
  await new Promise(r => setTimeout(r, 200))
  send(p1, 'client:submit_answer', { pin, questionId: 'q-open-1', answer: { text: 'AI fundamentals' } })
  send(p2, 'client:submit_answer', { pin, questionId: 'q-open-1', answer: { text: 'Cloud architecture' } })
  await new Promise(r => setTimeout(r, 300))
  send(host, 'host:next_item', { pin }) // → FINISHED

  // Wait for report
  const reportPayload = await reportPromise.catch(e => { console.error('Report timeout:', e.message); return null })
  assert(reportPayload != null, 'server:report_ready received')

  if (reportPayload) {
    assert(reportPayload.downloadJson != null, 'Report has downloadJson URL')
    assert(reportPayload.downloadCsv != null, 'Report has downloadCsv URL')

    // Read JSON report directly from filesystem
    const jsonPath = path.join(REPORT_DIR, `${pin}.json`)
    const csvPath  = path.join(REPORT_DIR, `${pin}.csv`)

    await new Promise(r => setTimeout(r, 500)) // ensure files are written

    assert(fs.existsSync(jsonPath), `JSON report file exists at ${jsonPath}`)
    assert(fs.existsSync(csvPath),  `CSV report file exists at ${csvPath}`)

    const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

    // Leaderboard
    assert(Array.isArray(report.leaderboard), 'Report has leaderboard array')
    eq(report.leaderboard.length, 2, 'Leaderboard has 2 players')
    assert(report.leaderboard[0].rank === 1, 'First entry is rank 1')
    assert(report.leaderboard[0].score >= report.leaderboard[1].score, 'Leaderboard sorted by score descending')
    console.log(`    Leaderboard: ${report.leaderboard.map(p => `${p.nickname}(${p.score})`).join(', ')}`)

    // Question breakdown (only scored questions)
    assert(Array.isArray(report.questionBreakdown), 'Report has questionBreakdown')
    const scored = report.questionBreakdown.filter(q => q.type !== 'poll' && q.type !== 'wordcloud' && q.type !== 'brainstorm' && q.type !== 'openended')
    assert(scored.length >= 5, `Report has >= 5 scored question rows (got ${scored.length})`)

    // Knowledge gaps
    const gaps = report.questionBreakdown.filter(q => q.knowledgeGap)
    assert(gaps.length >= 2, `At least 2 knowledge gaps detected (got ${gaps.length}) — tf and typeAnswer both had 0% correct`)
    // Unscored types (poll/wordcloud/brainstorm/openended) must NOT be flagged as gaps
    const unscoredGaps = gaps.filter(q => ['poll','wordcloud','brainstorm','openended'].includes(q.type))
    assert(unscoredGaps.length === 0, `No unscored types flagged as knowledge gaps (got ${unscoredGaps.length})`)
    console.log(`    Knowledge gaps: ${gaps.map(g => g.questionId).join(', ')}`)

    // Per-player breakdown
    const quizQ = report.questionBreakdown.find(q => q.questionId === 'q-quiz-1')
    assert(quizQ != null, 'q-quiz-1 in breakdown')
    const aliceEntry = Object.entries(quizQ.perPlayer).find(([, v]) => v?.rawAnswer?.selected?.includes(1))
    assert(aliceEntry != null, 'Alice answer logged in q-quiz-1 breakdown')

    // CSV validation
    const csv = fs.readFileSync(csvPath, 'utf8')
    const csvLines = csv.split('\n').filter(Boolean)
    assert(csvLines.length >= 3, `CSV has header + data rows (got ${csvLines.length} lines)`)
    assert(csvLines[0].startsWith('rank,nickname'), 'CSV header correct')
    const aliceLine = csvLines.find(l => l.includes('Alice'))
    assert(aliceLine != null, 'CSV has Alice row')
    const bobLine = csvLines.find(l => l.includes('Bob'))
    assert(bobLine != null, 'CSV has Bob row')
    console.log(`    CSV: ${csvLines.length} lines (header + ${csvLines.length - 1} data rows)`)

    // HTTP download routes
    const jsonRes = await fetch(`${BASE}/api/report/${pin}/json`)
    eq(jsonRes.status, 200, 'GET /api/report/:pin/json returns 200')
    const csvRes = await fetch(`${BASE}/api/report/${pin}/csv`)
    eq(csvRes.status, 200, 'GET /api/report/:pin/csv returns 200')
    assert(csvRes.headers.get('content-type')?.includes('text/csv'), 'CSV content-type header')
    assert(jsonRes.headers.get('content-type')?.includes('application/json'), 'JSON content-type header')

    // 404 for unknown PIN
    const notFound = await fetch(`${BASE}/api/report/999999/json`)
    eq(notFound.status, 404, 'GET /api/report/unknown returns 404')
  }

  host.close(); p1.close(); p2.close()

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FATAL:', e.message, '\n', e.stack); process.exit(1) })
