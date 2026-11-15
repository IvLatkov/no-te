import test from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEY, loadProjects, saveProjects, createProject, createTask, normalizeTask, updateTaskDetails, linkTaskNotes, moveTask, removeTask, removeProject } from '../src/data/projects.js'
import { createNotesStore } from '../src/data/notesStore.js'
import { linkedNotesForTask, tasksForNote, createLinkedTaskNote } from '../src/data/taskDocumentation.js'

function storageMock() {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
}

test('legacy tasks load with additive defaults without inventing timestamps or resetting records', () => {
  const storage = storageMock()
  const oldTask = { id: 'legacy-task', title: 'Legacy task', description: 'Keep me', status: 'todo', customField: 'preserved' }
  const project = { ...createProject({ name: 'Existing project' }), tasks: [oldTask] }
  const raw = JSON.stringify([project])
  storage.setItem(STORAGE_KEY, raw)
  const loaded = loadProjects(storage)
  assert.deepEqual(loaded[0].tasks[0], { ...oldTask, linkedNoteIds: [], tagIds: [], implementationNotes: '', createdAt: null, updatedAt: null, completedAt: null, archiveGraceStartedAt: null, archivesAt: null, isArchived: false })
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'reading does not rewrite storage')
  const malformed = normalizeTask({ ...oldTask, implementationNotes: 10, linkedNoteIds: ['a', 'a', 2, null], createdAt: 'not a date' })
  assert.deepEqual(malformed.linkedNoteIds, ['a'])
  assert.equal(malformed.implementationNotes, '')
  assert.equal(malformed.createdAt, null)
})

test('new task timestamps, implementation notes, statuses and note IDs persist with protected identity', () => {
  const storage = storageMock()
  const task = createTask({ title: 'Task', description: 'Description' })
  assert.ok(Number.isFinite(Date.parse(task.createdAt)))
  assert.equal(task.createdAt, task.updatedAt)
  const project = { ...createProject({ name: 'Project' }), tasks: [task] }
  const originalCreated = task.createdAt
  const implementationNotes = 'Decision: keep it small\n\nnpm run build\nNext: verify'
  let projects = updateTaskDetails([project], project.id, task.id, { title: ' Renamed ', description: 'More context', implementationNotes, status: 'done', linkedNoteIds: ['note-a', 'note-a', 'note-b'], id: 'bad', createdAt: 'bad', content: { text: 'Do not copy notes' } })
  const savedTask = projects[0].tasks[0]
  assert.equal(savedTask.id, task.id)
  assert.equal(savedTask.createdAt, originalCreated)
  assert.equal(savedTask.title, 'Renamed')
  assert.equal(savedTask.status, 'done')
  assert.equal(savedTask.implementationNotes, implementationNotes)
  assert.deepEqual(savedTask.linkedNoteIds, ['note-a', 'note-b'])
  assert.equal(savedTask.content, undefined)
  assert.ok(Number.isFinite(Date.parse(savedTask.updatedAt)))
  saveProjects(projects, storage)
  assert.deepEqual(loadProjects(storage), projects)
  projects = moveTask(projects, project.id, task.id, 'todo')
  assert.equal(projects[0].tasks[0].createdAt, originalCreated)
  assert.equal(projects[0].tasks[0].implementationNotes, implementationNotes)
  assert.equal(task.title, 'Task', 'the original state was not mutated')
})

test('many-to-many links deduplicate, can be removed, and safely ignore deleted notes', () => {
  const storage = storageMock()
  const store = createNotesStore({ storage })
  const note = store.create({ title: 'Shared' })
  const other = store.create({ title: 'Other' })
  const a = { ...createProject({ name: 'A' }), tasks: [createTask({ title: 'A task' })] }
  const b = { ...createProject({ name: 'B' }), tasks: [createTask({ title: 'B task' })] }
  let projects = linkTaskNotes([a, b], a.id, a.tasks[0].id, [note.id, note.id, other.id, 'missing'])
  projects = linkTaskNotes(projects, b.id, b.tasks[0].id, [note.id])
  assert.deepEqual(projects[0].tasks[0].linkedNoteIds, [note.id, other.id, 'missing'])
  assert.deepEqual(linkedNotesForTask(projects[0].tasks[0], store.getSnapshot().notes), [note, other])
  assert.equal(tasksForNote(projects, note.id).length, 2)
  projects = updateTaskDetails(projects, a.id, a.tasks[0].id, { linkedNoteIds: [note.id, 'missing'] })
  assert.equal(store.getSnapshot().notes.length, 2, 'unlinking does not delete notes')
  store.remove(note.id)
  assert.deepEqual(linkedNotesForTask(projects[0].tasks[0], store.getSnapshot().notes), [])
  projects = removeTask(projects, a.id, a.tasks[0].id)
  assert.equal(store.getSnapshot().notes.length, 1, 'deleting a task does not delete documentation')
  assert.equal(tasksForNote(projects, note.id).length, 1)
  projects = removeProject(projects, b.id)
  store.reconcileProjects(projects.map(project => project.id))
  assert.equal(store.getSnapshot().notes.length, 1)
})

test('create-from-task uses the owning project and retries a partial link failure without duplicating notes', () => {
  const storage = storageMock()
  const notesStore = createNotesStore({ storage })
  const project = { ...createProject({ name: 'Owning project' }), tasks: [createTask({ title: 'Task' })] }
  let projects = [project]
  let fail = true
  const commitProjects = transform => {
    if (fail) return false
    projects = transform(projects)
    saveProjects(projects, storage)
    return true
  }
  const options = { notesStore, commitProjects, projectId: project.id, taskId: project.tasks[0].id, values: { title: 'Created from task', projectId: 'wrong-project' } }
  const partial = createLinkedTaskNote(options)
  assert.equal(partial.linked, false)
  assert.equal(partial.note.projectId, project.id)
  assert.equal(notesStore.getSnapshot().notes.length, 1)
  assert.deepEqual(projects[0].tasks[0].linkedNoteIds, [])
  fail = false
  const completed = createLinkedTaskNote({ ...options, existingNoteId: partial.note.id })
  assert.equal(completed.linked, true)
  assert.equal(completed.note.id, partial.note.id)
  assert.equal(notesStore.getSnapshot().notes.length, 1)
  assert.deepEqual(projects[0].tasks[0].linkedNoteIds, [partial.note.id])
  assert.equal(tasksForNote(projects, partial.note.id)[0].projectId, project.id)
})
