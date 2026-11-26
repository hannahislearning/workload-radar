import { transferCandidates, taskDay } from './store.js'

export function requestMove(update, state, task, date = taskDay(task)) {
  if (state.moveRequests.some((r) => r.taskId === task.id && r.state === 'pending')) return 'duplicate'
  const best = transferCandidates(state, task, date).find((candidate) => candidate.fits)
  update((s) => ({ ...s, movePicker: { taskId: task.id, date, suggestion: best?.user.id } }))
}
