import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { testDatabaseConnection } from '../lib/connectionTest'

export default function AccountSettings({ beforeSignOut }) {
  const { client, user, signOut } = useAuth()
  const [connection, setConnection] = useState(null)
  const [checking, setChecking] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  async function checkConnection() {
    const request = ++generation.current
    setChecking(true)
    setConnection(null)
    const result = await testDatabaseConnection(client, user.id)
    if (request === generation.current) {
      setConnection(result)
      setChecking(false)
    }
  }

  async function logout() {
    setSigningOut(true)
    setError('')
    if (beforeSignOut && !(await beforeSignOut())) {
      setError(
        'Your notes could not be saved. Retry saving before signing out; your draft is still open.',
      )
      setSigningOut(false)
      return
    }
    const failure = await signOut()
    if (failure) {
      setError(failure)
      setSigningOut(false)
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <div className="section-heading">
        <div>
          <h1 id="settings-heading">Settings</h1>
          <p>Your account and database connection.</p>
        </div>
      </div>
      <section className="data-management-row" aria-labelledby="account-heading">
        <div>
          <h2 id="account-heading">Account</h2>
          <p className="account-email">{user.email}</p>
        </div>
        <button type="button" className="button secondary" disabled={signingOut} onClick={logout}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
      {error && (
        <p className="storage-error" role="alert">
          {error}
        </p>
      )}
      <section className="data-management-row" aria-labelledby="connection-heading">
        <div>
          <h2 id="connection-heading">Database connection</h2>
          <p>
            Verifies your identity with Supabase Auth, then reads public.projects. No records are
            changed.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={checking || signingOut}
          onClick={checkConnection}
        >
          {checking ? 'Checking…' : 'Test connection'}
        </button>
      </section>
      <div aria-live="polite" aria-busy={checking}>
        {checking && <p role="status">Checking authentication and database access…</p>}
        {connection && (
          <p
            role={connection.kind === 'connected' ? 'status' : 'alert'}
            className={connection.kind === 'connected' ? 'connection-success' : 'storage-error'}
          >
            {connection.kind !== 'connected' &&
              `${connection.kind[0].toUpperCase()}${connection.kind.slice(1)}: `}
            {connection.message}
            {connection.email && ` — ${connection.email}`}
          </p>
        )}
      </div>
      <section className="local-quarantine" aria-labelledby="legacy-heading">
        <h2 id="legacy-heading">Local-only browser content</h2>
        <p>
          Existing projects, tasks, documentation, folders, tags, links, and backups remain in this
          browser. They are quarantined and are not assigned to this account, displayed, uploaded,
          or reset. The local workspace and its backup tools are retained in the codebase and will
          be reconnected through an explicit migration in a later iteration.
        </p>
      </section>
    </section>
  )
}
