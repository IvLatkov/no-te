import test from 'node:test'
import assert from 'node:assert/strict'
import { uiHarness } from './helpers/uiHarness.js'
import { STORAGE_KEY, createProject, createTask } from '../src/data/projects.js'
import { NOTES_STORAGE_KEY, createNote, noteText } from '../src/data/notes.js'

test('task details autosave and support note linking, creation, navigation, backlinks and safe deletion', async () => {
  const ui = await uiHarness()
  const { click, input, select, submit, byText, byLabel, waitFor, editor, act } = ui
  try {
    const a = createProject({ name: 'Project Alpha' })
    const b = createProject({ name: 'Project Beta' })
    a.tasks.push({ id: 'legacy-task', title: 'Legacy task', description: 'Original description', status: 'todo' })
    b.tasks.push(createTask({ title: 'Beta task' }))
    const richContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Architecture keyword', marks: [{ type: 'bold' }] }] }] }
    const architecture = createNote({ title: 'Architecture', projectId: a.id, content: richContent })
    const decisions = createNote({ title: 'Decisions', projectId: a.id })
    const beta = createNote({ title: 'Beta context', projectId: b.id })
    const free = createNote({ title: 'General context' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([a, b]))
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify([architecture, decisions, beta, free]))
    const projects = () => JSON.parse(localStorage.getItem(STORAGE_KEY))
    const notes = () => JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY))
    const task = () => projects().find(project => project.id === a.id).tasks[0]
    const details = () => document.querySelector('.task-details-modal')
    await ui.mount()
    await click(document.querySelector('.project-nav button'))
    // Exercise the existing native drag event handlers from the new card button.
    async function dragTask(status) {
      const payload = new Map()
      const transfer = { setData: (key, value) => payload.set(key, value), getData: key => payload.get(key) || '' }
      await act(async () => {
        const event = new ui.dom.window.Event('dragstart', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'dataTransfer', { value: transfer })
        document.querySelector('.task-card-open').dispatchEvent(event)
      })
      const column = document.getElementById(`column-${status}`).closest('.board-column')
      await act(async () => {
        for (const type of ['dragover', 'drop']) {
          const event = new ui.dom.window.Event(type, { bubbles: true, cancelable: true })
          Object.defineProperty(event, 'dataTransfer', { value: transfer })
          column.dispatchEvent(event)
        }
      })
    }
    await dragTask('done')
    assert.equal(task().status, 'done')
    await dragTask('todo')
    assert.equal(task().status, 'todo')
    await click(byLabel('Open task Legacy task'))
    assert.ok(details())
    assert.match(details().textContent, /Project Alpha/)
    assert.match(details().textContent, /Not recorded \(older task\)/)
    await input(document.getElementById('task-detail-title'), '')
    await click(byText('Done', details()))
    assert.ok(details(), 'an invalid title does not silently discard the draft')
    assert.equal(task().title, 'Legacy task')
    await input(document.getElementById('task-detail-title'), 'Ship integration')
    await input(document.getElementById('task-detail-description'), 'Updated description')
    const implementation = 'Decision: keep note IDs\n\nnpm run build\nNext: verify backlinks'
    await input(document.getElementById('task-implementation'), implementation)
    await select(document.getElementById('task-detail-status'), 'done')
    assert.equal(task().implementationNotes, implementation)
    assert.equal(task().description, 'Updated description')
    assert.equal(task().status, 'done')
    assert.ok(task().updatedAt)

    await click(byText('Link Note', details()))
    const picker = () => document.querySelector('.note-link-picker')
    assert.equal(picker().querySelector('select').value, a.id)
    assert.equal(picker().querySelectorAll('input[type="checkbox"]').length, 2)
    await input(picker().querySelector('input[type="search"]'), 'KEYWORD')
    assert.equal(picker().querySelectorAll('input[type="checkbox"]').length, 1, 'search includes rich note text')
    await input(picker().querySelector('input[type="search"]'), '')
    await click(picker().querySelector('[aria-label="Link Architecture"]'))
    await click(picker().querySelector('[aria-label="Link Decisions"]'))
    await click(byText('Link 2 notes', picker()))
    assert.deepEqual(new Set(task().linkedNoteIds), new Set([architecture.id, decisions.id]))
    await click(byText('Link Note', details()))
    assert.equal(picker().querySelector('[aria-label="Link Architecture"]').disabled, true)
    assert.equal(picker().querySelector('[aria-label="Link Decisions"]').checked, true)
    await click(byText('Cancel', picker()))
    await click(byLabel('Unlink note Decisions', details()))
    assert.deepEqual(task().linkedNoteIds, [architecture.id])
    assert.equal(notes().length, 4, 'unlinking never deletes notes')

    await click(byText('Link Note', details()))
    await select(picker().querySelector('select'), 'all')
    await click(picker().querySelector('[aria-label="Link Beta context"]'))
    await click(picker().querySelector('[aria-label="Link General context"]'))
    await click(byText('Link 2 notes', picker()))
    assert.equal(task().linkedNoteIds.length, 3)
    await click(byLabel('Open note Beta context', details()))
    await waitFor(() => editor())
    assert.equal(document.querySelector('.note-title').value, 'Beta context')
    assert.equal(notes().find(note => note.id === beta.id).projectId, b.id, 'following a link preserves note ownership')
    assert.equal(document.querySelector('.note-linked-tasks').open, false)
    assert.match(document.querySelector('.note-linked-tasks').textContent, /Ship integration/)
    assert.match(document.querySelector('.note-linked-tasks').textContent, /Project Alpha · Done/)
    await act(async () => { editor().commands.insertContent('Save this before returning to task') })
    await click(document.querySelector('.note-linked-tasks summary'))
    await click(byLabel('Open task Ship integration in Project Alpha'))
    assert.ok(details())
    assert.equal(document.getElementById('task-implementation').value, implementation)
    assert.match(noteText(notes().find(note => note.id === beta.id).content), /Save this before returning/)

    // Simulate a project-key write failure while leaving note persistence working.
    const originalSetItem = ui.dom.window.Storage.prototype.setItem
    ui.dom.window.Storage.prototype.setItem = function (key, value) {
      if (key === STORAGE_KEY) throw new Error('Project storage denied')
      originalSetItem.call(this, key, value)
    }
    await input(document.getElementById('task-implementation'), `${implementation}\nUnsaved command`)
    assert.equal(task().implementationNotes, implementation)
    await click(byLabel('Open note Architecture', details()))
    assert.ok(details(), 'failed task save blocks task-to-note navigation')
    assert.match(details().textContent, /could not be saved/)
    ui.dom.window.Storage.prototype.setItem = originalSetItem
    await click(byText('Retry save', details()))
    assert.match(task().implementationNotes, /Unsaved command/)

    ui.dom.window.Storage.prototype.setItem = function (key, value) {
      if (key === STORAGE_KEY) throw new Error('Task link write denied')
      originalSetItem.call(this, key, value)
    }
    await click(byText('Create Note', details()))
    assert.equal([...document.querySelectorAll('dialog select')].at(-1).value, a.id)
    assert.equal([...document.querySelectorAll('dialog select')].at(-1).disabled, true)
    await input(document.getElementById('new-note-title'), 'Implementation guide')
    await submit()
    assert.equal(notes().length, 5)
    assert.match([...document.querySelectorAll('dialog')].at(-1).textContent, /was created, but its task link could not be saved/)
    ui.dom.window.Storage.prototype.setItem = originalSetItem
    await click(byText('Retry linking'))
    await waitFor(() => editor())
    assert.equal(notes().length, 5, 'retry does not create a duplicate note')
    const created = notes().find(note => note.title === 'Implementation guide')
    assert.equal(created.projectId, a.id)
    assert.ok(task().linkedNoteIds.includes(created.id))
    assert.equal(document.querySelector('.note-title').value, created.title)
    assert.match(document.querySelector('.note-linked-tasks').textContent, /Ship integration/)
    assert.deepEqual(notes().find(note => note.id === architecture.id).content, richContent, 'unrelated formatting is intact')

    // Restore the full app, then revisit the saved task via its card.
    await ui.mount()
    await click(document.querySelector('.project-nav button'))
    await click(byLabel('Open task Ship integration'))
    assert.match(document.getElementById('task-implementation').value, /Unsaved command/)
    assert.equal(details().querySelectorAll('.task-linked-note').length, 4)
    await click(byText('Done', details()))
    await click(document.querySelectorAll('.project-nav button')[1])
    await click(byLabel('Open task Beta task'))
    await click(byText('Link Note', details()))
    await select(picker().querySelector('select'), 'all')
    await click(picker().querySelector('[aria-label="Link Implementation guide"]'))
    await click(byText('Link 1 note', picker()))
    await click(byLabel('Open note Implementation guide', details()))
    await waitFor(() => editor())
    assert.equal(document.querySelectorAll('.note-backlink').length, 2, 'one note can link to tasks in multiple projects')
    await click(document.querySelector('.note-linked-tasks summary'))
    await click(byLabel('Open task Beta task in Project Beta'))
    assert.match(details().textContent, /Project Beta/)
    await click(byLabel('Open note Implementation guide', details()))
    await waitFor(() => editor())
    await click(byLabel('Delete note'))
    await click(byText('Delete', [...document.querySelectorAll('dialog')].at(-1)))
    assert.equal(notes().length, 4)
    await click(document.querySelector('.project-nav button'))
    await click(byLabel('Open task Ship integration'))
    assert.equal(details().querySelectorAll('.task-linked-note').length, 3, 'deleted references do not render broken cards')
    assert.doesNotMatch(details().textContent, /Implementation guide/)
    await click(byText('Done', details()))
    await click(byLabel('Delete task Ship integration'))
    await click(byText('Delete', [...document.querySelectorAll('dialog')].at(-1)))
    assert.equal(notes().length, 4, 'deleting the task leaves documentation intact')
    await click(document.querySelectorAll('.project-nav button')[1])
    await click(byLabel('Delete project'))
    await click(byText('Delete', [...document.querySelectorAll('dialog')].at(-1)))
    assert.equal(notes().find(note => note.id === beta.id).projectId, null)
    assert.deepEqual(notes().find(note => note.id === architecture.id).content, richContent)
  } finally {
    await ui.close()
  }
})
