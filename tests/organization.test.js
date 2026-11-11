import test from 'node:test'
import assert from 'node:assert/strict'
import { ORGANIZATION_KEY, TAG_COLORS, loadOrganization, saveOrganization, saveFolder, folderDepth, folderDeletion, moveNotesOutOfFolders, validateNoteFolder, saveTag, removeTagFromProjects, removeTagFromNotes, selectTasks } from '../src/data/organization.js'
import { createNote, loadNotes, NOTES_STORAGE_KEY, selectNotes } from '../src/data/notes.js'
import { createProject, createTask, loadProjects, STORAGE_KEY, updateTaskDetails } from '../src/data/projects.js'
import { buildSearchIndex, searchIndex, searchExcerpt } from '../src/data/search.js'

function storageMock() {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
}

test('older projects and notes gain organization defaults without changing IDs, JSON or saved data', () => {
  const storage = storageMock()
  const task = { id: 'old-task', title: 'Keep', description: 'Original', status: 'done' }
  const project = { ...createProject({ name: 'Old project' }), tasks: [task] }
  const note = createNote({ title: 'Old note', projectId: project.id })
  delete note.tagIds
  delete note.folderId
  storage.setItem(STORAGE_KEY, JSON.stringify([project]))
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify([note]))
  assert.deepEqual(loadProjects(storage)[0].tasks[0].tagIds, [])
  const loaded = loadNotes(storage)[0]
  assert.equal(loaded.id, note.id)
  assert.equal(loaded.folderId, null)
  assert.deepEqual(loaded.tagIds, [])
  assert.deepEqual(loaded.content, note.content)
  assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify([project]))
  assert.equal(storage.getItem(NOTES_STORAGE_KEY), JSON.stringify([note]))
  assert.deepEqual(loadOrganization(storage), { version: 1, folders: [], tags: [] })
  assert.equal(storage.getItem(ORGANIZATION_KEY), null)
})

test('folder creation and rename enforce maximum subtree depth, stable identity, project inheritance and no cycles', () => {
  let folders = saveFolder([], { name: 'Root', projectId: 'p1', parentFolderId: null })
  const root = folders[0]
  folders = saveFolder(folders, { name: 'Child', projectId: 'p1', parentFolderId: root.id })
  const child = folders[1]
  folders = saveFolder(folders, { name: 'Leaf', projectId: 'p1', parentFolderId: child.id })
  const leaf = folders[2]
  assert.equal(folderDepth(folders, leaf.id), 3)
  assert.throws(() => saveFolder(folders, { name: 'Too deep', projectId: 'p1', parentFolderId: leaf.id }), /three levels/)
  assert.throws(() => saveFolder(folders, { name: 'Cycle', parentFolderId: leaf.id }, root.id), /circular/)
  assert.throws(() => saveFolder(folders, { name: 'Wrong project', projectId: 'p2', parentFolderId: root.id }), /same project/)
  assert.throws(() => saveFolder(folders, { name: 'Missing parent', parentFolderId: 'missing' }), /no longer exists/)
  folders = saveFolder(folders, { name: 'Renamed', id: 'replace', createdAt: 'bad' }, leaf.id)
  assert.equal(folders[2].id, leaf.id)
  assert.equal(folders[2].createdAt, leaf.createdAt)
  assert.equal(folders[2].name, 'Renamed')
  const storage = storageMock()
  saveOrganization({ version: 1, folders, tags: [] }, storage)
  assert.deepEqual(loadOrganization(storage).folders, folders)
})

