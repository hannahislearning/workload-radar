import { WINDOW, collectDigests } from './lib/digests.js'

const date = (value) => new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(value)

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
