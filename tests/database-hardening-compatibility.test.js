import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { exportCloudBackup } from '../src/data/cloudBackup.js'

test('cloud writes leave owner/timestamps to the server and explicitly send task project_id and required note fields', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const projects = createProjectsApi(db,'alice')
  const tasks = createTasksApi(db,'alice')
  const docs = createDocumentationApi(db,'alice')
  const forged = { user_id: 'bob', created_at: '1900-01-01', updated_at: '1900-01-01', updatedAt: '1900-01-01' }
  const project = await projects.createProject({ name: 'Project', ...forged })
  const task = await tasks.createTask(project.id,{ title: 'Task', project_id: 'foreign', ...forged })
  const note = await docs.createNote(forged)
  const folder = await docs.saveFolder({ name: 'Folder', ...forged })
  const tag = await docs.saveTag({ name: 'Tag', color: '#B994FF', ...forged })
  assert.equal(db.calls.find((call) => call.table === 'tasks' && call.op === 'insert').values.project_id, project.id)
  assert.equal(note.title,'Untitled note')
  assert.equal(note.content.type,'doc')
  await projects.updateProject(project.id,{ name: 'Edited', ...forged })
  const changedTask = await tasks.updateTask(project.id,task.id,{ title: 'Edited', ...forged })
  const changedNote = await docs.updateNote(note.id,{ title: '', ...forged })
  await docs.saveFolder({ name: 'Edited', ...forged },folder.id)
  await docs.saveTag({ name: 'Edited', color: tag.color, ...forged },tag.id)
  assert.notEqual(changedTask.updatedAt,task.updatedAt)
  assert.notEqual(changedNote.updatedAt,note.updatedAt)
  assert.equal(changedNote.title,'') // NOT NULL must not become a nonblank constraint.
  for (const call of db.calls.filter((call) => ['insert','update'].includes(call.op))) {
    for (const field of ['user_id','created_at','updated_at','updatedAt'])
      assert.equal(Object.hasOwn(call.values,field),false,`${call.table} must not send ${field}`)
  }
  const { backup } = await exportCloudBackup(db,'alice')
  assert.equal(backup.data.notes[0].updated_at,changedNote.updatedAt)
  assert.equal(backup.data.tasks[0].updated_at,changedTask.updatedAt)
})

test('changing a folder project checks contained notes before writing; general folders stay compatible', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const docs = createDocumentationApi(db,'alice')
  const project = await createProjectsApi(db,'alice').createProject({ name: 'Project' })
  const folder = await docs.saveFolder({ name: 'General' })
  const note = await docs.createNote({ title: 'Unassigned', folderId: folder.id })
  db.calls.length = 0
  await assert.rejects(docs.saveFolder({ projectId: project.id, name: folder.name },folder.id),/different project/)
  assert.ok(!db.calls.some((call) => call.op === 'update'))
  await docs.updateNote(note.id,{ projectId: project.id })
  await docs.saveFolder({ projectId: project.id, name: folder.name },folder.id)
  assert.equal(db.folders[0].project_id,project.id)
  await docs.saveFolder({ projectId: null, name: folder.name },folder.id)
  assert.equal(db.folders[0].project_id,null)
  assert.equal(db.notes[0].project_id,project.id)
})

test('folder reparenting validates existing children and whole-subtree depth; rename avoids unnecessary note reads', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const docs = createDocumentationApi(db,'alice')
  const project = await createProjectsApi(db,'alice').createProject({ name: 'Project' })
  const root = await docs.saveFolder({ name: 'Root' })
  const child = await docs.saveFolder({ name: 'Child', parentFolderId: root.id })
  const leaf = await docs.saveFolder({ name: 'Leaf', parentFolderId: child.id })
  const other = await docs.saveFolder({ name: 'Other' })
  db.calls.length = 0
  await assert.rejects(docs.saveFolder({ name: 'Root', projectId: project.id },root.id),/same project/)
  await assert.rejects(docs.saveFolder({ name: 'Root', parentFolderId: other.id },root.id),/three levels/)
  await assert.rejects(docs.saveFolder({ name: 'Root', parentFolderId: leaf.id },root.id),/circular/)
  assert.ok(!db.calls.some((call) => call.op === 'update'))
  db.calls.length = 0
  await docs.saveFolder({ name: 'Renamed' },root.id)
  assert.ok(!db.calls.some((call) => call.table === 'notes'))
})

test('note lookup failures prevent folder writes and RLS denial messages never include backend details', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const docs = createDocumentationApi(db,'alice')
  const folder = await docs.saveFolder({ name: 'General' })
  const project = await createProjectsApi(db,'alice').createProject({ name: 'Project' })
  db.calls.length = 0
  db.failure = (call) => call.table === 'notes' ? { code: '42501', message: 'PRIVATE backend detail' } : null
  await assert.rejects(docs.saveFolder({ name: 'General', projectId: project.id },folder.id),
    (error) => /Permission denied/.test(error.message) && !/PRIVATE/.test(error.message))
  assert.ok(!db.calls.some((call) => call.op === 'update'))
})
