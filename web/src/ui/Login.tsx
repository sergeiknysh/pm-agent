import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { consumeFlashMessage, navigate } from './router'

export function Login() {
  const { state, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setFlash(consumeFlashMessage())
  }, [])

  useEffect(() => {
    if (state.status === 'authed') {
      navigate('/', { replace: true })
    }
  }, [state.status])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-title">PM Kanban</div>
        <div className="login-subtitle">Войдите, чтобы продолжить</div>

        {flash ? <div className="notice">{flash}</div> : null}
        {error ? <div className="error error--compact">{error}</div> : null}

        <form onSubmit={(e) => void onSubmit(e)} className="login-form">
          <label className="control">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="control">
            <span>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          <button className="btn" disabled={submitting || !username.trim() || !password}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
