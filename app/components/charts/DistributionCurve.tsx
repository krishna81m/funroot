'use client'

interface Bucket { rangeStart: number; count: number }

export function DistributionCurve({ buckets, correctValue }: { buckets: Bucket[]; correctValue: number }) {
  if (!buckets?.length) return null
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const width = 400
  const height = 120
  const barW = width / buckets.length

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      {buckets.map((b, i) => {
        const h = (b.count / max) * height
        const x = i * barW
        const isCorrect = Math.abs(b.rangeStart - correctValue) < barW
        return (
          <rect
            key={i}
            x={x + 1}
            y={height - h}
            width={barW - 2}
            height={h}
            fill={isCorrect ? '#22c55e' : '#6366f1'}
            rx={2}
          />
        )
      })}
    </svg>
  )
}
