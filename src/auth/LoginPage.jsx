import { useState } from 'react'
import Wordmark from '../components/Wordmark'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { signIn, configError, error: sessionError, retry } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy || configError) return
    setBusy(true)
    setError('')
    const failure = await signIn(email, password)
    setPassword('')
    setError(failure)
    setBusy(false)
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="login-heading">
        <Wordmark className="auth-mark" />
        <h1 id="login-heading">Sign in to No-Te</h1>
        <p className="auth-description">Your quiet space for projects and notes.</p>
        {configError && (
          <p className="storage-error" role="alert">
            {configError}
          </p>
        )}
        {sessionError && (
          <div className="auth-session-error">
            <p className="storage-error" role="alert">
              {sessionError}
            </p>
            <button type="button" className="button secondary" onClick={retry}>
              Retry session check
            </button>
          </div>
        )}
        <form onSubmit={submit} aria-busy={busy}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || !!configError}
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy || !!configError}
          />
          {error && (
            <p className="storage-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={busy || !!configError}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-footnote">Private application. Registration is disabled.</p>
      </section>
    </main>
  )
}
