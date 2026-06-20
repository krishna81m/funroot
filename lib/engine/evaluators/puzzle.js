// Exact array sequence match only — no partial credit per spec.
function evaluate(question, rawAnswer) {
  const correct = question.correctOrder ?? []
  const given = rawAnswer.order ?? []
  const isCorrect =
    correct.length === given.length && correct.every((v, i) => v === given[i])
  return { isCorrect }
}

module.exports = { evaluate }
