# WorkLoad Radar (prototype)

A web app that turns hidden work in chats and emails into a visible, fair team
workload picture. Team members "upload" sample emails and WhatsApp messages,
an AI-style extractor finds the tasks, members review and approve them, and a
shared heatmap shows each person's real hours per day — including meetings,
leave and work that never made it to the project plan.

Built as a 3-day MVP prototype: no logins (user switcher instead), no real
inbox connections, all data lives in the browser and resets when cleared.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Requires Node 18+.

## The demo path (matches the brief's user journey)

1. Start as **Ms Aina (manager)** — the heatmap shows "planned work only" is
   calm; toggle **Planned + chat & email** (the default) to see reality.
2. Switch to **Kumar (member)** → **Upload & review** → upload his 12 sample
   messages. The AI flags an uncertain item, a vague date ("esok"), a possible
   duplicate, and one wrong deadline ("next Friday" misread).
3. On the review screen: fix the Tender docs deadline to 2026-12-04, delete the
   uncertain invoice item and the duplicate note, confirm the vague dates, then
   **Approve**. Nothing reaches the heatmap before approval.
4. Kumar's Wednesday turns **Over (10h)** — the plan said 5h. The card flip
   shows the tasks behind the box. A deadline-risk flag appears on at-risk tasks.
5. As **Ms Aina**, flip Kumar's Wednesday, click **Move…** on a task. The app
   suggests the colleague with the most free hours (Mei Ling). Send the request.
6. As **Mei Ling**: the banner shows the pending request; **Requests** →
   **Approve**. The heatmap updates and Change history records before/after
   hours for both people. (Decline works too — the task stays put.)
7. As **Kumar**: **Today's tasks** → log 50% → the heatmap cools down.
8. The banner shows a red alert for **Hafiz** (no progress logged for 6 days).
9. **Dashboard** (manager): % of hidden work, overload days caught, extraction
   accuracy (target ≥85%), tasks at risk.

## Testing failure modes

On the upload screen, "Simulate AI fault" offers:

- **Timeout on one message** — the affected card shows "The AI took too long to
  read this message" with an **Add manually** button, so the member isn't blocked.
- **Unreadable AI answer** — same fallback after an automatic retry fails.

"Reset demo" (click twice) restores the seed data.

## What's simulated vs real

| Real | Simulated (prototype only) |
| --- | --- |
| Heatmap maths, status colours + text labels | The "AI" extraction (canned results, deterministic) |
| Review/approve flow, edit/delete before approval | Upload bundles instead of Gmail/WhatsApp |
| Move requests with approval/decline + history | Login (user switcher instead) |
| Progress logging, stale alerts, risk flags | Storage (browser localStorage, resets when cleared) |
| Dashboard numbers, extraction-accuracy metric | Meetings/leave come from seed data, not parsing |

Privacy rule honoured: raw message text is processed by the extractor and
discarded — it is never stored in app state and never shown to the manager.

## Directory map

```
src/
  App.jsx            All screens (heatmap, upload/review, today, requests,
                     dashboard, history) + the move-picker dialog
  index.css          Styling, status colours, mobile layout
  lib/
    extractor.js     Simulated AI service: latency, fault modes, error shape
    store.js         localStorage state + ALL the maths: capacity, status
                     thresholds, deadline risk, dashboard stats, accuracy
  data/
    samples.js       Users, plan tasks, meetings, leave, 20 labelled sample
                     messages with canned AI results and truth labels
```

## Known limitations

- The extractor is a simulation; a real version would call the ILMU API from a
  server route with the key in an environment variable (never in the browser).
- Data is per-browser; there is no shared server, so two people can't really
  collaborate — permissions are demonstrated through the role-based UI.
- Deadlines land on their deadline day in the heatmap (simple, explainable
  model) rather than being spread across available days.
- Accuracy is graded only on messages someone actually uploaded (the demo
  covers Kumar's 12; upload as Mei Ling/Hafiz to cover more).
- The demo clock is fixed to the week of 2026-11-23 so the demo always works.
