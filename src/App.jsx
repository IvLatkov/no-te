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
import { createProject, updateProject, removeProject, addTask, editTask, moveTask, removeTask, updateTaskDetails } from './data/projects'
import { createLinkedTaskNote } from './data/taskDocumentation'
import './App.css'
import './projects.css'
import './documentation.css'
import './task-details.css'

const DocumentationWorkspace = lazy(() => import('./components/documentation/DocumentationWorkspace'))
function DocumentationView(props) {
  return <Suspense fallback={<p className="notes-loading" role="status">Opening your notes…</p>}><DocumentationWorkspace {...props} /></Suspense>
}

const pages = {
  dashboard: { label: 'Dashboard', icon: House },
  projects: { label: 'Projects', icon: Layers, description: 'Your projects will live here. A little space for your next big idea.' },
  documentation: { label: 'Documentation', icon: BookOpen, description: 'Your knowledge, thoughtfully organized. Documentation is coming soon.' },
  settings: { label: 'Settings', icon: Settings, description: 'Make this space your own. Workspace settings are coming soon.' },
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [modal, setModal] = useState(null)
  const [projectTab, setProjectTab] = useState('board')
  const [noteRequest, setNoteRequest] = useState(null)
  const { projects, error, commit, readOnly } = useProjects()
  const notesState = useNotes()
  const notesStore = notesState.store
  const selectedProject = projects.find(project => project.id === selectedProjectId)
  const detailProject = modal?.type === 'taskDetails' ? projects.find(project => project.id === modal.projectId) : null
  const detailTask = detailProject?.tasks.find(task => task.id === modal.taskId)
  const page = pages[activePage]

  useEffect(() => {
    if (!readOnly) notesStore.reconcileProjects(projects.map(project => project.id))
  }, [projects, readOnly, notesStore])

  function navigate(id) {
    if (!notesStore.flush()) return
    setActivePage(id)
    setSelectedProjectId(null)
    setModal(null)
    setNoteRequest(null)
    setMenuOpen(false)
  }

  function openNote(noteId) {
    if (!notesStore.flush() || !notesStore.getSnapshot().notes.some(note => note.id === noteId)) return false
    setActivePage('documentation')
    setSelectedProjectId(null)
    setModal(null)
    setMenuOpen(false)
    setNoteRequest({ id: noteId, requestId: crypto.randomUUID() })
    return true
  }

  function openTask(projectId, taskId) {
    if (!notesStore.flush() || !projects.some(project => project.id === projectId && project.tasks.some(task => task.id === taskId))) return false
    setActivePage('projects')
    setSelectedProjectId(projectId)
    setProjectTab('board')
    setModal({ type: 'taskDetails', projectId, taskId })
    setMenuOpen(false)
    return true
  }

  function openProject(id) {
    if (!notesStore.flush()) return
    setActivePage('projects')
    setSelectedProjectId(id)
    setProjectTab('board')
    setModal(null)
    setMenuOpen(false)
  }

  function saveProject(values) {
    const changes = modal.project
      ? list => updateProject(list, modal.project.id, values)
      : list => [...list, createProject(values)]
    if (commit(changes)) setModal(null)
  }

  function saveTask(values) {
    if (commit(list => modal.task
      ? editTask(list, selectedProject.id, modal.task.id, values)
      : addTask(list, selectedProject.id, values))) setModal(null)
  }

  function deleteItem() {
    const deletingProject = modal.type === 'deleteProject'
    if (deletingProject && (notesState.readOnly || !notesStore.flush())) return
    const success = commit(list => deletingProject
      ? removeProject(list, modal.project.id)
      : removeTask(list, selectedProject.id, modal.task.id))
    if (success) {
      if (deletingProject && selectedProjectId === modal.project.id) setSelectedProjectId(null)
      setModal(null)
    }
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar pages={pages} activePage={activePage} onNavigate={navigate} menuOpen={menuOpen} projects={projects} selectedProjectId={selectedProjectId} onOpenProject={openProject} />
      <div className="workspace">
        <header className="workspace-header">
          <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="page-label">{selectedProject?.name ?? page.label}</span>
          <span className="workspace-label"><span /> Personal workspace</span>
        </header>
        <main id="main-content" className={`main-content${activePage === 'projects' ? ' content-projects' : ''}${activePage === 'documentation' ? ' content-documentation' : ''}`} tabIndex={-1}>
          {error && <p className="storage-error" role="alert">{error}</p>}
          {notesState.error && activePage !== 'documentation' && <p className="storage-error" role="alert">{notesState.error}</p>}
          {activePage === 'documentation' ? <DocumentationView key={noteRequest?.requestId || 'all-notes'} initialNoteId={noteRequest?.id} notesState={notesState} projects={projects} onOpenTask={openTask} /> : activePage !== 'projects' ? <EmptyState key={activePage} page={activePage} {...page} /> : selectedProject ?
            <ProjectWorkspace project={selectedProject} readOnly={readOnly} onBack={() => navigate('projects')}
              activeTab={projectTab} onTabChange={tab => { if (notesStore.flush()) setProjectTab(tab) }}
              documentation={<DocumentationView key={selectedProject.id} notesState={notesState} projects={projects} projectScope={selectedProject.id} onOpenTask={openTask} />}
              onEditProject={() => setModal({ type: 'project', project: selectedProject })}
              onDeleteProject={() => setModal({ type: 'deleteProject', project: selectedProject })}
              onCreate={() => setModal({ type: 'task' })}
              onEdit={task => openTask(selectedProject.id, task.id)}
              onDelete={task => setModal({ type: 'deleteTask', task })}
              onMove={(id, status) => commit(list => moveTask(list, selectedProject.id, id, status))} /> :
            <ProjectsPage projects={projects} readOnly={readOnly} onOpen={openProject}
              onCreate={() => setModal({ type: 'project' })}
              onEdit={project => setModal({ type: 'project', project })}
              onDelete={project => setModal({ type: 'deleteProject', project })} />}
        </main>
      </div>
      {modal?.type === 'project' && <ProjectModal project={modal.project} error={error} onSave={saveProject} onClose={() => setModal(null)} />}
      {modal?.type === 'task' && <TaskModal task={modal.task} error={error} onSave={saveTask} onClose={() => setModal(null)} />}
      {detailTask && <TaskDetails key={`${detailProject.id}:${detailTask.id}`} task={detailTask} project={detailProject} projects={projects}
        notes={notesState.notes} notesReadOnly={notesState.readOnly} readOnly={readOnly} error={error} notesError={notesState.error}
        onSave={values => commit(list => updateTaskDetails(list, detailProject.id, detailTask.id, values))}
        onClose={() => setModal(null)} onOpenNote={openNote}
        onCreateNote={(values, existingNoteId) => createLinkedTaskNote({ notesStore, commitProjects: commit, projectId: detailProject.id, taskId: detailTask.id, values, existingNoteId })} />}
      {modal?.type === 'deleteProject' && <ConfirmModal title="Delete project?" error={error || notesState.error} message={`Delete “${modal.project.name}” and all of its tasks? Its documentation notes will be preserved and become unassigned. Project and task deletion cannot be undone.`} onConfirm={deleteItem} onClose={() => setModal(null)} />}
      {modal?.type === 'deleteTask' && <ConfirmModal title="Delete task?" error={error} message={`Delete “${modal.task.title}”? This cannot be undone.`} onConfirm={deleteItem} onClose={() => setModal(null)} />}
    </div>
  )
}
