import { useState } from 'react'
import EmptyState from '../EmptyState'
import { appShortcuts } from './appShortcuts'
import '../../dashboard.css'

export default function Dashboard() {
  const [launchNotice, setLaunchNotice] = useState('')

  function describeLaunch(name) {
    setLaunchNotice(
      `Your browser may ask to open ${name}. If nothing opens, launch it from Windows Start or your desktop shortcut. No-Te cannot confirm desktop launches.`,
    )
  }

  return (
    <div className="dashboard">
      <section className="dashboard-apps" aria-labelledby="apps-heading">
        <h2 id="apps-heading">Apps</h2>
        <ul className="app-shortcuts">
          {appShortcuts.map((app) => {
            const content = (
              <>
                <span className="app-logo">
                  <img
                    src={`${import.meta.env.BASE_URL}apps/${app.logo}`}
                    width="32"
                    height="32"
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                  />
                </span>
                <span className="app-name">{app.name}</span>
              </>
            )
            return (
              <li key={app.id}>
                <a
                  className="app-shortcut"
                  href={app.href}
                  target={app.kind === 'website' ? '_blank' : undefined}
                  rel={app.kind === 'website' ? 'noopener noreferrer' : undefined}
                  aria-label={`Open ${app.name}${app.kind === 'website' ? ' in a new tab' : ' desktop app'}`}
                  onClick={app.kind === 'website' ? undefined : () => describeLaunch(app.name)}
                >
                  {content}
                </a>
              </li>
            )
          })}
        </ul>
        <p className="app-launch-notice" role="status">{launchNotice}</p>
      </section>
      <div className="dashboard-welcome">
        <EmptyState page="dashboard" />
      </div>
    </div>
  )
}
