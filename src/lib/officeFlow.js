import { approveFindings, findingsFor } from './extractor.js'

import { MEMBER_UPLOADS, SAMPLE_MESSAGES } from '../data/samples.js'
import { initialState, allocatedHours, cell, transferCandidates, round1, startOfWeek, taskRemaining, todayISO, weekDates } from './store.js'

export const channels = [['whatsapp','WhatsApp'], ['email','Email']]
export const weekStart = startOfWeek(todayISO())
export const OFFICE_DEMO_KEY = 'workload-radar-ready-demo-v1'

const officePeople = new Set(['aina', 'kumar', 'meiling'])
const demoMessages = ['m22', 'm21']
const confirmedDates = { m5: '2026-12-04', m7: '2026-11-26', m13: '2026-11-27' }
export const isDemoViewpoint = owner => officePeople.has(owner)
const juneMeeting = { id: 'office-june-planning', owner: 'june', name: 'Delivery planning',
  date: todayISO(), hours: 1.5, officeRoom: 'meeting' }

export function withOfficeScene(state) {
  return state.meetings.some(meeting => meeting.id === juneMeeting.id)
    ? state
    : { ...state, meetings: [...state.meetings, juneMeeting] }
}

export function officeDemoView(state) {
  return {
    ...withOfficeScene(state),
    currentUserId: isDemoViewpoint(state.currentUserId) ? state.currentUserId : 'aina',
    transferRecipientIds: ['kumar', 'meiling'],
    officeReports: Object.fromEntries(Object.entries(state.officeReports || {}).filter(([, report]) => isDemoViewpoint(report.owner))),
  }
}

export function initialOfficeDemo() {
  let state = withOfficeScene(initialState())
  const today = todayISO()
  const timestamp = today + 'T09:00:00+08:00'
  state.tasks = state.tasks.map(task =>
    ['plan-1', 'plan-2'].includes(task.id) ? { ...task, scheduledDate: task.deadline } : task)
  state.tasks.push(
    { id: 'office-supplier-notes', owner: 'kumar', name: 'Check supplier exceptions',
      deadline: today, scheduledDate: today, hours: 2, source: 'whatsapp', status: 'approved', progress: 0 },
    { id: 'office-launch-copy', owner: 'meiling', name: 'Review launch copy',
      deadline: today, scheduledDate: today, hours: 2, source: 'plan', status: 'approved', progress: 0 },
  )
  const townHall = SAMPLE_MESSAGES.find(message => message.id === 'm20').result[0]
  state.meetings.push({ id: 'office-town-hall', owner: 'everyone', name: townHall.name,
    date: townHall.deadline, hours: townHall.hours, source: 'email' })
  for (const user of state.users.filter(entry => isDemoViewpoint(entry.id) && entry.role === 'member')) {
    const existing = new Set(state.tasks.map(task => task.id))
    const results = MEMBER_UPLOADS[user.id].filter(id => !demoMessages.includes(id)).map(messageId => {
      const sample = SAMPLE_MESSAGES.find(message => message.id === messageId)
      const tasks = findingsFor(sample, state, user.id)
      const date = confirmedDates[messageId]
      const finalTasks = date ? findingsFor({ ...sample, result: sample.result.map(task => ({ ...task, deadline: date, needsDate: false })) }, state, user.id) : tasks
      return { messageId, tasks, finalTasks }
    })
    state = approveFindings(state, user, results, timestamp)
    // Previously confirmed work already has a place in the saved workplan.
    state.tasks = state.tasks.map(task => existing.has(task.id) ? task : { ...task, scheduledDate: task.deadline })
  }
  return {
    ...state,
    connections: { kumar: { whatsapp: true, email: true }, meiling: { whatsapp: true, email: true } },
    officeInbox: { kumar: demoMessages },
    history: [{ id: 'office-demo-seed', when: timestamp, actor: 'Ms Aina',
      action: 'Loaded confirmed workplan', detail: 'Previously reviewed messages and meetings are already scheduled.' }],
  }
}

