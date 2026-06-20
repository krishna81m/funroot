const { sessions } = require('../engine/GameEngine')

function generatePin() {
  let pin
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000))
  } while (sessions.has(pin))
  return pin
}

module.exports = { generatePin }
