export const RECOVERY_KEY = 'no-te.restore-recovery.v1'
export const PREFLIGHT_KEY = 'no-te.restore-preflight.v1'
export const DATA_REVISION_KEY = 'no-te.data-revision.v1'
export const USER_DATA_KEYS = ['no-te.projects.v1', 'no-te.notes.v1', 'no-te.organization.v1']
const transactionWriters = new WeakSet()

export function readDataRevision(storage = localStorage) { return storage.getItem(DATA_REVISION_KEY) }

export function assertStorageWritable(storage = localStorage, expectedRevision) {
  if (transactionWriters.has(storage)) return
  if (storage.getItem(RECOVERY_KEY) !== null) throw new Error('A restore needs recovery. Open Settings before changing data.')
  if (expectedRevision !== undefined && readDataRevision(storage) !== expectedRevision) {
    throw new Error('Data changed in another session. Load current data before saving these edits.')
  }
}

// Only the synchronous restore/rollback operation may write through the journal lock.
export function withRestoreWrites(storage, operation) {
  transactionWriters.add(storage)
  try { return operation() } finally { transactionWriters.delete(storage) }
}

export function readRecoveryJournal(storage = localStorage) {
  const raw = storage.getItem(RECOVERY_KEY)
  if (raw === null) return null
  let journal
  try { journal = JSON.parse(raw) } catch { throw new Error('The recovery snapshot is invalid. It has been preserved.') }
  if (journal?.format !== 'no-te-recovery' || journal.version !== 1 || typeof journal.transactionId !== 'string' ||
    !Number.isFinite(Date.parse(journal.createdAt)) || !journal.originals || typeof journal.originals !== 'object' ||
    Object.keys(journal.originals).length !== USER_DATA_KEYS.length || !USER_DATA_KEYS.every(key => Object.hasOwn(journal.originals, key) && (journal.originals[key] === null || typeof journal.originals[key] === 'string'))) {
    throw new Error('The recovery snapshot is unsupported or invalid. It has been preserved.')
  }
  return { journal, raw }
}

export function getRecoveryState(storage = localStorage) {
  try {
    const pending = readRecoveryJournal(storage)
    return pending ? { pending: true, valid: true, createdAt: pending.journal.createdAt, error: '' } : { pending: false, valid: false, error: '' }
  } catch (error) {
    return { pending: true, valid: false, error: error.message || 'Storage recovery state could not be read. Check browser storage access.' }
  }
}
