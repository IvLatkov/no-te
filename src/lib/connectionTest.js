import { describeSupabaseError } from './supabaseErrors.js'

export async function testDatabaseConnection(client, expectedUserId) {
  if (!client) return { kind: 'configuration', message: 'Supabase is not configured.' }
  try {
    // getUser contacts Auth; a cached session alone is not an identity check.
    const identity = await client.auth.getUser()
    if (identity.error) return describeSupabaseError(identity.error)
    if (!identity.data?.user || identity.data.user.id !== expectedUserId) {
      return {
        kind: 'authentication',
        message: 'The signed-in account changed. Reopen Settings and try again.',
      }
    }
    // A zero-row response is still a successful connection. No remote content is
    // returned to the workspace and no table is ever written by this test.
    const result = await client.schema('public').from('projects').select('id').limit(1)
    if (result.error) return describeSupabaseError(result.error)
    return { kind: 'connected', message: 'Connected', email: identity.data.user.email }
  } catch (error) {
    return describeSupabaseError(error)
  }
}
