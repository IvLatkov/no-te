import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { getSchema } from '@tiptap/core'
import { DocumentNavigation } from './documentNavigation.js'

let schema
// Preflight avoids the editor's invalid-content fallback logging source JSON.
export function isSupportedDocument(content) {
  try {
    let visited = 0
    function visit(node, depth = 0) {
      if (++visited > 100000 || depth > 100 || !node || typeof node !== 'object')
        throw new Error('Unsupported content')
      for (const mark of node.marks || [])
        if (
          mark.type === 'link' &&
          (typeof mark.attrs?.href !== 'string' || !safeLink(mark.attrs.href))
        )
          throw new Error('Unsafe link')
      for (const child of node.content || []) visit(child, depth + 1)
    }
    if (content?.type !== 'doc') return false
    visit(content)
    schema ||= getSchema(editorExtensions())
    schema.nodeFromJSON(content).check()
    return true
  } catch {
    return false
  }
}

export function safeLink(value) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const url = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

export function editorExtensions() {
  return [
    StarterKit.configure({
      // Block toggles must not append an unrelated empty paragraph. Native list,
      // quote and code exit commands provide deliberate ways back to plain text.
      trailingNode: false,
      codeBlock: { exitOnTripleEnter: true, exitOnArrowDown: true },
      heading: { levels: [1, 2, 3] },
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => Boolean(safeLink(url)),
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    DocumentNavigation,
  ]
}
