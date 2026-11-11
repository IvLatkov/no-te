import { createNote, duplicateNote, loadNotes, saveNotes, unassignMissingProjects } from './notes.js'

// The only timer writes the current snapshot, never a captured note or array.
// Generation checks also invalidate callbacks which were already queued.
export function createNotesStore({ storage, delay = 500, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let snapshot
  try { snapshot = { notes: loadNotes(storage), status: 'saved', error: '', readOnly: false } }
  catch { snapshot = { notes: [], status: 'error', error: 'Notes could not be loaded. Saved data has been preserved. Check browser storage and reload to try again.', readOnly: true } }
  let timer
  let generation = 0
  let dirty = false
  const listeners = new Set()
  function publish(patch) {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach(listener => listener())
  }
  function clearTimer() { cancel(timer); timer = undefined; generation += 1 }
  function persist(notes) {
    if (snapshot.readOnly) return false
    clearTimer()
    try {
      saveNotes(notes, storage)
      dirty = false
      publish({ notes, status: 'saved', error: '' })
      return true
    } catch {
      publish({ status: 'error', error: 'Notes could not be saved. Your draft is still open. Check browser storage space or access, then retry.' })
      return false
    }
  }
  function flush() {
    clearTimer()
    return !dirty || persist(snapshot.notes)
  }
  function update(id, changes) {
    if (snapshot.readOnly || !snapshot.notes.some(note => note.id === id)) return false
    const allowed = Object.fromEntries(Object.entries(changes).filter(([key]) => ['title', 'content', 'projectId'].includes(key)))
    const notes = snapshot.notes.map(note => note.id === id ? { ...note, ...allowed, updatedAt: new Date().toISOString() } : note)
    dirty = true
    clearTimer()
    publish({ notes, status: 'saving', error: '' })
    const token = generation
    timer = schedule(() => { if (token === generation) flush() }, delay)
    return true
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    update,
    flush,
    create(values) {
      const note = createNote(values)
      return persist([...snapshot.notes, note]) ? note : null
    },
    duplicate(id) {
      const original = snapshot.notes.find(note => note.id === id)
      if (!original) return null
      const note = duplicateNote(original)
      return persist([...snapshot.notes, note]) ? note : null
    },
    remove(id) { return persist(snapshot.notes.filter(note => note.id !== id)) },
    reconcileProjects(ids) {
      if (snapshot.readOnly) return false
      const notes = unassignMissingProjects(snapshot.notes, ids)
      if (notes.every((note, index) => note === snapshot.notes[index])) return true
      // Keep the safe association in memory even if the storage write fails.
      // On refresh, reconciliation repeats using the surviving project IDs.
      dirty = true
      publish({ notes })
      return persist(notes)
    },
  }
}
