import { useState } from 'react'
import Modal from '../Modal'
import ProjectNoteSelector from './ProjectNoteSelector'
import { folderDepth } from '../../data/organization'

export default function FolderModal({
  folder,
  parentFolderId: initialParent = null,
  initialProjectId = null,
  folders,
  projects,
  onSave,
  onClose,
  error,
  busy = false,
}) {
  const [name, setName] = useState(folder?.name || '')
  const [parentFolderId, setParent] = useState(folder ? folder.parentFolderId : initialParent)
  const parent = folders.find((item) => item.id === parentFolderId)
  const [projectId, setProject] = useState(folder ? folder.projectId : initialProjectId)
  return (
    <Modal
      title={folder ? 'Rename folder' : 'New folder'}
      onClose={() => {
        if (!busy) onClose()
      }}
      error={error}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          onSave(
            { name, parentFolderId, projectId: parent ? parent.projectId : projectId },
            folder?.id,
          )
        }}
      >
        <label htmlFor="folder-name">Folder name</label>
        <input
          id="folder-name"
          disabled={busy}
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {!folder && (
          <label>
            Parent folder
            <select
              className="organization-select"
              aria-label="Parent folder"
              disabled={busy}
              value={parentFolderId || ''}
              onChange={(event) => setParent(event.target.value || null)}
            >
              <option value="">Top level</option>
              {folders
                .filter((item) => folderDepth(folders, item.id) < 3)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <ProjectNoteSelector
          projects={projects}
          value={parent ? parent.projectId : projectId}
          onChange={setProject}
          disabled={busy || Boolean(parent) || Boolean(folder)}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save folder'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
