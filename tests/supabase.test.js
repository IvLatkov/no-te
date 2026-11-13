import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSupabaseConfig } from '../src/lib/supabaseClient.js'
import { testDatabaseConnection } from '../src/lib/connectionTest.js'
import { describeSupabaseError } from '../src/lib/supabaseErrors.js'

test('public configuration rejects missing, malformed and privileged credentials', () => {
  assert.match(validateSupabaseConfig('', ''), /VITE_SUPABASE_URL/)
  assert.match(validateSupabaseConfig('not-a-url', 'sb_publishable_test'), /valid/)
  assert.match(validateSupabaseConfig('http://example.com', 'sb_publishable_test'), /HTTPS/)
  for (const key of ['sb_secret_test', 'service_role', 'eyJhbGciOiJIUzI1NiJ9']) {
    assert.match(validateSupabaseConfig('https://example.supabase.co', key), /publishable key/)
  }
  assert.equal(validateSupabaseConfig('https://example.supabase.co', 'sb_publishable_test'), '')
  assert.equal(validateSupabaseConfig('http://localhost:54321', 'sb_publishable_test'), '')
})

test('connection probe authenticates first and only SELECTs public.projects, including zero rows', async () => {
  const calls = []
  const client = {
    auth: {
      async getUser() {
        calls.push('getUser')
        return { data: { user: { id: 'one', email: 'one@example.com' } } }
      },
    },
    schema(name) {
      calls.push(['schema', name])
      return this
    },
    from(name) {
      calls.push(['from', name])
      return this
    },
    select(fields) {
      calls.push(['select', fields])
      return this
    },
    async limit(n) {
      calls.push(['limit', n])
      return { data: [], error: null }
    },
  }
  assert.deepEqual(await testDatabaseConnection(client, 'one'), {
    kind: 'connected',
    message: 'Connected',
    email: 'one@example.com',
  })
  assert.deepEqual(calls, [
    'getUser',
    ['schema', 'public'],
    ['from', 'projects'],
    ['select', 'id'],
    ['limit', 1],
  ])
  calls.length = 0
  assert.equal((await testDatabaseConnection(client, 'other')).kind, 'authentication')
  assert.deepEqual(calls, ['getUser'])
  client.auth.getUser = async () => ({ error: { status: 401 } })
  assert.equal((await testDatabaseConnection(client, 'one')).kind, 'authentication')
  client.auth.getUser = async () => {
    throw new TypeError('Failed to fetch')
  }
  assert.equal((await testDatabaseConnection(client, 'one')).kind, 'network')
  assert.equal((await testDatabaseConnection(null, 'one')).kind, 'configuration')
})

test('connection failures distinguish permission, network, configuration and authentication without raw details', async () => {
  const cases = [
    [{ status: 403, code: '42501' }, 'permission'],
    [{ status: 401 }, 'authentication'],
    [{ status: 0, message: 'Failed to fetch' }, 'network'],
    [{ status: 404, code: '42P01' }, 'configuration'],
    [{ status: 500 }, 'request'],
  ]
  for (const [error, kind] of cases) {
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'one' } } }) },
      schema() {
        return this
      },
      from() {
        return this
      },
      select() {
        return this
      },
      limit: async () => ({ error: { ...error, details: 'DO-NOT-EXPOSE' } }),
    }
    const result = await testDatabaseConnection(client, 'one')
    assert.equal(result.kind, kind)
    assert.doesNotMatch(JSON.stringify(result), /DO-NOT-EXPOSE/)
  }
  assert.match(describeSupabaseError({ code: 'invalid_credentials' }, 'login').message, /incorrect/)
})
