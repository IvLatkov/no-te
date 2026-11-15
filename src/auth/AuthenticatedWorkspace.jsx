import { lazy, Suspense, useEffect, useState } from 'react'
import { BookOpen, House, Layers, Menu, Settings, X, Search } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import Dashboard from '../components/dashboard/Dashboard'
import AccountSettings from './AccountSettings'
import { useAuth } from './useAuth'
import useCloudProjects from '../hooks/useCloudProjects'
import useCloudDocumentation from '../hooks/useCloudDocumentation'
import TagManager from '../components/TagManager'
import { canOpenSearch } from '../data/search'
import ProjectsPage from '../components/ProjectsPage'
import ProjectWorkspace from '../components/ProjectWorkspace'
import ProjectModal from '../components/ProjectModal'
import TaskModal from '../components/TaskModal'
import ConfirmModal from '../components/ConfirmModal'
import '../task-details.css'
import '../organization.css'
import '../documentation.css'

const DocumentationWorkspace = lazy(
  () => import('../components/documentation/DocumentationWorkspace'),
)
const CloudTaskDetails = lazy(() => import('../components/CloudTaskDetails'))
const GlobalSearch = lazy(() => import('../components/GlobalSearch'))
function Deferred({ children }) {
  return <Suspense fallback={<p role="status">Opening workspace…</p>}>{children}</Suspense>
}

const pages = {
  dashboard: { label: 'Dashboard', icon: House },
  projects: { label: 'Projects', icon: Layers },
  documentation: { label: 'Documentation', icon: BookOpen },
  settings: { label: 'Settings', icon: Settings },
}

