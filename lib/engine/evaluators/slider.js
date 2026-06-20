// Points scale continuously by proximity. tolerance = 10% of range by default.
// isCorrect is always true (partial credit) but pointsMultiplier is applied downstream.
function evaluate(question, rawAnswer) {
  const { correctValue, min = 0, max = 100, tolerance } = question
  const effectiveTolerance = tolerance ?? (max - min) * 0.1
  const diff = Math.abs((rawAnswer.value ?? 0) - correctValue)
  const accuracy = Math.max(0, 1 - diff / effectiveTolerance)
  return { isCorrect: diff === 0, accuracy }
}

module.exports = { evaluate }
