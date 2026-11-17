import Modal from '../Modal'
import DocumentationWorkspace from '../documentation/DocumentationWorkspace'
import { useRef } from 'react'
import DocumentResizeHandle from './DocumentResizeHandle'
import { resetDocumentSize } from './documentWindow.js'

export default function DashboardNoteModal({ noteId, notesState, projects, organization, onOpenTask, onClose }) {
  const content = useRef(null)
  async function close() {
    if (!notesState.busy && await notesState.store.flush()) onClose()
  }

  return (
    <Modal title="Documentation" className="dashboard-note-dialog" onClose={close} footer={<DocumentResizeHandle />}>
      <div ref={content}>
        <DocumentationWorkspace
          singleNote
          initialNoteId={noteId}
          notesState={notesState}
          projects={projects}
          organization={organization}
          onOpenTask={onOpenTask}
          onExit={close}
          onWidthChange={() => resetDocumentSize(content.current?.closest('dialog'))}
        />
      </div>
    </Modal>
  )
}
