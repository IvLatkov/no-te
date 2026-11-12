import { getSchema } from '@tiptap/core'
import { editorExtensions, safeLink } from '../components/documentation/editorExtensions.js'
import { TAG_COLORS, validateFolders, validateNoteFolder } from './organization.js'

export const BACKUP_FORMAT = 'no-te-backup'
export const BACKUP_VERSION = 1
export const SCHEMA_VERSION = 1
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024
const secretFields = new Set(['apikey', 'accesstoken', 'refreshtoken', 'idtoken', 'authtoken', 'token', 'password', 'secret', 'clientsecret', 'privatekey', 'credentials', 'authorization', 'sessiontoken', 'bearertoken', 'cookie', 'cookies', 'servicerolekey'])
let editorSchema
const own = (object, key) => Object.hasOwn(object, key)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function requireValue(condition, message) { if (!condition) throw new Error(message) }
function record(value, path) { requireValue(object(value), `${path} must be an object.`) }
function array(value, path) { requireValue(Array.isArray(value), `${path} must be an array.`) }
function string(value, path, nonempty = false) { requireValue(typeof value === 'string' && (!nonempty || value.trim()), `${path} must be ${nonempty ? 'a nonempty' : 'a'} string.`) }
function id(value, path) { requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value), `${path} contains an invalid ID.`) }
function nullableId(value, path) { if (value !== null) id(value, path) }
function timestamp(value, path, nullable = false) {
  requireValue((nullable && value === null) || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))), `${path} must be an ISO 8601 timestamp${nullable ? ' or null for an older task' : ''}.`)
}

// Copy JSON data without merging untrusted object keys into application objects.
// Free-text content remains intact; known credential-shaped metadata is excluded.
function safeCopy(input) {
  const ancestors = new WeakSet()
  let visited = 0
  let excluded = 0
  function copy(value, depth) {
    if (++visited > 250000 || depth > 128) throw new Error('The backup is too complex to process safely.')
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') { requireValue(Number.isFinite(value), 'The backup contains an invalid number.'); return value }
    requireValue(typeof value === 'object', 'The backup contains a value that is not JSON data.')
    requireValue(!ancestors.has(value), 'The backup contains circular data.')
    ancestors.add(value)
    let result
    if (Array.isArray(value)) result = value.map(item => copy(item, depth + 1))
    else {
      result = {}
      for (const [key, item] of Object.entries(value)) {
        requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'The backup contains an unsafe object property.')
        if (secretFields.has(key.replace(/[_\s-]/g, '').toLocaleLowerCase())) { excluded++; continue }
        result[key] = copy(item, depth + 1)
      }
    }
    ancestors.delete(value)
    return result
  }
  return { value: copy(input, 0), excluded }
}

function ids(value, path) {
  array(value, path)
  value.forEach(item => id(item, path))
  requireValue(new Set(value).size === value.length, `${path} contains duplicate references.`)
}
function unique(records, path) {
  const result = new Set()
  for (const item of records) {
    record(item, path)
    id(item.id, `${path}.id`)
    requireValue(!result.has(item.id), `${path} contains duplicate IDs.`)
    result.add(item.id)
  }
  return result
}
function references(values, known, path) { requireValue(values.every(value => known.has(value)), `${path} references an item that does not exist.`) }
function defaultField(target, name, value) { if (!own(target, name)) target[name] = value }

