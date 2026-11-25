import React, { useState } from 'react'
import { SAMPLE_MESSAGES, MEMBER_UPLOADS } from './data/samples.js'
import { extractTasks } from './lib/extractor.js'
import {
  useAppStore, todayISO, addDays, startOfWeek, weekDates, DAY_NAMES,
  cell, DAILY_LIMIT, taskRemaining, taskDay, isAtRisk,
  dashboardStats, isStale, staleDays, STALE_DAYS, round1,
} from './lib/store.js'

export default function App() {
  const [state, update, reset] = useAppStore()
  const [tab, setTab] = useState('heatmap')
  const me = state.users.find((u) => u.id === state.currentUserId)
  const isManager = me.role === 'manager'

  const tabs = isManager
    ? [['heatmap', 'Heatmap'], ['dashboard', 'Dashboard'], ['history', 'Change history']]
    : [['today', "Today's tasks"], ['heatmap', 'Heatmap'], ['upload', 'Upload & review'], ['requests', 'Requests']]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">📡 WorkLoad Radar <span className="tag">prototype</span></div>
        <div className="switcher">
          <label htmlFor="user">Signed in as</label>
          <select id="user" value={state.currentUserId}
            onChange={(e) => update((s) => ({ ...s, currentUserId: e.target.value }))}>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
          <button className="btn ghost" onClick={(e) => {
            if (e.target.textContent === 'Reset demo') { e.target.textContent = 'Really reset?'; return }
            reset(); e.target.textContent = 'Reset demo'
          }}>Reset demo</button>
        </div>
      </header>

      <Banner state={state} />

      <nav className="tabs" aria-label="Main navigation">
        {tabs.map(([key, label]) => (
          <button key={key} className={'tab' + (tab === key ? ' active' : '')}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      <main>
        {tab === 'heatmap' && <HeatmapTab state={state} update={update} me={me} />}
        {tab === 'dashboard' && isManager && <DashboardTab state={state} />}
        {tab === 'history' && isManager && <HistoryTab state={state} />}
        {tab === 'today' && !isManager && <TodayTab state={state} update={update} me={me} />}
        {tab === 'upload' && !isManager && <UploadTab state={state} update={update} me={me} />}
        {tab === 'requests' && !isManager && <RequestsTab state={state} update={update} me={me} />}
      </main>

      <MovePicker state={state} update={update} />
    </div>
  )
}

// ---------- summary banner (next-week warning + stale alerts + pending requests) ----------
function Banner({ state }) {
  const nextWeekStart = addDays(startOfWeek(todayISO()), 7)
  const nextWeekOver = []
  for (let d = 0; d < 7; d++) {
    const iso = addDays(nextWeekStart, d)
    for (const u of state.users.filter((u) => u.role === 'member')) {
      if (cell(state, u.id, iso, 'all').total >= 9) {
        nextWeekOver.push(`${u.name} on ${DAY_NAMES[(new Date(iso).getDay() + 6) % 7]}`)
      }
    }
  }
  const stale = state.users.filter((u) => u.role === 'member' && isStale(state, u.id))
  const myPending = state.moveRequests.filter((r) => r.state === 'pending' && r.toUserId === state.currentUserId)
  const items = []
  if (nextWeekOver.length) items.push(`⚠️ Next week is overloaded: ${[...new Set(nextWeekOver)].join(', ')}`)
  for (const u of stale) {
    items.push(`🚨 ${u.name} hasn't logged progress for ${staleDays(state, u.id)} days (alert after ${STALE_DAYS}).`)
  }
  if (myPending.length) items.push(`📨 You have ${myPending.length} move request${myPending.length > 1 ? 's' : ''} waiting for your answer.`)
  if (!items.length) return <div className="banner ok">✅ Nothing at risk right now. All logged days are within limits.</div>
  return <div className="banner warn" role="alert">{items.map((t, i) => <div key={i}>{t}</div>)}</div>
}

// ---------- heatmap ----------
function HeatmapTab({ state, update, me }) {
  const [mode, setMode] = useState('all') // default shows hidden workload
  const [weekOffset, setWeekOffset] = useState(0)
  const [flipped, setFlipped] = useState(null) // 'userId|iso' currently flipped
  const monday = addDays(startOfWeek(todayISO()), weekOffset * 7)
  const days = weekDates(monday)
  const members = state.users.filter((u) => u.role === 'member')
  const isManager = me.role === 'manager'

  return (
    <section>
      <div className="toolbar">
        <div className="toggle" role="group" aria-label="Workload view">
          <button className={mode === 'planned' ? 'on' : ''} onClick={() => setMode('planned')}>Planned work only</button>
          <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Planned + chat &amp; email <span className="pill">default</span></button>
        </div>
        <div className="weeknav">
          <button className="btn ghost" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">← Prev</button>
          <strong>{monday}</strong>
          <button className="btn ghost" onClick={() => setWeekOffset((w) => Math.min(2, w + 1))} disabled={weekOffset >= 2} aria-label="Next week">Next →</button>
        </div>
      </div>

      <div className="heatmap-scroll" tabIndex={0} aria-label="Team workload heatmap">
        <table className="heatmap">
          <thead>
            <tr>
              <th scope="col">Person</th>
              {days.map((iso) => (
                <th key={iso} scope="col" className={iso === todayISO() ? 'today' : ''}>
                  {DAY_NAMES[(new Date(iso).getDay() + 6) % 7]}<br /><span className="date">{iso.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id}>
                <th scope="row">{u.name}</th>
                {days.map((iso) => {
                  const c = cell(state, u.id, iso, mode)
                  const key = u.id + '|' + iso
                  const tasksHere = state.tasks.filter((t) =>
                    t.owner === u.id && t.status === 'approved' && taskDay(t) === iso &&
                    (mode === 'all' || t.source === 'plan'))
                  const meetingsHere = state.meetings.filter((m) => (m.owner === u.id || m.owner === 'everyone') && m.date === iso)
                  const hasPending = state.moveRequests.some((r) => r.state === 'pending' && (r.toUserId === u.id || r.fromUserId === u.id))
                  return (
                    <td key={iso} className={c.cls + (iso === todayISO() ? ' today' : '')}>
                      <button
                        className={'cellbtn' + (flipped === key ? ' flipped' : '')
                          + (hasPending ? ' pending' : '')}
                        onClick={() => setFlipped(flipped === key ? null : key)}
                        aria-expanded={flipped === key}
                        aria-label={`${u.name}, ${iso}: ${c.label}, ${c.total} hours. View tasks`}>
                        <span className="hours">{c.onLeave ? '—' : c.total + 'h'}</span>
                        <span className="statuslabel">{c.label}</span>
                      </button>
                      {flipped === key && (
                        <div className="card-flip">
                          <strong>Tasks behind this box</strong>
                          {tasksHere.length === 0 && meetingsHere.length === 0 && <p className="muted">Nothing scheduled.</p>}
                          {tasksHere.map((t) => (
                            <div key={t.id} className={'mini-task' + (isAtRisk(state, t) ? ' risky' : '')}>
                              <span>{t.name}</span>
                              <span className="muted">{taskRemaining(t)}h left · due {t.deadline}
                                {t.source !== 'plan' && ` · from ${t.source}`}
                                {isAtRisk(state, t) && ' · ⚠️ at risk'}</span>
                              {isManager && (
                                <button className="btn tiny" onClick={() => requestMove(update, state, t)}>Move…</button>
                              )}
                            </div>
                          ))}
                          {meetingsHere.map((m) => (
                            <div key={m.id} className="mini-task meeting"><span>🗓 {m.name}</span><span className="muted">{m.hours}h meeting</span></div>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="legend">
        <span className="chip status-light">Light ≤4h</span>
        <span className="chip status-busy">Busy 5–7h</span>
        <span className="chip status-full">Full 8h</span>
        <span className="chip status-over">Over 9h+</span>
        <span className="chip status-leave">Leave</span>
        · dashed outline = move request pending · click a box to flip it
      </p>
    </section>
  )
}

function requestMove(update, state, task) {
  if (state.moveRequests.some((r) => r.taskId === task.id && r.state === 'pending')) return 'duplicate'
  const candidates = state.users.filter((u) => u.role === 'member' && u.id !== task.owner)
  // AI suggestion: the member with the most free hours on the task's deadline day
  let best = null
  let bestFree = -1
  for (const u of candidates) {
    const c = cell(state, u.id, taskDay(task), 'all')
    const free = DAILY_LIMIT - c.total
    if (free > bestFree) { bestFree = free; best = u }
  }
  update((s) => ({ ...s, movePicker: { taskId: task.id, suggestion: best.id } }))
}

function MovePicker({ state, update }) {
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
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-label={`Move ${task.name}`} onClick={(e) => e.stopPropagation()}>
        <h3>Move “{task.name}”</h3>
        <p className="muted">Currently with {from.name}, due {taskDay(task)}. Who should take it?</p>
        <ul className="picker-list">
          {state.users.filter((u) => u.role === 'member' && u.id !== task.owner).map((u) => {
            const c = cell(state, u.id, taskDay(task), 'all')
            return (
              <li key={u.id}>
                <button className="btn" onClick={() => choose(u.id)}>
                  {u.name} — {c.label} ({c.total}h on {taskDay(task)})
                </button>
                {u.id === pick.suggestion && <span className="pill ai">AI suggestion</span>}
              </li>
            )
          })}
        </ul>
        <button className="btn ghost" onClick={close}>Cancel</button>
      </div>
    </div>
  )
}

// ---------- manager: dashboard ----------
function DashboardTab({ state }) {
  const stats = dashboardStats(state)
  return (
    <section className="dashboard">
      <h2>Results dashboard</h2>
      <div className="stat-grid">
        <div className="stat"><span className="big">{stats.hiddenPct}%</span><span>of workload was hidden in chats &amp; emails</span></div>
        <div className="stat"><span className="big">{stats.overloadCaught}</span><span>overloaded day(s) caught that "planned only" hid</span></div>
        <div className="stat"><span className="big">{stats.atRisk}</span><span>task(s) currently flagged at deadline risk</span></div>
        <div className="stat"><span className="big">{stats.onTime}</span><span>task(s) completed</span></div>
        <div className="stat"><span className="big">{stats.accuracy === null ? '—' : stats.accuracy + '%'}</span><span>extraction accuracy on uploaded sample messages (target ≥85%)</span></div>
      </div>
      <p className="muted">Numbers are computed live from the approved tasks in state (see <code>src/lib/store.js</code>).</p>
    </section>
  )
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
  const tasks = state.tasks
    .filter((t) => t.owner === me.id && t.status === 'approved' && taskDay(t) === today)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : taskRemaining(b) - taskRemaining(a)))
  const meetings = state.meetings.filter((m) => (m.owner === me.id || m.owner === 'everyone') && m.date === today)
  return (
    <section>
      <h2>Today's tasks — {today}</h2>
      {tasks.length === 0 && <p className="empty">Nothing due today. 🎉</p>}
      <ul className="todaylist">
        {tasks.map((t) => (
          <li key={t.id} className={isAtRisk(state, t) ? 'risky' : ''}>
            <div>
              <strong>{t.name}</strong>
              <div className="muted">{taskRemaining(t)}h left of {t.hours}h · due {t.deadline}
                {t.source !== 'plan' && ` · from ${t.source}`}{isAtRisk(state, t) && ' · ⚠️ at risk of missing deadline'}</div>
              <div className="progressline" role="progressbar" aria-valuenow={t.progress || 0} aria-valuemin={0} aria-valuemax={100}>
                <div className="progressfill" style={{ width: (t.progress || 0) + '%' }} />
              </div>
            </div>
            <div className="logbtns">
              {[25, 50, 100].map((p) => (
                <button key={p} className="btn" onClick={() => logProgress(update, state, t, p)}
                  disabled={(t.progress || 0) >= p}>{p === 100 ? 'Done' : p + '%'}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {meetings.length > 0 && (
        <div className="meetings-today">
          <h3>Meetings today</h3>
          {meetings.map((m) => <div key={m.id}>🗓 {m.name} — {m.hours}h</div>)}
        </div>
      )}
    </section>
  )
}

function logProgress(update, state, task, percent) {
  const me = state.users.find((u) => u.id === state.currentUserId)
  update((s) => ({
    ...s,
    tasks: s.tasks.map((t) => t.id === task.id ? { ...t, progress: percent } : t),
    progressLogs: [...s.progressLogs, {
      id: 'pl' + Date.now(), taskId: task.id, userId: s.currentUserId,
      percent, at: new Date().toISOString(),
    }],
    history: [...s.history, {
      id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
      action: 'Logged progress', detail: `"${task.name}" → ${percent}%`,
    }],
  }))
}

// ---------- member: upload & review ----------
function UploadTab({ state, update, me }) {
  const [phase, setPhase] = useState('idle') // idle | working | review | done
  const [results, setResults] = useState([]) // { messageId, tasks, error, finalTasks }
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fault, setFault] = useState('none')
  const myIds = MEMBER_UPLOADS[me.id] || []
  const messages = SAMPLE_MESSAGES.filter((m) => myIds.includes(m.id))
  const alreadyUploaded = !!state.uploads[me.id]

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
    const needsConfirm = []
    for (const r of results) {
      for (const t of r.finalTasks ?? r.tasks ?? []) {
        if (t.needsDate || t.deadline === 'confirm' || t.deadline == null) {
          needsConfirm.push({ id: 'nc' + Math.random(), messageId: r.messageId, name: t.name, hours: t.hours, owner: me.id })
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
      needsConfirmation: [...s.needsConfirmation, ...needsConfirm],
      uploads: { ...s.uploads, [me.id]: { messageIds: messages.map((m) => m.id), extracted: results.map((r) => ({ messageId: r.messageId, tasks: r.tasks, finalTasks: r.finalTasks ?? r.tasks, error: r.error || null })) } },
      history: [...s.history, {
        id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
        action: 'Approved extracted tasks',
        detail: `${newTasks.length} task(s) added, ${needsConfirm.length} need date confirmation${errors.length ? `, ${errors.length} couldn't be read` : ''}`,
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
      <h2>Upload your emails &amp; WhatsApp chats</h2>
      {phase === 'done' && <p className="banner ok">Approved! Your tasks are now on the heatmap.</p>}
      {alreadyUploaded && phase !== 'done' && <p className="banner ok">You already uploaded and approved your messages. Reset the demo to try again.</p>}
      <div className="upload-sim">
        <p className="muted">Prototype: instead of a real inbox, pick a fake upload bundle for <strong>{me.name}</strong> ({myIds.length} sample messages: chats, emails, vague dates, spam and duplicates).</p>
        <label className="faultpick">Simulate AI fault (for testing failure handling):
          <select value={fault} onChange={(e) => setFault(e.target.value)}>
            <option value="none">None — normal run</option>
            <option value="timeout">Timeout on one message</option>
            <option value="badjson">Unreadable AI answer on one message</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={alreadyUploaded}>
          {alreadyUploaded ? 'Already uploaded' : `Upload & let AI read ${myIds.length} messages`}
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
  const fromAfter = decision === 'approved' ? round1(fromBefore - taskRemaining(task)) : fromBefore
  const toAfter = decision === 'approved' ? round1(toBefore + taskRemaining(task)) : toBefore
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
