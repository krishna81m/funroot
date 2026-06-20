// Handles both single-correct and multi-select quiz questions.
// correctIndices is an array; player must select exactly that set.
function evaluate(question, rawAnswer) {
  const correct = new Set(question.correctIndices)
  const selected = new Set(rawAnswer.selected ?? [])
  const isCorrect =
    correct.size === selected.size && [...correct].every((i) => selected.has(i))
  return { isCorrect }
}

module.exports = { evaluate }
