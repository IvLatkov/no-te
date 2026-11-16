import { useContext } from 'react'
import { Moon, Sun } from 'lucide-react'
import { ThemeContext } from '../theme/ThemeContext'
import ThemeProvider from '../theme/ThemeProvider'

function AppearanceControl() {
  const { theme, setTheme, error } = useContext(ThemeContext)
  const dark = theme === 'dark'
  return (
    <section className="data-management-row appearance-settings" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading">Appearance</h2>
        <p id="appearance-description">Your device theme is used until you choose a mode. Your choice is saved in this browser.</p>
        {error && <p role="status">{error}</p>}
      </div>
      <div className="theme-control">
        <span>{dark ? 'Dark' : 'Light'}</span>
        <button
          type="button"
          className="theme-toggle"
          role="switch"
          aria-label="Dark mode"
          aria-checked={dark}
          aria-describedby="appearance-description"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
        </button>
      </div>
    </section>
  )
}

export default function AppearanceSettings() {
  const theme = useContext(ThemeContext)
  // Preserve the independently mounted local-only Settings page as well.
  return theme ? <AppearanceControl /> : <ThemeProvider><AppearanceControl /></ThemeProvider>
}
