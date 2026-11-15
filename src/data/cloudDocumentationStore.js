import { createDocumentationApi } from './supabaseDocumentation.js'
import { validateNoteFolder } from './organization.js'

const empty = () => ({
  notes: [],
  folders: [],
  tags: [],
  task_notes: [],
  task_tags: [],
  note_tags: [],
  loading: true,
  busy: false,
  readOnly: true,
  status: 'saved',
  error: '',
  loadError: '',
})

export function createCloudDocumentationStore(client, userId, { delay = 500 } = {}) {
  const api = createDocumentationApi(client, userId)
  let snapshot = empty()
  let active = true
  let epoch = 0
  let timer
  let draining
  let locked = false
  let loadVersion = 0
  const dirty = new Map()
  const creates = new Map()
  const listeners = new Set()
  const controllers = new Set()
  const publish = (patch) => {
    if (active) {
      snapshot = { ...snapshot, ...patch }
      listeners.forEach((listener) => listener())
    }
  }
  const options = () => {
    const request = new AbortController()
    controllers.add(request)
    return { signal: request.signal }
  }
  const current = (version) => active && epoch === version
  function decorated(notes, relationships = snapshot.note_tags) {
    return notes.map((note) => ({
      ...note,
      tagIds: relationships.filter((row) => row.note_id === note.id).map((row) => row.tag_id),
      ...dirty.get(note.id)?.patch,
    }))
  }
  async function load({ quiet = false } = {}) {
    if (!active) return false
    if (quiet && (locked || draining || dirty.size || snapshot.loading || snapshot.busy)) return false
    if (draining && !(await draining)) return false
    if (!active) return false
    const version = epoch
    const request = ++loadVersion
    const opt = options()
    if (!quiet) publish({ loading: true })
    try {
      const [notes, folders, tags, links] = await Promise.all([
        api.fetchNotes(opt),
        api.fetchFolders(opt),
        api.fetchTags(opt),
        api.fetchRelationships(opt),
      ])
      if (!current(version) || request !== loadVersion) return false
      // Drafts are never replaced by a read finishing after the user has typed.
      const missingDrafts = snapshot.notes.filter(
        (note) => dirty.has(note.id) && !notes.some((row) => row.id === note.id),
      )
      publish({
        notes: [...decorated(notes, links.note_tags), ...missingDrafts],
        folders,
        tags,
        ...links,
        loading: false,
        readOnly: false,
        loadError: '',
        error: dirty.size ? snapshot.error : '',
      })
      return true
    } catch (failure) {
      if (current(version) && request === loadVersion)
        publish({
          loading: false,
          readOnly: quiet ? snapshot.readOnly : true,
          loadError: failure.message,
          error: failure.message,
        })
      return false
    } finally {
      for (const item of controllers) if (item.signal === opt.signal) controllers.delete(item)
    }
  }
  function update(id, changes) {
    if (!active || snapshot.readOnly || locked || !snapshot.notes.some((note) => note.id === id))
      return false
    const patch = {
      ...dirty.get(id)?.patch,
      ...Object.fromEntries(
        Object.entries(changes).filter(([key]) =>
          ['title', 'content', 'projectId', 'folderId', 'tagIds'].includes(key),
        ),
      ),
    }
    dirty.set(id, { patch: structuredClone(patch) })
    publish({
      notes: snapshot.notes.map((note) => (note.id === id ? { ...note, ...changes } : note)),
      status: draining ? 'saving' : 'unsaved',
      error: '',
    })
    clearTimeout(timer)
    timer = setTimeout(() => {
      void flush()
    }, delay)
    return true
  }
  function flush() {
    clearTimeout(timer)
    if (!active) return Promise.resolve(false)
    if (draining) return draining
    if (!dirty.size) return Promise.resolve(true)
    if (snapshot.readOnly) return Promise.resolve(false)
    const version = epoch
    const opt = options()
    // A read started before this write cannot replace its acknowledged result.
    ++loadVersion
    publish({ status: 'saving', error: '', loading: false })
    draining = (async () => {
      try {
        while (dirty.size && current(version)) {
          const [id, draft] = dirty.entries().next().value
          const { tagIds, ...patch } = draft.patch
          let saved = snapshot.notes.find((note) => note.id === id)
          if (Object.keys(patch).length) saved = await api.updateNote(id, patch, opt)
          if (tagIds) await api.setRelationships('note_tags', id, tagIds, opt)
          if (!current(version)) return false
          if (dirty.get(id) === draft) dirty.delete(id)
          const ids = tagIds ?? snapshot.notes.find((note) => note.id === id)?.tagIds ?? []
          publish({
            notes: snapshot.notes.map((note) =>
              note.id === id ? { ...saved, tagIds: ids, ...dirty.get(id)?.patch } : note,
            ),
            note_tags: tagIds
              ? [
                  ...snapshot.note_tags.filter((row) => row.note_id !== id),
                  ...tagIds.map((tag_id) => ({ note_id: id, tag_id })),
                ]
              : snapshot.note_tags,
          })
        }
        if (!current(version)) return false
        publish({ status: 'saved', error: snapshot.loadError || '' })
        return true
      } catch (failure) {
        if (current(version))
          publish({
            status: 'error',
            error: `${failure.message} Your unsaved draft remains open; retry before leaving.`,
          })
        return false
      } finally {
        for (const item of controllers) if (item.signal === opt.signal) controllers.delete(item)
        if (current(version)) draining = undefined
      }
    })()
    return draining
  }
  async function action(operation) {
    if (!active || locked || snapshot.readOnly || !(await flush())) return null
    if (locked) return null
    locked = true
    const version = epoch
    ++loadVersion
    const opt = options()
    publish({ busy: true, error: '' })
    try {
      const result = await operation(opt)
      if (!current(version)) return null
      const refreshed = await load()
      if (!current(version)) return null
      if (!refreshed)
        publish({ error: `The write completed, but reload failed. ${snapshot.loadError}` })
      return result ?? true
    } catch (failure) {
      if (current(version)) {
        await load()
        publish({
          error: `${failure.message} Some steps may have completed. Reload/retry to reconcile; no automatic rollback deletes records.`,
        })
      }
      return null
    } finally {
      for (const item of controllers) if (item.signal === opt.signal) controllers.delete(item)
      if (current(version)) {
        locked = false
        publish({ busy: false })
      }
    }
  }
  async function create(values, key = 'new-note') {
    const signature = JSON.stringify(values)
    let pending = creates.get(key)
    if (!pending || pending.signature !== signature) {
      pending = { signature, id: crypto.randomUUID() }
      creates.set(key, pending)
    }
    return action(async (opt) => {
      const note = await api.createNote(values, { ...opt, id: pending.id })
      if (values.tagIds?.length)
        await api.setRelationships('note_tags', note.id, values.tagIds, opt)
      creates.delete(key)
      return note
    })
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      active = true
      return load()
    },
    load,
    update,
    flush,
    create,
    hasUnsaved: () => dirty.size > 0,
    moveNote: (id, folderId) =>
      action(async (opt) => {
        const note = snapshot.notes.find((item) => item.id === id)
        if (!note) throw new Error('This note is unavailable. Reload before moving it.')
        // Revalidate against owned server folders, not just a possibly stale tree.
        const folders = await api.fetchFolders(opt)
        validateNoteFolder({ ...note, folderId }, folders)
        if ((note.folderId || null) === folderId) return note
        const saved = await api.updateNote(id, { folderId }, opt)
        if (!opt.signal.aborted)
          publish({
            notes: snapshot.notes.map((item) => (item.id === id ? { ...item, ...saved } : item)),
          })
        return saved
      }),
    duplicate(id) {
      const note = snapshot.notes.find((item) => item.id === id)
      return note
        ? create(
            {
              title: `${(note.title || 'Untitled note').slice(0, 193)} (copy)`,
              content: note.content,
              projectId: note.projectId,
              folderId: note.folderId,
              tagIds: note.tagIds,
            },
            `duplicate:${id}`,
          )
        : Promise.resolve(null)
    },
    remove: (id) => action((opt) => api.deleteNote(id, opt)),
    saveFolder: (values, id) => action((opt) => api.saveFolder(values, id, opt)),
    deleteFolder: (id) => action((opt) => api.deleteFolder(id, opt)),
    saveTag: (values, id) => action((opt) => api.saveTag(values, id, opt)),
    deleteTag: (id) => action((opt) => api.deleteTag(id, opt)),
    setRelationships: (table, id, ids) =>
      action((opt) => api.setRelationships(table, id, ids, opt)),
    dispose() {
      active = false
      epoch += 1
      loadVersion += 1
      clearTimeout(timer)
      controllers.forEach((request) => request.abort())
      controllers.clear()
      dirty.clear()
      creates.clear()
      draining = undefined
      locked = false
      snapshot = empty()
    },
  }
}
