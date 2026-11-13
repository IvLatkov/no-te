import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { createCloudDocumentationStore } from '../src/data/cloudDocumentationStore.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { selectNotes } from '../src/data/notes.js'
import { buildSearchIndex, searchIndex } from '../src/data/search.js'

const rich = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Decisions' }] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cloud checklist' }] }],
        },
      ],
    },
    { type: 'codeBlock', content: [{ type: 'text', text: 'npm run build' }] },
  ],
}

async function setup() {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createDocumentationApi(db, 'alice')
  const project = await createProjectsApi(db, 'alice').createProject({ name: 'Cloud project' })
  const task = await createTasksApi(db, 'alice').createTask(project.id, { title: 'Cloud task' })
  return { db, api, project, task }
}

test('cloud note CRUD keeps JSON, identities, timestamps and project filtering; duplicate retries preserve tags without duplicate notes', async () => {
  const { db, api, project } = await setup()
  const note = await api.createNote({
    title: 'Plan',
    content: rich,
    projectId: project.id,
    user_id: 'bob',
  })
  assert.deepEqual(note.content, rich)
  assert.equal(db.notes[0].user_id, 'alice')
  const edited = await api.updateNote(note.id, {
    title: 'Updated',
    content: rich,
    user_id: 'bob',
    id: 'stolen',
  })
  assert.equal(edited.id, note.id)
  assert.equal(edited.createdAt, note.createdAt)
  assert.notEqual(edited.updatedAt, note.updatedAt)
  assert.equal((await api.fetchNotes({ projectId: project.id })).length, 1)
  assert.deepEqual(await api.fetchNotes({ projectId: null }), [])
  assert.equal(selectNotes([edited], { query: 'npm run build' }).length, 1)
  const tag = await api.saveTag({ name: 'Priority', color: '#B994FF' })
  await api.setRelationships('note_tags', note.id, [tag.id])
  const store = createCloudDocumentationStore(db, 'alice')
  await store.start()
  db.failure = (call) =>
    call.table === 'note_tags' && call.op === 'upsert' ? { code: '42501' } : null
  assert.equal(await store.duplicate(note.id), null)
  assert.equal(db.notes.length, 2)
  assert.match(store.getSnapshot().error, /Some steps may have completed/)
  db.failure = null
  const copy = await store.duplicate(note.id)
  assert.equal(db.notes.length, 2)
  assert.deepEqual(copy.content, rich)
  assert.ok(db.note_tags.some((row) => row.note_id === copy.id && row.tag_id === tag.id))
  await store.remove(note.id)
  assert.equal(db.notes.length, 1)
  assert.equal(db.notes[0].id, copy.id)
  store.dispose()
})

test('cloud folder depth, compatibility, rename and subtree deletion relocate notes; partial failures never claim success', async () => {
  const { db, api, project } = await setup()
  const root = await api.saveFolder({ name: 'Root', projectId: project.id })
  const child = await api.saveFolder({
    name: 'Child',
    projectId: project.id,
    parentFolderId: root.id,
  })
  const leaf = await api.saveFolder({
    name: 'Leaf',
    projectId: project.id,
    parentFolderId: child.id,
  })
  await assert.rejects(
    api.saveFolder({ name: 'Too deep', projectId: project.id, parentFolderId: leaf.id }),
    /three levels/,
  )
  await assert.rejects(
    api.saveFolder({ name: 'Wrong project', parentFolderId: root.id }),
    /same project/,
  )
  const note = await api.createNote({
    title: 'Keep',
    projectId: project.id,
    folderId: leaf.id,
    content: rich,
  })
  await assert.rejects(
    api.createNote({ title: 'Incompatible', folderId: leaf.id }),
    /different project/,
  )
  await api.updateNote(note.id, { folderId: child.id })
  assert.equal((await api.fetchNotes())[0].folderId, child.id)
  assert.equal((await api.saveFolder({ ...child, name: 'Renamed' }, child.id)).name, 'Renamed')
  db.failure = (call) =>
    call.table === 'folders' && call.op === 'delete' ? { code: '23503' } : null
  await assert.rejects(api.deleteFolder(child.id), /did not fully complete/)
  assert.equal(db.notes[0].folder_id, root.id)
  assert.deepEqual(db.notes[0].content, rich)
  db.failure = null
  await api.deleteFolder(child.id)
  assert.equal(db.folders.length, 1)
  assert.equal(db.notes.length, 1)
  assert.ok(!db.calls.some((call) => call.table === 'notes' && call.op === 'delete'))
  db.failure = (call) => (call.table === 'notes' && call.op === 'update' ? { code: 'P0001' } : null)
  await assert.rejects(api.updateNote(note.id, { folderId: 'bad' }), /Folder validation rejected/)
})

