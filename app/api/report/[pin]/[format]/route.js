import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const REPORT_DIR = path.join(os.tmpdir(), 'kahoot360-reports')

export async function GET(req, { params }) {
  const { pin, format } = await params
  const file = path.join(REPORT_DIR, `${pin}.${format}`)
  try {
    const data = await fs.readFile(file, 'utf8')
    const contentType = format === 'csv' ? 'text/csv' : 'application/json'
    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="report-${pin}.${format}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }
}
