import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const documentNavigationKey = new PluginKey('noTeDocumentNavigation')
const matchLimit = 1000

export function scanDocument(doc, query = '') {
  const headings = []
  const matches = []
  let truncated = false
  // Literal, case-insensitive matching. Regex indices preserve original UTF-16
  // positions even when case folding would change a character's length.
  const expression = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null
  doc.descendants((node, position) => {
    if (node.type.name === 'heading') headings.push({ position, level: node.attrs.level, title: node.textContent.trim() || 'Untitled heading' })
    if (!node.isTextblock) return
    if (expression && !truncated) {
      let text = ''
      node.forEach(child => {
        // Inline leaves occupy document positions but must not join words
        // across hard breaks. Marks do not interrupt a text match.
        text += child.isText ? child.text : '\ufffc'.repeat(child.nodeSize)
      })
      expression.lastIndex = 0
      for (const match of text.matchAll(expression)) {
        if (matches.length === matchLimit) { truncated = true; break }
        matches.push({ from: position + 1 + match.index, to: position + 1 + match.index + match[0].length })
      }
    }
    return false
  })
  return { headings, matches, truncated }
}

export const DocumentNavigation = Extension.create({
  name: 'noTeDocumentNavigation',
  addProseMirrorPlugins() {
    function snapshot(doc, query, index, scan) {
      const content = scan || scanDocument(doc, query)
      const activeIndex = content.matches.length ? Math.max(0, Math.min(index, content.matches.length - 1)) : 0
      const decorations = DecorationSet.create(doc, content.matches.map((match, i) => Decoration.inline(match.from, match.to, {
        class: `note-search-match${i === activeIndex ? ' is-current' : ''}`,
      })))
      return { ...content, query, index: activeIndex, decorations }
    }
    return [new Plugin({
      key: documentNavigationKey,
      state: {
        init: (_, state) => snapshot(state.doc, '', 0),
        apply(transaction, previous, _, state) {
          const meta = transaction.getMeta(documentNavigationKey)
          if (!transaction.docChanged && !meta) return previous
          const query = typeof meta?.query === 'string' ? meta.query.slice(0, 200) : previous.query
          const changedQuery = query !== previous.query
          return snapshot(state.doc, query, meta?.index ?? (changedQuery ? 0 : previous.index),
            !transaction.docChanged && !changedQuery ? previous : null)
        },
      },
      props: { decorations: state => documentNavigationKey.getState(state)?.decorations },
    })]
  },
})

export function setDocumentSearch(editor, patch) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(documentNavigationKey, patch).setMeta('addToHistory', false))
}

export function documentNavigationSnapshot(editor) {
  return editor && !editor.isDestroyed ? documentNavigationKey.getState(editor.state) : null
}
