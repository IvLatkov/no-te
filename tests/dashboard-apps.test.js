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

test('Apps preserves the welcome, protects new tabs, exposes native controls and honest launch fallbacks', async () => {
  const ui = await uiHarness('dashboard-apps', { module: '/src/components/dashboard/Dashboard.jsx' })
  try {
    await ui.mount()
    assert.equal(document.querySelector('#apps-heading').textContent, 'Apps')
    assert.match(document.querySelector('#page-heading').textContent, /Welcome to No-Te/)
    const tiles = [...document.querySelectorAll('.app-shortcut')]
    assert.equal(tiles.length, 6)
    for (const tile of tiles) {
      assert.ok(tile.getAttribute('aria-label'))
      const image = tile.querySelector('img')
      assert.match(image.getAttribute('src'), /^\/apps\//)
      assert.equal(image.alt, '')
      assert.equal(image.width, 32)
      assert.equal(image.height, 32)
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
    assert.equal(chatgpt.querySelector('.app-name').textContent, 'ChatGPT')
    assert.equal(chatgpt.querySelector('img').getAttribute('src'), '/apps/chatgpt.svg')
    chatgpt.focus()
    assert.equal(document.activeElement, chatgpt)
    chatgpt.addEventListener('click', (event) => event.preventDefault())
    await ui.click(chatgpt)
    assert.equal(document.querySelector('[role="status"]').textContent, '')
    const vscode = document.querySelector('[href="vscode://"]')
    assert.equal(vscode.hasAttribute('target'), false)
    // Prevent jsdom navigation while exercising the real click handler.
    vscode.addEventListener('click', (event) => event.preventDefault())
    await ui.click(vscode)
    assert.match(document.querySelector('[role="status"]').textContent, /cannot confirm desktop launches/)
    assert.match(document.querySelector('[role="status"]').textContent, /Visual Studio Code.*Windows Start/)
  } finally {
    await ui.close()
  }
})

