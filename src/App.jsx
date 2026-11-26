import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SAMPLE_MESSAGES, MEMBER_UPLOADS, PLAN_TASKS, PLAN_MEETINGS } from './data/samples.js'
import WorkloadMap from './WorkloadMap.jsx'
import Studio, { WORKLOAD_SHADES, LEAVE_PATTERN } from './Studio.jsx'
import { DigestInbox, digestClock, useDigestDelivery } from './Digests.jsx'
import { extractTasks, reviewErrors } from './lib/extractor.js'
import {
  useAppStore, todayISO, addDays, startOfWeek, weekDates, DAY_NAMES,
  cell, DAILY_LIMIT, taskRemaining, taskDay, deadlineRisk, transferCandidates,
  dashboardStats, isStale, staleDays, round1, workloadWeekBounds,
} from './lib/store.js'

export default function App() {
  const [state, update, reset] = useAppStore()
  const [selectedTab, setTab] = useState(null)
  const [studioDay, setStudioDay] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  useDigestDelivery(update)
  const me = state.users.find((u) => u.id === state.currentUserId)
  const isManager = me.role === 'manager'
  const tab = selectedTab || (isManager ? 'heatmap' : 'today')
  const pending = state.moveRequests.some((r) => r.toUserId === me.id && r.state === 'pending')

  const [dashboardView, setDashboardView] = useState('results')
  const [heatFocus, setHeatFocus] = useState(null)
  const tabs = isManager
    ? [['heatmap', 'Heatmap'], ['dashboard', 'Dashboard'], ['channels', 'Inbox'], ['plan', 'Plan'], ['studio', 'Studio']]
    : [['today', 'Task board'], ['heatmap', 'Heatmap'], ['channels', 'Inbox'], ['requests', 'Requests'], ['studio', 'Studio']]


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
              setHeatFocus(null)
              setDashboardView('results')
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
            onClick={() => { setStudioDay(null); setHeatFocus(null); setTab(key) }}>{label}{key === 'requests' && pending && <span className="notification-dot" aria-label="Pending requests" />}</button>
        ))}
      </nav>
      </header>

      <main>
        {tab !== 'today' && tab !== 'studio' && <Banner state={state} />}
        {tab === 'studio' && <Studio state={state} isManager={isManager}
          openChannels={() => setTab('channels')} openDigest={() => { setDashboardView('digests'); setTab('dashboard') }}
          onDay={(user, date) => { setStudioDay({ user, date }); setTab('heatmap') }} />}
        {tab === 'heatmap' && <HeatmapTab state={state} update={update} me={me} initialDay={studioDay} focus={heatFocus} />}
        {tab === 'channels' && <Inbox state={state} update={update} me={me} />}
        {tab === 'dashboard' && isManager && <>
          <nav className="tabs" aria-label="Dashboard sections">{[['results','Results'],['history','Change history'],['digests','Admin digests']].map(([key,label]) =>
            <button className={'tab' + (dashboardView === key ? ' active' : '')} key={key} aria-pressed={dashboardView === key} onClick={()=>setDashboardView(key)}>{label}</button>)}</nav>
          {dashboardView === 'results' && <DashboardTab state={state} onInspect={(focus) => { setStudioDay(null);setHeatFocus(focus);setTab('heatmap') }} />}
          {dashboardView === 'history' && <HistoryTab state={state} />}
          {dashboardView === 'digests' && <DigestInbox state={state} update={update} />}
        </>}
        {tab === 'plan' && isManager && <ProjectPlan users={state.users} onFinish={() => setTab('heatmap')} />}
        {tab === 'today' && !isManager && <TodayTab state={state} update={update} me={me} />}
        {tab === 'requests' && !isManager && <RequestsTab state={state} update={update} me={me} />}
      </main>
      <footer className="workspace-footer"><span>WorkLoad Radar · Demo workspace</span>
        <div>{confirmReset && <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>}
          <button type="button" onClick={() => {
            if (!confirmReset) { setConfirmReset(true); return }
            reset(); setTab(null); setStudioDay(null); setConfirmReset(false)
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
  const stale = state.users.filter((u) => u.role === 'member' && isStale(state, u.id) && (state.users.find(member => member.id === state.currentUserId)?.role === 'manager' || u.id === state.currentUserId))
  const myPending = state.moveRequests.filter((r) => r.state === 'pending' && r.toUserId === state.currentUserId)
  const items = []
  if (nextWeekOver.length) items.push({ text: 'Next week is overloaded: ' + [...new Set(nextWeekOver)].join(', '), tone: 'warn' })
  for (const user of stale) items.push({ text: user.name + " hasn’t logged progress for " + staleDays(state, user.id) + " days.", tone: 'critical' })
  if (myPending.length) items.push({ text: myPending.length + ' move request(s) awaiting your answer.', tone: 'ok' })
  return items.length ? <div role="status">{items.map(({text,tone}) =>
    <div className={'banner status-banner '+tone} key={text}><span aria-hidden="true" />{text}</div>)}</div> : null
}

// ---------- heatmap ----------
function HeatmapTab({ state, update, me, initialDay, focus }) {
  const [mode, setMode] = useState('all') // default shows hidden workload
  const [weekOffset, setWeekOffset] = useState(() => focus?.offset ?? (initialDay ? Math.round((Date.parse(startOfWeek(initialDay.date)) - Date.parse(startOfWeek(todayISO()))) / 604800000) : 0))
  const [selection, setSelection] = useState(initialDay)
  const monday = addDays(startOfWeek(todayISO()), weekOffset * 7)
  const week = weekDates(monday)
  const weekend = week.slice(5).some(date => state.tasks.some(task => task.status === 'approved' && [taskDay(task), task.deadline].includes(date)) ||
    state.meetings.some(meeting => meeting.date === date))
  const days = weekend ? week : week.slice(0, 5)
  const { first, last } = workloadWeekBounds(state)
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
  const flaggedDay = focus?.kind === 'overload' && days.find(date => members.some(user =>
    cell(state,user.id,date,'all').key === 'over' && cell(state,user.id,date,'planned').key !== 'over'))
  const visibleDay = days.includes(day) ? day : flaggedDay || hottestDay
  useEffect(() => {
    if (focus?.kind === 'risk') document.getElementById('deadline-watch')?.scrollIntoView({ block:'nearest' })
  }, [focus])

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
          <button className="btn ghost" onClick={() => { setWeekOffset((w) => w - 1) }} disabled={weekOffset <= first} aria-label="Previous week">‹</button>
          <strong aria-live="polite">{shortDate(monday)} – {shortDate(days.at(-1))}</strong>
          <button className="btn ghost" onClick={() => { setWeekOffset((w) => w + 1) }} disabled={weekOffset >= last} aria-label="Next week">›</button>
        </div>
      </div>

      <div className="map-date-tabs" role="group" aria-label="Choose a workload day">
        {days.map((date,i)=><button type="button" key={date} aria-pressed={date===visibleDay} onClick={()=>setDay(date)}>
          <span>{DAY_NAMES[i]}</span><strong>{shortDate(date)}</strong>
        </button>)}
      </div>
      <WorkloadMap state={state} members={members} date={visibleDay} mode={mode} onSelect={setSelection} highlight={focus?.kind === 'overload'} />

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
    ['Free · 0h', WORKLOAD_SHADES.slice(0, 1)], ['Light · 1–4h', WORKLOAD_SHADES.slice(1, 5)],
    ['Busy · 5–7h', WORKLOAD_SHADES.slice(5, 8)], ['Full · 8h', WORKLOAD_SHADES.slice(8, 9)],
    ['Over · >8h', WORKLOAD_SHADES.slice(9)], ['Leave', [LEAVE_PATTERN]],
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
  return <div className="inset" id="deadline-watch"><h3>Deadline watch</h3>
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
function ResultsCards({ state, monday, compact, onInspect }) {
  const stats = dashboardStats(state, monday)
  return <div className="stat-grid">
    <div className="stat"><span className="big">{stats.hiddenPct}%</span><strong>Hidden workload</strong><span>{stats.hiddenHours}h of {stats.totalHours}h remaining came from chats and emails</span></div>
    <div className="stat"><span className="big">{stats.overloadCaught}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('overload')}>Overload days surfaced</button> : 'Overload days surfaced'}</strong><span>Person-days missed by the planned-only view</span></div>
    <div className="stat"><span className="big">{stats.atRisk}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('risk')}>Deadlines at risk</button> : 'Deadlines at risk'}</strong><span>Open tasks across all dates</span></div>
    {!compact && <>
      <div className="stat"><span className="big">{stats.completed}</span><strong>Tasks completed</strong><span>Scheduled this week</span></div>
      <div className="stat"><span className="big">{stats.accuracy === null ? '—' : stats.accuracy + '%'}</span><strong>Extraction accuracy</strong><span>On uploaded demo messages</span></div>
    </>}
  </div>
}
function DashboardTab({ state, onInspect }) {
  const [offset,setOffset] = useState(0)
  const { first,last } = workloadWeekBounds(state)
  const monday = addDays(startOfWeek(todayISO()),offset*7)
  const days = weekDates(monday)
  const totals = state.users.filter(user=>user.role==='member').map(user=>({
    user, plan:round1(days.reduce((sum,date)=>sum+cell(state,user.id,date,'planned').total,0)),
    actual:round1(days.reduce((sum,date)=>sum+cell(state,user.id,date,'all').total,0)),
  }))
  const peak=Math.max(1,...totals.map(row=>row.actual))
  const hours=source=>round1(state.tasks.filter(task=>task.status==='approved' && task.source===source && days.includes(taskDay(task))).reduce((sum,task)=>sum+taskRemaining(task),0))
  const whatsapp=hours('whatsapp'), email=hours('email'), total=whatsapp+email
  return <section className="dashboard">
    <div className="section-heading"><h1>Results dashboard</h1><p>Approved work for the week of {shortDate(monday)}</p></div>
    <div className="weeknav"><button className="btn ghost" disabled={offset<=first} onClick={()=>setOffset(offset-1)} aria-label="Previous week">‹</button>
      <strong>{shortDate(monday)} – {shortDate(days.at(-1))}</strong><button className="btn ghost" disabled={offset>=last} onClick={()=>setOffset(offset+1)} aria-label="Next week">›</button></div>
    <ResultsCards state={state} monday={monday} onInspect={focus=>onInspect({kind:focus,offset})} />
    <div className="dashboard-bars"><h2>Planned and actual workload</h2>{totals.map(({user,plan,actual})=><div key={user.id}>
      <strong>{user.name}</strong><div>Planned {plan}h <div className="bar-track"><span style={{width:100*plan/peak+'%'}} /></div></div>
      <div>Actual {actual}h <div className="bar-track actual"><span style={{width:100*actual/peak+'%'}} /></div></div>
    </div>)}
    <h2>Hidden hours by source</h2><p>WhatsApp {whatsapp}h · Email {email}h</p>
    <div className="bar-track split"><span style={{width:(total?100*whatsapp/total:0)+'%'}} /><span style={{width:(total?100*email/total:0)+'%'}} /></div></div>
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
      <div className="section-heading"><h1>Change history</h1><p>Review workload changes and progress updates.</p></div>
      {entries.length === 0 && <p className="empty">No changes yet.</p>}
      <ul className="history">
        {entries.map((h) => (
          <li key={h.id}>
            <span className="when">{new Intl.DateTimeFormat('en-GB', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(h.when))}</span>
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
  const [undo, setUndo] = useState(null)
  useEffect(() => {
    if (!undo) return
    const timeout = setTimeout(() => setUndo(null), 5000)
    return () => clearTimeout(timeout)
  }, [undo])
  const tasks = state.tasks.filter((task) => task.owner === me.id && task.status === 'approved')
    .map((task) => ({ task, risk: deadlineRisk(state, task) }))
    .filter(({ task, risk }) => taskDay(task) === today || task.deadline === today || risk?.atRisk)
    .sort((a, b) => Number(Boolean(b.risk?.atRisk)) - Number(Boolean(a.risk?.atRisk)) ||
      a.task.deadline.localeCompare(b.task.deadline) || taskRemaining(b.task) - taskRemaining(a.task))
  const meetings = state.meetings.filter((m) => (m.owner === me.id || m.owner === 'everyone') && m.date === today)
  const capacity = cell(state, me.id, today, 'all')
  const active = tasks.find(({ task }) => task.id === editing)?.task
  const progressDialog = useRef(null)
  useLayoutEffect(() => { if (active && !progressDialog.current.open) progressDialog.current.showModal() }, [active])
  return <section className="today-board">
    <div className="section-heading"><h1>Task board</h1><p>Demo date {shortDate(today)} · Today’s work and deadlines needing attention · {capacity.available}h work capacity</p></div>
    <Banner state={state} />
    <LegacyDates state={state} update={update} me={me} />
    {undo && <div className="banner ok" role="status">Task marked done. <button className="btn tiny" onClick={() => { undo(); setUndo(null) }}>Undo</button></div>}
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
          <button className="btn primary" onClick={() => { const revert = logProgress(update, state, task, 100); setUndo(() => revert) }}>Done</button>
        </div> : <span className="muted">Completed</span>}
      </li>)}
    </ul>
    {(capacity.onLeave || meetings.length > 0) && <div className="inset"><h3>Calendar commitments</h3>
      {capacity.onLeave && <div>Leave · 0h available for work</div>}
      {meetings.map((m) => <div key={m.id}>{m.name} · {m.hours}h meeting</div>)}
    </div>}
    {active && <dialog ref={progressDialog} className="modal progress-dialog" aria-label="Log your progress" onClose={() => setEditing(null)}>
      <form onSubmit={(event) => {
        event.preventDefault()
        const hours = Number(new FormData(event.currentTarget).get('hours'))
        logProgress(update, state, active, active.hours > 0 ? Math.min(100, hours / active.hours * 100) : 100)
        progressDialog.current.close()
      }}>
        <h3>Log your progress</h3><p>{active.name} · {active.hours}h estimated</p>
        <label className="progress-field">Total hours worked<input name="hours" type="number" min="0" step="0.1" required autoFocus
          defaultValue={round1(active.hours - taskRemaining(active))} /></label>
        <div className="logbtns"><button type="button" className="btn ghost" onClick={() => progressDialog.current.close()}>Cancel</button><button className="btn primary">Save progress</button></div>
      </form>
    </dialog>}
  </section>
}

