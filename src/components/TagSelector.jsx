export function TagBadges({ tags = [], value = [], limit = Infinity }) {
  const selected = tags.filter(tag => value.includes(tag.id))
  return <span className="tag-badges">{selected.slice(0, limit).map(tag => <span key={tag.id} className="tag-badge" style={{ '--tag-color': tag.color }}>{tag.name}</span>)}{selected.length > limit && <span className="tag-extra">+{selected.length - limit}</span>}</span>
}

export default function TagSelector({ tags = [], value = [], onChange, onManage, disabled = false, label = 'Tags' }) {
  return <details className="tag-selector"><summary>{label} <TagBadges tags={tags} value={value} /></summary><div className="tag-options">{tags.map(tag => <button type="button" key={tag.id} className="tag-option" style={{ '--tag-color': tag.color }} aria-pressed={value.includes(tag.id)} disabled={disabled} onClick={() => onChange(value.includes(tag.id) ? value.filter(id => id !== tag.id) : [...value, tag.id])}>{tag.name}</button>)}{!tags.length && <span className="muted-small">No tags yet.</span>}{onManage && <button type="button" className="text-action" onClick={onManage}>Manage tags</button>}</div></details>
}
