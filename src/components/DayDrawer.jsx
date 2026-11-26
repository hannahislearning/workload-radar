import { useLayoutEffect, useRef } from 'react'
import { cell, taskRemaining, taskDay, allocatedHours, deadlineRisk, round1 } from '../lib/store.js'
import { shortDate } from '../lib/format.js'
import { requestMove } from '../lib/transfers.js'
import MovePicker from './MovePicker.jsx'
import RiskFlag from './RiskFlag.jsx'

export default function DayDrawer({ state, update, selection, mode, isManager, onDismiss }) {
  const dialogRef = useRef(null)
  const pickerRef = useRef(null)
  const { user, date } = selection
  const summary = cell(state, user.id, date, mode)
  const tasks = state.tasks.filter((task) =>
    task.owner === user.id && task.status === 'approved' && taskRemaining(task) > 0 &&
    (allocatedHours(state, task, date) > 0 || task.deadline === date) && (mode === 'all' || task.source === 'plan'))
  const meetings = state.meetings.filter((meeting) =>
    meeting.date === date && (meeting.owner === user.id || meeting.owner === 'everyone'))
  const requests = state.moveRequests.filter((request) => request.state === 'pending')
  const pendingFor = (task) => requests.find((request) => request.taskId === task.id)
  const groups = [
    ['Tasks due this day', tasks.filter((task) => task.deadline === date)],
    ['Scheduled tasks', tasks.filter((task) => allocatedHours(state, task, date) > 0 && task.deadline !== date)],
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
      <div className="drawer-summary"><strong>{summary.total}h committed</strong><span>{summary.label} · {summary.available}h work capacity of {summary.limit}h</span></div>
      {summary.onLeave && <p className="drawer-note">On leave · 0h available for work</p>}
      {groups.map(([heading, items]) => <section className="drawer-section" key={heading}>
        <h3>{heading}</h3>
        {items.length === 0 ? <p className="muted">None</p> : <ul className="drawer-task-list">
          {items.map((task) => {
            const pending = pendingFor(task)
            return <li key={task.id}>
              <div className="drawer-task-line"><strong>{task.name}</strong><span>{task.hours}h est.</span></div>
              <p className="muted">{round1(taskRemaining(task))}h left · Due {shortDate(task.deadline)}
                {allocatedHours(state, task, date) > 0 ? ' · ' + round1(allocatedHours(state, task, date)) + 'h allocated today' : ' · Scheduled ' + shortDate(taskDay(task))}</p>
              <RiskFlag risk={deadlineRisk(state, task)} deadline={task.deadline} />
              {pending ? <p className="drawer-note">Waiting for {state.users.find((member) => member.id === pending.toUserId)?.name}’s approval</p>
                : isManager && <button type="button" className="btn tiny" onClick={() => requestMove(update, state, task, date)}>Move task</button>}
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
