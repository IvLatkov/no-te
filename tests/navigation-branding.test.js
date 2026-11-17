import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'

test('lettering-only brand and restored icons preserve project and documentation navigation', async () => {
  const db = cloudSupabase()
  db.projects.push({ id: 'project-1', user_id: 'alice', name: 'Navigation project', description: '' })
  db.emit('alice')
  const ui = await uiHarness('navigation-branding', { module: '/src/App.jsx', props: { client: db, configError: '' } })
  try {
    await ui.mount()
    await ui.waitFor(() => document.querySelector('.primary-nav'))
    const sidebar = document.querySelector('#sidebar')
    const brand = sidebar.querySelector('a[aria-label="No-Te home"]')
    assert.equal(brand.querySelector('[role="img"]').getAttribute('aria-label'), 'no-te')
    assert.equal(brand.querySelector('img'), null)
    assert.match(brand.querySelector('.no-te-wordmark').style.getPropertyValue('--wordmark-image'), /no-te-wordmark\.svg/)
    for (const [label, icon] of [['Dashboard', 'house'], ['Projects', 'layers'], ['Documentation', 'book-open']]) {
      const button = ui.byText(label, sidebar)
      assert.ok(button.querySelector(`svg.lucide-${icon}`))
      assert.equal(button.querySelector('img'), null)
    }
    await ui.click(ui.byText('Projects', sidebar))
    await ui.waitFor(() => document.querySelector('.project-card'))
    assert.ok(document.querySelector('.project-card-top svg.lucide-layers'))
    await ui.click(ui.byLabel('Open project Navigation project'))
    await ui.waitFor(() => document.querySelector('.project-tabs'))
    const tabs = document.querySelector('.project-tabs')
    assert.ok(ui.byText('Task board', tabs).querySelector('svg.lucide-layers'))
    const documentation = ui.byText('Documentation', tabs)
    assert.ok(documentation.querySelector('svg.lucide-book-open'))
    await ui.click(documentation)
    await ui.waitFor(() => document.querySelector('.documentation-workspace'))
    assert.equal(documentation.getAttribute('aria-pressed'), 'true')
    await ui.click(brand)
    await ui.waitFor(() => document.querySelector('#apps-heading'))
    assert.equal(document.querySelector('.page-label').textContent, 'Dashboard')
    assert.equal(document.querySelector('img[src*="branding/"]'), null)
  } finally { await ui.close() }
})
