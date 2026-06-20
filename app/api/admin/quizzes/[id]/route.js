import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const QUIZ_DIR = path.join(process.cwd(), 'data/quizzes')

export async function DELETE(req, { params }) {
  const auth = req.headers.get('x-admin-password')
  if (auth !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_')
  try {
    await fs.unlink(path.join(QUIZ_DIR, `${safeId}.json`))
    const engine = require('../../../../../lib/engine/GameEngine')
    engine.removeQuiz(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  }
}
