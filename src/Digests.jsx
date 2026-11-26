
import { useEffect } from 'react'

const WINDOW = 48 * 60 * 60 * 1000
export function digestClock(state, real = Date.now()) {
  return real + (state.digestOffset || 0)
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

const date = (value) => new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(value)

export function DigestInbox({ state, update }) {
  const inbox=state.digestInbox || []
  return <section className="studio-shell">
    <div className="studio-heading"><div><h1>Admin digests</h1><p>Completed work, grouped into two-day summaries for Ms Aina.</p></div>
      <button className="btn primary" onClick={()=>update(s=>collectDigests({...s,digestOffset:(s.digestOffset||0)+WINDOW}))}>Simulate two days</button></div>
    <p className="muted">Demo delivery runs in this browser and catches up when you reopen the site. It does not send email or WhatsApp messages.</p>
    {!!state.digestStart && <p className="muted">Next digest · {date(state.digestStart+WINDOW)}</p>}
    {!inbox.length && <p>No digests yet. Mark a task Done as a teammate, then simulate two days here.</p>}
    <div className="digest-list">{inbox.map(report=><article className="inset" key={report.end}>
      <h3>{report.items.length} completed {report.items.length===1?'task':'tasks'}</h3>
      <p className="muted">{date(report.start)} to {date(report.end)}</p>
      {report.items.length?<ul>{report.items.map((item,i)=><li key={i}><strong>{item.person}</strong> completed {item.name}.</li>)}</ul>:<p>No completions logged in this period.</p>}
    </article>)}</div>
  </section>
}
