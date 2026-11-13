import { describeSupabaseError } from '../lib/supabaseErrors.js'

// Pin each operation to the token whose identity was verified, so an SDK account
// switch cannot send an old form's INSERT using the next account's credentials.
const operationTokens = new WeakMap()

export function cloudError(failure, entity, operation) {
  const code = failure?.code
  let message
  if (code === 'ACCOUNT_CHANGED') {
    message = 'The account changed. Sign in again before accessing cloud data.'
  } else if (
    code === '23502' &&
    ['projects', 'notes', 'folders', 'tags'].includes(entity) &&
    /user_id/.test(failure.message ?? '')
  ) {
    message = `Creation requires a database-supplied owner. public.${entity}.user_id has no usable auth.uid() default. No client-selected owner was sent.`
  } else if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code)) {
    message = `Schema mismatch for public.${entity}. Check the documented columns and the API schema cache (${code}).`
  } else if (code === '42501' || failure?.status === 403) {
    message = `Permission denied for ${operation} on public.${entity}. Check the authenticated role grants and RLS policies; they have not been changed.`
  } else if (code === 'PGRST116') {
    message =
      'This record is unavailable, was removed, or is not accessible to this account. Reload before retrying.'
  } else if (code === '23503') {
    message =
      'The database rejected this relationship or deletion. Reload and check the project foreign keys; no related documentation was explicitly deleted.'
  } else if (code === '23505' && ['folders', 'tags'].includes(entity)) {
    message = `A ${entity === 'tags' ? 'tag' : 'folder'} with this name already exists. Choose another name.`
  } else if (['P0001', '23514'].includes(code) && ['folders', 'notes'].includes(entity)) {
    message =
      'Folder validation rejected this change. Use at most three levels, no cycles, matching parent projects, and a compatible note folder.'
  } else if (['23514', '23502', '22001', '23505'].includes(code)) {
    message = `The database rejected these ${entity} values (${code}). Check required fields, validation triggers, and constraints.`
  } else {
    message = describeSupabaseError(failure).message
  }
  const error = new Error(message)
  error.code = /^[A-Z0-9]{5,8}$/.test(code ?? '') ? code : undefined
  return error
}

export function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
}

export async function requireCloudUser(client, expectedUserId, signal) {
  checkAbort(signal)
  if (!client || !expectedUserId)
    throw new Error('Sign in before accessing cloud projects or tasks.')
  let response
  let verifiedToken
  try {
    const session = await client.auth.getSession()
    checkAbort(signal)
    if (session.error) throw session.error
    if (!session.data?.session?.access_token) throw { status: 401 }
    if (session.data.session.user.id !== expectedUserId) throw { code: 'ACCOUNT_CHANGED' }
    const token = session.data.session.access_token
    response = await client.auth.getUser(token)
    verifiedToken = token
  } catch (failure) {
    checkAbort(signal)
    throw cloudError(failure, 'projects', 'authentication')
  }
  const { data, error } = response
  checkAbort(signal)
  if (error) throw cloudError(error, 'projects', 'authentication')
  if (!data?.user || data.user.id !== expectedUserId)
    throw new Error('The account changed. Sign in again before accessing cloud data.')
  if (signal) operationTokens.set(signal, verifiedToken)
  return data.user
}

async function cloudResponse(query, signal, entity, operation) {
  checkAbort(signal)
  let result
  try {
    const token = signal && operationTokens.get(signal)
    if (token) query = query.setHeader('Authorization', `Bearer ${token}`)
    result = await (signal ? query.abortSignal(signal) : query)
  } catch (failure) {
    checkAbort(signal)
    throw cloudError(failure, entity, operation)
  }
  checkAbort(signal)
  if (result.error) throw cloudError(result.error, entity, operation)
  return result
}

export async function cloudResult(query, signal, entity, operation, requireRow = false) {
  const result = await cloudResponse(query, signal, entity, operation)
  if (requireRow && !result.data) throw cloudError({ code: 'PGRST116' }, entity, operation)
  return result.data
}

// Honor API row caps instead of silently presenting the first page as all data.
export async function cloudRows(makeQuery, signal, entity) {
  const rows = []
  while (true) {
    const result = await cloudResponse(
      makeQuery().range(rows.length, rows.length + 499),
      signal,
      entity,
      'SELECT',
    )
    const page = result.data ?? []
    rows.push(...page)
    if (result.count != null ? rows.length >= result.count : page.length < 500) return rows
    if (!page.length)
      throw new Error(`Could not load all public.${entity} records. Reload before editing.`)
  }
}

export function requiredText(value, label, limit) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter a ${label}.`)
  if (value.trim().length > limit)
    throw new Error(`The ${label} must be at most ${limit} characters.`)
  return value.trim()
}

export function optionalText(value, label, limit = Infinity) {
  if (typeof value !== 'string' || value.length > limit)
    throw new Error(
      `Enter valid ${label} text${limit < Infinity ? ` (at most ${limit} characters)` : ''}.`,
    )
  return value
}
