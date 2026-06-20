'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useGameSocket } from '../../hooks/useGameSocket'

type QuestionType = 'quiz' | 'truefalse' | 'typeAnswer' | 'slider' | 'puzzle' | 'poll' | 'wordcloud' | 'brainstorm' | 'openended'

export default function PlayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlayerGame />
    </Suspense>
  )
}

function Loading() {
  return <Screen><p className="text-gray-400">Loading…</p></Screen>
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      {children}
    </main>
  )
}

// ── PlayerGame orchestrator ───────────────────────────────────────────────────
function PlayerGame() {
  const params = useSearchParams()
  const pinFromUrl = params.get('pin') ?? ''

  const [joined, setJoined] = useState(false)
  const [formData, setFormData] = useState({ pin: pinFromUrl, identifier: '', nickname: '' })
  const [error, setError] = useState('')

  const socketParams = joined
    ? { pin: formData.pin, role: 'PLAYER' as const, identifier: formData.identifier || undefined, nickname: formData.nickname }
    : null

  const { state, send, connected } = useGameSocket(socketParams)

  useEffect(() => {
    if (state?.lastError) setError(state.lastError)
  }, [state?.lastError])

  if (!joined) {
    return (
      <JoinForm
        formData={formData}
        onChange={(k, v) => setFormData((p) => ({ ...p, [k]: v }))}
        error={error}
        onJoin={() => {
          if (!formData.pin || formData.pin.length !== 6) { setError('Enter a 6-digit PIN'); return }
          if (!formData.nickname.trim()) { setError('Enter a nickname'); return }
          setError('')
          setJoined(true)
        }}
      />
    )
  }

  if (!connected) return <Screen><p className="text-gray-400 animate-pulse">Connecting…</p></Screen>
  if (!state) return <Screen><p className="text-gray-400">Waiting for game…</p></Screen>

  const status = state.status
  const item = state.item

  if (status === 'LOBBY') {
    return (
      <LobbyWaitScreen
        nickname={formData.nickname}
        playerCount={state.playerCount ?? 1}
        quizTitle={state.quizTitle}
      />
    )
  }
  if (status === 'SLIDE') return <WaitScreen title="👀 Look up at the screen!" subtitle="" />
  if (status === 'QUESTION_READING') return <WaitScreen title="🧠 Get ready…" subtitle="Question incoming!" />
  if (status === 'PAUSED') return <PauseOverlay />
  if (['RESULTS', 'LEADERBOARD'].includes(status)) {
    return <ResultFeedback lastResult={state.lastResult} status={status} leaderboard={state.leaderboard} nickname={formData.nickname} />
  }
  if (status === 'FINISHED') {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-5xl mb-4">🏁</p>
          <p className="text-2xl font-bold text-green-400">Game over!</p>
          <p className="text-gray-400 mt-2">Thanks for playing, {formData.nickname}!</p>
        </div>
      </Screen>
    )
  }
  if (status === 'QUESTION_ACTIVE' && item) {
    return (
      <ActiveQuestion
        item={item}
        pin={formData.pin}
        timeRemaining={state.timeRemaining ?? 0}
        send={send}
      />
    )
  }
  // Mid-game join in a non-interactive state — show contextual message
  if (status && status !== 'LOBBY') {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-3xl mb-2">🎮</p>
          <p className="text-xl font-bold text-indigo-400">You're in!</p>
          <p className="text-gray-400 mt-1">Hang tight — next question coming up</p>
        </div>
      </Screen>
    )
  }
  return null
}

