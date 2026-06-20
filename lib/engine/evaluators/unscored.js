// Aggregators for opinion types. Returns isCorrect: null (unscored).
// aggregation accumulates per-submission; caller passes the session's running aggregate.

function aggregatePoll(aggregate, rawAnswer) {
  for (const idx of rawAnswer.selected ?? []) {
    aggregate[idx] = (aggregate[idx] ?? 0) + 1
  }
  return { isCorrect: null }
}

function aggregateWordCloud(aggregate, rawAnswer) {
  const word = (rawAnswer.word ?? '').trim().toLowerCase()
  if (word) aggregate[word] = (aggregate[word] ?? 0) + 1
  return { isCorrect: null }
}

function aggregateBrainstorm(aggregate, rawAnswer, subPhase) {
  if (subPhase === 'VOTE') {
    for (const id of rawAnswer.votes ?? []) {
      aggregate.votes[id] = (aggregate.votes[id] ?? 0) + 1
    }
  } else {
    aggregate.ideas.push(...(rawAnswer.ideas ?? []).slice(0, 3))
  }
  return { isCorrect: null }
}

function aggregateOpenEnded(aggregate, rawAnswer) {
  aggregate.push(rawAnswer.text ?? '')
  return { isCorrect: null }
}

module.exports = { aggregatePoll, aggregateWordCloud, aggregateBrainstorm, aggregateOpenEnded }
