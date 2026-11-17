import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import { editorExtensions } from '../src/components/documentation/editorExtensions.js'
import { scanDocument } from '../src/components/documentation/documentNavigation.js'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'

const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const heading = (text, level) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const wireJson = value => JSON.parse(JSON.stringify(value))
const content = {
  type: 'doc', content: [heading('Overview', 1), paragraph('Alpha release alpha [x].'),
    heading('Install', 2), paragraph('Alpha instructions.'), heading('Details', 3)],
}

test('outline and literal search preserve positions across marks, Unicode, duplicate headings and hard breaks', () => {
  const schema = getSchema(editorExtensions())
  const json = { type: 'doc', content: [
    heading('Repeated heading', 1), heading('Repeated heading', 2), heading('Deep detail', 3),
    { type: 'paragraph', content: [{ type: 'text', text: '💡 Café a.b[1] plan ' }, { type: 'text', text: 'release', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: 'next' }] },
  ] }
  const doc = schema.nodeFromJSON(json)
  const result = scanDocument(doc, 'plan release')
  assert.deepEqual(result.headings.map(item => item.level), [1, 2, 3])
  assert.equal(new Set(result.headings.map(item => item.position)).size, 3)
  assert.equal(result.matches.length, 1)
  assert.equal(doc.textBetween(result.matches[0].from, result.matches[0].to), 'plan release')
  for (const query of ['a.b[1]', 'CAFÉ', '💡']) {
    const found = scanDocument(doc, query).matches
    assert.equal(found.length, 1, query)
    assert.equal(doc.textBetween(found[0].from, found[0].to).toLowerCase(), query.toLowerCase())
  }
  assert.equal(scanDocument(doc, 'releasenext').matches.length, 0)
  assert.equal(scanDocument(doc, '[').matches.length, 1)
  assert.deepEqual(wireJson(doc.toJSON()), json)
})

test('large search results are bounded and explicitly report truncation', () => {
  const schema = getSchema(editorExtensions())
  const doc = schema.nodeFromJSON({ type: 'doc', content: [paragraph('find '.repeat(1002))] })
  const result = scanDocument(doc, 'find')
  assert.equal(result.matches.length, 1000)
  assert.equal(result.truncated, true)
  assert.equal(scanDocument(doc, '').matches.length, 0)
})

test('read-only documentation still supports outline navigation and search without edits', async () => {
  let writes = 0
  const stamp = '2026-11-17T10:00:00Z'
  const ui = await uiHarness('document-navigation-readonly', {
    module: '/src/components/documentation/NoteEditor.jsx',
    props: {
      note: { id: 'read-only', title: 'Reference', content, createdAt: stamp, updatedAt: stamp, projectId: null },
      projects: [], readOnly: true, status: 'saved',
      store: { update() { writes++ }, flush() { return true } },
      organization: { tags: [], folders: [], readOnly: true, onSearch() {}, onManageTags() {} },
      onBack() {}, onMetadataChange() {},
    },
  })
  try {
    await ui.mount()
    await ui.waitFor(() => ui.editor())
    assert.equal(ui.editor().isEditable, false)
    await ui.click(ui.byText('Details', document.querySelector('nav[aria-label="Table of contents"]')))
    assert.equal(ui.editor().state.selection.$from.parent.textContent, 'Details')
    await ui.input(document.querySelector('.note-document-search input'), 'Alpha')
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /1 of 3/)
    assert.equal(writes, 0)
  } finally { await ui.close() }
})

async function openEditor(db, cacheName) {
  db.emit('alice')
  await createDocumentationApi(db, 'alice').createNote({ title: 'Reading tools', content })
  const ui = await uiHarness(cacheName, { module: '/src/App.jsx', props: { client: db, configError: '' } })
  await ui.mount()
  await ui.click(ui.byText('Documentation', document.querySelector('.primary-nav')))
  await ui.waitFor(() => document.querySelector('.note-card'))
  await ui.click(document.querySelector('.note-card'))
  await ui.waitFor(() => ui.editor())
  return ui
}

test('wide mode, outline jumps and in-document search navigate without writing note content', async () => {
  const db = cloudSupabase()
  const ui = await openEditor(db, 'document-navigation')
  try {
    const saved = structuredClone(db.notes[0].content)
    const callCount = db.calls.length
    const outline = document.querySelector('nav[aria-label="Table of contents"]')
    assert.ok(document.querySelector('.note-linked-tasks').nextElementSibling.matches('.note-document-find'))
    assert.equal(document.querySelector('.note-document-navigation .note-document-search'), null)
    assert.deepEqual([...outline.querySelectorAll('button')].map(button => button.textContent), ['Overview', 'Install', 'Details'])
    await ui.click(ui.byLabel('Widen document'))
    assert.ok(document.querySelector('.note-editor.is-wide'))
    await ui.click(ui.byLabel('Use standard document width'))
    assert.equal(document.querySelector('.note-editor.is-wide'), null)
    await ui.click(ui.byText('Install', outline))
    await ui.waitFor(() => document.activeElement === ui.editor().view.dom)
    assert.equal(ui.editor().state.selection.$from.parent.textContent, 'Install')
    await ui.click(ui.byLabel('Find in document'))
    await ui.waitFor(() => document.activeElement === document.querySelector('.note-document-search input'))
    const input = document.querySelector('.note-document-search input')
    await ui.input(input, 'alpha')
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /1 of 3 matches/)
    assert.equal(document.querySelectorAll('.note-search-match').length, 3)
    const firstPosition = ui.editor().state.selection.from
    await ui.click(ui.byLabel('Next match'))
    assert.notEqual(ui.editor().state.selection.from, firstPosition)
    await ui.click(ui.byLabel('Previous match'))
    assert.equal(ui.editor().state.selection.from, firstPosition)
    await ui.act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /2 of 3/)
    await ui.input(input, 'not present')
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /No matches/)
    assert.ok(ui.byLabel('Next match').disabled)
    await ui.input(input, '[x].')
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /1 of 1/)
    await ui.act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    assert.equal(document.querySelectorAll('.note-search-match').length, 0)
    assert.equal(document.activeElement, ui.byLabel('Find in document'))
    await ui.click(ui.byLabel('Table of contents'))
    assert.ok(document.querySelector('.note-document-navigation').hidden)
    assert.ok(document.querySelector('.note-document-search input').isConnected)
    assert.deepEqual(wireJson(ui.editor().getJSON()), saved)
    assert.deepEqual(db.notes[0].content, saved)
    assert.ok(db.calls.slice(callCount).every(call => call.op === 'select'))
  } finally { await ui.close() }
})

