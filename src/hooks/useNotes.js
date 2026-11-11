import { useEffect, useState, useSyncExternalStore } from 'react'
import { createNotesStore } from '../data/notesStore'

export default function useNotes() {
  const [store] = useState(() => createNotesStore())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    const beforeUnload = event => {
      if (!store.flush()) { event.preventDefault(); event.returnValue = '' }
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') store.flush() }
    const flush = () => store.flush()
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      store.flush()
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [store])
  return { ...snapshot, store }
}
