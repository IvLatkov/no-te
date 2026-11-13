import { useState } from 'react'
import { BookOpen, House, Layers, Menu, Settings, X } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import EmptyState from '../components/EmptyState'
import AccountSettings from './AccountSettings'

const pages = {
  dashboard: { label: 'Dashboard', icon: House },
  projects: { label: 'Projects', icon: Layers },
  documentation: { label: 'Documentation', icon: BookOpen },
  settings: { label: 'Settings', icon: Settings },
}

// Do not import LocalWorkspace or mount its data hooks here. Legacy data has no
// verified owner; even loading those hooks can reconcile/write browser records.
export default function AuthenticatedWorkspace() {
  const [activePage, setActivePage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  function navigate(page) {
    setActivePage(page)
    setMenuOpen(false)
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        pages={pages}
        activePage={activePage}
        onNavigate={navigate}
        menuOpen={menuOpen}
        projects={[]}
        selectedProjectId={null}
        onOpenProject={() => {}}
      />
      <div className="workspace">
        <header className="workspace-header">
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="page-label">{pages[activePage].label}</span>
          <span className="workspace-label">
            <span /> Account workspace
          </span>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content${activePage === 'settings' ? ' content-settings' : ''}`}
        >
          {activePage === 'settings' ? (
            <AccountSettings />
          ) : activePage === 'dashboard' ? (
            <EmptyState page="dashboard" />
          ) : (
            <section className="quarantine-page" aria-labelledby="quarantine-heading">
              <h1 id="quarantine-heading">{pages[activePage].label}</h1>
              <p>Local-only content is preserved and quarantined until explicit migration.</p>
              <p>
                Account project and documentation editing is not connected in this iteration. No
                browser data has been uploaded or assigned to this account.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate('settings')}
              >
                Open Settings
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
