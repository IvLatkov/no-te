import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { EMPTY_DOCUMENT } from '../src/data/notes.js'

function seed() {
  const db = cloudSupabase()
  const stamp = '2026-01-01T00:00:00.000Z'
  const projects = ['Release', 'Another project', 'Empty project'].map((name) => ({
    id: crypto.randomUUID(), user_id: 'alice', name, description: `${name} description`,
    created_at: stamp, updated_at: stamp,
  }))
  db.projects.push(...projects, { ...projects[0], id: crypto.randomUUID(), user_id: 'bob', name: 'Private project' })
  db.tasks.push(...[
    { title: 'Plan release', status: 'todo', project_id: projects[0].id },
    { title: 'Shipped feature', status: 'done', project_id: projects[0].id },
    { title: 'Other task', status: 'todo', project_id: projects[1].id },
  ].map((task) => ({ id: crypto.randomUUID(), description: '', implementation_notes: '', created_at: stamp, updated_at: stamp, ...task })))
  db.notes.push(...[
    { title: 'Release guide', project_id: projects[0].id },
    { title: 'Other guide', project_id: projects[1].id },
    { title: 'General note', project_id: null },
  ].map((note) => ({ id: crypto.randomUUID(), user_id: 'alice', folder_id: null, content: structuredClone(EMPTY_DOCUMENT), created_at: stamp, updated_at: stamp, ...note })))
  db.emit('alice')
  return { db, projects }
}

async function choose(ui, name) {
  await ui.click(document.querySelector('.dashboard-project-picker > button'))
  await ui.click(ui.byText(name, document.querySelector('#dashboard-project-options')))
  await ui.waitFor(() => document.querySelector('#dashboard-project-heading')?.textContent === name)
}

test('dashboard library entry opens every project and unassigned notes without a sidebar item or data writes', async () => {
  const { db } = seed()
  const before = JSON.stringify([db.projects, db.tasks, db.notes, db.task_notes])
  const ui = await uiHarness('dashboard-library-entry', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.all-documentation-action'))
    assert.equal(document.querySelectorAll('.primary-nav button').length, 2)
    assert.equal(document.querySelector('.dashboard-project-panels'), null)
    await ui.click(ui.byText('All documentation'))
    await ui.waitFor(() => document.querySelector('.note-card'))
    assert.equal(document.querySelector('.page-label').textContent, 'Documentation')
    assert.equal(document.querySelectorAll('.note-card').length, 3)
    assert.match(document.querySelector('.notes-list').textContent, /General note/)
    await ui.click(document.querySelector('.primary-nav button'))
    await choose(ui, 'Release')
    const panel = document.querySelector('[aria-labelledby="dashboard-documentation"]')
    assert.match(panel.textContent, /Release guide/)
    assert.doesNotMatch(panel.textContent, /Other guide|General note/)
    await ui.click(ui.byText('All documentation', panel))
    await ui.waitFor(() => document.querySelectorAll('.note-card').length === 3)
    assert.equal(document.querySelector('[aria-label="Filter notes by project"]').value, 'all')
    await ui.click(document.querySelector('.primary-nav button'))
    await ui.waitFor(() => document.querySelector('#dashboard-project-heading'))
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, 'Release')
    assert.equal(JSON.stringify([db.projects, db.tasks, db.notes, db.task_notes]), before)
    assert.ok(db.calls.every(call => call.op === 'select'))
  } finally { await ui.close() }
})

