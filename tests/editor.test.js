import test from 'node:test'
import assert from 'node:assert/strict'
import { Editor, getSchema } from '@tiptap/core'
import { editorExtensions, safeLink } from '../src/components/documentation/editorExtensions.js'

test('editor schema round-trips every supported rich-text format and checklist state', () => {
  const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
  const p = value => ({ type: 'paragraph', content: [text(value)] })
  const content = { type: 'doc', content: [
    ...[1, 2, 3].map(level => ({ type: 'heading', attrs: { level }, content: [text(`Heading ${level}`)] })),
    { type: 'paragraph', content: [text('Bold', [{ type: 'bold' }]), text('Italic', [{ type: 'italic' }]), text('Strike', [{ type: 'strike' }]), text('Link', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer', class: null } }])] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('Bullet')] }] },
    { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p('Number')] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p('Unchecked')] }, { type: 'taskItem', attrs: { checked: true }, content: [p('Checked')] }] },
    { type: 'blockquote', content: [p('Quote')] },
    { type: 'codeBlock', attrs: { language: null }, content: [text('const answer = 42')] },
    { type: 'horizontalRule' }, p('After divider'),
  ] }
  const schema = getSchema(editorExtensions())
  const document = schema.nodeFromJSON(content)
  document.check()
  assert.deepEqual(schema.nodeFromJSON(document.toJSON()).toJSON(), document.toJSON())
  assert.equal(document.toJSON().content.find(node => node.type === 'taskList').content[1].attrs.checked, true)
})

test('real editor formatting commands and checklist changes update JSON without losing text', () => {
  const editor = new Editor({ element: null, extensions: editorExtensions(), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello notes' }] }] } })
  editor.commands.setTextSelection({ from: 1, to: 6 })
  assert.equal(editor.commands.toggleBold(), true)
  assert.equal(editor.isActive('bold'), true)
  assert.equal(editor.getJSON().content[0].content[0].marks[0].type, 'bold')
  editor.commands.toggleItalic()
  editor.commands.toggleStrike()
  assert.equal(editor.isActive('italic'), true)
  assert.equal(editor.isActive('strike'), true)
  editor.commands.toggleHeading({ level: 2 })
  assert.equal(editor.getJSON().content[0].type, 'heading')
  editor.commands.toggleHeading({ level: 2 })
  editor.commands.toggleTaskList()
  assert.equal(editor.getJSON().content[0].type, 'taskList')
  editor.commands.updateAttributes('taskItem', { checked: true })
  assert.equal(editor.getJSON().content[0].content[0].attrs.checked, true)
  assert.equal(editor.state.doc.textContent, 'Hello notes')
  editor.destroy()
})

test('links accept web and email addresses and reject executable protocols', () => {
  assert.equal(safeLink('example.com'), 'https://example.com/')
  assert.equal(safeLink('https://example.com/docs'), 'https://example.com/docs')
  assert.equal(safeLink('mailto:team@example.com'), 'mailto:team@example.com')
  for (const value of ['', 'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'https://']) assert.equal(safeLink(value), null)
})
