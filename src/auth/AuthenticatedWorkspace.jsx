import { useState } from 'react'
import { BookOpen, House, Layers, Menu, Settings, X } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import EmptyState from '../components/EmptyState'
import AccountSettings from './AccountSettings'
import { useAuth } from './useAuth'
import useCloudProjects from '../hooks/useCloudProjects'
import ProjectsPage from '../components/ProjectsPage'
import ProjectWorkspace from '../components/ProjectWorkspace'
import ProjectModal from '../components/ProjectModal'
import TaskModal from '../components/TaskModal'
import ConfirmModal from '../components/ConfirmModal'
import '../task-details.css'
import '../organization.css'

const pages = {
  dashboard: { label: 'Dashboard', icon: House },
  projects: { label: 'Projects', icon: Layers },
  documentation: { label: 'Documentation', icon: BookOpen },
  settings: { label: 'Settings', icon: Settings },
}

// Do not import LocalWorkspace or mount its data hooks here. Legacy data has no
// verified owner; even loading those hooks can reconcile/write browser records.
export default function AuthenticatedWorkspace() {
  const { client, user } = useAuth()
  const { projects, store, loading, busy, error, mutationError, readOnly } = useCloudProjects(
    client,
    user.id,
  )
  const [activePage, setActivePage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [projectId, setProjectId] = useState(null)
  const [projectTab, setProjectTab] = useState('board')
  const [modal, setModal] = useState(null)
  const project = projects.find((item) => item.id === projectId)
  const organization = { tags: [] }
  function navigate(page) {
    if (busy) return
    setActivePage(page)
    setProjectId(null)
    setModal(null)
    setMenuOpen(false)
  }
  function openProject(id) {
    if (busy) return
    setActivePage('projects')
    setProjectId(id)
    setProjectTab('board')
    setModal(null)
    setMenuOpen(false)
  }
  function openModal(value) {
    store.clearMutationError()
    setModal(value)
  }
  function closeModal() {
    if (!busy) {
      setModal(null)
      store.clearMutationError()
    }
  }
  async function saveProject(values) {
    const success = modal.project
      ? await store.updateProject(modal.project.id, values)
      : await store.createProject(values)
    if (success) setModal(null)
  }
  async function saveTask(values) {
    const success = modal.task
      ? await store.updateTask(project.id, modal.task.id, values)
      : await store.createTask(project.id, values)
    if (success) setModal(null)
  }
  async function deleteItem() {
    const deletingProject = modal.type === 'deleteProject'
    const success = deletingProject
      ? await store.deleteProject(modal.project.id)
      : await store.deleteTask(project.id, modal.task.id)
    if (success) {
      if (deletingProject && modal.project.id === projectId) setProjectId(null)
      setModal(null)
    }
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        pages={pages}
        activePage={activePage}
        onNavigate={navigate}
        menuOpen={menuOpen}
        projects={projects}
        selectedProjectId={projectId}
        onOpenProject={openProject}
      />
      <div className="workspace">
        <header className="workspace-header">
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="page-label">{project?.name ?? pages[activePage].label}</span>
          <span className="workspace-label">
            <span /> Account workspace
          </span>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content${activePage === 'settings' ? ' content-settings' : activePage === 'projects' ? ' content-projects' : ''}`}
        >
          {(error || (!modal && mutationError)) && (
            <div role="alert" className="storage-error">
              {error || mutationError}
              <button
                className="button secondary"
                type="button"
                disabled={loading || busy}
                onClick={() => {
                  store.clearMutationError()
                  store.load()
                }}
              >
                Reload cloud data
              </button>
            </div>
          )}
          {activePage === 'settings' ? (
            <AccountSettings />
          ) : activePage === 'dashboard' ? (
            <EmptyState page="dashboard" />
          ) : activePage === 'projects' ? (
            <>
              <p className="board-filter-hint">
                Cloud projects and tasks. Local-only browser content remains quarantined.
              </p>
              {loading && <p role="status">Loading cloud projects and tasks…</p>}
              {busy && <p role="status">Saving cloud changes…</p>}
              <button
                type="button"
                className="button secondary cloud-reload"
                disabled={loading || busy}
                onClick={() => store.load()}
              >
                Refresh projects
              </button>
              {project ? (
                <ProjectWorkspace
                  project={project}
                  readOnly={readOnly}
                  onBack={() => navigate('projects')}
                  activeTab={projectTab}
                  onTabChange={setProjectTab}
                  organization={organization}
                  relationshipsAvailable={false}
                  documentation={
                    <p className="board-filter-hint">
                      Cloud documentation and note links are unavailable until iteration 6.3C.
                      Existing relationships are preserved.
                    </p>
                  }
                  onEditProject={() => openModal({ type: 'project', project })}
                  onDeleteProject={() => openModal({ type: 'deleteProject', project })}
                  onCreate={() => openModal({ type: 'task' })}
                  onEdit={(task) => openModal({ type: 'task', task })}
                  onDelete={(task) => openModal({ type: 'deleteTask', task })}
                  onMove={(id, status) => store.moveTask(project.id, id, status)}
                />
              ) : !loading && !error ? (
                <ProjectsPage
                  projects={projects}
                  readOnly={readOnly}
                  onOpen={openProject}
                  onCreate={() => openModal({ type: 'project' })}
                  onEdit={(item) => openModal({ type: 'project', project: item })}
                  onDelete={(item) => openModal({ type: 'deleteProject', project: item })}
                />
              ) : null}
            </>
          ) : (
            <section className="quarantine-page" aria-labelledby="quarantine-heading">
              <h1 id="quarantine-heading">{pages[activePage].label}</h1>
              <p>Local-only content is preserved and quarantined until explicit migration.</p>
              <p>
                Account documentation editing is not connected in this iteration. No browser data
                has been uploaded or assigned to this account.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate('settings')}
              >
                Open Settings
              </button>
            </section>
          )}
        </main>
      </div>
      {modal?.type === 'project' && (
        <ProjectModal
          project={modal.project}
          onSave={saveProject}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {modal?.type === 'task' && (
        <TaskModal
          task={modal.task}
          details={!!modal.task}
          onSave={saveTask}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {modal?.type === 'deleteProject' && (
        <ConfirmModal
          title="Delete project?"
          message={`Delete “${modal.project.name}” and all of its tasks? The database cascades task deletion. Documentation notes are not explicitly deleted and should become unassigned through the configured foreign key. This cannot be undone.`}
          onConfirm={deleteItem}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {modal?.type === 'deleteTask' && (
        <ConfirmModal
          title="Delete task?"
          message={`Delete “${modal.task.title}”? This cannot be undone.`}
          onConfirm={deleteItem}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
    </div>
  )
}
