import { useState } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { TAG_COLORS } from '../data/organization'

function TagForm({ tag, onSave, onClose, error }) {
  const [name, setName] = useState(tag?.name || '')
  const [color, setColor] = useState(tag?.color || TAG_COLORS[0].value)
  return <Modal title={tag ? 'Edit tag' : 'New tag'} error={error} onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave({ name, color }) }}><label htmlFor="tag-name">Tag name</label><input autoFocus id="tag-name" required maxLength={40} value={name} onChange={event => setName(event.target.value)} /><fieldset className="tag-palette"><legend>Color</legend>{TAG_COLORS.map(option => <label key={option.value} style={{ '--tag-color': option.value }}><input type="radio" name="tag-color" value={option.value} checked={color === option.value} onChange={() => setColor(option.value)} />{option.name}</label>)}</fieldset><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!name.trim()}>Save tag</button></div></form></Modal>
}

export default function TagManager({ tags, onSave, onDelete, onClose, error, readOnly }) {
  const [action, setAction] = useState(null)
  return <><Modal title="Manage tags" error={error} onClose={onClose}><div className="tag-manager-list">{tags.map(tag => <div className="tag-manager-row" key={tag.id}><span className="tag-badge" style={{ '--tag-color': tag.color }}>{tag.name}</span><div className="card-actions"><button type="button" className="icon-button" disabled={readOnly} aria-label={`Edit tag ${tag.name}`} onClick={() => setAction({ type: 'edit', tag })}><Pencil size={15} /></button><button type="button" className="icon-button delete-action" disabled={readOnly} aria-label={`Delete tag ${tag.name}`} onClick={() => setAction({ type: 'delete', tag })}><Trash2 size={15} /></button></div></div>)}{!tags.length && <p className="muted-small">Create a tag to organize tasks and notes.</p>}</div><div className="modal-actions"><button type="button" className="button primary" disabled={readOnly} onClick={() => setAction({ type: 'create' })}><Plus size={15} /> New tag</button></div></Modal>
    {action && action.type !== 'delete' && <TagForm tag={action.tag} error={error} onClose={() => setAction(null)} onSave={values => { if (onSave(values, action.tag?.id)) setAction(null) }} />}
    {action?.type === 'delete' && <ConfirmModal title="Delete tag?" message={`Remove “${action.tag.name}” from every task and note? The tasks and notes will be kept.`} error={error} onClose={() => setAction(null)} onConfirm={() => { if (onDelete(action.tag.id)) setAction(null) }} />}
  </>
}
