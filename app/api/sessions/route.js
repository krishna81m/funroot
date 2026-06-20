import { NextResponse } from 'next/server'
import demoQuiz from '../../../data/quizzes/demo-360.json'

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const { quizId } = body

  try {
    const engine = require('../../../lib/engine/GameEngine')
    const session = engine.createSession(quizId)
    return NextResponse.json({ pin: session.pin })
  } catch {
    // Vercel serverless: engine unavailable; validate quizId against bundled data
    const known = [demoQuiz.id]
    if (!quizId || !known.includes(quizId)) {
      return NextResponse.json({ error: `Quiz '${quizId}' not found` }, { status: 400 })
    }
    return NextResponse.json({ pin: generatePin() })
  }
}
