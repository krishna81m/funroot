import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

export async function POST(req) {
  try {
    const { password } = await req.json()
    if (password === ADMIN_PASSWORD) {
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
