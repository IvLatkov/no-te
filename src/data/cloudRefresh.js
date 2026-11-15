export const CLOUD_REFRESH_INTERVAL = 15_000

// Refresh both collections so externally completed tasks and their new note links
// are both refreshed. Reads never force a save or discard an unsaved draft.
export function startCloudRefresh(projects, documentation, {
  target = window,
  page = document,
  interval = CLOUD_REFRESH_INTERVAL,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let stopped = false
  let running = false
  let timer
  async function refresh() {
    if (stopped || running || page.visibilityState === 'hidden' || target.navigator?.onLine === false ||
        page.querySelector?.('dialog[open]')) return
    const projectState = projects.getSnapshot()
    const noteState = documentation.getSnapshot()
    if (projectState.loading || projectState.busy || noteState.loading || noteState.busy ||
        noteState.status === 'saving' || documentation.hasUnsaved()) return
    running = true
    try {
      await Promise.allSettled([
        projects.load({ quiet: true }),
        documentation.load({ quiet: true }),
      ])
    } finally {
      running = false
    }
  }
  async function tick() {
    await refresh()
    if (!stopped) timer = schedule(tick, interval)
  }
  const wake = () => { void refresh() }
  target.addEventListener('focus', wake)
  target.addEventListener('online', wake)
  page.addEventListener('visibilitychange', wake)
  timer = schedule(tick, interval)
  return () => {
    stopped = true
    cancel(timer)
    target.removeEventListener('focus', wake)
    target.removeEventListener('online', wake)
    page.removeEventListener('visibilitychange', wake)
  }
}
