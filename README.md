# No-Te

A minimalist React + Vite workspace for project notes and tasks.

## Development

```sh
npm install
npm run dev
npm run build
npm test
```

## Supabase authentication — iteration 6.3A

The production entry now requires a Supabase email/password session. Copy
`.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` using your project URL and **publishable**
(`sb_publishable_...`) API key. Restart Vite after environment changes.
`.env.local` is Git-ignored. Never put secret/service-role keys or database
credentials in any Vite environment variable; Vite's public variables are bundled
into the frontend. Production hosting needs the same public variables at build time.

Create/confirm the private account through your Supabase dashboard. No registration,
password reset, or account creation UI is provided. If you want registration
disabled at the service level too, verify that setting in Supabase Auth; hiding
registration in the UI alone does not change server settings. This iteration does
not change your database, policies, triggers, or Auth dashboard configuration.

The client persists and refreshes Auth sessions using Supabase's own storage key.
The centralized AuthProvider restores sessions and verifies identity using
`auth.getUser()` before rendering the account shell. Auth events, account switches,
logout, and token expiry hide or reset account UI. Signing out affects the current
browser session (`scope: 'local'`); it does not clear legacy No-Te storage or sign
out other devices. Network errors are shown with retry options.

Settings shows the signed-in email. **Test connection** calls Auth `getUser()` and
then performs `schema('public').from('projects').select('id').limit(1)`. Empty
results still show **Connected**. Authentication, network, permission, configuration,
and other request failures receive safe messages without raw server details or
tokens. A successful empty result proves the API request succeeded, not that RLS
would allow every row; RLS can legitimately filter all rows.

### Legacy data quarantine

Existing projects, tasks, notes, folders, tags, relationships, and backups are
local-only, with no verified account owner. They must not become visible to the
next account that signs in on this browser. Consequently, the production account
shell does **not** mount any legacy data hooks, searches, editors, or backup tools.
Projects now displays only Supabase projects and tasks. Documentation continues
to display a quarantine notice instead of browser records. No legacy data is
uploaded, merged, assigned an owner, or reset.

The former App implementation is preserved unchanged as `src/LocalWorkspace.jsx`,
along with all storage utilities, board/editor components and backup features.
It is not reachable through a production route or opt-out flag. Its existing
regression tests continue to run against that component. Reconnecting these
features to account data, including safe backup access, requires the deliberate
migration/data-layer iteration. The following earlier feature documentation
describes this retained local workspace. The current cloud subset is described below.

### Verification for authentication

`npm test` includes mocked Supabase UI tests for login errors, successful login,
session remount restoration, logout and logout failure, account switching,
expiration, missing configuration, connection failures, zero-row SELECT success,
and exact legacy-storage preservation. These tests do not contact a real project.

Manual checks with your real Supabase project are still required:

- Sign in with the private account; try incorrect credentials and an offline request.
- Refresh and reopen the browser to verify actual SDK token persistence/refresh.
- Open Settings, confirm your email, and test an empty `public.projects` table.
- Verify the real project's grants/RLS permit the intended SELECT; zero rows can
  also mean RLS filtered them. Do not insert test records just for this check.
- Test network/permission failures, retry, sign out, expired sessions, and another
  account in the same browser. No legacy titles or content should appear.
- Check desktop/mobile navigation, keyboard focus, login form and Settings layout.

## Cloud Projects and Tasks — iteration 6.3B

Authenticated Projects uses the existing cards, sidebar, project workspace,
To Do/Done board, dialogs, filters and native drag/drop handlers. Create or edit
a project, open it from the sidebar, then add tasks. Editing a cloud task supports
title, description, status, Implementation Notes and server timestamps. Cloud task
details use an explicit **Save task** button; they do not reuse the synchronous
local autosave hook for network requests. Deletions require confirmation.

`supabaseProjects.js` and `supabaseTasks.js` are the cloud data boundary. All calls
verify the current Auth user against the mounted account. Project SELECTs and
mutations are scoped by that verified user ID, task mutations verify an owned
existing parent, and all operations still rely on server RLS. INSERT/UPDATE
payloads use whitelists; caller-supplied owners, IDs, timestamps, foreign-key
changes, tags and note links are never spread into writes. Projects omit `user_id`
so the database must supply the authenticated owner. Task inserts explicitly set
the selected owned `project_id`. Only `todo` and `done` statuses are accepted.

