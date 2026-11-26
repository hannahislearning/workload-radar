import { useState } from 'react'
import { todayISO, addDays, startOfWeek, weekDates, cell, taskRemaining, taskDay, round1, workloadWeekBounds } from '../lib/store.js'
import { shortDate } from '../lib/format.js'
import ResultsCards from '../components/ResultsCards.jsx'

export default function DashboardTab({ state, onInspect }) {
  const [offset,setOffset] = useState(0)
  const { first,last } = workloadWeekBounds(state)
  const monday = addDays(startOfWeek(todayISO()),offset*7)
  const days = weekDates(monday)
  const totals = state.users.filter(user=>user.role==='member').map(user=>({
    user, plan:round1(days.reduce((sum,date)=>sum+cell(state,user.id,date,'planned').total,0)),
    actual:round1(days.reduce((sum,date)=>sum+cell(state,user.id,date,'all').total,0)),
  }))
  const peak=Math.max(1,...totals.map(row=>row.actual))
  const hours=source=>round1(state.tasks.filter(task=>task.status==='approved' && task.source===source && days.includes(taskDay(task))).reduce((sum,task)=>sum+taskRemaining(task),0))
  const whatsapp=hours('whatsapp'), email=hours('email'), total=whatsapp+email
  return <section className="dashboard">
    <div className="section-heading"><h1>Results dashboard</h1><p>Approved work for the week of {shortDate(monday)}</p></div>
    <div className="weeknav"><button className="btn ghost" disabled={offset<=first} onClick={()=>setOffset(offset-1)} aria-label="Previous week">‹</button>
      <strong>{shortDate(monday)} – {shortDate(days.at(-1))}</strong><button className="btn ghost" disabled={offset>=last} onClick={()=>setOffset(offset+1)} aria-label="Next week">›</button></div>
    <ResultsCards state={state} monday={monday} onInspect={focus=>onInspect({kind:focus,offset})} />
    <div className="dashboard-bars"><h2>Planned and actual workload</h2>{totals.map(({user,plan,actual})=><div key={user.id}>
      <strong>{user.name}</strong><div>Planned {plan}h <div className="bar-track"><span style={{width:100*plan/peak+'%'}} /></div></div>
      <div>Actual {actual}h <div className="bar-track actual"><span style={{width:100*actual/peak+'%'}} /></div></div>
    </div>)}
    <h2>Hidden hours by source</h2><p>WhatsApp {whatsapp}h · Email {email}h</p>
    <div className="bar-track split"><span style={{width:(total?100*whatsapp/total:0)+'%'}} /><span style={{width:(total?100*email/total:0)+'%'}} /></div></div>
  </section>
}
