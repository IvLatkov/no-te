import { useState } from 'react'
import Modal from './Modal'
import { isArchivedTask } from '../data/taskWorkflow'

export default function TaskArchiveModal({ project, onClose, onOpenTask, onRestore, readOnly }) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const archived = project.tasks.filter(isArchivedTask)
  const term = query.trim().toLocaleLowerCase()
  const tasks = archived.filter((task) => `${task.title}\n${task.description}\n${task.implementationNotes || ''}`.toLocaleLowerCase().includes(term))

  async function restore(task) {
    if (pending || readOnly) return
    setPending(task.id)
    setError('')
    try {
      if (await onRestore(task.id) === false) setError('Restoration could not be confirmed. Reload before retrying; your task and documentation are preserved.')
    } catch {
      setError('Could not restore the task. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <Modal title={`Archived · ${project.name}`} className="task-archive-modal" error={error} onClose={() => { if (!pending) onClose() }}>
      <label htmlFor="archive-search">Search archived tasks</label>
      <input id="archive-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, description or implementation notes…" />
      <ul className="archive-task-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" className="archive-task-open" disabled={!!pending} onClick={() => { onClose(); void onOpenTask(task) }} aria-label={`Open archived task ${task.title}`}>
              <strong>{task.title}</strong>
              {task.description && <span>{task.description}</span>}
            </button>
            <button type="button" className="text-action" disabled={readOnly || !!pending} onClick={() => restore(task)} aria-label={`Restore ${task.title} to To Do`}>
              {pending === task.id ? 'Restoring…' : 'Restore to To Do'}
            </button>
          </li>
        ))}
      </ul>
      {!tasks.length && <p>{archived.length ? 'No archived tasks match your search.' : 'No archived tasks yet.'}</p>}
      {pending && <p role="status">Restoring task…</p>}
    </Modal>
  )
}
