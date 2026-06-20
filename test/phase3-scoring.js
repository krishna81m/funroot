/**
 * Phase 3: Scoring engine + all evaluators, boundary cases.
 */
const path = require('path')
const ROOT = process.cwd()
let pass = 0; let fail = 0
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++ }
  else { console.error('  FAIL:', msg); fail++ }
}
function eq(a, b, msg) { assert(a === b, `${msg} (got ${a}, expected ${b})`) }

console.log('\n=== Phase 3: Scoring & Evaluators ===\n')

// ── Scoring ──
const { calculatePoints, applyStreak } = require('../lib/engine/scoring')

// Decay formula: points = round(multiplier * 1000 * (1 - t/(2*T)))
eq(calculatePoints(1, 0, 30000), 1000, 'Perfect speed → 1000pts')
eq(calculatePoints(1, 30000, 30000), 500, 'At buzzer (t=T) → 500pts')
eq(calculatePoints(1, 60000, 30000), 0, 'Past buzzer (t=2T) → 0pts')  // 1 - 60k/(2*30k) = 1-1 = 0
eq(calculatePoints(2, 0, 20000), 2000, 'Multiplier x2, perfect → 2000pts')
eq(calculatePoints(0, 0, 20000), 0, 'Multiplier 0 → always 0')
eq(calculatePoints(1, 15000, 30000), 750, 'Halfway through time → 750pts')

// Streak bonuses
eq(applyStreak(1000, 0), 1000, 'streak 0 → no bonus')
eq(applyStreak(1000, 1), 1000, 'streak 1 → no bonus')
eq(applyStreak(800, 2), 900, 'streak 2 → +100')
eq(applyStreak(800, 3), 1000, 'streak 3 → +200')
eq(applyStreak(800, 4), 1100, 'streak 4 → +300')
eq(applyStreak(800, 5), 1300, 'streak 5 → +500')
eq(applyStreak(800, 99), 1300, 'streak >5 → +500 cap')

// ── Quiz evaluator ──
const quiz = require('../lib/engine/evaluators/quiz')
assert(quiz.evaluate({ correctIndices: [1, 2] }, { selected: [1, 2] }).isCorrect, 'quiz: exact multi-select correct')
assert(quiz.evaluate({ correctIndices: [1, 2] }, { selected: [2, 1] }).isCorrect, 'quiz: order-independent set match')
assert(!quiz.evaluate({ correctIndices: [1, 2] }, { selected: [1] }).isCorrect, 'quiz: partial selection incorrect')
assert(!quiz.evaluate({ correctIndices: [1] }, { selected: [1, 2] }).isCorrect, 'quiz: extra selection incorrect')
assert(quiz.evaluate({ correctIndices: [0] }, { selected: [0] }).isCorrect, 'quiz: single correct')

// ── True/False evaluator ──
const tf = require('../lib/engine/evaluators/trueFalse')
assert(tf.evaluate({ correctIndex: 0 }, { selected: [0] }).isCorrect, 'tf: true correct')
assert(tf.evaluate({ correctIndex: 1 }, { selected: [1] }).isCorrect, 'tf: false correct')
assert(!tf.evaluate({ correctIndex: 0 }, { selected: [1] }).isCorrect, 'tf: wrong answer')