function LegacyDates({ state, update, me }) {
  const items = (state.needsConfirmation || []).filter(item => item.owner === me.id)
  if (!items.length) return null
  return <div className="inset"><h3>Needs a date</h3>{items.map(item => <form key={item.id} onSubmit={event => {
    event.preventDefault()
    const deadline = new FormData(event.currentTarget).get('deadline')
    update(current => ({ ...current, needsConfirmation: current.needsConfirmation.filter(entry => entry.id !== item.id),
      tasks: [...current.tasks, { ...item, id: crypto.randomUUID(), deadline, source: item.source || 'chat', status: 'approved', progress: 0 }] }))
  }}><label>{item.name} <input type="date" name="deadline" required /></label> <button className="btn tiny">Confirm</button></form>)}</div>
}

function logProgress(update, state, task, percent) {
  const me = state.users.find(user => user.id === state.currentUserId)
  const logId = crypto.randomUUID(), historyId = crypto.randomUUID()
  const time = new Date(digestClock(state)).toISOString()
  update(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === task.id ? { ...t, progress: percent } : t),
    progressLogs: [...s.progressLogs, { id: logId, taskId: task.id, userId: me.id, percent, taskName: task.name, at: time }],
    history: [...s.history, { id: historyId, when: time, actor: me.name, action: 'Logged progress', detail: task.name + ' → ' + percent + '%' }],
  }))
  return () => update(s => ({
    ...s,
    tasks: s.tasks.map(t => t.id === task.id && t.progress === percent ? { ...t, progress: task.progress || 0 } : t),
    progressLogs: s.progressLogs.filter(log => log.id !== logId),
    history: s.history.filter(entry => entry.id !== historyId),
  }))
}