function validateContent(content) {
  record(content, 'Note content')
  requireValue(content.type === 'doc', 'Note content must be a Tiptap document.')
  let nodes = 0
  function visit(node, depth) {
    requireValue(++nodes <= 100000 && depth <= 100, 'Note content is too complex.')
    record(node, 'Note content node')
    string(node.type, 'Note node type', true)
    if (own(node, 'text')) string(node.text, 'Note text')
    if (own(node, 'attrs')) record(node.attrs, 'Note node attributes')
    if (node.type === 'heading' && own(node.attrs || {}, 'level')) requireValue([1, 2, 3].includes(node.attrs.level), 'Only heading levels 1, 2, and 3 are supported.')
    if (node.type === 'taskItem' && own(node.attrs || {}, 'checked')) requireValue(typeof node.attrs.checked === 'boolean', 'Checklist state must be true or false.')
    if (node.type === 'orderedList' && own(node.attrs || {}, 'start')) requireValue(Number.isSafeInteger(node.attrs.start), 'Numbered list start must be an integer.')
    if (node.type === 'codeBlock' && own(node.attrs || {}, 'language')) requireValue(node.attrs.language === null || typeof node.attrs.language === 'string', 'Code block language must be text or null.')
    if (own(node, 'marks')) {
      array(node.marks, 'Note marks')
      node.marks.forEach(mark => {
        record(mark, 'Note mark')
        string(mark.type, 'Note mark type', true)
        if (own(mark, 'attrs')) record(mark.attrs, 'Note mark attributes')
        if (mark.type === 'link') requireValue(typeof mark.attrs?.href === 'string' && Boolean(safeLink(mark.attrs.href)), 'A note contains an unsafe or invalid link URL.')
      })
    }
    if (own(node, 'content')) { array(node.content, 'Note node content'); node.content.forEach(child => visit(child, depth + 1)) }
  }
  visit(content, 0)
  try {
    editorSchema ||= getSchema(editorExtensions())
    editorSchema.nodeFromJSON(content).check()
  } catch { throw new Error('Note content contains unsupported or invalid Tiptap formatting.') }
}

