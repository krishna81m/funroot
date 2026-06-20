import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const { quizId } = await req.json()
    const engine = require('../../../lib/engine/GameEngine')
    const session = engine.createSession(quizId)
    return NextResponse.json({ pin: session.pin })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
