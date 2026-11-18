import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { exitCodeBlock } from '../src/components/documentation/editorCommands.js'

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
async function openEditor(client, content, cacheName) {
  client.emit('alice')
  await createDocumentationApi(client, 'alice').createNote({ title: 'Editor behavior', content })
  const ui = await uiHarness(cacheName, {
    module: '/src/App.jsx',
    props: { client, configError: '' },
  })
  await ui.mount()
  await openDocumentation(ui)
  await ui.waitFor(() => document.querySelector('.note-card'))
  await ui.click(document.querySelector('.note-card'))
  await ui.waitFor(() => ui.editor())
  return ui
}

test('toolbar converts the current paragraph without adding blank siblings and preserves pointer selection', async () => {
  const db = cloudSupabase()
  const ui = await openEditor(
    db,
    { type: 'doc', content: [paragraph('Current paragraph')] },
    'test-editor-toolbar-behavior',
  )
  try {
    for (const [label, type] of [
      ['Bullet list', 'bulletList'],
      ['Numbered list', 'orderedList'],
      ['Checklist', 'taskList'],
      ['Blockquote', 'blockquote'],
      ['Code block', 'codeBlock'],
    ]) {
      await ui.act(async () => {
        ui.editor().commands.setContent({ type: 'doc', content: [paragraph('Current paragraph')] })
        ui.editor().commands.setTextSelection(5)
      })
      await ui.click(ui.byLabel(label))
      assert.equal(
        ui.editor().getJSON().content.length,
        1,
        `${label} must not append a blank paragraph`,
      )
      assert.equal(ui.editor().getJSON().content[0].type, type)
      assert.equal(ui.editor().state.selection.$from.parentOffset, 4)
      await ui.waitFor(() => document.activeElement === ui.editor().view.dom)
      await ui.click(ui.byLabel(label))
      assert.equal(ui.editor().getJSON().content.length, 1)
      assert.equal(ui.editor().getJSON().content[0].type, 'paragraph')
      assert.equal(ui.editor().getText(), 'Current paragraph')
    }
    const button = ui.byLabel('Checklist')
    const event = new ui.dom.window.MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    await ui.act(async () => button.dispatchEvent(event))
    assert.equal(
      event.defaultPrevented,
      true,
      'pointer interaction must not steal the text selection',
    )
    for (const label of ['Bullet list', 'Numbered list', 'Checklist', 'Blockquote', 'Code block']) {
      await ui.act(async () => {
        ui.editor().commands.setContent({ type: 'doc', content: [paragraph('Selected text here')] })
        ui.editor().commands.setTextSelection({ from: 2, to: 9 })
      })
      await ui.click(ui.byLabel(label))
      const { doc, selection } = ui.editor().state
      assert.equal(doc.textBetween(selection.from, selection.to), 'elected')
      assert.equal(doc.childCount, 1)
    }
  } finally {
    await ui.close()
  }
})

test('cloud JSONB key ordering does not reset the cursor or editor history', async () => {
  const db = cloudSupabase()
  const ui = await openEditor(
    db,
    { type: 'doc', content: [paragraph('Middle of a paragraph')] },
    'test-editor-jsonb-selection',
  )
  try {
    await ui.act(async () => ui.editor().commands.setTextSelection(7))
    // JSONB may return equivalent objects with a different key ordering.
    const reorder = (value) =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, reorder(value[key])]),
            )
          : value
    db.notes[0].content = reorder(ui.editor().getJSON())
    await ui.click(document.querySelectorAll('.primary-nav button')[1])
    await ui.click(ui.byText('Refresh projects'))
    await ui.waitFor(
      () =>
        ![...document.querySelectorAll('[role="status"]')].some((item) =>
          item.textContent.includes('Loading'),
        ),
    )
    await openDocumentation(ui)
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    // A save response (not a remount) must be structurally compared to the live document.
    await ui.act(async () => {
      ui.editor().commands.setTextSelection(7)
      ui.editor().commands.toggleBold()
    })
    db.pause = async (call) => {
      if (call.table === 'notes' && call.op === 'update') {
        const row = db.notes[0]
        Object.assign(row, call.values, { content: reorder(call.values.content) })
        call.response = { data: { ...row }, error: null }
        db.pause = null
      }
    }
    await ui.act(async () => ui.editor().commands.insertContent('X'))
    const position = ui.editor().state.selection.from
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.equal(
      ui.editor().state.selection.from,
      position,
      'equivalent server JSON must not move the cursor',
    )
    assert.equal(ui.editor().can().undo(), true)
    await ui.act(async () => ui.editor().commands.undo())
    assert.equal(ui.editor().getText(), 'Middle of a paragraph')
  } finally {
    await ui.close()
  }
})