test('dashboard Done deletion confirms, preserves the task on failure/cancel, and keeps notes after a scoped retry', async () => {
  const { db, projects } = seed()
  const completed = db.tasks.find(task => task.title === 'Shipped feature')
  db.task_notes.push({ task_id: completed.id, note_id: db.notes[0].id })
  const savedNotes = structuredClone(db.notes)
  const ui = await uiHarness('dashboard-delete-done', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    const done = () => document.querySelector('[aria-labelledby="dashboard-done"]')
    const remove = () => ui.byLabel('Delete completed task Shipped feature', done())
    assert.equal(document.querySelector('[aria-labelledby="dashboard-todo"] .dashboard-task-delete'), null)
    await ui.click(remove())
    await ui.waitFor(() => document.querySelector('dialog'))
    assert.match(document.querySelector('dialog').textContent, /Delete task.*Notes will be kept/s)
    assert.equal(document.querySelector('#task-title'), null, 'Delete must not open task details')
    await ui.click(ui.byText('Cancel', document.querySelector('dialog')))
    assert.ok(db.tasks.some(task => task.id === completed.id))
    await ui.click(remove())
    db.failure = call => call.table === 'tasks' && call.op === 'delete' ? new TypeError('Failed to fetch') : null
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(() => document.querySelector('dialog [role="alert"]'))
    assert.ok(db.tasks.some(task => task.id === completed.id))
    assert.equal(done().querySelector('.task-count').textContent, '1')
    db.failure = null
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(done().querySelector('.task-count').textContent, '0')
    assert.match(done().textContent, /No completed tasks yet/)
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, projects[0].name)
    assert.ok(!db.tasks.some(task => task.id === completed.id))
    assert.ok(db.tasks.some(task => task.project_id === projects[1].id))
    assert.deepEqual(db.notes, savedNotes)
  } finally { await ui.close() }
})

test('dashboard Add task keeps the selected project, preserves failed drafts and creates in To Do without navigating', async () => {
  const { db, projects } = seed()
  const ui = await uiHarness('dashboard-create-task', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    const todo = () => document.querySelector('[aria-labelledby="dashboard-todo"]')
    await ui.click(ui.byText('Add task', todo()))
    await ui.waitFor(() => document.querySelector('#task-title'))
    await ui.input(document.querySelector('#task-title'), 'Created on dashboard')
    await ui.input(document.querySelector('#task-description'), 'Keep this draft on failure')
    db.failure = (call) => call.table === 'tasks' && call.op === 'insert' ? new TypeError('Failed to fetch') : null
    await ui.submit()
    await ui.waitFor(() => document.querySelector('dialog [role="alert"]'))
    assert.equal(document.querySelector('#task-title').value, 'Created on dashboard')
    assert.ok(!db.tasks.some(task => task.title === 'Created on dashboard'))
    db.failure = null
    await ui.submit()
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, 'Release')
    assert.match(todo().textContent, /Created on dashboard/)
    assert.equal(todo().querySelector('.task-count').textContent, '2')
    const saved = db.tasks.find(task => task.title === 'Created on dashboard')
    assert.equal(saved.project_id, projects[0].id)
    assert.equal(saved.status, 'todo')
    await choose(ui, 'Another project')
    await ui.click(ui.byText('Add task', todo()))
    await ui.click(ui.byText('Cancel', document.querySelector('dialog')))
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, 'Another project')
    assert.ok(!document.querySelector('dialog'))
  } finally { await ui.close() }
})

test('dashboard restores the last project after remount, isolates accounts and remembers Hide project', async () => {
  const { db } = seed()
  const ui = await uiHarness('dashboard-persisted-selection', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    await ui.mount()
    await ui.waitFor(() => document.querySelector('#dashboard-project-heading')?.textContent === 'Release')
    await ui.act(async () => db.emit('bob'))
    await ui.waitFor(() => document.querySelector('#dashboard-project-options')?.textContent.includes('Private project'))
    assert.equal(document.querySelector('.dashboard-project-panels'), null)
    await choose(ui, 'Private project')
    await ui.act(async () => db.emit('alice'))
    await ui.waitFor(() => document.querySelector('#dashboard-project-heading')?.textContent === 'Release')
    await ui.click(document.querySelector('.dashboard-project-picker > button'))
    await ui.click(ui.byText('Hide project'))
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    assert.equal(document.querySelector('.dashboard-project-panels'), null)
  } finally { await ui.close() }
})

