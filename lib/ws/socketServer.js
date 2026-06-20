const { setBroadcast } = require('../engine/GameEngine')

// Registry: pin → { host: WebSocket|null, players: Map<socketId, WebSocket> }
const registry = new Map()

function getOrCreateRegistry(pin) {
  if (!registry.has(pin)) registry.set(pin, { host: null, players: new Map() })
  return registry.get(pin)
}

function registerHost(pin, ws) {
  getOrCreateRegistry(pin).host = ws
}

function registerPlayer(pin, socketId, ws) {
  getOrCreateRegistry(pin).players.set(socketId, ws)
}

function deregister(pin, socketId, role) {
  const reg = registry.get(pin)
  if (!reg) return
  if (role === 'HOST') {
    reg.host = null
  } else {
    reg.players.delete(socketId)
  }
}

function send(ws, event, payload) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ event, payload }))
  }
}

// Injected into GameEngine so the engine never imports ws directly.
setBroadcast((pin, event, payload, target) => {
  const reg = registry.get(pin)
  if (!reg) return
  if (target === 'HOST') {
    send(reg.host, event, payload)
  } else if (target === 'PLAYERS') {
    for (const ws of reg.players.values()) send(ws, event, payload)
  } else if (target === 'ALL') {
    send(reg.host, event, payload)
    for (const ws of reg.players.values()) send(ws, event, payload)
  } else if (target.startsWith('SOCKET:')) {
    const id = target.slice(7)
    send(reg.players.get(id) ?? reg.host, event, payload)
  }
})

module.exports = { registerHost, registerPlayer, deregister, send }