Queries use the documented snake_case columns and map to the existing UI's
camelCase fields. SELECTs are paged with stable created_at/id ordering and exact
counts; task project-ID lists are batched. INSERT/UPDATE return server rows;
DELETE returns the affected ID so an RLS-filtered zero-row mutation is not reported
as success. Project deletion issues only a projects DELETE, relying on the existing
task ON DELETE CASCADE and note ON DELETE SET NULL relationships. It never sends
a notes DELETE. No tables, triggers, grants or policies are changed by the app.

`cloudProjectsStore.js` keeps account-specific data in memory and refreshes after
successful writes. It serializes writes, rejects overlapping submissions, cancels
requests on unmount, discards out-of-date responses and clears cached records on
sign-out. A write acknowledged by the server remains successful even if the
following refresh fails, avoiding an automatic duplicate INSERT retry. Unknown
network outcomes require a reload before retrying. There is no cloud localStorage
cache, offline write queue or automatic legacy migration. Use **Refresh projects**
for changes made in another tab; realtime sync is not implemented.

Tags, linked documentation, folders, global search and cloud backups are not
integrated yet. The board hides tag filters; the task dialog and Documentation
view explain the limitation. Existing task_notes/task_tags/note_tags rows are
never read, reset or replaced by edits. The legacy workspace retains its full
features and storage format for the explicit migration iteration.

### Database setup and diagnostics

Use the existing URL/publishable-key setup above. The database must supply UUIDs,
timestamps, updated_at behavior and the project owner default. Missing columns,
missing ownership defaults, validation errors, blocked relationships and denied
operations are displayed with safe, actionable messages. No live schema mismatch
was established by the mocked tests, and no SQL has been executed.

If project creation specifically reports PostgreSQL `23502` for `user_id`, ask
the database administrator to verify the column default. The following is the
recommended change **only if that default is missing**, for manual review/execution:

```sql
alter table public.projects alter column user_id set default auth.uid();
```

This does not replace an INSERT policy enforcing `user_id = auth.uid()`. Do not
disable RLS or add broad allow policies to make a failed request succeed. For
permission/foreign-key errors, inspect the reported operation/table and existing
grants, policies or constraints before deciding on a targeted SQL correction.

### Cloud verification

Automated tests use a fluent Supabase test double and the production React entry.
They cover project/task CRUD, task notes/statuses, both movement directions,
drag events, server-field mapping, paged reads, whitelist protection, empty states,
denied operations, ownership checks, network/schema errors, retry, persistence
across component remounts, stale reads, in-flight logout and account separation.
They assert that legacy storage remains byte-for-byte unchanged. The harness
disables `.env.local` loading, so tests never initialize a real configured client.
The mock's RLS-shaped behavior is not proof of your deployed policies.

Manual checks with the real database and two separate test accounts are required:

1. As account A, create a project and tasks, edit all supported fields, move tasks
   using buttons and pointer dragging, refresh, sign out and back in. Confirm the
   server records persist and timestamps behave as intended.
2. In a separate browser profile, sign in as B. A's project and task IDs must be
   absent from B's SELECT results. Using B's regular publishable-key/Auth client,
   directly attempt UPDATE/DELETE against A's project, task INSERT with A's
   project_id, and task UPDATE/DELETE against A's task. Require an error or zero
   affected rows; verify A's records remain unchanged. Also test a direct project
   INSERT/UPDATE specifying A's user_id to confirm server policies prevent spoofing.
   Test fixtures should be disposable; the normal UI does not expose these fields.
3. With a signed-out publishable client, attempt SELECT/INSERT/UPDATE/DELETE on
   both tables. Private rows must remain unreadable and unwritable. Dashboard SQL
   executed as postgres/service_role is not a valid RLS test.
4. As A, delete a disposable project with tasks and an existing linked cloud note.
   Confirm task cascade, note preservation/project_id NULL and intended junction
   cleanup. The UI intentionally cannot create note/tag relationships yet.
5. Interrupt a request, retry loading, and sign out/switch accounts during a load.
   Check that no previous account or legacy browser content appears. Compare
   existing localStorage data before and after, without clearing browser storage.
