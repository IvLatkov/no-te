import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { backupFixture, seedBackupData } from './helpers/backupFixture.js'
import { USER_DATA_KEYS } from '../src/data/storageSafety.js'

function fakeSupabase() {
  const listeners = new Set()
  let session = null
  const fake = {
    loginError: null,
    queryError: null,
    logoutError: null,
    identityError: null,
    queries: [],
    emit(value) {
      session = value
      for (const listener of listeners) listener(value ? 'SIGNED_IN' : 'SIGNED_OUT', value)
    },
    session(id = 'account-a', expires_at = Math.floor(Date.now() / 1000) + 3600) {
      return {
        access_token: `test-token-${id}`,
        expires_at,
        user: { id, email: `${id}@example.com` },
      }
    },
    auth: {
      onAuthStateChange(listener) {
        listeners.add((_event, value) => listener(_event, value))
        const handler = [...listeners].at(-1)
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(handler)
              },
            },
          },
        }
      },
      async getSession() {
        return { data: { session }, error: null }
      },
      async getUser() {
        return { data: { user: session?.user }, error: fake.identityError }
      },
      async signInWithPassword({ email, password }) {
        if (fake.loginError) return { error: fake.loginError }
        assert.equal(email, 'owner@example.com')
        assert.equal(password, 'test-password')
        const value = fake.session()
        fake.emit(value)
        return { data: { session: value } }
      },
      async signOut(options) {
        assert.deepEqual(options, { scope: 'local' })
        if (fake.logoutError) return { error: fake.logoutError }
        fake.emit(null)
        return { error: null }
      },
    },
    schema(value) {
      fake.queries.push(['schema', value])
      return fake
    },
    from(value) {
      fake.queries.push(['from', value])
      return fake
    },
    select(value) {
      fake.queries.push(['select', value])
      return fake
    },
    eq() {
      return fake
    },
    order() {
      return fake
    },
    range() {
      return fake
    },
    abortSignal() {
      return fake
    },
    setHeader() {
      return fake
    },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    },
    async limit(value) {
      fake.queries.push(['limit', value])
      return { data: [], error: fake.queryError }
    },
  }
  return fake
}

const rawLegacy = () => USER_DATA_KEYS.map((key) => localStorage.getItem(key))
async function login(ui) {
  await ui.input(document.querySelector('#login-email'), 'owner@example.com')
  await ui.input(document.querySelector('#login-password'), 'test-password')
  await ui.act(async () =>
    document
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
async function settings(ui) {
  await ui.click(document.querySelector('.sidebar-bottom button'))
}

test('authentication gates production UI, handles invalid login, restores sessions and signs out without touching legacy content', async () => {
  const client = fakeSupabase()
  const ui = await uiHarness('test-auth-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    seedBackupData(localStorage, backupFixture('Quarantined').data)
    const original = rawLegacy()
    await ui.mount()
    assert.ok(document.querySelector('#login-heading'))
    assert.equal(document.querySelector('.sidebar'), null)
    assert.doesNotMatch(document.body.textContent, /Quarantined/)
    client.loginError = { code: 'invalid_credentials', status: 400 }
    await login(ui)
    assert.match(document.querySelector('[role="alert"]').textContent, /incorrect/)
    client.loginError = new TypeError('Failed to fetch')
    await login(ui)
    assert.match(document.querySelector('[role="alert"]').textContent, /connection/)
    client.loginError = null
    await login(ui)
    await ui.waitFor(() => document.querySelector('.sidebar'))
    await ui.click(document.querySelectorAll('.primary-nav button')[1])
    assert.match(document.body.textContent, /Local-only browser content remains quarantined/)
    assert.doesNotMatch(document.body.textContent, /Quarantined/)
    await ui.click(document.querySelectorAll('.primary-nav button')[2])
    await ui.waitFor(() => document.querySelector('.notes-panel'))
    assert.equal(document.querySelector('.note-prose'), null)
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.sidebar'))
    await settings(ui)
    assert.match(document.body.textContent, /account-a@example.com/)
    client.queries.length = 0
    await ui.click(ui.byText('Test connection'))
    assert.match(document.querySelector('.connection-success').textContent, /Connected/)
    assert.deepEqual(client.queries, [
      ['schema', 'public'],
      ['from', 'projects'],
      ['select', 'id'],
      ['limit', 1],
    ])
    client.queryError = { code: '42501', status: 403 }
    await ui.click(ui.byText('Test connection'))
    assert.match(document.querySelector('[role="alert"]').textContent, /Permission/)
    client.queryError = { status: 0, message: 'Failed to fetch' }
    await ui.click(ui.byText('Test connection'))
    assert.match(document.querySelector('[role="alert"]').textContent, /Network/)
    client.logoutError = { status: 0 }
    await ui.click(ui.byText('Sign out'))
    assert.ok(document.querySelector('.sidebar'))
    assert.match(document.querySelector('[role="alert"]').textContent, /connection/)
    client.logoutError = null
    await ui.click(ui.byText('Sign out'))
    assert.ok(document.querySelector('#login-heading'))
    assert.equal(document.querySelector('.sidebar'), null)
    assert.deepEqual(rawLegacy(), original)
  } finally {
    await ui.close()
  }
})

test('account switches and auth loss clear account UI and pending connection output; expired sessions stay gated', async () => {
  const client = fakeSupabase()
  client.emit(client.session())
  const ui = await uiHarness('test-auth-switch-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    seedBackupData(localStorage, backupFixture('Private').data)
    const original = rawLegacy()
    await ui.mount()
    await settings(ui)
    let resolveQuery
    client.limit = () =>
      new Promise((resolve) => {
        resolveQuery = resolve
      })
    await ui.click(ui.byText('Test connection'))
    await ui.act(async () => client.emit(client.session('account-b')))
    assert.doesNotMatch(document.body.textContent, /account-a@example.com/)
    await settings(ui)
    assert.match(document.body.textContent, /account-b@example.com/)
    await ui.act(async () => resolveQuery({ data: [], error: null }))
    assert.equal(document.querySelector('.connection-success'), null)
    await ui.act(async () => client.emit(null))
    assert.ok(document.querySelector('#login-heading'))
    await ui.act(async () =>
      client.emit(client.session('expired', Math.floor(Date.now() / 1000) - 1)),
    )
    await ui.waitFor(() => document.querySelector('#login-heading'))
    assert.equal(document.querySelector('.sidebar'), null)
    assert.deepEqual(rawLegacy(), original)
  } finally {
    await ui.close()
  }
})

test('missing configuration disables login and never exposes workspace', async () => {
  const ui = await uiHarness('test-auth-config-ui', {
    module: '/src/App.jsx',
    props: {
      client: null,
      configError: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    },
  })
  try {
    await ui.mount()
    assert.match(document.querySelector('[role="alert"]').textContent, /VITE_SUPABASE/)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    assert.equal(document.querySelector('.sidebar'), null)
  } finally {
    await ui.close()
  }
})

test('unverified cached sessions stay gated and retry can restore a verified session', async () => {
  const client = fakeSupabase()
  client.emit(client.session())
  client.identityError = { status: 0, message: 'Failed to fetch' }
  const ui = await uiHarness('test-auth-identity-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    await ui.mount()
    assert.ok(document.querySelector('#login-heading'))
    assert.equal(document.querySelector('.sidebar'), null)
    assert.match(document.querySelector('[role="alert"]').textContent, /connection/)
    client.identityError = null
    await ui.click(ui.byText('Retry session check'))
    await ui.waitFor(() => document.querySelector('.sidebar'))
  } finally {
    await ui.close()
  }
})
