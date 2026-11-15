import { useEffect, useState, useSyncExternalStore } from 'react'
import { createCloudProjectsStore } from '../data/cloudProjectsStore'
import { nextWorkflowRefresh } from '../data/taskWorkflow'

export default function useCloudProjects(client, userId) {
  // AuthGate keys the workspace by account ID; no store is shared across accounts.
  const [store] = useState(() => createCloudProjectsStore(client, userId))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    store.load()
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void store.load({ quiet: true })
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      store.dispose()
    }
  }, [store])
  useEffect(() => {
    if (state.loading || state.busy || state.error) return
    const delay = nextWorkflowRefresh(state.projects)
    if (delay === null) return
    const timer = setTimeout(() => void store.load({ quiet: true }), delay)
    return () => clearTimeout(timer)
  }, [store, state.projects, state.loading, state.busy, state.error])
  return { ...state, store, readOnly: state.loading || state.busy || !!state.error }
}
