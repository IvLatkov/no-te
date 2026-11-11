import { useState } from 'react'
import Modal from '../Modal'
import ProjectNoteSelector from './ProjectNoteSelector'

export default function NoteModal({ projects, projectId: initialProjectId, onSave, onClose, error, lockProject = false }) {
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId)
  return <Modal title="New note" onClose={onClose} error={error}><form onSubmit={event => { event.preventDefault(); onSave({ title, projectId }) }}>
    <label htmlFor="new-note-title">Note title</label><input autoFocus id="new-note-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Untitled note" />
    <ProjectNoteSelector projects={projects} value={projectId} onChange={setProjectId} disabled={lockProject} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Create note</button></div>
  </form></Modal>
}
