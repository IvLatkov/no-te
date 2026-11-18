import { openDocumentation } from './helpers/documentationNavigation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { cloudSupabase } from './helpers/cloudSupabase.js'
import { createDocumentationApi } from '../src/data/supabaseDocumentation.js'
import { createCloudDocumentationStore } from '../src/data/cloudDocumentationStore.js'
import { createProjectsApi } from '../src/data/supabaseProjects.js'
import { createTasksApi } from '../src/data/supabaseTasks.js'
import { USER_DATA_KEYS } from '../src/data/storageSafety.js'
import { backupFixture, seedBackupData } from './helpers/backupFixture.js'

const content = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Keep rich content', marks: [{ type: 'bold' }] }],
    },
  ],
}
async function fixture() {
  const db = cloudSupabase()
  db.emit('alice')
  const api = createDocumentationApi(db, 'alice')
  const projects = createProjectsApi(db, 'alice')
  const a = await projects.createProject({ name: 'Project A' })
  const b = await projects.createProject({ name: 'Project B' })
  const general = await api.saveFolder({ name: 'General' })
  const nested = await api.saveFolder({ name: 'Nested', parentFolderId: general.id })
  const leaf = await api.saveFolder({ name: 'Leaf', parentFolderId: nested.id })
  const specific = await api.saveFolder({ name: 'A only', projectId: a.id })
  const note = await api.createNote({
    title: 'Source note',
    projectId: a.id,
    folderId: general.id,
    content,
  })
  const other = await api.createNote({
    title: 'Other note',
    projectId: b.id,
    folderId: general.id,
    content,
  })
  const tag = await api.saveTag({ name: 'Keep tag', color: '#B994FF' })
  const task = await createTasksApi(db, 'alice').createTask(a.id, { title: 'Keep task' })
  await api.setRelationships('note_tags', note.id, [tag.id])
  await api.setRelationships('task_notes', task.id, [note.id])
  return { db, api, a, b, general, nested, leaf, specific, note, other }
}
const card = (title) =>
  [...document.querySelectorAll('.note-card-title')]
    .find((item) => item.textContent === title)
    ?.closest('.note-card')
const folder = (name) =>
  [...document.querySelectorAll('.folder-name-button')]
    .find((item) => item.textContent.trim() === name)
    ?.closest('.folder-row')
const unfiled = () =>
  [...document.querySelectorAll('.folder-base')].find(
    (item) => item.textContent.trim() === 'Unfiled',
  )
async function open(ui) {
  await ui.mount()
  await openDocumentation(ui)
  await ui.waitFor(() => card('Source note'))
}
function transfer() {
  const data = new Map()
  return {
    setData: (type, value) => data.set(type, value),
    getData: (type) => data.get(type) || '',
    effectAllowed: '',
    dropEffect: '',
  }
}
async function event(ui, element, type, data, properties = {}) {
  const value = new ui.dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...properties,
  })
  Object.defineProperty(value, 'dataTransfer', { value: data })
  await ui.act(async () => element.dispatchEvent(value))
  return value
}
async function drag(ui, source, target, data = transfer()) {
  await event(ui, source, 'dragstart', data)
  await event(ui, target, 'dragover', data)
  await event(ui, target, 'drop', data)
  return data
}
const done = () =>
  !document.querySelector('.note-card.is-moving') &&
  document.querySelector('.note-drag-status')?.textContent.startsWith('Moved')

test('native note dragging moves between nested/general/project folders and Unfiled, preserving selection, content and relationships', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-moves', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    seedBackupData(localStorage, backupFixture('Legacy drag secret').data)
    const legacy = USER_DATA_KEYS.map((key) => localStorage.getItem(key))
    await open(ui)
    await ui.click(card('Source note'))
    await ui.waitFor(() => ui.editor())
    const editor = ui.editor()
    const tags = structuredClone(f.db.note_tags)
    const links = structuredClone(f.db.task_notes)
    f.db.calls.length = 0
    const originalTime = f.db.notes.find((row) => row.id === f.note.id).updated_at
    for (const [destination, id] of [
      [() => folder('Nested'), f.nested.id],
      [() => folder('Leaf'), f.leaf.id],
      [() => folder('A only'), f.specific.id],
      [unfiled, null],
      [() => folder('General'), f.general.id],
    ]) {
      await drag(ui, card('Source note'), destination())
      await ui.waitFor(
        () => done() && f.db.notes.find((row) => row.id === f.note.id).folder_id === id,
      )
      assert.ok(card('Source note'), 'moved note remains visible in its destination')
      assert.equal(ui.editor(), editor)
      assert.equal(document.querySelector('.note-title').value, 'Source note')
      assert.equal(document.querySelector('[aria-label="Note folder"]').value, id || '')
      assert.equal(document.querySelector('[data-note-drop]'), null)
    }
    const saved = f.db.notes.find((row) => row.id === f.note.id)
    assert.equal(saved.id, f.note.id)
    assert.equal(saved.project_id, f.a.id)
    assert.deepEqual(saved.content, content)
    assert.notEqual(saved.updated_at, originalTime)
    assert.deepEqual(f.db.note_tags, tags)
    assert.deepEqual(f.db.task_notes, links)
    const writes = f.db.calls.filter((call) => call.op !== 'select')
    assert.equal(writes.length, 5)
    assert.ok(
      writes.every(
        (call) =>
          call.table === 'notes' &&
          call.op === 'update' &&
          Object.keys(call.values).join() === 'folder_id',
      ),
    )
    assert.deepEqual(
      USER_DATA_KEYS.map((key) => localStorage.getItem(key)),
      legacy,
    )
    await ui.mount()
    await openDocumentation(ui)
    await ui.waitFor(() => folder('General'))
    await ui.click(ui.byText('General', document.querySelector('.folder-tree')))
    assert.ok(card('Source note'))
  } finally {
    await ui.close()
  }
})

