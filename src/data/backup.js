import { STORAGE_KEY, loadProjects, saveProjects } from './projects.js'
import { NOTES_STORAGE_KEY, loadNotes, saveNotes } from './notes.js'
import { ORGANIZATION_KEY, loadOrganization, saveOrganization } from './organization.js'
import { DATA_REVISION_KEY, RECOVERY_KEY, PREFLIGHT_KEY, USER_DATA_KEYS, readRecoveryJournal, withRestoreWrites } from './storageSafety.js'
import { BACKUP_FORMAT, BACKUP_VERSION, SCHEMA_VERSION, MAX_BACKUP_BYTES, validateBackup, parseBackup } from './backupValidation.js'

export { MAX_BACKUP_BYTES, parseBackup }

export function backupFilename(date = new Date()) {
  return `no-te-backup-${date.toISOString().slice(0, 16).replace('T', '-').replace(':', '-')}.json`
}

function rawSnapshot(storage) { return Object.fromEntries(USER_DATA_KEYS.map(key => [key, storage.getItem(key)])) }
function equalRaw(storage, snapshot) { return USER_DATA_KEYS.every(key => storage.getItem(key) === snapshot[key]) }
function decodeSnapshot(raw) {
  return {
    projects: raw[STORAGE_KEY] === null ? [] : JSON.parse(raw[STORAGE_KEY]),
    notes: raw[NOTES_STORAGE_KEY] === null ? [] : JSON.parse(raw[NOTES_STORAGE_KEY]),
    organization: raw[ORGANIZATION_KEY] === null ? { version: 1, folders: [], tags: [] } : JSON.parse(raw[ORGANIZATION_KEY]),
  }
}

export function createBackup({ storage = localStorage, now = new Date() } = {}) {
  if (storage.getItem(RECOVERY_KEY) !== null) throw new Error('Complete recovery in Settings before exporting potentially partial data.')
  const original = rawSnapshot(storage)
  let data
  try { data = decodeSnapshot(original) } catch { throw new Error('Existing application data could not be read as JSON. It has not been changed.') }
  const result = validateBackup({ format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data })
  if (!equalRaw(storage, original)) throw new Error('Application data changed while exporting. Please try again.')
  return { ...result, filename: backupFilename(now) }
}

export function downloadBackup(result) {
  const blob = new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.filename
    anchor.hidden = true
    document.body.append(anchor)
    try { anchor.click() } finally { anchor.remove() }
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0) }
}

export async function readBackupFile(file, { maxBytes = MAX_BACKUP_BYTES } = {}) {
  if (!file || typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0) throw new Error('Choose a JSON backup file.')
  if (file.size > maxBytes) throw new Error(`The backup exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB file size limit.`)
  if (file.name && !/\.json$/i.test(file.name)) throw new Error('Choose a .json backup file.')
  let content
  try {
    content = typeof file.text === 'function' ? await file.text() : await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('The selected file could not be read.'))
      reader.onabort = () => reject(new Error('File reading was cancelled.'))
      reader.readAsText(file)
    })
  } catch { throw new Error('The selected backup file could not be read. Please select it again.') }
  return parseBackup(content, { maxBytes })
}

export class RestoreError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'RestoreError'; Object.assign(this, details) }
}

function describeFailure(error) {
  if (['QuotaExceededError', 'SecurityError'].includes(error.name)) return 'Browser storage is full or unavailable.'
  return error.message || 'Browser storage could not complete the operation.'
}
function restoreOriginals(storage, originals) {
  for (const key of USER_DATA_KEYS) {
    try {
      if (storage.getItem(key) === originals[key]) continue
      if (originals[key] === null) storage.removeItem(key)
      else storage.setItem(key, originals[key])
    } catch { /* Attempt every key, then verify the complete original snapshot. */ }
  }
  try { return equalRaw(storage, originals) } catch { return false }
}
function cleanup(storage, key) {
  try { storage.removeItem(key); return storage.getItem(key) === null } catch { return false }
}
function advanceRevision(storage) {
  const revision = crypto.randomUUID()
  storage.setItem(DATA_REVISION_KEY, revision)
  if (storage.getItem(DATA_REVISION_KEY) !== revision) throw new Error('The new storage revision could not be verified.')
}

