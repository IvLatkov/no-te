import { ArrowUpRight, CircleCheck, Circle } from 'lucide-react'

export default function LinkedTasks({ tasks, onOpenTask }) {
  return (
    <details className="note-linked-tasks">
      <summary>
        Linked Tasks <span>{tasks.length}</span>
      </summary>
      <div className="note-backlinks">
        {tasks.length ? (
          tasks.map((task) => (
            <button
              type="button"
              className="note-backlink"
              key={`${task.projectId}:${task.taskId}`}
              onClick={() => onOpenTask(task.projectId, task.taskId)}
              aria-label={`Open task ${task.title} in ${task.projectName}`}
            >
              <span className={`backlink-status ${task.status}`}>
                {task.status === 'done' ? <CircleCheck size={16} /> : <Circle size={16} />}
              </span>
              <span>
                <strong>{task.title}</strong>
                <small>
                  {task.projectName} · {task.status === 'done' ? 'Done' : 'To Do'}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))
        ) : (
          <p>No tasks link to this note yet.</p>
        )}
      </div>
    </details>
  )
}
