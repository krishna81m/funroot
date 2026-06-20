/**
 * Manages per-session countdown timers.
 * All state mutations (session.timeRemaining, session.activeTimer, session.pausedAt)
 * are synchronous — no await in the hot path so the event-loop single-thread
 * guarantee covers concurrent players without additional locking.
 */
class TimerService {
  /**
   * @param {number} durationMs
   * @param {Function} onTick  called every second with remaining ms
   * @param {Function} onExpire  called when timer reaches 0
   * @returns {{ clear: Function, pause: Function, resume: Function }}
   */
  static start(session, durationMs, onTick, onExpire) {
    session.timeRemaining = durationMs
    session.pausedAt = null

    const tick = () => {
      session.timeRemaining = Math.max(0, session.timeRemaining - 1000)
      onTick(session.timeRemaining)
      if (session.timeRemaining <= 0) {
        session.activeTimer = null
        onExpire()
      } else {
        session.activeTimer = setTimeout(tick, 1000)
      }
    }

    session.activeTimer = setTimeout(tick, 1000)
  }

  static pause(session) {
    if (session.activeTimer) {
      clearTimeout(session.activeTimer)
      session.activeTimer = null
      session.pausedAt = Date.now()
    }
  }

  static resume(session, onTick, onExpire) {
    if (session.pausedAt !== null && session.timeRemaining > 0) {
      session.pausedAt = null
      TimerService.start(session, session.timeRemaining, onTick, onExpire)
    }
  }

  static clear(session) {
    if (session.activeTimer) {
      clearTimeout(session.activeTimer)
      session.activeTimer = null
    }
    session.pausedAt = null
  }
}

module.exports = { TimerService }
