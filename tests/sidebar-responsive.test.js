import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { uiHarness } from './helpers/uiHarness.js'

function mediaViewport(ui, initialWidth) {
  let width = initialWidth
  const listeners = new Set()
  ui.dom.window.matchMedia = (query) => ({
    get matches() { return width <= 1100 },
    media: query,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  })
  return async (nextWidth) => {
    const changed = (width <= 1100) !== (nextWidth <= 1100)
    width = nextWidth
    await ui.act(async () => {
      if (changed) for (const listener of listeners) listener({ matches: width <= 1100 })
    })
  }
}

for (const width of [375, 768, 984, 1024, 1440]) {
  test(`navigation visibility, dismissal, page changes and resize at ${width}px`, async () => {
    const ui = await uiHarness(`sidebar-${width}`)
    const resize = mediaViewport(ui, width)
    try {
      await ui.mount()
      const sidebar = document.querySelector('#sidebar')
      const toggle = document.querySelector('#navigation-toggle')
      const workspace = document.querySelector('.workspace')
      assert.equal(sidebar.hidden, width <= 1100)
      assert.equal(sidebar.hasAttribute('inert'), width <= 1100)
      assert.equal(toggle.getAttribute('aria-expanded'), 'false')
      if (width > 1100) {
        await ui.click(ui.byText('Projects', sidebar))
        assert.equal(sidebar.hidden, false)
        await resize(984)
        assert.equal(sidebar.hidden, true)
      }
      await ui.click(toggle)
      assert.equal(sidebar.hidden, false)
      assert.equal(sidebar.getAttribute('aria-modal'), 'true')
      assert.equal(toggle.getAttribute('aria-expanded'), 'true')
      assert.equal(workspace.inert, true)
      const close = sidebar.querySelector('[aria-label="Close navigation"]')
      assert.ok(document.activeElement === close, 'Opening focuses the close button')
      const last = sidebar.querySelector('.sidebar-bottom button')
      await ui.act(async () => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })))
      assert.ok(document.activeElement === last, 'Shift+Tab wraps to the last item')
      await ui.act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
      assert.ok(document.activeElement === close, 'Tab wraps to the first item')
      await ui.act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      assert.equal(sidebar.hidden, true)
      assert.equal(workspace.inert, undefined)
      assert.ok(document.activeElement === toggle, 'Escape restores focus to the toggle')
      assert.equal(document.body.style.overflow, '')
      await ui.click(toggle)
      await ui.click(document.querySelector('.navigation-backdrop'))
      assert.equal(sidebar.hidden, true)
      await ui.click(toggle)
      await ui.click(ui.byText('Projects', sidebar))
      assert.equal(sidebar.hidden, true)
      assert.equal(document.querySelector('.page-label').textContent, 'Projects')
      await ui.click(toggle)
      await ui.click(close)
      assert.equal(sidebar.hidden, true)
      await ui.click(toggle)
      await resize(1440)
      assert.equal(sidebar.hidden, false)
      assert.equal(sidebar.hasAttribute('inert'), false)
      assert.equal(sidebar.getAttribute('aria-modal'), null)
      assert.equal(toggle.getAttribute('aria-expanded'), 'false')
      assert.equal(document.querySelector('.navigation-backdrop'), null)
      assert.equal(document.activeElement.id, 'main-content')
      await resize(375)
      assert.equal(sidebar.hidden, true)
      await ui.click(toggle)
      assert.equal(sidebar.hidden, false)
    } finally {
      await ui.close()
    }
  })
}

test('authenticated dashboard uses the same drawer and preserves Apps when navigating', async () => {
  const { cloudSupabase } = await import('./helpers/cloudSupabase.js')
  const db = cloudSupabase()
  db.projects.push({ id: 'project-1', user_id: 'alice', name: 'A very long project name '.repeat(30), description: '' })
  db.emit('alice')
  const ui = await uiHarness('sidebar-cloud', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  mediaViewport(ui, 984)
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('#apps-heading'))
    const sidebar = document.querySelector('#sidebar')
    assert.equal(sidebar.hidden, true)
    await ui.click(document.querySelector('#navigation-toggle'))
    assert.equal([...sidebar.querySelectorAll('.primary-nav button')].some(button => button.textContent.trim() === 'Documentation'), false)
    await ui.click(ui.byText('Dashboard', sidebar))
    await ui.click(ui.byText('All documentation'))
    await ui.waitFor(() => sidebar.hidden)
    assert.equal(document.querySelector('.page-label').textContent, 'Documentation')
    await ui.waitFor(() => document.querySelector('.documentation-workspace'))
    await ui.click(document.querySelector('#navigation-toggle'))
    await ui.click(ui.byText('Dashboard', sidebar))
    await ui.waitFor(() => document.querySelector('#apps-heading'))
    assert.equal(sidebar.hidden, true)
    assert.equal(document.querySelectorAll('.app-shortcut').length, 6)
    await ui.click(document.querySelector('#navigation-toggle'))
    const project = sidebar.querySelector('.project-nav button')
    assert.equal(project.title, db.projects[0].name)
    await ui.click(project)
    await ui.waitFor(() => sidebar.hidden)
    assert.equal(document.querySelector('.page-label').textContent, db.projects[0].name)
    await ui.waitFor(() => document.querySelector('.project-workspace'))
  } finally {
    await ui.close()
  }
})

test('search sits below the sidebar brand and closes the drawer before opening its dialog', async () => {
  for (const width of [375, 984, 1440]) {
    const ui = await uiHarness(`sidebar-search-${width}`)
    mediaViewport(ui, width)
    try {
      await ui.mount()
      const sidebar = document.querySelector('#sidebar')
      const search = sidebar.querySelector('[aria-label="Open global search"]')
      assert.ok(search)
      assert.ok(search.previousElementSibling.matches('.brand'))
      assert.equal(document.querySelector('.workspace-header [aria-label="Open global search"]'), null)
      if (width <= 1100) await ui.click(document.querySelector('#navigation-toggle'))
      search.focus()
      await ui.click(search)
      await ui.waitFor(() => document.querySelector('.global-search-modal[open]'))
      assert.equal(sidebar.hidden, width <= 1100)
      assert.equal(document.querySelector('#navigation-toggle').getAttribute('aria-expanded'), 'false')
      assert.equal(document.querySelector('.navigation-backdrop'), null)
      await ui.click(ui.byLabel('Close dialog', document.querySelector('.global-search-modal')))
      assert.ok(document.activeElement === (width <= 1100 ? document.querySelector('#navigation-toggle') : search))
    } finally {
      await ui.close()
    }
  }
})

test('feature styles cannot reintroduce global sidebar layout and desktop stays in flow', async () => {
  const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
  for (const file of ['documentation', 'dashboard', 'projects', 'organization', 'task-details']) {
    const feature = await readFile(new URL(`../src/${file}.css`, import.meta.url), 'utf8')
    assert.doesNotMatch(feature, /(?:^|\n)\s*\.(?:sidebar|app-layout|menu-toggle)(?:\s|[.{:#])/)
  }
  const desktop = css.slice(0, css.indexOf('@media'))
  assert.doesNotMatch(desktop.match(/\.sidebar \{([^}]+)\}/)[1], /position:\s*(fixed|absolute)/)
  assert.match(css, /\.sidebar\[hidden\]\s*\{\s*display: none/)
  assert.match(css, /@media \(max-width: 1100px\)/)
  assert.match(css, /\.nav-item > span\s*\{[^}]*text-overflow: ellipsis/s)
})
