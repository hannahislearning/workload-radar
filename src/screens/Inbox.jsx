import { useState } from 'react'
import { todayISO } from '../lib/store.js'
import { SAMPLE_MESSAGES, MEMBER_UPLOADS } from '../data/samples.js'
import { extractTasks, reviewErrors } from '../lib/extractor.js'

const inboxSources = [['whatsapp', 'WhatsApp'], ['email', 'Email']]

export default function Inbox({ state, update, me }) {
  const manager = me.role === 'manager'
  const linked = state.connections?.[me.id] || {}
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const sampleIds = MEMBER_UPLOADS[me.id] || []
  const available = SAMPLE_MESSAGES.filter(m => sampleIds.includes(m.id) && linked[m.source] && !reviewed.has(m.id))
  function toggle(source) {
    update(s => ({...s, connections:{...s.connections,[me.id]:{...s.connections?.[me.id],[source]:!s.connections?.[me.id]?.[source]}}}))
  }
  return <section className="studio-shell">
    <div className="section-heading"><h1>Inbox</h1><p>Connect demo channels and review extracted work.</p></div>
    <div className="channel-grid">{inboxSources.map(([source,label])=><article className="inset" key={source}>
      <h3>{label}</h3>
      {manager ? <p>{state.users.filter(user=>state.connections?.[user.id]?.[source]).length} teammates connected in this demo</p> : <>
        <p>{linked[source] ? available.filter(m=>m.source===source).length + ' new demo messages' : 'Demo channel disconnected'}</p>
        <button className="btn" onClick={()=>toggle(source)}>{linked[source]?'Disconnect':'Connect demo '+label}</button>
      </>}
    </article>)}</div>
    {!manager && <UploadTab state={state} update={update} me={me} connected={Object.values(linked).some(Boolean)} />}
    {manager && <p className="muted">Teammates review their own findings. Managers see connection counts and approved work.</p>}
  </section>
}

