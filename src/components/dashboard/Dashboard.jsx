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
  onOpenProject,
  onOpenTask,
  onOpenNote,
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
    document.addEventListener('click', closeApps, true)
    return () => document.removeEventListener('click', closeApps, true)
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
      {selectedProject && !projectsLoading && !projectsError && (
        <DashboardProjectPanels
          project={selectedProject}
          notes={notes}
          notesLoading={notesLoading}
          notesError={notesError}
          onOpenProject={onOpenProject}
          onOpenTask={onOpenTask}
          onOpenNote={onOpenNote}
        />
      )}
    </div>
  )
}
