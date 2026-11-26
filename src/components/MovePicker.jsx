import { transferCandidates } from '../lib/store.js'
import { shortDate, candidateDetail } from '../lib/format.js'

export default function MovePicker({ state, update, headingRef }) {
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
        id: crypto.randomUUID(), taskId: task.id, fromUserId: task.owner, toUserId: target.id,
        requestedBy: s.currentUserId, state: 'pending', createdAt: new Date().toISOString(),
        suggestedByAI: target.id === pick.suggestion,
      }],
      history: [...s.history, {
        id: crypto.randomUUID(), when: new Date().toISOString(), actor: s.users.find((u) => u.id === s.currentUserId).name,
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
