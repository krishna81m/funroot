'use client'

const NOTE_COLORS = ['bg-yellow-200', 'bg-pink-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200']

interface BrainstormAgg { ideas: string[]; votes: Record<string, number> }

export function StickyNotes({ aggregate, subPhase }: { aggregate: BrainstormAgg; subPhase: 'COLLECT' | 'VOTE' }) {
  const ideas = aggregate?.ideas ?? []
  const votes = aggregate?.votes ?? {}
  const sorted = subPhase === 'VOTE'
    ? [...ideas].sort((a, b) => (votes[b] ?? 0) - (votes[a] ?? 0))
    : ideas

  return (
    <div className="flex flex-wrap gap-3 mt-4 max-h-80 overflow-y-auto">
      {sorted.map((idea, i) => (
        <div
          key={i}
          className={`${NOTE_COLORS[i % NOTE_COLORS.length]} text-gray-800 p-3 rounded shadow text-sm max-w-40 relative`}
        >
          {idea}
          {subPhase === 'VOTE' && votes[idea] && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {votes[idea]}
            </span>
          )}
        </div>
      ))}
      {!ideas.length && <p className="text-gray-500 text-sm">Waiting for ideas…</p>}
    </div>
  )
}
