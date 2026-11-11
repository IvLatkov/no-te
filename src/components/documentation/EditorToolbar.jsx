import { useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, List, ListOrdered, ListTodo, Quote, SquareCode, Link, Minus, Undo2, Redo2 } from 'lucide-react'
import Modal from '../Modal'
import { safeLink } from './editorExtensions'

function LinkModal({ editor, onClose }) {
  const [value, setValue] = useState(editor.getAttributes('link').href || '')
  const [error, setError] = useState('')
  function save(event) {
    event.preventDefault()
    const href = safeLink(value)
    if (!href) { setError('Enter a valid web or email link (https://, http://, or mailto:).'); return }
    if (editor.isActive('link') || !editor.state.selection.empty) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    else editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    onClose()
  }
  return <Modal title="Edit link" onClose={onClose} error={error}><form onSubmit={save}><label htmlFor="note-link-url">Link URL</label><input autoFocus id="note-link-url" value={value} onChange={event => setValue(event.target.value)} placeholder="https://example.com" />
    <div className="modal-actions">{editor.isActive('link') && <button type="button" className="button secondary" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose() }}>Remove link</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save link</button></div>
  </form></Modal>
}

export default function EditorToolbar({ editor, disabled }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const state = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    h1: current.isActive('heading', { level: 1 }), h2: current.isActive('heading', { level: 2 }), h3: current.isActive('heading', { level: 3 }),
    bold: current.isActive('bold'), italic: current.isActive('italic'), strike: current.isActive('strike'),
    bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'), task: current.isActive('taskList'),
    quote: current.isActive('blockquote'), code: current.isActive('codeBlock'), link: current.isActive('link'),
    canUndo: current.can().undo(), canRedo: current.can().redo(),
  } : null })
  const groups = [
    [['Heading 1', Heading1, 'h1', () => editor.chain().focus().toggleHeading({ level: 1 }).run()], ['Heading 2', Heading2, 'h2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()], ['Heading 3', Heading3, 'h3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()]],
    [['Bold', Bold, 'bold', () => editor.chain().focus().toggleBold().run()], ['Italic', Italic, 'italic', () => editor.chain().focus().toggleItalic().run()], ['Strikethrough', Strikethrough, 'strike', () => editor.chain().focus().toggleStrike().run()]],
    [['Bullet list', List, 'bullet', () => editor.chain().focus().toggleBulletList().run()], ['Numbered list', ListOrdered, 'ordered', () => editor.chain().focus().toggleOrderedList().run()], ['Checklist', ListTodo, 'task', () => editor.chain().focus().toggleTaskList().run()]],
    [['Blockquote', Quote, 'quote', () => editor.chain().focus().toggleBlockquote().run()], ['Code block', SquareCode, 'code', () => editor.chain().focus().toggleCodeBlock().run()], ['Link', Link, 'link', () => setLinkOpen(true)], ['Horizontal divider', Minus, null, () => editor.chain().focus().setHorizontalRule().run()]],
    [['Undo', Undo2, null, () => editor.chain().focus().undo().run(), !state?.canUndo], ['Redo', Redo2, null, () => editor.chain().focus().redo().run(), !state?.canRedo]],
  ]
  return <><div className="editor-toolbar" role="group" aria-label="Note formatting">{groups.map((group, index) => <div className="toolbar-group" key={index}>{group.map(([label, Icon, active, action, unavailable]) => <button key={label} type="button" className={`icon-button${active && state?.[active] ? ' is-active' : ''}`} aria-label={label} title={label} aria-pressed={active ? Boolean(state?.[active]) : undefined} disabled={disabled || !editor || unavailable} onMouseDown={event => event.preventDefault()} onClick={action}><Icon size={17} strokeWidth={1.7} /></button>)}</div>)}</div>{linkOpen && editor && <LinkModal editor={editor} onClose={() => setLinkOpen(false)} />}</>
}
