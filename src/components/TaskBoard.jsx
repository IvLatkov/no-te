import { useState } from 'react'
import { Plus } from 'lucide-react'
import TaskCard from './TaskCard'

const columns = [{ id: 'todo', title: 'To Do' }, { id: 'done', title: 'Done' }]
const dragType = 'application/x-no-te-task'

export default function TaskBoard({ project, onCreate, onEdit, onDelete, onMove, readOnly }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  function endDrag() { setDragging(null); setOver(null) }
  function startDrag(event, taskId) {
    event.dataTransfer.setData(dragType, JSON.stringify({ projectId: project.id, taskId }))
    event.dataTransfer.effectAllowed = 'move'
    setDragging(taskId)
  }
  function drop(event, status) {
    event.preventDefault()
    try {
      const data = JSON.parse(event.dataTransfer.getData(dragType))
      if (!readOnly && data.projectId === project.id && project.tasks.some(task => task.id === data.taskId)) onMove(data.taskId, status)
    } catch { /* Ignore unrelated files and external drag payloads. */ }
    endDrag()
  }
  return (
    <div className="task-board" aria-label="Task board">
      {columns.map(column => {
        const tasks = project.tasks.filter(task => task.status === column.id)
        return <section key={column.id} className={`board-column${over === column.id ? ' drag-over' : ''}`} aria-labelledby={`column-${column.id}`} onDragOver={event => { if (dragging && !readOnly) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(column.id) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(null) }} onDrop={event => drop(event, column.id)}>
          <div className="column-heading"><h2 id={`column-${column.id}`}><span className={`status-dot ${column.id}`} />{column.title}<span className="task-count">{tasks.length}</span></h2>{column.id === 'todo' && <button type="button" className="icon-button" aria-label="New task" disabled={readOnly} onClick={onCreate}><Plus size={18} /></button>}</div>
          <div className="task-list">{tasks.map(task => <TaskCard key={task.id} task={task} readOnly={readOnly} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} onMove={status => onMove(task.id, status)} onDragStart={startDrag} onDragEnd={endDrag} />)}{!tasks.length && <p className="column-empty">{column.id === 'todo' ? 'A clear space. Add your first task.' : 'Completed tasks will land here.'}</p>}</div>
          {column.id === 'todo' && <button type="button" className="add-task" disabled={readOnly} onClick={onCreate}><Plus size={16} /> Add task</button>}
        </section>
      })}
    </div>
  )
}
