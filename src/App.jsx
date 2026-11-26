import React, { useLayoutEffect, useRef, useState } from 'react'
import { SAMPLE_MESSAGES, MEMBER_UPLOADS, PLAN_TASKS, PLAN_MEETINGS } from './data/samples.js'
import WorkloadMap from './WorkloadMap.jsx'
import Studio, { WORKLOAD_SHADES, LEAVE_SHADE } from './Studio.jsx'
import { DigestInbox, digestClock, useDigestDelivery } from './Digests.jsx'
import { extractTasks } from './lib/extractor.js'
import {
  useAppStore, todayISO, addDays, startOfWeek, weekDates, DAY_NAMES,
  cell, DAILY_LIMIT, taskRemaining, taskDay, deadlineRisk, transferCandidates,
  dashboardStats, isStale, staleDays, STALE_DAYS, round1,
} from './lib/store.js'

export default function App() {
  const [state, update, reset] = useAppStore()
  const [selectedTab, setTab] = useState(null)
  const [studioDay, setStudioDay] = useState(null)
  const [reviewConnected, setReviewConnected] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  useDigestDelivery(update)
  const me = state.users.find((u) => u.id === state.currentUserId)
  const isManager = me.role === 'manager'
  const tab = selectedTab || (isManager ? 'studio' : 'today')
  const pending = state.moveRequests.some((r) => r.toUserId === me.id && r.state === 'pending')

  const tabs = [['studio', 'Studio'], ...(isManager
    ? [['heatmap', 'Heatmap'], ['dashboard', 'Dashboard'], ['history', 'Change history'], ['plan', 'Project plan'], ['digests', 'Admin digests']]
    : [['today', 'Task board'], ['heatmap', 'Heatmap'], ['upload', 'Upload & review'], ['requests', 'Requests']]), ['channels', 'Connected inbox']]

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setStudioDay(null); setTab('studio') }}>
          <span className="brand-mark" aria-hidden="true"><i /></span><span>WorkLoad <strong>Radar</strong></span>
        </button>
        <div className="switcher">
          <span className="member-avatar" aria-hidden="true">{initials(me.name)}</span><label htmlFor="user" className="visually-hidden">Demo user</label>
          <select id="user" value={state.currentUserId}
            onChange={(e) => {
              const userId = e.target.value
              setTab(null)
              setStudioDay(null)
              setReviewConnected(false)
              update((s) => ({ ...s, currentUserId: userId, movePicker: null }))
            }}>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>

        </div>
      <nav className="tabs"  aria-label="Main navigation">
        {tabs.map(([key, label]) => (
          <button key={key} className={'tab' + (tab === key ? ' active' : '')}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => { setStudioDay(null); setReviewConnected(false); setTab(key) }}>{label}{key === 'requests' && pending && <span className="notification-dot" aria-label="Pending requests" />}</button>
        ))}
      </nav>
      </header>

      <main>
        {tab !== 'today' && tab !== 'studio' && <Banner state={state} />}
        {tab === 'studio' && <Studio state={state} isManager={isManager}
          openChannels={() => setTab('channels')} openDigest={() => setTab('digests')}
          onDay={(user, date) => { setStudioDay({ user, date }); setTab('heatmap') }} />}
        {tab === 'heatmap' && <HeatmapTab state={state} update={update} me={me} initialDay={studioDay} />}
        {tab === 'digests' && isManager && <DigestInbox state={state} update={update} />}
        {tab === 'channels' && (reviewConnected && !isManager
          ? <UploadTab state={state} update={update} me={me} connected />
          : <Channels state={state} update={update} me={me} onReview={() => setReviewConnected(true)} />)}
        {tab === 'dashboard' && isManager && <DashboardTab state={state} />}
        {tab === 'plan' && isManager && <ProjectPlan users={state.users} onFinish={() => setTab('heatmap')} />}
        {tab === 'history' && isManager && <HistoryTab state={state} />}
        {tab === 'today' && !isManager && <TodayTab state={state} update={update} me={me} />}
        {tab === 'upload' && !isManager && <UploadTab state={state} update={update} me={me} />}
        {tab === 'requests' && !isManager && <RequestsTab state={state} update={update} me={me} />}
      </main>
      <footer className="workspace-footer"><span>WorkLoad Radar · Demo workspace</span>
        <div>{confirmReset && <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>}
          <button type="button" onClick={() => {
            if (!confirmReset) { setConfirmReset(true); return }
            reset(); setTab(null); setStudioDay(null); setReviewConnected(false); setConfirmReset(false)
          }}>{confirmReset ? 'Confirm reset' : 'Reset demo'}</button></div>
      </footer>
    </div>
  )
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

