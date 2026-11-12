import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, backupFilename, parseBackup, readBackupFile, restoreBackup, recoverPreviousData } from '../src/data/backup.js'
import { validateBackup, MAX_BACKUP_BYTES } from '../src/data/backupValidation.js'
import { DATA_REVISION_KEY, USER_DATA_KEYS, RECOVERY_KEY, PREFLIGHT_KEY, getRecoveryState } from '../src/data/storageSafety.js'
import { STORAGE_KEY, saveProjects } from '../src/data/projects.js'
import { NOTES_STORAGE_KEY } from '../src/data/notes.js'
import { ORGANIZATION_KEY } from '../src/data/organization.js'
import { createNotesStore } from '../src/data/notesStore.js'
import { backupFixture, seedBackupData, memoryStorage } from './helpers/backupFixture.js'

const rawData = storage => USER_DATA_KEYS.map(key => storage.inspect(key))
const quota = () => new DOMException('Simulated quota', 'QuotaExceededError')

test('export captures metadata, every owned collection, IDs, ordering, rich JSON and unknown valid fields without writes', () => {
  const fixture = backupFixture()
  const storage = memoryStorage()
  seedBackupData(storage, fixture.data)
  storage.setItem('auth.session', 'never export this token')
  storage.setItem('vite.cache', 'unrelated')
  storage.setItem('no-te.unsupported.future-store', 'not an owned supported store')
  const original = rawData(storage)
  const count = storage.writes.length
  const result = createBackup({ storage, now: new Date('2026-11-12T12:34:56.789Z') })
  assert.equal(result.backup.format, 'no-te-backup')
  assert.equal(result.backup.backupVersion, 1)
  assert.equal(result.backup.schemaVersion, 1)
  assert.equal(result.backup.exportedAt, '2026-11-12T12:34:56.789Z')
  assert.equal(result.filename, 'no-te-backup-2026-11-12-12-34.json')
  assert.equal(backupFilename(new Date('2026-01-02T03:04:00Z')), 'no-te-backup-2026-01-02-03-04.json')
  assert.deepEqual(result.backup.data, fixture.data)
  assert.deepEqual(result.counts, { projects: 2, tasks: 2, notes: 2, folders: 1, tags: 2 })
  assert.equal(JSON.stringify(result.backup).includes('never export this token'), false)
  assert.equal(storage.writes.length, count)
  assert.deepEqual(rawData(storage), original)
  assert.deepEqual(parseBackup(JSON.stringify(result.backup)).backup, result.backup)
})

test('export excludes credential metadata while preserving free text and never scans unrelated storage', () => {
  const fixture = backupFixture()
  fixture.data.projects[0].apiKey = 'secret-key'
  fixture.data.projects[0].tasks[0].access_token = 'secret-token'
  fixture.data.notes[0].credentials = { password: 'secret-password' }
  fixture.data.organization.clientSecret = 'private-client-value'
  fixture.data.notes[0].futureNoteField.text = 'A note can discuss API keys without losing its text.'
  const storage = memoryStorage()
  seedBackupData(storage, fixture.data)
  storage.reads.length = 0
  const result = createBackup({ storage })
  const json = JSON.stringify(result.backup)
  for (const secret of ['secret-key', 'secret-token', 'secret-password', 'private-client-value']) assert.equal(json.includes(secret), false)
  assert.match(json, /A note can discuss API keys/)
  assert.ok(result.warnings.some(warning => warning.includes('credential-shaped')))
  assert.ok(storage.reads.every(key => [...USER_DATA_KEYS, RECOVERY_KEY].includes(key)))
  assert.equal(JSON.parse(storage.inspect(STORAGE_KEY))[0].apiKey, 'secret-key')
})

test('import preview is pure, handles BOM and file APIs, rejects oversized files before reading', async () => {
  const fixture = backupFixture()
  const before = JSON.stringify(fixture.backup)
  const preview = parseBackup('\uFEFF' + before)
  assert.equal(JSON.stringify(fixture.backup), before)
  assert.deepEqual(preview.backup.data, fixture.data)
  const fromFile = await readBackupFile({ name: 'backup.json', size: new TextEncoder().encode(before).byteLength, text: async () => before })
  assert.deepEqual(fromFile.counts, preview.counts)
  let read = false
  await assert.rejects(readBackupFile({ name: 'huge.json', size: MAX_BACKUP_BYTES + 1, text: async () => { read = true; return before } }), /10 MB/)
  assert.equal(read, false)
  assert.throws(() => parseBackup(before, { maxBytes: 1 }), /file size limit/)
  await assert.rejects(readBackupFile({ name: 'wrong.txt', size: 1, text: async () => before }), /\.json/)
  await assert.rejects(readBackupFile({ name: 'broken.json', size: 1, text: async () => { throw new Error('Read denied') } }), /could not be read/)
})

