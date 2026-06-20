'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuizBuilder } from '../../../components/host/QuizBuilder'

export default function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [quiz, setQuiz] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw')
    if (!pw) { router.push('/admin'); return }
    setPassword(pw)
    fetch('/api/quizzes')
      .then((r) => r.json())
      .then((quizzes: any[]) => {
        // The /api/quizzes list only has id/title/description — we need the full quiz
        // Fetch the full quiz from the admin API
        fetch(`/api/admin/quiz/${encodeURIComponent(id)}`, { headers: { 'x-admin-password': pw } })
          .then((r) => r.ok ? r.json() : null)
          .then((q) => { if (q) { setQuiz(q) } else { setNotFound(true) } })
      })
  }, [id])

  if (notFound) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <p className="text-gray-400">Quiz not found: {id}</p>
    </main>
  )

  if (!quiz || !password) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <p className="text-gray-400">Loading…</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <QuizBuilder initialQuiz={quiz} adminPassword={password} />
    </main>
  )
}
