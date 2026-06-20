'use client'
import { useEffect, useRef } from 'react'

interface WordFreq { [word: string]: number }

export function WordCloudCanvas({ frequencies }: { frequencies: WordFreq }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const entries = Object.entries(frequencies).sort((a, b) => b[1] - a[1]).slice(0, 40)
    if (!entries.length) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const max = entries[0][1]
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    const placed: { x: number; y: number; w: number; h: number }[] = []
    const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']

    for (const [word, count] of entries) {
      const size = Math.max(12, Math.round((count / max) * 48))
      ctx.font = `bold ${size}px sans-serif`
      ctx.fillStyle = COLORS[Math.floor(Math.random() * COLORS.length)]
      const tw = ctx.measureText(word).width

      let placed_ = false
      for (let r = 0; r < 200; r += 4) {
        const angle = r * 0.5
        const x = cx + r * Math.cos(angle) - tw / 2
        const y = cy + r * Math.sin(angle) + size / 2
        const box = { x, y: y - size, w: tw, h: size }
        const overlap = placed.some(
          (p) => !(box.x + box.w < p.x || box.x > p.x + p.w || box.y + box.h < p.y || box.y > p.y + p.h)
        )
        if (!overlap && x > 0 && y > 0 && x + tw < canvas.width && y < canvas.height) {
          ctx.fillText(word, x, y)
          placed.push(box)
          placed_ = true
          break
        }
      }
    }
  }, [frequencies])

  return <canvas ref={canvasRef} width={600} height={300} className="w-full rounded-xl bg-gray-900" />
}
