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
