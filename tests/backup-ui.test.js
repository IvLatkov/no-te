import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { backupFixture, seedBackupData } from './helpers/backupFixture.js'
import { USER_DATA_KEYS, RECOVERY_KEY, DATA_REVISION_KEY } from '../src/data/storageSafety.js'
import { STORAGE_KEY } from '../src/data/projects.js'
import { NOTES_STORAGE_KEY } from '../src/data/notes.js'
import { ORGANIZATION_KEY } from '../src/data/organization.js'

async function openSettings(ui) {
  await ui.click(document.querySelector('.sidebar-bottom button'))
  await ui.waitFor(() => document.querySelector('.settings-page'))
}
async function importFile(ui, content, name = 'no-te-backup.json') {
  const input = document.querySelector('input[type="file"]')
  const file = new ui.dom.window.File([content], name, { type: 'application/json' })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await ui.act(async () => { input.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })) })
}
const raw = () => USER_DATA_KEYS.map(key => localStorage.getItem(key))

test('Settings exports locally, previews without writes, cancels safely and restores a usable complete workspace', async () => {
  const ui = await uiHarness('test-backup-ui')
  const { click, input, select, byText, byLabel, waitFor, act, editor } = ui
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalAnchorClick = ui.dom.window.HTMLAnchorElement.prototype.click
  let downloaded
  let filename
  URL.createObjectURL = blob => { downloaded = blob; return 'blob:local-backup-test' }
  URL.revokeObjectURL = () => {}
  ui.dom.window.HTMLAnchorElement.prototype.click = function () { filename = this.download }
  try {
    const fixture = backupFixture('Saved')
    seedBackupData(localStorage, fixture.data)
    await ui.mount()
    await openSettings(ui)
    assert.match(document.querySelector('.settings-page').textContent, /Data Management/)
    const beforeExport = raw()
    await click(byText('Export Backup'))
    assert.ok(downloaded)
    assert.match(filename, /^no-te-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/)
    const exported = await downloaded.text()
    assert.deepEqual(JSON.parse(exported).data, fixture.data)
    assert.deepEqual(raw(), beforeExport, 'export leaves all owned data unchanged')
    await click(document.querySelector('.project-nav button'))
    await click(byLabel('Open task Saved implementation'))
    await input(document.getElementById('task-detail-title'), 'Changed after export')
    await input(document.getElementById('task-implementation'), 'Different implementation notes after export')
    await click(byText('Done', document.querySelector('.task-details-modal')))
    await openDocumentation({ click, waitFor })
    await waitFor(() => document.querySelector('.note-card'))
    await click([...document.querySelectorAll('.note-card')].find(card => card.textContent.includes('Saved architecture')))
    await waitFor(() => editor())
    await input(document.querySelector('.note-title'), 'Changed note after export')
    await act(async () => { editor().commands.insertContent('New content after the backup') })
    await openSettings(ui)
    const changed = raw()
    assert.notDeepEqual(changed, beforeExport)
    await importFile(ui, exported, filename)
    await waitFor(() => document.querySelector('.backup-preview'))
    assert.deepEqual(raw(), changed, 'file selection and validation never replace live data')
    const counts = [...document.querySelectorAll('.backup-counts > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])
    assert.deepEqual(counts, [['projects', '2'], ['tasks', '2'], ['notes', '2'], ['folders', '1'], ['tags', '2']])
    await click(byText('Discard preview'))
    assert.equal(document.querySelector('.backup-preview'), null)
    assert.deepEqual(raw(), changed)
    await importFile(ui, exported, filename)
    await waitFor(() => document.querySelector('.backup-preview'))
    await click(byText('Restore this backup'))
    assert.deepEqual(raw(), changed, 'opening confirmation still does not replace data')
    await click(byText('Cancel', document.querySelector('dialog')))
    assert.deepEqual(raw(), changed)
    await click(byText('Restore this backup'))
    await click(byText('Replace local data', document.querySelector('dialog')))
    await waitFor(() => document.querySelector('.data-feedback.success')?.textContent.includes('Backup restored successfully'))
    assert.deepEqual(raw(), beforeExport, 'the validated saved snapshot replaces all three user-data stores')
    assert.equal(localStorage.getItem(RECOVERY_KEY), null)
    assert.ok(localStorage.getItem(DATA_REVISION_KEY))
    assert.equal(document.querySelector('.backup-preview'), null, 'the old file/preview state is cleared by session replacement')
    await click(document.querySelector('.project-nav button'))
    assert.equal(document.getElementById('project-title').textContent, fixture.project.name)
    await click(byLabel('Open task Saved implementation'))
    const details = document.querySelector('.task-details-modal')
    assert.equal(document.getElementById('task-implementation').value, fixture.task.implementationNotes)
    assert.equal(details.querySelectorAll('.task-linked-note').length, 2)
    assert.equal(details.querySelectorAll('.tag-badge').length, 1)
    await click(byLabel('Open note Saved architecture', details))
    await waitFor(() => editor())
    assert.equal(document.querySelector('.note-title').value, fixture.note.title)
    assert.equal(document.querySelector('.note-editor [aria-label="Note folder"]').value, fixture.folder.id)
    assert.ok(document.querySelector('.folder-tree').textContent.includes(fixture.folder.name))
    assert.equal(document.querySelectorAll('.note-editor .tag-badge').length, 2)
    assert.equal(document.querySelector('.note-prose img'), null, 'imported markup-like text is not injected as HTML')
    assert.deepEqual(JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY))[0].content, fixture.note.content)
    await click(document.querySelector('.note-linked-tasks summary'))
    await click(byLabel(`Open task ${fixture.task.title} in ${fixture.project.name}`))
    await select(document.getElementById('task-detail-status'), 'done')
    await click(byText('Done', document.querySelector('.task-details-modal')))
    assert.equal(document.getElementById('column-done').closest('.board-column').querySelectorAll('.task-card').length, 2)
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY))[0].tasks[0].status, 'done', 'fresh project hooks can save after restore')
    await click(document.querySelector('[aria-label="Open global search"]'))
    await input(document.querySelector('[aria-label="Search everything"]'), 'Saved architecture')
    await waitFor(() => document.querySelector('[role="option"]'))
    await click(document.querySelector('[role="option"]'))
    await waitFor(() => editor())
    await input(document.querySelector('.note-title'), 'Editing restored documentation works')
    await act(async () => { editor().commands.insertContent('Fresh editor content') })
    await openSettings(ui)
    assert.equal(JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY))[0].title, 'Editing restored documentation works')
    assert.match(JSON.stringify(JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY))[0].content), /Fresh editor content/)
    assert.deepEqual(JSON.parse(localStorage.getItem(ORGANIZATION_KEY)), fixture.data.organization)
  } finally {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    ui.dom.window.HTMLAnchorElement.prototype.click = originalAnchorClick
    await ui.close()
  }
})

