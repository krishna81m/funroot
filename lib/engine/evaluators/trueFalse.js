function evaluate(question, rawAnswer) {
  const isCorrect = rawAnswer.selected?.[0] === question.correctIndex
  return { isCorrect }
}

module.exports = { evaluate }
