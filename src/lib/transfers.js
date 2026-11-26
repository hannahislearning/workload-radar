import { transferCandidates } from './store.js'

export function requestMove(update, state, task) {
  if (state.moveRequests.some((r) => r.taskId === task.id && r.state === 'pending')) return 'duplicate'
  const best = transferCandidates(state, task).find((candidate) => candidate.fits)
  update((s) => ({ ...s, movePicker: { taskId: task.id, suggestion: best?.user.id } }))
}
