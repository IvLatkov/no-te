import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { THEME_KEY } from '../src/theme/preferences.js'

async function openSettings(ui) {
  await ui.waitFor(() => document.querySelector('.primary-nav'))
  await ui.click(ui.byText('Settings', document.querySelector('.sidebar-bottom')))
  await ui.waitFor(() => document.querySelector('[role="switch"][aria-label="Dark mode"]'))
  return document.querySelector('[role="switch"][aria-label="Dark mode"]')
}

function systemTheme(ui, initial) {
  let dark = initial
  const listeners = new Set()
  ui.dom.window.matchMedia = query => ({
    matches: query === '(prefers-color-scheme: dark)' ? dark : false,
    addEventListener(_, listener) { if (query === '(prefers-color-scheme: dark)') listeners.add(listener) },
    removeEventListener(_, listener) { listeners.delete(listener) },
  })
  return async next => {
    dark = next
    await ui.act(async () => { for (const listener of listeners) listener({ matches: dark }) })
  }
}

test('Settings theme switch is accessible, persists across navigation/remount/account changes, and preserves unrelated data', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const ui = await uiHarness('theme-settings', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  systemTheme(ui, false)
  try {
    localStorage.setItem('no-te.theme-test-sentinel', 'Keep existing data')
    await ui.mount()
    const toggle = await openSettings(ui)
    assert.equal(toggle.getAttribute('aria-checked'), 'false')
    toggle.focus()
    await ui.click(toggle)
    assert.equal(document.documentElement.dataset.theme, 'dark')
    assert.equal(toggle.getAttribute('aria-checked'), 'true')
    assert.equal(document.activeElement, toggle)
    assert.equal(localStorage.getItem(THEME_KEY), 'dark')
    await ui.click(ui.byText('Projects', document.querySelector('.primary-nav')))
    assert.equal(document.documentElement.dataset.theme, 'dark')
    await ui.mount()
    const restored = await openSettings(ui)
    assert.equal(restored.getAttribute('aria-checked'), 'true')
    await ui.act(async () => db.emit('bob'))
    const accountToggle = await openSettings(ui)
    assert.equal(accountToggle.getAttribute('aria-checked'), 'true')
    await ui.click(accountToggle)
    assert.equal(document.documentElement.dataset.theme, 'light')
    assert.equal(localStorage.getItem(THEME_KEY), 'light')
    assert.equal(localStorage.getItem('no-te.theme-test-sentinel'), 'Keep existing data')
    assert.ok(db.calls.every(call => call.op === 'select'))
  } finally { await ui.close() }
})

test('theme follows the device until explicitly chosen and synchronizes another tab without touching other settings', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const ui = await uiHarness('theme-device', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  const changeSystem = systemTheme(ui, true)
  try {
    await ui.mount()
    const toggle = await openSettings(ui)
    assert.equal(document.documentElement.dataset.theme, 'dark')
    assert.equal(localStorage.getItem(THEME_KEY), null)
    await changeSystem(false)
    assert.equal(toggle.getAttribute('aria-checked'), 'false')
    await ui.click(toggle)
    await changeSystem(false)
    assert.equal(document.documentElement.dataset.theme, 'dark')
    localStorage.setItem(THEME_KEY, 'light')
    await ui.act(async () => window.dispatchEvent(new ui.dom.window.StorageEvent('storage', { key: THEME_KEY, newValue: 'light' })))
    assert.equal(document.documentElement.dataset.theme, 'light')
    localStorage.removeItem(THEME_KEY)
    await ui.act(async () => window.dispatchEvent(new ui.dom.window.StorageEvent('storage', { key: THEME_KEY, newValue: null })))
    await changeSystem(true)
    assert.equal(document.documentElement.dataset.theme, 'dark')
    await ui.act(async () => window.dispatchEvent(new ui.dom.window.StorageEvent('storage', { key: 'unrelated', newValue: 'light' })))
    assert.equal(document.documentElement.dataset.theme, 'dark')
  } finally { await ui.close() }
})

test('blocked appearance storage still switches the current session and reports that it was not saved', async () => {
  const db = cloudSupabase()
  db.emit('alice')
  const ui = await uiHarness('theme-storage-failure', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  systemTheme(ui, false)
  const prototype = ui.dom.window.Storage.prototype
  const original = prototype.setItem
  try {
    await ui.mount()
    const toggle = await openSettings(ui)
    prototype.setItem = function (key, value) {
      if (key === THEME_KEY) throw new Error('Storage denied')
      return original.call(this, key, value)
    }
    await ui.click(toggle)
    assert.equal(document.documentElement.dataset.theme, 'dark')
    assert.equal(toggle.getAttribute('aria-checked'), 'true')
    assert.match(document.querySelector('.appearance-settings [role="status"]').textContent, /could not save/)
    assert.equal(localStorage.getItem(THEME_KEY), null)
  } finally { prototype.setItem = original; await ui.close() }
})

test('pre-paint initialization respects saved choice, device fallback and storage failures without exposing data', async () => {
  const bootstrap = await readFile(new URL('../public/theme-init.js', import.meta.url), 'utf8')
  for (const [saved, deviceDark, expected] of [
    ['light', true, 'light'], ['dark', false, 'dark'], [null, true, 'dark'],
    ['invalid', false, 'light'], [new Error('Denied'), true, 'dark'],
  ]) {
    const root = { dataset: {} }
    let browserColor
    runInNewContext(bootstrap, {
      localStorage: { getItem(key) { assert.equal(key, THEME_KEY); if (saved instanceof Error) throw saved; return saved } },
      window: { matchMedia: () => ({ matches: deviceDark }) },
      document: { documentElement: root, querySelector: () => ({ setAttribute(_, value) { browserColor = value } }) },
    })
    assert.equal(root.dataset.theme, expected)
    assert.equal(browserColor, expected === 'dark' ? '#0F172A' : '#F5F5F0')
  }
})
