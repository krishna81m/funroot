'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Quiz { id: string; title: string; description: string }

export default function AdminDashboard() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  // Persist admin password in sessionStorage (clears on tab close)
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_pw')
    if (saved) { setPassword(saved); setAuthed(true); fetchQuizzes(saved) }
  }, [])

  async function login() {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      sessionStorage.setItem('admin_pw', password)
      setAuthed(true)
      setError('')
      fetchQuizzes(password)
    } else {
      setError('Invalid password')
    }
  }

  async function fetchQuizzes(pw: string) {
    const res = await fetch('/api/quizzes')
    setQuizzes(await res.json())
  }

  async function deleteQuiz(id: string) {
    if (!confirm(`Delete quiz "${id}"? This cannot be undone.`)) return
    setDeleting(id)
    await fetch(`/api/admin/quizzes/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    })
    setDeleting(null)
    fetchQuizzes(password)
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-3xl font-bold text-center">Admin Login</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={login}
            className="bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition"
          >
            Login
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Quiz Admin</h1>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/admin/quiz/new')}
              className="bg-green-600 hover:bg-green-500 px-5 py-2 rounded-xl font-semibold transition"
            >
              + New Quiz
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('admin_pw'); setAuthed(false) }}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl text-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {quizzes.map((q) => (
            <div key={q.id} className="bg-gray-800 rounded-2xl p-6 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xl font-semibold">{q.title}</p>
                <p className="text-gray-400 text-sm mt-1">{q.description}</p>
                <p className="text-gray-600 text-xs mt-1">ID: {q.id}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/admin/quiz/${q.id}`)}
                  className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteQuiz(q.id)}
                  disabled={deleting === q.id}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  {deleting === q.id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
          {quizzes.length === 0 && (
            <p className="text-gray-500 text-center py-12">No quizzes yet. Create one!</p>
          )}
        </div>
      </div>
    </main>
  )
}
