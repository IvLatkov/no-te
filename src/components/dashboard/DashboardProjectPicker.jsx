import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'

export default function DashboardProjectPicker({
  projects,
  selectedProjectId,
  onSelect,
  onOpenProjects,
  loading,
  error,
}) {
  const [open, setOpen] = useState(false)
  const picker = useRef(null)
  const toggle = useRef(null)

  useEffect(() => {
    if (!open) return
    function outside(event) {
      if (!picker.current?.contains(event.target)) setOpen(false)
    }
    function escape(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        toggle.current?.focus()
      }
    }
    document.addEventListener('click', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('click', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function select(id) {
    onSelect(id)
    setOpen(false)
    toggle.current?.focus()
  }

  return (
    <div className="dashboard-project-picker" ref={picker}>
      <button
        ref={toggle}
        type="button"
        className="apps-toggle"
        aria-expanded={open}
        aria-controls="dashboard-project-options"
        onClick={() => setOpen(!open)}
      >
        <Layers size={15} aria-hidden="true" />
        Project
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div id="dashboard-project-options" className="dashboard-project-options" hidden={!open}>
        <p className="dashboard-picker-caption">Show on dashboard</p>
        {loading ? (
          <p role="status">Loading projects…</p>
        ) : error ? (
          <p role="alert">Projects couldn’t be loaded. Use Reload cloud data to try again.</p>
        ) : projects.length ? (
          <ul aria-label="Dashboard projects">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  aria-pressed={selectedProjectId === project.id}
                  onClick={() => select(project.id)}
                  title={project.name}
                >
                  <span>{project.name}</span>
                  {selectedProjectId === project.id && <Check size={15} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No projects yet. Create one in Projects to add it here.</p>
        )}
        <div className="dashboard-picker-actions">
          {selectedProjectId && (
            <button type="button" className="text-action" onClick={() => select(null)}>
              Hide project
            </button>
          )}
          <button type="button" className="text-action" onClick={onOpenProjects}>
            View all projects
          </button>
        </div>
      </div>
    </div>
  )
}
