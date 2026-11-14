import { useEffect, useRef, useState } from 'react'
import { CLOUD_BACKUP_MAX_BYTES, downloadCloudBackup, exportCloudBackup, parseCloudBackup } from '../data/cloudBackup.js'

export default function CloudBackupSettings({ client, userId, beforeExport, disabled, onBusyChange }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  async function run(operation) {
    if (request.current || disabled) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    setMessage('')
    setPreview(null)
    try { await operation(controller.signal) } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || 'The backup operation failed. Try again.')
    } finally {
      if (!controller.signal.aborted) {
        request.current = null
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }
  const exportData = () => run(async (signal) => {
    setMessage('Saving pending notes…')
    if (beforeExport && !(await beforeExport())) throw new Error('Save your pending notes before exporting. Retry saving in Documentation.')
    const result = await exportCloudBackup(client, userId, { signal, onProgress: setMessage })
    if (signal.aborted) return
    downloadCloudBackup(result)
    setPreview(result)
    setMessage('Cloud backup validated. Download requested; confirm the file was saved by your browser.')
  })
  async function previewFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await run(async (signal) => {
      setMessage('Validating backup…')
      if (file.size > CLOUD_BACKUP_MAX_BYTES) throw new Error('The backup exceeds the 100 MB preview limit.')
      const text = await file.text()
      if (signal.aborted) return
      const result = parseCloudBackup(text)
      setPreview(result)
      setMessage('Backup is valid. Preview only: database import is not supported. No records were changed.')
    })
  }
  return <section aria-labelledby="cloud-backup-heading">
    <div className="data-management-row">
      <div>
        <h2 id="cloud-backup-heading">Cloud backup</h2>
        <p>Download your authorized projects, tasks, full note JSON, folders, tags and links. Pause edits in other tabs while exporting.</p>
        <p>Exports include records visible to your account. Policies may hide data. This is not a database snapshot. Keep the file private.</p>
      </div>
      <button type="button" className="button secondary" disabled={busy || disabled} onClick={exportData}>Export cloud data</button>
    </div>
    <div className="data-management-row">
      <div><h3>Validate a cloud backup</h3><p>Read-only preview, up to 100 MB. Database import is not yet supported.</p></div>
      <input type="file" aria-label="Preview cloud backup" accept=".json,application/json" disabled={busy || disabled} onChange={previewFile} />
    </div>
    <div aria-live="polite" aria-busy={busy}>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="storage-error">{error}</p>}
      {preview && <div><p>Exported {preview.backup.exportedAt} · Format version {preview.backup.version}</p><dl className="backup-counts">{Object.entries(preview.counts).map(([table, count]) => <div key={table}><dt>{table}</dt><dd>{count}</dd></div>)}</dl></div>}
    </div>
  </section>
}