// ── Join form ─────────────────────────────────────────────────────────────────
function JoinForm({ formData, onChange, error, onJoin }: {
  formData: { pin: string; identifier: string; nickname: string }
  onChange: (k: string, v: string) => void
  error: string
  onJoin: () => void
}) {
  return (
    <Screen>
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center mb-2">
          <p className="text-4xl mb-2">🎮</p>
          <h1 className="text-3xl font-extrabold">Join Game</h1>
        </div>

        <input
          value={formData.pin}
          onChange={(e) => onChange('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Game PIN"
          className="bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-2xl text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={formData.identifier}
          onChange={(e) => onChange('identifier', e.target.value)}
          placeholder="Email / Employee ID (optional)"
          className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={formData.nickname}
          onChange={(e) => onChange('nickname', e.target.value.slice(0, 50))}
          placeholder="Nickname"
          className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onKeyDown={(e) => e.key === 'Enter' && onJoin()}
        />

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={onJoin}
          className="bg-green-600 hover:bg-green-500 py-4 rounded-2xl text-xl font-bold transition"
        >
          Join →
        </button>
      </div>
    </Screen>
  )
}

// ── Lobby splash screen ───────────────────────────────────────────────────────
const TIPS = [
  '⚡ Speed matters — faster correct answers earn more points!',
  '🔥 2 correct in a row = +100 streak bonus!',
  '🏆 5-in-a-row streak = +500 bonus points. Go beast mode!',
  '🧠 You get 5 seconds to read before the timer starts.',
  '💡 Slider questions: closer to correct = more points!',
  '🎯 Puzzle questions need the EXACT order — no partial credit!',
  '😅 Wrong answers don\'t deduct points — but streaks reset!',
  '👀 For word clouds & polls, just vibe — no wrong answers!',
]

function LobbyWaitScreen({ nickname, playerCount, quizTitle }: {
  nickname: string; playerCount: number; quizTitle?: string
}) {
  const [tipIdx, setTipIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  return (
    <Screen>
      <div className="text-center max-w-sm w-full">
        {quizTitle && (
          <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">{quizTitle}</p>
        )}
        <div className="text-5xl mb-3">🎮</div>
        <h1 className="text-3xl font-extrabold mb-1">You're in!</h1>
        <p className="text-2xl font-bold text-indigo-300 mb-5">{nickname}</p>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 mb-5">
          <p className="text-gray-400 text-sm animate-pulse">⏳ Waiting for host to start…</p>
          <p className="text-gray-600 text-xs mt-1">
            {playerCount} player{playerCount !== 1 ? 's' : ''} in the arena
          </p>
        </div>

        <div className="bg-indigo-950 border border-indigo-800 rounded-xl px-5 py-3 min-h-14 flex items-center justify-center transition-all">
          <p className="text-indigo-300 text-sm text-center">{TIPS[tipIdx]}</p>
        </div>
      </div>
    </Screen>
  )
}

// ── Passive screens ───────────────────────────────────────────────────────────
function WaitScreen({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Screen>
      <p className="text-2xl font-bold mb-2">{title}</p>
      {subtitle && <p className="text-gray-400">{subtitle}</p>}
    </Screen>
  )
}

function PauseOverlay() {
  return (
    <Screen>
      <div className="text-center">
        <p className="text-4xl mb-4">⏸</p>
        <p className="text-2xl font-bold text-yellow-400 mb-2">Game Paused</p>
        <p className="text-gray-400">Look up at the screen</p>
      </div>
    </Screen>
  )
}

function ResultFeedback({ lastResult, status, leaderboard, nickname }: {
  lastResult: any; status: string; leaderboard: any[]; nickname: string
}) {
  if (status === 'LEADERBOARD' && leaderboard?.length) {
    const myPos = leaderboard.findIndex((p: any) => p.nickname === nickname) + 1
    const me = leaderboard.find((p: any) => p.nickname === nickname)
    return (
      <Screen>
        <p className="text-gray-400 text-sm mb-1">Your rank</p>
        <p className="text-6xl font-black text-indigo-400 mb-2">#{myPos || '–'}</p>
        {me && <p className="text-2xl font-semibold text-yellow-400">{me.score.toLocaleString()} pts</p>}
        <p className="text-gray-500 text-sm mt-4">Look up at the leaderboard</p>
      </Screen>
    )
  }
  if (!lastResult) return <Screen><p className="text-gray-400">Look up at the screen</p></Screen>
  const { isCorrect, pointsEarned, streak, accuracy } = lastResult
  const isUnscored = isCorrect === null
  return (
    <Screen>
      {isUnscored ? (
        <div className="text-center">
          <p className="text-4xl mb-2">💬</p>
          <p className="text-2xl font-bold text-indigo-400">Response recorded!</p>
          <p className="text-gray-500 text-sm mt-2">Check out the results above</p>
        </div>
      ) : isCorrect ? (
        <div className="text-center">
          <p className="text-5xl mb-2">✓</p>
          <p className="text-2xl font-bold text-green-400 mb-1">Correct!</p>
          {accuracy !== null && accuracy !== undefined && (
            <p className="text-gray-400 text-sm mb-1">Accuracy: {Math.round((accuracy ?? 0) * 100)}%</p>
          )}
          <p className="text-3xl font-mono text-yellow-400">+{pointsEarned?.toLocaleString()}</p>
          {streak >= 2 && <p className="text-sm text-orange-400 mt-1">🔥 {streak}× streak!</p>}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-5xl mb-2">✗</p>
          <p className="text-2xl font-bold text-red-400">Incorrect</p>
          <p className="text-gray-500 text-sm mt-1">Streak reset 😬</p>
        </div>
      )}
    </Screen>
  )
}

// ── Active question dispatcher ────────────────────────────────────────────────
function ActiveQuestion({ item, pin, timeRemaining, send }: {
  item: any; pin: string; timeRemaining: number; send: Function
}) {
  const [submitted, setSubmitted] = useState(false)
  const [comment, setComment] = useState('')

  useEffect(() => { setSubmitted(false); setComment('') }, [item?.id])

  function submit(answer: object) {
    if (submitted) return
    setSubmitted(true)
    send('client:submit_answer', {
      pin,
      questionId: item.id,
      answer,
      comment: comment.trim() || undefined,
    })
  }

  if (submitted) {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-xl text-green-400 font-semibold">Answer submitted!</p>
          {comment.trim() && (
            <p className="text-gray-500 text-sm mt-2 italic">💬 "{comment.trim()}"</p>
          )}
        </div>
      </Screen>
    )
  }

  const secLeft = Math.ceil(timeRemaining / 1000)
  const type: QuestionType = item.type

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Timer bar */}
      {item.timeLimit && (
        <div className="h-1 bg-gray-800">
          <div
            className={`h-1 transition-all duration-1000 ${secLeft <= 5 ? 'bg-red-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, (secLeft / item.timeLimit) * 100)}%` }}
          />
        </div>
      )}

      <div className="flex-1 p-4 flex flex-col">
        {type === 'quiz' && <QuizWidget item={item} submit={submit} multi />}
        {type === 'poll' && <QuizWidget item={item} submit={submit} multi={false} />}
        {type === 'truefalse' && <TrueFalseWidget submit={submit} />}
        {type === 'typeAnswer' && <TypeAnswerWidget submit={submit} />}
        {type === 'slider' && <SliderWidget item={item} submit={submit} />}
        {type === 'puzzle' && <PuzzleWidget item={item} submit={submit} />}
        {type === 'wordcloud' && <WordcloudWidget submit={submit} />}
        {type === 'brainstorm' && <BrainstormWidget submit={submit} />}
        {type === 'openended' && <OpenEndedWidget submit={submit} />}

        {/* Optional comment — shown below every question type */}
        <CommentInput comment={comment} onChange={setComment} />
      </div>
    </main>
  )
}