test('dashboard refreshes externally created and completed tasks with new documentation, preserving its selection', async () => {
  const { db, projects } = seed()
  const ui = await uiHarness('dashboard-external-updates', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    const task = { id: crypto.randomUUID(), project_id: projects[0].id, title: 'Codex-created task', description: '',
      status: 'todo', implementation_notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    db.tasks.push(task)
    await ui.act(async () => window.dispatchEvent(new Event('focus')))
    await ui.waitFor(() => document.querySelector('[aria-labelledby="dashboard-todo"]').textContent.includes(task.title))
    task.status = 'done'
    task.completed_at = new Date().toISOString()
    const note = { ...db.notes[0], id: crypto.randomUUID(), title: 'Implementation: Codex-created task' }
    db.notes.push(note)
    db.task_notes.push({ task_id: task.id, note_id: note.id })
    await ui.act(async () => window.dispatchEvent(new Event('online')))
    await ui.waitFor(() => document.querySelector('[aria-labelledby="dashboard-done"]').textContent.includes(task.title) &&
      document.querySelector('[aria-labelledby="dashboard-documentation"]').textContent.includes(note.title))
    assert.doesNotMatch(document.querySelector('[aria-labelledby="dashboard-todo"]').textContent, /Codex-created task/)
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, 'Release')
    assert.ok(db.calls.every(call => call.op === 'select'))
    // A genuinely deleted selection is cleared after the successful refresh.
    db.projects = db.projects.filter(item => item.id !== projects[0].id)
    await ui.act(async () => window.dispatchEvent(new Event('focus')))
    await ui.waitFor(() => !document.querySelector('.dashboard-project-panels'))
    assert.equal(localStorage.getItem('no-te.dashboard-project:alice'), null)
  } finally { await ui.close() }
})

test('dashboard project selection scopes all three panels, switches, hides and preserves cloud data', async () => {
  const { db } = seed()
  const saved = JSON.stringify([db.projects, db.tasks, db.notes])
  const ui = await uiHarness('dashboard-projects', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    assert.equal(document.querySelector('.dashboard-project-panels'), null)
    assert.doesNotMatch(document.querySelector('#dashboard-project-options').textContent, /Private project/)
    await choose(ui, 'Release')
    assert.equal(document.querySelectorAll('.dashboard-panel').length, 3)
    assert.match(document.querySelector('#dashboard-todo').textContent, /To Do1/)
    assert.match(document.querySelector('#dashboard-done').textContent, /Done1/)
    assert.match(document.querySelector('#dashboard-documentation').textContent, /Documentation1/)
    assert.match(document.querySelector('.dashboard-project').textContent, /Plan release.*Shipped feature.*Release guide/s)
    assert.doesNotMatch(document.querySelector('.dashboard-project').textContent, /Other task|Other guide|General note/)
    assert.ok(document.getElementById('dashboard-project-options').hidden)
    await choose(ui, 'Another project')
    assert.match(document.querySelector('.dashboard-project').textContent, /Other task.*No completed tasks yet.*Other guide/s)
    assert.doesNotMatch(document.querySelector('.dashboard-project').textContent, /Plan release|Release guide/)
    await choose(ui, 'Empty project')
    assert.match(document.querySelector('.dashboard-project').textContent, /No tasks to do.*No completed tasks.*No documentation linked/s)
    const toggle = document.querySelector('.dashboard-project-picker > button')
    await ui.click(toggle)
    await ui.act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.ok(document.activeElement === toggle)
    await ui.click(toggle)
    await ui.click(document.body)
    assert.ok(document.getElementById('dashboard-project-options').hidden)
    await ui.click(toggle)
    await ui.click(ui.byText('Hide project'))
    assert.equal(document.querySelector('.dashboard-project-panels'), null)
    assert.equal(JSON.stringify([db.projects, db.tasks, db.notes]), saved)
    assert.ok(db.calls.every((call) => call.op === 'select'))
  } finally {
    await ui.close()
  }
})