test('invalid project destinations are visibly blocked; cancelling a drag neither moves nor opens a note', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-invalid', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    await open(ui)
    await ui.click(card('Source note'))
    await ui.waitFor(() => ui.editor())
    f.db.calls.length = 0
    const data = transfer(),
      source = card('Other note'),
      destination = folder('A only')
    await event(ui, source, 'dragstart', data)
    assert.ok(source.classList.contains('is-dragging'))
    await event(ui, destination, 'dragover', data)
    assert.equal(destination.getAttribute('data-note-drop'), 'over-invalid')
    assert.match(destination.title, /different project/)
    assert.equal(data.dropEffect, 'none')
    await event(ui, destination, 'drop', data)
    assert.match(document.querySelector('.notes-error').textContent, /different project/)
    assert.equal(f.db.notes.find((row) => row.id === f.other.id).folder_id, f.general.id)
    assert.equal(document.querySelector('[data-note-drop]'), null)
    await event(ui, source, 'dragstart', data)
    await event(ui, folder('Nested'), 'dragover', data)
    assert.equal(folder('Nested').getAttribute('data-note-drop'), 'over-valid')
    await event(ui, source, 'dragend', data)
    await event(ui, source, 'click', data, { detail: 1 })
    assert.equal(
      document.querySelector('.note-title').value,
      'Source note',
      'drag release must not open another note',
    )
    assert.equal(document.querySelector('[data-note-drop]'), null)
    assert.equal(source.classList.contains('is-dragging'), false)
    assert.ok(!f.db.calls.some((call) => call.op !== 'select'))
    await event(ui, source, 'pointerdown', data)
    await event(ui, source, 'click', data, { detail: 1 })
    assert.equal(
      document.querySelector('.note-title').value,
      'Other note',
      'a fresh intentional click still selects',
    )
  } finally {
    await ui.close()
  }
})

test('pending drops are deduplicated, and failed writes preserve the previous folder and list', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-failure', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    await open(ui)
    await ui.click(ui.byText('General', document.querySelector('.folder-tree')))
    await ui.click(card('Source note'))
    await ui.waitFor(() => ui.editor())
    const original = structuredClone(f.db.notes.find((row) => row.id === f.note.id))
    let release, arrived
    const paused = new Promise((resolve) => {
      arrived = resolve
    })
    f.db.pause = async (call) => {
      if (call.table === 'notes' && call.op === 'update') {
        arrived()
        await new Promise((resolve) => {
          release = resolve
        })
      }
    }
    f.db.failure = (call) =>
      call.table === 'notes' && call.op === 'update' ? new TypeError('Failed to fetch') : null
    f.db.calls.length = 0
    const data = await drag(ui, card('Source note'), folder('Nested'))
    await paused
    assert.equal(document.querySelector('[aria-label="Note folder"]').value, f.general.id)
    assert.ok(card('Source note'))
    await event(ui, folder('Nested'), 'drop', data)
    assert.equal(f.db.calls.filter((call) => call.op === 'update').length, 1)
    f.db.pause = null
    release()
    await ui.waitFor(
      () => document.querySelector('.notes-error') && !document.querySelector('.is-moving'),
    )
    assert.match(document.querySelector('.notes-error').textContent, /connection/)
    assert.deepEqual(
      f.db.notes.find((row) => row.id === f.note.id),
      original,
    )
    assert.ok(card('Source note'))
    assert.equal(document.querySelector('[aria-label="Note folder"]').value, f.general.id)
    assert.equal(document.querySelector('[data-note-drop]'), null)
    f.db.failure = null
    await drag(ui, card('Source note'), folder('Nested'))
    await ui.waitFor(done)
    assert.equal(f.db.notes.find((row) => row.id === f.note.id).folder_id, f.nested.id)
  } finally {
    await ui.close()
  }
})

