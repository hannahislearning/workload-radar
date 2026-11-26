import { recordTimer } from './officeFlow.js'
import { cell, transferCandidates, taskDay } from './store.js'

export function requestMove(update, state, task, date = taskDay(task)) {
  if (state.moveRequests.some((r) => r.taskId === task.id && r.state === 'pending')) return 'duplicate'
  const best = transferCandidates(state, task, date).find((candidate) => candidate.fits)
  update((s) => ({ ...s, movePicker: { taskId: task.id, date, suggestion: best?.user.id } }))
}

export function decide(update, state, req, decision) {
  const me = state.users.find(user => user.id === state.currentUserId)
  if (req.toUserId !== me.id) return
  const now = Date.now()
  update(current => {
    const request = current.moveRequests.find(entry => entry.id === req.id && entry.state === 'pending')
    const task = current.tasks.find(entry => entry.id === req.taskId && entry.owner === req.fromUserId)
    if (!request || !task) return current
    const day = req.date || taskDay(task)
    const active = current.officeTimers?.[req.fromUserId]
    const settled = decision === 'approved' && active?.taskId === task.id
      ? recordTimer(current, req.fromUserId, task.id, now)
      : current
    const next = { ...settled,
      tasks: settled.tasks.map(item => item.id === task.id && decision === 'approved' ? { ...item, owner: req.toUserId } : item),
      moveRequests: settled.moveRequests.map(item => item.id === req.id ? { ...item, state: decision, decidedAt: new Date(now).toISOString() } : item),
    }
    const parts = [req.fromUserId, req.toUserId].map(id => {
      const user = current.users.find(item => item.id === id)
      return user.name + ': ' + cell(current,id,day,'all').total + 'h → ' + cell(next,id,day,'all').total + 'h'
    })
    return { ...next, history: [...next.history, { id: crypto.randomUUID(), when: new Date(now).toISOString(), actor: me.name,
      action: decision === 'approved' ? 'Approved move' : 'Declined move', detail: task.name + ' · ' + parts.join(' · ') }] }
  })
}
