import { useState } from 'react'
import { Search } from 'lucide-react'
import Modal from './Modal'
import { noteText, selectNotes } from '../data/notes'

export default function NoteLinkPicker({ notes, projects, projectId, linkedIds, onLink, onClose, error }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(projectId)
  const [selected, setSelected] = useState([])
  const visible = selectNotes(notes, { query, projectId: filter, sort: 'title' })
  return <Modal title="Link documentation" className="note-link-picker" onClose={onClose} error={error}>
    <label className="notes-search"><Search size={16} aria-hidden="true" /><input autoFocus type="search" aria-label="Search notes to link" placeholder="Search titles and note content…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <label className="link-filter">Show notes from<select aria-label="Filter notes to link" value={filter ?? ''} onChange={event => setFilter(event.target.value || null)}><option value="all">All notes</option><option value="">Unassigned</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <div className="link-picker-results">{visible.length ? visible.map(note => {
      const linked = linkedIds.includes(note.id)
      return <label key={note.id} className={`link-picker-note${linked ? ' already-linked' : ''}`}><input type="checkbox" aria-label={`Link ${note.title || 'Untitled note'}`} disabled={linked} checked={linked || selected.includes(note.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, note.id] : ids.filter(id => id !== note.id))} /><span><strong>{note.title || 'Untitled note'}</strong><span className="link-note-preview">{noteText(note.content).replace(/\s+/g, ' ').slice(0, 100) || 'No content yet.'}</span><small>{linked ? 'Already linked · ' : ''}{projects.find(project => project.id === note.projectId)?.name || 'Unassigned'}</small></span></label>
    }) : <p className="column-empty">No matching notes. Try another project or search.</p>}</div>
    <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="button" disabled={!selected.length} onClick={() => onLink(selected)}>Link {selected.length || ''} {selected.length === 1 ? 'note' : 'notes'}</button></div>
  </Modal>
}
