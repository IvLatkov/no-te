import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Check, Copy, Loader2, Trash2, AlertCircle, Search, List, Maximize2, Minimize2 } from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import ProjectNoteSelector from './ProjectNoteSelector'
import { editorExtensions, isSupportedDocument } from './editorExtensions'
import { EMPTY_DOCUMENT } from '../../data/notes'
import LinkedTasks from './LinkedTasks'
import FolderSelector from './FolderSelector'
import TagSelector from '../TagSelector'
import NoteNavigation, { NoteSearch } from './NoteNavigation'
import { setDocumentSearch } from './documentNavigation.js'

function timestamp(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function NoteEditor({
  note,
  projects,
  store,
  status,
  readOnly,
  onBack,
  backLabel = 'All notes',
  onDuplicate,
  onDelete,
  linkedTasks = [],
  onOpenTask,
  organization,
  onMetadataChange,
  onWidthChange,
}) {
  const [contentError, setContentError] = useState('')
  const [wide, setWide] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(true)
  const navigationId = useId()
  const searchRef = useRef(null)
  const searchButton = useRef(null)
  const navigationToggle = useRef(null)
  const supported = useMemo(() => isSupportedDocument(note.content), [note.content])
  const displayContentError =
    contentError ||
    (!supported
      ? 'This note contains unsupported formatting. Its saved content has been preserved; editing is disabled.'
      : '')
  const invalid = useRef(false)
  const editor = useEditor({
    extensions: editorExtensions(),
    content: supported ? note.content : EMPTY_DOCUMENT,
    editable: !readOnly && supported,
    shouldRerenderOnTransaction: false,
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: 'note-prose',
        role: 'textbox',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
        'data-placeholder': 'Let your ideas take shape…',
      },
    },
    onContentError: () => {
      invalid.current = true
      setContentError(
        'This note contains unsupported formatting. Its saved content has been preserved; editing is disabled.',
      )
    },
    onUpdate: ({ editor: current }) => {
      if (!invalid.current && supported) store.update(note.id, { content: current.getJSON() })
    },
  })
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(!readOnly && !displayContentError, false)
    }
  }, [editor, readOnly, displayContentError])
  useEffect(() => {
    // useEditor replaces disposed render-time instances in its own effect. This
    // render can still reference the old instance, whose schema is now null.
    // Wait for the replacement instead of treating its lifecycle as bad content.
    if (!editor || editor.isDestroyed || !supported || invalid.current) return
    try {
      // JSONB can reorder object keys. Replacing an equivalent document resets
      // the selection/history; compare ProseMirror nodes rather than JSON text.
      if (editor.state.doc.eq(editor.schema.nodeFromJSON(note.content))) return
      editor.commands.setContent(note.content, { emitUpdate: false, errorOnInvalidContent: true })
    } catch {
      invalid.current = true
      editor.setEditable(false, false)
      queueMicrotask(() =>
        setContentError(
          'This note contains unsupported formatting. Its saved content is preserved; editing is disabled.',
        ),
      )
    }
  }, [editor, note.content, supported])
  function closeNavigation() {
    setNavigationOpen(false)
    navigationToggle.current?.focus()
  }
  function openSearch() {
    requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select() })
  }
  return (
    <section className={`note-editor${wide ? ' is-wide' : ''}`} aria-label="Note editor" onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        openSearch()
      }
    }}>
      <div className="note-editor-top">
        <button type="button" className="back-button notes-back" onClick={onBack}>
          <ArrowLeft size={16} /> {backLabel}
        </button>
        <span className={`save-status ${status}`} role="status">
          {status === 'saving' ? (
            <Loader2 size={13} />
          ) : status === 'error' ? (
            <AlertCircle size={13} />
          ) : (
            <Check size={13} />
          )}
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
        <div className="card-actions">
          <button className="icon-button" type="button" aria-label={wide ? 'Use standard document width' : 'Widen document'} title={wide ? 'Use standard document width' : 'Widen document'} aria-pressed={wide} onClick={() => { onWidthChange?.(); setWide(!wide) }}>
            {wide ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          </button>
          <button ref={navigationToggle} className="icon-button" type="button" aria-label="Table of contents" title="Show or hide document navigation" aria-expanded={navigationOpen} aria-controls={navigationId} onClick={() => navigationOpen ? closeNavigation() : setNavigationOpen(true)}>
            <List size={16} aria-hidden="true" />
          </button>
          <button ref={searchButton} className="icon-button" type="button" aria-label="Find in document" title="Find in document (Ctrl/Cmd+F)" onClick={openSearch}>
            <Search size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Search No-Te"
            title="Search No-Te"
            onClick={organization.onSearch}
          >
            <Search size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Duplicate note"
            title="Duplicate note"
            disabled={readOnly}
            onClick={onDuplicate}
          >
            <Copy size={16} />
          </button>
          <button
            className="icon-button delete-action"
            type="button"
            aria-label="Delete note"
            title="Delete note"
            disabled={readOnly}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="note-title-area">
        <input
          className="note-title"
          aria-label="Note title"
          value={note.title}
          maxLength={200}
          placeholder="Untitled note"
          disabled={readOnly}
          onChange={(event) => store.update(note.id, { title: event.target.value })}
          onBlur={() => store.flush()}
        />
        <div className="note-organization-fields">
          <ProjectNoteSelector
            projects={projects}
            value={note.projectId}
            disabled={readOnly || organization.readOnly}
            onChange={(projectId) => onMetadataChange({ projectId })}
          />
          <FolderSelector
            folders={organization.folders}
            projectId={note.projectId}
            value={note.folderId}
            disabled={readOnly || organization.readOnly}
            onChange={(folderId) => onMetadataChange({ folderId })}
          />
        </div>
        <TagSelector
          tags={organization.tags}
          value={note.tagIds || []}
          onChange={(tagIds) => onMetadataChange({ tagIds })}
          onManage={organization.onManageTags}
          disabled={readOnly || organization.readOnly}
        />
        <div className="note-timestamps">
          <span>
            Created <time dateTime={note.createdAt}>{timestamp(note.createdAt)}</time>
          </span>
          <span>
            Edited <time dateTime={note.updatedAt}>{timestamp(note.updatedAt)}</time>
          </span>
        </div>
        <LinkedTasks tasks={linkedTasks} onOpenTask={onOpenTask} />
        <NoteSearch editor={editor} searchRef={searchRef} onClose={() => {
          setDocumentSearch(editor, { query: '' })
          searchButton.current?.focus()
        }} />
      </div>
      {displayContentError && (
        <p className="storage-error" role="alert">
          {displayContentError}
        </p>
      )}
      <EditorToolbar editor={editor} disabled={readOnly || Boolean(displayContentError)} />
      <div className={`note-reading-layout${navigationOpen ? ' has-navigation' : ''}`}>
        <div className="note-writing-area">
          <EditorContent editor={editor} />
        </div>
        <NoteNavigation editor={editor} open={navigationOpen} id={navigationId} onClose={closeNavigation} />
      </div>
    </section>
  )
}
