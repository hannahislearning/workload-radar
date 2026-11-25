import { useCallback, useEffect, useState } from 'react'
import { USERS, PLAN_TASKS, PLAN_MEETINGS, LEAVE, DEMO_TODAY, SAMPLE_MESSAGES } from '../data/samples.js'

const STORAGE_KEY = 'workload-radar-v1'

// ---------- shape of the app state ----------
// tasks: approved + pending-review extracted tasks. Only tasks with
// status 'approved' (plan tasks are pre-approved by the manager, member
// tasks after the member approves) count toward the heatmap.
// moveRequests: { id, taskId, fromUserId, toUserId, requestedBy, state: 'pending'|'approved'|'declined', createdAt, decidedAt }
// history: { id, when, actor, action, detail }
// progressLogs: { id, taskId, userId, percent, note, at }
// uploads: which members have uploaded (userId -> messageIds)

export function initialState() {
  return {
    users: USERS,
    currentUserId: 'aina',
    tasks: PLAN_TASKS.map((t) => ({ ...t })),
    meetings: PLAN_MEETINGS.map((m) => ({ ...m })),
    leave: LEAVE.map((l) => ({ ...l })),
    moveRequests: [],
    history: [
      { id: 'h0', when: DEMO_TODAY + 'T09:00', actor: 'Ms Aina', action: 'Uploaded project plan', detail: `${PLAN_TASKS.length} tasks approved` },
    ],
    progressLogs: [
      // Hafiz logged 6 days ago -> triggers the red stale alert in the demo
      { id: 'pl-seed', taskId: 'plan-4', userId: 'hafiz', percent: 25, at: '2026-11-17T09:00:00' },
    ],
    uploads: {}, // userId -> { messageIds, extracted: [...], reviewedAt }
    needsConfirmation: [], // vague-date items awaiting a confirmed deadline
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // corrupted storage -> start fresh
  }
  return initialState()
}

export function useAppStore() {
  const [state, setState] = useState(loadState)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState())
  }, [])

  const update = useCallback((fn) => setState((s) => fn(s)), [])

  return [state, update, reset]
}

// ---------- date helpers (demo clock anchored to DEMO_TODAY, a Monday) ----------
export function todayISO() {
  return DEMO_TODAY
}

// Use LOCAL date parts, not toISOString() (which would shift the day in
// timezones ahead of UTC, e.g. Malaysia's +08:00).
function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// Monday of the week containing iso
export function startOfWeek(iso) {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return toISO(d)
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function weekDates(mondayIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i))
}

// ---------- capacity & workload maths ----------
export const DAILY_LIMIT = 8

// Leave reduces a person's available hours on that day to 0.
export function isOnLeave(state, userId, iso) {
  return state.leave.some((l) => l.owner === userId && iso >= l.start && iso <= l.end)
}

// Meetings belonging to a person on a date ('everyone' meetings count for all).
export function meetingHoursOn(state, userId, iso) {
  return state.meetings
    .filter((m) => (m.owner === userId || m.owner === 'everyone') && m.date === iso)
    .reduce((sum, m) => sum + m.hours, 0)
}

// remaining hours a task still needs, given logged progress
export function taskRemaining(task) {
  return Math.max(0, task.hours * (1 - (task.progress || 0) / 100))
}

// Which day's box does a task load? Tasks load on their deadline day for the
// heatmap (simple, explainable model for the prototype) unless the user picked
// a scheduled day.
export function taskDay(task) {
  return task.scheduledDate || task.deadline
}

// Should this task count in the current view mode?
// 'planned' -> only source 'plan'; 'all' -> plan + chat/email.
export function taskInMode(task, mode) {
  if (mode === 'planned') return task.source === 'plan'
  return true
}

// Hours for one person on one date, for the given view mode.
export function hoursFor(state, userId, iso, mode) {
  const work = state.tasks
    .filter((t) => t.owner === userId && t.status === 'approved' && taskInMode(t, mode) && taskDay(t) === iso && !isOnLeave(state, userId, iso))
    .reduce((sum, t) => sum + taskRemaining(t), 0)
  return round1(work)
}

// Status from total hours (work + meetings). Colour thresholds from the brief.
export function statusFor(totalHours, onLeave) {
  if (onLeave) return { key: 'leave', label: 'Leave', cls: 'status-leave' }
  if (totalHours >= 9) return { key: 'over', label: 'Over', cls: 'status-over' }
  if (totalHours >= 8) return { key: 'full', label: 'Full', cls: 'status-full' }
  if (totalHours >= 5) return { key: 'busy', label: 'Busy', cls: 'status-busy' }
  return { key: 'light', label: 'Light', cls: 'status-light' }
}

