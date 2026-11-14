import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { createCloudProjectsStore } from '../src/data/cloudProjectsStore.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'

test('cloud project/task CRUD uses server records, explicit fields and cascade without touching relationships or localStorage', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const projects = createProjectsApi(db, 'alice')
  const tasks = createTasksApi(db, 'alice')
  assert.deepEqual(await projects.fetchProjects(), [])
  const project = await projects.createProject({
    name: ' Cloud ',
    description: 'First',
    user_id: 'bob',
    id: 'invented',
  })
  const insert = db.calls.find((call) => call.op === 'insert')
  assert.deepEqual(insert.values, { name: 'Cloud', description: 'First' })
  assert.notEqual(project.id, 'invented')
  assert.equal(db.projects[0].user_id, 'alice')
  assert.ok(project.createdAt)
  assert.equal(
    (
      await projects.updateProject(project.id, {
        name: 'Renamed',
        description: 'Updated',
        user_id: 'bob',
      })
    ).name,
    'Renamed',
  )
  assert.deepEqual(await tasks.fetchTasks([project.id]), [])
  const task = await tasks.createTask(project.id, {
    title: 'Task',
    implementationNotes: 'Keep me',
    project_id: 'foreign',
    tagIds: ['never-written'],
  })
  assert.equal(task.projectId, project.id)
  assert.equal(task.implementationNotes, 'Keep me')
  assert.equal(task.status, 'todo')
  assert.equal(task.tagIds, undefined)
  const changed = await tasks.updateTask(project.id, task.id, {
    title: 'Changed',
    description: 'New',
    implementationNotes: 'Decisions\nCommands',
    project_id: 'foreign',
    linkedNoteIds: [],
  })
  assert.equal(changed.implementationNotes, 'Decisions\nCommands')
  assert.equal((await tasks.moveTask(project.id, task.id, 'done')).status, 'done')
  assert.equal((await tasks.moveTask(project.id, task.id, 'todo')).status, 'todo')
  assert.equal((await tasks.fetchTasks([project.id]))[0].title, 'Changed')
  await assert.rejects(tasks.moveTask(project.id, task.id, 'invalid'), /To Do or Done/)
  await tasks.deleteTask(project.id, task.id)
  assert.equal(db.tasks.length, 0)
  await tasks.createTask(project.id, { title: 'Cascade' })
  db.calls.length = 0
  await projects.deleteProject(project.id)
  assert.equal(db.projects.length, 0)
  assert.equal(db.tasks.length, 0)
  assert.deepEqual(
    db.calls.filter((call) => call.op === 'delete').map((call) => [call.table, call.op]),
    [['projects', 'delete']],
  )
})

test('anonymous and cross-account access fails closed; task writes require an owned existing parent', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const projects = createProjectsApi(db, 'alice')
  const project = await projects.createProject({ name: 'Private' })
  const tasks = createTasksApi(db, 'alice')
  await tasks.createTask(project.id, { title: 'Private task' })
  db.emit('bob')
  const bobProjects = createProjectsApi(db, 'bob')
  const bobTasks = createTasksApi(db, 'bob')
  assert.deepEqual(await bobProjects.fetchProjects(), [])
  assert.deepEqual(await bobTasks.fetchTasks([project.id]), [])
  await assert.rejects(bobProjects.updateProject(project.id, { name: 'Stolen' }), /unavailable/)
  await assert.rejects(bobProjects.deleteProject(project.id), /unavailable/)
  await assert.rejects(bobTasks.createTask(project.id, { title: 'Intrusion' }), /unavailable/)
  await assert.rejects(
    bobTasks.updateTask(project.id, db.tasks[0].id, { title: 'Intrusion' }),
    /unavailable/,
  )
  await assert.rejects(bobTasks.deleteTask(project.id, db.tasks[0].id), /unavailable/)
  await assert.rejects(projects.createProject({ name: 'Stale session' }), /account changed/)
  db.emit(null)
  db.calls.length = 0
  await assert.rejects(projects.fetchProjects(), /session/)
  assert.deepEqual(db.calls, [])
})

