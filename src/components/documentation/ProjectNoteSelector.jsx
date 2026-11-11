import { useId } from 'react'

export default function ProjectNoteSelector({ projects, value, onChange, disabled = false }) {
  const id = useId()
  return <label className="note-project-selector" htmlFor={id}><span>Project</span><select id={id} value={value ?? ''} onChange={event => onChange(event.target.value || null)} disabled={disabled}><option value="">Unassigned</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
}