test('dashboard tasks and notes open editable windows without changing pages; closing preserves selection', async () => {
  const { db } = seed()
  const ui = await uiHarness('dashboard-project-links', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    await ui.click(ui.byLabel('Open task Plan release', document.querySelector('.dashboard-project')))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('.project-workspace'), null)
    assert.equal(document.querySelector('#task-title').value, 'Plan release')
    await ui.input(document.querySelector('#task-title'), 'Plan release updated')
    await ui.submit()
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(db.tasks[0].title, 'Plan release updated')
    assert.ok(document.querySelector('.dashboard-project [aria-label="Open task Plan release updated"]'))
    await ui.click(ui.byLabel('Open task Shipped feature', document.querySelector('.dashboard-project')))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    await ui.act(async () => document.querySelector('dialog').dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })))
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(document.querySelector('#dashboard-project-heading').textContent, 'Release')
    const noteLink = ui.byLabel('Open note Release guide')
    noteLink.focus()
    await ui.click(noteLink)
    await ui.waitFor(() => ui.editor())
    assert.ok(document.querySelector('.dashboard-note-dialog[open] .note-editor'))
    assert.equal(document.querySelector('.dashboard-note-dialog .notes-panel'), null)
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('.note-title').value, 'Release guide')
    await ui.act(async () => ui.editor().commands.insertContent('Edited from dashboard'))
    await ui.click(ui.byLabel('Close dialog', document.querySelector('.dashboard-note-dialog')))
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.ok(document.activeElement === noteLink)
    assert.match(JSON.stringify(db.notes[0].content), /Edited from dashboard/)
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    await ui.click(noteLink)
    await ui.waitFor(() => ui.editor())
    assert.match(ui.editor().getText(), /Edited from dashboard/)
    await ui.click(ui.byLabel('Close dialog', document.querySelector('.dashboard-note-dialog')))
    await ui.waitFor(() => !document.querySelector('dialog'))
    await ui.click(ui.byText('Open project'))
    await ui.waitFor(() => document.querySelector('.project-workspace'))
    assert.equal(document.querySelector('#project-title').textContent, 'Release')
  } finally {
    await ui.close()
  }
})

test('dashboard note window stays open on failed save and retries before closing', async () => {
  const { db } = seed()
  const ui = await uiHarness('dashboard-note-retry', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
    await choose(ui, 'Release')
    await ui.click(ui.byLabel('Open note Release guide'))
    await ui.waitFor(() => ui.editor())
    db.failure = (call) => call.table === 'notes' && call.op === 'update' ? new TypeError('Failed to fetch') : null
    await ui.input(document.querySelector('.note-title'), 'Unsaved dashboard title')
    await ui.click(ui.byLabel('Close dialog', document.querySelector('.dashboard-note-dialog')))
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Save failed')
    assert.ok(document.querySelector('.dashboard-note-dialog[open]'))
    assert.equal(document.querySelector('.note-title').value, 'Unsaved dashboard title')
    assert.equal(db.notes[0].title, 'Release guide')
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    db.failure = null
    await ui.click(ui.byLabel('Close dialog', document.querySelector('.dashboard-note-dialog')))
    await ui.waitFor(() => !document.querySelector('dialog'))
    assert.equal(db.notes[0].title, 'Unsaved dashboard title')
    assert.ok(document.querySelector('.dashboard-project [aria-label="Open note Unsaved dashboard title"]'))
  } finally {
    await ui.close()
  }
})

test('project picker handles no projects, loading and errors without inventing data', async () => {
  for (const [props, message] of [
    [{}, /No projects yet/],
    [{ projectsLoading: true }, /Loading projects/],
    [{ projectsError: 'Network unavailable' }, /Projects couldn’t be loaded/],
  ]) {
    const ui = await uiHarness('dashboard-project-states', { module: '/src/components/dashboard/Dashboard.jsx', props })
    try {
      await ui.mount()
      await ui.click(document.querySelector('.dashboard-project-picker > button'))
      assert.match(document.querySelector('#dashboard-project-options').textContent, message)
      assert.equal(document.querySelector('.dashboard-project'), null)
    } finally {
      await ui.close()
    }
  }
})
