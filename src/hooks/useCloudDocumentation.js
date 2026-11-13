import { useEffect, useState, useSyncExternalStore } from 'react'
import { createCloudDocumentationStore } from '../data/cloudDocumentationStore'

export default function useCloudDocumentation(client, userId, reportSessionNotice) {
  const [store] = useState(() => createCloudDocumentationStore(client, userId))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    store.start()
    const beforeUnload = (event) => {
      if (store.hasUnsaved()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') void store.flush()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', hidden)
      if (store.hasUnsaved())
        reportSessionNotice?.(
          'The session ended before some note changes could be saved. Unsaved drafts were cleared from memory to protect this account. Check the last saved cloud version after signing in again.',
        )
      store.dispose()
    }
  }, [store, reportSessionNotice])
  return { ...state, store, readOnly: state.readOnly || state.busy || state.loading }
}
