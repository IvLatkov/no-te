import { lazy, Suspense, useEffect, useState } from 'react'
import { BookOpen, Layers, House, Settings, Menu, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import ProjectsPage from './components/ProjectsPage'
import ProjectWorkspace from './components/ProjectWorkspace'
import ProjectModal from './components/ProjectModal'
import TaskModal from './components/TaskModal'
import TaskDetails from './components/TaskDetails'
import ConfirmModal from './components/ConfirmModal'
import useProjects from './hooks/useProjects'
import useNotes from './hooks/useNotes'
import {
  createProject,
  updateProject,
  removeProject,
  addTask,
  editTask,
  moveTask,
  removeTask,
  updateTaskDetails,
} from './data/projects'
import { createLinkedTaskNote } from './data/taskDocumentation'
import useOrganization from './hooks/useOrganization'
import {
  saveFolder,
  folderDeletion,
  moveNotesOutOfFolders,
  saveTag,
  removeTagFromProjects,
  removeTagFromNotes,
} from './data/organization'
import { canOpenSearch } from './data/search'
import GlobalSearch from './components/GlobalSearch'
import TagManager from './components/TagManager'
import { DATA_REVISION_KEY, RECOVERY_KEY, getRecoveryState } from './data/storageSafety'
import './App.css'
import './projects.css'
import './documentation.css'
import './task-details.css'
import './organization.css'
import './settings.css'

const DocumentationWorkspace = lazy(
  () => import('./components/documentation/DocumentationWorkspace'),
)
const SettingsPage = lazy(() => import('./components/SettingsPage'))
function DocumentationView(props) {
  return (
    <Suspense
      fallback={
        <p className="notes-loading" role="status">
          Opening your notes…
        </p>
      }
    >
      <DocumentationWorkspace {...props} />
    </Suspense>
  )
}

const pages = {
  dashboard: { label: 'Dashboard', icon: House },
  projects: {
    label: 'Projects',
    icon: Layers,
    description: 'Your projects will live here. A little space for your next big idea.',
  },
  documentation: {
    label: 'Documentation',
    icon: BookOpen,
    description: 'Your knowledge, thoughtfully organized. Documentation is coming soon.',
  },
  settings: {
    label: 'Settings',
    icon: Settings,
    description: 'Make this space your own. Workspace settings are coming soon.',
  },
}

function AppSession({ initialPage = 'dashboard', feedback, onSessionReset }) {
  const [recovery, setRecovery] = useState(() => getRecoveryState())
  const [stale, setStale] = useState(false)
  const [activePage, setActivePage] = useState(recovery.pending ? 'settings' : initialPage)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [modal, setModal] = useState(null)
  const [projectTab, setProjectTab] = useState('board')
  const [noteRequest, setNoteRequest] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [organizationError, setOrganizationError] = useState('')
  const org = useOrganization()
  const { projects, error, commit, readOnly } = useProjects()
  const notesState = useNotes()
  const notesStore = notesState.store
  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const detailProject =
    modal?.type === 'taskDetails'
      ? projects.find((project) => project.id === modal.projectId)
      : null
  const detailTask = detailProject?.tasks.find((task) => task.id === modal.taskId)
  const page = pages[activePage]
  const storageLocked = recovery.pending || stale

  useEffect(() => {
    if (!readOnly && !storageLocked)
      notesStore.reconcileProjects(projects.map((project) => project.id))
  }, [projects, readOnly, notesStore, storageLocked])

  useEffect(() => {
    if (readOnly || org.readOnly || storageLocked) return
    const ids = new Set(projects.map((project) => project.id))
    if (org.folders.some((folder) => folder.projectId && !ids.has(folder.projectId))) {
      org.commit((data) => ({
        ...data,
        folders: data.folders.map((folder) =>
          folder.projectId && !ids.has(folder.projectId) ? { ...folder, projectId: null } : folder,
        ),
      }))
    }
  }, [projects, readOnly, org.folders, org.readOnly, storageLocked])

  useEffect(() => {
    const changed = (event) => {
      if (event.key !== DATA_REVISION_KEY && event.key !== RECOVERY_KEY) return
      notesStore.retire()
      setStale(true)
      setRecovery(getRecoveryState())
      setActivePage('settings')
      setSelectedProjectId(null)
      setModal(null)
      setSearchOpen(false)
      setTagManagerOpen(false)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [notesStore])

  useEffect(() => {
    const shortcut = (event) => {
      if (!storageLocked && canOpenSearch(event, document)) {
        event.preventDefault()
        setMenuOpen(false)
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [storageLocked])

  function replaceSessionData(operation, { recovering = false } = {}) {
    let prepared = false
    let result
    try {
      result = operation(() => {
        if (!recovering && !notesStore.flush()) return false
        notesStore.retire()
        prepared = true
        return true
      })
    } catch (failure) {
      result = { ok: false, message: failure.message || 'Data replacement could not complete.' }
    }
    // A fresh component session recreates every data hook and clears selections,
    // dialogs, filters, and stale refs. The retired notes store cannot write on cleanup.
    if (prepared) onSessionReset({ kind: result.ok ? 'success' : 'error', message: result.message })
    return result
  }

  function deleteFolder(id) {
    if (notesState.readOnly || org.readOnly) {
      setOrganizationError('Notes and folders must be readable before deleting a folder.')
      return false
    }
    if (!notesStore.flush()) return false
    try {
      const deletion = folderDeletion(org.folders, id)
      if (!notesStore.transform((notes) => moveNotesOutOfFolders(notes, deletion))) return false
      return org.commit((data) => ({ ...data, folders: deletion.folders }))
    } catch (failure) {
      setOrganizationError(failure.message)
      return false
    }
  }

  function deleteTag(id) {
    if (readOnly || notesState.readOnly || org.readOnly) {
      setOrganizationError('Projects, notes, and tags must be readable before deleting a tag.')
      return false
    }
    if (!notesStore.flush() || !commit((list) => removeTagFromProjects(list, id))) return false
    if (!notesStore.transform((notes) => removeTagFromNotes(notes, id))) return false
    return org.commit((data) => ({ ...data, tags: data.tags.filter((tag) => tag.id !== id) }))
  }

  const organization = {
    ...org,
    onSearch: () => {
      if (!storageLocked) setSearchOpen(true)
    },
    error: org.error || organizationError,
    onManageTags: () => {
      setOrganizationError('')
      setTagManagerOpen(true)
    },
    onSaveFolder: (values, id) => {
      setOrganizationError('')
      return org.commit((data) => ({ ...data, folders: saveFolder(data.folders, values, id) }))
    },
    onDeleteFolder: (id) => {
      setOrganizationError('')
      return deleteFolder(id)
    },
  }

  function navigate(id) {
    if (storageLocked && id !== 'settings') return false
    if (!notesStore.flush()) return
    setActivePage(id)
    setSelectedProjectId(null)
    setModal(null)
    setNoteRequest(null)
    setMenuOpen(false)
    return true
  }

  function openNote(noteId) {
    if (storageLocked) return false
    if (!notesStore.flush() || !notesStore.getSnapshot().notes.some((note) => note.id === noteId))
      return false
    setActivePage('documentation')
    setSelectedProjectId(null)
    setModal(null)
    setMenuOpen(false)
    setNoteRequest({ id: noteId, requestId: crypto.randomUUID() })
    return true
  }

  function openTask(projectId, taskId) {
    if (storageLocked) return false
    if (
      !notesStore.flush() ||
      !projects.some(
        (project) => project.id === projectId && project.tasks.some((task) => task.id === taskId),
      )
    )
      return false
    setActivePage('projects')
    setSelectedProjectId(projectId)
    setProjectTab('board')
    setModal({ type: 'taskDetails', projectId, taskId })
    setMenuOpen(false)
    return true
  }

  function openProject(id) {
    if (storageLocked) return false
    if (!notesStore.flush()) return
    setActivePage('projects')
    setSelectedProjectId(id)
    setProjectTab('board')
    setModal(null)
    setMenuOpen(false)
    return true
  }

  function saveProject(values) {
    const changes = modal.project
      ? (list) => updateProject(list, modal.project.id, values)
      : (list) => [...list, createProject(values)]
    if (commit(changes)) setModal(null)
  }

  function saveTask(values) {
    if (
      commit((list) =>
        modal.task
          ? editTask(list, selectedProject.id, modal.task.id, values)
          : addTask(list, selectedProject.id, values),
      )
    )
      setModal(null)
  }

  function deleteItem() {
    const deletingProject = modal.type === 'deleteProject'
    if (deletingProject && (notesState.readOnly || !notesStore.flush())) return
    const success = commit((list) =>
      deletingProject
        ? removeProject(list, modal.project.id)
        : removeTask(list, selectedProject.id, modal.task.id),
    )
    if (success) {
      if (deletingProject && selectedProjectId === modal.project.id) setSelectedProjectId(null)
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
        onMenuChange={setMenuOpen}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onOpenProject={openProject}
        onSearch={() => setSearchOpen(true)}
        searchDisabled={storageLocked}
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
          <span className="page-label">{selectedProject?.name ?? page.label}</span>
          <span className="workspace-label">
            <span /> Personal workspace
          </span>
        </header>
        <main
          id="main-content"
          className={`main-content${activePage === 'projects' ? ' content-projects' : ''}${activePage === 'documentation' ? ' content-documentation' : ''}${activePage === 'settings' ? ' content-settings' : ''}`}
          tabIndex={-1}
        >
          {error && (
            <p className="storage-error" role="alert">
              {error}
            </p>
          )}
          {org.error && activePage !== 'documentation' && (
            <p className="storage-error" role="alert">
              {org.error}
            </p>
          )}
          {notesState.error && activePage !== 'documentation' && (
            <p className="storage-error" role="alert">
              {notesState.error}
            </p>
          )}
          {activePage === 'settings' ? (
            <Suspense
              fallback={
                <p className="notes-loading" role="status">
                  Opening Settings…
                </p>
              }
            >
              <SettingsPage
                recovery={recovery}
                stale={stale}
                feedback={feedback}
                onReplaceData={replaceSessionData}
                onLoadCurrentData={() => onSessionReset(null)}
              />
            </Suspense>
          ) : activePage === 'documentation' ? (
            <DocumentationView
              key={noteRequest?.requestId || 'all-notes'}
              initialNoteId={noteRequest?.id}
              notesState={notesState}
              projects={projects}
              onOpenTask={openTask}
              organization={organization}
            />
          ) : activePage !== 'projects' ? (
            <EmptyState key={activePage} page={activePage} {...page} />
          ) : selectedProject ? (
            <ProjectWorkspace
              project={selectedProject}
              readOnly={readOnly}
              onBack={() => navigate('projects')}
              activeTab={projectTab}
              onTabChange={(tab) => {
                if (notesStore.flush()) setProjectTab(tab)
              }}
              organization={organization}
              documentation={
                <DocumentationView
                  key={selectedProject.id}
                  notesState={notesState}
                  projects={projects}
                  projectScope={selectedProject.id}
                  onOpenTask={openTask}
                  organization={organization}
                />
              }
              onEditProject={() => setModal({ type: 'project', project: selectedProject })}
              onDeleteProject={() => setModal({ type: 'deleteProject', project: selectedProject })}
              onCreate={() => setModal({ type: 'task' })}
              onEdit={(task) => openTask(selectedProject.id, task.id)}
              onDelete={(task) => setModal({ type: 'deleteTask', task })}
              onMove={(id, status) =>
                commit((list) => moveTask(list, selectedProject.id, id, status))
              }
            />
          ) : (
            <ProjectsPage
              projects={projects}
              readOnly={readOnly}
              onOpen={openProject}
              onCreate={() => setModal({ type: 'project' })}
              onEdit={(project) => setModal({ type: 'project', project })}
              onDelete={(project) => setModal({ type: 'deleteProject', project })}
            />
          )}
        </main>
      </div>
      {modal?.type === 'project' && (
        <ProjectModal
          project={modal.project}
          error={error}
          onSave={saveProject}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'task' && (
        <TaskModal
          task={modal.task}
          error={error}
          onSave={saveTask}
          onClose={() => setModal(null)}
        />
      )}
      {detailTask && (
        <TaskDetails
          key={`${detailProject.id}:${detailTask.id}`}
          task={detailTask}
          project={detailProject}
          projects={projects}
          notes={notesState.notes}
          notesReadOnly={notesState.readOnly}
          readOnly={readOnly}
          error={error}
          notesError={notesState.error}
          organization={organization}
          onSave={(values) =>
            commit((list) =>
              updateTaskDetails(list, detailProject.id, detailTask.id, {
                ...values,
                tagIds: org.readOnly
                  ? values.tagIds
                  : (values.tagIds || []).filter((id) => org.tags.some((tag) => tag.id === id)),
              }),
            )
          }
          onClose={() => setModal(null)}
          onOpenNote={openNote}
          onCreateNote={(values, existingNoteId) =>
            createLinkedTaskNote({
              notesStore,
              commitProjects: commit,
              projectId: detailProject.id,
              taskId: detailTask.id,
              values,
              existingNoteId,
            })
          }
        />
      )}
      {modal?.type === 'deleteProject' && (
        <ConfirmModal
          title="Delete project?"
          error={error || notesState.error}
          message={`Delete “${modal.project.name}” and all of its tasks? Its documentation notes will be preserved and become unassigned. Project and task deletion cannot be undone.`}
          onConfirm={deleteItem}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'deleteTask' && (
        <ConfirmModal
          title="Delete task?"
          error={error}
          message={`Delete “${modal.task.title}”? This cannot be undone.`}
          onConfirm={deleteItem}
          onClose={() => setModal(null)}
        />
      )}
      {searchOpen && (
        <GlobalSearch
          projects={projects}
          notes={notesState.notes}
          tags={org.tags}
          onClose={() => setSearchOpen(false)}
          onNavigate={(result) =>
            result.type === 'Projects'
              ? openProject(result.id)
              : result.type === 'Tasks'
                ? openTask(result.projectId, result.id)
                : openNote(result.id)
          }
        />
      )}
      {tagManagerOpen && (
        <TagManager
          tags={org.tags}
          readOnly={org.readOnly}
          error={organization.error || error || notesState.error}
          onClose={() => setTagManagerOpen(false)}
          onSave={(values, id) => {
            setOrganizationError('')
            return org.commit((data) => ({ ...data, tags: saveTag(data.tags, values, id) }))
          }}
          onDelete={(id) => {
            setOrganizationError('')
            return deleteTag(id)
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState({
    generation: 0,
    initialPage: 'dashboard',
    feedback: null,
  })
  return (
    <AppSession
      key={session.generation}
      initialPage={session.initialPage}
      feedback={session.feedback}
      onSessionReset={(feedback) =>
        setSession((current) => ({
          generation: current.generation + 1,
          initialPage: 'settings',
          feedback,
        }))
      }
    />
  )
}
