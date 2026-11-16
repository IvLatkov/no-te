import { useEffect, useRef, useState } from 'react'
import { Download, Upload, ShieldCheck, RotateCcw, Database } from 'lucide-react'
import Modal from './Modal'
import AppearanceSettings from './AppearanceSettings'
import {
  createBackup,
  downloadBackup,
  readBackupFile,
  restoreBackup,
  recoverPreviousData,
  MAX_BACKUP_BYTES,
} from '../data/backup'
import '../settings.css'

function dateLabel(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SettingsPage({
  recovery,
  stale,
  feedback: initialFeedback,
  onReplaceData,
  onLoadCurrentData,
}) {
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [feedback, setFeedback] = useState(initialFeedback || null)
  const [error, setError] = useState('')
  const [exportWarnings, setExportWarnings] = useState([])
  const input = useRef(null)
  const generation = useRef(0)
  const mounted = useRef(true)
  const locked = recovery.pending || stale
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [])

  function exportData() {
    setError('')
    setFeedback(null)
    setBusy('exporting')
    try {
      const result = createBackup()
      downloadBackup(result)
      setExportWarnings(result.warnings)
      setFeedback({ kind: 'success', message: `Backup prepared for download: ${result.filename}` })
    } catch (failure) {
      setError(`Backup could not be generated. ${failure.message}`)
    } finally {
      setBusy('')
    }
  }
  async function selectFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const token = ++generation.current
    setPreview(null)
    setError('')
    setFeedback(null)
    setBusy('reading')
    try {
      const result = await readBackupFile(file)
      if (mounted.current && token === generation.current) setPreview(result)
    } catch (failure) {
      if (mounted.current && token === generation.current) setError(failure.message)
    } finally {
      if (mounted.current && token === generation.current) setBusy('')
    }
  }
  function discardPreview() {
    generation.current += 1
    setPreview(null)
    setError('')
    setConfirmation(null)
    setFeedback({
      kind: 'info',
      message: 'Import preview discarded. Existing data was not changed.',
    })
  }
  function replaceData() {
    setError('')
    setBusy(confirmation === 'recover' ? 'recovering' : 'restoring')
    const recovering = confirmation === 'recover'
    const result = onReplaceData(
      (prepare) =>
        recovering
          ? recoverPreviousData({ beforeReplace: prepare })
          : restoreBackup(preview.backup, { beforeReplace: prepare }),
      { recovering },
    )
    if (!result.ok) setError(result.message)
    setBusy('')
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <h1 id="settings-title">Settings</h1>
          <p>Your workspace, kept in your hands.</p>
        </div>
      </div>
      <AppearanceSettings />
      {feedback && (
        <p
          className={`data-feedback ${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
      {error && (
        <p className="storage-error" role="alert">
          {error}
        </p>
      )}
      {stale && !recovery.pending && (
        <div className="data-recovery">
          <h2>Local data changed in another tab</h2>
          <p>
            Writes from this tab are paused so older state cannot overwrite a restored backup. Load
            current data to continue. Unsaved drafts in this tab will not be applied.
          </p>
          <button type="button" className="button primary" onClick={onLoadCurrentData}>
            Load current data
          </button>
        </div>
      )}
      {recovery.pending && (
        <div className="data-recovery">
          <h2>A restore needs recovery</h2>
          <p>
            {recovery.error ||
              `A restore did not finish${recovery.createdAt ? ` (${dateLabel(recovery.createdAt)})` : ''}. Editing is paused to protect the recovery snapshot.`}
          </p>
          {recovery.valid ? (
            <>
              <p>Recover the previous local data before editing or starting another import.</p>
              <button
                type="button"
                className="button primary"
                disabled={Boolean(busy)}
                onClick={() => {
                  setError('')
                  setConfirmation('recover')
                }}
              >
                <RotateCcw size={16} /> Recover previous data
              </button>
            </>
          ) : (
            <p>
              The unreadable recovery record has been preserved. Automatic replacement is disabled
              until browser storage access or the recovery record is repaired.
            </p>
          )}
        </div>
      )}
      <div className="data-section-heading">
        <Database size={19} />
        <h2>Data Management</h2>
      </div>
      <p className="settings-intro">
        Back up your projects, tasks, notes, folders, tags, and their relationships. Files stay on
        your device.
      </p>
      <div className="data-management-row">
        <div>
          <h3>Export Backup</h3>
          <p>
            Download all supported workspace data as one JSON file. Exporting leaves your live data
            unchanged.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={exportData}
          disabled={Boolean(busy) || locked}
        >
          <Download size={16} /> Export Backup
        </button>
      </div>
      {exportWarnings.length > 0 && (
        <ul className="backup-warnings">
          {exportWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="data-management-row">
        <div>
          <h3>Import Backup</h3>
          <p>
            Select a JSON backup to validate and preview. Nothing is replaced until you explicitly
            confirm.
          </p>
          <small>
            Maximum file size: {MAX_BACKUP_BYTES / 1024 / 1024} MB. Full replacement only.
          </small>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => input.current?.click()}
          disabled={Boolean(busy) || locked}
        >
          <Upload size={16} /> Import Backup
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label="Choose a No-Te backup JSON file"
          hidden
          disabled={Boolean(busy) || locked}
          onChange={selectFile}
        />
      </div>
      {busy === 'reading' && (
        <p className="muted-small" role="status">
          Reading and validating the backup…
        </p>
      )}
      {preview && (
        <section className="backup-preview" aria-labelledby="backup-preview-title">
          <div className="backup-preview-heading">
            <ShieldCheck size={19} />
            <h3 id="backup-preview-title">Backup preview</h3>
          </div>
          <dl className="backup-metadata">
            <div>
              <dt>Created</dt>
              <dd>
                <time dateTime={preview.backup.exportedAt}>
                  {dateLabel(preview.backup.exportedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Backup format</dt>
              <dd>{preview.backup.backupVersion}</dd>
            </div>
            <div>
              <dt>Data schema</dt>
              <dd>
                {preview.sourceSchemaVersion === preview.backup.schemaVersion
                  ? preview.backup.schemaVersion
                  : `${preview.sourceSchemaVersion} → ${preview.backup.schemaVersion}`}
              </dd>
            </div>
          </dl>
          <dl className="backup-counts">
            {Object.entries(preview.counts).map(([name, count]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          {preview.warnings.length > 0 && (
            <ul className="backup-warnings">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <p className="backup-replacement-warning">
            Restoring replaces all current local projects, tasks, notes, folders, and tags. This
            does not merge data. Close other No-Te tabs before restoring.
          </p>
          <div className="backup-preview-actions">
            <button
              type="button"
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={discardPreview}
            >
              Discard preview
            </button>
            <button
              type="button"
              className="button primary"
              disabled={Boolean(busy) || locked}
              onClick={() => {
                setError('')
                setConfirmation('restore')
              }}
            >
              Restore this backup
            </button>
          </div>
        </section>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation === 'recover'
              ? 'Recover previous local data?'
              : 'Replace current local data?'
          }
          onClose={() => {
            if (!busy) {
              setConfirmation(null)
              setError('')
            }
          }}
          error={error}
        >
          <p className="confirmation-message">
            {confirmation === 'recover'
              ? 'This will replace any partially restored data with the recovery snapshot from before the interrupted restore. Keep other No-Te tabs closed.'
              : 'The previewed backup will replace your current workspace on this device. A recovery snapshot will be created first and used for rollback if restoration fails. This is a full replacement, not a merge.'}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              data-autofocus
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setConfirmation(null)
                setError('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={Boolean(busy)}
              onClick={replaceData}
            >
              {busy
                ? 'Working…'
                : confirmation === 'recover'
                  ? 'Recover previous data'
                  : 'Replace local data'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
