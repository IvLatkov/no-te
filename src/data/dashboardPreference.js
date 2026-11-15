// Store only an account-scoped UI preference, never project contents or credentials.
const key = (userId) => `no-te.dashboard-project:${userId}`

export function readDashboardProject(userId) {
  try {
    const value = globalThis.localStorage?.getItem(key(userId))
    return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null
  } catch {
    return null
  }
}

export function saveDashboardProject(userId, projectId) {
  try {
    if (projectId) globalThis.localStorage?.setItem(key(userId), projectId)
    else globalThis.localStorage?.removeItem(key(userId))
  } catch {
    // Restricted/full browser storage must not prevent project navigation.
  }
}
