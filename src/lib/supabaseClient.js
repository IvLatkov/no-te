import { createClient } from '@supabase/supabase-js'

export function validateSupabaseConfig(url, key) {
  if (!url || !key) {
    return 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Vite.'
  }
  try {
    const parsed = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if (
      parsed.username ||
      parsed.password ||
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
    ) {
      return 'Use your Supabase HTTPS project URL (HTTP is allowed only for local development).'
    }
  } catch {
    return 'VITE_SUPABASE_URL must be a valid Supabase project URL.'
  }
  if (!key.startsWith('sb_publishable_')) {
    return 'Use a Supabase publishable key beginning with sb_publishable_. Secret and service-role keys must never be used in the frontend.'
  }
  return ''
}

const env = import.meta.env ?? {}
const url = env.VITE_SUPABASE_URL?.trim()
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let configurationError = validateSupabaseConfig(url, key)
let supabase = null
if (!configurationError) {
  try {
    supabase = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  } catch {
    configurationError =
      'Supabase could not initialize. Check your public configuration and browser storage permissions.'
  }
}

export { supabase, configurationError }