// ---------- member: upload & review ----------
const inboxSources = [['whatsapp', 'WhatsApp'], ['email', 'Email']]

function Inbox({ state, update, me }) {
  const manager = me.role === 'manager'
  const linked = state.connections?.[me.id] || {}
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const sampleIds = MEMBER_UPLOADS[me.id] || []
  const available = SAMPLE_MESSAGES.filter(m => sampleIds.includes(m.id) && linked[m.source] && !reviewed.has(m.id))
  function toggle(source) {
    update(s => ({...s, connections:{...s.connections,[me.id]:{...s.connections?.[me.id],[source]:!s.connections?.[me.id]?.[source]}}}))
  }
  return <section className="studio-shell">
    <div className="section-heading"><h1>Inbox</h1><p>Connect demo channels and review extracted work.</p></div>
    <div className="channel-grid">{inboxSources.map(([source,label])=><article className="inset" key={source}>
      <h3>{label}</h3>
      {manager ? <p>{state.users.filter(user=>state.connections?.[user.id]?.[source]).length} teammates connected in this demo</p> : <>
        <p>{linked[source] ? available.filter(m=>m.source===source).length + ' new demo messages' : 'Demo channel disconnected'}</p>
        <button className="btn" onClick={()=>toggle(source)}>{linked[source]?'Disconnect':'Connect demo '+label}</button>
      </>}
    </article>)}</div>
    {!manager && <UploadTab state={state} update={update} me={me} connected={Object.values(linked).some(Boolean)} />}
    {manager && <p className="muted">Teammates review their own findings. Managers see connection counts and approved work.</p>}
  </section>
}