function UploadTab({ state, update, me, connected = false }) {
  const [phase, setPhase] = useState('idle') // idle | working | review | done
  const [results, setResults] = useState([]) // { messageId, tasks, error, finalTasks }
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fault, setFault] = useState('none')
  const [filter, setFilter] = useState('all')
  const [snippets, setSnippets] = useState({})
  const myIds = MEMBER_UPLOADS[me.id] || []
  const reviewed = new Set(state.uploads[me.id]?.messageIds || [])
  const messages = SAMPLE_MESSAGES.filter(m => myIds.includes(m.id) && !reviewed.has(m.id) &&
    (!connected || state.connections?.[me.id]?.[m.source]))
  const alreadyUploaded = messages.length === 0

  async function run() {
    setPhase('working')
    setProgress({ done: 0, total: messages.length })
    const res = await extractTasks(messages, fault, (done, total) => setProgress({ done, total }), state, me.id)
    // Privacy rule: raw text is processed and discarded — we only keep the
    // extracted fields below; msg.text never enters app state.
    // Owner-only review snippets live in this mounted component, never in the shared store.
    setSnippets(Object.fromEntries(messages.map(message => [message.id, message.text.replace(/\s+/g, ' ').slice(0, 120)])))
    setFilter('all')
    setResults(res)
    setPhase('review')
  }

  const retained = results.flatMap(result => result.finalTasks ?? result.tasks)
  const errorsFor = retained.map(reviewErrors)
  const needsDate = errorsFor.filter(error => error.deadline).length
  const invalid = errorsFor.some(error => Object.keys(error).length)

  function approveAll() {
    const newTasks = []
    const newMeetings = []
    if (invalid) return
    for (const r of results) {
      for (const t of r.finalTasks ?? r.tasks ?? []) {
        if (t.duplicate && !t.keepDuplicate) continue
        if (t.isMeeting || t.duplicateOf?.kind === 'meeting') {
          newMeetings.push({ id: crypto.randomUUID(), name: t.name.trim(), owner: me.id, date: t.deadline, hours: Number(t.hours) })
        } else {
          newTasks.push({
            id: 'x' + Math.random().toString(36).slice(2), name: t.name.trim(), owner: me.id,
            hours: Number(t.hours), deadline: t.deadline, source: t.source || 'chat',
            status: 'approved', progress: 0, confidence: t.confidence || 'low',
          })
        }
      }
    }
    const errors = results.filter((r) => r.error)
    update((s) => ({
      ...s,
      tasks: [...s.tasks, ...newTasks],
      meetings: [...s.meetings, ...newMeetings.filter((meeting) => !s.meetings.some((existing) => existing.id === meeting.id))],
      uploads: { ...s.uploads, [me.id]: { messageIds: [...(s.uploads[me.id]?.messageIds || []), ...results.filter(r => !r.error || r.finalTasks?.length).map(r => r.messageId)], extracted: [...(s.uploads[me.id]?.extracted || []), ...results.map((r) => ({ messageId: r.messageId, tasks: r.tasks, finalTasks: r.finalTasks ?? r.tasks, error: r.error || null }))] } },
      history: [...s.history, {
        id: 'h' + Date.now(), when: new Date().toISOString(), actor: me.name,
        action: 'Approved extracted findings',
        detail: `${newTasks.length} task(s) and ${newMeetings.length} meeting(s) added${errors.length ? `, ${errors.length} couldn't be read` : ''}`,
      }],
    }))
    setSnippets({})
    setPhase('done')
  }

  function setFinal(messageId, tasks) {
    setResults((rs) => rs.map((r) => r.messageId === messageId ? { ...r, finalTasks: tasks } : r))
  }

  if (phase === 'working') {
    return (
      <section>
        <div className="section-heading"><h1>Reading messages</h1><p>{progress.done} of {progress.total} processed</p></div>
        <div className="progressline big"><div className="progressfill" style={{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }} /></div>
      </section>
    )
  }

  if (phase === 'review') {
    return (
      <section>
        <div className="section-heading"><h1>Review findings</h1><p>{retained.length} tasks found · {needsDate} need a date · {retained.filter(task => task.duplicate).length} possible duplicates · {results.filter(result => result.error).length} errors</p></div>
        <div className="toggle" aria-label="Filter results">{[['all','All'],['attention','Needs attention'],['duplicates','Duplicates'],['errors','Errors']].map(([key,label]) =>
          <button key={key} className={filter===key?'on':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
        {results.filter(result => {
          const items = result.finalTasks ?? result.tasks
          if (filter === 'duplicates') return items.some(task => task.duplicate)
          if (filter === 'errors') return !!result.error
          if (filter === 'attention') return items.some(task => Object.keys(reviewErrors(task)).length || task.confidence === 'low') || !!result.error
          return true
        }).map((r) => {
          const sample = SAMPLE_MESSAGES.find((s) => s.id === r.messageId)
          return (
            <div key={r.messageId} className="review-card">
              <div className="review-head">
                <span className="src">{sample.source}</span> from {sample.from}
                {r.error && <span className="error"> — ⚠️ {r.error} <button className="btn tiny" onClick={() => {
                  setFinal(r.messageId, [{ name: '', hours: 1, deadline: todayISO(), source: sample.source, confidence: 'manual', manual: true }])
                }}>Add manually</button></span>}
              </div>
              <p className="source-snippet">{snippets[r.messageId]}</p>
              {(r.finalTasks ?? r.tasks).length === 0 && !r.error && <p className="muted">No tasks found in this message.</p>}
              {(r.finalTasks ?? r.tasks).map((t, i) => {
                const patch = (changes) => setFinal(r.messageId, (r.finalTasks ?? r.tasks).map((item, index) => index === i ? { ...item, ...changes } : item))
                if (t.duplicate && !t.keepDuplicate) return <div className="inset" key={i}>
                  <p>Looks like <strong>{t.duplicateOf?.name || t.name}</strong>, already in your {t.duplicateOf?.kind === 'meeting' ? 'calendar' : 'plan'}.</p>
                  <button className="btn ghost" aria-pressed="true" onClick={() => patch({ keepDuplicate: false })}>Skip</button>
                  <button className="btn" onClick={() => patch({ keepDuplicate: true })}>Add anyway</button>
                </div>
                const errors = reviewErrors(t)
                return <div key={i} className={'found-task' + (t.confidence === 'low' ? ' uncertain' : '')}>
                  <label>Name <input value={t.name} aria-invalid={!!errors.name} onChange={e => patch({ name: e.target.value })} />
                    {errors.name && <small className="error">{errors.name}</small>}</label>
                  <label>Hours <input type="number" step="0.5" min="0.5" max="24" value={t.hours} aria-invalid={!!errors.hours} onChange={e => patch({ hours: e.target.value })} />
                    {errors.hours && <small className="error">{errors.hours}</small>}</label>
                  <label>Deadline <input type="date" value={t.deadline || ''} aria-invalid={!!errors.deadline} onChange={e => patch({ deadline: e.target.value, needsDate: !e.target.value })} />
                    {errors.deadline && <small className="error">{errors.deadline}</small>}</label>
                  <button className="btn tiny danger" aria-label={'Delete '+t.name} onClick={() => setFinal(r.messageId, (r.finalTasks ?? r.tasks).filter((_, j) => j !== i))}>×</button>
                </div>
              })}
            </div>
          )
        })}
        <div className="review-actions">
          {needsDate > 0 && <p role="status">{needsDate} {needsDate === 1 ? 'item needs' : 'items need'} a date before you can approve.</p>}
          <button className="btn primary" disabled={invalid} onClick={approveAll}>Approve &amp; add to my workload</button>
          <button className="btn ghost" onClick={() => { setSnippets({}); setPhase('idle') }}>Cancel</button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="section-heading"><h1>Extract and review</h1><p>Check findings before adding work to the heatmap.</p></div>
      {phase === 'done' && <p className="banner ok">Approved! Your tasks are now on the heatmap.</p>}
      {alreadyUploaded && phase !== 'done' && <p className="banner ok">No new messages are available in this view.</p>}
      <div className="upload-sim">
        <p className="muted">{connected ? 'Review findings from your linked demo channels.' : 'Review mock messages from the sample bundle.'} <strong>{me.name}</strong> · {messages.length} available</p>
        <label className="faultpick">Simulate AI fault (for testing failure handling):
          <select value={fault} onChange={(e) => setFault(e.target.value)}>
            <option value="none">None — normal run</option>
            <option value="timeout">Timeout on one message</option>
            <option value="badjson">Unreadable AI answer on one message</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={alreadyUploaded}>
          {alreadyUploaded ? 'No new messages' : connected ? 'Extract inbox findings' : 'Extract sample findings'}
        </button>
      </div>
    </section>
  )
}
