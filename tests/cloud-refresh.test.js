import test from 'node:test'
import assert from 'node:assert/strict'
import { startCloudRefresh, CLOUD_REFRESH_INTERVAL } from '../src/data/cloudRefresh.js'
import { createCloudProjectsStore } from '../src/data/cloudProjectsStore.js'
import { createCloudDocumentationStore } from '../src/data/cloudDocumentationStore.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { readDashboardProject, saveDashboardProject } from '../src/data/dashboardPreference.js'

function clock() {
  const target = new EventTarget()
  target.navigator = { onLine: true }
  const page = new EventTarget()
  page.visibilityState = 'visible'
  const jobs = new Map()
  let id = 0
  return {
    target, page, interval: CLOUD_REFRESH_INTERVAL,
    schedule(fn, delay) { assert.equal(delay, CLOUD_REFRESH_INTERVAL); jobs.set(++id, fn); return id },
    cancel(key) { jobs.delete(key) },
    async tick() {
      const [key, fn] = jobs.entries().next().value
      jobs.delete(key)
      await fn()
    },
    jobs,
  }
}

async function fixture() {
  const db = cloudSupabase()
  db.emit('alice')
  const stamp = new Date().toISOString()
  db.projects.push({ id: 'project', user_id: 'alice', name: 'Game', description: '', created_at: stamp, updated_at: stamp })
  const projects = createCloudProjectsStore(db, 'alice')
  const notes = createCloudDocumentationStore(db, 'alice', { delay: 60_000 })
  await Promise.all([projects.load(), notes.start()])
  return { db, projects, notes, stamp }
}

test('background timer discovers external task creation, completion, documentation and links without writes', async () => {
  const { db, projects, notes, stamp } = await fixture()
  const time = clock()
  const stop = startCloudRefresh(projects, notes, time)
  try {
    db.tasks.push({ id: 'task', project_id: 'project', title: 'External task', description: '', status: 'todo', implementation_notes: '', created_at: stamp, updated_at: stamp })
    await time.tick()
    assert.equal(projects.getSnapshot().projects[0].tasks[0].status, 'todo')
    db.tasks[0].status = 'done'
    db.tasks[0].completed_at = stamp
    db.notes.push({ id: 'note', user_id: 'alice', project_id: 'project', folder_id: null, title: 'Implementation', content: { type: 'doc', content: [] }, created_at: stamp, updated_at: stamp })
    db.task_notes.push({ task_id: 'task', note_id: 'note' })
    await time.tick()
    assert.equal(projects.getSnapshot().projects[0].tasks[0].status, 'done')
    assert.equal(notes.getSnapshot().notes[0].title, 'Implementation')
    assert.deepEqual(notes.getSnapshot().task_notes.map(({ task_id, note_id }) => ({ task_id, note_id })), [{ task_id: 'task', note_id: 'note' }])
    assert.ok(db.calls.every(call => call.op === 'select'))
  } finally { stop(); projects.dispose(); notes.dispose() }
})

test('refresh pauses offline, hidden, editing, saving and dirty; cleanup prevents future events', async () => {
  const time = clock()
  const state = { loading: false, busy: false, status: 'saved' }
  let unsaved = false
  let calls = 0
  const store = { getSnapshot: () => state, hasUnsaved: () => unsaved, async load() { calls++ } }
  const stop = startCloudRefresh(store, store, time)
  time.target.navigator.onLine = false
  await time.tick()
  time.target.navigator.onLine = true
  time.page.visibilityState = 'hidden'
  await time.tick()
  time.page.visibilityState = 'visible'
  time.page.querySelector = () => ({})
  await time.tick()
  time.page.querySelector = () => null
  state.busy = true
  await time.tick()
  state.busy = false
  unsaved = true
  await time.tick()
  assert.equal(calls, 0)
  unsaved = false
  state.status = 'saving'
  await time.tick()
  assert.equal(calls, 0)
  state.status = 'saved'
  await time.tick()
  assert.equal(calls, 2)
  stop()
  assert.equal(time.jobs.size, 0)
  for (const event of ['focus', 'online']) time.target.dispatchEvent(new Event(event))
  time.page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(calls, 2)
})

test('focus refreshes without waiting for the timer, coalesces overlapping signals and recovers after failure', async () => {
  const time = clock()
  let release
  let calls = 0
  const pending = new Promise(resolve => { release = resolve })
  const store = { getSnapshot: () => ({}), hasUnsaved: () => false, async load() {
    calls++
    if (calls <= 2) { await pending; throw new Error('temporary read failure') }
  } }
  const stop = startCloudRefresh(store, store, time)
  try {
    time.target.dispatchEvent(new Event('focus'))
    time.target.dispatchEvent(new Event('online'))
    time.page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(calls, 2)
    release()
    await pending
    // Promise.allSettled and finally must settle before another refresh.
    await new Promise(resolve => setImmediate(resolve))
    await time.tick()
    assert.equal(calls, 4)
  } finally { stop() }
})

test('quiet documentation reads keep editor available and never initiate draft saves', async () => {
  const { db, projects, notes, stamp } = await fixture()
  try {
    db.notes.push({ id: 'note', user_id: 'alice', project_id: 'project', folder_id: null, title: 'Original', content: { type: 'doc', content: [] }, created_at: stamp, updated_at: stamp })
    await notes.load()
    const loading = []
    const unsubscribe = notes.subscribe(() => loading.push(notes.getSnapshot().loading))
    await notes.load({ quiet: true })
    assert.ok(loading.every(value => value === false))
    db.failure = call => call.table === 'notes' ? new TypeError('Temporary network failure') : null
    assert.equal(await notes.load({ quiet: true }), false)
    assert.equal(notes.getSnapshot().readOnly, false)
    assert.match(notes.getSnapshot().loadError, /connection/i)
    db.failure = null
    assert.equal(await notes.load({ quiet: true }), true)
    assert.equal(notes.getSnapshot().loadError, '')
    notes.update('note', { title: 'Unsaved title' })
    const before = db.calls.length
    assert.equal(await notes.load({ quiet: true }), false)
    assert.equal(db.calls.length, before)
    assert.equal(notes.getSnapshot().notes[0].title, 'Unsaved title')
    assert.equal(notes.hasUnsaved(), true)
    unsubscribe()
  } finally { projects.dispose(); notes.dispose() }
})

test('dashboard preference is account scoped, survives reload, clears on hide and tolerates blocked storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } })
  try {
    saveDashboardProject('alice', 'project-a')
    assert.equal(readDashboardProject('alice'), 'project-a')
    assert.equal(readDashboardProject('bob'), null)
    saveDashboardProject('bob', 'project-b')
    assert.equal(readDashboardProject('alice'), 'project-a')
    saveDashboardProject('alice', null)
    assert.equal(readDashboardProject('alice'), null)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
    assert.equal(readDashboardProject('alice'), null)
    assert.doesNotThrow(() => saveDashboardProject('alice', 'project'))
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})
