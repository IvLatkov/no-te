import { useEffect, useState, useSyncExternalStore } from 'react'
import { createCloudProjectsStore } from '../data/cloudProjectsStore'

export default function useCloudProjects(client, userId) {
  // AuthGate keys the workspace by account ID; no store is shared across accounts.
  const [store] = useState(() => createCloudProjectsStore(client, userId))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    store.load()
    return () => store.dispose()
  }, [store])
  return { ...state, store, readOnly: state.loading || state.busy || !!state.error }
}
