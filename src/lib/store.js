import { useCallback, useEffect, useState } from 'react'
import { USERS, PLAN_TASKS, APPROVED_DEMO_TASKS, PLAN_MEETINGS, LEAVE, DEMO_TODAY, SAMPLE_MESSAGES } from '../data/samples.js'

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
    tasks: [...PLAN_TASKS, ...APPROVED_DEMO_TASKS].map((t) => ({ ...t })),
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
    .filter((t) => t.owner === userId && t.status === 'approved' && taskInMode(t, mode) && taskDay(t) === iso)
    .reduce((sum, t) => sum + taskRemaining(t), 0)
  return round1(work)
}

// Status from total hours (work + meetings). Colour thresholds from the brief.
export function statusFor(totalHours, onLeave) {
  if (onLeave && totalHours === 0) return { key: 'leave', label: 'Leave', cls: 'status-leave' }
  if (onLeave || totalHours > DAILY_LIMIT) return { key: 'over', label: 'Over', cls: 'status-over' }
  if (totalHours >= 8) return { key: 'full', label: 'Full', cls: 'status-full' }
  if (totalHours === 0) return { key: 'free', label: 'Free', cls: 'status-free' }
  if (totalHours > 4) return { key: 'busy', label: 'Busy', cls: 'status-busy' }
  return { key: 'light', label: 'Light', cls: 'status-light' }
}

export function availableHours(state, userId, iso) {
  if (isOnLeave(state, userId, iso)) return 0
  return Math.max(0, DAILY_LIMIT - meetingHoursOn(state, userId, iso))
}

export function cell(state, userId, iso, mode) {
  const onLeave = isOnLeave(state, userId, iso)
  const work = hoursFor(state, userId, iso, mode)
  const meetings = onLeave ? 0 : meetingHoursOn(state, userId, iso)
  const total = round1(work + meetings)
  return { work, meetings, total, onLeave, available: availableHours(state, userId, iso), ...statusFor(total, onLeave) }
}

export function round1(n) {
  return Math.round(n * 10) / 10
}

// ---------- deadline risk ----------
const workingDay = (iso) => ![0, 6].includes(new Date(iso + 'T12:00:00').getDay())

export function deadlineRisk(state, task, today = todayISO()) {
  if (task.status !== 'approved' || !/^\d{4}-\d{2}-\d{2}$/.test(task.deadline)) return null
  const remaining = round1(taskRemaining(task))
  if (remaining <= 0) return null
  if (task.deadline < today) return { remaining, free: 0, overdue: true, atRisk: true }

  let free = 0
  for (let date = today; date <= task.deadline; date = addDays(date, 1)) {
    if (!workingDay(date)) continue
    const reserved = hoursFor(state, task.owner, date, 'all')
    const ownAllocation = taskDay(task) === date ? remaining : 0
    free += Math.max(0, availableHours(state, task.owner, date) - (reserved - ownAllocation))
  }
  free = round1(free)
  return { remaining, free, overdue: false, atRisk: remaining > free }
}

export function isAtRisk(state, task) {
  return deadlineRisk(state, task)?.atRisk ?? false
}

const skillsByMember = {
  kumar: ['vendor', 'reporting', 'compliance'],
  meiling: ['web', 'vendor', 'design'],
  hafiz: ['database', 'engineering', 'operations'],
  june: ['planning', 'reporting', 'client'],
}

function taskSkill(task) {
  if (task.skill) return task.skill
  const name = task.name.toLowerCase()
  if (/vendor|tender|invoice/.test(name)) return 'vendor'
  if (/database|migration/.test(name)) return 'database'
  if (/website|web|frontend/.test(name)) return 'web'
  if (/sprint|planning/.test(name)) return 'planning'
  if (/report|deck/.test(name)) return 'reporting'
  if (/contract|audit|compliance/.test(name)) return 'compliance'
  return null
}

