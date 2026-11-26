
import { useEffect, useRef, useState } from 'react'
import OfficeFloor, { CharacterAvatar } from './components/OfficeFloor.jsx'
import RadarBackdrop from './components/RadarBackdrop.jsx'
import { DayDetails } from './components/DayDrawer.jsx'
import { AccountSwitcher, OfficeTabs } from './components/OfficeNavigation.jsx'
import RiskFlag from './components/RiskFlag.jsx'
import { FindingReview, InboxChannels } from './components/OfficeInbox.jsx'
import { SAMPLE_MESSAGES } from './data/samples.js'
import { addDays, allocatedHours, cell, DAY_NAMES, deadlineRisk, round1, startOfWeek, taskRemaining, todayISO, useAppStore, weekDates } from './lib/store.js'
import { candidatesForDay, closeOfficeWeek, initialOfficeDemo, isDemoViewpoint, officeDemoView, OFFICE_DEMO_KEY, recordTimer, timerLabel, weekStart, withOfficeScene } from './lib/officeFlow.js'
import { decide, requestMove } from './lib/transfers.js'
import { shortDate, workLabel } from './lib/format.js'
import './office.css'

function TaskQueue({ state, update, me, now, setNow, onSelect, schedule }) {
  const active = state.officeTimers?.[me.id]
  const today = todayISO()
  const manager = me.role === 'manager'
  const tasks = state.tasks.filter(task => task.owner === me.id && task.status === 'approved' && taskRemaining(task) &&
    (allocatedHours(state, task, today) > 0 || task.deadline <= today || active?.taskId === task.id))
    .sort((a,b) => Number(b.id === active?.taskId) - Number(a.id === active?.taskId) || a.deadline.localeCompare(b.deadline))
  const pending = state.moveRequests.filter(request => request.state === 'pending')
  const activeTask = active && state.tasks.find(task => task.id === active.taskId)
  return <aside className="office-side office-tasks" aria-label={manager ? 'Team workload' : 'Task board'}>
    <div className="side-heading">
      <h2>{manager ? 'Team watch' : 'Task board'}</h2><p>{manager ? 'Today’s capacity' : shortDate(today) + ' · Today’s work'}</p>
    </div>
    {manager ? <div className="office-feed">
      {state.users.filter(user => user.role === 'member').map(user => {
        const daily = cell(state,user.id,today,'all')
        return <button className={'watch-person ' + daily.key} key={user.id} onClick={() => onSelect(user,today)}>
          <CharacterAvatar userId={user.id} frustrated={daily.key === 'over'}/><span><strong>{user.name}</strong><small>{daily.label}</small></span>
          <b>{daily.total}h</b>
        </button>
      })}
      <div className="office-message"><small>TRANSFERS</small><p>{pending.length ? pending.length + ' awaiting acceptance' : 'No transfers awaiting acceptance'}</p></div>
    </div> : <>
      {activeTask && <div className="live-timer"><i/><div>Working on <strong>{workLabel(activeTask.name)}</strong></div>
        <b>{timerLabel(Math.max(0,Math.floor((now - active.start) / 1000)))}</b></div>}
      <div className="office-task-list">
        {tasks.length === 0 && <p className="office-hint">No open tasks scheduled for today.</p>}
        {tasks.map(task => {
          const running = active?.taskId === task.id
          const allocated = round1(allocatedHours(state,task,today))
          const time = state.progressLogs.filter(log => log.taskId === task.id && log.userId === me.id).reduce((sum,log)=>sum+(log.seconds||0),0)
          return <article key={task.id} className={'office-timeline-item'+(running?' running':'')}>
            <i className="timeline-dot"/>
            <h3>{workLabel(task.name)}</h3>
            <p>Due {shortDate(task.deadline)} · {allocated}h today</p>
            <p>{round1(taskRemaining(task))}h left{time ? ' · '+timerLabel(time)+' logged' : ''}</p>
            <RiskFlag risk={deadlineRisk(state,task)} deadline={task.deadline}/>
            <div className="office-actions">
              <button type="button" className="office-action" disabled={!!active && !running}
                onClick={() => {const time=Date.now();setNow(time);update(current => recordTimer(current,me.id,task.id,time))}}>{running?'Pause':'Start'}</button>
              <button type="button" className="office-action secondary" disabled={!!active && !running}
                onClick={() => update(current => recordTimer(current,me.id,task.id,Date.now(),true))}>Done</button>
            </div>
          </article>
        })}
      </div>
    </>}
    {!manager && <button className="office-action secondary task-schedule" onClick={schedule}>View my schedule</button>}
  </aside>
}

