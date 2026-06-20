// Compute host-facing aggregation from playerHistory for the current question.

function distributionCurve(history, min, max, buckets = 10) {
  const step = (max - min) / buckets
  const counts = Array(buckets).fill(0)
  for (const log of history) {
    if (log.rawAnswer?.value !== undefined) {
      const idx = Math.min(buckets - 1, Math.floor((log.rawAnswer.value - min) / step))
      if (idx >= 0) counts[idx]++
    }
  }
  return counts.map((count, i) => ({ rangeStart: min + i * step, count }))
}

function choiceBar(history, optionCount) {
  const counts = Array(optionCount).fill(0)
  for (const log of history) {
    for (const idx of log.rawAnswer?.selected ?? []) {
      if (idx >= 0 && idx < optionCount) counts[idx]++
    }
  }
  return counts
}

module.exports = { distributionCurve, choiceBar }