// ---------- summary banner (next-week warning + stale alerts + pending requests) ----------
function Banner({ state }) {
  const nextWeekStart = addDays(startOfWeek(todayISO()), 7)
  const nextWeekOver = []
  for (let d = 0; d < 7; d++) {
    const iso = addDays(nextWeekStart, d)
    for (const u of state.users.filter((u) => u.role === 'member')) {
      if (cell(state, u.id, iso, 'all').key === 'over') {
        nextWeekOver.push(`${u.name} on ${DAY_NAMES[(new Date(iso).getDay() + 6) % 7]}`)
      }
    }
  }
  const stale = state.users.filter((u) => u.role === 'member' && isStale(state, u.id) && (state.currentUserId === 'aina' || u.id === state.currentUserId))
  const myPending = state.moveRequests.filter((r) => r.state === 'pending' && r.toUserId === state.currentUserId)
  const items = []
  if (nextWeekOver.length) items.push(`⚠️ Next week is overloaded: ${[...new Set(nextWeekOver)].join(', ')}`)
  for (const u of stale) {
    items.push(`🚨 ${u.name} hasn't logged progress for ${staleDays(state, u.id)} days (alert after ${STALE_DAYS}).`)
  }
  if (myPending.length) items.push(`📨 You have ${myPending.length} move request${myPending.length > 1 ? 's' : ''} waiting for your answer.`)
  if (!items.length) return null
  return <div className="banner warn" role="alert">{items.map((t, i) => <div key={i}>{t}</div>)}</div>
}

// ---------- heatmap ----------
function HeatmapTab({ state, update, me, initialDay }) {
  const [mode, setMode] = useState('all') // default shows hidden workload
  const [weekOffset, setWeekOffset] = useState(() => initialDay ? Math.round((Date.parse(startOfWeek(initialDay.date)) - Date.parse(startOfWeek(todayISO()))) / 604800000) : 0)
  const [selection, setSelection] = useState(initialDay)
  const monday = addDays(startOfWeek(todayISO()), weekOffset * 7)
  const days = weekDates(monday).slice(0, 5)
  const members = state.users.filter((u) => u.role === 'member')
  const isManager = me.role === 'manager'

  const [day, setDay] = useState(initialDay?.date ?? null)
  const hottestDay = days.reduce((best, candidate) => {
    const load = (date) => members.reduce((score, user) => {
      const summary = cell(state, user.id, date, mode)
      return score + (summary.key === 'over' ? 100 : 0) + summary.total
    }, 0)
    return load(candidate) > load(best) ? candidate : best
  }, days[0])
  const visibleDay = days.includes(day) ? day : hottestDay

  return (
    <section className="heatmap-panel">
      <div className="section-heading radar-heading"><h1>Team workload</h1><p>Select a teammate on the map to see their work, meetings, and leave.</p></div>
      <div className="calendar-surface">
      <div className="toolbar">
        <div className="toggle" role="group" aria-label="Workload view">
          <button className={mode === 'all' ? 'on' : ''} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>Actual workload</button>
          <button className={mode === 'planned' ? 'on' : ''} aria-pressed={mode === 'planned'} onClick={() => setMode('planned')}>Planned workload</button>
        </div>
        <div className="weeknav">
          <button className="btn ghost" onClick={() => { setWeekOffset((w) => w - 1) }} disabled={weekOffset <= -1} aria-label="Previous week">‹</button>
          <strong aria-live="polite">{shortDate(monday)} – {shortDate(days[4])}</strong>
          <button className="btn ghost" onClick={() => { setWeekOffset((w) => w + 1) }} disabled={weekOffset >= 2} aria-label="Next week">›</button>
        </div>
      </div>

      <div className="map-date-tabs" role="group" aria-label="Choose a workload day">
        {days.map((date,i)=><button type="button" key={date} aria-pressed={date===visibleDay} onClick={()=>setDay(date)}>
          <span>{DAY_NAMES[i]}</span><strong>{shortDate(date)}</strong>
        </button>)}
      </div>
      <WorkloadMap state={state} members={members} date={visibleDay} mode={mode} onSelect={setSelection} />

      <HeatmapLegend />
      </div>
      {isManager && <div className="calendar-results"><ResultsCards state={state} monday={monday} compact /></div>}
      <div className="calendar-insights">
      {isManager && <SuggestedTransfer state={state} mode={mode} days={days} onReview={(task, user) => {
        setSelection({ user, date: taskDay(task) })
        requestMove(update, state, task)
      }} />}
      <DeadlineWatch state={state} me={me} />
      </div>
      {selection && <DayDrawer state={state} update={update} selection={selection} mode={mode}
        isManager={isManager} onDismiss={() => {
          setSelection(null)
          if (state.movePicker) update((current) => ({ ...current, movePicker: null }))
        }} />}
    </section>
  )
}

