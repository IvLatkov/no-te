// Never render raw server messages: they can contain request details or credentials.
export function describeSupabaseError(error, operation = 'request') {
  const code = error?.code
  const status = Number(error?.status)
  const message = String(error?.message ?? '').toLowerCase()
  if (message.includes('invalid api key') || ['PGRST202', 'PGRST204', 'PGRST205', '42P01'].includes(code)) {
    return {
      kind: 'configuration',
      message:
        'Configuration error. Check the project URL, publishable key, and public.projects API availability.',
    }
  }
  if (code === 'invalid_credentials') {
    return { kind: 'authentication', message: 'Email or password is incorrect.' }
  }
  if (code === 'email_not_confirmed') {
    return {
      kind: 'authentication',
      message: 'This account’s email must be confirmed before signing in.',
    }
  }
  if (code === '42501' || (status === 403 && !['bad_jwt', 'session_not_found'].includes(code))) {
    return {
      kind: 'permission',
      message:
        'Permission denied. Check the projects SELECT policy and authenticated role permissions.',
    }
  }
  if (
    status === 401 ||
    [
      'session_not_found',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'bad_jwt',
      'PGRST301',
    ].includes(code)
  ) {
    return {
      kind: 'authentication',
      message: 'Your session is no longer valid. Sign out and sign in again.',
    }
  }
  if (
    error instanceof TypeError ||
    error?.name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /fetch|network|offline|timeout/.test(message)
  ) {
    return {
      kind: 'network',
      message: 'Could not reach Supabase. Check your connection and try again.',
    }
  }
  if (status === 429) {
    return { kind: 'request', message: 'Too many attempts. Wait a moment before trying again.' }
  }
  return {
    kind: 'request',
    message:
      operation === 'login'
        ? 'Sign-in failed. Check your credentials or try again later.'
        : 'Supabase could not complete the request. Try again or check your project configuration.',
  }
}
