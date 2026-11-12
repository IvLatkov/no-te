import { assertStorageWritable } from './storageSafety.js'
export const ORGANIZATION_KEY = 'no-te.organization.v1'
export const TAG_COLORS = [
  { name: 'Purple', value: '#B994FF' }, { name: 'Blue', value: '#7DBAE8' },
  { name: 'Green', value: '#77C5AA' }, { name: 'Amber', value: '#E8BE72' },
  { name: 'Rose', value: '#E79AAF' }, { name: 'Slate', value: '#B6A8D4' },
]
export const normalizeIds = ids => [...new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [])]

export function folderDepth(folders, id) {
  const seen = new Set()
  let depth = 0
  while (id) {
    if (seen.has(id)) throw new Error('Folders cannot contain circular relationships.')
    seen.add(id)
    const folder = folders.find(item => item.id === id)
    if (!folder) throw new Error('The parent folder no longer exists.')
    depth += 1
    id = folder.parentFolderId
  }
  return depth
}

export function validateFolders(folders) {
  if (new Set(folders.map(folder => folder.id)).size !== folders.length) throw new Error('Folder IDs must be unique.')
  for (const folder of folders) {
    if (folderDepth(folders, folder.id) > 3) throw new Error('Folders can be nested up to three levels.')
    const parent = folders.find(item => item.id === folder.parentFolderId)
    if (parent && parent.projectId !== folder.projectId) throw new Error('A subfolder must belong to the same project as its parent.')
  }
  return folders
}

export function loadOrganization(storage = localStorage) {
  const raw = storage.getItem(ORGANIZATION_KEY)
  if (raw === null) return { version: 1, folders: [], tags: [] }
  const data = JSON.parse(raw)
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  const nullableId = value => value === null || typeof value === 'string'
  if (data?.version !== 1 || !Array.isArray(data.folders) || !Array.isArray(data.tags) ||
    !data.folders.every(folder => folder && typeof folder.id === 'string' && typeof folder.name === 'string' && folder.name.trim() && nullableId(folder.parentFolderId) && nullableId(folder.projectId) && validDate(folder.createdAt) && validDate(folder.updatedAt)) ||
    !data.tags.every(tag => tag && typeof tag.id === 'string' && typeof tag.name === 'string' && tag.name.trim() && TAG_COLORS.some(color => color.value === tag.color)) || new Set(data.tags.map(tag => tag.id)).size !== data.tags.length) throw new Error('Saved organization data is invalid.')
  validateFolders(data.folders)
  return data
}

export function saveOrganization(data, storage = localStorage, expectedRevision) { assertStorageWritable(storage, expectedRevision); storage.setItem(ORGANIZATION_KEY, JSON.stringify(data)) }

export function saveFolder(folders, values, id = null) {
  const name = values.name.trim()
  if (!name) throw new Error('Enter a folder name.')
  const previous = id ? folders.find(folder => folder.id === id) : null
  if (id && !previous) throw new Error('This folder no longer exists.')
  const timestamp = new Date().toISOString()
  const folder = { parentFolderId: null, projectId: null, ...previous, ...values, id: id || crypto.randomUUID(), createdAt: previous?.createdAt || timestamp, name, updatedAt: timestamp }
  if (folders.some(item => item.id !== folder.id && item.parentFolderId === folder.parentFolderId && item.projectId === folder.projectId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A folder with this name already exists here.')
  return validateFolders(previous ? folders.map(item => item.id === id ? folder : item) : [...folders, folder])
}

export function folderDeletion(folders, id) {
  const folder = folders.find(item => item.id === id)
  if (!folder) throw new Error('This folder no longer exists.')
  const ids = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const item of folders) if (ids.has(item.parentFolderId) && !ids.has(item.id)) { ids.add(item.id); changed = true }
  }
  return { ids, destination: folder.parentFolderId, folders: folders.filter(item => !ids.has(item.id)) }
}

export function validateNoteFolder(note, folders) {
  if (!note.folderId) return
  const folder = folders.find(item => item.id === note.folderId)
  if (!folder) throw new Error('This folder is unavailable. Choose another folder or Unfiled.')
  if (folder.projectId !== null && folder.projectId !== note.projectId) throw new Error('This folder belongs to a different project. Choose a compatible folder or move the note to Unfiled before changing its project.')
}

export function moveNotesOutOfFolders(notes, deletion) {
  return notes.map(note => deletion.ids.has(note.folderId) ? { ...note, folderId: deletion.destination, updatedAt: new Date().toISOString() } : note)
}

export function saveTag(tags, values, id = null) {
  const name = values.name.trim()
  if (!name) throw new Error('Enter a tag name.')
  if (!TAG_COLORS.some(color => color.value === values.color)) throw new Error('Choose a color from the palette.')
  if (tags.some(tag => tag.id !== id && tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A tag with this name already exists.')
  if (id && !tags.some(tag => tag.id === id)) throw new Error('This tag no longer exists.')
  const tag = { id: id || crypto.randomUUID(), name, color: values.color }
  return id ? tags.map(item => item.id === id ? tag : item) : [...tags, tag]
}

export function removeTagFromProjects(projects, id) {
  return projects.map(project => ({ ...project, tasks: project.tasks.map(task => (task.tagIds || []).includes(id) ? { ...task, tagIds: task.tagIds.filter(value => value !== id), updatedAt: new Date().toISOString() } : task) }))
}

export function removeTagFromNotes(notes, id) {
  return notes.map(note => (note.tagIds || []).includes(id) ? { ...note, tagIds: note.tagIds.filter(value => value !== id), updatedAt: new Date().toISOString() } : note)
}

export function selectTasks(tasks, { query = '', tagIds = [], sort = 'stored' } = {}) {
  const term = query.trim().toLocaleLowerCase()
  const result = tasks.filter(task => task.title.toLocaleLowerCase().includes(term) && tagIds.every(id => (task.tagIds || []).includes(id)))
  if (sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  if (sort === 'created' || sort === 'updated') {
    const key = sort === 'created' ? 'createdAt' : 'updatedAt'
    result.sort((a, b) => (b[key] || '').localeCompare(a[key] || '') || a.id.localeCompare(b.id))
  }
  return result
}
