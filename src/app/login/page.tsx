'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const next = params.get('next') || '/'
        router.replace(next.startsWith('/') ? next : '/')
        router.refresh()
      } else {
        setError('Incorrect password')
        setBusy(false)
      }
    } catch {
      setError('Something went wrong — try again')
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f4e7da] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-[#3b2b52]/10 p-8 flex flex-col gap-5"
      >
        <div className="text-center">
          <h1 className="font-serif text-2xl text-[#3b2b52] tracking-wide">ELEVEN SIGNAL</h1>
          <p className="text-sm text-[#3b2b52]/60 mt-1">Content Tracker</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[#3b2b52]/80">Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="rounded-lg border border-[#3b2b52]/20 px-3 py-2 outline-none focus:border-[#3b2b52] focus:ring-2 focus:ring-[#3b2b52]/20"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-lg bg-[#3b2b52] text-white py-2.5 font-medium disabled:opacity-50 hover:bg-[#2f2342] transition-colors"
        >
          {busy ? 'Signing in…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