test('folder deletion relocates all descendant notes to the surviving parent or Unfiled without deleting content', () => {
  let folders = saveFolder([], { name: 'Root', projectId: 'p', parentFolderId: null })
  const root = folders[0]
  folders = saveFolder(folders, { name: 'Child', projectId: 'p', parentFolderId: root.id })
  const child = folders[1]
  folders = saveFolder(folders, { name: 'Leaf', projectId: 'p', parentFolderId: child.id })
  const leaf = folders[2]
  const notes = [createNote({ title: 'Child note', projectId: 'p', folderId: child.id }), createNote({ title: 'Leaf note', projectId: 'p', folderId: leaf.id }), createNote({ title: 'Outside' })]
  const deletion = folderDeletion(folders, child.id)
  const relocated = moveNotesOutOfFolders(notes, deletion)
  assert.equal(deletion.folders.length, 1)
  assert.deepEqual(relocated.map(note => note.folderId), [root.id, root.id, null])
  assert.equal(relocated[0].projectId, 'p')
  assert.deepEqual(relocated[0].content, notes[0].content)
  assert.equal(relocated[0].id, notes[0].id)
  assert.equal(relocated[2], notes[2])
  const topLevel = moveNotesOutOfFolders(notes, folderDeletion(folders, root.id))
  assert.equal(topLevel.length, 3)
  assert.deepEqual(topLevel.map(note => note.folderId), [null, null, null])
  assert.deepEqual(notes.map(note => note.folderId), [child.id, leaf.id, null])
})

test('folder moves preserve project associations and reject incompatible destinations', () => {
  let folders = saveFolder([], { name: 'Project folder', projectId: 'a', parentFolderId: null })
  folders = saveFolder(folders, { name: 'General folder', projectId: null, parentFolderId: null })
  const note = createNote({ title: 'B note', projectId: 'b' })
  assert.throws(() => validateNoteFolder({ ...note, folderId: folders[0].id }, folders), /different project/)
  assert.doesNotThrow(() => validateNoteFolder({ ...note, folderId: folders[1].id }, folders))
  assert.doesNotThrow(() => validateNoteFolder({ ...note, folderId: null }, folders))
  assert.throws(() => validateNoteFolder({ ...note, folderId: 'deleted' }, folders), /unavailable/)
  assert.equal(note.projectId, 'b')
})

test('tags are reusable by ID; renaming preserves assignments and deleting references preserves items', () => {
  let tags = saveTag([], { name: 'Focus', color: TAG_COLORS[0].value })
  tags = saveTag(tags, { name: 'Backend', color: TAG_COLORS[1].value })
  const [focus, backend] = tags
  assert.throws(() => saveTag(tags, { name: 'FOCUS', color: TAG_COLORS[0].value }), /already exists/)
  assert.throws(() => saveTag(tags, { name: 'Invalid', color: 'red' }), /palette/)
  const project = { ...createProject({ name: 'Project' }), tasks: [createTask({ title: 'Task' })] }
  const projects = updateTaskDetails([project], project.id, project.tasks[0].id, { tagIds: [focus.id, backend.id, focus.id] })
  const notes = [createNote({ title: 'Note', tagIds: [focus.id, backend.id, backend.id] })]
  assert.deepEqual(projects[0].tasks[0].tagIds, [focus.id, backend.id])
  assert.deepEqual(notes[0].tagIds, [focus.id, backend.id])
  tags = saveTag(tags, { name: 'Priority', color: TAG_COLORS[2].value }, focus.id)
  assert.equal(tags[0].id, focus.id)
  assert.equal(tags[0].name, 'Priority')
  const cleanedProjects = removeTagFromProjects(projects, focus.id)
  const cleanedNotes = removeTagFromNotes(notes, focus.id)
  assert.deepEqual(cleanedProjects[0].tasks[0].tagIds, [backend.id])
  assert.deepEqual(cleanedNotes[0].tagIds, [backend.id])
  assert.equal(cleanedProjects[0].tasks[0].id, project.tasks[0].id)
  assert.deepEqual(cleanedNotes[0].content, notes[0].content)
  const storage = storageMock()
  saveOrganization({ version: 1, folders: [], tags }, storage)
  assert.deepEqual(loadOrganization(storage).tags, tags)
})