test('filtered lists retain their search and selection; the keyboard selector uses the same safe folder move', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-filtered', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    await open(ui)
    await ui.click(card('Source note'))
    await ui.waitFor(() => ui.editor())
    await ui.input(document.querySelector('[aria-label="Search notes"]'), 'Source')
    assert.equal(document.querySelectorAll('.note-card').length, 1)
    await drag(ui, card('Source note'), folder('Nested'))
    await ui.waitFor(done)
    assert.equal(document.querySelector('[aria-label="Search notes"]').value, 'Source')
    assert.equal(document.querySelectorAll('.note-card').length, 1)
    await ui.select(document.querySelector('[aria-label="Note folder"]'), '')
    await ui.waitFor(
      () => done() && f.db.notes.find((row) => row.id === f.note.id).folder_id === null,
    )
    assert.equal(document.querySelector('.note-title').value, 'Source note')
    assert.ok(card('Source note'))
    assert.equal(document.querySelector('[aria-label="Search notes"]').value, 'Source')
    assert.equal(document.querySelector('[aria-label="Note folder"]').disabled, false)
  } finally {
    await ui.close()
  }
})

test('hover expands collapsed destinations, panel edges scroll, and external drag payloads are ignored', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-hover', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    await open(ui)
    await ui.click(ui.byLabel('Collapse folder General'))
    assert.equal(folder('Nested'), undefined)
    const data = transfer()
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, folder('General'), 'dragover', data)
    await ui.waitFor(() => folder('Nested'))
    const panel = document.querySelector('.notes-panel')
    panel.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200, left: 0, right: 280 })
    Object.defineProperties(panel, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    })
    await event(ui, folder('Nested'), 'dragover', data, { clientY: 190 })
    await ui.waitFor(() => panel.scrollTop > 0)
    await event(ui, card('Source note'), 'dragend', data)
    f.db.calls.length = 0
    const external = transfer()
    external.setData(
      'application/x-no-te-note',
      JSON.stringify({ noteId: f.note.id, token: 'other-tab' }),
    )
    await event(ui, folder('Nested'), 'drop', external)
    assert.ok(!f.db.calls.some((call) => call.op !== 'select'))
  } finally {
    await ui.close()
  }
})

test('the cloud move operation revalidates ownership and compatibility against server folders', async () => {
  const f = await fixture()
  f.db.emit('bob')
  const foreign = await createDocumentationApi(f.db, 'bob').saveFolder({
    name: 'Private Bob folder',
  })
  f.db.emit('alice')
  const store = createCloudDocumentationStore(f.db, 'alice')
  await store.start()
  const before = structuredClone(f.db.notes)
  f.db.calls.length = 0
  assert.equal(await store.moveNote(f.note.id, foreign.id), null)
  assert.match(store.getSnapshot().error, /unavailable/)
  assert.equal(await store.moveNote(f.other.id, f.specific.id), null)
  assert.match(store.getSnapshot().error, /different project/)
  assert.deepEqual(f.db.notes, before)
  assert.ok(!f.db.calls.some((call) => call.table === 'notes' && call.op === 'update'))
  store.dispose()
})

test('stationary edge dragging performs no scroll writes at the container limit', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-scroll-limit', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  try {
    await open(ui)
    const panel = document.querySelector('.notes-panel')
    panel.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 280, height: 200 })
    let writes = 0
    Object.defineProperties(panel, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: {
        configurable: true,
        get: () => 400,
        set() {
          writes += 1
        },
      },
    })
    const data = transfer()
    await event(ui, card('Source note'), 'dragstart', data)
    for (let index = 0; index < 30; index++)
      await event(ui, folder('General'), 'dragover', data, { clientX: 100, clientY: 190 })
    assert.equal(writes, 0, 'repeated dragover at the bottom must not keep writing scrollTop')
  } finally {
    await ui.close()
  }
})

test('nested dragleave with a null relatedTarget does not clear the destination under the pointer', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-nested-leave', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  const originalHitTest = document.elementFromPoint
  try {
    await open(ui)
    const destination = folder('General')
    const label = destination.querySelector('.folder-name-button span')
    document.elementFromPoint = () => label
    const data = transfer()
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    await event(ui, destination.querySelector('svg'), 'dragleave', data, {
      clientX: 100,
      clientY: 115,
    })
    assert.equal(
      destination.getAttribute('data-note-drop'),
      'over-valid',
      'moving across nested icons must not clear the row',
    )
  } finally {
    document.elementFromPoint = originalHitTest
    await ui.close()
  }
})

