import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { documentNavigationKey, documentNavigationSnapshot, setDocumentSearch } from './documentNavigation.js'

function useNavigation(editor) {
  const [snapshot, setSnapshot] = useState(() => documentNavigationSnapshot(editor))
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const update = ({ transaction } = {}) => {
      if (!transaction || transaction.docChanged || transaction.getMeta(documentNavigationKey)) {
        setSnapshot(documentNavigationSnapshot(editor))
      }
    }
    update()
    editor.on('transaction', update)
    return () => editor.off('transaction', update)
  }, [editor])
  return snapshot || {}
}

export function NoteSearch({ editor, searchRef, onClose }) {
  const { matches = [], query = '', index = 0, truncated = false } = useNavigation(editor)

  function showMatch(nextIndex) {
    if (!editor || editor.isDestroyed || !matches.length) return
    const current = (nextIndex + matches.length) % matches.length
    setDocumentSearch(editor, { index: current })
    editor.commands.setTextSelection(matches[current])
    editor.commands.scrollIntoView()
  }

  function search(value) {
    setDocumentSearch(editor, { query: value, index: 0 })
    const first = documentNavigationSnapshot(editor)?.matches[0]
    if (first) {
      editor.commands.setTextSelection(first)
      editor.commands.scrollIntoView()
    }
  }

  return (
    <div className="note-document-find">
      <label className="note-document-search">
        <span>Search in document</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          maxLength={200}
          disabled={!editor || editor.isDestroyed}
          onChange={event => search(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            } else if (event.key === 'Enter') {
              event.preventDefault()
              showMatch(index + (event.shiftKey ? -1 : 1))
            }
          }}
          placeholder="Find text…"
        />
      </label>
      <div className="note-search-controls">
        <span role="status">{query ? matches.length ? `${index + 1} of ${matches.length}${truncated ? '+' : ''} matches` : 'No matches' : 'Enter text to find'}</span>
        <button type="button" className="icon-button" aria-label="Previous match" disabled={!matches.length} onClick={() => showMatch(index - 1)}><ArrowUp size={15} aria-hidden="true" /></button>
        <button type="button" className="icon-button" aria-label="Next match" disabled={!matches.length} onClick={() => showMatch(index + 1)}><ArrowDown size={15} aria-hidden="true" /></button>
      </div>
      {truncated && <p className="note-outline-empty">Showing the first 1,000 matches. Refine your search for more specific results.</p>}
    </div>
  )
}

export default function NoteNavigation({ editor, open, id, onClose }) {
  const { headings = [] } = useNavigation(editor)
  return (
    <aside id={id} className="note-document-navigation" hidden={!open} aria-label="Document navigation">
      <div className="note-navigation-heading">
        <h3>In this document</h3>
        <button type="button" className="icon-button" aria-label="Hide document navigation" onClick={onClose}><X size={15} aria-hidden="true" /></button>
      </div>
      <nav aria-label="Table of contents">
        <h3>Table of contents</h3>
        {headings.length ? (
          <ul>
            {headings.map(heading => (
              <li key={heading.position} className={`toc-level-${heading.level}`}>
                <button type="button" onClick={() => {
                  if (!editor || editor.isDestroyed) return
                  editor.chain().focus().setTextSelection(heading.position + 1).scrollIntoView().run()
                  editor.view.nodeDOM(heading.position)?.scrollIntoView?.({ block: 'start' })
                }}>{heading.title}</button>
              </li>
            ))}
          </ul>
        ) : <p className="note-outline-empty">Use H1, H2 or H3 headings to build a table of contents.</p>}
      </nav>
    </aside>
  )
}
