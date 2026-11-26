import { decide } from '../lib/transfers.js'

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
