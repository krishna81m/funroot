/**
 * Phase 8: Admin quiz-builder API verification.
 * - Login with correct and wrong password
 * - Create a new quiz via POST /api/admin/quizzes
 * - Verify it appears in GET /api/quizzes (engine hot-reload)
 * - Verify it can be hosted (createSession with new quiz)
 * - Read back via GET /api/admin/quiz/:id
 * - Delete via DELETE /api/admin/quizzes/:id
 * - Verify it disappears from catalog
 */
const fs = require('fs')
const path = require('path')

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin123'
const WRONG_PW = 'wrongpassword'

let pass = 0, fail = 0
function assert(c, msg) { if (c) { console.log('  PASS:', msg); pass++ } else { console.error('  FAIL:', msg); fail++ } }
function eq(a, b, msg) { assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`) }

async function get(url, headers = {}) {
  return fetch(`${BASE}${url}`, { headers })
}
async function post(url, body, headers = {}) {
  return fetch(`${BASE}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
async function del(url, headers = {}) {
  return fetch(`${BASE}${url}`, { method: 'DELETE', headers })
}

const TEST_QUIZ = {
  id: 'test-admin-quiz',
  title: 'Admin Test Quiz',
  description: 'Created by Phase 8 test',
  requiresIdentifier: false,
  items: [
    {
      id: 'q1',
      orderIndex: 0,
      type: 'quiz',
      text: 'What is 2+2?',
      options: ['3', '4', '5', '6'],
      correctIndices: [1],
      timeLimit: 15,
      pointsMultiplier: 1,
      mediaUrl: null,
    },
    {
      id: 'q2',
      orderIndex: 1,
      type: 'truefalse',
      text: 'The sky is blue.',
      options: ['True', 'False'],
      correctIndex: 0,
      timeLimit: 10,
      pointsMultiplier: 1,
      mediaUrl: null,
    },
  ],
}

async function run() {
  console.log('\n=== Phase 8: Admin Quiz Builder ===\n')

  // ── Auth ──
  const loginOk = await post('/api/admin/login', { password: ADMIN_PW })
  eq(loginOk.status, 200, 'Login with correct password → 200')
  const loginBad = await post('/api/admin/login', { password: WRONG_PW })
  eq(loginBad.status, 401, 'Login with wrong password → 401')

  // ── Unauthorized quiz save ──
  const unauthedSave = await post('/api/admin/quizzes', TEST_QUIZ, { 'x-admin-password': WRONG_PW })
  eq(unauthedSave.status, 401, 'Save quiz without auth → 401')

  // ── Create quiz ──
  const saveRes = await post('/api/admin/quizzes', TEST_QUIZ, { 'x-admin-password': ADMIN_PW })
  eq(saveRes.status, 200, 'Save quiz with auth → 200')
  const saveBody = await saveRes.json()
  assert(saveBody.ok === true, 'Save response has ok:true')
  eq(saveBody.id, 'test-admin-quiz', 'Save response has correct id')

  // File was written to disk
  const quizFile = path.join(process.cwd(), 'data/quizzes/test-admin-quiz.json')
  assert(fs.existsSync(quizFile), 'Quiz JSON file written to disk')
  const fileContent = JSON.parse(fs.readFileSync(quizFile, 'utf8'))
  eq(fileContent.title, 'Admin Test Quiz', 'File content has correct title')
  eq(fileContent.items.length, 2, 'File has 2 items')

  // ── Engine hot-reload: new quiz appears in catalog ──
  const catalogRes = await get('/api/quizzes')
  const catalog = await catalogRes.json()
  const found = catalog.find(q => q.id === 'test-admin-quiz')
  assert(found != null, 'New quiz appears in /api/quizzes catalog (hot-reloaded)')
  eq(found.title, 'Admin Test Quiz', 'Catalog entry has correct title')

  // ── Host a game with the new quiz ──
  const sessionRes = await post('/api/sessions', { quizId: 'test-admin-quiz' })
  eq(sessionRes.status, 200, 'Can create session with new quiz')
  const { pin } = await sessionRes.json()
  assert(pin && pin.length === 6, `Session PIN is 6 digits (got ${pin})`)

  // ── Read back quiz for editing ──
  const readRes = await get('/api/admin/quiz/test-admin-quiz', { 'x-admin-password': ADMIN_PW })
  eq(readRes.status, 200, 'GET /api/admin/quiz/:id returns 200')
  const readQuiz = await readRes.json()
  eq(readQuiz.id, 'test-admin-quiz', 'Read-back has correct id')
  eq(readQuiz.items.length, 2, 'Read-back has 2 items')

  // Unauthorized read
  const unauthedRead = await get('/api/admin/quiz/test-admin-quiz', { 'x-admin-password': WRONG_PW })
  eq(unauthedRead.status, 401, 'Unauthorized read → 401')

  // ── Validation: missing required fields ──
  const badQuizRes = await post('/api/admin/quizzes', { title: 'No items or id' }, { 'x-admin-password': ADMIN_PW })
  eq(badQuizRes.status, 400, 'Quiz without id/items → 400')

  // ── Delete quiz ──
  const deleteRes = await del('/api/admin/quizzes/test-admin-quiz', { 'x-admin-password': ADMIN_PW })
  eq(deleteRes.status, 200, 'Delete quiz → 200')
  assert(!fs.existsSync(quizFile), 'Quiz file removed from disk after delete')

  // Verify it's gone from catalog
  const afterDelete = await get('/api/quizzes')
  const afterCatalog = await afterDelete.json()
  const stillThere = afterCatalog.find(q => q.id === 'test-admin-quiz')
  assert(stillThere == null, 'Deleted quiz no longer in /api/quizzes catalog')

  // Delete non-existent quiz
  const del404 = await del('/api/admin/quizzes/test-admin-quiz', { 'x-admin-password': ADMIN_PW })
  eq(del404.status, 404, 'Delete non-existent quiz → 404')

  // ── Admin pages render ──
  const adminPage = await get('/admin')
  eq(adminPage.status, 200, '/admin page renders')
  const newPage = await get('/admin/quiz/new')
  eq(newPage.status, 200, '/admin/quiz/new page renders')

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
