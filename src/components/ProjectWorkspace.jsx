import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import TaskBoard from './TaskBoard'

export default function ProjectWorkspace({ project, onBack, onEditProject, onDeleteProject, ...boardProps }) {
  return (
    <section className="project-workspace" aria-labelledby="project-title">
      <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={16} /> All projects</button>
      <div className="section-heading"><div><h1 id="project-title">{project.name}</h1>{project.description && <p className="project-description">{project.description}</p>}</div><div className="card-actions"><button type="button" className="button secondary" disabled={boardProps.readOnly} onClick={onEditProject}><Pencil size={15} /> Edit project</button><button type="button" className="icon-button delete-action" disabled={boardProps.readOnly} aria-label="Delete project" onClick={onDeleteProject}><Trash2 size={17} /></button></div></div>
      <TaskBoard key={project.id} project={project} {...boardProps} />
    </section>
  )
}
