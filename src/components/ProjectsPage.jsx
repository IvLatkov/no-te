import { Layers, Plus } from 'lucide-react'
import ProjectCard from './ProjectCard'

export default function ProjectsPage({ projects, onOpen, onCreate, onEdit, onDelete, readOnly }) {
  return (
    <section className="projects-page" aria-labelledby="projects-title">
      <div className="section-heading">
        <div>
          <h1 id="projects-title">Projects</h1>
          <p>A little space for your next big idea.</p>
        </div>
        <button type="button" className="button primary" disabled={readOnly} onClick={onCreate}>
          <Plus size={17} /> New Project
        </button>
      </div>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              readOnly={readOnly}
              onOpen={() => onOpen(project.id)}
              onEdit={() => onEdit(project)}
              onDelete={() => onDelete(project)}
            />
          ))}
        </div>
      ) : (
        <div className="projects-empty">
          <Layers size={34} strokeWidth={1.5} aria-hidden="true" />
          <h2>A fresh start</h2>
          <p>Create your first project to start organizing your tasks.</p>
        </div>
      )}
    </section>
  )
}
