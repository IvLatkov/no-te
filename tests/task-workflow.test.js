import test from 'node:test'
import assert from 'node:assert/strict'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { createCloudProjectsStore } from '../src/data/cloudProjectsStore.js'
import { archiveLabel, activeTasks, nextWorkflowRefresh } from '../src/data/taskWorkflow.js'
import { filterDocumentation, tasksForNote } from '../src/data/taskDocumentation.js'
import { buildSearchIndex } from '../src/data/search.js'
import { exportCloudBackup, parseCloudBackup } from '../src/data/cloudBackup.js'
import { workflowFixture, DAY } from './helpers/workflowFixture.js'

test('API uses server completion, exact elapsed boundary, stable edits, reopening and recompletion', async () => {
  const { db, project } = workflowFixture()
  const api = createTasksApi(db, 'alice')
  const created = await api.createTask(project.id, { title: 'New', status: 'done', completedAt: '1900-01-01' })
  assert.equal(created.status, 'todo')
  assert.equal(created.completedAt, null)
  const done = await api.moveTask(project.id, created.id, 'done')
  assert.equal(done.completedAt, new Date(db.serverTime).toISOString())
  assert.equal(Date.parse(done.archivesAt) - Date.parse(done.completedAt), 7 * DAY)
  assert.equal(archiveLabel(done), 'Archives in 7 days')
  const edited = await api.updateTask(project.id, created.id, { title: 'Edited', implementationNotes: 'Keep me', status: 'done', completedAt: '1900-01-01', archivesAt: '2100-01-01' })
  assert.equal(edited.completedAt, done.completedAt)
  assert.equal(edited.archivesAt, done.archivesAt)
  db.serverTime += 7 * DAY - 1
  let tasks = await api.fetchTasks([project.id])
  assert.equal(tasks.find((task) => task.id === created.id).isArchived, false)
  assert.equal(archiveLabel(tasks.find((task) => task.id === created.id)), 'Archives in less than a day')
  db.serverTime += 1
  tasks = await api.fetchTasks([project.id])
  assert.equal(tasks.find((task) => task.id === created.id).isArchived, true)
  assert.ok(!activeTasks(tasks).some((task) => task.id === created.id))
  const restored = await api.moveTask(project.id, created.id, 'todo')
  assert.equal(restored.completedAt, null)
  assert.equal(restored.archivesAt, null)
  assert.equal(restored.isArchived, false)
  const again = await api.moveTask(project.id, created.id, 'done')
  assert.notEqual(again.completedAt, done.completedAt)
  assert.equal(Date.parse(again.archivesAt) - Date.parse(again.completedAt), 7 * DAY)
  await assert.rejects(createTasksApi(db, 'bob').moveTask(project.id, created.id, 'todo'), /account changed|Sign in/)
})

test('store persists archive state and relationships; failed restore retains task and reports failure', async () => {
  const { db, archived, project } = workflowFixture()
  const relations = JSON.stringify([db.task_notes, db.task_tags, db.notes])
  const store = createCloudProjectsStore(db, 'alice')
  try {
    assert.equal(await store.load(), true)
    assert.equal(store.getSnapshot().projects[0].tasks.find((task) => task.id === archived.id).isArchived, true)
    db.failure = (call) => call.table === 'tasks' && call.op === 'update' ? new TypeError('Failed to fetch') : null
    assert.equal(await store.moveTask(project.id, archived.id, 'todo'), false)
    assert.equal(db.tasks.find((task) => task.id === archived.id).status, 'done')
    assert.match(store.getSnapshot().mutationError, /connection|request|Network/i)
    db.failure = null
    assert.equal(await store.moveTask(project.id, archived.id, 'todo'), true)
    assert.equal(store.getSnapshot().projects[0].tasks.find((task) => task.id === archived.id).archivesAt, null)
    assert.equal(JSON.stringify([db.task_notes, db.task_tags, db.notes]), relations)
  } finally { store.dispose() }
})

