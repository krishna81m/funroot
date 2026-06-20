const STREAK_BONUS = { 2: 100, 3: 200, 4: 300 }
const STREAK_MAX_BONUS = 500

function calculatePoints(multiplier, responseTimeMs, timeLimitMs) {
  if (multiplier === 0) return 0
  const decay = 1 - responseTimeMs / (2 * timeLimitMs)
  return Math.round(multiplier * 1000 * Math.max(0, decay))
}

function applyStreak(basePoints, streak) {
  if (streak < 2) return basePoints
  const bonus = streak >= 5 ? STREAK_MAX_BONUS : (STREAK_BONUS[streak] ?? STREAK_MAX_BONUS)
  return basePoints + bonus
}

module.exports = { calculatePoints, applyStreak }
