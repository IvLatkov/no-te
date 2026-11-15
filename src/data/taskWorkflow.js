export const ARCHIVE_DAYS = 7
export const DAY_SECONDS = 86400
export const TASK_WORKFLOW_SETUP = 'Task archive setup is required. Ask the database owner to review and apply database-local/task-workflow.sql, then reload. No task data has been removed.'

// Visibility is supplied by PostgreSQL, never calculated from the device clock.
export function isArchivedTask(task) {
  return task.status === 'done' && task.isArchived === true
}

export function activeTasks(tasks) {
  return tasks.filter((task) => !isArchivedTask(task))
}

export function archiveLabel(task) {
  if (task.status !== 'done') return ''
  if (isArchivedTask(task)) return 'Archived'
  const seconds = task.archiveSecondsRemaining
  if (!Number.isFinite(seconds)) return 'Completion date not recorded'
  return seconds < DAY_SECONDS
    ? 'Archives in less than a day'
    : `Archives in ${Math.ceil(seconds / DAY_SECONDS)} days`
}

// Schedule a fresh server read at the next label/deadline boundary. This timer
// refreshes authoritative data; it never archives a task by itself.
export function nextWorkflowRefresh(projects) {
  const seconds = projects.flatMap((project) => project.tasks)
    .filter((task) => task.status === 'done' && !isArchivedTask(task))
    .map((task) => task.archiveSecondsRemaining)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => value === 0 ? 0 : value % DAY_SECONDS || DAY_SECONDS)
  return seconds.length ? Math.max(1000, Math.min(...seconds) * 1000 + 100) : null
}
