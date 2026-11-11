import { useState } from 'react'
import { Check, Plus, FileText, ArrowUpRight, X, Search } from 'lucide-react'
import Modal from './Modal'
import NoteLinkPicker from './NoteLinkPicker'
import NoteModal from './documentation/NoteModal'
import useTaskDraft from '../hooks/useTaskDraft'
import { linkedNotesForTask } from '../data/taskDocumentation'
import TagSelector from './TagSelector'

function timestamp(value) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded (older task)'
}

export default function TaskDetails({ task, project, projects, notes, readOnly, notesReadOnly, error, notesError, onSave, onClose, onOpenNote, onCreateNote, organization }) {
  const { draft, change, save, error: draftError } = useTaskDraft(task, onSave, readOnly)
  const [linking, setLinking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pendingNote, setPendingNote] = useState(null)
  const linked = linkedNotesForTask(draft, notes)
  const formError = draftError || error
  function openNote(id) { if (save()) onOpenNote(id) }
  function createNote(values) {
    if (!save()) return
    const result = onCreateNote(values, pendingNote?.id)
    if (result.note && !result.linked) setPendingNote(result.note)
    if (result.linked) { setCreating(false); setPendingNote(null); onOpenNote(result.note.id) }
  }
  function link(ids) {
    const next = [...new Set([...draft.linkedNoteIds, ...ids.filter(id => notes.some(note => note.id === id))])]
    change({ linkedNoteIds: next })
    if (save()) setLinking(false)
  }
  return <>
    <Modal title="Task details" className="task-details-modal" error={formError} onClose={() => { if (save()) onClose() }}>
      <div className="task-details-meta"><span>{project.name}</span><button type="button" className="icon-button" aria-label="Search No-Te" title="Search No-Te" onClick={() => { if (save()) organization.onSearch() }}><Search size={16} /></button><span className="task-autosave"><Check size={12} />{formError ? 'Changes need attention' : 'Saved automatically'}</span></div>
      <label htmlFor="task-detail-title">Task title</label><input id="task-detail-title" value={draft.title} autoFocus maxLength={200} required disabled={readOnly} onChange={event => change({ title: event.target.value })} />
      <div className="task-status-field"><label htmlFor="task-detail-status">Status</label><select id="task-detail-status" value={draft.status} disabled={readOnly} onChange={event => change({ status: event.target.value })}><option value="todo">To Do</option><option value="done">Done</option></select></div>
      <TagSelector tags={organization.tags} value={draft.tagIds} onChange={tagIds => change({ tagIds })} onManage={organization.onManageTags} disabled={readOnly || organization.readOnly} />
      <label htmlFor="task-detail-description">Description <span>(optional)</span></label><textarea id="task-detail-description" rows={3} maxLength={4000} value={draft.description} disabled={readOnly} onChange={event => change({ description: event.target.value })} placeholder="What needs to be done?" />
      <section className="task-documentation" aria-labelledby="task-documentation-title"><div className="task-section-heading"><h3 id="task-documentation-title">Linked documentation</h3><div className="task-section-actions"><button type="button" className="text-action" disabled={readOnly || notesReadOnly} onClick={() => { if (save()) setLinking(true) }}><Plus size={14} /> Link Note</button><button type="button" className="text-action" disabled={readOnly || notesReadOnly} onClick={() => { if (save()) setCreating(true) }}><Plus size={14} /> Create Note</button></div></div>
        {notesError && <p className="storage-error" role="alert">{notesError}</p>}
        <div className="task-linked-notes">{linked.map(note => <div className="task-linked-note" key={note.id}><button type="button" className="linked-note-open" onClick={() => openNote(note.id)} aria-label={`Open note ${note.title || 'Untitled note'}`}><FileText size={16} /><span>{note.title || 'Untitled note'}</span><ArrowUpRight size={14} /></button><button type="button" className="icon-button" aria-label={`Unlink note ${note.title || 'Untitled note'}`} title="Unlink note" disabled={readOnly} onClick={() => change({ linkedNoteIds: draft.linkedNoteIds.filter(id => id !== note.id) })}><X size={14} /></button></div>)}{!linked.length && <p className="task-section-empty">Link a note to keep useful context close to the task.</p>}</div>
      </section>
      <section className="task-implementation" aria-labelledby="task-implementation-title"><h3 id="task-implementation-title">Implementation Notes</h3><p>Details, decisions, commands, and next steps.</p><label className="visually-hidden" htmlFor="task-implementation">Implementation Notes</label><textarea id="task-implementation" rows={6} value={draft.implementationNotes} disabled={readOnly} onChange={event => change({ implementationNotes: event.target.value })} placeholder="Leave a trail for your future self…" /></section>
      <div className="task-detail-timestamps"><span>Created <time dateTime={task.createdAt || undefined}>{timestamp(task.createdAt)}</time></span><span>Updated <time dateTime={task.updatedAt || undefined}>{timestamp(task.updatedAt)}</time></span></div>
      <div className="modal-actions">{formError && <button type="button" className="button secondary" onClick={save}>Retry save</button>}<button type="button" className="button primary" onClick={() => { if (save()) onClose() }}>Done</button></div>
    </Modal>
    {linking && <NoteLinkPicker notes={notes} projects={projects} projectId={project.id} linkedIds={draft.linkedNoteIds} onLink={link} onClose={() => setLinking(false)} error={formError || notesError} />}
    {creating && (pendingNote ? <Modal title="Link created note" error={error || notesError} onClose={() => setCreating(false)}><p className="confirmation-message">“{pendingNote.title}” was created, but its task link could not be saved. Retry to link the existing note and open it.</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setCreating(false)}>Close</button><button type="button" className="button primary" onClick={() => createNote({})}>Retry linking</button></div></Modal> : <NoteModal projects={projects} projectId={project.id} lockProject error={formError || notesError} onSave={createNote} onClose={() => setCreating(false)} />)}
  </>
}
