import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { appShortcuts } from './appShortcuts'
import DashboardProjectPicker from './DashboardProjectPicker'
import DashboardProjectPanels from './DashboardProjectPanels'
import '../../dashboard.css'

export default function Dashboard({
  projects = [],
  selectedProjectId = null,
  onSelectProject,
  projectsLoading = false,
  projectsError = '',
  notes = [],
  notesLoading = false,
  notesError = '',
  onOpenProjects,
  onOpenDocumentation,
  onOpenProject,
  onOpenTask,
  onCreateTask,
  onOpenNote,
  onMoveTask,
  onRestoreTask,
  onDeleteTask,
  readOnly,
}) {
  const [appsOpen, setAppsOpen] = useState(false)
  const [launchNotice, setLaunchNotice] = useState('')
  const toggle = useRef(null)
  const shortcuts = useRef(null)
  const selectedProject = projects.find((project) => project.id === selectedProjectId)

  useEffect(() => {
    if (!appsOpen) return
    function closeApps(event) {
      // The toggle handles its own click, including the click that opens Apps.
      if (toggle.current?.contains(event.target)) return
      setAppsOpen(false)
      if (shortcuts.current?.contains(document.activeElement)) toggle.current?.focus()
    }
    function escape(event) {
      if (event.key !== 'Escape') return
      // A later-opened dialog owns Escape while it is active.
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return
      setAppsOpen(false)
      if (shortcuts.current?.contains(document.activeElement)) toggle.current?.focus()
    }
    document.addEventListener('click', closeApps, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('click', closeApps, true)
      document.removeEventListener('keydown', escape)
    }
  }, [appsOpen])

  function describeLaunch(name) {
    setLaunchNotice(
      `Your browser may ask to open ${name}. If nothing opens, launch it from Windows Start or your desktop shortcut. No-Te cannot confirm desktop launches.`,
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-controls">
        <h2 id="apps-heading">
          <button
            ref={toggle}
            type="button"
            className="apps-toggle"
            aria-expanded={appsOpen}
            aria-controls="app-shortcuts"
            onClick={() => {
              setAppsOpen(!appsOpen)
              setLaunchNotice('')
            }}
          >
            Apps
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        </h2>
        <DashboardProjectPicker
          projects={projects}
          selectedProjectId={selectedProject?.id}
          onSelect={onSelectProject}
          onOpenProjects={onOpenProjects}
          loading={projectsLoading}
          error={projectsError}
        />
      </div>
      <section className="dashboard-apps" aria-labelledby="apps-heading">
        <div id="app-shortcuts" ref={shortcuts} hidden={!appsOpen}>
          <ul className="app-shortcuts">
            {appShortcuts.map((app) => {
              const content = (
                  <span className="app-logo">
                    <img
                      src={`${import.meta.env.BASE_URL}apps/${app.logo}`}
                      width="24"
                      height="24"
                      alt=""
                      aria-hidden="true"
                      draggable="false"
                    />
                  </span>
              )
              return (
                <li key={app.id}>
                  <a
                    className="app-shortcut"
                    href={app.href}
                    title={app.name}
                    target={app.kind === 'website' ? '_blank' : undefined}
                    rel={app.kind === 'website' ? 'noopener noreferrer' : undefined}
                    aria-label={`Open ${app.name}${app.kind === 'website' ? ' in a new tab' : ' desktop app'}`}
                    onClick={app.kind === 'website' ? undefined : () => describeLaunch(app.name)}
                  >
                    {content}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
        <p className="app-launch-notice" role="status">{launchNotice}</p>
      </section>
      {!selectedProject && !projectsLoading && !projectsError && (
        <section className="dashboard-start" aria-labelledby="dashboard-start-heading">
          <h2 id="dashboard-start-heading">{projects.length ? 'Choose a project' : 'Start with a project'}</h2>
          <p>{projects.length
            ? 'Use Project above to show tasks and documentation here, or browse all projects.'
            : 'Create a project to keep its tasks and documentation together.'}</p>
          <button type="button" className="button secondary" onClick={onOpenProjects}>
            {projects.length ? 'View projects' : 'Create your first project'}
          </button>
        </section>
      )}
      {selectedProject && !projectsLoading && (
        <DashboardProjectPanels
          key={selectedProject.id}
          project={selectedProject}
          notes={notes}
          notesLoading={notesLoading}
          notesError={notesError}
          onOpenProject={onOpenProject}
          onOpenTask={onOpenTask}
          onCreateTask={onCreateTask}
          onOpenNote={onOpenNote}
          onOpenDocumentation={onOpenDocumentation}
          onMoveTask={onMoveTask}
          onRestoreTask={onRestoreTask}
          onDeleteTask={onDeleteTask}
          readOnly={readOnly}
          projects={projects}
        />
      )}
      {(!selectedProject || projectsLoading) && onOpenDocumentation && (
        <section className="dashboard-library" aria-labelledby="dashboard-library-heading">
          <div className="dashboard-panel-heading">
            <h2 id="dashboard-library-heading">Documentation</h2>
            <button type="button" className="text-action all-documentation-action" onClick={onOpenDocumentation}>
              All documentation
            </button>
          </div>
          <p>Browse notes from every project, including unassigned notes.</p>
        </section>
      )}
    </div>
  )
}
