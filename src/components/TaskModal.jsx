import { useState } from 'react'
import Modal from './Modal'

export default function TaskModal({ task, onSave, onClose, error }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose} error={error}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) onSave({ title: title.trim(), description: description.trim() })
        }}
      >
        <label htmlFor="task-title">Task title</label>
        <input
          id="task-title"
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
          rows={4}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a few details"
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!title.trim()}>
            {task ? 'Save task' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
