import { ArrowUpRight, BookOpen, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { activeTasks, archiveLabel } from '../../data/taskWorkflow'
import { filterDocumentation, tasksForNote } from '../../data/taskDocumentation'
import TaskArchiveModal from '../TaskArchiveModal'

export default function DashboardProjectPanels({
  project,
  notes,
  notesLoading,
  notesError,
  onOpenProject,
  onOpenTask,
  onCreateTask,
  onOpenNote,
  onOpenDocumentation,
  onMoveTask,
  onRestoreTask,
  onDeleteTask,
  readOnly,
  projects = [project],
}) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [documentationFilter, setDocumentationFilter] = useState('all')
  const [draggedTask, setDraggedTask] = useState(null)
  const canMove = !readOnly && Boolean(onMoveTask)

  function canDrop(status) {
    return canMove && draggedTask?.projectId === project.id &&
      activeTasks(project.tasks).some(task => task.id === draggedTask.taskId && task.status !== status)
  }

  const linkedNoteIds = new Set(project.tasks.flatMap((task) => task.linkedNoteIds || []))
  const projectNotes = filterDocumentation(notes.filter((note) => note.projectId === project.id || linkedNoteIds.has(note.id)), projects, documentationFilter)
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
          const tasks = activeTasks(project.tasks).filter((task) => task.status === column.id)
          return (
            <section
              className="dashboard-panel"
              key={column.id}
              aria-labelledby={`dashboard-${column.id}`}
              onDragOver={(event) => {
                if (!canDrop(column.id)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                if (!canDrop(column.id)) return
                event.preventDefault()
                setDraggedTask(null)
                onMoveTask(project.id, draggedTask.taskId, column.id)
              }}
            >
              <div className="dashboard-panel-heading">
                <h3 id={`dashboard-${column.id}`}>
                  <span className={`status-dot ${column.id}`} aria-hidden="true" />
                  {column.title}<span className="task-count">{tasks.length}</span>
                </h3>
                {column.id === 'todo' && (
                  <button type="button" className="text-action dashboard-add-task" disabled={readOnly || !onCreateTask} onClick={() => onCreateTask(project.id)}>
                    <Plus size={14} aria-hidden="true" /> Add task
                  </button>
                )}
                {column.id === 'done' && <button type="button" className="text-action dashboard-archive-action" onClick={() => setArchiveOpen(true)}>Archived</button>}
              </div>
              <ul className="dashboard-panel-list">
                {tasks.map((task) => (
                  <li key={task.id} className={`dashboard-task-item${column.id === 'done' ? ' has-delete' : ''}`}>
                    <button
                      type="button"
                      className="dashboard-item"
                      draggable={canMove}
                      onDragStart={(event) => {
                        if (!canMove) {
                          event.preventDefault()
                          return
                        }
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/x-no-te-task', task.id)
                        const card = event.currentTarget
                        const preview = card.cloneNode(true)
                        const width = card.getBoundingClientRect().width
                        preview.style.cssText = `position: fixed; top: 0; left: 0; z-index: 9999;
                          pointer-events: none; width: ${width}px; background: #080910;
                          color: #fff; border: 2px solid #b994ff; opacity: 1;`
                        preview.setAttribute('aria-hidden', 'true')
                        document.body.append(preview)
                        event.dataTransfer.setDragImage(preview, 16, 16)
                        requestAnimationFrame(() => preview.remove())
                        setDraggedTask({ projectId: project.id, taskId: task.id })
                      }}
                      onDragEnd={() => setDraggedTask(null)}
                      onClick={() => onOpenTask(project.id, task.id)}
                      aria-label={`Open task ${task.title}`}
                    >
                      <span>{task.title}</span>
                      {task.description && <small>{task.description}</small>}
                      {task.status === 'done' && <small className="archive-countdown">{archiveLabel(task)}</small>}
                    </button>
                    {column.id === 'done' && (
                      <button
                        type="button"
                        className="icon-button delete-action dashboard-task-delete"
                        aria-label={`Delete completed task ${task.title}`}
                        title="Delete completed task"
                        disabled={readOnly || !onDeleteTask}
                        onClick={() => onDeleteTask(project.id, task)}
                      ><Trash2 size={15} aria-hidden="true" /></button>
                    )}
                  </li>
                ))}
              </ul>
              {!tasks.length && <p className="dashboard-panel-empty">{column.id === 'todo' ? 'No tasks to do.' : 'No completed tasks yet.'}</p>}
            </section>
          )
        })}
        <section className="dashboard-panel dashboard-notes" aria-labelledby="dashboard-documentation">
          <div className="dashboard-panel-heading">
            <h3 id="dashboard-documentation">
              <BookOpen size={15} aria-hidden="true" /> Documentation
              {!notesLoading && !notesError && <span className="task-count">{projectNotes.length}</span>}
            </h3>
            {onOpenDocumentation && (
              <button type="button" className="text-action all-documentation-action" onClick={onOpenDocumentation}>
                All documentation
              </button>
            )}
          </div>
          <label className="documentation-link-filter">
            <span className="visually-hidden">Filter dashboard documentation</span>
            <select aria-label="Filter dashboard documentation" value={documentationFilter} onChange={(event) => setDocumentationFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="task-linked">Task-linked</option>
              <option value="independent">Independent</option>
            </select>
          </label>
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
                      {tasksForNote(projects, note.id).length > 0 && <small>Linked: {tasksForNote(projects, note.id).map((task) => `${task.title}${task.isArchived ? ' (Archived)' : ''}`).join(', ')}</small>}
                    </button>
                  </li>
                ))}
              </ul>
              {!projectNotes.length && <p className="dashboard-panel-empty">{documentationFilter === 'all' ? 'No documentation linked to this project yet.' : 'No notes match this filter.'}</p>}
            </>
          )}
        </section>
      </div>
      {archiveOpen && <TaskArchiveModal
        project={project}
        readOnly={readOnly}
        onClose={() => setArchiveOpen(false)}
        onOpenTask={(task) => onOpenTask(project.id, task.id)}
        onRestore={(id) => onRestoreTask(project.id, id)}
      />}
    </section>
  )
}