export function restoreBackup(input, { storage = localStorage, beforeReplace = () => {} } = {}) {
  // Full validation precedes all side effects, including flushing/retiring stores.
  const validated = validateBackup(input)
  if (storage.getItem(RECOVERY_KEY) !== null) throw new RestoreError('An unfinished restore has a recovery snapshot. Recover previous data before restoring another backup.')
  if (beforeReplace() === false) throw new RestoreError('Current edits could not be saved. Retry saving them before restoring a backup.')
  let originals
  let journalRaw
  let journalAttempted = false
  let liveWritesStarted = false
  let phase = 'recovery snapshot creation'
  try {
    originals = rawSnapshot(storage)
    if (!equalRaw(storage, originals)) throw new Error('Current data changed in another tab. Close other No-Te tabs and retry.')
    const journal = { format: 'no-te-recovery', version: 1, transactionId: crypto.randomUUID(), createdAt: new Date().toISOString(), originals }
    journalRaw = JSON.stringify(journal)
    if (storage.getItem(RECOVERY_KEY) !== null) throw new Error('Another restore is already in progress.')
    journalAttempted = true
    storage.setItem(RECOVERY_KEY, journalRaw)
    if (storage.getItem(RECOVERY_KEY) !== journalRaw) throw new Error('The recovery snapshot could not be verified.')
    if (!equalRaw(storage, originals)) throw new Error('Current data changed before replacement. Close other No-Te tabs and retry.')
    // Fence off stale in-memory stores in this and other tabs before live writes.
    advanceRevision(storage)
    phase = 'storage preflight'
    const staged = JSON.stringify(validated.backup.data)
    storage.setItem(PREFLIGHT_KEY, staged)
    if (storage.getItem(PREFLIGHT_KEY) !== staged) throw new Error('Storage preflight could not be verified.')
    if (!cleanup(storage, PREFLIGHT_KEY)) throw new Error('Temporary storage could not be released.')
    return withRestoreWrites(storage, () => {
      const ensureOwnership = () => { if (storage.getItem(RECOVERY_KEY) !== journalRaw) throw new Error('Restore ownership changed. Close other No-Te tabs before recovery.') }
      phase = 'replacement'
      const { projects, notes, organization } = validated.backup.data
      ensureOwnership()
      liveWritesStarted = true
      saveProjects(projects, storage)
      ensureOwnership()
      saveNotes(notes, storage)
      ensureOwnership()
      saveOrganization(organization, storage)
      phase = 'verification'
      const expected = { [STORAGE_KEY]: JSON.stringify(projects), [NOTES_STORAGE_KEY]: JSON.stringify(notes), [ORGANIZATION_KEY]: JSON.stringify(organization) }
      if (!equalRaw(storage, expected)) throw new Error('Restored data did not match the validated backup.')
      // Exercise the real readers and validate relationships again after storage.
      validateBackup({ ...validated.backup, data: { projects: loadProjects(storage), notes: loadNotes(storage), organization: loadOrganization(storage) } })
      ensureOwnership()
      phase = 'recovery snapshot cleanup'
      if (!cleanup(storage, RECOVERY_KEY)) throw new Error('The recovery snapshot could not be cleared.')
      return { ok: true, message: 'Backup restored successfully. Projects, tasks, notes, folders, and tags were verified.', counts: validated.counts }
    })
  } catch (error) {
    let rollbackSucceeded = false
    let recoveryRetained = false
    let ownershipLost = false
    if (journalAttempted) {
      try { const current = storage.getItem(RECOVERY_KEY); ownershipLost = current !== null && current !== journalRaw } catch { ownershipLost = true }
    }
    if (liveWritesStarted && originals && !ownershipLost) {
      // Keep a durable original snapshot if rollback itself cannot complete.
      try { if (storage.getItem(RECOVERY_KEY) === null) storage.setItem(RECOVERY_KEY, journalRaw) } catch { /* Still attempt the in-memory recovery snapshot. */ }
      rollbackSucceeded = withRestoreWrites(storage, () => restoreOriginals(storage, originals))
    }
    if (journalAttempted && !ownershipLost) {
      cleanup(storage, PREFLIGHT_KEY)
      if (!liveWritesStarted || rollbackSucceeded) cleanup(storage, RECOVERY_KEY)
    }
    try { recoveryRetained = storage.getItem(RECOVERY_KEY) !== null } catch { recoveryRetained = true }
    const recoveryMessage = liveWritesStarted
      ? rollbackSucceeded ? 'Rollback succeeded; previous local data was restored.' : 'Rollback could not be verified. Editing must remain paused; use recovery in Settings.'
      : 'Existing application data was not replaced.'
    throw new RestoreError(`Restore failed during ${phase}. ${describeFailure(error)} ${recoveryMessage}${recoveryRetained ? ' A recovery snapshot remains; resolve it in Settings before editing.' : ''}`, { phase, rollbackAttempted: liveWritesStarted, rollbackSucceeded, recoveryRetained })
  }
}

export function recoverPreviousData({ storage = localStorage, beforeReplace = () => {} } = {}) {
  const recovery = readRecoveryJournal(storage)
  if (!recovery) throw new RestoreError('No unfinished restore recovery snapshot was found.')
  if (beforeReplace() === false) throw new RestoreError('Recovery could not prepare the current session.')
  let restored = false
  try {
    if (storage.getItem(RECOVERY_KEY) !== recovery.raw) throw new Error('The recovery snapshot changed in another tab. Close other No-Te tabs and retry.')
    advanceRevision(storage)
    restored = withRestoreWrites(storage, () => restoreOriginals(storage, recovery.journal.originals))
    if (!restored) throw new Error('Some original storage values could not be restored or read back.')
    if (storage.getItem(RECOVERY_KEY) !== recovery.raw) throw new Error('Recovery ownership changed. Close other No-Te tabs and check Settings.')
    if (!cleanup(storage, PREFLIGHT_KEY) || !cleanup(storage, RECOVERY_KEY)) throw new Error('Recovery data was restored but the recovery lock could not be cleared.')
    return { ok: true, message: 'Previous local data recovered and verified. The interrupted replacement was not kept.' }
  } catch (error) {
    let recoveryRetained = true
    try { recoveryRetained = storage.getItem(RECOVERY_KEY) !== null } catch { /* Storage remains unreadable. */ }
    throw new RestoreError(`Recovery did not complete. ${describeFailure(error)} ${restored ? 'Previous data was restored and verified, but cleanup did not finish.' : 'Previous data could not be fully verified.'} ${recoveryRetained ? 'A recovery snapshot remains or could not be checked; keep editing paused and retry after fixing browser storage.' : 'The recovery lock is no longer present; check current data after storage access is restored.'}`, { rollbackAttempted: true, rollbackSucceeded: restored, recoveryRetained })
  }
}
