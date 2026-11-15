import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fail } from './errors.js'

export function supabaseClient(config) {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function credentialStore(config) {
  try {
    const { Entry } = await import('@napi-rs/keyring')
    const entry = new Entry('No-Te MCP', createHash('sha256').update(config.url).digest('hex'), { linux: { store: 'secret-service' } })
    return {
      async read() {
        try { return JSON.parse(entry.getPassword()) } catch (error) {
          if (String(error?.code).includes('NoEntry') || /No matching entry|No entry|not found/i.test(String(error?.message))) return null
          fail('CREDENTIAL_STORE', 'OS credential store unavailable. Use interactive login --session-only; no plaintext fallback is used.')
        }
      },
      async write(session) {
        try { entry.setPassword(JSON.stringify(session)) } catch { fail('CREDENTIAL_STORE', 'Cannot save to OS credential store. Use login --session-only instead.') }
      },
      async clear() {
        try { entry.deletePassword() } catch (error) {
          if (!/No matching entry|No entry|not found/i.test(String(error?.message))) fail('CREDENTIAL_STORE', 'Cannot clear OS credentials. Remove the No-Te MCP entry using your OS credential manager.')
        }
      },
    }
  } catch { fail('CREDENTIAL_STORE', 'OS credential store unavailable. Use login --session-only; credentials will never be saved as plaintext.') }
}

export function memoryStore(initial = null) {
  let value = initial
  return { read: async () => value, write: async session => { value = session }, clear: async () => { value = null } }
}

export function createAuth(client, store) {
  let pending
  async function verify() {
    const saved = await store.read()
    if (!saved?.access_token || !saved?.refresh_token) fail('LOGIN_REQUIRED', 'Sign in interactively using node connector/cli.js login.')
    const { data, error } = await client.auth.setSession(saved)
    if (error || !data.session) {
      // Retain credentials on transient network errors, clear rejected/expired refresh credentials.
      if (!error || (error.status >= 400 && error.status < 500 && error.status !== 429)) await store.clear()
      fail('LOGIN_REQUIRED', 'Session could not be restored. Check connectivity, then sign in again if needed.')
    }
    await store.write({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    const identity = await client.auth.getUser(data.session.access_token)
    if (identity.error || !identity.data.user) {
      if (identity.error?.status === 401 || identity.error?.status === 403) await store.clear()
      fail('IDENTITY_FAILED', 'Supabase could not verify your identity. Check connectivity or sign in again.')
    }
    return identity.data.user
  }
  return {
    client,
    ensure() {
      if (!pending) pending = verify().finally(() => { pending = null })
      return pending
    },
    async logout() {
      try {
        const saved = await store.read()
        if (saved) {
          const restored = await client.auth.setSession(saved)
          if (restored.error) fail('LOGOUT_REMOTE_FAILED', 'Local credentials were cleared, but the session could not be restored for remote revocation. Revoke it in Supabase if necessary.')
          const { error } = await client.auth.signOut({ scope: 'local' })
          if (error) fail('LOGOUT_REMOTE_FAILED', 'Local credentials were cleared, but remote session revocation failed. Revoke the session in Supabase if necessary.')
        }
      } finally { await store.clear() }
    },
  }
}