export function validateBackup(input) {
  const { value: backup, excluded } = safeCopy(input)
  record(backup, 'Backup')
  requireValue(backup.format === BACKUP_FORMAT, 'This file is not a No-Te backup.')
  requireValue(Number.isInteger(backup.backupVersion), 'The backup format version is missing or invalid.')
  requireValue(backup.backupVersion === BACKUP_VERSION, backup.backupVersion > BACKUP_VERSION ? 'This backup uses a newer backup format. Update No-Te before restoring it.' : 'This backup format version is not supported.')
  requireValue([0, SCHEMA_VERSION].includes(backup.schemaVersion), backup.schemaVersion > SCHEMA_VERSION ? 'This backup uses a newer data schema. Update No-Te before restoring it.' : 'This data schema version is not supported.')
  timestamp(backup.exportedAt, 'Backup creation date')
  record(backup.data, 'Backup data')
  const sourceSchemaVersion = backup.schemaVersion
  const warnings = []
  const data = backup.data
  // Schema 0 is the explicit legacy profile: flat optional folders/tags and older records.
  if (sourceSchemaVersion === 0) {
    requireValue(!own(data, 'organization') || (!own(data, 'folders') && !own(data, 'tags')), 'Legacy backup has ambiguous organization collections.')
    if (!own(data, 'organization')) {
      data.organization = { version: 1, folders: own(data, 'folders') ? data.folders : [], tags: own(data, 'tags') ? data.tags : [] }
      delete data.folders
      delete data.tags
    }
    warnings.push('Legacy schema 0 will be migrated to schema 1 in memory before restoration.')
  }
  requireValue(Object.keys(data).every(key => ['projects', 'notes', 'organization'].includes(key)), 'This backup contains an unsupported data collection; restoring it could lose data.')
  array(data.projects, 'Projects')
  array(data.notes, 'Notes')
  record(data.organization, 'Organization data')
  requireValue(data.organization.version === 1, 'The organization schema version is not supported.')
  array(data.organization.folders, 'Folders')
  array(data.organization.tags, 'Tags')
  const projectIds = unique(data.projects, 'Projects')
  const noteIds = unique(data.notes, 'Notes')
  const folderIds = unique(data.organization.folders, 'Folders')
  const tagIds = unique(data.organization.tags, 'Tags')
  const tasks = []
  for (const project of data.projects) {
    string(project.name, 'Project name', true)
    defaultField(project, 'description', '')
    string(project.description, 'Project description')
    array(project.tasks, 'Project tasks')
    for (const task of project.tasks) {
      record(task, 'Task')
      string(task.title, 'Task title', true)
      defaultField(task, 'description', '')
      defaultField(task, 'implementationNotes', '')
      defaultField(task, 'linkedNoteIds', [])
      defaultField(task, 'tagIds', [])
      defaultField(task, 'createdAt', null)
      defaultField(task, 'updatedAt', task.createdAt)
      string(task.description, 'Task description')
      string(task.implementationNotes, 'Implementation Notes')
      requireValue(['todo', 'done'].includes(task.status), 'Task status must be To Do or Done.')
      if (own(task, 'projectId')) requireValue(task.projectId === project.id, 'A task references the wrong parent project.')
      ids(task.linkedNoteIds, 'Task note links')
      ids(task.tagIds, 'Task tags')
      references(task.tagIds, tagIds, 'Task tags')
      timestamp(task.createdAt, 'Task creation date', true)
      timestamp(task.updatedAt, 'Task updated date', true)
      tasks.push(task)
    }
  }
  unique(tasks, 'Tasks')
  for (const folder of data.organization.folders) {
    string(folder.name, 'Folder name', true)
    nullableId(folder.parentFolderId, 'Parent folder')
    nullableId(folder.projectId, 'Folder project')
    if (folder.parentFolderId !== null) references([folder.parentFolderId], folderIds, 'Parent folder')
    if (folder.projectId !== null) references([folder.projectId], projectIds, 'Folder project')
    timestamp(folder.createdAt, 'Folder creation date')
    timestamp(folder.updatedAt, 'Folder updated date')
  }
  validateFolders(data.organization.folders)
  const tagNames = new Set()
  for (const tag of data.organization.tags) {
    string(tag.name, 'Tag name', true)
    requireValue(TAG_COLORS.some(color => color.value === tag.color), 'A tag uses a color outside the supported palette.')
    const name = tag.name.trim().toLocaleLowerCase()
    requireValue(!tagNames.has(name), 'Tags contain duplicate names.')
    tagNames.add(name)
  }
  for (const note of data.notes) {
    string(note.title, 'Note title')
    defaultField(note, 'projectId', null)
    defaultField(note, 'folderId', null)
    defaultField(note, 'tagIds', [])
    nullableId(note.projectId, 'Note project')
    nullableId(note.folderId, 'Note folder')
    if (note.projectId !== null) references([note.projectId], projectIds, 'Note project')
    if (note.folderId !== null) references([note.folderId], folderIds, 'Note folder')
    validateNoteFolder(note, data.organization.folders)
    ids(note.tagIds, 'Note tags')
    references(note.tagIds, tagIds, 'Note tags')
    timestamp(note.createdAt, 'Note creation date')
    timestamp(note.updatedAt, 'Note updated date')
    validateContent(note.content)
  }
  // Iteration 4 deliberately retains inactive IDs after note deletion. Validate
  // their shape, preserve them, and disclose them instead of inventing notes.
  const inactiveLinks = tasks.reduce((count, task) => count + task.linkedNoteIds.filter(value => !noteIds.has(value)).length, 0)
  if (inactiveLinks) warnings.push(`${inactiveLinks} task link(s) refer to missing/deleted notes. They will remain inactive, as in the current app.`)
  if (excluded) warnings.push(`${excluded} credential-shaped metadata field(s) were excluded. Free-text note and task content was kept.`)
  backup.schemaVersion = SCHEMA_VERSION
  return { backup, sourceSchemaVersion, warnings, counts: { projects: data.projects.length, tasks: tasks.length, notes: data.notes.length, folders: data.organization.folders.length, tags: data.organization.tags.length } }
}

export function parseBackup(text, { maxBytes = MAX_BACKUP_BYTES } = {}) {
  requireValue(typeof text === 'string', 'The backup file could not be read as text.')
  requireValue(new TextEncoder().encode(text).byteLength <= maxBytes, `The backup exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB file size limit.`)
  let value
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error('The selected file is not valid JSON.') }
  return validateBackup(value)
}