export function recordTimer(state, owner, taskId, at, finish = false) {
  const active = state.officeTimers?.[owner]
  const task = state.tasks.find(item => item.id === taskId && item.owner === owner)
  if (!task || !taskRemaining(task)) return state
  const taskTimers = state.officeTimers || {}
  if (!active && !finish) return { ...state, officeTimers: { ...taskTimers, [owner]: { taskId, start: at } } }
  if (active && active.taskId !== taskId) return state
  const seconds = active ? Math.max(0, Math.floor((at - active.start) / 1000)) : 0
  const percent = finish ? 100 : Math.min(100, (task.progress || 0) + seconds / (task.hours * 36))
  return {
    ...state,
    officeTimers: { ...taskTimers, [owner]: null },
    tasks: state.tasks.map(item => item.id === taskId ? { ...item, progress: percent } : item),
    progressLogs: [...state.progressLogs, {
      id: crypto.randomUUID(), taskId, taskName: task.name, userId: owner, seconds, percent,
      at: new Date(todayISO() + 'T09:00:00+08:00').toISOString(),
    }],
  }
}

export function weeklyReport(state, owner, monday = weekStart) {
  const days = weekDates(monday)
  const logs = state.progressLogs.filter(log => log.userId === owner && days.includes(log.at.slice(0,10)))
  const ids = new Set(logs.map(log => log.taskId))
  const tasks = state.tasks.filter(task => task.status === 'approved' && (ids.has(task.id) ||
    (task.owner === owner && (days.includes(task.deadline) || days.some(day => allocatedHours(state, task, day) > 0)))))
  return {
    id: owner + '|' + monday,
    owner, monday, end: days.at(-1),
    items: tasks.map(task => ({
      id: task.id, name: task.name, due: task.deadline,
      remaining: round1(taskRemaining(task)),
      seconds: logs.filter(log => log.taskId === task.id).reduce((sum, log) => sum + (log.seconds || 0), 0),
      planned: round1(days.reduce((sum, day) => sum + allocatedHours(state, { ...task, progress: 0 }, day), 0)),
    })),
    meetings: state.meetings.filter(meeting => (meeting.owner === owner || meeting.owner === 'everyone') && days.includes(meeting.date))
      .map(meeting => ({ id: meeting.id, name: meeting.name, date: meeting.date, hours: meeting.hours })),
  }
}

export function timerLabel(seconds) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
}

export function candidatesForDay(state, date, mode, owner) {
  const matches = state.tasks.filter(task => task.status === 'approved' && allocatedHours(state,task,date)>0 &&
    (mode === 'all' || task.source === 'plan') && (!owner || task.owner === owner) &&
    (owner ? ['over', 'full'] : ['over']).includes(cell(state,task.owner,date,mode).key) &&
    !state.moveRequests.some(request => request.taskId === task.id && request.state === 'pending'))
    .sort((a,b) => allocatedHours(state,b,date) - allocatedHours(state,a,date))
  for (const task of matches) {
    const candidate = transferCandidates(state,task,date).find(entry => entry.fits)
    if (candidate) return { task, from: state.users.find(user=>user.id===task.owner), to: candidate.user }
  }
  return null
}

export function closeOfficeWeek(state, now, simulate = false) {
  const opened = state.officeWeekOpened ?? now
  if (!simulate && now - opened < 7 * 86400000) {
    return state.officeWeekOpened == null ? { ...state, officeWeekOpened: opened } : state
  }
  if (state.officeWeekClosed) return state
  const reports = { ...state.officeReports }
  for (const user of state.users.filter(entry => isDemoViewpoint(entry.id) && entry.role === 'member')) {
    const report = weeklyReport(state, user.id)
    reports[report.id] ??= report
  }
  return { ...state, officeWeekOpened: opened, officeWeekClosed: true, officeReports: reports }
}
