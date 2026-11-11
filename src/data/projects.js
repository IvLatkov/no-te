export const STORAGE_KEY = 'no-te.projects.v1'

function validTask(task) {
  return task && typeof task.id === 'string' && typeof task.title === 'string' &&
    typeof task.description === 'string' && ['todo', 'done'].includes(task.status)
}

export function loadProjects(storage = localStorage) {
  const saved = storage.getItem(STORAGE_KEY)
  if (saved === null) return []
  const projects = JSON.parse(saved)
  if (!Array.isArray(projects) || !projects.every(project => project &&
    typeof project.id === 'string' && typeof project.name === 'string' &&
    typeof project.description === 'string' && Array.isArray(project.tasks) && project.tasks.every(validTask))) {
    throw new Error('Invalid saved projects')
  }
  return projects
}

export function saveProjects(projects, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function createProject({ name, description = '' }) {
  return { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), tasks: [] }
}

export function createTask({ title, description = '' }) {
  return { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), status: 'todo' }
}

export function updateProject(projects, id, changes) {
  return projects.map(project => project.id === id ? { ...project, ...changes, id: project.id } : project)
}

export function removeProject(projects, id) {
  return projects.filter(project => project.id !== id)
}

export function updateTasks(projects, projectId, transform) {
  return projects.map(project => project.id === projectId ? { ...project, tasks: transform(project.tasks) } : project)
}

export function addTask(projects, projectId, values) {
  return updateTasks(projects, projectId, tasks => [...tasks, createTask(values)])
}

export function editTask(projects, projectId, taskId, { title, description = '' }) {
  return updateTasks(projects, projectId, tasks => tasks.map(task => task.id === taskId
    ? { ...task, title: title.trim(), description: description.trim() } : task))
}

export function moveTask(projects, projectId, taskId, status) {
  if (!['todo', 'done'].includes(status)) return projects
  return updateTasks(projects, projectId, tasks => tasks.map(task => task.id === taskId ? { ...task, status } : task))
}

export function removeTask(projects, projectId, taskId) {
  return updateTasks(projects, projectId, tasks => tasks.filter(task => task.id !== taskId))
}
