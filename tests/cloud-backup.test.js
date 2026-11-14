import test from 'node:test'
import assert from 'node:assert/strict'
import { exportCloudBackup, parseCloudBackup, validateCloudBackup } from '../src/data/cloudBackup.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'

async function fixture() {
  const db = cloudSupabase()
  db.emit('alice')
  const project = await createProjectsApi(db, 'alice').createProject({ name: 'Project' })
  const task = await createTasksApi(db, 'alice').createTask(project.id, { title: 'Task' })
  const api = createDocumentationApi(db, 'alice')
  const folder = await api.saveFolder({ name: 'Root', projectId: project.id })
  const child = await api.saveFolder({ name: 'Child', projectId: project.id, parentFolderId: folder.id })
  const note = await api.createNote({ title: 'Note', projectId: project.id, folderId: child.id, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full JSON' }] }] } })
  const tag = await api.saveTag({ name: 'Tag', color: '#B994FF' })
  await api.setRelationships('task_notes', task.id, [note.id])
  await api.setRelationships('task_tags', task.id, [tag.id])
  await api.setRelationships('note_tags', note.id, [tag.id])
  return { db, project, note }
}

test('cloud export includes every table, full JSON, IDs, timestamps and links with SELECT-only requests', async () => {
  const { db, note } = await fixture()
  db.notes[0].password = 'excluded-column'
  db.calls.length = 0
  const progress = []
  const result = await exportCloudBackup(db, 'alice', { onProgress: (message) => progress.push(message) })
  assert.deepEqual(result.counts, { projects: 1, tasks: 1, notes: 1, folders: 2, tags: 1, task_notes: 1, task_tags: 1, note_tags: 1 })
  assert.deepEqual(result.backup.data.notes[0].content, note.content)
  assert.equal(result.backup.data.notes[0].id, note.id)
  assert.equal(result.backup.data.notes[0].created_at, note.createdAt)
  assert.ok(progress.some((value) => value.includes('1 of 1')))
  assert.ok(db.calls.every((call) => call.op === 'select'))
  const json = JSON.stringify(result.backup)
  assert.ok(!/access_token|excluded-column|test-alice/.test(json))
  assert.deepEqual(parseCloudBackup(json).counts, result.counts)
})

test('empty cloud export succeeds after reading all eight tables', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const result = await exportCloudBackup(db, 'alice')
  assert.equal(Object.keys(result.counts).length, 8)
  assert.ok(Object.values(result.counts).every((value) => value === 0))
  assert.equal(db.calls.length, 8)
})

test('export paginates past 1000 rows and respects server caps smaller than requested pages', async () => {
  const { db } = await fixture()
  const base = db.notes[0]
  db.notes = Array.from({ length: 1207 }, (_, index) => ({ ...base, id: `note-${index}` }))
  db.task_notes = []
  db.note_tags = []
  db.pause = async (call) => {
    if (call.table === 'notes') call.range[1] = call.range[0] + 96
  }
  const result = await exportCloudBackup(db, 'alice')
  assert.equal(result.counts.notes, 1207)
  assert.ok(db.calls.some((call) => call.table === 'notes' && call.range?.[0] > 1000))
})

test('each inaccessible table fails the entire export without any writes or partial success', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  for (const table of ['projects', 'tasks', 'notes', 'folders', 'tags', 'task_notes', 'task_tags', 'note_tags']) {
    db.failure = (call) => call.table === table ? { code: '42501', message: 'secret detail' } : null
    await assert.rejects(exportCloudBackup(db, 'alice'), (error) => /Permission denied/.test(error.message) && !error.message.includes('secret detail'))
  }
  assert.ok(db.calls.every((call) => call.op === 'select'))
})

test('export rejects unauthenticated sessions, expiration, switches and aborts', async () => {
  const db = cloudSupabase()
  await assert.rejects(exportCloudBackup(db, 'alice'), /session/)
  assert.equal(db.calls.length, 0)
  db.emit('alice')
  const getSession = db.auth.getSession
  db.auth.getSession = async () => {
    const result = await getSession()
    return { ...result, data: { session: { ...result.data.session, expires_at: Math.floor(Date.now() / 1000) - 1 } } }
  }
  await assert.rejects(exportCloudBackup(db, 'alice'), /session/)
  assert.equal(db.calls.length, 0)
  db.auth.getSession = getSession
  db.emit('alice')
  db.pause = async (call) => { if (call.table === 'tags') db.emit('bob') }
  await assert.rejects(exportCloudBackup(db, 'alice'), /account changed/)
  db.emit('alice')
  db.pause = async (call) => { if (call.table === 'tags') db.emit(null) }
  await assert.rejects(exportCloudBackup(db, 'alice'), /session/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(exportCloudBackup(db, 'alice', { signal: controller.signal }), { name: 'AbortError' })
})

test('export rejects unavailable counts, incomplete pages and changing pagination', async () => {
  for (const response of [
    { data: [], error: null },
    { data: null, count: 0, error: null },
    { data: [], count: 1, error: null },
  ]) {
    const db = cloudSupabase()
    db.emit('alice')
    db.pause = async (call) => { call.response = response }
    await assert.rejects(exportCloudBackup(db, 'alice'), /Could not/)
  }
  const { db } = await fixture()
  db.pause = async (call) => {
    if (call.table === 'projects') call.response = { data: [db.projects[0]], count: call.range[0] ? 3 : 2, error: null }
  }
  await assert.rejects(exportCloudBackup(db, 'alice'), /changed during export/)
})

test('preview rejects malformed records, versions, duplicates, foreign owners and broken references without querying a database', async () => {
  const { db } = await fixture()
  const { backup } = await exportCloudBackup(db, 'alice')
  const mutations = [
    (b) => { b.version = 2 },
    (b) => { delete b.data.tasks },
    (b) => { b.data.notes[0].user_id = 'bob' },
    (b) => { b.data.notes[0].content = { type: 'doc', content: [{}] } },
    (b) => { b.data.notes[0].created_at = 'invalid' },
    (b) => { b.data.notes.push(b.data.notes[0]) },
    (b) => { b.data.task_notes.push(b.data.task_notes[0]) },
    (b) => { b.data.task_tags[0].tag_id = 'missing' },
    (b) => { b.data.tasks[0].project_id = 'missing' },
    (b) => { b.data.folders[0].parent_folder_id = b.data.folders[1].id },
    (b) => { b.data.notes[0].folder_id = 'missing' },
    (b) => { b.access_token = 'credential' },
  ]
  db.calls.length = 0
  for (const mutate of mutations) {
    const changed = structuredClone(backup)
    mutate(changed)
    assert.throws(() => parseCloudBackup(JSON.stringify(changed)))
  }
  assert.throws(() => parseCloudBackup('{'), /valid JSON/)
  assert.throws(() => validateCloudBackup(backup, 'bob'), /account changed/)
  assert.equal(db.calls.length, 0)
})
