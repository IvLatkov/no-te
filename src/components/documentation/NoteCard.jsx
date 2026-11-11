import { noteText } from '../../data/notes'

export default function NoteCard({ note, selected, onSelect }) {
  const preview = noteText(note.content).replace(/\s+/g, ' ').trim()
  return <button type="button" className={`note-card${selected ? ' is-selected' : ''}`} onClick={onSelect} aria-current={selected ? 'true' : undefined}>
    <span className="note-card-title">{note.title || 'Untitled note'}</span>
    <span className="note-preview">{preview || 'An unwritten page. Make it yours.'}</span>
    <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
  </button>
}