test('outline and matches update after editing, autosave and reload without persisting search decorations', async () => {
  const db = cloudSupabase()
  const ui = await openEditor(db, 'document-navigation-save')
  try {
    await ui.click(ui.byLabel('Find in document'))
    await ui.input(document.querySelector('.note-document-search input'), 'Alpha')
    const edited = { type: 'doc', content: [heading('Updated requirements', 2), paragraph('Alpha changed.')] }
    await ui.act(async () => ui.editor().commands.setContent(edited))
    await ui.waitFor(() => document.querySelector('nav[aria-label="Table of contents"]').textContent.includes('Updated requirements'))
    assert.match(document.querySelector('.note-search-controls [role="status"]').textContent, /1 of 1/)
    await ui.click(ui.byText('Projects', document.querySelector('.primary-nav')))
    await ui.waitFor(() => document.querySelector('.projects-page'))
    assert.deepEqual(db.notes[0].content, edited)
    await ui.click(ui.byText('Documentation', document.querySelector('.primary-nav')))
    await ui.waitFor(() => document.querySelector('.note-card'))
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    assert.deepEqual(wireJson(ui.editor().getJSON()), edited)
    assert.equal(document.querySelector('.note-document-search input').value, '')
    assert.equal(document.querySelectorAll('.note-search-match').length, 0)
  } finally { await ui.close() }
})

test('dashboard documentation window widens and Escape in document search keeps the note window open', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const project = await (await import('../src/data/supabaseProjects.js')).createProjectsApi(db, 'alice').createProject({ name: 'Reading project', description: '' })
  await createDocumentationApi(db, 'alice').createNote({ title: 'Dashboard guide', projectId: project.id, content })
  const ui = await uiHarness('document-navigation-dashboard', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await ui.click(document.querySelector('.dashboard-project-picker > button'))
    await ui.click(ui.byText('Reading project', document.querySelector('#dashboard-project-options')))
    await ui.waitFor(() => document.querySelector('[aria-label="Open note Dashboard guide"]'))
    await ui.click(ui.byLabel('Open note Dashboard guide'))
    await ui.waitFor(() => ui.editor())
    await ui.click(ui.byLabel('Widen document'))
    assert.ok(document.querySelector('.dashboard-note-dialog .note-editor.is-wide'))
    const dialog = document.querySelector('.dashboard-note-dialog')
    const handle = ui.byLabel('Resize documentation window', dialog)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    dialog.getBoundingClientRect = () => ({
      width: parseFloat(dialog.style.width) || 900, height: parseFloat(dialog.style.height) || 600,
      left: parseFloat(dialog.style.left) || 180, top: parseFloat(dialog.style.top) || 80,
    })
    await ui.act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })))
    assert.equal(dialog.style.width, '932px')
    await ui.act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })))
    assert.equal(dialog.style.height, '568px')
    await ui.act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })))
    assert.equal(dialog.style.width, '')
    function pointer(type, x, y) {
      const event = new ui.dom.window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      handle.dispatchEvent(event)
    }
    await ui.act(async () => pointer('pointerdown', 100, 100))
    await ui.act(async () => pointer('pointermove', 260, 180))
    await ui.act(async () => pointer('pointerup', 260, 180))
    assert.equal(dialog.style.width, '1060px')
    assert.equal(dialog.style.height, '680px')
    assert.ok(!dialog.classList.contains('is-resizing'))
    await ui.click(ui.byLabel('Use standard document width'))
    assert.equal(dialog.style.width, '', 'Width toggle must reset manual geometry')
    await ui.act(async () => pointer('pointerdown', 0, 0))
    await ui.act(async () => pointer('pointermove', 5000, 5000))
    await ui.act(async () => pointer('pointercancel', 5000, 5000))
    assert.equal(dialog.style.width, '1376px')
    assert.equal(dialog.style.height, '876px')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 667 })
    await ui.act(async () => window.dispatchEvent(new Event('resize')))
    assert.equal(dialog.style.width, '351px')
    assert.equal(dialog.style.height, '643px')
    assert.equal(dialog.style.left, '12px')
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    await ui.act(async () => ui.editor().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })))
    await ui.waitFor(() => document.activeElement === document.querySelector('.note-document-search input'))
    await ui.act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    assert.ok(document.querySelector('.dashboard-note-dialog[open]'))
    await ui.click(ui.byLabel('Close dialog', document.querySelector('.dashboard-note-dialog')))
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
  } finally { await ui.close() }
})
