import { linkTaskNotes, normalizeTask } from './projects.js'
import { isArchivedTask } from './taskWorkflow.js'

export function linkedNotesForTask(task, notes) {
  const ids = new Set(normalizeTask(task).linkedNoteIds)
  // Deleted/missing notes are ignored, without modifying unrelated task data.
  return notes.filter(note => ids.has(note.id))
}

export function tasksForNote(projects, noteId) {
  return projects.flatMap(project => project.tasks
    .filter(task => normalizeTask(task).linkedNoteIds.includes(noteId))
    .map(task => ({ projectId: project.id, projectName: project.name, taskId: task.id, title: task.title, status: task.status, isArchived: isArchivedTask(task) })))
}

export function filterDocumentation(notes, projects, filter = 'all') {
  if (filter === 'all') return notes
  const linked = new Set(projects.flatMap((project) => project.tasks.flatMap((task) => task.linkedNoteIds || [])))
  return notes.filter((note) => filter === 'task-linked' ? linked.has(note.id) : !linked.has(note.id))
}

// A note is saved first. If linking fails, return it for an idempotent retry;
// never delete documentation or create a second note to hide a partial failure.
export function createLinkedTaskNote({ notesStore, commitProjects, projectId, taskId, values, existingNoteId }) {
  if (!notesStore.flush()) return { note: null, linked: false }
  const note = existingNoteId
    ? notesStore.getSnapshot().notes.find(item => item.id === existingNoteId)
    : notesStore.create({ ...values, projectId })
  if (!note) return { note: null, linked: false }
  let found = false
  const saved = commitProjects(projects => {
    found = Boolean(projects.find(project => project.id === projectId)?.tasks.some(task => task.id === taskId))
    return linkTaskNotes(projects, projectId, taskId, [note.id])
  })
  return { note, linked: saved && found }
}
