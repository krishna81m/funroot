const path = require('path')
const fs = require('fs')
const { assertTransition } = require('./stateMachine')
const { TimerService } = require('./TimerService')
const { calculatePoints, applyStreak } = require('./scoring')
const { writeSnapshot } = require('./SnapshotService')
const { buildReport } = require('./ReportBuilder')

const quizEvaluators = {
  quiz: require('./evaluators/quiz'),
  truefalse: require('./evaluators/trueFalse'),
  typeAnswer: require('./evaluators/typeAnswer'),
  slider: require('./evaluators/slider'),
  puzzle: require('./evaluators/puzzle'),
}
const unscored = require('./evaluators/unscored')
const { distributionCurve } = require('./aggregators')
const UNSCORED_TYPES = new Set(['poll', 'wordcloud', 'brainstorm', 'openended'])

/** @type {Map<string, import('../shared/types').GameSession>} */
const sessions = new Map()

// Loaded once at startup; quizId → quiz object.
const quizCatalog = new Map()
const QUIZ_DIR = path.join(__dirname, '../../data/quizzes')
for (const file of fs.readdirSync(QUIZ_DIR).filter((f) => f.endsWith('.json'))) {
  try {
    const quiz = JSON.parse(fs.readFileSync(path.join(QUIZ_DIR, file), 'utf8'))
    quizCatalog.set(quiz.id, quiz)
  } catch (e) {
    console.error('[engine] Failed to load quiz:', file, e.message)
  }
}

// Broadcast callback injected by the socket layer so the engine stays framework-free.
let _broadcast = null
function setBroadcast(fn) { _broadcast = fn }

