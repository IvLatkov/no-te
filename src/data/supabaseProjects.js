import { supabase } from '../lib/supabaseClient.js'
import {
  cloudResult,
  cloudRows,
  requireCloudUser,
  requiredText,
  optionalText,
} from './cloudRequest.js'

const columns = 'id,user_id,name,description,created_at,updated_at'
const projectModel = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  tasks: [],
})

export function createProjectsApi(client = supabase, userId) {
  const table = () => client.schema('public').from('projects')
  function values(input) {
    return {
      name: requiredText(input.name, 'project name', 100),
      description: optionalText(input.description ?? '', 'description', 2000),
    }
  }
  return {
    async fetchProjects({ signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      const rows = await cloudRows(
        () =>
          table()
            .select(columns, { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at')
            .order('id'),
        signal,
        'projects',
      )
      return rows.map(projectModel)
    },
    async createProject(input, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      // user_id, IDs and timestamps must be supplied by database defaults/triggers.
      // Never spread caller input into a write or accept a caller-selected owner.
      const row = await cloudResult(
        table().insert(values(input)).select(columns).single(),
        signal,
        'projects',
        'INSERT',
        true,
      )
      return projectModel(row)
    },
    async updateProject(id, input, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      const row = await cloudResult(
        table().update(values(input)).eq('id', id).eq('user_id', userId).select(columns).single(),
        signal,
        'projects',
        'UPDATE',
        true,
      )
      return projectModel(row)
    },
    async deleteProject(id, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      // The server performs task CASCADE and preserves notes through SET NULL.
      await cloudResult(
        table().delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle(),
        signal,
        'projects',
        'DELETE',
        true,
      )
    },
  }
}
