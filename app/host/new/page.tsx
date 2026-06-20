'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Quiz { id: string; title: string; description: string }

export default function NewGame() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/quizzes').then((r) => r.json()).then(setQuizzes)
  }, [])

  async function hostQuiz(quizId: string) {
    setCreating(true)
    const res = await fetch('/api/sessions', { method: 'POST', body: JSON.stringify({ quizId }), headers: { 'Content-Type': 'application/json' } })
    const { pin } = await res.json()
    router.push(`/host/${pin}`)
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Choose a Quiz</h1>
      <div className="flex flex-col gap-4">
        {quizzes.map((q) => (
          <button
            key={q.id}
            onClick={() => hostQuiz(q.id)}
            disabled={creating}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-left p-6 rounded-2xl transition"
          >
            <p className="text-xl font-semibold">{q.title}</p>
            <p className="text-gray-400 mt-1">{q.description}</p>
          </button>
        ))}
      </div>
    </main>
  )
}
