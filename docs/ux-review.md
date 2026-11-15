# UI/UX and accessibility review

**15 November 2026 · source-based review of published commit `abe585cedbef555df360eda48f2a64d42800e66f`, plus the changes in this portfolio branch.**

Scope: application structure, components, styles, workflow helpers, test coverage and existing screenshot documentation. Browser inspection was blocked by this environment's Windows browser URL-policy limitation. The screenshot file exists in the published tree, but its binary contents could not be inspected through the available GitHub connection. This is not a visual audit or WCAG conformance assessment.

## Existing strengths

- Native buttons and dialogs, accessible control names and a skip link provide a useful keyboard foundation. Dialogs have labelled headings, initial focus and restoration ([Modal](../src/components/Modal.jsx)).
- Tasks have explicit movement buttons as an alternative to dragging. Notes can be moved with a folder selector ([TaskCard](../src/components/TaskCard.jsx), [NotesList](../src/components/documentation/NotesList.jsx)).
- The small-screen navigation drawer manages focus, Escape, background interaction and scroll locking ([Sidebar](../src/components/Sidebar.jsx)). Browser and assistive-technology verification remains necessary.
- Save states use text and a status region. Errors use alerts; navigation checks pending saves. State is not conveyed solely through color ([NoteEditor](../src/components/documentation/NoteEditor.jsx)).
- Filter controls and clear-filter actions already exist. The next question is how well users notice and understand their scope, rather than adding more filtering controls.

## Implemented in this review

| Finding from source | Change | Verification and limit |
| --- | --- | --- |
| A dashboard without a selected project renders no project content or explanatory next step. | Conditional guidance and an existing-flow CTA for new and returning users. | Interaction tests cover no projects, unselected projects, loading, errors and selected projects. Layout still needs browser review. |
| Apps closes on outside click but has no Escape handler. | Escape dismissal, focus restoration from inside the disclosure, and deference to active modal dialogs. | Tests cover inside/outside focus and an open dialog. Native browser focus behavior still needs checking. |
| The note body removes its outline and title focus uses a subtle underline. | Explicit `:focus-visible` outlines for both editable fields using the existing accent text token. | Styles reviewed and build checked; clipping, contrast and visibility need rendered verification. |

## Prioritized follow-up

Priorities reflect severity and workflow importance inferred from the code. They are hypotheses to validate, not participant findings. **P1** means before promoting the tool to team use; **P2** is the next usability iteration; **P3** is later refinement. No critical production defect was established by this limited review.

| Priority | Observation or open question | Practical next change | Acceptance check |
| --- | --- | --- | --- |
| P1 | The live application requires private sign-in; reviewers cannot explore the work independently. | Add a separate, read-only sample walkthrough with synthetic records after deciding its scope. Keep real account data and credentials private. | A signed-out reviewer can inspect a task, its linked note and archived history; sample content is clearly labelled and has no production write path. |
| P1 | Failure recovery is central to autosave but currently supported mainly by mocked tests. | Run a browser exercise with offline/reconnect and navigation during a failed save. Improve recovery text or actions based on the result. | A draft remains available, failure is announced, retry succeeds and navigation does not silently discard text. |
| P1 | Focus code exists, but no rendered keyboard or screen-reader audit was completed here. | Check the complete create/edit/search/archive workflow with keyboard and NVDA/Firefox, then a second browser. | No trap; visible focus; clear dialog and control names; focus returns to a useful location after closing. Record actual results. |
| P1 | Text/control colors and target dimensions have not been measured in rendered states. | Measure normal, hover, disabled, selected and error states; check at 200% zoom and narrow widths. | Evaluate WCAG 2.2 AA requirements with their exceptions. Minimum target size is 24×24 CSS px or qualifying spacing/equivalence; consider 44×44 for frequent touch actions. Existing 32px icon buttons are not automatically failures. |
| P2 | Automatic seven-day archiving can be mistaken for deletion. | Explain the rule near Done and clarify archive entry text if sessions show confusion. Consider an initial explanation rather than repeated interruptions. | A new user predicts where an old completed task will be and can restore it. |
| P2 | Dashboard documentation includes both project-assigned notes and linked notes, while global documentation has its own scope. | Test labels and project context before changing the information architecture. | Users can distinguish global, project and task context and find an independent guide with filters active. |
| P2 | Background polling pauses during editing and can leave the view behind external changes. | Explore a quiet last-refreshed/status hint with a safe refresh action. | Users can distinguish a current view, an offline view and refresh delayed by editing; drafts remain intact. |
| P2 | The blank-dashboard CTA follows the existing Projects page before the creation dialog. | Observe the two-step route and compare direct creation only if the intermediate step causes friction. | First-time users create a project without coaching; errors return them to a recoverable state. |
| P2 | The dark palette is consistent, but comfort over long sessions is untested. | Test readability, density and zoom with actual users before adding theme options. | Participants can scan task names, timestamps and save feedback comfortably; long names and content remain usable. |
| P3 | Shared components exist without a compact state inventory. | Document button, input, dialog, empty, loading, error, saving and read-only states with verified captures. | Each pattern has usage guidance, keyboard behavior and recovery copy; no unsupported claim of a complete design system. |
| P3 | The build reports a large initial bundle. | Profile loading on a constrained connection and inspect lazy-loading boundaries before splitting dependencies. | Record first-load and open-editor timings, then compare after any optimization. |

## Browser checks still to run

Use synthetic content and cover desktop plus 320px, 390px, 768px and the navigation breakpoint around 1100px. Check long titles, empty lists, large lists, no results, expired sessions, offline saves and reconnects. Include 200% zoom, high contrast/forced colors and reduced motion. Verify the new editor outline is not clipped by its container and the empty-state button fits narrow screens.

Use an automated accessibility scanner to find likely issues, then manually verify names, reading order, focus and recovery. Automated scans and jsdom tests cannot prove WCAG compliance or real-device usability.

## Reference criteria

- [W3C: Focus Visible, SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [W3C: Target Size (Minimum), SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

These references guide follow-up checks; they are not a conformance claim.
