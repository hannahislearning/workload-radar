
import { useEffect } from 'react'
import { DEMO_TODAY } from '../data/samples.js'

export const WINDOW = 48 * 60 * 60 * 1000
export function digestClock(state) {
  return Date.parse(DEMO_TODAY + 'T09:00:00+08:00') + (state.digestOffset || 0)
}

export function collectDigests(state, now = digestClock(state)) {
  if (!state.digestStart) return { ...state, digestStart: now, digestInbox: [] }
  const periods = Math.floor((now - state.digestStart) / WINDOW)
  if (periods <= 0) return state
  const end = state.digestStart + periods * WINDOW
  const logs = state.progressLogs.filter(log => log.percent >= 100 && Date.parse(log.at) >= state.digestStart && Date.parse(log.at) < end)
  const batches = new Map()
  for (const log of logs) {
    const task = state.tasks.find(item => item.id === log.taskId)
    const owner = state.users.find(user => user.id === log.userId)
    if (!owner || !(log.taskName || task)) continue
    const index = Math.floor((Date.parse(log.at) - state.digestStart) / WINDOW)
    if (!batches.has(index)) batches.set(index, new Map())
    batches.get(index).set(log.taskId, { name:log.taskName || task.name, person:owner.name })
  }
  if (!batches.has(periods - 1)) batches.set(periods - 1, new Map())
  const reports = [...batches].sort(([a],[b])=>b-a).map(([index,items])=>({
    start:state.digestStart+index*WINDOW, end:state.digestStart+(index+1)*WINDOW, items:[...items.values()],
  }))
  return { ...state, digestStart:end, digestInbox:[...reports,...(state.digestInbox || [])].slice(0,20) }
}

export function useDigestDelivery(update) {
  useEffect(() => {
    const tick = () => update(state => collectDigests(state))
    tick()
    const timer = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [update])
}
