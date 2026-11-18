import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { testDatabaseConnection } from '../lib/connectionTest'
import CloudBackupSettings from '../components/CloudBackupSettings'
import AppearanceSettings from '../components/AppearanceSettings'
import { PREFLIGHT_KEY, RECOVERY_KEY, USER_DATA_KEYS } from '../data/storageSafety'

function hasLegacyWorkspaceData() {
  try {
    const storage = globalThis.localStorage
    if (!storage) return false
    if ([PREFLIGHT_KEY, RECOVERY_KEY].some(key => storage.getItem(key) !== null)) return true

    return USER_DATA_KEYS.some(key => {
      const raw = storage.getItem(key)
      if (raw === null) return false
      try {
        const data = JSON.parse(raw)
        if (Array.isArray(data)) return data.length > 0
        if (data && typeof data === 'object') {
          return Object.values(data).some(value => !Array.isArray(value) || value.length > 0)
        }
        return true
      } catch {
        return true
      }
    })
  } catch {
    return false
  }
}

export default function AccountSettings({ beforeSignOut }) {
  const { client, user, signOut } = useAuth()
  const [connection, setConnection] = useState(null)
  const [checking, setChecking] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
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
    if (signingOut || backupBusy) return
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
          <p>Your appearance, account and database connection.</p>
        </div>
      </div>
      <AppearanceSettings />
      <section className="data-management-row" aria-labelledby="account-heading">
        <div>
          <h2 id="account-heading">Account</h2>
          <p className="account-email">{user.email}</p>
        </div>
        <button type="button" className="button secondary" disabled={signingOut || backupBusy} onClick={logout}>
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
      <CloudBackupSettings client={client} userId={user.id} beforeExport={beforeSignOut} disabled={signingOut} onBusyChange={setBackupBusy} />
      {hasLegacyWorkspaceData() && (
        <section className="local-quarantine" aria-labelledby="legacy-heading">
          <h2 id="legacy-heading">Local-only browser content</h2>
          <p>
            Existing projects, tasks, documentation, folders, tags, links, and backups remain in this
            browser. They are quarantined and are not assigned to this account, displayed, uploaded,
            or reset. The local workspace and its backup tools are preserved separately. No browser
            data migration is needed for this fresh cloud workspace.
          </p>
        </section>
      )}
    </section>
  )
}
