import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { exportCloudBackup } from '../src/data/cloudBackup.js'

test('Settings cloud export reports download, previews read-only counts and displays table failures', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const { backup } = await exportCloudBackup(db, 'alice')
  const ui = await uiHarness('cloud-backup', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let downloaded
  URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:test-backup' }
  URL.revokeObjectURL = () => {}
  ui.dom.window.HTMLAnchorElement.prototype.click = function () { assert.match(this.download, /^no-te-cloud-/) }
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('[aria-label="Open global search"]'))
    await ui.click(ui.byText('Settings'))
    await ui.waitFor(() => document.querySelector('#cloud-backup-heading'))
    await ui.click(ui.byText('Export cloud data'))
    await ui.waitFor(() => document.body.textContent.includes('Download requested'))
    assert.ok(downloaded)
    assert.match(await downloaded.text(), /no-te-cloud/)
    const input = document.querySelector('[aria-label="Preview cloud backup"]')
    db.calls.length = 0
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(backup) }] })
    await ui.act(async () => input.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })))
    await ui.waitFor(() => document.body.textContent.includes('No records were changed'))
    assert.equal(db.calls.length, 0)
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 100, text: async () => '{' }] })
    await ui.act(async () => input.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })))
    assert.match(document.body.textContent, /valid JSON/)
    db.failure = (call) => call.table === 'note_tags' ? { code: '42501' } : null
    downloaded = null
    await ui.click(ui.byText('Export cloud data'))
    await ui.waitFor(() => document.body.textContent.includes('Permission denied'))
    assert.equal(downloaded, null)
    assert.ok(db.calls.every((call) => call.op === 'select'))
  } finally {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    await ui.close()
  }
})
