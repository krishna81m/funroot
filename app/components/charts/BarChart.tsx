'use client'

interface Bar { label: string; count: number; color?: string }

const COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#f97316']

export function BarChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.count), 1)
  return (
    <div className="flex items-end gap-3 h-40 mt-4">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1">
          <span className="text-xs text-gray-400">{bar.count}</span>
          <div
            className="w-full rounded-t-lg transition-all duration-500"
            style={{
              height: `${Math.max(4, (bar.count / max) * 100)}%`,
              backgroundColor: bar.color ?? COLORS[i % COLORS.length],
            }}
          />
          <span className="text-xs text-center text-gray-300 truncate w-full">{bar.label}</span>
        </div>
      ))}
    </div>
  )
}
