/**
 * @typedef {'LOBBY'|'SLIDE'|'QUESTION_READING'|'QUESTION_ACTIVE'|'PAUSED'|'RESULTS'|'LEADERBOARD'|'FINISHED'} SessionStatus
 * @typedef {'quiz'|'truefalse'|'typeAnswer'|'slider'|'puzzle'|'poll'|'wordcloud'|'brainstorm'|'openended'} QuestionType
 *
 * @typedef {{ socketId: string, identifier: string, nickname: string, score: number, streak: number, connected: boolean }} Player
 *
 * @typedef {{ questionId: string, timeTaken: number, rawAnswer: *, pointsEarned: number, isCorrect: boolean|null }} AnswerLog
 *
 * @typedef {{
 *   pin: string,
 *   quizId: string,
 *   status: SessionStatus,
 *   currentItemIndex: number,
 *   players: Map<string,Player>,
 *   playerHistory: Map<string,AnswerLog[]>,
 *   activeTimer: NodeJS.Timeout|null,
 *   timeRemaining: number,
 *   pausedAt: number|null,
 *   revealActive: boolean,
 *   brainstormSubPhase: 'COLLECT'|'VOTE',
 *   quiz: object,
 *   createdAt: number,
 * }} GameSession
 */
module.exports = {}
