# Architecture — how a request flows

WorkLoad Radar is a single-page React app. There is **no backend** in the
prototype: the "server" role (AI extraction) is a simulated module, and the
"storage" role is the browser's `localStorage`. Below, each layer is explained
with the actual file that implements it.

## The three layers

```
┌───────────────────────────────┐
│ UI  (src/App.jsx + index.css) │  screens, clicks, forms
└──────────────┬────────────────┘
               │ function calls (not HTTP)
┌──────────────▼────────────────┐
│ Logic                         │
│  src/lib/extractor.js  ← the "server-side AI call" seam          │
│  src/lib/store.js      ← all workload maths + state container        │
└──────────────┬────────────────┘
               │ read/write
┌──────────────▼────────────────┐
│ Storage: browser localStorage │  key "workload-radar-v1"
│ + src/data/samples.js (seed)  │
└───────────────────────────────┘
```

## Example flow: Kumar uploads his messages

1. **Screen.** Kumar clicks "Upload & let AI read 12 messages".
   `UploadTab` in `src/App.jsx` (the `run()` function) collects the message
   list from `MEMBER_UPLOADS` in `src/data/samples.js`.

2. **"Server" call.** `run()` awaits `extractTasks(messages, faultMode, onProgress)`
   from `src/lib/extractor.js`. In a real product this module would be replaced
   by `fetch('/api/extract')` — a server route that holds the AI API key in an
   environment variable and returns only extracted fields. The simulation keeps
   the same shape: per-message `{ messageId, tasks[], error? }`, simulated
   latency, and two fault modes (timeout, bad JSON) exercised through the UI.

3. **Privacy discard.** The raw `msg.text` from `samples.js` is used only
   inside the extractor. `run()` stores just the results — `src/App.jsx`
   comments mark the discard point. The manager never sees message text.

4. **Review.** The results render as editable cards in `UploadTab`'s review
   phase. Every edit calls `setFinal(messageId, tasks)` — local React state
   only. Nothing here touches the store.

5. **Approve.** `approveAll()` writes, via the store's `update()`:
   new approved tasks → `state.tasks`, vague-date items →
   `state.needsConfirmation`, and an audit entry → `state.history`.

6. **Persistence.** `useAppStore` in `src/lib/store.js` runs a `useEffect`
   that serialises the whole state object to `localStorage` under
   `workload-radar-v1` on every change, and rehydrates on load.

7. **Heatmap recompute.** `HeatmapTab` calls `cell(state, userId, iso, mode)`
   (in `src/lib/store.js`) for every person × day. `cell()` sums the remaining
   hours of approved tasks landing that day (`hoursFor`, honouring the
   planned-only vs all-sources `mode`), adds meeting hours
   (`meetingHoursOn`), zeroes for leave (`isOnLeave`), and maps the total
   through the thresholds: ≤4 Light, 5–7 Busy, 8 Full, 9+ Over.

## Example flow: move request with approval

1. Manager flips a day box and clicks "Move…" → `requestMove()` opens the
   `MovePicker` dialog (`src/App.jsx`), which ranks colleagues by free hours
   (`DAILY_LIMIT - cell(...).total`) and tags the best as the AI suggestion.
2. Choosing a colleague appends to `state.moveRequests` with
   `state: 'pending'` — the heatmap boxes show a dashed outline, and the
   recipient's banner counts the request.
3. The recipient approves in `RequestsTab` → `decide()` reassigns
   `task.owner`, records the decision in `state.history` with before/after
   hours for both people, and flips the request to `approved`/`declined`.
4. Because every screen derives from `state.tasks` and `state.moveRequests`,
   the heatmap, banner and dashboard update without any extra wiring.

## Key invariants (enforced in `src/lib/store.js`)

- Only `status: 'approved'` tasks count toward the heatmap — nothing reaches
  the picture before member review.
- Manager-role tabs (Dashboard, Change history) are rendered only for
  `role === 'manager'`; raw message text is never in state at all, so the
  manager cannot see it even with dev tools.
- Deadline risk (`isAtRisk`): a task is flagged when its remaining hours
  exceed the person's free capacity (8h limit minus other work minus
  meetings, zero on leave days) between today and its deadline. Logging
  progress shrinks `taskRemaining`, which removes the flag.
- Accuracy (`accuracyOf`) grades the AI's **raw** extraction against the
  truth labels in `samples.js`; member corrections don't inflate the score.

## Swapping in the real stack later

- Replace `src/lib/extractor.js` internals with a `fetch` to a small server
  (Supabase Edge Function / Express route) that keeps the ILMU API key in an
  env var and caches results — the call signature stays the same.
- Replace `useAppStore`'s localStorage effects with Supabase tables
  (`tasks`, `move_requests`, `history`, `progress_logs`) and enforce the
  manager/member permissions with row-level security.
- Add real auth; the user switcher maps 1:1 to logged-in user context.
