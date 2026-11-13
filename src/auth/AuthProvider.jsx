import { useEffect, useState } from 'react'
import { supabase, configurationError } from '../lib/supabaseClient'
import { describeSupabaseError } from '../lib/supabaseErrors'

import { AuthContext } from './AuthContext'

export function AuthProvider({ children, client = supabase, configError = configurationError }) {
  const [candidate, setCandidate] = useState(undefined)
  const [verified, setVerified] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!client || configError) return
    let active = true
    let events = 0
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      // Keep this callback synchronous; Auth calls run in effects outside its lock.
      events += 1
      if (active) {
        setError('')
        if (!session) setVerified(null)
        setCandidate(session)
      }
    })
    const version = events
    client.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!active || events !== version) return
        if (failure) setError(describeSupabaseError(failure).message)
        setCandidate(failure ? null : data.session)
      })
      .catch((failure) => {
        if (active && events === version) {
          setError(describeSupabaseError(failure).message)
          setCandidate(null)
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client, configError, retry])

  useEffect(() => {
    if (!client || !candidate) return
    let active = true
    client.auth
      .getUser(candidate.access_token)
      .then(({ data, error: failure }) => {
        if (!active) return
        if (failure || !data.user || data.user.id !== candidate.user.id) {
          setError(
            failure
              ? describeSupabaseError(failure).message
              : 'Unable to verify this account. Sign in again.',
          )
          setCandidate(null)
        } else {
          if (candidate.expires_at && candidate.expires_at * 1000 <= Date.now()) {
            setError('Your session expired. Sign in again.')
            setCandidate(null)
            return
          }
          setVerified({ client, token: candidate.access_token, user: data.user })
        }
      })
      .catch((failure) => {
        if (active) {
          setError(describeSupabaseError(failure).message)
          setCandidate(null)
        }
      })
    // Fail closed on expiry if auto-refresh cannot obtain a replacement token.
    // Re-arm long delays because browser timers have a signed 32-bit limit.
    let expiry
    function watchExpiry() {
      if (!active || !candidate.expires_at) return
      const remaining = candidate.expires_at * 1000 - Date.now()
      if (remaining > 0) {
        expiry = setTimeout(watchExpiry, Math.min(remaining, 2147483647))
      } else {
        setVerified(null)
        setCandidate(null)
        setError('Your session expired. Sign in again.')
      }
    }
    expiry = setTimeout(watchExpiry, 0)
    return () => {
      active = false
      if (expiry) clearTimeout(expiry)
    }
  }, [client, candidate])

  async function signIn(email, password) {
    setError('')
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) return describeSupabaseError(result.error, 'login').message
      if (!result.data.session) return 'No session was returned. Try signing in again.'
      setCandidate(result.data.session)
      return ''
    } catch (failure) {
      return describeSupabaseError(failure, 'login').message
    }
  }

  async function signOut() {
    try {
      const { error: failure } = await client.auth.signOut({ scope: 'local' })
      if (failure) return describeSupabaseError(failure).message
      setCandidate(null)
      setVerified(null)
      setError('')
      return ''
    } catch (failure) {
      return describeSupabaseError(failure).message
    }
  }

  const user =
    candidate && verified?.client === client && verified.token === candidate.access_token
      ? verified.user
      : null
  return (
    <AuthContext.Provider
      value={{
        client,
        user,
        signIn,
        signOut,
        error,
        configError: configError || (!client ? 'Supabase is not configured.' : ''),
        loading: !configError && !!client && (candidate === undefined || (!!candidate && !user)),
        retry: () => {
          setError('')
          setCandidate(undefined)
          setVerified(null)
          setRetry((value) => value + 1)
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
