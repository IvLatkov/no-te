import { ArrowUpRight, BookOpen } from 'lucide-react'

export default function DashboardProjectPanels({
  project,
  notes,
  notesLoading,
  notesError,
  onOpenProject,
  onOpenTask,
  onOpenNote,
}) {
  const projectNotes = notes.filter((note) => note.projectId === project.id)
  return (
    <section className="dashboard-project" aria-labelledby="dashboard-project-heading">
      <div className="dashboard-project-heading">
        <div>
          <h2 id="dashboard-project-heading">{project.name}</h2>
          {project.description && <p>{project.description}</p>}
        </div>
        <button type="button" className="text-action" onClick={() => onOpenProject(project.id)}>
          Open project <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="dashboard-project-panels">
        {[{ id: 'todo', title: 'To Do' }, { id: 'done', title: 'Done' }].map((column) => {
          const tasks = project.tasks.filter((task) => task.status === column.id)
          return (
            <section className="dashboard-panel" key={column.id} aria-labelledby={`dashboard-${column.id}`}>
              <h3 id={`dashboard-${column.id}`}>
                <span className={`status-dot ${column.id}`} aria-hidden="true" />
                {column.title}<span className="task-count">{tasks.length}</span>
              </h3>
              <ul className="dashboard-panel-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <button type="button" className="dashboard-item" onClick={() => onOpenTask(project.id, task.id)} aria-label={`Open task ${task.title}`}>
                      <span>{task.title}</span>
                      {task.description && <small>{task.description}</small>}
                    </button>
                  </li>
                ))}
              </ul>
              {!tasks.length && <p className="dashboard-panel-empty">{column.id === 'todo' ? 'No tasks to do.' : 'No completed tasks yet.'}</p>}
            </section>
          )
        })}
        <section className="dashboard-panel dashboard-notes" aria-labelledby="dashboard-documentation">
          <h3 id="dashboard-documentation">
            <BookOpen size={15} aria-hidden="true" /> Documentation
            {!notesLoading && !notesError && <span className="task-count">{projectNotes.length}</span>}
          </h3>
          {notesLoading ? (
            <p className="dashboard-panel-empty" role="status">Loading documentation…</p>
          ) : notesError ? (
            <p className="dashboard-panel-empty" role="alert">Documentation couldn’t be loaded. Use Reload documentation to try again.</p>
          ) : (
            <>
              <ul className="dashboard-panel-list">
                {projectNotes.map((note) => (
                  <li key={note.id}>
                    <button type="button" className="dashboard-item" onClick={() => onOpenNote(note.id)} aria-label={`Open note ${note.title || 'Untitled note'}`}>
                      <span>{note.title || 'Untitled note'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!projectNotes.length && <p className="dashboard-panel-empty">No documentation linked to this project yet.</p>}
            </>
          )}
        </section>
      </div>
    </section>
  )
}
