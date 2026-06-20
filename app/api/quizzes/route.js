import { NextResponse } from 'next/server'
import demoQuiz from '../../../data/quizzes/demo-360.json'

export async function GET() {
  try {
    const engine = require('../../../lib/engine/GameEngine')
    return NextResponse.json(engine.listQuizzes())
  } catch {
    // Vercel serverless: filesystem unavailable, return bundled quiz data
    return NextResponse.json([demoQuiz])
  }
}