// ── Type Answer evaluator ──
const ta = require('../lib/engine/evaluators/typeAnswer')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Paris' }).isCorrect, 'ta: exact match')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'paris' }).isCorrect, 'ta: case insensitive')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: '  Paris  ' }).isCorrect, 'ta: trim whitespace')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Pari' }).isCorrect, 'ta: Levenshtein 1 (drop last char)')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Parie' }).isCorrect, 'ta: Levenshtein 1 (sub last char)')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Pariss' }).isCorrect, 'ta: Levenshtein 1 (extra char)')
assert(!ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'London' }).isCorrect, 'ta: completely wrong')
assert(ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Pars' }).isCorrect, 'ta: Levenshtein 1 (delete i) — "pars" vs "paris" = 1 edit')
assert(!ta.evaluate({ acceptedAnswers: ['Paris'] }, { text: 'Par' }).isCorrect, 'ta: Levenshtein 2 (delete is) — "par" vs "paris" = 2 edits, outside threshold')
assert(ta.evaluate({ acceptedAnswers: ['yes', 'correct', 'affirmative'] }, { text: 'YES' }).isCorrect, 'ta: multiple accepted answers')

// ── Slider evaluator ──
const slider = require('../lib/engine/evaluators/slider')
const s1 = slider.evaluate({ correctValue: 1989, min: 1950, max: 2000, tolerance: 5 }, { value: 1989 })
eq(s1.accuracy, 1, 'slider: exact answer → accuracy 1.0')
assert(s1.isCorrect === true, 'slider: exact answer isCorrect')
const s2 = slider.evaluate({ correctValue: 1989, min: 1950, max: 2000, tolerance: 5 }, { value: 1991 })
assert(s2.accuracy > 0 && s2.accuracy < 1, 'slider: within tolerance → partial accuracy')
const s3 = slider.evaluate({ correctValue: 1989, min: 1950, max: 2000, tolerance: 5 }, { value: 1994 })
eq(s3.accuracy, 0, 'slider: outside tolerance → accuracy 0')
const s4 = slider.evaluate({ correctValue: 50, min: 0, max: 100 }, { value: 55 })  // default tolerance = 10
assert(s4.accuracy > 0, 'slider: default tolerance (10% of range) = 10, within tolerance')
const s5 = slider.evaluate({ correctValue: 50, min: 0, max: 100 }, { value: 61 })
eq(s5.accuracy, 0, 'slider: default tolerance, 11 off → accuracy 0')

// ── Puzzle evaluator ──
const puzzle = require('../lib/engine/evaluators/puzzle')
assert(puzzle.evaluate({ correctOrder: [0, 1, 2, 3] }, { order: [0, 1, 2, 3] }).isCorrect, 'puzzle: exact order correct')
assert(!puzzle.evaluate({ correctOrder: [0, 1, 2, 3] }, { order: [0, 1, 3, 2] }).isCorrect, 'puzzle: swapped 2 elements incorrect')
assert(!puzzle.evaluate({ correctOrder: [0, 1, 2, 3] }, { order: [1, 0, 2, 3] }).isCorrect, 'puzzle: swapped first 2 incorrect')
assert(!puzzle.evaluate({ correctOrder: [0, 1, 2] }, { order: [0, 1] }).isCorrect, 'puzzle: missing element incorrect')
assert(!puzzle.evaluate({ correctOrder: [0, 1, 2] }, { order: [0, 1, 2, 3] }).isCorrect, 'puzzle: extra element incorrect')

// ── Unscored aggregators ──
const { aggregatePoll, aggregateWordCloud, aggregateBrainstorm, aggregateOpenEnded } = require('../lib/engine/evaluators/unscored')

const pollAgg = {}
aggregatePoll(pollAgg, { selected: [0] })
aggregatePoll(pollAgg, { selected: [0] })
aggregatePoll(pollAgg, { selected: [1] })
eq(pollAgg[0], 2, 'poll: option 0 count = 2')
eq(pollAgg[1], 1, 'poll: option 1 count = 1')

const wcAgg = {}
aggregateWordCloud(wcAgg, { word: 'happy' })
aggregateWordCloud(wcAgg, { word: 'Happy' })  // should normalize
aggregateWordCloud(wcAgg, { word: 'sad' })
eq(wcAgg['happy'], 2, 'wordcloud: case-normalized count = 2')
eq(wcAgg['sad'], 1, 'wordcloud: sad count = 1')

const brainAgg = { ideas: [], votes: {} }
aggregateBrainstorm(brainAgg, { ideas: ['idea A', 'idea B'] }, 'COLLECT')
aggregateBrainstorm(brainAgg, { ideas: ['idea C'] }, 'COLLECT')
eq(brainAgg.ideas.length, 3, 'brainstorm: 3 ideas collected')
aggregateBrainstorm(brainAgg, { votes: ['idea A', 'idea A'] }, 'VOTE')
eq(brainAgg.votes['idea A'], 2, 'brainstorm: vote tally')

const oeAgg = []
aggregateOpenEnded(oeAgg, { text: 'First response' })
aggregateOpenEnded(oeAgg, { text: 'Second response' })
eq(oeAgg.length, 2, 'openended: 2 submissions collected')

// ── Full round-trip: submit answer through engine ──
const engine = require('../lib/engine/GameEngine')
require('../lib/ws/socketServer')

const session = engine.createSession('demo-360')
engine.addPlayer(session.pin, { socketId: 'px', identifier: null, nickname: 'Tester' })
engine.startGame(session.pin) // LOBBY → SLIDE (first item)
// Advance to question
engine.nextItem(session.pin)   // SLIDE → QUESTION_READING
engine.skipCurrent(session.pin) // QUESTION_READING → QUESTION_ACTIVE

const pin = session.pin
const item = session.quiz.items[session.currentItemIndex]
assert(item.type === 'quiz', 'Round-trip: at quiz question')

engine.submitAnswer(pin, 'px', { questionId: item.id, answer: { selected: [1, 2] } })
const player = session.players.get('px')
const histEntry = session.playerHistory.get('px')
assert(histEntry.length === 1, 'Round-trip: answer logged in history')
assert(histEntry[0].isCorrect === true, 'Round-trip: marked correct')
assert(histEntry[0].pointsEarned > 0, 'Round-trip: earned points')
assert(player.score > 0, 'Round-trip: score incremented on player')
eq(player.streak, 1, 'Round-trip: streak = 1 after first correct')

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