function UploadTab({ state, update, me, connected = false }) {
  const [phase, setPhase] = useState('idle') // idle | working | review | done
  const [results, setResults] = useState([]) // { messageId, tasks, error, finalTasks }
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fault, setFault] = useState('none')
  const [filter, setFilter] = useState('all')
  const [snippets, setSnippets] = useState({})
  const myIds = MEMBER_UPLOADS[me.id] || []
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const messages = SAMPLE_MESSAGES.filter(m => myIds.includes(m.id) && !reviewed.has(m.id) &&
    (!connected || state.connections?.[me.id]?.[m.source]))
  const alreadyUploaded = messages.length === 0

  async function run() {
    setPhase('working')
    setProgress({ done: 0, total: messages.length })
    const res = await extractTasks(messages, fault, (done, total) => setProgress({ done, total }), state, me.id)
    // Privacy rule: raw text is processed and discarded — we only keep the
    // extracted fields below; msg.text never enters app state.
    // Owner-only review snippets live in this mounted component, never in the shared store.
    setSnippets(Object.fromEntries(messages.map(message => [message.id, message.text.replace(/\s+/g, ' ').slice(0, 120)])))
    setFilter('all')
    setResults(res)
    setPhase('review')
  }

  const retained = results.flatMap(result => result.finalTasks ?? result.tasks)
  const errorsFor = retained.map(reviewErrors)
  const needsDate = errorsFor.filter(error => error.deadline).length
  const invalid = errorsFor.some(error => Object.keys(error).length)

  function approveAll() {
    const newTasks = []
    const newMeetings = []
    if (invalid) return
    for (const r of results) {
      for (const t of r.finalTasks ?? r.tasks ?? []) {
        if (t.duplicate && !t.keepDuplicate) continue
        if (t.isMeeting || t.duplicateOf?.kind === 'meeting') {
          newMeetings.push({ id: crypto.randomUUID(), name: t.name.trim(), owner: me.id, date: t.deadline, hours: Number(t.hours) })
        } else {
          newTasks.push({
            id: 'x' + Math.random().toString(36).slice(2), name: t.name.trim(), owner: me.id,
            hours: Number(t.hours), deadline: t.deadline, source: t.source || 'chat',
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
      uploads: { ...s.uploads, [me.id]: { messageIds: [...(s.uploads[me.id]?.messageIds || []), ...results.filter(r => !r.error || r.finalTasks?.length).map(r => r.messageId)], extracted: [...(s.uploads[me.id]?.extracted || []), ...results.map((r) => ({ messageId: r.messageId, tasks: r.tasks, finalTasks: r.finalTasks ?? r.tasks, error: r.error || null }))] } },
      history: [...s.history, {
        id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
        action: 'Approved extracted findings',
        detail: `${newTasks.length} task(s) and ${newMeetings.length} meeting(s) added${errors.length ? `, ${errors.length} couldn't be read` : ''}`,
      }],
    }))
    setSnippets({})
    setPhase('done')
  }

  function setFinal(messageId, tasks) {
    setResults((rs) => rs.map((r) => r.messageId === messageId ? { ...r, finalTasks: tasks } : r))
  }

  if (phase === 'working') {
    return (
      <section>
        <div className="section-heading"><h1>Reading messages</h1><p>{progress.done} of {progress.total} processed</p></div>
        <div className="progressline big"><div className="progressfill" style={{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }} /></div>
      </section>
    )
  }

  if (phase === 'review') {
    return (
      <section>
        <div className="section-heading"><h1>Review findings</h1><p>{retained.length} tasks found · {needsDate} need a date · {retained.filter(task => task.duplicate).length} possible duplicates · {results.filter(result => result.error).length} errors</p></div>
        <div className="toggle" aria-label="Filter results">{[['all','All'],['attention','Needs attention'],['duplicates','Duplicates'],['errors','Errors']].map(([key,label]) =>
          <button key={key} className={filter===key?'on':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
        {results.filter(result => {
          const items = result.finalTasks ?? result.tasks
          if (filter === 'duplicates') return items.some(task => task.duplicate)
          if (filter === 'errors') return !!result.error
          if (filter === 'attention') return items.some(task => Object.keys(reviewErrors(task)).length || task.confidence === 'low') || !!result.error
          return true
        }).map((r) => {
          const sample = SAMPLE_MESSAGES.find((s) => s.id === r.messageId)
          return (
            <div key={r.messageId} className="review-card">
              <div className="review-head">
                <span className="src">{sample.source}</span> from {sample.from}
                {r.error && <span className="error"> — ⚠️ {r.error} <button className="btn tiny" onClick={() => {
                  setFinal(r.messageId, [{ name: '', hours: 1, deadline: todayISO(), source: sample.source, confidence: 'manual', manual: true }])
                }}>Add manually</button></span>}
              </div>
              <p className="source-snippet">{snippets[r.messageId]}</p>
              {(r.finalTasks ?? r.tasks).length === 0 && !r.error && <p className="muted">No tasks found in this message.</p>}
              {(r.finalTasks ?? r.tasks).map((t, i) => {
                const patch = (changes) => setFinal(r.messageId, (r.finalTasks ?? r.tasks).map((item, index) => index === i ? { ...item, ...changes } : item))
                if (t.duplicate && !t.keepDuplicate) return <div className="inset" key={i}>
                  <p>Looks like <strong>{t.duplicateOf?.name || t.name}</strong>, already in your {t.duplicateOf?.kind === 'meeting' ? 'calendar' : 'plan'}.</p>
                  <button className="btn ghost" aria-pressed="true" onClick={() => patch({ keepDuplicate: false })}>Skip</button>
                  <button className="btn" onClick={() => patch({ keepDuplicate: true })}>Add anyway</button>
                </div>
                const errors = reviewErrors(t)
                return <div key={i} className={'found-task' + (t.confidence === 'low' ? ' uncertain' : '')}>
                  <label>Name <input value={t.name} aria-invalid={!!errors.name} onChange={e => patch({ name: e.target.value })} />
                    {errors.name && <small className="error">{errors.name}</small>}</label>
                  <label>Hours <input type="number" step="0.5" min="0.5" max="24" value={t.hours} aria-invalid={!!errors.hours} onChange={e => patch({ hours: e.target.value })} />
                    {errors.hours && <small className="error">{errors.hours}</small>}</label>
                  <label>Deadline <input type="date" value={t.deadline || ''} aria-invalid={!!errors.deadline} onChange={e => patch({ deadline: e.target.value, needsDate: !e.target.value })} />
                    {errors.deadline && <small className="error">{errors.deadline}</small>}</label>
                  <button className="btn tiny danger" aria-label={'Delete '+t.name} onClick={() => setFinal(r.messageId, (r.finalTasks ?? r.tasks).filter((_, j) => j !== i))}>×</button>
                </div>
              })}
            </div>
          )
        })}
        <div className="review-actions">
          {needsDate > 0 && <p role="status">{needsDate} {needsDate === 1 ? 'item needs' : 'items need'} a date before you can approve.</p>}
          <button className="btn primary" disabled={invalid} onClick={approveAll}>Approve &amp; add to my workload</button>
          <button className="btn ghost" onClick={() => { setSnippets({}); setPhase('idle') }}>Cancel</button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="section-heading"><h1>Extract and review</h1><p>Check findings before adding work to the heatmap.</p></div>
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
  if (!mine.length) return <section><div className="section-heading"><h1>Move requests</h1><p>No move requests for you right now.</p></div></section>
  return (
    <section>
      <div className="section-heading"><h1>Move requests</h1><p>Review work teammates want to transfer.</p></div>
      {mine.map((r) => {
        const task = state.tasks.find((t) => t.id === r.taskId)
        const from = state.users.find((u) => u.id === r.fromUserId)
        return (
          <div key={r.id} className={'request ' + r.state}>
            <div>
              <strong>{task ? task.name : '(deleted task)'}</strong> — {from?.name} → you
              {r.suggestedByAI && <span className="pill">AI suggestion</span>}
              <div className="muted">Requested {new Intl.DateTimeFormat('en-GB', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(r.createdAt))}</div>
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
