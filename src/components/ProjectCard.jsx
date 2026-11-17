import { ArrowUpRight, Layers, Pencil, Trash2 } from 'lucide-react'

export default function ProjectCard({ project, onOpen, onEdit, onDelete, readOnly }) {
  return (
    <article className="project-card">
      <button
        type="button"
        className="project-open"
        onClick={onOpen}
        aria-label={`Open project ${project.name}`}
      >
        <div className="project-card-top">
          <Layers size={23} aria-hidden="true" />
          <ArrowUpRight size={17} />
        </div>
        <h2>{project.name}</h2>
        <p>{project.description || 'No description yet.'}</p>
      </button>
      <div className="project-card-footer">
        <span>
          {project.tasks.length} {project.tasks.length === 1 ? 'task' : 'tasks'}
        </span>
        <div className="card-actions">
          <button
            type="button"
            disabled={readOnly}
            className="icon-button"
            aria-label={`Edit project ${project.name}`}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            disabled={readOnly}
            className="icon-button delete-action"
            aria-label={`Delete project ${project.name}`}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  )
}
