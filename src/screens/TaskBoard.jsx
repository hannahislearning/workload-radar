import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { todayISO, cell, taskRemaining, taskDay, deadlineRisk, round1 } from '../lib/store.js'
import { digestClock } from '../lib/digests.js'
import { shortDate } from '../lib/format.js'
import Toast from '../components/Toast.jsx'
import Banner from '../components/Banner.jsx'
import RiskFlag from '../components/RiskFlag.jsx'

export default function TodayTab({ state, update, me }) {
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
    {undo && <Toast onUndo={() => { undo(); setUndo(null) }} />}
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
