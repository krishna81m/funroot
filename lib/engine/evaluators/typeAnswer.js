function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function normalize(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function evaluate(question, rawAnswer) {
  const input = normalize(rawAnswer.text ?? '')
  const isCorrect = (question.acceptedAnswers ?? []).some(
    (a) => levenshtein(input, normalize(a)) <= 1
  )
  return { isCorrect }
}

module.exports = { evaluate }
