
import { useState } from 'react'
import { SAMPLE_MESSAGES } from '../data/samples.js'
import { approveFindings, findingsFor, reviewErrors } from '../lib/extractor.js'
import { todayISO } from '../lib/store.js'
import { channels } from '../lib/officeFlow.js'

export function InboxChannels({ state, update, me }) {
  const linked = state.connections?.[me.id] || {}
  function toggle(source) {
    update(current => {
      const next = !current.connections?.[me.id]?.[source]
      return { ...current, connections: { ...current.connections,
        [me.id]: { ...current.connections?.[me.id], [source]: next } } }
    })
  }
  return <div className="office-feed">
    <p className="office-hint">Both demo channels start connected. Previously reviewed work is already scheduled. Kumar’s two new findings are in Needs You.</p>
    {channels.map(([id, label]) => <article className="office-message" key={id}>
      <small>{me.role === 'manager' ? 'Team connections' : linked[id] ? 'Connected · demo' : 'Disconnected'}</small>
      <h3>{label}</h3>
      {me.role === 'manager'
        ? <p>{state.users.filter(user => state.connections?.[user.id]?.[id]).length} teammates connected</p>
        : <button className="office-action" onClick={() => toggle(id)}>{linked[id] ? 'Disconnect' : 'Connect ' + label}</button>}
    </article>)}
  </div>
}

export function FindingReview({ state, update, me, messageId, onClose }) {
  const message = SAMPLE_MESSAGES.find(item => item.id === messageId)
  const [items, setItems] = useState(() => findingsFor(message, state, me.id))
  const [confirm, setConfirm] = useState(false)
  const invalid = items.some(item => Object.keys(reviewErrors(item)).length)
  const labels = { name: 'Task or meeting', hours: 'Estimated hours', deadline: 'Deadline or date' }
  function edit(index, patch) {
    setItems(list => list.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  return <article className="office-message finding-review">
    <small>{message.source === 'email' ? 'Email' : 'WhatsApp'} · {message.from}</small>
    <h3>{confirm ? 'Confirm schedule update' : 'Review detected work'}</h3>
    {!confirm && <p className="office-snippet">{message.text}</p>}
    {items.length === 0 && <p>No work to schedule from this message.</p>}
    {items.map((item, i) => {
      const skip = item.duplicate && !item.keepDuplicate
      const errors = reviewErrors(item)
      if (confirm) return <p key={i}>{item.name} · {skip ? 'Skip duplicate' : item.hours + 'h · ' + item.deadline}</p>
      if (skip) return <div className="office-finding" key={i}><p>Matches {item.duplicateOf?.name || item.name}.</p>
        <small>Duplicate will be skipped.</small><button className="office-action secondary" onClick={() => edit(i, { keepDuplicate: true })}>Add anyway</button></div>
      return <div className="office-finding" key={i}>
        <small>{item.isMeeting ? 'Meeting' : 'Task'}{item.confidence === 'low' ? ' · Check this finding' : ''}</small>
        {Object.entries(labels).map(([key, label]) => <label key={key}>{label}
          <input type={{ name: 'text', hours: 'number', deadline: 'date' }[key]}
            min={key === 'hours' ? '.5' : undefined} max={key === 'hours' ? '24' : undefined} step={key === 'hours' ? '.5' : undefined}
            aria-invalid={!!errors[key]} value={item[key] ?? ''}
            onChange={event => edit(i, { [key]: event.target.value, ...(key === 'deadline' && { needsDate: !event.target.value }) })}/>
          {errors[key] && <span className="office-field-error">{errors[key]}</span>}</label>)}
        <button className="office-action secondary" onClick={() => setItems(list => list.filter((_, index) => index !== i))}>Remove finding</button>
      </div>
    })}
    <div className="office-actions">
      <button className="office-action secondary" onClick={confirm ? () => setConfirm(false) : onClose}>{confirm ? 'Back to review' : 'Close'}</button>
      <button className="office-action" disabled={invalid} onClick={() => {
        if (!confirm) { setConfirm(true); return }
        update(current => approveFindings(current, me, [{ messageId, tasks: findingsFor(message,current,me.id), finalTasks: items }], todayISO() + 'T09:00:00+08:00'))
        onClose()
      }}>{confirm ? 'Confirm and save' : 'Continue to confirm'}</button>
    </div>
  </article>
}