// ── Comment input ─────────────────────────────────────────────────────────────
const COMMENT_MAX = 280

function CommentInput({ comment, onChange }: { comment: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-4">
      <textarea
        value={comment}
        onChange={(e) => onChange(e.target.value.slice(0, COMMENT_MAX))}
        placeholder="💬 Add a thought? (optional)"
        rows={2}
        className="w-full bg-gray-800/70 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
      />
      {comment.length > 0 && (
        <p className="text-right text-xs text-gray-600 mt-1">{comment.length}/{COMMENT_MAX}</p>
      )}
    </div>
  )
}

// ── Input widgets ─────────────────────────────────────────────────────────────

const SHAPE_COLORS = [
  { bg: 'bg-red-600 active:bg-red-700', ring: 'ring-red-400' },
  { bg: 'bg-blue-600 active:bg-blue-700', ring: 'ring-blue-400' },
  { bg: 'bg-yellow-500 active:bg-yellow-600', ring: 'ring-yellow-400' },
  { bg: 'bg-green-600 active:bg-green-700', ring: 'ring-green-400' },
  { bg: 'bg-purple-600 active:bg-purple-700', ring: 'ring-purple-400' },
  { bg: 'bg-orange-500 active:bg-orange-600', ring: 'ring-orange-400' },
]

function QuizWidget({ item, submit, multi }: { item: any; submit: Function; multi: boolean }) {
  const [selected, setSelected] = useState<number[]>([])
  const options: string[] = item.options ?? []

  function toggle(i: number) {
    if (!multi) {
      // Single-select: highlight then require Submit so comment can be added
      setSelected([i])
      return
    }
    setSelected((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i])
  }

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="grid grid-cols-2 gap-3 flex-1">
        {options.map((opt, i) => {
          const c = SHAPE_COLORS[i % SHAPE_COLORS.length]
          const active = selected.includes(i)
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`${c.bg} ${active ? `ring-4 ${c.ring}` : ''} rounded-2xl p-4 text-white font-bold text-base leading-snug flex items-center justify-center min-h-20 transition-all`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <button
          onClick={() => submit({ selected })}
          className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold text-xl transition"
        >
          {multi ? `Submit (${selected.length} selected)` : 'Submit'}
        </button>
      )}
    </div>
  )
}

function TrueFalseWidget({ submit }: { submit: Function }) {
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <div className="flex flex-col gap-4 flex-1">
      <button
        onClick={() => setSelected(0)}
        className={`flex-1 ${selected === 0 ? 'bg-blue-500 ring-4 ring-white' : 'bg-blue-600 active:bg-blue-700'} rounded-2xl font-bold text-2xl transition`}
      >
        True
      </button>
      <button
        onClick={() => setSelected(1)}
        className={`flex-1 ${selected === 1 ? 'bg-red-500 ring-4 ring-white' : 'bg-red-600 active:bg-red-700'} rounded-2xl font-bold text-2xl transition`}
      >
        False
      </button>
      {selected !== null && (
        <button
          onClick={() => submit({ selected: [selected] })}
          className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold text-xl transition"
        >
          Submit
        </button>
      )}
    </div>
  )
}

