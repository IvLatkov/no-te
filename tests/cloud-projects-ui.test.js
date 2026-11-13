import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { backupFixture, seedBackupData } from './helpers/backupFixture.js'
import { USER_DATA_KEYS } from '../src/data/storageSafety.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'

const legacy = () => USER_DATA_KEYS.map((key) => localStorage.getItem(key))
const noDialog = () => !document.querySelector('dialog')
async function projects(ui) {
  await ui.click(document.querySelectorAll('.primary-nav button')[1])
  await ui.waitFor(() => document.querySelector('.projects-page'))
}

test('cloud UI reuses project/board controls for CRUD, notes, movement, drag events and reload while preserving legacy data', async () => {
  const client = cloudSupabase()
  client.emit('alice')
  const ui = await uiHarness('test-cloud-project-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    seedBackupData(localStorage, backupFixture('Legacy-secret').data)
    const original = legacy()
    await ui.mount()
    await projects(ui)
    assert.match(document.body.textContent, /A fresh start/)
    assert.doesNotMatch(document.body.textContent, /Legacy-secret/)
    await ui.click(ui.byText('New Project'))
    await ui.input(document.querySelector('#project-name'), 'Cloud release')
    await ui.input(document.querySelector('#project-description'), 'Plan')
    await ui.submit()
    await ui.waitFor(noDialog)
    assert.equal(client.projects.length, 1)
    assert.equal(client.projects[0].user_id, 'alice')
    assert.match(document.querySelector('.project-nav').textContent, /Cloud release/)
    await ui.click(ui.byLabel('Edit project Cloud release'))
    await ui.input(document.querySelector('#project-name'), 'Release')
    await ui.input(document.querySelector('#project-description'), 'Updated plan')
    await ui.submit()
    await ui.waitFor(noDialog)
    await ui.click(document.querySelector('.project-nav button'))
    assert.match(document.querySelector('#project-title').textContent, /Release/)
    assert.match(document.querySelector('.project-description').textContent, /Updated plan/)
    await ui.click(ui.byLabel('New task'))
    await ui.input(document.querySelector('#task-title'), 'Ship')
    await ui.input(document.querySelector('#task-description'), 'Checklist')
    await ui.submit()
    await ui.waitFor(noDialog)
    assert.equal(client.tasks.length, 1)
    await ui.click(ui.byLabel('Open task Ship'))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    await ui.input(document.querySelector('#task-title'), 'Ship v2')
    await ui.input(document.querySelector('#cloud-task-implementation'), 'Commands\nDecisions')
    assert.match(document.querySelector('dialog').textContent, /Linked documentation/)
    assert.ok(document.querySelector('.tag-selector'))
    assert.ok(document.querySelector('.task-detail-timestamps time').dateTime)
    await ui.submit()
    await ui.waitFor(noDialog)
    assert.equal(client.tasks[0].implementation_notes, 'Commands\nDecisions')
    await ui.click(ui.byLabel('Move Ship v2 to Done'))
    await ui.waitFor(
      () =>
        document.querySelector('.task-card.is-done') && !document.querySelector('[role="status"]'),
    )
    const transfer = {
      value: '',
      setData(_type, value) {
        this.value = value
      },
      getData() {
        return this.value
      },
    }
    const dragStart = new ui.dom.window.Event('dragstart', { bubbles: true })
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer })
    await ui.act(async () => document.querySelector('.task-card').dispatchEvent(dragStart))
    const drop = new ui.dom.window.Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: transfer })
    await ui.act(async () => document.querySelectorAll('.board-column')[0].dispatchEvent(drop))
    await ui.waitFor(
      () =>
        !document.querySelector('.task-card.is-done') && !document.querySelector('[role="status"]'),
    )
    assert.equal(client.tasks[0].status, 'todo')
    assert.equal(document.querySelector('.task-count').textContent, '1')
    await ui.mount()
    await projects(ui)
    await ui.click(ui.byLabel('Open project Release'))
    assert.match(document.querySelector('.task-card').textContent, /Ship v2/)
    await ui.click(ui.byLabel('Delete task Ship v2'))
    await ui.click(ui.byText('Cancel', document.querySelector('dialog')))
    assert.equal(client.tasks.length, 1)
    await ui.click(ui.byLabel('Delete task Ship v2'))
    client.failure = (call) =>
      call.op === 'delete' && call.table === 'tasks' ? { code: '42501' } : null
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(() => document.querySelector('dialog [role="alert"]'))
    assert.match(document.querySelector('dialog [role="alert"]').textContent, /Permission denied/)
    assert.equal(client.tasks.length, 1)
    client.failure = null
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(noDialog)
    assert.equal(client.tasks.length, 0)
    await ui.click(ui.byLabel('New task'))
    await ui.input(document.querySelector('#task-title'), 'Cascade')
    await ui.submit()
    await ui.waitFor(noDialog)
    await ui.click(ui.byLabel('Delete project'))
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(noDialog)
    assert.equal(client.projects.length, 0)
    assert.equal(client.tasks.length, 0)
    assert.match(document.body.textContent, /A fresh start/)
    assert.deepEqual(legacy(), original)
    assert.ok(
      client.calls
        .filter((call) => call.op !== 'select')
        .every((call) => ['projects', 'tasks'].includes(call.table)),
    )
  } finally {
    await ui.close()
  }
})

test('sign-out/account switches hide loaded cloud records and suppress a pending old response', async () => {
  const client = cloudSupabase()
  client.emit('alice')
  await createProjectsApi(client, 'alice').createProject({ name: 'Alice private project' })
  const ui = await uiHarness('test-cloud-account-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    await ui.mount()
    await projects(ui)
    assert.match(document.body.textContent, /Alice private project/)
    let release
    let arrived
    const paused = new Promise((resolve) => {
      arrived = resolve
    })
    client.pause = async (call) => {
      if (call.table === 'projects') {
        client.pause = null
        arrived()
        await new Promise((resolve) => {
          release = resolve
        })
      }
    }
    await ui.click(ui.byText('Refresh projects'))
    await paused
    await ui.act(async () => client.emit(null))
    assert.ok(document.querySelector('#login-heading'))
    assert.doesNotMatch(document.body.textContent, /Alice private project/)
    await ui.act(async () => {
      client.emit('bob')
      release()
    })
    await projects(ui)
    assert.match(document.body.textContent, /A fresh start/)
    assert.doesNotMatch(document.body.textContent, /Alice private project/)
  } finally {
    await ui.close()
  }
})

test('load errors stay visible and retry restores an empty cloud Projects page', async () => {
  const client = cloudSupabase()
  client.emit('alice')
  client.failure = () => ({ code: '42703' })
  const ui = await uiHarness('test-cloud-load-error-ui', {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  try {
    await ui.mount()
    await ui.click(document.querySelectorAll('.primary-nav button')[1])
    await ui.waitFor(() => document.querySelector('[role="alert"]'))
    assert.match(document.querySelector('[role="alert"]').textContent, /Schema mismatch/)
    assert.equal(document.querySelector('.projects-page'), null)
    client.failure = null
    await ui.click(ui.byText('Reload cloud data'))
    await ui.waitFor(() => document.querySelector('.projects-page'))
    assert.match(document.body.textContent, /A fresh start/)
  } finally {
    await ui.close()
  }
})
