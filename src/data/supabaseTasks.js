import { supabase } from '../lib/supabaseClient.js'
import {
  cloudResult,
  cloudRows,
  requireCloudUser,
  requiredText,
  optionalText,
} from './cloudRequest.js'

export const TASK_BASE_FIELDS = 'id,project_id,title,description,status,implementation_notes,created_at,updated_at,completed_at,archive_grace_started_at,archives_at'
const columns = `${TASK_BASE_FIELDS},is_archived,server_now,archive_seconds_remaining`
const taskModel = (row) => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  description: row.description ?? '',
  status: row.status,
  implementationNotes: row.implementation_notes ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at ?? null,
  archiveGraceStartedAt: row.archive_grace_started_at ?? null,
  archivesAt: row.archives_at ?? null,
  isArchived: row.is_archived === true,
  serverNow: row.server_now ?? null,
  archiveSecondsRemaining: row.archive_seconds_remaining == null ? null : Number(row.archive_seconds_remaining),
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
  const workflow = () => client.schema('public').from('task_workflow')
  async function readTask(projectId, id, signal) {
    return taskModel(await cloudResult(
      workflow().select(columns).eq('id', id).eq('project_id', projectId).single(),
      signal, 'task_workflow', 'SELECT', true,
    ))
  }
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
              workflow()
                .select(columns, { count: 'exact' })
                .in('project_id', projectIds.slice(offset, offset + 100))
                .order('created_at')
                .order('id'),
            signal,
            'task_workflow',
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
          .select(TASK_BASE_FIELDS)
          .single(),
        signal,
        'tasks',
        'INSERT',
        true,
      )
      // A confirmed write remains confirmed if this presentation read fails.
      // The store will refresh and report any missing view/schema separately.
      try { return await readTask(projectId, row.id, signal) } catch (failure) {
        if (failure.name === 'AbortError') throw failure
        return taskModel(row)
      }
    },
    async updateTask(projectId, id, input, { signal = new AbortController().signal } = {}) {
      await requireCloudUser(client, userId, signal)
      await ownedProject(projectId, signal)
      const row = await cloudResult(
        table()
          .update(patch(input))
          .eq('id', id)
          .eq('project_id', projectId)
          .select(TASK_BASE_FIELDS)
          .single(),
        signal,
        'tasks',
        'UPDATE',
        true,
      )
      try { return await readTask(projectId, row.id, signal) } catch (failure) {
        if (failure.name === 'AbortError') throw failure
        return taskModel(row)
      }
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
