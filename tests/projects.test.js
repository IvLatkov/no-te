import test from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEY, loadProjects, saveProjects, createProject, updateProject, removeProject, addTask, editTask, moveTask, removeTask } from '../src/data/projects.js'

function memoryStorage() {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
}

test('projects and tasks survive a save/reload cycle, edits, moves, and deletion', () => {
  const storage = memoryStorage()
  assert.deepEqual(loadProjects(storage), [])
  const project = createProject({ name: ' Launch ', description: ' Plan the launch ' })
  const other = createProject({ name: 'Other project' })
  assert.notEqual(project.id, other.id)
  assert.match(project.id, /^[0-9a-f-]{36}$/)
  assert.equal(project.name, 'Launch')
  let projects = [project, other]
  projects = addTask(projects, project.id, { title: ' Draft notes ', description: ' First draft ' })
  projects = addTask(projects, project.id, { title: 'Publish' })
  const taskId = projects[0].tasks[0].id
  assert.notEqual(taskId, projects[0].tasks[1].id)
  assert.equal(projects[0].tasks[0].status, 'todo')
  assert.equal(projects[0].tasks[0].title, 'Draft notes')
  assert.equal(projects[1].tasks.length, 0)
  assert.equal(project.tasks.length, 0, 'original state is not mutated')
  saveProjects(projects, storage)
  projects = loadProjects(storage)
  assert.equal(projects[0].tasks.length, 2)
  projects = updateProject(projects, project.id, { name: 'Release', description: 'Updated plan' })
  projects = moveTask(projects, project.id, taskId, 'done')
  projects = editTask(projects, project.id, taskId, { title: ' Final notes ', description: ' Reviewed ' })
  assert.equal(projects[0].tasks[0].status, 'done', 'editing preserves the column')
  assert.equal(projects[0].tasks[0].id, taskId)
  assert.equal(projects[0].tasks[0].title, 'Final notes')
  assert.equal(projects[0].tasks[0].description, 'Reviewed')
  saveProjects(projects, storage)
  assert.deepEqual(loadProjects(storage), projects)
  assert.equal(loadProjects(storage)[0].name, 'Release')
  projects = moveTask(projects, project.id, taskId, 'todo')
  assert.equal(projects[0].tasks.filter(task => task.status === 'todo').length, 2)
  assert.equal(projects[0].tasks.filter(task => task.status === 'done').length, 0)
  assert.deepEqual(moveTask(projects, project.id, taskId, 'invalid'), projects)
  projects = removeTask(projects, project.id, taskId)
  assert.equal(projects[0].tasks.length, 1)
  saveProjects(projects, storage)
  assert.equal(loadProjects(storage)[0].tasks.length, 1)
  projects = removeProject(projects, project.id)
  saveProjects(projects, storage)
  assert.deepEqual(loadProjects(storage), [other], 'deleting the project removes all nested tasks')
})

test('task mutations are scoped to the owning project', () => {
  const a = createProject({ name: 'A' })
  const b = createProject({ name: 'B' })
  const projects = addTask([a, b], a.id, { title: 'A task' })
  const taskId = projects[0].tasks[0].id
  assert.deepEqual(moveTask(projects, b.id, taskId, 'done'), projects)
  assert.deepEqual(removeTask(projects, b.id, taskId), projects)
  assert.deepEqual(editTask(projects, b.id, taskId, { title: 'Wrong project' }), projects)
})

test('corrupt and inaccessible storage are reported without replacing saved data', () => {
  const storage = memoryStorage()
  for (const invalid of ['{broken', '{}', '[null]', '[{"id":"a","name":"A","description":"","tasks":[{"status":"invalid"}]}]']) {
    storage.setItem(STORAGE_KEY, invalid)
    assert.throws(() => loadProjects(storage))
    assert.equal(storage.getItem(STORAGE_KEY), invalid)
  }
  assert.throws(() => loadProjects({ getItem() { throw new Error('denied') } }))
  assert.throws(() => saveProjects([], { setItem() { throw new Error('quota') } }))
})
