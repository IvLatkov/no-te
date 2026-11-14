import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'

test('replacing a disposed Tiptap instance does not misclassify valid note content', async () => {
  const ui = await uiHarness('test-note-editor-disposed-instance', {
    module: '/tests/helpers/EditorLifecycleFixture.jsx', strictMode: true,
  })
  try {
    await ui.mount()
    await ui.waitFor(() => ui.editor())
    const stale = ui.editor()
    // A suspended render can retain an instance that useEditor disposes before
    // its own effect replaces it. Exercise that transition with a real editor.
    await ui.act(async () => stale.destroy())
    await ui.click(ui.byText('Refresh note record'))
    await ui.waitFor(() => ui.editor() && ui.editor() !== stale && !ui.editor().isDestroyed)
    assert.doesNotMatch(document.body.textContent, /unsupported formatting/)
    assert.equal(ui.editor().isEditable, true)
    await ui.act(async () => ui.editor().commands.insertContent('Recovered editor can save'))
    assert.match(ui.editor().getText(), /Recovered editor can save/)
  } finally { await ui.close() }
})

test('blank JSONB note remains editable through StrictMode editor lifecycle', async () => {
  const changes = []
  const ui = await uiHarness('test-note-editor-lifecycle', {
    module: '/src/components/documentation/NoteEditor.jsx',
    strictMode: true,
    props: {
      note: { id: 'qa-note', title: 'Blank note', content: { content: [{ type: 'paragraph' }], type: 'doc' }, projectId: null, folderId: null, tagIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      projects: [], status: 'saved', readOnly: false,
      store: { update: (...args) => changes.push(args), flush: async () => {} },
      organization: { folders: [], tags: [], readOnly: false, onSearch() {}, onManageTags() {} },
      onMetadataChange() {},
    },
  })
  try {
    await ui.mount()
    await ui.waitFor(() => ui.editor())
    assert.doesNotMatch(document.body.textContent, /unsupported formatting/)
    assert.equal(ui.editor().isEditable, true)
    await ui.act(async () => ui.editor().commands.insertContent('QA lifecycle content'))
    assert.ok(changes.some(([, patch]) => JSON.stringify(patch.content).includes('QA lifecycle content')))
  } finally { await ui.close() }
})
