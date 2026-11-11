import test from 'node:test'
import assert from 'node:assert/strict'
import { NOTES_STORAGE_KEY, loadNotes, saveNotes, createNote, duplicateNote, noteText, selectNotes, unassignMissingProjects } from '../src/data/notes.js'
import { createNotesStore } from '../src/data/notesStore.js'
import { STORAGE_KEY, createProject, saveProjects, loadProjects, removeProject } from '../src/data/projects.js'

function storageMock() {
  const entries = new Map()
  return { writes: 0, fail: false, getItem: key => entries.get(key) ?? null, setItem(key, value) { if (this.fail) throw new Error('Quota exceeded'); this.writes++; entries.set(key, value) } }
}
function setup(storage = storageMock()) {
  const jobs = []
  const store = createNotesStore({ storage, schedule: (callback, ms) => { const job = { callback, ms }; jobs.push(job); return job }, cancel: job => { if (job) job.cancelled = true } })
  return { store, storage, jobs }
}
const doc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

test('note creation, rename, rich JSON persistence, duplication and deletion leave project data intact', () => {
  const { store, storage } = setup()
  const project = createProject({ name: 'Existing' })
  saveProjects([project], storage)
  const originalProjects = storage.getItem(STORAGE_KEY)
  const note = store.create({ title: ' First note ', projectId: project.id })
  assert.match(note.id, /^[0-9a-f-]{36}$/)
  assert.equal(note.title, 'First note')
  assert.equal(note.createdAt, note.updatedAt)
  store.update(note.id, { title: 'Renamed', content: doc('Project notes'), id: 'wrong', createdAt: 'wrong' })
  assert.equal(store.getSnapshot().status, 'saving')
  assert.equal(store.flush(), true)
  const saved = loadNotes(storage)[0]
  assert.equal(saved.id, note.id)
  assert.equal(saved.createdAt, note.createdAt)
  assert.equal(saved.title, 'Renamed')
  assert.deepEqual(saved.content, doc('Project notes'))
  const copy = store.duplicate(note.id)
  assert.notEqual(copy.id, note.id)
  assert.equal(copy.title, 'Renamed (copy)')
  assert.equal(copy.projectId, project.id)
  assert.deepEqual(copy.content, saved.content)
  store.update(copy.id, { content: doc('Independent copy') })
  store.flush()
  assert.deepEqual(store.getSnapshot().notes[0].content, saved.content)
  assert.equal(store.remove(note.id), true)
  assert.deepEqual(loadNotes(storage).map(item => item.id), [copy.id])
  assert.equal(storage.getItem(STORAGE_KEY), originalProjects)
  assert.deepEqual(createNotesStore({ storage }).getSnapshot().notes, loadNotes(storage))
})

test('500ms debounce saves only the current snapshot and ignores stale callbacks after flush, duplicate, or delete', () => {
  const { store, storage, jobs } = setup()
  const first = store.create({ title: 'First' })
  const second = store.create({ title: 'Second' })
  store.update(first.id, { content: doc('Old draft') })
  const stale = jobs.at(-1)
  assert.equal(stale.ms, 500)
  store.update(first.id, { content: doc('Latest draft') })
  const current = jobs.at(-1)
  const writes = storage.writes
  stale.callback()
  assert.equal(storage.writes, writes)
  current.callback()
  assert.equal(store.getSnapshot().status, 'saved')
  assert.deepEqual(loadNotes(storage)[0].content, doc('Latest draft'))
  store.update(first.id, { content: doc('Save before switching notes') })
  const beforeSwitch = jobs.at(-1)
  assert.equal(store.flush(), true)
  store.update(second.id, { content: doc('Second draft') })
  beforeSwitch.callback()
  assert.equal(store.getSnapshot().status, 'saving')
  assert.equal(noteText(loadNotes(storage)[1].content), '')
  assert.equal(store.flush(), true)
  assert.equal(noteText(loadNotes(storage)[0].content), 'Save before switching notes')
  assert.equal(noteText(loadNotes(storage)[1].content), 'Second draft')
  store.update(first.id, { content: doc('Duplicate latest content') })
  const beforeDuplicate = jobs.at(-1)
  const copy = store.duplicate(first.id)
  assert.equal(noteText(copy.content), 'Duplicate latest content')
  const beforeDelete = jobs.at(-1)
  assert.equal(store.remove(first.id), true)
  beforeDuplicate.callback()
  beforeDelete.callback()
  assert.equal(loadNotes(storage).some(note => note.id === first.id), false)
  assert.equal(loadNotes(storage).length, 2)
})

