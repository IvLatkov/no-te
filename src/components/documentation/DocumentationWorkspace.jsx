import { useCallback, useMemo, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { selectNotes } from '../../data/notes'
import NotesList from './NotesList'
import NoteEditor from './NoteEditor'
import NoteModal from './NoteModal'
import ConfirmModal from '../ConfirmModal'
import { tasksForNote, filterDocumentation } from '../../data/taskDocumentation'
import FolderTree from './FolderTree'
import FolderModal from './FolderModal'
import TagSelector from '../TagSelector'
import { validateNoteFolder } from '../../data/organization'
import useNoteDrag from '../../hooks/useNoteDrag'

export default function DocumentationWorkspace({
  notesState,
  projects,
  projectScope = null,
  initialNoteId = null,
  onOpenTask,
  organization,
  singleNote = false,
  onExit,
  taskLinksAvailable = true,
  onWidthChange,
}) {
  const { notes, store, status, error, readOnly, busy = false } = notesState
  const [selectedId, setSelectedId] = useState(initialNoteId)
  const [filter, setFilter] = useState(projectScope || 'all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('modified')
  const [linkFilter, setLinkFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [folderId, setFolderId] = useState('all')
  const [tagIds, setTagIds] = useState([])
  const [folderAction, setFolderAction] = useState(null)
  const [metadataError, setMetadataError] = useState('')
  const noteDrag = useNoteDrag({
    store,
    folders: organization.folders,
    readOnly: readOnly || organization.readOnly,
    onMoved: setFolderId,
  })
  const selected = notes.find((note) => note.id === selectedId)
  const activeTags = tagIds.filter((id) => organization.tags.some((tag) => tag.id === id))
  const visible = filterDocumentation(selectNotes(notes, {
    query,
    projectId: projectScope || filter,
    folderId,
    tagIds: activeTags,
    sort,
    projectNoteIds: projects.find((project) => project.id === (projectScope || filter))?.tasks.flatMap((task) => task.linkedNoteIds || []) || [],
  }), projects, taskLinksAvailable ? linkFilter : 'all')
  const filteredProject = projectScope || filter
  const visibleFolders = useMemo(
    () =>
      organization.folders.filter(
        (folder) =>
          filteredProject === 'all' ||
          folder.projectId === null ||
          folder.projectId === filteredProject,
      ),
    [organization.folders, filteredProject],
  )
  const displayError = noteDrag.error || error || metadataError || organization.error
  async function select(id) {
    if (await store.flush()) setSelectedId(id)
  }
  async function changeFilter(value) {
    if (await store.flush()) {
      setFilter(value)
      setFolderId('all')
      setSelectedId(null)
    }
  }
  const changeFolder = useCallback(
    async (value) => {
      if (await store.flush()) {
        setFolderId(value)
        setSelectedId(null)
        setMetadataError('')
      }
    },
    [store],
  )
  async function updateMetadata(patch) {
    if (noteDrag.enabled && Object.keys(patch).length === 1 && 'folderId' in patch)
      return noteDrag.moveNote(selected.id, patch.folderId)
    try {
      validateNoteFolder({ ...selected, ...patch }, organization.folders)
      setMetadataError('')
      if (!store.update(selected.id, patch)) return false
      return store.flush()
    } catch (failure) {
      setMetadataError(failure.message)
      return false
    }
  }
  async function duplicate() {
    const copy = await store.duplicate(selected.id)
    if (copy) {
      setQuery('')
      setSelectedId(copy.id)
    }
  }
  return (
    <div className={`documentation-workspace${selected ? ' has-selection' : ''}`}>
      {displayError && (
        <div className="notes-error">
          <p className="storage-error" role="alert">
            {displayError}
          </p>
          {error && !readOnly && status === 'error' && (
            <button type="button" className="button secondary" onClick={() => store.flush()}>
              Retry save
            </button>
          )}
          {(metadataError || noteDrag.error) && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setMetadataError('')
                noteDrag.clearError()
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {!singleNote && <NotesList
        notes={visible}
        selectedId={selectedId}
        onSelect={select}
        onCreate={() => {
          setMetadataError('')
          setModal('create')
        }}
        projects={projects}
        filter={projectScope || filter}
        onFilter={changeFilter}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        linkFilter={linkFilter}
        taskLinksAvailable={taskLinksAvailable}
        onLinkFilter={async (value) => { if (await store.flush()) setLinkFilter(value) }}
        projectScope={projectScope}
        readOnly={readOnly}
        noteDrag={noteDrag}
        hasFilters={linkFilter !== 'all' || folderId !== 'all' || activeTags.length > 0 || filteredProject !== 'all'}
        tagFilter={
          <>
            <TagSelector
              label="Filter note tags"
              tags={organization.tags}
              value={activeTags}
              onChange={setTagIds}
            />
            {linkFilter !== 'all' || query ||
            folderId !== 'all' ||
            activeTags.length ||
            (!projectScope && filter !== 'all') ? (
              <button
                type="button"
                className="text-action"
                onClick={async () => {
                  if (await store.flush()) {
                    setQuery('')
                    setLinkFilter('all')
                    setFolderId('all')
                    setTagIds([])
                    setFilter(projectScope || 'all')
                  }
                }}
              >
                Clear note filters
              </button>
            ) : null}
          </>
        }
        folderNavigation={
          <FolderTree
            folders={visibleFolders}
            noteDrag={noteDrag}
            value={folderId}
            onChange={changeFolder}
            readOnly={readOnly || organization.readOnly}
            onCreate={(parentFolderId) => setFolderAction({ type: 'create', parentFolderId })}
            onRename={(folder) => setFolderAction({ type: 'rename', folder })}
            onDelete={(folder) => setFolderAction({ type: 'delete', folder })}
          />
        }
      />}
      {selected ? (
        <NoteEditor
          key={selected.id}
          note={selected}
          projects={projects}
          store={store}
          status={status}
          readOnly={readOnly}
          onBack={singleNote ? onExit : () => select(null)}
          backLabel={singleNote ? 'Close note' : 'All notes'}
          onDuplicate={duplicate}
          onDelete={() => setModal('delete')}
          linkedTasks={tasksForNote(projects, selected.id)}
          onOpenTask={onOpenTask}
          organization={organization}
          onMetadataChange={updateMetadata}
          onWidthChange={onWidthChange}
        />
      ) : (
        <section className="notes-editor-empty">
          <NotebookPen size={46} strokeWidth={1.3} />
          <h2>A space for your thoughts</h2>
          <p>Choose a note, or start a new page.</p>
        </section>
      )}
      {modal === 'create' && (
        <NoteModal
          busy={busy}
          projects={projects}
          projectId={
            projectScope ||
            organization.folders.find((folder) => folder.id === folderId)?.projectId ||
            (filter === 'all' ? null : filter)
          }
          folders={organization.folders}
          initialFolderId={folderId === 'all' ? null : folderId}
          error={displayError}
          onClose={() => {
            setModal(null)
            setMetadataError('')
          }}
          onSave={async (values) => {
            try {
              validateNoteFolder(values, organization.folders)
              const note = await store.create(values)
              if (note) {
                setModal(null)
                setQuery('')
                setTagIds([])
                setFolderId('all')
                if (!projectScope) setFilter('all')
                setSelectedId(note.id)
              }
            } catch (failure) {
              setMetadataError(failure.message)
            }
          }}
        />
      )}
      {modal === 'delete' && selected && (
        <ConfirmModal
          busy={busy}
          title="Delete note?"
          message={`Delete “${selected.title || 'Untitled note'}”? This cannot be undone.`}
          error={error}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            if (await store.remove(selected.id)) {
              setSelectedId(null)
              setModal(null)
              if (singleNote) await onExit()
            }
          }}
        />
      )}
      {folderAction && folderAction.type !== 'delete' && (
        <FolderModal
          busy={busy}
          folder={folderAction.folder}
          parentFolderId={folderAction.parentFolderId}
          initialProjectId={filteredProject === 'all' ? null : filteredProject}
          folders={organization.folders}
          projects={projects}
          error={organization.error}
          onClose={() => setFolderAction(null)}
          onSave={async (values, id) => {
            if (await organization.onSaveFolder(values, id)) setFolderAction(null)
          }}
        />
      )}
      {folderAction?.type === 'delete' && (
        <ConfirmModal
          title="Delete folder?"
          busy={busy}
          message={`Delete “${folderAction.folder.name}” and all descendant folders? All contained notes will move to its parent folder, or become Unfiled if this is a top-level folder. Note content and project associations will be kept.`}
          error={displayError}
          onClose={() => setFolderAction(null)}
          onConfirm={async () => {
            if (await organization.onDeleteFolder(folderAction.folder.id)) {
              setFolderId(folderAction.folder.parentFolderId)
              setFolderAction(null)
            }
          }}
        />
      )}
    </div>
  )
}
