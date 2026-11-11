import { ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react'

export default function TaskCard({ task, onEdit, onDelete, onMove, onDragStart, onDragEnd, readOnly }) {
  const done = task.status === 'done'
  return (
    <article className={`task-card${done ? ' is-done' : ''}`} onClick={event => { if (!event.target.closest('button')) onEdit() }} draggable={!readOnly} onDragStart={event => { if (event.target.closest('button:not(.task-card-open)')) { event.preventDefault(); return }; onDragStart(event, task.id) }} onDragEnd={onDragEnd}>
      <button type="button" className="task-card-open" aria-label={`Open task ${task.title}`} onClick={onEdit}>
        <h3>{task.title}</h3>
        {task.description && <p>{task.description}</p>}
      </button>
      <div className="task-actions"><button type="button" className="move-button" disabled={readOnly} onClick={() => onMove(done ? 'todo' : 'done')} aria-label={`Move ${task.title} to ${done ? 'To Do' : 'Done'}`}>{done ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}{done ? 'To Do' : 'Done'}</button><div className="card-actions"><button type="button" disabled={readOnly} className="icon-button" aria-label={`Edit task ${task.title}`} onClick={onEdit}><Pencil size={14} /></button><button type="button" disabled={readOnly} className="icon-button delete-action" aria-label={`Delete task ${task.title}`} onClick={onDelete}><Trash2 size={14} /></button></div></div>
    </article>
  )
}
