import { cell, taskDay } from '../lib/store.js'

export default function RequestsTab({ state, update, me }) {
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
      id: crypto.randomUUID(), when: new Date().toISOString(), actor: me.name,
      action: decision === 'approved' ? 'Approved move' : 'Declined move',
      detail: decision === 'approved'
        ? `"${task.name}" moved from ${from.name} to ${to.name} on ${day}. ${from.name}: ${fromBefore}h → ${fromAfter}h; ${to.name}: ${toBefore}h → ${toAfter}h`
        : `"${task.name}" stays with ${from.name} — manager notified`,
    }],
  }))
}
