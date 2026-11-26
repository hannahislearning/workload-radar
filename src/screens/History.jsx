

export default function HistoryTab({ state }) {
  const entries = [...state.history].reverse()
  return (
    <section>
      <div className="section-heading"><h1>Change history</h1><p>Review workload changes and progress updates.</p></div>
      {entries.length === 0 && <p className="empty">No changes yet.</p>}
      <ul className="history">
        {entries.map((h) => (
          <li key={h.id}>
            <span className="when">{new Intl.DateTimeFormat('en-GB', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(h.when))}</span>
            <strong>{h.actor}</strong> — {h.action}: {h.detail}
          </li>
        ))}
      </ul>
    </section>
  )
}
