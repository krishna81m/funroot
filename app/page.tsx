'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Quiz { id: string; title: string; description: string }

export default function Home() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [pin, setPin] = useState('')
  const [hosting, setHosting] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/quizzes')
      .then((r) => r.json())
      .then(setQuizzes)
      .catch(() => setLoadError(true))
  }, [])

  async function hostQuiz(quizId: string) {
    setHosting(quizId)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      })
      const { pin: newPin } = await res.json()
      router.push(`/host/${newPin}`)
    } catch {
      setHosting(null)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
      <h1 className="text-5xl font-extrabold tracking-tight">Kahoot! 360</h1>

      {/* Join section */}
      <div className="flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter PIN"
          className="bg-gray-800 border border-gray-600 rounded-2xl px-6 py-4 text-xl text-center tracking-widest w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => pin.length === 6 && router.push(`/play?pin=${pin}`)}
          disabled={pin.length !== 6}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-40 px-8 py-4 rounded-2xl text-xl font-bold transition"
        >
          Join
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 w-full max-w-md">
        <hr className="flex-1 border-gray-700" />
        <span className="text-gray-500 text-sm">or host a game</span>
        <hr className="flex-1 border-gray-700" />
      </div>

      {/* Quiz picker */}
      <div className="w-full max-w-md flex flex-col gap-3">
        {loadError && (
          <p className="text-red-400 text-sm text-center">Could not load quizzes — is the server running?</p>
        )}
        {!loadError && quizzes.length === 0 && (
          <p className="text-gray-500 text-sm text-center">Loading quizzes…</p>
        )}
        {quizzes.map((q) => (
          <button
            key={q.id}
            onClick={() => hostQuiz(q.id)}
            disabled={hosting !== null}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-left p-5 rounded-2xl transition border border-gray-700 hover:border-indigo-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{q.title}</p>
                {q.description && <p className="text-gray-400 text-sm mt-0.5">{q.description}</p>}
              </div>
              <span className="ml-4 text-indigo-400 font-bold text-sm whitespace-nowrap">
                {hosting === q.id ? 'Starting…' : 'Host →'}
              </span>
            </div>
          </button>
        ))}
      </div>

      <a href="/admin" className="text-gray-600 hover:text-gray-400 text-sm transition">
        Admin / Quiz Builder
      </a>
    </main>
  )
}
