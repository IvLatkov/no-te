import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { closeHistory } from '@tiptap/pm/history'
import { STORAGE_KEY, createProject, normalizeTask } from '../src/data/projects.js'
import { NOTES_STORAGE_KEY, noteText } from '../src/data/notes.js'

test('documentation UI integrates CRUD, editor toolbar, checklists, navigation saves, and project preservation', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'MutationObserver', 'DOMParser', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'getComputedStyle']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name] === 'function' && name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name] })
  }
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0)
  globalThis.cancelAnimationFrame = clearTimeout
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  // jsdom does not implement dialog modality or layout measurement. These
  // adapters let us exercise React/Tiptap behavior, not browser layout or focus traps.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const server = await createServer({ cacheDir: 'node_modules/.vite/test-documentation-ui', server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } })
  let root
  try {
    // Keep editor regression coverage against the quarantined legacy workspace.
    const { default: App } = await server.ssrLoadModule('/src/LocalWorkspace.jsx')
    const React = await import('react')
    const project = createProject({ name: 'Release plan', description: 'Project documentation' })
    const untouched = createProject({ name: 'Keep this project' })
    untouched.tasks.push({ id: crypto.randomUUID(), title: 'Existing task', description: '', status: 'todo' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([project, untouched]))
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(React.createElement(App)))
    const buttons = () => [...document.querySelectorAll('button')]
    const byText = text => { const result = buttons().find(button => button.textContent.trim() === text); assert.ok(result, `Button ${text} exists`); return result }
    const byLabel = label => { const result = buttons().find(button => button.getAttribute('aria-label') === label); assert.ok(result, `Button ${label} exists`); return result }
    const click = async element => { await act(async () => { element.click() }) }
    const input = async (element, value) => {
      assert.ok(element, 'Input exists')
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value)
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
    }
    const select = async (element, value) => { await act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })) }) }
    const submit = async () => { await act(async () => { document.querySelector('dialog form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) }) }
    const waitFor = async predicate => {
      for (let index = 0; index < 100; index++) {
        if (predicate()) return
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
      }
      assert.ok(predicate(), 'Expected UI appears')
    }
    const savedNotes = () => JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]')
    const editor = () => document.querySelector('.note-prose')?.editor

    await openDocumentation({ click, waitFor })
    await waitFor(() => document.querySelector('.notes-panel'))
    assert.match(document.querySelector('.notes-editor-empty').textContent, /Choose a note/)
    await click(byText('New Note'))
    await input(document.getElementById('new-note-title'), 'Architecture')
    await select(document.querySelector('dialog select'), project.id)
    await submit()
    await waitFor(() => editor())
    assert.equal(savedNotes()[0].projectId, project.id)
    assert.equal(document.querySelector('.note-title').value, 'Architecture')

    await act(async () => { editor().commands.insertContent('Searchable project knowledge') })
    assert.match(document.querySelector('.save-status').textContent, /Saving/)
    await act(async () => { editor().commands.setTextSelection({ from: 1, to: 29 }) })
    await click(byLabel('Bold'))
    assert.equal(editor().isActive('bold'), true)
    await click(byLabel('Italic'))
    await click(byLabel('Strikethrough'))
    assert.equal(editor().isActive('italic'), true)
    assert.equal(editor().isActive('strike'), true)
    await click(byLabel('Heading 2'))
    assert.equal(editor().isActive('heading', { level: 2 }), true)
    await click(byLabel('Heading 2'))
    await click(byLabel('Checklist'))
    const checkbox = document.querySelector('.note-prose input[type="checkbox"]')
    assert.ok(checkbox)
    await act(async () => { editor().view.dispatch(closeHistory(editor().state.tr)) })
    await click(checkbox)
    assert.equal(editor().getJSON().content[0].content[0].attrs.checked, true)
    await click(byLabel('Undo'))
    assert.equal(editor().getJSON().content[0].content[0].attrs.checked, false)
    await click(byLabel('Redo'))
    assert.equal(editor().getJSON().content[0].content[0].attrs.checked, true)
    await waitFor(() => document.querySelector('.save-status').textContent === 'Saved')
    assert.equal(savedNotes()[0].content.content[0].content[0].attrs.checked, true)

    await act(async () => { editor().commands.selectAll() })
    await click(byLabel('Link'))
    await input(document.getElementById('note-link-url'), 'https://example.com/docs')
    await submit()
    assert.equal(editor().getAttributes('link').href, 'https://example.com/docs')
    await input(document.querySelector('.note-title'), 'Renamed architecture')
    // Navigate within the debounce window: the draft must save synchronously.
    await click(document.querySelector('.primary-nav button:nth-child(2)'))
    assert.equal(savedNotes()[0].title, 'Renamed architecture')
    const originalId = savedNotes()[0].id
    assert.match(noteText(savedNotes()[0].content), /Searchable project knowledge/)

    await openDocumentation({ click, waitFor })
    await waitFor(() => document.querySelector('.note-card'))
    await click(document.querySelector('.note-card'))
    await waitFor(() => editor())
    await click(byLabel('Duplicate note'))
    await waitFor(() => document.querySelector('.note-title')?.value === 'Renamed architecture (copy)')
    assert.equal(savedNotes().length, 2)
    const copyId = savedNotes().find(note => note.id !== originalId).id
    assert.deepEqual(savedNotes()[0].content, savedNotes()[1].content)
    await input(document.querySelector('.notes-search input'), 'SEARCHABLE')
    assert.equal(document.querySelectorAll('.note-card').length, 2)
    await input(document.querySelector('.notes-search input'), 'no match here')
    assert.equal(document.querySelectorAll('.note-card').length, 0)
    await input(document.querySelector('.notes-search input'), '')
    await select(document.querySelector('[aria-label="Sort notes"]'), 'title')
    assert.equal(document.querySelector('.note-card-title').textContent, 'Renamed architecture')
    await select(document.querySelector('[aria-label="Filter notes by project"]'), '')
    assert.equal(document.querySelectorAll('.note-card').length, 0)
    await select(document.querySelector('[aria-label="Filter notes by project"]'), project.id)
    assert.equal(document.querySelectorAll('.note-card').length, 2)

    await click(document.querySelector('.project-nav button'))
    await click(document.querySelector('.project-tabs button:nth-child(2)'))
    await waitFor(() => document.querySelector('.notes-panel'))
    assert.equal(document.querySelectorAll('.note-card').length, 2)
    await click(byText('New Note'))
    assert.equal(document.querySelector('dialog select').value, project.id)
    await input(document.getElementById('new-note-title'), 'Project-only note')
    await submit()
    assert.equal(savedNotes().length, 3)
    assert.equal(savedNotes().find(note => note.title === 'Project-only note').projectId, project.id)
    await click(byLabel('Delete project'))
    assert.match(document.querySelector('dialog').textContent, /preserved and become unassigned/)
    await click(byText('Delete'))
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).length, 1)
    assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEY))[0], { ...untouched, tasks: untouched.tasks.map(normalizeTask) })
    assert.equal(savedNotes().length, 3)
    assert.equal(savedNotes().every(note => note.projectId === null), true)

    await openDocumentation({ click, waitFor })
    await waitFor(() => document.querySelector('.note-card'))
    await click([...document.querySelectorAll('.note-card')].find(card => card.textContent.includes('(copy)')))
    await waitFor(() => editor())
    await click(byLabel('Delete note'))
    await click(byText('Cancel'))
    assert.equal(savedNotes().length, 3)
    await click(byLabel('Delete note'))
    await click(byText('Delete'))
    assert.equal(savedNotes().length, 2)
    assert.equal(savedNotes().some(note => note.id === copyId), false)

    await act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(React.createElement(App)))
    await openDocumentation({ click, waitFor })
    await waitFor(() => document.querySelector('.note-card'))
    assert.equal(document.querySelectorAll('.note-card').length, 2, 'a new application instance restores saved notes')
    await click([...document.querySelectorAll('.note-card')].find(card => card.textContent.includes('Renamed architecture')))
    await waitFor(() => editor())
    assert.equal(editor().getJSON().content[0].content[0].attrs.checked, true)
    assert.equal(editor().getAttributes('link').href || editor().getJSON().content[0].content[0].content[0].content[0].marks.find(mark => mark.type === 'link')?.attrs.href, 'https://example.com/docs')
  } finally {
    if (root) await act(async () => root.unmount())
    await server.close()
    dom.window.close()
  }
})
