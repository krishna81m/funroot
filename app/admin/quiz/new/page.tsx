'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuizBuilder } from '../../../components/host/QuizBuilder'

export default function NewQuizPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')

  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw')
    if (!pw) { router.push('/admin'); return }
    setPassword(pw)
  }, [])

  if (!password) return null

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <QuizBuilder adminPassword={password} />
    </main>
  )
}
