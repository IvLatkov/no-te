import { noteText } from '../../data/notes'
import { useRef } from 'react'
import { GripVertical } from 'lucide-react'

export default function NoteCard({ note, selected, onSelect, noteDrag, readOnly }) {
  const preview = noteText(note.content).replace(/\s+/g, ' ').trim()
  const dragged = useRef(false)
  const draggable = !!noteDrag?.enabled && !readOnly && !noteDrag.movingId
  return (
    <button
      type="button"
      className={`note-card${selected ? ' is-selected' : ''}${noteDrag?.draggingId === note.id ? ' is-dragging' : ''}${noteDrag?.movingId === note.id ? ' is-moving' : ''}`}
      draggable={draggable}
      aria-busy={noteDrag?.movingId === note.id || undefined}
      onPointerDown={() => {
        dragged.current = false
      }}
      onClick={(event) => {
        if (!dragged.current || event.detail === 0) onSelect()
      }}
      onDragStart={(event) => {
        dragged.current = true
        noteDrag?.startDrag(event, note.id)
      }}
      onDragEnd={() => noteDrag?.endDrag()}
      aria-current={selected ? 'true' : undefined}
    >
      {draggable && <GripVertical className="note-drag-handle" size={14} aria-hidden="true" />}
      <span className="note-card-title">{note.title || 'Untitled note'}</span>
      <span className="note-preview">{preview || 'An unwritten page. Make it yours.'}</span>
      <time dateTime={note.updatedAt}>
        {new Date(note.updatedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </time>
    </button>
  )
}
