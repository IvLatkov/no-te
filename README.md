# No-Te

A personal workspace for project tasks, implementation notes and searchable documentation, built with React and Supabase.

**[Live website](https://no-te.org/) · [Source](https://github.com/IvLatkov/no-te) · [Companion game project](https://github.com/IvLatkov/wh40k-survivors-prototype)**

The deployed application requires sign-in. Public demo credentials are not provided; the source and screenshot below are available without an account.

![No-Te dashboard showing the project picker, task columns and documentation panel](docs/images/dashboard.png)

*Dashboard captured from a local development build using QA tasks. It shows the project workspace layout; later refinements add archive controls and documentation filters.*

## Why I built it

I wanted one place to keep track of what I planned to build, what actually changed, and why. My website and Godot game were generating tasks, bug reports and implementation notes across different tools. No-Te brings those records together while keeping general documentation independent of individual tasks.

This is also a practical learning project: taking an idea through UI design, a working frontend, authentication, database integration, deployment and repeated testing.

## What it does

- **Projects and tasks:** create projects, add tasks, edit details, and move work between To Do and Done.
- **Completion history:** completed tasks stay in Done for seven days, then appear in a searchable archive. Archiving preserves tasks, notes and relationships; tasks can be restored to To Do.
- **Documentation:** a rich-text editor with autosave, folders, tags, search and task links. All / Task-linked / Independent filters keep reference material and implementation records in one list.
- **Dashboard:** choose a project to see its tasks and notes. The selection persists in the same browser separately for each account.
- **External updates:** while the page is visible, background reads check for changes about every 15 seconds and when returning to the tab or reconnecting. They wait during open edit dialogs, saving and unsaved note changes.
- **Authentication and account separation:** Supabase email/password sign-in, session handling and cloud-backed records scoped to the signed-in user.
- **Backups:** export cloud content and inspect a backup without writing it back into the database.
- **Optional local Codex connector:** five scoped MCP tools read projects/tasks, create a task, and save implementation documentation with completion. It is a local Node process, separate from the website.

## My role and use of AI

I define the requirements, decide which workflows belong in the product, direct implementation, test the behavior and prioritize fixes. I use the application for my own projects and compare the implemented result with the original request.

Development is substantially AI-assisted. I use Codex to generate and revise code, propose tests, investigate failures and help review changes. AI also helped prepare this documentation. I do not present this repository as entirely handwritten code or treat an AI-generated explanation as proof that a feature works.

My work includes reproducing issues, supplying screenshots and error output, checking fixes in the browser, reviewing changes with AI assistance, and managing GitHub, Supabase and Cloudflare setup. Examples include investigating note-editor startup failures, correcting sidebar overlap, verifying persistence after reload, and testing the create-task → linked-documentation → Done workflow end to end.

Useful starting points for a technical conversation:

| Decision | Reason and implementation |
| --- | --- |
| Keep documentation independent of tasks | Reference guides should survive task completion and can be linked to more than one task. See [documentation relationships](src/data/taskDocumentation.js). |
| Archive instead of delete | Seven-day visibility keeps Done useful without losing the reason for a change. The server supplies completion and archive metadata. See [workflow handling](src/data/taskWorkflow.js). |
| Save documentation before completing work | The connector uses a transactional database operation so a completed task has its implementation record. See [connector service](connector/service.js). |
| Persist only a dashboard preference in browser storage | Remembering an account-scoped project ID does not require caching project contents or credentials in a custom store. See [dashboard preference](src/data/dashboardPreference.js). |
| Refresh quietly and protect drafts | External changes should appear without a full-page reload or interrupting unsaved edits. See [refresh coordinator](src/data/cloudRefresh.js). |

## Technologies

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript, CSS, Lucide icons |
| Rich text | Tiptap 3 / ProseMirror |
| Backend | Supabase Auth, PostgreSQL, row-level security and database functions |
| Hosting | Cloudflare Pages, custom domain `no-te.org`, GitHub |
| Verification | Node test runner, jsdom, isolated PostgreSQL tests through PGlite, Oxlint |
| Optional integration | Model Context Protocol, Node.js, Zod, OS credential storage |

## Run locally

Use a recent Node.js version compatible with the lockfile; local validation used Node 24.

```sh
git clone https://github.com/IvLatkov/no-te.git
cd no-te
npm ci
```

Copy `.env.example` to `.env.local` and set your own Supabase project URL and **publishable** key:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
```

Then start Vite and open the URL printed in the terminal:

```sh
npm run dev
```

**Database prerequisite:** this public repository is not a complete Supabase bootstrap. Database SQL, credentials and private configuration are intentionally excluded. A working authenticated workspace needs the matching tables, ownership policies, workflow view and server functions. See [task workflow requirements](docs/task-workflow.md) and [connector setup](docs/no-te-mcp.md). A fresh clone alone does not create that backend or give access to my account.

Only a publishable key belongs in the frontend. Secret/service-role keys, database passwords and connector session credentials must stay out of Git and Vite environment variables. Publishable keys identify the application; database grants and row-level security enforce data access.

For the optional local connector, follow the [MCP setup guide](docs/no-te-mcp.md). Its private repository/project mappings and saved authentication remain outside the repository. It does not run as part of Cloudflare Pages.

## Testing and evidence

```sh
npm test
npm run lint
npm run build
```

**Recorded local validation, 15 November 2026:** 164 tests passed with no skips in the configured development environment. Lint and the production build passed with existing warnings about two React patterns and bundle size. This is a dated result, not a claim that every environment or future commit passes automatically.

The suites cover authentication UI, account isolation, project/task operations, autosave failure recovery, documentation links, archive boundaries, backup validation, dashboard persistence and external updates. See [dashboard behavior tests](tests/dashboard-projects.test.js), [refresh tests](tests/cloud-refresh.test.js), [documentation tests](tests/cloud-documentation.test.js) and [connector creation tests](tests/mcp-task-creation.test.js).

Browser interaction tests use mocked cloud responses. SQL integration tests use isolated PostgreSQL fixtures and require the private migration files; they skip when those files are absent from a public checkout. Neither type alone proves production authorization is correct. Live connector creation, read-back, linked documentation and completion were also manually verified; separate-connection PostgreSQL concurrency remains a further integration check.

## Current progress and limitations

The website is deployed and used as a personal workspace. Core task/documentation workflows and the local connector work; refinement and QA continue.

- There is no public demo account or registration interface.
- Cloud backup restore and automatic import of older browser-only data are not implemented. Legacy browser data remains separate from authenticated cloud records.
- Background synchronization uses polling, not an instant push feed, and pauses while editing or offline.
- Private database setup is not included, so independent deployments need additional backend preparation.
- Broad browser/device coverage, live authorization checks and production monitoring are ongoing work. Existing test results are not a security certification.

See the [workflow guide](docs/task-workflow.md), [MCP guide](docs/no-te-mcp.md) and [historical development notes](docs/development-history.md) for more detail. The historical notes preserve earlier iterations; this README supersedes their older deployment/status statements.

## Ownership and third-party assets

The project currently has no root open-source license. Public visibility should not be read as a blanket grant to reuse all code or assets. App shortcuts use third-party brand icons; their sources and notices are listed in [official app assets](public/apps/SOURCES.md).
