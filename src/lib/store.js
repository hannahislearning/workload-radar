import { useCallback, useEffect, useState } from 'react'
import { USERS, PLAN_TASKS, APPROVED_DEMO_TASKS, PLAN_MEETINGS, LEAVE, DEMO_TODAY, SAMPLE_MESSAGES } from '../data/samples.js'

const STORAGE_KEY = 'workload-radar-v1'
export const STATE_VERSION = 2

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
    version: STATE_VERSION,
    allocation: 'spread',
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

export function loadState(storageKey = STORAGE_KEY, seed = initialState) {
  try {
    const raw = localStorage.getItem(storageKey)
    const stored = raw ? JSON.parse(raw) : null
    if (stored?.version === STATE_VERSION) return stored
  } catch {
    // corrupted storage -> start fresh
  }
  return seed()
}

export function useAppStore(storageKey = STORAGE_KEY, seed = initialState) {
  const [state, setState] = useState(() => loadState(storageKey, seed))
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state, storageKey])

  const reset = useCallback(() => {
    localStorage.removeItem(storageKey)
    setState(seed())
  }, [seed, storageKey])

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

// Explicitly scheduled work stays pinned. If no eligible workday exists, the
// deadline retains the hours so overdue and leave conflicts stay visible.
export function taskAllocations(state, task, owner = task.owner) {
  const remaining = taskRemaining(task)
  const day = taskDay(task)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !remaining) return []
  if (state.allocation === 'deadline' || task.scheduledDate) return [{ date: day, hours: remaining }]
  const dates = []
  for (let date = task.startDate || todayISO(); date <= task.deadline; date = addDays(date, 1)) {
    if (workingDay(date) && !isOnLeave(state, owner, date)) dates.push(date)
  }
  return dates.length ? dates.map(date => ({ date, hours: remaining / dates.length })) : [{ date: day, hours: remaining }]
}

export function allocatedHours(state, task, date) {
  return taskAllocations(state, task).find(entry => entry.date === date)?.hours ?? 0
}

export function hoursFor(state, userId, iso, mode) {
  return round1(state.tasks.filter(t => t.owner === userId && t.status === 'approved' && taskInMode(t, mode))
    .reduce((sum, task) => sum + allocatedHours(state, task, iso), 0))
}

export function dailyLimitFor(state, userId) {
  return state.users.find(user => user.id === userId)?.dailyLimit ?? DAILY_LIMIT
}

// Status from total hours (work + meetings). Colour thresholds from the brief.
export function statusFor(totalHours, onLeave, limit = DAILY_LIMIT) {
  if (onLeave && totalHours === 0) return { key: 'leave', label: 'Leave', cls: 'status-leave' }
  if (onLeave || totalHours > limit) return { key: 'over', label: 'Over', cls: 'status-over' }
  if (totalHours === limit) return { key: 'full', label: 'Full', cls: 'status-full' }
  if (totalHours === 0) return { key: 'free', label: 'Free', cls: 'status-free' }
  if (totalHours > 4) return { key: 'busy', label: 'Busy', cls: 'status-busy' }
  return { key: 'light', label: 'Light', cls: 'status-light' }
}

export function availableHours(state, userId, iso) {
  if (isOnLeave(state, userId, iso)) return 0
  return Math.max(0, dailyLimitFor(state, userId) - meetingHoursOn(state, userId, iso))
}

export function cell(state, userId, iso, mode) {
  const onLeave = isOnLeave(state, userId, iso)
  const work = hoursFor(state, userId, iso, mode)
  const meetings = onLeave ? 0 : meetingHoursOn(state, userId, iso)
  const total = round1(work + meetings)
  return { work, meetings, total, onLeave, available: availableHours(state, userId, iso), limit: dailyLimitFor(state, userId), ...statusFor(total, onLeave, dailyLimitFor(state, userId)) }
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
    const ownAllocation = allocatedHours(state, task, date)
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

export function transferPreview(state, task, recipient, date) {
  const moved = { ...state, tasks: state.tasks.map(entry => entry.id === task.id ? { ...entry, owner: recipient } : entry) }
  return [task.owner, recipient].map(owner => ({
    before: cell(state, owner, date, 'all'), after: cell(moved, owner, date, 'all'),
  }))
}

export function transferCandidates(state, task, date = taskDay(task)) {
  const skill = taskSkill(task)
  const remaining = round1(taskRemaining(task))
  return state.users.filter((user) => user.role === 'member' && user.id !== task.owner &&
    (!state.transferRecipientIds || state.transferRecipientIds.includes(user.id))).map((user) => {
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
    const fits = remaining > 0 && taskAllocations(state, task, user.id).every(entry =>
      workingDay(entry.date) && !isOnLeave(state, user.id, entry.date) &&
      entry.hours <= availableHours(state, user.id, entry.date) - hoursFor(state, user.id, entry.date, 'all') + 0.00001)
    return { user, free, skill, skillMatch, experience, recentOverload, fits,
      preview: transferPreview(state, task, user.id, date) }
  }).sort((a, b) => Number(b.fits) - Number(a.fits) ||
    Number(b.skillMatch) - Number(a.skillMatch) ||
    (Math.min(b.experience, 3) - b.recentOverload) - (Math.min(a.experience, 3) - a.recentOverload) ||
    a.recentOverload - b.recentOverload || b.free - a.free)
}

export function dashboardStats(state, monday = startOfWeek(todayISO())) {
  const sunday = addDays(monday, 6)
  const tasks = state.tasks.filter(task => task.status === 'approved')
  const hoursInWeek = task => taskAllocations(state, task).filter(entry => entry.date >= monday && entry.date <= sunday)
    .reduce((sum, entry) => sum + entry.hours, 0)
  const plannedHours = tasks.reduce((sum, task) => sum + (task.source === 'plan' ? hoursInWeek(task) : 0), 0)
  const hiddenHours = tasks.reduce((sum, task) => sum + (task.source === 'plan' ? 0 : hoursInWeek(task)), 0)
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
    completed: tasks.filter(task => taskRemaining(task) === 0 && taskDay(task) >= monday && taskDay(task) <= sunday).length,
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
  const dates = [todayISO(), ...state.tasks.flatMap(t => [t.startDate, t.deadline, taskDay(t)]), ...state.meetings.map(m => m.date)]
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()
  const offset = date => Math.round((Date.parse(startOfWeek(date)) - Date.parse(anchor)) / 604800000)
  return { first: offset(dates[0]), last: offset(dates.at(-1)) }
}

export function workloadBreakdown(state, userId, date, mode) {
  const totals = new Map()
  for (const task of state.tasks) {
    if (task.owner !== userId || task.status !== 'approved' || !taskInMode(task, mode) ) continue
    const source = { plan: 'plan', whatsapp: 'WhatsApp', email: 'email' }[task.source] || 'inbox'
    totals.set(source, (totals.get(source) || 0) + allocatedHours(state,task,date))
  }
  const summary = cell(state, userId, date, mode)
  if (summary.meetings) totals.set('meetings', summary.meetings)
  const parts = [...totals].filter(([, hours]) => hours > 0).map(([source, hours]) => round1(hours) + 'h ' + source)
  return parts.length ? parts.join(' · ') + ' = ' + summary.total + 'h' : summary.onLeave ? 'On leave' : '0h scheduled'
}
