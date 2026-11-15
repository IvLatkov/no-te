import { noteText } from './notes.js'
import { isArchivedTask } from './taskWorkflow.js'

export function buildSearchIndex(projects, notes, tags, { includeTags = false } = {}) {
  const names = (ids) =>
    tags
      .filter((tag) => (ids || []).includes(tag.id))
      .map((tag) => tag.name)
      .join(' ')
  return [
    ...(includeTags
      ? tags.map((tag) => ({
          type: 'Tags',
          id: tag.id,
          title: tag.name,
          text: tag.color,
          projectName: '',
        }))
      : []),
    ...projects.map((project) => ({
      type: 'Projects',
      id: project.id,
      title: project.name,
      text: project.description,
      projectName: '',
    })),
    ...projects.flatMap((project) =>
      project.tasks.map((task) => ({
        type: 'Tasks',
        id: task.id,
        projectId: project.id,
        archived: isArchivedTask(task),
        title: task.title,
        text: [task.description, task.implementationNotes, names(task.tagIds)]
          .filter(Boolean)
          .join('\n'),
        projectName: project.name,
      })),
    ),
    ...notes.map((note) => ({
      type: 'Documentation',
      id: note.id,
      title: note.title || 'Untitled note',
      text: [noteText(note.content), names(note.tagIds)].filter(Boolean).join('\n'),
      projectName: projects.find((project) => project.id === note.projectId)?.name || 'Unassigned',
    })),
  ].map((item) => ({ ...item, searchText: `${item.title}\n${item.text}`.toLocaleLowerCase() }))
}

export function searchIndex(index, query) {
  const term = query.trim().toLocaleLowerCase()
  return term ? index.filter((item) => item.searchText.includes(term)) : []
}

export function searchExcerpt(text, query, length = 115) {
  const plain = text.replace(/\s+/g, ' ').trim()
  const position = plain.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
  const start = Math.max(0, position - 28)
  return `${start ? '…' : ''}${plain.slice(start, start + length)}${plain.length > start + length ? '…' : ''}`
}

export function canOpenSearch(event, document) {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.key.toLocaleLowerCase() !== 'k' ||
    event.isComposing
  )
    return false
  const element = event.target
  if (document.querySelector('dialog[open]')) return false
  return !element?.closest?.('textarea, select, [contenteditable="true"], input:not([readonly])')
}
