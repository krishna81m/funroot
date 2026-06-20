const fs = require('fs/promises')
const path = require('path')
const os = require('os')

const REPORT_DIR = path.join(os.tmpdir(), 'kahoot360-reports')
const KNOWLEDGE_GAP_THRESHOLD = 0.35
const UNSCORED_TYPES = new Set(['poll', 'wordcloud', 'brainstorm', 'openended'])

async function buildReport(session) {
  const quiz = session.quiz
  const players = [...session.players.values()]

  const leaderboard = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, rank) => ({ rank: rank + 1, nickname: p.nickname, identifier: p.identifier, score: p.score }))

  const questionBreakdown = (quiz.items ?? [])
    .filter((item) => item.type !== 'SLIDE')
    .map((q) => {
      const allAnswers = [...session.playerHistory.values()]
        .flatMap((logs) => logs.filter((l) => l.questionId === q.id))
      const answered = allAnswers.length
      const isScored = !UNSCORED_TYPES.has(q.type)
      const correct = isScored ? allAnswers.filter((l) => l.isCorrect === true).length : null
      const correctRate = (isScored && answered) ? correct / answered : null
      return {
        questionId: q.id,
        text: q.text,
        type: q.type,
        correctRate,
        knowledgeGap: isScored && correctRate !== null && correctRate < KNOWLEDGE_GAP_THRESHOLD,
        perPlayer: Object.fromEntries(
          [...session.playerHistory.entries()].map(([id, logs]) => {
            const log = logs.find((l) => l.questionId === q.id)
            return [id, log ?? null]
          })
        ),
      }
    })

  const report = { generatedAt: new Date().toISOString(), leaderboard, questionBreakdown }

  await fs.mkdir(REPORT_DIR, { recursive: true })
  const jsonPath = path.join(REPORT_DIR, `${session.pin}.json`)
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2))

  // CSV: one row per (player × question)
  const csvRows = ['rank,nickname,identifier,questionId,questionText,timeTaken,pointsEarned,isCorrect,rawAnswer']
  for (const entry of leaderboard) {
    const playerId = [...session.players.entries()].find(
      ([, p]) => p.nickname === entry.nickname
    )?.[0]
    const history = session.playerHistory.get(playerId) ?? []
    for (const q of questionBreakdown) {
      const log = history.find((l) => l.questionId === q.questionId)
      csvRows.push(
        [
          entry.rank,
          JSON.stringify(entry.nickname),
          JSON.stringify(entry.identifier ?? ''),
          q.questionId,
          JSON.stringify(q.text ?? ''),
          log?.timeTaken ?? '',
          log?.pointsEarned ?? '',
          log?.isCorrect ?? '',
          JSON.stringify(log?.rawAnswer ?? ''),
        ].join(',')
      )
    }
  }
  const csvPath = path.join(REPORT_DIR, `${session.pin}.csv`)
  await fs.writeFile(csvPath, csvRows.join('\n'))

  return { jsonPath, csvPath }
}

module.exports = { buildReport, REPORT_DIR }