test('unsupported envelopes, malformed JSON, invalid types, duplicate IDs and broken relationships are rejected', () => {
  assert.throws(() => parseBackup('{not JSON'), /not valid JSON/)
  const invalid = [
    [backup => { backup.format = 'other' }, /not a No-Te/],
    [backup => { backup.backupVersion = 99 }, /newer backup format/],
    [backup => { backup.backupVersion = 0 }, /not supported/],
    [backup => { backup.schemaVersion = 99 }, /newer data schema/],
    [backup => { backup.schemaVersion = -1 }, /not supported/],
    [backup => { backup.exportedAt = 'yesterday' }, /ISO/],
    [backup => { backup.data.projects = {} }, /array/],
    [backup => { backup.data.organization.tags = null }, /array/],
    [backup => { backup.data.projects[0].id = ' invalid id ' }, /invalid ID/],
    [backup => { backup.data.projects.push(backup.data.projects[0]) }, /duplicate IDs/],
    [backup => { backup.data.projects[1].tasks.push(backup.data.projects[0].tasks[0]) }, /duplicate IDs/],
    [backup => { backup.data.notes.push(backup.data.notes[0]) }, /duplicate IDs/],
    [backup => { backup.data.notes[0].projectId = 'missing' }, /does not exist/],
    [backup => { backup.data.notes[0].folderId = 'missing' }, /does not exist/],
    [backup => { backup.data.notes[0].projectId = backup.data.projects[1].id }, /different project/],
    [backup => { backup.data.projects[0].tasks[0].tagIds = ['missing'] }, /does not exist/],
    [backup => { backup.data.projects[0].tasks[0].status = 'unknown' }, /status/],
    [backup => { backup.data.projects[0].tasks[0].linkedNoteIds = [3] }, /invalid ID/],
    [backup => { backup.data.projects[0].tasks[0].linkedNoteIds.push(backup.data.notes[0].id) }, /duplicate references/],
    [backup => { backup.data.organization.folders[0].parentFolderId = backup.data.organization.folders[0].id }, /circular/],
    [backup => { backup.data.organization.tags[0].color = 'javascript:bad' }, /palette/],
    [backup => { backup.data.unsupportedCollection = [] }, /unsupported data collection/],
  ]
  for (const [mutate, pattern] of invalid) {
    const fixture = backupFixture()
    mutate(fixture.backup)
    assert.throws(() => validateBackup(fixture.backup), pattern)
  }
  const polluted = JSON.stringify(backupFixture().backup).replace('"data":{', '"data":{"__proto__":{"polluted":true},')
  assert.throws(() => parseBackup(polluted), /unsafe object property/)
  assert.equal({}.polluted, undefined)
})

test('rich-text validation checks schema structure and link safety without treating plain text as HTML', () => {
  const invalidContent = [
    { type: 'doc', content: [{ type: 'html', attrs: { html: '<script>alert(1)</script>' } }] },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bad link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
    { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: 'yes' }, content: [{ type: 'paragraph' }] }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 42 }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'unknown', marks: [{ type: 'not-supported' }] }] }] },
    { type: 'doc', content: { type: 'paragraph' } },
  ]
  for (const content of invalidContent) {
    const fixture = backupFixture()
    fixture.backup.data.notes[0].content = content
    assert.throws(() => validateBackup(fixture.backup))
  }
  const fixture = backupFixture()
  assert.deepEqual(validateBackup(fixture.backup).backup.data.notes[0].content, fixture.note.content)
})

test('schema 0 migrates explicitly; existing records without additive fields get defaults and inactive note IDs are disclosed', () => {
  const fixture = backupFixture()
  const backup = structuredClone(fixture.backup)
  backup.schemaVersion = 0
  backup.data.folders = backup.data.organization.folders
  backup.data.tags = backup.data.organization.tags
  delete backup.data.organization
  const task = backup.data.projects[0].tasks[0]
  delete task.tagIds; delete task.implementationNotes; delete task.createdAt; delete task.updatedAt
  delete backup.data.notes[0].folderId; delete backup.data.notes[0].tagIds
  task.linkedNoteIds.push('deleted-note-id')
  const original = JSON.stringify(backup)
  const result = validateBackup(backup)
  assert.equal(result.sourceSchemaVersion, 0)
  assert.equal(result.backup.schemaVersion, 1)
  assert.equal(result.backup.data.projects[0].tasks[0].createdAt, null)
  assert.equal(result.backup.data.projects[0].tasks[0].implementationNotes, '')
  assert.deepEqual(result.backup.data.notes[0].tagIds, [])
  assert.equal(result.backup.data.notes[0].folderId, null)
  assert.deepEqual(result.backup.data.projects[0].tasks[0].linkedNoteIds, task.linkedNoteIds)
  assert.ok(result.warnings.some(warning => warning.includes('inactive')))
  assert.equal(JSON.stringify(backup), original)
  const storage = memoryStorage()
  assert.equal(restoreBackup(backup, { storage }).ok, true)
  assert.equal(JSON.parse(storage.inspect(STORAGE_KEY))[0].tasks[0].createdAt, null)
  assert.equal(JSON.parse(storage.inspect(NOTES_STORAGE_KEY))[0].folderId, null)
})

