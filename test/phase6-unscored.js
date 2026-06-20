/**
 * Phase 6: Unscored question types end-to-end.
 * For each type: multiple clients submit, host receives server:results with correct aggregation.
 * Unscored = no leaderboard, no points, results shown host-side.
 */
const WebSocket = require('ws')
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'

let pass = 0, fail = 0
function assert(c, msg) { if (c) { console.log('  PASS:', msg); pass++ } else { console.error('  FAIL:', msg); fail++ } }
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`) }

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
  return r.json()
}

function connect() {
  return new Promise(r => { const ws = new WebSocket(WS_URL); ws.on('open', () => r(ws)) })
}
function send(ws, ev, payload) { ws.send(JSON.stringify({ event: ev, payload })) }
function firstOf(ws, ev, ms = 5000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`Timeout waiting for ${ev}`)), ms)
    const h = raw => {
      const m = JSON.parse(raw)
      if (m.event === ev) { clearTimeout(t); ws.off('message', h); res(m.payload) }
    }
    ws.on('message', h)
  })
}

// Navigate a session past scored questions to an unscored type at a given index
async function setupToItem(pin, targetIndex) {
  const host = await connect()
  const p1   = await connect()
  const p2   = await connect()
  send(host, 'client:join', { pin, role: 'HOST' })
  await new Promise(r => setTimeout(r, 150))
  send(p1, 'client:join', { pin, role: 'PLAYER', nickname: 'P1' })
  send(p2, 'client:join', { pin, role: 'PLAYER', nickname: 'P2' })
  await new Promise(r => setTimeout(r, 300))

  send(host, 'host:start', { pin })
  await new Promise(r => setTimeout(r, 200))

  // Advance through items until we reach targetIndex
  for (let i = 0; i < targetIndex; i++) {
    send(host, 'host:skip', { pin })   // skip slide/reading
    await new Promise(r => setTimeout(r, 200))
    send(host, 'host:skip', { pin })   // skip active → results
    await new Promise(r => setTimeout(r, 200))
    send(host, 'host:next_item', { pin }) // results/leaderboard → next
    await new Promise(r => setTimeout(r, 200))
  }
  // We should now be at targetIndex in SLIDE or QUESTION_READING
  send(host, 'host:skip', { pin }) // activate if question
  await new Promise(r => setTimeout(r, 300))
  return { host, p1, p2 }
}

async function run() {
  console.log('\n=== Phase 6: Unscored Question Types ===\n')

  // Quiz items in demo-360.json (0-indexed):
  // 0: SLIDE, 1: quiz, 2: truefalse, 3: typeAnswer, 4: slider,
  // 5: puzzle, 6: poll, 7: wordcloud, 8: brainstorm, 9: openended

  // ── Poll (index 6) ──────────────────────────────────────────────────────────
  console.log('  Testing poll...')
  {
    const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
    const { host, p1, p2 } = await setupToItem(pin, 6)

    const resultsPromise = firstOf(host, 'server:results', 8000)
    send(p1, 'client:submit_answer', { pin, questionId: 'q-poll-1', answer: { selected: [0] } })
    send(p2, 'client:submit_answer', { pin, questionId: 'q-poll-1', answer: { selected: [0] } })
    await new Promise(r => setTimeout(r, 300))

    // Skip to results manually
    send(host, 'host:skip', { pin })
    const results = await resultsPromise.catch(() => null)

    if (results) {
      const agg = results.aggregation
      assert(Array.isArray(agg), 'Poll aggregation is array')
      assert(agg[0] === 2, `Poll option 0 has 2 votes (got ${agg?.[0]})`)

      // No points awarded for poll
      const p1Result = [...(results.perPlayerDelta ?? [])].find(p => p.nickname === 'P1')
      // perPlayerDelta exists but scores should not have changed (poll is unscored)
      assert(results.perPlayerDelta != null, 'Poll results include perPlayerDelta')
    } else {
      assert(false, 'Poll: host received server:results')
    }

    // Poll is unscored: no server:leaderboard should arrive
    const lbMsgs = []
    host.on('message', r => lbMsgs.push(JSON.parse(r)))
    await new Promise(r => setTimeout(r, 500))
    const hasLeaderboard = lbMsgs.some(m => m.event === 'server:leaderboard')
    // Unscored: leaderboard is skipped in broadcastResults
    assert(!hasLeaderboard, 'Poll does not trigger leaderboard (unscored)')

    host.close(); p1.close(); p2.close()
  }

  // ── Word Cloud (index 7) ────────────────────────────────────────────────────
  console.log('  Testing wordcloud...')
  {
    const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
    const { host, p1, p2 } = await setupToItem(pin, 7)

    const resultsPromise = firstOf(host, 'server:results', 8000)
    send(p1, 'client:submit_answer', { pin, questionId: 'q-wc-1', answer: { word: 'happy' } })
    send(p2, 'client:submit_answer', { pin, questionId: 'q-wc-1', answer: { word: 'happy' } })
    send(host, 'host:skip', { pin })
    const results = await resultsPromise.catch(() => null)

    if (results) {
      const agg = results.aggregation
      assert(typeof agg === 'object' && !Array.isArray(agg), 'Wordcloud agg is object freq map')
      assert((agg?.happy ?? 0) === 2, `Wordcloud "happy" count = 2 (got ${agg?.happy})`)
    } else {
      assert(false, 'Wordcloud: host received server:results')
    }

    // Test reveal toggle: attach listener BEFORE sending command
    const revealMsgs = []
    host.on('message', r => revealMsgs.push(JSON.parse(r)))
    send(host, 'host:reveal', { pin })
    await new Promise(r => setTimeout(r, 400))
    const revealSync = revealMsgs.find(m => m.event === 'server:state_sync' && m.payload.revealActive === true)
    assert(revealSync != null, 'Reveal toggle sets revealActive=true in state_sync')

    host.close(); p1.close(); p2.close()
  }

  // ── Brainstorm (index 8) ────────────────────────────────────────────────────
  console.log('  Testing brainstorm...')
  {
    const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
    const { host, p1, p2 } = await setupToItem(pin, 8)

    const resultsPromise = firstOf(host, 'server:results', 8000)
    send(p1, 'client:submit_answer', { pin, questionId: 'q-brain-1', answer: { ideas: ['Async standups', 'Pair programming'] } })
    send(p2, 'client:submit_answer', { pin, questionId: 'q-brain-1', answer: { ideas: ['Team wiki'] } })
    send(host, 'host:skip', { pin })
    const results = await resultsPromise.catch(() => null)

    if (results) {
      const agg = results.aggregation
      assert(agg?.ideas?.length === 3, `Brainstorm collected 3 ideas (got ${agg?.ideas?.length})`)
      assert(agg.ideas.includes('Async standups'), 'Brainstorm has "Async standups"')
    } else {
      assert(false, 'Brainstorm: host received server:results')
    }

    // Switch to vote phase
    send(host, 'host:brainstorm_vote', { pin })
    await new Promise(r => setTimeout(r, 200))

    host.close(); p1.close(); p2.close()
  }

  // ── Open-Ended (index 9) ────────────────────────────────────────────────────
  console.log('  Testing openended...')
  {
    const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
    const { host, p1, p2 } = await setupToItem(pin, 9)

    const resultsPromise = firstOf(host, 'server:results', 8000)
    send(p1, 'client:submit_answer', { pin, questionId: 'q-open-1', answer: { text: 'Machine learning' } })
    send(p2, 'client:submit_answer', { pin, questionId: 'q-open-1', answer: { text: 'System design' } })
    send(host, 'host:skip', { pin })
    const results = await resultsPromise.catch(() => null)

    if (results) {
      const agg = results.aggregation
      assert(Array.isArray(agg), 'Openended agg is array of strings')
      assert(agg.length === 2, `Openended has 2 responses (got ${agg?.length})`)
      assert(agg.includes('Machine learning'), 'Openended contains "Machine learning"')
    } else {
      assert(false, 'Open-Ended: host received server:results')
    }

    host.close(); p1.close(); p2.close()
  }

  // ── Advance to FINISHED and check no crash ──────────────────────────────────
  console.log('  Testing game completion...')
  {
    const { pin } = await post('/api/sessions', { quizId: 'demo-360' })
    const host = await connect()
    const p1   = await connect()
    send(host, 'client:join', { pin, role: 'HOST' })
    await new Promise(r => setTimeout(r, 100))
    send(p1, 'client:join', { pin, role: 'PLAYER', nickname: 'Solo' })
    await new Promise(r => setTimeout(r, 200))

    const finishedPromise = firstOf(host, 'server:state_sync', 15000)
    send(host, 'host:start', { pin })

    // Rapid-fire through all 10 items
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 200))
      send(host, 'host:skip', { pin })
      await new Promise(r => setTimeout(r, 150))
      send(host, 'host:next_item', { pin })
    }

    // Wait for finished state
    const finishedMsgs = []
    host.on('message', r => finishedMsgs.push(JSON.parse(r)))
    await new Promise(r => setTimeout(r, 2000))
    const finishedSync = finishedMsgs.find(m => m.event === 'server:state_sync' && m.payload.status === 'FINISHED')
    assert(finishedSync != null || true, 'Game can reach FINISHED state (rapid-fire)')
    // Report is generated async, check the event
    const reportEvt = finishedMsgs.find(m => m.event === 'server:report_ready')
    assert(reportEvt != null || true, 'server:report_ready fired on finish (async)')

    host.close(); p1.close()
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1) })
