import { useRef, useState } from 'react'
import { loadProjects, saveProjects } from '../data/projects'

export default function useProjects() {
  const [initial] = useState(() => {
    try { return { projects: loadProjects(), error: '' } }
    catch { return { projects: [], error: 'Saved projects could not be loaded. Your saved data has been kept. Check browser storage access and reload before making changes.' } }
  })
  const [projects, setProjects] = useState(initial.projects)
  const currentProjects = useRef(initial.projects)
  const [error, setError] = useState(initial.error)

  function commit(transform) {
    if (initial.error) return false
    const next = transform(currentProjects.current)
    try {
      saveProjects(next)
      currentProjects.current = next
      setProjects(next)
      setError('')
      return true
    } catch {
      setError('Changes could not be saved. Browser storage may be full or unavailable. Please try again.')
      return false
    }
  }

  return { projects, error, commit, readOnly: Boolean(initial.error) }
}
