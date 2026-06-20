import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const QUIZ_DIR = path.join(process.cwd(), 'data/quizzes')

export async function GET(req, { params }) {
  const auth = req.headers.get('x-admin-password')
  if (auth !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const safeId = decodeURIComponent(id).replace(/[^a-zA-Z0-9-_]/g, '_')
  try {
    const data = await fs.readFile(path.join(QUIZ_DIR, `${safeId}.json`), 'utf8')
    return new Response(data, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
