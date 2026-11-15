import { useEffect, useRef, useState } from 'react'
import { NotebookText, Layers, X } from 'lucide-react'

// Keep this breakpoint aligned with the single drawer query in App.css.
const drawerQuery = '(max-width: 1100px)'

export default function Sidebar({
  pages,
  activePage,
  onNavigate,
  menuOpen,
  onMenuChange,
  projects,
  selectedProjectId,
  onOpenProject,
}) {
  const sidebar = useRef(null)
  const [isDrawer, setIsDrawer] = useState(() => window.matchMedia?.(drawerQuery).matches ?? false)

  useEffect(() => {
    const media = window.matchMedia?.(drawerQuery)
    if (!media) return
    function resize(event) {
      setIsDrawer(event.matches)
      onMenuChange(false)
      if (event.matches && sidebar.current?.contains(document.activeElement)) {
        document.getElementById('navigation-toggle')?.focus()
      }
    }
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [onMenuChange])

  useEffect(() => {
    if (!isDrawer || !menuOpen) return
    const element = sidebar.current
    const workspace = document.querySelector('.workspace')
    const previousInert = workspace?.inert
    const previousOverflow = document.body.style.overflow
    if (workspace) workspace.inert = true
    document.body.style.overflow = 'hidden'
    element.querySelector('button')?.focus()
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onMenuChange(false)
      } else if (event.key === 'Tab') {
        const items = [...element.querySelectorAll('*')].filter(
          (item) => item.tabIndex >= 0 && !item.disabled,
        )
        const first = items[0]
        const last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      if (workspace) workspace.inert = previousInert
      document.body.style.overflow = previousOverflow
      const target = window.matchMedia?.(drawerQuery).matches
        ? document.getElementById('navigation-toggle')
        : document.getElementById('main-content')
      target?.focus()
    }
  }, [isDrawer, menuOpen, onMenuChange])

  function navItem(id) {
    const { label, icon: Icon } = pages[id]
    return (
      <button
        key={id}
        type="button"
        className={`nav-item${activePage === id ? ' is-active' : ''}`}
        aria-current={activePage === id ? 'page' : undefined}
        onClick={() => onNavigate(id)}
      >
        <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <>
      {isDrawer && menuOpen && (
        <div className="navigation-backdrop" aria-hidden="true" onClick={() => onMenuChange(false)} />
      )}
      <aside
        id="sidebar"
        ref={sidebar}
        className={`sidebar${menuOpen ? ' is-open' : ''}`}
        hidden={isDrawer && !menuOpen}
        inert={isDrawer && !menuOpen}
        role={isDrawer && menuOpen ? 'dialog' : undefined}
        aria-modal={isDrawer && menuOpen ? true : undefined}
        aria-label="Workspace navigation"
      >
        {isDrawer && (
          <button type="button" className="drawer-close icon-button" aria-label="Close navigation" onClick={() => onMenuChange(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        )}
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            onNavigate('dashboard')
          }}
          aria-label="No-Te home"
        >
          <span className="brand-mark">
            <NotebookText size={28} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>No-Te</span>
        </a>
        <nav aria-label="Main navigation" className="primary-nav">
          {['dashboard', 'projects', 'documentation'].map(navItem)}
        </nav>
        <section className="projects-section" aria-labelledby="projects-heading">
          <h2 id="projects-heading">Your projects</h2>
          <nav className="project-nav" aria-label="Your projects">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`nav-item${selectedProjectId === project.id ? ' is-active' : ''}`}
                aria-current={selectedProjectId === project.id ? 'page' : undefined}
                onClick={() => onOpenProject(project.id)}
                title={project.name}
              >
                <Layers size={17} aria-hidden="true" />
                <span>{project.name}</span>
              </button>
            ))}
          </nav>
        </section>
        <nav aria-label="Workspace settings" className="sidebar-bottom">
          {navItem('settings')}
        </nav>
      </aside>
    </>
  )
}