export function transferCandidates(state, task) {
  const date = taskDay(task)
  const skill = taskSkill(task)
  const remaining = round1(taskRemaining(task))
  return state.users.filter((user) => user.role === 'member' && user.id !== task.owner).map((user) => {
    const available = availableHours(state, user.id, date)
    const free = round1(Math.max(0, available - hoursFor(state, user.id, date, 'all')))
    const skillMatch = Boolean(skill && (user.skills || skillsByMember[user.id] || []).includes(skill))
    const experience = skill ? state.tasks.filter((other) => other.owner === user.id && other.id !== task.id &&
      other.status === 'approved' && taskSkill(other) === skill &&
      (taskRemaining(other) === 0 || taskDay(other) < todayISO())).length : 0
    let recentOverload = 0
    for (let offset = 1; offset <= 7; offset++) {
      const prior = addDays(date, -offset)
      if (workingDay(prior) && cell(state, user.id, prior, 'all').key === 'over') recentOverload++
    }
    return { user, free, skill, skillMatch, experience, recentOverload,
      fits: remaining > 0 && workingDay(date) && free >= remaining }
  }).sort((a, b) => Number(b.fits) - Number(a.fits) ||
    Number(b.skillMatch) - Number(a.skillMatch) ||
    (Math.min(b.experience, 3) - b.recentOverload) - (Math.min(a.experience, 3) - a.recentOverload) ||
    a.recentOverload - b.recentOverload || b.free - a.free)
}

export function dashboardStats(state, monday = startOfWeek(todayISO())) {
  const sunday = addDays(monday, 6)
  const tasks = state.tasks.filter((task) => task.status === 'approved' && taskDay(task) >= monday && taskDay(task) <= sunday)
  const plannedHours = tasks.reduce((sum, task) => sum + (task.source === 'plan' ? taskRemaining(task) : 0), 0)
  const hiddenHours = tasks.reduce((sum, task) => sum + (task.source === 'plan' ? 0 : taskRemaining(task)), 0)
  const totalHours = plannedHours + hiddenHours
  let overloadCaught = 0
  for (const iso of weekDates(monday)) {
    for (const user of state.users.filter((u) => u.role === 'member')) {
      if (cell(state, user.id, iso, 'planned').key !== 'over' && cell(state, user.id, iso, 'all').key === 'over') overloadCaught++
    }
  }
  return {
    hiddenPct: totalHours ? Math.round(100 * hiddenHours / totalHours) : 0,
    hiddenHours: round1(hiddenHours), totalHours: round1(totalHours), overloadCaught,
    completed: tasks.filter((task) => taskRemaining(task) === 0).length,
    atRisk: state.tasks.filter((task) => isAtRisk(state, task)).length,
    accuracy: accuracyOf(state),
  }
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

export function workloadWeekBounds(state) {
  const anchor = startOfWeek(todayISO())
  const dates = [todayISO(), ...state.tasks.flatMap(t => [t.deadline, taskDay(t)]), ...state.meetings.map(m => m.date)]
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()
  const offset = date => Math.round((Date.parse(startOfWeek(date)) - Date.parse(anchor)) / 604800000)
  return { first: offset(dates[0]), last: offset(dates.at(-1)) }
}

export function workloadBreakdown(state, userId, date, mode) {
  const totals = new Map()
  for (const task of state.tasks) {
    if (task.owner !== userId || task.status !== 'approved' || !taskInMode(task, mode) || taskDay(task) !== date) continue
    const source = { plan: 'plan', whatsapp: 'WhatsApp', email: 'email' }[task.source] || 'inbox'
    totals.set(source, (totals.get(source) || 0) + taskRemaining(task))
  }
  const summary = cell(state, userId, date, mode)
  if (summary.meetings) totals.set('meetings', summary.meetings)
  const parts = [...totals].filter(([, hours]) => hours > 0).map(([source, hours]) => round1(hours) + 'h ' + source)
  return parts.length ? parts.join(' · ') + ' = ' + summary.total + 'h' : summary.onLeave ? 'On leave' : '0h scheduled'
}