test('confirmed replacement uses existing readers/writers and verifies complete data without changing unrelated keys', () => {
  const storage = memoryStorage()
  const original = backupFixture('Current')
  const imported = backupFixture('Imported')
  seedBackupData(storage, original.data)
  storage.setItem('auth.session', 'keep unrelated data')
  let prepared = 0
  const result = restoreBackup(imported.backup, { storage, beforeReplace: () => { prepared++ } })
  assert.equal(result.ok, true)
  assert.equal(prepared, 1)
  assert.deepEqual(JSON.parse(storage.inspect(STORAGE_KEY)), imported.data.projects)
  assert.deepEqual(JSON.parse(storage.inspect(NOTES_STORAGE_KEY)), imported.data.notes)
  assert.deepEqual(JSON.parse(storage.inspect(ORGANIZATION_KEY)), imported.data.organization)
  assert.equal(storage.inspect('auth.session'), 'keep unrelated data')
  assert.equal(storage.inspect(RECOVERY_KEY), null)
  assert.equal(storage.inspect(PREFLIGHT_KEY), null)
  assert.ok(storage.inspect(DATA_REVISION_KEY))
  assert.equal(createBackup({ storage }).counts.tasks, 2)
})

test('validation failure and preparation refusal never write snapshots or replacement data', () => {
  const storage = memoryStorage()
  const original = backupFixture()
  seedBackupData(storage, original.data)
  const writes = storage.writes.length
  const invalid = structuredClone(original.backup)
  invalid.backupVersion = 100
  assert.throws(() => restoreBackup(invalid, { storage, beforeReplace: () => { throw new Error('must not run') } }), /newer backup/)
  assert.throws(() => restoreBackup(original.backup, { storage, beforeReplace: () => false }), /Current edits/)
  assert.equal(storage.writes.length, writes)
})

test('recovery snapshot and storage preflight quota failures stop before any live replacement', () => {
  for (const failingKey of [RECOVERY_KEY, PREFLIGHT_KEY]) {
    const storage = memoryStorage()
    seedBackupData(storage, backupFixture('Current').data)
    const original = rawData(storage)
    const writes = storage.writes.length
    storage.beforeWrite = key => { if (key === failingKey) throw quota() }
    assert.throws(() => restoreBackup(backupFixture('Import').backup, { storage }), error => {
      assert.equal(error.rollbackAttempted, false)
      assert.match(error.message, /not replaced/)
      return true
    })
    assert.deepEqual(rawData(storage), original)
    assert.equal(storage.writes.slice(writes).some(([key]) => USER_DATA_KEYS.includes(key)), false)
    assert.equal(storage.inspect(RECOVERY_KEY), null)
    assert.equal(storage.inspect(PREFLIGHT_KEY), null)
  }
})

test('partial write, verification and final cleanup failures all report failed restores and verified rollback', () => {
  for (const mode of ['write', 'verification', 'cleanup']) {
    const storage = memoryStorage()
    seedBackupData(storage, backupFixture('Current').data)
    const original = rawData(storage)
    const imported = backupFixture('Import')
    let failed = false
    if (mode === 'write') storage.beforeWrite = key => { if (key === NOTES_STORAGE_KEY && !failed) { failed = true; throw quota() } }
    if (mode === 'verification') storage.beforeRead = (key, entries) => {
      if (key === ORGANIZATION_KEY && !failed && entries.get(key) === JSON.stringify(imported.data.organization)) { failed = true; return '{}' }
    }
    if (mode === 'cleanup') storage.beforeRemove = key => { if (key === RECOVERY_KEY && !failed) { failed = true; throw new Error('Cleanup denied') } }
    assert.throws(() => restoreBackup(imported.backup, { storage }), error => {
      assert.equal(error.rollbackAttempted, true)
      assert.equal(error.rollbackSucceeded, true)
      assert.match(error.message, /Rollback succeeded/)
      return true
    })
    assert.equal(failed, true)
    assert.deepEqual(rawData(storage), original)
    assert.equal(storage.inspect(RECOVERY_KEY), null)
  }
})

