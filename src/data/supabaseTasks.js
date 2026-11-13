import { supabase } from '../lib/supabaseClient.js'
import {
  cloudResult,
  cloudRows,
  requireCloudUser,
  requiredText,
  optionalText,
} from './cloudRequest.js'

const columns = 'id,project_id,title,description,status,implementation_notes,created_at,updated_at'
const taskModel = (row) => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  description: row.description ?? '',
  status: row.status,
  implementationNotes: row.implementation_notes ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function patch(input) {
  const result = {}
  if ('title' in input) result.title = requiredText(input.title, 'task title', 200)
  if ('description' in input)
    result.description = optionalText(input.description, 'description', 4000)
  if ('implementationNotes' in input)
    result.implementation_notes = optionalText(input.implementationNotes, 'implementation notes')
  if ('status' in input) {
    if (!['todo', 'done'].includes(input.status)) throw new Error('Choose To Do or Done.')
    result.status = input.status
  }
  if (!Object.keys(result).length) throw new Error('No supported task changes were provided.')
  return result
}

export function createTasksApi(client = supabase, userId) {
  const table = () => client.schema('public').from('tasks')
  async function ownedProject(projectId, signal) {
    if (!projectId) throw new Error('Choose an existing project.')
    await cloudResult(
      client
        .schema('public')
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single(),
      signal,
      'projects',
      'SELECT',
      true,
    )
  }
  const api = {
    async fetchTasks(projectIds, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      if (!projectIds.length) return []
      const rows = []
      for (let offset = 0; offset < projectIds.length; offset += 100) {
        rows.push(
          ...(await cloudRows(
            () =>
              table()
                .select(columns, { count: 'exact' })
                .in('project_id', projectIds.slice(offset, offset + 100))
                .order('created_at')
                .order('id'),
            signal,
            'tasks',
          )),
        )
      }
      return rows.map(taskModel)
    },
    async createTask(projectId, input, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      await ownedProject(projectId, signal)
      const values = patch({
        title: input.title,
        description: input.description ?? '',
        implementationNotes: input.implementationNotes ?? '',
        status: 'todo',
      })
      const row = await cloudResult(
        table()
          .insert({ ...values, project_id: projectId })
          .select(columns)
          .single(),
        signal,
        'tasks',
        'INSERT',
        true,
      )
      return taskModel(row)
    },
    async updateTask(projectId, id, input, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      await ownedProject(projectId, signal)
      const row = await cloudResult(
        table()
          .update(patch(input))
          .eq('id', id)
          .eq('project_id', projectId)
          .select(columns)
          .single(),
        signal,
        'tasks',
        'UPDATE',
        true,
      )
      return taskModel(row)
    },
    async deleteTask(projectId, id, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      await ownedProject(projectId, signal)
      await cloudResult(
        table().delete().eq('id', id).eq('project_id', projectId).select('id').maybeSingle(),
        signal,
        'tasks',
        'DELETE',
        true,
      )
    },
    moveTask(projectId, id, status, options) {
      return api.updateTask(projectId, id, { status }, options)
    },
  }
  return api
}
