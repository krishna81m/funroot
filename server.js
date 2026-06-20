const { createServer } = require('http')
const next = require('next')
const { WebSocketServer } = require('ws')
const { socketRouter } = require('./lib/ws/router')
const engine = require('./lib/engine/GameEngine')
const { REPORT_DIR } = require('./lib/engine/ReportBuilder')
const fs = require('fs')
const path = require('path')
const log = require('./lib/logger')

const QUIZ_DIR = path.join(__dirname, 'data/quizzes')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

const dev = process.env.NODE_ENV !== 'production'
// In production (Render/Docker) bind all interfaces so health checks can reach us
const hostname = process.env.HOST || (dev ? 'localhost' : '0.0.0.0')
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// ── Inline API router (keeps engine out of Next.js Turbopack bundle) ──────────
function apiRouter(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const { pathname } = url

  res.setHeader('Content-Type', 'application/json')

  // GET /api/quizzes
  if (req.method === 'GET' && pathname === '/api/quizzes') {
    return res.end(JSON.stringify(engine.listQuizzes()))
  }

  // POST /api/sessions
  if (req.method === 'POST' && pathname === '/api/sessions') {
    return readBody(req, (body) => {
      try {
        const { quizId } = JSON.parse(body)
        const session = engine.createSession(quizId)
        res.end(JSON.stringify({ pin: session.pin }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  }

  // GET /api/report/:pin?format=json|csv
  const reportMatch = pathname.match(/^\/api\/report\/(\d{6})\/(json|csv)$/)
  if (req.method === 'GET' && reportMatch) {
    const [, pin, fmt] = reportMatch
    const file = path.join(REPORT_DIR, `${pin}.${fmt}`)
    try {
      const data = fs.readFileSync(file, 'utf8')
      res.setHeader('Content-Type', fmt === 'csv' ? 'text/csv' : 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="report-${pin}.${fmt}"`)
      return res.end(data)
    } catch {
      res.statusCode = 404
      return res.end(JSON.stringify({ error: 'Report not found' }))
    }
  }

  // ── Admin API (password-protected) ────────────────────────────────────────
  // GET /api/admin/quiz/:id  (load full quiz for editing)
  const adminQuizMatch = pathname.match(/^\/api\/admin\/quiz\/(.+)$/)
  if (req.method === 'GET' && adminQuizMatch) {
    const auth = req.headers['x-admin-password']
    if (auth !== ADMIN_PASSWORD) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorized' })) }
    const quizId = decodeURIComponent(adminQuizMatch[1])
    const safeId = quizId.replace(/[^a-zA-Z0-9-_]/g, '_')
    const filePath = path.join(QUIZ_DIR, `${safeId}.json`)
    try {
      const data = fs.readFileSync(filePath, 'utf8')
      return res.end(data)
    } catch {
      res.statusCode = 404; return res.end(JSON.stringify({ error: 'Not found' }))
    }
  }

  // POST /api/admin/login
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    return readBody(req, (body) => {
      const { password } = JSON.parse(body)
      if (password === ADMIN_PASSWORD) {
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.statusCode = 401
        res.end(JSON.stringify({ error: 'Invalid password' }))
      }
    })
  }

  // POST /api/admin/quizzes  (save new quiz JSON)
  if (req.method === 'POST' && pathname === '/api/admin/quizzes') {
    const auth = req.headers['x-admin-password']
    if (auth !== ADMIN_PASSWORD) {
      res.statusCode = 401
      return res.end(JSON.stringify({ error: 'Unauthorized' }))
    }
    return readBody(req, (body) => {
      try {
        const quiz = JSON.parse(body)
        if (!quiz.id || !quiz.title || !Array.isArray(quiz.items)) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Quiz must have id, title, and items[]' }))
        }
        // Sanitize id for filename
        const safeId = quiz.id.replace(/[^a-zA-Z0-9-_]/g, '_')
        const filePath = path.join(QUIZ_DIR, `${safeId}.json`)
        fs.writeFileSync(filePath, JSON.stringify(quiz, null, 2))
        // Hot-reload into engine catalog
        engine.reloadQuiz(quiz)
        res.end(JSON.stringify({ ok: true, id: quiz.id }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  }

  // DELETE /api/admin/quizzes/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/quizzes/')) {
    const auth = req.headers['x-admin-password']
    if (auth !== ADMIN_PASSWORD) {
      res.statusCode = 401
      return res.end(JSON.stringify({ error: 'Unauthorized' }))
    }
    const quizId = pathname.replace('/api/admin/quizzes/', '')
    const safeId = quizId.replace(/[^a-zA-Z0-9-_]/g, '_')
    const filePath = path.join(QUIZ_DIR, `${safeId}.json`)
    try {
      fs.unlinkSync(filePath)
      engine.removeQuiz(quizId)
      res.end(JSON.stringify({ ok: true }))
    } catch (e) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Quiz not found' }))
    }
    return
  }

  return null // not an API route
}

function readBody(req, cb) {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => cb(body))
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      // Intercept API calls before Next.js handles them
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.pathname.startsWith('/api/')) {
        const handled = apiRouter(req, res)
        if (handled !== null) return
      }
      handle(req, res)
    } catch (err) {
      log.error('server', `Handler error: ${err.message}`)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws, req) => {
    socketRouter(ws, req, wss)
  })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }
    // For all other paths (e.g. /_next/webpack-hmr), do nothing —
    // Next.js registers its own upgrade listener on the same server
    // and handles HMR WebSockets itself. Calling socket.destroy() here
    // was killing the Turbopack HMR connection, which prevented React
    // from completing hydration and blocked all useEffect calls.
  })

  server.listen(port, hostname, () => {
    log.info('server', `Ready on http://${hostname}:${port}`)
    log.info('server', `WebSocket endpoint: ws://${hostname}:${port}/ws`)
  })
})
