const { validate } = require('./contracts')
const { registerHost, registerPlayer, deregister, send } = require('./socketServer')
const engine = require('../engine/GameEngine')

let _nextId = 1
function nextSocketId() { return `s${_nextId++}` }

function socketRouter(ws, req, wss) {
  const socketId = nextSocketId()
  let sessionPin = null
  let role = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch {
      return send(ws, 'server:error', { code: 'BAD_JSON', message: 'Invalid JSON' })
    }

    const { event, payload } = msg
    const { success, data, error } = validate(event, payload)
    if (!success) {
      return send(ws, 'server:error', { code: 'VALIDATION', message: error })
    }

    try {
      handle(ws, socketId, event, data, (pin, r) => {
        sessionPin = pin
        role = r
      })
    } catch (e) {
      send(ws, 'server:error', { code: 'ENGINE', message: e.message })
    }
  })

  ws.on('close', () => {
    if (!sessionPin) return
    deregister(sessionPin, socketId, role)
    if (role === 'PLAYER') {
      const session = engine.sessions.get(sessionPin)
      if (session) {
        const player = session.players.get(socketId)
        if (player) player.connected = false
      }
    }
  })
}

function handle(ws, socketId, event, data, register) {
  switch (event) {
    case 'client:join': {
      const { pin, role, identifier, nickname } = data
      register(pin, role)
      if (role === 'HOST') {
        registerHost(pin, ws)
        const session = engine.getSession(pin)
        send(ws, 'server:state_sync', {
          status: session.status,
          currentItemIndex: session.currentItemIndex,
          timeRemaining: session.timeRemaining,
          playerCount: session.players.size,
          item: engine.sessions.get(pin)?.quiz?.items?.[session.currentItemIndex] ?? null,
          revealActive: session.revealActive,
          players: engine.publicPlayers(session),
          quizzes: engine.listQuizzes(),
        })
      } else {
        // Try reconnect first, then new join
        let session
        try {
          session = engine.reconnectPlayer(pin, { socketId, identifier, nickname })
        } catch {
          session = engine.addPlayer(pin, { socketId, identifier, nickname })
        }
        registerPlayer(pin, socketId, ws)
        send(ws, 'server:state_sync', {
          status: session.status,
          currentItemIndex: session.currentItemIndex,
          timeRemaining: session.timeRemaining,
          item: null, // will receive next sync
        })
      }
      break
    }
    case 'client:submit_answer':
      engine.submitAnswer(data.pin, socketId, { questionId: data.questionId, answer: data.answer })
      break
    case 'host:start':     engine.startGame(data.pin); break
    case 'host:next_item': engine.nextItem(data.pin); break
    case 'host:skip':      engine.skipCurrent(data.pin); break
    case 'host:pause':     engine.pauseGame(data.pin); break
    case 'host:resume':    engine.resumeGame(data.pin); break
    case 'host:reveal':    engine.revealToggle(data.pin); break
    case 'host:kick':      engine.kickPlayer(data.pin, data.socketId); break
    case 'host:brainstorm_vote': {
      const session = engine.getSession(data.pin)
      session.brainstormSubPhase = 'VOTE'
      break
    }
    case 'host:end': {
      const session = engine.getSession(data.pin)
      engine.skipCurrent(data.pin)
      break
    }
    default:
      send(ws, 'server:error', { code: 'UNKNOWN_EVENT', message: `Unknown event: ${event}` })
  }
}

module.exports = { socketRouter }