test('invalid import and unreadable current export show errors without changing application data', async () => {
  const ui = await uiHarness('test-backup-invalid-ui')
  try {
    const fixture = backupFixture()
    seedBackupData(localStorage, fixture.data)
    await ui.mount()
    await openSettings(ui)
    const original = raw()
    await importFile(ui, '{invalid JSON')
    await ui.waitFor(() => document.querySelector('.settings-page > .storage-error'))
    assert.match(document.querySelector('.settings-page').textContent, /not valid JSON/)
    assert.equal(document.querySelector('.backup-preview'), null)
    assert.deepEqual(raw(), original)
    const future = structuredClone(fixture.backup)
    future.schemaVersion = 100
    await importFile(ui, JSON.stringify(future))
    await ui.waitFor(() => document.querySelector('.settings-page').textContent.includes('newer data schema'))
    assert.deepEqual(raw(), original)
    localStorage.setItem(NOTES_STORAGE_KEY, '{unreadable notes')
    await ui.click(ui.byText('Export Backup'))
    assert.match(document.querySelector('.settings-page').textContent, /Backup could not be generated/)
    assert.equal(localStorage.getItem(NOTES_STORAGE_KEY), '{unreadable notes')
  } finally { await ui.close() }
})

test('failed rollback pauses editing and explicit recovery restores the old snapshot with fresh hooks', async () => {
  const ui = await uiHarness('test-backup-recovery-ui')
  const originalSet = ui.dom.window.Storage.prototype.setItem
  try {
    const current = backupFixture('Current')
    const imported = backupFixture('Import')
    seedBackupData(localStorage, current.data)
    await ui.mount()
    await openSettings(ui)
    const original = raw()
    await importFile(ui, JSON.stringify(imported.backup))
    await ui.waitFor(() => document.querySelector('.backup-preview'))
    await ui.click(ui.byText('Restore this backup'))
    ui.dom.window.Storage.prototype.setItem = function (key, value) {
      if (key === NOTES_STORAGE_KEY || (key === STORAGE_KEY && value === original[0])) throw new ui.dom.window.DOMException('Quota', 'QuotaExceededError')
      originalSet.call(this, key, value)
    }
    await ui.click(ui.byText('Replace local data', document.querySelector('dialog')))
    await ui.waitFor(() => document.querySelector('.data-recovery'))
    assert.match(document.querySelector('.data-feedback.error').textContent, /Rollback could not be verified/)
    assert.ok(localStorage.getItem(RECOVERY_KEY))
    assert.equal(ui.byText('Export Backup').disabled, true)
    assert.equal(ui.byText('Import Backup').disabled, true)
    await ui.click(document.querySelector('.project-nav button'))
    assert.ok(document.querySelector('.settings-page'), 'navigation stays in Settings while recovery is pending')
    ui.dom.window.Storage.prototype.setItem = originalSet
    await ui.click(ui.byText('Recover previous data', document.querySelector('.data-recovery')))
    await ui.click(ui.byText('Recover previous data', document.querySelector('dialog')))
    await ui.waitFor(() => document.querySelector('.data-feedback.success')?.textContent.includes('recovered and verified'))
    assert.deepEqual(raw(), original)
    assert.equal(localStorage.getItem(RECOVERY_KEY), null)
    await ui.click(document.querySelector('.project-nav button'))
    await ui.click(ui.byLabel('Open task Current implementation'))
    await ui.input(document.getElementById('task-detail-description'), 'Editing after recovery works')
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY))[0].tasks[0].description, 'Editing after recovery works')
  } finally { ui.dom.window.Storage.prototype.setItem = originalSet; await ui.close() }
})

test('cross-tab restore signals pause old state until the user explicitly loads current data', async () => {
  const ui = await uiHarness('test-backup-cross-tab-ui')
  try {
    const current = backupFixture('Current')
    const changed = backupFixture('Other tab')
    seedBackupData(localStorage, current.data)
    await ui.mount()
    seedBackupData(localStorage, changed.data)
    localStorage.setItem(DATA_REVISION_KEY, 'a-new-data-revision')
    await ui.act(async () => { window.dispatchEvent(new ui.dom.window.StorageEvent('storage', { key: DATA_REVISION_KEY, newValue: 'a-new-data-revision' })) })
    await ui.waitFor(() => document.querySelector('.settings-page'))
    assert.match(document.querySelector('.data-recovery').textContent, /another tab/)
    assert.equal(ui.byText('Import Backup').disabled, true)
    await ui.click(ui.byText('Load current data'))
    assert.ok([...document.querySelectorAll('.project-nav button')].some(button => button.textContent.includes('Other tab project')))
    await ui.click(document.querySelector('.project-nav button'))
    assert.equal(document.getElementById('project-title').textContent, changed.project.name)
  } finally { await ui.close() }
})