function TypeAnswerWidget({ submit }: { submit: Function }) {
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your answer…"
        autoFocus
        className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onKeyDown={(e) => e.key === 'Enter' && text.trim() && submit({ text: text.trim() })}
      />
      <button
        onClick={() => text.trim() && submit({ text: text.trim() })}
        disabled={!text.trim()}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-4 rounded-2xl font-bold text-xl"
      >
        Submit
      </button>
    </div>
  )
}

function SliderWidget({ item, submit }: { item: any; submit: Function }) {
  const [value, setValue] = useState(Math.round(((item.min ?? 0) + (item.max ?? 100)) / 2))
  return (
    <div className="flex flex-col gap-6 pt-8">
      <div className="text-center text-5xl font-mono font-bold text-indigo-400">{value}</div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-sm">{item.min ?? 0}</span>
        <input
          type="range"
          min={item.min ?? 0}
          max={item.max ?? 100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="flex-1 accent-indigo-500 h-3"
        />
        <span className="text-gray-500 text-sm">{item.max ?? 100}</span>
      </div>
      <button
        onClick={() => submit({ value })}
        className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold text-xl"
      >
        Submit {value}
      </button>
    </div>
  )
}

function PuzzleWidget({ item, submit }: { item: any; submit: Function }) {
  const blocks: { id: number; label: string }[] = item.blocks ?? []
  const [order, setOrder] = useState<number[]>(blocks.map((b) => b.id))

  function moveDown(i: number) {
    if (i >= order.length - 1) return
    const next = [...order]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setOrder(next)
  }
  function moveUp(i: number) {
    if (i === 0) return
    const next = [...order]; [next[i], next[i - 1]] = [next[i - 1], next[i]]; setOrder(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-400 text-sm text-center mb-2">Tap arrows to reorder</p>
      {order.map((id, i) => {
        const block = blocks.find((b) => b.id === id)
        return (
          <div key={id} className="flex items-center gap-2 bg-gray-800 rounded-xl p-3">
            <span className="text-gray-500 font-mono w-6 text-center text-sm">{i + 1}</span>
            <span className="flex-1 font-semibold text-sm">{block?.label}</span>
            <div className="flex flex-col gap-1">
              <button onClick={() => moveUp(i)} disabled={i === 0} className="text-gray-400 hover:text-white disabled:opacity-20 text-xs px-2 py-0.5 rounded bg-gray-700">▲</button>
              <button onClick={() => moveDown(i)} disabled={i === order.length - 1} className="text-gray-400 hover:text-white disabled:opacity-20 text-xs px-2 py-0.5 rounded bg-gray-700">▼</button>
            </div>
          </div>
        )
      })}
      <button
        onClick={() => submit({ order })}
        className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-bold text-xl mt-2"
      >
        Submit Order
      </button>
    </div>
  )
}

function WordcloudWidget({ submit }: { submit: Function }) {
  const [word, setWord] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <input
        value={word}
        onChange={(e) => setWord(e.target.value.replace(/\s/g, '').slice(0, 50))}
        placeholder="One word…"
        autoFocus
        className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-xl text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onKeyDown={(e) => e.key === 'Enter' && word.trim() && submit({ word: word.trim() })}
      />
      <button
        onClick={() => word.trim() && submit({ word: word.trim() })}
        disabled={!word.trim()}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-4 rounded-2xl font-bold text-xl"
      >
        Submit
      </button>
    </div>
  )
}

function BrainstormWidget({ submit }: { submit: Function }) {
  const [ideas, setIdeas] = useState(['', '', ''])
  const hasIdea = ideas.some((i) => i.trim())
  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-400 text-sm">Share up to 3 ideas:</p>
      {ideas.map((idea, i) => (
        <input
          key={i}
          value={idea}
          onChange={(e) => { const next = [...ideas]; next[i] = e.target.value.slice(0, 200); setIdeas(next) }}
          placeholder={`Idea ${i + 1}${i > 0 ? ' (optional)' : ''}`}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ))}
      <button
        onClick={() => submit({ ideas: ideas.filter((i) => i.trim()) })}
        disabled={!hasIdea}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-4 rounded-2xl font-bold text-xl mt-2"
      >
        Submit Ideas
      </button>
    </div>
  )
}

function OpenEndedWidget({ submit }: { submit: Function }) {
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        placeholder="Your response…"
        rows={5}
        autoFocus
        className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
      <button
        onClick={() => text.trim() && submit({ text: text.trim() })}
        disabled={!text.trim()}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-4 rounded-2xl font-bold text-xl"
      >
        Submit
      </button>
    </div>
  )
}
