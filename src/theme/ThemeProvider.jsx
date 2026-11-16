import { useEffect, useLayoutEffect, useState } from 'react'
import { ThemeContext } from './ThemeContext'
import { applyTheme, readThemePreference, THEME_KEY } from './preferences'

export default function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readThemePreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [error, setError] = useState('')
  const theme = preference || (systemDark ? 'dark' : 'light')

  useLayoutEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const changed = (event) => setSystemDark(event.matches)
    media?.addEventListener('change', changed)
    function storage(event) {
      if (event.key !== THEME_KEY && event.key !== null) return
      setPreference(readThemePreference())
      setError('')
    }
    window.addEventListener('storage', storage)
    return () => {
      media?.removeEventListener('change', changed)
      window.removeEventListener('storage', storage)
    }
  }, [])

  function setTheme(value) {
    if (value !== 'light' && value !== 'dark') return
    setPreference(value)
    setError('')
    try { window.localStorage.setItem(THEME_KEY, value) } catch {
      setError('Theme changed for this visit. Your browser could not save the preference.')
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme, error }}>{children}</ThemeContext.Provider>
}
