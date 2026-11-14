import { checkAbort, cloudRows, requireCloudUser } from './cloudRequest.js'
import { validateFolders, validateNoteFolder } from './organization.js'

export const CLOUD_BACKUP_FORMAT = 'no-te-cloud'
export const CLOUD_BACKUP_VERSION = 1
export const CLOUD_BACKUP_MAX_BYTES = 100 * 1024 * 1024
// Explicit column lists keep Auth/session data and unexpected columns out of files.
export const CLOUD_BACKUP_FIELDS = {
  projects: 'id,user_id,name,description,created_at,updated_at',
  tasks: 'id,project_id,title,description,status,implementation_notes,created_at,updated_at',
  notes: 'id,user_id,project_id,folder_id,title,content,created_at,updated_at',
  folders: 'id,user_id,project_id,parent_folder_id,name,created_at,updated_at',
  tags: 'id,user_id,name,color,created_at,updated_at',
  task_notes: 'task_id,note_id,created_at',
  task_tags: 'task_id,tag_id,created_at',
  note_tags: 'note_id,tag_id,created_at',
}
const owned = ['projects', 'notes', 'folders', 'tags']
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value) => typeof value === 'string' && value.trim().length > 0
const date = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))
function ensure(ok, message) {
  if (!ok) throw new Error(`Invalid cloud backup: ${message}`)
}
function keys(value, allowed, label) {
  ensure(object(value) && Object.keys(value).every((key) => allowed.includes(key)), `${label} contains unsupported fields.`)
}