test('combined task and note filters and sorting derive views without mutating status or stored order', () => {
  const a = { ...createTask({ title: 'Alpha' }), tagIds: ['a', 'b'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' }
  const b = { ...createTask({ title: 'Beta' }), status: 'done', tagIds: ['a'], createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }
  const tasks = [b, a]
  assert.deepEqual(selectTasks(tasks, { sort: 'title' }), [a, b])
  assert.deepEqual(selectTasks(tasks, { sort: 'created' }), [b, a])
  assert.deepEqual(selectTasks(tasks, { sort: 'updated' }), [a, b])
  assert.deepEqual(selectTasks(tasks, { query: 'ALP', tagIds: ['a', 'b'], sort: 'title' }), [a])
  assert.deepEqual(selectTasks(tasks, { tagIds: ['missing'] }), [])
  assert.deepEqual(tasks, [b, a])
  assert.equal(b.status, 'done')
  const n1 = createNote({ title: 'One', projectId: 'p1', folderId: 'f1', tagIds: ['a', 'b'] })
  const n2 = createNote({ title: 'Two', projectId: 'p2', folderId: 'f1', tagIds: ['a'] })
  const n3 = createNote({ title: 'Three', projectId: 'p1', tagIds: ['a'] })
  const notes = [n2, n3, n1]
  assert.deepEqual(selectNotes(notes, { projectId: 'p1', folderId: 'f1', tagIds: ['a', 'b'] }), [n1])
  assert.deepEqual(selectNotes(notes, { projectId: 'p1', folderId: null, tagIds: ['a'] }), [n3])
  assert.deepEqual(notes, [n2, n3, n1])
})

test('global search covers all entity fields and tags, safely extracts rich text, and never mutates JSON', () => {
  const tag = { id: 'tag', name: 'Priority', color: TAG_COLORS[0].value }
  const project = { ...createProject({ name: 'Launch', description: 'Project milestone' }), tasks: [{ ...createTask({ title: 'Compile', description: 'Task description' }), implementationNotes: 'A rare build command', tagIds: [tag.id] }] }
  const note = createNote({ title: 'Architecture', projectId: project.id, tagIds: [tag.id], content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sapphire', marks: [{ type: 'bold' }] }] }, { type: 'paragraph', content: [{ type: 'text', text: '<script>plain text</script>' }] }] } })
  const before = JSON.stringify({ project, note })
  const index = buildSearchIndex([project], [note], [tag])
  assert.equal(searchIndex(index, 'MILESTONE')[0].type, 'Projects')
  assert.equal(searchIndex(index, 'rare build')[0].type, 'Tasks')
  assert.equal(searchIndex(index, 'task description')[0].id, project.tasks[0].id)
  assert.equal(searchIndex(index, 'sAPPHire')[0].type, 'Documentation')
  assert.deepEqual(searchIndex(index, 'PRIORITY').map(result => result.type), ['Tasks', 'Documentation'])
  assert.equal(searchIndex(index, '<script>')[0].id, note.id)
  assert.deepEqual(searchIndex(index, ''), [])
  assert.match(searchExcerpt('a'.repeat(150) + ' Sapphire', 'sapphire'), /Sapphire/)
  assert.equal(JSON.stringify({ project, note }), before)
})

test('malformed folder/tag storage and quota failures do not reset existing data', () => {
  const storage = storageMock()
  const corrupt = ['{bad', '{}', '{"version":1,"folders":[null],"tags":[]}']
  const folders = saveFolder([], { name: 'Cycle', parentFolderId: null, projectId: null })
  corrupt.push(JSON.stringify({ version: 1, folders: [{ ...folders[0], parentFolderId: folders[0].id }], tags: [] }))
  for (const raw of corrupt) {
    storage.setItem(ORGANIZATION_KEY, raw)
    assert.throws(() => loadOrganization(storage))
    assert.equal(storage.getItem(ORGANIZATION_KEY), raw)
  }
  assert.throws(() => loadOrganization({ getItem() { throw new Error('Denied') } }))
  assert.throws(() => saveOrganization({ version: 1, folders: [], tags: [] }, { setItem() { throw new Error('Quota') } }))
})