function DayDrawer({ state, update, selection, mode, isManager, onDismiss }) {
  const dialogRef = useRef(null)
  const pickerRef = useRef(null)
  const { user, date } = selection
  const summary = cell(state, user.id, date, mode)
  const tasks = state.tasks.filter((task) =>
    task.owner === user.id && task.status === 'approved' && taskRemaining(task) > 0 &&
    (taskDay(task) === date || task.deadline === date) && (mode === 'all' || task.source === 'plan'))
  const meetings = state.meetings.filter((meeting) =>
    meeting.date === date && (meeting.owner === user.id || meeting.owner === 'everyone'))
  const requests = state.moveRequests.filter((request) => request.state === 'pending')
  const pendingFor = (task) => requests.find((request) => request.taskId === task.id)
  const groups = [
    ['Tasks due this day', tasks.filter((task) => task.deadline === date)],
    ['Scheduled tasks', tasks.filter((task) => taskDay(task) === date && task.deadline !== date)],
  ]
  const activePicker = isManager && tasks.some((task) => task.id === state.movePicker?.taskId)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
  }, [])

  useLayoutEffect(() => {
    if (activePicker) pickerRef.current?.focus({ preventScroll: false })
  }, [activePicker, state.movePicker?.taskId])

  return <dialog className="day-drawer" ref={dialogRef} aria-labelledby="day-drawer-title" onClose={onDismiss}
    onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current.close() }}>
    <div className="drawer-content">
      <header className="drawer-header">
        <div><h2 id="day-drawer-title">{user.name}</h2><p>{shortDate(date)} · {mode === 'all' ? 'Actual workload' : 'Planned workload'}</p></div>
        <button type="button" className="btn ghost" autoFocus onClick={() => dialogRef.current.close()}>Close</button>
      </header>
      <div className="drawer-summary"><strong>{summary.total}h committed</strong><span>{summary.label} · {summary.available}h work capacity</span></div>
      {summary.onLeave && <p className="drawer-note">On leave · 0h available for work</p>}
      {groups.map(([heading, items]) => <section className="drawer-section" key={heading}>
        <h3>{heading}</h3>
        {items.length === 0 ? <p className="muted">None</p> : <ul className="drawer-task-list">
          {items.map((task) => {
            const pending = pendingFor(task)
            return <li key={task.id}>
              <div className="drawer-task-line"><strong>{task.name}</strong><span>{task.hours}h est.</span></div>
              <p className="muted">{round1(taskRemaining(task))}h left · Due {shortDate(task.deadline)}
                {taskDay(task) !== date && ' · Scheduled ' + shortDate(taskDay(task))}</p>
              <RiskFlag risk={deadlineRisk(state, task)} deadline={task.deadline} />
              {pending ? <p className="drawer-note">Waiting for {state.users.find((member) => member.id === pending.toUserId)?.name}’s approval</p>
                : isManager && <button type="button" className="btn tiny" onClick={() => requestMove(update, state, task)}>Move task</button>}
            </li>
          })}
        </ul>}
      </section>)}
      <section className="drawer-section"><h3>Meetings</h3>
        {meetings.length === 0 ? <p className="muted">No meetings scheduled.</p> : <ul className="drawer-task-list">
          {meetings.map((meeting) => <li key={meeting.id} className="drawer-task-line"><strong>{meeting.name}</strong><span>{meeting.hours}h</span></li>)}
        </ul>}
      </section>
      {activePicker && <section className="drawer-section">
        <MovePicker state={state} update={update} headingRef={pickerRef} />
      </section>}
    </div>
  </dialog>
}

function HeatmapLegend() {
  const bands = [
    ['0h', WORKLOAD_SHADES.slice(0, 1)], ['Light · 1–4h', WORKLOAD_SHADES.slice(1, 5)],
    ['Busy · 5–7h', WORKLOAD_SHADES.slice(5, 8)], ['Full · 8h', WORKLOAD_SHADES.slice(8, 9)],
    ['Over · >8h', WORKLOAD_SHADES.slice(9)], ['Leave', [LEAVE_SHADE]],
  ]
  return <div className="legend" aria-label="Workload colors">
    {bands.map(([name, shades]) => <span key={name} className="legend-band"
      style={{ background: shades.length === 1 ? shades[0] : 'linear-gradient(90deg,' + shades.join(',') + ')' }}>{name}</span>)}
    <span className="legend-pending">Dashed outline · transfer pending</span>
  </div>
}

