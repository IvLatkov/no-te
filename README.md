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

Add tasks to **To Do**, edit their title and description, and move them between
**To Do** and **Done** using native desktop drag-and-drop or each task's move
button. The move button also works with a keyboard or on touch devices. Task
deletion requires confirmation.

## Data

`src/data/projects.js` contains reusable data operations and the localStorage
adapter. `src/hooks/useProjects.js` coordinates state, saving, and storage errors.
Projects contain their own tasks; IDs use `crypto.randomUUID()`.

Changes are saved to `no-te.projects.v1` before being committed to the UI. A failed
save displays an error and keeps forms open for retry. Unreadable saved data is
preserved and editing is disabled until the storage issue is resolved and the app
is reloaded.

Data belongs to the current browser profile and origin. There is no account sync,
multi-tab conflict handling, backend, or recovery after confirmed deletion.
Clearing browser storage removes saved projects. Navigation returns to Dashboard
after refresh; open Projects or use the sidebar to return to a saved board.

## Verification

`npm test` covers project/task creation, editing, deletion, moving in both
directions, unique IDs, project isolation, persistence round trips, and invalid or
unavailable storage. `npm run build` validates the production bundle.

Browser verification checklist:

- Create two projects, edit a name/description, and open each from its card and sidebar.
- Add tasks, edit both fields, and move them with the buttons in both directions.
- Drag a task from To Do to Done and back; check the column counts, including an empty column.
- Refresh, reopen the project, and check that edits and task statuses persist.
- Cancel deletion once, then confirm a task deletion and a project deletion; refresh to check removal.
- Check the mobile menu and stacked columns, form keyboard focus, and Escape to close dialogs.

Automated browser verification was unavailable in the implementation session:
the available Windows browser was blocked by the computer-use URL policy tooling.
