import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { errorMessage } from '../api/client'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const input = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-8">
      <img src="/ms-education-academy.webp" alt="MS Education Academy, preparing world worthy individuals" className="w-full max-w-sm rounded-lg" />
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-200 border-t-4 border-t-accent bg-white p-6">
        <h1 className="text-xl font-semibold text-brand">WorkHub</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to log your work.</p>

        <label className="mt-5 block text-sm font-medium">
          Email
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        Powered by <img src="/de-logo.png" alt="DE, Digital Engineering" className="h-7" />
      </div>
    </div>
  )
}