export function cell(state, userId, iso, mode) {
  const onLeave = isOnLeave(state, userId, iso)
  const work = hoursFor(state, userId, iso, mode)
  const meetings = onLeave ? 0 : meetingHoursOn(state, userId, iso)
  const total = round1(work + meetings)
  return { work, meetings, total, onLeave, ...statusFor(total, onLeave) }
}

export function round1(n) {
  return Math.round(n * 10) / 10
}

// ---------- deadline risk ----------
// A task is at risk when the hours it still needs exceed the hours the person
// has free (limit minus other work minus meetings) on working days before the
// deadline, counting from today.
export function isAtRisk(state, task) {
  if (task.status !== 'approved' || !task.deadline || task.deadline === 'confirm') return false
  if ((task.progress || 0) >= 100) return false
  const remaining = taskRemaining(task)
  if (remaining <= 0) return false
  let free = 0
  let cursor = todayISO()
  while (cursor <= task.deadline) {
    if (!isOnLeave(state, task.owner, cursor)) {
      const already = hoursFor(state, task.owner, cursor, 'all')
      const meetings = meetingHoursOn(state, task.owner, cursor)
      free += Math.max(0, DAILY_LIMIT - already - meetings)
    }
    cursor = addDays(cursor, 1)
  }
  // `already` on each day already includes this task's own remaining hours on
  // its deadline day, so `free` is the true slack. If remaining > free, it
  // cannot fit before the deadline even using its own day's slot.
  return remaining > free
}

// ---------- dashboard numbers ----------
export function dashboardStats(state) {
  const memberTasks = state.tasks.filter((t) => t.source !== 'plan' && t.status === 'approved')
  const approvedFromMessages = memberTasks.length
  const allApproved = state.tasks.filter((t) => t.status === 'approved').length
  const hiddenPct = allApproved === 0 ? 0 : Math.round((approvedFromMessages / allApproved) * 100)

  // overload days caught: days where planned-only says OK but all-sources says Over
  let overloadCaught = 0
  for (let w = 0; w < 3; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = addDays(startOfWeek(todayISO()), w * 7 + d)
      for (const u of state.users.filter((u) => u.role === 'member')) {
        const planned = cell(state, u.id, iso, 'planned').total
        const real = cell(state, u.id, iso, 'all').total
        if (planned <= DAILY_LIMIT && real >= 9) overloadCaught++
      }
    }
  }

  const onTime = state.tasks.filter((t) => t.status === 'approved' && (t.progress || 0) >= 100).length
  const atRisk = state.tasks.filter((t) => isAtRisk(state, t)).length

  return { hiddenPct, overloadCaught, onTime, atRisk, accuracy: accuracyOf(state) }
}

// Accuracy check: grades the AI's RAW extraction (before member edits) against
// the truth labels for all messages that have been uploaded. The brief's target
// ("AI extracts with at least 85% accuracy") is about the AI, not the humans
// correcting it, so member fixes on the review screen don't change this number.
export function accuracyOf(state) {
  let correct = 0
  let total = 0
  for (const userId of Object.keys(state.uploads)) {
    for (const entry of state.uploads[userId].extracted || []) {
      const sample = SAMPLE_MESSAGES.find((s) => s.id === entry.messageId)
      if (!sample) continue
      total++
      const truth = sample.truth
      const got = entry.tasks || [] // raw AI output
      if (truth === null) {
        if (got.length === 0) correct++
      } else if (truth.duplicate) {
        // correct behaviour: no new task created (empty, or only a duplicate note)
        if (got.length === 0 || (got.length === 1 && got[0].duplicate)) correct++
      } else if (truth.deadline === 'confirm') {
        if (got.length === 1 && (got[0].needsDate || got[0].deadline === 'confirm' || got[0].deadline === null)) correct++
      } else {
        if (got.length === 1 && got[0].deadline === truth.deadline && got[0].hours === truth.hours) correct++
      }
    }
  }
  return total === 0 ? null : Math.round((correct / total) * 100)
}

// ---------- stale-progress alerts ----------
export const STALE_DAYS = 5
export function lastLogFor(state, userId) {
  const logs = state.progressLogs.filter((l) => l.userId === userId)
  if (!logs.length) return null
  return logs.reduce((a, b) => (a.at > b.at ? a : b)).at
}

export function staleDays(state, userId) {
  const last = lastLogFor(state, userId)
  if (!last) return null
  const days = Math.floor((new Date(todayISO()) - new Date(last.slice(0, 10))) / 86400000)
  return days
}

export function isStale(state, userId) {
  const d = staleDays(state, userId)
  return d !== null && d >= STALE_DAYS
}

export function hasAnyLog(state, userId) {
  return state.progressLogs.some((l) => l.userId === userId)
}
