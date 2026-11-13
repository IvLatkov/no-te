import { useRef, useState } from 'react'
import TaskModal from './TaskModal'
import TagSelector from './TagSelector'
import NoteLinkPicker from './NoteLinkPicker'
import NoteModal from './documentation/NoteModal'
import Modal from './Modal'

export default function CloudTaskDetails({
  task,
  project,
  projects,
  notesState,
  organization,
  busy,
  error,
  onSave,
  onClose,
  onOpenNote,
}) {
  const [linking, setLinking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pendingNote, setPendingNote] = useState(null)
  const [saving, setSaving] = useState(false)
  const destination = useRef(null)
  const { store, notes } = notesState
  const links = task.linkedNoteIds ?? []
  const formBusy = busy || saving || notesState.busy
  const locked = formBusy || notesState.readOnly
  async function link(ids) {
    const ok = await store.setRelationships('task_notes', task.id, [...new Set([...links, ...ids])])
    if (ok) setLinking(false)
    return ok
  }
  async function create(values) {
    const note =
      pendingNote || (await store.create({ ...values, projectId: project.id }, `task:${task.id}`))
    if (!note) return
    setPendingNote(note)
    if (await link([note.id])) {
      setPendingNote(null)
      setCreating(false)
    }
  }
  return (
    <>
      <TaskModal
        task={task}
        details
        busy={formBusy}
        error={error || notesState.error}
        onClose={onClose}
        onSave={async (values) => {
          setSaving(true)
          const ok = await onSave(values)
          setSaving(false)
          if (ok) {
            if (destination.current) {
              const id = destination.current
              destination.current = null
              await onOpenNote(id)
            } else onClose()
          }
        }}
      >
        <TagSelector
          tags={organization.tags}
          value={task.tagIds || []}
          disabled={locked}
          onManage={organization.onManageTags}
          onChange={(ids) => store.setRelationships('task_tags', task.id, ids)}
        />
        <section className="task-documentation" aria-labelledby="cloud-linked-documentation">
          <div className="task-section-heading">
            <h3 id="cloud-linked-documentation">Linked documentation</h3>
            <div className="task-section-actions">
              <button
                type="button"
                className="text-action"
                disabled={locked}
                onClick={() => setLinking(true)}
              >
                Link Note
              </button>
              <button
                type="button"
                className="text-action"
                disabled={locked}
                onClick={() => setCreating(true)}
              >
                Create Note
              </button>
            </div>
          </div>
          <div className="task-linked-notes">
            {notes
              .filter((note) => links.includes(note.id))
              .map((note) => (
                <div className="task-linked-note" key={note.id}>
                  <button
                    type="button"
                    className="linked-note-open"
                    disabled={locked}
                    aria-label={`Open note ${note.title}`}
                    onClick={(event) => {
                      destination.current = note.id
                      event.currentTarget.closest('form').requestSubmit()
                    }}
                  >
                    {note.title}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={locked}
                    aria-label={`Unlink note ${note.title}`}
                    onClick={() =>
                      store.setRelationships(
                        'task_notes',
                        task.id,
                        links.filter((id) => id !== note.id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            {!links.length && (
              <p className="task-section-empty">
                Link a note to keep useful context close to the task.
              </p>
            )}
          </div>
        </section>
      </TaskModal>
      {linking && (
        <NoteLinkPicker
          busy={notesState.busy}
          notes={notes}
          projects={projects}
          projectId={project.id}
          linkedIds={links}
          onLink={link}
          onClose={() => setLinking(false)}
          error={notesState.error}
        />
      )}
      {creating &&
        (pendingNote ? (
          <Modal
            title="Link created note"
            error={notesState.error}
            onClose={() => setCreating(false)}
          >
            <p>
              “{pendingNote.title}” is saved, but linking did not finish. Retry linking this
              existing note.
            </p>
            <button
              type="button"
              className="button primary"
              disabled={locked}
              onClick={() => create({})}
            >
              Retry linking
            </button>
          </Modal>
        ) : (
          <NoteModal
            busy={notesState.busy}
            projects={projects}
            projectId={project.id}
            lockProject
            folders={organization.folders}
            onSave={create}
            onClose={() => setCreating(false)}
            error={notesState.error}
          />
        ))}
    </>
  )
}
