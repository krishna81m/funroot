'use strict'

const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '../logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

const logFile = fs.createWriteStream(path.join(LOG_DIR, 'app.log'), { flags: 'a' })

function write(level, tag, msg) {
  const line = `${new Date().toISOString()} [${level}] [${tag}] ${msg}`
  console.log(line)
  logFile.write(line + '\n')
}

module.exports = {
  info:  (tag, msg) => write('INFO ', tag, msg),
  warn:  (tag, msg) => write('WARN ', tag, msg),
  error: (tag, msg) => write('ERROR', tag, msg),
}
