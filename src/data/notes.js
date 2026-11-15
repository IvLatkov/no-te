import { normalizeIds } from './organization.js'
import { assertStorageWritable } from './storageSafety.js'
export const NOTES_STORAGE_KEY = 'no-te.notes.v1'
export const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }

function validContent(node, depth = 0) {
  return node && depth < 100 && typeof node.type === 'string' &&
    (node.text === undefined || typeof node.text === 'string') &&
    (node.content === undefined || (Array.isArray(node.content) && node.content.every(child => validContent(child, depth + 1))))
}

export function loadNotes(storage = localStorage) {
  const saved = storage.getItem(NOTES_STORAGE_KEY)
  if (saved === null) return []
  const notes = JSON.parse(saved)
  if (!Array.isArray(notes) || !notes.every(note => note && typeof note.id === 'string' &&
    typeof note.title === 'string' && (note.projectId === null || typeof note.projectId === 'string') &&
    typeof note.createdAt === 'string' && Number.isFinite(Date.parse(note.createdAt)) &&
    typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)) &&
    note.content?.type === 'doc' && validContent(note.content)) || new Set(notes.map(note => note.id)).size !== notes.length) {
    throw new Error('Invalid saved notes')
  }
  return notes.map(note => ({ ...note, folderId: typeof note.folderId === 'string' ? note.folderId : null, tagIds: normalizeIds(note.tagIds) }))
}

export function saveNotes(notes, storage = localStorage, expectedRevision) {
  assertStorageWritable(storage, expectedRevision)
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
}

export function createNote({ title = '', projectId = null, content = EMPTY_DOCUMENT, folderId = null, tagIds = [] } = {}) {
  const timestamp = new Date().toISOString()
  return { id: crypto.randomUUID(), title: title.trim() || 'Untitled note', content: structuredClone(content), projectId, folderId, tagIds: normalizeIds(tagIds), createdAt: timestamp, updatedAt: timestamp }
}

export function duplicateNote(note) {
  return createNote({ title: `${note.title || 'Untitled note'} (copy)`, projectId: note.projectId, folderId: note.folderId || null, tagIds: note.tagIds || [], content: note.content })
}

export function noteText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
  if (node.type === 'hardBreak') return '\n'
  const separator = ['paragraph', 'heading', 'codeBlock'].includes(node.type) ? '' : '\n'
  return (Array.isArray(node.content) ? node.content : []).map(noteText).join(separator)
}

export function selectNotes(notes, { query = '', projectId = 'all', folderId = 'all', tagIds = [], sort = 'modified', projectNoteIds = [] } = {}) {
  const term = query.trim().toLocaleLowerCase()
  return notes.filter(note => (projectId === 'all' || note.projectId === projectId || projectNoteIds.includes(note.id)) &&
    (folderId === 'all' || (note.folderId || null) === folderId) && tagIds.every(id => (note.tagIds || []).includes(id)) &&
    (!term || `${note.title}\n${noteText(note.content)}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => sort === 'title'
      ? (a.title || 'Untitled note').localeCompare(b.title || 'Untitled note') || a.id.localeCompare(b.id)
      : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

export function unassignMissingProjects(notes, projectIds) {
  const known = new Set(projectIds)
  return notes.map(note => note.projectId && !known.has(note.projectId) ? { ...note, projectId: null } : note)
}
