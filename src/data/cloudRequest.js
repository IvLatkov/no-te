import { describeSupabaseError } from '../lib/supabaseErrors.js'

export function cloudError(failure, entity, operation) {
  const code = failure?.code
  let message
  if (code === '23502' && entity === 'projects' && /user_id/.test(failure.message ?? '')) {
    message =
      'Project creation requires a database-supplied owner. public.projects.user_id has no usable auth.uid() default. No client-selected owner was sent.'
  } else if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code)) {
    message = `Schema mismatch for public.${entity}. Check the columns documented for iteration 6.3B and the API schema cache (${code}).`
  } else if (code === '42501' || failure?.status === 403) {
    message = `Permission denied for ${operation} on public.${entity}. Check the authenticated role grants and RLS policies; they have not been changed.`
  } else if (code === 'PGRST116') {
    message =
      'This record is unavailable, was removed, or is not accessible to this account. Reload before retrying.'
  } else if (code === '23503') {
    message =
      'The database rejected this relationship or deletion. Reload and check the project foreign keys; no related documentation was explicitly deleted.'
  } else if (['23514', '23502', '22001', '23505'].includes(code)) {
    message = `The database rejected these ${entity} values (${code}). Check required fields, validation triggers, and constraints.`
  } else {
    message = describeSupabaseError(failure).message
  }
  return new Error(message)
}

export function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
}

export async function requireCloudUser(client, expectedUserId, signal) {
  checkAbort(signal)
  if (!client || !expectedUserId)
    throw new Error('Sign in before accessing cloud projects or tasks.')
  let response
  try {
    response = await client.auth.getUser()
  } catch (failure) {
    checkAbort(signal)
    throw cloudError(failure, 'projects', 'authentication')
  }
  const { data, error } = response
  checkAbort(signal)
  if (error) throw cloudError(error, 'projects', 'authentication')
  if (!data?.user || data.user.id !== expectedUserId)
    throw new Error('The account changed. Sign in again before accessing cloud data.')
  return data.user
}

async function cloudResponse(query, signal, entity, operation) {
  checkAbort(signal)
  let result
  try {
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
