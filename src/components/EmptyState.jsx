import { NotebookText } from 'lucide-react'

export default function EmptyState({ page, label, icon: Icon, description }) {
  const dashboard = page === 'dashboard'
  const PageIcon = dashboard ? NotebookText : Icon
  return (
    <section className="empty-state" aria-labelledby="page-heading">
      <PageIcon className="welcome-icon" size={82} strokeWidth={1.65} aria-hidden="true" />
      <h1 id="page-heading">{dashboard ? <>Welcome to <span>No-Te</span></> : label}</h1>
      <p>{dashboard ? 'Your space for project notes, tasks and documentation.' : description}</p>
      {!dashboard && <span className="coming-soon">Coming soon</span>}
    </section>
  )
}
