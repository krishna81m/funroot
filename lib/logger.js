'use strict'

const fs = require('fs')
const path = require('path')

// Try project-local logs/ first; fall back to /tmp if the filesystem is read-only (Vercel)
let logFile = null
const candidates = [
  path.join(__dirname, '../logs/app.log'),
  '/tmp/kahoot-app.log',
]
for (const p of candidates) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    logFile = fs.createWriteStream(p, { flags: 'a' })
    break
  } catch { /* try next */ }
}

function write(level, tag, msg) {
  const line = `${new Date().toISOString()} [${level}] [${tag}] ${msg}`
  console.log(line)
  if (logFile) logFile.write(line + '\n')
}

module.exports = {
  info:  (tag, msg) => write('INFO ', tag, msg),
  warn:  (tag, msg) => write('WARN ', tag, msg),
  error: (tag, msg) => write('ERROR', tag, msg),
}
