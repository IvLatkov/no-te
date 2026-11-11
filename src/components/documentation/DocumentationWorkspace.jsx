import { useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { selectNotes } from '../../data/notes'
import NotesList from './NotesList'
import NoteEditor from './NoteEditor'
import NoteModal from './NoteModal'
import ConfirmModal from '../ConfirmModal'
import { tasksForNote } from '../../data/taskDocumentation'

export default function DocumentationWorkspace({ notesState, projects, projectScope = null, initialNoteId = null, onOpenTask }) {
  const { notes, store, status, error, readOnly } = notesState
  const [selectedId, setSelectedId] = useState(initialNoteId)
  const [filter, setFilter] = useState(projectScope || 'all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('modified')
  const [modal, setModal] = useState(null)
  const selected = notes.find(note => note.id === selectedId)
  const visible = selectNotes(notes, { query, projectId: projectScope || filter, sort })
  function select(id) { if (store.flush()) setSelectedId(id) }
  function changeFilter(value) { if (store.flush()) { setFilter(value); setSelectedId(null) } }
  function duplicate() {
    const copy = store.duplicate(selected.id)
    if (copy) { setQuery(''); setSelectedId(copy.id) }
  }
  return <div className={`documentation-workspace${selected ? ' has-selection' : ''}`}>
    {error && <div className="notes-error"><p className="storage-error" role="alert">{error}</p>{!readOnly && <button type="button" className="button secondary" onClick={() => store.flush()}>Retry save</button>}</div>}
    <NotesList notes={visible} selectedId={selectedId} onSelect={select} onCreate={() => setModal('create')} projects={projects} filter={projectScope || filter} onFilter={changeFilter} query={query} onQuery={setQuery} sort={sort} onSort={setSort} projectScope={projectScope} readOnly={readOnly} />
    {selected ? <NoteEditor key={selected.id} note={selected} projects={projects} store={store} status={status} readOnly={readOnly} onBack={() => select(null)} onDuplicate={duplicate} onDelete={() => setModal('delete')} linkedTasks={tasksForNote(projects, selected.id)} onOpenTask={onOpenTask} /> : <section className="notes-editor-empty"><NotebookPen size={46} strokeWidth={1.3} /><h2>A space for your thoughts</h2><p>Choose a note, or start a new page.</p></section>}
    {modal === 'create' && <NoteModal projects={projects} projectId={projectScope || (filter === 'all' ? null : filter)} error={error} onClose={() => setModal(null)} onSave={values => { const note = store.create(values); if (note) { setModal(null); setQuery(''); if (!projectScope) setFilter('all'); setSelectedId(note.id) } }} />}
    {modal === 'delete' && selected && <ConfirmModal title="Delete note?" message={`Delete “${selected.title || 'Untitled note'}”? This cannot be undone.`} error={error} onClose={() => setModal(null)} onConfirm={() => { if (store.remove(selected.id)) { setSelectedId(null); setModal(null) } }} />}
  </div>
}
