# No-Te frontend 6.4 / 6.4.1

This release adds authorized cloud-content export and read-only export preview, improves save/account lifecycle handling, and preserves legacy browser-only data separately from authenticated cloud content.

The editor startup fix skips disposed Tiptap instances before synchronization. A stale instance's cleared schema no longer causes supported notes to be marked invalid. Unsupported-content safeguards remain intact. Tests cover replacement of disposed instances and blank notes under StrictMode.

Validation: 111 application tests passed; lint and build passed with existing warnings. Single-account browser checks covered saving/reloading, task/note links, formatting, nested folders, tags, drag/drop, search and export/preview. The startup fix passed cold-reload, editing and autosave checks.

Limits: complete backup recovery, actual two-account enforcement and populated concurrent editing remain unverified/deferred. No public deployment occurs as part of this release.

Database migrations, live inventories, raw captures, account-related QA evidence, exports and internal rollout documents are excluded from this code-only upload and need separate approval. The app's existing connected database is not changed by a GitHub push.

Use only publishable configuration in the frontend; never commit private environment files, service-role keys or database passwords.
