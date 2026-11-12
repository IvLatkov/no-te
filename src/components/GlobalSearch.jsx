import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FileText, Layers, Search, SquareCheck } from 'lucide-react'
import Modal from './Modal'
import { buildSearchIndex, searchExcerpt, searchIndex } from '../data/search'

function Highlight({ text, query }) {
  const term = query.trim()
  const position = term ? text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) : -1
  if (position < 0) return text
  return (
    <>
      {text.slice(0, position)}
      <mark>{text.slice(position, position + term.length)}</mark>
      {text.slice(position + term.length)}
    </>
  )
}
const icons = { Projects: Layers, Tasks: SquareCheck, Documentation: FileText }

export default function GlobalSearch({ projects, notes, tags, onNavigate, onClose }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const input = useRef(null)
  const prefix = useId()
  const index = useMemo(() => buildSearchIndex(projects, notes, tags), [projects, notes, tags])
  const results = useMemo(() => searchIndex(index, debounced), [index, debounced])
  const pending = query !== debounced
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0))
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    document.getElementById(`${prefix}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [prefix, activeIndex])
  function choose(result) {
    if (onNavigate(result)) onClose()
    else
      setError(
        'Your current changes could not be saved. Close search and retry saving before navigating.',
      )
  }
  function keyDown(event) {
    if (event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      setActive((value) =>
        results.length
          ? (Math.min(value, results.length - 1) +
              (event.key === 'ArrowDown' ? 1 : -1) +
              results.length) %
            results.length
          : 0,
      )
    }
    if (event.key === 'Enter' && results[activeIndex] && !pending) {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }
  return (
    <Modal title="Search No-Te" className="global-search-modal" onClose={onClose} error={error}>
      <div className="global-search-input">
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          type="search"
          role="combobox"
          aria-label="Search everything"
          aria-autocomplete="list"
          aria-controls={`${prefix}-results`}
          aria-expanded={!pending && results.length > 0}
          aria-activedescendant={
            !pending && results.length ? `${prefix}-${activeIndex}` : undefined
          }
          placeholder="Search projects, tasks, notes, or tags…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={keyDown}
        />
      </div>
      <div
        className="global-search-results"
        role="listbox"
        id={`${prefix}-results`}
        aria-label="Search results"
        aria-busy={pending}
      >
        {!pending &&
          ['Projects', 'Tasks', 'Documentation'].map((type) => {
            const matches = results.filter((item) => item.type === type)
            const Icon = icons[type]
            return matches.length ? (
              <div role="group" aria-label={type} key={type}>
                <h3 aria-hidden="true">{type}</h3>
                {matches.map((result) => {
                  const resultIndex = results.indexOf(result)
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeIndex === resultIndex}
                      tabIndex={-1}
                      id={`${prefix}-${resultIndex}`}
                      key={`${type}:${result.projectId || ''}:${result.id}`}
                      className={`search-result${activeIndex === resultIndex ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(resultIndex)}
                      onClick={() => choose(result)}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>
                          <Highlight text={result.title} query={debounced} />
                        </strong>
                        <span className="search-excerpt">
                          <Highlight
                            text={searchExcerpt(result.text, debounced) || 'No description yet.'}
                            query={debounced}
                          />
                        </span>
                        <small>
                          {result.projectName ? `${result.projectName} · ` : ''}
                          {type === 'Documentation'
                            ? 'Note'
                            : type === 'Tasks'
                              ? 'Task'
                              : 'Project'}
                        </small>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null
          })}
      </div>
      <p className="search-help" role="status">
        {pending
          ? 'Searching…'
          : !query.trim()
            ? 'Find a project, task, note, or tag.'
            : !results.length
              ? 'No matches. Try another word or phrase.'
              : `${results.length} results · ↑ ↓ to select · Enter to open · Esc to close`}
      </p>
    </Modal>
  )
}
