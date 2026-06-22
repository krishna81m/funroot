'use client'
import { use, useEffect, useState } from 'react'
import { useGameSocket } from '../../../hooks/useGameSocket'
import { BarChart } from '../../components/charts/BarChart'
import { DistributionCurve } from '../../components/charts/DistributionCurve'
import { WordCloudCanvas } from '../../components/charts/WordCloudCanvas'
import { StickyNotes } from '../../components/charts/StickyNotes'

type Status = 'LOBBY' | 'SLIDE' | 'QUESTION_READING' | 'QUESTION_ACTIVE' | 'PAUSED' | 'RESULTS' | 'LEADERBOARD' | 'FINISHED'

const UNSCORED_TYPES = new Set(['poll', 'wordcloud', 'brainstorm', 'openended'])

export default function HostDashboard({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = use(params)
  const { state, send, connected } = useGameSocket({ pin, role: 'HOST' })

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Connecting to game {pin}…
      </div>
    )
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Loading session…
      </div>
    )
  }

  const status: Status = state.status
  const item = state.item

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-extrabold text-indigo-400 tracking-widest">{pin}</span>
          <span className="text-sm text-gray-500">|</span>
          <span className="text-sm text-gray-400">
            {state.playerCount ?? 0} player{(state.playerCount ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Answer tally bar */}
      {state.tally && (status === 'QUESTION_ACTIVE') && (
        <div className="h-1 bg-gray-800">
          <div
            className="h-1 bg-green-500 transition-all duration-300"
            style={{ width: `${((state.tally.received ?? 0) / Math.max(state.tally.total, 1)) * 100}%` }}
          />
        </div>
      )}

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {status === 'LOBBY' && (
          <LobbyView pin={pin} send={send} players={state.players ?? []} playerCount={state.playerCount ?? 0} />
        )}

        {status === 'SLIDE' && (
          <SlideView pin={pin} send={send} item={item} />
        )}

        {(status === 'QUESTION_READING' || status === 'QUESTION_ACTIVE') && (
          <QuestionView pin={pin} send={send} item={item} status={status} timeRemaining={state.timeRemaining ?? 0} tally={state.tally} />
        )}

        {status === 'PAUSED' && (
          <PausedView pin={pin} send={send} />
        )}

        {status === 'RESULTS' && (
          <ResultsView pin={pin} send={send} item={item} results={state.results} revealActive={state.revealActive} brainstormSubPhase={state.brainstormSubPhase ?? 'COLLECT'} attribution={state.attribution} />
        )}

        {status === 'LEADERBOARD' && (
          <LeaderboardView pin={pin} send={send} leaderboard={state.leaderboard ?? []} attribution={state.attribution} />
        )}

        {status === 'FINISHED' && (
          <FinishedView reportUrls={state.reportUrls} leaderboard={state.leaderboard ?? []} />
        )}
      </main>
    </div>
  )
}

// ── Sub-views ──────────────────────────────────────────────────────────────────

