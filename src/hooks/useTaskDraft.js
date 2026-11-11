import { useEffect, useRef, useState } from 'react'
import { normalizeTask } from '../data/projects'

export default function useTaskDraft(task, onSave, readOnly) {
  const [draft, setDraft] = useState(() => normalizeTask(task))
  const [error, setError] = useState('')
  const latest = useRef(draft)
  const dirty = useRef(false)
  function save() {
    if (!dirty.current) return true
    if (readOnly) return false
    if (!latest.current.title.trim()) {
      setError('Enter a task title before leaving. Your changes are still open.')
      return false
    }
    if (!onSave(latest.current)) {
      setError('Task changes could not be saved. Your changes are still open; retry before leaving.')
      return false
    }
    dirty.current = false
    setError('')
    return true
  }
  function change(patch) {
    latest.current = { ...latest.current, ...patch }
    dirty.current = true
    setDraft(latest.current)
    save()
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const beforeUnload = event => {
      if (!saveRef.current()) { event.preventDefault(); event.returnValue = '' }
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') saveRef.current() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [])
  return { draft, change, save, error }
}
