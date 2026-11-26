import { todayISO, addDays, startOfWeek, DAY_NAMES, cell, isStale, staleDays } from '../lib/store.js'

export default function Banner({ state }) {
  const nextWeekStart = addDays(startOfWeek(todayISO()), 7)
  const nextWeekOver = []
  for (let d = 0; d < 7; d++) {
    const iso = addDays(nextWeekStart, d)
    for (const u of state.users.filter((u) => u.role === 'member')) {
      if (cell(state, u.id, iso, 'all').key === 'over') {
        nextWeekOver.push(`${u.name} on ${DAY_NAMES[(new Date(iso).getDay() + 6) % 7]}`)
      }
    }
  }
  const stale = state.users.filter((u) => u.role === 'member' && isStale(state, u.id) && (state.users.find(member => member.id === state.currentUserId)?.role === 'manager' || u.id === state.currentUserId))
  const myPending = state.moveRequests.filter((r) => r.state === 'pending' && r.toUserId === state.currentUserId)
  const items = []
  if (nextWeekOver.length) items.push({ text: 'Next week is overloaded: ' + [...new Set(nextWeekOver)].join(', '), tone: 'warn' })
  for (const user of stale) items.push({ text: user.name + " hasn’t logged progress for " + staleDays(state, user.id) + " days.", tone: 'critical' })
  if (myPending.length) items.push({ text: myPending.length + ' move request(s) awaiting your answer.', tone: 'ok' })
  return items.length ? <div role="status">{items.map(({text,tone}) =>
    <div className={'banner status-banner '+tone} key={text}><span aria-hidden="true" />{text}</div>)}</div> : null
}
