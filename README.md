# WorkLoad Radar

Browser-only React prototype for reviewing hidden work, comparing team workload and requesting transfers. Demo identity, inbox connections and message extraction use sample data.

## Run locally

Requires Node 22.12+.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

## Demo path

1. Open as **Ms Aina**. In Heatmap choose **Deadline day** so the walkthrough uses the original deadline-day model. Switch **Actual / Planned** to compare the two views.
2. Switch to **Kumar → Inbox**. Connect both demo channels or leave both disconnected to use the sample bundle. Extract **14 messages**.
3. In Review, keep **Skip** on the vendor-report and client-demo duplicates. Delete the uncertain vendor-invoice finding, choose **Add anyway** on Tender docs and change its date to **4 Dec 2026**, and date **Review migration script** for **26 Nov** and **Send updated sitemap** for **27 Nov**. Approve becomes available after both dates are set.
4. As **Ms Aina**, pick **Wed 25 Nov**. Kumar has **10h Over** in Actual and **5h** in Planned. In the drawer, Vendor report is 3h, supplier price comparison is 3h, audit queries are 2h, and Client demo call appears once under Meetings for 2h.
5. In Kumar’s Wednesday drawer, move **Vendor report**. Review the before/after totals and send the request to **Mei Ling**. Switch to her **Requests** and approve. The move updates the heatmap and appears under **Dashboard → Change history**.
6. As **Kumar**, open the **Task board**, log hours or mark **Weekly status report** done. Click **Undo** within five seconds to restore its previous progress. Complete it again to test the digest.
7. As **Hafiz**, check the overdue progress warning. Return to **Ms Aina → Dashboard** for workload bars and deadline risks. In **Admin digests**, simulate two days to see Kumar’s completion.
8. Return to **Heatmap → Spread across days** to compare the default model. At narrow widths, use the weekday picker and teammate list.

Reset demo restores the seed data. Inbox also offers simulated extraction failures with manual entry.

## Directory map

- `src/App.jsx` — role-based navigation and screen routing
- `src/screens/` — heatmap, task board, inbox, requests, dashboard, history and plan
- `src/components/` — drawer, transfer picker, alerts, legend, metric cards and undo toast
- `src/Studio.jsx`, `src/WorkloadMap.jsx`, `src/Digests.jsx` — interactive office, desktop contour map and admin digests
- `src/lib/` — allocation, extraction, deduplication, formatting, palette, digests and Vitest tests
- `src/data/samples.js` — demo users, approved work and labelled message fixtures

Draft findings and owner-only snippets stay in the mounted review UI. Raw message text never enters persisted state. The prototype uses the fixed demo day **23 Nov 2026**; digest time advances through the simulation control.