function LobbyView({ pin, send, players, playerCount }: { pin: string; send: Function; players: any[]; playerCount: number }) {
  return (
    <div className="flex flex-col items-center gap-8 mt-12">
      <div className="text-center">
        <p className="text-gray-400 mb-2">Join at <span className="text-white font-semibold">localhost:3000/play</span></p>
        <p className="text-7xl font-extrabold tracking-widest text-indigo-400">{pin}</p>
      </div>

      <div className="w-full max-w-2xl">
        <p className="text-sm text-gray-500 mb-3">{playerCount} player{playerCount !== 1 ? 's' : ''} in lobby</p>
        <div className="flex flex-wrap gap-2">
          {players.map((p: any) => (
            <div key={p.nickname} className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-full text-sm">
              <span>{p.nickname}</span>
              <button
                onClick={() => {
                  if (confirm(`Kick ${p.nickname}?`)) {
                    // Find socketId from state — for lobby display we use nickname as key
                    send('host:kick', { pin, socketId: p.socketId ?? p.nickname })
                  }
                }}
                className="text-red-400 hover:text-red-300 ml-1 text-xs"
                title="Kick player"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => send('host:start', { pin })}
        disabled={playerCount === 0}
        className="bg-green-600 hover:bg-green-500 disabled:opacity-40 px-12 py-5 rounded-2xl text-2xl font-bold transition shadow-lg"
      >
        Start Game
      </button>
    </div>
  )
}

function SlideView({ pin, send, item }: { pin: string; send: Function; item: any }) {
  return (
    <div>
      <div className="bg-gray-800 p-10 rounded-2xl mb-6 min-h-64 flex flex-col justify-center">
        {item?.mediaUrl && (
          <img src={item.mediaUrl} alt="" className="max-h-48 rounded-xl mb-6 mx-auto object-contain" />
        )}
        <h2 className="text-3xl font-bold mb-3">{item?.title}</h2>
        <p className="text-gray-300 text-lg whitespace-pre-wrap">{item?.contentMarkdown}</p>
      </div>
      <HostControls pin={pin} send={send} status="SLIDE" />
    </div>
  )
}

function QuestionView({ pin, send, item, status, timeRemaining, tally }: {
  pin: string; send: Function; item: any; status: string; timeRemaining: number; tally: any
}) {
  const secLeft = Math.ceil((timeRemaining ?? 0) / 1000)
  const isActive = status === 'QUESTION_ACTIVE'

  return (
    <div>
      <div
        className="bg-gray-800 p-8 rounded-2xl mb-4 bg-cover bg-center"
        style={item?.background ? { backgroundImage: `linear-gradient(rgba(17,24,39,0.82), rgba(17,24,39,0.82)), url(${item.background})` } : undefined}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-950 px-3 py-1 rounded-full">
            {item?.type}
          </span>
          {isActive && item?.timeLimit && (
            <div className={`text-4xl font-mono font-bold ${secLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
              {secLeft}s
            </div>
          )}
          {!isActive && (
            <span className="text-yellow-400 text-sm font-semibold animate-pulse">Reading…</span>
          )}
        </div>

        <h2 className="text-2xl font-bold mb-4">{item?.text}</h2>

        {item?.mediaUrl && (
          <img src={item.mediaUrl} alt="" className="max-h-48 rounded-xl mb-4 mx-auto object-contain" />
        )}

        {/* Show options for quiz/truefalse/poll */}
        {['quiz', 'truefalse', 'poll'].includes(item?.type) && (
          <OptionGrid options={item?.options ?? []} correctIndices={item?.correctIndices ?? (item?.correctIndex !== undefined ? [item.correctIndex] : [])} showCorrect={false} />
        )}

        {item?.type === 'slider' && (
          <div className="text-center mt-4">
            <p className="text-gray-400 text-sm mb-1">Range: {item.min} – {item.max}</p>
            <p className="text-indigo-400 font-semibold">Correct: {item.correctValue}</p>
          </div>
        )}

        {item?.type === 'puzzle' && (
          <div className="flex flex-wrap gap-2 mt-4">
            {(item.blocks ?? []).map((b: any) => (
              <span key={b.id} className="bg-gray-700 px-4 py-2 rounded-xl text-sm">{b.label}</span>
            ))}
          </div>
        )}

        {isActive && tally && (
          <p className="text-gray-400 text-sm mt-4">
            {tally.received} / {tally.total} answered
          </p>
        )}
      </div>

      <HostControls pin={pin} send={send} status={status} />
    </div>
  )
}

function PausedView({ pin, send }: { pin: string; send: Function }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-6">
      <div className="text-5xl">⏸</div>
      <p className="text-2xl text-yellow-400 font-bold">Game Paused</p>
      <p className="text-gray-400">Players see "Look at screen" overlay</p>
      <button
        onClick={() => send('host:resume', { pin })}
        className="bg-indigo-600 hover:bg-indigo-500 px-10 py-4 rounded-2xl text-xl font-bold transition"
      >
        Resume
      </button>
    </div>
  )
}

function ResultsView({ pin, send, item, results, revealActive, brainstormSubPhase, attribution }: {
  pin: string; send: Function; item: any; results: any; revealActive: boolean; brainstormSubPhase: 'COLLECT' | 'VOTE'; attribution: any
}) {
  const type = item?.type
  const agg = results?.aggregation ?? item?.aggregation

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Results</h2>
      {item && <p className="text-gray-400 mb-4">{item.text}</p>}

      {/* Scored types: show correct answers */}
      {['quiz', 'truefalse'].includes(type) && (
        <>
          <OptionGrid
            options={item?.options ?? []}
            correctIndices={item?.correctIndices ?? (item?.correctIndex !== undefined ? [item.correctIndex] : [])}
            showCorrect
          />
          {agg && (
            <BarChart
              bars={(item?.options ?? []).map((opt: string, i: number) => ({
                label: opt,
                count: Array.isArray(agg) ? (agg[i] ?? 0) : (agg[String(i)] ?? 0),
              }))}
            />
          )}
        </>
      )}

      {type === 'typeAnswer' && (
        <div>
          <p className="text-green-400 mb-3">
            Accepted: {(item?.acceptedAnswers ?? []).join(', ')}
          </p>
          {revealActive ? (
            <div className="flex flex-wrap gap-2">
              {(results?.submissions ?? []).map((s: string, i: number) => (
                <span key={i} className="bg-gray-700 px-3 py-1 rounded-full text-sm">{s}</span>
              ))}
            </div>
          ) : (
            <button
              onClick={() => send('host:reveal', { pin })}
              className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-semibold"
            >
              Reveal Submissions
            </button>
          )}
        </div>
      )}

      {type === 'slider' && (
        <>
          <p className="text-green-400 mb-3">Correct value: {item?.correctValue}</p>
          {agg?.length && <DistributionCurve buckets={agg} correctValue={item?.correctValue} />}
        </>
      )}

      {type === 'puzzle' && (
        <div className="flex gap-2 flex-wrap">
          {(item?.correctOrder ?? []).map((id: number) => {
            const block = (item?.blocks ?? []).find((b: any) => b.id === id)
            return (
              <span key={id} className="bg-green-800 px-4 py-2 rounded-xl text-sm font-semibold">{block?.label}</span>
            )
          })}
        </div>
      )}

      {type === 'poll' && agg && (
        <BarChart
          bars={(item?.options ?? []).map((opt: string, i: number) => ({
            label: opt,
            count: agg[String(i)] ?? agg[i] ?? 0,
          }))}
        />
      )}

      {type === 'wordcloud' && (
        <>
          {revealActive ? (
            <WordCloudCanvas frequencies={agg ?? {}} />
          ) : (
            <button
              onClick={() => send('host:reveal', { pin })}
              className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-semibold"
            >
              Reveal Word Cloud
            </button>
          )}
        </>
      )}

      {type === 'brainstorm' && (
        <>
          <StickyNotes aggregate={agg ?? { ideas: [], votes: {} }} subPhase={brainstormSubPhase} />
          {brainstormSubPhase === 'COLLECT' && (
            <button
              onClick={() => send('host:brainstorm_vote', { pin })}
              className="mt-4 bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-xl font-semibold"
            >
              Start Voting Phase
            </button>
          )}
        </>
      )}

      {type === 'openended' && (
        <div className="flex flex-col gap-3 mt-2 max-h-72 overflow-y-auto">
          {(agg ?? []).map((text: string, i: number) => (
            <div key={i} className="bg-gray-800 p-4 rounded-xl text-sm">{text}</div>
          ))}
        </div>
      )}

      {/* Attribution — show in RESULTS for unscored types (they don't advance to LEADERBOARD) */}
      {attribution && UNSCORED_TYPES.has(type) && (
        <AnswerAttribution attribution={attribution} />
      )}

      <div className="mt-6">
        <HostControls pin={pin} send={send} status="RESULTS" />
      </div>
    </div>
  )
}

function LeaderboardView({ pin, send, leaderboard, attribution }: { pin: string; send: Function; leaderboard: any[]; attribution: any }) {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-center">Leaderboard</h2>
      <ol className="flex flex-col gap-3 mb-8 max-w-xl mx-auto">
        {leaderboard.map((p: any, i: number) => (
          <li
            key={p.nickname}
            className={`flex items-center gap-4 p-4 rounded-2xl ${i === 0 ? 'bg-yellow-900 border border-yellow-500' : i === 1 ? 'bg-gray-700' : i === 2 ? 'bg-orange-900' : 'bg-gray-800'}`}
          >
            <span className={`text-2xl font-black w-8 text-center ${i === 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {i + 1}
            </span>
            <span className="flex-1 font-semibold text-lg">{p.nickname}</span>
            <span className="font-mono text-yellow-400 text-lg">{p.score?.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {/* Attribution — show in LEADERBOARD for scored types (RESULTS only lasts 100ms) */}
      {attribution && <AnswerAttribution attribution={attribution} />}

      <div className="flex justify-center mt-4">
        <HostControls pin={pin} send={send} status="LEADERBOARD" />
      </div>
    </div>
  )
}

function FinishedView({ reportUrls, leaderboard }: { reportUrls: any; leaderboard: any[] }) {
  return (
    <div className="text-center mt-8">
      <h2 className="text-4xl font-extrabold mb-2">Game Over!</h2>
      <p className="text-gray-400 mb-8">Thanks for playing funroot 360</p>

      {leaderboard.length > 0 && (
        <div className="mb-8">
          <p className="text-yellow-400 text-xl font-bold">Winner: {leaderboard[0]?.nickname} 🏆</p>
        </div>
      )}

      {reportUrls && (
        <div className="flex gap-4 justify-center">
          <a
            href={reportUrls.json}
            download
            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-semibold transition"
          >
            Download JSON Report
          </a>
          <a
            href={reportUrls.csv}
            download
            className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-xl font-semibold transition"
          >
            Download CSV Report
          </a>
        </div>
      )}
    </div>
  )
}

// ── Answer Attribution ─────────────────────────────────────────────────────────

function AnswerAttribution({ attribution }: { attribution: any }) {
  if (!attribution?.answers?.length) return null
  const answers: any[] = attribution.answers
  const correct = answers.filter((a) => a.isCorrect === true)
  const incorrect = answers.filter((a) => a.isCorrect === false)
  const unscored = answers.filter((a) => a.isCorrect === null || a.isCorrect === undefined)
  const withComments = answers.filter((a) => a.comment?.trim())

  return (
    <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Who answered what</h3>

      {correct.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-green-400 font-semibold mb-2">✓ Correct ({correct.length})</p>
          <div className="flex flex-wrap gap-2">
            {correct.map((a) => (
              <span key={a.nickname} className="bg-green-900/60 border border-green-700 text-green-300 text-xs px-3 py-1.5 rounded-full font-semibold">
                {a.nickname} <span className="text-green-500">+{a.pointsEarned?.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {incorrect.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-red-400 font-semibold mb-2">✗ Incorrect ({incorrect.length})</p>
          <div className="flex flex-wrap gap-2">
            {incorrect.map((a) => (
              <span key={a.nickname} className="bg-red-900/40 border border-red-800 text-red-300 text-xs px-3 py-1.5 rounded-full">
                {a.nickname}
              </span>
            ))}
          </div>
        </div>
      )}

      {unscored.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-indigo-400 font-semibold mb-2">Responded ({unscored.length})</p>
          <div className="flex flex-wrap gap-2">
            {unscored.map((a) => (
              <span key={a.nickname} className="bg-indigo-900/40 border border-indigo-800 text-indigo-300 text-xs px-3 py-1.5 rounded-full">
                {a.nickname}
              </span>
            ))}
          </div>
        </div>
      )}

      {withComments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 font-semibold mb-3">💬 Player thoughts</p>
          <div className="flex flex-col gap-2">
            {withComments.map((a) => (
              <div key={a.nickname} className="flex gap-2 text-sm">
                <span className="text-gray-500 font-semibold shrink-0">{a.nickname}:</span>
                <span className="text-gray-300 italic">"{a.comment}"</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────────────────────

const OPTION_COLORS = [
  'bg-red-600 hover:bg-red-500',
  'bg-blue-600 hover:bg-blue-500',
  'bg-yellow-500 hover:bg-yellow-400',
  'bg-green-600 hover:bg-green-500',
  'bg-purple-600 hover:bg-purple-500',
  'bg-orange-500 hover:bg-orange-400',
]

function OptionGrid({ options, correctIndices, showCorrect }: {
  options: string[]
  correctIndices: number[]
  showCorrect: boolean
}) {
  const correctSet = new Set(correctIndices)
  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      {options.map((opt, i) => {
        const isCorrect = correctSet.has(i)
        return (
          <div
            key={i}
            className={`${OPTION_COLORS[i % OPTION_COLORS.length]} ${showCorrect && isCorrect ? 'ring-4 ring-white' : ''} ${showCorrect && !isCorrect ? 'opacity-50' : ''} rounded-xl px-4 py-3 font-semibold text-sm transition`}
          >
            {opt} {showCorrect && isCorrect && '✓'}
          </div>
        )
      })}
    </div>
  )
}

function HostControls({ pin, send, status }: { pin: string; send: Function; status: string }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {['QUESTION_READING', 'QUESTION_ACTIVE'].includes(status) && (
        <button
          onClick={() => send('host:pause', { pin })}
          className="bg-yellow-600 hover:bg-yellow-500 px-5 py-2 rounded-xl font-semibold transition text-sm"
        >
          Pause
        </button>
      )}
      {['QUESTION_ACTIVE', 'QUESTION_READING', 'SLIDE'].includes(status) && (
        <button
          onClick={() => send('host:skip', { pin })}
          className="bg-orange-600 hover:bg-orange-500 px-5 py-2 rounded-xl font-semibold transition text-sm"
        >
          Skip
        </button>
      )}
      {['RESULTS', 'LEADERBOARD', 'SLIDE'].includes(status) && (
        <button
          onClick={() => send('host:next_item', { pin })}
          className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-bold transition"
        >
          Next →
        </button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    LOBBY: 'bg-gray-700 text-gray-300',
    SLIDE: 'bg-blue-900 text-blue-300',
    QUESTION_READING: 'bg-yellow-900 text-yellow-300',
    QUESTION_ACTIVE: 'bg-green-900 text-green-300',
    PAUSED: 'bg-orange-900 text-orange-300',
    RESULTS: 'bg-purple-900 text-purple-300',
    LEADERBOARD: 'bg-yellow-900 text-yellow-300',
    FINISHED: 'bg-gray-700 text-gray-400',
  }
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${colors[status] ?? 'bg-gray-700'}`}>
      {status}
    </span>
  )
}
