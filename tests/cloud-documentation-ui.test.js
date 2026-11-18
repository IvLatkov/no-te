import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { seedBackupData, backupFixture } from './helpers/backupFixture.js'
import { USER_DATA_KEYS } from '../src/data/storageSafety.js'

const legacy = () => USER_DATA_KEYS.map((key) => localStorage.getItem(key))
const noDialogs = () => !document.querySelector('dialog')
async function documentation(ui) {
  await openDocumentation(ui)
  await ui.waitFor(() => document.querySelector('.notes-panel'))
}
async function newNote(ui, title) {
  await ui.click(ui.byText('New Note'))
  await ui.input(document.querySelector('#new-note-title'), title)
  await ui.submit()
  await ui.waitFor(() => ui.editor() && noDialogs())
}

test('cloud documentation preserves Tiptap formatting, autosave retry, folders, tags, duplication, search and refresh without legacy writes', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const ui = await uiHarness('test-cloud-documentation-ui', {
    module: '/src/App.jsx',
    props: { client: db, configError: '' },
  })
  try {
    seedBackupData(localStorage, backupFixture('Legacy secret').data)
    const original = legacy()
    await ui.mount()
    await documentation(ui)
    assert.match(document.body.textContent, /No notes here yet/)
    await ui.click(ui.byLabel('New folder'))
    await ui.input(document.querySelector('#folder-name'), 'General')
    await ui.submit()
    await ui.waitFor(noDialogs)
    await ui.click(ui.byText('General', document.querySelector('.folder-tree')))
    await newNote(ui, 'Cloud architecture')
    assert.equal(db.notes[0].folder_id, db.folders[0].id)
    await ui.act(async () => ui.editor().commands.insertContent('Searchable cloud decisions'))
    await ui.act(async () => ui.editor().commands.setTextSelection({ from: 1, to: 11 }))
    await ui.click(ui.byLabel('Bold'))
    assert.equal(ui.editor().isActive('bold'), true)
    await ui.click(ui.byLabel('Heading 2'))
    assert.equal(ui.editor().isActive('heading', { level: 2 }), true)
    await ui.click(ui.byLabel('Heading 2'))
    await ui.click(ui.byLabel('Checklist'))
    assert.equal(ui.editor().isActive('taskList'), true)
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.ok(JSON.stringify(db.notes[0].content).includes('taskList'))
    assert.ok(JSON.stringify(db.notes[0].content).includes('bold'))
    db.failure = (call) =>
      call.table === 'notes' && call.op === 'update' ? new TypeError('Failed to fetch') : null
    await ui.input(document.querySelector('.note-title'), 'Unsaved cloud title')
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Save failed')
    await ui.click(document.querySelectorAll('.primary-nav button')[0])
    assert.ok(document.querySelector('.note-editor'))
    assert.equal(document.querySelector('.note-title').value, 'Unsaved cloud title')
    // A genuine token change for the same account must not remount the editor or lose its draft.
    await ui.act(async () => db.emit('alice', 'TOKEN_REFRESHED', 'test-alice#refreshed'))
    assert.equal(document.querySelector('.note-title').value, 'Unsaved cloud title')
    db.failure = null
    await ui.click(ui.byText('Retry save'))
    await ui.waitFor(() => document.querySelector('.save-status')?.textContent === 'Saved')
    assert.equal(db.notes[0].title, 'Unsaved cloud title')
    await ui.click(ui.byText('Manage tags', document.querySelector('.note-editor')))
    await ui.click(ui.byText('New tag'))
    await ui.input(document.querySelector('#tag-name'), 'Architecture')
    await ui.submit()
    await ui.waitFor(() => !document.querySelector('#tag-name') && db.tags.length === 1)
    await ui.click(document.querySelector('dialog .modal-heading [aria-label="Close dialog"]'))
    await ui.click(ui.byText('Architecture', document.querySelector('.note-editor .tag-options')))
    await ui.waitFor(
      () =>
        db.note_tags.length === 1 &&
        document.querySelector('.save-status')?.textContent === 'Saved',
    )
    await ui.select(document.querySelector('[aria-label="Note folder"]'), '')
    await ui.waitFor(() => db.notes[0].folder_id === null)
    await ui.click(ui.byLabel('Duplicate note'))
    await ui.waitFor(
      () =>
        db.notes.length === 2 && document.querySelector('.note-title')?.value.endsWith('(copy)'),
    )
    assert.equal(db.note_tags.length, 2)
    await ui.click(ui.byLabel('Delete note'))
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(noDialogs)
    assert.equal(db.notes.length, 1)
    await ui.click(ui.byText('General', document.querySelector('.folder-tree')))
    await ui.click(ui.byText('Rename', document.querySelector('.folder-actions')))
    await ui.input(document.querySelector('#folder-name'), 'Renamed folder')
    await ui.submit()
    await ui.waitFor(noDialogs)
    await ui.click(ui.byText('Delete', document.querySelector('.folder-actions')))
    await ui.click(ui.byText('Delete', document.querySelector('dialog')))
    await ui.waitFor(noDialogs)
    assert.equal(db.notes.length, 1)
    assert.equal(db.folders.length, 0)
    await ui.click(ui.byLabel('Open global search'))
    await ui.waitFor(() => document.querySelector('dialog input[type="search"]'))
    const search = document.querySelector('dialog input[type="search"]')
    await ui.input(search, 'Searchable cloud decisions')
    await ui.waitFor(() => document.querySelector('.search-result'))
    await ui.click(document.querySelector('.search-result'))
    await ui.waitFor(() => ui.editor() && noDialogs())
    assert.equal(document.querySelector('.note-title').value, 'Unsaved cloud title')
    await ui.mount()
    await documentation(ui)
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    assert.equal(document.querySelector('.note-title').value, 'Unsaved cloud title')
    assert.ok(ui.editor().getText().includes('Searchable cloud decisions'))
    assert.deepEqual(legacy(), original)
  } finally {
    await ui.close()
  }
})

