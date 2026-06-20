// Legal transitions: from -> set of valid destination statuses
const TRANSITIONS = {
  LOBBY:             new Set(['SLIDE', 'QUESTION_READING', 'FINISHED']),
  SLIDE:             new Set(['SLIDE', 'QUESTION_READING', 'FINISHED']),
  QUESTION_READING:  new Set(['QUESTION_ACTIVE', 'PAUSED']),
  QUESTION_ACTIVE:   new Set(['RESULTS', 'PAUSED']),
  PAUSED:            new Set(['QUESTION_READING', 'QUESTION_ACTIVE', 'RESULTS']),
  RESULTS:           new Set(['LEADERBOARD', 'SLIDE', 'QUESTION_READING', 'FINISHED']),
  LEADERBOARD:       new Set(['SLIDE', 'QUESTION_READING', 'FINISHED']),
  FINISHED:          new Set(),
}

function assertTransition(from, to) {
  if (!TRANSITIONS[from]?.has(to)) {
    throw new Error(`Illegal transition: ${from} → ${to}`)
  }
}

module.exports = { assertTransition }