function broadcast(pin, event, payload, role) {
  if (_broadcast) _broadcast(pin, event, payload, role)
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

function createSession(quizId) {
  const quiz = quizCatalog.get(quizId)
  if (!quiz) throw new Error(`Unknown quiz: ${quizId}`)
  const { generatePin } = require('../shared/pin')
  const pin = generatePin()
  /** @type {import('../shared/types').GameSession} */
  const session = {
    pin,
    quizId,
    quiz,
    status: 'LOBBY',
    currentItemIndex: -1,
    players: new Map(),
    playerHistory: new Map(),
    activeTimer: null,
    timeRemaining: 0,
    pausedAt: null,
    revealActive: false,
    brainstormSubPhase: 'COLLECT',
    itemAggregates: new Map(), // itemId → aggregate data
    createdAt: Date.now(),
  }
  sessions.set(pin, session)
  writeSnapshot(session)
  return session
}

function getSession(pin) {
  const s = sessions.get(pin)
  if (!s) throw new Error(`Session not found: ${pin}`)
  return s
}

// ── Player management ──────────────────────────────────────────────────────────

function addPlayer(pin, { socketId, identifier, nickname }) {
  const session = getSession(pin)
  if (session.status !== 'LOBBY') throw new Error('Game already started')
  if ([...session.players.values()].some((p) => p.nickname === nickname)) {
    throw new Error('Nickname already taken')
  }
  session.players.set(socketId, {
    socketId,
    identifier: identifier ?? null,
    nickname,
    score: 0,
    streak: 0,
    connected: true,
  })
  session.playerHistory.set(socketId, [])
  writeSnapshot(session)
  broadcast(pin, 'server:player_joined', { players: publicPlayers(session) }, 'HOST')
  return session
}

function reconnectPlayer(pin, { socketId, identifier, nickname }) {
  const session = getSession(pin)
  // Only reconnect if the player is currently disconnected
  const existing = [...session.players.values()].find(
    (p) => p.connected === false &&
      ((identifier && p.identifier === identifier) || p.nickname === nickname)
  )
  if (!existing) throw new Error('Player not found for reconnect')
  const oldId = existing.socketId
  const history = session.playerHistory.get(oldId) ?? []
  session.players.delete(oldId)
  existing.socketId = socketId
  existing.connected = true
  session.players.set(socketId, existing)
  session.playerHistory.delete(oldId)
  session.playerHistory.set(socketId, history)
  return session
}

function kickPlayer(pin, targetSocketId) {
  const session = getSession(pin)
  session.players.delete(targetSocketId)
  session.playerHistory.delete(targetSocketId)
  broadcast(pin, 'server:kicked', { reason: 'Removed by host' }, 'SOCKET:' + targetSocketId)
  broadcast(pin, 'server:player_joined', { players: publicPlayers(session) }, 'HOST')
  writeSnapshot(session)
}

function publicPlayers(session) {
  return [...session.players.values()].map(({ socketId, nickname, score, streak }) => ({
    socketId, nickname, score, streak,
  }))
}

// ── Game flow ─────────────────────────────────────────────────────────────────

function startGame(pin) {
  const session = getSession(pin)
  if (session.status !== 'LOBBY') throw new Error('Can only start from LOBBY')
  advanceItem(session)
}

function nextItem(pin) {
  const session = getSession(pin)
  if (!['RESULTS', 'LEADERBOARD', 'SLIDE', 'LOBBY'].includes(session.status)) {
    throw new Error(`Cannot advance from ${session.status}`)
  }
  TimerService.clear(session)
  advanceItem(session)
}

function skipCurrent(pin) {
  const session = getSession(pin)
  TimerService.clear(session)
  if (session.status === 'SLIDE') {
    advanceItem(session)
  } else if (session.status === 'QUESTION_READING') {
    // Force-activate the question (bypass the 5s reading phase)
    transitionTo(session, 'QUESTION_ACTIVE')
    broadcastStateSync(session)
  } else if (session.status === 'QUESTION_ACTIVE') {
    transitionTo(session, 'RESULTS')
    broadcastResults(session)
  } else {
    throw new Error(`Cannot skip from ${session.status}`)
  }
}

function pauseGame(pin) {
  const session = getSession(pin)
  if (session.status === 'PAUSED') return
  const prevStatus = session.status
  assertTransition(session.status, 'PAUSED')
  TimerService.pause(session)
  session._prePrePauseStatus = prevStatus
  transitionTo(session, 'PAUSED')
  broadcast(pin, 'server:game_paused', {}, 'ALL')
  writeSnapshot(session)
}

function resumeGame(pin) {
  const session = getSession(pin)
  if (session.status !== 'PAUSED') return
  const prev = session._prePrePauseStatus ?? 'QUESTION_ACTIVE'
  assertTransition('PAUSED', prev)
  session.status = prev
  if (prev === 'QUESTION_ACTIVE') {
    TimerService.resume(
      session,
      (remaining) => broadcast(pin, 'server:tick', { timeRemaining: remaining }, 'ALL'),
      () => onTimerExpire(session)
    )
  }
  broadcastStateSync(session)
  broadcast(pin, 'server:game_resumed', {}, 'ALL')
  writeSnapshot(session)
}

function revealToggle(pin) {
  const session = getSession(pin)
  session.revealActive = !session.revealActive
  broadcastStateSync(session)
}

// ── Answer submission ─────────────────────────────────────────────────────────

function submitAnswer(pin, socketId, { questionId, answer }) {
  const session = getSession(pin)
  if (session.status !== 'QUESTION_ACTIVE') return
  const item = currentItem(session)
  if (!item || item.id !== questionId) return

  const history = session.playerHistory.get(socketId)
  if (!history) return
  if (history.some((l) => l.questionId === questionId)) return // already answered

  const player = session.players.get(socketId)
  if (!player) return

  const timeTaken = (item.timeLimit ? item.timeLimit * 1000 : 60000) - session.timeRemaining
  let isCorrect = null
  let pointsEarned = 0
  let accuracy = null

  if (UNSCORED_TYPES.has(item.type)) {
    const agg = ensureAggregate(session, item)
    const unscoredFn = {
      poll: () => unscored.aggregatePoll(agg, answer),
      wordcloud: () => unscored.aggregateWordCloud(agg, answer),
      brainstorm: () => unscored.aggregateBrainstorm(agg, answer, session.brainstormSubPhase),
      openended: () => unscored.aggregateOpenEnded(agg, answer),
    }[item.type]
    ;({ isCorrect } = unscoredFn())
  } else {
    const evaluator = quizEvaluators[item.type]
    if (!evaluator) return
    const result = evaluator.evaluate(item, answer)
    isCorrect = result.isCorrect
    accuracy = result.accuracy ?? null

    const multiplier = item.pointsMultiplier ?? 1
    const timeLimitMs = (item.timeLimit ?? 60) * 1000
    let base = item.type === 'slider'
      ? Math.round(multiplier * 1000 * (accuracy ?? 0) * Math.max(0, 1 - timeTaken / (2 * timeLimitMs)))
      : calculatePoints(multiplier, timeTaken, timeLimitMs)

    if (!isCorrect && item.type !== 'slider') base = 0

    if (isCorrect || (item.type === 'slider' && (accuracy ?? 0) > 0)) {
      player.streak++
      pointsEarned = applyStreak(base, player.streak)
    } else {
      player.streak = 0
    }
    player.score += pointsEarned
  }

  history.push({ questionId, timeTaken, rawAnswer: answer, pointsEarned, isCorrect })
  writeSnapshot(session)

  const answered = [...session.playerHistory.values()].filter(
    (logs) => logs.some((l) => l.questionId === questionId)
  ).length
  broadcast(pin, 'server:answer_tally', { received: answered, total: session.players.size }, 'HOST')

  // Send individual result back to the player only
  broadcast(pin, 'server:player_result', { isCorrect, pointsEarned, streak: player.streak, accuracy }, 'SOCKET:' + socketId)

  // Auto-advance if everyone answered
  if (answered >= session.players.size) {
    TimerService.clear(session)
    transitionTo(session, 'RESULTS')
    broadcastResults(session)
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function advanceItem(session) {
  const items = session.quiz.items ?? []
  session.currentItemIndex++
  if (session.currentItemIndex >= items.length) {
    return finishGame(session)
  }
  const item = items[session.currentItemIndex]
  if (item.type === 'SLIDE') {
    assertTransition(session.status, 'SLIDE')
    session.status = 'SLIDE'
    broadcastStateSync(session)
    writeSnapshot(session)
  } else {
    beginQuestion(session, item)
  }
}

function beginQuestion(session, item) {
  assertTransition(session.status, 'QUESTION_READING')
  session.status = 'QUESTION_READING'
  session.revealActive = false
  ensureAggregate(session, item)
  broadcastStateSync(session)
  // 5-second reading phase, then activate (unless accuracy mode = no timeLimit)
  setTimeout(() => {
    if (session.status !== 'QUESTION_READING') return
    assertTransition(session.status, 'QUESTION_ACTIVE')
    session.status = 'QUESTION_ACTIVE'
    broadcastStateSync(session)
    if (item.timeLimit) {
      TimerService.start(
        session,
        item.timeLimit * 1000,
        (remaining) => broadcast(session.pin, 'server:tick', { timeRemaining: remaining }, 'ALL'),
        () => onTimerExpire(session)
      )
    }
  }, 5000)
}

function onTimerExpire(session) {
  if (session.status !== 'QUESTION_ACTIVE') return
  transitionTo(session, 'RESULTS')
  broadcastResults(session)
}

function buildAggregation(session, item) {
  const history = [...session.playerHistory.values()].flatMap(
    (logs) => logs.filter((l) => l.questionId === item.id)
  )
  switch (item.type) {
    case 'quiz':
    case 'truefalse':
    case 'poll': {
      const counts = Array(item.options?.length ?? 2).fill(0)
      for (const log of history) {
        for (const idx of log.rawAnswer?.selected ?? []) {
          if (idx >= 0 && idx < counts.length) counts[idx]++
        }
      }
      return counts
    }
    case 'slider':
      return distributionCurve(history, item.min ?? 0, item.max ?? 100)
    case 'typeAnswer':
      return { submissions: history.map((l) => l.rawAnswer?.text ?? '') }
    default:
      return session.itemAggregates.get(item.id) ?? null
  }
}

function broadcastResults(session) {
  const item = currentItem(session)
  const isScored = item && !UNSCORED_TYPES.has(item.type)
  const agg = item ? buildAggregation(session, item) : null

  // Host gets full aggregation + correct answer reveal
  broadcast(session.pin, 'server:results', {
    item: { ...item },
    aggregation: agg,
    brainstormSubPhase: session.brainstormSubPhase,
    perPlayerDelta: [...session.players.values()].map((p) => ({
      nickname: p.nickname,
      score: p.score,
      streak: p.streak,
    })),
  }, 'HOST')

  // Players only get their own result (already sent per-answer); here just status sync
  broadcastStateSync(session)
  writeSnapshot(session)

  if (!isScored) {
    // Skip leaderboard for unscored items
    return
  }
  // Brief delay then send leaderboard
  setTimeout(() => {
    if (session.status !== 'RESULTS') return
    transitionTo(session, 'LEADERBOARD')
    const top = [...session.players.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ nickname, score }) => ({ nickname, score }))
    broadcast(session.pin, 'server:leaderboard', { top }, 'ALL')
    broadcastStateSync(session)
  }, 100)
}

async function finishGame(session) {
  assertTransition(session.status, 'FINISHED')
  session.status = 'FINISHED'
  TimerService.clear(session)
  broadcastStateSync(session)
  writeSnapshot(session)
  try {
    const { jsonPath, csvPath } = await buildReport(session)
    broadcast(session.pin, 'server:report_ready', {
      downloadJson: `/api/report/${session.pin}/json`,
      downloadCsv: `/api/report/${session.pin}/csv`,
    }, 'HOST')
  } catch (e) {
    console.error('[engine] report build failed:', e.message)
  }
}

function transitionTo(session, status) {
  assertTransition(session.status, status)
  session.status = status
}

function currentItem(session) {
  return session.quiz.items?.[session.currentItemIndex] ?? null
}

function ensureAggregate(session, item) {
  if (!session.itemAggregates.has(item.id)) {
    const init = {
      poll: {},
      wordcloud: {},
      brainstorm: { ideas: [], votes: {} },
      openended: [],
      slider: [],
      quiz: null,
      truefalse: null,
      typeAnswer: null,
      puzzle: null,
    }[item.type] ?? null
    session.itemAggregates.set(item.id, init)
  }
  return session.itemAggregates.get(item.id)
}

function broadcastStateSync(session) {
  const item = currentItem(session)
  const base = {
    status: session.status,
    currentItemIndex: session.currentItemIndex,
    timeRemaining: session.timeRemaining,
    playerCount: session.players.size,
  }
  // Host gets full item with question text + correct answers
  broadcast(session.pin, 'server:state_sync', { ...base, item, revealActive: session.revealActive, brainstormSubPhase: session.brainstormSubPhase }, 'HOST')
  // Players never receive question text or correct answers (anti-cheat)
  broadcast(session.pin, 'server:state_sync', {
    ...base,
    item: item ? playerView(item) : null,
  }, 'PLAYERS')
}

// Strip question text, accepted answers, and correct indices from item before sending to player.
function playerView(item) {
  const { text: _t, acceptedAnswers: _a, correctIndices: _ci, correctIndex: _cx,
          correctValue: _cv, correctOrder: _co, ...rest } = item
  return rest
}

const listQuizzes = () => [...quizCatalog.values()].map(({ id, title, description }) => ({ id, title, description }))

function reloadQuiz(quiz) {
  quizCatalog.set(quiz.id, quiz)
}

function removeQuiz(quizId) {
  quizCatalog.delete(quizId)
}

module.exports = {
  sessions,
  setBroadcast,
  createSession,
  getSession,
  addPlayer,
  reconnectPlayer,
  kickPlayer,
  startGame,
  nextItem,
  skipCurrent,
  pauseGame,
  resumeGame,
  revealToggle,
  submitAnswer,
  listQuizzes,
  reloadQuiz,
  removeQuiz,
  publicPlayers,
}
