# Task completion and archive setup

## Production migration — applied and verified

The production migration was applied and verified on **15 November 2026**.
**Do not reapply it.** The completed database setup supports this frontend release.

The reviewed migration at `database-local/task-workflow.sql` remains local-only
for reference and isolated testing. It is not distributed with this repository.
For a new non-production environment, have its database owner review the local
copy before applying it. The transaction requests a PostgREST schema-cache
refresh. Do not copy database files into `public`, `src`, a frontend bundle or a
Git commit. No production migration is run by the frontend, build or tests.

The migration adds these nullable `public.tasks` columns:

- `completed_at`: the actual server-recorded transition from To Do to Done.
- `archive_grace_started_at`: only for existing Done tasks whose completion time
  is unknown; it is deliberately distinct from a completion timestamp.
- `archives_at`: exactly 168 elapsed hours after completion or grace start.

It adds `public.no_te_task_completion()` and its BEFORE INSERT/UPDATE trigger,
the `no_te_task_completion_check` constraint, and the read-only
`public.task_workflow` view. The view is `security_invoker = true`, preserves
existing table RLS, and is selectable only by `authenticated`. No policies,
existing validation triggers, task/note IDs, relationships or status values are
replaced. The new trigger also rejects identity/project reassignment and checks
the authenticated project owner. New tasks must start in To Do.

Missing columns/view produce an actionable setup message and disable cloud task
mutations. Existing documentation remains accessible; task-link classification
is unavailable until task data can be loaded. Do not dismiss a setup error by
loosening RLS or exposing privileged credentials.

## Observed schema and local verification

Read-only inspection of the linked project's catalog confirmed PostgreSQL 17,
`task_status_check` allowing only `todo`/`done`, the existing project ownership
policies, the task-note composite key and foreign keys, and
`no_te_updated_at_641`. RLS was inspected separately on the related public tables.
Repository inspection was read-only and SQL tests used an isolated in-memory
database. The production migration was applied and verified separately as noted
above; publishing this frontend does not run it again.

`npm test` includes `tests/task-workflow-sql.test.js`, using the development-only
PGlite dependency to run actual PostgreSQL trigger/view/RLS tests in memory. It
checks completion, protected dates, reopening, recompletion, exact expiry,
historical grace, ownership and preservation of related records. It does not
connect to Supabase. Its fixture clock setup must never be run on production.

Database files are intentionally excluded by `.gitignore`: `database-local/`,
SQL scripts and database dumps. The SQL integration test explicitly skips on
another checkout unless its reviewer supplies the local migration file. Preserve
your separately reviewed local copy; no migration is distributed through GitHub.
JavaScript model/UI tests still run without that file.

## Behaviour

Archive is a derived view, **not a third status or deletion**. A Done task becomes
archived when PostgreSQL's request time is at or after `archives_at`. That works
with every browser closed and across devices, without Cron or a background job.
Archived tasks remain loaded for archive search, global search, details and
task-note backlinks. Active Done counts omit them. Search labels them Archived.

Editing a Done task, including submitting the same Done status, preserves its
completion and archive deadline. Restore to To Do clears all three dates. A later
Done transition receives a new server-controlled date and seven-day period.
Manual completion never requires a note.

On the first migration, historical Done tasks get a **seven-day grace period
starting at migration time**. Their `completed_at` stays NULL. Re-running the
migration does not restart their grace. Details explain the historical grace.
The metadata backfill passes through the existing server updated-at trigger, so
affected records' `updated_at` may reflect this metadata update.

The app uses server-derived archive flags and seconds remaining. Browser timers
only request another server read at a label/deadline boundary; they never decide
archive state from a device date. Focus/visibility also refresh server data. If a
refresh fails, data is retained, marked potentially stale and editing is blocked
until reload succeeds. Network latency/background-tab scheduling may delay an
open screen's refresh; the next successful server read is authoritative.

Documentation has one list with All, Task-linked and Independent filters. A link
to **any existing task, including archived tasks**, makes a note Task-linked.
Multiple links never duplicate a note. A project-scoped list includes notes owned
by that project plus notes linked to its tasks, without changing note projects.
Backlinks show task titles and archive state and open existing task details.

Cloud backups retain all three stored completion fields in format version 1 as
additive optional fields. Old version-1 files without those fields still preview;
new metadata must contain valid dates and the exact seven-day relationship.
Export includes archived tasks and all relationships. Computed archive flags are
not exported as durable database values. Cloud import remains preview-only; a
future restore must deliberately preserve trusted metadata server-side rather
than bypass the completion trigger through normal task APIs.

The quarantined browser-only legacy workspace stays offline and is not migrated.
Its data/backups preserve optional archive metadata, but it cannot fabricate
server completion times or automatically archive old local Done records. Those
show “Completion date not recorded” until a deliberate cloud migration exists.

## Manual checks before release

1. Production setup was completed on 15 November 2026; do not reapply it. For
   future schema testing, use an isolated non-production project and verify both
   account owners and a foreign account through the real Data API.
2. Complete a task, edit it, reopen and complete it again. Verify server dates.
   Use an isolated fixture to test expiry; do not edit production clocks/dates.
3. Check dashboard/board archive counts, archive search, restore failure/retry,
   global search and task-to-note navigation. Confirm linked notes stay editable.
4. Export a backup and preview it; verify dates and task-note/tag links survive.
5. Visually check 375, 768, 984, 1024 and 1440px widths, sidebar drawer, scrolling,
   keyboard navigation, archive dialogs and note/task windows. The available
   Windows browser automation previously blocked rendered verification because
   its URL-policy enforcement was unavailable; DOM/state tests are not pixel QA.

## Reference documentation

- [Supabase RLS and invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security#views)
- [PostgreSQL time functions and elapsed intervals](https://www.postgresql.org/docs/current/functions-datetime.html)
- [PGlite isolated PostgreSQL](https://pglite.dev/docs/)
