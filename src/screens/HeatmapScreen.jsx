import { useEffect, useState } from 'react'
import { todayISO, addDays, startOfWeek, weekDates, DAY_NAMES, cell, taskRemaining, taskDay, deadlineRisk, transferCandidates, workloadWeekBounds } from '../lib/store.js'
import { shortDate, candidateDetail } from '../lib/format.js'
import { requestMove } from '../lib/transfers.js'
import WorkloadMap from '../WorkloadMap.jsx'
import DayDrawer from '../components/DayDrawer.jsx'
import HeatmapLegend from '../components/HeatmapLegend.jsx'
import RiskFlag from '../components/RiskFlag.jsx'
import ResultsCards from '../components/ResultsCards.jsx'

export default function HeatmapTab({ state, update, me, initialDay, focus }) {
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
