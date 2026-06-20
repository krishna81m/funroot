import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const QUIZ_DIR = path.join(process.cwd(), 'data/quizzes')

export async function POST(req) {
  const auth = req.headers.get('x-admin-password')
  if (auth !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const quiz = await req.json()
    if (!quiz.id || !quiz.title || !Array.isArray(quiz.items)) {
      return NextResponse.json({ error: 'Quiz must have id, title, and items[]' }, { status: 400 })
    }
    const safeId = quiz.id.replace(/[^a-zA-Z0-9-_]/g, '_')
    const filePath = path.join(QUIZ_DIR, `${safeId}.json`)
    await fs.writeFile(filePath, JSON.stringify(quiz, null, 2))
    const engine = require('../../../../lib/engine/GameEngine')
    engine.reloadQuiz(quiz)
    return NextResponse.json({ ok: true, id: quiz.id })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