test('a failed rollback retains recovery, blocks writers/exports and supports explicit retry recovery', () => {
  const storage = memoryStorage()
  seedBackupData(storage, backupFixture('Current').data)
  const original = rawData(storage)
  const imported = backupFixture('Import')
  storage.beforeWrite = (key, value) => {
    if (key === NOTES_STORAGE_KEY || (key === STORAGE_KEY && value === original[0])) throw quota()
  }
  assert.throws(() => restoreBackup(imported.backup, { storage }), error => {
    assert.equal(error.rollbackSucceeded, false)
    assert.equal(error.recoveryRetained, true)
    return true
  })
  assert.equal(getRecoveryState(storage).pending, true)
  assert.equal(getRecoveryState(storage).valid, true)
  assert.throws(() => createBackup({ storage }), /recovery/)
  assert.throws(() => saveProjects(imported.data.projects, storage), /restore needs recovery/)
  assert.throws(() => restoreBackup(imported.backup, { storage }), /unfinished restore/)
  storage.beforeWrite = null
  assert.equal(recoverPreviousData({ storage }).ok, true)
  assert.deepEqual(rawData(storage), original)
  assert.equal(getRecoveryState(storage).pending, false)
})

test('retired debounce callbacks and other stale sessions cannot overwrite a replacement, even after its journal is removed', () => {
  const storage = memoryStorage()
  const original = backupFixture('Current')
  seedBackupData(storage, original.data)
  const timers = []
  const currentStore = createNotesStore({ storage, schedule: callback => { timers.push(callback); return callback }, cancel: () => {} })
  const otherTabStore = createNotesStore({ storage, schedule: callback => callback, cancel: () => {} })
  currentStore.update(original.note.id, { title: 'Draft saved into recovery first' })
  otherTabStore.update(original.note.id, { title: 'Stale tab draft' })
  const imported = backupFixture('Import')
  restoreBackup(imported.backup, { storage, beforeReplace: () => { assert.equal(currentStore.flush(), true); currentStore.retire() } })
  timers.forEach(callback => callback())
  assert.equal(currentStore.update(original.note.id, { title: 'Must not save' }), false)
  assert.equal(currentStore.flush(), true)
  assert.equal(otherTabStore.flush(), false)
  assert.throws(() => saveProjects(original.data.projects, storage, null), /another session/)
  assert.deepEqual(JSON.parse(storage.inspect(NOTES_STORAGE_KEY)), imported.data.notes)
  const freshStore = createNotesStore({ storage, schedule: callback => callback, cancel: () => {} })
  assert.equal(freshStore.update(imported.note.id, { title: 'Fresh edits work' }), true)
  assert.equal(freshStore.flush(), true)
  assert.equal(JSON.parse(storage.inspect(NOTES_STORAGE_KEY))[0].title, 'Fresh edits work')
})

test('recovery reports verified originals separately from a failed journal cleanup', () => {
  const storage = memoryStorage()
  seedBackupData(storage, backupFixture('Current').data)
  const original = rawData(storage)
  storage.beforeWrite = (key, value) => { if (key === NOTES_STORAGE_KEY || (key === STORAGE_KEY && value === original[0])) throw quota() }
  assert.throws(() => restoreBackup(backupFixture('Import').backup, { storage }))
  storage.beforeWrite = null
  storage.beforeRemove = key => { if (key === RECOVERY_KEY) throw new Error('Cannot clear recovery') }
  assert.throws(() => recoverPreviousData({ storage }), error => {
    assert.equal(error.rollbackSucceeded, true)
    assert.equal(error.recoveryRetained, true)
    assert.match(error.message, /restored and verified/)
    return true
  })
  assert.deepEqual(rawData(storage), original)
  storage.beforeRemove = null
  assert.equal(recoverPreviousData({ storage }).ok, true)
})

test('recovery preserves exact original raw values, including missing keys and previously unreadable data', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, '{bad old data')
  const original = rawData(storage)
  let failed = false
  storage.beforeWrite = key => { if (key === NOTES_STORAGE_KEY && !failed) { failed = true; throw quota() } }
  assert.throws(() => restoreBackup(backupFixture('Import').backup, { storage }), error => error.rollbackSucceeded === true)
  assert.deepEqual(rawData(storage), original)
  storage.beforeWrite = null
  assert.equal(restoreBackup(backupFixture('Repair').backup, { storage }).ok, true)
  assert.equal(createBackup({ storage }).backup.data.projects[0].name, 'Repair project')
})
