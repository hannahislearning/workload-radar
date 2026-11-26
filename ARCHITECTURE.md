# WorkLoad Radar architecture

## UI

`src/App.jsx` routes each role to screens under `src/screens/`. Shared interactions and display components live under `src/components/`. Desktop Heatmap uses the existing interactive contour map, while mobile uses the same selected date with a vertical list. Each marker or list item opens the same native day dialog.

## Review and privacy

`src/lib/extractor.js` produces mock findings. It removes bracketed qualifiers, compares token-set overlap (at least 0.6), and searches the member’s approved tasks and applicable meetings within two days. Review defaults to skipping matches. Kept items need a trimmed name, a valid date, and 0.5–24 hours in half-hour increments. The same approval helper is used by the Inbox and regression tests.

A member’s 120-character snippets stay in component state and are cleared after approval or cancellation. Shared state stores structured findings and metadata, with accuracy calculated from raw **extraction output**, meaning structured fields before human edits. It never stores message text. The manager sees counts and approved work.

## Workload and transfers

`src/lib/store.js` derives load by day from remaining hours, meetings and individual capacity. **Spread** allocates unscheduled work equally across weekdays from the start date or demo day through the deadline, skipping leave. An explicitly scheduled task stays pinned, and a task with no eligible date remains on its deadline so conflicts stay visible. **Deadline day** assigns work to its explicit scheduled day or deadline. Capacity defaults to 8h and June has 6h. Leave has no available capacity.

Risk excludes the task’s own allocation when calculating competing load. Transfer candidates are checked across all days the work would occupy for the recipient. Skill and experience break ties, and the picker previews both workers’ before/after status on the selected day. Only approval changes ownership. Weekly hours and hidden-source totals follow the allocation model.

## Persistence and time

The localStorage key is `workload-radar-v1`; its payload carries `STATE_VERSION = 2`. Missing or incompatible versions reset to the demo. UUIDs identify records. Completion Undo reverses progress and removes the matching log and history entry. The digest clock uses the demo date plus simulated time and delivers reports into the browser’s admin inbox.

There is no backend, real authentication, or mailbox integration. Tests live in `src/lib/*.test.js` and cover status, palette, risk, transfers, duplicate-safe approvals, and results accounting.
