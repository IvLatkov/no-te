import { supabase } from '../lib/supabaseClient.js'
import {
  cloudResult,
  cloudRows,
  requireCloudUser,
  requiredText,
  optionalText,
} from './cloudRequest.js'
import { EMPTY_DOCUMENT } from './notes.js'
import {
  TAG_COLORS,
  validateFolders,
  validateNoteFolder,
  folderDeletion,
  folderDepth,
} from './organization.js'

const fields = {
  notes: 'id,user_id,project_id,folder_id,title,content,created_at,updated_at',
  folders: 'id,user_id,project_id,parent_folder_id,name,created_at,updated_at',
  tags: 'id,user_id,name,color,created_at,updated_at',
}
const model = (table, row) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(table === 'notes'
    ? { title: row.title, content: row.content, projectId: row.project_id, folderId: row.folder_id }
    : table === 'folders'
      ? { name: row.name, projectId: row.project_id, parentFolderId: row.parent_folder_id }
      : { name: row.name, color: row.color }),
})

export function createDocumentationApi(client = supabase, userId) {
  const table = (name) => client.schema('public').from(name)
  const authorize = (signal) => requireCloudUser(client, userId, signal)
  async function fetchOwned(name, { signal = new AbortController().signal, projectId } = {}) {
    await authorize(signal)
    const rows = await cloudRows(
      () => {
        let query = table(name).select(fields[name], { count: 'exact' }).eq('user_id', userId)
        if (projectId !== undefined)
          query =
            projectId === null ? query.is('project_id', null) : query.eq('project_id', projectId)
        return query.order('created_at').order('id')
      },
      signal,
      name,
    )
    return rows.map((row) => model(name, row))
  }
  async function owned(name, id, signal) {
    let query = table(name).select('id').eq('id', id)
    if (name !== 'tasks') query = query.eq('user_id', userId)
    await cloudResult(query.single(), signal, name, 'SELECT', true)
  }
  function notePatch(input) {
    const patch = {}
    if ('title' in input) patch.title = optionalText(input.title, 'note title', 200)
    if ('projectId' in input) patch.project_id = input.projectId || null
    if ('folderId' in input) patch.folder_id = input.folderId || null
    if ('content' in input) {
      // JSON remains JSONB, never HTML. The existing editor validates supported
      // formatting and disables unsupported documents without rewriting them.
      if (input.content?.type !== 'doc' || !Array.isArray(input.content.content))
        throw new Error('Provide a Tiptap JSON document.')
      try {
        JSON.stringify(input.content)
      } catch {
        throw new Error('Note content must be serializable JSON.')
      }
      patch.content = structuredClone(input.content)
    }
    return patch
  }
  async function insertOwned(name, values, signal) {
    // Retry the same client-generated UUID after an uncertain network outcome.
    try {
      return await cloudResult(
        table(name).insert(values).select(fields[name]).single(),
        signal,
        name,
        'INSERT',
        true,
      )
    } catch (failure) {
      if (failure.code !== '23505') throw failure
      const existing = await cloudResult(
        table(name).select(fields[name]).eq('id', values.id).eq('user_id', userId).maybeSingle(),
        signal,
        name,
        'SELECT',
      )
      if (!existing) throw failure
      return existing
    }
  }
  const api = {
    fetchNotes: (options) => fetchOwned('notes', options),
    fetchFolders: (options) => fetchOwned('folders', options),
    fetchTags: (options) => fetchOwned('tags', options),
    async createNote(
      input,
      { signal = new AbortController().signal, id = crypto.randomUUID() } = {},
    ) {
      await authorize(signal)
      if (input.projectId) await owned('projects', input.projectId, signal)
      const folders = input.folderId ? await api.fetchFolders({ signal }) : []
      validateNoteFolder(input, folders)
      return model(
        'notes',
        await insertOwned(
          'notes',
          {
            id,
            ...notePatch({
              title: input.title?.trim() || 'Untitled note',
              content: input.content ?? EMPTY_DOCUMENT,
              projectId: input.projectId ?? null,
              folderId: input.folderId ?? null,
            }),
          },
          signal,
        ),
      )
    },
    async updateNote(id, input, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      const patch = notePatch(input)
      return model(
        'notes',
        await cloudResult(
          table('notes')
            .update(patch)
            .eq('id', id)
            .eq('user_id', userId)
            .select(fields.notes)
            .single(),
          signal,
          'notes',
          'UPDATE',
          true,
        ),
      )
    },
    async deleteNote(id, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      await cloudResult(
        table('notes').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle(),
        signal,
        'notes',
        'DELETE',
        true,
      )
    },
    async saveFolder(input, id, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      const folders = await api.fetchFolders({ signal })
      const previous = folders.find((folder) => folder.id === id)
      if (id && !previous) throw new Error('This folder is unavailable.')
      const next = {
        id: id || crypto.randomUUID(),
        name: requiredText(input.name, 'folder name', 100),
        projectId: 'projectId' in input ? input.projectId || null : (previous?.projectId ?? null),
        parentFolderId:
          'parentFolderId' in input
            ? input.parentFolderId || null
            : (previous?.parentFolderId ?? null),
      }
      validateFolders(
        previous ? folders.map((folder) => (folder.id === id ? next : folder)) : [...folders, next],
      )
      if (next.projectId) await owned('projects', next.projectId, signal)
      const values = {
        name: next.name,
        project_id: next.projectId,
        parent_folder_id: next.parentFolderId,
      }
      const row = id
        ? await cloudResult(
            table('folders')
              .update(values)
              .eq('id', id)
              .eq('user_id', userId)
              .select(fields.folders)
              .single(),
            signal,
            'folders',
            'UPDATE',
            true,
          )
        : await insertOwned('folders', { id: next.id, ...values }, signal)
      return model('folders', row)
    },
    async deleteFolder(id, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      const folders = await api.fetchFolders({ signal })
      const notes = await api.fetchNotes({ signal })
      const deletion = folderDeletion(folders, id)
      // Relocate notes before deleting any folder; never rely on an unknown
      // notes.folder_id cascade to preserve documentation. Partial progress is
      // durable and reported, not rolled back with destructive compensations.
      const moved = notes.filter((note) => deletion.ids.has(note.folderId))
      try {
        for (const note of moved)
          await api.updateNote(note.id, { folderId: deletion.destination }, { signal })
        const remaining = await api.fetchNotes({ signal })
        if (remaining.some((note) => deletion.ids.has(note.folderId)))
          throw new Error('Some notes still reference this folder. Reload before deleting.')
        const ordered = folders
          .filter((folder) => deletion.ids.has(folder.id))
          .sort((a, b) => folderDepth(folders, b.id) - folderDepth(folders, a.id))
        for (const folder of ordered)
          await cloudResult(
            table('folders')
              .delete()
              .eq('id', folder.id)
              .eq('user_id', userId)
              .select('id')
              .maybeSingle(),
            signal,
            'folders',
            'DELETE',
            true,
          )
        const after = await api.fetchNotes({ signal })
        if (notes.some((note) => !after.some((item) => item.id === note.id)))
          throw new Error(
            'Unexpected database deletion behavior: a note is missing. Stop editing and inspect folder foreign keys and concurrent changes.',
          )
      } catch (failure) {
        throw new Error(
          `Folder deletion did not fully complete. Notes already relocated remain saved; reload before retrying. ${failure.message}`,
        )
      }
    },
    async saveTag(input, id, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      if (!TAG_COLORS.some((color) => color.value === input.color))
        throw new Error('Choose an existing tag color.')
      const values = { name: requiredText(input.name, 'tag name', 40), color: input.color }
      const row = id
        ? await cloudResult(
            table('tags')
              .update(values)
              .eq('id', id)
              .eq('user_id', userId)
              .select(fields.tags)
              .single(),
            signal,
            'tags',
            'UPDATE',
            true,
          )
        : await insertOwned('tags', { id: crypto.randomUUID(), ...values }, signal)
      return model('tags', row)
    },
    async deleteTag(id, { signal = new AbortController().signal } = {}) {
      await authorize(signal)
      await cloudResult(
        table('tags').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle(),
        signal,
        'tags',
        'DELETE',
        true,
      )
    },
    async fetchRelationships({ signal = new AbortController().signal } = {}) {
      await authorize(signal)
      const entries = await Promise.all(
        ['task_notes', 'task_tags', 'note_tags'].map(async (name) => [
          name,
          await cloudRows(
            () =>
              table(name)
                .select(
                  name === 'task_notes'
                    ? 'task_id,note_id,created_at'
                    : name === 'task_tags'
                      ? 'task_id,tag_id,created_at'
                      : 'note_id,tag_id,created_at',
                  { count: 'exact' },
                )
                .order(name === 'note_tags' ? 'note_id' : 'task_id')
                .order(name === 'task_notes' ? 'note_id' : 'tag_id'),
            signal,
            name,
          ),
        ]),
      )
      return Object.fromEntries(entries)
    },
    async setRelationships(name, itemId, ids, { signal = new AbortController().signal } = {}) {
      if (!['task_notes', 'task_tags', 'note_tags'].includes(name))
        throw new Error('Unsupported relationship.')
      await authorize(signal)
      const left = name === 'note_tags' ? 'note_id' : 'task_id'
      const right = name === 'task_notes' ? 'note_id' : 'tag_id'
      await owned(left === 'note_id' ? 'notes' : 'tasks', itemId, signal)
      const desired = [...new Set(ids)]
      for (const id of desired) await owned(right === 'note_id' ? 'notes' : 'tags', id, signal)
      const current = await cloudRows(
        () =>
          table(name).select(`${left},${right}`, { count: 'exact' }).eq(left, itemId).order(right),
        signal,
        name,
      )
      for (const id of desired.filter((id) => !current.some((row) => row[right] === id))) {
        await cloudResult(
          table(name)
            .upsert(
              { [left]: itemId, [right]: id },
              { onConflict: `${left},${right}`, ignoreDuplicates: true },
            )
            .select(`${left},${right}`),
          signal,
          name,
          'INSERT',
        )
      }
      for (const row of current.filter((row) => !desired.includes(row[right])))
        await cloudResult(
          table(name)
            .delete()
            .eq(left, itemId)
            .eq(right, row[right])
            .select(`${left},${right}`)
            .maybeSingle(),
          signal,
          name,
          'DELETE',
          true,
        )
      const verified = await cloudRows(
        () =>
          table(name).select(`${left},${right}`, { count: 'exact' }).eq(left, itemId).order(right),
        signal,
        name,
      )
      if (
        verified.length !== desired.length ||
        desired.some((id) => !verified.some((row) => row[right] === id))
      )
        throw new Error(
          'Relationship changes could not be verified. Some changes may have saved; retry to reconcile.',
        )
    },
  }
  return api
}