test('archive relationships classify documentation without duplication and remain searchable', async () => {
  const { db, linked, independent, project, archived } = workflowFixture()
  const rows = await createTasksApi(db, 'alice').fetchTasks([project.id])
  const projects = [{ ...project, tasks: rows.map((task) => ({ ...task, linkedNoteIds: db.task_notes.filter((row) => row.task_id === task.id).map((row) => row.note_id) })) }]
  assert.deepEqual(filterDocumentation([linked, independent], projects, 'task-linked').map((note) => note.id), [linked.id])
  assert.deepEqual(filterDocumentation([linked, independent], projects, 'independent').map((note) => note.id), [independent.id])
  assert.equal(tasksForNote(projects, linked.id).length, 2)
  assert.equal(tasksForNote(projects, linked.id).find((task) => task.taskId === archived.id).isArchived, true)
  assert.equal(buildSearchIndex(projects, [], []).find((result) => result.id === archived.id).archived, true)
  assert.equal(nextWorkflowRefresh([{ tasks: [{ status: 'done', isArchived: false, archiveSecondsRemaining: 10 }] }]), 10100)
  assert.equal(nextWorkflowRefresh([{ tasks: [{ status: 'done', isArchived: true, archiveSecondsRemaining: 0 }] }]), null)
})

test('cloud exports preserve completion and grace metadata; older backups still preview', async () => {
  const { db, done } = workflowFixture()
  const { backup } = await exportCloudBackup(db, 'alice')
  const row = backup.data.tasks.find((task) => task.id === done.id)
  assert.equal(row.completed_at, done.completed_at)
  assert.equal(row.archives_at, done.archives_at)
  assert.equal(parseCloudBackup(JSON.stringify(backup)).backup.data.task_notes.length, 2)
  const older = structuredClone(backup)
  for (const task of older.data.tasks) {
    delete task.completed_at; delete task.archives_at; delete task.archive_grace_started_at
  }
  assert.equal(parseCloudBackup(JSON.stringify(older)).counts.tasks, 3)
  const invalid = structuredClone(backup)
  invalid.data.tasks.find((task) => task.id === done.id).archives_at = '2100-01-01T00:00:00Z'
  assert.throws(() => parseCloudBackup(JSON.stringify(invalid)), /seven elapsed days/)
})

test('missing archive schema stops edits with actionable setup and preserves stored data', async () => {
  const { db } = workflowFixture()
  const saved = JSON.stringify([db.tasks, db.notes])
  db.workflowAvailable = false
  const store = createCloudProjectsStore(db, 'alice')
  try {
    assert.equal(await store.load(), false)
    assert.match(store.getSnapshot().error, /database-local\/task-workflow.sql/)
    assert.equal(await store.createTask(db.projects[0].id, { title: 'Blocked' }), false)
    assert.equal(JSON.stringify([db.tasks, db.notes]), saved)
  } finally { store.dispose() }
})

test('a confirmed archived edit with failed refresh never reappears in active Done', async () => {
  const { db, archived, project } = workflowFixture()
  const store = createCloudProjectsStore(db, 'alice')
  try {
    await store.load()
    db.failure = (call) => call.table === 'tasks' && call.op === 'select' && call.fields.includes('is_archived') ? new TypeError('Failed to fetch') : null
    assert.equal(await store.updateTask(project.id, archived.id, { title: 'Confirmed edit' }), true)
    const task = store.getSnapshot().projects[0].tasks.find((task) => task.id === archived.id)
    assert.equal(task.title, 'Confirmed edit')
    assert.equal(task.isArchived, true)
    assert.equal(activeTasks([task]).length, 0)
    assert.match(store.getSnapshot().error, /Saved, but refresh failed/)
    assert.equal(db.tasks.find((task) => task.id === archived.id).title, 'Confirmed edit')
  } finally { store.dispose() }
})
