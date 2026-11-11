import { Plus, Search, FileText } from 'lucide-react'
import NoteCard from './NoteCard'

export default function NotesList({ notes, selectedId, onSelect, onCreate, projects, filter, onFilter, query, onQuery, sort, onSort, projectScope, readOnly }) {
  return <section className="notes-panel" aria-label="Notes list">
    <div className="notes-panel-top"><div className="notes-panel-heading"><h2>Notes <span>{notes.length}</span></h2><FileText size={17} /></div>
      <label className="notes-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search notes" placeholder="Search notes…" value={query} onChange={event => onQuery(event.target.value)} /></label>
      <button type="button" className="button primary new-note-button" disabled={readOnly} onClick={onCreate}><Plus size={16} /> New Note</button>
      <div className="notes-filters"><label>Project<select aria-label="Filter notes by project" value={filter ?? ''} disabled={Boolean(projectScope)} onChange={event => onFilter(event.target.value || null)}><option value="all">All projects</option><option value="">Unassigned</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>Sort by<select aria-label="Sort notes" value={sort} onChange={event => onSort(event.target.value)}><option value="modified">Recently modified</option><option value="title">Title</option></select></label></div>
    </div>
    <div className="notes-list">{notes.length ? notes.map(note => <NoteCard key={note.id} note={note} selected={note.id === selectedId} onSelect={() => onSelect(note.id)} />) : <div className="notes-no-results"><FileText size={27} strokeWidth={1.5} /><p>{query ? 'No matching notes.' : 'No notes here yet.'}</p><span>{query ? 'Try another title or phrase.' : 'Start with a fresh page.'}</span></div>}</div>
  </section>
}
