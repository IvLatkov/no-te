# No-Te

A minimalist React + Vite workspace for project notes and tasks.

## Development

```sh
npm install
npm run dev
npm run build
npm test
```

## Projects and tasks

Open **Projects** to create a project with a name and optional description. Project
cards and **YOUR PROJECTS** in the sidebar open the project's board. Use the edit
and delete controls on a project card or in the project workspace to manage it.
Deleting a project requires confirmation and also deletes its tasks.
Its documentation notes are preserved and become unassigned.

Add tasks to **To Do**, edit their title and description, and move them between
**To Do** and **Done** using native desktop drag-and-drop or each task's move
button. The move button also works with a keyboard or on touch devices. Task
deletion requires confirmation.

Click a task card to open **Task details**. Title, description, status, and plain
text **Implementation Notes** save automatically on each valid edit. Details
include the project and task timestamps. If saving fails, the draft remains open;
retry before closing or following a documentation link. An empty title also blocks
leaving the details so it cannot silently discard other draft fields.

Use **Link Note** to search and select multiple notes. The picker starts with the
current project's notes and can include other projects or unassigned notes.
Already linked notes cannot be linked again. **Create Note** reuses the existing
note creation dialog, assigns the task's project, links it, and opens the editor.
If note creation succeeds but saving its task link fails, retrying links the same
note instead of creating another. Closing that recovery dialog leaves the created
note in Documentation, where it can be linked later.

Linked-note cards open their note in Documentation. The editor's collapsed
**Linked Tasks** section shows backlinks with project and status; clicking a
backlink returns to that project's board with the correct task details open.

## Documentation and notes

Open **Documentation** for a searchable notes list and a Tiptap rich-text editor.
Create a note with an optional project, rename it directly in the title field,
and use the toolbar for headings, bold/italic/strikethrough, lists, checklists,
quotes, code blocks, links, dividers, undo, and redo. Duplicate and delete controls
are at the top of the editor; deleting a note requires confirmation.

The list searches titles and rich-text content, filters by project or unassigned
notes, and sorts by modification date or title. Every project workspace also has
a **Documentation** tab with project-specific notes and project-associated note
creation. The editor's project selector can reassign any note.

On desktop the workspace uses the existing navigation, a notes list, and the
editor. The navigation collapses on tablets. On mobile, selecting a note opens
the editor full-screen; **All notes** returns to the list.

## Data

`src/data/projects.js` contains reusable data operations and the localStorage
adapter. `src/hooks/useProjects.js` coordinates state, saving, and storage errors.
Projects contain their own tasks; IDs use `crypto.randomUUID()`.

Tasks now also store `linkedNoteIds`, `implementationNotes`, `createdAt`, and
`updatedAt`. Legacy tasks receive safe defaults on load and are persisted in the
existing project key on the next write. Unknown legacy creation times display as
**Not recorded (older task)** rather than an invented date. Note content remains
only in note records. Task deletion and unlinking never delete documentation;
references to deleted notes are safely ignored. Backlinks are derived from task
IDs, so there is no second relationship list to keep synchronized.

`src/data/taskDocumentation.js` contains relationship queries and create/link
coordination. `src/hooks/useTaskDraft.js` retains failed/invalid task drafts while
`src/hooks/useProjects.js` saves against the latest committed project snapshot,
including multiple changes made during one UI event. Both storage keys remain
unchanged.

Changes are saved to `no-te.projects.v1` before being committed to the UI. A failed
save displays an error and keeps forms open for retry. Unreadable saved data is
preserved and editing is disabled until the storage issue is resolved and the app
is reloaded.

Notes use their own `no-te.notes.v1` key and do not change the projects/tasks data
format. `src/data/notes.js` provides persistence and reusable note operations;
`src/data/notesStore.js` owns draft snapshots and the 500 ms autosave debounce;
`src/hooks/useNotes.js` connects the store to React and page lifecycle events.
Note content is Tiptap JSON, with UUIDs, nullable project IDs, and creation/edit
timestamps. Stale timer callbacks cannot overwrite newer drafts or recreate
deleted notes.

Switching notes, navigating away, hiding the page, and normal refresh/close
attempts flush drafts immediately. Failed writes retain the draft and display a
retry action; internal navigation is blocked until pending changes save. Read
errors preserve saved data and disable note editing. Abrupt browser termination
can still lose the last unsaved debounce interval.

Project deletion flushes note drafts first. Missing project associations are
reconciled to unassigned notes, including on app load. If saving the reassignment
fails after a project deletion, the notes remain present, appear unassigned in
memory, and reconciliation retries after refresh. Notes are never cascade-deleted.

Data belongs to the current browser profile and origin. There is no account sync,
multi-tab conflict handling, backend, or recovery after confirmed deletion.
Clearing browser storage removes saved projects. Navigation returns to Dashboard
after refresh; open Projects or use the sidebar to return to a saved board.

## Verification

`npm test` covers project/task creation, editing, deletion, moving in both
directions, unique IDs, project isolation, persistence round trips, and invalid or
unavailable storage. `npm run build` validates the production bundle.

The notes tests cover CRUD, rich JSON round trips, search/sorting, debounce races,
failed-save retry, and preservation after project deletion. A React integration
test in jsdom exercises forms, toolbar formatting, actual Tiptap checklist
checkboxes, undo/redo, links, project scopes, and remount persistence. jsdom is a
development-only dependency. Its dialog and layout adapters do not verify native
browser focus traps, responsive appearance, or mobile viewport behavior.

Task/documentation tests cover legacy defaults, relationship deduplication,
unlinking, missing references, timestamps, multiline implementation notes, and
idempotent partial-failure recovery. A second React integration test covers task
details, native drag event handlers, many-to-many linking, task-to-note-to-task
navigation, save-failure retention/retry, creation from tasks, application remount,
and deletion safety. Native pointer dragging and dialog stacking still need a
real-browser check.

Browser verification checklist:

- Create two projects, edit a name/description, and open each from its card and sidebar.
- Add tasks, edit both fields, and move them with the buttons in both directions.
- Drag a task from To Do to Done and back; check the column counts, including an empty column.
- Refresh, reopen the project, and check that edits and task statuses persist.
- Cancel deletion once, then confirm a task deletion and a project deletion; refresh to check removal.
- Check the mobile menu and stacked columns, form keyboard focus, and Escape to close dialogs.
- Create global and project notes; rename, format, duplicate, and delete them.
- Search note content, change project filters, and test both sort options.
- Edit and immediately switch notes, navigate away, or refresh; verify the latest draft persists.
- Delete a project and verify its notes remain under Unassigned, with content intact.
- On tablet check the collapsible sidebar; on mobile open a note and return with All notes.
- Open task details, link several notes, and verify already linked notes are disabled in the picker.
- Edit Implementation Notes and follow a linked note; expand Linked Tasks and return to the original task.
- Create a note from task details and verify its project, link, and editor selection.
- Refresh and verify task details; delete a linked note, then reopen its tasks without broken cards.
- On mobile check task detail scrolling, nested note dialogs, and the full-screen note editor.

Automated browser verification was unavailable in the implementation session:
the available Windows browser was blocked by the computer-use URL policy tooling.