async function reset(ui, content, position) {
  await ui.act(async () => {
    ui.editor().commands.setContent({ type: 'doc', content })
    ui.editor().commands.setTextSelection(position)
  })
}
async function key(ui, name, options = {}) {
  const event = new ui.dom.window.KeyboardEvent('keydown', {
    key: name,
    code: name,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  await ui.act(async () => ui.editor().view.dom.dispatchEvent(event))
  return event
}

test('native list keys split, exit empty items, indent and outdent without cursor jumps', async () => {
  const ui = await openEditor(
    cloudSupabase(),
    { type: 'doc', content: [paragraph('Start')] },
    'test-editor-list-keys',
  )
  try {
    for (const [listType, itemType] of [
      ['bulletList', 'listItem'],
      ['orderedList', 'listItem'],
      ['taskList', 'taskItem'],
    ]) {
      const item = (text) => ({
        type: itemType,
        ...(itemType === 'taskItem' ? { attrs: { checked: false } } : {}),
        content: [text ? paragraph(text) : { type: 'paragraph' }],
      })
      await reset(ui, [{ type: listType, content: [item('First')] }], 8)
      await key(ui, 'Enter')
      assert.equal(ui.editor().getJSON().content[0].content.length, 2, listType)
      assert.equal(ui.editor().state.selection.$from.parentOffset, 0)
      await key(ui, 'Enter')
      assert.deepEqual(
        ui
          .editor()
          .getJSON()
          .content.map((node) => node.type),
        [listType, 'paragraph'],
      )
      assert.equal(ui.editor().state.selection.$from.depth, 1)
      await reset(ui, [{ type: listType, content: [item('')] }], 3)
      await key(ui, 'Backspace')
      assert.deepEqual(ui.editor().getJSON().content, [{ type: 'paragraph' }])
      assert.equal(ui.editor().state.selection.from, 1)
      await reset(ui, [{ type: listType, content: [item('First'), item('Second')] }], 12)
      const offset = ui.editor().state.selection.$from.parentOffset
      await key(ui, 'Tab')
      assert.equal(ui.editor().getJSON().content[0].content.length, 1)
      assert.equal(ui.editor().getJSON().content[0].content[0].content[1].type, listType)
      assert.equal(ui.editor().state.selection.$from.parentOffset, offset)
      await key(ui, 'Tab', { shiftKey: true })
      assert.equal(ui.editor().getJSON().content[0].content.length, 2)
      assert.equal(ui.editor().state.selection.$from.parentOffset, offset)
      assert.equal(ui.editor().state.doc.textContent, 'FirstSecond')
    }
  } finally {
    await ui.close()
  }
})

test('native checkbox controls expose keyboard access and preserve the text cursor on changes', async () => {
  const ui = await openEditor(
    cloudSupabase(),
    { type: 'doc', content: [paragraph('Action')] },
    'test-editor-checkbox',
  )
  try {
    await ui.act(async () => {
      ui.editor().commands.setTextSelection(4)
      ui.editor().commands.toggleTaskList()
    })
    const checkbox = document.querySelector('.note-prose input[type="checkbox"]')
    assert.equal(checkbox.tabIndex, 0)
    assert.ok(checkbox.getAttribute('aria-label'))
    const selection = ui.editor().state.selection.from
    await ui.click(checkbox)
    assert.equal(ui.editor().getJSON().content[0].content[0].attrs.checked, true)
    assert.equal(ui.editor().state.selection.from, selection)
    // jsdom lacks native Space activation. Verify the key is not intercepted,
    // then exercise the input's real change handler through its native click.
    checkbox.focus()
    const space = new ui.dom.window.KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    })
    await ui.act(async () => checkbox.dispatchEvent(space))
    assert.equal(space.defaultPrevented, false)
    await ui.click(checkbox)
    assert.equal(ui.editor().getJSON().content[0].content[0].attrs.checked, false)
    assert.equal(ui.editor().state.selection.from, selection)
  } finally {
    await ui.close()
  }
})

