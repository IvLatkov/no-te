import { useState } from 'react'
import Modal from '../Modal'
import ProjectNoteSelector from './ProjectNoteSelector'
import FolderSelector from './FolderSelector'

export default function NoteModal({
  projects,
  projectId: initialProjectId,
  onSave,
  onClose,
  error,
  lockProject = false,
  folders = [],
  initialFolderId = null,
  busy = false,
}) {
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId)
  const [folderId, setFolderId] = useState(initialFolderId)
  return (
    <Modal
      title="New note"
      onClose={() => {
        if (!busy) onClose()
      }}
      error={error}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          onSave({ title, projectId, folderId })
        }}
      >
        <label htmlFor="new-note-title">Note title</label>
        <input
          autoFocus
          id="new-note-title"
          disabled={busy}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder="Untitled note"
        />
        <ProjectNoteSelector
          projects={projects}
          value={projectId}
          onChange={setProjectId}
          disabled={lockProject || busy}
        />
        <FolderSelector
          disabled={busy}
          folders={folders}
          projectId={projectId}
          value={folderId}
          onChange={setFolderId}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create note'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
