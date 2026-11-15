import { Plus, Search, FileText } from 'lucide-react'
import NoteCard from './NoteCard'
import useNoteDragScroll from '../../hooks/useNoteDragScroll'

export default function NotesList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  projects,
  filter,
  onFilter,
  query,
  onQuery,
  sort,
  onSort,
  projectScope,
  readOnly,
  folderNavigation,
  tagFilter,
  hasFilters,
  noteDrag,
  linkFilter = 'all',
  onLinkFilter,
  taskLinksAvailable = true,
}) {
  const scroll = useNoteDragScroll(noteDrag?.draggingId)
  return (
    <section className="notes-panel" aria-label="Notes list" {...scroll}>
      <div className="notes-panel-top">
        <div className="notes-panel-heading">
          <h2>
            Notes <span>{notes.length}</span>
          </h2>
          <FileText size={17} />
        </div>
        <label className="notes-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search notes…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button primary new-note-button"
          disabled={readOnly}
          onClick={onCreate}
        >
          <Plus size={16} /> New Note
        </button>
        <div className="notes-filters">
          <label>
            Documentation
            <select aria-label="Filter documentation links" value={taskLinksAvailable ? linkFilter : 'all'} disabled={!taskLinksAvailable} onChange={(event) => onLinkFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="task-linked">Task-linked</option>
              <option value="independent">Independent</option>
            </select>
          </label>
          <label>
            Project
            <select
              aria-label="Filter notes by project"
              value={filter ?? ''}
              disabled={Boolean(projectScope)}
              onChange={(event) => onFilter(event.target.value || null)}
            >
              <option value="all">All projects</option>
              <option value="">Unassigned</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              aria-label="Sort notes"
              value={sort}
              onChange={(event) => onSort(event.target.value)}
            >
              <option value="modified">Recently modified</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
        {tagFilter}
        {!taskLinksAvailable && <p className="board-filter-hint">Task-link filters need task data. Reload cloud data after resolving its error.</p>}
        {noteDrag?.enabled && (
          <p className="note-drag-status" role="status" aria-live="polite">
            {noteDrag.message ||
              'Drag notes to a folder, or use the Folder selector in the editor.'}
          </p>
        )}
      </div>
      {folderNavigation}
      <div className="notes-list">
        {notes.length ? (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              selected={note.id === selectedId}
              onSelect={() => onSelect(note.id)}
              noteDrag={noteDrag}
              readOnly={readOnly}
            />
          ))
        ) : (
          <div className="notes-no-results">
            <FileText size={27} strokeWidth={1.5} />
            <p>{hasFilters || query ? 'No notes match these filters.' : 'No notes here yet.'}</p>
            <span>
              {hasFilters || query
                ? 'Try another project, folder, tag, or phrase.'
                : 'Start with a fresh page.'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
