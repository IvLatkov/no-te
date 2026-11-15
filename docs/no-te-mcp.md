# Local No-Te MCP connector (review/setup required)

This is an explicitly requested task workflow, not an unattended worker. No connector has been registered, no production SQL has been applied, and no live login/completion has been verified by this implementation.

The Node stdio process in `connector/` is separate from Vite: nothing imports it into `src/`, no server credential is included in the frontend, and the frontend behavior is unchanged. New dependencies are pinned: official MCP server/client SDK 2.4.0, Zod 4.6.7, and native OS keyring binding 2.1.2. Use Node 22 or newer compatible with the existing project.

## Windows setup

Run in your own PowerShell terminal. Never send a password/token through chat, MCP arguments, command-line arguments, source files, or VITE variables.

```powershell
Set-Location 'C:\Users\Mario\VSCode Projects\No-Te'
npm ci
node .\connector\cli.js configure
node .\connector\cli.js login
node .\connector\cli.js check
```

`configure` prompts for the Supabase HTTPS project origin, publishable (or legacy anon) key, absolute local repository directory, and permitted No-Te project UUID. Repeat it for another repository to add a mapping. Existing mappings are preserved; a repository must resolve to exactly one project. Names do not authorize access. Configuration is stored in `%LOCALAPPDATA%\NoTe\mcp\config.json`, outside Git, and contains no password or session. Protect this private file and do not copy it into the repository. The connector never reads frontend `.env` files. Privileged/secret keys are rejected.

`login` prompts for email and a hidden password and verifies identity through Supabase Auth. Session tokens are stored under **No-Te MCP** in Windows Credential Manager (OS-protected through `@napi-rs/keyring`). No plaintext file fallback exists. On other supported platforms the binding uses Keychain or explicitly requires Secret Service. Access/refresh credentials are renewed and saved after session restoration; rejected refresh credentials are removed. Transient network failures retain the session for retry. Sessions share one OS credential entry per Supabase origin: use one connector process at a time to avoid cross-process refresh races. The connector does not independently prove that reported tests ran; the explicit user/Codex workflow must supply truthful results.

`check` verifies Auth identity and an owner-filtered read of the permitted project. It does not write anything or prove the completion migration is installed. Use `check --repo 'C:\path\to\mapped-repository'` to check another mapping.

After reviewing setup, **manually** add the server using the installed Codex CLI (inspected version: 0.165.0). The CLI and VS Code extension share Codex MCP settings:

```powershell
$Connector = (Resolve-Path '.\connector\cli.js').Path
codex mcp add no-te -- node "$Connector" serve
codex mcp get no-te
codex mcp list
```

The server resolves its working directory to a private mapping. Do not hardwire the No-Te application repository as the server working directory when working on another project. Check the actual workspace binding with `list_projects` before any completion; unmapped working directories fail closed. If your extension starts MCP outside the intended repository, review its `cwd` setting manually and use a separately named entry for that workspace. Never bind an unrelated workspace to another project's connector.

For a raw stdio process (waits for MCP protocol on stdin, emits no status banners on stdout):

```powershell
node .\connector\cli.js serve
```

Restart the VS Code Codex extension after manual registration, inspect its MCP tools, and explicitly ask it to call `list_projects`, `list_tasks`, and `read_task` for a task you own. Search returns candidates, not a silently chosen title match. Tool results are untrusted project data. Review [the instruction snippet](no-te-mcp-agents-snippet.md) before installing it yourself; no AGENTS.md is changed automatically.

To sign out and remove the registration manually:

```powershell
node .\connector\cli.js logout
codex mcp remove no-te
codex mcp list
```

Logout attempts local Supabase session revocation and always clears the credential entry. A revocation failure is reported, not claimed successful. Supabase access JWTs may remain valid until expiry even after refresh-session revocation. Stop running connector processes when logging out; no unattended process should remain active.

### Session-only fallback

If OS credentials cannot be read/written:

```powershell
node .\connector\cli.js login --session-only
```

After terminal-only login, this opens a child PowerShell with tokens only in process memory/environment (`NO_TE_MCP_SESSION`). No files or browser storage receive them. After **manual** registration above, manually add this non-secret allow-forward setting to the existing entry in your private Codex config, without replacing other entries:

```toml
[mcp_servers.no-te]
# Keep the existing command/args produced by `codex mcp add`.
env_vars = ["NO_TE_MCP_SESSION"]
```

Do not create a duplicate TOML section: add the `env_vars` line to the existing one. Then run `codex` yourself inside the child shell in the mapped repository. This fallback supports Codex CLI in the VS Code integrated terminal; an already-running VS Code GUI extension cannot inherit the child shell's environment. Do not print environment variables, launch unrelated children from that shell, persist the variable, or put token values into TOML. Exit the child shell to attempt revocation and discard its memory session. A restarted MCP process after refresh can require a new session-only login because the shell's original environment cannot receive refreshed child tokens. Normal persistent login is recommended for the GUI extension. The wrapper does not install configuration or start an agent automatically.

