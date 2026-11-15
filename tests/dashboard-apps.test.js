import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { appShortcuts } from '../src/components/dashboard/appShortcuts.js'
import { uiHarness } from './helpers/uiHarness.js'

test('Apps uses local official artwork and fixed website and desktop destinations', async () => {
  assert.deepEqual(appShortcuts.map((app) => app.id), ['vscode', 'chatgpt', 'figma', 'cloudflare', 'github', 'supabase'])
  const destinations = {
    vscode: 'vscode://', chatgpt: 'https://chatgpt.com/',
    figma: 'https://www.figma.com/design/9JeP5Ri3Y8dQbMyrJ1nf08?node-id=4-2',
    cloudflare: 'https://dash.cloudflare.com/', github: 'https://github.com/IvLatkov',
    supabase: 'https://supabase.com/dashboard',
  }
  for (const app of appShortcuts) {
    assert.equal(app.href, destinations[app.id])
    const bytes = await readFile(new URL(`../public/apps/${app.logo}`, import.meta.url))
    assert.ok(bytes.length > 100)
    if (app.logo.endsWith('.svg')) {
      assert.match(bytes.toString(), /<svg/)
      assert.doesNotMatch(bytes.toString(), /<script|<foreignObject|(?:href|src)=["']https?:/i)
    }
  }
})

test('dashboard shows Apps without a welcome, protects new tabs and exposes honest launch fallbacks', async () => {
  const ui = await uiHarness('dashboard-apps', { module: '/src/components/dashboard/Dashboard.jsx' })
  try {
    await ui.mount()
    assert.equal(document.querySelector('#apps-heading').textContent, 'Apps')
    assert.equal(document.querySelector('.empty-state'), null)
    assert.doesNotMatch(document.querySelector('.dashboard').textContent, /Welcome to|Your space for project notes/)
    const toggle = document.querySelector('.apps-toggle')
    const shortcuts = document.getElementById(toggle.getAttribute('aria-controls'))
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(shortcuts.hidden, true)
    await ui.click(toggle)
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
    assert.equal(shortcuts.hidden, false)
    const tiles = [...document.querySelectorAll('.app-shortcut')]
    assert.equal(tiles.length, 6)
    for (const tile of tiles) {
      assert.ok(tile.getAttribute('aria-label'))
      assert.ok(tile.title)
      assert.equal(tile.textContent.trim(), '')
      const image = tile.querySelector('img')
      assert.match(image.getAttribute('src'), /^\/apps\//)
      assert.equal(image.alt, '')
      assert.equal(image.width, 24)
      assert.equal(image.height, 24)
      assert.ok(!tile.hasAttribute('tabindex'))
    }
    for (const link of document.querySelectorAll('[target="_blank"]')) {
      assert.equal(link.rel, 'noopener noreferrer')
      assert.equal(new URL(link.href).protocol, 'https:')
    }
    assert.equal(document.querySelectorAll('[target="_blank"]').length, 5)
    assert.doesNotMatch(document.querySelector('.dashboard').textContent, /Godot|Codex|Set up/)
    const chatgpt = document.querySelector('[aria-label="Open ChatGPT in a new tab"]')
    assert.equal(chatgpt.href, 'https://chatgpt.com/')
    assert.equal(chatgpt.title, 'ChatGPT')
    assert.equal(chatgpt.querySelector('img').getAttribute('src'), '/apps/chatgpt.svg')
    chatgpt.focus()
    assert.equal(document.activeElement, chatgpt)
    chatgpt.addEventListener('click', (event) => event.preventDefault())
    await ui.click(chatgpt)
    assert.equal(shortcuts.hidden, true)
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.ok(document.activeElement === toggle)
    assert.equal(document.querySelector('[role="status"]').textContent, '')
    await ui.click(toggle)
    const vscode = document.querySelector('[href="vscode://"]')
    assert.equal(vscode.hasAttribute('target'), false)
    // Prevent jsdom navigation while exercising the real click handler.
    vscode.addEventListener('click', (event) => event.preventDefault())
    await ui.click(vscode)
    assert.equal(shortcuts.hidden, true)
    assert.match(document.querySelector('[role="status"]').textContent, /cannot confirm desktop launches/)
    assert.match(document.querySelector('[role="status"]').textContent, /Visual Studio Code.*Windows Start/)
    assert.equal(document.querySelector('[role="status"]').closest('[hidden]'), null)
    await ui.click(toggle)
    toggle.focus()
    await ui.click(toggle)
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(shortcuts.hidden, true)
    assert.equal(document.querySelector('[role="status"]').textContent, '')
    assert.ok(document.activeElement === toggle)
    await ui.click(toggle)
    assert.equal(shortcuts.hidden, false)
    const outside = document.createElement('button')
    outside.textContent = 'Other page control'
    document.body.append(outside)
    outside.focus()
    await ui.click(outside)
    assert.equal(shortcuts.hidden, true)
    assert.ok(document.activeElement === outside, 'Outside controls keep their focus')
    await ui.click(toggle)
    await ui.click(document.body)
    assert.equal(shortcuts.hidden, true)
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    await ui.click(toggle)
    const shortcut = document.querySelector('.app-shortcut')
    shortcut.focus()
    await ui.act(async () => {
      shortcut.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    assert.equal(shortcuts.hidden, true, 'Escape dismisses Apps')
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(document.activeElement, toggle, 'Focus returns to the Apps toggle')
    await ui.click(toggle)
    outside.focus()
    await ui.act(async () => {
      outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    assert.equal(shortcuts.hidden, true)
    assert.equal(document.activeElement, outside, 'Escape does not steal focus from another control')
    await ui.click(toggle)
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    await ui.act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    assert.equal(shortcuts.hidden, false, 'An open dialog owns Escape')
    dialog.remove()
  } finally {
    await ui.close()
  }
})

test('dashboard offers a next step without a selection and avoids misleading empty states while loading or in error', async () => {
  for (const scenario of [
    { projects: [], heading: 'Start with a project', action: 'Create your first project' },
    { projects: [{ id: 'one', name: 'Example', tasks: [] }], heading: 'Choose a project', action: 'View projects' },
    { projectsLoading: true },
    { projectsError: 'Unavailable' },
    { projects: [{ id: 'one', name: 'Example', tasks: [] }], selectedProjectId: 'one' },
  ]) {
    let opened = 0
    const { heading, action, ...props } = scenario
    const ui = await uiHarness('dashboard-start', {
      module: '/src/components/dashboard/Dashboard.jsx',
      props: { ...props, onOpenProjects: () => { opened++ } },
    })
    try {
      await ui.mount()
      if (heading) {
        assert.equal(document.getElementById('dashboard-start-heading').textContent, heading)
        await ui.click(ui.byText(action))
        assert.equal(opened, 1)
      } else {
        assert.equal(document.querySelector('.dashboard-start'), null)
      }
    } finally {
      await ui.close()
    }
  }
})

