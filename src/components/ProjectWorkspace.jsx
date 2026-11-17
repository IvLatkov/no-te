import { ArrowLeft, BookOpen, Layers, Pencil, Trash2 } from 'lucide-react'
import TaskBoard from './TaskBoard'

export default function ProjectWorkspace({
  project,
  onBack,
  onEditProject,
  onDeleteProject,
  activeTab,
  onTabChange,
  documentation,
  ...boardProps
}) {
  return (
    <section className="project-workspace" aria-labelledby="project-title">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> All projects
      </button>
      <div className="section-heading">
        <div>
          <h1 id="project-title">{project.name}</h1>
          {project.description && <p className="project-description">{project.description}</p>}
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="button secondary"
            disabled={boardProps.readOnly}
            onClick={onEditProject}
          >
            <Pencil size={15} /> Edit project
          </button>
          <button
            type="button"
            className="icon-button delete-action"
            disabled={boardProps.readOnly}
            aria-label="Delete project"
            onClick={onDeleteProject}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <div className="project-tabs" role="group" aria-label="Project view">
        <button
          type="button"
          className={activeTab === 'board' ? 'is-active' : ''}
          aria-pressed={activeTab === 'board'}
          onClick={() => onTabChange('board')}
        >
          <Layers size={18} aria-hidden="true" /> Task board
        </button>
        <button
          type="button"
          className={activeTab === 'documentation' ? 'is-active' : ''}
          aria-pressed={activeTab === 'documentation'}
          onClick={() => onTabChange('documentation')}
        >
          <BookOpen size={18} aria-hidden="true" /> Documentation
        </button>
      </div>
      {activeTab === 'documentation' ? (
        documentation
      ) : (
        <TaskBoard key={project.id} project={project} {...boardProps} />
      )}
    </section>
  )
}