function SuggestedTransfer({ state, mode, days, onReview }) {
  const pendingTasks = new Set(state.moveRequests.filter((request) => request.state === 'pending').map((request) => request.taskId))
  const suggestion = state.tasks
    .filter((task) => task.status === 'approved' && days.includes(taskDay(task)) && taskRemaining(task) > 0 &&
      (mode === 'all' || task.source === 'plan') && !pendingTasks.has(task.id))
    .map((task) => ({
      task,
      risk: deadlineRisk(state, task)?.atRisk ?? false,
      workload: cell(state, task.owner, taskDay(task), 'all'),
    }))
    .filter(({ risk, workload }) => risk || workload.key === 'over')
    .sort((a, b) => Number(b.risk) - Number(a.risk) ||
      b.workload.total - a.workload.total || taskRemaining(b.task) - taskRemaining(a.task))
    .map(({ task }) => ({
      task,
      from: state.users.find((user) => user.id === task.owner),
      candidate: transferCandidates(state, task).find((entry) => entry.fits),
    }))
    .find(({ from, candidate }) => from && candidate)
  return <div className="suggestion heatmap-suggestion"><strong>Suggested transfer</strong>
    {suggestion ? <>
      <p>Move {suggestion.task.name} from {suggestion.from.name} to {suggestion.candidate.user.name}.</p>
      <p className="muted">{candidateDetail(suggestion.candidate)}</p>
      <button type="button" className="btn primary" onClick={() => onReview(suggestion.task, suggestion.from)}>Review transfer</button>
    </> : <p className="muted">No suitable transfer suggested for this week.</p>}
  </div>
}

function DeadlineWatch({ state, me }) {
  const risks = state.tasks.map((task) => ({ task, risk: deadlineRisk(state, task) }))
    .filter(({ task, risk }) => risk?.atRisk && (me.role === 'manager' || task.owner === me.id))
    .sort((a, b) => a.task.deadline.localeCompare(b.task.deadline))
  return <div className="inset"><h3>Deadline watch</h3>
    {!risks.length && <p className="muted">No deadlines currently flagged.</p>}
    {risks.map(({ task, risk }) => <div className="watch-item" key={task.id}>
      <strong>{task.name}</strong><span className="muted">{state.users.find((user) => user.id === task.owner)?.name} · due {shortDate(task.deadline)}</span>
      <RiskFlag risk={risk} deadline={task.deadline} />
    </div>)}
  </div>
}

function requestMove(update, state, task) {
  if (state.moveRequests.some((r) => r.taskId === task.id && r.state === 'pending')) return 'duplicate'
  const best = transferCandidates(state, task).find((candidate) => candidate.fits)
  update((s) => ({ ...s, movePicker: { taskId: task.id, suggestion: best?.user.id } }))
}

