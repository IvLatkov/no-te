import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createCloudDocumentationStore } from '../src/data/cloudDocumentationStore.js'
import { createCloudProjectsStore } from '../src/data/cloudProjectsStore.js'

test('a stale documentation read cannot replace a confirmed autosave; queued/failed/retried states are accurate', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createDocumentationApi(db, 'alice')
  const note = await api.createNote({ title: 'Before' })
  const store = createCloudDocumentationStore(db, 'alice', { delay: 60000 })
  await store.start()
  let release, arrived
  const paused = new Promise((resolve) => { arrived = resolve })
  db.pause = async (call) => {
    if (call.table === 'notes' && call.op === 'select') {
      db.pause = null
      call.response = { data: structuredClone(db.notes), count: 1, error: null }
      arrived()
      await new Promise((resolve) => { release = resolve })
    }
  }
  const stale = store.load()
  await paused
  store.update(note.id, { title: 'After' })
  assert.equal(store.getSnapshot().status, 'unsaved')
  assert.equal(await store.flush(), true)
  release()
  assert.equal(await stale, false)
  assert.equal(store.getSnapshot().notes[0].title, 'After')
  assert.equal(store.getSnapshot().loading, false)
  db.failure = (call) => call.op === 'update' ? { status: 0 } : null
  store.update(note.id, { title: 'Retry me' })
  assert.equal(await store.flush(), false)
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.hasUnsaved(), true)
  db.failure = null
  assert.equal(await store.flush(), true)
  assert.equal(store.getSnapshot().status, 'saved')
  assert.equal(db.notes[0].title, 'Retry me')
  store.dispose()
})

test('project deletion detaches notes and folders, preserving JSON even with a destructive project-note cascade', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createProjectsApi(db, 'alice')
  const project = await api.createProject({ name: 'Project' })
  const docs = createDocumentationApi(db, 'alice')
  const folder = await docs.saveFolder({ name: 'Folder', projectId: project.id })
  const note = await docs.createNote({ title: 'Keep', projectId: project.id, folderId: folder.id })
  db.pause = async (call) => {
    if (call.table === 'projects' && call.op === 'delete') {
      db.notes = db.notes.filter((row) => row.project_id !== project.id)
      db.folders = db.folders.filter((row) => row.project_id !== project.id)
    }
  }
  await api.deleteProject(project.id)
  assert.equal(db.projects.length, 0)
  assert.equal(db.notes[0].project_id, null)
  assert.equal(db.notes[0].folder_id, null)
  assert.deepEqual(db.notes[0].content, note.content)
  assert.equal(db.folders[0].project_id, null)
})

test('partial project detachment fails clearly and keeps the project; failed mutation refreshes actual server state', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createProjectsApi(db, 'alice')
  const project = await api.createProject({ name: 'Keep project' })
  const docs = createDocumentationApi(db, 'alice')
  await docs.saveFolder({ name: 'Folder', projectId: project.id })
  await docs.createNote({ title: 'Keep note', projectId: project.id })
  const store = createCloudProjectsStore(db, 'alice')
  await store.load()
  db.failure = (call) => call.table === 'folders' && call.op === 'update' ? { code: '42501' } : null
  assert.equal(await store.deleteProject(project.id), false)
  assert.match(store.getSnapshot().mutationError, /Some notes or folders may already be unassigned/)
  assert.equal(db.projects.length, 1)
  assert.equal(db.notes.length, 1)
  assert.equal(db.notes[0].project_id, null)
  assert.ok(!db.calls.some((call) => call.table === 'projects' && call.op === 'delete'))
  db.failure = (call) => {
    if (call.table === 'tasks' && call.op === 'insert') {
      db.projects[0].name = 'Concurrent server name'
      return { code: '42501' }
    }
  }
  assert.equal(await store.createTask(project.id, { title: 'Denied' }), false)
  assert.equal(store.getSnapshot().projects[0].name, 'Concurrent server name')
  store.dispose()
})

test('note API rejects invalid metadata and missing/foreign project destinations without updating', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createDocumentationApi(db, 'alice')
  const note = await api.createNote({ title: 'Safe' })
  db.calls.length = 0
  await assert.rejects(api.updateNote(note.id, { folderId: 'missing' }), /unavailable/)
  await assert.rejects(api.updateNote(note.id, { projectId: 'foreign' }), /unavailable/)
  assert.ok(!db.calls.some((call) => call.op === 'update'))
})
