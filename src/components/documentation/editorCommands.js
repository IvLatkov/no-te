// Native exitCode inserts a paragraph. Reuse an existing following paragraph
// for the UI control, so returning to prose never adds an unnecessary blank.
export function exitCodeBlock(editor) {
  if (!editor?.isEditable || !editor.isActive('codeBlock')) return false
  const { $from } = editor.state.selection
  if ($from.parent.type.name !== 'codeBlock') return false
  const after = $from.after()
  const next = editor.state.doc.nodeAt(after)
  if (next?.type.name === 'paragraph') {
    return editor
      .chain()
      .focus()
      .setTextSelection(after + 1)
      .run()
  }
  return editor.chain().focus().exitCode().run()
}