function WeeklySummary({ report }) {
  return <>
    <p>{shortDate(report.monday)}–{shortDate(report.end)}</p>
    <ul className="report-items">
      {report.items.map(item => <li key={item.id}><strong>{workLabel(item.name)}</strong><span>Due {shortDate(item.due)} · {item.planned}h planned · {timerLabel(item.seconds)} logged · {item.remaining ? item.remaining + 'h left' : 'Done'}</span></li>)}
      {report.meetings.map(item => <li key={item.id}><strong>{workLabel(item.name)}</strong><span>Meeting · {shortDate(item.date)} · {item.hours}h</span></li>)}
    </ul>
    {!report.items.length && !report.meetings.length && <p>No work recorded for this week.</p>}
  </>
}

export default function App() {
  const [stored, update] = useAppStore(OFFICE_DEMO_KEY, initialOfficeDemo)
  const state = officeDemoView(stored)
  const [date, setDate] = useState(todayISO)
  const [mode, setMode] = useState('all')
  const [panel, setPanel] = useState('needs')
  const rightPanel = useRef(null)
  const [selection, setSelection] = useState(null)
  const [review, setReview] = useState(null)
  const [reportReview, setReportReview] = useState(null)
  const [now, setNow] = useState(Date.now)
  const [backgroundPaused, setBackgroundPaused] = useState(false)
  const me = state.users.find(user => user.id === state.currentUserId)
  const manager = me.role === 'manager'
  const anyTimer = Object.values(state.officeTimers || {}).some(Boolean)
  const monday = startOfWeek(date)
  const days = weekDates(monday).filter((day,i)=>i<5||state.meetings.some(item=>item.date===day)||state.tasks.some(task=>task.deadline===day))
  const pending = state.moveRequests.filter(request => request.toUserId === me.id && request.state === 'pending')
  const outgoing = state.moveRequests.filter(request => request.fromUserId === me.id && !state.dismissedOffice?.[request.id])
  const reviewed = state.uploads[me.id]?.messageIds || []
  const messages = (state.officeInbox?.[me.id] || []).filter(id => !reviewed.includes(id))
  const reports = Object.values(state.officeReports || {}).filter(report => report.sent && !report.reviewed)
  const reportKey = me.id + '|' + weekStart
  const draft = state.officeReports?.[reportKey]
  const needsCount = manager ? reports.length : pending.length + outgoing.length + messages.length + Number(!!draft && !draft.sent)

  useEffect(() => {
    if (!anyTimer) return
    const ticker = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(ticker)
  }, [anyTimer])
  useEffect(() => {
    const check = () => update(current => closeOfficeWeek(withOfficeScene(current),Date.now()))
    check()
    const timer = setInterval(check, 60000)
    window.addEventListener('focus',check)
    return () => { clearInterval(timer); window.removeEventListener('focus',check) }
  }, [update])

  function reviewMessage(id) { setPanel('needs'); setReview(id) }
  function changeUser(id) {
    if (!isDemoViewpoint(id)) return
    if (id === me.id) return
    setPanel('needs');setReview(null);setReportReview(null);setSelection(null)
    update(current => ({ ...current, currentUserId:id, movePicker:null }))
  }
  const alertBubble = !manager && (pending.length || messages.length) ? {owner:me.id,label:pending.length?'Transfer · Review first':'New work · Review first',onClick:()=>pending.length?(setPanel('needs'),setReview('transfer:'+pending[0].id)):reviewMessage(messages[0])} : null
  const suggestion = manager ? candidatesForDay(state,date,mode) : null
  const detailTab = manager ? 'manage' : 'schedule'
  const detailUser = selection ?? (manager ? suggestion?.from ?? state.users.find(user => user.role === 'member') : me)
  const detailSuggestion = manager && panel === 'manage' ? candidatesForDay(state,date,mode,detailUser.id) : null
  const tabs = [['needs','Inbox'],['inbox','Connected channels'],[detailTab,manager ? 'Manage Tasks' : 'Schedule'],['reports','Reports']]

  function openDetails(user, day = date) {
    setDate(day)
    setSelection(user)
    setPanel(detailTab)
    if (window.matchMedia('(max-width:880px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rightPanel.current?.scrollIntoView({ block:'start', behavior:reduce ? 'instant' : 'smooth' })
    }
    if (state.movePicker && (user.id !== detailUser.id || day !== date)) {
      update(current => ({ ...current, movePicker:null }))
    }
  }
  const over = state.users.filter(user=>user.role==='member'&&cell(state,user.id,date,mode).key==='over').length

  return <><RadarBackdrop paused={backgroundPaused}/><div className="office-app">
    <header className="office-top">
      <div className="office-brand"><span className="office-logo" aria-hidden="true"><i/><i/><i/><i/></span><div><strong>WorkLoad Radar</strong><small>Department workspace</small></div></div>
      <AccountSwitcher users={state.users.filter(user => isDemoViewpoint(user.id))} current={me} onChange={changeUser}/>
    </header>
    <main className="office-workspace">
      <TaskQueue state={state} update={update} me={me} now={now} setNow={setNow} onSelect={openDetails} schedule={()=>openDetails(me)}/>
      <section className="office-center">
        <div className="floor-header"><div><h1>Office floor</h1><p>Workload by teammate · {shortDate(date)}</p></div>
          <div className="floor-modes" aria-label="Workload source">
            {[['all','Actual'],['planned','Planned']].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}
          </div></div>
        <div className="floor-calendar"><button className="office-action secondary" aria-label="Previous week" onClick={()=>setDate(day=>addDays(day,-7))}>‹</button>
          <div role="group" aria-label="Office date">{days.map((day)=><button key={day} aria-pressed={day===date} onClick={()=>{setDate(day)}}>
            <small>{DAY_NAMES[weekDates(monday).indexOf(day)]}</small><b>{shortDate(day)}</b>
          </button>)}</div>
          <button className="office-action secondary" aria-label="Next week" onClick={()=>setDate(day=>addDays(day,7))}>›</button></div>
        <OfficeFloor state={state} date={date} mode={mode} selected={panel === detailTab ? detailUser.id : null} onSelect={openDetails} bubble={alertBubble}/>
        <div className="floor-footer"><div className="office-legend"><span><i/>Light</span><span><i/>Medium</span><span><i/>At limit</span><span><i/>Overloaded</span></div>
          <span>{over ? over+' overloaded' : 'Within capacity'}</span></div>
        {suggestion && <div className="office-suggestion"><span><strong>Suggested transfer</strong><br/>{workLabel(suggestion.task.name)} · {suggestion.from.name} to {suggestion.to.name}</span>
          <button className="office-action" onClick={()=>{openDetails(suggestion.from);requestMove(update,state,suggestion.task,date)}}>Review transfer</button></div>}
      </section>
      <aside className="office-side office-notifications" ref={rightPanel} aria-label="Work updates">
        <OfficeTabs tabs={tabs} active={panel} onChange={setPanel} count={needsCount}/>
        <div className="office-panel-content" key={panel}>
        {panel !== detailTab && <div className="side-heading">
          <h2>{({needs:'Inbox',inbox:'Connected channels',reports:'Weekly reports'})[panel]}</h2>
          <p>{({needs:'Decisions waiting for you',inbox:'WhatsApp and email',reports:'Review before sending'})[panel]}</p>
        </div>}
        {panel==='inbox' && <InboxChannels state={state} update={update} me={me}/>}
        {panel===detailTab && <div key={detailUser.id + date} className="office-day-details">
          <DayDetails state={state} update={update} selection={{user:detailUser,date}} mode={mode}
            isManager={manager} suggestion={detailSuggestion}/>
        </div>}
        {panel==='needs' && <div className="office-feed">
          {!needsCount && <p className="office-hint">You’re caught up. New work and requests will appear here.</p>}
          {!manager && messages.map(id => {
            const sample = SAMPLE_MESSAGES.find(item => item.id === id)
            const finding = sample.result[0]
            return review===id ? <FindingReview key={id} state={state} update={update} me={me} messageId={id} onClose={()=>setReview(null)}/> :
              <article className="office-message" key={id}><small>NEW DETECTION · {sample.source}</small><h3>{workLabel(finding?.name) || 'New message to check'}</h3>
                <p>{finding?.isMeeting ? 'Meeting' : finding ? 'Task' : 'Message'}{finding?.hours ? ' · '+finding.hours+'h' : ''}</p>
                <button className="office-action" onClick={()=>reviewMessage(id)}>Review first</button></article>
          })}
          {!manager && pending.map(request => {
            const task = state.tasks.find(item=>item.id===request.taskId)
            const checking = review==='transfer:'+request.id
            return <article key={request.id} className="office-message"><small>INCOMING TRANSFER</small><h3>{workLabel(task?.name)}</h3>
              <p>From {state.users.find(user=>user.id===request.fromUserId)?.name}{checking&&task?' · Due '+shortDate(task.deadline)+' · '+round1(taskRemaining(task))+'h left':''}</p>
              <div className="office-actions">{!checking&&<button className="office-action secondary" onClick={()=>setReview('transfer:'+request.id)}>Review first</button>}
                <button className="office-action" onClick={()=>decide(update,state,request,'approved')}>Accept</button>
                <button className="office-action secondary" onClick={()=>decide(update,state,request,'declined')}>Decline</button></div></article>
          })}
          {!manager && outgoing.map(request => <article key={request.id} className="office-message"><small>WORKLOAD UPDATE</small>
            <h3>{workLabel(state.tasks.find(task=>task.id===request.taskId)?.name)}</h3><p>{request.state==='approved'?'Transferred to ':'Transfer '+request.state+' · '}{state.users.find(user=>user.id===request.toUserId)?.name}</p>
            <button className="office-action secondary" onClick={()=>update(current=>({...current,dismissedOffice:{...current.dismissedOffice,[request.id]:true}}))}>Dismiss</button></article>)}
          {!manager && draft && !draft.sent && <article className="office-message"><small>WEEKLY REPORT</small><p>Your weekly summary is ready for review.</p><button className="office-action" onClick={()=>setPanel('reports')}>Review first</button></article>}
          {manager && reports.map(report=><article className="office-message" key={report.id}><small>WEEKLY REPORT</small><h3>{state.users.find(user=>user.id===report.owner)?.name}</h3><p>Week of {shortDate(report.monday)}</p>
            <button className="office-action" onClick={()=>{setReportReview(report.id);setPanel('reports')}}>Review</button></article>)}
        </div>}
        {panel==='reports' && <div className="office-feed">
          {manager ? Object.values(state.officeReports || {}).filter(report=>report.sent).map(report=><article className="office-message" key={report.id}>
            <small>{report.reviewed?'REVIEWED':'SUBMITTED'}</small><h3>{state.users.find(user=>user.id===report.owner)?.name}</h3>
            {reportReview===report.id ? <><WeeklySummary report={report}/><button className="office-action" onClick={()=>update(current=>({...current,officeReports:{...current.officeReports,[report.id]:{...report,reviewed:true}}}))}>Mark reviewed</button></>:
              <button className="office-action secondary" onClick={()=>setReportReview(report.id)}>Review</button>}</article>) :
            <article className="office-message"><small>DEMO WEEK</small><h3>Weekly work summary</h3>
              {draft ? <><WeeklySummary report={draft}/>{draft.sent?<p>Sent to admin.</p>:<button className="office-action" onClick={()=>update(current=>({...current,officeReports:{...current.officeReports,[reportKey]:{...draft,sent:true}}}))}>Confirm and send to admin</button>}</>:
                <><p>Advance the demo to the end of the week to generate a draft.</p><button className="office-action" onClick={()=>update(current=>closeOfficeWeek(current,Date.now(),true))}>Simulate week end</button></>}
            </article>}
          {manager && !Object.values(state.officeReports || {}).some(report=>report.sent) && <p className="office-hint">No reports have been sent yet.</p>}
        </div>}
        </div>
      </aside>
    </main>
    <footer className="office-footer"><span>WorkLoad Radar prototype</span>
      <button type="button" className="office-motion-control" aria-pressed={backgroundPaused}
        onClick={()=>setBackgroundPaused(value=>!value)}>{backgroundPaused ? 'Resume background' : 'Pause background'}</button></footer>
  </div></>
}