// Only cloud stores mount here. Legacy storage remains quarantined.
export default function AuthenticatedWorkspace() {
  const { client, user, reportSessionNotice } = useAuth()
  const cloud = useCloudProjects(client, user.id)
  const { store, loading, busy, error, mutationError, readOnly } = cloud
  const notesState = useCloudDocumentation(client, user.id, reportSessionNotice)
  const projects = cloud.projects.map((project) => ({
    ...project,
    tasks: project.tasks.map((task) => ({
      ...task,
      tagIds: notesState.task_tags
        .filter((row) => row.task_id === task.id)
        .map((row) => row.tag_id),
      linkedNoteIds: notesState.task_notes
        .filter((row) => row.task_id === task.id)
        .map((row) => row.note_id),
    })),
  }))
  const [activePage, setActivePage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [projectId, setProjectId] = useState(null)
  const [projectTab, setProjectTab] = useState('board')
  const [modal, setModal] = useState(null)
  const [noteRequest, setNoteRequest] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const project = projects.find((item) => item.id === projectId)
  const detailTask = project?.tasks.find((task) => task.id === modal?.task?.id)
  const organization = {
    tags: notesState.tags,
    folders: notesState.folders,
    readOnly: notesState.readOnly,
    error: notesState.error,
    onSearch: () => setSearchOpen(true),
    onManageTags: () => setTagsOpen(true),
    onSaveFolder: (values, id) => notesState.store.saveFolder(values, id),
    onDeleteFolder: (id) => notesState.store.deleteFolder(id),
  }
  useEffect(() => {
    const shortcut = (event) => {
      if (canOpenSearch(event, document)) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  async function run(operation) {
    if (!(await notesState.store.flush())) return false
    const ok = await operation()
    if (ok) await notesState.store.load()
    return ok
  }
  async function navigate(page) {
    if (busy || notesState.busy || !(await notesState.store.flush())) return false
    setActivePage(page)
    setProjectId(null)
    setModal(null)
    setMenuOpen(false)
    setNoteRequest(null)
    return true
  }
  async function openProject(id) {
    if (busy || notesState.busy || !(await notesState.store.flush())) return false
    setActivePage('projects')
    setProjectId(id)
    setProjectTab('board')
    setModal(null)
    setMenuOpen(false)
    return true
  }
  async function openNote(id) {
    if (busy || !(await notesState.store.flush())) return false
    if (!notesState.store.getSnapshot().notes.some((note) => note.id === id)) return false
    setActivePage('documentation')
    setProjectId(null)
    setModal(null)
    setMenuOpen(false)
    setNoteRequest({ id, requestId: crypto.randomUUID() })
    return true
  }
  async function openTask(id, taskId) {
    if (!(await openProject(id))) return false
    const task = projects.find((item) => item.id === id)?.tasks.find((item) => item.id === taskId)
    if (!task) return false
    setModal({ type: 'task', task })
    return true
  }
  function openModal(value) {
    store.clearMutationError()
    setModal(value)
  }
  function closeModal() {
    if (!busy && !notesState.busy) {
      setModal(null)
      store.clearMutationError()
    }
  }
  async function saveProject(values) {
    const ok = modal.project
      ? await run(() => store.updateProject(modal.project.id, values))
      : await run(() => store.createProject(values))
    if (ok) setModal(null)
  }
  async function saveTask(values) {
    const ok = modal.task
      ? await run(() => store.updateTask(project.id, modal.task.id, values))
      : await run(() => store.createTask(project.id, values))
    if (ok && !modal.task) setModal(null)
    return ok
  }
  async function deleteItem() {
    const deletingProject = modal.type === 'deleteProject'
    const ok = deletingProject
      ? await run(() => store.deleteProject(modal.project.id))
      : await run(() => store.deleteTask(project.id, modal.task.id))
    if (ok) {
      if (deletingProject && modal.project.id === projectId) setProjectId(null)
      setModal(null)
    }
  }
  const documentation = (scope = null) => (
    <Deferred>
      <DocumentationWorkspace
        key={noteRequest?.requestId || scope || 'all-notes'}
        initialNoteId={noteRequest?.id}
        projectScope={scope}
        notesState={notesState}
        projects={projects}
        onOpenTask={openTask}
        organization={organization}
      />
    </Deferred>
  )

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
        onMenuChange={setMenuOpen}
        projects={projects}
        selectedProjectId={projectId}
        onOpenProject={openProject}
      />
      <div className="workspace">
        <header className="workspace-header">
          <button
            id="navigation-toggle"
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
          <button
            type="button"
            className="button secondary"
            aria-label="Open global search"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} /> Search
          </button>
          <span className="workspace-label">
            <span /> Account workspace
          </span>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content${activePage === 'settings' ? ' content-settings' : activePage === 'projects' ? ' content-projects' : activePage === 'documentation' ? ' content-documentation' : ' content-dashboard'}`}
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
                  run(() => store.load())
                }}
              >
                Reload cloud data
              </button>
            </div>
          )}
          {notesState.loading && <p role="status">Loading cloud documentation and organization…</p>}
          {notesState.error && activePage !== 'documentation' && (
            <p className="storage-error" role="alert">
              {notesState.error}
            </p>
          )}
          {notesState.loadError && (
            <button
              type="button"
              className="button secondary"
              onClick={() => notesState.store.load()}
            >
              Reload documentation
            </button>
          )}
          {activePage === 'settings' ? (
            <AccountSettings beforeSignOut={() => notesState.store.flush()} />
          ) : activePage === 'dashboard' ? (
            <Dashboard />
          ) : activePage === 'documentation' ? (
            documentation()
          ) : (
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
                onClick={() => run(() => store.load())}
              >
                Refresh projects
              </button>
              {project ? (
                <ProjectWorkspace
                  project={project}
                  readOnly={readOnly}
                  onBack={() => navigate('projects')}
                  activeTab={projectTab}
                  onTabChange={async (tab) => {
                    if (await notesState.store.flush()) setProjectTab(tab)
                  }}
                  organization={organization}
                  documentation={documentation(project.id)}
                  onEditProject={() => openModal({ type: 'project', project })}
                  onDeleteProject={() => openModal({ type: 'deleteProject', project })}
                  onCreate={() => openModal({ type: 'task' })}
                  onEdit={(task) => openModal({ type: 'task', task })}
                  onDelete={(task) => openModal({ type: 'deleteTask', task })}
                  onMove={(id, status) => run(() => store.moveTask(project.id, id, status))}
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
      {modal?.type === 'task' && !modal.task && (
        <TaskModal
          onSave={saveTask}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {modal?.type === 'task' && detailTask && (
        <Deferred>
          <CloudTaskDetails
            key={detailTask.id}
            task={detailTask}
            project={project}
            projects={projects}
            notesState={notesState}
            organization={organization}
            busy={busy}
            error={mutationError || error}
            onSave={saveTask}
            onClose={closeModal}
            onOpenNote={openNote}
          />
        </Deferred>
      )}
      {modal?.type === 'deleteProject' && (
        <ConfirmModal
          title="Delete project?"
          message={`Delete “${modal.project.name}” and all of its tasks? Its notes will become unassigned and Unfiled; its folders will become general folders. This cannot be undone. Avoid editing this project in other tabs during deletion.`}
          onConfirm={deleteItem}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {modal?.type === 'deleteTask' && (
        <ConfirmModal
          title="Delete task?"
          message={`Delete “${modal.task.title}”? Notes will be kept. This cannot be undone.`}
          onConfirm={deleteItem}
          onClose={closeModal}
          error={mutationError || error}
          busy={busy}
        />
      )}
      {tagsOpen && (
        <TagManager
          busy={notesState.busy}
          initialTag={notesState.tags.find((tag) => tag.id === tagsOpen)}
          tags={notesState.tags}
          readOnly={notesState.readOnly}
          error={notesState.error}
          onSave={(values, id) => notesState.store.saveTag(values, id)}
          onDelete={(id) => notesState.store.deleteTag(id)}
          onClose={() => setTagsOpen(false)}
        />
      )}
      {searchOpen && (
        <Deferred>
          <GlobalSearch
            includeTags
            projects={projects}
            notes={notesState.notes}
            tags={notesState.tags}
            onClose={() => setSearchOpen(false)}
            onNavigate={async (result) => {
              if (result.type === 'Tags') {
                if (!(await notesState.store.flush())) return false
                setTagsOpen(result.id)
                return true
              }
              return result.type === 'Projects'
                ? openProject(result.id)
                : result.type === 'Tasks'
                  ? openTask(result.projectId, result.id)
                  : openNote(result.id)
            }}
          />
        </Deferred>
      )}
    </div>
  )
}
