import { useState } from 'react'
import Modal from './Modal'

export default function TaskModal({
  task,
  onSave,
  onClose,
  error,
  busy = false,
  details = false,
  children,
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState(task?.status ?? 'todo')
  const [implementationNotes, setImplementationNotes] = useState(task?.implementationNotes ?? '')
  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose} error={error}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && title.trim())
            onSave({
              title: title.trim(),
              description: description.trim(),
              ...(details ? { status, implementationNotes } : {}),
            })
        }}
      >
        <label htmlFor="task-title">Task title</label>
        <input
          id="task-title"
          disabled={busy}
          autoFocus
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to be done?"
        />
        <label htmlFor="task-description">
          Description <span>(optional)</span>
        </label>
        <textarea
          id="task-description"
          disabled={busy}
          rows={4}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a few details"
        />
        {details && (
          <>
            <label htmlFor="cloud-task-status">Status</label>
            <select
              id="cloud-task-status"
              value={status}
              disabled={busy}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="todo">To Do</option>
              <option value="done">Done</option>
            </select>
            <label htmlFor="cloud-task-implementation">Implementation Notes</label>
            <textarea
              id="cloud-task-implementation"
              rows={6}
              value={implementationNotes}
              disabled={busy}
              onChange={(event) => setImplementationNotes(event.target.value)}
            />
            <div className="task-detail-timestamps">
              {['createdAt', 'updatedAt'].map((field) => (
                <span key={field}>
                  {field === 'createdAt' ? 'Created ' : 'Updated '}
                  <time dateTime={task?.[field] || undefined}>
                    {task?.[field] ? new Date(task[field]).toLocaleString() : 'Not recorded'}
                  </time>
                </span>
              ))}
            </div>
          </>
        )}
        {children}
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : task ? 'Save task' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