6. Check mobile navigation/stacked columns, keyboard dialogs and native pointer
   dragging in an actual browser; jsdom only verifies the React drag handlers.

## Projects and tasks (preserved local workspace)

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

## Search and organization

Click the header search field or press **Ctrl+K** (Windows/Linux) or **Cmd+K**
(macOS). Search groups projects, tasks, and documentation, including task
implementation notes, rich-text note content, and assigned tag names. Use the
arrow keys and Enter to open a result; Escape closes search and restores focus.
Results highlight plain text without rendering HTML. Search is local, debounced
by 150 ms, and uses a memoized index; it does not modify stored content.

The shortcut leaves text inputs, Tiptap editing, and other dialogs alone. Explicit
search buttons are available inside task details and the full-screen note editor;
task details save their draft before opening search. Result navigation flushes
pending note edits, preserving the existing navigation and save-error behavior.

The Documentation folder tree supports creation, renaming, expansion/collapse,
and up to three levels. Select a folder to filter its direct notes; select
**Unfiled** for notes without folders. The selected folder's actions create a
subfolder, rename it, or delete its subtree after confirmation. All notes from a
deleted subtree move to its nearest surviving parent (or Unfiled at the top level)
without changing content or project ownership.

Subfolders inherit their parent's project. General folders can hold notes from
any project; project-specific folders accept only notes of that project. The note
editor's folder selector moves notes. Changing a note's project while it remains
in an incompatible folder is rejected with an explanation: move it to Unfiled or
a general folder first. Deleted projects leave their folders general and their
notes unassigned. Folder expansion state is local to the current workspace view.

Expand **Tags** inside task details or the note editor to assign multiple tags or
open **Manage tags**. Tags can be created, renamed, recolored from a small palette,
and deleted with reference cleanup. Removing a tag assignment leaves the reusable
tag intact. Task cards show at most two badges, followed by a remaining-count
indicator. Tag filters require every selected tag and combine with other filters.

Boards support task-title search, tag filters, and board-order/alphabetical/
creation-date/update-date sorting. Views do not reorder stored tasks or change
statuses; drag-and-drop and move buttons still move filtered tasks between To Do
and Done. Newest dates come first, with unknown legacy dates last. Documentation
combines project, direct folder/Unfiled, tag, and text filters with title or
recently-modified sorting. Clear-filter actions recover an empty view.

## Data

### JSON Backup & Restore

**Settings → Data Management** exports a local JSON file and imports one only
after validation, a count/date/version preview, and a separate replacement
confirmation. Selecting a file, discarding its preview, or cancelling confirmation
does not change workspace data. No upload, authentication, or backend is involved.
Filenames use UTC: `no-te-backup-YYYY-MM-DD-HH-mm.json`.

The current envelope is:

```json
{
  "format": "no-te-backup",
  "backupVersion": 1,
  "schemaVersion": 1,
  "exportedAt": "2026-11-12T12:34:00.000Z",
  "data": {
    "projects": [],
    "notes": [],
    "organization": { "version": 1, "folders": [], "tags": [] }
  }
}
```

Tasks stay nested under projects. Notes retain their complete Tiptap JSON, IDs,
timestamps, project/folder/tag associations, and task links. JSON-safe unknown
fields inside supported records and organization data are preserved. Export reads
only the three supported user-data keys; it does not mutate live state or include
UI state, caches, recovery records, or unrelated browser keys. Known credential
metadata fields (such as `apiKey`, `accessToken`, and `password`) are excluded and
disclosed as warnings. User-authored note/task free text is preserved in full;
the export is not a secret scanner or an encrypted archive.

Format **1** supports data schemas **0 and 1**. Schema 0 is an explicit legacy
compatibility profile with optional flat `folders`/`tags`; import migrates it into
the organization envelope in memory. Older records receive missing additive
fields without changing IDs or inventing task creation timestamps. Future format,
data-schema, or organization versions are rejected. Unsupported root collections
are rejected rather than silently dropped.

`src/data/backupValidation.js` checks types, collection/task ID uniqueness, valid
timestamps, statuses, palette colors, tag/project/folder references, folder depth
and cycles, and folder/project compatibility. Rich-text content is checked using
safe JSON traversal and the actual Tiptap/ProseMirror schema, with unsafe links and
unsupported formatting rejected; imported HTML is never rendered. Existing
inactive links to deleted notes are deliberately retained with a preview warning,
matching Iteration 4's relationship semantics. Dangerous object keys and excessive
nesting/complexity are rejected. Import defaults to **10 MB**, configured by
`MAX_BACKUP_BYTES`; the parser/file-reader also accepts a `maxBytes` option.

