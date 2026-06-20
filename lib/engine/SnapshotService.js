const fs = require('fs/promises')
const path = require('path')
const os = require('os')

const SNAPSHOT_DIR = path.join(os.tmpdir(), 'kahoot360-sessions')

// Per-session write queue: chains promises so concurrent calls never interleave on the same file.
const writeQueue = new Map()

// Serialize Maps to plain objects so JSON.stringify works.
function serializeSession(session) {
  return {
    pin: session.pin,
    quizId: session.quizId,
    status: session.status,
    currentItemIndex: session.currentItemIndex,
    timeRemaining: session.timeRemaining,
    revealActive: session.revealActive,
    brainstormSubPhase: session.brainstormSubPhase,
    createdAt: session.createdAt,
    snapshotAt: Date.now(),
    players: Object.fromEntries(
      [...session.players.entries()].map(([id, p]) => [id, { ...p }])
    ),
    playerHistory: Object.fromEntries(
      [...session.playerHistory.entries()]
    ),
  }
}

// Fire-and-forget. Never throws — a snapshot failure must not interrupt the game.
// Writes are serialized per PIN to prevent concurrent fs.writeFile calls from interleaving.
function writeSnapshot(session) {
  const pin = session.pin
  const data = JSON.stringify(serializeSession(session), null, 2)
  const prev = writeQueue.get(pin) ?? Promise.resolve()
  const next = prev
    .then(() => fs.mkdir(SNAPSHOT_DIR, { recursive: true }))
    .then(() => fs.writeFile(path.join(SNAPSHOT_DIR, `${pin}.json`), data))
    .catch((err) => console.error(`[snapshot] ${pin}:`, err.message))
  writeQueue.set(pin, next)
}

module.exports = { writeSnapshot, SNAPSHOT_DIR }
