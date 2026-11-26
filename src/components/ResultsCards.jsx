import { dashboardStats } from '../lib/store.js'

export default function ResultsCards({ state, monday, compact, onInspect }) {
  const stats = dashboardStats(state, monday)
  return <div className="stat-grid">
    <div className="stat"><span className="big">{stats.hiddenPct}%</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('sources')}>Hidden workload</button> : 'Hidden workload'}</strong><span>{stats.hiddenHours}h of {stats.totalHours}h remaining came from chats and emails</span></div>
    <div className="stat"><span className="big">{stats.overloadCaught}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('overload')}>Overload days surfaced</button> : 'Overload days surfaced'}</strong><span>Person-days missed by the planned-only view</span></div>
    <div className="stat"><span className="big">{stats.atRisk}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('risk')}>Deadlines at risk</button> : 'Deadlines at risk'}</strong><span>Open tasks across all dates</span></div>
    {!compact && <>
      <div className="stat"><span className="big">{stats.completed}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('history')}>Tasks completed</button> : 'Tasks completed'}</strong><span>Scheduled this week</span></div>
      <div className="stat"><span className="big">{stats.accuracy === null ? '—' : stats.accuracy + '%'}</span><strong>{onInspect ? <button className="stat-link" onClick={()=>onInspect('accuracy')}>Extraction accuracy</button> : 'Extraction accuracy'}</strong><span>On uploaded demo messages</span></div>
    </>}
  </div>
}
