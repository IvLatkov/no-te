import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react'
import { folderDepth } from '../../data/organization'

const FolderRow = memo(function FolderRow({
  folder,
  active,
  expanded,
  hasChildren,
  dropState,
  dropTitle,
  onSelect,
  onToggle,
  onOver,
  onLeave,
  onDrop,
}) {
  return (
    <div
      className={`folder-row${active ? ' is-active' : ''}`}
      data-folder-id={folder.id}
      data-note-drop={dropState}
      title={dropTitle}
      onDragOver={onOver}
      onDragLeave={onLeave}
      onDrop={onDrop}
    >
      {hasChildren ? (
        <button
          type="button"
          className="folder-disclosure"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${folder.name}`}
          aria-expanded={expanded}
          onClick={() => onToggle(folder.id)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      ) : (
        <span className="folder-disclosure" />
      )}
      <button
        type="button"
        className="folder-name-button"
        aria-pressed={active}
        onClick={() => onSelect(folder.id)}
      >
        <Folder size={14} />
        <span>{folder.name}</span>
      </button>
    </div>
  )
})
const destinationId = (event) =>
  event.currentTarget.dataset.folderId === 'unfiled' ? null : event.currentTarget.dataset.folderId

export default function FolderTree({
  folders,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
  readOnly,
  noteDrag,
}) {
  const [collapsed, setCollapsed] = useState([])
  const hover = useRef(null)
  const cancelHover = useCallback(() => {
    clearTimeout(hover.current?.timer)
    hover.current = null
  }, [])
  useEffect(() => cancelHover, [noteDrag?.draggingId, cancelHover])
  const selected = folders.find((folder) => folder.id === value)
  const hoverDestination = noteDrag?.hoverDestination
  const leaveDestination = noteDrag?.leaveDestination
  const dropDestination = noteDrag?.dropDestination
  const canDrop = noteDrag?.canDrop
  const onOver = useCallback(
    (event) => {
      const id = destinationId(event)
      hoverDestination?.(event, id)
      if (!canDrop?.(id) || !collapsed.includes(id) || hover.current?.id === id) return
      cancelHover()
      hover.current = {
        id,
        timer: setTimeout(() => {
          setCollapsed((ids) => ids.filter((value) => value !== id))
          hover.current = null
        }, 600),
      }
    },
    [hoverDestination, canDrop, collapsed, cancelHover],
  )
  const onLeave = useCallback(
    (event) => {
      if (leaveDestination?.(event, destinationId(event))) cancelHover()
    },
    [leaveDestination, cancelHover],
  )
  const onDrop = useCallback(
    (event) => {
      cancelHover()
      dropDestination?.(event, destinationId(event))
    },
    [dropDestination, cancelHover],
  )
  const onToggle = useCallback(
    (id) =>
      setCollapsed((ids) =>
        ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
      ),
    [],
  )
  const branches = useMemo(() => {
    const map = new Map()
    for (const folder of folders) {
      if (!map.has(folder.parentFolderId)) map.set(folder.parentFolderId, [])
      map.get(folder.parentFolderId).push(folder)
    }
    for (const children of map.values()) children.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [folders])
  function branch(parentId) {
    return (
      <ul>
        {(branches.get(parentId) || []).map((folder) => {
          const children = branches.has(folder.id)
          const expanded = !collapsed.includes(folder.id)
          return (
            <li key={folder.id}>
              <FolderRow
                folder={folder}
                active={value === folder.id}
                expanded={expanded}
                hasChildren={children}
                dropState={noteDrag?.destinationProps(folder.id)['data-note-drop']}
                dropTitle={noteDrag?.destinationProps(folder.id).title}
                onSelect={onChange}
                onToggle={onToggle}
                onOver={onOver}
                onLeave={onLeave}
                onDrop={onDrop}
              />
              {children && expanded && branch(folder.id)}
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <nav className="folder-tree" aria-label="Documentation folders">
      <div className="folder-tree-heading">
        <h3>Folders</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="New folder"
          disabled={readOnly}
          onClick={() => onCreate(null)}
        >
          <Plus size={15} />
        </button>
      </div>
      <button
        type="button"
        className={`folder-base${value === 'all' ? ' is-active' : ''}`}
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
      >
        <FolderOpen size={14} /> All folders
      </button>
      <button
        type="button"
        className={`folder-base${value === null ? ' is-active' : ''}`}
        {...noteDrag?.destinationProps(null)}
        data-folder-id="unfiled"
        onDragOver={onOver}
        onDragLeave={onLeave}
        onDrop={onDrop}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        <Folder size={14} /> Unfiled
      </button>
      {branch(null)}
      {selected && (
        <div className="folder-actions">
          <button
            type="button"
            disabled={readOnly || folderDepth(folders, selected.id) >= 3}
            onClick={() => onCreate(selected.id)}
          >
            Subfolder
          </button>
          <button type="button" disabled={readOnly} onClick={() => onRename(selected)}>
            Rename
          </button>
          <button type="button" disabled={readOnly} onClick={() => onDelete(selected)}>
            Delete
          </button>
        </div>
      )}
    </nav>
  )
}
