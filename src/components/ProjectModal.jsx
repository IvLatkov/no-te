import { useState } from 'react'
import Modal from './Modal'

export default function ProjectModal({ project, onSave, onClose, error, busy = false }) {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  return (
    <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose} error={error}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && name.trim()) onSave({ name: name.trim(), description: description.trim() })
        }}
      >
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          disabled={busy}
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Give your project a name"
        />
        <label htmlFor="project-description">
          Description <span>(optional)</span>
        </label>
        <textarea
          id="project-description"
          disabled={busy}
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What are you working on?"
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : project ? 'Save project' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
