import { NotebookText, Layers } from 'lucide-react'

export default function Sidebar({ pages, activePage, onNavigate, menuOpen, projects, selectedProjectId, onOpenProject }) {
  function navItem(id) {
    const { label, icon: Icon } = pages[id]
    return (
      <button key={id} type="button" className={`nav-item${activePage === id ? ' is-active' : ''}`} aria-current={activePage === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
        <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <aside id="sidebar" className={`sidebar${menuOpen ? ' is-open' : ''}`}>
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onNavigate('dashboard') }} aria-label="No-Te home">
        <span className="brand-mark"><NotebookText size={28} strokeWidth={1.8} aria-hidden="true" /></span>
        <span>No-Te</span>
      </a>
      <nav aria-label="Main navigation" className="primary-nav">
        {['dashboard', 'projects', 'documentation'].map(navItem)}
      </nav>
      <section className="projects-section" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Your projects</h2>
        <nav className="project-nav" aria-label="Your projects">
          {projects.map(project => <button key={project.id} type="button" className={`nav-item${selectedProjectId === project.id ? ' is-active' : ''}`} aria-current={selectedProjectId === project.id ? 'page' : undefined} onClick={() => onOpenProject(project.id)} title={project.name}><Layers size={17} aria-hidden="true" /><span>{project.name}</span></button>)}
        </nav>
      </section>
      <nav aria-label="Workspace settings" className="sidebar-bottom">{navItem('settings')}</nav>
    </aside>
  )
}
