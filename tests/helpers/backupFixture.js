import { createProject, createTask, STORAGE_KEY } from '../../src/data/projects.js'
import { createNote, NOTES_STORAGE_KEY } from '../../src/data/notes.js'
import { ORGANIZATION_KEY, TAG_COLORS } from '../../src/data/organization.js'
import { BACKUP_FORMAT, BACKUP_VERSION, SCHEMA_VERSION } from '../../src/data/backupValidation.js'

export function backupFixture(prefix = 'Original') {
  const project = createProject({ name: `${prefix} project`, description: 'A complete backed-up workspace.' })
  const other = createProject({ name: `${prefix} second project` })
  const tag = { id: crypto.randomUUID(), name: `${prefix} Focus`, color: TAG_COLORS[0].value, extraMetadata: { futureField: true } }
  const secondTag = { id: crypto.randomUUID(), name: `${prefix} Reference`, color: TAG_COLORS[1].value }
  const timestamp = '2026-11-10T12:30:00.000Z'
  const folder = { id: crypto.randomUUID(), name: `${prefix} folder`, projectId: project.id, parentFolderId: null, createdAt: timestamp, updatedAt: timestamp, futureField: 'folder metadata' }
  const content = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `${prefix} architecture`, marks: [{ type: 'bold' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)> is plain text, not HTML.' }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep relationships intact' }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Reference', marks: [{ type: 'link', attrs: { href: 'https://example.com/docs', target: '_blank', rel: 'noopener noreferrer', class: null } }] }] },
  ] }
  const note = { ...createNote({ title: `${prefix} architecture`, projectId: project.id, folderId: folder.id, tagIds: [tag.id, secondTag.id], content }), futureNoteField: { label: 'preserve this' } }
  const unassigned = createNote({ title: `${prefix} general note` })
  const task = { ...createTask({ title: `${prefix} implementation`, description: 'Task description' }), linkedNoteIds: [note.id, unassigned.id], implementationNotes: 'Useful compile command\nnpm run build\nNext: verify', tagIds: [tag.id], futureTaskField: ['preserve', 'ordering'] }
  project.tasks = [task, { ...createTask({ title: `${prefix} completed task` }), status: 'done', tagIds: [secondTag.id] }]
  project.futureProjectField = { density: 'compact' }
  const data = { projects: [project, other], notes: [note, unassigned], organization: { version: 1, folders: [folder], tags: [tag, secondTag], futureOrganizationField: { enabled: true } } }
  const backup = { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: '2026-11-12T12:34:00.000Z', data }
  return { data, backup, project, other, note, unassigned, task, folder, tag, secondTag }
}

export function seedBackupData(storage, data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data.projects))
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data.notes))
  storage.setItem(ORGANIZATION_KEY, JSON.stringify(data.organization))
}

export function memoryStorage() {
  const entries = new Map()
  const writes = []
  const reads = []
  const storage = {
    beforeWrite: null, beforeRead: null, beforeRemove: null, writes, reads,
    getItem(key) { reads.push(key); const override = storage.beforeRead?.(key, entries); return override === undefined ? entries.get(key) ?? null : override },
    setItem(key, value) { storage.beforeWrite?.(key, value, entries); writes.push([key, value]); entries.set(key, String(value)) },
    removeItem(key) { storage.beforeRemove?.(key, entries); writes.push([key, null]); entries.delete(key) },
    inspect: key => entries.get(key) ?? null,
  }
  return storage
}