export function validateCloudBackup(backup, expectedUserId) {
  keys(backup, ['format', 'version', 'exportedAt', 'ownerId', 'data'], 'metadata')
  ensure(backup.format === CLOUD_BACKUP_FORMAT && backup.version === CLOUD_BACKUP_VERSION, 'unsupported format or version.')
  ensure(date(backup.exportedAt) && id(backup.ownerId), 'invalid timestamp or owner.')
  ensure(!expectedUserId || backup.ownerId === expectedUserId, 'account changed.')
  keys(backup.data, Object.keys(CLOUD_BACKUP_FIELDS), 'data')
  const { data } = backup
  const indexes = {}
  const counts = {}
  for (const [table, fields] of Object.entries(CLOUD_BACKUP_FIELDS)) {
    ensure(Array.isArray(data[table]), `missing ${table} table.`)
    counts[table] = data[table].length
    const seen = new Set()
    for (const row of data[table]) {
      keys(row, fields.split(','), table)
      ensure(fields.split(',').every((field) => Object.hasOwn(row, field)), `${table} has missing fields.`)
      ensure(date(row.created_at), `${table} has an invalid created_at.`)
      if ('updated_at' in row) ensure(date(row.updated_at), `${table} has an invalid updated_at.`)
      if (owned.includes(table)) ensure(row.user_id === backup.ownerId, `${table} has a different owner.`)
      const keyFields = table.includes('_') ? fields.split(',').slice(0, 2) : ['id']
      ensure(keyFields.every((field) => id(row[field])), `${table} has invalid IDs.`)
      const key = JSON.stringify(keyFields.map((field) => row[field]))
      ensure(!seen.has(key), `${table} has duplicate records.`)
      seen.add(key)
      if ('title' in row) ensure(typeof row.title === 'string', `${table} has an invalid title.`)
      if ('name' in row) ensure(typeof row.name === 'string' && row.name.trim(), `${table} has an invalid name.`)
      if ('description' in row) ensure(row.description === null || typeof row.description === 'string', `${table} has invalid description.`)
      if (table === 'tasks') ensure(['todo', 'done'].includes(row.status) && (row.implementation_notes === null || typeof row.implementation_notes === 'string'), 'invalid task values.')
      if (table === 'tags') ensure(typeof row.color === 'string' && /^#[0-9a-f]{6}$/i.test(row.color), 'invalid tag color.')
      if (table === 'notes') {
        ensure(object(row.content) && row.content.type === 'doc' && Array.isArray(row.content.content), 'invalid Tiptap JSON.')
        // Preserve extension nodes; validate structure without converting or dropping content.
        const stack = [row.content]
        while (stack.length) {
          const node = stack.pop()
          ensure(object(node) && id(node.type), 'malformed Tiptap node.')
          if (node.type === 'text') ensure(typeof node.text === 'string', 'malformed Tiptap text.')
          if (node.content !== undefined) {
            ensure(Array.isArray(node.content), 'malformed Tiptap children.')
            for (const child of node.content) stack.push(child)
          }
          if (node.marks !== undefined) ensure(Array.isArray(node.marks) && node.marks.every((mark) => object(mark) && id(mark.type)), 'malformed Tiptap marks.')
        }
      }
    }
    indexes[table] = new Set(data[table].map((row) => row.id))
  }
  const ref = (row, field, table, nullable = false) => ensure((nullable && row[field] === null) || indexes[table].has(row[field]), `${field} has a broken reference to ${table}.`)
  for (const row of data.tasks) ref(row, 'project_id', 'projects')
  for (const row of [...data.notes, ...data.folders]) ref(row, 'project_id', 'projects', true)
  const folders = data.folders.map((row) => ({ id: row.id, projectId: row.project_id, parentFolderId: row.parent_folder_id }))
  for (const row of data.folders) ref(row, 'parent_folder_id', 'folders', true)
  validateFolders(folders)
  for (const row of data.notes) {
    ref(row, 'folder_id', 'folders', true)
    validateNoteFolder({ projectId: row.project_id, folderId: row.folder_id }, folders)
  }
  for (const table of ['task_notes', 'task_tags', 'note_tags']) {
    for (const row of data[table]) {
      if ('task_id' in row) ref(row, 'task_id', 'tasks')
      if ('note_id' in row) ref(row, 'note_id', 'notes')
      if ('tag_id' in row) ref(row, 'tag_id', 'tags')
    }
  }
  return { backup, counts }
}

export function parseCloudBackup(text) {
  ensure(typeof text === 'string' && new TextEncoder().encode(text).length <= CLOUD_BACKUP_MAX_BYTES, 'file exceeds the 100 MB preview limit.')
  let backup
  try { backup = JSON.parse(text) } catch { throw new Error('Choose a valid JSON cloud backup.') }
  return validateCloudBackup(backup)
}

export async function exportCloudBackup(client, userId, { signal = new AbortController().signal, onProgress = () => {}, now = new Date() } = {}) {
  await requireCloudUser(client, userId, signal)
  const data = {}
  for (const [table, fields] of Object.entries(CLOUD_BACKUP_FIELDS)) {
    onProgress(`Reading ${table}…`)
    data[table] = await cloudRows(() => {
      let query = client.schema('public').from(table).select(fields, { count: 'exact' })
      if (owned.includes(table)) query = query.eq('user_id', userId)
      const order = table.includes('_') ? fields.split(',').slice(0, 2) : ['id']
      for (const field of order) query = query.order(field)
      return query
    }, signal, table, { requireExactCount: true, onPage: (loaded, count) => onProgress(`Reading ${table}: ${loaded} of ${count}…`) })
  }
  // Reject files after account switches/expiration, even when reads used a pinned JWT.
  await requireCloudUser(client, userId, signal)
  checkAbort(signal)
  onProgress('Validating all records and relationships…')
  const result = validateCloudBackup({ format: CLOUD_BACKUP_FORMAT, version: CLOUD_BACKUP_VERSION, ownerId: userId, exportedAt: now.toISOString(), data }, userId)
  return { ...result, filename: `no-te-cloud-${now.toISOString().replace(/[:.]/g, '-')}.json` }
}

export function downloadCloudBackup({ backup, filename }) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    try { anchor.click() } finally { anchor.remove() }
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0) }
}
