import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { workflowFixture, DAY } from './helpers/workflowFixture.js'

async function dashboard(ui) {
  await ui.mount()
  await ui.waitFor(() => document.querySelector('.dashboard-project-options li'))
  await ui.click(document.querySelector('.dashboard-project-picker > button'))
  await ui.click(ui.byText('Workflow', document.querySelector('#dashboard-project-options')))
  await ui.waitFor(() => document.querySelector('.dashboard-project-panels'))
}
const donePanel = () => document.querySelector('[aria-labelledby="dashboard-done"]')

test('dashboard Archive is scoped, searchable, failure-safe and restores without losing notes or tags', async () => {
  const { db, archived } = workflowFixture()
  const preserved = JSON.stringify([db.task_notes, db.task_tags, db.notes])
  const ui = await uiHarness('workflow-archive-ui', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await dashboard(ui)
    assert.equal(document.querySelector('#dashboard-todo .task-count').textContent, '1')
    assert.equal(document.querySelector('#dashboard-done .task-count').textContent, '1')
    assert.doesNotMatch(donePanel().textContent, /Old task/)
    assert.match(donePanel().textContent, /Archives in 6 days/)
    assert.equal(document.querySelectorAll('.dashboard-notes .dashboard-item').length, 2)
    assert.match(document.querySelector('.dashboard-notes').textContent, /Recent task.*Old task \(Archived\)/s)
    await ui.select(document.querySelector('[aria-label="Filter dashboard documentation"]'), 'task-linked')
    assert.equal(document.querySelectorAll('.dashboard-notes .dashboard-item').length, 1)
    assert.match(document.querySelector('.dashboard-notes').textContent, /Shared task guide/)
    await ui.select(document.querySelector('[aria-label="Filter dashboard documentation"]'), 'independent')
    assert.equal(document.querySelectorAll('.dashboard-notes .dashboard-item').length, 1)
    assert.match(document.querySelector('.dashboard-notes').textContent, /Independent guide/)
    await ui.click(ui.byText('Archived', donePanel()))
    await ui.input(document.querySelector('#archive-search'), 'does not exist')
    assert.match(document.querySelector('dialog').textContent, /No archived tasks match/)
    await ui.input(document.querySelector('#archive-search'), 'implementation decisions')
    assert.ok(ui.byLabel('Open archived task Old task'))
    db.failure = (call) => call.table === 'tasks' && call.op === 'update' ? new TypeError('Failed to fetch') : null
    await ui.click(ui.byLabel('Restore Old task to To Do'))
    await ui.waitFor(() => document.querySelector('dialog [role="alert"]'))
    assert.equal(db.tasks.find((task) => task.id === archived.id).status, 'done')
    assert.ok(document.querySelector('[aria-label="Restore Old task to To Do"]'))
    db.failure = null
    await ui.click(ui.byLabel('Restore Old task to To Do'))
    await ui.waitFor(() => document.querySelector('dialog')?.textContent.includes('No archived tasks yet.'))
    await ui.click(ui.byLabel('Close dialog'))
    assert.equal(document.querySelector('#dashboard-todo .task-count').textContent, '2')
    assert.equal(JSON.stringify([db.task_notes, db.task_tags, db.notes]), preserved)
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
  } finally { await ui.close() }
})

test('archived task details and linked documentation remain editable and searchable', async () => {
  const { db } = workflowFixture()
  const ui = await uiHarness('workflow-links-ui', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await dashboard(ui)
    await ui.click(ui.byText('Archived', donePanel()))
    await ui.click(ui.byLabel('Open archived task Old task'))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('#cloud-task-implementation').value, 'Keep implementation decisions')
    assert.ok(ui.byText('Restore to To Do', document.querySelector('dialog')))
    assert.match(document.querySelector('.task-linked-notes').textContent, /Shared task guide/)
    await ui.click(ui.byLabel('Close dialog', document.querySelector('dialog')))
    await openDocumentation(ui)
    await ui.waitFor(() => document.querySelector('.notes-panel'))
    await ui.select(document.querySelector('[aria-label="Filter documentation links"]'), 'task-linked')
    assert.equal(document.querySelectorAll('.note-card').length, 1)
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    assert.match(document.querySelector('.note-linked-tasks').textContent, /Old task.*Archived/s)
    await ui.act(async () => ui.editor().commands.insertContent('Documentation survives archive'))
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.match(JSON.stringify(db.notes.find((note) => note.title === 'Shared task guide').content), /Documentation survives archive/)
    await ui.click(document.querySelectorAll('.primary-nav button')[1])
    await ui.waitFor(() => document.querySelector('.projects-page'))
    await ui.click(ui.byLabel('Open project Workflow'))
    assert.equal(document.querySelectorAll('.task-card').length, 2)
    assert.ok(ui.byText('Archived', document.querySelector('.task-board')))
  } finally { await ui.close() }
})

test('open dashboard refetches server state at the deadline and on window focus', async () => {
  const { db, done } = workflowFixture()
  done.completed_at = new Date(db.serverTime - 7 * DAY + 300).toISOString()
  done.archives_at = new Date(db.serverTime + 300).toISOString()
  const ui = await uiHarness('workflow-deadline-ui', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await dashboard(ui)
    assert.equal(document.querySelector('#dashboard-done .task-count').textContent, '1')
    db.serverTime += 1000
    await ui.waitFor(() => document.querySelector('#dashboard-done .task-count')?.textContent === '0')
    // Another device can reopen a task; focus refresh reconciles from the server.
    done.status = 'todo'; done.completed_at = null; done.archives_at = null
    await ui.act(async () => ui.dom.window.dispatchEvent(new ui.dom.window.Event('focus')))
    await ui.waitFor(() => document.querySelector('#dashboard-todo .task-count')?.textContent === '2')
  } finally { await ui.close() }
})