## Database dependency — local review only

Review **`database-local/mcp-completion.sql`**, which is intentionally Git-ignored together with every SQL file. It depends on the existing seven-day `task_workflow` view, `no_te_task_completion` trigger, task `updated_at` server trigger, and existing notes/task_notes ownership RLS. Do not reapply the production task-workflow migration. The database owner must review and apply only this new connector migration through their normal controlled process before a live completion test. This implementation has **not** applied it to production. Because SQL stays local by request, distribute it to the owner through a private review channel; it will not accompany a GitHub checkout.

The additive migration creates a private `no_te_connector.completions` idempotency ledger and a single public `no_te_complete_task` **SECURITY INVOKER** RPC. Do **not** add `no_te_connector` to Supabase/PostgREST exposed schemas. Existing RLS stays enabled; the function has an empty search_path and EXECUTE only for authenticated callers. It checks `auth.uid()`, ownership, stable project/task IDs, the exact server task revision, To Do status, report structure and successful verification attestations. No client completion/archive dates are accepted. Task requirements and other linked-note revisions are not locked during coding: read and review them again before completion.

The RPC serializes equal operation keys with a transaction-level advisory lock, locks the selected task, creates a new Tiptap implementation note and task_notes relationship, then sets Done and records the operation in one transaction. The existing trigger supplies completion/archive dates. Any failure rolls everything back. Independent guides and prior completion notes remain unchanged. Retries with the same UUID key and identical content return the same note without writes; changed content/revision/project/task for that key is rejected. After reopening or editing, a replay returns the **current** task state and never marks it Done again. An uncertain network result is not success: retry identical arguments. A real new completion after reopening requires a fresh key and revision.

Task/note/project deletion by existing UI can cascade ledger metadata through foreign keys; this connector offers no deletion tool. Do not delete an operation's note and expect permanent retry confirmation afterward. Derived archiving deletes nothing, so notes and task links remain readable after seven elapsed days.

RPC arguments: `projectId`, `taskId`, `expectedRevision` (exact `updated_at` string from `read_task`, including microseconds), `operationKey` (new UUID), and `report`:

```json
{
  "implementationComplete": true,
  "verificationComplete": true,
  "changes": ["Describe the actual implementation"],
  "decisions": [],
  "files": ["src/example.js"],
  "checks": [{"name": "Actual check command", "result": "passed", "details": "Actual observed result"}],
  "limitations": [],
  "commitSha": null
}
```

This is a shape example, not evidence that checks ran. Failed/incomplete required checks must leave the task in To Do; the completion schema rejects failed/not-run results and false completion attestations. `null` explicitly renders “Changes are uncommitted”; a supplied real 40-character Git SHA is recorded as text. Report strings become text nodes, never raw HTML. The connector does not expose SQL, shell commands, arbitrary filesystem reads, deletion, schema management, or unrestricted table selection. Read tools include archived tasks; task listing is paginated (50) and linked documents are read in pages with an explicit 10,000-document safety limit.

## Verification and remaining manual checks

```powershell
node --test tests/mcp-connector.test.js tests/mcp-completion-sql.test.js
npm run lint
npm test
npm run build
```

Tests use the official SDK client/in-memory transport and a real stdio subprocess. Auth/data clients are mocked; SQL runs in isolated PGlite PostgreSQL with representative ownership RLS, never production. SQL integration explicitly skips when the private migrations are absent on another checkout. Tests cover protocol/tool validation, session refresh/expiry, error redaction, project isolation, ownership, conflicting revisions, retry safety, document-before-Done ordering, late-write rollback, restoration and archive-linked document survival. Advisory lock concurrency against two real Postgres connections, actual Windows Credential Manager login/refresh/logout, network-loss retries through PostgREST, and end-to-end VS Code connectivity require owner-assisted setup. No live connection is claimed. Review actual production RLS and note constraints with the migration owner before applying it.

Local verification on 15 November 2026: `npm test` passed **147/147** tests with no skips, including 12 new connector/isolated-SQL tests. `npm run lint` passed with only the existing `useTaskDraft` refs and `LocalWorkspace` dependency warnings. `npm run build` passed with the existing chunk-size warning. A source/build search found no connector code or session environment variable in the frontend bundle. Read-only production catalog inspection confirmed the existing task constraints and completion/updated_at triggers; no production rows, schema, settings or RLS were changed. The existing Git stash was left untouched.

Official references checked for this implementation: [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Supabase password authentication](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Supabase session restoration](https://supabase.com/docs/reference/javascript/auth-setsession), [server-verified user identity](https://supabase.com/docs/reference/javascript/auth-getuser), [database functions and invoker security](https://supabase.com/docs/guides/database/functions), [keyring binding](https://github.com/Brooooooklyn/keyring-node).