test('multiple cloud tags and task-note relationships are idempotent, bidirectional, searchable and RLS scoped', async () => {
  const { db, api, project, task } = await setup()
  const first = await api.saveTag({ name: 'Priority', color: '#B994FF' })
  const second = await api.saveTag({ name: 'Review', color: '#7DBAE8' })
  await assert.rejects(api.saveTag({ name: 'Priority', color: '#B994FF' }), /already exists/)
  await api.saveTag({ name: 'Urgent', color: first.color }, first.id)
  const note = await api.createNote({
    title: 'Documentation',
    content: rich,
    projectId: project.id,
  })
  for (const [table, id] of [
    ['task_tags', task.id],
    ['note_tags', note.id],
  ]) {
    await api.setRelationships(table, id, [first.id, second.id])
    await api.setRelationships(table, id, [first.id, second.id])
    assert.equal(db[table].length, 2)
    await api.setRelationships(table, id, [second.id])
    assert.equal(db[table].length, 1)
  }
  await api.setRelationships('task_notes', task.id, [note.id])
  const links = await api.fetchRelationships()
  assert.equal(links.task_notes[0].note_id, note.id)
  const index = buildSearchIndex(
    [{ ...project, tasks: [{ ...task, linkedNoteIds: [note.id], tagIds: [second.id] }] }],
    [{ ...note, tagIds: [second.id] }],
    await api.fetchTags(),
    { includeTags: true },
  )
  assert.ok(searchIndex(index, 'Review').some((item) => item.type === 'Tags'))
  assert.ok(searchIndex(index, 'Review').some((item) => item.type === 'Tasks'))
  assert.ok(searchIndex(index, 'npm run build').some((item) => item.type === 'Documentation'))
  db.emit('bob')
  const bob = createDocumentationApi(db, 'bob')
  assert.deepEqual(await bob.fetchNotes(), [])
  assert.deepEqual((await bob.fetchRelationships()).task_notes, [])
  await assert.rejects(bob.setRelationships('task_notes', task.id, [note.id]), /unavailable/)
  db.emit('alice')
  await api.setRelationships('task_notes', task.id, [])
  assert.equal(db.notes.length, 1)
  await api.deleteTag(second.id)
  assert.equal(db.note_tags.length, 0)
  assert.equal(db.task_tags.length, 0)
})

test('cloud autosave debounces, serializes slow writes, retains failed drafts and merges refreshes without replacing edits', async () => {
  const { db, api } = await setup()
  const note = await api.createNote({ title: 'Original', content: rich })
  const store = createCloudDocumentationStore(db, 'alice', { delay: 25 })
  await store.start()
  let release, arrived
  const paused = new Promise((resolve) => {
    arrived = resolve
  })
  db.pause = async (call) => {
    if (call.table === 'notes' && call.op === 'update') {
      db.pause = null
      arrived()
      await new Promise((resolve) => {
        release = resolve
      })
    }
  }
  store.update(note.id, { title: 'First' })
  assert.equal(db.notes[0].title, 'Original')
  await paused
  store.update(note.id, { title: 'Newest' })
  assert.equal(store.getSnapshot().notes[0].title, 'Newest')
  release()
  assert.equal(await store.flush(), true)
  assert.equal(db.notes[0].title, 'Newest')
  assert.equal(store.getSnapshot().notes[0].title, 'Newest')
  db.failure = (call) =>
    call.table === 'notes' && call.op === 'update' ? new TypeError('Failed to fetch') : null
  store.update(note.id, { title: 'Unsaved' })
  assert.equal(await store.flush(), false)
  assert.equal(store.getSnapshot().status, 'error')
  await store.load()
  assert.equal(store.getSnapshot().notes[0].title, 'Unsaved')
  db.failure = null
  assert.equal(await store.flush(), true)
  assert.equal(db.notes[0].title, 'Unsaved')
  store.dispose()
  const fresh = createCloudDocumentationStore(db, 'alice')
  await fresh.start()
  assert.equal(fresh.getSnapshot().notes[0].title, 'Unsaved')
  fresh.dispose()
})

test('sign-out clears cloud drafts and late writes never update the next account; requests pin verified credentials', async () => {
  const { db, api } = await setup()
  const note = await api.createNote({ title: 'Alice' })
  const store = createCloudDocumentationStore(db, 'alice')
  await store.start()
  let release, arrived
  const paused = new Promise((resolve) => {
    arrived = resolve
  })
  db.pause = async (call) => {
    if (call.table === 'notes' && call.op === 'update') {
      db.pause = null
      arrived()
      await new Promise((resolve) => {
        release = resolve
      })
    }
  }
  store.update(note.id, { title: 'A pending draft' })
  const flush = store.flush()
  await paused
  store.dispose()
  db.emit('bob')
  release()
  assert.equal(await flush, false)
  assert.deepEqual(store.getSnapshot().notes, [])
  assert.equal(db.notes[0].user_id, 'alice')
  const bob = createCloudDocumentationStore(db, 'bob')
  await bob.start()
  assert.deepEqual(bob.getSnapshot().notes, [])
  bob.dispose()
  // Switch between identity verification and the actual INSERT. The request
  // must still use Alice's verified token, never Bob's new ambient session.
  db.emit('alice')
  db.pause = async (call) => {
    if (call.table === 'notes' && call.op === 'insert') db.emit('bob')
  }
  await api.createNote({ title: 'Pinned request' })
  assert.equal(db.notes.at(-1).user_id, 'alice')
})