test('native code shortcuts and Exit code block preserve code and put the cursor into prose', async () => {
  const ui = await openEditor(
    cloudSupabase(),
    { type: 'doc', content: [paragraph('Start')] },
    'test-editor-code-exit',
  )
  const code = () => ({ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] })
  try {
    await reset(ui, [code()], 12)
    await key(ui, 'Enter')
    assert.equal(ui.editor().getJSON().content[0].content[0].text, 'const x = 1\n')
    await key(ui, 'Enter', { ctrlKey: true })
    assert.equal(ui.editor().getJSON().content[0].content[0].text, 'const x = 1\n')
    assert.equal(ui.editor().state.selection.$from.parent.type.name, 'paragraph')
    assert.equal(ui.editor().getJSON().content.length, 2)
    await ui.act(async () => ui.editor().commands.insertContent('Normal text'))
    assert.equal(ui.editor().getJSON().content[1].content[0].text, 'Normal text')
    await reset(ui, [code()], 12)
    await key(ui, 'Enter')
    await key(ui, 'Enter')
    await key(ui, 'Enter')
    assert.equal(ui.editor().getJSON().content[0].content[0].text, 'const x = 1')
    assert.equal(ui.editor().state.selection.$from.parent.type.name, 'paragraph')
    await reset(ui, [code()], 12)
    await key(ui, 'ArrowDown')
    assert.equal(ui.editor().state.selection.$from.parent.type.name, 'paragraph')
    await reset(ui, [code(), paragraph('Existing prose')], 4)
    const button = ui.byText('Exit code block')
    await ui.click(button)
    assert.equal(ui.editor().state.selection.$from.parent.textContent, 'Existing prose')
    assert.equal(ui.editor().state.selection.$from.parentOffset, 0)
    assert.equal(ui.editor().state.doc.childCount, 2)
    await ui.click(button) // A queued second activation of the removed control is harmless.
    assert.equal(exitCodeBlock(ui.editor()), false)
    assert.equal(ui.editor().state.doc.childCount, 2)
    await reset(ui, [code()], 4)
    await ui.click(ui.byText('Exit code block'))
    assert.equal(ui.editor().state.doc.childCount, 2)
    assert.equal(ui.editor().state.selection.$from.parent.type.name, 'paragraph')
    assert.equal(ui.editor().getJSON().content[0].content[0].text, 'const x = 1')
    await ui.waitFor(() => document.activeElement === ui.editor().view.dom)
  } finally {
    await ui.close()
  }
})

test('blockquote Enter continues and exits quotes without deleting or duplicating text', async () => {
  const ui = await openEditor(
    cloudSupabase(),
    { type: 'doc', content: [paragraph('Quote')] },
    'test-editor-quote-exit',
  )
  try {
    await ui.act(async () => {
      ui.editor().commands.setTextSelection(6)
      ui.editor().commands.toggleBlockquote()
    })
    await key(ui, 'Enter')
    assert.equal(ui.editor().getJSON().content[0].content.length, 2)
    await key(ui, 'Enter')
    assert.deepEqual(
      ui
        .editor()
        .getJSON()
        .content.map((node) => node.type),
      ['blockquote', 'paragraph'],
    )
    assert.equal(ui.editor().state.doc.textContent, 'Quote')
    assert.equal(ui.editor().state.selection.$from.depth, 1)
    await reset(ui, [{ type: 'blockquote', content: [paragraph('Keep quote')] }], 5)
    await ui.click(ui.byLabel('Blockquote'))
    assert.deepEqual(ui.editor().getJSON().content, [paragraph('Keep quote')])
    assert.equal(ui.editor().state.selection.$from.parentOffset, 3)
  } finally {
    await ui.close()
  }
})

test('formatting and code exit autosave and reload with the same rich text', async () => {
  const db = cloudSupabase()
  const ui = await openEditor(
    db,
    { type: 'doc', content: [paragraph('Saved list')] },
    'test-editor-format-persistence',
  )
  try {
    await ui.act(async () => ui.editor().commands.setTextSelection(4))
    await ui.click(ui.byLabel('Checklist'))
    await ui.click(document.querySelector('.note-prose input[type="checkbox"]'))
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.equal(db.notes[0].content.content.length, 1)
    assert.equal(db.notes[0].content.content[0].content[0].attrs.checked, true)
    const saved = structuredClone(db.notes[0].content)
    await ui.mount()
    await openDocumentation(ui)
    await ui.waitFor(() => document.querySelector('.note-card'))
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    assert.deepEqual(JSON.parse(JSON.stringify(ui.editor().getJSON())), saved)
    await reset(ui, [{ type: 'codeBlock', content: [{ type: 'text', text: 'preserve()' }] }], 4)
    await ui.click(ui.byText('Exit code block'))
    await ui.act(async () => ui.editor().commands.insertContent('Continue normally'))
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.deepEqual(
      db.notes[0].content.content.map((node) => node.type),
      ['codeBlock', 'paragraph'],
    )
    assert.equal(db.notes[0].content.content[0].content[0].text, 'preserve()')
    assert.equal(db.notes[0].content.content[1].content[0].text, 'Continue normally')
  } finally {
    await ui.close()
  }
})