test('cloud errors report schema, owner defaults, permissions, foreign keys and network failures safely', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createProjectsApi(db, 'alice')
  for (const [error, expected] of [
    [{ code: '23502', message: 'null value in column user_id SECRET' }, /auth.uid\(\) default/],
    [{ code: '42703', message: 'SECRET' }, /Schema mismatch.*42703/],
    [{ code: '42501', message: 'SECRET' }, /Permission denied/],
    [{ code: '23503', message: 'SECRET' }, /foreign keys/],
    [new TypeError('Failed to fetch SECRET'), /connection/],
  ]) {
    db.failure = () => error
    await assert.rejects(
      api.createProject({ name: 'Example' }),
      (failure) => expected.test(failure.message) && !failure.message.includes('SECRET'),
    )
  }
})

test('memory store refreshes after writes, blocks overlapping writes and distinguishes committed writes from refresh failures', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const store = createCloudProjectsStore(db, 'alice')
  await store.load()
  assert.deepEqual(store.getSnapshot().projects, [])
  const first = store.createProject({ name: 'One' })
  assert.equal(await store.createProject({ name: 'Duplicate' }), false)
  assert.equal(await first, true)
  const id = store.getSnapshot().projects[0].id
  assert.equal(await store.createTask(id, { title: 'Task' }), true)
  assert.equal(store.getSnapshot().projects[0].tasks.length, 1)
  db.failure = (call) => (call.op === 'select' ? { status: 0 } : null)
  assert.equal(await store.updateProject(id, { name: 'Saved once' }), true)
  assert.match(store.getSnapshot().error, /Saved, but refresh failed/)
  assert.equal(store.getSnapshot().projects[0].name, 'Saved once')
  assert.equal(db.projects.length, 1)
  db.failure = null
  await store.load()
  assert.equal(store.getSnapshot().projects[0].name, 'Saved once')
  store.dispose()
  assert.deepEqual(store.getSnapshot().projects, [])
})

test('late loads cannot overwrite newer data or revive a signed-out store', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createProjectsApi(db, 'alice')
  await api.createProject({ name: 'First' })
  const store = createCloudProjectsStore(db, 'alice')
  let release
  let arrived
  const paused = new Promise((resolve) => {
    arrived = resolve
  })
  db.pause = async (call) => {
    if (call.table === 'projects') {
      db.pause = null
      call.response = { data: [{ ...db.projects[0], name: 'Outdated' }], error: null, count: 1 }
      arrived()
      await new Promise((resolve) => {
        release = resolve
      })
    }
  }
  const old = store.load()
  await paused
  db.projects[0].name = 'Newer'
  await store.load()
  release()
  await old
  assert.equal(store.getSnapshot().projects[0].name, 'Newer')
  let releaseWrite
  const writePaused = new Promise((resolve) => {
    arrived = resolve
  })
  db.pause = async (call) => {
    if (call.op === 'insert') {
      arrived()
      await new Promise((resolve) => {
        releaseWrite = resolve
      })
    }
  }
  const write = store.createProject({ name: 'In flight' })
  await writePaused
  store.dispose()
  db.emit(null)
  releaseWrite()
  assert.equal(await write, false)
  assert.deepEqual(store.getSnapshot().projects, [])
  const fresh = createCloudProjectsStore(db, 'bob')
  db.emit('bob')
  db.pause = null
  await fresh.load()
  assert.deepEqual(fresh.getSnapshot().projects, [])
  fresh.dispose()
})

test('cloud reads page past API caps and preserve field mappings for every task', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  db.projects = Array.from({ length: 601 }, (_, index) => ({
    id: `p-${index}`,
    user_id: 'alice',
    name: `Project ${index}`,
  }))
  db.tasks = Array.from({ length: 1201 }, (_, index) => ({
    id: `t-${index}`,
    project_id: 'p-0',
    title: `Task ${index}`,
    status: 'todo',
    implementation_notes: 'Keep',
  }))
  const projects = await createProjectsApi(db, 'alice').fetchProjects()
  const tasks = await createTasksApi(db, 'alice').fetchTasks(projects.map((project) => project.id))
  assert.equal(projects.length, 601)
  assert.equal(tasks.length, 1201)
  assert.ok(tasks.every((task) => task.implementationNotes === 'Keep'))
  assert.ok(db.calls.some((call) => call.range?.[0] === 1000))
})
