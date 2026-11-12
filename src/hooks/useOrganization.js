import { useRef, useState } from 'react'
import { loadOrganization, saveOrganization } from '../data/organization'
import { readDataRevision } from '../data/storageSafety'

export default function useOrganization() {
  const [initial] = useState(() => {
    try { return { data: loadOrganization(), revision: readDataRevision(), error: '' } }
    catch { return { data: { version: 1, folders: [], tags: [] }, error: 'Folders and tags could not be loaded. Saved data has been preserved. Check browser storage and reload.' } }
  })
  const [data, setData] = useState(initial.data)
  const [error, setError] = useState(initial.error)
  const latest = useRef(initial.data)
  function commit(transform) {
    if (initial.error) return false
    try {
      const next = transform(latest.current)
      saveOrganization(next, undefined, initial.revision)
      latest.current = next
      setData(next)
      setError('')
      return true
    } catch (failure) {
      setError(failure.name === 'QuotaExceededError' || failure.name === 'SecurityError'
        ? 'Folders or tags could not be saved. Check browser storage space and access, then retry.'
        : failure.message || 'Organization changes could not be saved. Please retry.')
      return false
    }
  }
  return { ...data, error, readOnly: Boolean(initial.error), commit }
}