`src/data/backup.js` coordinates a synchronous, journaled replacement through the
existing persistence adapters:

1. Validate/migrate in memory, then flush and retire the current notes store.
2. Capture exact original values (including missing or unreadable old records) in
   `no-te.restore-recovery.v1`, write it, and verify its read-back.
3. Advance `no-te.data-revision.v1` to fence stale writers, stage the incoming
   snapshot in `no-te.restore-preflight.v1` to check storage capacity, verify it,
   and remove the temporary stage.
4. Write the existing three user-data keys, read them back byte-for-byte, run the
   real application readers, and validate restored relationships again.
5. Clear the recovery journal, then recreate all React data hooks and UI state.
   Browser reload is not used as the stale-write protection mechanism.

Failure attempts rollback of every original key and reports whether the original
values were verified. Failure before live writes leaves the existing dataset
unreplaced. If rollback or cleanup cannot complete, the journal remains and
Settings pauses editing, export, and further replacement until **Recover previous
data** is explicitly confirmed. Invalid/unreadable recovery records are preserved
and require storage access or manual record repair; the app never clears them
automatically. Recovery snapshots and import staging are temporary local safety
records, not permanent saved backup files.

localStorage has no multi-key transaction. Recovery/preflight need additional
free space, and persistent storage errors can prevent rollback; a retained journal
allows retry after the problem is fixed. Close other No-Te tabs before restoring.
Revision checks and storage events stop stale autosaves in updated tabs, but do
not provide general concurrent-edit conflict resolution or make external browser
storage edits atomic. These safeguards cannot survive clearing all browser data.

### Workspace storage

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

Iteration 5 adds `no-te.organization.v1` with a versioned `{ version, folders,
tags }` envelope. Folders store UUIDs, names, nullable parent/project IDs, and
timestamps; tags store UUIDs, names, and palette colors. Tasks and notes store
`tagIds`, while notes also store nullable `folderId`. Older records receive empty
tag lists and an Unfiled default in memory, without rewriting storage on read.
Existing IDs, rich-text JSON, and storage keys remain intact.

`src/data/organization.js` contains validation, folder/tag operations, cleanup,
and filter functions. `src/hooks/useOrganization.js` saves validated organization
changes before publishing them. `src/data/search.js` creates a read-only index.
Malformed organization data is preserved with editing disabled and an error.

Folder deletion saves relocated notes before deleting folder records. Tag deletion
cleans project/task and note references before removing the tag. These operations
span localStorage keys and are not atomic: on a write failure, a retained folder
may already have relocated notes, or a retained tag may already be removed from
some items. The operation stays retryable and never deletes item content. Quota
errors retain forms or drafts; no reset or replacement dataset is written.

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
ordinary multi-tab conflict resolution, backend, or per-item undo after confirmed
deletion. A prior backup can restore the full workspace, including deleted items.
Clearing browser storage removes saved projects. Navigation returns to Dashboard
after refresh; open Projects or use the sidebar to return to a saved board.

## Verification

Backup tests cover collection/metadata/unknown-field preservation, filenames,
credential exclusions, pure preview, schema migration, strict JSON/content and
relationship validation, file limits, quota failures, partial writes, verification
failures, recovery creation/cleanup, rollback/recovery, and stale debounced or
cross-tab writers. React/jsdom tests exercise file selection, local Blob download,
preview/cancellation, confirmed replacement, fresh hooks, recovery UI, restored
editing/navigation/search/relationships, and cross-tab revision handling. Native
file/save dialogs and real-browser visual appearance still require manual checks.

Iteration 5 adds model tests for safe defaults, folder CRUD/depth/cycles/project
compatibility, subtree deletion, tags and reference cleanup, combined filters,
search coverage, and malformed storage. React/jsdom tests cover palette keyboard
navigation and focus, search-result navigation, HTML escaping, folder/tag controls,
filtered drag event handling, remount persistence, and quota-error retries. They
preserve previous iterations' regression coverage.

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