test('failed autosave keeps the draft, blocks switching through flush, and can be retried', () => {
  const { store, storage, jobs } = setup()
  const note = store.create({ title: 'Draft' })
  const saved = storage.getItem(NOTES_STORAGE_KEY)
  storage.fail = true
  store.update(note.id, { content: doc('Unsaved work') })
  jobs.at(-1).callback()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.flush(), false)
  assert.equal(storage.getItem(NOTES_STORAGE_KEY), saved)
  assert.equal(noteText(store.getSnapshot().notes[0].content), 'Unsaved work')
  assert.equal(store.create({ title: 'Cannot create' }), null)
  assert.equal(store.remove(note.id), false)
  storage.fail = false
  assert.equal(store.flush(), true)
  assert.equal(store.getSnapshot().status, 'saved')
  assert.equal(noteText(loadNotes(storage)[0].content), 'Unsaved work')
})

test('search uses rich text content; project filtering, previews and deterministic sorting work', () => {
  const alpha = { ...createNote({ title: 'Alpha', projectId: 'p1', content: doc('A hidden keyword') }), updatedAt: '2026-01-01T00:00:00.000Z' }
  const beta = { ...createNote({ title: 'Beta', projectId: 'p2' }), updatedAt: '2026-02-01T00:00:00.000Z' }
  const free = { ...createNote({ title: 'Unassigned' }), updatedAt: '2026-03-01T00:00:00.000Z' }
  const notes = [beta, free, alpha]
  assert.deepEqual(selectNotes(notes, { sort: 'title' }), [alpha, beta, free])
  assert.deepEqual(selectNotes(notes), [free, beta, alpha])
  assert.deepEqual(selectNotes(notes, { query: ' KEYWORD ' }), [alpha])
  assert.deepEqual(selectNotes(notes, { query: 'ALPHA', projectId: 'p2' }), [])
  assert.deepEqual(selectNotes(notes, { projectId: null }), [free])
  assert.deepEqual(selectNotes(notes, { projectId: 'p1' }), [alpha])
  assert.deepEqual(notes, [beta, free, alpha], 'sorting does not mutate state')
  assert.equal(noteText({ type: 'doc', content: [doc('First').content[0], doc('Second').content[0]] }), 'First\nSecond')
  const copy = duplicateNote(alpha)
  copy.content.content[0].content[0].text = 'changed'
  assert.equal(noteText(alpha.content), 'A hidden keyword')
})

test('deleting a project preserves documentation and recovers orphaned associations after a failed write', () => {
  const { store, storage } = setup()
  const a = createProject({ name: 'A' })
  const b = createProject({ name: 'B' })
  saveProjects([a, b], storage)
  const note = store.create({ title: 'Keep me', projectId: a.id, content: doc('Important documentation') })
  store.create({ title: 'Other project', projectId: b.id })
  store.update(note.id, { content: doc('Latest important documentation') })
  assert.equal(store.flush(), true)
  saveProjects(removeProject([a, b], a.id), storage)
  storage.fail = true
  assert.equal(store.reconcileProjects([b.id]), false)
  assert.equal(store.getSnapshot().notes[0].projectId, null)
  assert.equal(loadNotes(storage)[0].projectId, a.id)
  storage.fail = false
  const reloaded = createNotesStore({ storage })
  assert.equal(reloaded.reconcileProjects(loadProjects(storage).map(project => project.id)), true)
  const notes = loadNotes(storage)
  assert.equal(notes[0].projectId, null)
  assert.equal(notes[0].id, note.id)
  assert.equal(noteText(notes[0].content), 'Latest important documentation')
  assert.equal(notes[1].projectId, b.id)
  assert.deepEqual(unassignMissingProjects(notes, [b.id]), notes)
})

test('malformed notes and storage access failures preserve existing data without resetting notes', () => {
  for (const raw of ['{broken', '{}', '[null]', JSON.stringify([{ ...createNote(), content: { type: 'doc', content: [{ type: 'text', text: 4 }] } }])]) {
    const storage = storageMock()
    storage.setItem(NOTES_STORAGE_KEY, raw)
    assert.throws(() => loadNotes(storage))
    const { store } = setup(storage)
    assert.equal(store.getSnapshot().readOnly, true)
    assert.equal(store.create({ title: 'Do not overwrite' }), null)
    assert.equal(store.getSnapshot().status, 'error')
    assert.equal(storage.getItem(NOTES_STORAGE_KEY), raw)
    assert.equal(store.flush(), true, 'read errors do not trap unrelated application navigation')
  }
  const storage = { getItem() { throw new Error('Denied') }, setItem() { throw new Error('Denied') } }
  assert.equal(createNotesStore({ storage }).getSnapshot().readOnly, true)
  assert.throws(() => saveNotes([], storage))
})
