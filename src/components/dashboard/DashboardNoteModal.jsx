import Modal from '../Modal'
import DocumentationWorkspace from '../documentation/DocumentationWorkspace'

export default function DashboardNoteModal({ noteId, notesState, projects, organization, onOpenTask, onClose }) {
  async function close() {
    if (!notesState.busy && await notesState.store.flush()) onClose()
  }

  return (
    <Modal title="Documentation" className="dashboard-note-dialog" onClose={close}>
      <DocumentationWorkspace
        singleNote
        initialNoteId={noteId}
        notesState={notesState}
        projects={projects}
        organization={organization}
        onOpenTask={onOpenTask}
        onExit={close}
      />
    </Modal>
  )
}
