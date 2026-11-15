import { createProjectsApi } from './supabaseProjects.js'
import { createTasksApi } from './supabaseTasks.js'

// Account-scoped, memory-only state. Never reads/writes legacy browser data.
export function createCloudProjectsStore(client, userId) {
  const projectsApi = createProjectsApi(client, userId)
  const tasksApi = createTasksApi(client, userId)
  let snapshot = { projects: [], loading: true, busy: false, error: '', mutationError: '' }
  let active = true
  let revision = 0
  let mutationLocked = false
  const controllers = new Set()
  const listeners = new Set()
  function publish(patch) {
    if (!active) return
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  function controller() {
    const value = new AbortController()
    controllers.add(value)
    return value
  }
  async function load({ afterMutation = false, quiet = false } = {}) {
    if (mutationLocked && !afterMutation) return false
    active = true
    const version = ++revision
    const request = controller()
    publish({ loading: quiet || afterMutation ? snapshot.loading : true, error: quiet ? snapshot.error : '' })
    try {
      const projects = await projectsApi.fetchProjects({ signal: request.signal })
      const tasks = projects.length
        ? await tasksApi.fetchTasks(
            projects.map((project) => project.id),
            { signal: request.signal },
          )
        : []
      if (!active || version !== revision) return false
      publish({
        projects: projects.map((project) => ({
          ...project,
          tasks: tasks.filter((task) => task.projectId === project.id),
        })),
        loading: false,
        error: '',
      })
      return true
    } catch (failure) {
      if (active && version === revision && failure.name !== 'AbortError')
        publish({ loading: false, error: `${failure.message} Task/archive status could not be refreshed; any previously displayed task state may be stale.` })
      return false
    } finally {
      controllers.delete(request)
    }
  }
  async function mutate(operation, apply) {
    if (!active || mutationLocked || snapshot.loading || snapshot.error) return false
    mutationLocked = true
    const version = ++revision
    const request = controller()
    publish({ busy: true, mutationError: '' })
    try {
      const result = await operation({ signal: request.signal })
      if (!active || version !== revision) return false
      publish({ projects: apply(snapshot.projects, result) })
      // Refresh from PostgreSQL after a confirmed write. A failed refresh does
      // not turn a successful INSERT into a retryable INSERT (duplicate risk).
      const refreshed = await load({ afterMutation: true })
      if (active && !refreshed && snapshot.error)
        publish({ error: `Saved, but refresh failed. ${snapshot.error}` })
      return active
    } catch (failure) {
      if (active && version === revision && failure.name !== 'AbortError') {
        await load({ afterMutation: true })
        publish({
          mutationError: `${failure.message} If the connection was interrupted, reload before retrying to check whether the change completed.`,
        })
      }
      return false
    } finally {
      controllers.delete(request)
      mutationLocked = false
      publish({ busy: false })
    }
  }
  const updateTasks = (projects, projectId, change) =>
    projects.map((project) =>
      project.id === projectId ? { ...project, tasks: change(project.tasks) } : project,
    )
  function mergeTask(task, updated) {
    if (updated.serverNow) return updated
    // A confirmed write can outlive a failed workflow read. Preserve the last
    // server-derived archive flag until refresh succeeds, rather than briefly
    // putting an archived task back into Done. Reopening always clears it.
    return {
      ...updated,
      isArchived: updated.status === 'todo' ? false : task.isArchived,
      serverNow: task.serverNow,
      archiveSecondsRemaining: updated.status === 'todo' ? null : task.archiveSecondsRemaining,
    }
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    load,
    clearMutationError: () => publish({ mutationError: '' }),
    createProject: (values) =>
      mutate(
        (options) => projectsApi.createProject(values, options),
        (projects, project) => [...projects, project],
      ),
    updateProject: (id, values) =>
      mutate(
        (options) => projectsApi.updateProject(id, values, options),
        (projects, updated) =>
          projects.map((project) =>
            project.id === id ? { ...updated, tasks: project.tasks } : project,
          ),
      ),
    deleteProject: (id) =>
      mutate(
        (options) => projectsApi.deleteProject(id, options),
        (projects) => projects.filter((project) => project.id !== id),
      ),
    createTask: (projectId, values) =>
      mutate(
        (options) => tasksApi.createTask(projectId, values, options),
        (projects, task) => updateTasks(projects, projectId, (tasks) => [...tasks, task]),
      ),
    updateTask: (projectId, id, values) =>
      mutate(
        (options) => tasksApi.updateTask(projectId, id, values, options),
        (projects, updated) =>
          updateTasks(projects, projectId, (tasks) =>
            tasks.map((task) => (task.id === id ? mergeTask(task, updated) : task)),
          ),
      ),
    moveTask: (projectId, id, status) =>
      mutate(
        (options) => tasksApi.moveTask(projectId, id, status, options),
        (projects, updated) =>
          updateTasks(projects, projectId, (tasks) =>
            tasks.map((task) => (task.id === id ? mergeTask(task, updated) : task)),
          ),
      ),
    deleteTask: (projectId, id) =>
      mutate(
        (options) => tasksApi.deleteTask(projectId, id, options),
        (projects) =>
          updateTasks(projects, projectId, (tasks) => tasks.filter((task) => task.id !== id)),
      ),
    dispose() {
      active = false
      revision += 1
      for (const request of controllers) request.abort()
      controllers.clear()
      // No cached cloud content survives sign-out. Suppress late responses.
      snapshot = { projects: [], loading: true, busy: false, error: '', mutationError: '' }
    },
  }
}
