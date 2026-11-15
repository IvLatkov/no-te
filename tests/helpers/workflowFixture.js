import { cloudSupabase } from './cloudSupabase.js'
import { EMPTY_DOCUMENT } from '../../src/data/notes.js'

export const DAY = 86400000

export function workflowFixture() {
  const db = cloudSupabase()
  db.serverTime = Date.parse('2026-04-20T12:00:00Z')
  const stamp = new Date(db.serverTime).toISOString()
  const project = { id: crypto.randomUUID(), user_id: 'alice', name: 'Workflow', description: '', created_at: stamp, updated_at: stamp }
  const makeTask = (title, days) => ({
    id: crypto.randomUUID(), project_id: project.id, title, description: '',
    status: days === null ? 'todo' : 'done', implementation_notes: 'Keep implementation decisions',
    created_at: stamp, updated_at: stamp,
    completed_at: days === null ? null : new Date(db.serverTime - days * DAY).toISOString(),
    archive_grace_started_at: null,
    archives_at: days === null ? null : new Date(db.serverTime + (7 - days) * DAY).toISOString(),
  })
  const todo = makeTask('Next task', null)
  const done = makeTask('Recent task', 1)
  const archived = makeTask('Old task', 7)
  const makeNote = (title, projectId) => ({ id: crypto.randomUUID(), user_id: 'alice', project_id: projectId, folder_id: null, title, content: structuredClone(EMPTY_DOCUMENT), created_at: stamp, updated_at: stamp })
  const independent = makeNote('Independent guide', project.id)
  const linked = makeNote('Shared task guide', null)
  db.projects.push(project)
  db.tasks.push(todo, done, archived)
  db.notes.push(independent, linked)
  db.tags.push({ id: crypto.randomUUID(), user_id: 'alice', name: 'Keep tag', color: '#8b5cf6', created_at: stamp, updated_at: stamp })
  db.task_notes.push({ task_id: done.id, note_id: linked.id, created_at: stamp }, { task_id: archived.id, note_id: linked.id, created_at: stamp })
  db.task_tags.push({ task_id: archived.id, tag_id: db.tags[0].id, created_at: stamp })
  db.emit('alice')
  return { db, project, todo, done, archived, independent, linked }
}
