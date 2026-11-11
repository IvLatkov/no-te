import { normalizeIds } from './organization.js'
export const STORAGE_KEY = 'no-te.projects.v1'

function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }

export function normalizeTask(task) {
  return {
    ...task,
    tagIds: normalizeIds(task.tagIds),
    linkedNoteIds: [...new Set(Array.isArray(task.linkedNoteIds) ? task.linkedNoteIds.filter(id => typeof id === 'string') : [])],
    implementationNotes: typeof task.implementationNotes === 'string' ? task.implementationNotes : '',
    // Older tasks have no known creation time; do not invent one on each load.
    createdAt: validDate(task.createdAt) ? task.createdAt : null,
    updatedAt: validDate(task.updatedAt) ? task.updatedAt : validDate(task.createdAt) ? task.createdAt : null,
  }
}

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
  return projects.map(project => ({ ...project, tasks: project.tasks.map(normalizeTask) }))
}

export function saveProjects(projects, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function createProject({ name, description = '' }) {
  return { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), tasks: [] }
}

export function createTask({ title, description = '' }) {
  const timestamp = new Date().toISOString()
  return { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), status: 'todo', linkedNoteIds: [], tagIds: [], implementationNotes: '', createdAt: timestamp, updatedAt: timestamp }
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
  return updateTaskDetails(projects, projectId, taskId, { title, description: description.trim() })
}

export function updateTaskDetails(projects, projectId, taskId, changes) {
  return updateTasks(projects, projectId, tasks => tasks.map(task => {
    if (task.id !== taskId) return task
    const patch = {}
    if (typeof changes.title === 'string' && changes.title.trim()) patch.title = changes.title.trim()
    if (typeof changes.description === 'string') patch.description = changes.description
    if (typeof changes.implementationNotes === 'string') patch.implementationNotes = changes.implementationNotes
    if (['todo', 'done'].includes(changes.status)) patch.status = changes.status
    if (Array.isArray(changes.linkedNoteIds)) patch.linkedNoteIds = [...new Set(changes.linkedNoteIds.filter(id => typeof id === 'string'))]
    if (Array.isArray(changes.tagIds)) patch.tagIds = normalizeIds(changes.tagIds)
    return { ...normalizeTask(task), ...patch, updatedAt: new Date().toISOString() }
  }))
}

export function linkTaskNotes(projects, projectId, taskId, noteIds) {
  const task = projects.find(project => project.id === projectId)?.tasks.find(item => item.id === taskId)
  if (!task) return projects
  return updateTaskDetails(projects, projectId, taskId, { linkedNoteIds: [...normalizeTask(task).linkedNoteIds, ...noteIds] })
}

export function moveTask(projects, projectId, taskId, status) {
  if (!['todo', 'done'].includes(status)) return projects
  return updateTaskDetails(projects, projectId, taskId, { status })
}

export function removeTask(projects, projectId, taskId) {
  return updateTasks(projects, projectId, tasks => tasks.filter(task => task.id !== taskId))
}