function MovePicker({ state, update, headingRef }) {
  const pick = state.movePicker
  if (!pick) return null
  const task = state.tasks.find((t) => t.id === pick.taskId)
  if (!task) return null
  const from = state.users.find((u) => u.id === task.owner)
  function close() { update((s) => ({ ...s, movePicker: null })) }
  function choose(id) {
    const target = state.users.find((u) => u.id === id)
    update((s) => ({
      ...s,
      movePicker: null,
      moveRequests: [...s.moveRequests, {
        id: 'mr' + Date.now(), taskId: task.id, fromUserId: task.owner, toUserId: target.id,
        requestedBy: s.currentUserId, state: 'pending', createdAt: new Date().toISOString(),
        suggestedByAI: target.id === pick.suggestion,
      }],
      history: [...s.history, {
        id: 'h' + Date.now(), when: new Date().toISOString(), actor: s.users.find((u) => u.id === s.currentUserId).name,
        action: 'Requested move', detail: `"${task.name}" from ${from.name} to ${target.name} (waiting for approval)`,
      }],
    }))
  }
  return (
    <div className="drawer-picker" aria-labelledby="transfer-picker-title">
      <h4 id="transfer-picker-title" ref={headingRef} tabIndex={-1}>Move “{task.name}”</h4>
      <p className="muted">Currently with {from.name}, due {shortDate(task.deadline)}.</p>
      <ul className="picker-list">
        {transferCandidates(state, task).map((candidate) => (
          <li key={candidate.user.id}>
            <div className="picker-actions">
              <button type="button" className="btn" onClick={() => choose(candidate.user.id)}>Ask {candidate.user.name}</button>
              {candidate.user.id === pick.suggestion && <span className="pill ai">Suggested</span>}
            </div>
            <p className="muted">{candidateDetail(candidate)}{candidate.fits ? '' : ' · Exceeds available capacity'}</p>
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost" onClick={close}>Cancel transfer</button>
    </div>
  )
}

// ---------- manager: dashboard ----------
function shortDate(iso) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'))
}
function candidateDetail(candidate) {
  return [
    candidate.free + 'h free on work date',
    candidate.skillMatch ? candidate.skill + ' skill match' : null,
    candidate.experience ? candidate.experience + ' similar past tasks' : null,
    candidate.recentOverload + ' overload days in the prior week',
  ].filter(Boolean).join(' · ')
}
function RiskFlag({ risk, deadline }) {
  if (!risk?.atRisk) return null
  return <span className="risk-flag">{risk.overdue ? 'Overdue · ' + risk.remaining + 'h left'
    : 'At risk · ' + risk.remaining + 'h left, ' + risk.free + 'h available by ' + shortDate(deadline)}</span>
}
function ResultsCards({ state, monday, compact }) {
  const stats = dashboardStats(state, monday)
  return <div className="stat-grid">
    <div className="stat"><span className="big">{stats.hiddenPct}%</span><strong>Hidden workload</strong><span>{stats.hiddenHours}h of {stats.totalHours}h came from chats and emails</span></div>
    <div className="stat"><span className="big">{stats.overloadCaught}</span><strong>Overload days surfaced</strong><span>Person-days missed by the planned-only view</span></div>
    <div className="stat"><span className="big">{stats.atRisk}</span><strong>Deadlines at risk</strong><span>Open tasks across all dates</span></div>
    {!compact && <>
      <div className="stat"><span className="big">{stats.onTime}</span><strong>Tasks completed</strong><span>Scheduled this week</span></div>
      <div className="stat"><span className="big">{stats.accuracy === null ? '—' : stats.accuracy + '%'}</span><strong>Extraction accuracy</strong><span>On uploaded demo messages</span></div>
    </>}
  </div>
}
function DashboardTab({ state }) {
  return <section className="dashboard">
    <div className="section-heading"><h1>Results dashboard</h1><p>Approved work for the week of {shortDate(startOfWeek(todayISO()))}</p></div>
    <ResultsCards state={state} />
  </section>
}

function ProjectPlan({ users, onFinish }) {
  const [opened, setOpened] = useState(false)
  return <section>
    <div className="section-heading"><h1>Project plan</h1><p>Review the demo plan’s assignments, due dates and calendar commitments.</p></div>
    {!opened ? <button className="btn primary" onClick={() => setOpened(true)}>Load demo plan</button> : <>
      <div className="heatmap-scroll"><table className="plan-review">
        <thead><tr><th>Task</th><th>Assignee</th><th>Deadline</th><th>Estimate</th></tr></thead>
        <tbody>{PLAN_TASKS.map((task) => <tr key={task.id}><td>{task.name}</td>
          <td>{users.find((user) => user.id === task.owner)?.name}</td>
          <td>{shortDate(task.deadline)}</td><td>{task.hours}h</td></tr>)}</tbody>
      </table></div>
      <h3>Meetings</h3>
      <ul>{PLAN_MEETINGS.map((meeting) => <li key={meeting.id}>{meeting.name} · {shortDate(meeting.date)} · {meeting.hours}h</li>)}</ul>
      <button className="btn primary" onClick={onFinish}>View plan on heatmap</button>
    </>}
  </section>
}

// ---------- manager: change history ----------
function HistoryTab({ state }) {
  const entries = [...state.history].reverse()
  return (
    <section>
      <h2>Change history</h2>
      {entries.length === 0 && <p className="empty">No changes yet.</p>}
      <ul className="history">
        {entries.map((h) => (
          <li key={h.id}>
            <span className="when">{h.when.replace('T', ' ').slice(0, 16)}</span>
            <strong>{h.actor}</strong> — {h.action}: {h.detail}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- member: today's tasks ----------
function TodayTab({ state, update, me }) {
  const today = todayISO()
  const [editing, setEditing] = useState(null)
  const tasks = state.tasks.filter((task) => task.owner === me.id && task.status === 'approved')
    .map((task) => ({ task, risk: deadlineRisk(state, task) }))
    .filter(({ task, risk }) => taskDay(task) === today || task.deadline === today || risk?.atRisk)
    .sort((a, b) => Number(Boolean(b.risk?.atRisk)) - Number(Boolean(a.risk?.atRisk)) ||
      a.task.deadline.localeCompare(b.task.deadline) || taskRemaining(b.task) - taskRemaining(a.task))
  const meetings = state.meetings.filter((m) => (m.owner === me.id || m.owner === 'everyone') && m.date === today)
  const capacity = cell(state, me.id, today, 'all')
  const active = tasks.find(({ task }) => task.id === editing)?.task
  return <section className="today-board">
    <div className="section-heading"><h1>Task board</h1><p>Demo date {shortDate(today)} · Today’s work and deadlines needing attention · {capacity.available}h work capacity</p></div>
    <Banner state={state} />
    {!tasks.length && <p className="empty">No tasks scheduled or due today, and no deadlines flagged.</p>}
    <ul className="todaylist">
      {tasks.map(({ task, risk }) => <li key={task.id} className={risk?.atRisk ? 'risky' : ''}>
        <div><strong>{task.name}</strong>
          <div className="muted">{round1(taskRemaining(task))}h left of {task.hours}h · due {shortDate(task.deadline)}</div>
          <RiskFlag risk={risk} deadline={task.deadline} />
          <progress aria-label={'Progress on ' + task.name} max={100} value={task.progress || 0} />
        </div>
        {taskRemaining(task) > 0 ? <div className="logbtns">
          <button className="btn" onClick={() => setEditing(task.id)}>Log your progress</button>
          <button className="btn primary" onClick={() => logProgress(update, state, task, 100)}>Done</button>
        </div> : <span className="muted">Completed</span>}
      </li>)}
    </ul>
    {(capacity.onLeave || meetings.length > 0) && <div className="inset"><h3>Calendar commitments</h3>
      {capacity.onLeave && <div>Leave · 0h available for work</div>}
      {meetings.map((m) => <div key={m.id}>{m.name} · {m.hours}h meeting</div>)}
    </div>}
    {active && <div className="modal-backdrop" onClick={() => setEditing(null)}>
      <form className="modal" role="dialog" aria-label="Log your progress" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault()
        const hours = Number(new FormData(event.currentTarget).get('hours'))
        logProgress(update, state, active, active.hours > 0 ? Math.min(100, hours / active.hours * 100) : 100)
        setEditing(null)
      }}>
        <h3>Log your progress</h3><p>{active.name} · {active.hours}h estimated</p>
        <label className="progress-field">Total hours worked<input name="hours" type="number" min="0" step="0.1" required autoFocus
          defaultValue={round1(active.hours - taskRemaining(active))} /></label>
        <div className="logbtns"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary">Save progress</button></div>
      </form>
    </div>}
  </section>
}

function logProgress(update, state, task, percent) {
  const me = state.users.find((u) => u.id === state.currentUserId)
  update((s) => ({
    ...s,
    tasks: s.tasks.map((t) => t.id === task.id ? { ...t, progress: percent } : t),
    progressLogs: [...s.progressLogs, {
      id: 'pl' + Date.now(), taskId: task.id, userId: s.currentUserId,
      percent, taskName: task.name, at: new Date(digestClock(s)).toISOString(),
    }],
    history: [...s.history, {
      id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
      action: 'Logged progress', detail: `"${task.name}" → ${percent}%`,
    }],
  }))
}

// ---------- member: upload & review ----------
const inboxSources = [['whatsapp', 'WhatsApp'], ['email', 'Email']]

function Channels({ state, update, me, onReview }) {
  const manager = me.role === 'manager'
  const linked = state.connections?.[me.id] || {}
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const sampleIds = MEMBER_UPLOADS[me.id] || []
  const available = SAMPLE_MESSAGES.filter(m => sampleIds.includes(m.id) && linked[m.source] && !reviewed.has(m.id))
  function toggle(source) {
    update(s => ({...s, connections:{...s.connections,[me.id]:{...s.connections?.[me.id],[source]:!s.connections?.[me.id]?.[source]}}}))
  }
  return <section className="studio-shell">
    <div className="studio-heading"><div><h1>Connected inbox</h1><p>Bring work from department inboxes into one review queue.</p></div></div>
    <p className="muted">Demo connections use built-in messages. No files, account credentials or live inbox access are needed.</p>
    <div className="channel-steps"><span>Connect channel</span><span>Review extracted work</span><span>Update shared workload</span><span>Summarize completions</span></div>
    <div className="channel-grid">{inboxSources.map(([source,label])=><article className="inset" key={source}>
      <h3>{label}</h3>
      {manager ? <p>{state.users.filter(user=>state.connections?.[user.id]?.[source]).length} teammates connected in this demo</p> : <>
        <p>{linked[source] ? available.filter(m=>m.source===source).length + ' new demo messages' : 'Demo channel disconnected'}</p>
        <button className="btn" onClick={()=>toggle(source)}>{linked[source]?'Disconnect':'Connect demo '+label}</button>
      </>}
    </article>)}</div>
    {!manager && <button className="btn primary" disabled={!available.length} onClick={onReview}>Review {available.length} inbox {available.length===1?'message':'messages'}</button>}
    {manager && <p className="muted">The admin sees connection counts and approved work. Teammates review their own message findings.</p>}
  </section>
}

function UploadTab({ state, update, me, connected = false }) {
  const [phase, setPhase] = useState('idle') // idle | working | review | done
  const [results, setResults] = useState([]) // { messageId, tasks, error, finalTasks }
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fault, setFault] = useState('none')
  const myIds = MEMBER_UPLOADS[me.id] || []
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const messages = SAMPLE_MESSAGES.filter(m => myIds.includes(m.id) && !reviewed.has(m.id) &&
    (!connected || state.connections?.[me.id]?.[m.source]))
  const alreadyUploaded = messages.length === 0

  async function run() {
    setPhase('working')
    setProgress({ done: 0, total: messages.length })
    const res = await extractTasks(messages, fault, (done, total) => setProgress({ done, total }))
    // Privacy rule: raw text is processed and discarded — we only keep the
    // extracted fields below; msg.text never enters app state.
    setResults(res)
    setPhase('review')
  }

  function approveAll() {
    const newTasks = []
    const newMeetings = []
    const needsConfirm = []
    for (const r of results) {
      for (const t of r.finalTasks ?? r.tasks ?? []) {
        if (t.needsDate || t.deadline === 'confirm' || t.deadline == null) {
          needsConfirm.push({ id: 'nc' + Math.random(), messageId: r.messageId, name: t.name, hours: t.hours, owner: me.id })
        } else if (t.isMeeting) {
          newMeetings.push({ id: 'mtg-' + r.messageId + '-' + me.id, name: t.name, owner: me.id, date: t.deadline, hours: t.hours })
        } else {
          newTasks.push({
            id: 'x' + Math.random().toString(36).slice(2), name: t.name, owner: me.id,
            hours: t.hours, deadline: t.deadline, source: t.source || 'chat',
            status: 'approved', progress: 0, confidence: t.confidence || 'low',
          })
        }
      }
    }
    const errors = results.filter((r) => r.error)
    update((s) => ({
      ...s,
      tasks: [...s.tasks, ...newTasks],
      meetings: [...s.meetings, ...newMeetings.filter((meeting) => !s.meetings.some((existing) => existing.id === meeting.id))],
      needsConfirmation: [...s.needsConfirmation, ...needsConfirm],
      uploads: { ...s.uploads, [me.id]: { messageIds: [...(s.uploads[me.id]?.messageIds || []), ...results.filter(r => !r.error || r.finalTasks?.length).map(r => r.messageId)], extracted: [...(s.uploads[me.id]?.extracted || []), ...results.map((r) => ({ messageId: r.messageId, tasks: r.tasks, finalTasks: r.finalTasks ?? r.tasks, error: r.error || null }))] } },
      history: [...s.history, {
        id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
        action: 'Approved extracted findings',
        detail: `${newTasks.length} task(s) and ${newMeetings.length} meeting(s) added, ${needsConfirm.length} need date confirmation${errors.length ? `, ${errors.length} couldn't be read` : ''}`,
      }],
    }))
    setPhase('done')
  }

  function setFinal(messageId, tasks) {
    setResults((rs) => rs.map((r) => r.messageId === messageId ? { ...r, finalTasks: tasks } : r))
  }

  if (phase === 'working') {
    return (
      <section>
        <h2>AI is reading your messages…</h2>
        <p>{progress.done} / {progress.total} messages processed. Please wait — the screen is never blank while the AI works.</p>
        <div className="progressline big"><div className="progressfill" style={{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }} /></div>
      </section>
    )
  }

  if (phase === 'review') {
    return (
      <section>
        <h2>Review what the AI found</h2>
        <p className="muted">Nothing reaches the heatmap until you approve. Edit or delete anything that is wrong.</p>
        {results.map((r) => {
          const sample = SAMPLE_MESSAGES.find((s) => s.id === r.messageId)
          return (
            <div key={r.messageId} className="review-card">
              <div className="review-head">
                <span className="src">{sample.source}</span> from {sample.from}
                {r.error && <span className="error"> — ⚠️ {r.error} <button className="btn tiny" onClick={() => {
                  setFinal(r.messageId, [{ name: '', hours: 1, deadline: todayISO(), source: sample.source, confidence: 'manual', manual: true }])
                }}>Add manually</button></span>}
              </div>
              {(r.finalTasks ?? r.tasks).length === 0 && !r.error && <p className="muted">No tasks found in this message.</p>}
              {(r.finalTasks ?? r.tasks).map((t, i) => (
                <div key={i} className={'found-task' + (t.confidence === 'low' ? ' uncertain' : '') + (t.needsDate ? ' vague' : '')}>
                  {t.confidence === 'low' && <span className="flag">⚠️ uncertain — please confirm</span>}
                  {t.needsDate && <span className="flag">📅 vague date — needs confirmation</span>}
                  <label>Name <input value={t.name} onChange={(e) => {
                    const arr = [...(r.finalTasks ?? r.tasks)]; arr[i] = { ...t, name: e.target.value }; setFinal(r.messageId, arr)
                  }} /></label>
                  <label>Hours <input type="number" step="0.5" min="0" value={t.hours} onChange={(e) => {
                    const arr = [...(r.finalTasks ?? r.tasks)]; arr[i] = { ...t, hours: parseFloat(e.target.value) || 0 }; setFinal(r.messageId, arr)
                  }} /></label>
                  {!t.needsDate && (
                    <label>Deadline <input type="date" value={t.deadline || ''} onChange={(e) => {
                      const arr = [...(r.finalTasks ?? r.tasks)]; arr[i] = { ...t, deadline: e.target.value }; setFinal(r.messageId, arr)
                    }} /></label>
                  )}
                  {t.needsDate && (
                    <label>Confirm deadline <input type="date" onChange={(e) => {
                      const arr = [...(r.finalTasks ?? r.tasks)]; arr[i] = { ...t, needsDate: false, deadline: e.target.value || null }; setFinal(r.messageId, arr)
                    }} /></label>
                  )}
                  <button className="btn tiny danger" onClick={() => {
                    setFinal(r.messageId, (r.finalTasks ?? r.tasks).filter((_, j) => j !== i))
                  }}>Delete</button>
                </div>
              ))}
            </div>
          )
        })}
        <div className="review-actions">
          <button className="btn primary" onClick={approveAll}>Approve &amp; add to my workload</button>
          <button className="btn ghost" onClick={() => setPhase('idle')}>Cancel</button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2>{connected ? 'Review connected messages' : 'Upload your emails & WhatsApp chats'}</h2>
      {phase === 'done' && <p className="banner ok">Approved! Your tasks are now on the heatmap.</p>}
      {alreadyUploaded && phase !== 'done' && <p className="banner ok">No new messages are available in this view.</p>}
      <div className="upload-sim">
        <p className="muted">{connected ? 'Review findings from your linked demo channels.' : 'Review mock messages from the sample bundle.'} <strong>{me.name}</strong> · {messages.length} available</p>
        <label className="faultpick">Simulate AI fault (for testing failure handling):
          <select value={fault} onChange={(e) => setFault(e.target.value)}>
            <option value="none">None — normal run</option>
            <option value="timeout">Timeout on one message</option>
            <option value="badjson">Unreadable AI answer on one message</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={alreadyUploaded}>
          {alreadyUploaded ? 'No new messages' : connected ? 'Extract inbox findings' : 'Extract sample findings'}
        </button>
      </div>
    </section>
  )
}

// ---------- member: move requests ----------
function RequestsTab({ state, update, me }) {
  const mine = state.moveRequests.filter((r) => r.toUserId === me.id)
  if (!mine.length) return <section><h2>Requests</h2><p className="empty">No move requests for you right now.</p></section>
  return (
    <section>
      <h2>Move requests</h2>
      {mine.map((r) => {
        const task = state.tasks.find((t) => t.id === r.taskId)
        const from = state.users.find((u) => u.id === r.fromUserId)
        return (
          <div key={r.id} className={'request ' + r.state}>
            <div>
              <strong>{task ? task.name : '(deleted task)'}</strong> — {from?.name} → you
              {r.suggestedByAI && <span className="pill">AI suggestion</span>}
              <div className="muted">Requested {r.createdAt.slice(0, 16).replace('T', ' ')}</div>
            </div>
            {r.state === 'pending' ? (
              <div className="logbtns">
                <button className="btn primary" onClick={() => decide(update, state, r, 'approved')}>Approve</button>
                <button className="btn danger" onClick={() => decide(update, state, r, 'declined')}>Decline</button>
              </div>
            ) : <span className="muted">{r.state}</span>}
          </div>
        )
      })}
    </section>
  )
}

function decide(update, state, req, decision) {
  const me = state.users.find((u) => u.id === state.currentUserId)
  const task = state.tasks.find((t) => t.id === req.taskId)
  const from = state.users.find((u) => u.id === req.fromUserId)
  const to = state.users.find((u) => u.id === req.toUserId)
  const day = taskDay(task)
  // before/after hours for BOTH people, computed from the same snapshot
  const fromBefore = cell(state, req.fromUserId, day, 'all').total
  const toBefore = cell(state, req.toUserId, day, 'all').total
  const afterTasks = state.tasks.map((t) => t.id === req.taskId ? { ...t, owner: decision === 'approved' ? req.toUserId : t.owner } : t)
  const afterState = { ...state, tasks: afterTasks }
  const fromAfter = cell(afterState, req.fromUserId, day, 'all').total
  const toAfter = cell(afterState, req.toUserId, day, 'all').total
  update((s) => ({
    ...s,
    tasks: afterTasks,
    moveRequests: s.moveRequests.map((r) => r.id === req.id ? { ...r, state: decision, decidedAt: new Date().toISOString() } : r),
    history: [...s.history, {
      id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
      action: decision === 'approved' ? 'Approved move' : 'Declined move',
      detail: decision === 'approved'
        ? `"${task.name}" moved from ${from.name} to ${to.name} on ${day}. ${from.name}: ${fromBefore}h → ${fromAfter}h; ${to.name}: ${toBefore}h → ${toAfter}h`
        : `"${task.name}" stays with ${from.name} — manager notified`,
    }],
  }))
}