test('task-note creation handles a partial link failure, retries the existing note and navigates both directions', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const project = await createProjectsApi(db, 'alice').createProject({ name: 'Release' })
  const task = await createTasksApi(db, 'alice').createTask(project.id, { title: 'Ship' })
  const organizationApi = createDocumentationApi(db, 'alice')
  await organizationApi.saveTag({ name: 'Release tag', color: '#B994FF' })
  await organizationApi.saveTag({ name: 'Review tag', color: '#7DBAE8' })
  const ui = await uiHarness('test-cloud-links-ui', {
    module: '/src/App.jsx',
    props: { client: db, configError: '' },
  })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.project-nav button'))
    await ui.click(document.querySelector('.project-nav button'))
    await ui.click(ui.byLabel('Open task Ship'))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    await ui.click(ui.byText('Release tag', document.querySelector('dialog .tag-options')))
    await ui.waitFor(
      () => db.task_tags.length === 1 && !document.querySelector('#task-title').disabled,
    )
    await ui.click(ui.byText('Review tag', document.querySelector('dialog .tag-options')))
    await ui.waitFor(
      () => db.task_tags.length === 2 && !document.querySelector('#task-title').disabled,
    )
    assert.equal(db.tasks[0].tagIds, undefined)
    await ui.click(ui.byText('Create Note'))
    await ui.input(document.querySelector('#new-note-title'), 'Release guide')
    db.failure = (call) =>
      call.table === 'task_notes' && call.op === 'upsert' ? { code: '42501' } : null
    await ui.submit()
    await ui.waitFor(() =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Retry linking',
      ),
    )
    assert.equal(db.notes.length, 1)
    assert.equal(db.notes[0].project_id, project.id)
    assert.equal(db.task_notes.length, 0)
    db.failure = null
    await ui.click(ui.byText('Retry linking'))
    await ui.waitFor(
      () =>
        db.task_notes.length === 1 &&
        !document.querySelector('#new-note-title') &&
        document.querySelectorAll('dialog').length === 1,
    )
    assert.equal(db.notes.length, 1)
    await ui.click(ui.byLabel('Open note Release guide'))
    await ui.waitFor(() => ui.editor() && noDialogs())
    assert.match(document.querySelector('.note-linked-tasks').textContent, /Ship/)
    await ui.click(ui.byLabel('Open task Ship in Release'))
    await ui.waitFor(() => document.querySelector('#cloud-task-implementation'))
    await ui.click(ui.byLabel('Unlink note Release guide'))
    await ui.waitFor(() => db.task_notes.length === 0)
    assert.equal(db.notes.length, 1)
    await ui.waitFor(() => !document.querySelector('#task-title').disabled)
    await ui.click(ui.byText('Link Note'))
    await ui.click(document.querySelector('[aria-label="Link Release guide"]'))
    await ui.click(ui.byText('Link 1 note'))
    await ui.waitFor(
      () => db.task_notes.length === 1 && document.querySelectorAll('dialog').length === 1,
    )
    await ui.click(ui.byLabel('Unlink note Release guide'))
    await ui.waitFor(
      () => db.task_notes.length === 0 && !document.querySelector('#task-title').disabled,
    )
    const tagApi = createDocumentationApi(db, 'alice')
    await tagApi.saveTag({ name: 'Search-only tag', color: '#B994FF' })
    await ui.click(ui.byText('Save task', document.querySelector('dialog')))
    await ui.waitFor(noDialogs)
    await ui.click(ui.byLabel('Open global search'))
    await ui.waitFor(() => document.querySelector('dialog input[type="search"]'))
    await ui.input(document.querySelector('dialog input[type="search"]'), 'Search-only tag')
    await ui.waitFor(() =>
      document.querySelector('[role="group"][aria-label="Tags"] .search-result'),
    )
    await ui.click(document.querySelector('[role="group"][aria-label="Tags"] .search-result'))
    await ui.waitFor(() => document.querySelector('#tag-name'))
    assert.equal(document.querySelector('#tag-name').value, 'Search-only tag')
    assert.equal(db.task_notes.length, 0)
    assert.equal(db.tasks[0].id, task.id)
  } finally {
    await ui.close()
  }
})

