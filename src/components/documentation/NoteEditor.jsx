import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Check, Copy, Loader2, Trash2, AlertCircle, Search } from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import ProjectNoteSelector from './ProjectNoteSelector'
import { editorExtensions } from './editorExtensions'
import LinkedTasks from './LinkedTasks'
import FolderSelector from './FolderSelector'
import TagSelector from '../TagSelector'

function timestamp(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function NoteEditor({ note, projects, store, status, readOnly, onBack, onDuplicate, onDelete, linkedTasks = [], onOpenTask, organization, onMetadataChange }) {
  const [contentError, setContentError] = useState('')
  const invalid = useRef(false)
  const editor = useEditor({
    extensions: editorExtensions(),
    content: note.content,
    editable: !readOnly,
    shouldRerenderOnTransaction: false,
    enableContentCheck: true,
    editorProps: { attributes: { class: 'note-prose', role: 'textbox', 'aria-label': 'Note content', 'aria-multiline': 'true', 'data-placeholder': 'Let your ideas take shape…' } },
    onContentError: () => { invalid.current = true; setContentError('This note contains unsupported formatting. Its saved content has been preserved; editing is disabled.') },
    onUpdate: ({ editor: current }) => { if (!invalid.current) store.update(note.id, { content: current.getJSON() }) },
  })
  useEffect(() => { editor?.setEditable(!readOnly && !contentError, false) }, [editor, readOnly, contentError])
  return <section className="note-editor" aria-label="Note editor">
    <div className="note-editor-top"><button type="button" className="back-button notes-back" onClick={onBack}><ArrowLeft size={16} /> All notes</button><span className={`save-status ${status}`} role="status">{status === 'saving' ? <Loader2 size={13} /> : status === 'error' ? <AlertCircle size={13} /> : <Check size={13} />}{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}</span><div className="card-actions"><button className="icon-button" type="button" aria-label="Search No-Te" title="Search No-Te" onClick={organization.onSearch}><Search size={16} /></button><button className="icon-button" type="button" aria-label="Duplicate note" title="Duplicate note" disabled={readOnly} onClick={onDuplicate}><Copy size={16} /></button><button className="icon-button delete-action" type="button" aria-label="Delete note" title="Delete note" disabled={readOnly} onClick={onDelete}><Trash2 size={16} /></button></div></div>
    <div className="note-title-area"><input className="note-title" aria-label="Note title" value={note.title} maxLength={200} placeholder="Untitled note" disabled={readOnly} onChange={event => store.update(note.id, { title: event.target.value })} onBlur={() => store.flush()} />
      <div className="note-organization-fields"><ProjectNoteSelector projects={projects} value={note.projectId} disabled={readOnly || organization.readOnly} onChange={projectId => onMetadataChange({ projectId })} />
      <FolderSelector folders={organization.folders} projectId={note.projectId} value={note.folderId} disabled={readOnly || organization.readOnly} onChange={folderId => onMetadataChange({ folderId })} /></div>
      <TagSelector tags={organization.tags} value={note.tagIds || []} onChange={tagIds => onMetadataChange({ tagIds })} onManage={organization.onManageTags} disabled={readOnly || organization.readOnly} />
      <div className="note-timestamps"><span>Created <time dateTime={note.createdAt}>{timestamp(note.createdAt)}</time></span><span>Edited <time dateTime={note.updatedAt}>{timestamp(note.updatedAt)}</time></span></div>
      <LinkedTasks tasks={linkedTasks} onOpenTask={onOpenTask} />
    </div>
    {contentError && <p className="storage-error" role="alert">{contentError}</p>}
    <EditorToolbar editor={editor} disabled={readOnly || Boolean(contentError)} />
    <div className="note-writing-area"><EditorContent editor={editor} /></div>
  </section>
}