test('stationary hover across child elements causes no workspace commits or highlight changes', async () => {
  const f = await fixture()
  let commits = 0
  const ui = await uiHarness('test-note-drag-render-count', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
    onRender: () => {
      commits += 1
    },
  })
  const originalHitTest = document.elementFromPoint
  try {
    await open(ui)
    const destination = folder('General'),
      data = transfer()
    document.elementFromPoint = () => destination.querySelector('span')
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    commits = 0
    for (let i = 0; i < 40; i++) {
      await event(ui, destination.querySelector('svg'), 'dragleave', data, {
        clientX: 100,
        clientY: 115,
      })
      await event(ui, destination.querySelector('span'), 'dragover', data, {
        clientX: 100,
        clientY: 115,
      })
    }
    assert.equal(commits, 0)
    assert.equal(destination.getAttribute('data-note-drop'), 'over-valid')
    document.elementFromPoint = () => document.body
    await event(ui, destination, 'dragleave', data, { clientX: 500, clientY: 115 })
    assert.equal(destination.getAttribute('data-note-drop'), 'valid')
  } finally {
    document.elementFromPoint = originalHitTest
    await ui.close()
  }
})

test('child transitions do not restart folder expansion and leaving or cancelling clears its timer', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-expand-stability', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  const originalHitTest = document.elementFromPoint
  try {
    await open(ui)
    await ui.click(ui.byLabel('Collapse folder General'))
    const destination = folder('General'),
      data = transfer()
    document.elementFromPoint = () => destination.querySelector('span')
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    for (let i = 0; i < 5; i++) {
      await ui.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
      await event(ui, destination.querySelector('svg'), 'dragleave', data, {
        clientX: 100,
        clientY: 115,
      })
      await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    }
    await ui.waitFor(() => folder('Nested'))
    await event(ui, card('Source note'), 'dragend', data)
    await ui.click(ui.byLabel('Collapse folder General'))
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    document.elementFromPoint = () => document.body
    await event(ui, destination, 'dragleave', data, { clientX: 500, clientY: 115 })
    await ui.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650))
    })
    assert.equal(folder('Nested'), undefined)
    document.elementFromPoint = () => destination.querySelector('span')
    await event(ui, destination, 'dragover', data, { clientX: 100, clientY: 115 })
    await event(ui, card('Source note'), 'dragend', data)
    await ui.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650))
    })
    assert.equal(folder('Nested'), undefined)
    assert.equal(document.querySelector('[data-note-drop]'), null)
  } finally {
    document.elementFromPoint = originalHitTest
    await ui.close()
  }
})

test('edge scrolling cancels on container exit, drop, dragend and unmount', async () => {
  const f = await fixture()
  const ui = await uiHarness('test-note-drag-scroll-cleanup', {
    module: '/src/App.jsx',
    props: { client: f.db, configError: '' },
  })
  const originalFrame = globalThis.requestAnimationFrame,
    originalCancel = globalThis.cancelAnimationFrame
  const originalHitTest = document.elementFromPoint
  const frames = new Map()
  let id = 0
  let closed = false
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (handle) => frames.delete(handle)
  try {
    await open(ui)
    const panel = document.querySelector('.notes-panel'),
      data = transfer()
    panel.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200, left: 0, right: 280 })
    Object.defineProperties(panel, { clientHeight: { value: 200 }, scrollHeight: { value: 600 } })
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, folder('General'), 'dragover', data, { clientX: 100, clientY: 190 })
    assert.equal(frames.size, 1)
    document.elementFromPoint = () => folder('General').querySelector('span')
    await event(ui, folder('General').querySelector('svg'), 'dragleave', data, {
      clientX: 100,
      clientY: 190,
    })
    assert.equal(frames.size, 1, 'child transitions must not stop/restart the loop')
    document.elementFromPoint = () => document.body
    await event(ui, panel, 'dragleave', data, { clientX: 500, clientY: 190 })
    assert.equal(frames.size, 0)
    await event(ui, panel, 'dragover', data, { clientX: 100, clientY: 190 })
    await event(ui, panel, 'drop', data, { clientX: 100, clientY: 190 })
    assert.equal(frames.size, 0)
    await event(ui, panel, 'dragover', data, { clientX: 100, clientY: 190 })
    await event(ui, card('Source note'), 'dragend', data)
    assert.equal(frames.size, 0)
    await event(ui, card('Source note'), 'dragstart', data)
    await event(ui, panel, 'dragover', data, { clientX: 100, clientY: 190 })
    assert.equal(frames.size, 1)
    await ui.close()
    closed = true
    assert.equal(frames.size, 0)
  } finally {
    if (!closed) await ui.close()
    globalThis.requestAnimationFrame = originalFrame
    globalThis.cancelAnimationFrame = originalCancel
    document.elementFromPoint = originalHitTest
    if (frames.size) frames.clear()
  }
})
