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
  return notes
}

export function saveNotes(notes, storage = localStorage) {
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
}

export function createNote({ title = '', projectId = null, content = EMPTY_DOCUMENT } = {}) {
  const timestamp = new Date().toISOString()
  return { id: crypto.randomUUID(), title: title.trim() || 'Untitled note', content: structuredClone(content), projectId, createdAt: timestamp, updatedAt: timestamp }
}

export function duplicateNote(note) {
  return createNote({ title: `${note.title || 'Untitled note'} (copy)`, projectId: note.projectId, content: note.content })
}

export function noteText(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  const separator = ['paragraph', 'heading', 'codeBlock'].includes(node.type) ? '' : '\n'
  return (node.content || []).map(noteText).join(separator)
}

export function selectNotes(notes, { query = '', projectId = 'all', sort = 'modified' } = {}) {
  const term = query.trim().toLocaleLowerCase()
  return notes.filter(note => (projectId === 'all' || note.projectId === projectId) &&
    (!term || `${note.title}\n${noteText(note.content)}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => sort === 'title'
      ? (a.title || 'Untitled note').localeCompare(b.title || 'Untitled note') || a.id.localeCompare(b.id)
      : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

export function unassignMissingProjects(notes, projectIds) {
  const known = new Set(projectIds)
  return notes.map(note => note.projectId && !known.has(note.projectId) ? { ...note, projectId: null } : note)
}