test('unsupported cloud formatting is preserved rather than rewritten by the editor', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const note = await createDocumentationApi(db, 'alice').createNote({ title: 'Future format' })
  const original = {
    type: 'doc',
    content: [{ type: 'futureNode', attrs: { value: 'Keep this saved value' } }],
  }
  db.notes.find((row) => row.id === note.id).content = original
  const ui = await uiHarness('test-cloud-content-guard-ui', {
    module: '/src/App.jsx',
    props: { client: db, configError: '' },
  })
  try {
    await ui.mount()
    await documentation(ui)
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() =>
      [...document.querySelectorAll('[role="alert"]')].some((item) =>
        item.textContent.includes('unsupported formatting'),
      ),
    )
    assert.deepEqual(db.notes[0].content, original)
    assert.equal(ui.editor().isEditable, false)
    assert.ok(!db.calls.some((call) => call.table === 'notes' && call.op === 'update'))
  } finally {
    await ui.close()
  }
})

test('forced sign-out clears unsaved cloud notes and reports draft loss without exposing content to another account', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  await createDocumentationApi(db, 'alice').createNote({ title: 'Private note' })
  const ui = await uiHarness('test-cloud-draft-signout-ui', {
    module: '/src/App.jsx',
    props: { client: db, configError: '' },
  })
  try {
    await ui.mount()
    await documentation(ui)
    await ui.click(document.querySelector('.note-card'))
    await ui.waitFor(() => ui.editor())
    await ui.input(document.querySelector('.note-title'), 'Secret unsaved draft')
    await ui.act(async () => db.emit(null))
    assert.ok(document.querySelector('#login-heading'))
    assert.match(document.body.textContent, /session ended before some note changes/)
    assert.doesNotMatch(document.body.textContent, /Secret unsaved draft/)
    await ui.act(async () => db.emit('bob'))
    await documentation(ui)
    assert.match(document.body.textContent, /No notes here yet/)
    assert.doesNotMatch(document.body.textContent, /Private note|Secret unsaved draft/)
  } finally {
    await ui.close()
  }
})
