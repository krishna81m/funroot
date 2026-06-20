import { NextResponse } from 'next/server'

export async function GET() {
  const engine = require('../../../lib/engine/GameEngine')
  return NextResponse.json(engine.listQuizzes())
}
