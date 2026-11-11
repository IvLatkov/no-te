import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react'
import { folderDepth } from '../../data/organization'

export default function FolderTree({ folders, value, onChange, onCreate, onRename, onDelete, readOnly }) {
  const [collapsed, setCollapsed] = useState([])
  const selected = folders.find(folder => folder.id === value)
  function branch(parentId) {
    return <ul>{folders.filter(folder => folder.parentFolderId === parentId).sort((a, b) => a.name.localeCompare(b.name)).map(folder => {
      const children = folders.some(item => item.parentFolderId === folder.id)
      const expanded = !collapsed.includes(folder.id)
      return <li key={folder.id}><div className={`folder-row${value === folder.id ? ' is-active' : ''}`}>{children ? <button type="button" className="folder-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${folder.name}`} aria-expanded={expanded} onClick={() => setCollapsed(ids => expanded ? [...ids, folder.id] : ids.filter(id => id !== folder.id))}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="folder-disclosure" />}<button type="button" className="folder-name-button" aria-pressed={value === folder.id} onClick={() => onChange(folder.id)}><Folder size={14} /><span>{folder.name}</span></button></div>{children && expanded && branch(folder.id)}</li>
    })}</ul>
  }
  return <nav className="folder-tree" aria-label="Documentation folders"><div className="folder-tree-heading"><h3>Folders</h3><button type="button" className="icon-button" aria-label="New folder" disabled={readOnly} onClick={() => onCreate(null)}><Plus size={15} /></button></div><button type="button" className={`folder-base${value === 'all' ? ' is-active' : ''}`} aria-pressed={value === 'all'} onClick={() => onChange('all')}><FolderOpen size={14} /> All folders</button><button type="button" className={`folder-base${value === null ? ' is-active' : ''}`} aria-pressed={value === null} onClick={() => onChange(null)}><Folder size={14} /> Unfiled</button>{branch(null)}{selected && <div className="folder-actions"><button type="button" disabled={readOnly || folderDepth(folders, selected.id) >= 3} onClick={() => onCreate(selected.id)}>Subfolder</button><button type="button" disabled={readOnly} onClick={() => onRename(selected)}>Rename</button><button type="button" disabled={readOnly} onClick={() => onDelete(selected)}>Delete</button></div>}</nav>
}
